# Passation du 19/11/2026

Point de départ du projet Claude « Prospection ». Ce fichier a été écrit à la fin de la conversation où l'appli a été construite, pour que les fils du nouveau projet ne repartent pas de zéro. La méthode de travail est dans le doc « Prospection : passer en mode projet » : https://claude.ai/artifact/DdejcdDoWNaPSAv8EwyXti

Les documents de suivi (cahier des charges, fonctionnalités, bugs, décisions, etc.) seront écrits dans ce dossier `suivi/` à partir de ce fichier, du code et de l'historique du dépôt.

## En service

- Version 2026-11-19-18e6530b : date et empreinte, en attendant les numéros x.y.z.
- Publiée par GitHub Pages depuis la branche `main`, dossier `docs/`. `npm run build` construit `dist/` puis le recopie dans `docs/` : ce dossier est donc commité avec le code.
- Mise à jour obligatoire : dès qu'une version est en ligne, une fenêtre au centre de l'écran impose la mise à jour, en attendant la fin d'une saisie en cours.
- Données uniquement sur le téléphone (IndexedDB), appli hors connexion (service worker). Données de base publiques dans `data/` : îlots, adresses, prix DVF (mis à jour par `.github/workflows/maj-dvf.yml`).

## Ce que fait l'appli

Carte des 9 îlots avec les passages porte à porte ; fiches adresses, immeubles et contacts ; relances ; scénarios ; tableau de bord (objectifs, îlots prioritaires, statistiques, bilan PDF mensuel, réglages) ; prix DVF ; photos ; recherche ; 5 thèmes de couleur.

## Sécurité et RGPD en place

- Code à 6 chiffres à l'ouverture. Données chiffrées (AES-GCM) avec une clé dérivée du code (PBKDF2, 600 000 itérations), identifiants masqués (HMAC). Pauses de plus en plus longues après 5 erreurs. Code oublié : les données sont effacées, puis restaurées depuis une sauvegarde.
- Verrouillage automatique après un délai réglable, écran masqué quand l'appli passe en arrière-plan.
- Accord de chaque contact : case, date et mode de recueil, avec des alertes non bloquantes quand il manque. Retirer l'accord propose d'effacer téléphone et email ; « ne plus démarcher » propose d'effacer le reste.
- Règle des 3 ans après le dernier échange, avec un nettoyage proposé.
- Mention d'information à montrer ou à envoyer au client.
- Sauvegarde Excel chiffrée au format Office (elle s'ouvre dans Excel avec le mot de passe). Mot de passe d'au moins 10 caractères, gardé sur le téléphone. L'aller-retour export puis import est testé.

## Exigences du directeur (novembre 2026)

L'accord de chaque client (case cochée) avant de garder ses coordonnées, un code à l'ouverture de l'appli, et des données protégées si le téléphone est piraté.

## Décisions du 19/11/2026

- D-001 : la prod reste sur GitHub Pages. La Recette aussi, publiée par un second dépôt, `sosgrec/prospection-recette`. Cloudflare plus tard, gardé en tête pour les liens d'essai.
- D-002 : les modifications et ajouts s'appellent « Évolutions » (fils « Évo · … »), plutôt que « Paramétrage », qui désigne aussi l'écran des réglages.
- D-003 : les vraies données ne vont dans la Recette qu'au cas par cas, pour un bug, puis sont effacées.
- D-004 : le travail passe par un projet Claude, avec un fil général et un fil par sujet.

## Pièges iOS déjà rencontrés

- Le style de la barre d'état (`apple-mobile-web-app-status-bar-style`) est figé à l'installation : le changer oblige à supprimer puis réinstaller l'icône.
- iOS 26 et plus : l'appli installée est raccourcie de la hauteur de l'heure tant que la page est moins haute que l'écran (bug WebKit 301108). Parade dans `src/styles.css` : `html.installee { min-height: min(100lvh, calc(100% + env(safe-area-inset-top))) }`. La hauteur utilisée s'affiche en bas du tableau de bord.
- iOS 26 et plus ignore `theme-color` et teinte ses bandes avec le `background-color` des éléments fixés et de html/body : la couleur visible passe par `background-image`, la teinte par `background-color` (variable `--band`).
- La barre d'onglets passait sous la carte Leaflet : `#tabs { isolation: isolate }`.

## Tests

`npm run build`, puis chaque série avec node : `tests/flow.mjs`, `flow2.mjs`, `oldpassage.mjs`, `rgpd.mjs`, `sauvegarde.mjs`, `theme.mjs` (modes `plein` et `bande`), `officecrypto.mjs`. `tests/office_check.py` vérifie les sauvegardes chiffrées avec msoffcrypto-tool et LibreOffice. Les séries tournent dans Chrome sans écran (puppeteer-core) et se lancent encore à la main.

## Pas encore fait

La Recette, les numéros x.y.z avec la liste des versions dans l'appli, les tests automatiques à chaque demande de fusion, et les boutons pour les droits des personnes (accès, effacement), laissés de côté pendant la version RGPD.
