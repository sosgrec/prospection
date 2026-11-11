// Bilan mensuel en PDF (généré sur l'iPhone, sans connexion).
import { monthReport, suggestions, GOAL_DOORS, GOAL_MANDATS, DAYS, SLOTS } from './stats.js';
import { S, contactName, contactMainAddress, addrLabel } from './state.js';
import { fmtMonth, fmtDate, fmtNum, fmtPct, fmtDayShort, shareOrDownload, dayStr } from './util.js';

// Les polices standard du PDF ne couvrent que l'alphabet latin courant : on remplace le reste.
const clean = (s) =>
  String(s ?? '')
    .replace(/[  ]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/→/g, '->')
    .replace(/[^\x20-\x7E -ÿŒœ€…]/g, '');

export async function monthlyPdf(monthStart) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const R = monthReport(monthStart);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 14;
  const blue = [29, 78, 216];
  const grey = [107, 114, 128];
  const text = (s, x, y, opt) => doc.text(clean(s), x, y, opt);
  let y = 18;

  const month = fmtMonth(R.t0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  text('Bilan de prospection', M, y);
  doc.setFontSize(13);
  doc.setTextColor(...blue);
  text(month.charAt(0).toUpperCase() + month.slice(1), M, y + 8);
  doc.setTextColor(...grey);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  text(`Généré le ${fmtDate(Date.now())} · Prospection`, W - M, y, { align: 'right' });
  y += 18;

  // Indicateurs clés
  const kpis = [
    ['Portes', fmtNum(R.portes), `${fmtNum(R.parSemaine, 0)} / semaine (objectif ${GOAL_DOORS})`],
    ['Mandats', `${R.mandats.length} / ${GOAL_MANDATS}`, R.mandats.length >= GOAL_MANDATS ? 'Objectif atteint' : `${GOAL_MANDATS - R.mandats.length} de plus pour l'objectif`],
    ["Taux d'ouverture", R.tauxOuverture == null ? '-' : fmtPct(R.tauxOuverture), `${fmtNum(R.ouvertures)} portes ouvertes, dont ${R.refus} refus`],
    ['Personnes rencontrées', fmtNum(R.rencontres), `${R.nouveauxContacts} nouvelles fiches`],
    ['Projets détectés', fmtNum(R.projets), `dont ${R.chauds} chauds`],
    ['Relances faites', fmtNum(R.relancesFaites), `${R.absents} portes sans réponse`],
  ];
  const bw = (W - 2 * M - 2 * 4) / 3;
  kpis.forEach(([l, v, sub], i) => {
    const x = M + (i % 3) * (bw + 4);
    const yy = y + Math.floor(i / 3) * 24;
    doc.setDrawColor(228, 231, 235);
    doc.setFillColor(248, 249, 251);
    doc.roundedRect(x, yy, bw, 20, 2, 2, 'FD');
    doc.setTextColor(...grey);
    doc.setFontSize(8);
    text(l, x + 3, yy + 5);
    doc.setTextColor(22, 25, 29);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    text(v, x + 3, yy + 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...grey);
    text(sub, x + 3, yy + 17.5);
  });
  y += 52;

  // Portes par semaine
  doc.setTextColor(22, 25, 29);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  text('Portes par semaine', M, y);
  y += 4;
  const ch = 38;
  const cw = W - 2 * M;
  const max = Math.max(GOAL_DOORS * 1.15, ...R.weeks.map((w) => w.count));
  const n = R.weeks.length;
  const slot = cw / Math.max(n, 1);
  doc.setFont('helvetica', 'normal');
  R.weeks.forEach((w, i) => {
    const h = (w.count / max) * ch;
    const x = M + i * slot + slot * 0.2;
    doc.setFillColor(...(w.count >= GOAL_DOORS ? [31, 157, 85] : blue));
    if (h > 0) doc.rect(x, y + ch - h, slot * 0.6, h, 'F');
    doc.setFontSize(8);
    doc.setTextColor(22, 25, 29);
    text(String(w.count), x + slot * 0.3, y + ch - h - 1.5, { align: 'center' });
    doc.setTextColor(...grey);
    text(`sem. du ${fmtDayShort(w.start)}`, x + slot * 0.3, y + ch + 4.5, { align: 'center' });
  });
  const gy = y + ch - (GOAL_DOORS / max) * ch;
  doc.setDrawColor(220, 38, 38);
  doc.setLineDashPattern([1.5, 1.2], 0);
  doc.line(M, gy, W - M, gy);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(7.5);
  doc.setTextColor(220, 38, 38);
  text('objectif 100', W - M, gy - 1.2, { align: 'right' });
  y += ch + 12;

  const table = (title, head, body, opts = {}) => {
    if (y > 250) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(22, 25, 29);
    text(title, M, y);
    autoTable(doc, {
      startY: y + 2.5,
      head: [head.map(clean)],
      body: body.length ? body.map((r) => r.map(clean)) : [[{ content: 'Aucune donnée sur la période', colSpan: head.length, styles: { textColor: grey, fontStyle: 'italic' } }]],
      margin: { left: M, right: M },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, lineColor: [228, 231, 235], lineWidth: 0.1 },
      headStyles: { fillColor: [232, 238, 252], textColor: [29, 78, 216], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 251, 252] },
      ...opts,
    });
    y = doc.lastAutoTable.finalY + 9;
  };

  table(
    'Par îlot',
    ['Îlot', 'Portes', 'Ouvertures', 'Taux', 'Rencontres', 'Projets', 'Mandats', 'Couverture'],
    R.ilots.map((x) => [`${x.il.id} · ${x.il.nom}`, x.portes, x.ouvertures, x.tauxOuverture == null ? '-' : fmtPct(x.tauxOuverture), x.contacts, x.projets, x.mandats, fmtPct(x.couverture)]),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } } },
  );
  table(
    'Scénarios',
    ['Scénario', 'Présentations', 'Personnes', 'Projets', 'Mandats'],
    R.scenarios.filter((x) => x.presentations).map((x) => [x.s.titre, x.presentations, x.contacts, `${x.projets}${x.tauxProjet != null ? ` (${fmtPct(x.tauxProjet)})` : ''}`, x.mandats]),
  );
  const cells = [];
  R.grid.forEach((row, d) => row.forEach((c, s) => c.n >= 5 && cells.push({ d, s, ...c, r: c.open / c.n })));
  cells.sort((a, b) => b.r - a.r || b.n - a.n);
  table(
    'Meilleurs créneaux (au moins 5 portes)',
    ['Jour', 'Créneau', 'Portes', 'Ouvertes', 'Taux'],
    cells.slice(0, 6).map((c) => [DAYS[c.d], SLOTS[c.s].label, c.n, c.open, fmtPct(c.r)]),
  );
  table(
    'Mandats signés',
    ['Date', 'Contact', 'Adresse'],
    R.mandats.map((c) => [fmtDate(c.mandatDate), contactName(c), contactMainAddress(c) ? addrLabel(contactMainAddress(c)) : '']),
  );

  const sug = suggestions();
  if (sug.length) {
    if (y > 245) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(22, 25, 29);
    text('Pistes pour progresser', M, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const s of sug) {
      const lines = doc.splitTextToSize(clean(s), W - 2 * M - 5);
      if (y + lines.length * 4.4 > 285) {
        doc.addPage();
        y = 18;
      }
      doc.setFillColor(...blue);
      doc.circle(M + 1.2, y - 1.1, 0.9, 'F');
      doc.text(lines, M + 5, y);
      y += lines.length * 4.4 + 1.8;
    }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...grey);
    text(`Prospection · bilan ${month} · page ${i}/${pages}`, W / 2, 292, { align: 'center' });
  }
  const blob = doc.output('blob');
  return shareOrDownload(blob, `bilan-prospection-${dayStr(R.t0).slice(0, 7)}.pdf`, `Bilan ${month}`);
}

export { S };
