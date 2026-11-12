/* ============================================================
   CR4 — NOMINATIONS views
   Routes: #/nom  #/nom/centre/:tc  #/nom/people  #/nom/person/:key
           #/nom/followups  #/nom/issues  #/nom/exports
   Display only; all numbers come from RC.Nom.build().
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});
  const H = () => RC.Views.h;
  const ui = (RC.ui = RC.ui || { sort: {}, filter: {} });
  const short = (k) => (k ? RC.Nom.courseOf(k).short : '—');
  const ST = { Required: 'good', Backup: 'info', Rejected: 'bad', Unassigned: 'warn', 'Not in plan': 'warn' };
  const CST = { Covered: 'good', Short: 'warn', None: 'bad' };
  const SEV = { high: 'bad', med: 'warn', low: 'mute' };
  const FLAG_LABEL = {
    UNASSIGNED: 'Centre not confirmed', SHARED_TR: 'Same TR ID on 2 people', NO_MOBILE: 'Mobile missing', BAD_MOBILE: 'Mobile invalid', MULTI_TC: 'Nominated by 2 TCs',
    DECISION_INVALID: 'Decision not applied', MULTI_COURSE: 'More than one course', NOT_ALLOCATED: 'Course not allocated', NONSTANDARD: 'Unknown course name',
    SAME_NAME: 'Possible duplicate', NO_DETAIL: 'No detail row', DOB_ODD: 'DOB implausible', OVER_REQ: 'Over requirement', NAME_VARIANTS: 'Name spelled differently',
    TR_MISMATCH: 'TR ID differs from portal', TR_FROM_PORTAL: 'TR ID only in portal', TR_PORTAL_MULTI: 'Two TR IDs in portal', TOT_WRONG_COURSE: 'TOT requested for wrong course',
    TOT_EXTRA: 'Extra TOT request', TOT_NOT_COUNTED: 'TOT requested, not counted', TOT_NAME_MATCH: 'TOT matched by name only', TOT_MOBILE_DIFF: 'Portal mobile differs',
    NO_TR: 'No TR ID', NO_QUAL: 'Qualification missing', OUT_OF_STATE: 'Outside Karnataka', TWO_MOBILES: 'Two mobiles given',
  };
  const enc = encodeURIComponent;
  const num = (n) => Number(n || 0).toLocaleString('en-IN');
  const personLink = (p) => `<a href="#/nom/person/${enc(p.key)}">${H().esc(p.name)}</a>`;
  const centreLink = (c) => `<a href="#/nom/centre/${c.tc}">${H().esc(c.label)}</a>`;
  const flagPills = (p, max = 3) => {
    const f = p.flags.filter((x) => x.sev !== 'low');
    return f.slice(0, max).map((x) => `<span class="pill t-${SEV[x.sev]}" title="${H().esc(x.text)}">${H().esc(FLAG_LABEL[x.code] || x.code)}</span>`).join(' ') + (f.length > max ? ` <span class="dim">+${f.length - max}</span>` : '');
  };
  const slot = (b) => `<a href="#/nom/course/${b.code}" class="slot ${b.gap ? 'short' : 'ok'}" title="${H().esc(short(b.code))}: ${b.filled} of ${b.req} counted${b.backup ? ', ' + b.backup + ' backup' : ''}">${b.code} <b>${b.filled}/${b.req}</b>${b.backup ? `<i>+${b.backup}</i>` : ''}</a>`;
  const TOTC = { Completed: 'good', 'Training requested': 'info', Scheduled: 'info', 'Requested - wrong course': 'bad', 'Requested - not counted': 'warn', Failed: 'bad' };
  const totPill = (p) => H().pill(p.tot, TOTC[p.tot] || 'mute');
  const totName = (t) => (t.code ? RC.Nom.courseOf(t.code).tot : t.qpRaw || '—');
  const trCell = (p) => { const h = H(); if (!p.tr) return '<span class="dim">—</span>'; return h.esc(p.tr) + (p.trMismatch ? `<div class="c-bad">nominations: ${h.esc(p.trNom)}</div>` : p.trSrc === 'portal' && !p.trNom ? '<div class="dim">from TOT portal</div>' : ''); };
  const asOfBox = (N) => `<div class="asof"><span>Nominations as of</span><b>${RC.fmt.date(N.asOf)}</b></div>`;

  function funnel(N) {
    const m = N.m, h = H();
    const assigned = m.unique - m.unassigned - m.notInPlan;
    const allowed = m.filled + m.backup;
    const steps = [
      ['Nominations received', m.received, 'rows in the nominations file', '#/nom/people'],
      ['Unique people', m.unique, `${m.received - m.unique} repeat rows (same person, more courses)`, '#/nom/people?flag=MULTI_COURSE'],
      ['Centre confirmed', assigned, `${m.unassigned} waiting for a centre`, '#/nom/people?status=Unassigned'],
      ['Allowed course', allowed, `${m.rejected} rejected (course not allocated / unknown)`, '#/nom/people?status=Rejected'],
      ['Counted to target', m.filled, `${m.backup} kept as backup`, '#/nom/people?status=Required'],
    ];
    const max = steps[0][1] || 1;
    return `<div class="funnel">${steps.map(([l, v, s, href]) => `<a class="fn-s" href="${href}"><span class="fn-l">${l}</span><span class="fn-bar"><i style="width:${(v / max) * 100}%"></i></span><span class="fn-v">${h.num(v)}</span><span class="fn-sub">${s}</span></a>`).join('')}
      <div class="fn-s target"><span class="fn-l">Trainers required</span><span class="fn-bar"><i style="width:${(m.required / max) * 100}%"></i></span><span class="fn-v">${h.num(m.required)}</span><span class="fn-sub">1 per batch · gap ${m.gap}</span></div></div>`;
  }

  /* ---------- Overview ---------- */
  function overview(q) {
    const N = RC.state.N, m = N.m, h = H();
    let list = N.centres; if (q.state) list = list.filter((c) => c.state === q.state);
    const kp = `<div class="kpis">
      ${h.kpi('Trainers counted', `${m.filled}<small>/${m.required}</small>`, `gap ${m.gap} · ${m.backup} backup`, h.ratio(m.filled, m.required), 'info')}
      ${h.kpi('Centres covered', `${m.covered}<small>/${m.centres}</small>`, `${m.short} short · <b class="c-bad">${m.none} with none</b>`, h.ratio(m.covered, m.centres), 'good')}
      ${h.kpi('Unique people', h.num(m.unique), `from ${m.received} nominations · ${m.multiCourse} on 2+ courses`)}
      ${h.kpi('Waiting for a centre', m.unassigned, 'confirm TC by phone', null)}
      ${h.kpi('TOT', `${m.tot}<small>/${m.required}</small>`, `completed · <a href="#/nom/tot">${m.totReq} requested</a>${m.totWrong ? ` · <a class="c-bad" href="#/nom/tot?cat=wrong">${m.totWrong} wrong course</a>` : ''} · ${m.withTR} counted have a TR ID`, h.ratio(m.tot, m.required), 'good')}
      ${h.kpi('Centres inspected', `${m.inspected}<small>/${m.centres}</small>`, 'NSDC inspection', h.ratio(m.inspected, m.centres), 'good')}
    </div>`;
    const bc = Object.values(m.byCode);
    const courseTbl = `<div class="tw"><table class="tbl"><thead><tr><th>Course</th><th class="n">Required</th><th class="n">Counted</th><th class="n">Gap</th><th class="n">Backup</th><th class="n">Received</th></tr></thead><tbody>${bc.map((b) => `<tr data-href="#/nom/course/${b.code}"><td class="cname"><b>${h.esc(short(b.code))}</b><div class="dim">${b.centres} centre${b.centres > 1 ? 's' : ''}</div></td><td class="n">${b.req}</td><td class="n">${b.filled}</td><td class="n ${b.req - b.filled ? 'c-warn' : ''}">${b.req - b.filled}</td><td class="n">${b.backup}</td><td class="n">${b.received}</td></tr>`).join('')}</tbody></table></div>`;
    const fc = {};
    for (const p of N.people) for (const f of p.flags) if (f.sev !== 'low') (fc[f.code] = fc[f.code] || { n: 0, sev: f.sev }).n++;
    if (fc.NO_TR) fc.NO_TR = { n: N.m.noTRcounted, sev: 'high' };
    if (fc.NO_TR && !fc.NO_TR.n) delete fc.NO_TR;
    const fl = Object.entries(fc).sort((a, b) => (a[1].sev === b[1].sev ? b[1].n - a[1].n : a[1].sev === 'high' ? -1 : 1));
    const flagBox = `<div class="fgrid">${fl.map(([k, v]) => k === 'NO_TR'
      ? `<a href="#/nom/people?status=Required&flag=NO_TR" class="fg sev-${v.sev}"><b>${v.n}</b><span>Counted trainers without TR ID</span></a>`
      : `<a href="#/nom/people?flag=${k}" class="fg sev-${v.sev}"><b>${v.n}</b><span>${h.esc(FLAG_LABEL[k] || k)}</span></a>`).join('')}</div>`;
    const chips = `<div class="chips"><a class="${!q.state ? 'on' : ''}" href="#/nom">All ${N.centres.length}</a>${['Covered', 'Short', 'None'].map((s) => `<a class="${q.state === s ? 'on' : ''}" href="#/nom?state=${s}">${s === 'None' ? 'No nominations' : s} ${m[s.toLowerCase()]}</a>`).join('')}</div>`;
    const cols = [
      { k: 'c', l: 'Centre', xl: [{ l: 'Centre', v: (c) => c.label }, { l: 'TC ID', v: (c) => c.tc }], v: (c) => c.label, h: (c) => `<b>${h.esc(c.label.replace(/^GTTC /, ''))}</b><div class="dim">${c.tc}</div>` },
      { k: 's', l: 'Status', v: (c) => ['None', 'Short', 'Covered'].indexOf(c.state), h: (c) => h.pill(c.state === 'None' ? 'No nominations' : c.state, CST[c.state]) },
      { k: 'caaf', l: 'CAAF · Inspection', v: (c) => c.caaf, h: (c) => `${h.esc(c.caaf || '—')}${c.caafNote ? ` <span class="c-warn" title="${h.esc(c.caafNote)}">⚠</span>` : ''}<div class="dim">${h.esc(c.inspection)}</div>` },
      { k: 'req', l: 'Required', num: 1, v: (c) => c.req },
      { k: 'rows', l: 'Received', num: 1, v: (c) => c.rows, h: (c) => (c.rows ? `${c.rows}${c.unique !== c.rows ? `<div class="dim">${c.unique} people</div>` : ''}` : c.unassignedHere.length ? `<span class="c-warn" title="Unassigned nominations from this district">0 (+${c.unassignedHere.length}?)</span>` : '<span class="c-bad">0</span>') },
      { k: 'f', l: 'Counted', num: 1, v: (c) => h.ratio(c.filled, c.req), h: (c) => `${c.filled}/${c.req} ${h.bar(h.ratio(c.filled, c.req), c.gap ? 'warn' : 'good')}` },
      { k: 'slots', l: 'By course', v: (c) => c.gap, h: (c) => c.byCourse.map(slot).join('') },
      { k: 'b', l: 'Backup', num: 1, v: (c) => c.backup, h: (c) => c.backup || '' },
      { k: 'r', l: 'Rejected', num: 1, v: (c) => c.rejected, h: (c) => (c.rejected ? `<span class="c-bad">${c.rejected}</span>` : '') },
      { k: 'tr', l: 'TR ID', num: 1, v: (c) => c.withTR, h: (c) => (c.filled ? `${c.withTR}/${c.filled}` : '') },
    ];
    return h.head('Trainer nominations', `${m.centres} centres · ${m.required} trainers required (1 per batch) · from <b>${h.esc(N.sources.nominations.name)}</b>`, [['Nominations']], asOfBox(N)) + kp +
      `<div class="grid2">${h.section('From nominations to counted trainers', funnel(N))}${h.section('By course', courseTbl + (m.byCode.JD && m.byCode.JD.received > m.byCode.JD.req * 3 ? `<p class="note">Jr. Designer is allocated at only ${m.byCode.JD.centres} centres, yet ${m.byCode.JD.received} nominations came in for it — most are rejected as "course not allocated".</p>` : ''))}</div>` +
      h.section('What needs fixing', flagBox, '<a href="#/nom/followups">Follow-up list →</a>') +
      h.section('Centres', chips + h.table('nom-centres', cols, list, { href: (c) => `#/nom/centre/${c.tc}` }));
  }

  /* ---------- Centre ---------- */
  function centre(q, tc) {
    const N = RC.state.N, h = H(); const c = N.by.centre.get(tc);
    if (!c) return h.head('Not found', `TC ${h.esc(tc)} is not in the plan`, [['Nominations', '#/nom'], ['Not found']]);
    const pw = c.password ? `<span class="pw"><code>${h.esc(c.password)}</code></span>` : '—';
    const info = `<dl class="info">
      <div><dt>TC ID</dt><dd>${c.tc}</dd></div><div><dt>District</dt><dd>${h.esc(c.district)}</dd></div>
      <div><dt>SPOC</dt><dd>${h.esc(c.spoc || '—')}${c.mobile ? ` · <a href="tel:${h.esc(c.mobile.replace(/\s/g, ''))}">${h.esc(c.mobile)}</a>` : ''}${c.email ? `<br><a href="mailto:${h.esc(c.email)}">${h.esc(c.email)}</a>` : ''}</dd></div>
      <div class="pwrow"><dt>SIDH password</dt><dd>${pw}</dd></div>
      <div><dt>CAAF</dt><dd>${h.esc(c.caaf || '—')}${c.caafDate ? ' · ' + RC.fmt.date(c.caafDate) : ''}${c.caafNote ? `<div class="c-warn">${h.esc(c.caafNote)}</div>` : ''}</dd></div>
      <div><dt>Inspection</dt><dd>${h.pill(c.inspection, /pass/i.test(c.inspection) ? 'good' : /fail/i.test(c.inspection) ? 'bad' : 'mute')}${c.inspectionDate ? ' ' + RC.fmt.date(c.inspectionDate) : ''}${c.inspectionNotes ? `<div class="dim">${h.esc(c.inspectionNotes)}</div>` : ''}</dd></div>
      ${c.nomNote ? `<div><dt>Plan note</dt><dd>${h.esc(c.nomNote)}</dd></div>` : ''}
      ${c.remarks ? `<div><dt>Remarks</dt><dd>${h.esc(c.remarks)}</dd></div>` : ''}
      <div class="wide"><dt>Address</dt><dd>${h.esc(c.address || '')}</dd></div></dl>`;
    const kp = `<div class="kpis">${h.kpi('Counted', `${c.filled}<small>/${c.req}</small>`, c.gap ? `<b class="c-warn">gap ${c.gap}</b>` : 'requirement met', h.ratio(c.filled, c.req), c.gap ? 'warn' : 'good')}
      ${h.kpi('Received', c.rows, `${c.unique} unique people`)}${h.kpi('Backup', c.backup, 'beyond 1 per batch')}${h.kpi('Rejected', c.rejected, 'course not allocated / unknown')}
      ${h.kpi('TR ID', `${c.withTR}<small>/${c.filled}</small>`, 'among counted')}${h.kpi('TOT completed', `${c.tot}<small>/${c.req}</small>`, `${c.totReq} requested${c.totWrong ? ` · <b class="c-bad">${c.totWrong} wrong course</b>` : ''}`)}</div>`;
    const slots = `<div class="tw"><table class="tbl"><thead><tr><th>Course</th><th class="n">Seats</th><th class="n">Req.</th><th class="n">Counted</th><th class="n">Gap</th><th class="n">Backup</th><th class="n">Rows</th><th class="n">People</th></tr></thead><tbody>${c.byCourse.map((b) => `<tr data-href="#/nom/course/${b.code}"><td class="cname"><b>${h.esc(short(b.code))}</b></td><td class="n">${b.target}</td><td class="n">${b.req}</td><td class="n">${b.filled}</td><td class="n ${b.gap ? 'c-warn' : ''}">${b.gap}</td><td class="n">${b.backup}</td><td class="n">${b.received}</td><td class="n">${b.unique}</td></tr>`).join('')}</tbody></table></div>`;
    const un = c.unassignedHere.length ? h.section(`Unassigned nominations that may belong here (${c.unassignedHere.length})`,
      `<p class="note">These were grouped under "${h.esc(c.unassignedHere[0].srcLabel)}" without a TC. Possible centres: ${c.unassignedHere[0].candidates.map(centreLink).join(', ')}. Confirm by phone and enter AssignTC in the Decisions file.</p>` + peopleTable('c-un-' + tc, c.unassignedHere, { noCentre: true, addr: true })) : '';
    return h.head(c.label, `${c.tc} · ${h.esc(c.district)} · ${h.pill(c.state === 'None' ? 'No nominations' : c.state, CST[c.state])}`, [['Nominations', '#/nom'], [c.label]]) +
      h.section('Centre', info) + h.section('Requirement by course', slots) + kp +
      h.section(`Nominated people (${c.people.length})`, peopleTable('c-p-' + tc, c.people, { noCentre: true })) + un +
      h.section('Follow-ups', followList(N, c));
  }

  /* ---------- People ---------- */
  function peopleTable(id, list, o = {}) {
    const h = H();
    const cols = [
      { k: 'n', l: 'Name', xl: [{ l: 'Name', v: (p) => p.name }, { l: 'Mobile', v: (p) => p.mobile || p.mobileRaw || '' }], v: (p) => p.name, h: (p) => `<b>${personLink(p)}</b><div class="dim">${h.esc(p.mobile || p.mobileRaw || 'no mobile')}</div>` },
      o.noCentre ? null : { k: 'c', l: 'Centre', v: (p) => (p.centre ? p.centre.label : 'zz' + p.srcLabel), h: (p) => (p.centre ? centreLink(p.centre) : `<span class="c-warn">${h.esc(p.srcLabel)} (no TC)</span>`) },
      { k: 'nom', l: 'Nominated for', v: (p) => p.codes.length + p.others.length, h: (p) => [...p.codes.map((k) => `<span class="cc ${p.centre && !p.centre.courses[k] ? 'na' : ''} ${k === p.course && (p.status === 'Required' || p.status === 'Backup') ? 'kept' : ''}" title="${h.esc(short(k))}${p.centre && !p.centre.courses[k] ? ' — not allocated here' : ''}">${k}</span>`), ...p.others.map((x) => `<span class="cc na" title="${h.esc(x)}">?</span>`)].join('') },
      { k: 's', l: 'Status', v: (p) => ['Required', 'Backup', 'Unassigned', 'Not in plan', 'Rejected'].indexOf(p.status), h: (p) => h.pill(p.status === 'Required' ? 'Counted' : p.status, ST[p.status]) + (p.dec ? ' <span class="dim" title="Manual decision">✎</span>' : '') },
      { k: 'k', l: 'Course', v: (p) => p.course || '', h: (p) => (p.status === 'Required' || p.status === 'Backup' ? h.esc(short(p.course)) : '') },
      o.addr ? { k: 'a', l: 'Location / address (from nomination)', v: (p) => (p.detail ? p.detail.location + ' ' + p.detail.address : ''), h: (p) => (p.detail ? `${h.esc(p.detail.location || '')}<div class="dim">${h.esc((p.detail.address || '').slice(0, 90))}</div>` : '') } : null,
      { k: 'tr', l: 'TR ID', v: (p) => p.tr || '', h: trCell },
      o.addr ? null : { k: 't', l: 'TOT', v: (p) => p.tot, h: (p) => totPill(p) + (p.totWrong ? `<div class="c-bad">${h.esc(p.totReqs.map(totName).join('; '))}</div>` : '') },
      { k: 'f', l: 'Flags', v: (p) => p.flags.filter((f) => f.sev === 'high').length * 10 + p.flags.filter((f) => f.sev === 'med').length, h: (p) => flagPills(p) },
    ].filter(Boolean);
    return h.table(id, cols, list, { href: (p) => `#/nom/person/${enc(p.key)}`, empty: 'Nobody matches', limit: o.limit });
  }

  function people(q) {
    const N = RC.state.N, h = H();
    let list = N.people;
    if (q.status) list = list.filter((p) => p.status === q.status);
    const sel = [...new Set([...(q.flags ? q.flags.split(',') : []), ...(q.flag ? [q.flag] : [])].filter(Boolean))];
    const any = q.match === 'any';
    if (sel.length) list = list.filter((p) => { const has = (k) => p.flags.some((f) => f.code === k); return any ? sel.some(has) : sel.every(has); });
    if (q.course) list = list.filter((p) => p.codes.includes(q.course));
    const s = (ui.filter.nomq || '').trim().toLowerCase();
    if (s) list = list.filter((p) => (p.name + ' ' + (p.mobile || p.mobileRaw) + ' ' + (p.tr || '') + ' ' + (p.centre ? p.centre.label : p.srcLabel)).toLowerCase().includes(s));
    const counts = {}; N.people.forEach((p) => (counts[p.status] = (counts[p.status] || 0) + 1));
    const qs = (o) => { const x = { ...q, flags: sel.join(',') || null, flag: null, ...o }; Object.keys(x).forEach((k) => (x[k] == null || x[k] === '') && delete x[k]); const u = new URLSearchParams(x).toString().replace(/%2C/g, ','); return '#/nom/people' + (u ? '?' + u : ''); };
    const fcount = {}; N.people.forEach((p) => new Set(p.flags.map((f) => f.code)).forEach((k) => (fcount[k] = (fcount[k] || 0) + 1)));
    const fsev = {}; N.people.forEach((p) => p.flags.forEach((f) => (fsev[f.code] = fsev[f.code] || f.sev)));
    const order = Object.keys(fcount).sort((a, b) => (b === 'NO_TR') - (a === 'NO_TR') || ['high', 'med', 'low'].indexOf(fsev[a]) - ['high', 'med', 'low'].indexOf(fsev[b]) || fcount[b] - fcount[a]);
    const toggle = (k) => qs({ flags: (sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]).join(',') || null });
    const fdrop = `<details class="fdrop" ${ui.fdropOpen ? 'open' : ''}><summary>Flags${sel.length ? ` <b>${sel.length}</b>` : ''} ▾</summary><div class="fd-menu">
      ${order.map((k) => `<a class="fd-i ${sel.includes(k) ? 'on' : ''}" href="${toggle(k)}"><span class="fd-c">${sel.includes(k) ? '✓' : ''}</span><span class="sevdot s-${fsev[k]}"></span>${h.esc(FLAG_LABEL[k] || k)}<em>${fcount[k]}</em></a>`).join('')}
      <div class="fd-foot">${sel.length > 1 ? `<a href="${qs({ match: any ? null : 'any' })}">Match: <b>${any ? 'any selected' : 'all selected'}</b> (switch)</a>` : '<span class="dim">Pick one or more</span>'}${sel.length ? ` · <a href="${qs({ flags: null, match: null })}">Clear</a>` : ''}</div></div></details>`;
    const chips = `<div class="chips"><a class="${!q.status ? 'on' : ''}" href="${qs({ status: null })}">All ${N.people.length}</a>${['Required', 'Backup', 'Unassigned', 'Rejected', 'Not in plan'].filter((s) => counts[s]).map((s) => `<a class="${q.status === s ? 'on' : ''}" href="${qs({ status: s })}">${s === 'Required' ? 'Counted' : s} ${counts[s]}</a>`).join('')}</div>`;
    const tools = `<div class="ptools"><input id="nomq" type="search" placeholder="Search name, mobile, TR ID, centre" value="${h.esc(ui.filter.nomq || '')}">
      <select id="nomcourse" aria-label="Course">${['', ...RC.NOM.courses.map((c) => c.code)].map((k) => `<option value="${qs({ course: k || null })}" ${(q.course || '') === k ? 'selected' : ''}>${k ? h.esc(short(k)) : 'All courses'}</option>`).join('')}</select>
      ${fdrop}${sel.map((k) => `<span class="pill t-warn">${h.esc(FLAG_LABEL[k] || k)} <a href="${toggle(k)}" title="Remove">×</a></span>`).join(sel.length > 1 ? (any ? ' <span class="dim">or</span> ' : ' <span class="dim">and</span> ') : '')}
</div>`;
    return h.head('People', `${list.length} of ${N.people.length} unique people (one row per person; courses they were nominated for are shown as codes, the kept course is highlighted)`, [['Nominations', '#/nom'], ['People']]) +
      h.section('', chips + tools + peopleTable('nom-people', list, {}) + `<p class="dim legend2"><span class="cc kept">MO</span> kept · <span class="cc">MO</span> nominated · <span class="cc na">JD</span> not allocated at that centre · ✎ manual decision</p>`);
  }

  function person(q, key) {
    const N = RC.state.N, h = H(); const p = N.by.person.get(decodeURIComponent(key));
    if (!p) return h.head('Not found', 'This person is not in the current nominations file.', [['Nominations', '#/nom'], ['Not found']]);
    const d = p.detail || {};
    const age = d.dob ? Math.floor((new Date() - d.dob) / (365.25 * 864e5)) : null;
    const info = `<dl class="info">
      <div><dt>Mobile</dt><dd>${p.mobile ? `<a href="tel:${p.mobile}">${p.mobile}</a>` : `<span class="c-bad">${h.esc(p.mobileRaw || 'missing')}</span>`}</dd></div>
      <div><dt>TR ID</dt><dd>${trCell(p)}</dd></div><div><dt>Email</dt><dd>${h.esc(d.email || '—')}</dd></div>
      <div><dt>DOB</dt><dd>${d.dob ? RC.fmt.date(d.dob) + ` (age ${age})` : '—'}</dd></div>
      <div><dt>Qualification</dt><dd>${h.esc(d.qual || '—')}</dd></div>
      <div><dt>Experience (yrs)</dt><dd>Industry ${d.indExp ?? '—'} · Teaching ${d.teachExp ?? '—'} · Total ${d.totExp ?? '—'}</dd></div>
      <div><dt>State / location</dt><dd>${h.esc([d.state, d.location].filter(Boolean).join(' · ') || '—')}</dd></div>
      <div><dt>TOT</dt><dd>${totPill(p)}${p.dec && p.dec.totDate ? ' ' + RC.fmt.date(p.dec.totDate) : ''}${(p.status === 'Required' || p.status === 'Backup') ? `<div class="dim">Needed: ${h.esc(RC.Nom.courseOf(p.course).tot)}</div>` : ''}</dd></div>
      <div class="wide"><dt>Address</dt><dd>${h.esc(d.address || '—')}</dd></div>
      ${d.remarks ? `<div class="wide"><dt>Remarks in source file</dt><dd>${h.esc(d.remarks)}</dd></div>` : ''}</dl>`;
    const outcome = `<div class="outcome"><div>${h.pill(p.status === 'Required' ? 'Counted to target' : p.status, ST[p.status])}${p.status === 'Required' || p.status === 'Backup' ? ` on <b>${h.esc(short(p.course))}</b>` : ''}${p.centre ? ` at ${centreLink(p.centre)}` : ''}</div><p>${h.esc(p.why)}</p>
      ${p.dec ? `<p class="dim">Manual decision applied (Decisions file row ${p.dec.row})${p.dec.notes ? ': ' + h.esc(p.dec.notes) : ''}</p>` : ''}
      ${p.candidates && p.candidates.length ? `<p>Possible centres: ${p.candidates.map(centreLink).join(', ')}</p>` : ''}
      ${p.suggest.length ? `<ul class="plain">${p.suggest.map((s) => `<li>${h.esc(s)}</li>`).join('')}</ul>` : ''}</div>`;
    const noms = `<div class="tw"><table class="tbl"><thead><tr><th>Grouped under</th><th>TC</th><th>Course (as written)</th><th>TR ID</th><th>Source row</th></tr></thead><tbody>${p.noms.map((n) => `<tr><td>${h.esc(n.srcCentre)}${n.groupNote ? `<div class="dim">${h.esc(n.groupNote)}</div>` : ''}</td><td>${h.esc(n.tc || '—')}</td><td>${h.esc(n.courseRaw)}${n.code ? '' : ' <span class="pill t-warn">unknown</span>'}</td><td>${h.esc(n.tr || '—')}</td><td class="dim">${h.esc(n.src.sheet)} r${n.src.row}</td></tr>`).join('')}</tbody></table></div>`;
    const flags = p.flags.length ? `<ul class="flags">${p.flags.map((f) => `<li class="sev-${f.sev === 'high' ? 'high' : f.sev === 'med' ? 'med' : 'low'}"><span class="fk">${h.esc(FLAG_LABEL[f.code] || f.code)}</span>${h.esc(f.text)}</li>`).join('')}</ul>` : '<p class="empty">No issues</p>';
    return h.head(p.name, `${p.centre ? centreLink(p.centre) : h.esc(p.srcLabel) + ' (centre not confirmed)'} · key <code>${h.esc(p.key)}</code>`, [['Nominations', '#/nom'], ...(p.centre ? [[p.centre.label, '#/nom/centre/' + p.centre.tc]] : []), [p.name]]) +
      `<div class="grid2">${h.section('Outcome', outcome)}${h.section('Flags', flags)}</div>` + h.section('Profile', info) + h.section(`Nominations (${p.noms.length})`, noms) +
      h.section(`TOT requests (${p.totReqs.length})`, p.totReqs.length ? totReqTable(p.totReqs, p) : `<p class="empty">No TOT request in ${N.sources.tot ? h.esc(N.sources.tot.name) : 'the TOT portal file (not loaded)'}.</p>`);
  }

  /* ---------- TOT status (CR12) ---------- */
  function verdict(t, p) {
    if (!p) return ['Not in nominations', 'warn'];
    const counted = p.status === 'Required' || p.status === 'Backup';
    if (!counted) return ['Person not counted', 'warn'];
    if (!t.code) return ['Not a ' + RC.brand().courseWord, 'bad'];
    return t.code === p.course ? ['Matches counted course', 'good'] : [p.totReqOk ? 'Extra request' : 'Wrong course', p.totReqOk ? 'warn' : 'bad'];
  }
  function totReqTable(reqs, p) {
    const h = H();
    return `<div class="tw"><table class="tbl"><thead><tr><th>TR ID (portal)</th><th>TOT requested for</th><th>Requested on</th><th>District / sub-district</th><th>Matched on</th><th>Check</th><th>Source row</th></tr></thead><tbody>${reqs.map((t) => { const [v, c] = verdict(t, p || t.person);
      return `<tr><td>${h.esc(t.tr || '—')}</td><td>${h.esc(totName(t))}</td><td>${t.requested ? RC.fmt.date(t.requested) : '—'}</td><td>${h.esc([t.district, t.sub].filter((x) => x && x !== 'N/A').join(' / ') || '—')}</td><td>${h.esc(t.how || '—')}</td><td>${h.pill(v, c)}</td><td class="dim">${h.esc(t.src.sheet)} r${t.src.row}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function fixes(r) {
    const p = r.p, out = [];
    if (!p) return [['Not in nominations — confirm centre and course, or ignore', false]];
    const qp = (k) => RC.Nom.courseOf(k).qp;
    if (p.totWrong) out.push([`Raise TOT request for ${qp(p.course)} (${short(p.course)})`, true]);
    if (p.totExtra.length) out.push([`Withdraw extra request: ${p.totExtra.map((t) => t.qp || t.qpRaw).join(', ')}`, false]);
    if (p.totNotCounted) out.push([`${p.status} — decide: count, or withdraw request`, false]);
    if (p.trMismatch) out.push([`Correct TR ID in nominations: ${p.trNom} → ${p.trPortal}`, true]);
    else if (p.trSrc === 'portal' && !p.trNom) out.push([`Add TR ID ${p.trPortal} to nominations`, false]);
    if (p.trPortalMulti) out.push([`Two TR IDs in portal: ${p.trPortalMulti.join(', ')}`, true]);
    if (p.flags.some((f) => f.code === 'TOT_NAME_MATCH')) out.push(['Matched by name only — confirm', false]);
    const md = p.flags.find((f) => f.code === 'TOT_MOBILE_DIFF'); if (md) out.push([md.text.replace(/ \(matched on .*\)$/, ''), false]);
    if (!out.length && r.cat === 'notreq') out.push([p.tr ? `Raise TOT request for ${qp(p.course)}` : `Create TR ID, then raise TOT request for ${qp(p.course)}`, false]);
    return out;
  }
  function totView(q) {
    const N = RC.state.N, h = H(), m = N.m;
    if (!N.sources.tot) return h.head('TOT status', 'No TOT request file loaded. Put the portal dump (ToT_Sheet*.xlsx) in the nominations folder and reload.', [['Nominations', '#/nom'], ['TOT status']]);
    const rows = [];
    for (const p of N.people) {
      const counted = p.status === 'Required' || p.status === 'Backup';
      if (!counted && !p.totReqs.length) continue;
      const cat = p.totWrong ? 'wrong' : p.totNotCounted ? 'notcounted' : p.totAsked || p.totReqOk ? 'ok' : p.status === 'Required' ? 'notreq' : 'backup';
      rows.push({ p, cat, reqs: p.totReqs });
    }
    for (const t of N.totOrphans) rows.push({ t, cat: 'orphan', reqs: [t] });
    const trIssue = (r) => r.p && (r.p.trMismatch || (r.p.trSrc === 'portal' && !r.p.trNom));
    const CAT = { ok: ['Requested — correct course', 'good'], wrong: ['Wrong course', 'bad'], notreq: ['Counted — not requested yet', 'mute'], notcounted: ['Requested — not counted', 'warn'], orphan: ['Not in nominations', 'warn'], backup: ['Backup — not requested', 'mute'] };
    const cnt = {}; rows.forEach((r) => (cnt[r.cat] = (cnt[r.cat] || 0) + 1)); const trN = rows.filter(trIssue).length;
    const f = q.cat || '';
    let list = f === 'tr' ? rows.filter(trIssue) : f ? rows.filter((r) => r.cat === f) : rows;
    const s = (ui.filter.totq || '').trim().toLowerCase();
    if (s) list = list.filter((r) => { const p = r.p, t = r.t || {}; return ((p ? p.name + ' ' + (p.mobile || '') + ' ' + (p.tr || '') + ' ' + (p.trNom || '') + ' ' + (p.centre ? p.centre.label : p.srcLabel) : t.name + ' ' + (t.mobile || '') + ' ' + (t.tr || ''))).toLowerCase().includes(s); });
    const chip = (k, l, n) => `<a class="${f === k ? 'on' : ''}" href="#/nom/tot${k ? '?cat=' + k : ''}">${l} ${n}</a>`;
    const chips = `<div class="chips">${chip('', 'All', rows.length)}${Object.keys(CAT).filter((k) => cnt[k]).map((k) => chip(k, CAT[k][0], cnt[k])).join('')}${trN ? chip('tr', 'TR ID to correct in nominations', trN) : ''}</div>`;
    const tools = `<div class="ptools"><input id="totq" type="search" placeholder="Search name, mobile, TR ID, centre" value="${h.esc(ui.filter.totq || '')}"></div>`;
    const ORDER = { wrong: 0, notcounted: 1, orphan: 2, notreq: 3, ok: 4, backup: 5 };
    const cols = [
      { k: 'n', l: 'Name', xl: [{ l: 'Name', v: (r) => (r.p ? r.p.name : r.t.name) }, { l: 'Mobile', v: (r) => (r.p ? r.p.mobile || r.p.mobileRaw : r.t.mobile || r.t.mobileRaw) || '' }], v: (r) => (r.p ? r.p.name : r.t.name), h: (r) => (r.p ? `<b>${personLink(r.p)}</b><div class="dim">${h.esc(r.p.mobile || r.p.mobileRaw || 'no mobile')}</div>` : `<b>${h.esc(r.t.name)}</b><div class="dim">${h.esc(r.t.mobile || r.t.mobileRaw || 'no mobile')}</div>`) },
      { k: 'c', l: 'Centre', v: (r) => (r.p ? (r.p.centre ? r.p.centre.label : r.p.srcLabel) : 'zz'), h: (r) => (r.p ? (r.p.centre ? centreLink(r.p.centre) : h.esc(r.p.srcLabel)) : `<span class="dim">${h.esc([r.t.district, r.t.sub].filter((x) => x && x !== 'N/A').join(' / ') || '—')}</span>`) },
      { k: 'k', l: 'Status / counted course', xl: [{ l: 'Status', v: (r) => (r.p ? (r.p.status === 'Required' ? 'Counted' : r.p.status) : 'Not in nominations') }, { l: 'Counted course', v: (r) => (r.p && (r.p.status === 'Required' || r.p.status === 'Backup') ? short(r.p.course) : '') }], v: (r) => (r.p ? r.p.status + (r.p.course || '') : 'zz'), h: (r) => (r.p ? h.pill(r.p.status === 'Required' ? 'Counted' : r.p.status, ST[r.p.status]) + (r.p.status === 'Required' || r.p.status === 'Backup' ? `<div>${h.esc(short(r.p.course))}</div>` : '') : '<span class="dim">—</span>') },
      { k: 'r', l: 'TOT requested for', v: (r) => r.reqs.map(totName).join(' '), h: (r) => (r.reqs.length ? r.reqs.map((t) => { const [v, c] = verdict(t, r.p); return `<div class="${c === 'bad' ? 'c-bad' : c === 'warn' && r.p && r.p.totReqOk ? 'c-warn' : ''}">${h.esc(totName(t))}</div>`; }).join('') : '<span class="dim">—</span>') },
      { k: 'd', l: 'Requested on', v: (r) => (r.reqs[0] && r.reqs[0].requested ? +r.reqs[0].requested : 0), h: (r) => r.reqs.map((t) => (t.requested ? RC.fmt.date(t.requested) : '—')).join('<br>') },
      { k: 'tr', l: 'TR ID', v: (r) => (r.p ? r.p.tr || '' : r.t.tr || ''), h: (r) => (r.p ? trCell(r.p) : h.esc(r.t.tr || '—')) },
      { k: 't', l: 'TOT status', v: (r) => ORDER[r.cat], h: (r) => (r.p ? totPill(r.p) : h.pill('Not in nominations', 'warn')) },
      { k: 'i', l: 'To fix', v: (r) => fixes(r).length, h: (r) => fixes(r).map(([t, bad]) => `<div class="${bad ? 'c-bad' : ''}">${h.esc(t)}</div>`).join('') },
    ];
    const kp = `<div class="kpis">
      ${h.kpi('Counted trainers requested', `${m.totReq}<small>/${m.filled}</small>`, `for the course they are counted on`, h.ratio(m.totReq, m.filled), 'info')}
      ${h.kpi('Not requested yet', cnt.notreq || 0, 'counted trainers with no request')}
      ${h.kpi('Wrong course', m.totWrong, 'request differs from counted course')}
      ${h.kpi('Requested, not counted', (cnt.notcounted || 0) + (cnt.orphan || 0), `${cnt.notcounted || 0} rejected/unassigned · ${cnt.orphan || 0} not in nominations`)}
      ${h.kpi('TR ID to correct', trN, `${m.trMismatch} differ · ${m.trFromPortal} missing in nominations`)}
      ${h.kpi('TOT completed', `${m.tot}<small>/${m.filled}</small>`, '')}</div>`;
    const need = `<p class="dim legend2">TOT needed per course: ${RC.NOM.courses.map((c) => `${h.esc(c.short)} → <b>${h.esc(c.tot)}</b>`).join(' · ')}. TR IDs: the TOT portal is the source of truth.</p>`;
    return h.head('TOT status', `${m.totRows} requests in <b>${h.esc(N.sources.tot.name)}</b> · ${m.filled} counted trainers`, [['Nominations', '#/nom'], ['TOT status']]) + kp +
      h.section('', chips + tools + h.table('nom-tot', cols, list, { href: (r) => (r.p ? `#/nom/person/${enc(r.p.key)}` : null), sort: { k: 't', d: 1 }, empty: 'Nobody matches' }) + need);
  }

  /* ---------- Follow-ups (call list) ---------- */
  function followItems(N, c) {
    const items = [];
    if (c.state === 'None' && !c.unassignedHere.length) items.push({ sev: 'high', text: `No nominations received — ${c.req} trainer(s) needed (${c.byCourse.map((b) => `${b.code} ${b.req}`).join(', ')})` });
    else if (c.gap) items.push({ sev: 'high', text: `Need ${c.gap} more: ${c.byCourse.filter((b) => b.gap).map((b) => `${short(b.code)} ${b.gap}`).join(', ')}` + (c.unassignedHere.length ? ` — ${c.unassignedHere.length} unassigned ${c.unassignedHere[0].srcLabel} nominations may cover this` : '') });
    for (const p of c.people) {
      for (const f of p.flags) if (['SHARED_TR', 'NO_MOBILE', 'BAD_MOBILE', 'SAME_NAME', 'NONSTANDARD', 'DOB_ODD', 'DECISION_INVALID', 'MULTI_TC', 'TR_MISMATCH', 'TR_FROM_PORTAL', 'TR_PORTAL_MULTI', 'TOT_WRONG_COURSE', 'TOT_EXTRA', 'TOT_NOT_COUNTED', 'TOT_NAME_MATCH', 'TOT_MOBILE_DIFF'].includes(f.code) || (f.code === 'NO_TR' && p.status === 'Required')) items.push({ sev: f.sev, p, text: f.code === 'NO_TR' ? 'Counted trainer — create TR ID before TOT' : f.text });
      if (p.flags.some((f) => f.code === 'MULTI_COURSE') && !p.dec) items.push({ sev: 'med', p, text: `Nominated for ${p.codes.length + p.others.length} courses; ${p.status === 'Required' ? 'counted' : p.status.toLowerCase()} on ${short(p.course)} — confirm` });
      for (const s of p.suggest) items.push({ sev: 'low', p, text: s });
    }
    return items;
  }
  function followList(N, c) {
    const h = H(); const it = followItems(N, c);
    if (!it.length) return '<p class="empty">Nothing to follow up.</p>';
    return `<ul class="flags">${it.map((i) => `<li class="sev-${i.sev}">${i.p ? `<span class="fk2">${personLink(i.p)}</span>` : ''}${h.esc(i.text)}</li>`).join('')}</ul>`;
  }
  function followups() {
    const N = RC.state.N, h = H();
    const groups = N.centres.map((c) => ({ c, it: followItems(N, c) })).filter((g) => g.it.length)
      .sort((a, b) => (b.c.state === 'None') - (a.c.state === 'None') || b.c.gap - a.c.gap);
    const un = new Map(); N.people.filter((p) => p.status === 'Unassigned').forEach((p) => { if (!un.has(p.srcLabel)) un.set(p.srcLabel, []); un.get(p.srcLabel).push(p); });
    const unHtml = [...un.entries()].map(([src, ps]) => h.section(`${src}: ${ps.length} nominations without a TC`,
      `<p class="note">Possible centres: ${ps[0].candidates.map((c) => `${centreLink(c)} (gap ${c.gap})`).join(', ') || '—'}. Call each person, then enter AssignTC in the Decisions file.</p>` + peopleTable('fu-un-' + RC.Nom.norm(src), ps, { noCentre: true, addr: true }))).join('');
    const total = groups.reduce((s, g) => s + g.it.length, 0);
    if (RC.TableExport) RC.TableExport.addSheet('Call list', [['Centre', 'TC ID', 'Centre status', 'Staffed', 'Required', 'SPOC', 'SPOC mobile', 'SPOC email', 'Severity', 'Person', 'Person mobile', 'Status', 'Course', 'Follow-up'],
      ...groups.flatMap(({ c, it }) => it.map((i) => [c.label, c.tc, c.state === 'None' ? 'No nominations' : c.state, c.filled, c.req, c.spoc || '', c.mobile || '', c.email || '', { high: 'High', med: 'Medium', low: 'Low' }[i.sev] || i.sev,
        i.p ? i.p.name : '', i.p ? i.p.mobile || i.p.mobileRaw || '' : '', i.p ? (i.p.status === 'Required' ? 'Counted' : i.p.status) : '', i.p && i.p.course ? short(i.p.course) : '', i.text]))]);
    return h.head('Follow-ups', `${total} items across ${groups.length} centres, plus ${N.m.unassigned} people waiting for a centre. Print this page as a call sheet.`, [['Nominations', '#/nom'], ['Follow-ups']]) + unHtml +
      groups.map(({ c, it }) => `<section class="card fu"><div class="card-h"><h2>${centreLink(c)} <span class="dim">${c.tc}</span></h2><span>${h.pill(c.state === 'None' ? 'No nominations' : c.state, CST[c.state])} <span class="dim">${c.filled}/${c.req}</span></span></div>
        <p class="dim">SPOC: ${h.esc(c.spoc || '—')}${c.mobile ? ' · ' + h.esc(c.mobile) : ''}${c.email ? ' · ' + h.esc(c.email) : ''}</p>${followList(N, c)}</section>`).join('');
  }

  /* ---------- Issues ---------- */
  function issues() {
    const N = RC.state.N, h = H();
    const cols = [
      { k: 'l', l: 'Level', v: (i) => ({ error: 0, warn: 1, info: 2 }[i.level]), h: (i) => h.pill(i.level, i.level === 'error' ? 'bad' : i.level === 'warn' ? 'warn' : 'mute') },
      { k: 'f', l: 'File', v: (i) => i.file || '' }, { k: 's', l: 'Sheet', v: (i) => i.sheet || '' }, { k: 'r', l: 'Row', num: 1, v: (i) => i.row || '' },
      { k: 'c', l: 'Column', v: (i) => i.field || '' }, { k: 'm', l: 'Issue', v: (i) => i.msg },
    ];
    const fc = {}; N.people.forEach((p) => p.flags.forEach((f) => { (fc[f.code] = fc[f.code] || { n: 0, sev: f.sev }).n++; }));
    const ftbl = `<table class="tbl"><thead><tr><th>Flag</th><th>Severity</th><th class="n">People</th><th>Meaning</th></tr></thead><tbody>${Object.entries(fc).sort((a, b) => (b[0] === 'NO_TR') - (a[0] === 'NO_TR') || ['high', 'med', 'low'].indexOf(a[1].sev) - ['high', 'med', 'low'].indexOf(b[1].sev) || b[1].n - a[1].n).map(([k, v]) => {
      const ex = N.people.find((p) => p.flags.some((f) => f.code === k)).flags.find((f) => f.code === k).text;
      return `<tr data-href="#/nom/people?flag=${k}"><td><b>${h.esc(FLAG_LABEL[k] || k)}</b></td><td>${h.pill(v.sev, SEV[v.sev])}</td><td class="n">${v.n}</td><td class="dim">e.g. ${h.esc(ex)}</td></tr>`;
    }).join('')}</tbody></table>`;
    return h.head('Nomination checks', 'Person-level flags from the rules, and file-level checks from reading the workbooks.', [['Nominations', '#/nom'], ['Checks']]) +
      h.section('Flags on people', ftbl) + h.section('File checks', h.table('nom-issues', cols, N.issues, { empty: 'Both workbooks read cleanly: every expected sheet and column was found.' }));
  }

  /* ---------- Exports / sources ---------- */
  function exportsView() {
    const N = RC.state.N, h = H(), s = N.sources;
    const src = (f, l) => f ? `<tr><td>${l}</td><td><b>${h.esc(f.name)}</b><div class="dim">${h.esc(f.path)}</div></td><td>${RC.fmt.dt(f.lastModified)}</td></tr>` : `<tr><td>${l}</td><td class="dim" colspan="2">none — defaults applied</td></tr>`;
    const ign = RC.state.catalog.ignored.length ? `<p class="dim">Ignored: ${RC.state.catalog.ignored.map((i) => h.esc(i.path)).join(', ')}</p>` : '';
    return h.head('Nomination exports', 'Both files are generated in the browser from the loaded workbooks.', [['Nominations', '#/nom'], ['Exports']]) +
      `<div class="exps">
        <div class="exp"><div><h3>Decisions file</h3><p class="dim">One row per person with the computed outcome, plus yellow columns for your calls: AssignTC (after phoning), AssignCourse, Decision (Required / Backup / Reject), TOTStatus, TOTDate, Notes. A Centres sheet holds inspection status.</p>
          <p>Save it in the data folder as downloaded (name starts with <code>${h.esc(RC.brand().filePrefix)}_Decisions</code>) and reload. Decisions already made are kept when you export again.</p>
          <p><b>${N.m.decided}</b> decisions currently applied${s.decisions ? ' from ' + h.esc(s.decisions.name) : ''}.</p></div>
          <button class="btn" data-act="nom-decisions">Download Decisions .xlsx</button></div>
        <div class="exp"><div><h3>Clean nominations workbook</h3><p class="dim">Summary per centre, counted trainers, backup, rejected (with reason), unassigned, every exception, and file checks. Ready to share or to send back to centres.</p>
          <p><b>${N.m.filled}</b> counted · <b>${N.m.backup}</b> backup · <b>${N.m.rejected}</b> rejected · <b>${N.m.unassigned}</b> unassigned</p></div>
          <button class="btn" data-act="nom-clean">Download clean .xlsx</button></div>
      </div>` +
      h.section('Sources used', `<table class="tbl"><thead><tr><th>Role</th><th>File</th><th>Modified</th></tr></thead><tbody>${src(s.plan, 'Plan of action')}${src(s.nominations, 'Nominations')}${src(s.decisions, 'Decisions')}${src(s.tot, 'TOT requests (portal)')}</tbody></table>${ign}`);
  }

  /* ---------- Course (CR9) ---------- */
  function courseView(q, code) {
    const N = RC.state.N, h = H(); const o = N.m.byCode[code];
    if (!o) return h.head('Not found', `Course ${h.esc(code)} is not allocated at any centre in the plan`, [['Nominations', '#/nom'], ['Not found']]);
    const cr = RC.Nom.courseOf(code);
    const tabs = `<div class="seg">${Object.keys(N.m.byCode).map((k) => `<a class="segl ${k === code ? 'on' : ''}" href="#/nom/course/${k}">${h.esc(short(k))}</a>`).join('')}</div>`;
    const kp = `<div class="kpis">
      ${h.kpi('Batches staffed', `${o.filled}<small>/${o.req}</small>`, o.gap ? `<b class="c-warn">gap ${o.gap}</b> at ${o.shortCentres.length} centre${o.shortCentres.length > 1 ? 's' : ''}` : 'requirement met', h.ratio(o.filled, o.req), o.gap ? 'warn' : 'good')}
      ${h.kpi('Centres', o.centres, `${o.centres - o.shortCentres.length} fully staffed${o.caafPending ? ` · ${o.caafPending} CAAF pending` : ''}`)}
      ${h.kpi('Trainers with TR ID', `${o.withTR}<small>/${o.filled}</small>`, `${o.filled - o.withTR} still need one`, h.ratio(o.withTR, o.filled), 'info')}
      ${h.kpi('TOT completed', `${o.tot}<small>/${o.filled}</small>`, `${o.totReq} requested${o.totWrong ? ` · <b class="c-bad">${o.totWrong} wrong course</b>` : ''}`)}
      ${h.kpi('Backup', o.backup, 'beyond 1 per batch')}
      ${h.kpi('Pool', o.pool.length, 'nominated where course not allocated')}</div>`;
    const cols = [
      { k: 'c', l: 'Centre', v: (x) => x.c.label, h: (x) => `<b>${h.esc(x.c.label.replace(/^GTTC /, ''))}</b><div class="dim">${x.c.tc}${x.c.caafDone ? '' : ' · <span class="c-bad">CAAF pending</span>'}</div>` },
      { k: 's', l: 'Staffed', num: 1, v: (x) => h.ratio(x.b.filled, x.b.req), h: (x) => `${x.b.filled}/${x.b.req} ${h.bar(h.ratio(x.b.filled, x.b.req), x.b.gap ? 'warn' : 'good')}` },
      { k: 'g', l: 'Gap', num: 1, v: (x) => x.b.gap, h: (x) => (x.b.gap ? `<b class="c-warn">${x.b.gap}</b>` : '') },
      { k: 'b', l: 'Backup', num: 1, v: (x) => x.b.backup, h: (x) => x.b.backup || '' },
      { k: 't', l: 'No TR ID', num: 1, v: (x) => x.c.requiredPeople.filter((p) => p.course === code && !p.tr).length, h: (x) => { const n = x.c.requiredPeople.filter((p) => p.course === code && !p.tr).length; return n ? `<span class="c-bad">${n}</span>` : ''; } },
      { k: 'n', l: 'Trainers', v: (x) => x.c.requiredPeople.filter((p) => p.course === code).length, h: (x) => x.c.requiredPeople.filter((p) => p.course === code).map((p) => personLink(p) + (p.tr ? '' : ' <span class="pill t-bad">no TR</span>') + (p.totWrong ? ' <span class="pill t-bad">TOT wrong course</span>' : p.totAsked ? ' <span class="pill t-info">TOT requested</span>' : '')).join('<br>') || '<span class="dim">—</span>' },
    ];
    const ctab = h.table('course-' + code, cols, o.rows, { href: (x) => `#/nom/centre/${x.c.tc}`, sort: { k: 'g', d: -1 } });
    const map = RC.NomMap.svg(N, { course: code, labels: true, interactive: true });
    const poolNote = o.pool.length ? `<p class="note">Nominated for ${h.esc(short(code))} at centres that don't run it. Short centres for this course: ${o.shortCentres.slice(0, 8).map((x) => `${h.esc(x.c.label.replace(/^GTTC /, ''))} (−${x.b.gap})`).join(', ') || 'none'}.</p>` : '';
    return h.head(cr.name, `${code} · allocated at ${o.centres} centres · ${o.req} batches · ${num(o.req * RC.NOM.rules.seatsPerBatch)} seats · ${o.received} nominations received`, [['Nominations', '#/nom'], [short(code)]], tabs) + kp +
      `<div class="mapwrap"><section class="card"><div class="card-h"><h2>Centres running this course</h2></div>${ctab}</section><section class="card">${map}</section></div>` +
      h.section(`Counted trainers (${o.trainers.length})`, peopleTable('ct-' + code, o.trainers, {})) +
      (o.backups.length ? h.section(`Backup (${o.backups.length})`, peopleTable('cb-' + code, o.backups, {})) : '') +
      (o.pool.length ? h.section(`Pool: nominated where the course isn't allocated (${o.pool.length})`, poolNote + peopleTable('cp-' + code, o.pool, {})) : '');
  }

  /* ---------- Map (CR3) ---------- */
  function mapView() {
    const N = RC.state.N, h = H(); const mode = ui.mapMode || 'staff';
    const seg = `<div class="seg">${Object.entries(RC.NomMap.MODES).map(([k, v]) => `<button data-act="map-mode" data-mode="${k}" class="${mode === k ? 'on' : ''}">${h.esc(v.label)}</button>`).join('')}</div>`;
    const course = ui.mapCourse || '';
    const cseg = `<div class="seg">${['', ...Object.keys(N.m.byCode)].map((k) => `<button data-act="map-course" data-course="${k}" class="${course === k ? 'on' : ''}">${k ? h.esc(short(k)) : 'All courses'}</button>`).join('')}</div>`;
    const cls = course ? (c) => { const b = c.byCourse.find((x) => x.code === course); return b ? (b.gap === 0 ? 'full' : b.filled ? 'partial' : 'none') : 'na'; } : RC.NomMap.MODES[mode].cls;
    const legendList = course ? [['full', 'Course fully staffed'], ['partial', 'Short'], ['none', 'No trainer'], ['na', 'Course not allocated']] : RC.NomMap.MODES[mode].legend;
    const tipOf = course ? (c) => { const b = c.byCourse.find((x) => x.code === course); return b ? `${b.filled}/${b.req} ${course} batches staffed` : 'not allocated'; } : RC.NomMap.MODES[mode].tip;
    const lists = legendList.map(([k, l]) => {
      const cs = N.centres.filter((c) => cls(c) === k).sort((a, b) => b.gap - a.gap || a.label.localeCompare(b.label));
      if (!cs.length) return '';
      return `<div class="mlist"><h3><i class="lg-${k}"></i>${h.esc(l)} <span class="dim">${cs.length} centres · ${cs.reduce((s, c) => s + c.req, 0)} batches</span></h3>
        <ul>${cs.map((c) => `<li><a href="#/nom/centre/${c.tc}">${h.esc(c.label.replace(/^GTTC /, ''))}</a> <span class="dim">${h.esc(tipOf(c))}</span>${c.caafDone ? '' : ' <span class="pill t-bad">CAAF</span>'}${c.coordExact ? '' : ''}</li>`).join('')}</ul></div>`;
    }).join('');
    const exact = N.centres.filter((c) => c.coordExact).length;
    return h.head('Centre map', `${N.centres.length} centres · pin size and number = batches planned · ${exact ? exact + ' exact, ' : ''}${N.centres.length - exact} approximate (town level) locations`, [['Nominations', '#/nom'], ['Map']], `<div class="mapctl">${cseg}${course ? '' : seg}</div>`) +
      `<div class="mapwrap"><section class="card">${RC.NomMap.svg(N, { mode, course: course || null, labels: true, interactive: true })}</section><section class="card mlists">${lists}
        <p class="dim">Exact pins: add Latitude and Longitude on the Centres sheet of the Decisions file (for example from the CAAF geo-tagged photos).</p></section></div>`;
  }

  ui.actions = Object.assign(ui.actions || {}, { 'map-mode': (el) => { ui.mapMode = el.dataset.mode; RC.Views.render(); }, 'map-course': (el) => { ui.mapCourse = el.dataset.course; RC.Views.render(); } });
  ui.actions = Object.assign(ui.actions || {}, { 'nom-decisions': () => RC.NomExport.run('decisions'), 'nom-clean': () => RC.NomExport.run('clean') });

  RC.Views.addRoutes([
    [/^\/nom$/, overview], [/^\/nom\/centre\/([^/]+)$/, centre], [/^\/nom\/people$/, people], [/^\/nom\/person\/(.+)$/, person],
    [/^\/nom\/followups$/, followups], [/^\/nom\/tot$/, totView], [/^\/nom\/map$/, mapView], [/^\/nom\/course\/([^/]+)$/, courseView], [/^\/nom\/issues$/, issues], [/^\/nom\/exports$/, exportsView],
  ]);

  document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('fdrop')) ui.fdropOpen = e.target.open; }, true);
  document.addEventListener('click', (e) => { const d = document.querySelector('details.fdrop[open]'); if (d && !d.contains(e.target)) { d.open = false; ui.fdropOpen = false; } });
  document.addEventListener('change', (e) => { if (e.target.id === 'nomcourse') location.hash = e.target.value; });
  // live search on the People page (keeps focus while re-rendering)
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'nomq' && e.target.id !== 'totq') return;
    const id = e.target.id; const pos = e.target.selectionStart; ui.filter[id] = e.target.value; RC.Views.render();
    const el = document.getElementById(id); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  });
})(window);
