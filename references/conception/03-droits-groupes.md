# 03 — Droits et groupes

## Objet
Le modèle d'autorisation de Strategos : des groupes porteurs de permissions, des utilisateurs membres de groupes, et une règle unique de calcul des droits effectifs.

## Règles fonctionnelles

### Modèle par groupes
- L'administrateur crée des **groupes**.
- Chaque groupe reçoit des droits sur deux types de ressources, les **pages** et les **espaces de discussion**. Les droits de **création** accordables dépendent de la ressource :

  | Ressource | Lecture | Ouvrir un sujet | Poster un message |
  |---|---|---|---|
  | Page | ✔ | — | — |
  | Espace de discussion | ✔ | ✔ | ✔ |

  - **Espaces de discussion** : les sujets et messages d'un espace **héritent** de ses droits. Un sujet ouvert par un utilisateur est donc immédiatement lisible par tous ceux qui peuvent lire l'espace. Un groupe peut lire un espace sans pouvoir y poster (ex. un espace « Annonces »).
  - **Pas de droit d'écriture** : modifier un contenu ne dépend jamais d'un groupe, mais de la **propriété** (l'auteur) ou du **rôle administrateur**.
  - **Pages** : les pages restent entièrement construites et modifiées par l'administrateur via le page builder, jamais par les utilisateurs. Donner un droit d'écriture aux utilisateurs sera réévalué après les premiers tests.
  - **Sujets** : l'auteur du sujet ou l'admin peut le renommer et le clore ; seul l'admin peut l'épingler (voir [Discussions](07-discussions.md#espaces-de-discussion)).
  - **Messages** : l'auteur d'un message peut toujours **modifier ou supprimer ses propres messages**, sans droit particulier. Il ne peut agir sur les messages des autres en aucun cas. Chaque version précédente et chaque suppression sont archivées en base. Seul l'admin peut masquer le message d'un autre (modération, voir [Discussions](07-discussions.md#modération)).
  - **Chat** : ce n'est pas une ressource du modèle ; il est accessible à quiconque peut lire la page qui le contient (voir [Discussions](07-discussions.md#chat)).
- Un utilisateur peut appartenir à plusieurs groupes ; ses droits effectifs sont l'union des permissions de ses groupes.
- Ce modèle permet à la fois des **espaces communs** (groupe partagé par plusieurs utilisateurs) et des **espaces privés** (groupe restreint à un seul utilisateur, ou groupe personnel). En v1, un espace privé reste une page dupliquée et paramétrée manuellement par l'administrateur (plage de cellules fixée à la main pour chaque utilisateur) — pas de mécanisme de page modèle générant automatiquement une plage par utilisateur.
- L'administrateur crée les profils utilisateurs et les assigne aux groupes (voir [Administration](04-administration.md)).
- **Conflits entre groupes** : union simple des permissions — dès qu'un des groupes d'un utilisateur autorise un droit sur une ressource, l'utilisateur l'a (pas de notion de refus explicite qui prime).
- **Formulaires (modification, ligne et ajout)** : ils ne constituent pas une ressource à part dans le modèle de droits — un formulaire est accessible à quiconque a le droit de lecture sur la page qui le contient ; c'est cet accès à la page qui conditionne la possibilité de soumettre. Cette règle s'applique identiquement aux trois types de formulaires.

### Gestion des groupes
Depuis l'espace d'administration :
- Création, renommage, description, suppression (soft-delete).
- Ajout / retrait de membres, aussi bien depuis la fiche du groupe que depuis la fiche d'un utilisateur.
- Définition des permissions par ressource : lecture pour les pages ; lecture, ouverture de sujets et publication pour les espaces de discussion (voir [Modèle par groupes](#modèle-par-groupes)).

### Visibilité et page d'arrivée
- **Permissions toujours ciblées** : chaque permission porte sur une ressource précise ; aucune permission ne vaut pour « toutes les pages » ou « tous les espaces ». Pour que tout le monde voie les parties communes, l'admin attribue aux utilisateurs un groupe ordinaire (par convention « Partie commune ») qui a les droits sur ces pages.
- **Utilisateur sans groupe** : il n'a accès à rien. S'il ne peut pas lire la page d'arrivée, il voit un écran neutre « Aucun espace ne vous est encore attribué ».
- **Page sans permission** : une page qu'aucun groupe ne peut lire n'est visible que par l'administrateur.
- **Module non autorisé** : si un utilisateur peut lire une page mais pas un espace de discussion qu'elle contient, le module de cet espace est **invisible** pour lui. Il n'y a ni emplacement vide ni message « accès refusé ».
- **Liens** : un bouton, une image-lien ou une zone de carte qui mène vers une page illisible est masqué (voir [Page builder](06-page-builder.md#liens-vers-des-pages-non-autorisées)).
- **Page personnelle** : l'admin peut désigner, sur la fiche d'un utilisateur, sa **page personnelle** (ex. son espace privé). Un lien peut viser « Ma page personnelle » : il mène chacun à la sienne (voir [Page builder](06-page-builder.md#liens-vers-des-pages-non-autorisées)). L'admin doit tout de même donner à l'utilisateur le droit de lecture sur cette page.
- **Page d'arrivée** : l'administrateur choisit une **page d'arrivée globale unique**, affichée à tous les utilisateurs après la connexion (voir [Vision](01-vision.md#environnement-construit-par-ladministrateur)).

## Points techniques
- **GroupsModule** : groupes, appartenance user↔groupe, calcul des permissions effectives (union des groupes) et endpoints de lecture des droits pour l'admin (par utilisateur, par groupe, par ressource, matrice globale).
- **PermissionsModule** : `PermissionsGuard` réutilisable sur chaque route, vérifie les droits par ressource (page, espace de discussion). Jamais de vérification uniquement côté frontend.
- Table `group_permissions` ([14](14-modele-donnees.md#group_permissions)) : cible **obligatoire**, soit une page (`page_id`), soit un espace (`space_id`) ; droits `can_read`, `can_create_topic`, `can_post` ; pas de droit d'écriture. Pour `resource_type = page`, seul `can_read` peut être vrai. Cette contrainte est vérifiée par la validation du DTO et par une contrainte `CHECK` en base.
- Les modifications (message, sujet) sont contrôlées par propriété (`author_id` = utilisateur de la session) ou par le rôle admin, jamais par `PermissionsGuard`.
- Les modules non autorisés sont filtrés **côté backend** au moment d'assembler la page : leur config n'est jamais envoyée au frontend.

### Calcul des droits effectifs
Une **seule fonction de résolution** dans GroupsModule calcule les droits effectifs d'un utilisateur sur une ressource, en retournant pour chaque droit (lecture, ouverture de sujet, publication) la liste des groupes qui l'accordent. Elle est utilisée **à la fois** par `PermissionsGuard` et par les vues d'administration : ce que l'admin voit est exactement ce qui est appliqué. La matrice globale est calculée côté backend, avec pagination et filtres (échelle : quelques centaines d'utilisateurs).

## Dépendances
- [04 — Administration](04-administration.md) : visualisation des droits, journal.
- [05 — Profil utilisateur](05-profil-utilisateur.md) : réutilise la fonction de résolution ; le profil est hors modèle de groupes.
- [06 — Page builder](06-page-builder.md), [07 — Discussions](07-discussions.md) : ressources protégées.
- [10 — Modèles et duplication](10-modeles-duplication.md) : duplication de pages pour les espaces privés.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- Pages : lecture seule pour les groupes ; écriture réservée à l'admin en v1.
- Messages : lecture et création seulement ; l'auteur modifie ou supprime ses propres messages, avec archivage.
- Module non autorisé : invisible.
- Page sans permission : visible par l'admin seul. Une page d'arrivée globale unique.
- Pas de permission « sur tout » : les parties communes passent par un groupe ordinaire. Un utilisateur sans groupe n'a accès à rien.
- Le droit d'écriture est supprimé du modèle : il ne reste que la lecture et la création. Toute modification relève de l'auteur ou de l'admin.
- Chat : hors modèle de groupes, accessible via le droit de lecture sur la page.
- Les ressources « sujet » et « message » sont remplacées par l'**espace de discussion**, qui porte trois droits (lire, ouvrir un sujet, poster) ; sujets et messages en héritent.
- Liens vers des pages illisibles : masqués.
