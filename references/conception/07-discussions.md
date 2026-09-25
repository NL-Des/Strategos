# 07 — Discussions

## Objet
Les deux moyens d'échange entre utilisateurs, intégrés aux pages comme modules : les sujets de discussion (asynchrones) et le chat (temps réel).

## Règles fonctionnelles

### Sujets de discussion et messages
- Sujets de discussion / messages (pouvant contenir des images).
- Ressources soumises au modèle de droits : lecture, écriture et création sur les sujets ; lecture et création sur les messages (voir [Droits et groupes](03-droits-groupes.md#modèle-par-groupes)).
- **Ses propres messages** : l'auteur peut modifier ou supprimer ses messages. Chaque version précédente et chaque suppression sont **archivées en base**, sans être visibles des autres utilisateurs. Personne d'autre que l'auteur ne peut modifier ou supprimer un message.
- Le style des encadrés des discussions et de leurs messages est personnalisable (voir [Page builder](06-page-builder.md#options-de-personnalisation-des-zones)).

### Chat
- Chatbot (messagerie interne simple, sans intégration IA).
- **Décision** : il s'agit d'un **chat en temps réel**, distinct des sujets de discussion.

## Points techniques
- **TopicsModule** : sujets et messages, pièces jointes images.
- Historique des messages : table `message_revisions(message_id, content, edited_at, action[edit|delete])`. Une ligne est écrite avant chaque modification ou suppression, dans la même transaction.

## Dépendances
- [03 — Droits et groupes](03-droits-groupes.md) : droits sur sujets et messages.
- [06 — Page builder](06-page-builder.md) : intégration en tant que modules.
- [10 — Modèles et duplication](10-modeles-duplication.md) : modèles de sujets.
- [11 — Transverse](11-transverse.md) : suppression douce, stockage des images.

## Questions ouvertes
_À compléter lors de la revue de cohérence (lot 07)._

**Décisions (2026-09-25)**
- Chat : temps réel, distinct des sujets.
- Messages : l'auteur modifie ou supprime les siens, avec archivage ; il ne peut rien faire sur ceux des autres.
