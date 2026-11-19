# Décisions

Chaque décision a un numéro qu'on cite d'un fil à l'autre (« voir D-006 »). On n'efface jamais une décision : si elle change, on en écrit une nouvelle qui la remplace, et on note « remplacée par D-0xx » sur l'ancienne.

Format : **D-0xx · date · titre**, puis ce qui est décidé et pourquoi.

## Décisions du projet

### D-001 · 19/11/2026 · La prod et la Recette sur GitHub Pages

La prod reste sur GitHub Pages (https://sosgrec.github.io/prospection, branche `main`, dossier `docs/`). La Recette y est aussi, publiée par un second dépôt, `sosgrec/prospection-recette` (https://sosgrec.github.io/prospection-recette), construit depuis la branche `recette` de ce dépôt.

**Pourquoi** : gratuit, déjà en place, rien de nouveau à apprendre. Un second dépôt donne à la Recette sa propre adresse.

### D-002 · 19/11/2026 · Les modifications et ajouts s'appellent « Évolutions »

Les fils s'appellent « Évo · … ». On ne sépare pas modifications et ajouts : même circuit, même écran touché, frontière floue ; la différence se lit dans le numéro de version.

**Pourquoi** : « Paramétrage » désigne aussi l'écran des réglages, « change le paramétrage » deviendrait ambigu.

### D-003 · 19/11/2026 · Les vraies données dans la Recette : au cas par cas

La Recette tourne avec des données fictives. Les vraies données n'y vont que pour un bug qui n'apparaît qu'avec elles, puis sont effacées.

**Pourquoi** : la Recette sert à essayer des versions pas encore validées ; les données de clients n'ont rien à y faire en temps normal.

### D-004 · 19/11/2026 · Un projet Claude, un fil général et un fil par sujet

Tout est déposé dans le fil général, qui oriente : Évo, Bug, Sécu, Apprendre, Idées. Un fil fait une chose, sur sa propre branche.

**Pourquoi** : une seule longue conversation finit par perdre des détails ; des fils courts appuyés sur des documents, non.

### D-005 · 19/11/2026 · Cloudflare : pas pour l'instant

Pas de Cloudflare. On le garde en tête pour des liens d'essai (un lien par modification) et des adresses tout à fait séparées entre prod et Recette. En attendant, on renforce la sécurité côté GitHub (fil Sécu).

**Pourquoi** : la Recette sur GitHub Pages suffit pour démarrer, sans nouveau compte ni nouvel outil. Voir aussi l'idée correspondante dans la liste des idées.

### D-006 · 19/11/2026 · Le circuit : recette, puis main seulement sur « En prod »

1. Un fil part de la branche `recette`, code avec ses tests automatiques et met à jour les documents de `suivi/` dans la même demande de fusion. Un bug corrigé laisse un test qui l'aurait détecté.
2. Tests passés : fusion dans `recette`, la Recette est republiée, le fil dit à Jonathan quoi y vérifier.
3. Rien ne va dans `main` sans le « En prod » de Jonathan. À ce moment seulement : fusion de `recette` dans `main`, numéro de version, journal des versions.
4. Si une version gêne en tournée : on revient d'abord à la précédente ([reprise.md](reprise.md)), on corrige ensuite.

Tant que la Recette n'est pas en place, seuls les fils de mise en route travaillent, depuis `main`, par demande de fusion validée par Jonathan.

**Pourquoi** : l'appli sert tous les jours avec de vraies données ; chaque changement doit être vu avant d'arriver sur le téléphone.

### D-007 · 19/11/2026 · Numéros de version x.y.z, départ à 1.0.0

Chaque version a un numéro x.y.z et une phrase, affichés dans l'appli. **z** monte pour une correction ou une petite retouche, **y** pour une nouvelle fonction, **x** pour une refonte ou quand une ancienne sauvegarde ne se relit plus telle quelle. La première version publiée avec la nouvelle méthode est la 1.0.0.

**Pourquoi** : l'empreinte actuelle (2026-11-19-18e6530b) ne dit rien de ce qui a changé ; un numéro se décide en deux secondes et se cite facilement.

### D-008 · 19/11/2026 · Deux fils qui touchent au code en même temps, pas plus

Un sujet qui déborde d'un fil (un bug vu pendant une évolution) est noté et part dans son propre fil.

**Pourquoi** : la Recette reste lisible, et chaque fil consomme le forfait comme une session entière.

### D-009 · 19/11/2026 · Où vivent les documents

Les documents qui décrivent l'appli vivent dans `suivi/` (dépôt public). La liste des idées (I-xxx) et le carnet d'apprentissage vivent dans la mémoire du projet Claude, privée. Les règles techniques vont dans le `CLAUDE.md` du dépôt.

**Pourquoi** : les documents de l'appli évoluent avec le code, dans la même demande de fusion ; les idées et le carnet ne regardent que Jonathan.

### D-010 · 19/11/2026 · Jamais de données de clients dans le dépôt

Ni dans le code, ni dans les tests, ni dans les documents, ni dans un message de commit ou de demande de fusion. Les tests utilisent des données fictives. Sur une capture envoyée pour un bug, Jonathan masque noms et numéros ; s'il oublie, on le lui rappelle et on ne la recopie nulle part.

**Pourquoi** : le dépôt est public, et tout ce qui y entre reste dans l'historique.

## Choix faits pendant la construction (12 au 19/11/2026), notés après coup

Ces choix datent d'avant le projet. Ils sont notés ici pour qu'un fil ne les défasse pas sans le savoir. Les dates sont celles des commits.

### D-011 · 12/11/2026 · Web app sans framework, données sur le téléphone

JavaScript sans framework, carte Leaflet, assemblage par esbuild. Données dans IndexedDB sur le téléphone, appli hors connexion grâce à un service worker. Pas de serveur.

**Pourquoi** : une seule personne, un seul téléphone, une tournée souvent sans réseau ; pas de serveur = rien à héberger ni à protéger côté Internet.

### D-012 · 12/11/2026 · Le site publié est commité dans `docs/`

`npm run build` construit `dist/` puis le recopie dans `docs/`, que GitHub Pages publie. `docs/` se commite avec le code et ne se modifie jamais à la main.

**Pourquoi** : publication par GitHub Pages sans étape de construction côté GitHub.

### D-013 · 12/11/2026 · Sauvegarde par export Excel

La sauvegarde est un fichier .xlsx exporté par Jonathan et rangé dans son Drive depuis le menu Partager. Le fichier est écrit à la main (`src/xlsx.js`, `src/backup.js`), sans bibliothèque Excel.

**Pourquoi** : un fichier qu'on peut ouvrir et relire soi-même, sans service en ligne.

### D-014 · 12/11/2026 · Ventes DVF mises à jour chaque mois par GitHub Actions

`.github/workflows/maj-dvf.yml` tourne le 3 de chaque mois, découpe les ventes selon les îlots et, si elles ont changé, reconstruit l'appli et pousse directement sur `main`.

**Pourquoi** : des prix à jour sans y penser. **À reprendre avec la Recette** : ce commit automatique arrive sur `main` sans passer par `recette` ; il ne touche que des données publiques, mais `recette` doit ensuite récupérer `main` pour ne pas prendre de retard.

### D-015 · 14/11/2026 · Chiffrement des données avec le code à 6 chiffres

Le code donne une clé (PBKDF2-SHA256, 600 000 tours) qui protège un secret aléatoire ; ce secret chiffre chaque enregistrement (AES-GCM 256) et masque ses identifiants (HMAC-SHA256). Le code n'est jamais enregistré. Code oublié : tout est effacé, puis restauré depuis la sauvegarde. Il n'y a pas de porte dérobée.

**Pourquoi** : exigence du directeur (données protégées si le téléphone est piraté). Une porte dérobée affaiblirait tout le reste.

### D-016 · 14/11/2026 · Sauvegarde chiffrée au format standard d'Office

Chiffrement « Agile » d'Office (AES-256, SHA-512, 100 000 tours). Le fichier s'ouvre dans Excel avec le mot de passe (au moins 10 caractères, gardé sur le téléphone, jamais copié dans le fichier). Les anciennes sauvegardes non protégées restent lisibles.

**Pourquoi** : une sauvegarde protégée, mais qui reste lisible sans l'appli, en cas de coup dur.

### D-017 · 14/11/2026 · Alertes RGPD non bloquantes

Un téléphone ou un email sans accord est signalé (bandeau, badge, filtre, Tableau de bord) mais la saisie n'est jamais bloquée.

**Pourquoi** : sur le pas de la porte, on note d'abord ; on régularise ensuite.

### D-018 · 14/11/2026 · Mise à jour obligatoire, après la saisie en cours

Dès qu'une version est en ligne, une fenêtre au centre de l'écran impose la mise à jour, en attendant la fin d'une saisie en cours.

**Pourquoi** : une correction doit toujours pouvoir arriver ; une seule version en service à la fois.

### D-019 · 19/11/2026 · La couleur de l'appli reste hors des données chiffrées

Le thème choisi est gardé en clair (`localStorage`, clé `prospection-theme`).

**Pourquoi** : il colore l'écran du code, affiché avant que les données soient déchiffrées. Une couleur ne dit rien de personne.
