# 10 — Modèles et duplication

## Objet
Éviter à l'administrateur de reconstruire formulaires, pages et sujets de discussion à chaque fois, grâce à une bibliothèque de modèles réutilisables.

## Règles fonctionnelles
Pour éviter à l'administrateur de reconstruire formulaires, pages et sujets de discussion à chaque fois, il peut les enregistrer comme **modèles nommés** et les réutiliser :
- **Ressources concernées** : formulaires de modification, pages entières, sujets de discussion. (Les groupes n'entrent pas dans ce mécanisme.)
- **Bibliothèque de modèles** : l'administrateur peut sauvegarder une réalisation existante comme modèle nommé, puis l'instancier autant de fois que nécessaire depuis une bibliothèque dédiée.
- **Instanciation d'un modèle de formulaire** : la copie garde les champs, labels et types du modèle, mais son mapping champ→cellule est réinitialisé — l'administrateur choisit la cellule cible pour chaque nouvelle instance. Évite que deux formulaires distincts écrivent silencieusement sur la même cellule. Pour un modèle de formulaire d'ajout, la réinitialisation porte aussi sur la ligne de départ, les colonnes autorisées et le nombre max de nouvelles lignes — l'administrateur doit les redéfinir à chaque nouvelle instance.
- **Instanciation d'un modèle de page** : la nouvelle page est une copie complète et indépendante — tous ses modules internes (dont les formulaires et tableaux) sont eux aussi dupliqués, avec leurs mappings de cellule réinitialisés le cas échéant. Utile notamment pour créer rapidement une page privée par utilisateur (voir [Droits et groupes](03-droits-groupes.md#modèle-par-groupes)).
- **Instanciation d'un modèle de sujet** : seule la structure de départ est reprise (titre type, message d'ouverture éventuel) — pas les messages déjà postés sur les sujets précédemment créés à partir de ce modèle.

## Points techniques
- **TemplatesModule** : bibliothèque de modèles (formulaires, pages, sujets) et instanciation avec réinitialisation des mappings.

## Dépendances
- [06 — Page builder](06-page-builder.md), [07 — Discussions](07-discussions.md), [09 — Formulaires et soumissions](09-formulaires-soumissions.md) : ressources modélisables.
- [03 — Droits et groupes](03-droits-groupes.md) : espaces privés.

## Questions ouvertes
_À compléter lors de la revue de cohérence._
