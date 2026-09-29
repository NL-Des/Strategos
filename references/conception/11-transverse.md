# 11 — Transverse

## Objet
Les choix et règles qui s'appliquent à toutes les parties : stack technique, notifications, suppression de contenu, sauvegardes, langue, données personnelles et stockage des fichiers.

## Règles fonctionnelles

### Stack technique
- **Backend** : Node.js + TypeScript, framework **NestJS**.
  - Modules Nest isolés par domaine (auth, groupes/permissions, pages, sujets/messages, excel-sync).
  - Guards Nest pour appliquer les permissions de groupe sur chaque route/action.
  - class-validator pour valider les configs de modules de page et les formulaires Excel dynamiques.
  - WebSockets (passerelle NestJS) pour le chat temps réel, authentifiés par la session.
- **Frontend** : React + TypeScript, rendu de pages piloté par une config JSON (liste ordonnée de blocs typés), **responsive** (mobile et tablette pris en charge, pas seulement desktop).
- **BDD** : PostgreSQL, données sauvegardées dans un volume Docker local.
- **Déploiement** : Docker Compose (une image front, une image back, une image BDD, et un proxy **Caddy** pour le HTTPS), lancement en une seule commande. Caddy obtient et renouvelle automatiquement les certificats : il suffit de renseigner le nom de domaine.
- **Backup** : voir [Sauvegardes](#sauvegardes).
- **Moteur Excel/Sheets (`excel-sync`)** : reste en TypeScript/Node dans la v1, par choix et non par oubli. À l'échelle visée (voir [Sources de données](08-sources-donnees.md)), le parsing/staging n'est pas le goulot d'étranglement ; les points réellement durs (résolution des liaisons inter-fichiers, fusion des soumissions concurrentes, lecture live de l'API Sheets) sont des problèmes de modélisation et d'orchestration, pas de vitesse brute. Introduire Rust ou Go ajouterait une image Docker, une frontière IPC et un second toolchain à maintenir sans résoudre ces points — à l'encontre de l'objectif "facile à déployer / facile à maintenir".

### Notifications
Pas de notifications de prévues pour le moment.

### Suppression de contenu
Suppression douce (soft-delete) pour sujets, messages (sujets et chat), groupes, utilisateurs, notes personnelles, **formulaires et pages** : le contenu est marqué supprimé et masqué de l'interface, mais reste en base — préserve l'historique des modifications Excel/Sheets validées (on garde la trace du formulaire/page d'origine) et les références passées, et permet une restauration.

### Sauvegardes
- **Sauvegarde automatique quotidienne** de la base et des fichiers uploadés (images, Excel), dans un dossier dédié, avec une durée de conservation réglable (7 jours par défaut).
- **Bouton « Télécharger une sauvegarde »** dans l'espace admin, pour emporter une copie hors du serveur.
- Chaque sauvegarde est une archive `strategos-<date>.tar.gz` qui contient `db.dump` (`pg_dump` au format personnalisé, sans le contenu de la table `backups`) et le dossier `uploads/`. La tâche tourne chaque nuit à 3 h ; `run-backup` en lance une à la demande.
- La purge supprime les archives plus anciennes que la durée de conservation, mais **garde toujours la dernière sauvegarde réussie**, pour qu'une série d'échecs ne laisse jamais l'instance sans sauvegarde.
- La restauration d'une sauvegarde se fait par une commande serveur, comme la récupération du compte admin, backend arrêté : la base est remplacée en une transaction (`pg_restore --clean`), puis le contenu du volume `uploads` ; les archives du volume `backups` sont réinscrites, et la restauration est tracée au journal (acteur `cli`).
- Les sources connectées (Google Sheets, OneDrive) ne sont pas sauvegardées par Strategos : leur historique de versions reste chez Google ou Microsoft.

### Langue
L'interface est en **français** en v1. Tous les textes de l'interface sont rangés dans des fichiers de traduction dès le départ, pour pouvoir ajouter d'autres langues plus tard sans retoucher le code.

### Données personnelles (RGPD)
Aucun mécanisme d'effacement définitif ni d'anonymisation n'est prévu en v1 : la suppression douce est la seule option, et les données restent en base. C'est un point connu, à traiter dans une version ultérieure, en particulier pour les entreprises (droit à l'effacement).

### Stockage des fichiers
Fichiers uploadés (images, Excel) stockés sur le système de fichiers (volume Docker), la BDD ne garde que les chemins et métadonnées.

## Points techniques
- **FilesModule** : upload, stockage sur le volume Docker, métadonnées en base.
- **BackupModule** : tâche planifiée quotidienne (`pg_dump` et archive du volume `uploads`) vers le volume `backups`, purge au-delà de la durée de conservation, et route admin de téléchargement de la dernière sauvegarde.
- Internationalisation : bibliothèque i18n côté frontend (ex. i18next), fichier `fr` unique en v1 ; les messages d'erreur du backend sont renvoyés sous forme de codes traduits par le frontend.
- Soft-delete via une colonne `deleted_at` sur les tables concernées.
- Déploiement et vue d'ensemble : voir [architecture.md](../architecture.md).

## Dépendances
Toutes les parties.

## Questions ouvertes
- Effacement et anonymisation RGPD : reporté après la v1.

**Décisions (2026-09-25)**
- RGPD : aucun mécanisme en v1, la suppression douce est la seule option.
- HTTPS : proxy Caddy dans le Compose.
- Sauvegarde quotidienne automatique et téléchargement depuis l'espace admin.
- Interface en français, textes dans des fichiers de traduction.
