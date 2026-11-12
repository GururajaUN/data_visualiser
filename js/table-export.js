/* CR13 — Download tables as Excel.
   Every table on screen gets an "Excel" button; the top bar "Excel" button saves all tables on the page,
   one sheet each, plus an "About" sheet (page, data as of, source files, generated time).
   Tables built with h.table export ALL rows (not only the first N shown), in the current sort order.
   Uses RC.Xlsx.write (no dependencies). */
(function () {
  const reg = new Map(); // table id -> { cols, data }
  let extras = [];      // page-level sheets that are not on-screen tables (e.g. the follow-up call list)
  function reset() { extras = []; }
  function addSheet(name, rows) { extras.push({ name, rows }); }
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function register(id, cols, data) { reg.set(id, { cols, data }); }

  function htmlText(html) {
    const s = String(html == null ? '' : html)
      .replace(/<br\s*\/?>/gi, '\n').replace(/<(div|p|li|tr)\b[^>]*>|<\/(div|p|li|tr)>/gi, '\n')
      .replace(/<\/(a|span|b|em|i|strong)>\s*(?=<(a|span)\b)/gi, '\n').replace(/<[^>]+>/g, '');
    const ta = document.createElement('textarea'); ta.innerHTML = s;
    return ta.value.split('\n').map((x) => x.trim()).filter(Boolean).join(' · ');
  }
  function value(t) {
    t = (t || '').replace(/ ?[▲▼]$/, '').replace(/\s*\n\s*/g, ' · ').trim();
    if (t === '—' || t === '-') return '';
    if (/^-?\d{1,3}(,\d{2,3})*(\.\d+)?$|^-?\d{1,7}(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
    const d = t.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/);
    if (d && MON[d[2].toLowerCase()] != null) return new Date(+d[3], MON[d[2].toLowerCase()], +d[1]);
    return t;
  }
  function rowsOf(table) {
    const id = table.dataset.xl, r = id && reg.get(id);
    if (r) {
      const cols = r.cols.filter(Boolean);
      // a column may define xl: [{ l, v }] to export as several plain columns (e.g. Name + Mobile)
      return [cols.flatMap((c) => (c.xl ? c.xl.map((x) => x.l) : [c.l || c.k])),
        ...r.data.map((row) => cols.flatMap((c) => (c.xl ? c.xl.map((x) => { const v = x.v(row); return v instanceof Date || typeof v === 'number' ? v : value(String(v == null ? '' : v)); })
          : [value(c.h ? htmlText(c.h(row)) : htmlText(c.v(row)))])))];
    }
    const out = [];
    const head = table.querySelector('thead tr');
    if (head) out.push([...head.children].map((c) => value(c.textContent)));
    for (const tr of table.querySelectorAll('tbody tr')) {
      if (tr.querySelector('td.empty')) continue;
      out.push([...tr.children].map((c) => value(c.innerText)));
    }
    if (!head && !out.length) for (const tr of table.querySelectorAll('tr')) out.push([...tr.children].map((c) => value(c.innerText)));
    return out;
  }
  function titleOf(table, i) {
    const cap = table.querySelector('caption'); if (cap && cap.textContent.trim()) return cap.textContent.trim();
    const sec = table.closest('section, .card, .slide');
    const h = sec && sec.querySelector('h2, h3, h1');
    if (h && h.textContent.trim()) return h.textContent.trim();
    return pageTitle();
  }
  const clean = (s) => s.replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  function uniq(names) {
    const seen = {}; return names.map((n) => { let b = clean(n), x = b, k = 2; while (seen[x.toLowerCase()]) x = clean(b.slice(0, 27) + ' (' + k++ + ')'); seen[x.toLowerCase()] = 1; return x; });
  }
  function pageTitle() { const h = document.querySelector('#view h1'); return h ? h.textContent.trim() : RC.brand().name; }
  function about(extra) {
    const st = RC.state || {}, N = st.N, M = st.M;
    const rows = [['Page', pageTitle()], ['Link', location.hash || '#/'], ['Generated', new Date()]];
    if (N) {
      rows.push(['Nominations data as of', N.asOf || '']);
      for (const [k, l] of [['plan', 'Plan file'], ['nominations', 'Nominations file'], ['tot', 'TOT request file'], ['decisions', 'Decisions file']]) if (N.sources[k]) rows.push([l, N.sources[k].name]);
    }
    if (M && M.meta) { if (M.meta.asOf) rows.push(['Tracker status as of', M.meta.asOf]); }
    if (extra) rows.push(...extra);
    return { name: 'About', rows: [['Field', 'Value'], ...rows] };
  }
  const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50);
  function save(sheets, name) {
    const blob = RC.Xlsx.write(sheets);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const stamp = () => RC.fmt.iso(new Date());
  function tables() { return [...document.querySelectorAll('#view table')].filter((t) => !t.closest('.xl-skip')); }

  function downloadPage() {
    const ts = tables();
    if (!ts.length && !extras.length) { alertBox('This page has no tables to download.'); return; }
    const names = uniq([...extras.map((x) => x.name), ...ts.map(titleOf)]);
    const sheets = [...extras.map((x, i) => ({ name: names[i], rows: x.rows })), ...ts.map((t, i) => ({ name: names[extras.length + i], rows: rowsOf(t) }))];
    save([...sheets, about([['Tables', ts.length]])], `${RC.brand().filePrefix}_${slug(pageTitle())}_${stamp()}.xlsx`);
  }
  function downloadOne(t) {
    const i = tables().indexOf(t); const title = titleOf(t, i < 0 ? 0 : i);
    save([{ name: uniq([title])[0], rows: rowsOf(t) }, about([['Table', title]])], `${RC.brand().filePrefix}_${slug(pageTitle())}_${slug(title)}_${stamp()}.xlsx`);
  }
  function alertBox(msg) {
    const el = document.createElement('div'); el.className = 'xl-toast'; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 2500);
  }
  function decorate(root) {
    const btn = document.getElementById('xl');
    if (btn) { const n = root.querySelectorAll('table').length + extras.length; btn.disabled = !n; btn.title = n ? `Download ${n === 1 ? 'the table' : 'all ' + n + ' tables'} on this page as one Excel file` : 'No tables on this page'; }
    const ts = [...root.querySelectorAll('table')].filter((t) => !t.closest('.slide') && !t.closest('.xl-skip'));
    ts.forEach((t, i) => {
      const host = t.closest('.tw') || t;
      if (host.previousElementSibling && host.previousElementSibling.classList.contains('xl-bar')) return;
      const bar = document.createElement('div'); bar.className = 'xl-bar';
      bar.innerHTML = '<button class="xl-btn" type="button" title="Download this table as Excel (all rows)">⤓ Excel</button>';
      bar.firstChild.addEventListener('click', (e) => { e.stopPropagation(); downloadOne(t); });
      host.parentNode.insertBefore(bar, host);
    });
  }
  RC.TableExport = { reset, addSheet, register, decorate, downloadPage, downloadOne, rowsOf };
})();
