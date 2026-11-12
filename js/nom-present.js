/* ============================================================
   CR6 — Management presentation (route #/nom/present)
   Slides are built live from RC.state.N. Arrow keys / buttons
   step through; Print gives a PDF deck, one A4 landscape slide
   per page. Slide titles state the conclusion; numbers below.
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});
  const ui = (RC.ui = RC.ui || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F = () => RC.fmt;
  const num = (n) => Number(n || 0).toLocaleString('en-IN');
  const pc = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const short = (k) => RC.Nom.courseOf(k).short;
  const nm = (c) => c.label.replace(/^GTTC /, '');
  const d = (x) => (x ? F().date(x) : '—');
  const dshort = (x) => (x ? F().short(x) : '—');
  const days = (a, b) => Math.round((b - a) / 864e5);
  const list = (arr, max = 6) => (arr.length <= max ? arr.join(', ') : arr.slice(0, max).join(', ') + ` and ${arr.length - max} more`);

  /* ---------- shared helpers (also used by the PPTX builder) ---------- */
  const DK = () => RC.NOM.deck || {};
  const logoUrl = () => { const l = DK().logo; if (!l) return null; const k = l.split('/').pop().toLowerCase(); return ((RC.state && RC.state.assets) || {})[k] || null; };
  const BR = () => (RC.brand ? RC.brand() : Object.assign({ name: '', filePrefix: 'Deck' }, RC.NOM.brand || {}));
  // Working days (Mon–Fri) strictly between today and the due date — not counting today or the due day.
  function workingDaysLeft(today, due) {
    if (!due) return null; let n = 0; const x = new Date(today);
    for (x.setDate(x.getDate() + 1); x < due; x.setDate(x.getDate() + 1)) { const w = x.getDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }
  const ownerOf = (mi) => (mi ? mi.owner + (mi.team ? ' / ' + mi.team : '') : '—');
  function asks(N) {
    const m = N.m, B = N.bands, ms = Object.fromEntries(N.milestones.map((x) => [x.gate, x]));
    const cp = N.centres.filter((c) => !c.caafDone);
    const D = (g) => ms[g] && ms[g].dueDate;
    const T = { gap: m.gap, shortCentres: B.partial.n + B.none.n, noTR: m.noTRcounted, filled: m.filled, required: m.required, centres: m.centres,
      caafCount: cp.length, caafCentres: list(cp.map(nm), 8), caafBatches: cp.reduce((s, c) => s + c.req, 0), mobilisable: m.mobilisable, totReq: m.totReq, totWrong: m.totWrong, totNotYet: m.filled - m.totReq };
    for (const g of ['trainer', 'tr', 'tot', 'insp', 'students']) { T[g + 'Due'] = dshort(D(g)); T[g + 'DueLong'] = d(D(g)); }
    const fill = (t) => String(t || '').replace(/\{(\w+)\}/g, (x, k) => (T[k] != null ? T[k] : x));
    return (DK().asks || []).filter((a) => !a.when || T[a.when] > 0).map((a) => ({ owner: a.owner, text: fill(a.text), help: fill(a.help), helpList: (a.helpList || []).map(fill) }));
  }

  /* ---------- slides ---------- */
  function slides(N) {
    const m = N.m, S = RC.NOM.rules.seatsPerBatch, today = new Date(new Date().toDateString());
    const L = Object.fromEntries(N.ladder.map((x) => [x.id, x]));
    const ms = Object.fromEntries(N.milestones.map((x) => [x.gate, x]));
    const B = N.bands, caafPending = N.centres.filter((c) => !c.caafDone);
    const caafPendingFull = caafPending.filter((c) => c.band === 'full');
    const caafBatches = caafPending.reduce((s, c) => s + c.req, 0);
    const shortC = N.centres.filter((c) => c.gap > 0).sort((a, b) => b.gap - a.gap || nm(a).localeCompare(nm(b)));
    const out = [];

    // 1 — cover
    out.push({ id: 'cover', cls: 'cover', html: `
      ${logoUrl() ? `<img class="cv-logo" src="${esc(logoUrl())}" alt="${esc(BR().name)}">` : ''}
      <div class="cv-org">${esc(DK().org || '')}</div>
      <h1>${esc(DK().title || 'Trainer readiness')}</h1>
      <p class="cv-sub">${N.centres.length} GTTC centres in Karnataka · ${m.required} batches · ${num(m.required * S)} seats</p>
      <ul class="cv-list"><li>Data as of ${d(N.asOf)}</li><li>Prepared ${d(today)}</li><li>${esc(DK().startLabel || 'Planned batch start')} ${d(N.firstStart)}</li></ul>
      <p class="cv-srcs">Sources: ${esc(N.sources.plan.name)}; ${esc(N.sources.nominations.name)}${N.sources.decisions ? '; ' + esc(N.sources.decisions.name) + ` (${m.decided} manual decisions)` : ''}${N.sources.tot ? '; ' + esc(N.sources.tot.name) : ''}</p>` });

    // 2 — headline
    const PH = { caaf: 'CAAF', insp: 'inspection', trainer: 'trainer mapping', tr: 'TR IDs', tot: 'TOT', students: 'student onboarding' };
    const and = (a) => a.join(', ').replace(/, ([^,]*)$/, ' and $1');
    const zeroGates = N.ladder.filter((x) => x.id !== 'planned' && x.alone === 0).map((x) => PH[x.id] || x.short);
    const startTxt = `planned start ${dshort(N.firstStart)}`;
    const head = m.ready > 0
      ? `${m.ready} of ${m.required} batches are ready to start; trainers are mapped for ${m.filled}`
      : `Trainers are mapped for ${m.filled} of ${m.required} batches (${pc(m.filled, m.required)}% of seats); ${zeroGates.length ? and(zeroGates) + ' are still to complete before the ' + startTxt : 'remaining gates close before the ' + startTxt}`;
    out.push({ id: 'headline', title: head, html: `
      <div class="big4">
        <div><b>${m.filled}<small>/${m.required}</small></b><span>batches with a trainer</span><em>${num(m.filled * S)} of ${num(m.required * S)} seats</em></div>
        <div><b>${B.full.n}<small>/${m.centres}</small></b><span>centres fully staffed</span><em>${B.full.batches} batches; ${B.partial.n} centres short by ${m.gap}</em></div>
        <div><b>${m.noTRcounted}</b><span>mapped trainers without TR ID</span><em>due ${dshort(ms.tr && ms.tr.dueDate)}, before TOT</em></div>
        <div class="${m.ready ? '' : 'alert'}"><b>${m.ready}</b><span>batches ready to start today</span><em>inspection by ${dshort(ms.insp && ms.insp.dueDate)}, TOT ${dshort(ms.tot && ms.tot.dueDate)}, students by ${dshort(ms.students && ms.students.dueDate)}</em></div>
      </div>
      <ul class="keys">
        <li><b>CAAF:</b> ${m.caafDone} of ${m.centres} centres submitted; ${caafPending.length} await an NSDC technical fix${caafPendingFull.length ? ` — ${caafPendingFull.length === caafPending.length ? 'all' : caafPendingFull.length} fully staffed (${caafBatches} batches waiting only on NSDC)` : ''}.</li>
        <li><b>Nominations:</b> ${num(m.received)} received, ${num(m.unique)} unique people; ${m.filled} fit an allocated course and batch, ${m.backup} kept as backup, ${m.rejected} for courses not allocated to that centre.</li>
        <li><b>${esc(DK().startLabel || 'Planned batch start')}:</b> ${d(N.firstStart)}</li>
      </ul>` });

    // 3 — readiness gates, in process order. Bar = batches that have cleared that gate on its own; right = cleared it and every gate above.
    const max = L.planned.n || 1;
    const why = {
      caaf: `${caafBatches} batches at ${caafPending.length} centres awaiting NSDC CAAF fix: ${list(caafPending.map(nm))}`,
      insp: `NSDC inspection due by ${dshort(ms.insp && ms.insp.dueDate)}; ${m.inspected} of ${m.centres} centres done`,
      trainer: `${m.gap} batches have no trainer yet (${B.partial.n + B.none.n} centres short); due ${dshort(ms.trainer && ms.trainer.dueDate)}`,
      tr: `${m.noTRcounted} mapped trainers need a TR ID; due ${dshort(ms.tr && ms.tr.dueDate)}`,
      tot: `TOT planned for ${dshort(ms.tot && ms.tot.dueDate)}; ${m.totReq} of ${m.filled} mapped trainers requested${m.totWrong ? ` (${m.totWrong} for the wrong course)` : ''}; ${m.tot} completed`,
      students: `Student onboarding due by ${dshort(ms.students && ms.students.dueDate)}; ${m.onboarded} batches onboarded`,
    };
    const gates = N.ladder.filter((x) => x.id !== 'planned');
    const rows = gates.map((x, i) => {
      const mile = ms[x.id]; const pend = L.planned.n - x.alone;
      return `<div class="lad ${x.alone === 0 ? 'zero' : ''}"><div class="ld-l"><b>${i + 1}. ${esc(x.label)}</b>${mile ? `<span>${mile.dueDate ? 'due ' + dshort(mile.dueDate) + ' · ' : ''}${esc(mile.owner)}</span>` : ''}</div>
        <div class="ld-bar"><i style="width:${(x.alone / max) * 100}%"></i></div><div class="ld-v"><b>${x.alone}</b><span>of ${L.planned.n} batches</span></div>
        <div class="ld-c"><b>${x.n}</b><span>with all gates so far</span></div>
        <div class="ld-d">${x.id === 'tr' ? '' : pend ? `<b>${pend} pending</b> ` : '<b class="ok">done</b> '}${esc(why[x.id] || '')}</div></div>`;
    }).join('');
    const partial = gates.filter((x) => x.alone > 0 && x.alone < L.planned.n).map((x) => `${PH[x.id]} ${x.alone}`), zero = gates.filter((x) => x.alone === 0).map((x) => PH[x.id]);
    out.push({ id: 'ladder', title: `<b>Batch readiness:</b> <span class="tn">${and(partial)} of ${L.planned.n} batches through; ${and(zero)} still at zero</span>`, lead: 'Batch readiness:',
      html: `<p class="lede">Gates in process order. Bar and first number: batches that have cleared that gate. Second number: batches that have cleared it and every gate above it. A batch starts only when it clears all six (${m.ready} today; planned start ${d(N.firstStart)}).</p><div class="ladder six">${rows}</div>` });

    // 4 — distribution
    const band = (k, title, cls) => {
      const b = B[k]; if (!b.n) return '';
      const cs = b.centres.slice().sort((x, y) => y.gap - x.gap || nm(x).localeCompare(nm(y)));
      return `<div class="bandcol ${cls}"><h3>${title}</h3><div class="bc-n"><b>${b.n}</b> centres · <b>${b.batches}</b> batches · <b>${b.staffed}</b> staffed${b.noTR ? ` · ${b.noTR} without TR ID` : ''}</div>
        <ul>${cs.map((c) => `<li><span>${esc(nm(c))}${c.caafDone ? '' : ' <i class="tagx">CAAF</i>'}</span><em>${c.filled}/${c.req}${c.gap ? ` <u>−${c.gap}</u>` : ''}</em></li>`).join('')}</ul></div>`;
    };
    const bc = Object.values(m.byCode);
    out.push({ id: 'distribution', title: `${B.full.n} centres are fully staffed (${B.full.batches} batches); ${B.partial.n} are short by ${m.gap} trainers${B.none.n ? `; ${B.none.n} have none` : ''}`,
      html: `<div class="bands">${band('full', 'Fully staffed', 'b-full')}${band('partial', 'Short of trainers', 'b-partial')}${band('none', 'No trainers', 'b-none')}
        <div class="bandcol b-course"><h3>By course</h3><table><tr><th></th><th>Batches</th><th>Staffed</th><th>Gap</th></tr>${bc.map((b) => `<tr><td>${esc(short(b.code))}</td><td>${b.req}</td><td>${b.filled}</td><td class="${b.req - b.filled ? 'gap' : ''}">${b.req - b.filled || '—'}</td></tr>`).join('')}
          <tr class="tot"><td>Total</td><td>${m.required}</td><td>${m.filled}</td><td class="gap">${m.gap}</td></tr></table>
          ${caafPending.length ? `<p class="note"><i class="tagx">CAAF</i> = CAAF awaiting NSDC fix (${caafPending.length} centres, ${caafBatches} batches).</p>` : ''}</div></div>` });

    // 4b — by course (CR9): all courses on one slide
    const cs = Object.values(m.byCode).sort((a, b) => b.gap - a.gap || b.req - a.req);
    const gapTop = cs.filter((o) => o.gap > 0);
    const top2 = gapTop.slice(0, 2), top2gap = top2.reduce((s, o) => s + o.gap, 0);
    const ctitle = m.gap ? (top2.length === 2 && top2gap >= m.gap * 0.8 ? `${short(top2[0].code)} and ${short(top2[1].code)} carry ${top2gap} of the ${m.gap}-batch gap` : `Trainer gap by course: ${gapTop.map((o) => `${short(o.code)} ${o.gap}`).join(', ')}`) : 'All courses fully staffed';
    out.push({ id: 'courses', title: esc(DK().courseSlideTitle || ctitle), html: `<div class="ccards">${cs.map((o) => `<div class="ccard ${o.gap ? 'short' : 'ok'}">
        <h3>${esc(RC.Nom.courseOf(o.code).name)}</h3><div class="cc-sub">${o.centres} centre${o.centres > 1 ? 's' : ''} · ${o.req} batches · ${num(o.req * S)} seats</div>
        <div class="cc-row"><div class="cc-big"><b>${o.filled}<small>/${o.req}</small></b><span>batches staffed</span></div><div class="cc-big ${o.gap ? 'gap' : ''}"><b>${o.gap || '—'}</b><span>gap</span></div><div class="cc-big"><b>${o.withTR}<small>/${o.filled}</small></b><span>with TR ID</span></div><div class="cc-big"><b>${o.backup}</b><span>backup</span></div></div>
        <div class="cc-bar"><i style="width:${o.req ? (o.filled / o.req) * 100 : 0}%"></i></div>
        <p>${o.gap ? `<b>Short at ${o.shortCentres.length}:</b> ${esc(list(o.shortCentres.map((x) => `${nm(x.c)} −${x.b.gap}`), 7))}` : 'Every allocated batch has a trainer.'}${o.pool.length ? ` · ${o.pool.length} nominated where not allocated.` : ''}</p></div>`).join('')}</div>` });

    // 5 — map
    const north = (c) => c.latlon && c.latlon[0] >= 15.0;
    const gN = N.centres.filter(north).reduce((s, c) => s + c.gap, 0), gS = m.gap - gN;
    out.push({ id: 'map', title: `Shortfall is spread across ${B.partial.n} centres: ${gN} batches in north Karnataka, ${gS} in the south`,
      html: `<div class="mapslide"><div class="ms-map">${RC.NomMap.svg(N, { mode: 'staff', labels: true, noLegend: true })}</div>
        <div class="ms-side"><div class="mlegend v"><span><i class="lg-full"></i>Fully staffed <b>${B.full.n}</b></span><span><i class="lg-partial"></i>Short of trainers <b>${B.partial.n}</b></span>${B.none.n ? `<span><i class="lg-none"></i>No trainers <b>${B.none.n}</b></span>` : ''}<span><i class="lg-ring"></i>CAAF awaiting NSDC <b>${caafPending.length}</b></span></div>
          <p class="dim">Pin size and number = batches planned. Locations approximate (town level). North = above 15° N (roughly north of Hubballi–Hospet).</p>
          <h4>Largest gaps</h4><ul class="gaps">${shortC.slice(0, 7).map((c) => `<li><span>${esc(nm(c))}</span><em>${c.byCourse.filter((b) => b.gap).map((b) => `${esc(short(b.code))} −${b.gap}`).join('<br>')}</em></li>`).join('')}</ul>${shortC.length > 7 ? `<p class="note">+ ${shortC.length - 7} more centres short by 1 or more — see Appendix A.</p>` : ''}</div></div>` });

    // 6 — gaps & owners
    const sq = N.sequencing;
    const gapRows = [
      ['Trainer nominations', `${m.gap} batches at ${B.partial.n + B.none.n} centres`, ms.trainer, `Courses: ${bc.filter((b) => b.req > b.filled).map((b) => `${short(b.code)} ${b.req - b.filled}`).join(', ')}`],
      ['TR IDs', `${m.noTRcounted} mapped trainers`, ms.tr, `${N.centres.filter((c) => c.requiredPeople.some((p) => !p.tr)).length} centres affected`],
      ['TOT', `${m.filled - m.totReq} mapped trainers yet to request (+ new nominees)`, ms.tot, `${m.totReq} requested${m.totWrong ? ` · ${m.totWrong} wrong course` : ''} · ${m.tot} completed`],
      ['CAAF technical issue', `${caafPending.length} centres, ${caafBatches} batches`, ms.caaf, list(caafPending.map(nm))],
      ['NSDC inspection', `${m.centres - m.inspected} centres`, ms.insp, `${m.inspected} done`],
      ['Student onboarding', `${m.required - m.onboarded} batches (${num((m.required - m.onboarded) * S)} seats)`, ms.students, `can begin now for ${m.mobilisable} batches with a trainer + TR ID at CAAF-submitted centres`],
    ];
    const totDue = ms.tot && ms.tot.dueDate;
    const dueByTot = N.milestones.filter((x) => x.dueDate && totDue && x.dueDate <= totDue).length;
    out.push({ id: 'gaps', title: `${['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'][gapRows.length] || gapRows.length} gaps stand between today and the ${d(N.firstStart)} start; ${dueByTot} must close by ${dshort(totDue)}`,
      html: `<table class="gtab"><tr><th>Gap</th><th>Size</th><th>Owner</th><th>Due</th><th>Detail</th></tr>${gapRows.map(([g, sz, mi, det]) => `<tr><td><b>${g}</b></td><td>${esc(sz)}</td><td>${esc(ownerOf(mi))}</td><td>${mi && mi.dueDate ? d(mi.dueDate) : esc(mi && mi.note ? mi.note : '—')}</td><td class="dim">${esc(det)}</td></tr>`).join('')}</table>
        ${DK().showSequencingOption && sq.coverable ? `<div class="callout"><b>Option checked: one trainer running two batches in sequence.</b> It would cover ${sq.coverable} of the ${m.gap} unstaffed batches, but the second batch would finish around ${d(sq.secondBatchEnds)}${sq.planEnd ? `, after the plan window ends (${d(sq.planEnd)})` : ''}. ${sq.viable ? 'It fits the window and can be used where nominations are hard to get.' : 'Not viable within the plan; the missing nominations are needed.'}</div>` : ''}` });

    // 7 — timeline
    const evs = [
      { dt: today, l: 'Today', k: 'now' },
      ...N.milestones.filter((x) => x.dueDate).map((x) => ({ dt: x.dueDate, l: x.label, k: 'ms', x })),
      ...(N.firstStart ? [{ dt: N.firstStart, l: DK().startLabel || 'Planned batch start', k: 'start' }] : []),
    ].sort((a, b) => a.dt - b.dt);
    const starts = new Map(); for (const s of N.slots) if (s.start) { const k = F().iso(s.start); const o = starts.get(k) || { dt: s.start, n: 0, staffed: 0 }; o.n++; if (s.trainer) o.staffed++; starts.set(k, o); }
    const st0 = [...starts.values()].sort((a, b) => a.dt - b.dt);
    const t0 = evs[0].dt, t1 = st0.length ? st0[st0.length - 1].dt : evs[evs.length - 1].dt, span = Math.max(1, days(t0, t1));
    const X = (dt) => 40 + (days(t0, dt) / span) * 960;
    const st = []; for (const b of st0) { const p = st[st.length - 1]; if (p && X(b.dt) - X(p.last) < 70) { p.n += b.n; p.staffed += b.staffed; p.last = b.dt; } else st.push({ ...b, last: b.dt }); }
    for (const e of evs) if (e.x && e.x.tl) e.l = e.x.tl;
    const merged = []; for (const e of evs) { const p = merged[merged.length - 1]; if (p && F().iso(p.dt) === F().iso(e.dt)) p.l += ' + ' + e.l; else merged.push({ ...e }); }
    const lanes = [28, 108, -2, 138]; const lastX = {};
    for (const e of merged) { const x = X(e.dt); let li = 0; while (li < lanes.length - 1 && lastX[li] != null && x - lastX[li] < 150) li++; e.ly = lanes[li]; lastX[li] = x; }
    const tl = `<svg class="tl" viewBox="0 -20 1040 260"><line x1="40" y1="70" x2="1000" y2="70"/>
      ${merged.map((e, i) => `<g class="tl-${e.k}"><circle cx="${X(e.dt)}" cy="70" r="8"/><line class="tk" x1="${X(e.dt)}" y1="70" x2="${X(e.dt)}" y2="${e.ly < 70 ? e.ly + 24 : e.ly - 14}"/><text x="${X(e.dt)}" y="${e.ly}" text-anchor="middle"><tspan font-weight="700">${dshort(e.dt)}</tspan><tspan x="${X(e.dt)}" dy="17">${esc(e.l)}</tspan></text></g>`).join('')}
      ${st.map((s) => `<g class="tl-b"><rect x="${X(s.dt) - 16}" y="${222 - s.n * 0.85}" width="32" height="${s.n * 0.85}"/><rect class="st" x="${X(s.dt) - 16}" y="${222 - s.staffed * 0.85}" width="32" height="${s.staffed * 0.85}"/><text x="${X(s.dt) > 860 ? X(s.dt) - 22 : X(s.dt) + 22}" y="${222 - s.n * 0.85 + 12}" text-anchor="${X(s.dt) > 860 ? 'end' : 'start'}">${s.staffed}/${s.n} staffed</text><text x="${X(s.dt)}" y="238" text-anchor="middle" class="dim">starts ${dshort(s.dt)}${F().iso(s.last) !== F().iso(s.dt) ? '–' + dshort(s.last) : ''}</text></g>`).join('')}</svg>`;
    const lastDue = N.milestones.filter((x) => x.dueDate).sort((a, b) => b.dueDate - a.dueDate)[0];
    const slack = lastDue && N.firstStart ? days(lastDue.dueDate, N.firstStart) : null;
    out.push({ id: 'timeline', title: slack != null ? `${slack} days of slack between the last milestone (${esc((lastDue.tl || lastDue.label).toLowerCase())}, ${dshort(lastDue.dueDate)}) and the planned start (${dshort(N.firstStart)})` : 'Timeline to first batch start',
      html: `${tl}<p class="lede">Bars: batches by start date${N.agreedStart ? ` (plan dates before ${dshort(N.agreedStart)} moved to the planned start)` : ''} — dark = staffed with a trainer today, light = no trainer yet.</p>
        <table class="gtab mtab"><tr><th>Milestone</th><th>Due</th><th>Working Days left</th><th>Done</th><th>Owner</th></tr>${N.milestones.map((x) => `<tr><td>${esc(x.label)}</td><td>${x.dueDate ? d(x.dueDate) : esc(x.note || '—')}</td><td>${x.dueDate ? workingDaysLeft(today, x.dueDate) : '—'}</td><td>${x.done}/${x.total} ${esc(x.unit)}</td><td>${esc(x.owner)}</td></tr>`).join('')}</table>` });

    // 8 — asks
    out.push({ id: 'asks', title: 'Decisions and support needed', html: `<ol class="asks">${asks(N).map((a) => `<li><span class="ow">${esc(a.owner)}</span><span>${esc(a.text)}${a.help ? ` <span class="help">${esc(a.help)}</span>` : ''}${a.helpList.length ? `<span class="help hl">${a.helpList.map((t, k) => `${k + 1}. ${esc(t)}`).join('<br>')}</span>` : ''}</span></li>`).join('')}</ol>` });

    // A1 — centre table
    out.push({ id: 'appx-centres', cls: 'appx', title: 'Appendix A — Centre-wise status', html: `<table class="atab"><tr><th>Centre</th><th>TC ID</th><th>CAAF</th><th>Batches</th><th>Staffed</th><th>Gap</th><th>No TR ID</th><th>By course</th></tr>
      ${N.centres.slice().sort((a, b) => nm(a).localeCompare(nm(b))).map((c) => `<tr><td>${esc(nm(c))}</td><td>${c.tc}</td><td class="${c.caafDone ? '' : 'gap'}">${c.caafDone ? 'Submitted' : 'Awaiting NSDC'}</td><td>${c.req}</td><td>${c.filled}</td><td class="${c.gap ? 'gap' : ''}">${c.gap || ''}</td><td>${c.requiredPeople.filter((p) => !p.tr).length || ''}</td><td>${c.byCourse.map((b) => `${b.code} ${b.filled}/${b.req}`).join(' · ')}</td></tr>`).join('')}</table>` });

    // A2 — nomination clean-up
    const fc = {}; N.people.forEach((p) => p.flags.forEach((f) => { if (f.sev !== 'low') fc[f.code] = (fc[f.code] || 0) + 1; }));
    if (fc.NO_TR) fc.NO_TR = m.noTRcounted; if (!fc.NO_TR) delete fc.NO_TR;
    out.push({ id: 'appx-data', cls: 'appx', title: 'Appendix B — How nominations were counted', html: `
      <div class="cleanup">${[['Nominations received', m.received], ['Unique people (by mobile)', m.unique], ['Fit an allocated course', m.filled + m.backup], ['Counted, 1 per batch', m.filled]].map(([l, v]) => `<div><b>${num(v)}</b><span>${l}</span></div>`).join('<i>→</i>')}</div>
      <ul class="keys"><li>Required trainers = target seats ÷ ${S} for each course at each centre (1 trainer per batch).</li>
        <li>Extra nominations for a course are kept as <b>backup</b> (${m.backup}); nominations for a course not allocated to that centre are <b>rejected</b> (${m.rejected}).</li>
        <li>A person nominated for several courses is counted once, on the course with the biggest shortfall (${m.multiCourse} people).</li>
        <li>Open data issues: ${Object.entries(fc).map(([k, v]) => `${v} ${({ SHARED_TR: 'same TR ID on 2 people', NO_MOBILE: 'missing mobile', BAD_MOBILE: 'invalid mobile', MULTI_COURSE: 'on more than one course', NOT_ALLOCATED: 'course not allocated', NONSTANDARD: 'unknown course name', SAME_NAME: 'possible duplicate', NO_DETAIL: 'without detail row', DOB_ODD: 'implausible DOB', NO_TR: 'counted without TR ID', UNASSIGNED: 'centre not confirmed', OVER_REQ: 'over requirement', MULTI_TC: 'nominated by 2 TCs', DECISION_INVALID: 'decision not applied' })[k] || k}`).join(' · ')}.</li>
        <li>Eligibility of nominees is assumed for now; to be reviewed.</li></ul>` });
    return out;
  }

  /* ---------- render ---------- */
  function present(q) {
    const N = RC.state.N;
    const all = slides(N); const n = all.length;
    ui.slide = Math.max(0, Math.min(n - 1, ui.slide || 0));
    const foot = (i) => `<footer><span>${esc(BR().name)} · Trainer readiness · data as of ${d(N.asOf)}</span><span>${i + 1} / ${n}</span></footer>`;
    const deck = all.map((s, i) => `<section class="slide ${s.cls || ''} ${i === ui.slide ? 'on' : ''}" data-i="${i}">${s.title ? `<h2>${s.title}</h2>` : ''}<div class="sb">${s.html}</div>${foot(i)}</section>`).join('');
    RC.state.viewTitle = 'Trainer readiness'; RC.state.crumbs = ['Presentation'];
    return `<div class="deck-bar"><button class="btn ghost" data-act="deck-exit">✕ Exit</button><span class="grow"></span>
      <button class="btn ghost" data-act="deck-prev">←</button><span class="deck-n">${ui.slide + 1} / ${n}</span><button class="btn ghost" data-act="deck-next">→</button>
      <span class="grow"></span><button class="btn ghost" data-act="deck-xl" title="Download the tables in this deck as Excel">⤓ Excel</button><button class="btn" data-act="deck-print">Print / PDF (all slides)</button></div>
      <div class="deck" id="deck">${deck}</div>`;
  }
  function fit() {
    const dk = document.getElementById('deck'); if (!dk) return;
    const sc = Math.min((innerWidth - 40) / 1123, (innerHeight - 90) / 794);
    dk.style.setProperty('--sc', Math.max(0.3, sc).toFixed(3));
  }
  function go(delta) {
    const els = document.querySelectorAll('#deck .slide'); if (!els.length) return;
    ui.slide = Math.max(0, Math.min(els.length - 1, (ui.slide || 0) + delta));
    els.forEach((e, i) => e.classList.toggle('on', i === ui.slide));
    const nEl = document.querySelector('.deck-n'); if (nEl) nEl.textContent = `${ui.slide + 1} / ${els.length}`;
  }
  ui.actions = Object.assign(ui.actions || {}, {
    'deck-next': () => go(1), 'deck-prev': () => go(-1), 'deck-exit': () => (location.hash = '#/nom'),
    'deck-xl': () => RC.TableExport.downloadPage(),
    'deck-print': () => { const old = document.title; document.title = `${BR().filePrefix}_Trainer_readiness_${F().iso(RC.state.N.asOf)}`; window.print(); document.title = old; },
  });
  addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('presenting')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1); }
    if (e.key === 'Home') { ui.slide = 0; go(0); }
    if (e.key === 'Escape') location.hash = '#/nom';
  });
  addEventListener('resize', fit);
  new MutationObserver(fit).observe(document.documentElement, { childList: true, subtree: true });

  const localOnly = () => RC.Views.h.head('Presentation', 'The presentation is available only when the tracker is opened from your own computer.', [['Nominations', '#/nom'], ['Presentation']]);
  RC.Views.addRoutes([[/^\/nom\/present$/, (q) => (RC.LOCAL ? present(q) : localOnly())]]);
  RC.NomPresent = { slides, asks, workingDaysLeft, ownerOf };
})(window);
