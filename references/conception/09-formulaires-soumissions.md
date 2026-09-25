# 09 — Formulaires et soumissions

## Objet
L'unique voie d'écriture des utilisateurs vers les documents : des formulaires définis par l'administrateur, dont chaque soumission est une proposition à valider (voir [Vision](01-vision.md#principe-fondateur--aucun-accès-direct-aux-documents)).

## Règles fonctionnelles

### Formulaires
- Module du page builder : formulaire de modification ou d'ajout de l'excel ou du google sheet (modification : l'administrateur relie un champ à une case existante du document ; ajout : l'administrateur définit une ligne de départ, des colonnes autorisées et un nombre max de nouvelles lignes).
- L'accès à un formulaire découle du droit de lecture sur la page qui le contient (voir [Droits et groupes](03-droits-groupes.md#modèle-par-groupes)).
- **Formulaires de modification** : l'administrateur définit des formulaires (champs texte, menus de sélection...) dont chaque champ est mappé à exactement une cellule (un champ = une cellule, jamais plusieurs cellules pour un même champ). Une soumission utilisateur reste en attente jusqu'à validation par l'administrateur, qui applique alors la modification réelle au fichier/sheet. Il pourra accepter, refuser ou modifier la soumission.
- **Deux types de formulaires** :
  - **Formulaire de modification** : un champ = une cellule déjà existante (voir ci-dessus).
  - **Formulaire d'ajout** : permet à l'utilisateur de proposer une **nouvelle ligne**, dans un cadre entièrement défini par l'admin à la création du formulaire :
    - **Ligne de départ** : l'admin choisit la ligne/cellule à partir de laquelle les nouvelles lignes peuvent être ajoutées (par ex. juste après la dernière ligne existante, ou une ligne précise si de la place a été laissée).
    - **Colonnes autorisées** : chaque champ du formulaire est mappé à une colonne (et non plus à une cellule fixe) dans la plage définie par l'admin — un champ = une colonne, jamais plusieurs colonnes pour un même champ (miroir de la règle "un champ = une cellule" ci-dessus).
    - **Nombre maximum de nouvelles lignes** : l'admin fixe une limite totale de lignes que ce formulaire peut créer ; une fois la limite atteinte, le formulaire n'accepte plus de nouvelles soumissions (affiché comme complet/fermé côté utilisateur).
    - La ligne de départ et le nombre maximum définissent la **zone d'ajout** du formulaire (ex. lignes 12 à 31 pour un départ en 12 et 20 lignes au maximum).
  - La **ligne réellement attribuée** à une soumission "ajout" n'est déterminée qu'**à la validation** (pas à la soumission) : c'est la **première ligne vide** de la zone d'ajout au moment de la validation (une ligne est vide si toutes les colonnes mappées sont vides). Une ligne remplie entre-temps à la main par l'admin, directement dans le document, n'est donc jamais écrasée — cohérent avec la gestion des soumissions concurrentes ci-dessous, où plusieurs soumissions "ajout" en attente ne se réservent pas de ligne tant qu'elles ne sont pas validées. Le formulaire est **complet** quand la zone d'ajout ne contient plus de ligne vide. Si c'est le cas alors que des soumissions sont encore en attente, l'admin peut toujours les refuser, mais ne peut plus les valider (message d'erreur explicite) — évite de dépasser silencieusement la limite.
- **Cellule-formule ciblée** : l'administrateur peut mapper un champ de formulaire à une cellule contenant une formule ou une liaison vers un autre fichier ; valider une soumission dessus écrase la formule par une valeur brute. Ce n'est pas interdit, mais un avertissement explicite est affiché à l'admin à la création du formulaire et à la validation de chaque soumission le concernant.

### Soumissions
- **Soumissions concurrentes** : si plusieurs utilisateurs soumettent des modifications sur la même cellule, toutes restent visibles en attente — l'administrateur voit le conflit et choisit, laquelle valider (ou les fusionne manuellement).
- **Suivi des soumissions** : l'utilisateur dispose d'une page "mes soumissions" listant ses propositions et leur statut (en attente, validée, refusée, modifiée par l'admin, invalidée par un changement du formulaire). Pas de notification active (email, push...) — l'information est consultable, pas poussée.
- **Formulaire modifié ou supprimé** : si l'administrateur change le mapping champ→cellule d'un formulaire ou le supprime alors que des soumissions sont encore en attente dessus, ces soumissions sont automatiquement invalidées ; l'utilisateur devra resoumettre via la nouvelle version du formulaire. Précisément :
  - **invalident** les soumissions en attente : changer la cellule ou la colonne d'un champ, ajouter ou retirer un champ, changer la ligne de départ ou le nombre maximum de lignes, supprimer le formulaire ;
  - **n'invalident pas** : corriger un libellé, un texte d'aide ou l'ordre d'affichage des champs.
- **Formulaire non configuré** : un formulaire sans mapping complet (par exemple juste après la duplication d'une page ou l'instanciation d'un modèle) n'est pas affiché aux utilisateurs tant que l'admin ne l'a pas configuré.

## Points techniques

### Validation d'une soumission `ajout`
La ligne cible n'est calculée qu'à ce moment-là, jamais à la soumission.
- Ligne attribuée = première ligne de `[start_row, start_row + max_new_rows - 1]` dont toutes les colonnes mappées sont vides, lue depuis la source (cache invalidé juste avant pour une source connectée, staging pour un upload).
- Si aucune ligne n'est vide, la validation est bloquée avec une erreur explicite côté admin (la soumission reste `pending`, refusable mais pas validable).
- Écriture : chaque valeur de champ est écrite sur `(assigned_row, colonne mappée)`, en réutilisant le même mécanisme d'écriture que pour les formulaires de modification (voir [Sources de données](08-sources-donnees.md#points-techniques)) ; `assigned_row` est ensuite stocké sur la soumission.

### Sécurité
- Validation stricte des mappings champ→cellule pour empêcher toute écriture hors du périmètre défini par l'admin. Pour un formulaire `ajout`, cette validation couvre aussi : les colonnes doivent appartenir à la plage autorisée par l'admin, la ligne assignée doit appartenir à la zone d'ajout et être vide au moment de l'écriture — vérifié côté backend à la validation, jamais seulement côté frontend.
- Les cas "édition directe par l'administrateur" (voir [Sources de données](08-sources-donnees.md)) et "cellule-formule ciblée" restent des avertissements côté UI, pas des contraintes techniques supplémentaires.

## Dépendances
- [03 — Droits et groupes](03-droits-groupes.md) : accès via la page.
- [05 — Profil utilisateur](05-profil-utilisateur.md) : lien vers "mes soumissions".
- [06 — Page builder](06-page-builder.md) : le formulaire est un module de page ; les lignes ajoutées doivent rester visibles dans les tableaux (voir [Plage des tableaux et formulaires d'ajout](06-page-builder.md#plage-des-tableaux-et-formulaires-dajout)).
- [04 — Administration](04-administration.md#tableau-de-bord-des-soumissions) : file des soumissions en attente et journal des validations.
- [08 — Sources de données](08-sources-donnees.md) : mécanisme d'écriture.
- [10 — Modèles et duplication](10-modeles-duplication.md) : modèles de formulaires.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- Ligne d'ajout = première ligne vide de la zone d'ajout, calculée à la validation ; aucune ligne remplie n'est écrasée.
- Seules les modifications structurelles d'un formulaire invalident les soumissions en attente ; les corrections de libellé n'invalident rien.
- Un formulaire non configuré n'est pas affiché.
