/* ============================================================
   Stage 4a — VIEWS
   Input : model (RC.state.M) + validation issues + route
   Output: HTML into #view. No data processing beyond display.
   Routes: #/  #/centres  #/centre/:id  #/jobroles  #/jobrole/:code
           #/cj/:centre/:code  #/batches  #/batch/:id  #/student/:id
           #/trainers  #/attention  #/issues  #/exports  #/sources
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});
  const F = () => RC.fmt;
  const ui = (RC.ui = RC.ui || { sort: {}, filter: {}, matrix: 'enrol' });

  /* ---------- primitives ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ratio = (a, b) => (b ? a / b : null);
  const tone = {
    stage: { 'Not Started': 'mute', 'TC Created': 'pale', 'Half CAAF': 'warn', 'CAAF Complete': 'info', 'Inspection Complete': 'good' },
    batch: { Planned: 'mute', Created: 'pale', Ongoing: 'info', Completed: 'good', Cancelled: 'bad' },
    tot: { 'Not Raised': 'bad', Requested: 'warn', Scheduled: 'pale', Completed: 'good', Failed: 'bad' },
    result: { Pass: 'good', Fail: 'bad', Absent: 'warn', Pending: 'mute' },
  };
  const attTone = (p) => (p == null ? 'mute' : p >= RC.SCHEMA.rules.eligibilityAttendancePct / 100 - 1e-9 ? 'good' : p >= 0.8 ? 'warn' : 'bad');
  const pill = (t, k) => `<span class="pill t-${k || 'mute'}">${esc(t)}</span>`;
  const flag = (yes, label) => `<span class="chk ${yes ? 'on' : 'off'}" title="${esc(label || '')}">${yes ? '✓' : '·'}</span>`;
  const link = (href, text) => `<a href="${href}">${esc(text)}</a>`;
  const bar = (r, k = 'info') => `<span class="bar"><i class="t-${k}" style="width:${Math.max(0, Math.min(1, r || 0)) * 100}%"></i></span>`;
  const pct = (x) => F().pct(x);
  const num = (x) => F().num(x);

  function crumbs(list) {
    return `<nav class="crumbs">${list.map((c, i) => (i < list.length - 1 && c[1] ? `<a href="${c[1]}">${esc(c[0])}</a>` : `<span>${esc(c[0])}</span>`)).join('<b>/</b>')}</nav>`;
  }
  function head(title, sub, crumbList, right = '') {
    RC.state.viewTitle = title;
    RC.state.crumbs = crumbList.map((c) => c[0]);
    return `${crumbs(crumbList)}<header class="vhead"><div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="vh-right">${right}</div></header>`;
  }
  function kpi(label, value, sub, r, k) {
    return `<div class="kpi"><div class="k-l">${esc(label)}</div><div class="k-v">${value}</div>${r != null ? bar(r, k) : ''}<div class="k-s">${sub || ''}</div></div>`;
  }
  function section(title, body, aside = '') {
    return `<section class="card"><div class="card-h"><h2>${esc(title)}</h2>${aside}</div>${body}</section>`;
  }
  function stack(segs, total) {
    const t = total || segs.reduce((s, x) => s + x.v, 0) || 1;
    return `<div class="stack">${segs.filter((s) => s.v).map((s) => `<a class="t-${s.k}" style="flex:${s.v}" href="${s.href || '#'}" title="${esc(s.l)}: ${s.v}">${s.v / t > 0.06 ? s.v : ''}</a>`).join('')}</div>
      <div class="legend">${segs.map((s) => `<span><i class="t-${s.k}"></i>${esc(s.l)} <b>${s.v}</b></span>`).join('')}</div>`;
  }

  /* Sortable table. cols: {k, l, v(row)->sortable, h(row)->html, cls, num} */
  function table(id, cols, rows, opt = {}) {
    const st = ui.sort[id] || opt.sort || null;
    let data = rows.slice();
    if (st) {
      const c = cols.find((c) => c.k === st.k);
      if (c) data.sort((a, b) => { const x = c.v(a), y = c.v(b); const r = x == null ? 1 : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0; return st.d * r; });
    }
    const limit = opt.limit && !ui.filter[id + ':all'] ? opt.limit : Infinity;
    const shown = data.slice(0, limit);
    if (RC.TableExport) RC.TableExport.register(id, cols, data);
    const th = cols.map((c) => `<th class="${c.num ? 'n' : ''} ${c.cls || ''}" data-sort="${id}:${c.k}">${esc(c.l)}${st && st.k === c.k ? (st.d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
    const tb = shown.length ? shown.map((r) => `<tr${opt.href && opt.href(r) ? ` data-href="${opt.href(r)}"` : ''}>${cols.map((c) => `<td class="${c.num ? 'n' : ''} ${c.cls || ''}">${c.h ? c.h(r) : esc(c.v(r))}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">${opt.empty || 'Nothing to show'}</td></tr>`;
    const more = data.length > shown.length ? `<button class="linkbtn" data-showall="${id}">Show all ${data.length}</button>` : '';
    return `<div class="tw"><table class="tbl" data-xl="${esc(id)}">${opt.caption ? `<caption>${opt.caption}</caption>` : ''}<thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>${more}`;
  }

  function caafSteps(c) {
    return `<ol class="steps">${c.caaf.steps.map((s) => `<li class="${s.done ? 'done' : ''}"><i></i><span>${esc(s.label)}</span><em>${s.done ? (s.date ? F().date(s.date) : 'Done') : 'Pending'}</em></li>`).join('')}
      <li class="${c.caaf.result === 'Pass' ? 'done' : c.caaf.result === 'Fail' ? 'fail' : ''}"><i></i><span>Inspection result</span><em>${esc(c.caaf.result)}</em></li></ol>`;
  }
  const stageDots = (c) => `<span class="dots" title="${esc(c.caaf.stage)}">${c.caaf.steps.map((s) => `<i class="${s.done ? 'on' : ''}"></i>`).join('')}<i class="${c.caaf.result === 'Pass' ? 'on' : c.caaf.result === 'Fail' ? 'x' : ''}"></i></span>`;

  function rollupKpis(m, opts = {}) {
    const S = RC.SCHEMA;
    return `<div class="kpis">
      ${opts.noCentres ? '' : kpi('Centres ready', `${m.centresReady}<small>/${m.centres}</small>`, `${m.caafStage['Inspection Complete']} inspected${m.inspectionFail ? `, <b class="c-bad">${m.inspectionFail} failed</b>` : ''}`, ratio(m.centresReady, m.centres), 'good')}
      ${kpi('Trainers TOT done', `${m.trainersTOT}<small>/${Math.max(m.trainers, m.plannedBatches)}</small>`, `${m.trainers} onboarded · ${m.plannedBatches} needed · ${m.trainersDocs} docs complete`, ratio(m.trainersTOT, Math.max(m.trainers, m.plannedBatches)), 'info')}
      ${kpi('Batches started', `${m.batchStatus.Ongoing + m.batchStatus.Completed}<small>/${m.plannedBatches}</small>`, `${m.batchStatus.Ongoing} ongoing · ${m.batchStatus.Completed} completed`, ratio(m.batchStatus.Ongoing + m.batchStatus.Completed, m.plannedBatches), 'info')}
      ${kpi('Enrolled', `${num(m.enrolled)}<small>/${num(m.target)}</small>`, `${num(m.active)} active · ${num(m.dropped)} dropped`, ratio(m.enrolled, m.target), 'info')}
      ${kpi('Attendance', pct(m.attendance), `${num(m.atRisk)} at risk (&lt;${S.rules.eligibilityAttendancePct}%) in ongoing batches`, m.attendance, attTone(m.attendance))}
      ${kpi('Certified', `${num(m.certified)}<small>/${num(m.target)}</small>`, `${num(m.eligible)} eligible · ${num(m.assessed)} assessed · ${num(m.passed)} passed`, ratio(m.certified, m.target), 'good')}
    </div>`;
  }

  function pipeline(m) {
    const st = [
      ['Centres ready', m.centresReady, m.centres, '#/centres'],
      ['Trainers TOT done', m.trainersTOT, Math.max(m.trainers, m.plannedBatches), '#/trainers'],
      ['Batches started', m.batchStatus.Ongoing + m.batchStatus.Completed, m.plannedBatches, '#/batches'],
      ['Students enrolled', m.enrolled, m.target, '#/batches'],
      ['Assessment eligible', m.eligible, m.target, '#/batches?status=Completed'],
      ['Certified', m.certified, m.target, '#/batches?status=Completed'],
    ];
    return `<div class="pipe">${st.map(([l, v, t, h], i) => `<a class="pipe-s" href="${h}"><span class="ps-n">${i + 1}</span><span class="ps-l">${l}</span><span class="ps-v">${num(v)}<small> / ${num(t)}</small></span>${bar(ratio(v, t), i === 5 ? 'good' : 'info')}<span class="ps-p">${pct(ratio(v, t))}</span></a>`).join('')}</div>`;
  }

  function flagList(list, limit = 10) {
    if (!list.length) return `<p class="empty">No open items.</p>`;
    const kinds = {}; list.forEach((f) => (kinds[f.kind] = (kinds[f.kind] || 0) + 1));
    return `<div class="fkinds">${Object.entries(kinds).map(([k, n]) => `<span>${esc(k)} <b>${n}</b></span>`).join('')}</div>
      <ul class="flags">${list.slice(0, limit).map((f) => `<li class="sev-${f.sev}"><a href="${f.link}"><span class="fk">${esc(f.kind)}</span>${esc(f.text)}</a></li>`).join('')}</ul>
      ${list.length > limit ? `<a class="more" href="#/attention">All ${list.length} items →</a>` : ''}`;
  }

  /* ---------- views ---------- */
  const V = {};

  V.overview = () => {
    const M = RC.state.M, m = M.m, S = RC.SCHEMA;
    const stageSegs = S.caafStages.map((s) => ({ l: s, v: m.caafStage[s], k: tone.stage[s], href: `#/centres?stage=${encodeURIComponent(s)}` }));
    const batchSegs = S.enums.BatchStatus.map((s) => ({ l: s, v: m.batchStatus[s] || 0, k: tone.batch[s], href: `#/batches?status=${s}` }));
    const right = `<div class="asof"><span>Data as of</span><b>${F().date(M.asOf)}</b></div>`;
    return head(RC.brand().name + ' · Short Term Training', `${m.centres} centres · ${RC.state.M.jobRoles.length} job roles · ${num(m.target)} seats · ${m.plannedBatches} batches planned`, [['Overview']], right) +
      section('Lifecycle progress', pipeline(m)) +
      `<div class="grid2">` +
      section('Centre onboarding (CAAF)', stack(stageSegs, m.centres) + (m.inspectionFail ? `<p class="note c-bad">${m.inspectionFail} centre(s) failed NSDC inspection</p>` : ''), link('#/centres', 'Centres →')) +
      section('Batches', stack(batchSegs, m.batches) + `<p class="note">CCTV verified on ${m.cctvOk} of ${m.cctvLive} ongoing batches</p>`, link('#/batches', 'Batches →')) +
      `</div>` +
      section('Centre × job role', matrix(M), `<div class="seg">${[['enrol', 'Enrolment'], ['att', 'Attendance'], ['cert', 'Certified'], ['batch', 'Batches']].map(([k, l]) => `<button data-matrix="${k}" class="${ui.matrix === k ? 'on' : ''}">${l}</button>`).join('')}</div>`) +
      section('Needs attention', flagList(M.flags, 12), link('#/attention', 'All →'));
  };

  function matrix(M) {
    const jrs = M.jobRoles; const mode = ui.matrix;
    const cell = (cj) => {
      if (!cj) return `<td class="mx-na"></td>`;
      const m = cj.m; let txt, r, k;
      if (mode === 'enrol') { r = ratio(m.enrolled, m.target); txt = `${m.enrolled}/${m.target}`; k = 'seq'; }
      if (mode === 'cert') { r = ratio(m.certified, m.target); txt = `${m.certified}/${m.target}`; k = 'seq'; }
      if (mode === 'batch') { const s = m.batchStatus.Ongoing + m.batchStatus.Completed; r = ratio(s, m.plannedBatches); txt = `${s}/${m.plannedBatches}`; k = 'seq'; }
      if (mode === 'att') { r = m.attendance; txt = pct(m.attendance); k = attTone(m.attendance); }
      const lvl = r == null ? 0 : Math.min(5, Math.ceil(r * 5));
      return `<td class="mx ${k === 'seq' ? 'q' + lvl : 't-' + k + 'l'}"><a href="#/cj/${cj.centre.id}/${cj.jobRole.id}">${txt}</a></td>`;
    };
    const rows = M.centres.map((c) => `<tr><th><a href="#/centre/${c.id}">${esc(c.name.replace(/^GTTC /, ''))}</a> ${stageDots(c)}</th>${jrs.map((j) => cell(M.by.cj.get(c.id + '|' + j.id))).join('')}<td class="mx tot">${mode === 'att' ? pct(c.m.attendance) : mode === 'batch' ? `${c.m.batchStatus.Ongoing + c.m.batchStatus.Completed}/${c.m.plannedBatches}` : mode === 'cert' ? `${c.m.certified}/${c.m.target}` : `${c.m.enrolled}/${c.m.target}`}</td></tr>`).join('');
    return `<div class="tw"><table class="mxt"><thead><tr><th>Centre</th>${jrs.map((j) => `<th><a href="#/jobrole/${j.id}" title="${esc(j.name)}">${esc(j.short)}</a></th>`).join('')}<th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  V.centres = (q) => {
    const M = RC.state.M; let list = M.centres;
    if (q.stage) list = list.filter((c) => c.caaf.stage === q.stage);
    const fl = new Map(); M.flags.forEach((f) => f.centre && fl.set(f.centre.id, (fl.get(f.centre.id) || 0) + (f.sev === 'high' ? 1 : 0)));
    const cols = [
      { k: 'id', l: 'ID', v: (c) => c.id },
      { k: 'name', l: 'Centre', v: (c) => c.name, h: (c) => `<b>${esc(c.name)}</b><div class="dim">${esc(c.District || '')}${c.TCID ? ' · ' + esc(c.TCID) : ''}</div>` },
      { k: 'stage', l: 'CAAF', v: (c) => c.caaf.stageIdx + (c.caaf.ready ? 1 : 0), h: (c) => `${stageDots(c)} ${pill(c.caaf.result === 'Fail' ? 'Inspection failed' : c.caaf.stage, c.caaf.result === 'Fail' ? 'bad' : tone.stage[c.caaf.stage])}` },
      { k: 'tgt', l: 'Target', num: 1, v: (c) => c.m.target, h: (c) => num(c.m.target) },
      { k: 'b', l: 'Batches', num: 1, v: (c) => c.m.batchStatus.Ongoing + c.m.batchStatus.Completed, h: (c) => `${c.m.batchStatus.Ongoing + c.m.batchStatus.Completed}/${c.m.plannedBatches}` },
      { k: 'tot', l: 'TOT', num: 1, v: (c) => ratio(c.m.trainersTOT, c.m.plannedBatches), h: (c) => `${c.m.trainersTOT}/${c.m.plannedBatches}` },
      { k: 'en', l: 'Enrolled', num: 1, v: (c) => c.m.enrolled, h: (c) => `${num(c.m.enrolled)} ${bar(ratio(c.m.enrolled, c.m.target))}` },
      { k: 'att', l: 'Attendance', num: 1, v: (c) => c.m.attendance, h: (c) => c.m.attendance == null ? '–' : pill(pct(c.m.attendance), attTone(c.m.attendance)) },
      { k: 'cert', l: 'Certified', num: 1, v: (c) => c.m.certified, h: (c) => num(c.m.certified) },
      { k: 'fl', l: 'Alerts', num: 1, v: (c) => fl.get(c.id) || 0, h: (c) => (fl.get(c.id) ? `<span class="c-bad">${fl.get(c.id)}</span>` : '') },
    ];
    const chips = `<div class="chips"><a class="${!q.stage ? 'on' : ''}" href="#/centres">All ${M.centres.length}</a>${RC.SCHEMA.caafStages.map((s) => `<a class="${q.stage === s ? 'on' : ''}" href="#/centres?stage=${encodeURIComponent(s)}">${esc(s)} ${M.m.caafStage[s]}</a>`).join('')}</div>`;
    return head('Centres', `${list.length} of ${M.centres.length} centres${q.stage ? ' at stage “' + esc(q.stage) + '”' : ''}`, [['Overview', '#/'], ['Centres']]) +
      section('', chips + table('centres', cols, list, { href: (c) => `#/centre/${c.id}` }));
  };

  V.centre = (q, id) => {
    const M = RC.state.M; const c = M.by.centre.get(id);
    if (!c) return notFound('Centre ' + id);
    const info = `<dl class="info">
      <div><dt>Centre ID</dt><dd>${esc(c.id)}</dd></div><div><dt>TC ID</dt><dd>${esc(c.TCID || 'Not created')}</dd></div>
      <div><dt>District</dt><dd>${esc(c.District || '')}${c.State ? ', ' + esc(c.State) : ''}</dd></div>
      <div><dt>SPOC</dt><dd>${esc(c.SPOCName || '—')}${c.SPOCMobile ? ` · <a href="tel:${esc(c.SPOCMobile)}">${esc(c.SPOCMobile)}</a>` : ''}${c.SPOCEmail ? `<br><a href="mailto:${esc(c.SPOCEmail)}">${esc(c.SPOCEmail)}</a>` : ''}</dd></div>
      <div class="wide"><dt>Address</dt><dd>${esc(c.Address || '')}</dd></div></dl>`;
    const flags = M.flags.filter((f) => f.centre === c);
    return head(c.name, `${esc(c.District || '')} · ${c.cjs.length} job role(s) · ${pill(c.caaf.result === 'Fail' ? 'Inspection failed' : c.caaf.stage, c.caaf.result === 'Fail' ? 'bad' : tone.stage[c.caaf.stage])}`, [['Overview', '#/'], ['Centres', '#/centres'], [c.name]]) +
      `<div class="grid2">${section('Centre details', info)}${section('CAAF onboarding', caafSteps(c) + (c.caaf.remarks ? `<p class="note">${esc(c.caaf.remarks)}</p>` : ''))}</div>` +
      rollupKpis(c.m, { noCentres: true }) +
      section('Job roles', cjTable('c-cj-' + id, c.cjs, false)) +
      section('Batches', batchTable('c-b-' + id, c.batches, { noCentre: true })) +
      section('Trainers', trainerTable('c-t-' + id, c.trainers, { noCentre: true })) +
      section('Needs attention', flagList(flags, 50));
  };

  function cjTable(id, cjs, showCentre) {
    const cols = [
      showCentre ? { k: 'c', l: 'Centre', v: (x) => x.centre.name, h: (x) => `<b>${esc(x.centre.name)}</b> ${stageDots(x.centre)}` } : { k: 'j', l: 'Job role', v: (x) => x.jobRole.name, h: (x) => `<b>${esc(x.jobRole.name)}</b>` },
      { k: 'ps', l: 'Planned window', v: (x) => x.plan.PlannedStart, h: (x) => `${F().date(x.plan.PlannedStart)} → ${F().date(x.plan.PlannedEnd)}` },
      { k: 't', l: 'Target', num: 1, v: (x) => x.m.target },
      { k: 'b', l: 'Batches', num: 1, v: (x) => x.m.batchStatus.Ongoing + x.m.batchStatus.Completed, h: (x) => `${x.m.batchStatus.Ongoing + x.m.batchStatus.Completed}/${x.m.plannedBatches}` },
      { k: 'tr', l: 'TOT done', num: 1, v: (x) => x.m.trainersTOT, h: (x) => `${x.m.trainersTOT}/${x.m.trainers}` },
      { k: 'e', l: 'Enrolled', num: 1, v: (x) => x.m.enrolled, h: (x) => `${num(x.m.enrolled)} ${bar(ratio(x.m.enrolled, x.m.target))}` },
      { k: 'a', l: 'Attendance', num: 1, v: (x) => x.m.attendance, h: (x) => x.m.attendance == null ? '–' : pill(pct(x.m.attendance), attTone(x.m.attendance)) },
      { k: 'r', l: 'At risk', num: 1, v: (x) => x.m.atRisk, h: (x) => (x.m.atRisk ? `<span class="c-warn">${x.m.atRisk}</span>` : '0') },
      { k: 'ce', l: 'Certified', num: 1, v: (x) => x.m.certified },
    ];
    return table(id, cols, cjs, { href: (x) => `#/cj/${x.centre.id}/${x.jobRole.id}` });
  }

  function batchTable(id, batches, o = {}) {
    const cols = [
      { k: 'id', l: 'Batch', cls: 'nw', v: (b) => b.id, h: (b) => `<b>${esc(b.id)}</b>${b.SIDHBatchID ? `<div class="dim">${esc(b.SIDHBatchID)}</div>` : ''}` },
      o.noCentre ? null : { k: 'c', l: 'Centre', v: (b) => b.centre.name },
      o.noJr ? null : { k: 'j', l: 'Job role', v: (b) => b.jobRole.short },
      { k: 's', l: 'Status', v: (b) => b.BatchStatus, h: (b) => pill(b.BatchStatus, tone.batch[b.BatchStatus]) },
      { k: 'd', l: 'Dates', v: (b) => b.StartDate, h: (b) => `${F().short(b.StartDate)} → ${F().date(b.EndDate)}` },
      { k: 'tr', l: 'Trainer', v: (b) => (b.trainer ? b.trainer.name : ''), h: (b) => (b.trainer ? `${esc(b.trainer.name)} ${b.trainer.totDone ? '' : pill('TOT ' + b.trainer.TOTStatus, tone.tot[b.trainer.TOTStatus])}` : '<span class="c-bad">None</span>') + (b.backup ? `<div class="dim">Backup: ${esc(b.backup.name)}</div>` : '') },
      { k: 'cc', l: 'CCTV', v: (b) => b.CCTVVerified, h: (b) => flag(b.CCTVVerified === 'Y', 'CCTV verified') },
      { k: 'e', l: 'Students', num: 1, v: (b) => b.m.enrolled, h: (b) => (b.file ? `${b.m.active}${b.m.dropped ? `<span class="dim">+${b.m.dropped}</span>` : ''}` : (b.live ? '<span class="c-warn">no file</span>' : '–')) },
      { k: 'a', l: 'Attendance', num: 1, v: (b) => b.m.attendance, h: (b) => b.m.attendance == null ? '–' : pill(pct(b.m.attendance), attTone(b.m.attendance)) },
      { k: 'r', l: 'At risk', num: 1, v: (b) => b.m.atRisk, h: (b) => (b.m.atRisk ? `<span class="c-warn">${b.m.atRisk}</span>` : '') },
      { k: 'ce', l: 'Certified', num: 1, v: (b) => b.m.certified, h: (b) => (b.BatchStatus === 'Completed' ? `${b.m.certified}/${b.m.eligible}` : '') },
    ].filter(Boolean);
    return table(id, cols, batches, { href: (b) => `#/batch/${b.id}`, empty: 'No batches' });
  }

  function trainerTable(id, trs, o = {}) {
    const cols = [
      { k: 'id', l: 'Trainer', v: (t) => t.name, h: (t) => `<b>${esc(t.name)}</b><div class="dim">${esc(t.id)}${t.SIDHTrainerID ? ' · ' + esc(t.SIDHTrainerID) : ''}</div>` },
      o.noCentre ? null : { k: 'c', l: 'Centre', v: (t) => (t.centre ? t.centre.name : ''), h: (t) => (t.centre ? link('#/centre/' + t.centre.id, t.centre.name) : '') },
      { k: 'j', l: 'Job role', v: (t) => (t.jobRole ? t.jobRole.short : '') },
      { k: 'idt', l: 'ID', v: (t) => t.IDType || '' },
      { k: 'docs', l: 'Edu · Exp · Aadhaar · OTP', v: (t) => t.docsDone, h: (t) => ['EduCertUploaded', 'ExpCertUploaded', 'AadhaarVerified', 'OTPVerified'].map((f) => flag(t[f] === 'Y', f)).join('') },
      { k: 'tot', l: 'TOT', v: (t) => t.TOTStatus, h: (t) => pill(t.TOTStatus || '—', tone.tot[t.TOTStatus]) + (t.TOTCompletedDate ? `<div class="dim">${F().date(t.TOTCompletedDate)}</div>` : '') },
      { k: 'b', l: 'Batch', v: (t) => (t.batches[0] ? t.batches[0].id : ''), h: (t) => [...t.batches.map((b) => link('#/batch/' + b.id, b.id)), ...t.backupOf.map((b) => `<span class="dim">backup </span>${link('#/batch/' + b.id, b.id)}`)].join('<br>') || '<span class="dim">Unassigned</span>' },
    ].filter(Boolean);
    return table(id, cols, trs, { empty: 'No trainers recorded yet' });
  }

  V.jobroles = () => {
    const M = RC.state.M;
    const cards = M.jobRoles.map((j) => `<a class="jr" href="#/jobrole/${j.id}"><span class="code">${esc(j.id)}</span><h3>${esc(j.name)}</h3>
      <div class="jr-m"><span><b>${j.cjs.length}</b> centres</span><span><b>${num(j.m.target)}</b> seats</span><span><b>${j.m.plannedBatches}</b> batches</span></div>
      <div class="jr-r"><label>Enrolled ${num(j.m.enrolled)}</label>${bar(ratio(j.m.enrolled, j.m.target))}<label>Certified ${num(j.m.certified)}</label>${bar(ratio(j.m.certified, j.m.target), 'good')}</div>
      <div class="dim">Attendance ${pct(j.m.attendance)}${j.QPCode ? ' · QP ' + esc(j.QPCode) : ' · QP code not set'}</div></a>`).join('');
    return head('Job roles', `${M.jobRoles.length} job roles across ${M.centres.length} centres`, [['Overview', '#/'], ['Job roles']]) + `<div class="jrs">${cards}</div>`;
  };

  V.jobrole = (q, code) => {
    const M = RC.state.M; const j = M.by.jr.get(code);
    if (!j) return notFound('Job role ' + code);
    return head(j.name, `${esc(j.id)}${j.QPCode ? ' · QP ' + esc(j.QPCode) : ''} · offered at ${j.cjs.length} centres`, [['Overview', '#/'], ['Job roles', '#/jobroles'], [j.short]]) +
      rollupKpis(j.m) + section('Centres offering this job role', cjTable('jr-' + code, j.cjs, true)) +
      section('Needs attention', flagList(M.flags.filter((f) => f.batch && f.batch.jobRole === j), 30));
  };

  V.cj = (q, cid, code) => {
    const M = RC.state.M; const x = M.by.cj.get(cid + '|' + code);
    if (!x) return notFound(`${cid} × ${code}`);
    return head(`${x.centre.name} · ${x.jobRole.short}`, `${esc(x.jobRole.name)} · target ${x.plan.TargetSeats} seats in ${x.plan.PlannedBatches} batches · planned ${F().date(x.plan.PlannedStart)} → ${F().date(x.plan.PlannedEnd)}${x.unplanned ? ' · <b class="c-warn">not in plan</b>' : ''}`,
      [['Overview', '#/'], [x.centre.name, '#/centre/' + cid], [x.jobRole.short]]) +
      rollupKpis(x.m, { noCentres: true }) + section('Batches', batchTable('cj-b', x.batches, { noCentre: true, noJr: true })) + section('Trainers', trainerTable('cj-t', x.trainers, { noCentre: true }));
  };

  V.batches = (q) => {
    const M = RC.state.M; let list = M.batches;
    if (q.status) list = list.filter((b) => b.BatchStatus === q.status);
    const chips = `<div class="chips"><a class="${!q.status ? 'on' : ''}" href="#/batches">All ${M.batches.length}</a>${RC.SCHEMA.enums.BatchStatus.map((s) => `<a class="${q.status === s ? 'on' : ''}" href="#/batches?status=${s}">${s} ${M.m.batchStatus[s] || 0}</a>`).join('')}</div>`;
    return head('Batches', `${list.length} batches${q.status ? ' · ' + esc(q.status) : ''}`, [['Overview', '#/'], ['Batches']]) + section('', chips + batchTable('batches', list, {}));
  };

  V.batch = (q, id) => {
    const M = RC.state.M; const b = M.by.batch.get(id);
    if (!b) return notFound('Batch ' + id);
    const S = RC.SCHEMA, m = b.m;
    const total = b.StartDate && b.EndDate ? Math.round((b.EndDate - b.StartDate) / 864e5) + 1 : null;
    const done = b.StartDate ? Math.max(0, Math.min(total, Math.round((M.asOf - b.StartDate) / 864e5) + 1)) : 0;
    const info = `<dl class="info">
      <div><dt>Status</dt><dd>${pill(b.BatchStatus, tone.batch[b.BatchStatus])}</dd></div>
      <div><dt>SIDH Batch ID</dt><dd>${esc(b.SIDHBatchID || 'Not created')}</dd></div>
      <div><dt>Dates</dt><dd>${F().date(b.StartDate)} → ${F().date(b.EndDate)}</dd></div>
      <div><dt>Progress</dt><dd>${total ? `Day ${done} of ${total} ${bar(done / total)}` : '–'}</dd></div>
      <div><dt>Primary trainer</dt><dd>${b.trainer ? `${esc(b.trainer.name)} ${pill('TOT ' + b.trainer.TOTStatus, tone.tot[b.trainer.TOTStatus])}` : '<span class="c-bad">Not assigned</span>'}</dd></div>
      <div><dt>Backup trainer</dt><dd>${b.backup ? esc(b.backup.name) : '—'}</dd></div>
      <div><dt>CCTV</dt><dd>${b.CCTVVerified === 'Y' ? `Verified${b.CCTVVerifiedDate ? ' ' + F().date(b.CCTVVerifiedDate) : ''}` : '<span class="c-bad">Not verified</span>'}</dd></div>
      <div><dt>Source</dt><dd>${b.file ? esc(b.file.name) : '<span class="c-warn">No batch file</span>'}</dd></div></dl>`;
    const kp = `<div class="kpis">${kpi('Students', `${m.active}`, `${m.enrolled} enrolled · ${m.dropped} dropped`, ratio(m.active, S.rules.batchMaxStudents), 'info')}
      ${kpi('Sessions held', m.sessions, b.dates.length ? `last ${F().date(b.dates[b.dates.length - 1])}` : '')}
      ${kpi('Attendance', pct(m.attendance), `threshold ${S.rules.eligibilityAttendancePct}%`, m.attendance, attTone(m.attendance))}
      ${b.BatchStatus === 'Completed' ? kpi('Eligible', m.eligible, `${m.assessed} assessed · ${m.passed} passed`, ratio(m.eligible, m.active), 'info') : kpi('At risk', m.atRisk, `${m.onTrack} on track`, ratio(m.atRisk, m.active), m.atRisk ? 'warn' : 'good')}
      ${kpi('Certified', m.certified, b.BatchStatus === 'Completed' ? `of ${m.eligible} eligible` : 'after assessment', ratio(m.certified, m.active), 'good')}</div>`;
    const cols = [
      { k: 'n', l: 'Student', v: (s) => s.name, h: (s) => `<b>${esc(s.name)}</b><div class="dim">${esc(s.id)}</div>` },
      { k: 'g', l: 'Gender', v: (s) => s.Gender || '' },
      { k: 'st', l: 'Status', v: (s) => s.StudentStatus, h: (s) => (s.dropped ? pill('Dropped', 'bad') : pill('Active', 'good')) },
      { k: 'p', l: 'Present', num: 1, v: (s) => s.present, h: (s) => `${s.present}/${s.marked}` },
      { k: 'pc', l: 'Attendance', num: 1, v: (s) => s.pct, h: (s) => s.pct == null ? '–' : pill(pct(s.pct), attTone(s.pct)) },
      { k: 'el', l: 'Eligibility', v: (s) => (s.eligible ? 2 : s.atRisk ? 0 : 1), h: (s) => s.dropped ? '' : b.BatchStatus === 'Completed' ? (s.eligible ? pill('Eligible', 'good') : pill('Not eligible', 'bad')) : s.atRisk ? pill('At risk', 'warn') : s.pct != null ? pill('On track', 'good') : '' },
      { k: 'as', l: 'Assessment', v: (s) => s.attempts.length, h: (s) => s.attempts.map((a) => pill(`#${a.Attempt} ${a.Result || 'Scheduled'}`, tone.result[a.Result] || 'mute')).join(' ') },
      { k: 'ce', l: 'Certified', v: (s) => (s.certified ? 1 : 0), h: (s) => (s.certified ? F().date(s.certDate) : '') },
    ];
    return head(b.id, `${link('#/centre/' + b.centre.id, b.centre.name)} · ${link(`#/cj/${b.centre.id}/${b.jobRole.id}`, b.jobRole.name)}`, [['Overview', '#/'], [b.centre.name, '#/centre/' + b.centre.id], [b.jobRole.short, `#/cj/${b.centre.id}/${b.jobRole.id}`], [b.id]]) +
      section('Batch details', info) + kp +
      section('Students', table('b-s-' + id, cols, b.students, { href: (s) => `#/student/${encodeURIComponent(s.id)}`, empty: b.file ? 'No students in file' : 'Batch file not loaded' })) +
      (b.dates.length ? section('Attendance register', attGrid(b), `<span class="dim key"><i class="t-good"></i>present <i class="t-bad"></i>absent <i></i>not marked</span>`) : '') +
      section('Needs attention', flagList(M.flags.filter((f) => f.batch === b), 20));
  };

  function attGrid(b) {
    const ds = b.dates; let lastM = -1;
    const hdr = ds.map((d) => { const nm = d.getMonth() !== lastM; lastM = d.getMonth(); return `<th class="${nm ? 'nm' : ''}" title="${F().date(d)}">${nm ? F().short(d).split(' ')[1] + '<br>' : '<br>'}${d.getDate()}</th>`; }).join('');
    const rows = b.students.map((s) => {
      const mk = new Map(s.marks.map((m) => [m.date.getTime(), m.v]));
      return `<tr><th><a href="#/student/${encodeURIComponent(s.id)}">${esc(s.name)}</a></th>${ds.map((d) => { const v = mk.get(d.getTime()); return `<td class="${v === 'P' ? 'ap' : v === 'A' ? 'aa' : ''}" title="${F().date(d)}: ${v || '—'}"></td>`; }).join('')}<td class="n">${pct(s.pct)}</td></tr>`;
    }).join('');
    const daily = ds.map((d) => { const t = d.getTime(); let p = 0, k = 0; b.students.forEach((s) => s.marks.forEach((m) => { if (m.date.getTime() === t) { k++; if (m.v === 'P') p++; } })); return k ? p / k : null; });
    const drow = `<tr class="daily"><th>Daily %</th>${daily.map((r) => `<td class="dq ${r == null ? '' : 't-' + attTone(r)}" title="${pct(r)}"></td>`).join('')}<td></td></tr>`;
    return `<div class="tw"><table class="ag"><thead><tr><th></th>${hdr}<th>%</th></tr></thead><tbody>${rows}${drow}</tbody></table></div>`;
  }

  V.student = (q, id) => {
    const M = RC.state.M; const s = M.by.student.get(decodeURIComponent(id));
    if (!s) return notFound('Student ' + id);
    const b = s.batch, S = RC.SCHEMA;
    const info = `<dl class="info">
      <div><dt>Student ID</dt><dd>${esc(s.id)}</dd></div><div><dt>SIDH Candidate ID</dt><dd>${esc(s.SIDHCandidateID || '—')}</dd></div>
      <div><dt>Gender</dt><dd>${esc(s.Gender || '—')}</dd></div><div><dt>Mobile</dt><dd>${esc(s.Mobile || '—')}</dd></div>
      <div><dt>Enrolled</dt><dd>${F().date(s.EnrolledDate) || '—'}</dd></div><div><dt>Joined batch</dt><dd>${F().date(s.JoinedDate) || '—'}</dd></div>
      <div><dt>Status</dt><dd>${s.dropped ? pill('Dropped', 'bad') : pill('Active', 'good')}</dd></div><div><dt>Remarks</dt><dd>${esc(s.Remarks || '—')}</dd></div></dl>`;
    const verdict = s.dropped ? 'Dropped from batch' : b.BatchStatus === 'Completed' ? (s.eligible ? 'Eligible for assessment' : `Not eligible (needs ${S.rules.eligibilityAttendancePct}%)`) : s.pct == null ? 'No attendance yet' : s.atRisk ? `At risk — below ${S.rules.eligibilityAttendancePct}%` : 'On track for eligibility';
    const need = s.marked && !s.meets ? Math.ceil((S.rules.eligibilityAttendancePct / 100 * s.marked - s.present) / (1 - S.rules.eligibilityAttendancePct / 100)) : 0;
    const kp = `<div class="kpis">${kpi('Attendance', pct(s.pct), `${s.present} present of ${s.marked} sessions`, s.pct, attTone(s.pct))}
      ${kpi('Eligibility', `<span class="kv-t">${esc(verdict)}</span>`, need > 0 && b.BatchStatus === 'Ongoing' ? `needs ${need} more consecutive present day(s) to reach ${S.rules.eligibilityAttendancePct}%` : '')}
      ${kpi('Assessment', s.attempts.length ? esc(s.attempts[s.attempts.length - 1].Result || 'Scheduled') : '—', `${s.attempts.length} attempt(s)`)}
      ${kpi('Certified', s.certified ? 'Yes' : 'No', s.certified ? F().date(s.certDate) : '')}</div>`;
    const att = `<table class="tbl"><thead><tr><th>#</th><th>Date</th><th>Result</th><th class="n">Score</th><th>Certified</th><th>Remarks</th></tr></thead><tbody>${s.attempts.map((a) => `<tr><td>${a.Attempt}</td><td>${F().date(a.AssessmentDate)}</td><td>${pill(a.Result || 'Scheduled', tone.result[a.Result])}</td><td class="n">${a.Score ?? ''}</td><td>${F().date(a.CertifiedDate)}</td><td>${esc(a.Remarks || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No assessment attempts</td></tr>'}</tbody></table>`;
    return head(s.name, `${link('#/batch/' + b.id, b.id)} · ${esc(b.jobRole.short)} · ${link('#/centre/' + s.centre.id, s.centre.name)}`, [['Overview', '#/'], [s.centre.name, '#/centre/' + s.centre.id], [b.id, '#/batch/' + b.id], [s.name]]) +
      kp + `<div class="grid2">${section('Profile', info)}${section('Assessment attempts', att)}</div>` + section('Daily attendance', calendar(s), `<span class="dim key"><i class="t-good"></i>present <i class="t-bad"></i>absent <i></i>no session</span>`);
  };

  function calendar(s) {
    const b = s.batch; const start = b.StartDate, end = b.EndDate; if (!start || !end) return '';
    const mk = new Map(s.marks.map((m) => [m.date.getTime(), m.v])); const asOf = RC.state.M.asOf;
    const out = []; let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      const y = cur.getFullYear(), mo = cur.getMonth(); const days = new Date(y, mo + 1, 0).getDate();
      const lead = (new Date(y, mo, 1).getDay() + 6) % 7; let cells = '<i class="pad"></i>'.repeat(lead); let p = 0, a = 0;
      for (let d = 1; d <= days; d++) {
        const dt = new Date(y, mo, d); const v = mk.get(dt.getTime()); const inWin = dt >= start && dt <= end;
        if (v === 'P') p++; if (v === 'A') a++;
        cells += `<i class="${v === 'P' ? 'ap' : v === 'A' ? 'aa' : inWin ? (dt > asOf ? 'fut' : 'ns') : 'out'}" title="${F().date(dt)}${v ? ': ' + v : ''}">${d}</i>`;
      }
      out.push(`<div class="cal"><h4>${F().date(new Date(y, mo, 1)).slice(3)}<span>${p} P · ${a} A</span></h4><div class="cal-g"><b>M</b><b>T</b><b>W</b><b>T</b><b>F</b><b>S</b><b>S</b>${cells}</div></div>`);
      cur = new Date(y, mo + 1, 1);
    }
    return `<div class="cals">${out.join('')}</div>`;
  }

  V.trainers = (q) => {
    const M = RC.state.M; let list = M.trainers;
    if (q.tot) list = list.filter((t) => t.TOTStatus === q.tot);
    const counts = {}; M.trainers.forEach((t) => (counts[t.TOTStatus] = (counts[t.TOTStatus] || 0) + 1));
    const chips = `<div class="chips"><a class="${!q.tot ? 'on' : ''}" href="#/trainers">All ${M.trainers.length}</a>${RC.SCHEMA.enums.TOTStatus.map((s) => `<a class="${q.tot === s ? 'on' : ''}" href="#/trainers?tot=${encodeURIComponent(s)}">${s} ${counts[s] || 0}</a>`).join('')}</div>`;
    return head('Trainers', `${M.trainers.length} trainers onboarded · ${M.m.plannedBatches} needed (one per planned batch)`, [['Overview', '#/'], ['Trainers']]) + section('', chips + trainerTable('trainers', list));
  };

  V.attention = () => {
    const M = RC.state.M;
    return head('Needs attention', `${M.flags.length} open items as of ${F().date(M.asOf)}`, [['Overview', '#/'], ['Needs attention']]) + section('', flagList(M.flags, 1000));
  };

  V.issues = () => {
    const st = RC.state; const iss = st.v.issues.concat(st.catalog.errors.map((e) => ({ level: 'error', file: e.path, msg: e.msg })));
    const n = (l) => iss.filter((i) => i.level === l).length;
    const cols = [
      { k: 'l', l: 'Level', v: (i) => ({ error: 0, warn: 1, info: 2 }[i.level]), h: (i) => pill(i.level, i.level === 'error' ? 'bad' : i.level === 'warn' ? 'warn' : 'mute') },
      { k: 'f', l: 'File', v: (i) => i.file || '' }, { k: 's', l: 'Sheet', v: (i) => i.sheet || '' },
      { k: 'r', l: 'Row', num: 1, v: (i) => i.row || '' }, { k: 'c', l: 'Column', v: (i) => i.field || '' }, { k: 'm', l: 'Issue', v: (i) => i.msg },
    ];
    return head('Data issues', `${n('error')} errors · ${n('warn')} warnings · ${n('info')} notes. Errors mean a value was ignored; fix in the Excel file and reload.`, [['Overview', '#/'], ['Data issues']]) +
      section('', table('issues', cols, iss, { empty: 'No issues found — all files match the format.', limit: 300 }));
  };

  V.exports = () => {
    const M = RC.state.M; const sc = ui.exportScope || {};
    const centreOpt = `<option value="">All centres</option>` + M.centres.map((c) => `<option value="${c.id}" ${sc.centreId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const batches = M.batches.filter((b) => (!sc.centreId || b.centre.id === sc.centreId) && b.file);
    const batchOpt = `<option value="">All batches</option>` + batches.map((b) => `<option value="${b.id}" ${sc.batchId === b.id ? 'selected' : ''}>${esc(b.id)}</option>`).join('');
    const dates = [...new Set(M.batches.filter((b) => !sc.batchId || b.id === sc.batchId).flatMap((b) => b.dates.map((d) => RC.fmt.iso(d))))].sort().reverse();
    const dateOpt = `<option value="">All dates</option>` + dates.map((d) => `<option value="${d}" ${sc.date === d ? 'selected' : ''}>${F().date(F().fromIso(d))}</option>`).join('');
    const cards = RC.SIDH.exports.map((def) => {
      const r = RC.ExportSIDH.build(M, def, { ...sc, date: def.dated ? sc.date : null });
      const miss = Object.entries(r.missing).map(([h, n]) => `${esc(h)} (${n})`).join(', ');
      return `<div class="exp"><div><h3>${esc(def.label)}</h3><p class="dim">${esc(def.desc)}</p>
        <p><b>${num(r.count)}</b> rows${def.dated ? (sc.date ? ' for ' + F().date(F().fromIso(sc.date)) : ' (all dates)') : ''}${r.rowsMissing ? ` · <span class="c-warn">${r.rowsMissing} row(s) missing ${miss}</span>` : ''}</p>
        <p class="cols">${def.columns.map((c) => esc(c.h)).join(' · ')}</p></div>
        <button class="btn" data-export="${def.id}" ${r.count ? '' : 'disabled'}>Download .xlsx</button></div>`;
    }).join('');
    return head('SIDH exports', 'Generated in the browser from the loaded files. <b>Column layouts are assumed</b> until the real SIDH templates are mapped in config/sidh.js.', [['Overview', '#/'], ['SIDH exports']]) +
      section('Scope', `<div class="scope"><label>Centre <select data-scope="centreId">${centreOpt}</select></label><label>Batch <select data-scope="batchId">${batchOpt}</select></label><label>Attendance date <select data-scope="date">${dateOpt}</select></label></div>`) +
      `<div class="exps">${cards}</div>`;
  };

  V.sources = () => {
    const st = RC.state;
    const used = new Set([st.set.master, st.set.trainers, st.set.status, ...st.set.batches].filter(Boolean));
    const cols = [
      { k: 't', l: 'Type', v: (f) => f.type, h: (f) => pill(RC.SCHEMA.files[f.type].label, used.has(f) ? 'info' : 'mute') },
      { k: 'p', l: 'File', v: (f) => f.path, h: (f) => `<b>${esc(f.name)}</b><div class="dim">${esc(f.path)}</div>` },
      { k: 'm', l: 'Last modified', v: (f) => f.lastModified, h: (f) => F().dt(f.lastModified) },
      { k: 'v', l: 'Format', v: (f) => f.meta.FormatVersion || '' },
      { k: 'd', l: 'Data as of', v: (f) => f.dateKey || '' },
      { k: 'u', l: 'Used', v: (f) => (used.has(f) ? 1 : 0), h: (f) => (used.has(f) ? 'Yes' : '<span class="dim">Other version</span>') },
      { k: 's', l: 'Sheets', v: (f) => Object.keys(f.sheets).length, h: (f) => Object.entries(f.sheets).filter(([n]) => n !== 'Guide' && n !== 'Meta').map(([n, s]) => `${esc(n)} <span class="dim">${s.rows.length}</span>`).join(' · ') },
    ];
    const ign = st.catalog.ignored.length ? section('Ignored files', `<ul class="plain">${st.catalog.ignored.map((i) => `<li>${esc(i.path)} — <span class="dim">${esc(i.reason)}</span></li>`).join('')}</ul>`) : '';
    return head('Sources', `Folder “${esc(st.catalog.root || '—')}” loaded ${F().dt(st.catalog.loadedAt)} · ${st.catalog.files.length} files`, [['Overview', '#/'], ['Sources']]) +
      section('Files', table('sources', cols, st.catalog.files, { limit: 50 })) + ign;
  };

  function missing(what, why) { return head(what + ' not loaded', esc(why), [['Not loaded']]); }
  function notFound(what) { return head('Not found', `${esc(what)} is not in the loaded data.`, [['Overview', '#/'], ['Not found']]); }

  /* ---------- router ---------- */
  const routes = [
    [/^\/?$/, 'overview'], [/^\/centres$/, 'centres'], [/^\/centre\/([^/]+)$/, 'centre'], [/^\/jobroles$/, 'jobroles'],
    [/^\/jobrole\/([^/]+)$/, 'jobrole'], [/^\/cj\/([^/]+)\/([^/]+)$/, 'cj'], [/^\/batches$/, 'batches'], [/^\/batch\/([^/]+)$/, 'batch'],
    [/^\/student\/([^/]+)$/, 'student'], [/^\/trainers$/, 'trainers'], [/^\/attention$/, 'attention'], [/^\/issues$/, 'issues'],
    [/^\/exports$/, 'exports'], [/^\/sources$/, 'sources'],
  ];
  const extRoutes = []; // [regex, fn(q, ...params), module]
  function addRoutes(list) { extRoutes.push(...list); }
  function render() {
    const el = document.getElementById('view');
    if (!RC.state || !(RC.state.M || RC.state.N)) return;
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    let html = notFound(path); let hit = false;
    if (RC.TableExport) RC.TableExport.reset();
    for (const [re, fn, mod] of extRoutes) { const m = path.match(re); if (m) { hit = true; RC.state.route = 'nom'; html = RC.state.N ? fn(q, ...m.slice(1)) : missing('Nomination files', 'Add the plan of action and TOT nominations workbooks to the folder and reload.'); break; } }
    if (!hit) for (const [re, name] of routes) { const m = path.match(re); if (m) { RC.state.route = name; html = RC.state.M ? V[name](q, ...m.slice(1)) : missing('Tracker files', 'This folder has no master / status files, so batch tracking is not available. Use the Nominations pages.'); break; } }
    document.body.classList.toggle('presenting', path === '/nom/present' && RC.LOCAL);
    el.innerHTML = html;
    if (RC.TableExport) RC.TableExport.decorate(el);
    document.querySelectorAll('#nav a').forEach((a) => { const hr = a.getAttribute('href'), cur = '#' + (path || '/'); a.classList.toggle('on', a.hasAttribute('data-exact') ? cur === hr : cur === hr || cur.startsWith(hr + '/') || cur.startsWith(hr + '?')); });
  }

  function bind() {
    const el = document.getElementById('view');
    el.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (th) { const [id, k] = th.dataset.sort.split(':'); const cur = ui.sort[id]; ui.sort[id] = { k, d: cur && cur.k === k ? -cur.d : 1 }; const y = scrollY; render(); scrollTo(0, y); return; }
      const sa = e.target.closest('[data-showall]'); if (sa) { ui.filter[sa.dataset.showall + ':all'] = 1; render(); return; }
      const mx = e.target.closest('[data-matrix]'); if (mx) { ui.matrix = mx.dataset.matrix; const y = scrollY; render(); scrollTo(0, y); return; }
      const ex = e.target.closest('[data-export]'); if (ex) { RC.App.doExport(ex.dataset.export); return; }
      const act = e.target.closest('[data-act]'); if (act && RC.ui.actions && RC.ui.actions[act.dataset.act]) { RC.ui.actions[act.dataset.act](act); return; }
      const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a')) { location.hash = tr.dataset.href; }
    });
    el.addEventListener('change', (e) => {
      const s = e.target.closest('[data-scope]'); if (!s) return;
      ui.exportScope = { ...(ui.exportScope || {}), [s.dataset.scope]: s.value || undefined };
      if (s.dataset.scope === 'centreId') { delete ui.exportScope.batchId; delete ui.exportScope.date; }
      if (s.dataset.scope === 'batchId') delete ui.exportScope.date;
      render();
    });
    addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
  }

  RC.Views = { render, bind, esc, addRoutes, h: { esc, pill, flag, link, bar, pct, num, crumbs, head, kpi, section, stack, table, ratio } };
})(typeof window !== 'undefined' ? window : globalThis);
