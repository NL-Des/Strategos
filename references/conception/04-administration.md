# 04 — Administration

## Objet
L'espace réservé à l'administrateur pour gérer les comptes, les groupes, comprendre qui a accès à quoi, et tracer les modifications.

## Règles fonctionnelles

### Espace d'administration
L'administrateur dispose d'un **espace d'administration dédié** pour gérer les comptes, les groupes et contrôler qui a accès à quoi.
- Comptes : voir [Comptes et authentification](02-comptes-authentification.md#cycle-de-vie-des-comptes).
- Groupes et permissions : voir [Droits et groupes](03-droits-groupes.md#gestion-des-groupes).

### Visualisation des droits
Lecture seule, calculée selon la règle d'union des groupes :
- **Par utilisateur** : ses groupes et ses droits effectifs sur chaque page, sujet et messages, avec pour chaque droit **le ou les groupes qui l'accordent** — permet de comprendre d'où vient un accès.
- **Par groupe** : ses membres et les permissions qu'il déclare, ressource par ressource.
- **Par ressource** (page, sujet) : qui peut lire, écrire ou créer, et via quel groupe. Accessible aussi depuis le page builder.
- **Matrice globale** : tableau utilisateurs × ressources (cellules L / É / C), filtrable par groupe, type de ressource ou utilisateur, pour une vue d'ensemble.

### Journal des modifications
Chaque action sur les comptes, les appartenances aux groupes et les permissions est tracée (action, cible, état avant/après, date). Consultable et filtrable par l'administrateur, non modifiable. Pas de purge automatique définie pour l'instant (point à retravailler plus tard, comme le backup).

## Points techniques
- **AuditModule** : écriture et consultation du journal des modifications sur comptes, appartenances et permissions ; appelé par UsersModule, GroupsModule et PermissionsModule.
- Les vues de droits s'appuient sur la fonction de résolution unique (voir [Calcul des droits effectifs](03-droits-groupes.md#calcul-des-droits-effectifs)).
- Routes d'administration (comptes, groupes, droits, journal) protégées par un guard de rôle admin.
- Chaque entrée du journal d'audit est écrite dans la **même transaction** que la modification qu'elle trace ; aucune route de modification ou de suppression du journal n'est exposée.

## Dépendances
- [02 — Comptes et authentification](02-comptes-authentification.md), [03 — Droits et groupes](03-droits-groupes.md) : objets administrés.
- [05 — Profil utilisateur](05-profil-utilisateur.md) : consultation des notes tracée dans le journal.
- [11 — Transverse](11-transverse.md) : backup, purge.

## Questions ouvertes
_À compléter lors de la revue de cohérence._
