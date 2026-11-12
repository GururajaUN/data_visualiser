/* ============================================================
   CR4 — NOMINATIONS exports
   1. Decisions workbook: every person with the page's computed
      outcome, plus yellow columns for your manual calls. Re-exporting
      keeps decisions already made.
   2. Clean workbook: summary per centre, counted trainers, backup,
      rejected, unassigned, exceptions, data checks.
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});
  const short = (k) => (k ? RC.Nom.courseOf(k).short : '');
  const courseName = (k) => (k ? RC.Nom.courseOf(k).name : '');
  const coursesOf = (p) => [...p.codes.map(short), ...p.others].join('; ');
  const flagsOf = (p, sev) => p.flags.filter((f) => !sev || sev.includes(f.sev)).map((f) => f.text).join('; ');

  function decisionsBook(N) {
    const D = RC.NOM.decisions;
    const ed = (n) => Array(n).fill('edit');
    const ph = ['PersonKey', 'Name', 'Mobile', 'SourceCentre', 'SourceTC', 'NominatedCourses', 'TRID', 'ComputedStatus', 'ComputedCourse', 'Why', 'Flags',
      'AssignTC', 'AssignCourse', 'Decision', 'TOTStatus', 'TOTDate', 'Notes'];
    const people = N.people.slice().sort((a, b) => (a.tc || 'ZZ' + a.srcLabel).localeCompare(b.tc || 'ZZ' + b.srcLabel) || (a.course || '').localeCompare(b.course || '') || a.name.localeCompare(b.name));
    const rows = people.map((p) => {
      const d = p.dec || {};
      return [p.key, p.name, p.mobile || p.mobileRaw || '', p.srcLabel, p.srcTC || '', coursesOf(p), p.tr || '', p.status, short(p.course), p.why, flagsOf(p, ['high', 'med']),
        d.tc || '', d.course ? courseName(d.course) : d.courseRaw || '', d.decision || d.decisionRaw || '', d.tot || d.totRaw || '', d.totDate || '', d.notes || ''];
    });
    // keep decisions whose person is no longer in the nominations file
    const prev = N.decMap || null;
    if (prev) for (const d of prev.values()) if (!N.by.person.has(d.key)) rows.push([d.key, '', '', '', '', '', '', 'Not in current nominations', '', 'Kept from earlier decisions file', '', d.tc || '', d.course ? courseName(d.course) : '', d.decision || '', d.tot || '', d.totDate || '', d.notes || '']);
    const people_sheet = { name: D.peopleSheet, rows: [ph, ...rows], headStyles: [...Array(11).fill(null), ...ed(6)] };
    const ch = ['TCID', 'Centre', 'District', 'CAAFStatus', 'ApproxLatLong', 'BatchesPlanned', 'InspectionStatus', 'InspectionDate', 'BatchesOnboarded', 'Notes', 'Latitude', 'Longitude'];
    const ap = RC.NOM.centreCoords || {};
    const crow = N.centres.map((c) => [c.tc, c.label, c.district, c.caaf, ap[c.tc] ? ap[c.tc].join(', ') : '', c.req, c.inspection === D.defaults.inspection && !c.inspectionDate ? '' : c.inspection, c.inspectionDate || '', c.onboarded || '', c.inspectionNotes || '',
      c.coordExact ? c.latlon[0] : '', c.coordExact ? c.latlon[1] : '']);
    const centres_sheet = { name: D.centresSheet, rows: [ch, ...crow], headStyles: [null, null, null, null, null, null, 'edit', 'edit', 'edit', 'edit', 'edit', 'edit'] };
    const guide = { name: 'Guide', rows: [
      ['Column', 'What to enter'],
      ['Yellow columns', 'Only these are read back. Leave blank to accept the computed outcome.'],
      ['AssignTC', 'TC ID after confirming by phone (needed for Unassigned people, e.g. Belagavi / Chitradurga). Must be a TC in the plan.'],
      ['AssignCourse', 'Course to keep: ' + RC.NOM.courses.map((c) => c.name).join(' | ')],
      ['Decision', D.decisionValues.join(' / ') + ' — Required counts toward the 1-trainer-per-batch target; blank = automatic'],
      ['TOTStatus', D.totValues.join(' / ') + ' (blank = ' + D.defaults.tot + ')'],
      ['TOTDate', 'Date TOT completed'],
      ['Notes', 'Free text; shown as the reason for a Reject'],
      ['InspectionStatus', D.inspectionValues.join(' / ') + ' (Centres sheet; blank = ' + D.defaults.inspection + ')'],
      ['BatchesOnboarded', 'Centres sheet: number of this centre\'s batches whose students are onboarded (0 to BatchesPlanned). Feeds the Students onboarded gate.'],
      ['Latitude / Longitude', 'Centres sheet: exact map pin in decimal degrees (e.g. 12.9902, 77.5521), e.g. from the CAAF geo-tagged photo. Blank = approximate town-level pin (ApproxLatLong).'],
      ['PersonKey', 'Do not edit. Mobile number, or N:<name>@<centre> when the mobile is missing. Decisions follow the person across new nomination files.'],
      ['File name', `Keep the name starting with ${RC.brand().filePrefix}_Decisions and save it in the data folder. The newest one is used.`],
    ] };
    const meta = { name: 'Meta', rows: [['Key', 'Value'], ['FileType', 'nomDecisions'], ['Generated', new Date()], ['NominationsFile', N.sources.nominations.name], ['PlanFile', N.sources.plan.name]] };
    return RC.Xlsx.write([people_sheet, centres_sheet, guide, meta]);
  }

  function cleanBook(N) {
    const sum = [['TC ID', 'Centre', 'District', 'CAAF status', 'Inspection', 'Trainers required', 'Nominations received', 'Unique people', 'Counted', 'Gap', 'Backup', 'Rejected', 'Possible unassigned', 'Counted with TR ID', 'TOT completed', 'Status',
      ...RC.NOM.courses.flatMap((c) => [c.short + ' required', c.short + ' counted'])]];
    for (const c of N.centres) sum.push([c.tc, c.label, c.district, c.caaf, c.inspection, c.req, c.rows, c.unique, c.filled, c.gap, c.backup, c.rejected, c.unassignedHere.length, c.withTR, c.tot, c.state,
      ...RC.NOM.courses.flatMap((k) => { const b = c.byCourse.find((x) => x.code === k.code); return b ? [b.req, b.filled] : ['', '']; })]);
    const m = N.m;
    sum.push([]); sum.push(['Total', '', '', '', '', m.required, m.received, m.unique, m.filled, m.gap, m.backup, m.rejected, m.unassigned, m.withTR, m.tot]);
    const ph = ['TC ID', 'Centre', 'Course', 'Name', 'Mobile', 'TR ID', 'Email', 'DOB', 'Qualification', 'Industrial exp (yrs)', 'Teaching exp (yrs)', 'Total exp (yrs)', 'TOT status', 'TOT requested for', 'TOT requested on', 'TR ID in nominations', 'Status', 'Why', 'Flags'];
    const prow = (p) => { const d = p.detail || {}; return [p.tc || '', p.centre ? p.centre.label : p.srcLabel, short(p.course), p.name, p.mobile || p.mobileRaw || '', p.tr || '', d.email || '', d.dob || '', d.qual || '', d.indExp ?? '', d.teachExp ?? '', d.totExp ?? '', p.tot, p.totReqs.map((t) => (t.code ? RC.Nom.courseOf(t.code).tot : t.qpRaw)).join('; '), p.totReqDate || '', p.trMismatch ? p.trNom : p.trSrc === 'portal' && !p.trNom ? '(missing)' : '', p.status, p.why, flagsOf(p)]; };
    const byStatus = (s) => N.people.filter((p) => p.status === s).sort((a, b) => (a.tc || '').localeCompare(b.tc || '') || (a.course || '').localeCompare(b.course || ''));
    const ex = [['Severity', 'Flag', 'Name', 'Mobile', 'Centre', 'Status', 'Detail']];
    for (const p of N.people) for (const f of p.flags) ex.push([f.sev, f.code, p.name, p.mobile || p.mobileRaw || '', p.centre ? p.centre.label : p.srcLabel, p.status, f.text]);
    const iss = [['Level', 'File', 'Sheet', 'Row', 'Column', 'Issue'], ...N.issues.map((i) => [i.level, i.file || '', i.sheet || '', i.row || '', i.field || '', i.msg])];
    const meta = [['Key', 'Value'], ['Nominations as of', N.asOf], ['Generated', new Date()], ['Plan file', N.sources.plan.name], ['Nominations file', N.sources.nominations.name], ['Decisions file', N.sources.decisions ? N.sources.decisions.name : 'none'], ['TOT request file', N.sources.tot ? N.sources.tot.name : 'none'],
      ['Rule', `1 trainer per batch (target / ${RC.NOM.rules.seatsPerBatch}); extras kept as backup; courses not allocated to the centre rejected; multi-course person kept on the course with the biggest shortfall`]];
    return RC.Xlsx.write([
      { name: 'Summary', rows: sum }, { name: 'Counted trainers', rows: [ph, ...byStatus('Required').map(prow)] },
      { name: 'Backup', rows: [ph, ...byStatus('Backup').map(prow)] }, { name: 'Rejected', rows: [ph, ...byStatus('Rejected').map(prow)] },
      { name: 'Unassigned', rows: [ph, ...byStatus('Unassigned').concat(byStatus('Not in plan')).map(prow)] },
      { name: 'TOT requests', rows: [['TR ID (portal)', 'Name (portal)', 'Mobile (portal)', 'TOT requested for', 'Requested on', 'Matched person', 'Matched on', 'Status', 'Counted course', 'TOT status', 'TR ID in nominations', 'Check'],
        ...(N.totRows || []).map((t) => { const p = t.person; const ok = p && (p.status === 'Required' || p.status === 'Backup');
          return [t.tr || '', t.name, t.mobile || t.mobileRaw || '', t.code ? RC.Nom.courseOf(t.code).tot : t.qpRaw, t.requested || '', p ? p.name : '', t.how || '', p ? p.status : 'Not in nominations', ok ? short(p.course) : '', p ? p.tot : '', p ? p.trNom || '' : '',
            !p ? 'Not in nominations' : !ok ? 'Person not counted' : !t.code ? 'Not a ' + RC.brand().courseWord : t.code === p.course ? 'OK' : p.totReqOk ? 'Extra request' : 'Wrong course']; })] },
      { name: 'Exceptions', rows: ex }, { name: 'Data checks', rows: iss }, { name: 'Meta', rows: meta },
    ]);
  }

  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function run(kind) {
    const N = RC.state.N; if (!N) return;
    const d = RC.fmt.iso(new Date()), asof = RC.fmt.iso(N.asOf);
    if (kind === 'decisions') download(decisionsBook(N), `${RC.brand().filePrefix}_Decisions_${d}.xlsx`);
    if (kind === 'clean') download(cleanBook(N), `${RC.brand().filePrefix}_Nominations_Clean_asof_${asof}.xlsx`);
  }

  RC.NomExport = { decisionsBook, cleanBook, run };
})(typeof window !== 'undefined' ? window : globalThis);
