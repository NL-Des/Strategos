# 08 — Sources de données (Excel et Google Sheets)

## Objet
La connexion de Strategos aux documents Excel et Google Sheets : comment ils sont lus, mis en cache, reliés entre eux et écrits.

## Règles fonctionnelles
- Support des deux : **Excel** (connexion via une API ou équivalent disponible) et **Google Sheets** (connexion live via API, OAuth côté administrateur).
- **Décision** : pour Excel, **les deux modes coexistent** — upload de fichier et connexion via l'API Microsoft (OneDrive/SharePoint).
- **Google Sheets = source de vérité vivante** : l'état réel du Sheet fait foi (pas de copie figée en base) ; Strategos ne fait que proposer des modifications par-dessus. En pratique, la lecture passe par un **cache court** (30-60 secondes) pour éviter de cogner les quotas de l'API Sheets à chaque affichage de page — quasi-live du point de vue utilisateur, sans appel API à chaque requête. Les fichiers **Excel** uploadés, eux, sont importés à un instant T et nécessitent un réimport manuel déclenché par l'administrateur si le fichier source est modifié en dehors du système.
- **Édition directe par l'administrateur** : rien n'empêche l'administrateur de modifier le Sheet/fichier directement en dehors de Strategos (édition Google Sheets native, etc.). Si la cellule visée a changé depuis qu'une soumission a été faite dessus, aucune détection automatique n'est prévue — la validation applique la modification telle quelle, la vigilance repose sur l'administrateur.
- **Échelle attendue** : dizaines à quelques centaines d'utilisateurs ; fichiers Excel/Sheets pouvant atteindre plusieurs milliers de lignes, plusieurs pages, avec des liaisons/appels internes entre différents fichiers Excel/Sheets.
  - Conséquence : les données Excel importées devront être mises en staging en base plutôt que reparsées à chaque lecture, et les liaisons inter-fichiers devront être résolues par référence (ID de fichier + cellule/plage) plutôt que par chemin de fichier.

## Points techniques
Moteur Excel/Sheets (**ExcelSyncModule**) :
- Chaque source (fichier Excel importé ou Google Sheet connecté) reçoit un `source_id` stable, indépendant de tout chemin de fichier.
- À l'import/sync, les cellules contenant une formule de liaison externe sont détectées et résolues en référence `(source_id, sheet_ref, cell_or_range)`, stockée dans `cell_references` — jamais par chemin.
- À la lecture d'une page, le backend résout récursivement ces références via la table plutôt que de reparser les formules.
- Un **cache court (30-60s)** protège les lectures Google Sheets live des quotas API ; invalidation par `source_id`. Les fichiers Excel sont importés à un instant T et réimportés manuellement.
- À la validation d'une soumission, le backend écrit la valeur brute sur la cellule cible (API Sheets ou réécriture du fichier Excel), sans se préoccuper des formules amont — cohérent avec l'écrasement de formule spécifié dans [Formulaires et soumissions](09-formulaires-soumissions.md).
- Le choix de rester en TypeScript pour ce moteur est justifié dans [Transverse](11-transverse.md#stack-technique).

## Dépendances
- [06 — Page builder](06-page-builder.md) : modules qui lisent les données.
- [09 — Formulaires et soumissions](09-formulaires-soumissions.md) : écritures dans les documents.
- [11 — Transverse](11-transverse.md) : stockage des fichiers uploadés.

## Questions ouvertes
_À compléter lors de la revue de cohérence._
