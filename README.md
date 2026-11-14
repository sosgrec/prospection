# Prospection

Application iPhone (web app installable) pour organiser la prospection immobilière en porte-à-porte sur 9 îlots de Champigny-sur-Marne.

## Installer sur l'iPhone

1. Ouvrir l'adresse de l'appli dans **Safari** (pas Chrome).
2. Bouton **Partager**, puis **Sur l'écran d'accueil**.
3. Toujours lancer Prospection depuis cette icône : les données de l'icône et celles de Safari sont séparées sur iPhone.

L'appli fonctionne ensuite sans connexion. Toutes les données saisies (contacts, passages, notes, photos) restent sur le téléphone : rien n'est envoyé sur Internet. La sauvegarde se fait par export d'un fichier Excel (.xlsx) protégé par mot de passe, à enregistrer dans un Drive depuis le menu Partager.

## Sécurité et RGPD

- **Code à 6 chiffres** à l'ouverture, et à nouveau quand on revient dans l'appli après le délai choisi (1 minute par défaut). Pause imposée après 5 codes faux (30 s, puis 1, 5, 15 et 60 minutes), même si on relance l'appli.
- **Données chiffrées sur le téléphone** : le code donne une clé (PBKDF2-SHA256, 600 000 tours) qui protège un secret aléatoire ; ce secret chiffre chaque enregistrement (AES-GCM 256 bits) et masque ses identifiants (HMAC-SHA256). Le code n'est jamais enregistré. Sans le code, les données sont illisibles : en cas d'oubli, on efface tout et on restaure la dernière sauvegarde.
- **Sauvegarde protégée** : chiffrement standard d'Office (« Agile » : AES-256, SHA-512, 100 000 tours). Le fichier s'ouvre dans Excel après saisie du mot de passe. Les anciennes sauvegardes non protégées restent lisibles par l'appli.
- **Accord RGPD par contact** : case à cocher (jamais précochée), avec date et façon dont l'accord a été donné. Les fiches qui gardent un téléphone ou un email sans accord sont signalées (bandeau, filtre « Accord manquant », Tableau de bord), sans bloquer la saisie.
- **Règle des 3 ans** : le Tableau de bord liste les prospects sans échange depuis plus de 3 ans et les passages de plus de 3 ans, à supprimer définitivement (les clients avec mandat signé ne sont pas concernés).
- **Mention d'information** : texte à montrer ou à envoyer par SMS ou email quand on note des coordonnées (droits d'accès, de correction, d'effacement et d'opposition, CNIL).
- **Mises à jour** : une fenêtre au centre de l'écran oblige à installer la nouvelle version, après la fin de la saisie en cours.

## Contenu

| Onglet | Rôle |
| --- | --- |
| Carte | Cadastre des 9 îlots, adresses colorées par statut, saisie rapide des passages, filtres, ventes DVF, position |
| Contacts | Fiches complètes, recherche, copie des champs, doublons, corbeille 30 jours |
| Relances | Relances datées (ajout au calendrier), absents à repasser |
| Scénarios | Bibliothèque des prétextes de prise de contact, alerte en cas de répétition |
| Tableau | Objectifs (100 portes/semaine, 3 mandats/mois), îlots prioritaires, statistiques, bilan PDF, paramètres |

## Organisation du code

- `src/` : code de l'appli (JavaScript sans framework, carte Leaflet).
  - `state.js` : données en mémoire et règles métier (couleurs, blocages, absents à repasser).
  - `db.js` : stockage local IndexedDB (chaque enregistrement est chiffré avant d'être écrit).
  - `vault.js`, `lock.js` : chiffrement des données et écran du code.
  - `officecrypto.js` : fichier Excel protégé par mot de passe (spécification MS-OFFCRYPTO).
  - `views/` : un fichier par écran.
  - `xlsx.js`, `backup.js` : export et restauration Excel écrits à la main (un .xlsx est un zip de fichiers XML).
  - `stats.js`, `pdf.js` : statistiques et bilan mensuel.
- `scripts/build-data.mjs` : découpe le cadastre, les adresses et les ventes selon les 9 îlots.
- `scripts/build.mjs` : assemble le site dans `docs/` avec le service worker (hors connexion).
- `data-src/ilots.kml` : contours des îlots exportés de Google My Maps (zones rouges).
- `tests/` : tests automatisés dans Chrome au format iPhone. `tests/officecrypto.mjs` vérifie le fichier protégé avec msoffcrypto-tool, olefile et LibreOffice (Python : `pip install msoffcrypto-tool`).

## Mise à jour automatique des ventes DVF

Une tâche GitHub Actions (« Mise à jour des ventes DVF », fichier `.github/workflows/maj-dvf.yml`) tourne le 3 de chaque mois. Elle télécharge les ventes de Champigny sur data.gouv.fr, les découpe selon les îlots et, si de nouvelles ventes apparaissent, reconstruit l'appli. L'iPhone affiche alors la fenêtre « Mise à jour disponible ». On peut aussi la lancer à la main : onglet **Actions**, puis **Run workflow**.

## Mettre à jour les données publiques

```bash
npm install
# placer dans data-src/raw/ : parcelles.json.gz, batiments.json.gz, bano-94.json.gz, dvf-AAAA.csv
npm run data
npm run build
```

## Sources et licences des données

- Cadastre : DGFiP, distribué par Etalab (cadastre.data.gouv.fr), Licence Ouverte 2.0.
- Adresses : BANO, © contributeurs OpenStreetMap, sous licence ODbL. Les données d'adresses de `docs/data/base.json` dérivent de BANO et restent sous ODbL.
- Ventes : DVF (DGFiP), fichiers geo-dvf d'Etalab, Licence Ouverte 2.0.
- Fonds de carte en ligne : IGN Géoplateforme.
- Bibliothèques : Leaflet (BSD-2), fflate (MIT), jsPDF (MIT), @noble/hashes (MIT), cfb de SheetJS (Apache-2.0).
