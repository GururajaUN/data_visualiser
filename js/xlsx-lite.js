/* ============================================================
   xlsx-lite — dependency-free .xlsx reader and writer.
   Reader: ZIP central directory + DecompressionStream('deflate-raw').
   Writer: stored (uncompressed) ZIP with inline strings.
   Exposes RC.Xlsx.read(arrayBuffer) and RC.Xlsx.write(sheets).
   ============================================================ */
(function (G) {
  const RC = (G.RC = G.RC || {});
  const td = new TextDecoder('utf-8');
  const te = new TextEncoder();

  /* ---------- ZIP read ---------- */
  function unzipIndex(buf) {
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid .xlsx file (zip directory not found)');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = {};
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lo = dv.getUint32(p + 42, true);
      const name = td.decode(new Uint8Array(buf, p + 46, nlen));
      entries[name] = { method, csize, lo };
      p += 46 + nlen + elen + clen;
    }
    return { dv, buf, entries };
  }
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function readEntry(z, name) {
    const e = z.entries[name];
    if (!e) return null;
    const n2 = z.dv.getUint16(e.lo + 26, true), x2 = z.dv.getUint16(e.lo + 28, true);
    const start = e.lo + 30 + n2 + x2;
    const raw = new Uint8Array(z.buf, start, e.csize);
    const out = e.method === 0 ? raw : await inflateRaw(raw);
    return td.decode(out);
  }

  /* ---------- XML helpers (regex based; xlsx XML is regular) ---------- */
  function unesc(s) {
    if (s == null) return s;
    return s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (m, e) =>
        e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" :
        e[1] === 'x' ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(parseInt(e.slice(1), 10)));
  }
  function attrs(s) {
    const o = {}; const re = /([\w:]+)\s*=\s*"([^"]*)"/g; let m;
    while ((m = re.exec(s))) o[m[1]] = unesc(m[2]);
    return o;
  }
  function textOf(xml) {
    let out = ''; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g; let m;
    while ((m = re.exec(xml))) out += m[1] ? unesc(m[1]) : '';
    return out;
  }
  function colIndex(ref) {
    let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
  function isDateFmt(code) {
    if (!code) return false;
    const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
    return /[dy]/i.test(c) || /m{1,2}[^a-z]*[d]/i.test(c) || /mmm/i.test(c);
  }
  function serialToDate(v, d1904) {
    const ms = Math.round((v - (d1904 ? 24107 : 25569)) * 86400000);
    const u = new Date(ms);
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
  }

  async function read(buf) {
    const z = unzipIndex(buf);
    const wbXml = await readEntry(z, 'xl/workbook.xml');
    if (!wbXml) throw new Error('Not an Excel workbook (xl/workbook.xml missing)');
    const d1904 = /date1904="(1|true)"/.test(wbXml);
    const rels = {};
    const relXml = (await readEntry(z, 'xl/_rels/workbook.xml.rels')) || '';
    relXml.replace(/<Relationship\b([^>]*)\/?>/g, (m, a) => { const o = attrs(a); rels[o.Id] = o.Target; });
    const sst = [];
    const sstXml = await readEntry(z, 'xl/sharedStrings.xml');
    if (sstXml) sstXml.replace(/<si>([\s\S]*?)<\/si>/g, (m, inner) => { sst.push(textOf(inner.replace(/<rPh[\s\S]*?<\/rPh>/g, ''))); });
    const fmts = {}; const xfDate = [];
    const stXml = await readEntry(z, 'xl/styles.xml');
    if (stXml) {
      stXml.replace(/<numFmt\b([^>]*)\/?>/g, (m, a) => { const o = attrs(a); fmts[+o.numFmtId] = o.formatCode; });
      const cx = (stXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '';
      cx.replace(/<xf\b([^>]*?)(\/>|>)/g, (m, a) => {
        const id = +(attrs(a).numFmtId || 0);
        xfDate.push(DATE_IDS.has(id) || (id >= 164 && isDateFmt(fmts[id])));
      });
    }
    const sheets = {}; const order = [];
    const sheetDefs = []; wbXml.replace(/<sheet\b([^>]*)\/?>/g, (m, a) => sheetDefs.push(attrs(a)));
    for (const sd of sheetDefs) {
      let target = rels[sd['r:id']] || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const xml = await readEntry(z, target);
      if (xml == null) continue;
      const rows = [];
      const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g; let rm; let autoR = 0;
      while ((rm = rowRe.exec(xml))) {
        const ra = attrs(rm[1]); const r = ra.r ? +ra.r - 1 : autoR; autoR = r + 1;
        const body = rm[2] || ''; const row = [];
        const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm; let autoC = 0;
        while ((cm = cRe.exec(body))) {
          const ca = attrs(cm[1]); const ci = ca.r ? colIndex(ca.r) : autoC; autoC = ci + 1;
          const inner = cm[2] || ''; let val = null;
          const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
          const t = ca.t || 'n';
          if (t === 's') val = vm ? sst[+vm[1]] : null;
          else if (t === 'inlineStr') val = textOf(inner);
          else if (t === 'str') val = vm ? unesc(vm[1]) : null;
          else if (t === 'b') val = vm ? vm[1] === '1' : null;
          else if (t === 'e') val = vm ? '#ERR ' + vm[1] : null;
          else if (t === 'd') val = vm ? new Date(vm[1]) : null;
          else if (vm) { const num = +vm[1]; val = xfDate[+(ca.s || 0)] ? serialToDate(num, d1904) : num; }
          if (val !== null && val !== '') row[ci] = val;
        }
        rows[r] = row;
      }
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      // merged cells: copy the top-left value into every cell of the range
      const mRe = /<mergeCell\b[^>]*ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g; let mm;
      while ((mm = mRe.exec(xml))) {
        const c0 = colIndex(mm[1]), r0 = +mm[2] - 1, c1 = colIndex(mm[3]), r1 = +mm[4] - 1;
        const v = rows[r0] ? rows[r0][c0] : undefined;
        if (v == null) continue;
        for (let r = r0; r <= r1; r++) { if (!rows[r]) rows[r] = []; for (let c = c0; c <= c1; c++) if (rows[r][c] == null) rows[r][c] = v; }
      }
      sheets[sd.name] = rows; order.push(sd.name);
    }
    return { sheets, order };
  }

  /* ---------- ZIP write (stored) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(files) {
    const parts = [], central = []; let off = 0;
    for (const [name, str] of files) {
      const data = te.encode(str), nb = te.encode(name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nb);
      off += 30 + nb.length + data.length;
    }
    const csize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  function colName(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function dateToSerial(d) { return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 + 25569; }

  /* sheets: [{ name, rows: [[...]], headStyles?: ['edit'|null per column] }] — first row is the header (bold; 'edit' = yellow). Dates -> date cells. */
  function write(sheets) {
    const files = [];
    files.push(['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>']);
    files.push(['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
    files.push(['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>']);
    files.push(['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
    files.push(['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mmm\\-yyyy"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF3D2A00"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E5A"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6DFB4"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf fontId="2" fillId="3" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']);
    sheets.forEach((s, si) => {
      const widths = [];
      const body = s.rows.map((row, ri) => '<row r="' + (ri + 1) + '">' + row.map((v, ci) => {
        if (v == null || v === '') return '';
        const ref = colName(ci) + (ri + 1);
        const len = v instanceof Date ? 11 : String(v).length; widths[ci] = Math.min(60, Math.max(widths[ci] || 8, len + 2));
        if (ri === 0) return `<c r="${ref}" s="${s.headStyles && s.headStyles[ci] === 'edit' ? 3 : 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
        if (v instanceof Date) return `<c r="${ref}" s="2"><v>${dateToSerial(v)}</v></c>`;
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      }).join('') + '</row>').join('');
      const cols = widths.length ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w || 8}" customWidth="1"/>`).join('') + '</cols>' : '';
      files.push([`xl/worksheets/sheet${si + 1}.xml`, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' + cols + '<sheetData>' + body + '</sheetData></worksheet>']);
    });
    return zip(files);
  }

  RC.Xlsx = { read, write };
})(typeof window !== 'undefined' ? window : globalThis);
