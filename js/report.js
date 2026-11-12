/* ============================================================
   Stage 4c — REPORT (PDF via browser print)
   Builds a provenance block for the current view, then prints.
   Layout for paper lives in css/print.css.
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});

  function nomProvenance() {
    const st = RC.state, f = RC.fmt, esc = RC.Views.esc, N = st.N, s = N.sources;
    const e = N.issues.filter((i) => i.level === 'error').length, w = N.issues.filter((i) => i.level === 'warn').length;
    const rows = [
      ['Nominations as of', f.date(N.asOf)], ['Generated', f.dt(new Date())],
      ['Plan file', `${s.plan.name} (modified ${f.dt(s.plan.lastModified)})`],
      ['Nominations file', `${s.nominations.name} (modified ${f.dt(s.nominations.lastModified)})`],
      ['Decisions file', s.decisions ? `${s.decisions.name} (modified ${f.dt(s.decisions.lastModified)}), ${N.m.decided} decision(s) applied` : 'none — automatic rules only'],
      ['Rule', `1 trainer per batch of ${RC.NOM.rules.seatsPerBatch}; extras = backup; course not allocated = rejected`],
      ['File checks', `${e} error(s), ${w} warning(s)`],
    ];
    return `<div class="ph-top"><div><div class="ph-org">Rubber, Chemical and Polymer Skill Development Council</div>
      <div class="ph-title">${esc(st.viewTitle || 'Report')}</div><div class="ph-path">${esc((st.crumbs || []).join(' › '))}</div></div></div>
      <table class="ph-prov">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
  }

  function provenance() {
    const st = RC.state, f = RC.fmt, esc = RC.Views.esc;
    if (st.route === 'nom' && st.N) return nomProvenance();
    const set = st.set;
    const bf = set.batches;
    const latest = bf.reduce((m, x) => (x.lastModified > m ? x.lastModified : m), new Date(0));
    const iss = st.v.issues;
    const errs = iss.filter((i) => i.level === 'error').length, warns = iss.filter((i) => i.level === 'warn').length;
    const rows = [
      ['Data as of', f.date(st.M.asOf)],
      ['Generated', f.dt(new Date())],
      ['Status file', set.status ? `${set.status.name} (modified ${f.dt(set.status.lastModified)})` : '—'],
      ['Master', set.master ? `${set.master.name} (modified ${f.dt(set.master.lastModified)})` : '—'],
      ['Trainers', set.trainers ? `${set.trainers.name} (modified ${f.dt(set.trainers.lastModified)})` : '—'],
      ['Batch files', `${bf.length} file(s)${bf.length ? `, latest modified ${f.dt(latest)}` : ''}`],
      ['Format version', RC.SCHEMA.formatVersion],
      ['Data checks', `${errs} error(s), ${warns} warning(s)`],
    ];
    return `<div class="ph-top"><div><div class="ph-org">Rubber, Chemical and Polymer Skill Development Council</div>
      <div class="ph-title">${esc(st.viewTitle || 'Report')}</div><div class="ph-path">${esc((st.crumbs || []).join(' › '))}</div></div>
      ${st.demo ? '<div class="ph-demo">DEMO DATA</div>' : ''}</div>
      <table class="ph-prov">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
  }

  function print() {
    const st = RC.state; if (!st || !(st.M || st.N)) return;
    document.getElementById('print-head').innerHTML = provenance();
    const old = document.title;
    const slug = (st.crumbs || ['Report']).slice(-1)[0].replace(/[^\w-]+/g, '_');
    const asOf = st.route === 'nom' && st.N ? st.N.asOf : st.M ? st.M.asOf : new Date();
    document.title = `${RC.brand().filePrefix}_${st.route === 'nom' ? 'Nominations_' : ''}${slug}_${RC.fmt.iso(asOf)}`;
    // expand truncated tables for print
    const prev = { ...RC.ui.filter };
    document.querySelectorAll('[data-showall]').forEach((b) => (RC.ui.filter[b.dataset.showall + ':all'] = 1));
    RC.Views.render();
    setTimeout(() => {
      window.print();
      document.title = old; RC.ui.filter = prev; RC.Views.render();
    }, 50);
  }

  RC.Report = { print, provenance };
})(typeof window !== 'undefined' ? window : globalThis);
