// Mention d'information RGPD : le texte à montrer ou envoyer quand on note les coordonnées de quelqu'un.
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { html, $, pushPage, copyText, toast } from '../ui.js';
import { getSetting, setSetting, RETENTION_ANS } from '../state.js';

const DEFAULTS = { nom: '', fonction: 'conseillère immobilière', agence: '', contact: '' };
const get = () => ({ ...DEFAULTS, ...(getSetting('mention') || {}) });

export const mentionReady = () => !!get().nom.trim();

export function mentionText(m = get()) {
  const qui = [m.nom.trim() || '[ton nom]', m.fonction.trim()].filter(Boolean).join(', ');
  const agence = m.agence.trim() ? ` (${m.agence.trim()})` : '';
  const joindre = m.contact.trim() ? ` : ${m.contact.trim()}` : ', en me le demandant directement';
  return [
    'Vos coordonnées et vos droits',
    '',
    `Je suis ${qui}${agence}.`,
    'Avec votre accord, je garde vos coordonnées et les informations utiles à votre projet immobilier, uniquement pour vous recontacter à ce sujet.',
    'Elles restent sur mon téléphone, protégées par un code, et ne sont ni vendues ni cédées à d’autres entreprises.',
    `Je les conserve au maximum ${RETENTION_ANS} ans après notre dernier échange.`,
    `À tout moment, vous pouvez me demander de les consulter, de les corriger ou de les effacer, ou de ne plus vous contacter${joindre}.`,
    'Vous pouvez aussi vous adresser à la CNIL (cnil.fr).',
  ].join('\n');
}

export function openMentionPage() {
  const m = get();
  const page = pushPage({
    title: 'Mention d’information',
    save: async () => {
      const v = read();
      if (!v.nom.trim()) {
        toast('Indique au moins ton nom');
        return false;
      }
      await setSetting('mention', v);
      toast('Mention enregistrée');
      return true;
    },
  });
  const body = html(`<div>
    <p class="pad small muted" style="margin:14px 0 10px">À montrer à la personne, ou à lui envoyer par SMS ou email, quand tu notes ses coordonnées. C’est ce qui l’informe de ses droits.</p>
    <div class="card mention-card"><div class="mention-text" data-text></div></div>
    <div class="pad btn-row" style="margin-bottom:6px">
      <button type="button" class="btn btn-light btn-small" data-copytext>${icon('copy', 18)} Copier</button>
      <button type="button" class="btn btn-light btn-small" data-share>${icon('upload', 18)} Partager</button>
      <button type="button" class="btn btn-light btn-small" data-big>${icon('expand', 18)} Agrandir</button>
    </div>
    <div class="section-title">Tes informations</div>
    <form class="form" autocomplete="off" onsubmit="return false"><div class="card">
      <label class="field"><span>Ton nom</span><input name="nom" value="${esc(m.nom)}" autocapitalize="words" placeholder="Prénom Nom" /></label>
      <label class="field"><span>Fonction</span><input name="fonction" value="${esc(m.fonction)}" placeholder="Ex. : conseillère immobilière" /></label>
      <label class="field"><span>Agence</span><input name="agence" value="${esc(m.agence)}" placeholder="Ex. : nom de l’agence, ville" /></label>
      <label class="field" style="margin:0"><span>Pour te joindre (droits RGPD)</span><input name="contact" value="${esc(m.contact)}" placeholder="Téléphone ou email professionnel" autocapitalize="none" /></label>
    </div></form>
  </div>`);
  page.body.appendChild(body);
  const read = () => Object.fromEntries(['nom', 'fonction', 'agence', 'contact'].map((k) => [k, $(`[name="${k}"]`, body).value]));
  const render = () => {
    $('[data-text]', body).innerHTML = esc(mentionText(read()))
      .split('\n')
      .map((l, i) => (i === 0 ? `<b>${l}</b>` : l))
      .join('<br>');
  };
  render();
  body.addEventListener('input', render);
  body.addEventListener('click', async (e) => {
    if (e.target.closest('[data-copytext]')) return copyText(mentionText(read()), 'Texte copié');
    if (e.target.closest('[data-share]')) {
      try {
        if (navigator.share) await navigator.share({ text: mentionText(read()) });
        else copyText(mentionText(read()), 'Texte copié');
      } catch {
        /* partage annulé */
      }
      return;
    }
    if (e.target.closest('[data-big]')) {
      const v = html(`<div class="mention-full" role="dialog" aria-modal="true"><button type="button" class="mention-close">${icon('close', 22)} Fermer</button><div class="mention-full-text"></div></div>`);
      v.querySelector('.mention-full-text').innerHTML = $('[data-text]', body).innerHTML;
      v.addEventListener('click', (ev) => {
        if (ev.target.closest('.mention-close')) v.remove();
      });
      document.body.appendChild(v);
    }
  });
  if (!m.nom) setTimeout(() => $('[name="nom"]', body).focus(), 400);
  return page;
}
