# Bilan de cybersécurité

Bilan réalisé le 8 octobre 2026 sur le commit `cb8b0f6` (V1). Les sections 2 à 8 décrivent l'état du code à cette date. Les corrections apportées depuis sont notées dans la colonne « État » du tableau des constats.

## 1. Synthèse

Strategos est construit avec soin sur la plupart des points classiques : mots de passe, sessions, CSRF, nettoyage du HTML, requêtes SQL, appels vers Google et Microsoft. **Une faille critique annule pourtant l'essentiel de ces protections** : tout utilisateur connecté peut appeler l'API d'administration en changeant la casse de l'adresse. Elle se corrige en quelques lignes et doit l'être avant toute ouverture à des utilisateurs.

Le reste des constats relève du durcissement : en-têtes HTTP absents, conteneurs peu cloisonnés, protections contre l'abus de ressources incomplètes, et volet RGPD assumé comme reporté.

### Les cinq priorités

1. **Corriger `AdminGuard`** (C1) : l'espace admin est ouvert à tout compte.
2. **Supprimer le couple `admin` / `admin` au déploiement** (E1) : sur un serveur exposé, le premier venu peut prendre l'instance.
3. **Poser les en-têtes de sécurité dans Caddy** (M1) : CSP, HSTS, `nosniff`, `frame-ancestors`.
4. **Borner les ressources** (M2 à M5) : verrouillage de compte par un tiers, trames WebSocket, pièces jointes, classeurs compressés.
5. **Durcir les conteneurs et les secrets par défaut** (M6, M7).

### Tableau des constats

| Réf. | Gravité | Constat | État |
|---|---|---|---|
| C1 | Critique | Contournement de `AdminGuard` par la casse de l'URL | **Corrigé** (guard fondé sur `@AdminOnly()`, routage sensible à la casse, test `admin-guard.e2e-spec.ts`) |
| E1 | Élevée | Compte `admin` / `admin` actif au déploiement | Théorique (conception) |
| M1 | Moyenne | Aucun en-tête de sécurité HTTP | **Corrigé** (`Caddyfile` ; CSP rejouée sur les parcours navigateur, sélecteur Google réel non testé) |
| M2 | Moyenne | Un tiers peut verrouiller n'importe quel compte | **Corrigé** (blocage par couple pseudo + adresse ; délai de 15 s au plus sur le pseudo, nul depuis une adresse connue) |
| M3 | Moyenne | Limitation des tentatives contournable par des requêtes simultanées | **Corrigé** (tentative enregistrée avant la vérification, sous verrou) |
| M4 | Moyenne | WebSocket : trames de 60 Mo acceptées, aucun débit maximal | **Corrigé** (trame de 256 Ko, 10 connexions par compte, 20 trames par 10 s) |
| M5 | Moyenne | Aucune limite de débit ni de quota hors connexion ; classeur très compressé | **Corrigé** (300 requêtes par minute et par session ; quota et purge des images libres ; taille décompressée mesurée ; mémoire et processus des conteneurs plafonnés) |
| M6 | Moyenne | Conteneurs en `root`, sans durcissement ; images non épinglées | Lecture de la configuration |
| M7 | Moyenne | Mot de passe PostgreSQL par défaut `strategos` | **Corrigé** (`POSTGRES_PASSWORD` obligatoire) |
| M8 | Moyenne | Sauvegardes en clair, téléchargeables depuis le site | Lecture du code |
| M9 | Moyenne | RGPD : pas d'effacement, journal sans purge | Conception (point connu) |
| M10 | Moyenne | Pas de second facteur pour l'admin | Conception |
| F1 | Faible | Salon de chat non revérifié après retrait d'un droit | Théorique |
| F2 | Faible | Protections qui dépendent de `NODE_ENV=production` | Confirmé |
| F3 | Faible | Session sans durée de vie maximale | Lecture du code |
| F4 | Faible | Dépendances : cinq avis, non atteignables ; `exceljs` peu maintenu | Confirmé (`pnpm audit`) |
| F5 | Faible | Image externe dans un catalogue : traçage des lecteurs | Théorique |
| F6 | Faible | Mot de passe de la base visible dans la liste des processus | Lecture du code |
| I1 | Information | En-tête `X-Powered-By: Express` | **Corrigé** |
| I2 | Information | Poste de développement : fichiers et droits à ranger | **Corrigé** pour les droits (`600`) ; `.env` racine et `secrets/` à ranger à la main |
| I3 | Information | Guide de déploiement : compléments | Lecture |

## 2. Méthode et limites

### Ce qui a été fait

1. **Lecture de la conception** (02, 03, 04, 08, 09, 11, 13, `architecture.md`, `deploiement.md`) pour savoir ce que le code promet.
2. **Revue statique** du backend, surface par surface : authentification, droits, entrées, fichiers, sources, temps réel, journal, puis frontend (rendu du HTML), infrastructure et dépendances.
3. **Tests sur une instance jetable** : backend compilé lancé sur le port 3299, base PostgreSQL éphémère dans un conteneur à part (port 55432, données en mémoire), API Google et Microsoft redirigées vers une adresse morte. La base de développement et les fichiers `.env` n'ont pas été touchés. L'instance et sa base ont été supprimées en fin d'audit.

Un constat est **confirmé** quand une requête réelle l'a montré, **théorique** quand il découle de la lecture du code sans avoir été rejoué.

### Ce qui n'a pas été testé

- **Le cloisonnement entre groupes** (un utilisateur du groupe B qui vise les pages, formulaires, chats et espaces du groupe A). Le scénario a été préparé (deux pages, deux groupes, un classeur piégé), mais le test lui-même n'a pas été exécuté. Les contrôles d'accès correspondants sont donc validés **par lecture du code seulement** (section 5).
- **Le déni de service par classeur compressé, les pièces jointes en masse, l'injection de formule de bout en bout et la restauration d'une archive hostile** : lecture du code seulement.
- **La pile Docker complète** (Caddy, TLS, conteneurs) : auditée par lecture de `docker-compose.yml`, des `Dockerfile` et des `Caddyfile`. Elle n'a pas été lancée, pour ne pas recréer la base Docker locale.
- **Le frontend dans un navigateur** : le rendu a été lu, pas exécuté.
- **Les vraies API Google et Microsoft.**

### Référentiel

Guides de l'ANSSI, cités par leur référence :

- [ANSSI-PA-009](https://messervices.cyber.gouv.fr/documents-guides/anssi-guide-recommandations_mise_en_oeuvre_site_web_maitriser_standards_securite_cote_navigateur-v2.0.pdf) — mise en œuvre d'un site web, standards de sécurité côté navigateur ;
- [ANSSI-PG-078](https://messervices.cyber.gouv.fr/documents-guides/anssi-guide-authentification_multifacteur_et_mots_de_passe.pdf) — authentification multifacteur et mots de passe ;
- [ANSSI-FT-082](https://messervices.cyber.gouv.fr/documents-guides/docker_fiche_technique.pdf) — déploiement de conteneurs Docker ;
- [ANSSI-PA-012](https://messervices.cyber.gouv.fr/documents-guides/anssi-guide-recommandations_securite_architecture_systeme_journalisation.pdf) — architecture d'un système de journalisation ;
- [Guide d'hygiène informatique](https://messervices.cyber.gouv.fr/documents-guides/guide_hygiene_informatique_anssi.pdf) (42 mesures).

Seuls les numéros de recommandation vérifiés dans le document sont cités (R2 et R13 du guide PA-009). Ailleurs, le constat renvoie au guide entier : le numéro exact reste à relever au moment de corriger.

## 3. Modèle de menace

| Attaquant | Ce qu'il possède | Ce qu'il atteint aujourd'hui |
|---|---|---|
| **Anonyme sur Internet** | Rien | La page de connexion, `/auth/csrf`, `/health`, les retours OAuth. Il peut verrouiller un compte dont il connaît le pseudo (M2) et, juste après un déploiement, prendre le compte `admin` (E1). |
| **Utilisateur connecté** | Un compte ordinaire | Par C1, **toute l'administration**. Sans C1 : ses pages, ses notes, ses soumissions ; il peut saturer le serveur (M4, M5). |
| **Contenu piégé** | Un fichier Excel, une cellule, un message | Le nettoyage du HTML et l'échappement des valeurs tiennent (section 5). Reste le classeur très compressé (M5) et l'image externe (F5). |
| **Compte admin compromis** | La session de l'admin | Tout le contenu, les sauvegardes complètes (M8), les jetons d'accès Google courts. Pas d'exécution de code sur le serveur trouvée : les adresses de sources sont filtrées, les fichiers sont stockés sous des noms aléatoires. |

## 4. Constats

### C1 — Contournement de `AdminGuard` par la casse de l'URL (critique, confirmé)

**Principe.** Un contrôle d'accès doit porter sur la même chose que ce que le serveur exécute. Ici, deux composants lisent l'adresse différemment : le routeur Express **ignore la casse** (`/Admin/users` et `/admin/users` mènent au même contrôleur), alors que la garde compare le chemin **en respectant la casse**. Toute adresse que le routeur accepte et que la garde ne reconnaît pas passe sans contrôle. C'est une faille de « contrôle d'accès défaillant », la première famille de risques des applications web.

**Où.** [apps/backend/src/auth/guards.ts:117](../apps/backend/src/auth/guards.ts#L117) :

```ts
const isAdminRoute = req.path === '/api/v1/admin' || req.path.startsWith('/api/v1/admin/');
if (!isAdminRoute || req.auth?.user.isAdmin) return true;
```

`/api/v1/Admin/users` ne commence pas par `/api/v1/admin/` : la garde conclut que ce n'est pas une route admin et laisse passer.

**Scénario.** Mallory a un compte ordinaire, sans aucun groupe. Elle remplace `admin` par `Admin` dans l'adresse.

**Preuve** (instance de test, session de `mallory`) :

| Requête | Réponse |
|---|---|
| `GET /api/v1/admin/users` | `404` (comportement attendu) |
| `GET /api/v1/Admin/users` | `200`, liste de tous les comptes |
| `GET /API/V1/ADMIN/users`, `GET /api/V1/admin/users` | `200` |
| `POST /api/v1/Admin/users` | `201`, compte créé |
| `GET /api/v1/Admin/users/<alice>/notes` | `200`, notes personnelles d'Alice |
| `POST /api/v1/Admin/users/<alice>/reset-password` | `200`, puis connexion réussie en tant qu'Alice |
| `PUT /api/v1/Admin/google/config` | `200`, identifiants Google remplacés |
| `GET /api/v1/Admin/audit`, `/Admin/settings`, `/Admin/backups`, `/Admin/trash` | `200` |
| `DELETE /api/v1/Admin/users/<id>` | `204` |
| `POST /api/v1/Admin/users/<admin>/reset-password` | `422 ADMIN_ACCOUNT_PROTECTED` |

Les variantes encodées (`%61dmin`), avec barre oblique doublée ou finale, répondent `404` : seule la casse passe. Un visiteur sans session reçoit `401` : il faut un compte.

**Impact.** Prise de n'importe quel compte sauf l'admin, lecture de toutes les notes et du journal, modification des pages, des sources et des droits, téléchargement des sauvegardes (donc de toute la base, empreintes de mots de passe comprises). Le compte admin lui-même reste protégé de la réinitialisation, mais plus rien d'autre ne l'est.

**Comment elle a été cherchée.** En relisant la garde, la comparaison de chaînes sur `req.path` a attiré l'attention : c'est le seul contrôle global fondé sur le texte de l'adresse, les autres lisent des métadonnées posées sur les contrôleurs. La question à se poser devant un tel code est toujours : « le routeur et la garde sont-ils d'accord sur ce qu'est cette adresse ? »

**Référence.** Guide d'hygiène informatique, volet « contrôler les accès ».

**Correctif conseillé** (une heure, tests compris). Ne plus décider d'après le texte de l'adresse :

- solution robuste : marquer les contrôleurs admin par une métadonnée (comme `@Public()`), lue par la garde avec `Reflector` ; la décision porte alors sur le contrôleur réellement exécuté ;
- en complément : activer le routage sensible à la casse (`app.set('case sensitive routing', true)`), pour qu'une seule adresse mène à chaque route ;
- ajouter un test e2e qui rejoue le tableau ci-dessus et attend `404` partout.

Après correction, changer les mots de passe et relire le journal si l'instance a déjà eu des utilisateurs.

### E1 — Compte `admin` / `admin` actif au déploiement (élevée, théorique)

**Principe.** Un identifiant par défaut connu de tous n'est pas un secret. Tant qu'il n'a pas été changé, celui qui arrive le premier possède le système.

**Où.** Conception [02](conception/02-comptes-authentification.md#compte-administrateur) et [deploiement.md §6](deploiement.md#6-première-connexion) ; compte créé par la migration des comptes.

**Scénario.** Dès que Caddy obtient son certificat, le nom de domaine apparaît dans les journaux publics de transparence des certificats, que des robots surveillent en continu. Entre `docker compose up` et la première connexion de l'admin, n'importe qui peut se connecter avec `admin` / `admin`, choisir ses propres identifiants et garder l'instance. Le changement forcé protège l'admin distrait, pas la fenêtre qui précède.

**État.** Non rejoué contre un serveur exposé ; la connexion `admin` / `admin` a bien été constatée sur l'instance de test. Sur un réseau interne, le risque est faible.

**Référence.** ANSSI-PG-078 (mots de passe par défaut) ; guide d'hygiène informatique.

**Correctif conseillé** (une demi-journée). Au premier démarrage, générer un mot de passe temporaire aléatoire et l'afficher dans les journaux du conteneur (comme le fait déjà `reset-admin`), ou le lire dans une variable `.env` obligatoire. La conception 02 est à mettre à jour en même temps.

### M1 — Aucun en-tête de sécurité HTTP (moyenne, confirmé)

**Principe.** Les en-têtes de sécurité sont des consignes données au navigateur : n'exécuter que les scripts du site (CSP), ne jamais revenir en HTTP (HSTS), ne pas deviner le type d'un fichier (`nosniff`), refuser d'être affiché dans le cadre d'un autre site (`frame-ancestors`). Ils ne corrigent aucune faille, mais ils limitent les dégâts de la prochaine.

**Où.** [Caddyfile](../Caddyfile), [apps/frontend/Caddyfile](../apps/frontend/Caddyfile) et [apps/backend/src/setup.ts](../apps/backend/src/setup.ts) : aucun en-tête n'est posé. Seuls les fichiers servis (images, pièces jointes) reçoivent `nosniff` et une CSP.

**Preuve.** En-têtes de `GET /api/v1/health` : `content-type`, `etag`, `x-powered-by: Express`, rien d'autre.

**Scénario.** Le HTML des messages, des notes et du contenu libre est injecté tel quel dans la page (`dangerouslySetInnerHTML`). Tout repose sur le nettoyage fait par le backend. S'il a un jour un défaut, ou si une dépendance en a un, rien n'arrête le script injecté : une CSP stricte l'aurait bloqué.

**Atténuation existante.** Le cookie `SameSite=Strict` n'est pas envoyé dans un cadre tiers, ce qui réduit beaucoup le détournement de clic.

**Référence.** ANSSI-PA-009, R2 (HSTS) et R13 (CSP).

**Correctif conseillé** (deux heures, à valider dans un navigateur). Dans le `Caddyfile` du proxy :

```
header {
	Strict-Transport-Security "max-age=31536000"
	X-Content-Type-Options "nosniff"
	Referrer-Policy "same-origin"
	Content-Security-Policy "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
	-Server
}
```

La CSP est à ajuster : le sélecteur de fichiers Google charge des scripts de Google sur l'écran Sources, et les catalogues affichent des images externes.

### M2 — Un tiers peut verrouiller n'importe quel compte (moyenne, confirmé)

**Principe.** Bloquer un compte après des échecs protège du devinage, mais donne à l'attaquant un interrupteur : il lui suffit d'échouer exprès.

**Où.** [apps/backend/src/auth/login-throttle.service.ts:33](../apps/backend/src/auth/login-throttle.service.ts#L33) : le blocage par pseudo s'applique quelle que soit l'adresse d'où viennent les échecs.

**Preuve.** Cinq échecs sur `alice` depuis une adresse, puis connexion d'Alice avec le bon mot de passe depuis une autre : `429 AUTH_TOO_MANY_ATTEMPTS`, `retryAfter: 900`.

**Scénario.** Un anonyme qui connaît le pseudo de l'admin envoie une requête fausse toutes les quinze minutes : l'admin ne peut plus jamais se connecter par le web. Les pseudos ne sont pas secrets (ils s'affichent dans les discussions).

**Second effet.** Le blocage par adresse IP pénalise les utilisateurs qui partagent une adresse : derrière un proxy d'entreprise ou un second reverse proxy, tous arrivent avec la même. C'est le cas à prévoir pour un déploiement en réseau interne.

**Référence.** ANSSI-PG-078 (limitation des tentatives).

**Correctif conseillé** (une demi-journée). Bloquer le couple pseudo + adresse plutôt que le pseudo seul, et remplacer le blocage sec du pseudo par un délai croissant. Documenter le réglage `trust proxy` quand un autre proxy précède Caddy.

### M3 — Limitation contournable par des requêtes simultanées (moyenne, confirmé)

**Principe.** « Vérifier puis agir » en deux temps laisse une fenêtre : toutes les requêtes arrivées avant le premier enregistrement voient un compteur à zéro. C'est une situation de compétition.

**Où.** [apps/backend/src/auth/auth.service.ts:36](../apps/backend/src/auth/auth.service.ts#L36) (`assertAllowed`), puis l'enregistrement de l'échec ligne 47, après le calcul Argon2.

**Preuve.** 40 tentatives envoyées ensemble sur un même pseudo, depuis une même adresse : 26 réponses `401` (mot de passe réellement testé) et 14 `429`. La limite annoncée est de 5.

**Impact.** Limité : cinq fois plus d'essais par fenêtre, ce qui ne suffit pas contre un mot de passe de 12 caractères. Mais chaque essai coûte un calcul Argon2 (64 Mo de mémoire) : une rafale occupe le serveur.

**Correctif conseillé** (deux heures). Enregistrer la tentative **avant** de vérifier le mot de passe, puis la marquer réussie ; ou sérialiser par pseudo avec un verrou consultatif, comme le fait déjà `SourceWriteService`.

### M4 — WebSocket : trames énormes et débit illimité (moyenne, confirmé)

**Principe.** Tout ce qu'un client peut envoyer doit avoir une taille et une fréquence maximales, vérifiées avant d'allouer de la mémoire.

**Où.** [apps/backend/src/chat/chat.gateway.ts:51](../apps/backend/src/chat/chat.gateway.ts#L51) : `@WebSocketGateway({ path })` sans `maxPayload`. La bibliothèque `ws` accepte alors 100 Mo par trame. La longueur du message n'est contrôlée qu'après réception et analyse JSON complètes.

**Preuve.** Une trame de 60 Mo envoyée par un utilisateur connecté est reçue en entier, analysée, puis refusée (`VALIDATION_FAILED`) ; la mémoire du processus est montée à environ 300 Mo. 300 connexions simultanées d'un même compte ont été acceptées. Aucune limite d'envoi de messages.

**Scénario.** Un utilisateur ouvre quelques dizaines de connexions et envoie des trames de 90 Mo : le conteneur manque de mémoire et redémarre, pour tout le monde. Sur la machine de 2 Go conseillée par le guide de déploiement, une vingtaine de trames suffisent.

**Ce qui tient.** Origine et session sont vérifiées à l'ouverture (testé : sans `Origin`, avec une origine étrangère, sans cookie, ou avec un cookie valide et une origine étrangère, la connexion est fermée). Les trames mal formées ne font pas tomber le serveur ; elles laissent seulement une erreur dans le journal.

**Correctif conseillé** (deux heures). `maxPayload` à 64 Ko, nombre de connexions par compte plafonné, et un débit maximal de messages par connexion. Valider aussi `body` dans `join` et `leave` (aujourd'hui une trame sans `data` lève une exception interne).

### M5 — Pas de limite de débit ni de quota hors connexion (moyenne, théorique)

**Principe.** Même logique que M4, côté HTTP et stockage.

**Où et quoi.**

- **Aucune limite de débit générale** : seule la connexion est limitée. Soumissions, messages, sujets, notes et pièces jointes peuvent être créés en boucle.
- **Pièces jointes** ([attachments.service.ts:37](../apps/backend/src/discussions/attachments.service.ts#L37)) : tout utilisateur connecté, même sans droit sur le moindre espace, peut envoyer des images de 5 Mo sans plafond. Les images jamais rattachées à un message ne sont pas purgées. Le disque se remplit, et les sauvegardes avec lui.
- **Classeur très compressé** ([excel-parser.ts:130](../apps/backend/src/sources/excel-parser.ts#L130)) : la limite de 20 Mo porte sur le fichier compressé. `exceljs` le décompresse en entier en mémoire ; un `.xlsx` de quelques Mo peut en occuper plusieurs Go. Seul l'admin importe des classeurs, mais il importe volontiers un fichier reçu d'un tiers, et un Google Sheet « par lien » est téléchargé sans qu'il ait vu son contenu.

**État.** Lecture du code ; aucun de ces trois points n'a été rejoué.

**Référence.** Guide d'hygiène informatique (disponibilité) ; ANSSI-FT-082 (limites de ressources des conteneurs).

**Correctif conseillé** (un à deux jours). Limite de débit globale par session (`@nestjs/throttler`) ; quota de pièces jointes par compte et purge quotidienne des images libres de plus de 24 h ; contrôle de la taille décompressée avant d'appeler `exceljs` (`fflate` est déjà une dépendance et donne la taille de chaque entrée) ; limites `mem_limit` et `pids_limit` dans le Compose.

### M6 — Conteneurs peu cloisonnés (moyenne, lecture de la configuration)

**Principe.** Un conteneur n'est pas une frontière étanche. On réduit ce qu'un attaquant entré dans le backend peut faire ensuite : pas de `root`, pas de droits inutiles, pas d'accès direct aux autres services.

**Où.** [apps/backend/Dockerfile](../apps/backend/Dockerfile), [docker-compose.yml](../docker-compose.yml).

- Le backend tourne en **`root`** (pas d'instruction `USER`).
- Ni `read_only`, ni `cap_drop: [ALL]`, ni `no-new-privileges`, ni limite de mémoire.
- **Un seul réseau** : le proxy et le frontend peuvent joindre la base directement.
- Images désignées par **étiquette** (`node:22-alpine`, `caddy:2-alpine`, `postgres:18-alpine`) : le contenu change d'une construction à l'autre.
- `COPY . .` : le `.dockerignore` écarte `.env` à la racine, mais pas `apps/backend/.env` ni `secrets/`, qui entrent dans la couche de construction (pas dans l'image finale).

**Référence.** ANSSI-FT-082.

**Correctif conseillé** (une demi-journée). `USER node` dans l'image finale, options de durcissement dans le Compose, deux réseaux (`front` pour proxy, frontend et backend ; `back` pour backend et base), images épinglées par empreinte `@sha256:…`, `.dockerignore` complété par `**/.env` et `secrets`.

### M7 — Mot de passe PostgreSQL par défaut (moyenne, lecture de la configuration)

**Où.** [docker-compose.yml](../docker-compose.yml) : `${POSTGRES_PASSWORD:-strategos}`. Si `.env` est absent ou incomplet, la base démarre avec `strategos` / `strategos`, sans avertissement.

**Atténuation.** La base n'est pas publiée hors du réseau Docker en production. Le risque apparaît combiné à M6 (réseau unique) ou à `pnpm db:up` sur un serveur.

**Correctif conseillé** (dix minutes). `${POSTGRES_PASSWORD:?à définir dans .env}` : le Compose refuse alors de démarrer sans mot de passe.

### M8 — Sauvegardes en clair, téléchargeables depuis le site (moyenne, lecture du code)

**Principe.** Une sauvegarde est une copie complète du système : elle mérite au moins la protection de l'original.

**Où.** [apps/backend/src/backups/backup.service.ts](../apps/backend/src/backups/backup.service.ts), route `GET /admin/backups/:id/download`.

L'archive contient toute la base (empreintes Argon2, notes personnelles, journal, messages masqués ou supprimés) et tous les fichiers, sans chiffrement. Le guide de déploiement invite à la copier chaque semaine sur un PC ou un stockage en ligne. Avec C1, tout utilisateur peut la télécharger ; sans C1, une session admin volée suffit.

**Ce qui tient.** La clé de chiffrement des jetons Google et OneDrive n'est pas dans l'archive : ces jetons restent illisibles.

**Référence.** Guide d'hygiène informatique (sauvegardes).

**Correctif conseillé** (une journée). Chiffrer l'archive avec une phrase secrète fournie au déploiement (`age` ou `gpg`), et demander le mot de passe de l'admin avant un téléchargement.

### M9 — Données personnelles (moyenne, point connu de la conception)

Voir la section 6.

### M10 — Pas de second facteur pour l'admin (moyenne, conception)

Le compte admin a tous les pouvoirs et ne repose que sur un mot de passe de 12 caractères, sans vérification contre les mots de passe courants. ANSSI-PG-078 recommande l'authentification multifacteur pour les comptes à privilèges. **Correctif conseillé** (deux jours) : code TOTP facultatif puis obligatoire pour l'admin, et refus des mots de passe les plus répandus.

### F1 — Salon de chat non revérifié (faible, théorique)

[chat-realtime.service.ts:64](../apps/backend/src/chat/chat-realtime.service.ts#L64) diffuse à tous les sockets entrés dans le salon. Le droit de lire la page n'est vérifié qu'à l'entrée ; la revalidation périodique ne porte que sur la session. Un utilisateur retiré d'un groupe, ou dont la page est dépubliée, continue de recevoir les messages jusqu'à sa déconnexion. **Correctif** : revérifier l'accès au salon dans `revalidateAll`.

### F2 — Protections dépendantes de `NODE_ENV` (faible, confirmé)

Le drapeau `Secure` du cookie et la fermeture de `/api/docs` n'existent que si `NODE_ENV` vaut exactement `production`. Sur l'instance de test (`NODE_ENV=test`), `/api/docs` et `/api/docs-json` répondent sans session, et le cookie part sans `Secure`. Le Compose pose bien `production`, mais une installation manuelle l'oublie facilement. **Correctif** : inverser la logique (protégé par défaut, ouvert seulement si `development`).

### F3 — Session sans durée maximale (faible, lecture du code)

La session glisse de 7 jours à chaque activité, sans limite absolue : un cookie volé reste valable tant qu'il sert. **Correctif** : durée maximale (30 jours par exemple) et liste des sessions ouvertes dans le profil.

### F4 — Dépendances (faible, confirmé)

`pnpm audit` signale cinq avis (trois élevés, deux modérés), tous dans des dépendances indirectes :

| Paquet | Chemin | Atteignable ? |
|---|---|---|
| `mysql2` (2 avis) | `prisma` | Non : la base est PostgreSQL |
| `deepmerge-ts` | `prisma` › `@prisma/config` | Non : outil de configuration, pas d'entrée utilisateur |
| `source-map-js` | `sanitize-html` › `postcss` | Non : aucune source map fournie par un utilisateur |
| `uuid` | `exceljs` | Non : fonction non appelée avec un tampon externe |

À surveiller : **`exceljs` 4.4.0** analyse des fichiers fournis de l'extérieur et n'a plus de version récente. Les paquets à jour le sont à une version corrective près. Les scripts d'installation sont limités à quatre paquets (`onlyBuiltDependencies`), ce qui est une bonne pratique. **Correctif** : `pnpm audit` dans `pnpm check`, et `pnpm.overrides` pour les paquets indirects.

### F5 — Image externe dans un catalogue (faible, théorique)

[cell-format.ts:80](../apps/backend/src/sources/cell-format.ts#L80) accepte un lien web comme image. Quiconque écrit dans la colonne (par un formulaire validé) peut y mettre l'adresse d'un serveur à lui et relever l'adresse IP et l'heure de visite de chaque lecteur. Les liens `javascript:` et `data:` sont bien refusés. **Correctif** : n'autoriser que la médiathèque, ou une liste de domaines.

### F6 — Mot de passe de la base dans les processus (faible, lecture du code)

`pg_dump` et `pg_restore` reçoivent l'adresse complète de la base, mot de passe compris, en argument ([backup.service.ts:89](../apps/backend/src/backups/backup.service.ts#L89)). Elle est lisible dans la liste des processus du conteneur pendant la sauvegarde. **Correctif** : passer le mot de passe par la variable `PGPASSWORD`.

### I1 — `X-Powered-By: Express`

Révèle la technologie. `app.disable('x-powered-by')` dans `setup.ts`.

### I2 — Poste de développement

- **Historique git propre** : aucun `.env`, aucune clé, aucun secret Google ou Azure dans les 54 commits (recherche par motifs).
- `.env` et `apps/backend/.env` sont lisibles par tous les comptes de la machine (`664`) : passer à `600`.
- Le `.env` de la racine décrit encore un compte de service Google (`secrets/google-service-account.json`) qui n'existe plus dans le code ; le dossier `secrets/`, vide, appartient à `root`. À supprimer et réaligner sur `.env.example`.

### I3 — Guide de déploiement

- Le guide ne couvre que le serveur exposé. Le **réseau interne**, pourtant prévu, n'y est pas décrit (certificat interne de Caddy, pas de port 80 public, adresse partagée derrière un proxy : voir M2).
- `curl … | sudo sh` et l'ajout au groupe `docker` (équivalent `root`) méritent un avertissement.
- Rien sur SSH (clés seulement, pas de connexion `root`), ni sur les mises à jour automatiques du système.

## 5. Ce qui tient

Ces contrôles ont été vérifiés et sont corrects. Ils valent d'être compris autant que les failles.

| Sujet | Pourquoi ça résiste | Vérification |
|---|---|---|
| **Mots de passe** | Argon2id (64 Mo, 3 passes par défaut) : coûteux à tester en masse, même base volée. | Lecture |
| **Énumération des comptes** | Compte inconnu : vérification contre une empreinte factice, donc même durée. Compte désactivé signalé seulement avec le bon mot de passe. | Testé : 75 à 115 ms dans les deux cas |
| **Sessions** | Jeton de 256 bits ; la base ne garde que son empreinte SHA-256, donc une fuite de la base ne donne aucune session. Cookie `HttpOnly`, `SameSite=Strict`. Rotation à la connexion, révocation à la désactivation. | Lecture, cookie observé |
| **CSRF** | Trois barrières : `SameSite=Strict`, en-tête `Origin` obligatoire et connu, jeton HMAC comparé en temps constant. | Lecture |
| **Changement forcé** | Garde fondée sur des métadonnées de contrôleur, pas sur l'adresse. | Testé : `403` partout avant le changement |
| **WebSocket** | Origine et session vérifiées à l'ouverture. | Testé (quatre cas refusés) |
| **Injection SQL** | Prisma partout ; les requêtes brutes utilisent des gabarits paramétrés, aucune concaténation. | Lecture des 12 appels |
| **XSS stocké** | Liste blanche stricte (`sanitize-html`) à l'écriture ; liens `http`, `https`, `mailto` seulement ; images de la médiathèque seulement. | Testé : `<script>`, `onerror`, `onclick`, `javascript:`, `<iframe>`, `<style>` retirés |
| **Valeurs de cellule** | Jamais insérées comme HTML : remplacées par un repère côté backend, échappées côté frontend. Un attribut piégé est échappé à l'enregistrement. | Testé (valeur `<img onerror>` renvoyée comme texte) |
| **Aucun accès au document** | La page assemblée ne contient ni source, ni feuille, ni cellule. | Constaté sur la page assemblée |
| **Injection de formule** | Google : écriture `RAW`. OneDrive et script : apostrophe en tête. Le texte `=…` d'un utilisateur ne devient jamais une formule. | Lecture |
| **SSRF** | Adresses de script et de Sheet filtrées par des motifs ancrés sur `script.google.com` et `docs.google.com` ; aucune adresse libre. | Lecture |
| **OAuth** | `state` aléatoire, à usage unique, valable 10 minutes, lié à l'admin. Jetons chiffrés en AES-256-GCM, clé hors de la base et des sauvegardes. | Lecture |
| **Fichiers envoyés** | Type lu dans le contenu, pas dans le nom ; nom de stockage aléatoire ; service avec `nosniff` et CSP `default-src 'none'`. | Lecture |
| **Erreurs** | Codes stables, cause journalisée, jamais renvoyée. | Constaté |
| **Validation** | Champs inconnus refusés (`forbidNonWhitelisted`) : pas d'affectation de masse. | Constaté (`whitelistValidation`) |
| **Propriété** | Notes, soumissions et pièces jointes filtrées par `userId` dans la requête elle-même. | Lecture seule (voir limites) |
| **Droits par ressource** | Une seule règle (`resolveRights`), `404` sur l'illisible. | Lecture seule (voir limites) |
| **Protection de l'admin** | Ni réinitialisation, ni désactivation par le web. | Testé (`422`), même à travers C1 |

## 6. Volet RGPD

La conception [11](conception/11-transverse.md#données-personnelles-rgpd) l'annonce : rien n'est prévu en V1. Voici ce que cela recouvre.

| Sujet | État | Conséquence |
|---|---|---|
| **Données collectées** | Pseudo, mot de passe (empreinte), adresse IP et navigateur (sessions, tentatives de connexion, journal), notes, messages, soumissions. | Peu de données, pas d'e-mail : bon point de minimisation. L'adresse IP reste une donnée personnelle. |
| **Effacement** | Suppression douce partout ; aucune suppression définitive. | Le droit à l'effacement ne peut pas être honoré. Un message « supprimé » reste en base, ainsi que ses anciennes versions (`message_revisions`). |
| **Journal** | Ajout seul, sans purge. Il garde les valeurs des soumissions et les adresses IP. | Conservation illimitée, à borner (ANSSI-PA-012 recommande de définir une durée). |
| **Sauvegardes** | Copie complète, 7 jours par défaut, plus les copies emportées par l'admin. | Une donnée effacée reste dans les archives : à dire dans la politique de conservation. |
| **Notes personnelles** | Lisibles par l'admin, lecture tracée. | À annoncer clairement à l'utilisateur dans l'interface. |
| **Sous-traitants** | Google et Microsoft dès qu'une source connectée reçoit des soumissions. | Transfert hors de l'instance, à mentionner. |
| **Tentatives de connexion** | Purgées après 24 h. | Correct. |

**À prévoir avant un usage en entreprise** : une purge définitive de la corbeille après un délai, l'anonymisation d'un compte supprimé (pseudo remplacé, messages conservés), une durée de conservation du journal, un export des données d'un compte, et une page d'information.

## 7. Volet déploiement : réseau interne ou serveur exposé

| Point | Réseau interne | Serveur exposé (VPS) |
|---|---|---|
| C1 | Critique : la menace vient justement des utilisateurs | Critique |
| E1 (`admin` / `admin`) | Faible | Élevée |
| M1 (en-têtes) | Utile | Nécessaire ; HSTS demande un vrai certificat |
| M2 (verrouillage) | Adresse partagée : un utilisateur maladroit bloque les autres | Un anonyme bloque l'admin |
| M4, M5 (ressources) | Utilisateurs identifiés, risque moindre | Tout compte compromis suffit |
| TLS | Certificat interne de Caddy : à installer sur les postes, sinon les utilisateurs s'habituent à ignorer l'alerte | Let's Encrypt automatique |
| Pare-feu | Limiter l'accès au sous-réseau prévu | 80 et 443 seulement ; SSH par clé |
| Sauvegardes | Copie sur un autre support du réseau | Copie hors du serveur, chiffrée (M8) |

## 8. Plan d'action proposé

| Ordre | Action | Constats | Effort |
|---|---|---|---|
| 1 | Corriger `AdminGuard`, ajouter le test e2e | C1 | 1 h |
| 2 | Mot de passe admin initial aléatoire | E1 | ½ j |
| 3 | En-têtes dans Caddy, `x-powered-by` retiré | M1, I1 | 2 h |
| 4 | `POSTGRES_PASSWORD` obligatoire, `.dockerignore`, droits des `.env` | M7, M6, I2 | 1 h |
| 5 | `maxPayload` et plafonds du WebSocket | M4 | 2 h |
| 6 | Limitation des tentatives : couple pseudo + adresse, enregistrement avant vérification | M2, M3 | ½ j |
| 7 | Limite de débit globale, quota et purge des pièces jointes, taille décompressée des classeurs | M5 | 1 à 2 j |
| 8 | Durcissement des conteneurs, deux réseaux, images épinglées | M6 | ½ j |
| 9 | Rejouer le test de cloisonnement entre groupes, non exécuté dans ce bilan | Section 2 | ½ j |
| 10 | Chiffrement des sauvegardes | M8 | 1 j |
| 11 | Second facteur pour l'admin | M10 | 2 j |
| 12 | RGPD : purge, anonymisation, conservation du journal | M9 | plusieurs jours |
| 13 | Points faibles restants et guide de déploiement | F1 à F6, I3 | 1 j |

Les lignes 1 à 4 tiennent en une journée et suffisent à lever les risques les plus graves.
