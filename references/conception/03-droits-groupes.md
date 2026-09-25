# 03 — Droits et groupes

## Objet
Le modèle d'autorisation de Strategos : des groupes porteurs de permissions, des utilisateurs membres de groupes, et une règle unique de calcul des droits effectifs.

## Règles fonctionnelles

### Modèle par groupes
- L'administrateur crée des **groupes**.
- Chaque groupe reçoit des droits sur des ressources : sujets, messages, pages. Les droits accordables dépendent de la ressource :

  | Ressource | Lecture | Écriture | Création |
  |---|---|---|---|
  | Page | ✔ | — (admin seul) | — (admin seul) |
  | Sujet | ✔ | ✔ | ✔ |
  | Message | ✔ | — | ✔ (poster) |

  - **Pages** : les pages restent entièrement construites et modifiées par l'administrateur via le page builder, jamais par les utilisateurs. Donner un droit d'écriture aux utilisateurs sera réévalué après les premiers tests.
  - **Messages** : l'auteur d'un message peut toujours **modifier ou supprimer ses propres messages**, sans droit particulier. Il ne peut agir sur les messages des autres en aucun cas. Chaque version précédente et chaque suppression sont archivées en base (voir [Discussions](07-discussions.md#sujets-de-discussion-et-messages)).
- Un utilisateur peut appartenir à plusieurs groupes ; ses droits effectifs sont l'union des permissions de ses groupes.
- Ce modèle permet à la fois des **espaces communs** (groupe partagé par plusieurs utilisateurs) et des **espaces privés** (groupe restreint à un seul utilisateur, ou groupe personnel). En v1, un espace privé reste une page dupliquée et paramétrée manuellement par l'administrateur (plage de cellules fixée à la main pour chaque utilisateur) — pas de mécanisme de page modèle générant automatiquement une plage par utilisateur.
- L'administrateur crée les profils utilisateurs et les assigne aux groupes (voir [Administration](04-administration.md)).
- **Conflits entre groupes** : union simple des permissions — dès qu'un des groupes d'un utilisateur autorise un droit sur une ressource, l'utilisateur l'a (pas de notion de refus explicite qui prime).
- **Formulaires (modification et ajout)** : ils ne constituent pas une ressource à part dans le modèle de droits — un formulaire est accessible à quiconque a le droit de lecture sur la page qui le contient ; c'est cet accès à la page qui conditionne la possibilité de soumettre. Cette règle s'applique identiquement aux formulaires de modification et aux formulaires d'ajout.

### Gestion des groupes
Depuis l'espace d'administration :
- Création, renommage, description, suppression (soft-delete).
- Ajout / retrait de membres, aussi bien depuis la fiche du groupe que depuis la fiche d'un utilisateur.
- Définition des permissions lecture / écriture / création par ressource (voir [Modèle par groupes](#modèle-par-groupes)).

### Visibilité et page d'arrivée
- **Page sans permission** : une page qu'aucun groupe ne peut lire n'est visible que par l'administrateur.
- **Module non autorisé** : si un utilisateur peut lire une page mais pas un sujet qu'elle contient, le module de ce sujet est **invisible** pour lui. Il n'y a ni emplacement vide ni message « accès refusé ».
- **Page d'arrivée** : l'administrateur choisit une **page d'arrivée globale unique**, affichée à tous les utilisateurs après la connexion (voir [Vision](01-vision.md#environnement-construit-par-ladministrateur)).

## Points techniques
- **GroupsModule** : groupes, appartenance user↔groupe, calcul des permissions effectives (union des groupes) et endpoints de lecture des droits pour l'admin (par utilisateur, par groupe, par ressource, matrice globale).
- **PermissionsModule** : `PermissionsGuard` réutilisable sur chaque route, vérifie lecture/écriture/création par ressource (page, sujet, message). Jamais de vérification uniquement côté frontend.
- Contraintes sur `group_permissions` : pour `resource_type = page`, seul `can_read` peut être vrai ; pour `resource_type = message`, seuls `can_read` et `can_create` peuvent l'être. Ces contraintes sont vérifiées par la validation du DTO et par une contrainte `CHECK` en base.
- La modification ou suppression d'un message est contrôlée par propriété (`author_id` = utilisateur de la session), pas par `PermissionsGuard`.
- Les modules non autorisés sont filtrés **côté backend** au moment d'assembler la page : leur config n'est jamais envoyée au frontend.

### Calcul des droits effectifs
Une **seule fonction de résolution** dans GroupsModule calcule les droits effectifs d'un utilisateur sur une ressource, en retournant pour chaque droit (lecture/écriture/création) la liste des groupes qui l'accordent. Elle est utilisée **à la fois** par `PermissionsGuard` et par les vues d'administration : ce que l'admin voit est exactement ce qui est appliqué. La matrice globale est calculée côté backend, avec pagination et filtres (échelle : quelques centaines d'utilisateurs).

## Dépendances
- [04 — Administration](04-administration.md) : visualisation des droits, journal.
- [05 — Profil utilisateur](05-profil-utilisateur.md) : réutilise la fonction de résolution ; le profil est hors modèle de groupes.
- [06 — Page builder](06-page-builder.md), [07 — Discussions](07-discussions.md) : ressources protégées.
- [10 — Modèles et duplication](10-modeles-duplication.md) : duplication de pages pour les espaces privés.

## Questions ouvertes
- `group_permissions.resource_id` est nullable : cela veut-il dire un droit sur *toutes* les ressources de ce type ? À préciser.
- Sens du droit d'écriture sur un **sujet** (renommer ? clore ? modérer ?) : à préciser avec [Discussions](07-discussions.md).

**Décisions (2026-09-25)**
- Pages : lecture seule pour les groupes ; écriture réservée à l'admin en v1.
- Messages : lecture et création seulement ; l'auteur modifie ou supprime ses propres messages, avec archivage.
- Module non autorisé : invisible.
- Page sans permission : visible par l'admin seul. Une page d'arrivée globale unique.
