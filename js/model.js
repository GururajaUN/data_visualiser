/* ============================================================
   Stage 3 — MODEL
   Input : validated { tables, batchFiles } + asOf date
   Output: linked object graph (centre → centre×job role → batch →
           student) plus roll-up metrics and attention flags.
   All business logic (CAAF stage, eligibility, at-risk) lives here.
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});
  const DAY = 864e5;

  function build(v, asOf) {
    const S = RC.SCHEMA, R = S.rules, T = v.tables;
    const thr = R.eligibilityAttendancePct / 100;
    const meets = (p) => p != null && (R.eligibilityInclusive ? p >= thr - 1e-9 : p > thr + 1e-9);
    const M = { asOf, centres: [], jobRoles: [], cjs: [], batches: [], students: [], trainers: [], flags: [] };
    const by = (M.by = { centre: new Map(), jr: new Map(), cj: new Map(), batch: new Map(), student: new Map(), trainer: new Map() });

    for (const j of T.JobRoles) { const o = { ...j, id: j.JobRoleCode, name: j.JobRoleName, short: j.ShortName || j.JobRoleCode, cjs: [] }; M.jobRoles.push(o); by.jr.set(o.id, o); }
    const caafBy = new Map(T.CAAF.map((r) => [r.CentreID, r]));
    for (const c of T.Centres) {
      const ca = caafBy.get(c.CentreID) || {};
      const steps = S.caafSteps.map((s) => ({ ...s, done: !!ca[s.col], date: ca[s.col] instanceof Date ? ca[s.col] : null }));
      let stage = S.caafStages[0];
      for (const s of steps) { if (!s.done) break; if (s.stage) stage = s.stage; }
      const result = ca.InspectionResult || 'Pending';
      const ready = stage === 'Inspection Complete' && result === 'Pass';
      const o = { ...c, id: c.CentreID, name: c.CentreName, caaf: { steps, stage, stageIdx: S.caafStages.indexOf(stage), result, ready, remarks: ca.Remarks, src: ca._src }, cjs: [], trainers: [], batches: [] };
      M.centres.push(o); by.centre.set(o.id, o);
    }
    for (const p of T.Plan) {
      const c = by.centre.get(p.CentreID), j = by.jr.get(p.JobRoleCode); if (!c || !j) continue;
      const o = { key: c.id + '|' + j.id, centre: c, jobRole: j, plan: p, batches: [], trainers: [] };
      M.cjs.push(o); by.cj.set(o.key, o); c.cjs.push(o); j.cjs.push(o);
    }
    const cjFor = (cid, code) => {
      const k = cid + '|' + code; if (by.cj.has(k)) return by.cj.get(k);
      const c = by.centre.get(cid), j = by.jr.get(code); if (!c || !j) return null;
      const o = { key: k, centre: c, jobRole: j, plan: { TargetSeats: 0, PlannedBatches: 0 }, batches: [], trainers: [], unplanned: true };
      M.cjs.push(o); by.cj.set(k, o); c.cjs.push(o); j.cjs.push(o); return o;
    };
    for (const t of T.Trainers) {
      const cj = cjFor(t.CentreID, t.JobRoleCode);
      const docs = ['EduCertUploaded', 'ExpCertUploaded', 'AadhaarVerified', 'OTPVerified'].every((f) => t[f] === 'Y');
      const o = { ...t, id: t.TrainerID, name: t.TrainerName, centre: cj && cj.centre, jobRole: cj && cj.jobRole, cj, docsDone: docs, totDone: t.TOTStatus === 'Completed', batches: [], backupOf: [] };
      M.trainers.push(o); by.trainer.set(o.id, o);
      if (cj) { cj.trainers.push(o); cj.centre.trainers.push(o); }
    }
    const files = new Map(v.batchFiles.map((f) => [f.batchId, f]));
    for (const b of T.Batches) {
      const cj = cjFor(b.CentreID, b.JobRoleCode); if (!cj) continue;
      const f = files.get(b.BatchID);
      const o = { ...b, id: b.BatchID, centre: cj.centre, jobRole: cj.jobRole, cj, trainer: by.trainer.get(b.PrimaryTrainerID) || null, backup: by.trainer.get(b.BackupTrainerID) || null,
        file: f ? f.file : null, dates: f ? f.dates.slice().sort((a, b) => a - b) : [], students: [], active: ['Created', 'Ongoing'].includes(b.BatchStatus), live: ['Ongoing', 'Completed'].includes(b.BatchStatus) };
      if (o.trainer) o.trainer.batches.push(o);
      if (o.backup) o.backup.backupOf.push(o);
      M.batches.push(o); by.batch.set(o.id, o); cj.batches.push(o); cj.centre.batches.push(o);
      if (!f) continue;
      const attemptsBy = new Map();
      for (const a of f.assessment) { if (!attemptsBy.has(a.StudentID)) attemptsBy.set(a.StudentID, []); attemptsBy.get(a.StudentID).push(a); }
      for (const s of f.students) {
        const marks = (f.attendance.get(s.StudentID) || []).slice().sort((a, b) => a.date - b.date);
        const present = marks.filter((m) => m.v === 'P').length;
        const pct = marks.length ? present / marks.length : null;
        const attempts = (attemptsBy.get(s.StudentID) || []).sort((a, b) => a.Attempt - b.Attempt);
        const pass = attempts.find((a) => a.Result === 'Pass');
        const dropped = s.StudentStatus === 'Dropped';
        const so = { ...s, id: s.StudentID, name: s.StudentName, batch: o, centre: cj.centre, jobRole: cj.jobRole, marks, present, marked: marks.length, pct, dropped,
          meets: meets(pct), attempts, passed: !!pass, certified: !!(pass && pass.CertifiedDate), certDate: pass && pass.CertifiedDate,
          eligible: !dropped && o.BatchStatus === 'Completed' && meets(pct), atRisk: !dropped && o.BatchStatus === 'Ongoing' && pct != null && !meets(pct) };
        o.students.push(so); M.students.push(so); by.student.set(so.id, so);
      }
    }
    for (const b of M.batches) b.m = batchMetrics(b);
    for (const x of [...M.cjs, ...M.centres, ...M.jobRoles]) x.m = rollup(M, x.cjs || [x]);
    M.m = rollup(M, M.cjs);
    M.flags = flags(M);
    return M;
  }

  function batchMetrics(b) {
    const act = b.students.filter((s) => !s.dropped);
    const P = act.reduce((s, x) => s + x.present, 0), K = act.reduce((s, x) => s + x.marked, 0);
    return {
      enrolled: b.students.length, active: act.length, dropped: b.students.length - act.length,
      attendance: K ? P / K : null, sessions: b.dates.length,
      onTrack: act.filter((s) => b.BatchStatus === 'Ongoing' && s.meets).length,
      atRisk: act.filter((s) => s.atRisk).length,
      eligible: act.filter((s) => s.eligible).length,
      assessed: b.students.filter((s) => s.attempts.length).length,
      passed: b.students.filter((s) => s.passed).length,
      certified: b.students.filter((s) => s.certified).length,
    };
  }

  function rollup(M, cjs) {
    const S = RC.SCHEMA;
    const batches = cjs.flatMap((c) => c.batches).filter((b) => b.BatchStatus !== 'Cancelled');
    const trainers = cjs.flatMap((c) => c.trainers);
    const centres = [...new Set(cjs.map((c) => c.centre))];
    const st = {}; for (const s of S.enums.BatchStatus) st[s] = 0; for (const b of cjs.flatMap((c) => c.batches)) st[b.BatchStatus] = (st[b.BatchStatus] || 0) + 1;
    const stage = {}; for (const s of S.caafStages) stage[s] = 0; for (const c of centres) stage[c.caaf.stage]++;
    const sum = (k) => batches.reduce((s, b) => s + (b.m[k] || 0), 0);
    const studs = batches.flatMap((b) => b.students.filter((s) => !s.dropped));
    const P = studs.reduce((s, x) => s + x.present, 0), K = studs.reduce((s, x) => s + x.marked, 0);
    const live = batches.filter((b) => b.BatchStatus === 'Ongoing');
    return {
      centres: centres.length, centresReady: centres.filter((c) => c.caaf.ready).length, caafStage: stage,
      inspectionFail: centres.filter((c) => c.caaf.result === 'Fail').length,
      target: cjs.reduce((s, c) => s + (c.plan.TargetSeats || 0), 0),
      plannedBatches: cjs.reduce((s, c) => s + (c.plan.PlannedBatches || 0), 0),
      batches: batches.length, batchStatus: st,
      trainers: trainers.length, trainersDocs: trainers.filter((t) => t.docsDone).length, trainersTOT: trainers.filter((t) => t.totDone).length,
      cctvLive: live.length, cctvOk: live.filter((b) => b.CCTVVerified === 'Y').length,
      enrolled: sum('enrolled'), active: sum('active'), dropped: sum('dropped'),
      attendance: K ? P / K : null, atRisk: sum('atRisk'), onTrack: sum('onTrack'),
      eligible: sum('eligible'), assessed: sum('assessed'), passed: sum('passed'), certified: sum('certified'),
    };
  }

  function flags(M) {
    const F = []; const a = M.asOf; const S = RC.SCHEMA;
    const days = (d) => d ? Math.round((d - a) / DAY) : null;
    for (const c of M.centres) {
      const starts = c.batches.map((b) => b.StartDate).filter(Boolean).sort((x, y) => x - y);
      const first = starts[0]; const dd = days(first);
      if (c.caaf.result === 'Fail') F.push({ sev: 'high', kind: 'CAAF', centre: c, text: `${c.name}: NSDC inspection failed`, link: `#/centre/${c.id}` });
      else if (!c.caaf.ready && c.batches.length) {
        const urgent = dd != null && dd <= 7;
        F.push({ sev: urgent ? 'high' : 'med', kind: 'CAAF', centre: c, text: `${c.name}: CAAF at "${c.caaf.stage}"${dd != null ? (dd < 0 ? `, first batch start passed ${-dd}d ago` : `, first batch starts in ${dd}d`) : ''}`, link: `#/centre/${c.id}` });
      }
    }
    for (const b of M.batches) {
      if (b.BatchStatus === 'Cancelled' || b.BatchStatus === 'Completed') {
        if (b.BatchStatus === 'Completed' && b.m.eligible > b.m.assessed) F.push({ sev: 'med', kind: 'Assessment', batch: b, centre: b.centre, text: `${b.id}: ${b.m.eligible - b.m.assessed} eligible student(s) not yet assessed`, link: `#/batch/${b.id}` });
        continue;
      }
      const ds = days(b.StartDate);
      if (b.BatchStatus === 'Planned' && ds != null && ds < 0 && b.centre.caaf.ready) F.push({ sev: 'high', kind: 'Batch', batch: b, centre: b.centre, text: `${b.id}: start date passed ${-ds}d ago, still Planned`, link: `#/batch/${b.id}` });
      if (!b.trainer && (b.active || (b.centre.caaf.ready && ds != null && ds <= 14))) F.push({ sev: 'high', kind: 'Trainer', batch: b, centre: b.centre, text: `${b.id}: no primary trainer assigned`, link: `#/batch/${b.id}` });
      if (b.trainer && !b.trainer.totDone && (b.active || (b.centre.caaf.ready && ds != null && ds <= 14))) F.push({ sev: b.active ? 'high' : 'med', kind: 'TOT', batch: b, centre: b.centre, text: `${b.id}: trainer ${b.trainer.name} TOT "${b.trainer.TOTStatus}"`, link: `#/batch/${b.id}` });
      if (b.BatchStatus === 'Ongoing') {
        if (b.CCTVVerified !== 'Y') F.push({ sev: 'high', kind: 'CCTV', batch: b, centre: b.centre, text: `${b.id}: ongoing without CCTV verification`, link: `#/batch/${b.id}` });
        if (!b.file) F.push({ sev: 'med', kind: 'Data', batch: b, centre: b.centre, text: `${b.id}: ongoing but no batch file loaded`, link: `#/batch/${b.id}` });
        if (b.m.atRisk) F.push({ sev: 'med', kind: 'Attendance', batch: b, centre: b.centre, text: `${b.id}: ${b.m.atRisk} student(s) below ${S.rules.eligibilityAttendancePct}% attendance`, link: `#/batch/${b.id}` });
        if (b.file && (b.m.enrolled < S.rules.batchMinStudents || b.m.enrolled > S.rules.batchMaxStudents)) F.push({ sev: 'med', kind: 'Batch', batch: b, centre: b.centre, text: `${b.id}: ${b.m.enrolled} students (allowed ${S.rules.batchMinStudents}–${S.rules.batchMaxStudents})`, link: `#/batch/${b.id}` });
      }
    }
    return F.sort((x, y) => (x.sev === y.sev ? 0 : x.sev === 'high' ? -1 : 1));
  }

  RC.Model = { build };
})(typeof window !== 'undefined' ? window : globalThis);
