/* ============================================================
   Stage 1 — INGEST
   Input : File objects from the folder picker.
   Output: catalog { files[], ignored[], errors[], statusVersions[] }
           Each file: { type, name, path, folder, lastModified, dateKey,
                        meta{}, sheets{ name: { header[], rows[][] } } }
   Knows nothing about business rules; only file naming and parsing.
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});

  function classify(name, folder) {
    const S = RC.SCHEMA;
    if (RC.NOM) {
      const T = { decisions: 'nomDecisions', plan: 'nomPlan', nominations: 'nomList', tot: 'nomTot' };
      for (const [k, f] of Object.entries(RC.NOM.files)) if (new RegExp(f.pattern, 'i').test(name)) return { type: T[k], dateKey: null, idHint: null, folderOk: true, nom: true };
    }
    for (const [type, f] of Object.entries(S.files)) {
      const m = name.match(new RegExp(f.pattern, 'i'));
      if (m) return { type, dateKey: f.dated ? m[1] : null, idHint: type === 'batch' ? m[1] : null, folderOk: folder.toLowerCase() === f.folder };
    }
    return null;
  }

  function splitPath(file) {
    const rel = file.webkitRelativePath || file.path || file.name;
    const parts = rel.split('/');
    return { rel, folder: parts.length > 1 ? parts[parts.length - 2] : '', root: parts.length > 2 ? parts[0] : '' };
  }

  async function ingest(fileList, onProgress) {
    const files = [], ignored = [], errors = [];
    const list = Array.from(fileList);
    let root = '';
    const todo = [];
    for (const f of list) {
      const p = splitPath(f);
      root = root || p.root;
      if (/^(~\$|\.|_)/.test(f.name) || !/\.xlsx$/i.test(f.name)) { if (!/^\./.test(f.name)) ignored.push({ path: p.rel, reason: 'Not an .xlsx data file' }); continue; }
      const c = classify(f.name, p.folder);
      if (!c) { ignored.push({ path: p.rel, reason: 'File name does not match any known pattern' }); continue; }
      todo.push({ f, p, c });
    }
    let done = 0;
    for (const { f, p, c } of todo) {
      try {
        const book = await RC.Xlsx.read(await f.arrayBuffer());
        const sheets = {};
        for (const sn of book.order) {
          const raw = book.sheets[sn];
          let h = 0; while (h < raw.length && !(raw[h] || []).some((v) => v != null && v !== '')) h++;
          const header = (raw[h] || []).map((v) => (v instanceof Date ? v : v == null ? '' : String(v).trim()));
          const rows = [];
          for (let i = h + 1; i < raw.length; i++) {
            const r = raw[i] || [];
            if (!r.some((v) => v != null && String(v).trim() !== '')) continue;
            rows.push({ excelRow: i + 1, cells: r });
          }
          sheets[sn] = { header, rows };
        }
        const meta = {};
        if (sheets.Meta) {
          const kI = 0, vI = 1;
          meta[String(sheets.Meta.header[kI])] = sheets.Meta.header[vI];
          for (const r of sheets.Meta.rows) if (r.cells[kI] != null) meta[String(r.cells[kI]).trim()] = r.cells[vI];
        }
        files.push({ type: c.type, name: f.name, path: p.rel, folder: p.folder, folderOk: c.folderOk,
          lastModified: new Date(f.lastModified), size: f.size, dateKey: meta.DataAsOf ? normDate(meta.DataAsOf) || c.dateKey : c.dateKey,
          fileDateKey: c.dateKey, idHint: c.idHint, meta, sheets });
      } catch (e) {
        errors.push({ path: p.rel, msg: 'Could not read workbook: ' + e.message });
      }
      done++; if (onProgress) onProgress(done, todo.length);
    }
    const statusVersions = files.filter((f) => f.type === 'status').map((f) => f.fileDateKey).sort().reverse();
    return { root, files, ignored, errors, statusVersions, loadedAt: new Date() };
  }

  function normDate(v) {
    if (v instanceof Date) return RC.fmt.iso(v);
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : null;
  }

  /* Pick the working set: master + trainers + ONE status version + all batch files. */
  function selectSet(catalog, statusKey) {
    const pick = (type) => catalog.files.filter((f) => f.type === type).sort((a, b) => b.lastModified - a.lastModified)[0] || null;
    const statusFiles = catalog.files.filter((f) => f.type === 'status');
    const status = statusFiles.find((f) => f.fileDateKey === statusKey) || statusFiles.sort((a, b) => (b.fileDateKey > a.fileDateKey ? 1 : -1))[0] || null;
    const dupes = [];
    for (const t of ['master', 'trainers']) { const n = catalog.files.filter((f) => f.type === t).length; if (n > 1) dupes.push(t); }
    return { master: pick('master'), trainers: pick('trainers'), status, batches: catalog.files.filter((f) => f.type === 'batch'), dupes };
  }

  /* Shared formatting helpers used by all later stages. */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (n) => String(n).padStart(2, '0');
  RC.fmt = {
    iso: (d) => d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : '',
    date: (d) => d instanceof Date ? `${p2(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()}` : d === 'Y' ? 'Done' : d || '',
    short: (d) => d instanceof Date ? `${p2(d.getDate())} ${MON[d.getMonth()]}` : '',
    dt: (d) => d ? `${p2(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}` : '',
    pct: (x, dp = 0) => x == null || !isFinite(x) ? '–' : (x * 100).toFixed(dp) + '%',
    num: (n) => n == null ? '–' : Number(n).toLocaleString('en-IN'),
    fromIso: (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; },
  };

  RC.Ingest = { ingest, selectSet };
})(typeof window !== 'undefined' ? window : globalThis);
