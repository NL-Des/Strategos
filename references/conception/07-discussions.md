# 07 — Discussions

## Objet
Les deux moyens d'échange entre utilisateurs, intégrés aux pages comme modules : les sujets de discussion (asynchrones) et le chat (temps réel).

## Règles fonctionnelles

### Sujets de discussion et messages
- Sujets de discussion / messages (pouvant contenir des images).
- Ressources soumises au modèle de droits : lecture et création (ouvrir un sujet, poster un message), voir [Droits et groupes](03-droits-groupes.md#modèle-par-groupes).
- **Gestion d'un sujet** : l'utilisateur qui a ouvert le sujet, ou l'administrateur, peut le **renommer** et le **clore** (plus aucun nouveau message accepté, l'historique reste lisible). Seul l'administrateur peut l'**épingler**.
- **Ses propres messages** : l'auteur peut modifier ou supprimer ses messages. Chaque version précédente et chaque suppression sont **archivées en base**, sans être visibles des autres utilisateurs. Aucun autre utilisateur ne peut modifier ou supprimer un message.
- Le style des encadrés des discussions et de leurs messages est personnalisable (voir [Page builder](06-page-builder.md#options-de-personnalisation-des-zones)).

### Chat
- Chatbot (messagerie interne simple, sans intégration IA).
- Il s'agit d'un **chat en temps réel**, distinct des sujets de discussion, que l'administrateur place sur les pages de son choix.
- **Accès** : le chat n'est pas une ressource du modèle de groupes. Quiconque peut lire la page qui contient le module peut lire le chat et y écrire (même logique que les formulaires).
- **Historique** : les messages sont **conservés en base** ; en arrivant sur la page, l'utilisateur voit l'historique.
- **Ses propres messages** : même règle que dans les sujets, avec modification et suppression par l'auteur et archivage.

### Modération
L'administrateur peut **masquer** n'importe quel message, dans les sujets comme dans le chat. Le message masqué disparaît pour les utilisateurs, reste archivé en base, et l'action est tracée dans le [journal](04-administration.md#journal-des-modifications).

## Points techniques
- **TopicsModule** : sujets et messages, pièces jointes images ; colonnes `topics.author_id`, `topics.closed_at` et `topics.pinned_at`.
- **Chat** : passerelle **WebSocket NestJS**, authentifiée par le cookie de session. À la connexion au canal d'un module chat, elle vérifie le droit de lecture sur la page qui le contient. Table `chat_messages(id, page_block_id, author_id, content, created_at, hidden_at, deleted_at)`.
- Historique des messages (sujets et chat) : table `message_revisions(message_id, message_kind[topic|chat], content, edited_at, action[edit|delete|hide])`. Une ligne est écrite avant chaque modification, suppression ou masquage, dans la même transaction.
- Masquage : `hidden_at` sur les messages, et une route réservée au rôle admin.

## Dépendances
- [03 — Droits et groupes](03-droits-groupes.md) : droits sur sujets et messages, accès au chat via la page.
- [04 — Administration](04-administration.md) : journal de modération.
- [06 — Page builder](06-page-builder.md) : intégration en tant que modules.
- [10 — Modèles et duplication](10-modeles-duplication.md) : modèles de sujets.
- [11 — Transverse](11-transverse.md) : suppression douce, stockage des images, WebSockets.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- Chat : temps réel, distinct des sujets, accessible via la lecture de la page, avec un historique conservé en base.
- Messages : l'auteur modifie ou supprime les siens, avec archivage ; il ne peut rien faire sur ceux des autres.
- Sujets : renommer et clore par l'auteur ou l'admin ; épingler par l'admin seul.
- Modération : l'admin masque n'importe quel message ; le message reste archivé et l'action est tracée.
