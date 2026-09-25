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

### Tableau de bord des soumissions
Sans notifications (voir [Transverse](11-transverse.md#notifications)), l'espace admin rend les soumissions en attente impossibles à manquer :
- un **compteur** des soumissions en attente, visible en permanence dans l'espace admin ;
- une **file** triable et filtrable par formulaire, page, utilisateur et date ;
- les **conflits** mis en évidence, c'est-à-dire plusieurs soumissions en attente sur une même cellule (voir [Formulaires et soumissions](09-formulaires-soumissions.md#soumissions)).

### Corbeille
Les éléments supprimés en douceur (pages, formulaires, sujets, messages, groupes, utilisateurs) sont listés dans une corbeille, filtrable par type, d'où l'administrateur peut les **restaurer** (voir [Suppression de contenu](11-transverse.md#suppression-de-contenu)).

### Journal des modifications
Sont tracées (action, cible, état avant/après, date) :
- les actions sur les comptes, les appartenances aux groupes et les permissions ;
- la **validation, le refus et la modification des soumissions**, avec la valeur réellement écrite, la cellule et la source ;
- le réimport ou la resynchronisation d'une source ;
- les modifications de pages et de formulaires ;
- la réinitialisation du compte admin par commande serveur ;
- les restaurations depuis la corbeille ;
- les consultations des notes personnelles (voir [Profil utilisateur](05-profil-utilisateur.md)).

Le journal est consultable et filtrable par l'administrateur, et non modifiable. Pas de purge automatique définie pour l'instant (point à retravailler plus tard, comme le backup).

## Points techniques
- **AuditModule** : écriture et consultation du journal des modifications ; appelé par UsersModule, GroupsModule, ProfileModule, PagesModule, ExcelSyncModule et TemplatesModule. PermissionsModule ne fait que vérifier les droits et n'écrit rien.
- Les vues de droits s'appuient sur la fonction de résolution unique (voir [Calcul des droits effectifs](03-droits-groupes.md#calcul-des-droits-effectifs)).
- Routes d'administration (comptes, groupes, droits, journal) protégées par un guard de rôle admin.
- Chaque entrée du journal d'audit est écrite dans la **même transaction** que la modification qu'elle trace ; aucune route de modification ou de suppression du journal n'est exposée.

## Dépendances
- [02 — Comptes et authentification](02-comptes-authentification.md), [03 — Droits et groupes](03-droits-groupes.md) : objets administrés.
- [05 — Profil utilisateur](05-profil-utilisateur.md) : consultation des notes tracée dans le journal.
- [11 — Transverse](11-transverse.md) : backup, purge.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- Journal étendu aux soumissions, aux sources, aux pages, aux formulaires et aux restaurations.
- Corbeille avec restauration.
- Tableau de bord des soumissions en attente, avec mise en évidence des conflits.
