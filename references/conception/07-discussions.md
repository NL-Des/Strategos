# 07 — Discussions

## Objet
Les deux moyens d'échange entre utilisateurs, intégrés aux pages comme modules : les espaces de discussion (mini-forums asynchrones) et le chat (temps réel).

## Règles fonctionnelles

### Espaces de discussion
- Un **espace de discussion** est un module placé par l'admin sur une page : un mini-forum qui contient une liste de **sujets**, chacun avec ses **messages** (pouvant contenir des images).
- C'est l'espace qui porte les droits : **lire**, **ouvrir un sujet**, **poster un message** (voir [Droits et groupes](03-droits-groupes.md#modèle-par-groupes)). Les sujets et messages en héritent : un sujet ouvert par un utilisateur est aussitôt visible par tous les lecteurs de l'espace.
- Sujets épinglés en tête de liste, puis tri par activité récente ou par date de création (réglage du module).
- **Gestion d'un sujet** : l'utilisateur qui a ouvert le sujet, ou l'administrateur, peut le **renommer** et le **clore** (plus aucun nouveau message accepté ni aucune modification des messages existants, l'historique reste lisible). Seul l'administrateur peut l'**épingler**.
- **Ses propres messages** : l'auteur peut modifier ou supprimer ses messages. Chaque version précédente et chaque suppression sont **archivées en base**, sans être visibles des autres utilisateurs. Aucun autre utilisateur ne peut modifier ou supprimer un message ; seul l'administrateur le peut (voir [Modération](#modération)).
- Le style des encadrés des discussions et de leurs messages est personnalisable (voir [Page builder](06-page-builder.md#thèmes)).

> **Exemple** : une page « Taverne » contient un espace. Le groupe « Membres » peut le lire, ouvrir des sujets et poster ; le groupe « Invités » peut seulement le lire. Kira (membre) ouvre le sujet « Recrutement » : les membres peuvent y répondre, et les invités le lisent sans pouvoir répondre.

### Chat
- Messagerie interne simple, sans intégration IA (anciennement « Chatbot »).
- Il s'agit d'un **chat en temps réel**, distinct des sujets de discussion, que l'administrateur place sur les pages de son choix.
- **Accès** : le chat n'est pas une ressource du modèle de groupes. Quiconque peut lire la page qui contient le module peut lire le chat et y écrire (même logique que les formulaires).
- **Historique** : les messages sont **conservés en base** ; en arrivant sur la page, l'utilisateur voit l'historique.
- **Ses propres messages** : même règle que dans les sujets, avec modification et suppression par l'auteur et archivage.

### Modération
L'administrateur peut **masquer** n'importe quel message, dans les sujets comme dans le chat, puis le **rétablir**. Le message masqué disparaît pour les utilisateurs, reste archivé en base, et l'action est tracée dans le [journal](04-administration.md#journal-des-modifications). L'administrateur peut aussi **modifier ou supprimer** le message d'un autre : l'ancienne version est archivée comme pour l'auteur, et l'action est tracée au journal (`message.admin_edit`, `message.admin_delete`). Il peut enfin supprimer un sujet entier (restaurable depuis la corbeille).

## Points techniques
- **DiscussionsModule** : espaces de discussion, sujets et messages, pièces jointes images. Tables `discussion_spaces`, `topics`, `topic_messages`, `message_revisions`, `attachments` ([14](14-modele-donnees.md#6-discussions)). Les droits sont vérifiés sur `space_id` par `SpaceAccessService`, qui passe par la règle unique `RightsService`.
- **Chat** : passerelle **WebSocket NestJS**, authentifiée par le cookie de session. À la connexion au canal d'un module chat, elle vérifie le droit de lecture sur la page qui le contient. Tables `chats` et `chat_messages`.
- Historique des messages (sujets et chat) : table `message_revisions` (action `edit`, `delete`, `hide` ou `unhide`, contenu précédent, acteur). Une ligne est écrite avant chaque modification, suppression ou masquage, dans la même transaction.
- Masquage : `hidden_at` sur les messages, et une route réservée au rôle admin. Dans le chat, le masquage est diffusé en `chat.message.hidden`, le rétablissement en `chat.message.updated`.
- **Pièces jointes** : images uniquement (JPEG, PNG, WebP, GIF), 5 Mo au maximum chacune, 4 par message au plus. Elles sont accessibles à qui peut lire l'espace de discussion ; tant qu'une image n'est pas rattachée à un message, seul celui qui l'a envoyée peut la lire.
- Espaces et chats sont créés à la **publication** de la page qui contient leur bloc (voir [Page builder](06-page-builder.md#brouillon-et-publication)) ; leurs réglages (nom, tri, hauteur) suivent le brouillon.

## Dépendances
- [03 — Droits et groupes](03-droits-groupes.md) : droits sur les espaces de discussion, accès au chat via la page.
- [04 — Administration](04-administration.md) : journal de modération.
- [06 — Page builder](06-page-builder.md) : intégration en tant que modules.
- [10 — Modèles et duplication](10-modeles-duplication.md) : modèles de sujets.
- [11 — Transverse](11-transverse.md) : suppression douce, stockage des images, WebSockets.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- Chat : temps réel, distinct des sujets, accessible via la lecture de la page, avec un historique conservé en base.
- Espace de discussion : conteneur de sujets qui porte les droits (lire, ouvrir un sujet, poster) ; sujets et messages en héritent.
- Messages : l'auteur modifie ou supprime les siens, avec archivage ; il ne peut rien faire sur ceux des autres.
- Sujets : renommer et clore par l'auteur ou l'admin ; épingler par l'admin seul.
- Modération : l'admin masque n'importe quel message ; le message reste archivé et l'action est tracée.

**Décision (2026-09-29)**
- L'admin peut modifier ou supprimer le message d'un autre, avec archivage et trace au journal ; le masquage reste la modération courante.
