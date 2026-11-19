# Cahier de test

Deux étages : les **tests automatiques**, qui tournent avant chaque fusion, et les **vérifications dans la Recette**, que Jonathan fait sur son iPhone avant de dire « En prod ».

## Tests automatiques

Ils tournent dans Chrome sans écran (puppeteer-core), au format iPhone (390 × 844, fuseau Europe/Paris), sur le site construit dans `dist/` (et `dist-recette/` pour `recette.mjs`). Chaque vérification affiche `OK` ou `ÉCHEC` ; une seule `ÉCHEC` et la série s'arrête avec un code d'erreur.

### Les lancer

```bash
npm ci
pip install msoffcrypto-tool olefile   # pour les séries qui relisent la sauvegarde chiffrée
npm run build
npm run build:recette
node tests/smoke.mjs
node tests/flow.mjs
node tests/flow2.mjs
node tests/oldpassage.mjs
node tests/rgpd.mjs
node tests/sauvegarde.mjs
node tests/theme.mjs plein
node tests/theme.mjs bande
node tests/officecrypto.mjs
node tests/dvf.mjs
node tests/recette.mjs
```

Il faut Chrome en `/usr/bin/google-chrome` (chemin écrit dans `tests/harness.mjs`), et LibreOffice (`soffice`) pour `officecrypto.mjs`. Sans `msoffcrypto-tool`, `flow2.mjs` et `sauvegarde.mjs` échouent sur `ModuleNotFoundError` : ce n'est pas un bug de l'appli.

Ils tournent aussi chez GitHub à chaque demande de fusion et à chaque arrivée sur `recette` (`.github/workflows/tests.yml`, [D-021](decisions.md)) : résultat dans l'onglet « Checks » de la demande de fusion, captures jointes en cas d'échec. On ne fusionne dans `recette` qu'avec tout au vert : Cloudflare publie la Recette dès qu'un changement y arrive.

### Ce que couvre chaque série

| Série | Vérifications | Ce qu'elle couvre |
| --- | --- | --- |
| `smoke.mjs` | (captures) | Démarrage, onglets, carte, feuille d'adresse |
| `flow.mjs` | 26 | Passages, compteur de portes, fiche contact, vendeur potentiel, scénarios et alerte « déjà présenté », adresse rouge bloquée, vue immeuble en brouillon, relances, recherche, filtres, tableau de bord |
| `flow2.mjs` | 18 | Doublons, photo compressée, export Excel protégé (aucun nom lisible sans le mot de passe), bilan PDF, calendrier .ics hors réseau, fiche DVF, restauration complète, mauvais mot de passe refusé, démarrage hors connexion |
| `oldpassage.mjs` | 8 | Date de passage modifiable, ancien passage hors compteur de la semaine, suppression d'un passage, ordre de l'historique |
| `rgpd.mjs` | 42 | Création du code, reprise des anciennes données, base brute illisible, pauses après erreurs, accord RGPD (alertes, filtre, retrait, « ne plus solliciter »), mention, règle des 3 ans, masquage en arrière-plan, verrouillage, mise à jour obligatoire, changement de code, code oublié |
| `sauvegarde.mjs` | 14 | Appli remplie de tout, export, restauration dans une appli vierge avec un autre code, comparaison champ par champ |
| `theme.mjs plein` / `bande` | 17 chacun | Thèmes, barre d'onglets flottante, titres centrés, carte plein écran, avec et sans la barre d'état d'iOS au-dessus de l'appli, hauteur iOS 26 |
| `officecrypto.mjs` | 13 | Fichier protégé vérifié par msoffcrypto-tool, olefile et LibreOffice ; gros fichier ; mauvais mot de passe |
| `recette.mjs` | 30 | La Recette ne touche jamais à la prod ([D-020](decisions.md)) : nom, icône et bandeau ; les deux sites sous la même origine ; code oublié et effacement dans la Recette, puis base, couleur, caches et code de la prod vérifiés intacts |
| `dvf.mjs` | (message) | Bouton de mise à jour DVF quand data.gouv.fr est injoignable : la copie publiée est rechargée |
| `views.mjs` | (captures) | Captures des vues secondaires, pour relecture visuelle |

Les captures vont dans `tests/shots/`, les fichiers téléchargés dans `tests/downloads/` (ignorés par git).

### Dernier passage complet

19/11/2026, sur `main` (`b8ac10b`), dans le conteneur cloud, par le fil de mise en route : **toutes les séries passent** (138 vérifications, plus 17 pour `theme.mjs bande`), après installation de `msoffcrypto-tool`.

### Règles

- Une évolution ajoute les vérifications de ce qu'elle change, dans la série qui va avec ou dans une nouvelle.
- Un bug corrigé laisse un test qui l'aurait détecté ([bugs.md](bugs.md)).
- Un test qui échoue ne se désactive jamais pour avancer : on corrige l'appli, ou le test s'il est faux, en le disant.
- Les tests n'utilisent que des données fictives.

## Vérifications dans la Recette (sur l'iPhone)

À refaire dans « Prospection Recette » avant chaque « En prod ». Le fil qui livre en Recette dit lesquelles comptent pour son changement, et ajoute ici les nouvelles.

### À chaque version

1. La fenêtre « Mise à jour disponible » apparaît, la mise à jour s'installe, les données de test sont toujours là.
2. Le numéro de version affiché est le bon.
3. Le code à 6 chiffres est demandé à l'ouverture, et au retour après le délai réglé.
4. Carte : les pastilles s'affichent, un passage Absent puis Contact s'enregistre, le compteur de portes monte.
5. Une fiche contact s'ouvre, se modifie, s'enregistre.
6. Export de la sauvegarde : le fichier se partage, et s'ouvre dans Excel avec le mot de passe.
7. Mode avion : l'appli s'ouvre et fonctionne.
8. Affichage : barre d'onglets visible sur la carte, rien de coupé en haut ni en bas, hauteur affichée en bas du Tableau égale à celle de l'écran.

### Quand le changement touche…

| …à | Vérifier aussi |
| --- | --- |
| La sauvegarde ou le format des données | Restaurer une sauvegarde faite avec la version en prod, et retrouver toutes les fiches |
| La sécurité | Code faux 5 fois (pause), changer le code, masquage dans le sélecteur d'applis |
| Le RGPD | Accord coché, retiré, « ne plus solliciter », mention, règle des 3 ans |
| L'affichage | Les 5 couleurs, la carte en plein écran, une fiche longue qui défile |
| La carte | Filtres, fonds de carte, ma position, ventes DVF |
