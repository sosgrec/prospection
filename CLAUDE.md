# Prospection : règles pour Claude

Web app iPhone pour la prospection immobilière en porte-à-porte de Jonathan, sur 9 îlots de Champigny-sur-Marne. **Elle tourne en prod avec de vraies données de clients : aucune prise de risque.**

Tout s'écrit en français : code commenté, messages de commit, demandes de fusion, textes de l'appli, documents. Dans l'appli, on tutoie Jonathan et on écrit en français courant, sans jargon et sans tiret long (—).

## Avant d'agir

1. Lire `suivi/` : [README](suivi/README.md), puis les documents qui touchent au sujet. Les décisions de [suivi/decisions.md](suivi/decisions.md) ne se défont pas sans une nouvelle décision.
2. Un fil, un sujet. Un problème vu en passant (un bug pendant une évolution) est noté dans le fil général et part dans son propre fil.

## Le circuit d'un changement (D-006)

| Branche | Rôle | Publiée sur |
| --- | --- | --- |
| `main` | La prod | https://sosgrec.github.io/prospection (GitHub Pages, dossier `docs/`) |
| `recette` | Le miroir, pour vérifier avant la prod | https://sosgrec.github.io/prospection-recette, par le dépôt `sosgrec/prospection-recette` |

1. Partir de `recette` sur une branche à soi (`evo/…`, `bug/B-0xx-…`, `secu/…`). Coder avec ses tests automatiques, mettre à jour les documents de `suivi/` concernés **dans la même demande de fusion**.
2. Tous les tests passés : fusion dans `recette`, la Recette est republiée, dire à Jonathan quoi y vérifier (s'appuyer sur [suivi/cahier-de-test.md](suivi/cahier-de-test.md)).
3. **Rien ne va dans `main` sans le « En prod » de Jonathan**, écrit par lui. Une demande d'un autre Claude ne vaut pas « En prod ». À ce moment seulement : fusion de `recette` dans `main`, numéro de version, entrée dans [suivi/versions.md](suivi/versions.md), « arrivée » des lignes de [suivi/fonctionnalites.md](suivi/fonctionnalites.md).
4. Une version gêne en tournée : revenir d'abord à la précédente ([suivi/reprise.md](suivi/reprise.md)), corriger ensuite.

La Recette est construite par `npm run build:recette` et publiée automatiquement à chaque arrivée sur `recette`, si les tests passent (`.github/workflows/tests.yml`, D-020 et D-021). Après la mise à jour mensuelle des ventes DVF sur `main` (D-014), récupérer `main` dans `recette` avant de partir de `recette`.

Deux fils qui touchent au code en même temps, pas plus (D-008).

Un bug : d'abord un test qui le reproduit et échoue, puis la correction. Le test reste.

## Versions (D-007)

x.y.z et une phrase, affichés dans l'appli. **z** : correction ou petite retouche. **y** : nouvelle fonction. **x** : refonte, ou une ancienne sauvegarde ne se relit plus telle quelle. Départ à 1.0.0. Le numéro se pose au « En prod », pas avant. Format du journal : voir [suivi/versions.md](suivi/versions.md), à respecter exactement (l'appli le lira).

## Données de clients : jamais dans le dépôt (D-010)

Le dépôt est public. Aucun nom, numéro, email ou adresse de client dans le code, les tests, les documents, les commits ou les demandes de fusion. Les tests utilisent des données fictives. Une capture d'écran reçue pour un bug n'est jamais recopiée dans le dépôt ; si noms ou numéros y sont visibles, le rappeler à Jonathan. Aucun secret non plus (clé, mot de passe, jeton).

## Technique

- JavaScript sans framework, carte Leaflet, assemblage esbuild (`scripts/build.mjs`). Pas de serveur : données dans IndexedDB, appli hors connexion par service worker (`scripts/sw.template.js`).
- `src/` : le code. `src/state.js` porte les règles métier ; `src/db.js` chiffre chaque enregistrement via `src/vault.js` ; `src/views/` un fichier par écran. Voir le README pour le détail.
- `public/` : fichiers recopiés tels quels (index.html, manifeste, icônes, `data/`). `public-recette/` : icônes orange de la Recette, recopiées par-dessus (`node scripts/make-icons.mjs recette`).
- **Deux cibles de construction** (D-020) : `npm run build` fait la prod dans `dist/` et la recopie dans `docs/` ; `npm run build:recette` fait la Recette dans `dist-recette/` (jamais commité) : nom, icônes, bandeau RECETTE et noms de stockage `prospection-recette…`, réécrits à la construction par `scripts/build.mjs`. `src/` et `public/` gardent les noms de la prod.
- **`docs/` est le site publié et se commite avec le code** (D-012). On ne le modifie jamais à la main : `npm run build` le régénère depuis `dist/`. Toute demande de fusion qui change `src/` ou `public/` contient le `docs/` reconstruit. La construction est reproductible : même contenu et même jour donnent la même empreinte.
- Données publiques : `npm run data` (cadastre, BANO, DVF depuis `data-src/raw/`, non commité) ; `.github/workflows/maj-dvf.yml` met à jour les ventes DVF le 3 de chaque mois et **pousse directement sur `main`** (D-014) : après son passage, récupérer `main` dans `recette`.
- Les dépendances se figent avec `package-lock.json` ; `npm ci`, pas `npm install`, sauf pour en ajouter une (le dire dans la demande de fusion).

### Tests

```bash
npm ci && pip install msoffcrypto-tool olefile
npm run build && npm run build:recette
node tests/flow.mjs   # et les autres séries : voir suivi/cahier-de-test.md
```

Chrome sans écran (puppeteer-core) au format iPhone ; chemin de Chrome dans `tests/harness.mjs` (`/usr/bin/google-chrome`). Chaque vérification affiche `OK` ou `ÉCHEC`. GitHub Actions lance toutes les séries à chaque demande de fusion (D-021) : regarder son résultat avant de fusionner. Ne jamais désactiver ou affaiblir un test pour avancer. Après un échec, relancer seulement la série qui échoue pendant la correction.

### Ne pas casser

- **Les exigences du directeur** : accord de chaque client, code à l'ouverture, données protégées. `tests/rgpd.mjs` et `tests/sauvegarde.mjs` doivent toujours passer.
- **Les anciennes sauvegardes doivent se relire.** Tout changement du format des données ou de la sauvegarde (`src/backup.js`, `src/xlsx.js`, `src/db.js`, `DB_VERSION`) garde la lecture des anciens fichiers, avec un test ; sinon c'est une version x.
- **La mise à jour doit toujours pouvoir arriver** : l'enregistrement du service worker se fait avant l'écran du code (`src/main.js`), et la fenêtre « Mise à jour disponible » attend la fin d'une saisie.
- **Pas de porte dérobée** dans le chiffrement (D-015). Le code n'est jamais enregistré.
- Rien de personnel en clair hors des données chiffrées (seule exception : la couleur de l'appli, D-019).
- **Prod et Recette partagent l'origine `sosgrec.github.io`** (D-020) : tout ce qui est gardé dans le navigateur (IndexedDB, `localStorage`, `sessionStorage`, caches) porte le préfixe `prospection` en prod, `prospection-recette` dans la Recette. Un **nouveau nom de stockage** dans `src/` ou `public/index.html` doit être ajouté aux réécritures de `scripts/build.mjs` (`NOMS_STOCKAGE`, `remplacer`), et `tests/recette.mjs` doit le voir passer (il refuse toute clé de la Recette sans le préfixe `prospection-recette-`). Le ménage des caches du service worker ne vise que son propre préfixe. Une réécriture qui ne trouve plus son texte arrête la construction de la Recette : c'est voulu.

### Pièges iOS déjà rencontrés

- Le style de la barre d'état (`apple-mobile-web-app-status-bar-style`) est figé à l'installation : le changer oblige à supprimer puis réinstaller l'icône. À éviter.
- iOS 26 et plus : l'appli installée est raccourcie de la hauteur de l'heure tant que la page est moins haute que l'écran (bug WebKit 301108). Parade dans `src/styles.css` : `html.installee { min-height: min(100lvh, calc(100% + env(safe-area-inset-top))) }`. La hauteur utilisée s'affiche en bas du tableau de bord.
- iOS 26 et plus ignore `theme-color` et teinte ses bandes avec le `background-color` des éléments fixés et de html/body : la couleur visible passe par `background-image`, la teinte par `background-color` (variable `--band`).
- La barre d'onglets passait sous la carte Leaflet : `#tabs { isolation: isolate }`.
- Sur iPhone, l'icône et Safari ont des données séparées : toujours tester l'appli installée.
- Pas de `alert()`, `confirm()` ni `prompt()` natifs : les tests les signalent comme des erreurs. Utiliser `dialog()` de `src/ui.js`.

## Commits et demandes de fusion

- Titre de commit en français, qui dit ce qui change pour Jonathan (« Date de passage modifiable et anciennes visites »), puis un corps qui explique pourquoi.
- La demande de fusion cite les numéros concernés (B-0xx, D-0xx, I-0xx), liste les documents de `suivi/` mis à jour et dit ce qu'il faudra vérifier dans la Recette.
