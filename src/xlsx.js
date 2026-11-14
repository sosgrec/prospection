// Lecture et écriture de fichiers Excel (.xlsx) sans bibliothèque lourde.
// Un .xlsx est une archive zip de fichiers XML : on l'écrit et on le relit directement.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const xmlEsc = (s) =>
  String(s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function colName(i) {
  let s = '';
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}
const colIndex = (letters) => letters.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

function sheetXML(rows, widths) {
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  out.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
  out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
  if (widths?.length) out.push(`<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`);
  out.push('<sheetData>');
  rows.forEach((row, r) => {
    const cells = [];
    row.forEach((v, c) => {
      if (v === null || v === undefined || v === '') return;
      const ref = colName(c) + (r + 1);
      const style = r === 0 ? ' s="1"' : '';
      if (typeof v === 'number' && Number.isFinite(v)) cells.push(`<c r="${ref}"${style}><v>${v}</v></c>`);
      else {
        let s = String(v);
        if (s.length > 32760) s = s.slice(0, 32760);
        cells.push(`<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEsc(s)}</t></is></c>`);
      }
    });
    out.push(`<row r="${r + 1}">${cells.join('')}</row>`);
  });
  out.push('</sheetData></worksheet>');
  return out.join('');
}

// sheets : [{ name, rows: [[...], ...], widths?: [...] }]
export function writeXlsx(sheets, { level = 6 } = {}) {
  const files = {};
  const n = sheets.length;
  files['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
  );
  files['_rels/.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
  );
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  files['docProps/core.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Sauvegarde Prospection</dc:title><dc:creator>Prospection</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`,
  );
  files['docProps/app.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Prospection</Application></Properties>',
  );
  files['xl/workbook.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  files['xl/styles.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  );
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXML(s.rows, s.widths));
  });
  return zipSync(files, { level });
}

// ---------- Lecture ----------
const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&');

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
};
const texts = (xml) => {
  // Concatène les <t> d'un élément (texte riche compris), sans les annotations phonétiques.
  const clean = xml.replace(/<(\w+:)?rPh\b[\s\S]*?<\/(\w+:)?rPh>/g, '');
  let out = '';
  const re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?t(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = re.exec(clean))) out += m[1] ? decode(m[1]) : '';
  return out;
};

export function readXlsx(data) {
  const files = unzipSync(data instanceof Uint8Array ? data : new Uint8Array(data));
  const get = (p) => {
    const k = Object.keys(files).find((f) => f.toLowerCase() === p.toLowerCase());
    return k ? strFromU8(files[k]) : null;
  };
  const wb = get('xl/workbook.xml');
  if (!wb) throw new Error('Ce fichier n’est pas un classeur Excel valide');
  const rels = get('xl/_rels/workbook.xml.rels') || '';
  const relMap = {};
  for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) relMap[attr(m[0], 'Id')] = attr(m[0], 'Target');
  const shared = [];
  const ss = get('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>|<(?:\w+:)?si\b[^>]*\/>/g)) shared.push(m[1] ? texts(m[1]) : '');
  const out = {};
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name');
    const rid = attr(m[0], 'r:id') || (m[0].match(/\s\w+:id="([^"]*)"/) || [])[1];
    let target = relMap[rid] || '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const xml = get(target);
    if (!xml) continue;
    const rows = [];
    let rowIdx = -1;
    for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
      const rAttr = attr(' ' + rm[1], 'r');
      rowIdx = rAttr ? +rAttr - 1 : rowIdx + 1;
      const row = [];
      let colIdx = -1;
      for (const cm of (rm[2] || '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const a = ' ' + cm[1];
        const ref = attr(a, 'r');
        colIdx = ref ? colIndex(ref.replace(/\d+/g, '')) : colIdx + 1;
        const t = attr(a, 't');
        const inner = cm[2] || '';
        const vm = inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
        const v = vm ? decode(vm[1]) : null;
        let val;
        if (t === 's') val = shared[+v] ?? '';
        else if (t === 'inlineStr') val = texts(inner);
        else if (t === 'str' || t === 'e') val = v ?? '';
        else if (t === 'b') val = v === '1';
        else val = v === null ? '' : Number(v);
        row[colIdx] = val;
      }
      rows[rowIdx] = row;
    }
    out[name] = rows.map((r) => r || []);
  }
  return out;
}
