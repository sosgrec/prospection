# Bugs

Chaque bug a un numéro B-0xx, attribué à l'ouverture de son fil « Bug B-0xx · … ». Le fil commence par **reproduire le bug dans un test automatique**, qui échoue, puis corrige jusqu'à ce que le test passe. Ce test reste dans `tests/` : il aurait détecté le bug, il détectera son retour.

**Jamais de donnée de client ici** : on décrit la situation, pas la personne.

## Gravité

| Gravité | Sens |
| --- | --- |
| **Bloquant** | Empêche la tournée ou met des données en danger (perte, fuite, sauvegarde illisible). On revient d'abord à la version précédente ([reprise.md](reprise.md)). |
| **Gênant** | Une fonction ne marche pas, mais on peut faire sans ou autrement. |
| **Mineur** | Affichage, texte, confort. |

## État

Ouvert → En cours → En Recette → Corrigé (version) ; ou Écarté (avec la raison).

## Liste

| N° | Ce qui se passe | Gravité | État | Corrigé en | Test |
| --- | --- | --- | --- | --- | --- |
| B-001 | La barre d'onglets passait sous la photo aérienne de la carte : toujours cliquable, mais invisible. | Gênant | Corrigé | avant 1.0.0 (19/11, `4332409`) | `tests/theme.mjs` |
| B-002 | Sauvegarde : deux passages de la même minute pouvaient revenir dans le désordre après restauration (heures gardées à la minute). | Mineur | Corrigé | avant 1.0.0 (19/11, `4332409`) | `tests/sauvegarde.mjs` |
| B-003 | iOS 26 et plus : la bande de l'heure prenait le rouge de l'écran de chargement et de l'écran du code. | Mineur | Corrigé | avant 1.0.0 (19/11, `d6dfc28`) | `tests/theme.mjs` |
| B-004 | iOS 26 et plus, appli installée : une bande vide sous la barre d'onglets, l'appli étant raccourcie de la hauteur de l'heure (bug WebKit 301108). | Gênant | Corrigé | avant 1.0.0 (19/11, `75565a0`) | `tests/theme.mjs` (simule une appli installée) ; contrôle sur l'iPhone : hauteur affichée en bas du Tableau |

Les bugs B-001 à B-004 ont été corrigés pendant la construction, avant la numérotation ; ils sont notés après coup à partir de l'historique du dépôt. Le prochain numéro est **B-005**.

## Fiche d'un bug (à recopier pour un nouveau)

```
### B-0xx · titre court
- Vu le : date, version (affichée dans l'appli)
- Ce qui se passe :
- Ce qui devrait se passer :
- Pour le reproduire : étapes, avec des données fictives
- Gravité :
- Cause :
- Correction : demande de fusion, version
- Test : fichier et nom de la vérification
```

Une fiche détaillée se met sous la liste quand le tableau ne suffit pas.
