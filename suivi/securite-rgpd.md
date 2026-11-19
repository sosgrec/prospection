# Sécurité et RGPD

Tenu à jour par les fils « Sécu · … ». Les choix de fond sont dans [decisions.md](decisions.md) (D-010, D-015 à D-019).

## Fiche du registre des traitements

| Rubrique | Contenu |
| --- | --- |
| Traitement | Prospection immobilière en porte-à-porte sur 9 îlots de Champigny-sur-Marne |
| Responsable | **À compléter** : l'agence pour laquelle Jonathan prospecte (avec son directeur) |
| Utilisateur | Jonathan, seul, sur son iPhone |
| Finalité | Organiser les passages, suivre les contacts et les relances, obtenir des mandats de vente |
| Personnes concernées | Habitants et propriétaires rencontrés ou repérés dans les îlots |
| Données | Nom, prénom, téléphone, email, adresse, propriétaire ou locataire, année d'arrivée, logement, projet, intérêt, mandat, remarques, photos, historique des passages, accord RGPD (date, mode) |
| Base légale | Consentement pour garder les coordonnées (case d'accord par contact, avec date et mode) ; intérêt légitime pour noter un passage à une adresse |
| Durée de conservation | 3 ans après le dernier échange pour un prospect ; les clients sous mandat signé ne sont pas concernés. Corbeille vidée après 30 jours. |
| Où sont les données | Sur le téléphone seulement (IndexedDB, chiffré). Sauvegarde Excel chiffrée, rangée par Jonathan dans son Drive. |
| Destinataires | Aucun automatiquement : rien n'est envoyé par l'appli. Le bilan PDF mensuel, que Jonathan peut partager, contient surtout des chiffres, **mais aussi le nom et l'adresse des clients qui ont signé un mandat dans le mois** : il ne s'envoie qu'à l'agence. |
| Information des personnes | Mention d'information à montrer ou à envoyer par SMS ou email (Tableau > Mention d'information) |
| Droits des personnes | Accès, rectification, effacement, opposition : aujourd'hui à la main depuis la fiche ; boutons dédiés prévus (voir plus bas) |

## Mesures en place

### Sur le téléphone

- Code à 6 chiffres à l'ouverture et au retour après un délai réglable (1 minute par défaut) ; codes trop simples refusés.
- Pauses de plus en plus longues après 5 codes faux (30 s, 1, 5, 15, 60 minutes), qui continuent si on relance l'appli.
- Chiffrement : PBKDF2-SHA256 (600 000 tours) sur le code, qui protège un secret aléatoire ; ce secret chiffre chaque enregistrement (AES-GCM 256 bits) et masque ses identifiants (HMAC-SHA256). Le code n'est jamais enregistré. Photos chiffrées, image séparée de sa description.
- Aperçu masqué quand l'appli passe en arrière-plan.
- Code oublié : effacement complet, puis restauration de la sauvegarde. Pas de porte dérobée.
- Seule donnée en clair : la couleur de l'appli (D-019).

### La sauvegarde

- Excel chiffré au format standard d'Office (« Agile » : AES-256, SHA-512, 100 000 tours), lisible dans Excel avec le mot de passe.
- Mot de passe d'au moins 10 caractères, gardé sur le téléphone (dans les données chiffrées), jamais copié dans le fichier.
- Rappel quand la dernière sauvegarde a plus de 7 jours.

### Le RGPD dans l'appli

- Case d'accord jamais précochée, avec date et mode ; alertes non bloquantes (bandeau, badge, filtre « Accord manquant », carte au Tableau), confirmation avant d'appeler sans accord.
- Retirer l'accord propose d'effacer téléphone et email ; « Ne plus solliciter » propose de ne garder que le nom et l'adresse, et l'adresse passe en rouge.
- Règle des 3 ans : liste des prospects et passages à supprimer définitivement.

### Le dépôt et la publication

- Dépôt public : aucune donnée de client, aucun secret (D-010). Les tests n'utilisent que des données fictives.
- Les données publiques (`data/base.json`, `data/dvf.json`) ne viennent que de sources ouvertes (cadastre Etalab, BANO, DVF) : aucune personne n'y est nommée.
- L'appli n'appelle Internet que pour le fond de carte (IGN Géoplateforme), la mise à jour DVF manuelle (data.gouv.fr) et ses propres mises à jour (GitHub Pages).

## Contrôles faits

| Date | Contrôle | Résultat |
| --- | --- | --- |
| 14/11/2026 | `tests/rgpd.mjs` : base brute lue directement, sans le code | Ni nom, ni téléphone, ni identifiant, ni adresse lisibles |
| 14/11/2026 | `tests/officecrypto.mjs` : sauvegarde relue par msoffcrypto-tool, olefile et LibreOffice | S'ouvre avec le mot de passe, refuse un mauvais |
| 19/11/2026 | `tests/sauvegarde.mjs` : export puis restauration dans une appli vierge | Tout retrouvé, champ par champ |
| 19/11/2026 | Relecture du dépôt par le fil de mise en route (code, tests, données) | Aucune donnée réelle ni secret trouvé ; les numéros présents dans les tests sont fictifs |
| 19/11/2026 | Toutes les séries de tests relancées | Toutes passent ([cahier-de-test.md](cahier-de-test.md)) |

## Points ouverts

Chacun deviendra un fil « Sécu · … » quand Jonathan le demandera.

1. **Boutons pour les droits des personnes** : exporter la fiche d'une personne (accès) et l'effacer complètement, passages et photos compris (effacement). Laissés de côté pendant la version RGPD.
2. **Sécurité côté GitHub** : double authentification sur le compte, branche `main` protégée pour que rien n'y arrive sans passer par la Recette, alertes de sécurité sur les composants (Dependabot).
3. **Test de restauration régulier** : restaurer pour de vrai une sauvegarde de la prod dans une appli vierge, par exemple chaque mois, et noter le résultat ici.
4. **Purge des 3 ans** : aujourd'hui proposée, pas automatique ; décider s'il faut un rappel.
5. **Responsable du traitement** : compléter la fiche du registre avec l'agence.
6. **Recette et prod sur la même origine** (`sosgrec.github.io`) : la Recette doit utiliser son propre nom de base IndexedDB et ses propres clés de stockage, pour ne jamais lire ni écraser les données de la prod. À traiter dans le fil de mise en place de la Recette.
