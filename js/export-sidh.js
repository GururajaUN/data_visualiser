/* ============================================================
   Stage 4b — SIDH EXPORT
   Input : model + export definition from config/sidh.js + scope
   Output: { rows[][], missing, count } and an .xlsx Blob
   Pure mapping: no formatting decisions beyond config `fmt`.
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});

  const FILTERS = {
    notDropped: (s) => !s.dropped,
    notCancelled: (b) => b.BatchStatus !== 'Cancelled',
    completedBatch: (s) => !s.dropped && s.batch.BatchStatus === 'Completed',
    certified: (s) => s.certified,
  };
  const get = (o, path) => path.split('.').reduce((x, k) => (x == null ? null : x[k]), o);

  /* scope: { centreId?, batchId?, date? (ISO) } */
  function sourceRows(M, def, scope) {
    const inScope = (c, b) => (!scope.centreId || (c && c.id === scope.centreId)) && (!scope.batchId || (b && b.id === scope.batchId));
    let rows;
    switch (def.source) {
      case 'students':
        rows = M.students.filter((s) => inScope(s.centre, s.batch)).map((s) => ({ ...s,
          eligibleText: s.eligible ? 'Yes' : 'No',
          lastResult: s.attempts.length ? s.attempts[s.attempts.length - 1].Result : '' }));
        break;
      case 'marks':
        rows = [];
        for (const s of M.students) {
          if (!inScope(s.centre, s.batch) || s.dropped) continue;
          for (const m of s.marks) {
            if (scope.date && RC.fmt.iso(m.date) !== scope.date) continue;
            rows.push({ date: m.date, mark: m.v, markText: m.v === 'P' ? 'Present' : 'Absent', student: s, batch: s.batch, centre: s.centre });
          }
        }
        rows.sort((a, b) => a.date - b.date || (a.batch.id > b.batch.id ? 1 : -1));
        break;
      case 'trainers': rows = M.trainers.filter((t) => inScope(t.centre, scope.batchId ? t.batches[0] : null)); break;
      case 'batches': rows = M.batches.filter((b) => inScope(b.centre, b)); break;
      case 'centres': rows = M.centres.filter((c) => inScope(c, null)); break;
      default: rows = [];
    }
    if (def.filter && FILTERS[def.filter]) rows = rows.filter(FILTERS[def.filter]);
    return rows;
  }

  function build(M, def, scope) {
    const src = sourceRows(M, def, scope || {});
    const header = def.columns.map((c) => c.h);
    const reqIdx = (def.required || []).map((h) => header.indexOf(h)).filter((i) => i >= 0);
    const missing = {}; let rowsMissing = 0;
    const rows = src.map((r) => {
      const out = def.columns.map((c) => {
        let v = c.c != null ? c.c : get(r, c.v);
        if (v == null || v === '') return '';
        if (c.fmt === 'pct') return typeof v === 'number' ? Math.round(v * 1000) / 10 : v;
        if (c.fmt === 'date') return v === 'Y' ? '' : v;
        if (c.fmt === 'upper') return String(v).toUpperCase();
        return v;
      });
      let bad = false;
      for (const i of reqIdx) if (out[i] === '' || out[i] == null) { missing[header[i]] = (missing[header[i]] || 0) + 1; bad = true; }
      if (bad) rowsMissing++;
      return out;
    });
    return { header, rows, missing, rowsMissing, count: rows.length };
  }

  function toBlob(def, built) {
    return RC.Xlsx.write([{ name: def.label.slice(0, 31), rows: [built.header, ...built.rows] }]);
  }

  RC.ExportSIDH = { build, toBlob, sourceRows };
})(typeof window !== 'undefined' ? window : globalThis);
