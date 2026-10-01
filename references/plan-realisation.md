# Plan de réalisation

Ce document découpe la réalisation de Strategos en étapes. Chaque étape est une **tranche verticale** : elle livre un morceau utilisable de bout en bout (base, API, écran, tests), dans l'ordre des dépendances de la conception, jusqu'à pouvoir rejouer les parcours A à D de [12 — Parcours](conception/12-parcours.md). L'assemblage technique est décrit dans [architecture.md](architecture.md).

## Avancement

- [x] [Étape 0 — Socle](#étape-0--socle)
- [x] [Étape 1 — Comptes et authentification](#étape-1--comptes-et-authentification)
- [x] [Étape 2 — Journal des modifications](#étape-2--journal-des-modifications)
- [x] [Étape 3 — Pages minimales, header, footer et réglages](#étape-3--pages-minimales-header-footer-et-réglages)
- [x] [Étape 4 — Groupes, droits et profil](#étape-4--groupes-droits-et-profil)
- [x] [Étape 5 — Excel uploadé, tableaux et catalogues](#étape-5--excel-uploadé-tableaux-et-catalogues)
- [x] [Étape 6 — Formulaires et soumissions](#étape-6--formulaires-et-soumissions)
- [x] [Étape 7 — Google Sheets et OneDrive](#étape-7--google-sheets-et-onedrive)
- [x] [Étape 8 — Espaces de discussion](#étape-8--espaces-de-discussion)
- [x] [Étape 9 — Chat temps réel](#étape-9--chat-temps-réel)
- [x] [Étape 10 — Thèmes complets et notes](#étape-10--thèmes-complets-et-notes)
- [x] [Étape 11 — Modèles et duplication](#étape-11--modèles-et-duplication)
- [x] [Étape 12 — Corbeille, sauvegardes et finitions](#étape-12--corbeille-sauvegardes-et-finitions)

## Organisation du dépôt

Un **monorepo pnpm workspaces**, choisi pour faciliter les évolutions et la maintenance par IA sous supervision humaine :

- **Une seule source de vérité pour les contrats** : `packages/shared` porte les schémas de configuration des blocs (les 8 types de modules), les codes d'erreur (clés de traduction), les enums et les types de l'API. Un changement de contrat tient dans un seul diff : le backend et le frontend ne peuvent pas diverger sans que cela se voie.
- **Une seule branche, `main`** : chaque étape touche ensemble backend, frontend et `shared`, et se commite sur `main` comme une tranche complète, relue avant le commit.
- **Un cadre commun** : un `CLAUDE.md` à la racine donne les conventions, les commandes et les renvois vers `references/` ; pas de CI : `pnpm check` lance en local toutes les vérifications (format, lint, typage, tests, build) et doit passer avant chaque commit.

```
apps/backend      NestJS, Prisma (+ SQL pour les CHECK, index partiels et trigger)
apps/frontend     React + TypeScript, Vite, React Query, i18next (fr)
packages/shared   types des blocs, codes d'erreur, enums, DTO partagés
docker-compose.yml · Caddyfile · CLAUDE.md
```

## Règles communes à toutes les étapes

- **Migrations** : dans l'ordre de [14 — Ordre de création](conception/14-modele-donnees.md#13-ordre-de-création-migrations) ; chaque étape crée les tables dont elle a besoin.
- **Routes** : `AuthGuard`, puis `PermissionsGuard` ou guard admin ; ressource illisible → `404` ; erreurs au format `{ code, message, details }` ; `409 CONFIRMATION_REQUIRED` et `409 EDIT_CONFLICT` selon [13 — Conventions communes](conception/13-api.md#1-conventions-communes).
- **Journal** : toute modification tracée écrit dans `audit_log` **dans la même transaction**.
- **Textes** : aucun texte d'interface en dur, tout passe par le fichier de traduction `fr`.
- **Tests** : unitaires sur la logique pure (résolution des droits, calcul de ligne, invalidation des soumissions) ; e2e API (supertest sur une base Postgres de test) pour chaque route ; e2e navigateur (Playwright) pour les parcours.
- **Avant de coder** : lire toutes les sections de « À lire avant de coder » de l'étape.
- **Définition de « terminé »** : `pnpm check` vert, tous les critères d'acceptation cochés, démo de l'étape rejouée, et conception mise à jour si un écart est apparu en cours de route.

## Étapes

### Étape 0 — Socle
**À lire avant de coder**
- [architecture.md §7 Déploiement](architecture.md#7-déploiement)
- [11 — Stack technique](conception/11-transverse.md#stack-technique), [Langue](conception/11-transverse.md#langue)
- [13 — Codes de retour et erreurs](conception/13-api.md#codes-de-retour-et-erreurs)
- [14 — Conventions](conception/14-modele-donnees.md#1-conventions), [Ordre de création](conception/14-modele-donnees.md#13-ordre-de-création-migrations)

- Monorepo, commande de vérification locale ; compléter les commandes de `CLAUDE.md`.
- `docker-compose.yml` : services `proxy` (Caddy), `frontend`, `backend`, `db` ; volumes `db_data`, `uploads`, `backups`.
- Prisma initialisé avec les types `enum`.
- Filtre d'exception global au format d'erreur commun ; i18n côté frontend.

**Critères d'acceptation**
- [x] `docker compose up` démarre les quatre services sans étape manuelle.
- [x] `GET /api/v1/health` répond `200`.
- [x] Une exception non gérée renvoie le format `{ code, message, details }`.
- [x] `packages/shared` est importé par le backend et le frontend.
- [x] `pnpm check` lance toutes les vérifications (format, lint, typage, tests, build) en une commande.
- [x] Les commandes sont documentées dans `CLAUDE.md`.

**Démo** : `docker compose up` sert une page vide en HTTPS local, et `/api/v1/health` répond.

### Étape 1 — Comptes et authentification
**À lire avant de coder**
- [02 — Comptes et authentification](conception/02-comptes-authentification.md) (en entier)
- [13 — Authentification et CSRF](conception/13-api.md#authentification-et-csrf), [routes Authentification](conception/13-api.md#authentification--02), [routes Comptes](conception/13-api.md#comptes--02-04), [Qui protège quoi](conception/13-api.md#6-qui-protège-quoi)
- [14 — Comptes et sessions](conception/14-modele-donnees.md#2-comptes-et-sessions)

- Tables `users`, `sessions`, `login_attempts`.
- Session par cookie, hash argon2, CSRF (`GET /auth/csrf`, en-tête et `Origin`), limitation à 5 échecs (`429`).
- Guard `must_change_credentials`, seed `admin` / `admin`, script CLI de réinitialisation.
- Écrans : connexion, changement d'identifiants forcé.
- Admin : création des comptes avec mot de passe temporaire, modification, réinitialisation, désactivation et réactivation (révocation des sessions).

**Critères d'acceptation**
- [x] Cookie de session `httpOnly`, `SameSite=Strict`, `secure` en production, rotation à la connexion.
- [x] Mots de passe hachés en argon2, jamais renvoyés par l'API.
- [x] 5 échecs sur un compte ou une IP → `429 AUTH_TOO_MANY_ATTEMPTS` avec `details.retryAfter`.
- [x] Requête `POST`/`PUT`/`PATCH`/`DELETE` sans `X-CSRF-Token` valide ou avec un `Origin` étranger → refusée.
- [x] `must_change_credentials` actif : toute route sauf `auth/me`, `auth/change-credentials`, `auth/logout` → `403 CREDENTIALS_CHANGE_REQUIRED`.
- [x] `newUsername` n'est accepté que pour l'admin.
- [x] Création et réinitialisation d'un compte → mot de passe temporaire, `must_change_credentials = true`, sessions révoquées.
- [x] Désactivation ou suppression → sessions révoquées immédiatement ; connexion refusée (`AUTH_ACCOUNT_DISABLED`).
- [x] Le script CLI réinitialise l'admin (mot de passe temporaire, drapeau, sessions révoquées).

**Démo** : [Parcours A](conception/12-parcours.md#parcours-a--première-installation-communauté--les-loups-gris-), étapes 1 et 2.

### Étape 2 — Journal des modifications
**À lire avant de coder**
- [04 — Journal des modifications](conception/04-administration.md#journal-des-modifications), [Points techniques](conception/04-administration.md#points-techniques)
- [13 — routes Supervision](conception/13-api.md#supervision--04)
- [14 — Journal](conception/14-modele-donnees.md#11-journal)

- Table `audit_log` et son trigger d'ajout seul ; `AuditModule` transactionnel.
- Écran du journal, consultable et filtrable.
- Branchement sur les actions de l'étape 1.

Placé tôt pour que chaque étape suivante trace ses actions dès sa création.

**Critères d'acceptation**
- [x] `UPDATE` et `DELETE` sur `audit_log` échouent en base (trigger).
- [x] Aucune route ne modifie ni ne supprime le journal.
- [x] Une modification dont la transaction échoue ne laisse aucune entrée au journal.
- [x] Les actions de l'étape 1 sont tracées, y compris le script CLI.
- [x] `GET /admin/audit` est paginé et filtrable par acteur, action, type de cible et période.

### Étape 3 — Pages minimales, header, footer et réglages
**À lire avant de coder**
- [06 — Page builder](conception/06-page-builder.md) : Structure, Brouillon et publication, Médiathèque, Menu de compte, Destinations des liens, fiches Image, Boutons, Contenu libre, Points techniques
- [04 — Réglages de l'instance](conception/04-administration.md#réglages-de-linstance)
- [13 — routes Navigation et pages](conception/13-api.md#navigation-et-pages--06), [Page builder](conception/13-api.md#page-builder--06), [Médias](conception/13-api.md#médias), [Page assemblée](conception/13-api.md#page-assemblée), [Modifications concurrentes](conception/13-api.md#modifications-concurrentes-admin), [Avertissements à confirmer](conception/13-api.md#avertissements-à-confirmer)
- [14 — Instance, thèmes, médias](conception/14-modele-donnees.md#4-instance-thèmes-médias-sauvegardes), [Pages](conception/14-modele-donnees.md#5-pages)

- Tables `themes` (thème par défaut seul), `pages`, `layout_parts`, `settings`, `media` ; FK `users.personal_page_id` et `pages.published_by`.
- Zones, rangées et colonnes ; brouillon, aperçu, publication transactionnelle ; verrouillage optimiste (`version`).
- `BlockRenderer` et registre des modules, avec les modules sans source : **Image**, **Boutons**, **Contenu libre** (sans valeurs de cellules).
- Médiathèque (`MediaModule`), avertissement si une image est encore utilisée.
- Menu de compte fixe.
- Écran Réglages de l'instance : page d'arrivée, thème par défaut.

**Critères d'acceptation**
- [x] Un brouillon modifié reste invisible des utilisateurs jusqu'à la publication ; une page jamais publiée → `404` pour eux.
- [x] Mise à jour avec une `version` périmée → `409 EDIT_CONFLICT`.
- [x] La `config` de chaque bloc est validée par son schéma de `packages/shared` ; les `block.id` restent stables d'une publication à l'autre.
- [x] Header ou footer contenant un formulaire, un espace ou un chat → `422 BLOCK_NOT_ALLOWED_IN_LAYOUT`.
- [x] Supprimer une image utilisée → `409 CONFIRMATION_REQUIRED` avec les pages concernées ; `confirm: true` passe.
- [x] HTML du Contenu libre nettoyé côté backend (liste blanche).
- [x] Publications de pages, du header et du footer tracées au journal.
- [x] Menu de compte présent sur toutes les pages, indépendant de la configuration.

**Démo** : Parcours A, étape 5 (sans restriction de droits).

### Étape 4 — Groupes, droits et profil
**À lire avant de coder**
- [03 — Droits et groupes](conception/03-droits-groupes.md) (en entier)
- [04 — Espace d'administration](conception/04-administration.md#espace-dadministration), [Visualisation des droits](conception/04-administration.md#visualisation-des-droits)
- [05 — Profil utilisateur](conception/05-profil-utilisateur.md) (page administrative)
- [06 — Liens vers des pages non autorisées](conception/06-page-builder.md#liens-vers-des-pages-non-autorisées), [Brouillon et publication](conception/06-page-builder.md#brouillon-et-publication) (aperçu par groupe)
- [13 — routes Groupes et droits](conception/13-api.md#groupes-et-droits--03), [Profil](conception/13-api.md#profil--05), [Comptes](conception/13-api.md#comptes--02-04)
- [14 — Groupes et droits](conception/14-modele-donnees.md#3-groupes-et-droits)

- Tables `groups`, `user_groups`, `group_permissions` (contrainte `CHECK` page ou espace).
- **Fonction de résolution unique** et `PermissionsGuard`.
- Assemblage filtré côté backend : liens masqués, destination « Ma page personnelle », écran « Aucun espace ne vous est encore attribué ».
- Aperçu du brouillon avec les droits d'un groupe.
- Admin : groupes, membres, page personnelle sur la fiche utilisateur, vues des droits (par utilisateur, par groupe, par ressource, matrice globale).
- Profil : page administrative et changement du mot de passe.

**Critères d'acceptation**
- [x] Une seule fonction de résolution sert au `PermissionsGuard` et aux vues de droits (un test compare les deux).
- [x] Droits effectifs = union des groupes ; aucun droit sans groupe.
- [x] `canCreateTopic` ou `canPost` sur une page → `VALIDATION_FAILED`, et la contrainte `CHECK` le refuse aussi en base.
- [x] Page illisible → `404`, jamais `403`.
- [x] Liens vers une page illisible absents du JSON : bouton retiré, image sans lien ; « Ma page personnelle » résolu, ou retiré si l'utilisateur n'en a pas.
- [x] Utilisateur sans accès à la page d'arrivée → écran « Aucun espace ne vous est encore attribué ».
- [x] L'aperçu `asGroup` est identique à la page vue par un membre de ce seul groupe.
- [x] Profil accessible par propriété, jamais via `PermissionsGuard` ; `PUT /me/password` limité comme la connexion.
- [x] Groupes, membres, permissions et page personnelle tracés au journal.

**Démo** : Parcours A complet (étapes 1 à 6).

### Étape 5 — Excel uploadé, tableaux et catalogues
**À lire avant de coder**
- [08 — Sources de données](conception/08-sources-donnees.md) (en entier)
- [06 — Tableau](conception/06-page-builder.md#tableau), [Catalogue](conception/06-page-builder.md#catalogue), [Contenu libre](conception/06-page-builder.md#contenu-libre), [Plage des tableaux](conception/06-page-builder.md#plage-des-tableaux-et-formulaires-dajout)
- [04 — Sources](conception/04-administration.md#sources)
- [13 — routes Sources](conception/13-api.md#sources--08-04), [Navigation et pages](conception/13-api.md#navigation-et-pages--06) (`/blocks/:blockId/rows`), [Listes, pagination](conception/13-api.md#listes-pagination-tri-recherche), [Page assemblée](conception/13-api.md#page-assemblée)
- [14 — Sources de données](conception/14-modele-donnees.md#7-sources-de-données)

- Tables `sources`, `staging_cells`, `cell_references`, `reimport_previews`.
- Import vers le staging (valeurs et formules), lecture par plage, résolution des liaisons par `cell_references`.
- Écran Sources : upload, téléchargement, état, usages.
- Modules **Tableau** (plage fixe ou extensible ; pagination, tri et recherche côté backend) et **Catalogue**.
- Valeurs de cellules dans le Contenu libre ; indicateur « à recalculer ».

L'Excel uploadé passe en premier parce qu'il se teste sans compte externe ; les sources connectées réutiliseront la même interface de lecture et d'écriture.

**Critères d'acceptation**
- [x] Aucune formule n'est évaluée : seules les valeurs stockées sont lues.
- [x] Liaisons inter-fichiers résolues par `cell_references` (source, feuille, plage), jamais par chemin.
- [x] Pagination, tri et recherche faits côté backend ; `pageSize` plafonné à 200.
- [x] Une plage extensible suit la dernière ligne remplie.
- [x] Image de catalogue introuvable → image par défaut.
- [x] Valeurs du Contenu libre résolues côté backend, avec `needsRecalc`.
- [x] Source injoignable → page renvoyée quand même, bloc en `SOURCE_UNAVAILABLE` et source listée dans `unavailableSources`.
- [x] Retirer une source utilisée → `409 CONFIRMATION_REQUIRED`.
- [x] Le téléchargement met à jour `last_downloaded_at` et est tracé au journal.
- [x] Aucune cellule, feuille ni source n'apparaît dans les réponses destinées aux utilisateurs.

**Démo** : un tableau et un catalogue affichent un `.xlsx` uploadé.

### Étape 6 — Formulaires et soumissions
**À lire avant de coder**
- [09 — Formulaires et soumissions](conception/09-formulaires-soumissions.md) (en entier)
- [06 — Formulaire](conception/06-page-builder.md#formulaire), [Plage des tableaux](conception/06-page-builder.md#plage-des-tableaux-et-formulaires-dajout), [Brouillon et publication](conception/06-page-builder.md#brouillon-et-publication)
- [04 — Tableau de bord des soumissions](conception/04-administration.md#tableau-de-bord-des-soumissions)
- [08 — Formules](conception/08-sources-donnees.md#formules--strategos-ne-calcule-jamais), [Réimport](conception/08-sources-donnees.md#excel-uploadé--version-de-référence-et-réimport)
- [13 — routes utilisateur](conception/13-api.md#formulaires-et-soumissions--09) et [admin](conception/13-api.md#formulaires-et-soumissions--09-1) des formulaires, [Sources](conception/13-api.md#sources--08-04) (réimport), schémas [Formulaire côté utilisateur](conception/13-api.md#formulaire-côté-utilisateur), [Soumission](conception/13-api.md#soumission), [File des soumissions](conception/13-api.md#élément-de-la-file-des-soumissions), [Aperçu de réimport](conception/13-api.md#aperçu-de-réimport)
- [14 — Formulaires et soumissions](conception/14-modele-donnees.md#8-formulaires-et-soumissions)

- Tables `forms`, `form_versions`, `submissions`.
- Trois types de formulaires (modification, ligne, ajout) ; types de champs et règles de validation ; listes saisies ou lues dans une plage ; champs automatiques ; champ « mouvement ».
- Écriture dans le staging, sérialisée par une **file par `source_id`** ; pose transitive de `needs_recalc`.
- Publication : invalidation des soumissions en attente sur changement structurel, avec le nombre affiché avant de publier.
- Réglages immédiats : fermeture, date limite, validation automatique.
- Tableau de bord admin (compteur, file, conflits) ; page « mes soumissions ».
- Avertissements : plage fixe qui ne couvre pas une zone d'ajout, cellule-formule ciblée.
- Réimport d'un Excel uploadé (annuler, écraser, réappliquer).

**Critères d'acceptation**
- [x] Champs automatiques remplis par le serveur ; une valeur envoyée pour eux est ignorée.
- [x] La ligne d'ajout est calculée à la validation (première ligne vide de la zone) ; une ligne remplie à la main n'est jamais écrasée.
- [x] Zone pleine → `422 ADD_ZONE_FULL`, la soumission reste `pending` et refusable.
- [x] Clé absente ou en double → `ROW_KEY_NOT_FOUND` / `ROW_KEY_DUPLICATE` ; mouvement sur une valeur non numérique → `MOVEMENT_NOT_NUMERIC`.
- [x] Deux validations simultanées sur une même source ne prennent pas la même ligne ni la même valeur de départ (test de concurrence).
- [x] Aucune écriture hors des cellules, colonnes ou zone du formulaire (vérifié côté backend).
- [x] Seules les modifications structurelles invalident les soumissions en attente, à la publication, avec leur nombre affiché avant.
- [x] Validation automatique : même chemin de code ; un échec remet la soumission en `pending` ; le journal indique « système » comme valideur.
- [x] Cellule-formule ciblée → `409 CONFIRMATION_REQUIRED` à la validation ; `needs_recalc` posé transitivement.
- [x] Journal : valeur écrite (avant/après pour un mouvement), cellule et source.
- [x] Formulaire non configuré → `404` côté utilisateur.
- [x] Réimport : `lostValidations` listées ; `overwrite` et `reapply` (dans l'ordre de validation) fonctionnent ; jeton expiré → `409 REIMPORT_TOKEN_EXPIRED` ; choix tracé.

**Démo** : [Parcours B](conception/12-parcours.md#parcours-b--tournoi-de-guilde-google-sheets-formulaire-dajout) et [Parcours C](conception/12-parcours.md#parcours-c--gestion-de-stock-entreprise-onedrive) rejoués sur un Excel uploadé.

### Étape 7 — Google Sheets et OneDrive
**À lire avant de coder**
- [08 — Trois types de source](conception/08-sources-donnees.md#trois-types-de-source), [Points techniques](conception/08-sources-donnees.md#points-techniques)
- [04 — Sources](conception/04-administration.md#sources)
- [13 — routes Sources](conception/13-api.md#sources--08-04) (Google, ajout, OneDrive)
- [14 — `sources`](conception/14-modele-donnees.md#sources), [`google_credentials`](conception/14-modele-donnees.md#google_credentials), [`onedrive_credentials`](conception/14-modele-donnees.md#onedrive_credentials)
- [architecture.md §7 Déploiement](architecture.md#7-déploiement) (secrets)

- Adaptateurs Google Sheets puis OneDrive, derrière l'interface commune de l'étape 5.
- Cache mémoire de 30 à 60 secondes, invalidé par `source_id` après chaque écriture ; erreurs `SOURCE_UNAVAILABLE` et `SOURCE_AUTH_EXPIRED`.
- Google : identifiants saisis par l'admin (`google_app`), accès délégué (`drive.file`), table `google_credentials` (jeton chiffré), sélecteur de fichiers, test d'accès.
- OneDrive : accès délégué, table `onedrive_credentials` (jeton chiffré), reconnexion signalée dans l'espace admin.

**Critères d'acceptation**
- [x] Les modules de page et les formulaires ne connaissent pas le type de source (même interface que l'Excel uploadé).
- [x] Cache mémoire de 30 à 60 secondes, invalidé par `source_id` après chaque écriture ; aucune copie en base.
- [x] Sheet non choisi dans le sélecteur de Google → `SOURCE_UNAVAILABLE` au test d'accès.
- [x] Jeton OneDrive chiffré en base, jamais renvoyé par l'API ; le callback vérifie `state`.
- [x] Connexion OneDrive expirée → `SOURCE_AUTH_EXPIRED` et signalement dans l'espace admin.
- [x] Jeton Google chiffré en base, jamais renvoyé par l'API ; le callback vérifie `state` ; connexion expirée signalée comme pour OneDrive.

**Démo** : Parcours B sur un vrai Google Sheet, Parcours C sur OneDrive.

### Étape 8 — Espaces de discussion
**À lire avant de coder**
- [07 — Espaces de discussion](conception/07-discussions.md#espaces-de-discussion), [Modération](conception/07-discussions.md#modération), [Points techniques](conception/07-discussions.md#points-techniques)
- [03 — Modèle par groupes](conception/03-droits-groupes.md#modèle-par-groupes)
- [06 — Espace de discussion](conception/06-page-builder.md#espace-de-discussion)
- [13 — routes Espaces de discussion](conception/13-api.md#espaces-de-discussion--07), [Discussions (modération)](conception/13-api.md#discussions-modération--07), [Médias](conception/13-api.md#médias)
- [14 — Discussions](conception/14-modele-donnees.md#6-discussions)

- Tables `discussion_spaces`, `topics`, `topic_messages`, `message_revisions`, `attachments`.
- Création des espaces à la publication de la page ; droits lire, ouvrir un sujet, poster.
- Sujets : renommer, clore, épingler ; messages modifiés ou supprimés avec archivage ; images jointes.
- Modération : masquage par l'admin, tracé dans le journal.

**Critères d'acceptation**
- [x] Espaces créés à la publication de la page, pas avant.
- [x] Espace illisible → module absent de la page et `404` sur ses routes.
- [x] Lire sans le droit de poster → `403` ; sujet clos → `422 TOPIC_CLOSED`.
- [x] Modifier ou supprimer le message d'un autre → `403 NOT_AUTHOR` ; renommer et clore réservés à l'auteur du sujet ou à l'admin ; épingler réservé à l'admin.
- [x] `message_revisions` écrit avant chaque modification, suppression ou masquage, dans la même transaction.
- [x] Messages masqués ou supprimés exclus des réponses utilisateurs ; masquage tracé au journal.
- [x] Pièces jointes : JPEG, PNG, WebP ou GIF, 5 Mo, 4 par message (`413`, `415`, `422 TOO_MANY_ATTACHMENTS`) ; lisibles par les lecteurs de l'espace seulement.

**Démo** : l'exemple « Taverne » de [07](conception/07-discussions.md#espaces-de-discussion).

### Étape 9 — Chat temps réel
**À lire avant de coder**
- [07 — Chat](conception/07-discussions.md#chat), [Modération](conception/07-discussions.md#modération)
- [06 — Chat](conception/06-page-builder.md#chat)
- [13 — routes Chat](conception/13-api.md#chat--07), [WebSocket du chat](conception/13-api.md#4-websocket-du-chat), [Événement de chat](conception/13-api.md#événement-de-chat)
- [14 — `chats` et `chat_messages`](conception/14-modele-donnees.md#chats-et-chat_messages), [`message_revisions`](conception/14-modele-donnees.md#message_revisions)

- Tables `chats`, `chat_messages`.
- Passerelle WebSocket `/api/v1/ws`, authentifiée par le cookie, avec vérification de lecture de la page.
- Historique paginé par curseur ; modification, suppression et masquage comme dans les sujets.

**Critères d'acceptation**
- [x] Connexion WebSocket authentifiée par le cookie, `Origin` vérifié.
- [x] `chat.join` sans lecture de la page → `chat.error { code: "NOT_FOUND" }`.
- [x] `chat.send` → `chat.ack` avec le même `clientId` ; les autres membres reçoivent `chat.message.created`.
- [x] Modification, suppression et masquage archivés et diffusés.
- [x] Compte désactivé → connexion WebSocket fermée.
- [x] Après reconnexion, `?after=` rattrape les messages manqués.

**Démo** : deux navigateurs échangent en direct sur une page ; un utilisateur sans lecture de la page est refusé.

### Étape 10 — Thèmes complets et notes
**À lire avant de coder**
- [06 — Thèmes](conception/06-page-builder.md#thèmes), [Menu de compte](conception/06-page-builder.md#menu-de-compte)
- [05 — Profil utilisateur](conception/05-profil-utilisateur.md) (notes)
- [13 — routes Profil](conception/13-api.md#profil--05), [Comptes](conception/13-api.md#comptes--02-04) (`/users/:id/notes`), [Page builder](conception/13-api.md#page-builder--06) (`/themes`)
- [14 — `themes`](conception/14-modele-donnees.md#themes), [Profil](conception/14-modele-donnees.md#10-profil)

- Éditeur de thèmes : fond, textes, discussions, boutons, tableaux, cartes ; thème par page.
- Notes personnelles : table `user_notes`, HTML en liste blanche, lecture admin tracée (`notes.read`) et mention permanente côté utilisateur.

**Critères d'acceptation**
- [x] Page sans thème → thème par défaut ; supprimer le thème par défaut → `422 DEFAULT_THEME`.
- [x] Notes : HTML nettoyé (liste blanche), accès par propriété, suppression douce.
- [x] L'admin lit les notes en `GET` seulement ; chaque lecture écrit `notes.read` au journal.
- [x] Mention permanente « visibles par l'administrateur » sur la page de notes.

**Démo** : deux pages sous deux thèmes différents ; une consultation de notes apparaît au journal.

### Étape 11 — Modèles et duplication
**À lire avant de coder**
- [10 — Modèles et duplication](conception/10-modeles-duplication.md) (en entier)
- [09 — Soumissions](conception/09-formulaires-soumissions.md#soumissions) (formulaire non configuré)
- [13 — routes Modèles](conception/13-api.md#modèles--10)
- [14 — Modèles](conception/14-modele-donnees.md#9-modèles)

- Table `templates`.
- Enregistrer et instancier formulaires, pages et sujets, avec réinitialisation des mappings et des plages ; copies en brouillon, sans permission.

**Critères d'acceptation**
- [x] Formulaire instancié : mappings réinitialisés (ajout : ligne de départ, colonnes, nombre max ; ligne : source, plage, clé, bloc relié).
- [x] Page instanciée : en brouillon, sans permission, formulaires et tableaux sans cible masqués, espaces et chats vides.
- [x] Sujet instancié : titre et message d'ouverture seulement.
- [x] Enregistrements et instanciations tracés au journal.

**Démo** : [Parcours D](conception/12-parcours.md#parcours-d--espace-privé-dun-joueur-modèles-profil).

### Étape 12 — Corbeille, sauvegardes et finitions
**À lire avant de coder**
- [04 — Corbeille](conception/04-administration.md#corbeille)
- [11 — Suppression de contenu](conception/11-transverse.md#suppression-de-contenu), [Sauvegardes](conception/11-transverse.md#sauvegardes)
- [13 — Suppression et restauration](conception/13-api.md#suppression-et-restauration), [routes Supervision](conception/13-api.md#supervision--04)
- [14 — `backups`](conception/14-modele-donnees.md#backups)
- [12 — Parcours](conception/12-parcours.md) (A à D)

- Corbeille filtrable et restauration tracée.
- Table `backups` et `BackupModule` : `pg_dump` et archive du volume `uploads`, rétention réglable, téléchargement, commande de restauration.
- Vérification du responsive (mobile, tablette) ; OpenAPI généré depuis le code.

**Critères d'acceptation**
- [x] Corbeille : types prévus par [04](conception/04-administration.md#corbeille), filtrable ; notes absentes ; restauration tracée.
- [x] Sauvegarde quotidienne (`pg_dump` et `uploads`), purge selon la rétention (7 jours par défaut), téléchargement.
- [x] La commande de restauration remet une instance neuve dans l'état sauvegardé.
- [x] Écrans vérifiés sur mobile et tablette.
- [x] Spécification OpenAPI générée depuis le code.

**Démo** : les parcours A à D rejoués en Playwright sur une instance neuve.
