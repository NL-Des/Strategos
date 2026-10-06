# 13 — API

## Objet
Le contrat entre le frontend et le backend : conventions communes, routes utilisateur, routes d'administration, canal temps réel du chat, et schémas des échanges délicats. Chaque route renvoie à la règle de conception qu'elle met en œuvre. La spécification OpenAPI sera **générée depuis le code** NestJS (`@nestjs/swagger`) au moment du développement ; ce document en est la référence de conception.

## 1. Conventions communes

### Généralités
- Échanges en **JSON** (sauf les uploads en `multipart/form-data` et les téléchargements de fichiers). Identifiants en **UUID**. Dates au format ISO 8601, en UTC.
- Deux espaces de routes :
  - `/api/v1/…` : routes utilisateur (l'admin y a aussi accès, avec tous les droits) ;
  - `/api/v1/admin/…` : routes d'administration, protégées **globalement** par le guard de rôle admin.
- Chat en temps réel : WebSocket sur `/api/v1/ws` (voir [§4](#4-websocket-du-chat)).
- Spécification OpenAPI **générée depuis le code** (contrôleurs et DTO) : `pnpm openapi` l'écrit dans [`references/openapi.json`](../openapi.json) ; hors production, elle est aussi consultable sur `/api/docs`. Ce document reste la référence de conception.

### Authentification et CSRF
- Session par **cookie** `httpOnly`, `secure`, `SameSite=Strict` (voir [Comptes et authentification](02-comptes-authentification.md#points-techniques)).
- **CSRF** : toute requête `POST`, `PUT`, `PATCH` ou `DELETE` doit porter l'en-tête `X-CSRF-Token`, obtenu par `GET /api/v1/auth/csrf`. L'en-tête `Origin` est également vérifié.
- **Changement d'identifiants forcé** : tant que `must_change_credentials` est actif, seules `GET /auth/me`, `POST /auth/change-credentials` et `POST /auth/logout` répondent. Toutes les autres routes renvoient `403 CREDENTIALS_CHANGE_REQUIRED`.

### Codes de retour et erreurs
Toute erreur a le même format :

```json
{ "code": "FORM_CLOSED", "message": "Ce formulaire est fermé.", "details": { } }
```

`code` est **stable** et sert de clé de traduction au frontend (voir [Transverse](11-transverse.md#langue)). `message` est un texte de secours en français.

| Statut | Usage |
|---|---|
| `400` | Données invalides (`VALIDATION_FAILED`, avec `details.fields` par champ) |
| `401` | Non connecté ou session expirée (`UNAUTHENTICATED`) |
| `403` | La ressource est **lisible**, mais l'action n'est pas permise : ouvrir un sujet ou poster sans le droit (`FORBIDDEN`), modifier ou supprimer le message d'un autre (`NOT_AUTHOR`) ; ou changement d'identifiants requis (`CREDENTIALS_CHANGE_REQUIRED`) ; ou jeton CSRF ou `Origin` invalide (`CSRF_INVALID`) |
| `404` | `NOT_FOUND` : la ressource n'existe pas **ou n'est pas lisible** par l'utilisateur. On ne distingue pas les deux, pour ne jamais révéler l'existence d'une page ou d'un espace invisible (cohérent avec « module invisible », [Droits et groupes](03-droits-groupes.md#visibilité-et-page-darrivée)) |
| `409` | Conflit d'état : modification concurrente, soumission déjà traitée, confirmation d'avertissement requise, élément encore utilisé |
| `422` | Règle métier bloquante (zone d'ajout pleine, clé introuvable, formulaire fermé, écriture dans une source en lecture seule `SOURCE_READ_ONLY`, restauration d'un élément dont le parent est supprimé `RESTORE_PARENT_DELETED`…) |
| `429` | Trop de tentatives (`AUTH_TOO_MANY_ATTEMPTS`, avec `details.retryAfter`) |
| `500` | Erreur inattendue (`INTERNAL_ERROR`) : ni sa cause ni sa trace ne sont renvoyées, elles sont journalisées côté serveur |
| `503` | Source de données injoignable (`SOURCE_UNAVAILABLE`) ou connexion expirée (`SOURCE_AUTH_EXPIRED`) |

### Avertissements à confirmer
Certaines actions admin sont permises mais méritent une confirmation. Codes d'avertissement : `FORMULA_CELL_TARGETED` (cellule-formule ciblée), `ADD_ZONE_NOT_COVERED` (plage fixe d'un tableau ou catalogue, d'une page, du header ou du footer, qui ne couvre pas une zone d'ajout), `MEDIA_IN_USE` et `SOURCE_IN_USE` (élément encore utilisé), `SOURCE_PUBLIC_LINK` (Google Sheet ajouté par lien public, lisible par quiconque a ce lien), `SUBMISSIONS_INVALIDATED` (publication qui invaliderait des soumissions). Le réimport qui perdrait des validations passe par son propre aperçu en deux temps. Le schéma est toujours le même :
1. premier appel sans confirmation → `409 CONFIRMATION_REQUIRED`, avec `details.warnings: [{ code, message, … }]` ;
2. l'admin confirme → même appel avec `"confirm": true`.

Les enregistrements qui ne bloquent pas (ex. sauvegarder un formulaire qui vise une cellule-formule) réussissent directement et renvoient `warnings` dans la réponse.

### Listes, pagination, tri, recherche
- Paramètres `?page=1&pageSize=50&sort=colonne:asc&q=texte`, avec `pageSize` plafonné à 200.
- Réponse : `{ "items": [...], "total": 1234, "page": 1, "pageSize": 50 }`.
- Historique de chat : pagination par curseur (`?before=<messageId>` ou `?after=<messageId>`, `limit`).

### Suppression et restauration
- `DELETE` = **suppression douce** (voir [Transverse](11-transverse.md#suppression-de-contenu)).
- La restauration se fait uniquement par l'admin, depuis la corbeille (`POST /admin/trash/:type/:id/restore`, voir [Élément de la corbeille](#élément-de-la-corbeille)).

### Modifications concurrentes (admin)
Les objets édités par l'admin (pages, formulaires, thèmes, groupes…) portent un champ `version`. Une mise à jour envoie la `version` lue. Si l'objet a changé entre-temps (dans un autre onglet, par exemple), la réponse est `409 EDIT_CONFLICT`.

## 2. Routes utilisateur (`/api/v1`)
Colonne **Accès** : `public` (sans session), `connecté`, `lecture page`, `lecture espace`, `ouvrir sujet`, `poster` (droits de [Droits et groupes](03-droits-groupes.md#modèle-par-groupes)), `auteur` (propriété), `auteur ou admin`.

### Authentification — [02](02-comptes-authentification.md)
| Méthode | Chemin | Accès | Rôle | Erreurs principales |
|---|---|---|---|---|
| GET | `/health` | public | Sonde de disponibilité | — |
| GET | `/auth/csrf` | public | Obtenir le jeton CSRF `{ csrfToken }`. Sans session, pose un cookie de pré-session ; après connexion, en redemander un | — |
| POST | `/auth/login` | public | Connexion `{ username, password }` → `Me` | `401 AUTH_INVALID_CREDENTIALS`, `403 AUTH_ACCOUNT_DISABLED` (seulement avec le bon mot de passe), `429 AUTH_TOO_MANY_ATTEMPTS` |
| POST | `/auth/logout` | connecté | Déconnexion | — |
| GET | `/auth/me` | connecté | Utilisateur courant (`Me`) | — |
| POST | `/auth/change-credentials` | connecté | Changement forcé : `{ currentPassword, newPassword, newUsername? }` → `Me`. `newUsername` est obligatoire pour l'admin (différent de l'actuel) et refusé pour les autres. Révoque les autres sessions du compte | `AUTH_INVALID_CREDENTIALS`, `VALIDATION_FAILED`, `409 USERNAME_TAKEN`, `429` |

`Me` = `{ id, username, isAdmin, mustChangeCredentials, landingPageId, personalPageId }`.

### Profil — [05](05-profil-utilisateur.md)
| Méthode | Chemin | Accès | Rôle | Erreurs |
|---|---|---|---|---|
| GET | `/me/profile` | connecté | Pseudo, date de création, statut, groupes, droits effectifs avec les groupes qui les accordent | — |
| PUT | `/me/password` | connecté | `{ currentPassword, newPassword }` → `204` ; limité comme la connexion ; ferme les autres sessions du compte | `AUTH_INVALID_CREDENTIALS`, `VALIDATION_FAILED`, `429` |
| GET | `/me/notes` | connecté | Liste de ses notes | — |
| POST | `/me/notes` | connecté | Créer `{ title, content }` (HTML nettoyé) | `VALIDATION_FAILED` |
| PUT | `/me/notes/:id` | auteur | Modifier | `404` |
| DELETE | `/me/notes/:id` | auteur | Supprimer (douce) | `404` |
| GET | `/me/submissions` | connecté | Ses soumissions, paginées, avec statut et formulaire d'origine | — |

### Navigation et pages — [06](06-page-builder.md)
| Méthode | Chemin | Accès | Rôle | Erreurs |
|---|---|---|---|---|
| GET | `/layout` | connecté | Header et footer partagés **publiés**, assemblés et filtrés pour l'utilisateur : `{ header, footer }`, chacun `null` s'il n'a jamais été publié | — |
| GET | `/pages/:id` | lecture page | **Page assemblée** : version publiée, modules et liens non autorisés retirés, valeurs résolues (voir [schéma](#page-assemblée)) | `404`, `SOURCE_UNAVAILABLE` (partiel, voir schéma) |
| GET | `/blocks/:blockId/rows` | lecture page | Lignes d'un Tableau ou d'un Catalogue : `?page&pageSize&sort&q` ; pagination, tri et recherche côté serveur. `sort=<indice de colonne affichée>:asc\|desc` (jamais une lettre de colonne) ; sans `pageSize`, celui du module. Réponse `{ items, total, page, pageSize }` : `{ cells: [{ value, needsRecalc, href?, image? }] }` par ligne de Tableau, `{ image, title, subtitle, details }` par carte de Catalogue (`image: null` = image par défaut). Les lignes entièrement vides sont ignorées | `404`, `503 SOURCE_UNAVAILABLE` |

La page d'arrivée et la page personnelle sont connues via `Me` (`landingPageId`, `personalPageId`) : il n'y a pas de route dédiée. Si l'utilisateur ne peut pas lire la page d'arrivée, `GET /pages/:id` renvoie `404` et le frontend affiche l'écran « Aucun espace ne vous est encore attribué ».

### Formulaires et soumissions — [09](09-formulaires-soumissions.md)
| Méthode | Chemin | Accès | Rôle | Erreurs |
|---|---|---|---|---|
| GET | `/forms/:id` | lecture page | Définition du formulaire côté utilisateur (voir [schéma](#formulaire-côté-utilisateur)) : champs, options résolues des listes, état `open` / `closed` / `full` | `404` (y compris un formulaire non configuré) |
| GET | `/forms/:id/prefill?rowKey=` | lecture page | Formulaire de ligne : valeurs actuelles de la ligne, pour pré-remplir | `404`, `422 ROW_KEY_NOT_FOUND`, `422 ROW_KEY_DUPLICATE` |
| POST | `/forms/:id/submissions` | lecture page | Soumettre `{ values, rowKey? }`. Les champs automatiques sont remplis par le serveur (toute valeur envoyée pour eux est ignorée). Réponse : la soumission, `pending`, ou `validated` en validation automatique | `VALIDATION_FAILED`, `422 FORM_CLOSED`, `422 FORM_FULL`, `422 ROW_KEY_NOT_FOUND` |
| GET | `/me/submissions/:id` | auteur | Détail d'une de ses soumissions | `404` |

### Espaces de discussion — [07](07-discussions.md#espaces-de-discussion)
| Méthode | Chemin | Accès | Rôle | Erreurs |
|---|---|---|---|---|
| GET | `/spaces/:id/topics` | lecture espace | Sujets (épinglés en tête, puis selon le tri de l'espace), paginés | `404` |
| POST | `/spaces/:id/topics` | ouvrir sujet | Ouvrir `{ title, firstMessage, attachmentIds? }` | `403 FORBIDDEN`, `VALIDATION_FAILED` |
| GET | `/topics/:id` | lecture espace | Sujet et messages (paginés) ; les messages supprimés sont toujours exclus, les messages masqués le sont pour les utilisateurs mais restent visibles pour l'admin (marqués `hidden`, pour pouvoir les rétablir) | `404` |
| PATCH | `/topics/:id` | auteur ou admin | Renommer `{ title }` ou clore `{ closed: true }` | `403 NOT_AUTHOR` |
| POST | `/topics/:id/messages` | poster | Poster `{ content, attachmentIds? }` | `403 FORBIDDEN`, `422 TOPIC_CLOSED` |
| PUT | `/messages/:id` | auteur ou admin | Modifier (l'ancienne version est archivée) ; par l'admin sur le message d'un autre : tracé au journal | `403 NOT_AUTHOR`, `422 TOPIC_CLOSED` |
| DELETE | `/messages/:id` | auteur ou admin | Supprimer (archivé) ; par l'admin sur le message d'un autre : tracé au journal | `403 NOT_AUTHOR` |
| POST | `/attachments` | connecté | Upload d'une image jointe (`multipart`), à rattacher ensuite à un message (d'ici là, seul celui qui l'a envoyée peut la lire) : JPEG, PNG, WebP ou GIF, 5 Mo au maximum, 4 par message au plus | `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`, `422 TOO_MANY_ATTACHMENTS` |

### Chat — [07](07-discussions.md#chat)
| Méthode | Chemin | Accès | Rôle | Erreurs |
|---|---|---|---|---|
| GET | `/chats/:blockId/messages` | lecture page | Historique par curseur (`?before=` ou `?after=`, `limit`), utilisé au chargement et au rattrapage après une reconnexion | `404` |
| PUT | `/chat-messages/:id` | auteur ou admin | Modifier le message (archivé) ; diffusé en temps réel ; par l'admin sur le message d'un autre : tracé au journal | `403 NOT_AUTHOR` |
| DELETE | `/chat-messages/:id` | auteur ou admin | Supprimer le message (archivé) ; diffusé ; par l'admin sur le message d'un autre : tracé au journal | `403 NOT_AUTHOR` |

L'envoi d'un message passe par le WebSocket (voir [§4](#4-websocket-du-chat)).

### Médias
| Méthode | Chemin | Accès | Rôle | Erreurs |
|---|---|---|---|---|
| GET | `/media/:id` | connecté | Image de la médiathèque : accessible à tout utilisateur connecté | `404` |
| GET | `/attachments/:id` | lecture espace | Pièce jointe d'un message (non rattachée : son auteur seul) | `404` |

## 3. Routes d'administration (`/api/v1/admin`)
Toutes ces routes exigent le **rôle admin**. Chaque action qui modifie des données écrit dans le journal, dans la même transaction (voir [Administration](04-administration.md#journal-des-modifications)).

### Comptes — [02](02-comptes-authentification.md), [04](04-administration.md)
| Méthode | Chemin | Rôle | Erreurs |
|---|---|---|---|
| GET | `/users` | Liste paginée, filtrable (`status`, `groupId`, `q`) | — |
| POST | `/users` | Créer `{ username, temporaryPassword, groupIds? }` → `must_change_credentials = true` | `409 USERNAME_TAKEN`, `VALIDATION_FAILED` (groupe inconnu) |
| GET | `/users/:id` | Fiche : groupes, droits effectifs, page personnelle | `404` |
| PATCH | `/users/:id` | Modifier le pseudo et la page personnelle (`personalPageId`, `null` pour la retirer, absent pour la laisser) | `USERNAME_TAKEN`, `EDIT_CONFLICT`, `VALIDATION_FAILED` (page inconnue) |
| PUT | `/users/:id/groups` | Remplacer les groupes du compte `{ groupIds }`, depuis sa fiche (pendant de `PUT /groups/:id/members`) | `VALIDATION_FAILED` |
| POST | `/users/:id/reset-password` | `{ temporaryPassword }` → mot de passe temporaire, sessions révoquées | `422 ADMIN_ACCOUNT_PROTECTED` |
| POST | `/users/:id/disable` · `/enable` | Désactiver (sessions révoquées) ou réactiver | `422 ADMIN_ACCOUNT_PROTECTED` |
| DELETE | `/users/:id` | Suppression douce, sessions révoquées | `422 ADMIN_ACCOUNT_PROTECTED` |
| GET | `/users/:id/notes` | Notes de l'utilisateur, **en lecture seule** ; chaque appel est tracé (`notes.read`) | — |

### Groupes et droits — [03](03-droits-groupes.md)
| Méthode | Chemin | Rôle | Erreurs |
|---|---|---|---|
| GET / POST | `/groups` | Lister, créer `{ name, description }` | `GROUP_NAME_TAKEN` |
| GET / PATCH / DELETE | `/groups/:id` | Fiche (membres et permissions déclarées), renommer ou décrire `{ name, description, version }`, supprimer (douce) | `EDIT_CONFLICT`, `GROUP_NAME_TAKEN` |
| PUT | `/groups/:id/members` | Remplacer la liste des membres `{ userIds }` | `VALIDATION_FAILED` (compte inconnu) |
| PUT | `/groups/:id/permissions` | Remplacer les permissions `{ permissions: [{ resourceType, resourceId, canRead, canCreateTopic, canPost }] }` ; une ligne sans aucun droit est ignorée | `VALIDATION_FAILED` (ex. `canPost` sur une page, ressource inconnue ou en double) |
| GET | `/rights/users/:id` | Droits effectifs d'un utilisateur, avec les groupes qui les accordent | — |
| GET | `/rights/resources/:type/:id` | Qui peut lire, ouvrir un sujet ou poster, et via quel groupe | — |
| GET | `/rights/matrix` | Matrice paginée utilisateurs × ressources, filtres `group` (membres du groupe), `type`, `user` (recherche sur le pseudo) | — |

### Supervision — [04](04-administration.md)
| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/audit` | Journal paginé, du plus récent au plus ancien. Filtres : `actorKind` (`user`, `system`, `cli`), `actorId`, `action`, `targetType`, `targetId`, période `from` (inclus) – `to` (exclu) en ISO 8601 |
| GET | `/trash` | Corbeille paginée, du plus récent au plus ancien, filtre `type` (`page`, `form`, `topic`, `topic_message`, `chat_message`, `group`, `user`) → [éléments](#élément-de-la-corbeille) |
| POST | `/trash/:type/:id/restore` | Restaurer → `204`, tracé `trash.restore`. `404` si le type est inconnu ou l'élément absent ou non supprimé ; `409 USERNAME_TAKEN` / `409 GROUP_NAME_TAKEN` si le nom a été repris ; `422 RESTORE_PARENT_DELETED` pour un formulaire dont la page, ou un message dont le sujet, est supprimé |
| GET / PUT | `/settings` | Réglages de l'instance : page d'arrivée, thème par défaut, durée de conservation des sauvegardes |
| GET | `/backups` | Liste des sauvegardes, de la plus récente à la plus ancienne : `[{ id, status, sizeBytes, error, createdAt, finishedAt }]` |
| GET | `/backups/:id/download` | Télécharger l'archive `.tar.gz` d'une sauvegarde réussie (flux) ; `404` sinon |

### Sources — [08](08-sources-donnees.md), [04](04-administration.md#sources)
| Méthode | Chemin | Rôle | Erreurs |
|---|---|---|---|
| GET | `/sources` | Liste : type, état, dernière lecture ou import, usages, `writable` (`false` : lecture seule) | — |
| POST | `/sources` | Ajouter un Google Sheet choisi dans le sélecteur `{ type: "gsheet", spreadsheetId }`, un fichier OneDrive `{ type: "onedrive", itemId }` ou un Google Sheet par lien public `{ type: "gsheet_link", url, confirm? }` (lecture seule) ; teste l'accès. Un Sheet déjà ajouté est retesté et renvoyé, pas dupliqué | `SOURCE_UNAVAILABLE` (Sheet non choisi dans le sélecteur, ou non partagé par lien), `SOURCE_AUTH_EXPIRED`, `409 CONFIRMATION_REQUIRED` (`SOURCE_PUBLIC_LINK`), `400` si `url` n'est pas le lien d'un Sheet (`isSheetLink`) |
| POST | `/sources/upload` | Uploader un Excel `.xlsx` (`multipart`, champ `file`, 20 Mo au plus) → nouvelle source de type upload. La liste renvoie aussi les feuilles (`sheets`) pour les sélecteurs du page builder | `413`, `415`, `422 EXCEL_PARSE_FAILED` |
| POST | `/sources/:id/test` | Tester l'accès ; renvoie la source avec son état et ses feuilles relues | `SOURCE_UNAVAILABLE`, `SOURCE_AUTH_EXPIRED` |
| GET | `/sources/:id/cells` | Grille d'un Excel uploadé : `?sheet=&top=&left=&rows=&cols=` (première feuille, `A1`, 50 × 26 par défaut ; 200 lignes et 50 colonnes au plus). Renvoie `{ sheets, sheet, maxRow, maxCol, top, left, rows, cols, cells: [{ row, col, type, display, formula, needsRecalc }] }`, cellules non vides seulement ; `formula` est sans « = », dans la syntaxe du fichier (`SUM(A1,1.5)`) ; les liaisons inter-fichiers ne sont pas suivies | `404` si la source n'est pas un upload ou si la feuille est inconnue, `400` hors bornes |
| PATCH | `/sources/:id/cells` | Modifier une cellule d'un Excel uploadé : `{ sheet, row, col, expected: { display, formula }, input }`. `input` se lit comme dans Excel (`=…` formule dans la syntaxe du fichier, le frontend convertissant la saisie française, nombre `1 234,5`, date `26/09/2026`, `VRAI`/`FAUX`, apostrophe en tête pour forcer le texte, vide pour effacer). `expected` est le contenu vu dans la grille. Renvoie la cellule (même forme que dans la grille). Tracé (`source.edit_cell`) | `404` (source non upload, feuille inconnue), `409 EDIT_CONFLICT` (la cellule a changé), `422 FORMULA_EXTERNAL_REF` (formule citant un autre classeur) |
| GET | `/sources/:id/download` | Télécharger la version de référence d'un Excel uploadé ; met à jour `last_downloaded_at` et trace le téléchargement | `422 SOURCE_NOT_UPLOAD` si ce n'est pas un upload |
| POST | `/sources/:id/reimport/preview` | Uploader le nouveau fichier ; renvoie un `reimportToken` et la liste des **validations et modifications de la grille qui seraient perdues** (voir [schéma](#aperçu-de-réimport)) | `415`, `EXCEL_PARSE_FAILED` |
| POST | `/sources/:id/reimport/confirm` | `{ reimportToken, mode: "overwrite" \| "reapply" }` (annuler revient à ne pas confirmer ; le jeton expire) | `409 REIMPORT_TOKEN_EXPIRED`, `422` si une validation réappliquée échoue |
| DELETE | `/sources/:id` | Retirer (avertissement si encore utilisée) | `409 CONFIRMATION_REQUIRED` |
| PUT | `/google/config` | Saisir ou remplacer les identifiants du projet Google Cloud : `{ clientId, clientSecret, apiKey? }` ; renvoie l'état. Changer d'ID client rend la connexion en cours expirée. Tracé (`google.configure`, ID client seulement) | `400` (ID client mal formé), `403 FORBIDDEN` (identifiants fournis au déploiement) |
| GET | `/google/connect` | Démarre la connexion Google (redirection) | `400 SOURCE_AUTH_FAILED` sans identifiants |
| GET | `/google/status` | État : `{ configured, managed, clientId, hasApiKey, redirectUri, connected, accountLabel, expired }` — `managed` : identifiants fournis au déploiement, non modifiables ici ; `redirectUri` est l'adresse de retour à déclarer chez Google ; jamais le code secret ni le jeton | — |
| GET | `/api/v1/google/callback` (**hors** `/admin`, publique) | Retour de Google : même règle que le retour de Microsoft (`state`), puis redirection vers `/admin/sources?google=connected` ou `failed` | `400 SOURCE_AUTH_FAILED` |
| GET | `/google/picker` | Ce qu'il faut au sélecteur de fichiers Google : `{ accessToken, apiKey, appId }` (jeton d'accès court, limité aux fichiers choisis ; jamais le refresh token) | `SOURCE_AUTH_EXPIRED` |
| GET | `/onedrive/connect` | Démarre la connexion Microsoft (redirection) | — |
| GET | `/onedrive/status` | État de la connexion : `{ configured, connected, accountLabel, expired }` (jamais le jeton) | — |
| GET | `/api/v1/onedrive/callback` (**hors** `/admin`, publique) | Retour de Microsoft : vérifie le paramètre `state` (qui remplace le CSRF et la session, dont le cookie `SameSite=Strict` n'est pas envoyé), stocke le jeton chiffré, puis redirige vers `/admin/sources?onedrive=connected` ou `failed` | `400 SOURCE_AUTH_FAILED` |
| GET | `/onedrive/browse?path=` | Parcourir le OneDrive connecté pour choisir un fichier | `SOURCE_AUTH_EXPIRED` |

### Page builder — [06](06-page-builder.md)
| Méthode | Chemin | Rôle | Erreurs |
|---|---|---|---|
| GET / POST | `/pages` | Lister (pour les sélecteurs de liens) ; créer une page (brouillon vide) | — |
| GET | `/pages/:id` | Page avec son brouillon, sa version publiée et ses réglages (thème, header/footer affichés) | `404` |
| PUT | `/pages/:id/draft` | Enregistrer le brouillon `{ version, name, config }`, où `config = { zones, themeId, showHeader, showFooter }` (le nom interne change tout de suite, le reste à la publication). Les avertissements (plage non couverte…) sont renvoyés dans `warnings` | `VALIDATION_FAILED` (chemin du champ dans `details.fields`), `EDIT_CONFLICT` |
| GET | `/pages/:id/preview?asGroup=` | Brouillon **assemblé** (valeurs résolues). Sans `asGroup` : vue administrateur complète. Avec `asGroup=<groupId>` : vue d'un membre de ce seul groupe (modules et liens filtrés) | `404` (groupe inconnu) |
| GET | `/pages/preview/layout?asGroup=` | Header et footer **publiés** qui encadrent l'aperçu d'une page, assemblés pour l'admin ou pour un membre de ce seul groupe (même forme que `GET /layout`) | `404` (groupe inconnu) |
| GET | `/pages/:id/publish/preview` | Ce que la publication va changer : formulaires modifiés, **soumissions qui seraient invalidées**, espaces et chats créés ou retirés | — |
| POST | `/pages/:id/publish` | Publier le brouillon, avec ses formulaires, espaces et chats, en une transaction ; `{ confirm: true }` requis si des soumissions seraient invalidées (avertissement `SUBMISSIONS_INVALIDATED`, avec `count`) | `VALIDATION_FAILED` (bloc invalide), `409 CONFIRMATION_REQUIRED` |
| DELETE | `/pages/:id` | Suppression douce | — |
| GET / PUT | `/layout/:kind/draft` | Brouillon du header ou du footer partagé (`kind = header \| footer`), `{ version, config: { rows } }` ; formulaires, espaces et chats refusés. L'enregistrement renvoie `warnings`, comme pour une page | `EDIT_CONFLICT`, `422 BLOCK_NOT_ALLOWED_IN_LAYOUT` (`details.blockIds`) |
| GET | `/layout/:kind/preview?asGroup=` | Aperçu du header ou du footer, éventuellement avec les droits d'un groupe | — |
| POST | `/layout/:kind/publish` | Publier le header ou le footer | — |
| GET | `/blocks/:blockId/rows` | Lignes d'un bloc de brouillon (ou, à défaut, de la version publiée), pour l'aperçu ; même réponse que la route utilisateur. L'aperçu assemblé pointe vers cette route dans `rowsUrl` | `404`, `503 SOURCE_UNAVAILABLE` |
| GET / POST | `/themes` | Lister (avec `isDefault`) ; créer `{ name, config }` | `409 THEME_NAME_TAKEN`, `VALIDATION_FAILED` |
| GET / PUT / DELETE | `/themes/:id` | Lire ; modifier `{ version, name, config }` ; supprimer (physique) : les pages publiées et les brouillons qui l'utilisaient reviennent au thème par défaut ; supprimer le thème par défaut est refusé | `404`, `EDIT_CONFLICT`, `409 THEME_NAME_TAKEN`, `VALIDATION_FAILED` (image de fond inconnue), `422 DEFAULT_THEME` |
| GET / POST | `/media` | Liste paginée (`?q=` sur le nom), upload (`multipart` : `file`, `alt` facultatif) | `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`, `409 MEDIA_NAME_TAKEN` |
| GET | `/media/:id/usages` | Pages, header/footer (brouillon ou version publiée) et thèmes (image de fond) qui utilisent l'image : `{ pages, layouts, themes }` | `404` |
| DELETE | `/media/:id` | Suppression douce, corps `{ confirm? }` ; avertissement `MEDIA_IN_USE` avec `pages`, `layouts` et `themes` | `409 CONFIRMATION_REQUIRED` |

### Formulaires et soumissions — [09](09-formulaires-soumissions.md)
| Méthode | Chemin | Rôle | Erreurs |
|---|---|---|---|
| POST | `/forms` | Créer un formulaire rattaché à un bloc du brouillon `{ pageBlockId, mode, … }` | `VALIDATION_FAILED` |
| GET | `/forms/:id` | Définition en brouillon, définition publiée et réglages opérationnels | `404` |
| GET | `/forms/:id/preview` · `/forms/:id/preview/prefill?rowKey=` | Brouillon vu comme l'utilisateur le verra (même réponse que la route utilisateur) ; l'aperçu de page y pointe par `formUrl` | `404` (non configuré) |
| PUT | `/forms/:id/draft` | Modifier la définition **en brouillon** (champs, mappings, zone, clé). Rien ne change pour les utilisateurs avant la publication de la page. La réponse indique les `warnings` et les soumissions **qui seraient invalidées** à la publication | `VALIDATION_FAILED`, `EDIT_CONFLICT` |
| DELETE | `/forms/:id` | Supprimer (en retirant le bloc du brouillon ; effectif à la publication) | — |
| POST | `/forms/:id/open` · `/close` | Ouvrir, fermer (**immédiat**) | — |
| PATCH | `/forms/:id/settings` | `{ closesAt?, autoValidate? }` (**immédiat**) ; activer la validation automatique renvoie les avertissements à confirmer | `409 CONFIRMATION_REQUIRED` |
| GET | `/submissions` | File paginée, filtres : statut, formulaire, page, utilisateur, période ; conflits signalés (voir [schéma](#élément-de-la-file-des-soumissions)) | — |
| GET | `/submissions/count` | Compteur des soumissions en attente (affiché en permanence) | — |
| POST | `/submissions/:id/validate` | Valider ; avertissement cellule-formule à confirmer | `409 CONFIRMATION_REQUIRED`, `409 SUBMISSION_NOT_PENDING`, `422 ADD_ZONE_FULL`, `422 ROW_KEY_NOT_FOUND`, `422 ROW_KEY_DUPLICATE`, `422 MOVEMENT_NOT_NUMERIC`, `503 SOURCE_UNAVAILABLE` |
| POST | `/submissions/:id/modify` | Valider avec des valeurs corrigées par l'admin `{ values }` → statut `modified` | mêmes erreurs |
| POST | `/submissions/:id/reject` | Refuser `{ reason? }` | `409 SUBMISSION_NOT_PENDING` |

### Discussions (modération) — [07](07-discussions.md#modération)
| Méthode | Chemin | Rôle |
|---|---|---|
| PATCH | `/topics/:id` | Épingler ou désépingler `{ pinned }` (renommer et clore passent par la route utilisateur, ouverte à l'admin) |
| DELETE | `/topics/:id` | Supprimer un sujet (suppression douce, tracée `topic.delete`) ; restaurable depuis la corbeille |
| POST | `/messages/:id/hide` · `/unhide` | Masquer ou rétablir un message de sujet |
| POST | `/chat-messages/:id/hide` · `/unhide` | Idem pour le chat (diffusé en temps réel) |

### Modèles — [10](10-modeles-duplication.md)
| Méthode | Chemin | Rôle | Erreurs |
|---|---|---|---|
| GET | `/templates` | Bibliothèque, filtre `?type=` (`form`, `page`, `topic`) | — |
| POST | `/templates` | Enregistrer comme modèle `{ type, sourceId, name }` (nom unique par type) | `409 TEMPLATE_NAME_TAKEN`, `VALIDATION_FAILED` (`sourceId` introuvable) |
| DELETE | `/templates/:id` | Supprimer (physique) | `404` |
| POST | `/templates/:id/instantiate` | Instancier : page → `{ name? }`, nouvelle page en brouillon, sans permission ; formulaire → `{ pageId, pageBlockId }`, rattaché au bloc du brouillon ; sujet → `{ spaceId }`. Mappings et plages réinitialisés. Réponse : `{ type, pageId \| formId \| topicId }` | `404`, `VALIDATION_FAILED` (paramètre manquant, bloc déjà pris) |

## 4. WebSocket du chat
- **Connexion** : `wss://…/api/v1/ws`, authentifiée par le cookie de session. L'en-tête `Origin` est vérifié à la connexion. Un compte qui doit encore changer ses identifiants est refusé. Une session révoquée (compte désactivé) ferme la connexion.
- **Trames** : dans les deux sens, `{ "event": "<nom>", "data": { … } }`.
- **Rejoindre un salon** : le client envoie `chat.join { blockId }`. Le serveur vérifie le droit de lecture sur la page qui contient le bloc, puis répond `chat.joined` ou `chat.error { code: "NOT_FOUND" }`. `chat.leave { blockId }` pour quitter.
- **Envoyer** : `chat.send { blockId, clientId, content }` → accusé `chat.ack { clientId, message }` ou `chat.error { clientId, code }`. Les validations sont les mêmes qu'en REST.
- **Événements diffusés** aux membres du salon : `chat.message.created`, `chat.message.updated` (modification, ou rétablissement d'un message masqué), `chat.message.deleted`, `chat.message.hidden` (voir [schéma](#événement-de-chat)).
- **Reconnexion** : le client rattrape les messages manqués via `GET /chats/:blockId/messages?after=<dernier id reçu>`.

## 5. Schémas clés

### Page assemblée
Réponse de `GET /pages/:id` (et de `GET /admin/pages/:id/preview`) :

```json
{
  "id": "…", "name": "Tournoi", "publishedAt": "…",
  "theme": { "id": "…", "config": { } },
  "showHeader": true, "showFooter": true,
  "zones": {
    "main": [
      { "id": "r1", "columns": [
        { "width": "2/3", "block": { "id": "b1", "type": "table",
          "config": { "columns": [ { "label": "Objet", "format": "text" } ], "pageSize": 20, "sortable": true, "searchable": true },
          "rowsUrl": "/api/v1/blocks/b1/rows", "rowForms": [] } },
        { "width": "1/3", "block": { "id": "b2", "type": "chat",
          "config": { "name": "Salon", "height": 400 }, "messagesUrl": "/api/v1/chats/b2/messages" } }
      ] }
    ],
    "sidebar": null
  },
  "unavailableSources": []
}
```

- Les modules non autorisés, non configurés, et les liens vers des pages illisibles sont **absents** : le frontend ne peut pas les afficher par erreur.
- Les liens « Ma page personnelle » sont déjà résolus en identifiant de page.
- Les valeurs insérées dans un Contenu libre sont **déjà résolues** (`{ "value": "4 250", "needsRecalc": false }`).
- Les lignes des tableaux et catalogues ne sont pas incluses : elles sont chargées page par page via `rowsUrl`. De même, les sujets d'un espace de discussion via `topicsUrl` (avec `config = { name, sortMode, canCreateTopic, canPost }`), et l'historique d'un chat via `messagesUrl`.
- Une zone non cochée vaut `null` (`main` ou `sidebar`).
- Si une source est injoignable, la page est tout de même renvoyée. Les blocs concernés portent `"error": "SOURCE_UNAVAILABLE"`. `unavailableSources` (`[{ id, name }]`) n'est renseigné que pour l'admin (aperçu, ou lecture d'une page par l'admin) ; il reste vide pour les utilisateurs, qui ne voient jamais une source.
- Contenu libre : chaque valeur insérée est remplacée dans le HTML par `<span data-value="i"></span>`, et `config.values[i] = { value, needsRecalc }`. Tableau et Catalogue ne portent ni source, ni feuille, ni plage : seulement les libellés, formats et réglages d'affichage, et `rowsUrl`.
- Formulaire : `config = { formId, formUrl, submitUrl }` (`formUrl` : `GET /forms/:id`, ou la route d'aperçu admin ; `submitUrl` : `null` en aperçu). Un formulaire de ligne n'est pas rendu seul : le Tableau ou le Catalogue relié porte `rowForms: [{ formId, title, formUrl, submitUrl }]`, et chaque ligne ou carte de `rowsUrl` porte `rowKeys: { [formId]: valeurDeClé }`.

### Formulaire côté utilisateur
```json
{
  "id": "…", "mode": "ajout", "state": "open", "closesAt": null,
  "title": "Inscription", "intro": "…", "successMessage": "…",
  "fields": [
    { "key": "pseudo", "type": "text", "auto": "pseudo", "readOnly": true, "value": "Kira" },
    { "key": "classe", "type": "select", "required": true, "options": ["Mage", "Voleur", "Guerrier"] },
    { "key": "niveau", "type": "number", "required": true, "min": 1, "max": 60 }
  ]
}
```
Pour un champ « mouvement » : `"movement": true` ; l'utilisateur saisit une quantité signée. Les cellules, colonnes et sources visées ne sont **jamais** exposées à l'utilisateur.

### Soumission
```json
{
  "id": "…", "formId": "…", "formTitle": "Inscription",
  "status": "pending", "submittedAt": "…", "decidedAt": null,
  "values": { "classe": "Mage", "niveau": 42 },
  "rowKey": null, "reason": null
}
```
`status` ∈ `pending`, `validated`, `rejected`, `modified`, `invalidated`.

### Élément de la file des soumissions
Côté admin, chaque soumission s'accompagne de son contexte :

```json
{
  "submission": { },
  "user": { "id": "…", "username": "Kira" },
  "form": { "id": "…", "title": "…", "mode": "ligne", "pageId": "…" },
  "targets": [ { "field": "stock", "sourceId": "…", "sheet": "Stock", "cell": "D138", "currentValue": "8", "proposed": "-3", "movement": true } ],
  "conflicts": [ "…ids des autres soumissions en attente sur les mêmes cellules…" ],
  "warnings": [ { "code": "FORMULA_CELL_TARGETED", "cell": "F12" } ]
}
```
`currentValue` est lue au moment de l'affichage de la file ; elle peut avoir changé au moment de la validation.

### Aperçu de réimport
```json
{
  "reimportToken": "…", "expiresAt": "…",
  "lastDownloadedAt": "…",
  "lostValidations": [
    { "submissionId": "…", "editId": null, "cell": "Stock!C2", "validatedValue": "8", "valueInNewFile": "10", "validatedAt": "…" },
    { "submissionId": null, "editId": "…", "cell": "Stock!F2", "validatedValue": "=C2*2", "valueInNewFile": null, "validatedAt": "…" }
  ]
}
```
Une ligne vient d'une validation (`submissionId`) ou d'une modification dans la grille (`editId`, `validatedValue` = formule précédée de `=` s'il y en a une). Triées par date.
Une liste vide signifie que le réimport ne perd rien.

### Événement de chat
```json
{ "event": "chat.message.created",
  "data": { "blockId": "…",
    "message": { "id": "…", "author": { "id": "…", "username": "Kira" }, "content": "…", "createdAt": "…", "editedAt": null, "mine": false, "hidden": false } } }
```
Pour `deleted` et `hidden`, seul `message.id` est envoyé. `mine` est calculé pour chaque destinataire ; `hidden` n'est vrai que pour l'admin (message masqué qu'il peut rétablir).

### Élément de la corbeille
```json
{ "type": "topic_message", "id": "…", "label": "Tank devant & soigneur derrière",
  "context": "Stratégie", "author": "kira", "deletedAt": "2026-09-29T10:00:00Z" }
```
`label` : nom, titre ou pseudo ; pour un message, le début de son texte, sans balises. `context` : la page d'un formulaire, l'espace d'un sujet, le sujet ou le chat d'un message. `author` : l'auteur d'un sujet ou d'un message.

## 6. Qui protège quoi
| Protection | Portée |
|---|---|
| `AuthGuard` (global) | Toutes les routes sauf `health`, `auth/csrf`, `auth/login` et `onedrive/callback` (protégée par `state`) |
| Guard « identifiants à changer » (global) | Tout sauf `auth/me`, `auth/change-credentials`, `auth/logout` et les routes publiques ; la passerelle WebSocket refuse aussi ces comptes |
| Guard CSRF (global) | Toutes les méthodes qui modifient des données, sauf le retour OAuth (protégé par `state`) |
| Guard admin | Tout `/api/v1/admin/**` (un non-admin reçoit `404`, l'espace admin n'est pas révélé), et la passerelle pour les événements de modération |
| `PermissionsGuard` | `GET /pages/:id` (lecture page) |
| Services d'accès (`PageAccessService`, `SpaceAccessService`, `ChatAccessService`) | Blocs, formulaires, chats (lecture page) et espaces, sujets, messages, pièces jointes (droits de l'espace) ; même règle `RightsService` que le guard |
| Propriété | Notes, ses soumissions, ses messages (sujets et chat ; l'admin aussi, tracé), renommer ou clore son sujet (l'admin aussi) |

## Dépendances
Toutes les parties ; en particulier [02](02-comptes-authentification.md), [03](03-droits-groupes.md), [06](06-page-builder.md), [07](07-discussions.md), [08](08-sources-donnees.md) et [09](09-formulaires-soumissions.md).

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- Markdown de conception ; OpenAPI généré depuis le code.
- Deux espaces de routes, `/api/v1` et `/api/v1/admin`, plus un WebSocket pour le chat.
- `404` pour toute ressource illisible (pas de `403` qui révèlerait son existence).
- Codes d'erreur stables, traduits par le frontend ; confirmation des avertissements par `confirm: true`.
- Formulaires, espaces et chats suivent le cycle brouillon → publication de leur page ; les réglages opérationnels sont immédiats ; aperçu de ce que la publication invalidera.
- Médiathèque accessible à tout utilisateur connecté ; pièces jointes accessibles aux lecteurs de l'espace (5 Mo, 4 par message, JPEG/PNG/WebP/GIF).
- Aperçu avec les droits d'un groupe (`asGroup`).
