/* ============================================================
   Stage 2 — VALIDATE
   Input : working set from RC.Ingest.selectSet()
   Output: { tables{ sheet: [record] }, batchFiles[], issues[] }
   Coerces every cell to its schema type and checks structure,
   allowed values, references and cross-sheet consistency.
   Records keep a _src {file, sheet, row} for traceability.
   Never invents data: an invalid value becomes null + an issue.
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

  const mk = (y, m, d) => { const x = new Date(y, m, d); return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d ? x : null; };
  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return v;
    if (typeof v === 'number' && v > 20000 && v < 80000) { const u = new Date(Math.round((v - 25569) * 864e5)); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return mk(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) return mk(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})$/);
    if (m) { const i = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase()); if (i >= 0) return mk(+m[3], i, +m[1]); }
    return null;
  }

  function coerce(col, v, S) {
    if (v == null || (typeof v === 'string' && v.trim() === '')) return { val: null };
    switch (col.type) {
      case 'int': case 'number': {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
        if (!isFinite(n)) return { val: null, err: `"${v}" is not a number` };
        if (col.type === 'int' && !Number.isInteger(n)) return { val: Math.round(n), warn: `${v} rounded to whole number` };
        return { val: n };
      }
      case 'date': { const d = parseDate(v); return d ? { val: d } : { val: null, err: `"${v}" is not a recognisable date` }; }
      case 'dateflag': {
        if (/^(y|yes|done)$/i.test(String(v).trim())) return { val: 'Y' };
        if (/^(n|no)$/i.test(String(v).trim())) return { val: null };
        const d = parseDate(v); return d ? { val: d } : { val: null, err: `"${v}" should be a date or Y` };
      }
      case 'enum': {
        const list = S.enums[col.enum]; const hit = list.find((x) => norm(x) === norm(v));
        if (col.enum === 'Flag') { if (/^(yes|true)$/i.test(v)) return { val: 'Y' }; if (/^(no|false)$/i.test(v)) return { val: 'N' }; }
        return hit ? { val: hit } : { val: null, err: `"${v}" is not allowed (use: ${list.join(', ')})` };
      }
      case 'email': { const s = String(v).trim(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? { val: s } : { val: s, warn: `"${s}" does not look like an email` }; }
      case 'phone': { const s = String(v).replace(/\D/g, ''); return /^(91)?[6-9]\d{9}$/.test(s) || /^0\d{9,11}$/.test(s) ? { val: s.slice(-10) } : { val: s, warn: `"${v}" does not look like a 10-digit mobile` }; }
      default: return { val: String(v instanceof Date ? RC.fmt.iso(v) : v).trim() };
    }
  }

  function readTable(file, sheetName, issues, opt = {}) {
    const S = RC.SCHEMA; const spec = S.sheets[sheetName];
    const where = { file: file.name, sheet: sheetName };
    const sh = file.sheets[sheetName];
    if (!sh) { issues.push({ level: 'error', ...where, msg: `Sheet "${sheetName}" is missing` }); return { rows: [], extra: [] }; }
    const idx = {}; const used = new Set();
    sh.header.forEach((h, i) => { if (!(h instanceof Date)) idx[norm(h)] = i; });
    for (const c of spec.columns) {
      if (idx[norm(c.name)] == null) issues.push({ level: c.required ? 'error' : 'warn', ...where, field: c.name, msg: `Column "${c.name}" not found` });
      else used.add(idx[norm(c.name)]);
    }
    const extra = []; // wide date columns or unknown headers
    sh.header.forEach((h, i) => {
      if (used.has(i) || h === '' || h == null) return;
      if (spec.wide) {
        const d = parseDate(h);
        if (d) extra.push({ i, date: d }); else issues.push({ level: 'warn', ...where, field: String(h), msg: `Header "${h}" is not a date; column ignored` });
      } else issues.push({ level: 'info', ...where, field: String(h), msg: `Extra column "${h}" ignored` });
    });
    const rows = [];
    for (const r of sh.rows) {
      const rec = { _src: { file: file.name, path: file.path, sheet: sheetName, row: r.excelRow } };
      let empty = true;
      for (const c of spec.columns) {
        const i = idx[norm(c.name)]; const raw = i == null ? null : r.cells[i];
        const { val, err, warn } = coerce(c, raw, S);
        rec[c.name] = val; if (val != null) empty = false;
        if (err) issues.push({ level: 'error', ...where, row: r.excelRow, field: c.name, msg: err });
        if (warn) issues.push({ level: 'warn', ...where, row: r.excelRow, field: c.name, msg: warn });
        if (c.required && val == null && !err) issues.push({ level: 'error', ...where, row: r.excelRow, field: c.name, msg: `${c.name} is required` });
      }
      if (spec.wide) rec._cells = extra.map((x) => ({ date: x.date, v: r.cells[x.i] }));
      if (!empty || (spec.wide && rec._cells.some((c) => c.v != null))) rows.push(rec);
    }
    // duplicate keys
    const seen = new Map();
    for (const rec of rows) {
      const k = spec.key.map((f) => rec[f]).join('|');
      if (spec.key.some((f) => rec[f] == null)) continue;
      if (seen.has(k)) issues.push({ level: 'error', ...where, row: rec._src.row, field: spec.key.join('+'), msg: `Duplicate ${spec.key.join(' + ')} "${k}" (also row ${seen.get(k)})` });
      else seen.set(k, rec._src.row);
    }
    return { rows, extra };
  }

  function checkMeta(file, expectType, issues) {
    const S = RC.SCHEMA;
    if (file.meta.FileType && String(file.meta.FileType) !== expectType) issues.push({ level: 'warn', file: file.name, sheet: 'Meta', msg: `Meta says FileType "${file.meta.FileType}", expected "${expectType}"` });
    if (file.meta.FormatVersion && String(file.meta.FormatVersion) !== S.formatVersion) issues.push({ level: 'warn', file: file.name, sheet: 'Meta', msg: `Format version ${file.meta.FormatVersion}; this tracker expects ${S.formatVersion}` });
    if (!file.folderOk) issues.push({ level: 'info', file: file.name, msg: `Found in folder "${file.folder}", expected "${S.files[expectType].folder}"` });
  }

  function validate(set) {
    const S = RC.SCHEMA; const issues = []; const T = {};
    const need = { master: set.master, trainers: set.trainers, status: set.status };
    for (const [k, f] of Object.entries(need)) if (!f) issues.push({ level: 'error', file: '(missing)', msg: `No ${S.files[k].label} file found (expected ${S.files[k].folder}/${S.files[k].pattern.replace(/[\^$\\]/g, '')})` });
    for (const t of set.dupes || []) issues.push({ level: 'warn', file: '(folder)', msg: `More than one ${t} file; using the most recently modified` });
    for (const [type, f] of Object.entries(need)) if (f) { checkMeta(f, type, issues); for (const sn of S.files[type].sheets) T[sn] = readTable(f, sn, issues).rows; }
    for (const sn of ['Centres', 'JobRoles', 'Plan', 'Trainers', 'CAAF', 'Batches']) T[sn] = T[sn] || [];

    const ix = {};
    for (const [sn, spec] of Object.entries(S.sheets)) if (T[sn] && spec.key.length === 1) ix[sn] = new Map(T[sn].map((r) => [r[spec.key[0]], r]));
    const refCheck = (sn, rows) => {
      for (const c of S.sheets[sn].columns.filter((c) => c.type === 'ref' && ix[c.ref])) for (const r of rows) {
        if (r[c.name] != null && !ix[c.ref].has(r[c.name])) issues.push({ level: 'error', file: r._src.file, sheet: sn, row: r._src.row, field: c.name, msg: `"${r[c.name]}" not found in ${c.ref}` });
      }
    };
    ['Plan', 'Trainers', 'CAAF', 'Batches'].forEach((sn) => refCheck(sn, T[sn]));

    // --- cross-sheet rules (status / master)
    const caafIds = new Set(T.CAAF.map((r) => r.CentreID));
    for (const c of T.Centres) if (!caafIds.has(c.CentreID)) issues.push({ level: 'warn', file: set.status ? set.status.name : '', sheet: 'CAAF', field: 'CentreID', msg: `${c.CentreID} has no CAAF row` });
    for (const r of T.CAAF) {
      let gap = false;
      S.caafSteps.forEach((s, i) => { if (r[s.col] && S.caafSteps.slice(0, i).some((p) => !r[p.col])) gap = true; });
      if (gap) issues.push({ level: 'warn', file: r._src.file, sheet: 'CAAF', row: r._src.row, msg: `${r.CentreID}: a later CAAF step is marked done while an earlier one is not` });
      if (r.InspectionResult && r.InspectionResult !== 'Pending' && !r.InspectionDone) issues.push({ level: 'warn', file: r._src.file, sheet: 'CAAF', row: r._src.row, field: 'InspectionResult', msg: `${r.CentreID}: result "${r.InspectionResult}" but InspectionDone is empty` });
    }
    const planCount = new Map(T.Plan.map((p) => [p.CentreID + '|' + p.JobRoleCode, p]));
    const bCount = new Map();
    for (const b of T.Batches) {
      const k = b.CentreID + '|' + b.JobRoleCode; bCount.set(k, (bCount.get(k) || 0) + (b.BatchStatus === 'Cancelled' ? 0 : 1));
      if (!planCount.has(k) && b.CentreID && b.JobRoleCode) issues.push({ level: 'warn', file: b._src.file, sheet: 'Batches', row: b._src.row, msg: `${b.BatchID}: no Plan row for ${b.CentreID} × ${b.JobRoleCode}` });
      if (b.StartDate && b.EndDate && b.StartDate > b.EndDate) issues.push({ level: 'error', file: b._src.file, sheet: 'Batches', row: b._src.row, msg: `${b.BatchID}: StartDate after EndDate` });
      for (const f of ['PrimaryTrainerID', 'BackupTrainerID']) {
        const t = ix.Trainers && ix.Trainers.get(b[f]);
        if (t && (t.CentreID !== b.CentreID || t.JobRoleCode !== b.JobRoleCode)) issues.push({ level: 'error', file: b._src.file, sheet: 'Batches', row: b._src.row, field: f, msg: `${b.BatchID}: trainer ${t.TrainerID} belongs to ${t.CentreID} / ${t.JobRoleCode}` });
      }
      if (b.PrimaryTrainerID && b.PrimaryTrainerID === b.BackupTrainerID) issues.push({ level: 'warn', file: b._src.file, sheet: 'Batches', row: b._src.row, msg: `${b.BatchID}: backup trainer is the same as primary` });
      if (b.CCTVVerified === 'Y' && !b.CCTVVerifiedDate) issues.push({ level: 'info', file: b._src.file, sheet: 'Batches', row: b._src.row, field: 'CCTVVerifiedDate', msg: `${b.BatchID}: CCTV verified but no date` });
    }
    for (const [k, p] of planCount) {
      const n = bCount.get(k) || 0;
      if (n !== p.PlannedBatches) issues.push({ level: 'warn', file: p._src.file, sheet: 'Plan', row: p._src.row, msg: `${p.CentreID} × ${p.JobRoleCode}: plan has ${p.PlannedBatches} batches, status file has ${n}` });
    }
    // one trainer, one active batch at a time
    const active = T.Batches.filter((b) => ['Created', 'Ongoing'].includes(b.BatchStatus));
    const byTr = new Map();
    for (const b of active) if (b.PrimaryTrainerID) { if (!byTr.has(b.PrimaryTrainerID)) byTr.set(b.PrimaryTrainerID, []); byTr.get(b.PrimaryTrainerID).push(b); }
    for (const [t, bs] of byTr) if (bs.length > 1) issues.push({ level: 'warn', file: bs[0]._src.file, sheet: 'Batches', msg: `Trainer ${t} is primary on ${bs.length} active batches: ${bs.map((b) => b.BatchID).join(', ')}` });

    // --- batch files
    const batchFiles = []; const seenBatch = new Map(); const seenStudent = new Map();
    for (const f of set.batches) {
      checkMeta(f, 'batch', issues);
      const info = readTable(f, 'Info', issues).rows[0];
      const bid = info && info.BatchID;
      if (!bid) { issues.push({ level: 'error', file: f.name, sheet: 'Info', msg: 'BatchID missing; file skipped' }); continue; }
      if (f.idHint && f.idHint !== bid) issues.push({ level: 'warn', file: f.name, sheet: 'Info', msg: `File name says "${f.idHint}" but Info.BatchID is "${bid}"` });
      if (!ix.Batches || !ix.Batches.has(bid)) { issues.push({ level: 'error', file: f.name, sheet: 'Info', field: 'BatchID', msg: `Batch "${bid}" not found in status Batches sheet; file skipped` }); continue; }
      if (seenBatch.has(bid)) { issues.push({ level: 'error', file: f.name, msg: `Second file for batch ${bid} (also ${seenBatch.get(bid)}); file skipped` }); continue; }
      seenBatch.set(bid, f.name);
      const students = readTable(f, 'Students', issues).rows;
      const att = readTable(f, 'Attendance', issues);
      const assess = readTable(f, 'Assessment', issues).rows;
      const sIx = new Map(students.map((s) => [s.StudentID, s]));
      for (const s of students) {
        if (seenStudent.has(s.StudentID)) issues.push({ level: 'error', file: f.name, sheet: 'Students', row: s._src.row, field: 'StudentID', msg: `${s.StudentID} also appears in ${seenStudent.get(s.StudentID)}` });
        else seenStudent.set(s.StudentID, f.name);
      }
      const b = ix.Batches.get(bid);
      const dates = att.extra.map((x) => x.date);
      const outside = dates.filter((d) => (b.StartDate && d < b.StartDate) || (b.EndDate && d > b.EndDate));
      if (outside.length) issues.push({ level: 'warn', file: f.name, sheet: 'Attendance', msg: `${outside.length} attendance date column(s) fall outside the batch window (${outside.slice(0, 3).map(RC.fmt.date).join(', ')}${outside.length > 3 ? '…' : ''})` });
      const attendance = new Map();
      for (const r of att.rows) {
        if (!sIx.has(r.StudentID)) { issues.push({ level: 'error', file: f.name, sheet: 'Attendance', row: r._src.row, field: 'StudentID', msg: `"${r.StudentID}" not in Students sheet` }); continue; }
        const marks = [];
        for (const c of r._cells) {
          if (c.v == null || String(c.v).trim() === '') continue;
          const v = String(c.v).trim().toUpperCase();
          if (v !== 'P' && v !== 'A') { issues.push({ level: 'error', file: f.name, sheet: 'Attendance', row: r._src.row, field: RC.fmt.date(c.date), msg: `Mark "${c.v}" — use P or A` }); continue; }
          marks.push({ date: c.date, v });
        }
        attendance.set(r.StudentID, marks);
      }
      for (const a of assess) {
        if (!sIx.has(a.StudentID)) issues.push({ level: 'error', file: f.name, sheet: 'Assessment', row: a._src.row, field: 'StudentID', msg: `"${a.StudentID}" not in Students sheet` });
        if (a.CertifiedDate && a.Result !== 'Pass') issues.push({ level: 'warn', file: f.name, sheet: 'Assessment', row: a._src.row, msg: `${a.StudentID}: certified date on a non-pass attempt` });
      }
      const n = students.length;
      if (['Ongoing', 'Completed'].includes(b.BatchStatus) && (n < S.rules.batchMinStudents || n > S.rules.batchMaxStudents))
        issues.push({ level: 'warn', file: f.name, sheet: 'Students', msg: `${bid} has ${n} students (allowed ${S.rules.batchMinStudents}–${S.rules.batchMaxStudents})` });
      batchFiles.push({ batchId: bid, file: f, students, dates, attendance, assessment: assess });
    }
    for (const b of T.Batches) if (['Ongoing', 'Completed'].includes(b.BatchStatus) && !seenBatch.has(b.BatchID))
      issues.push({ level: 'warn', file: '(batches folder)', msg: `${b.BatchID} is ${b.BatchStatus} but has no batch file` });

    const order = { error: 0, warn: 1, info: 2 };
    issues.sort((a, b) => order[a.level] - order[b.level]);
    return { tables: T, batchFiles, issues };
  }

  RC.Validate = { validate, parseDate };
})(typeof window !== 'undefined' ? window : globalThis);
