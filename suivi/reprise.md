# Procédure de reprise

Que faire quand ça va mal. À relire à chaque changement d'hébergement.

## Ce qu'il faut avoir en lieu sûr

Tout repose sur trois choses. Sans elles, rien ne se reconstruit :

1. **La dernière sauvegarde Excel**, rangée dans le Drive (bandeau de rappel après 7 jours sans sauvegarde).
2. **Le mot de passe des sauvegardes**, ailleurs que sur le téléphone (gestionnaire de mots de passe). Sans lui, la sauvegarde est illisible, par personne.
3. **L'accès au compte GitHub `sosgrec`** (avec la double authentification et ses codes de secours, une fois en place).

Le code à 6 chiffres, lui, ne se récupère pas, mais il ne sert qu'à un téléphone : on en choisit un nouveau.

## Une version gêne en tournée : revenir à la précédente

C'est la règle 4 du circuit ([D-006](decisions.md)) : **on revient d'abord, on corrige ensuite**.

1. Jonathan le dit dans le fil général (« la 1.3.0 gêne, on revient »).
2. Un fil annule sur `main` la fusion qui a apporté la version, sans réécrire l'historique :
   ```bash
   git checkout main && git pull
   git revert -m 1 <commit de la fusion recette → main>
   git push
   ```
   Pas besoin de reconstruire : `docs/` est commité, l'annulation remet donc aussi le site publié de la version d'avant. Le retour arrière passe par une demande de fusion comme le reste, mais le « En prod » est donné d'avance par la demande de retour de Jonathan.
3. GitHub Pages republie en une à deux minutes. Sur l'iPhone, la fenêtre « Mise à jour disponible » apparaît (au besoin, quitter puis rouvrir l'appli) : on installe, on retrouve la version d'avant, avec son numéro.
4. Le journal des versions note le retour sous la version fautive (« retirée le JJ/MM, retour à la 1.2.0 »), et la correction repart par le circuit normal, depuis `recette`, avec un nouveau numéro.

**Attention** : si la version fautive a changé le format des données sur le téléphone (version x, voir [versions.md](versions.md)), revenir au code d'avant ne suffit pas toujours. Dans ce cas : revenir, puis restaurer la sauvegarde faite **avant** la mise à jour. D'où la règle : avant d'installer une version x, Jonathan fait une sauvegarde.

## Téléphone perdu, volé ou changé

Les données du téléphone sont chiffrées par le code : sans lui, elles sont illisibles.

1. Sur le nouvel iPhone : Safari, https://sosgrec.github.io/prospection, Partager, « Sur l'écran d'accueil ».
2. Ouvrir l'appli depuis l'icône, créer un code.
3. Tableau, Paramètres, Sauvegarde : restaurer le dernier fichier du Drive, avec le mot de passe des sauvegardes.
4. Vérifier quelques fiches récentes. Tout ce qui a été saisi après cette sauvegarde est perdu.

En cas de vol ou de perte : prévenir le directeur, et noter l'incident (date, ce qui s'est passé, données chiffrées ou non) dans [securite-rgpd.md](securite-rgpd.md), section Contrôles faits.

## Code oublié

Écran du code, « Code oublié » : toutes les données du téléphone sont effacées, on choisit un nouveau code, et l'appli propose aussitôt de restaurer la sauvegarde. Même suite qu'un téléphone changé, à partir de l'étape 3.

## Appli cassée sur le téléphone (ne démarre plus)

1. Quitter l'appli (balayer vers le haut dans le sélecteur d'applis) et la rouvrir : une mise à jour en attente s'installe souvent ainsi.
2. Si elle affiche « Impossible de démarrer », noter le message (sans donnée de client) et le donner dans le fil général : un fil Bug s'ouvre, et on revient à la version précédente si c'est la dernière mise à jour qui l'a cassée.
3. En dernier recours seulement : supprimer l'icône (cela efface les données du téléphone), la réinstaller depuis Safari et restaurer la sauvegarde.

## GitHub Pages ou le compte GitHub disparaît

L'appli est un site statique : n'importe quel hébergeur en HTTPS peut le servir.

1. Récupérer le dépôt (copie locale, ou une archive téléchargée régulièrement).
2. `npm ci && npm run build` : le site est dans `dist/` (et `docs/`).
3. Le publier ailleurs : Cloudflare Pages ([D-005](decisions.md)), Netlify, ou un autre dépôt GitHub.
4. **Nouvelle adresse = nouvelle appli pour l'iPhone** : les données ne suivent pas. Installer l'icône depuis la nouvelle adresse, puis restaurer la sauvegarde comme pour un téléphone changé.
5. Mettre à jour ce document, le README, le CLAUDE.md et les instructions du projet avec la nouvelle adresse.

## La mise à jour mensuelle des ventes DVF échoue

Sans gravité : l'appli garde les ventes déjà publiées. Dans l'onglet Actions du dépôt, ouvrir « Mise à jour des ventes DVF », lire l'erreur, et relancer avec « Run workflow ». Si data.gouv.fr a changé l'adresse de ses fichiers, c'est un fil Bug sur `scripts/update-dvf.mjs`.

## La Recette

Elle est construite et publiée par Cloudflare Pages depuis la branche `recette` de `sosgrec/prospection`, sur https://prospection-recette.pages.dev ([D-020](decisions.md)). Elle ne touche jamais aux données de la prod : une Recette en panne ne gêne pas la tournée.

### Comment elle est publiée

1. Une demande de fusion, tests au vert, arrive dans `recette`.
2. Cloudflare le voit, lance `npm run build:recette` et publie `dist-recette/` en une à trois minutes. Sur l'iPhone, « Prospection Recette » propose la mise à jour.
3. Chaque autre branche poussée reçoit un lien d'essai (Cloudflare l'écrit dans la demande de fusion). C'est une adresse à part : ses données sont séparées de la Recette et de la prod.

### Réglages du projet Cloudflare

À retrouver dans Cloudflare, **Workers & Pages**, projet `prospection-recette`, **Settings** :

| Réglage | Valeur |
| --- | --- |
| Dépôt | `sosgrec/prospection` |
| Branche de production | `recette` |
| Préréglage (framework) | Aucun |
| Commande de construction | `npm run build:recette` |
| Dossier publié | `dist-recette` |
| Version de Node | lue dans `.node-version` (22) |

### La publication échoue

Cloudflare, projet `prospection-recette`, **Deployments** : ouvrir le déploiement en échec et lire le journal. Une construction qui s'arrête sur « Construction de la Recette : … introuvable » veut dire qu'un nom de stockage a changé dans `src/` ou `public/` sans que `scripts/build.mjs` suive : c'est un fil Bug. Pour republier sans changement : **Retry deployment**. La Recette en ligne reste sur la version d'avant tant qu'une nouvelle n'a pas réussi.

### Repartir de zéro

Si le projet Cloudflare est perdu : en recréer un (Workers & Pages, Create, Pages, connecter le dépôt) avec les réglages ci-dessus, sous le même nom pour garder l'adresse. Si l'adresse change, « Prospection Recette » est une nouvelle appli pour l'iPhone : supprimer l'ancienne icône et réinstaller (seules des données de test sont perdues).

Pour revenir à GitHub Pages, voir D-001 : il faudrait un second dépôt et un jeton. Les noms de stockage à part rendent ce retour sans danger pour la prod.
