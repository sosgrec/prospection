// Statistiques : objectifs, ouverture par créneau, efficacité des scénarios, rendement des îlots, priorités.
import { S, activeContacts, addressColor, signalsOf, hasVendeurPotentiel, absentsARepasser, relancesActives, contactAddressLinks, linksOfAddress, activeScenarios } from './state.js';
import { startOfWeek, startOfMonth, addMonths, addDays, daysAgo, todayStr, dayStr, fmtAgo, plural, fmtPct } from './util.js';

export const GOAL_DOORS = 100;
export const GOAL_MANDATS = 3;
export const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const DAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const SLOTS = [
  { id: 'm', label: '8h-12h', from: 8, to: 12 },
  { id: 'mid', label: '12h-14h', from: 12, to: 14 },
  { id: 'am', label: '14h-17h', from: 14, to: 17 },
  { id: 'fin', label: '17h-19h', from: 17, to: 19 },
  { id: 'soir', label: '19h-21h', from: 19, to: 21 },
];
const slotOf = (h) => SLOTS.findIndex((s) => h >= s.from && h < s.to);

const passagesIn = (t0, t1) => [...S.passages.values()].filter((p) => p.t >= t0 && p.t < t1);
const ilotOfPassage = (p) => S.addrs.get(p.addressId)?.ilot || 0;
export const isOpen = (p) => p.result === 'contact' || p.result === 'refus';

export function doorsThisWeek() {
  return passagesIn(startOfWeek(), Infinity).length;
}
export function doorsToday() {
  const t0 = new Date().setHours(0, 0, 0, 0);
  return passagesIn(t0, Infinity).length;
}
export function mandatsBetween(t0, t1) {
  const a = dayStr(t0);
  const b = dayStr(t1 - 1);
  return activeContacts().filter((c) => c.mandatSigne && c.mandatDate && c.mandatDate >= a && c.mandatDate <= b);
}
export const mandatsThisMonth = () => mandatsBetween(startOfMonth(), addMonths(startOfMonth(), 1)).length;

export function weeklyDoors(n = 12) {
  const out = [];
  let w = startOfWeek();
  for (let i = 0; i < n; i++) {
    out.unshift({ start: w, count: passagesIn(w, addDays(w, 7)).length });
    w = addDays(w, -7);
  }
  return out;
}
export function monthlyMandats(n = 12) {
  const out = [];
  let m = startOfMonth();
  for (let i = 0; i < n; i++) {
    out.unshift({ start: m, count: mandatsBetween(m, addMonths(m, 1)).length });
    m = addMonths(m, -1);
  }
  return out;
}

// Taux d'ouverture : jour × créneau horaire.
export function openGrid({ ilot = 0, t0 = 0, t1 = Infinity } = {}) {
  const grid = DAYS.map(() => SLOTS.map(() => ({ n: 0, open: 0 })));
  for (const p of passagesIn(t0, t1)) {
    if (ilot && ilotOfPassage(p) !== ilot) continue;
    const d = new Date(p.t);
    const s = slotOf(d.getHours());
    if (s < 0) continue;
    const cell = grid[(d.getDay() + 6) % 7][s];
    cell.n++;
    if (isOpen(p)) cell.open++;
  }
  return grid;
}

export function scenarioStats({ t0 = 0, t1 = Infinity } = {}) {
  const per = new Map();
  for (const s of activeScenarios()) per.set(s.id, { s, presentations: 0, contacts: new Set() });
  for (const p of passagesIn(t0, t1)) {
    if (p.result !== 'contact' || !p.scenarioId) continue;
    const x = per.get(p.scenarioId);
    if (!x) continue;
    x.presentations++;
    if (p.contactId) x.contacts.add(p.contactId);
  }
  return [...per.values()]
    .map((x) => {
      const cs = [...x.contacts].map((id) => S.contacts.get(id)).filter((c) => c && !c.deletedAt);
      const projets = cs.filter((c) => (c.interet || 0) >= 1 || c.mandatSigne).length;
      const mandats = cs.filter((c) => c.mandatSigne).length;
      return { s: x.s, presentations: x.presentations, contacts: cs.length, projets, mandats, tauxProjet: cs.length ? projets / cs.length : null };
    })
    .sort((a, b) => b.presentations - a.presentations);
}

export function ilotStats({ t0 = 0, t1 = Infinity } = {}) {
  const res = new Map();
  for (const il of S.base.ilots)
    res.set(il.id, { il, adresses: 0, visitees: 0, portes: 0, ouvertures: 0, contacts: new Set(), projets: 0, mandats: 0, last: null, unvisited: 0 });
  const visited = new Set();
  for (const p of [...S.passages.values()]) {
    const x = res.get(ilotOfPassage(p));
    if (!x) continue;
    if (p.t >= t0 && p.t < t1) {
      x.portes++;
      if (isOpen(p)) x.ouvertures++;
      if (p.result === 'contact' && p.contactId) x.contacts.add(p.contactId);
    }
    visited.add(p.addressId);
    if (!x.last || p.t > x.last) x.last = p.t;
  }
  for (const a of S.addrs.values()) {
    const x = res.get(a.ilot);
    if (!x) continue;
    x.adresses++;
    if (visited.has(a.id)) x.visitees++;
    else if (addressColor(a.id) !== 'rouge') x.unvisited++;
  }
  // Projets et mandats : contacts liés aux adresses de l'îlot
  const a0 = t0 ? dayStr(t0) : '0000';
  const a1 = t1 === Infinity ? '9999' : dayStr(t1 - 1);
  for (const c of activeContacts()) {
    const ils = new Set(contactAddressLinks(c.id).map((l) => S.addrs.get(l.addressId)?.ilot));
    for (const id of ils) {
      const x = res.get(id);
      if (!x) continue;
      if ((c.interet || 0) >= 1) x.projets++;
      if (c.mandatSigne && c.mandatDate >= a0 && c.mandatDate <= a1) x.mandats++;
    }
  }
  return [...res.values()].map((x) => ({
    ...x,
    contacts: x.contacts.size,
    couverture: x.adresses ? x.visitees / x.adresses : 0,
    tauxOuverture: x.portes ? x.ouvertures / x.portes : null,
    portesParMandat: x.mandats ? Math.round(x.portes / x.mandats) : null,
  }));
}

// Îlots prioritaires : ancienneté de la dernière tournée, adresses jamais visitées, absents, relances, signaux.
export function priorities() {
  const stats = ilotStats();
  const abs = absentsARepasser();
  const t3 = dayStr(addDays(Date.now(), 3));
  const rel = relancesActives().filter((r) => r.date <= t3);
  const maxN = Math.max(...stats.map((s) => s.adresses), 1);
  return stats
    .map((x) => {
      const id = x.il.id;
      const days = x.last ? daysAgo(x.last) : null;
      const absN = abs.filter((a) => S.addrs.get(a.addressId)?.ilot === id).length;
      const relN = rel.filter((r) => r.contactId && contactAddressLinks(r.contactId).some((l) => S.addrs.get(l.addressId)?.ilot === id)).length;
      let sig = 0;
      for (const a of S.addrs.values()) if (a.ilot === id && (signalsOf(a.id).length || hasVendeurPotentiel(a.id))) sig++;
      const unvRatio = x.adresses ? x.unvisited / x.adresses : 0;
      const score = (days == null ? 1 : Math.min(days, 45) / 45) + 0.9 * unvRatio + (0.5 * Math.min(absN, 15)) / 15 + (0.4 * Math.min(relN, 6)) / 6 + (0.4 * Math.min(sig, 8)) / 8 + (0.15 * x.adresses) / maxN;
      const why = [
        days == null ? 'Jamais prospecté' : `Dernière tournée ${fmtAgo(x.last)}`,
        x.unvisited ? `${plural(x.unvisited, 'adresse jamais visitée', 'adresses jamais visitées')}` : 'toutes les adresses visitées',
        absN ? plural(absN, 'absent à repasser', 'absents à repasser') : '',
        relN ? plural(relN, 'relance proche', 'relances proches') : '',
        sig ? plural(sig, 'signal de vente', 'signaux de vente') : '',
      ].filter(Boolean);
      return { il: x.il, score, why, days, unvisited: x.unvisited, absN, relN, sig, couverture: x.couverture };
    })
    .sort((a, b) => b.score - a.score);
}

// Suggestions tirées des chiffres (seulement quand il y a assez de données).
export function suggestions() {
  const out = [];
  const all = [...S.passages.values()];
  const wk = doorsThisWeek();
  if (wk < GOAL_DOORS) {
    const dow = (new Date().getDay() + 6) % 7;
    const left = 7 - dow;
    out.push(`Il te reste ${GOAL_DOORS - wk} portes pour atteindre 100 cette semaine, soit environ ${Math.ceil((GOAL_DOORS - wk) / left)} par jour d’ici dimanche.`);
  } else out.push(`Objectif de la semaine atteint : ${wk} portes.`);
  if (all.length < 30) {
    out.push('Encore peu de passages enregistrés : les statistiques deviendront fiables après une trentaine de portes.');
    return out;
  }
  // Meilleur créneau global et par îlot
  const best = (grid, min) => {
    let b = null;
    grid.forEach((row, d) =>
      row.forEach((c, s) => {
        if (c.n >= min && (!b || c.open / c.n > b.r)) b = { d, s, r: c.open / c.n, n: c.n };
      }),
    );
    return b;
  };
  const g = best(openGrid(), 10);
  if (g) out.push(`Ton meilleur créneau : le ${DAYS_LONG[g.d]} entre ${SLOTS[g.s].label.replace('-', ' et ')} (${fmtPct(g.r)} de portes ouvertes sur ${g.n}).`);
  for (const il of S.base.ilots) {
    const b = best(openGrid({ ilot: il.id }), 8);
    if (b && g && (b.d !== g.d || b.s !== g.s) && b.r > 0) out.push(`À ${il.nom}, le meilleur créneau est le ${DAYS_LONG[b.d]} ${SLOTS[b.s].label} (${fmtPct(b.r)} d’ouverture).`);
    if (out.length > 5) break;
  }
  // Scénarios
  const sc = scenarioStats().filter((x) => x.contacts >= 5 && x.tauxProjet != null);
  if (sc.length >= 2) {
    sc.sort((a, b) => b.tauxProjet - a.tauxProjet);
    const top = sc[0];
    const low = sc[sc.length - 1];
    if (top.tauxProjet > 0 && low.tauxProjet < top.tauxProjet) {
      const k = low.tauxProjet ? top.tauxProjet / low.tauxProjet : null;
      out.push(
        `Le scénario « ${top.s.titre} » fait ressortir un projet chez ${fmtPct(top.tauxProjet)} des personnes rencontrées${k && k >= 1.5 ? `, ${k.toFixed(1).replace('.', ',')} fois plus que « ${low.s.titre} »` : ` contre ${fmtPct(low.tauxProjet)} pour « ${low.s.titre} »`}.`,
      );
    }
  } else if (sc.length === 1) out.push(`Le scénario « ${sc[0].s.titre} » a fait ressortir un projet chez ${fmtPct(sc[0].tauxProjet)} des personnes rencontrées.`);
  // Rendement
  const mandats = activeContacts().filter((c) => c.mandatSigne).length;
  if (mandats) out.push(`En moyenne, il te faut ${Math.round(all.length / mandats)} portes pour un mandat.`);
  const st = ilotStats().filter((x) => x.portes >= 20 && x.tauxOuverture != null);
  if (st.length >= 2) {
    st.sort((a, b) => b.tauxOuverture - a.tauxOuverture);
    out.push(`L’îlot où l’on t’ouvre le plus : ${st[0].il.nom} (${fmtPct(st[0].tauxOuverture)}). Le moins : ${st[st.length - 1].il.nom} (${fmtPct(st[st.length - 1].tauxOuverture)}).`);
  }
  return out;
}

// Données du bilan mensuel.
export function monthReport(monthStart) {
  const t0 = startOfMonth(monthStart);
  const t1 = addMonths(t0, 1);
  const ps = passagesIn(t0, t1);
  const opens = ps.filter(isOpen).length;
  const met = new Set(ps.filter((p) => p.result === 'contact' && p.contactId).map((p) => p.contactId));
  const metContacts = [...met].map((id) => S.contacts.get(id)).filter(Boolean);
  // Nouvelle personne = premier passage avec elle dans le mois (ou fiche créée dans le mois sans passage).
  const firstSeen = new Map();
  for (const p of S.passages.values()) if (p.contactId && (!firstSeen.has(p.contactId) || p.t < firstSeen.get(p.contactId))) firstSeen.set(p.contactId, p.t);
  const newContacts = activeContacts().filter((c) => {
    const t = firstSeen.get(c.id) ?? c.createdAt;
    return t >= t0 && t < t1;
  }).length;
  const relDone = [...S.relances.values()].filter((r) => r.done && r.doneAt >= t0 && r.doneAt < t1).length;
  const weeks = [];
  for (let w = startOfWeek(t0); w < t1; w = addDays(w, 7)) weeks.push({ start: w, count: ps.filter((p) => p.t >= w && p.t < addDays(w, 7)).length });
  const nbWeeks = Math.max(1, (Math.min(t1, Date.now()) - t0) / (7 * 86400000));
  return {
    t0,
    t1,
    portes: ps.length,
    parSemaine: ps.length / nbWeeks,
    ouvertures: opens,
    tauxOuverture: ps.length ? opens / ps.length : null,
    absents: ps.filter((p) => p.result === 'absent').length,
    refus: ps.filter((p) => p.result === 'refus').length,
    rencontres: met.size,
    nouveauxContacts: newContacts,
    projets: metContacts.filter((c) => (c.interet || 0) >= 1).length,
    chauds: metContacts.filter((c) => c.interet === 2).length,
    mandats: mandatsBetween(t0, t1),
    relancesFaites: relDone,
    ilots: ilotStats({ t0, t1 }),
    scenarios: scenarioStats({ t0, t1 }),
    grid: openGrid({ t0, t1 }),
    weeks,
  };
}

export { todayStr };
