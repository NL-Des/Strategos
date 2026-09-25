# Plan de réalisation

Ce document découpe la réalisation de Strategos en étapes. Chaque étape est une **tranche verticale** : elle livre un morceau utilisable de bout en bout (base, API, écran, tests), dans l'ordre des dépendances de la conception, jusqu'à pouvoir rejouer les parcours A à D de [12 — Parcours](conception/12-parcours.md). L'assemblage technique est décrit dans [architecture.md](architecture.md).

## Avancement

- [ ] [Étape 0 — Socle](#étape-0--socle)
- [ ] [Étape 1 — Comptes et authentification](#étape-1--comptes-et-authentification)
- [ ] [Étape 2 — Journal des modifications](#étape-2--journal-des-modifications)
- [ ] [Étape 3 — Pages minimales, header, footer et réglages](#étape-3--pages-minimales-header-footer-et-réglages)
- [ ] [Étape 4 — Groupes, droits et profil](#étape-4--groupes-droits-et-profil)
- [ ] [Étape 5 — Excel uploadé, tableaux et catalogues](#étape-5--excel-uploadé-tableaux-et-catalogues)
- [ ] [Étape 6 — Formulaires et soumissions](#étape-6--formulaires-et-soumissions)
- [ ] [Étape 7 — Google Sheets et OneDrive](#étape-7--google-sheets-et-onedrive)
- [ ] [Étape 8 — Espaces de discussion](#étape-8--espaces-de-discussion)
- [ ] [Étape 9 — Chat temps réel](#étape-9--chat-temps-réel)
- [ ] [Étape 10 — Carte cliquable](#étape-10--carte-cliquable)
- [ ] [Étape 11 — Thèmes complets et notes](#étape-11--thèmes-complets-et-notes)
- [ ] [Étape 12 — Modèles et duplication](#étape-12--modèles-et-duplication)
- [ ] [Étape 13 — Corbeille, sauvegardes et finitions](#étape-13--corbeille-sauvegardes-et-finitions)

## Organisation du dépôt

Un **monorepo pnpm workspaces**, choisi pour faciliter les évolutions et la maintenance par IA sous supervision humaine :

- **Une seule source de vérité pour les contrats** : `packages/shared` porte les schémas de configuration des blocs (les 9 types de modules), les codes d'erreur (clés de traduction), les enums et les types de l'API. Un changement de contrat tient dans un seul diff : le backend et le frontend ne peuvent pas diverger sans que cela se voie.
- **Une étape = une branche = une PR** : chaque étape touche ensemble backend, frontend et `shared`, et se relit comme une tranche complète.
- **Un cadre commun** : un `CLAUDE.md` à la racine donne les conventions, les commandes et les renvois vers `references/` ; la CI (lint, typage, tests) doit passer avant la relecture humaine.

```
apps/backend      NestJS, Prisma (+ SQL pour les CHECK, index partiels et trigger)
apps/frontend     React + TypeScript, Vite, React Query, i18next (fr)
packages/shared   types des blocs, codes d'erreur, enums, DTO partagés
docker-compose.yml · Caddyfile · CLAUDE.md · .github/workflows/ci.yml
```

## Règles communes à toutes les étapes

- **Migrations** : dans l'ordre de [14 — Ordre de création](conception/14-modele-donnees.md#13-ordre-de-création-migrations) ; chaque étape crée les tables dont elle a besoin.
- **Routes** : `AuthGuard`, puis `PermissionsGuard` ou guard admin ; ressource illisible → `404` ; erreurs au format `{ code, message, details }` ; `409 CONFIRMATION_REQUIRED` et `409 EDIT_CONFLICT` selon [13 — Conventions communes](conception/13-api.md#1-conventions-communes).
- **Journal** : toute modification tracée écrit dans `audit_log` **dans la même transaction**.
- **Textes** : aucun texte d'interface en dur, tout passe par le fichier de traduction `fr`.
- **Tests** : unitaires sur la logique pure (résolution des droits, calcul de ligne, invalidation des soumissions) ; e2e API (supertest sur une base Postgres de test) pour chaque route ; e2e navigateur (Playwright) pour les parcours.
- **Définition de « terminé »** : CI verte, démo de l'étape rejouée, et conception mise à jour si un écart est apparu en cours de route.

## Étapes

### Étape 0 — Socle
- Monorepo, `CLAUDE.md`, CI.
- `docker-compose.yml` : services `proxy` (Caddy), `frontend`, `backend`, `db` ; volumes `db_data`, `uploads`, `backups`.
- Prisma initialisé avec les types `enum`.
- Filtre d'exception global au format d'erreur commun ; i18n côté frontend.

**Démo** : `docker compose up` sert une page vide en HTTPS local, et `/api/v1/health` répond.

### Étape 1 — Comptes et authentification
Voir [02](conception/02-comptes-authentification.md).
- Tables `users`, `sessions`, `login_attempts`.
- Session par cookie, hash argon2, CSRF (`GET /auth/csrf`, en-tête et `Origin`), limitation à 5 échecs (`429`).
- Guard `must_change_credentials`, seed `admin` / `admin`, script CLI de réinitialisation.
- Écrans : connexion, changement d'identifiants forcé.
- Admin : création des comptes avec mot de passe temporaire, modification, réinitialisation, désactivation et réactivation (révocation des sessions).

**Démo** : [Parcours A](conception/12-parcours.md#parcours-a--première-installation-communauté--les-loups-gris-), étapes 1 et 2.

### Étape 2 — Journal des modifications
Voir [04](conception/04-administration.md#journal-des-modifications).
- Table `audit_log` et son trigger d'ajout seul ; `AuditModule` transactionnel.
- Écran du journal, consultable et filtrable.
- Branchement sur les actions de l'étape 1.

Placé tôt pour que chaque étape suivante trace ses actions dès sa création.

### Étape 3 — Pages minimales, header, footer et réglages
Voir [06](conception/06-page-builder.md).
- Tables `themes` (thème par défaut seul), `pages`, `layout_parts`, `settings`, `media` ; FK `users.personal_page_id` et `pages.published_by`.
- Zones, rangées et colonnes ; brouillon, aperçu, publication transactionnelle ; verrouillage optimiste (`version`).
- `BlockRenderer` et registre des modules, avec les modules sans source : **Image**, **Boutons**, **Contenu libre** (sans valeurs de cellules).
- Médiathèque (`FilesModule`), avertissement si une image est encore utilisée.
- Menu de compte fixe.
- Écran Réglages de l'instance : page d'arrivée, thème par défaut.

**Démo** : Parcours A, étape 5 (sans restriction de droits).

### Étape 4 — Groupes, droits et profil
Voir [03](conception/03-droits-groupes.md), [04](conception/04-administration.md#visualisation-des-droits) et [05](conception/05-profil-utilisateur.md).
- Tables `groups`, `user_groups`, `group_permissions` (contrainte `CHECK` page ou espace).
- **Fonction de résolution unique** et `PermissionsGuard`.
- Assemblage filtré côté backend : liens masqués, destination « Ma page personnelle », écran « Aucun espace ne vous est encore attribué ».
- Aperçu du brouillon avec les droits d'un groupe.
- Admin : groupes, membres, page personnelle sur la fiche utilisateur, vues des droits (par utilisateur, par groupe, par ressource, matrice globale).
- Profil : page administrative et changement du mot de passe.

**Démo** : Parcours A complet (étapes 1 à 6).

### Étape 5 — Excel uploadé, tableaux et catalogues
Voir [08](conception/08-sources-donnees.md).
- Tables `sources`, `staging_cells`, `cell_references`, `reimport_previews`.
- Import vers le staging (valeurs et formules), lecture par plage, résolution des liaisons par `cell_references`.
- Écran Sources : upload, téléchargement, état, usages.
- Modules **Tableau** (plage fixe ou extensible ; pagination, tri et recherche côté backend) et **Catalogue**.
- Valeurs de cellules dans le Contenu libre ; indicateur « à recalculer ».

L'Excel uploadé passe en premier parce qu'il se teste sans compte externe ; les sources connectées réutiliseront la même interface de lecture et d'écriture.

**Démo** : un tableau et un catalogue affichent un `.xlsx` uploadé.

### Étape 6 — Formulaires et soumissions
Voir [09](conception/09-formulaires-soumissions.md).
- Tables `forms`, `form_versions`, `submissions`.
- Trois types de formulaires (modification, ligne, ajout) ; types de champs et règles de validation ; listes saisies ou lues dans une plage ; champs automatiques ; champ « mouvement ».
- Écriture dans le staging, sérialisée par une **file par `source_id`** ; pose transitive de `needs_recalc`.
- Publication : invalidation des soumissions en attente sur changement structurel, avec le nombre affiché avant de publier.
- Réglages immédiats : fermeture, date limite, validation automatique.
- Tableau de bord admin (compteur, file, conflits) ; page « mes soumissions ».
- Avertissements : plage fixe qui ne couvre pas une zone d'ajout, cellule-formule ciblée.
- Réimport d'un Excel uploadé (annuler, écraser, réappliquer).

**Démo** : [Parcours B](conception/12-parcours.md#parcours-b--tournoi-de-guilde-google-sheets-formulaire-dajout) et [Parcours C](conception/12-parcours.md#parcours-c--gestion-de-stock-entreprise-onedrive) rejoués sur un Excel uploadé.

### Étape 7 — Google Sheets et OneDrive
Voir [08](conception/08-sources-donnees.md#points-techniques).
- Adaptateurs Google Sheets puis OneDrive, derrière l'interface commune de l'étape 5.
- Cache mémoire de 30 à 60 secondes, invalidé par `source_id` après chaque écriture ; erreurs `SOURCE_UNAVAILABLE` et `SOURCE_AUTH_EXPIRED`.
- Google : clé du compte de service en secret monté, affichage de son adresse, test d'accès.
- OneDrive : accès délégué, table `onedrive_credentials` (jeton chiffré), reconnexion signalée dans l'espace admin.

**Démo** : Parcours B sur un vrai Google Sheet, Parcours C sur OneDrive.

### Étape 8 — Espaces de discussion
Voir [07](conception/07-discussions.md#espaces-de-discussion).
- Tables `discussion_spaces`, `topics`, `topic_messages`, `message_revisions`, `attachments`.
- Création des espaces à la publication de la page ; droits lire, ouvrir un sujet, poster.
- Sujets : renommer, clore, épingler ; messages modifiés ou supprimés avec archivage ; images jointes.
- Modération : masquage par l'admin, tracé dans le journal.

**Démo** : l'exemple « Taverne » de [07](conception/07-discussions.md#espaces-de-discussion).

### Étape 9 — Chat temps réel
Voir [07](conception/07-discussions.md#chat) et [13 — WebSocket du chat](conception/13-api.md#4-websocket-du-chat).
- Tables `chats`, `chat_messages`.
- Passerelle WebSocket `/api/v1/ws`, authentifiée par le cookie, avec vérification de lecture de la page.
- Historique paginé par curseur ; modification, suppression et masquage comme dans les sujets.

**Démo** : deux navigateurs échangent en direct sur une page ; un utilisateur sans lecture de la page est refusé.

### Étape 10 — Carte cliquable
Voir [06 — Carte cliquable](conception/06-page-builder.md#carte-cliquable).
- Éditeur de polygones libres en SVG, coordonnées en pourcentages, détection des chevauchements.
- Rendu : surbrillance et libellé au survol, double appui sur mobile, zones inactives vers les pages illisibles.

Placée tard parce que c'est le composant le plus complexe et qu'aucune autre partie n'en dépend.

**Démo** : une carte avec trois zones, dont une vers une page illisible pour le groupe choisi en aperçu.

### Étape 11 — Thèmes complets et notes
Voir [06 — Thèmes](conception/06-page-builder.md#thèmes) et [05](conception/05-profil-utilisateur.md).
- Éditeur de thèmes : fond, textes, discussions, boutons, tableaux, cartes ; thème par page.
- Notes personnelles : table `user_notes`, HTML en liste blanche, lecture admin tracée (`notes.read`) et mention permanente côté utilisateur.

**Démo** : deux pages sous deux thèmes différents ; une consultation de notes apparaît au journal.

### Étape 12 — Modèles et duplication
Voir [10](conception/10-modeles-duplication.md).
- Table `templates`.
- Enregistrer et instancier formulaires, pages et sujets, avec réinitialisation des mappings et des plages ; copies en brouillon, sans permission.

**Démo** : [Parcours D](conception/12-parcours.md#parcours-d--espace-privé-dun-joueur-modèles-profil).

### Étape 13 — Corbeille, sauvegardes et finitions
Voir [04 — Corbeille](conception/04-administration.md#corbeille) et [11 — Sauvegardes](conception/11-transverse.md#sauvegardes).
- Corbeille filtrable et restauration tracée.
- Table `backups` et `BackupModule` : `pg_dump` et archive du volume `uploads`, rétention réglable, téléchargement, commande de restauration.
- Vérification du responsive (mobile, tablette) ; OpenAPI généré depuis le code.

**Démo** : les parcours A à D rejoués en Playwright sur une instance neuve.
