# 11 — Transverse

## Objet
Les choix et règles qui s'appliquent à toutes les parties : stack technique, notifications, suppression de contenu, stockage des fichiers et sauvegarde.

## Règles fonctionnelles

### Stack technique
- **Backend** : Node.js + TypeScript, framework **NestJS**.
  - Modules Nest isolés par domaine (auth, groupes/permissions, pages, sujets/messages, excel-sync).
  - Guards Nest pour appliquer les permissions de groupe sur chaque route/action.
  - class-validator pour valider les configs de modules de page et les formulaires Excel dynamiques.
  - WebSockets (passerelle NestJS) pour le chat temps réel, authentifiés par la session.
- **Frontend** : React + TypeScript, rendu de pages piloté par une config JSON (liste ordonnée de blocs typés), **responsive** (mobile et tablette pris en charge, pas seulement desktop).
- **BDD** : PostgreSQL, données sauvegardées dans un volume Docker local.
- **Déploiement** : Docker Compose (une image front, une image back, une image BDD), lancement en une seule commande.
- **Backup** : au-delà du volume Docker local, pas de stratégie de sauvegarde externe définie pour l'instant (point à retravailler plus tard).
- **Moteur Excel/Sheets (`excel-sync`)** : reste en TypeScript/Node dans la v1, par choix et non par oubli. À l'échelle visée (voir [Sources de données](08-sources-donnees.md)), le parsing/staging n'est pas le goulot d'étranglement ; les points réellement durs (résolution des liaisons inter-fichiers, fusion des soumissions concurrentes, lecture live de l'API Sheets) sont des problèmes de modélisation et d'orchestration, pas de vitesse brute. Introduire Rust ou Go ajouterait une image Docker, une frontière IPC et un second toolchain à maintenir sans résoudre ces points — à l'encontre de l'objectif "facile à déployer / facile à maintenir".

### Notifications
Pas de notifications de prévues pour le moment.

### Suppression de contenu
Suppression douce (soft-delete) pour sujets, messages, groupes, utilisateurs, notes personnelles, **formulaires et pages** : le contenu est marqué supprimé et masqué de l'interface, mais reste en base — préserve l'historique des modifications Excel/Sheets validées (on garde la trace du formulaire/page d'origine) et les références passées, et permet une restauration.

### Données personnelles (RGPD)
Aucun mécanisme d'effacement définitif ni d'anonymisation n'est prévu en v1 : la suppression douce est la seule option, et les données restent en base. C'est un point connu, à traiter dans une version ultérieure, en particulier pour les entreprises (droit à l'effacement).

### Stockage des fichiers
Fichiers uploadés (images, Excel) stockés sur le système de fichiers (volume Docker), la BDD ne garde que les chemins et métadonnées.

## Points techniques
- **FilesModule** : upload, stockage sur le volume Docker, métadonnées en base.
- Soft-delete via une colonne `deleted_at` sur les tables concernées.
- Déploiement et vue d'ensemble : voir [architecture.md](../architecture.md).

## Dépendances
Toutes les parties.

## Questions ouvertes
- Effacement et anonymisation RGPD : reporté après la v1.

**Décisions (2026-09-25)**
- RGPD : aucun mécanisme en v1, la suppression douce est la seule option.
