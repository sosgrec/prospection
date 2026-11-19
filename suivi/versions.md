# Journal des versions

Une entrée par mise en prod, la plus récente en haut. Le numéro x.y.z et la phrase sont affichés dans l'appli ([D-007](decisions.md)).

- **z** monte pour une correction ou une petite retouche : 1.0.0 devient 1.0.1.
- **y** monte pour une nouvelle fonction : 1.0.1 devient 1.1.0.
- **x** monte pour une refonte, ou quand une ancienne sauvegarde ne se relit plus telle quelle : 1.4.2 devient 2.0.0.

L'entrée s'écrit au « En prod », pas avant : ce qui est en Recette n'a pas encore de numéro définitif.

## Format

Chaque entrée suit exactement ce modèle, pour que l'appli puisse un jour lire ce fichier et afficher la liste des versions :

```
## x.y.z · AAAA-MM-JJ
Une phrase qui dit ce qui change pour Jonathan, en français courant.
- Détail éventuel (B-0xx, I-0xx, fonction ajoutée…)
```

## 1.0.0 · à venir

Premier numéro, au premier « En prod » après la mise en place de la Recette.

## Avant la numérotation

Jusqu'au 19/11/2026, chaque version était désignée par sa date et une empreinte du contenu (par exemple `2026-11-19-18e6530b`), calculée par `scripts/build.mjs`. Les publications, d'après l'historique du dépôt :

| Date | Ce qui a changé | Commit |
| --- | --- | --- |
| 19/11/2026 | Appli sur toute la hauteur de l'écran sur iOS 26 et plus (B-004). Version en service : `2026-11-19-18e6530b`. | `75565a0` |
| 19/11/2026 | Bande de l'heure en gris foncé sur iOS 26 et plus (B-003). | `d6dfc28` |
| 19/11/2026 | Barre d'onglets visible sur la carte (B-001), heure en transparence, sauvegarde à la seconde (B-002). | `4332409` |
| 19/11/2026 | Cinq couleurs d'appli, barre d'onglets flottante, titres centrés, carte en plein écran. | `708c632` |
| 14/11/2026 | Code d'accès, chiffrement des données et outils RGPD ; mise à jour obligatoire. | `509d0a6` |
| 12/11/2026 | Date de passage modifiable et anciennes visites. | `dde4785` |
| 12/11/2026 | Mise à jour automatique mensuelle des ventes DVF ; messages plus clairs pour la mise à jour manuelle. | `8b239d1`, `a1b4dd7` |
| 12/11/2026 | Première version de Prospection. | `06eaab4` |

Les commits « Vérification mensuelle des ventes DVF » de GitHub Actions ne changent l'appli que si de nouvelles ventes apparaissent.
