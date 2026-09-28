# Strategos

Site web construit par un administrateur au-dessus de fichiers Excel, Google Sheets et OneDrive : les utilisateurs **lisent** via des pages et **écrivent** via des formulaires, jamais dans le document lui-même.

La conception complète est dans [references/](references/) ; l'ordre de réalisation est décrit dans [references/plan-realisation.md](references/plan-realisation.md).

## Stack

Monorepo [pnpm](https://pnpm.io/) :

| Paquet | Rôle |
|---|---|
| `apps/backend` | API NestJS, Prisma 7, ESM |
| `apps/frontend` | Interface React (Vite) |
| `packages/shared` | Contrats partagés (schémas de blocs, codes d'erreur, enums, DTO) |

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

## Documentation

- Conception détaillée : [references/](references/) (vision, droits, pages, sources, formulaires, API, modèle de données…).
- Plan de réalisation et avancement : [references/plan-realisation.md](references/plan-realisation.md).
- Consignes pour le développement : [CLAUDE.md](CLAUDE.md).
