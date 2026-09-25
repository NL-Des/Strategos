# 05 — Profil utilisateur

## Objet
L'espace privé de chaque utilisateur : sa situation administrative (en lecture seule) et ses notes personnelles.

## Règles fonctionnelles
Chaque utilisateur dispose d'un **profil privé**, accessible par lui seul et par l'administrateur — jamais par les autres utilisateurs. Le profil est hors du modèle de droits par groupes : aucun groupe ne peut donner accès au profil d'un autre. Ses deux pages sont fixes, **hors page builder** (pas de zones ni de modules personnalisables).

- **Page administrative** (lecture seule, sauf le changement de mot de passe) :
  - Pseudo, date de création du compte, statut du compte.
  - Groupes d'appartenance et droits effectifs, avec le ou les groupes qui accordent chaque droit (même calcul que la vue "par utilisateur" de l'admin, voir [Administration](04-administration.md#visualisation-des-droits)).
  - Lien vers la page "mes soumissions" (voir [Formulaires et soumissions](09-formulaires-soumissions.md)).
  - Seul le mot de passe y est modifiable, en saisissant l'ancien (voir [Comptes et authentification](02-comptes-authentification.md#mot-de-passe-utilisateur)). Tout le reste est en lecture seule.
- **Page de notes** :
  - Liste de notes personnelles, chacune avec un titre et un texte mis en forme simplement (gras, italique, listes, liens).
  - L'utilisateur crée, modifie et supprime ses notes (soft-delete, voir [Suppression de contenu](11-transverse.md#suppression-de-contenu)).
  - Pas d'images, pas de partage entre utilisateurs.
- **Accès de l'administrateur** : lecture seule des notes, depuis la fiche de l'utilisateur ; il ne peut ni les modifier ni les supprimer. Chaque consultation est tracée dans le journal des modifications. Une mention permanente sur la page de notes indique à l'utilisateur qu'elles sont visibles par l'administrateur.

## Points techniques
- **ProfileModule** : page administrative du profil (agrège UsersModule et la fonction de résolution des droits de GroupsModule, réutilisée telle quelle) et CRUD des notes personnelles.
- Accès vérifié par propriété (`user_id` = utilisateur de la session) ou rôle admin, jamais via `PermissionsGuard` ni les groupes. Côté admin, routes de notes en lecture seule (GET uniquement) ; chaque lecture écrit une entrée `audit_log` (action `notes.read`).
- Contenu des notes nettoyé côté backend (liste blanche de balises) contre le XSS.

## Dépendances
- [02 — Comptes et authentification](02-comptes-authentification.md) : changement de mot de passe par l'utilisateur, réinitialisation par l'admin.
- [03 — Droits et groupes](03-droits-groupes.md) : fonction de résolution des droits.
- [04 — Administration](04-administration.md) : journal des consultations de notes.
- [09 — Formulaires et soumissions](09-formulaires-soumissions.md) : page "mes soumissions".

## Questions ouvertes
_À compléter lors de la revue de cohérence._

**Décisions (2026-09-25)**
- Le mot de passe est modifiable depuis la page administrative du profil.
