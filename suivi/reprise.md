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

Elle est construite depuis la branche `recette` et publiée par le dépôt `sosgrec/prospection-recette` ([D-020](decisions.md)). Elle ne touche jamais aux données de la prod : une Recette en panne ne gêne pas la tournée.

### Comment elle est publiée

1. Une demande de fusion arrive dans `recette`.
2. Dans le dépôt `prospection`, onglet **Actions**, la tâche « Tests et Recette » lance les tests, puis pousse le site construit dans `prospection-recette` (branche `main`).
3. GitHub Pages de `prospection-recette` republie en une à deux minutes. Sur l'iPhone, « Prospection Recette » propose la mise à jour.

Pour republier sans changement (après avoir réparé le jeton, par exemple) : onglet **Actions**, « Tests et Recette », **Run workflow**, branche `recette`.

### La publication échoue

- **« Le secret RECETTE_JETON manque »** ou une erreur 403 / « Authentication failed » au moment de pousser : le jeton a expiré ou a été supprimé. Le recréer (ci-dessous), puis relancer la tâche.
- **Un test échoue** : la Recette reste sur la version d'avant, c'est voulu. Le fil qui a fusionné corrige.

### Recréer le jeton `RECETTE_JETON`

C'est un jeton GitHub qui ne peut écrire que dans `prospection-recette`. Il expire (un an au plus) : GitHub prévient par email quelques jours avant.

1. GitHub, photo de profil, **Settings**, **Developer settings**, **Personal access tokens**, **Fine-grained tokens**, **Generate new token**.
2. Nom : `Publication Recette`. Expiration : 1 an. **Repository access** : *Only select repositories*, choisir `sosgrec/prospection-recette` et rien d'autre.
3. **Permissions**, *Repository permissions* : **Contents** sur *Read and write*. Rien d'autre.
4. **Generate token**, copier le jeton (il ne s'affiche qu'une fois). Ne le coller nulle part ailleurs qu'à l'étape suivante.
5. Dépôt `sosgrec/prospection`, **Settings**, **Secrets and variables**, **Actions**, secret `RECETTE_JETON` : **Update** (ou **New repository secret** la première fois), coller, enregistrer.

### Repartir de zéro

Si le dépôt `prospection-recette` est perdu : le recréer (public, vide), régler GitHub Pages (**Settings**, **Pages**, *Deploy from a branch*, `main`, dossier `/ (root)`), recréer le jeton, relancer la tâche. Les données de test de l'iPhone ne sont pas touchées tant que l'adresse ne change pas.
