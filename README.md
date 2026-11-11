# Prospection

Application iPhone (web app installable) pour organiser la prospection immobilière en porte-à-porte sur 9 îlots de Champigny-sur-Marne.

## Installer sur l'iPhone

1. Ouvrir l'adresse de l'appli dans **Safari** (pas Chrome).
2. Bouton **Partager**, puis **Sur l'écran d'accueil**.
3. Toujours lancer Prospection depuis cette icône : les données de l'icône et celles de Safari sont séparées sur iPhone.

L'appli fonctionne ensuite sans connexion. Toutes les données saisies (contacts, passages, notes, photos) restent sur le téléphone : rien n'est envoyé sur Internet. La sauvegarde se fait par export d'un fichier Excel (.xlsx), à enregistrer dans un Drive depuis le menu Partager.

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
  - `db.js` : stockage local IndexedDB.
  - `views/` : un fichier par écran.
  - `xlsx.js`, `backup.js` : export et restauration Excel écrits à la main (un .xlsx est un zip de fichiers XML).
  - `stats.js`, `pdf.js` : statistiques et bilan mensuel.
- `scripts/build-data.mjs` : découpe le cadastre, les adresses et les ventes selon les 9 îlots.
- `scripts/build.mjs` : assemble le site dans `docs/` avec le service worker (hors connexion).
- `data-src/ilots.kml` : contours des îlots exportés de Google My Maps (zones rouges).
- `tests/` : tests automatisés dans Chrome au format iPhone.

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
