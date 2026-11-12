/* ============================================================
   App wiring — runs the pipeline:
   ingest → selectSet → validate → model → views / export / report
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});
  RC.state = { catalog: null, statusKey: null };
  /* CR14 — "local" = opened from this computer (file://) or a local dev server; the presentation is local-only. */
  RC.LOCAL = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  document.documentElement.classList.toggle('hosted', !RC.LOCAL);
  const $ = (s) => document.querySelector(s);

  /* CR14 — programme config lives in the data folder (config/*.js), not in the hosted app.
     Loaded each time a folder is picked; nominations.js first, then the rest alphabetically. */
  RC.brand = () => Object.assign({ name: 'Tracker', sub: '', mark: '◆', title: 'Tracker', filePrefix: 'Tracker', courseWord: 'programme course' }, (RC.NOM && RC.NOM.brand) || {});
  function applyBrand() {
    const b = RC.brand();
    document.title = b.title; $('#brand-name').textContent = b.name; $('#brand-sub').textContent = b.sub; $('#brand-mark').textContent = b.mark;
  }
  async function loadConfig(fileList) {
    const rel = (f) => (f.webkitRelativePath || f.path || f.name).replace(/\\/g, '/');
    const js = Array.from(fileList).filter((f) => /\.js$/i.test(f.name) && /(^|\/)config\//i.test(rel(f)))
      .sort((a, b) => (b.name.toLowerCase() === 'nominations.js') - (a.name.toLowerCase() === 'nominations.js') || a.name.localeCompare(b.name));
    delete G.RC.NOM;
    const loaded = [], errors = [];
    for (const f of js) {
      try { (0, eval)(await f.text() + '\n//# sourceURL=data-config/' + f.name); loaded.push(f.name); }
      catch (e) { errors.push(`${f.name}: ${e.message}`); }
    }
    RC.state.config = { loaded, errors };
    // config images (e.g. the deck logo) are served from memory, never from the hosted site
    RC.state.assets = {};
    for (const f of Array.from(fileList).filter((f) => /\.(png|jpe?g|svg|gif)$/i.test(f.name) && /(^|\/)config\//i.test(rel(f)))) RC.state.assets[f.name.toLowerCase()] = URL.createObjectURL(f);
    applyBrand();
    if (errors.length) alert('Could not read the config file(s) in the data folder:\n' + errors.join('\n'));
    return loaded;
  }

  async function load(fileList) {
    if (!fileList || !fileList.length) return;
    const prog = $('#progress');
    document.body.classList.add('loading');
    try {
      await loadConfig(fileList);
      const catalog = await RC.Ingest.ingest(fileList, (d, n) => { prog.textContent = `Reading ${d} / ${n} files…`; });
      RC.state.catalog = catalog;
      RC.state.statusKey = catalog.statusVersions[0] || null;
      run();
      if (!location.hash || location.hash === '#') location.hash = RC.state.M ? '#/' : '#/nom';
    } catch (e) {
      console.error(e); alert('Could not load folder: ' + e.message);
    } finally {
      document.body.classList.remove('loading'); prog.textContent = '';
    }
  }

  function run() {
    const st = RC.state;
    const trackerTypes = ['master', 'trainers', 'status', 'batch'];
    st.hasTracker = st.catalog.files.some((f) => trackerTypes.includes(f.type));
    if (st.hasTracker) {
      st.set = RC.Ingest.selectSet(st.catalog, st.statusKey);
      st.v = RC.Validate.validate(st.set);
      const asOf = (st.set.status && RC.fmt.fromIso(st.set.status.dateKey)) || new Date(new Date().toDateString());
      st.M = RC.Model.build(st.v, asOf);
    } else { st.set = null; st.v = { issues: [] }; st.M = null; }
    st.N = RC.Nom ? RC.Nom.build(st.catalog.files) : null;
    if (!st.M && !RC.NOM) {
      document.body.classList.remove('ready');
      alert('The config folder is missing from the selected folder. It should contain config/nominations.js and config/centre-coords.js next to the Excel files.');
      return;
    }
    if (!st.M && !st.N) {
      document.body.classList.remove('ready');
      alert('No recognised files in this folder. Expected the plan of action + TOT nominations workbooks, or the tracker master/status files.');
      return;
    }
    st.demo = st.catalog.files.some((f) => String(f.meta.Demo || '').toUpperCase() === 'Y');
    document.body.classList.add('ready');
    document.body.classList.toggle('demo', st.demo);
    document.body.classList.toggle('has-tracker', !!st.M);
    document.body.classList.toggle('has-nom', !!st.N);
    const sel = $('#asof');
    sel.innerHTML = st.catalog.statusVersions.map((k) => `<option value="${k}" ${st.set && k === (st.set.status && st.set.status.fileDateKey) ? 'selected' : ''}>${RC.fmt.date(RC.fmt.fromIso(k))}</option>`).join('');
    if (st.M) {
      const errs = st.v.issues.filter((i) => i.level === 'error').length + st.catalog.errors.length;
      const warns = st.v.issues.filter((i) => i.level === 'warn').length;
      $('#issue-badge').textContent = errs ? errs : warns ? warns : '';
      $('#issue-badge').className = 'badge ' + (errs ? 'bad' : warns ? 'warn' : '');
      $('#flag-badge').textContent = st.M.flags.filter((f) => f.sev === 'high').length || '';
    }
    if (st.N) {
      const e = st.N.issues.filter((i) => i.level === 'error').length;
      $('#nom-issue-badge').textContent = e || '';
      $('#nom-flag-badge').textContent = st.N.m.highFlags || '';
    }
    $('#folder-name').textContent = st.catalog.root || 'Folder';
    const path = location.hash.replace(/^#/, '');
    if (!st.M && st.N && !path.startsWith('/nom')) location.hash = '#/nom';
    else RC.Views.render();
  }

  function doExport(id) {
    const def = RC.SIDH.exports.find((x) => x.id === id); if (!def) return;
    const sc = RC.ui.exportScope || {};
    const built = RC.ExportSIDH.build(RC.state.M, def, { ...sc, date: def.dated ? sc.date : null });
    if (built.rowsMissing && !confirm(`${built.rowsMissing} row(s) have blank required fields (${Object.keys(built.missing).join(', ')}). Download anyway?`)) return;
    const blob = RC.ExportSIDH.toBlob(def, built);
    const scope = sc.batchId || sc.centreId || 'All';
    const name = `SIDH_${def.id}_${scope}${def.dated && sc.date ? '_' + sc.date : ''}_asof_${RC.fmt.iso(RC.state.M.asOf)}.xlsx`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function init() {
    if (typeof DecompressionStream === 'undefined') {
      $('#progress').textContent = 'This browser is too old to read Excel files here. Please use a current Chrome or Edge.';
    }
    const inp = $('#folder');
    document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { inp.value = ''; inp.click(); }));
    inp.addEventListener('change', () => load(inp.files));
    $('#asof').addEventListener('change', (e) => { RC.state.statusKey = e.target.value; run(); });
    $('#print').addEventListener('click', () => RC.Report.print());
    $('#xl').addEventListener('click', () => RC.TableExport.downloadPage());
    $('#theme').addEventListener('click', () => {
      const r = document.documentElement; const cur = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      r.dataset.theme = cur === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('rc-theme', r.dataset.theme); } catch (e) {}
    });
    try { const t = localStorage.getItem('rc-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
    RC.Views.bind();
  }

  RC.App = { load, run, doExport };
  document.addEventListener('DOMContentLoaded', init);
})(window);
