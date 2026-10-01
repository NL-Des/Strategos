# 08 — Sources de données (Excel et Google Sheets)

## Objet
La connexion de Strategos aux documents Excel et Google Sheets : comment ils sont lus, mis en cache, reliés entre eux et écrits.

## Règles fonctionnelles

### Trois types de source
| Type | Connexion | Source de vérité | Lecture |
|---|---|---|---|
| **Google Sheets** | API Google, accès **délégué**, limité aux Sheets choisis par l'admin | Le Sheet | Cache mémoire court |
| **OneDrive / SharePoint** | API Microsoft (Graph), accès **délégué** | Le fichier en ligne | Cache mémoire court |
| **Excel uploadé** | Fichier déposé par l'admin | La copie dans Strategos | Staging en base |

- **Google Sheets** : l'administrateur connecte son compte Google (accès délégué), puis choisit ses Sheets dans le **sélecteur de fichiers de Google**. Strategos n'accède qu'aux Sheets choisis, jamais au reste de son Drive : il n'y a ni lien à coller, ni partage à faire. La connexion se renouvelle automatiquement ; si elle expire (accès révoqué, mot de passe changé, six mois sans usage), l'espace admin demande à l'admin de se reconnecter. S'il se reconnecte avec un autre compte, il choisit de nouveau ses Sheets : ceux déjà ajoutés retrouvent leur accès, sans doublon.
- **OneDrive / SharePoint** : l'administrateur connecte son compte Microsoft (accès délégué). C'est le seul mode qui fonctionne aussi bien sur un OneDrive personnel (communautés) que d'entreprise. La connexion se renouvelle automatiquement tant que l'instance est utilisée ; si elle expire, l'espace admin demande à l'admin de se reconnecter.
- **Sources connectées = source de vérité vivante** : l'état réel du Sheet ou du fichier en ligne fait foi (pas de copie figée en base) ; Strategos ne fait que proposer des modifications par-dessus. En pratique, la lecture passe par un **cache court** (45 secondes par défaut) pour éviter de cogner les quotas de l'API à chaque affichage de page — quasi-live du point de vue utilisateur, sans appel API à chaque requête. Ce cache est gardé **en mémoire** : si la source est indisponible, un message d'erreur s'affiche à la place des données.
- **Édition directe par l'administrateur** : rien n'empêche l'administrateur de modifier le Sheet/fichier directement en dehors de Strategos (édition Google Sheets native, etc.). Si la cellule visée a changé depuis qu'une soumission a été faite dessus, aucune détection automatique n'est prévue — la validation applique la modification telle quelle, la vigilance repose sur l'administrateur.
- **Échelle attendue** : dizaines à quelques centaines d'utilisateurs ; fichiers Excel/Sheets pouvant atteindre plusieurs milliers de lignes, plusieurs pages, avec des liaisons/appels internes entre différents fichiers Excel/Sheets.
  - Conséquence : les données Excel importées devront être mises en staging en base plutôt que reparsées à chaque lecture, et les liaisons inter-fichiers devront être résolues par référence (ID de fichier + cellule/plage) plutôt que par chemin de fichier.

### Formules : Strategos ne calcule jamais
Strategos lit des valeurs et en écrit, mais **n'exécute aucune formule**.
- **Sources connectées** : après chaque écriture, Google ou Microsoft recalcule. Strategos invalide son cache et relit les valeurs à jour.
- **Excel uploadé** : personne ne recalcule. Les cellules qui dépendent d'une valeur écrite sont marquées **« à recalculer »**, et le site affiche un indicateur sur ces valeurs. L'indicateur disparaît quand l'admin réimporte le fichier après l'avoir ouvert dans Excel.

> **Exemple** : `D2 = B2 × C2` (prix × quantité). Un joueur propose C2 = 5 au lieu de 3, et l'admin valide. Sur un Google Sheet, D2 est recalculé par Google et relu. Sur un Excel uploadé, D2 garde son ancienne valeur et apparaît avec l'indicateur « à recalculer ».

### Excel uploadé : version de référence et réimport
- Une fois uploadé, la **copie dans Strategos est la version de référence** : c'est elle qui reçoit les validations, et les modifications que l'admin fait dans la **grille** de l'écran Sources ([04](04-administration.md#sources)) : valeurs et formules, jamais calculées. Les formules restent stockées dans la syntaxe du fichier (noms anglais, `,` entre arguments) ; la grille les affiche et les reçoit en français, la conversion se fait dans l'interface.
- L'administrateur **télécharge** la version à jour depuis Strategos avant de retravailler le fichier sur son poste. C'est le fichier importé, dont les cellules écrites depuis par Strategos (validations, valeurs et formules saisies dans la grille) sont remplacées directement dans le XML des feuilles (le reste du classeur est gardé tel quel) ; il est marqué pour être entièrement recalculé à l'ouverture dans Excel.
- **Réimport** : s'il y a eu des validations ou des modifications dans la grille depuis le dernier téléchargement, Strategos liste ce qui serait perdu et propose :
  - **annuler** ;
  - **écraser** (les modifications listées sont perdues) ;
  - **réappliquer les modifications** sur le nouveau fichier.

> **Exemple** : lundi, l'admin uploade `stock.xlsx` (Épées = 10). Mardi, il valide la proposition « Épées = 8 », écrite dans la copie de Strategos. Mercredi, il ajoute une ligne « Boucliers » dans le fichier **de son PC**, qui contient toujours Épées = 10, et le réimporte. Sans garde-fou, la validation de mardi serait perdue sans bruit. Strategos affiche donc « 1 validation serait perdue : Épées 10 → 8 », et l'admin choisit de la réappliquer.

## Points techniques
Moteur Excel/Sheets (**SourcesModule** pour la lecture, l'écriture et le réimport ; **FormsModule** pour la validation des soumissions) :
- Chaque source reçoit un `source_id` stable, indépendant de tout chemin de fichier ; `sources.type[upload|gsheet|onedrive]` ([14](14-modele-donnees.md#7-sources-de-données)).
- À l'import/sync, les cellules contenant une formule de liaison externe sont détectées et résolues en référence (source, feuille, plage), stockée dans `cell_references` — jamais par chemin. Pour un Excel uploadé, le classeur lié est retrouvé **une fois, à l'import**, parmi les Excel uploadés, par son nom de fichier ; ensuite, seul le `source_id` compte. Sans source correspondante, aucune référence n'est créée.
- Une cellule dont la formule n'est **qu'une** référence à une cellule d'un autre classeur (`=[1]Stock!B2`) prend la valeur de la cellule liée. Toute autre formule, même si elle cite un autre classeur, garde sa valeur stockée : rien n'est calculé.
- À la lecture d'une page, le backend **suit** ces références via la table pour lire les valeurs, sans reparser ni calculer les formules.
- **Cache mémoire** (45 s par défaut, réglable par `SOURCE_CACHE_MS`) pour les sources connectées : une feuille entière (valeurs, types, formules) par entrée, invalidé par `source_id` après chaque écriture et au début de chaque validation (la ligne vide et la valeur de départ d'un mouvement se lisent dans le document). Il n'y a aucune copie en base pour ces sources. Chaque lecture met à jour `status` (`ok` et `last_read_at`, ou `unavailable`).
- **Écriture dans une source connectée** : valeurs brutes (`RAW` pour Sheets ; texte préfixé d'une apostrophe pour Graph s'il ressemble à une formule), sous le verrou de la source. L'appel à l'API n'est pas transactionnel : si la transaction de validation échoue après l'écriture, la valeur reste écrite dans le document. Pas de `needs_recalc` : Google et Microsoft recalculent ; les formules sont lues seulement pour l'avertissement « cellule-formule ciblée ».
- **Staging en base** (`staging_cells`, lignes et colonnes stockées en entiers), réservé aux Excel uploadés. Il conserve la valeur, la formule et un drapeau `needs_recalc`. Une formule saisie dans la grille est stockée avec `needs_recalc`, sans calcul. Après une écriture, `needs_recalc` est posé sur les cellules dont la formule référence, directement ou transitivement, la cellule écrite, y compris via `cell_references`.
- Réimport : `sources.last_downloaded_at`, et `reimport_previews` pour l'aperçu en deux temps. Une validation est « perdue » si elle est postérieure au dernier téléchargement, que sa valeur est encore dans la version de référence et que le nouveau fichier en porte une autre. L'option « réappliquer » rejoue ces soumissions entières (tous leurs champs, pas seulement les cellules perdues) dans l'ordre de validation, par le même chemin qu'une validation (clé retrouvée, première ligne vide, mouvement appliqué à la nouvelle valeur) ; un échec annule le réimport. Les modifications de la grille sont gardées dans `source_cell_edits` : la dernière d'une cellule est « perdue » selon la même règle (contenu, formule comprise, encore dans la version de référence, autre contenu dans le nouveau fichier) ; « réappliquer » la réécrit telle quelle, mêlée aux validations dans l'ordre chronologique.
- **Écritures** : validations et modifications de la grille passent toutes par le même service d'écriture (verrou par `source_id`, `needs_recalc`) ; seule la grille, réservée à l'admin et aux Excel uploadés, écrit une formule.
- À la validation d'une soumission, le backend écrit la valeur brute sur la cellule cible (API Sheets, API Graph ou réécriture de la copie Excel), sans se préoccuper des formules amont — cohérent avec l'écrasement de formule spécifié dans [Formulaires et soumissions](09-formulaires-soumissions.md).
- OneDrive : enregistrement d'une application Azure (identifiants fournis au déploiement) ; le refresh token de l'admin est stocké **chiffré** en base (AES-256-GCM, clé `TOKEN_ENCRYPTION_KEY`), rafraîchi automatiquement, et son expiration est signalée dans l'espace admin (bandeau ; sources OneDrive en `auth_expired`). Le retour de Microsoft arrive sans cookie de session (`SameSite=Strict`, navigation venue d'un autre site) : la route de retour est publique et ne se fie qu'à `state`, aléatoire, à usage unique, lié à l'admin qui a lancé la connexion et valable 10 minutes.
- Google Sheets : client OAuth d'un projet Google Cloud (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, fournis au déploiement ; sans eux, Google Sheets est désactivé), flux « code » avec `access_type=offline`. Scopes : `openid email` (compte affiché) et `drive.file`, qui ne donne accès qu'aux fichiers choisis par l'admin et n'est pas un scope « sensible » (pas de vérification de l'application par Google). Le refresh token est stocké **chiffré** en base (table `google_credentials`, même clé `TOKEN_ENCRYPTION_KEY`) ; son refus par Google rend la connexion expirée (bandeau ; sources Google Sheets en `auth_expired`). La route de retour suit la même règle que celle de OneDrive (`state`). Le **sélecteur de fichiers** (Google Picker) s'ouvre dans le navigateur de l'admin : le backend lui fournit un jeton d'accès court, la clé d'API du projet (`GOOGLE_API_KEY`) et le numéro du projet (préfixe de `GOOGLE_CLIENT_ID`), jamais le refresh token. Le script du sélecteur est le seul chargé depuis Google, et seulement sur l'écran Sources, à l'ouverture du sélecteur.
- Le choix de rester en TypeScript pour ce moteur est justifié dans [Transverse](11-transverse.md#stack-technique).

## Dépendances
- [04 — Administration](04-administration.md) : journal des téléchargements et réimports.
- [06 — Page builder](06-page-builder.md) : modules qui lisent les données (dont la plage extensible).
- [09 — Formulaires et soumissions](09-formulaires-soumissions.md) : écritures dans les documents.
- [11 — Transverse](11-transverse.md) : stockage des fichiers uploadés.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-10-01)**
- Google Sheets en accès délégué, comme OneDrive, à la place du compte de service : l'admin connecte son compte Google et choisit ses Sheets dans le sélecteur de fichiers de Google (scope `drive.file`). Créer un compte de service et partager chaque Sheet avec son adresse était trop technique pour un admin non averti.

**Décisions (2026-09-26)**
- Liaisons des Excel uploadés : classeur lié retrouvé par son nom de fichier à l'import ; une formule qui n'est qu'une référence suit la cellule liée, les autres gardent leur valeur stockée.

**Décisions (2026-09-25)**
- Trois types de source : Excel uploadé, Google Sheets, OneDrive/SharePoint.
- ~~Google Sheets via un compte de service.~~ Remplacé le 2026-10-01.
- Pas de calcul de formules ; les cellules dépendantes des Excel uploadés sont marquées « à recalculer ».
- Excel uploadé : la copie dans Strategos fait référence ; téléchargement, puis réimport avec avertissement et réapplication possible.
- Cache mémoire pour les sources connectées ; staging en base pour les uploads seulement.
- OneDrive/SharePoint en accès délégué.
