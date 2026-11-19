# Cahier des charges

Écrit le 19/11/2026 à partir de l'appli en service, de la passation et des échanges qui ont conduit à sa construction. Il change rarement, et seulement sur une décision notée dans [decisions.md](decisions.md).

## Le besoin

Jonathan fait de la prospection immobilière en porte-à-porte sur **9 îlots de Champigny-sur-Marne**. Il lui faut, dans la poche, pendant la tournée :

- savoir où il est passé, quand, et avec quel résultat (absent, contact, refus) ;
- garder les fiches des personnes rencontrées (propriétaire, locataire, projet, relances) et les rattacher à une adresse, voire à un appartement ;
- ne pas resolliciter quelqu'un qui a refusé ou demandé à ne plus l'être ;
- savoir qui relancer et quels absents repasser voir ;
- varier ses prétextes de prise de contact (scénarios) sans se répéter auprès des mêmes personnes ;
- suivre ses objectifs (**100 portes par semaine, 3 mandats par mois**) et produire un bilan mensuel ;
- avoir sous la main les prix de vente réels du secteur (DVF).

## Un seul utilisateur, un seul téléphone

L'appli sert à une seule personne, sur son iPhone. Il n'y a ni compte, ni serveur, ni partage entre plusieurs personnes.

## Contraintes

| Contrainte | Ce que ça impose |
| --- | --- |
| **iPhone** | Web app installée depuis Safari (« Sur l'écran d'accueil »). Testée au format iPhone. Les pièges d'iOS sont notés dans le [CLAUDE.md](../CLAUDE.md). |
| **Hors connexion** | Tout fonctionne sans réseau dans la rue (service worker). Seuls le fond de carte en ligne et la mise à jour DVF manuelle ont besoin du réseau. |
| **Données sur le téléphone seulement** | Rien n'est envoyé sur Internet. La sauvegarde est un fichier que Jonathan exporte lui-même. |
| **Vraies données de clients** | Aucune prise de risque avec la prod : chaque changement passe d'abord par la Recette, et rien ne va en prod sans « En prod » ([D-006](decisions.md)). |
| **Dépôt public** | Aucune donnée réelle ni aucun secret dans le dépôt. |
| **RGPD** | L'appli garde des données sur d'autres personnes : voir [securite-rgpd.md](securite-rgpd.md). |
| **Hébergement gratuit** | GitHub Pages ([D-001](decisions.md)). |

## Exigences du directeur (novembre 2026)

Elles sont toutes en place depuis le 14/11/2026 et ne doivent jamais régresser :

1. **L'accord de chaque client** (case cochée) avant de garder ses coordonnées.
2. **Un code à l'ouverture** de l'appli.
3. **Des données protégées si le téléphone est piraté** : chiffrement sur le téléphone, sauvegarde protégée par mot de passe.

Les tests de `tests/rgpd.mjs` et `tests/sauvegarde.mjs` les vérifient : un changement qui les fait échouer ne part pas en Recette.

## Hors sujet à ce jour

- Plusieurs utilisateurs, une équipe, un partage de fiches.
- Une synchronisation entre appareils ou un serveur qui garde les données.
- Android ou un ordinateur comme appareil principal (l'appli s'y ouvre, mais n'y est pas vérifiée).
- D'autres secteurs que les 9 îlots actuels : le jour où on en confie de nouveaux, ce sera une évolution (`npm run data` avec un nouveau `data-src/ilots.kml`).

Changer l'un de ces points demande une décision.
