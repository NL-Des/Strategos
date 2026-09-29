# 10 — Modèles et duplication

## Objet
Éviter à l'administrateur de reconstruire formulaires, pages et sujets de discussion à chaque fois, grâce à une bibliothèque de modèles réutilisables.

## Règles fonctionnelles
Pour éviter à l'administrateur de reconstruire formulaires, pages et sujets de discussion à chaque fois, il peut les enregistrer comme **modèles nommés** et les réutiliser :
- **Ressources concernées** : formulaires (de modification, de ligne et d'ajout), pages entières, sujets de discussion. (Les groupes n'entrent pas dans ce mécanisme.)
- **Bibliothèque de modèles** : l'administrateur peut sauvegarder une réalisation existante comme modèle nommé, puis l'instancier autant de fois que nécessaire depuis une bibliothèque dédiée.
- **Instanciation d'un modèle de formulaire** : la copie garde les champs, labels et types du modèle, mais son mapping champ→cellule est réinitialisé — l'administrateur choisit la cellule cible pour chaque nouvelle instance. Évite que deux formulaires distincts écrivent silencieusement sur la même cellule. Pour un modèle de formulaire d'ajout, la réinitialisation porte aussi sur la ligne de départ, les colonnes autorisées et le nombre max de nouvelles lignes — l'administrateur doit les redéfinir à chaque nouvelle instance. Pour un formulaire de ligne, la source, la plage, la colonne clé et le tableau ou catalogue relié sont également réinitialisés.
- **Instanciation d'un modèle de page** : la nouvelle page est une copie complète et indépendante — tous ses modules internes (dont les formulaires et tableaux) sont eux aussi dupliqués, avec leurs mappings de cellule réinitialisés : les formulaires perdent leurs cellules et colonnes cibles, et les **tableaux, catalogues et vues de données perdent leur plage**. Ces modules restent masqués aux utilisateurs tant que l'admin ne les a pas reconfigurés. Les **espaces de discussion** et **chats** sont recréés **vides** (sans sujets ni messages) et sans permission. La copie est créée à l'état de **brouillon** : elle n'est publiée qu'à la demande de l'admin. La nouvelle page n'a aucune permission : elle n'est visible que par l'admin tant qu'il ne l'a pas attribuée à un groupe. Utile notamment pour créer rapidement une page privée par utilisateur, **dupliquée puis paramétrée à la main** par l'admin (voir [Droits et groupes](03-droits-groupes.md#modèle-par-groupes)).
- **Instanciation d'un modèle de sujet** : le sujet est créé dans l'espace de discussion choisi par l'admin ; seule la structure de départ est reprise (titre type, message d'ouverture éventuel) — pas les messages déjà postés sur les sujets précédemment créés à partir de ce modèle.

> **Exemple** : un modèle « Espace joueur » contient un tableau qui affiche la feuille d'Arkan. Instancié pour Zelia, le tableau est vide et masqué tant que l'admin n'a pas choisi la feuille de Zelia. La page de Zelia ne peut donc jamais afficher par erreur les données d'Arkan.

## Points techniques
- **TemplatesModule** : bibliothèque de modèles (formulaires, pages, sujets) et instanciation avec réinitialisation des mappings.
- **Réinitialisation à l'enregistrement** : le modèle est stocké déjà nettoyé (`templates.payload`), puis chaque instance en est une copie avec de nouveaux identifiants (blocs, rangées, formulaires).
  - Formulaire : cellules et colonnes des champs, feuille, ligne de départ et nombre maximum de lignes (ajout), plage, colonne clé et bloc relié (ligne) sont vidés. La source est gardée, sauf pour un formulaire de ligne. Une liste déroulante lue dans une plage du document devient une liste vide à remplir.
  - Page : on copie le **dernier brouillon enregistré**. Les Tableaux et Catalogues perdent leur source, leur feuille et leur plage ; ils gardent colonnes, libellés et réglages d'affichage, et restent masqués tant que les trois ne sont pas choisis. Les valeurs insérées d'un Contenu libre sont retirées, chacune remplacée par un simple repère texte (« {B2} »). Un bloc Formulaire dont le formulaire n'existe plus est retiré.
  - Sujet : titre et premier message du sujet d'origine, sans pièces jointes. L'instance est ouverte par l'administrateur.
- **Formulaire instancié** depuis un module Formulaire de l'éditeur de page : le bloc du brouillon et sa page sont donnés à l'instanciation (`pageId`, `pageBlockId`), comme à la création d'un formulaire vide.

## Dépendances
- [06 — Page builder](06-page-builder.md), [07 — Discussions](07-discussions.md), [09 — Formulaires et soumissions](09-formulaires-soumissions.md) : ressources modélisables.
- [03 — Droits et groupes](03-droits-groupes.md) : espaces privés.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- À l'instanciation d'une page, les plages des tableaux, catalogues et vues de données sont réinitialisées, comme les mappings des formulaires ; les modules non configurés sont masqués.
