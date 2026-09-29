# Strategos

Site web construit par un administrateur au-dessus de fichiers Excel, Google Sheets et OneDrive : les utilisateurs lisent via des pages et écrivent via des formulaires, jamais dans le document lui-même. La conception complète est dans [references/](references/) ; le code suit l'ordre du [plan de réalisation](references/plan-realisation.md).

## Méthode de travail

Une seule branche, `main` : pas de branche par étape ni de PR.


1. **Repérer l'étape** en cours dans [references/plan-realisation.md](references/plan-realisation.md) (première case non cochée de « Avancement »).
2. **Lire toutes les sections de « À lire »** de l'étape avant d'écrire du code. Ne pas coder de mémoire une règle de conception.
3. **Réaliser l'étape** en respectant les « Règles communes à toutes les étapes » du plan.
4. **Vérifier chaque critère d'acceptation** de l'étape, puis rejouer sa démo.
5. **Écart avec la conception** : s'arrêter et le signaler. S'il est validé, mettre à jour le fichier de conception concerné dans le même commit. La conception doit toujours décrire ce que fait le code.

## Où trouver quoi

| Sujet | Référence |
|---|---|
| Vue d'ensemble, modules NestJS, déploiement | [architecture.md](references/architecture.md) |
| Principe fondateur, profils | [01 — Vision](references/conception/01-vision.md) |
| Sessions, mots de passe, CSRF, compte admin | [02](references/conception/02-comptes-authentification.md) |
| Groupes, droits, visibilité, résolution des droits | [03](references/conception/03-droits-groupes.md) |
| Écrans admin, journal, corbeille, réglages | [04](references/conception/04-administration.md) |
| Profil et notes | [05](references/conception/05-profil-utilisateur.md) |
| Pages, brouillon, thèmes, médiathèque, modules | [06](references/conception/06-page-builder.md) |
| Espaces de discussion, chat, modération | [07](references/conception/07-discussions.md) |
| Sources, cache, staging, formules, réimport | [08](references/conception/08-sources-donnees.md) |
| Formulaires, soumissions, validation | [09](references/conception/09-formulaires-soumissions.md) |
| Modèles et duplication | [10](references/conception/10-modeles-duplication.md) |
| Stack, suppression douce, sauvegardes, i18n | [11](references/conception/11-transverse.md) |
| Scénarios de bout en bout (démos) | [12](references/conception/12-parcours.md) |
| Routes, codes d'erreur, WebSocket, schémas JSON | [13 — API](references/conception/13-api.md) |
| Tables, contraintes, ordre des migrations | [14 — Modèle de données](references/conception/14-modele-donnees.md) |

## Règles faciles à rater

- **Aucun accès direct au document** : l'utilisateur ne voit jamais une source, une feuille ou une cellule, ni dans l'interface ni dans les réponses de l'API ([01](references/conception/01-vision.md#principe-fondateur--aucun-accès-direct-aux-documents)).
- **Ressource illisible → `404`**, jamais `403` ; le `403` est réservé à une ressource lisible dont l'action est interdite ([13](references/conception/13-api.md#codes-de-retour-et-erreurs)).
- **Filtrage côté backend** : modules non autorisés, formulaires non configurés et liens vers des pages illisibles sont retirés du JSON, pas cachés par le frontend ([03](references/conception/03-droits-groupes.md#points-techniques)).
- **Une seule fonction de résolution des droits**, utilisée par `PermissionsGuard` et par toutes les vues de droits ([03](references/conception/03-droits-groupes.md#calcul-des-droits-effectifs)).
- **Pas de droit d'écriture** dans les groupes : modifier relève de l'auteur ou de l'admin, jamais de `PermissionsGuard`.
- **Journal dans la même transaction** que la modification tracée ; `audit_log` est en ajout seul ([04](references/conception/04-administration.md#points-techniques)).
- **Strategos ne calcule jamais de formule** : il écrit des valeurs brutes et pose `needs_recalc` sur les Excel uploadés ([08](references/conception/08-sources-donnees.md#formules--strategos-ne-calcule-jamais)).
- **Ligne d'ajout calculée à la validation**, jamais à la soumission ; écritures sérialisées par `source_id` ([09](references/conception/09-formulaires-soumissions.md#points-techniques)).
- **Formulaires, espaces et chats suivent la publication de la page** ; seuls les réglages opérationnels sont immédiats ([06](references/conception/06-page-builder.md#brouillon-et-publication)).
- **Header et footer partagés** : formulaires, espaces et chats y sont refusés (`422 BLOCK_NOT_ALLOWED_IN_LAYOUT`).
- **Suppression douce** (`deleted_at`) partout où [11](references/conception/11-transverse.md#suppression-de-contenu) la prévoit ; unicités partielles en base.
- **Verrouillage optimiste** : tout objet édité par l'admin porte une `version` ; conflit → `409 EDIT_CONFLICT`.
- **Avertissements** : `409 CONFIRMATION_REQUIRED`, puis le même appel avec `"confirm": true` ([13](references/conception/13-api.md#avertissements-à-confirmer)).
- **Aucun texte d'interface en dur** : clés i18n `fr` ; le backend renvoie des codes d'erreur stables.
- **Contrats partagés** : schémas de blocs, codes d'erreur, enums et DTO vivent dans `packages/shared`, jamais dupliqués entre backend et frontend.

## Commandes

Monorepo pnpm : `apps/backend` (NestJS, Prisma 7, ESM), `apps/frontend` (React, Vite), `packages/shared` (contrats), `e2e` (Playwright). Node ≥ 22.12, TypeScript 6.0, tests Vitest.

| But | Commande |
|---|---|
| Installer pnpm (une fois) | `corepack enable pnpm` (ou `corepack enable --install-directory ~/.local/bin pnpm`) |
| Installer les dépendances | `pnpm install` (compile `shared` et génère le client Prisma) |
| Tout lancer (production locale, HTTPS) | `docker compose up --build` → `https://localhost` (réglages dans `.env`, voir `.env.example`) |
| Base seule pour le dev | `pnpm db:up` (Postgres sur `127.0.0.1:5432`). À relancer après un `docker compose up`, qui recrée la base sans exposer son port (`ECONNREFUSED 127.0.0.1:5432` dans les tests e2e) |
| Dev avec rechargement | `cp apps/backend/.env.example apps/backend/.env` une fois, puis `pnpm dev` → `http://localhost:5173` |
| **Tout vérifier (avant chaque commit ; pas de CI)** | `pnpm check` (base de test : `pnpm db:up`) |
| Lint / format | `pnpm lint` · `pnpm format` · `pnpm format:check` |
| Typage | `pnpm typecheck` |
| Tests unitaires | `pnpm test` |
| Tests e2e API | `pnpm test:e2e` (base `strategos_test` créée et migrée automatiquement ; `TEST_DATABASE_URL` pour en changer) |
| Nouvelle migration | modifier `apps/backend/prisma/schema.prisma`, puis `pnpm --filter @strategos/backend prisma migrate dev --name <nom>` (ajouter `--create-only` pour compléter en SQL : `CHECK`, index partiels, trigger) |
| Réinitialiser le compte admin | `docker compose exec backend node dist/src/cli/reset-admin.js` (en local : `pnpm --filter @strategos/backend build` puis `node dist/src/cli/reset-admin.js` depuis `apps/backend`) |
| Appliquer les migrations | `pnpm --filter @strategos/backend prisma migrate deploy` (automatique au démarrage du conteneur `backend`) |
| Sauvegarde immédiate | `docker compose exec backend node dist/src/cli/run-backup.js` (sinon chaque nuit à 3 h ; archives dans le volume `backups`) |
| Restaurer une sauvegarde | `docker compose stop backend`, puis `docker compose run --rm backend node dist/src/cli/restore-backup.js /data/backups/<archive>.tar.gz` (archive hors volume : ajouter `-v ./<archive>:/tmp/a.tar.gz` et viser `/tmp/a.tar.gz`), puis `docker compose start backend` |
| Spécification OpenAPI | `pnpm openapi` → `references/openapi.json` (à relancer quand les routes changent) ; `/api/docs` en `pnpm dev` |
| Tests navigateur (parcours A à D, responsive) | `pnpm test:browser:install` une fois (Chromium), puis `pnpm test:browser` avec `pnpm db:up` (hors `pnpm check` ; base `strategos_browser` recréée, API Google et Microsoft simulées ; captures dans `e2e/screenshots/`) |

Pour Claude : le hook RTK ne réécrit pas les scripts pnpm du projet. Lancer `rtk err pnpm check`, `rtk err pnpm typecheck`, `rtk test pnpm test` et `rtk test pnpm test:e2e` (sortie réduite aux erreurs, code de retour conservé).

Conventions du code :
- **Code d'erreur** : l'ajouter dans `packages/shared/src/errors.ts`, puis son texte de secours dans `apps/backend/src/common/error-messages.ts` et sa traduction `errors.<CODE>` dans `apps/frontend/src/i18n/fr.json` (typage et tests échouent sinon). Lever `new AppException(status, ErrorCode.X, details)`.
- **Enum** : l'ajouter dans `schema.prisma` et dans `packages/shared/src/enums.ts` (un test compare les deux).
- Backend ESM : imports relatifs avec l'extension `.js`.
- **Routes** : tout est protégé par défaut (guards globaux dans `apps/backend/src/auth/auth.module.ts`) ; `@Public()` pour une route sans session, `@AllowPendingCredentials()` pour une route permise avant le changement d'identifiants. Tout contrôleur sous `admin/` est réservé à l'admin.
- **Journal** : toute modification tracée appelle `AuditService.record(tx, actor, …)` avec le client de **sa** transaction (le service refuse le client racine). Acteur : `@Actor()` dans un contrôleur, `SYSTEM_ACTOR` ou `CLI_ACTOR` sinon. Nouvelle action : `AuditAction` dans `packages/shared/src/audit.ts` et `audit.actions.<action>` dans `fr.json` (un test vérifie la traduction).
- **`packages/shared`** : types et constantes, importables partout. Les schémas `class-validator` sont dans `@strategos/shared/validation`, pour le backend seulement (ils exigent `reflect-metadata`) ; chaque schéma `implements` son interface.
- **Nouveau module de page** : interface de config et `AVAILABLE_BLOCK_TYPES` dans `packages/shared/src/pages/blocks.ts`, schéma dans `packages/shared/src/validation/blocks.schema.ts`, assemblage dans `apps/backend/src/pages/assembler.ts`, rendu dans `apps/frontend/src/render/blocks.tsx`, éditeur dans `apps/frontend/src/builder/BlockEditor.tsx`, traductions `builder.blockTypes`.
- **Droits** : une route qui exige la lecture d'une ressource porte `@RequireRead(type)` (`apps/backend/src/permissions/permissions.guard.ts`) ; tout calcul de droits passe par `RightsService` (`apps/backend/src/groups/rights.service.ts`), qui appelle la seule règle `resolveRights`. Jamais de calcul ailleurs.
- **Données des sources** : toujours par `SourceDataService` (`apps/backend/src/sources/source-data.service.ts`), qui ne dit pas aux appelants de quel type est la source ; aucune source, feuille ni cellule dans les réponses utilisateur (valeurs formatées seulement). Classeurs de test : `apps/backend/test/xlsx.ts`.
- **Écriture dans les sources** : uniquement par `SubmissionProcessor.apply` (`apps/backend/src/forms/submission-processor.service.ts`), qui passe par `SourceWriteService` (verrou par `source_id`, pose de `needs_recalc`) ; jamais d'écriture directe dans `staging_cells`.
- **Lecture d'une page** : toujours par `PageAccessService` (`apps/backend/src/pages/page-access.service.ts`) ; l'assemblage retire ce que le lecteur ne doit pas voir, le frontend affiche tel quel.
- **Tests e2e** : `apps/backend/test/helpers.ts` fournit `TestClient` (cookies, `Origin`, CSRF, IP propre), `adminClient`, `resetDatabase` (toute nouvelle table sans lien vers `users` s'ajoute à son `TRUNCATE`).
- **Tests navigateur** : paquet `e2e/` (Playwright). `global-setup.ts` lance une instance neuve (backend compilé, Vite, faux serveur `apps/backend/test/fake-apis.ts`) ; les fichiers s'enchaînent sur la même instance. Sélecteurs par libellés, lus dans `fr.json` via `t()` de `e2e/tests/helpers.ts`.
