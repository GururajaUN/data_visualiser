/* ============================================================
   CR3 — Karnataka map with centre pins (offline SVG)
   Boundaries: config/karnataka-map.js (KGIS, simplified).
   Pins: config/centre-coords.js (approximate) or exact
   Latitude/Longitude from the Decisions Centres sheet.
   RC.NomMap.svg(N, opts) returns markup used by the Map page
   and the presentation.
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MODES = {
    staff: { label: 'Trainer staffing', legend: [['full', 'Fully staffed'], ['partial', 'Short of trainers'], ['none', 'No trainers']],
      cls: (c) => c.band, tip: (c) => `${c.filled}/${c.req} batches staffed` },
    tr: { label: 'Staffed with TR ID', legend: [['full', 'All batches staffed with TR ID'], ['partial', 'Some'], ['none', 'None']],
      cls: (c) => (c.trBatches === c.req ? 'full' : c.trBatches ? 'partial' : 'none'), tip: (c) => `${c.trBatches}/${c.req} batches have a trainer with TR ID` },
    caaf: { label: 'CAAF status', legend: [['full', 'CAAF submitted'], ['none', 'Awaiting NSDC fix']],
      cls: (c) => (c.caafDone ? 'full' : 'none'), tip: (c) => c.caaf || '—' },
  };

  /* Browser tooltip (plain text, one line per row): centre, staffing, each course with mapped trainers. */
  function tipText(c, interactive) {
    const L = [`${c.label} (${c.tc})`, `Batches staffed: ${c.filled} of ${c.req}${c.gap ? ` (short ${c.gap})` : ''}`];
    for (const b of c.byCourse) {
      const names = c.requiredPeople.filter((p) => p.course === b.code).map((p) => p.name + (p.tr ? '' : ' (no TR ID)') + (p.totWrong ? ' (TOT wrong course)' : ''));
      L.push(`${RC.Nom.courseOf(b.code).name}: ${b.filled} of ${b.req}${names.length ? ' — ' + names.join(', ') : ''}${b.backup ? ` (+${b.backup} backup)` : ''}`);
    }
    L.push(`With TR ID: ${c.trBatches} of ${c.req} · ${c.caaf || 'CAAF —'}`);
    L.push(`${c.coordExact ? 'Exact location' : 'Location approximate'}${interactive ? ' · click to open' : ''}`);
    return L.join('\n');
  }

  function project(lat, lon) {
    const P = RC.MAP.proj;
    return [(lon - P.lon0) * P.cos * P.S, (P.lat1 - lat) * P.S];
  }

  /* opts: { mode, labels: bool, highlight: Set of tc, interactive: bool } */
  function svg(N, opts = {}) {
    if (!RC.MAP) return '<p class="empty">Map data not loaded (config/karnataka-map.js).</p>';
    const mode = MODES[opts.mode] || MODES.staff;
    const [x0, y0, w, h] = RC.MAP.viewBox; const w0 = w, h0 = h;
    const counts = {}; for (const c of N.centres) { const k = mode.cls(c); counts[k] = (counts[k] || 0) + 1; }
    if (opts.course) { for (const k in counts) delete counts[k]; for (const c of N.centres) { const b = c.byCourse.find((x) => x.code === opts.course); const k = b ? (b.gap === 0 ? 'full' : b.filled ? 'partial' : 'none') : 'na'; counts[k] = (counts[k] || 0) + 1; } }
    const dist = RC.MAP.districts.map((d) => `<path class="dst" d="${d.d}"><title>${esc(d.name)}</title></path>`).join('');
    const dlab = opts.districtLabels ? RC.MAP.districts.map((d) => `<text class="dlab" x="${d.cx}" y="${d.cy}">${esc(d.name)}</text>`).join('') : '';
    const placed = [];
    const fs = 19, cw = 0.56 * fs;
    const overlaps = (b) => placed.some((p) => b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y);
    const cb = (c) => (opts.course ? c.byCourse.find((b) => b.code === opts.course) || null : null);
    const P = N.centres.filter((c) => c.latlon).map((c) => { const [x, y] = project(c.latlon[0], c.latlon[1]); const b = cb(c); return { c, x, y, r: opts.course ? (b ? 13 + 5 * Math.sqrt(b.req) : 7) : 13 + 5 * Math.sqrt(c.req) }; });
    for (const p of P) placed.push({ x: p.x - p.r, y: p.y - p.r, w: 2 * p.r, h: 2 * p.r });
    const pins = P.sort((a, b) => b.c.req - a.c.req).map(({ c, x, y, r }) => {
      const b = cb(c);
      const k = opts.course ? (b ? (b.gap === 0 ? 'full' : b.filled ? 'partial' : 'none') : 'na') : mode.cls(c);
      const ring = opts.mode !== 'caaf' && !c.caafDone ? `<circle class="pin-ring" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + 6).toFixed(1)}"/>` : '';
      let lab = '';
      if (opts.labels && !(opts.course && !b)) {
        const t = c.label.replace(/^GTTC /, '').replace(/ \(.*\)$/, ''); const w = t.length * cw, h = fs + 2;
        const cand = [[x + r + 4, y - h / 2, 'start'], [x - r - 4 - w, y - h / 2, 'end'], [x - w / 2, y - r - 4 - h, 'middle'], [x - w / 2, y + r + 4, 'middle']];
        const inb = ([bx, by]) => bx >= 2 && bx + w <= w0 - 2 && by >= 2 && by + h <= h0 - 2;
        let pick = cand.find((cd) => inb(cd) && !overlaps({ x: cd[0], y: cd[1], w, h })) || cand.find(inb) || cand[0];
        placed.push({ x: pick[0], y: pick[1], w, h });
        const tx = pick[2] === 'start' ? pick[0] : pick[2] === 'end' ? pick[0] + w : pick[0] + w / 2;
        lab = `<text class="plab" text-anchor="${pick[2]}" x="${tx.toFixed(1)}" y="${(pick[1] + h - 5).toFixed(1)}">${esc(t)}</text>`;
      }
      return `<g class="pin p-${k}${opts.highlight && opts.highlight.has(c.tc) ? ' hl' : ''}" data-pin="${c.tc}"><title>${esc(tipText(c, opts.interactive))}</title>${ring}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>
        ${opts.course && !b ? '' : `<text class="pn" x="${x.toFixed(1)}" y="${(y + 7).toFixed(1)}">${opts.course ? b.req : c.req}</text>`}${lab}
        </g>`;
    }).join('');
    const legend = opts.course ? `<div class="mlegend"><span><i class="lg-full"></i>Course fully staffed <b>${counts.full || 0}</b></span><span><i class="lg-partial"></i>Short <b>${counts.partial || 0}</b></span>${counts.none ? `<span><i class="lg-none"></i>No trainer <b>${counts.none}</b></span>` : ''}<span><i class="lg-na"></i>Course not allocated <b>${counts.na || 0}</b></span><span class="dim">Number = batches of this course · pins approximate</span></div>` : `<div class="mlegend">${mode.legend.filter(([k]) => counts[k] || k !== 'none').map(([k, l]) => `<span><i class="lg-${k}"></i>${esc(l)} <b>${counts[k] || 0}</b></span>`).join('')}
      ${opts.mode !== 'caaf' && N.centres.some((c) => !c.caafDone) ? `<span><i class="lg-ring"></i>CAAF awaiting NSDC <b>${N.centres.filter((c) => !c.caafDone).length}</b></span>` : ''}
      <span class="dim">Number = batches planned · pins approximate (town level)</span></div>`;
    return `<div class="kmap ${opts.interactive ? 'interactive' : ''}"><svg viewBox="${x0} ${y0} ${w} ${h}" role="img" aria-label="Map of Karnataka with centre pins">
      <g class="dsts">${dist}</g><path class="outline" d="${RC.MAP.outline}"/>${dlab}<g class="pins">${pins}</g></svg></div>${opts.noLegend ? '' : legend}`;
  }

  document.addEventListener('click', (e) => {
    const g = e.target.closest && e.target.closest('.kmap.interactive [data-pin]');
    if (g) location.hash = '#/nom/centre/' + g.dataset.pin;
  });

  RC.NomMap = { svg, MODES, project, tipText };
})(window);
