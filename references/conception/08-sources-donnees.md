# 08 — Sources de données (Excel et Google Sheets)

## Objet
La connexion de Strategos aux documents Excel et Google Sheets : comment ils sont lus, mis en cache, reliés entre eux et écrits.

## Règles fonctionnelles

### Trois types de source
| Type | Connexion | Source de vérité | Lecture |
|---|---|---|---|
| **Google Sheets** | API, via un **compte de service** | Le Sheet | Cache mémoire court |
| **OneDrive / SharePoint** | API Microsoft (Graph) | Le fichier en ligne | Cache mémoire court |
| **Excel uploadé** | Fichier déposé par l'admin | La copie dans Strategos | Staging en base |

- **Google Sheets** : l'administrateur partage ses Sheets avec l'adresse du compte de service de l'instance. Il n'a aucune connexion personnelle à faire, et aucun jeton n'expire.
- **Sources connectées = source de vérité vivante** : l'état réel du Sheet ou du fichier en ligne fait foi (pas de copie figée en base) ; Strategos ne fait que proposer des modifications par-dessus. En pratique, la lecture passe par un **cache court** (30-60 secondes) pour éviter de cogner les quotas de l'API à chaque affichage de page — quasi-live du point de vue utilisateur, sans appel API à chaque requête. Ce cache est gardé **en mémoire** : si la source est indisponible, un message d'erreur s'affiche à la place des données.
- **Édition directe par l'administrateur** : rien n'empêche l'administrateur de modifier le Sheet/fichier directement en dehors de Strategos (édition Google Sheets native, etc.). Si la cellule visée a changé depuis qu'une soumission a été faite dessus, aucune détection automatique n'est prévue — la validation applique la modification telle quelle, la vigilance repose sur l'administrateur.
- **Échelle attendue** : dizaines à quelques centaines d'utilisateurs ; fichiers Excel/Sheets pouvant atteindre plusieurs milliers de lignes, plusieurs pages, avec des liaisons/appels internes entre différents fichiers Excel/Sheets.
  - Conséquence : les données Excel importées devront être mises en staging en base plutôt que reparsées à chaque lecture, et les liaisons inter-fichiers devront être résolues par référence (ID de fichier + cellule/plage) plutôt que par chemin de fichier.

### Formules : Strategos ne calcule jamais
Strategos lit des valeurs et en écrit, mais **n'exécute aucune formule**.
- **Sources connectées** : après chaque écriture, Google ou Microsoft recalcule. Strategos invalide son cache et relit les valeurs à jour.
- **Excel uploadé** : personne ne recalcule. Les cellules qui dépendent d'une valeur écrite sont marquées **« à recalculer »**, et le site affiche un indicateur sur ces valeurs. L'indicateur disparaît quand l'admin réimporte le fichier après l'avoir ouvert dans Excel.

> **Exemple** : `D2 = B2 × C2` (prix × quantité). Un joueur propose C2 = 5 au lieu de 3, et l'admin valide. Sur un Google Sheet, D2 est recalculé par Google et relu. Sur un Excel uploadé, D2 garde son ancienne valeur et apparaît avec l'indicateur « à recalculer ».

### Excel uploadé : version de référence et réimport
- Une fois uploadé, la **copie dans Strategos est la version de référence** : c'est elle qui reçoit les validations.
- L'administrateur **télécharge** la version à jour depuis Strategos avant de retravailler le fichier sur son poste.
- **Réimport** : s'il y a eu des validations depuis le dernier téléchargement, Strategos liste ce qui serait perdu et propose :
  - **annuler** ;
  - **écraser** (les validations listées sont perdues) ;
  - **réappliquer les validations** sur le nouveau fichier.

> **Exemple** : lundi, l'admin uploade `stock.xlsx` (Épées = 10). Mardi, il valide la proposition « Épées = 8 », écrite dans la copie de Strategos. Mercredi, il ajoute une ligne « Boucliers » dans le fichier **de son PC**, qui contient toujours Épées = 10, et le réimporte. Sans garde-fou, la validation de mardi serait perdue sans bruit. Strategos affiche donc « 1 validation serait perdue : Épées 10 → 8 », et l'admin choisit de la réappliquer.

## Points techniques
Moteur Excel/Sheets (**ExcelSyncModule**) :
- Chaque source reçoit un `source_id` stable, indépendant de tout chemin de fichier ; `excel_sources.type[upload|gsheet|onedrive]`.
- À l'import/sync, les cellules contenant une formule de liaison externe sont détectées et résolues en référence `(source_id, sheet_ref, cell_or_range)`, stockée dans `cell_references` — jamais par chemin.
- À la lecture d'une page, le backend **suit** ces références via la table pour lire les valeurs, sans reparser ni calculer les formules.
- **Cache mémoire** (30-60s) pour les sources connectées, invalidé par `source_id`, en particulier après chaque écriture. Il n'y a aucune copie en base pour ces sources.
- **Staging en base** (`excel_staging_cells`), réservé aux Excel uploadés. Il conserve la valeur, la formule et un drapeau `needs_recalc`. Après une écriture, `needs_recalc` est posé sur les cellules dont la formule référence, directement ou transitivement, la cellule écrite, y compris via `cell_references`.
- Réimport : `excel_sources.last_downloaded_at`. Les validations postérieures sont retrouvées dans `submissions` ; l'option « réappliquer » les réécrit dans l'ordre de validation.
- À la validation d'une soumission, le backend écrit la valeur brute sur la cellule cible (API Sheets, API Graph ou réécriture de la copie Excel), sans se préoccuper des formules amont — cohérent avec l'écrasement de formule spécifié dans [Formulaires et soumissions](09-formulaires-soumissions.md).
- La clé du compte de service Google est fournie au déploiement sous forme de fichier secret monté dans le conteneur backend.
- Le choix de rester en TypeScript pour ce moteur est justifié dans [Transverse](11-transverse.md#stack-technique).

## Dépendances
- [04 — Administration](04-administration.md) : journal des téléchargements et réimports.
- [06 — Page builder](06-page-builder.md) : modules qui lisent les données (dont la plage extensible).
- [09 — Formulaires et soumissions](09-formulaires-soumissions.md) : écritures dans les documents.
- [11 — Transverse](11-transverse.md) : stockage des fichiers uploadés.

## Questions ouvertes
- **OneDrive / SharePoint** : un enregistrement d'application Azure est nécessaire dans tous les cas. Deux accès sont possibles :
  - **accès « application »** : sans utilisateur, il demande le consentement d'un admin du tenant Microsoft et ne fonctionne pas sur un OneDrive personnel ;
  - **accès « délégué »** : une connexion OAuth de l'admin, avec des jetons à rafraîchir.

  Lequel retenir, et est-ce acceptable pour les publics visés ?

**Décisions (2026-09-25)**
- Trois types de source : Excel uploadé, Google Sheets, OneDrive/SharePoint.
- Google Sheets via un compte de service.
- Pas de calcul de formules ; les cellules dépendantes des Excel uploadés sont marquées « à recalculer ».
- Excel uploadé : la copie dans Strategos fait référence ; téléchargement, puis réimport avec avertissement et réapplication possible.
- Cache mémoire pour les sources connectées ; staging en base pour les uploads seulement.
