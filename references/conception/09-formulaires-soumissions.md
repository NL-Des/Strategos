# 09 — Formulaires et soumissions

## Objet
L'unique voie d'écriture des utilisateurs vers les documents : des formulaires définis par l'administrateur, dont chaque soumission est une proposition à valider (voir [Vision](01-vision.md#principe-fondateur--aucun-accès-direct-aux-documents)).

## Règles fonctionnelles

### Formulaires
- Module du page builder : formulaire de modification, de ligne ou d'ajout de l'excel ou du google sheet (modification : l'administrateur relie un champ à une case existante du document ; ligne : chaque champ correspond à une colonne de la ligne choisie par l'utilisateur ; ajout : l'administrateur définit une ligne de départ, des colonnes autorisées et un nombre max de nouvelles lignes).
- L'accès à un formulaire découle du droit de lecture sur la page qui le contient (voir [Droits et groupes](03-droits-groupes.md#modèle-par-groupes)).
- **Formulaires de modification** : l'administrateur définit des formulaires (champs texte, menus de sélection...) dont chaque champ est mappé à exactement une cellule (un champ = une cellule, jamais plusieurs cellules pour un même champ). Une soumission utilisateur reste en attente jusqu'à validation par l'administrateur, qui applique alors la modification réelle au fichier/sheet. Il pourra accepter, refuser ou modifier la soumission.
- **Trois types de formulaires** :
  - **Formulaire de modification** : un champ = une cellule déjà existante (voir ci-dessus).
  - **Formulaire de ligne** : pour modifier **une ligne parmi beaucoup** (ex. un produit parmi 200) sans créer un formulaire par ligne :
    - l'admin choisit la source, la feuille, la plage de lignes concernée et une **colonne clé** qui identifie chaque ligne de façon unique (ex. « Référence ») ;
    - chaque champ est mappé à une **colonne** (un champ = une colonne) ;
    - le formulaire est relié à un **Tableau** ou à un **Catalogue** de la même source : chaque ligne ou carte affiche un bouton « **Proposer une modification** », qui ouvre le formulaire **pré-rempli** avec les valeurs actuelles de cette ligne ([Page builder](06-page-builder.md#tableau)) ;
    - la soumission retient la **valeur de la clé**, pas le numéro de ligne. À la validation, la ligne est retrouvée par sa clé : si l'admin a inséré ou trié des lignes entre-temps, c'est quand même la bonne ligne qui est modifiée. Si la clé est introuvable ou en double, la validation est bloquée avec une erreur explicite.
  - **Formulaire d'ajout** : permet à l'utilisateur de proposer une **nouvelle ligne**, dans un cadre entièrement défini par l'admin à la création du formulaire :
    - **Ligne de départ** : l'admin choisit la ligne/cellule à partir de laquelle les nouvelles lignes peuvent être ajoutées (par ex. juste après la dernière ligne existante, ou une ligne précise si de la place a été laissée).
    - **Colonnes autorisées** : chaque champ du formulaire est mappé à une colonne (et non plus à une cellule fixe) dans la plage définie par l'admin — un champ = une colonne, jamais plusieurs colonnes pour un même champ (miroir de la règle "un champ = une cellule" ci-dessus).
    - **Nombre maximum de nouvelles lignes** : l'admin fixe une limite totale de lignes que ce formulaire peut créer ; une fois la limite atteinte, le formulaire n'accepte plus de nouvelles soumissions (affiché comme complet/fermé côté utilisateur).
    - La ligne de départ et le nombre maximum définissent la **zone d'ajout** du formulaire (ex. lignes 12 à 31 pour un départ en 12 et 20 lignes au maximum).
  - La **ligne réellement attribuée** à une soumission "ajout" n'est déterminée qu'**à la validation** (pas à la soumission) : c'est la **première ligne vide** de la zone d'ajout au moment de la validation (une ligne est vide si toutes les colonnes mappées sont vides). Une ligne remplie entre-temps à la main par l'admin, directement dans le document, n'est donc jamais écrasée — cohérent avec la gestion des soumissions concurrentes ci-dessous, où plusieurs soumissions "ajout" en attente ne se réservent pas de ligne tant qu'elles ne sont pas validées. Le formulaire est **complet** quand la zone d'ajout ne contient plus de ligne vide. Si c'est le cas alors que des soumissions sont encore en attente, l'admin peut toujours les refuser, mais ne peut plus les valider (message d'erreur explicite) — évite de dépasser silencieusement la limite.
- **Types de champs et validation** :
  - types : texte court, texte long, nombre, date, case à cocher, **liste déroulante** ;
  - règles : obligatoire ou non, longueur maximale, minimum et maximum pour les nombres et les dates ;
  - les **options d'une liste déroulante** sont soit saisies par l'admin, soit **lues dans une plage** du document (ex. la liste des classes dans une feuille « Référentiels ») ;
  - **champs automatiques**, remplis par Strategos et non modifiables par l'utilisateur : **pseudo** de l'auteur, **date** de soumission. Ils empêchent par exemple d'inscrire quelqu'un d'autre que soi à un tournoi ;
  - **champ « mouvement »** (nombres seulement) : l'utilisateur saisit une **quantité à ajouter ou à retirer** (ex. −3) au lieu d'une valeur finale. À la validation, Strategos lit la valeur actuelle de la cellule et lui applique le mouvement : le résultat est juste quel que soit l'ordre des validations. Le journal garde la valeur avant et après.

> **Exemple** : 8 cartons en stock. Julie retire 3, Paul retire 1. Avec des valeurs absolues, ils auraient proposé 5 et 7, et le résultat dépendrait de l'ordre de validation. Avec des mouvements (−3 et −1), le stock final vaut 4, dans tous les cas.

- **Ouverture et fermeture** : l'admin peut **fermer** ou rouvrir un formulaire à tout moment, et lui fixer une **date limite** facultative. Un formulaire fermé reste affiché avec la mention « fermé ». Les soumissions déjà en attente restent validables.
- **Validation automatique** : l'admin peut l'activer **formulaire par formulaire**. Les soumissions sont alors écrites directement, sans passer par l'admin. Elles restent visibles dans « mes soumissions » (statut « validée ») et sont tracées dans le journal. Par défaut, la validation reste manuelle. En cas d'échec d'écriture (source indisponible, zone d'ajout pleine, clé introuvable), la soumission repasse **en attente** et apparaît dans le tableau de bord de l'admin.
- **Cellule-formule ciblée** : l'administrateur peut mapper un champ de formulaire à une cellule contenant une formule ou une liaison vers un autre fichier ; valider une soumission dessus écrase la formule par une valeur brute. Ce n'est pas interdit, mais un avertissement explicite est affiché à l'admin à la création du formulaire et à la validation de chaque soumission le concernant. En validation automatique, il n'y a pas de validation manuelle : l'avertissement n'est donc affiché qu'à la configuration, au moment d'activer l'option.

### Soumissions
- **Soumissions concurrentes** : si plusieurs utilisateurs soumettent des modifications sur la même cellule, toutes restent visibles en attente — l'administrateur voit le conflit et choisit, laquelle valider (ou les fusionne manuellement). Pour un formulaire de ligne, la cellule est identifiée par la clé et la colonne. Les champs « mouvement » ne sont **jamais en conflit**, puisqu'ils s'additionnent.
- **Suivi des soumissions** : l'utilisateur dispose d'une page "mes soumissions" listant ses propositions et leur statut (en attente, validée, refusée, modifiée par l'admin, invalidée par un changement du formulaire). Pas de notification active (email, push...) — l'information est consultable, pas poussée.
- **Formulaire modifié ou supprimé** : si l'administrateur change le mapping champ→cellule d'un formulaire ou le supprime alors que des soumissions sont encore en attente dessus, ces soumissions sont automatiquement invalidées ; l'utilisateur devra resoumettre via la nouvelle version du formulaire. Précisément :
  - **invalident** les soumissions en attente : changer la cellule ou la colonne d'un champ, ajouter ou retirer un champ, changer le type d'un champ ou son caractère « mouvement », changer la ligne de départ, le nombre maximum de lignes ou la colonne clé, supprimer le formulaire ;
  - **n'invalident pas** : corriger un libellé, un texte d'aide ou l'ordre d'affichage des champs, fermer ou rouvrir le formulaire, changer sa date limite, activer ou désactiver la validation automatique.
- **Formulaire non configuré** : un formulaire sans mapping complet (par exemple juste après la duplication d'une page ou l'instanciation d'un modèle) n'est pas affiché aux utilisateurs tant que l'admin ne l'a pas configuré.

## Points techniques

### Validation d'une soumission `ajout`
La ligne cible n'est calculée qu'à ce moment-là, jamais à la soumission.
- Ligne attribuée = première ligne de `[start_row, start_row + max_new_rows - 1]` dont toutes les colonnes mappées sont vides, lue depuis la source (cache invalidé juste avant pour une source connectée, staging pour un upload).
- Si aucune ligne n'est vide, la validation est bloquée avec une erreur explicite côté admin (la soumission reste `pending`, refusable mais pas validable).
- Écriture : chaque valeur de champ est écrite sur `(assigned_row, colonne mappée)`, en réutilisant le même mécanisme d'écriture que pour les formulaires de modification (voir [Sources de données](08-sources-donnees.md#points-techniques)) ; `assigned_row` est ensuite stocké sur la soumission.

### Validation d'une soumission `ligne`
- La ligne est retrouvée en cherchant la valeur de clé dans la colonne clé, sur la plage configurée (lecture depuis la source, cache invalidé, ou depuis le staging).
- 0 ou plusieurs correspondances : la validation est bloquée, et la soumission reste `pending` avec un message explicite.

### Champs « mouvement »
- À la validation : `nouvelle = valeur actuelle lue dans la source + mouvement`. Si la valeur actuelle n'est pas un nombre, la validation est bloquée.
- La soumission conserve le mouvement proposé ; l'entrée de journal conserve l'avant et l'après.

### Validation automatique
- Même chemin de code que la validation manuelle, déclenché à la soumission, avec l'utilisateur comme auteur de la soumission et le « système » comme valideur dans le journal.
- Les écritures d'une même source sont **sérialisées** (file par `source_id`) pour que deux validations simultanées ne choisissent pas la même ligne vide ni ne lisent la même valeur de départ d'un mouvement.

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
- Troisième type : formulaire de ligne, identifié par une colonne clé, lancé et pré-rempli depuis un Tableau ou un Catalogue.
- Types de champs, règles de validation, listes lues dans une plage, champs automatiques (pseudo, date), champs « mouvement ».
- Fermeture manuelle et date limite.
- Validation automatique activable par formulaire.
- Ligne d'ajout = première ligne vide de la zone d'ajout, calculée à la validation ; aucune ligne remplie n'est écrasée.
- Seules les modifications structurelles d'un formulaire invalident les soumissions en attente ; les corrections de libellé n'invalident rien.
- Un formulaire non configuré n'est pas affiché.
