# Strategos

Site web construit par un administrateur au-dessus de fichiers Excel, Google Sheets et OneDrive : les utilisateurs **lisent** via des pages et **écrivent** via des formulaires, jamais dans le document lui-même.

Strategos s'adresse aussi bien aux communautés de jeux en ligne qu'aux entreprises. L'administrateur compose tout l'environnement (pages, navigation, formulaires, droits), et Strategos fait écran entre les utilisateurs et les fichiers : personne ne peut casser une structure ou une formule du document. Le site s'installe et se lance en une commande Docker.

La conception complète est dans [references/](references/) ; l'ordre de réalisation est décrit dans [references/plan-realisation.md](references/plan-realisation.md).

## Fonctionnalités

### Pour les utilisateurs

- **Pages** composées par l'admin avec des modules : image, boutons, contenu libre, tableau et catalogue alimentés par les sources de données ([06](references/conception/06-page-builder.md)).
- **Formulaires** : une soumission est une proposition que l'admin valide avant qu'elle soit écrite dans le document. Sur un formulaire choisi, l'admin peut activer la validation automatique. Chaque utilisateur suit ses propositions dans « mes soumissions » ([09](references/conception/09-formulaires-soumissions.md)).
- **Espaces de discussion** (sujets, messages, images jointes) et **chat en temps réel** placés sur les pages ([07](references/conception/07-discussions.md)).
- **Profil** et **notes personnelles**, accessibles depuis un menu de compte toujours présent ([05](references/conception/05-profil-utilisateur.md)).

### Pour l'administrateur (compte unique)

- **Page builder** : brouillon puis publication, header et footer partagés, thèmes, médiathèque ([06](references/conception/06-page-builder.md)).
- **Sources de données** : Excel uploadé, Google Sheets, OneDrive. Les données sont mises en cache et les fichiers peuvent être réimportés. L'admin voit et modifie les cellules d'un Excel uploadé dans une grille. Strategos écrit des valeurs brutes et ne calcule jamais de formule ([08](references/conception/08-sources-donnees.md)).
- **Validation des soumissions** : les écritures sont sérialisées par source ([09](references/conception/09-formulaires-soumissions.md)).
- **Comptes, groupes et droits de lecture** sur les pages et les espaces : une ressource illisible n'apparaît pas et renvoie `404` ([02](references/conception/02-comptes-authentification.md), [03](references/conception/03-droits-groupes.md)).
- **Modération** des discussions et du chat ([07](references/conception/07-discussions.md)).
- **Modèles** pour réutiliser pages, formulaires et sujets de discussion ([10](references/conception/10-modeles-duplication.md)).
- **Journal des modifications**, **corbeille** (suppression douce et restauration) et **réglages** de l'instance : page d'arrivée, thème par défaut, rétention des sauvegardes ([04](references/conception/04-administration.md)).
- **Sauvegardes** nocturnes (base et fichiers envoyés), téléchargement et restauration ([11](references/conception/11-transverse.md)).

## Architecture et parties du projet

Quatre conteneurs Docker Compose : le proxy **Caddy** (HTTPS automatique) sert le **frontend** React et le **backend** NestJS, qui s'appuie sur **PostgreSQL 18**. Seul le backend parle aux sources (Excel uploadés, API Google Sheets, Microsoft Graph). Le frontend l'appelle en REST et en WebSocket pour le chat. Les données persistent dans les volumes `db_data`, `uploads` et `backups`. Détails : [references/architecture.md](references/architecture.md).

```
navigateur ──HTTPS──> proxy (Caddy) ──> frontend (React)
                                   └──> backend (NestJS) ──> PostgreSQL
                                                         ├──> volumes uploads / backups
                                                         └──> Google Sheets · OneDrive
```

Monorepo [pnpm](https://pnpm.io/) :

| Paquet | Rôle |
|---|---|
| `apps/backend` | API NestJS, Prisma 7, ESM |
| `apps/frontend` | Interface React (Vite) |
| `packages/shared` | Contrats partagés (schémas de blocs, codes d'erreur, enums, DTO) |
| `e2e` | Tests navigateur Playwright (parcours de bout en bout, responsive) |

Le backend (`apps/backend/src`) compte un module par domaine :

| Domaine | Modules | Rôle |
|---|---|---|
| Comptes | `auth`, `users` | Sessions, CSRF, changement d'identifiants, gestion des comptes |
| Droits | `groups`, `permissions` | Groupes, calcul unique des droits effectifs, `PermissionsGuard` |
| Pages | `pages`, `themes`, `media` | Brouillon et publication, assemblage filtré par lecteur, thèmes, médiathèque |
| Échanges | `discussions`, `chat` | Espaces de discussion, chat WebSocket (`/api/v1/ws`), modération |
| Données | `sources`, `forms` | Lecture et écriture des sources, cache, réimport, formulaires et soumissions |
| Instance | `settings`, `templates`, `audit`, `trash`, `backups`, `profile` | Réglages, modèles, journal, corbeille, sauvegardes, profil et notes |
| Serveur | `cli` | Commandes `reset-admin`, `run-backup`, `restore-backup`, `openapi` |

Le frontend (`apps/frontend/src`) sépare les pages utilisateur (`pages/`), les écrans admin (`pages/admin/`), l'éditeur de pages (`builder/`) et le rendu des modules (`render/`). Tous les textes sont dans `i18n/fr.json`.

## Prérequis

- **Node ≥ 22.12** et **pnpm** (activé via Corepack) :
  ```bash
  corepack enable pnpm
  # ou, si ~/.local/bin est dans le PATH :
  corepack enable --install-directory ~/.local/bin pnpm
  ```
- **Docker** et **Docker Compose** (pour le lancement en production locale et pour la base en dev).

## Lancement en production locale (une seule commande)

Tout le site derrière un proxy Caddy en HTTPS.

```bash
cp .env.example .env            # ajuster si besoin (valeurs par défaut adaptées au local)
docker compose up --build
```

Le site est alors servi sur **https://localhost** (certificat interne Caddy ; accepter l'avertissement du navigateur).

### Se connecter en administrateur

Sur une **base neuve**, le compte administrateur est créé par la migration :

- **Identifiants initiaux : `admin` / `admin`.**
- À la **première connexion**, le pseudo et le mot de passe doivent obligatoirement être changés — le compte ne s'appelle donc plus forcément `admin` ensuite.

> ⚠️ `admin` / `admin` ne fonctionne **que sur une base jamais utilisée**. Le seed n'est joué qu'une fois : sur une base existante (le volume `strategos_db_data` survit à une simple suppression des images), le pseudo et le mot de passe sont ceux définis à la première connexion. Pour repartir de zéro : `docker compose down -v` (efface **toutes** les données) puis `docker compose up --build`.

Si l'admin perd (ou oublie) son mot de passe, la récupération se fait **uniquement depuis le serveur** (pas de récupération par le web). La commande génère un mot de passe temporaire pour le compte admin, à changer à la connexion suivante :

```bash
docker compose exec backend node dist/src/cli/reset-admin.js
```

## Lancement en développement (rechargement à chaud)

```bash
pnpm install                                 # compile shared + génère le client Prisma
pnpm db:up                                   # Postgres sur 127.0.0.1:5432
cp apps/backend/.env.example apps/backend/.env   # une seule fois
pnpm dev
```

- Frontend : **http://localhost:5173**
- Backend : **http://localhost:3000**
- Documentation de l'API (Swagger) : **http://localhost:3000/api/docs**

> Après un `docker compose up` (qui recrée la base sans exposer son port), relancer `pnpm db:up` pour retrouver Postgres en local.

## Sources connectées (facultatif)

Non requises pour démarrer. Voir les commentaires de [.env.example](.env.example) et [apps/backend/.env.example](apps/backend/.env.example) :

- **Google Sheets** : déposer la clé du compte de service dans `secrets/google-service-account.json` (montée en lecture seule, jamais dans l'image ni en base).
- **OneDrive** : application Azure (`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`) et clé de chiffrement du jeton `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`).

## Vérifier avant de committer

Pas de CI : tout se vérifie en local (base de test via `pnpm db:up`).

```bash
pnpm check        # format:check + lint + typecheck + test + test:e2e + build
```

Étapes individuelles :

| But | Commande |
|---|---|
| Lint / format | `pnpm lint` · `pnpm format` · `pnpm format:check` |
| Typage | `pnpm typecheck` |
| Tests unitaires | `pnpm test` |
| Tests e2e API | `pnpm test:e2e` |
| Tests navigateur (parcours A à D, responsive) | `pnpm test:browser:install` une fois, puis `pnpm test:browser` (hors `pnpm check`) |
| Spécification OpenAPI | `pnpm openapi` → `references/openapi.json` |

## Exploitation (Docker)

Mise en production sur un serveur ou une machine à domicile (domaine, HTTPS, sauvegardes, mises à jour) : [references/deploiement.md](references/deploiement.md).

| But | Commande |
|---|---|
| Réinitialiser le compte admin | `docker compose exec backend node dist/src/cli/reset-admin.js` |
| Sauvegarde immédiate | `docker compose exec backend node dist/src/cli/run-backup.js` (sinon chaque nuit à 3 h, fuseau `TZ`) |
| Restaurer une sauvegarde | `docker compose stop backend`, puis `docker compose run --rm backend node dist/src/cli/restore-backup.js /data/backups/<archive>.tar.gz`, puis `docker compose start backend` |

## Documentation

- Conception détaillée : [references/](references/) (vision, droits, pages, sources, formulaires, API, modèle de données…).
- Plan de réalisation et avancement : [references/plan-realisation.md](references/plan-realisation.md).
- Consignes pour le développement : [CLAUDE.md](CLAUDE.md).
