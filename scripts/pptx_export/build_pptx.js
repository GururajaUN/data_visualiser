/* Build an editable PowerPoint version of the in-app presentation (CR8).
   Usage: node build_pptx.js <data folder> <map.png> <out.pptx>
   Numbers and slide titles come from the same model the app uses. */
const fs = require('fs'), path = require('path');
const APP = '/home/claude/build/app/';
// minimal browser stubs so the app modules load in node
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {}, documentElement: {} };
globalThis.MutationObserver = class { observe() {} };
// CR14: programme config lives in the data folder: <data>/config/*.js (nominations.js first)
const DATA_ROOT = process.argv[2];
const CFG_DIR = require('path').join(DATA_ROOT || '.', 'config');
if (!require('fs').existsSync(CFG_DIR)) { console.error('Missing ' + CFG_DIR + ' (config/nominations.js and config/centre-coords.js next to the Excel files)'); process.exit(1); }
for (const f of ['config/schema.js', 'config/karnataka-map.js']) require(APP + f);
for (const f of require('fs').readdirSync(CFG_DIR).filter((x) => /\.js$/i.test(x)).sort((a, b) => (b === 'nominations.js') - (a === 'nominations.js') || a.localeCompare(b))) require(require('path').resolve(CFG_DIR, f));
for (const f of ['js/xlsx-lite.js', 'js/ingest.js', 'js/nom-model.js']) require(APP + f);
RC.Views = { addRoutes() {}, h: {}, esc: (s) => s };
require(APP + 'js/nom-map.js'); require(APP + 'js/nom-present.js');
const pptxgen = require('pptxgenjs');
const { applyTheme } = require('/root/.claude/skills/synced/501b8d94-aed3-49f6-b991-90acb0588db5_f40d428e-39f5-4446-884f-671e6a6fdec9/pptx/scripts/apply_theme.js');

function walk(dir, root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, root) : [{ name: e.name, webkitRelativePath: path.relative(path.dirname(root), p), lastModified: fs.statSync(p).mtimeMs, size: 1,
      arrayBuffer: async () => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } }];
  });
}
const strip = (h) => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

(async () => {
  const [root, mapPng, out, logoArg] = process.argv.slice(2);
  const logoName = ((RC.NOM.deck || {}).logo || '').split('/').pop(); const logoPng = logoArg || (logoName && fs.existsSync(path.join(CFG_DIR, logoName)) ? path.join(CFG_DIR, logoName) : null);
  const cat = await RC.Ingest.ingest(walk(root, root));
  const N = RC.Nom.build(cat.files);
  const SL = RC.NomPresent.slides(N); const T = Object.fromEntries(SL.map((s) => [s.id, strip(s.title || '')]));
  const m = N.m, S = RC.NOM.rules.seatsPerBatch, B = N.bands, F = RC.fmt;
  const L = Object.fromEntries(N.ladder.map((x) => [x.id, x])), ms = Object.fromEntries(N.milestones.map((x) => [x.gate, x]));
  const num = (n) => Number(n || 0).toLocaleString('en-IN'), d = (x) => (x ? F.date(x) : '—'), ds = (x) => (x ? F.short(x) : '—');
  const nm = (c) => c.label.replace(/^GTTC /, '');
  const short = (k) => RC.Nom.courseOf(k).short;
  const caafPending = N.centres.filter((c) => !c.caafDone), caafBatches = caafPending.reduce((s, c) => s + c.req, 0);
  const today = new Date(new Date().toDateString());

  const THEME = { name: ((RC.NOM.brand || {}).name || 'Programme') + ' Readiness', headFontFace: 'Cambria', bodyFontFace: 'Calibri',
    colors: { dk1: '18242B', lt1: 'FFFFFF', dk2: '1F4E5A', lt2: 'F3F5F5', accent1: '2C6B7A', accent2: 'B7791F', accent3: 'A23B2A', accent4: '2F7D4F', accent5: '7D8A90', accent6: 'C9822B', hlink: '2C6B7A', folHlink: '4B5A62' } };
  const HEX = THEME.colors;
  const pres = new pptxgen(); pres.layout = 'LAYOUT_WIDE';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = 'Trainer readiness for STT batches'; pres.company = (RC.NOM.brand || {}).name || ''; pres.author = (RC.NOM.brand || {}).name || '';
  const C = pres.SchemeColor;
  const W = 13.333, H = 7.5, MX = 0.6;
  const footer = `${(RC.NOM.brand || {}).name || ''} · Trainer readiness · data as of ${d(N.asOf)}`;

  const DK = RC.NOM.deck || {};
  pres.defineSlideMaster({ title: 'COVER', background: { color: HEX.lt2 }, objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 2.2, w: W - 2 * MX, h: 0.9, fontSize: 44, bold: true, color: C.text1, fontFace: 'Cambria', valign: 'top', align: 'center', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: MX, y: 3.6, w: W - 2 * MX, h: 2.6, fontSize: 18, color: C.text1, valign: 'top', align: 'left', margin: 0 }, text: '' } },
  ] });
  pres.defineSlideMaster({ title: 'CONTENT', background: { color: HEX.lt1 }, margin: [0.5, 0.6, 0.6, 0.6],
    slideNumber: { x: W - 1.1, y: H - 0.42, w: 0.6, h: 0.3, fontSize: 10, color: HEX.accent5, align: 'right' },
    objects: [
      { text: { text: footer, options: { x: MX, y: H - 0.42, w: 8, h: 0.3, fontSize: 10, color: HEX.accent5, margin: 0 } } },
      { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 0.35, w: W - 2 * MX, h: 1.0, fontSize: 24, bold: true, color: C.text1, fontFace: 'Cambria', valign: 'top', align: 'left', margin: 0 }, text: '' } },
    ] });

  const add = (section, title, lead) => {
    const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: section });
    if (lead && title.startsWith(lead)) s.addText([{ text: lead + ' ', options: { bold: true } }, { text: title.slice(lead.length).trim(), options: { bold: false } }], { placeholder: 'title' });
    else s.addText(title, { placeholder: 'title' });
    return s;
  };
  const txt = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, fontSize: 14, color: C.text1, valign: 'top', ...o });
  const card = (s, x, y, w, h, name) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: name });
  const tbl = (s, rows, o) => s.addTable(rows, { fontFace: 'Calibri', fontSize: 12, color: HEX.dk1, border: { type: 'solid', pt: 0.5, color: 'DDE3E4' }, valign: 'middle', margin: [0.04, 0.08, 0.04, 0.08], ...o });
  const th = (t, o = {}) => ({ text: t, options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk2 }, fontSize: 11, ...o } });

  // 1 — cover
  pres.addSection({ title: 'Status' });
  const cv = pres.addSlide({ masterName: 'COVER', sectionTitle: 'Status' });
  cv.addText(DK.title || 'Trainer readiness for STT batches', { placeholder: 'title' });
  cv.addText([
    { text: `${N.centres.length} GTTC centres in Karnataka · ${m.required} batches · ${num(m.required * S)} seats`, options: { breakLine: true, align: 'center' } },
    { text: ' ', options: { breakLine: true } },
    { text: `Data as of ${d(N.asOf)}`, options: { bullet: true, breakLine: true, bold: true } },
    { text: `Prepared ${d(today)}`, options: { bullet: true, breakLine: true, bold: true } },
    { text: `${DK.startLabel || 'Planned batch start'} ${d(N.firstStart)}`, options: { bullet: true, breakLine: true, bold: true } },
    { text: ' ', options: { breakLine: true } },
    { text: `Sources: ${N.sources.plan.name}; ${N.sources.nominations.name}${N.sources.decisions ? '; ' + N.sources.decisions.name : ''}${N.sources.tot ? '; ' + N.sources.tot.name : ''}`, options: { fontSize: 12 } },
  ], { placeholder: 'body' });
  if (logoPng) cv.addImage({ path: logoPng, x: (W - 3.064) / 2, y: 0.247, w: 3.064, h: 1.173, altText: 'Logo' });
  txt(cv, DK.org || '', { x: MX, y: 1.5, w: W - 2 * MX, h: 0.4, fontSize: 14, bold: true, color: HEX.accent6, align: 'center' });

  // 2 — headline
  let s = add('Status', T.headline);
  const tiles = [
    [`${m.filled}/${m.required}`, 'batches with a trainer', `${num(m.filled * S)} of ${num(m.required * S)} seats`, HEX.accent1],
    [`${B.full.n}/${m.centres}`, 'centres fully staffed', `${B.full.batches} batches; ${B.partial.n} centres short by ${m.gap}`, HEX.accent1],
    [`${m.noTRcounted}`, 'mapped trainers without TR ID', `due ${ds(ms.tr && ms.tr.dueDate)}, before TOT`, HEX.accent2],
    [`${m.ready}`, 'batches ready to start today', `inspection by ${ds(ms.insp.dueDate)}, TOT ${ds(ms.tot.dueDate)}, students by ${ds(ms.students.dueDate)}`, HEX.accent3],
  ];
  const tw = (W - 2 * MX - 3 * 0.3) / 4;
  tiles.forEach(([v, l, sub, col], i) => {
    const x = MX + i * (tw + 0.3), y = 1.55;
    card(s, x, y, tw, 2.2, 'tile' + i);
    txt(s, v, { x: x + 0.25, y: y + 0.2, w: tw - 0.5, h: 0.8, fontSize: 40, bold: true, fontFace: 'Cambria', color: col });
    txt(s, l, { x: x + 0.25, y: y + 1.0, w: tw - 0.5, h: 0.5, fontSize: 14, bold: true });
    txt(s, sub, { x: x + 0.25, y: y + 1.55, w: tw - 0.5, h: 0.55, fontSize: 11, color: HEX.folHlink });
  });
  txt(s, [
    { text: 'CAAF: ', options: { bold: true } }, { text: `${m.caafDone} of ${m.centres} centres submitted; ${caafPending.length} await an NSDC technical fix (${caafPending.map(nm).join(', ')}) — all fully staffed, ${caafBatches} batches waiting only on NSDC.`, options: { breakLine: true } },
    { text: 'Nominations: ', options: { bold: true } }, { text: `${num(m.received)} received, ${num(m.unique)} unique people; ${m.filled} fit an allocated course and batch, ${m.backup} kept as backup, ${m.rejected} for courses not allocated to that centre.`, options: { breakLine: true } },
    { text: `${DK.startLabel || 'Planned batch start'}: `, options: { bold: true } }, { text: d(N.firstStart) },
  ], { x: MX, y: 4.1, w: W - 2 * MX, h: 2.4, fontSize: 15, paraSpaceAfter: 10 });

  // 3 — readiness gates (native chart + notes)
  s = add('Status', T.ladder, 'Batch readiness:');
  const gates = N.ladder.filter((x) => x.id !== 'planned');
  const labels = gates.map((x, i) => `${i + 1}. ${x.label}`);
  s.addChart(pres.charts.BAR, [{ name: 'Batches cleared', labels: labels.slice().reverse(), values: gates.map((x) => x.alone).reverse() }], {
    x: MX, y: 1.5, w: 7.4, h: 5.2, barDir: 'bar', chartColors: [HEX.accent1], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 14, dataLabelColor: HEX.dk1, dataLabelFontFace: '+mn-lt',
    valAxisMinVal: 0, valAxisMaxVal: m.required, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
    catAxisLabelFontSize: 13, catAxisLabelColor: HEX.dk1, catAxisLabelFontFace: '+mn-lt', barGapWidthPct: 45, showLegend: false,
    showTitle: true, title: `Batches through each gate (of ${m.required})`, titleFontSize: 13, titleColor: HEX.folHlink, titleFontFace: '+mn-lt' });
  const why = {
    caaf: `${caafBatches} batches at ${caafPending.length} centres awaiting NSDC CAAF fix`,
    insp: `NSDC inspection due by ${ds(ms.insp.dueDate)}; ${m.inspected}/${m.centres} centres done`,
    trainer: `${m.gap} batches have no trainer yet; due ${ds(ms.trainer.dueDate)}`,
    tr: `${m.noTRcounted} mapped trainers need a TR ID; due ${ds(ms.tr.dueDate)}`,
    tot: `TOT on ${ds(ms.tot.dueDate)}; ${m.totReq} of ${m.filled} mapped trainers requested${m.totWrong ? ` (${m.totWrong} for the wrong course)` : ''}; ${m.tot} completed`,
    students: `Onboarding due ${ds(ms.students.dueDate)}; ${m.onboarded} batches onboarded`,
  };
  txt(s, gates.map((x, i) => [
    { text: `${i + 1}. ${x.label}: `, options: { bold: true } },
    { text: x.id === 'tr' ? why[x.id] : `${m.required - x.alone} pending — ${why[x.id]}`, options: { breakLine: i < gates.length - 1 } }]).flat(),
    { x: 8.3, y: 1.6, w: W - 8.3 - MX, h: 4.6, fontSize: 13, paraSpaceAfter: 9 });
  txt(s, `A batch starts only when it clears all six gates: ${m.ready} today.`, { x: 8.3, y: 6.25, w: W - 8.3 - MX, h: 0.4, fontSize: 13, bold: true, color: HEX.accent3 });

  // 4 — distribution
  s = add('Status', T.distribution);
  const bandRows = (k) => B[k].centres.slice().sort((a, b) => b.gap - a.gap || nm(a).localeCompare(nm(b))).map((c) => [nm(c) + (c.caafDone ? '' : ' (CAAF pending)'), { text: `${c.filled}/${c.req}`, options: { align: 'right' } }, { text: c.gap ? `−${c.gap}` : '', options: { align: 'right', color: HEX.accent3, bold: true } }]);
  const colW = 3.75;
  tbl(s, [[th(`Fully staffed — ${B.full.n} centres, ${B.full.batches} batches`, { colspan: 3 })], ...bandRows('full')], { x: MX, y: 1.5, w: colW, colW: [2.45, 0.75, 0.55], fontSize: 10.5, rowH: 0.27 });
  tbl(s, [[th(`Short — ${B.partial.n} centres, ${B.partial.batches} batches, gap ${m.gap}`, { colspan: 3, fill: { color: HEX.accent2 } })], ...bandRows('partial')], { x: MX + colW + 0.3, y: 1.5, w: colW, colW: [2.45, 0.75, 0.55], fontSize: 10.5, rowH: 0.27 });
  const bc = Object.values(m.byCode);
  tbl(s, [[th('Course'), th('Batches', { align: 'right' }), th('Staffed', { align: 'right' }), th('Gap', { align: 'right' })],
    ...bc.map((b) => [short(b.code), { text: String(b.req), options: { align: 'right' } }, { text: String(b.filled), options: { align: 'right' } }, { text: b.req - b.filled ? String(b.req - b.filled) : '—', options: { align: 'right', bold: true, color: HEX.accent3 } }]),
    [{ text: 'Total', options: { bold: true } }, { text: String(m.required), options: { align: 'right', bold: true } }, { text: String(m.filled), options: { align: 'right', bold: true } }, { text: String(m.gap), options: { align: 'right', bold: true, color: HEX.accent3 } }]],
    { x: MX + 2 * (colW + 0.3), y: 1.5, w: W - 2 * MX - 2 * (colW + 0.3), colW: [2.0, 0.85, 0.65, 0.53], fontSize: 11, rowH: 0.36 });
  txt(s, `(CAAF pending) = awaiting NSDC technical fix: ${caafPending.length} centres, ${caafBatches} batches, all fully staffed.`, { x: MX + 2 * (colW + 0.3), y: 4.85, w: W - 2 * MX - 2 * (colW + 0.3), h: 0.8, fontSize: 12, color: HEX.folHlink });

  // 4b — by course (CR9)
  s = add('Status', T.courses);
  const cs2 = Object.values(m.byCode).sort((a, b) => b.gap - a.gap || b.req - a.req);
  const cw = (W - 2 * MX - 0.4) / 2, chh = 2.55;
  cs2.forEach((o, i) => {
    const x = MX + (i % 2) * (cw + 0.4), y = 1.5 + Math.floor(i / 2) * (chh + 0.3);
    card(s, x, y, cw, chh, 'course-' + o.code);
    txt(s, short(o.code), { x: x + 0.25, y: y + 0.15, w: cw - 0.5, h: 0.35, fontSize: short(o.code).length > 48 ? 12.5 : 15, bold: true, fontFace: 'Cambria' });
    txt(s, `${o.code} · ${o.centres} centre${o.centres > 1 ? 's' : ''} · ${o.req} batches`, { x: x + 0.25, y: y + 0.5, w: cw - 0.5, h: 0.3, fontSize: 11, color: HEX.accent5 });
    const stats = [[`${o.filled}/${o.req}`, 'batches staffed', HEX.accent1], [o.gap ? String(o.gap) : '—', 'gap', o.gap ? HEX.accent3 : HEX.accent4], [`${o.withTR}/${o.filled}`, 'with TR ID', HEX.dk1], [String(o.backup), 'backup', HEX.dk1]];
    const sw = (cw - 0.5) / 4;
    stats.forEach(([v, l, col], j) => {
      txt(s, v, { x: x + 0.25 + j * sw, y: y + 0.85, w: sw, h: 0.5, fontSize: 24, bold: true, fontFace: 'Cambria', color: col });
      txt(s, l, { x: x + 0.25 + j * sw, y: y + 1.35, w: sw, h: 0.28, fontSize: 11, color: HEX.folHlink });
    });
    s.addShape(pres.shapes.RECTANGLE, { x: x + 0.25, y: y + 1.72, w: cw - 0.5, h: 0.09, fill: { color: 'E4E8E9' }, line: { color: 'E4E8E9' }, objectName: 'bar-bg-' + o.code });
    if (o.filled) s.addShape(pres.shapes.RECTANGLE, { x: x + 0.25, y: y + 1.72, w: (cw - 0.5) * o.filled / o.req, h: 0.09, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: 'bar-' + o.code });
    const sc = o.shortCentres.map((xx) => `${nm(xx.c)} −${xx.b.gap}`);
    txt(s, o.gap ? [{ text: `Short at ${o.shortCentres.length}: `, options: { bold: true } }, { text: (sc.length > 7 ? sc.slice(0, 7).join(', ') + ` and ${sc.length - 7} more` : sc.join(', ')) + (o.pool.length ? ` · ${o.pool.length} nominated where not allocated` : '') }] : 'Every allocated batch has a trainer.' + (o.pool.length ? ` ${o.pool.length} nominated where not allocated.` : ''),
      { x: x + 0.25, y: y + 1.9, w: cw - 0.5, h: 0.6, fontSize: 11, color: HEX.folHlink });
  });

  // 5 — map
  s = add('Status', T.map);
  const mh = 5.6, mw = mh * 1215 / 1923;
  s.addImage({ path: mapPng, x: MX, y: 1.45, w: mw, h: mh, altText: 'Map of Karnataka with a pin per GTTC centre, coloured by trainer staffing' });
  const lx = MX + mw + 0.5;
  txt(s, [
    { text: '● ', options: { color: HEX.accent4 } }, { text: `Fully staffed  ${B.full.n}`, options: { breakLine: true } },
    { text: '● ', options: { color: HEX.accent2 } }, { text: `Short of trainers  ${B.partial.n}`, options: { breakLine: true } },
    { text: '◌ ', options: { color: HEX.accent3, bold: true } }, { text: `CAAF awaiting NSDC  ${caafPending.length}` },
  ], { x: lx, y: 1.5, w: 4.5, h: 1.1, fontSize: 14, paraSpaceAfter: 4 });
  txt(s, 'Pin size and number = batches planned. Locations approximate (town level).', { x: lx, y: 2.6, w: W - lx - MX, h: 0.35, fontSize: 11, color: HEX.accent5 });
  const shortC = N.centres.filter((c) => c.gap > 0).sort((a, b) => b.gap - a.gap || nm(a).localeCompare(nm(b)));
  const topN = 7;
  tbl(s, [[th('Largest gaps'), th('Short by course')], ...shortC.slice(0, topN).map((c) => [nm(c), { text: c.byCourse.filter((b) => b.gap).map((b) => `${short(b.code)} −${b.gap}`).join('\n'), options: { color: HEX.accent3 } }])],
    { x: lx, y: 3.05, w: W - lx - MX, colW: [1.9, W - lx - MX - 1.9], fontSize: 10, rowH: 0.25 });
  if (shortC.length > topN) txt(s, `+ ${shortC.length - topN} more centres short by 1 or more — see Appendix A.`, { x: lx, y: 6.55, w: W - lx - MX, h: 0.3, fontSize: 10.5, color: HEX.accent5 });

  // 6 — gaps & owners
  s = add('Status', T.gaps);
  const gapRows = [
    ['Trainer nominations', `${m.gap} batches at ${B.partial.n + B.none.n} centres`, ms.trainer, bc.filter((b) => b.req > b.filled).map((b) => `${short(b.code)} ${b.req - b.filled}`).join(', ')],
    ['TR IDs', `${m.noTRcounted} mapped trainers`, ms.tr, `${N.centres.filter((c) => c.requiredPeople.some((p) => !p.tr)).length} centres affected`],
    ['TOT', `${m.filled - m.totReq} mapped trainers yet to request (+ new nominees)`, ms.tot, `${m.totReq} requested${m.totWrong ? ` · ${m.totWrong} wrong course` : ''} · ${m.tot} completed`],
    ['CAAF technical issue', `${caafPending.length} centres, ${caafBatches} batches`, ms.caaf, caafPending.map(nm).join(', ')],
    ['NSDC inspection', `${m.centres - m.inspected} centres`, ms.insp, `${m.inspected} done`],
    ['Student onboarding', `${m.required - m.onboarded} batches (${num((m.required - m.onboarded) * S)} seats)`, ms.students, `can begin now for ${m.mobilisable} batches with trainer + TR ID at CAAF-submitted centres`],
  ];
  tbl(s, [[th('Gap'), th('Size'), th('Owner'), th('Due'), th('Detail')], ...gapRows.map(([g, sz, mi, det]) => [{ text: g, options: { bold: true } }, sz, RC.NomPresent.ownerOf(mi), mi && mi.dueDate ? d(mi.dueDate) : (mi && mi.note) || '—', { text: det, options: { color: HEX.folHlink } }])],
    { x: MX, y: 1.5, w: W - 2 * MX, colW: [2.2, 2.5, 2.0, 2.2, W - 2 * MX - 8.9], fontSize: 12.5, rowH: 0.5 });
  const sq = N.sequencing;
  if (DK.showSequencingOption && sq.coverable) {
    card(s, MX, 5.55, W - 2 * MX, 1.05, 'option-callout');
    txt(s, [{ text: 'Option checked: one trainer running two batches in sequence. ', options: { bold: true } },
      { text: `It would cover ${sq.coverable} of the ${m.gap} unstaffed batches, but the second batch would finish around ${d(sq.secondBatchEnds)}, after the plan window ends (${d(sq.planEnd)}). ${sq.viable ? 'It fits the window.' : 'Not viable within the plan; the missing nominations are needed.'}` }],
      { x: MX + 0.25, y: 5.7, w: W - 2 * MX - 0.5, h: 0.8, fontSize: 13 });
  }

  // 7 — timeline (native shapes)
  s = add('Status', T.timeline);
  const evs = [{ dt: today, l: 'Today', col: HEX.accent1 }, ...N.milestones.filter((x) => x.dueDate).map((x) => ({ dt: x.dueDate, l: x.tl || x.label, col: HEX.accent2 })), { dt: N.firstStart, l: DK.startLabel || 'Planned batch start', col: HEX.accent4 }].sort((a, b) => a.dt - b.dt);
  const mg = []; for (const e of evs) { const p = mg[mg.length - 1]; if (p && F.iso(p.dt) === F.iso(e.dt)) p.l += ' + ' + e.l; else mg.push({ ...e }); }
  const t0 = mg[0].dt, t1 = mg[mg.length - 1].dt, span = Math.max(1, (t1 - t0) / 864e5);
  const tx0 = MX + 0.4, tx1 = W - MX - 0.6, ty = 2.6;
  const XX = (dt) => tx0 + ((dt - t0) / 864e5 / span) * (tx1 - tx0);
  s.addShape(pres.shapes.LINE, { x: tx0, y: ty, w: tx1 - tx0, h: 0, line: { color: C.text1, width: 2 } });
  let lastAbove = -9, lastBelow = -9;
  mg.forEach((e, i) => {
    const x = XX(e.dt);
    s.addShape(pres.shapes.OVAL, { x: x - 0.11, y: ty - 0.11, w: 0.22, h: 0.22, fill: { color: e.col }, line: { color: HEX.lt1, width: 1.5 }, objectName: 'tl-' + i });
    const above = x - lastAbove > 1.6 || x - lastBelow <= 1.6; if (above) lastAbove = x; else lastBelow = x;
    txt(s, [{ text: ds(e.dt), options: { bold: true, breakLine: true } }, { text: e.l }], { x: x - 0.95, y: above ? ty - 0.9 : ty + 0.25, w: 1.9, h: 0.65, fontSize: 12, align: 'center' });
  });
  const lastDue = N.milestones.filter((x) => x.dueDate).sort((a, b) => b.dueDate - a.dueDate)[0];
  tbl(s, [[th('Milestone'), th('Due'), th('Working Days left', { align: 'right' }), th('Done'), th('Owner')],
    ...N.milestones.map((x) => [x.label, x.dueDate ? d(x.dueDate) : x.note || '—', { text: x.dueDate ? String(RC.NomPresent.workingDaysLeft(today, x.dueDate)) : '—', options: { align: 'right' } }, `${x.done}/${x.total} ${x.unit}`, x.owner])],
    { x: MX, y: 3.9, w: W - 2 * MX, colW: [3.6, 2.9, 1.2, 2.0, W - 2 * MX - 9.7], fontSize: 12, rowH: 0.36 });

  // 8 — asks
  s = add('Status', T.asks);
  const asks = RC.NomPresent.asks(N);
  const RED = 'FF0000';
  let ay = 1.45;
  asks.forEach((a, i) => {
    const lines = 1 + (a.helpList.length || 0) + ((a.text + ' ' + a.help).length > 105 ? 1 : 0);
    const hgt = Math.max(0.6, 0.3 * lines + 0.15);
    s.addShape(pres.shapes.OVAL, { x: MX, y: ay + 0.05, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: 'ask-' + (i + 1) });
    txt(s, String(i + 1), { x: MX, y: ay + 0.05, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    txt(s, a.owner.toUpperCase(), { x: MX + 0.75, y: ay + 0.12, w: 2.4, h: 0.4, fontSize: 12, bold: true, color: HEX.folHlink });
    const runs = [{ text: a.text + (a.help ? ' ' : ''), options: { breakLine: !a.help && a.helpList.length > 0 } }];
    if (a.help) runs.push({ text: a.help, options: { color: RED, breakLine: a.helpList.length > 0 } });
    a.helpList.forEach((t, k) => runs.push({ text: `${k + 1}. ${t}`, options: { color: RED, breakLine: k < a.helpList.length - 1 } }));
    txt(s, runs, { x: MX + 3.2, y: ay + 0.05, w: W - MX - 3.2 - MX, h: hgt, fontSize: 15 });
    ay += hgt + 0.25;
  });

  // 9 — appendix A
  pres.addSection({ title: 'Appendix' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Appendix' }); s.addText('Appendix A — Centre-wise status', { placeholder: 'title' });
  const cs = N.centres.slice().sort((a, b) => nm(a).localeCompare(nm(b)));
  const half = Math.ceil(cs.length / 2);
  const crow = (c) => [nm(c), { text: c.caafDone ? 'Submitted' : 'Awaiting NSDC', options: { color: c.caafDone ? HEX.dk1 : HEX.accent3, bold: !c.caafDone } }, { text: String(c.req), options: { align: 'right' } }, { text: String(c.filled), options: { align: 'right' } }, { text: c.gap ? String(c.gap) : '', options: { align: 'right', color: HEX.accent3, bold: true } }, { text: String(c.requiredPeople.filter((p) => !p.tr).length || ''), options: { align: 'right' } }];
  const ahead = [th('Centre'), th('CAAF'), th('Batches', { align: 'right' }), th('Staffed', { align: 'right' }), th('Gap', { align: 'right' }), th('No TR ID', { align: 'right' })];
  const aw = (W - 2 * MX - 0.3) / 2, acw = [2.1, 1.35, 0.7, 0.7, 0.5, aw - 5.35];
  tbl(s, [ahead, ...cs.slice(0, half).map(crow)], { x: MX, y: 1.2, w: aw, colW: acw, fontSize: 10.5, rowH: 0.29 });
  tbl(s, [ahead.map((x) => ({ ...x, options: { ...x.options } })), ...cs.slice(half).map(crow)], { x: MX + aw + 0.3, y: 1.2, w: aw, colW: acw, fontSize: 10.5, rowH: 0.29 });

  // 10 — appendix B
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Appendix' }); s.addText('Appendix B — How nominations were counted', { placeholder: 'title' });
  const steps = [[m.received, 'Nominations received'], [m.unique, 'Unique people (by mobile)'], [m.filled + m.backup, 'Fit an allocated course'], [m.filled, 'Counted, 1 per batch']];
  const bw = (W - 2 * MX - 3 * 0.45) / 4;
  steps.forEach(([v, l], i) => {
    const x = MX + i * (bw + 0.45);
    card(s, x, 1.5, bw, 1.5, 'step' + i);
    txt(s, num(v), { x: x + 0.25, y: 1.65, w: bw - 0.5, h: 0.75, fontSize: 36, bold: true, fontFace: 'Cambria', color: C.accent1 });
    txt(s, l, { x: x + 0.25, y: 2.45, w: bw - 0.5, h: 0.4, fontSize: 13, color: HEX.folHlink });
    if (i < 3) txt(s, '→', { x: x + bw + 0.05, y: 2.0, w: 0.35, h: 0.5, fontSize: 22, color: HEX.accent5, align: 'center' });
  });
  txt(s, [
    { text: `Required trainers = target seats ÷ ${S} for each course at each centre (1 trainer per batch).`, options: { bullet: true, breakLine: true } },
    { text: `Extra nominations for a course are kept as backup (${m.backup}); nominations for a course not allocated to that centre are rejected (${m.rejected}).`, options: { bullet: true, breakLine: true } },
    { text: `A person nominated for several courses is counted once, on the course with the biggest shortfall (${m.multiCourse} people).`, options: { bullet: true, breakLine: true } },
    { text: `Batch start dates before ${ds(N.agreedStart)} in the plan file are moved to the planned start.`, options: { bullet: true, breakLine: true } },
    { text: 'Eligibility of nominees is assumed for now; to be reviewed.', options: { bullet: true } },
  ], { x: MX, y: 3.4, w: W - 2 * MX, h: 3.0, fontSize: 15, paraSpaceAfter: 8 });

  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log('wrote', out, 'slides', 11, 'titles:', Object.values(T).filter(Boolean).length);
})().catch((e) => { console.error(e); process.exit(1); });
