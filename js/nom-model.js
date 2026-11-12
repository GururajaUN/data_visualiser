/* ============================================================
   CR4 — NOMINATIONS: adapters + rules
   Input : catalog files of type nomPlan, nomList, nomDecisions
   Output: RC.state.N = { centres[], people[], noms[], m{}, issues[],
                          sources{}, asOf }
   Adapters read the workbooks as received (headers matched by name,
   config in config/nominations.js). Rules allocate one trainer per
   batch, keep extras as backup, and apply the user's Decisions sheet.
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const txt = (v) => (v == null ? '' : v instanceof Date ? RC.fmt.date(v) : String(v).replace(/\s+/g, ' ').trim());

  /* ---------- generic header mapping ---------- */
  function pickSheet(file, names, issues, label) {
    for (const n of names) { const k = Object.keys(file.sheets).find((s) => norm(s) === norm(n)); if (k) return { name: k, sh: file.sheets[k] }; }
    issues.push({ level: 'error', file: file.name, msg: `${label}: sheet "${names[0]}" not found (sheets: ${Object.keys(file.sheets).join(', ')})` });
    return null;
  }
  function colMap(header, spec, issues, where) {
    const H = header.map((h) => norm(h instanceof Date ? '' : h));
    const idx = {};
    for (const [key, c] of Object.entries(spec)) {
      let i = -1;
      if (c.h) for (const a of c.h) { i = H.indexOf(norm(a)); if (i >= 0) break; }
      if (i < 0 && c.after) { const j = H.indexOf(norm(c.after)); if (j >= 0 && H[j + 1] === '') i = j + 1; }
      if (i >= 0) idx[key] = i;
      else if (c.required) issues.push({ level: 'error', ...where, field: (c.h || [c.after])[0], msg: `Column "${(c.h || [c.after])[0]}" not found — add its current spelling to config/nominations.js` });
    }
    return idx;
  }
  const cell = (r, idx, k) => (idx[k] == null ? null : r.cells[idx[k]] ?? null);

  /* ---------- value helpers ---------- */
  const COURSES = () => RC.NOM.courses;
  function matchCourse(raw) {
    const n = norm(raw); if (!n) return null;
    for (const c of COURSES()) if (norm(c.name) === n || norm(c.code) === n || c.aliases.some((a) => norm(a) === n) || norm(c.short) === n) return c.code;
    return null;
  }
  const courseOf = (code) => COURSES().find((c) => c.code === code);
  function cleanMobile(v) {
    if (v == null || v === '') return { m: null, ok: false, raw: '' };
    const raw = String(v).trim();
    let d = raw.split(/[\/,;]/)[0].replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return { m: d || null, ok: /^[6-9]\d{9}$/.test(d), raw, multi: /[\/,;]/.test(raw) };
  }
  const canonDistrict = (s) => RC.NOM.districtAliases[norm(s)] || txt(s);
  function nomDate(name) { const m = name.match(/(\d{2})[-_.](\d{2})[-_.](\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; }

  /* ---------- adapters ---------- */
  function readPlan(file, issues) {
    const C = RC.NOM.plan; const s = pickSheet(file, C.sheet, issues, 'Plan'); if (!s) return [];
    const where = { file: file.name, sheet: s.name };
    const idx = colMap(s.sh.header, C.columns, issues, where);
    const by = new Map();
    for (const r of s.sh.rows) {
      const sno = cell(r, idx, 'sno'), tc = txt(cell(r, idx, 'tc')), courseRaw = txt(cell(r, idx, 'course'));
      if (norm(sno) === 'total' || norm(tc) === 'total' || !courseRaw) continue;
      if (!tc) { issues.push({ level: 'error', ...where, row: r.excelRow, msg: `Row has a job role but no TC ID; skipped` }); continue; }
      let c = by.get(tc);
      if (!c) {
        const g = (k) => cell(r, idx, k);
        c = { tc, sno: g('sno'), district: txt(g('district')), label: RC.NOM.centreLabels[tc] || ('GTTC ' + txt(g('district'))),
          address: txt(g('address')), spoc: txt(g('spoc')), email: txt(g('email')), mobile: txt(g('mobile')), password: txt(g('password')),
          caaf: txt(g('caaf')), caafNote: txt(g('caafNote')), caafDate: g('caafDate') instanceof Date ? g('caafDate') : null,
          reqManual: typeof g('reqManual') === 'number' ? g('reqManual') : null, nomNote: txt(g('nomNote')),
          inspectionPlan: txt(g('inspection')), remarks: txt(g('remarks')), courses: {}, row: r.excelRow };
        by.set(tc, c);
      }
      const code = matchCourse(courseRaw);
      const target = Number(cell(r, idx, 'target'));
      if (!code) { issues.push({ level: 'error', ...where, row: r.excelRow, field: 'Job Role', msg: `Job role "${courseRaw}" not recognised — add it to courses in config/nominations.js` }); continue; }
      if (!isFinite(target)) { issues.push({ level: 'error', ...where, row: r.excelRow, field: 'Target Allocated', msg: `Target "${cell(r, idx, 'target')}" is not a number` }); continue; }
      if (target % RC.NOM.rules.seatsPerBatch) issues.push({ level: 'warn', ...where, row: r.excelRow, msg: `${tc} ${code}: target ${target} is not a multiple of ${RC.NOM.rules.seatsPerBatch}; required trainers rounded up` });
      if (c.courses[code]) issues.push({ level: 'warn', ...where, row: r.excelRow, msg: `${tc}: ${code} appears twice; targets added` });
      const old = c.courses[code];
      const t = (old ? old.target : 0) + target;
      const bs = cell(r, idx, 'batchStart'), be = cell(r, idx, 'batchEnd');
      const st = bs instanceof Date ? bs : null, en = be instanceof Date ? be : null;
      c.courses[code] = { code, target: t, req: Math.ceil(t / RC.NOM.rules.seatsPerBatch) * RC.NOM.rules.trainersPerBatch,
        start: old && old.start && (!st || old.start < st) ? old.start : st, end: old && old.end && (!en || old.end > en) ? old.end : en };
    }
    return [...by.values()];
  }

  function readMapped(file, issues) {
    const C = RC.NOM.nominations; const s = pickSheet(file, C.mappedSheet, issues, 'Nominations'); if (!s) return [];
    const where = { file: file.name, sheet: s.name };
    const idx = colMap(s.sh.header, C.mapped, issues, where);
    const out = []; let grp = null, course = null, i = 0;
    const groups = [];
    for (const r of s.sh.rows) {
      const g = (k) => cell(r, idx, k);
      const name = txt(g('name')), mob = g('mobile');
      if (!name && (mob == null || mob === '')) {
        const cn = txt(g('centre')), tc = txt(g('tc'));
        if (norm(cn) === 'grandtotal' || norm(tc) === 'grandtotal') { grp = null; continue; }
        if (cn || tc) { grp = { tc: tc || null, centre: cn, note: txt(g('note')), declared: typeof g('count') === 'number' ? g('count') : null, row: r.excelRow, n: 0 }; groups.push(grp); course = null; }
        if (txt(g('course'))) course = txt(g('course'));
        continue;
      }
      if (txt(g('course'))) course = txt(g('course'));
      if (!grp) { issues.push({ level: 'error', ...where, row: r.excelRow, msg: `Nomination "${name}" appears before any centre row; skipped` }); continue; }
      const mm = cleanMobile(mob);
      grp.n++;
      out.push({ i: i++, tc: grp.tc, srcCentre: grp.centre, groupNote: grp.note, courseRaw: course || '', code: matchCourse(course), name, ...{ mobile: mm.m, mobileOk: mm.ok, mobileRaw: mm.raw, mobileMulti: mm.multi },
        tr: /^TR\d+/i.test(txt(g('tr'))) ? txt(g('tr')).toUpperCase() : null, src: { file: file.name, sheet: s.name, row: r.excelRow } });
    }
    for (const gp of groups) if (gp.declared != null && gp.declared !== gp.n) issues.push({ level: 'info', ...where, row: gp.row, msg: `${gp.centre || gp.tc}: group total says ${gp.declared}, ${gp.n} name rows found` });
    return out;
  }

  function readDetail(file, issues) {
    const C = RC.NOM.nominations; const s = pickSheet(file, C.detailSheet, issues, 'Nominations detail'); if (!s) return [];
    const where = { file: file.name, sheet: s.name };
    const idx = colMap(s.sh.header, C.detail, issues, where);
    return s.sh.rows.filter((r) => txt(cell(r, idx, 'name'))).map((r) => {
      const g = (k) => cell(r, idx, k); const mm = cleanMobile(g('mobile'));
      const num = (v) => (typeof v === 'number' ? v : v == null || v === '' ? null : isFinite(+v) ? +v : null);
      return { courseRaw: txt(g('course')), code: matchCourse(g('course')), centre: txt(g('centre')), name: txt(g('name')), dob: g('dob') instanceof Date ? g('dob') : null, dobRaw: txt(g('dob')),
        mobile: mm.m, email: txt(g('email')), address: txt(g('address')), state: txt(g('state')), location: txt(g('location')), sid: txt(g('sid')), qp: txt(g('qp')),
        qual: txt(g('qual')), indExp: num(g('indExp')), teachExp: num(g('teachExp')), totExp: num(g('totExp')), remarks: txt(g('remarks')), src: { file: file.name, sheet: s.name, row: r.excelRow }, used: false };
    });
  }

  /* CR12 — TOT request tracker (portal dump) */
  function qpCode(raw) {
    const m = String(raw || '').match(/RSC\/?\s*Q?\s*(\d{4})/i); if (!m) return { qp: null, code: null };
    const qp = 'RSC/Q' + m[1]; const c = COURSES().find((x) => x.qp === qp); return { qp, code: c ? c.code : null };
  }
  function readTot(file, issues) {
    if (!file) return [];
    const C = RC.NOM.tot;
    let s = null; for (const n of C.sheet) { const k = Object.keys(file.sheets).find((x) => norm(x) === norm(n)); if (k) { s = { name: k, sh: file.sheets[k] }; break; } }
    if (!s) { const k = Object.keys(file.sheets)[0]; s = k ? { name: k, sh: file.sheets[k] } : null; }
    if (!s) return [];
    const where = { file: file.name, sheet: s.name };
    const idx = colMap(s.sh.header, C.cols, issues, where);
    return s.sh.rows.filter((r) => txt(cell(r, idx, 'tr')) || txt(cell(r, idx, 'name'))).map((r) => {
      const g = (k) => cell(r, idx, k); const mm = cleanMobile(g('mobile')); const q = qpCode(g('qp')); const rq = g('requested');
      const tr = txt(g('tr')).toUpperCase();
      if (!/^TR\d+$/.test(tr)) issues.push({ level: 'warn', ...where, row: r.excelRow, field: 'Applicant ID', msg: `"${txt(g('tr'))}" is not a TR ID` });
      return { tr: /^TR\d+$/.test(tr) ? tr : null, name: txt(g('name')), email: txt(g('email')), mobile: mm.ok ? mm.m : null, mobileRaw: mm.raw, qpRaw: txt(g('qp')), qp: q.qp, code: q.code,
        district: txt(g('district')), sub: txt(g('sub')), requested: rq instanceof Date ? rq : null, src: { file: file.name, sheet: s.name, row: r.excelRow }, person: null, how: null };
    });
  }

  function readDecisions(file, issues) {
    const D = RC.NOM.decisions; const out = { people: new Map(), centres: new Map() };
    if (!file) return out;
    const val = (list, v, where, field) => {
      const t = txt(v); if (!t) return null;
      const hit = list.find((x) => norm(x) === norm(t)); if (!hit) issues.push({ level: 'error', ...where, field, msg: `"${t}" is not allowed (use: ${list.join(', ')}); ignored` });
      return hit || null;
    };
    const ps = file.sheets[D.peopleSheet];
    if (ps) {
      const idx = colMap(ps.header, { key: { h: ['PersonKey'], required: true }, tc: { h: ['AssignTC'] }, course: { h: ['AssignCourse'] }, dec: { h: ['Decision'] }, tot: { h: ['TOTStatus'] }, totDate: { h: ['TOTDate'] }, notes: { h: ['Notes'] } }, issues, { file: file.name, sheet: D.peopleSheet });
      for (const r of ps.rows) {
        const where = { file: file.name, sheet: D.peopleSheet, row: r.excelRow };
        const key = txt(cell(r, idx, 'key')); if (!key) continue;
        const courseRaw = txt(cell(r, idx, 'course')); const code = courseRaw ? matchCourse(courseRaw) : null;
        if (courseRaw && !code) issues.push({ level: 'error', ...where, field: 'AssignCourse', msg: `Course "${courseRaw}" not recognised; ignored` });
        const td = cell(r, idx, 'totDate');
        const any = ['tc', 'course', 'dec', 'tot', 'totDate', 'notes'].some((k) => txt(cell(r, idx, k)));
        if (!any) continue; // row exported but not edited
        out.people.set(key, { key, tc: txt(cell(r, idx, 'tc')).toUpperCase() || null, course: code, decision: val(D.decisionValues, cell(r, idx, 'dec'), where, 'Decision'),
          decisionRaw: txt(cell(r, idx, 'dec')), totRaw: txt(cell(r, idx, 'tot')), courseRaw,
          tot: val(D.totValues, cell(r, idx, 'tot'), where, 'TOTStatus'), totDate: td instanceof Date ? td : null, notes: txt(cell(r, idx, 'notes')), row: r.excelRow, used: false });
      }
    } else issues.push({ level: 'warn', file: file.name, msg: `Decisions file has no "${D.peopleSheet}" sheet` });
    const cs = file.sheets[D.centresSheet];
    if (cs) {
      const idx = colMap(cs.header, { tc: { h: ['TCID', 'TC ID'], required: true }, insp: { h: ['InspectionStatus'] }, inspDate: { h: ['InspectionDate'] }, notes: { h: ['Notes'] }, lat: { h: ['Latitude'] }, lon: { h: ['Longitude'] }, onb: { h: ['BatchesOnboarded'] } }, issues, { file: file.name, sheet: D.centresSheet });
      for (const r of cs.rows) {
        const tc = txt(cell(r, idx, 'tc')).toUpperCase(); if (!tc) continue;
        const d = cell(r, idx, 'inspDate');
        const la = Number(cell(r, idx, 'lat')), lo = Number(cell(r, idx, 'lon'));
        const hasLL = txt(cell(r, idx, 'lat')) !== '' && txt(cell(r, idx, 'lon')) !== '';
        const okLL = hasLL && la > 11 && la < 19 && lo > 73.5 && lo < 79;
        if (hasLL && !okLL) issues.push({ level: 'error', file: file.name, sheet: D.centresSheet, row: r.excelRow, field: 'Latitude/Longitude', msg: `${tc}: "${txt(cell(r, idx, 'lat'))}, ${txt(cell(r, idx, 'lon'))}" is not inside Karnataka; approximate pin used` });
        out.centres.set(tc, { insp: val(D.inspectionValues, cell(r, idx, 'insp'), { file: file.name, sheet: D.centresSheet, row: r.excelRow }, 'InspectionStatus'), inspDate: d instanceof Date ? d : null, notes: txt(cell(r, idx, 'notes')),
          latlon: okLL ? [la, lo] : null, onboarded: Number.isFinite(Number(cell(r, idx, 'onb'))) && txt(cell(r, idx, 'onb')) !== '' ? Math.max(0, Math.round(Number(cell(r, idx, 'onb')))) : 0 });
      }
    }
    return out;
  }

  /* ---------- build ---------- */
  function build(files) {
    if (!RC.NOM || !RC.NOM.files) return null;
    const issues = [];
    const pick = (t) => files.filter((f) => f.type === t).sort((a, b) => b.lastModified - a.lastModified);
    const plans = pick('nomPlan'), lists = pick('nomList'), decs = pick('nomDecisions'), tots = pick('nomTot');
    if (!plans.length || !lists.length) return null;
    const planF = plans[0], listF = lists[0], decF = decs[0] || null, totF = tots[0] || null;
    for (const [arr, l] of [[plans, 'plan'], [lists, 'nominations'], [decs, 'decisions'], [tots, 'TOT request']]) if (arr.length > 1) issues.push({ level: 'info', file: '(folder)', msg: `${arr.length} ${l} files found; using the most recently modified: ${arr[0].name}` });

    const centresArr = readPlan(planF, issues);
    const noms = readMapped(listF, issues);
    const details = readDetail(listF, issues);
    const D = readDecisions(decF, issues);
    const totRows = readTot(totF, issues);
    const C = new Map(centresArr.map((c) => [c.tc, c]));
    const R = RC.NOM.rules;

    // join detail rows
    const dIdx = new Map();
    const addIdx = (k, d) => { if (!dIdx.has(k)) dIdx.set(k, []); dIdx.get(k).push(d); };
    for (const d of details) { if (d.mobile) addIdx('m|' + d.mobile + '|' + (d.code || norm(d.courseRaw)), d); addIdx('n|' + norm(d.name) + '|' + (d.code || norm(d.courseRaw)), d); if (d.mobile) addIdx('m|' + d.mobile, d); }
    const take = (k) => { const l = dIdx.get(k); if (!l) return null; const d = l.find((x) => !x.used) || null; if (d) d.used = true; return d; };
    for (const n of noms) {
      const ck = n.code || norm(n.courseRaw);
      n.detail = (n.mobile && take('m|' + n.mobile + '|' + ck)) || take('n|' + norm(n.name) + '|' + ck) || (n.mobile && take('m|' + n.mobile)) || null;
    }
    const unmatchedMapped = noms.filter((n) => !n.detail).length, unmatchedDetail = details.filter((d) => !d.used);
    if (unmatchedMapped) issues.push({ level: 'warn', file: listF.name, sheet: 'Mapped with TC', msg: `${unmatchedMapped} nomination(s) have no matching row in "All Nominations" (matched on mobile + job role, then name + job role)` });
    for (const d of unmatchedDetail) issues.push({ level: 'warn', file: listF.name, sheet: d.src.sheet, row: d.src.row, msg: `"${d.name}" (${d.courseRaw}) is in All Nominations but not in Mapped with TC — not counted` });
    for (const n of noms) if (n.tc && !C.has(n.tc)) issues.push({ level: 'warn', file: listF.name, sheet: n.src.sheet, row: n.src.row, msg: `TC ${n.tc} (${n.srcCentre}) is not in the plan — nomination counted as "Not in plan"` });

    // people
    const P = new Map();
    for (const n of noms) {
      const key = n.mobileOk ? n.mobile : 'N:' + norm(n.name) + '@' + (n.tc || norm(n.srcCentre));
      let p = P.get(key);
      if (!p) { p = { key, name: n.name, names: new Set(), mobile: n.mobileOk ? n.mobile : null, mobileRaw: n.mobileRaw, noms: [], trs: new Set(), tcs: new Set(), srcCentres: new Set(), flags: [] }; P.set(key, p); }
      p.names.add(n.name); p.noms.push(n); if (n.tr) p.trs.add(n.tr); if (n.tc) p.tcs.add(n.tc); p.srcCentres.add(n.srcCentre);
      n.person = p;
    }
    const people = [...P.values()];
    const today = new Date(new Date().toDateString());
    for (const p of people) {
      p.detail = (p.noms.find((n) => n.detail) || {}).detail || null;
      p.tr = [...p.trs][0] || (p.detail && /^TR\d+/i.test(p.detail.sid) ? p.detail.sid.toUpperCase() : null);
      p.codes = [...new Set(p.noms.map((n) => n.code).filter(Boolean))];
      p.others = [...new Set(p.noms.filter((n) => !n.code).map((n) => n.courseRaw))];
      p.dec = D.people.get(p.key) || null; if (p.dec) p.dec.used = true;
      p.srcTC = p.tcs.size ? [...p.tcs][0] : null;
      p.tc = (p.dec && p.dec.tc) || p.srcTC;
      if (p.dec && p.dec.tc && !C.has(p.dec.tc)) { issues.push({ level: 'error', file: decF.name, sheet: 'People', row: p.dec.row, field: 'AssignTC', msg: `TC "${p.dec.tc}" is not in the plan; ignored` }); p.tc = p.srcTC; }
      p.centre = C.get(p.tc) || null;
      p.tot = (p.dec && p.dec.tot) || RC.NOM.decisions.defaults.tot;
      p.totDone = p.tot === 'Completed';
      p.srcLabel = [...p.srcCentres].join(', ');
    }
    // CR12 — match TOT requests: mobile, then TR ID, then name. Portal TR ID is the source of truth.
    for (const p of people) { p.totReqs = []; p.trNom = p.tr; p.trSrc = p.tr ? 'nominations' : null; }
    const byMob = new Map(people.filter((p) => p.mobile).map((p) => [p.mobile, p]));
    const byDetMob = new Map(); for (const p of people) if (p.detail && p.detail.mobile && !byDetMob.has(p.detail.mobile)) byDetMob.set(p.detail.mobile, p);
    const byTR = new Map(); for (const p of people) for (const t of p.trs) if (!byTR.has(t)) byTR.set(t, p);
    for (const p of people) if (p.tr && !byTR.has(p.tr)) byTR.set(p.tr, p);
    const byName = new Map(); for (const p of people) for (const n of p.names) { const k = norm(n); if (!byName.has(k)) byName.set(k, []); if (!byName.get(k).includes(p)) byName.get(k).push(p); }
    for (const t of totRows) {
      let p = null, how = null;
      if (t.mobile && (p = byMob.get(t.mobile) || byDetMob.get(t.mobile))) how = 'mobile';
      else if (t.tr && (p = byTR.get(t.tr))) how = 'TR ID';
      else { const l = byName.get(norm(t.name)) || []; if (l.length === 1) { p = l[0]; how = 'name'; } }
      if (p) { t.person = p; t.how = how; p.totReqs.push(t); }
    }
    for (const p of people) {
      const trs = [...new Set(p.totReqs.map((t) => t.tr).filter(Boolean))];
      if (!trs.length) continue;
      p.trPortal = trs[0];
      if (p.trNom && p.trNom !== p.trPortal) { p.trMismatch = true; }
      p.tr = p.trPortal; p.trSrc = 'portal';
      if (trs.length > 1) p.trPortalMulti = trs;
    }
    const totOrphans = totRows.filter((t) => !t.person);
    for (const t of totOrphans) issues.push({ level: 'warn', file: t.src.file, sheet: t.src.sheet, row: t.src.row, msg: `TOT request from ${t.name} (${t.tr || 'no TR ID'}${t.mobile ? ', ' + t.mobile : ''}) — not found in the nominations` });
    for (const d of D.people.values()) if (!d.used) issues.push({ level: 'warn', file: decF.name, sheet: 'People', row: d.row, msg: `PersonKey "${d.key}" not found in the current nominations; decision not applied` });

    // allocation per centre
    for (const c of centresArr) {
      c.people = people.filter((p) => p.tc === c.tc);
      const fill = {}; const backup = {}; for (const k of Object.keys(c.courses)) { fill[k] = 0; backup[k] = 0; }
      const allowed = (p) => {
        if (p.dec && p.dec.course) return c.courses[p.dec.course] ? [p.dec.course] : [];
        return p.codes.filter((k) => c.courses[k]);
      };
      const set = (p, status, course, why) => { p.status = status; p.course = course; p.why = why; };
      // 1. explicit decisions
      for (const p of c.people.filter((p) => p.dec && p.dec.decision)) {
        const course = (p.dec.course) || allowed(p).sort((a, b) => (c.courses[b].req - fill[b]) - (c.courses[a].req - fill[a]))[0] || p.codes[0] || null;
        if (p.dec.decision === 'Reject') { set(p, 'Rejected', p.dec.course || null, 'Decision: ' + (p.dec.notes || 'rejected')); p.decided = true; continue; }
        if (!course || !c.courses[course]) { set(p, 'Rejected', course, `Decision "${p.dec.decision}" but course ${course || '—'} is not allocated here`); p.flags.push({ code: 'DECISION_INVALID', sev: 'high', text: `Decision "${p.dec.decision}" could not be applied: course not allocated at this centre` }); continue; }
        if (p.dec.decision === 'Required') { fill[course]++; set(p, 'Required', course, 'Decision'); if (fill[course] > c.courses[course].req) p.flags.push({ code: 'OVER_REQ', sev: 'med', text: `Marked Required but ${courseOf(course).short} now has ${fill[course]} for ${c.courses[course].req} slot(s)` }); }
        else { backup[course]++; set(p, 'Backup', course, 'Decision'); }
        p.decided = true;
      }
      // 2. automatic
      const rest = c.people.filter((p) => !p.status);
      const auto = rest.map((p) => ({ p, opts: allowed(p) })).sort((a, b) => (a.opts.length || 99) - (b.opts.length || 99) || (b.p.tr ? 1 : 0) - (a.p.tr ? 1 : 0) || a.p.noms[0].i - b.p.noms[0].i);
      for (const { p, opts } of auto) {
        if (!opts.length) {
          const why = p.codes.length ? `Nominated for ${p.codes.map((k) => courseOf(k).short).join(', ')} — not allocated at this centre` : `Course "${p.others.join(', ')}" is not one of the 4 project courses`;
          set(p, 'Rejected', p.codes[0] || null, why); continue;
        }
        const best = opts.slice().sort((a, b) => (c.courses[b].req - fill[b]) - (c.courses[a].req - fill[a]))[0];
        if (fill[best] < c.courses[best].req) { fill[best]++; set(p, 'Required', best, opts.length > 1 ? `Kept on ${courseOf(best).short} (biggest shortfall)` : 'Within requirement'); }
        else { const bk = opts.slice().sort((a, b) => backup[a] - backup[b])[0]; backup[bk]++; set(p, 'Backup', bk, `${courseOf(bk).short} already has ${c.courses[bk].req} required`); }
      }
      c.fill = fill; c.backupBy = backup;
    }
    for (const p of people) if (!p.status) {
      if (!p.tc) { p.status = 'Unassigned'; p.course = p.codes[0] || null; p.why = `Grouped under "${p.srcLabel}" without a TC — confirm the centre by phone`; }
      else { p.status = 'Not in plan'; p.course = p.codes[0] || null; p.why = `TC ${p.tc} is not in the plan`; }
    }

    // CR12 — TOT status from requests (a later Decisions TOTStatus wins)
    const TV = RC.NOM.decisions.totValues; const rank = (v) => Math.max(0, TV.indexOf(v));
    for (const p of people) {
      const counted = p.status === 'Required' || p.status === 'Backup';
      const reqCodes = p.totReqs.map((t) => t.code);
      p.totReqOk = counted && reqCodes.includes(p.course);
      p.totWrong = p.totReqs.length > 0 && counted && !p.totReqOk;
      p.totNotCounted = p.totReqs.length > 0 && !counted;
      p.totExtra = p.totReqOk ? p.totReqs.filter((t) => t.code !== p.course) : [];
      const fromReq = p.totReqOk ? 'Training requested' : p.totWrong ? 'Requested - wrong course' : p.totNotCounted ? 'Requested - not counted' : null;
      if (fromReq && !(p.dec && p.dec.tot && rank(p.dec.tot) > rank('Training requested'))) p.tot = fromReq;
      p.totDone = p.tot === 'Completed';
      p.totAsked = p.totDone || p.tot === 'Scheduled' || p.tot === 'Training requested';
      p.totReqDate = p.totReqs.reduce((m, t) => (t.requested && (!m || t.requested < m) ? t.requested : m), null);
    }

    // flags
    const trOwners = new Map(); for (const p of people) if (p.tr) { if (!trOwners.has(p.tr)) trOwners.set(p.tr, []); trOwners.get(p.tr).push(p); }
    const nameAt = new Map(); for (const p of people) { const k = (p.tc || p.srcLabel) + '|' + norm(p.name); if (!nameAt.has(k)) nameAt.set(k, []); nameAt.get(k).push(p); }
    const F = (p, code, sev, text) => p.flags.push({ code, sev, text });
    for (const p of people) {
      const d = p.detail;
      if (!p.noms[0].mobileRaw) F(p, 'NO_MOBILE', 'high', 'Mobile number missing');
      else if (!p.noms[0].mobileOk) F(p, 'BAD_MOBILE', 'high', `Mobile "${p.mobileRaw}" is not a valid 10-digit number`);
      if (p.noms.some((n) => n.mobileMulti)) F(p, 'TWO_MOBILES', 'low', `Two numbers given ("${p.mobileRaw}"); first one used`);
      if (p.tr && trOwners.get(p.tr).length > 1) F(p, 'SHARED_TR', 'high', `Same TR ID ${p.tr} is also given for ${trOwners.get(p.tr).filter((x) => x !== p).map((x) => x.name).join(', ')}`);
      if (p.status === 'Unassigned') F(p, 'UNASSIGNED', 'high', 'Centre (TC) not confirmed');
      if (p.tcs.size > 1) F(p, 'MULTI_TC', 'high', `Nominated by more than one TC: ${[...p.tcs].join(', ')}`);
      const allCourses = [...p.codes.map((k) => courseOf(k).short), ...p.others];
      if (allCourses.length > 1) F(p, 'MULTI_COURSE', 'med', `Nominated for ${allCourses.length} courses (${allCourses.join(', ')})${p.status === 'Required' || p.status === 'Backup' ? '; kept on ' + courseOf(p.course).short : ''}`);
      if (p.centre) { const na = p.codes.filter((k) => !p.centre.courses[k]); if (na.length) F(p, 'NOT_ALLOCATED', 'med', `${na.map((k) => courseOf(k).short).join(', ')} not allocated at ${p.centre.label}`); }
      if (p.others.length) F(p, 'NONSTANDARD', 'med', `Course name not recognised: ${p.others.join(', ')}`);
      const same = nameAt.get((p.tc || p.srcLabel) + '|' + norm(p.name)); if (same.length > 1) F(p, 'SAME_NAME', 'med', `Same name with a different mobile at this centre (${same.filter((x) => x !== p).map((x) => x.mobileRaw || 'no mobile').join(', ')}) — possible duplicate`);
      if (p.names.size > 1) F(p, 'NAME_VARIANTS', 'low', `Name spelled differently: ${[...p.names].join(' / ')}`);
      const cn = (t) => (t.code ? courseOf(t.code).short : t.qpRaw);
      if (p.trMismatch) F(p, 'TR_MISMATCH', 'high', `TR ID differs: nominations sheet has ${p.trNom}, TOT portal has ${p.trPortal} — correct the nominations sheet (portal is used)`);
      else if (p.trSrc === 'portal' && !p.trNom) F(p, 'TR_FROM_PORTAL', 'med', `TR ID ${p.trPortal} found only in the TOT portal — add it to the nominations sheet`);
      if (p.trPortalMulti) F(p, 'TR_PORTAL_MULTI', 'high', `TOT portal shows more than one TR ID for this person: ${p.trPortalMulti.join(', ')}`);
      if (p.totWrong) F(p, 'TOT_WRONG_COURSE', 'high', `TOT requested for ${p.totReqs.map(cn).join(' and ')} but ${p.status === 'Required' ? 'counted' : 'backup'} on ${courseOf(p.course).short} — raise a request for ${courseOf(p.course).tot}`);
      if (p.totExtra.length) F(p, 'TOT_EXTRA', 'med', `Also requested TOT for ${p.totExtra.map(cn).join(', ')} — not needed for ${courseOf(p.course).short}`);
      if (p.totNotCounted) F(p, 'TOT_NOT_COUNTED', 'med', `TOT requested for ${p.totReqs.map(cn).join(', ')} but this person is ${p.status === 'Rejected' ? 'rejected' : p.status.toLowerCase()} (${p.why})`);
      { const t = p.totReqs.find((x) => x.how !== 'name' && x.mobile && p.mobile && x.mobile !== p.mobile); if (t) F(p, 'TOT_MOBILE_DIFF', 'med', `TOT portal mobile ${t.mobile} differs from nominations ${p.mobile} (matched on ${t.how})`); }
      if (p.totReqs.some((t) => t.how === 'name')) { const t = p.totReqs.find((x) => x.how === 'name'); F(p, 'TOT_NAME_MATCH', 'med', `TOT request "${t.name}" (${t.tr || 'no TR'}${t.mobileRaw ? ', mobile ' + t.mobileRaw : ', no mobile'}) matched by name only — confirm it is the same person`); }
      if (!p.tr) F(p, 'NO_TR', 'high', p.status === 'Required' ? 'Counted trainer has no TR ID (Skill India trainer ID) yet' : 'No TR ID (Skill India trainer ID) yet');
      if (!d) F(p, 'NO_DETAIL', 'med', 'No matching row in All Nominations (no DOB / qualification / experience)');
      else {
        if (!d.qual || /^not (provided|given)/i.test(d.qual)) F(p, 'NO_QUAL', 'low', 'Qualification not provided');
        if (d.dob) { const age = (today - d.dob) / (365.25 * 864e5); if (age < R.minAge || age > R.maxAge) F(p, 'DOB_ODD', 'med', `DOB ${RC.fmt.date(d.dob)} gives age ${Math.floor(age)} — verify`); }
        if (d.state && norm(d.state) !== 'karnataka') F(p, 'OUT_OF_STATE', 'low', `Candidate state: ${d.state}`);
      }
    }
    const SEV = { high: 0, med: 1, low: 2 };
    for (const p of people) p.flags.sort((a, b) => SEV[a.sev] - SEV[b.sev]);

    // centre metrics
    for (const c of centresArr) {
      const dc = D.centres.get(c.tc);
      c.inspection = (dc && dc.insp) || c.inspectionPlan || RC.NOM.decisions.defaults.inspection;
      c.caafDone = RC.NOM.caafDoneValues.some((v) => norm(v) === norm(c.caaf));
      c.inspDone = new RegExp(RC.NOM.inspectionDonePattern, 'i').test(c.inspection);
      const ap = (RC.NOM.centreCoords || {})[c.tc];
      c.latlon = (dc && dc.latlon) || ap || null; c.coordExact = !!(dc && dc.latlon);
      c.onboarded = Math.min(dc ? dc.onboarded || 0 : 0, c.req);
      c.inspectionDate = dc && dc.inspDate; c.inspectionNotes = dc && dc.notes;
      c.req = Object.values(c.courses).reduce((s, x) => s + x.req, 0);
      c.rows = noms.filter((n) => n.tc === c.tc).length;
      c.unique = c.people.length;
      c.filled = c.people.filter((p) => p.status === 'Required').length;
      c.backup = c.people.filter((p) => p.status === 'Backup').length;
      c.rejected = c.people.filter((p) => p.status === 'Rejected').length;
      c.gap = Object.keys(c.courses).reduce((s, k) => s + Math.max(0, c.courses[k].req - c.fill[k]), 0);
      c.requiredPeople = c.people.filter((p) => p.status === 'Required');
      c.withTR = c.requiredPeople.filter((p) => p.tr).length;
      c.tot = c.requiredPeople.filter((p) => p.totDone).length;
      c.totReq = c.requiredPeople.filter((p) => p.totAsked).length;
      c.totWrong = c.people.filter((p) => p.totWrong).length;
      c.flagCount = c.people.reduce((s, p) => s + p.flags.filter((f) => f.sev === 'high').length, 0);
      c.state = c.rows === 0 ? 'None' : c.gap === 0 ? 'Covered' : 'Short';
      c.byCourse = Object.keys(c.courses).map((k) => ({ code: k, ...c.courses[k], filled: c.fill[k], backup: c.backupBy[k], gap: Math.max(0, c.courses[k].req - c.fill[k]),
        received: noms.filter((n) => n.tc === c.tc && n.code === k).length, unique: c.people.filter((p) => p.codes.includes(k)).length }));
      c.unassignedHere = [];
      if (c.reqManual != null && c.reqManual !== c.req) issues.push({ level: 'info', file: planF.name, sheet: 'Sheet1', row: c.row, msg: `${c.label}: "Required nomination" says ${c.reqManual}, targets give ${c.req}` });
    }
    // unassigned → candidate TCs by district
    const unassigned = people.filter((p) => p.status === 'Unassigned');
    for (const p of unassigned) {
      const cd = canonDistrict(p.srcLabel);
      p.candidates = centresArr.filter((c) => canonDistrict(c.district) === cd);
      for (const c of p.candidates) c.unassignedHere.push(p);
    }
    // pool suggestions
    for (const p of people) {
      p.suggest = [];
      if ((p.status === 'Rejected' || p.status === 'Backup') && p.centre) for (const bc of p.centre.byCourse) if (bc.gap > 0 && bc.code !== p.course) p.suggest.push(`${p.centre.label} is short ${bc.gap} on ${courseOf(bc.code).short} — ask if they can take it`);
    }

    const sum = (f) => centresArr.reduce((s, c) => s + f(c), 0);
    const m = {
      centres: centresArr.length, required: sum((c) => c.req), received: noms.length, unique: people.length,
      filled: sum((c) => c.filled), gap: sum((c) => c.gap), backup: sum((c) => c.backup), rejected: people.filter((p) => p.status === 'Rejected').length,
      unassigned: unassigned.length, notInPlan: people.filter((p) => p.status === 'Not in plan').length,
      covered: centresArr.filter((c) => c.state === 'Covered').length, short: centresArr.filter((c) => c.state === 'Short').length, none: centresArr.filter((c) => c.state === 'None').length,
      multiCourse: people.filter((p) => p.flags.some((f) => f.code === 'MULTI_COURSE')).length,
      notAllocated: people.filter((p) => p.flags.some((f) => f.code === 'NOT_ALLOCATED')).length,
      withTR: people.filter((p) => p.status === 'Required' && p.tr).length, tot: people.filter((p) => p.status === 'Required' && p.totDone).length,
      totReq: people.filter((p) => p.status === 'Required' && p.totAsked).length,
      totWrong: people.filter((p) => p.totWrong).length, totNotCounted: people.filter((p) => p.totNotCounted).length,
      totRows: totRows.length, totOrphans: totOrphans.length, trMismatch: people.filter((p) => p.trMismatch).length, trFromPortal: people.filter((p) => p.trSrc === 'portal' && !p.trNom).length,
      inspected: centresArr.filter((c) => /^inspected/i.test(c.inspection)).length,
      highFlags: people.filter((p) => p.flags.some((f) => f.sev === 'high' && (f.code !== 'NO_TR' || p.status === 'Required'))).length, decided: people.filter((p) => p.dec).length,
    };
    const byCode = {};
    for (const cr of COURSES()) {
      const cs = centresArr.map((c) => c.byCourse.find((b) => b.code === cr.code)).filter(Boolean);
      if (cs.length) byCode[cr.code] = { code: cr.code, centres: cs.length, req: cs.reduce((s, b) => s + b.req, 0), filled: cs.reduce((s, b) => s + b.filled, 0), backup: cs.reduce((s, b) => s + b.backup, 0), received: noms.filter((n) => n.code === cr.code).length };
    }
    m.byCode = byCode;
    // CR9 — per-course drill-down data
    for (const k of Object.keys(byCode)) {
      const o = byCode[k];
      o.rows = centresArr.map((c) => ({ c, b: c.byCourse.find((x) => x.code === k) })).filter((x) => x.b);
      o.gap = o.req - o.filled;
      o.trainers = people.filter((p) => p.status === 'Required' && p.course === k);
      o.backups = people.filter((p) => p.status === 'Backup' && p.course === k);
      o.withTR = o.trainers.filter((p) => p.tr).length; o.tot = o.trainers.filter((p) => p.totDone).length; o.totReq = o.trainers.filter((p) => p.totAsked).length; o.totWrong = o.trainers.filter((p) => p.totWrong).length;
      o.pool = people.filter((p) => p.status === 'Rejected' && p.codes.includes(k) && p.centre && !p.centre.courses[k]);
      o.shortCentres = o.rows.filter((x) => x.b.gap > 0).sort((a, b) => b.b.gap - a.b.gap || a.c.label.localeCompare(b.c.label));
      o.caafPending = o.rows.filter((x) => !x.c.caafDone).length;
    }
    // CR6 — one slot per planned batch; counted trainers fill slots (most-ready first)
    const slots = [];
    const agreed = RC.NOM.agreedStart ? RC.fmt.fromIso(RC.NOM.agreedStart) : null;
    for (const c of centresArr) { let onb = c.onboarded; for (const b of c.byCourse) {
      const tr = c.requiredPeople.filter((p) => p.course === b.code).sort((x, y) => (y.totDone - x.totDone) || (!!y.totAsked - !!x.totAsked) || (!!y.tr - !!x.tr));
      for (let i = 0; i < b.req; i++) {
        const t = tr[i] || null;
        const g = { caaf: c.caafDone, trainer: !!t, tr: !!(t && t.tr), tot: !!(t && t.totDone), insp: c.inspDone, students: onb > 0 };
        if (onb > 0) onb--;
        const shift = agreed && b.start && b.start < agreed ? agreed - b.start : 0;
        slots.push({ centre: c, code: b.code, n: i + 1, trainer: t, g, start: b.start ? new Date(+b.start + shift) : null, end: b.end ? new Date(+b.end + shift) : null, planStart: b.start });
      }
    } }
    const GATES = RC.NOM.gates.map((x) => x.id);
    const seats = RC.NOM.rules.seatsPerBatch;
    let pool = slots;
    const ladder = [{ id: 'planned', label: 'Batches planned', n: slots.length, seats: slots.length * seats, alone: slots.length }];
    for (const gt of RC.NOM.gates) {
      pool = pool.filter((s) => s.g[gt.id]);
      ladder.push({ id: gt.id, label: gt.label, short: gt.short, n: pool.length, seats: pool.length * seats, alone: slots.filter((s) => s.g[gt.id]).length });
    }
    for (const s of slots) { s.ready = GATES.every((k) => s.g[k]); s.stuckAt = GATES.find((k) => !s.g[k]) || null; }
    const stuck = {}; for (const k of GATES) stuck[k] = slots.filter((s) => s.stuckAt === k).length;
    for (const c of centresArr) {
      c.slots = slots.filter((s) => s.centre === c);
      c.band = c.filled === 0 ? 'none' : c.gap === 0 ? 'full' : 'partial';
      c.readyBatches = c.slots.filter((s) => s.ready).length;
      c.trBatches = c.slots.filter((s) => s.g.trainer && s.g.tr).length;
    }
    const bands = {};
    for (const k of ['full', 'partial', 'none']) {
      const cs = centresArr.filter((c) => c.band === k);
      bands[k] = { centres: cs, n: cs.length, batches: cs.reduce((s, c) => s + c.req, 0), staffed: cs.reduce((s, c) => s + c.filled, 0),
        noTR: cs.reduce((s, c) => s + c.requiredPeople.filter((p) => !p.tr).length, 0) };
    }
    // sequencing check: could a centre's one trainer run a second batch of the same course within the plan window?
    const planEnd = slots.reduce((m, s) => (s.end && (!m || s.end > m) ? s.end : m), null);
    const seqSlots = slots.filter((s) => !s.trainer && slots.some((o) => o.centre === s.centre && o.code === s.code && o.trainer));
    const durDays = (s) => (s.start && s.end ? Math.round((s.end - s.start) / 864e5) : null);
    const seqEnd = seqSlots.length && seqSlots[0].end && durDays(seqSlots[0]) ? new Date(+seqSlots.reduce((m, s) => (s.end > m ? s.end : m), seqSlots[0].end) + (durDays(seqSlots[0]) + 1) * 864e5) : null;
    const sequencing = { coverable: seqSlots.length, secondBatchEnds: seqEnd, planEnd, viable: !!(seqEnd && planEnd && seqEnd <= planEnd) };
    const firstStart = slots.reduce((m, s) => (s.start && (!m || s.start < m) ? s.start : m), null);
    const planFirstStart = slots.reduce((m, s) => (s.planStart && (!m || s.planStart < m) ? s.planStart : m), null);
    const milestones = (RC.NOM.milestones || []).map((x) => {
      const done = slots.filter((s) => s.g[x.gate]).length;
      const due = x.due ? RC.fmt.fromIso(x.due) : null;
      const unit = x.gate === 'caaf' || x.gate === 'insp' ? 'centres' : x.gate === 'trainer' || x.gate === 'students' ? 'batches' : 'trainers';
      const mapped = slots.filter((s) => s.g.trainer).length;
      const dc = unit === 'centres' ? centresArr.filter((c) => (x.gate === 'caaf' ? c.caafDone : c.inspDone)).length : done;
      return { ...x, dueDate: due, unit, done: dc, total: unit === 'centres' ? centresArr.length : unit === 'trainers' ? mapped : slots.length };
    });
    m.ready = slots.filter((s) => s.ready).length; m.caafDone = centresArr.filter((c) => c.caafDone).length;
    m.mobilisable = slots.filter((s) => s.g.caaf && s.g.trainer && s.g.tr).length;
    m.onboarded = slots.filter((s) => s.g.students).length;
    m.noTRcounted = people.filter((p) => p.status === 'Required' && !p.tr).length;

    const order = { error: 0, warn: 1, info: 2 }; issues.sort((a, b) => order[a.level] - order[b.level]);
    return { slots, ladder, stuck, bands, sequencing, firstStart, planFirstStart, agreedStart: agreed, milestones,
      centres: centresArr, people, noms, m, issues, by: { centre: C, person: P },
      asOf: nomDate(listF.name) || new Date(listF.lastModified.toDateString()),
      sources: { plan: planF, nominations: listF, decisions: decF, tot: totF }, totRows, totOrphans, decMap: D.people,
    };
  }

  RC.Nom = { build, matchCourse, courseOf, norm };
})(typeof window !== 'undefined' ? window : globalThis);
