# 01 — Vision

## Objet
Ce que Strategos est, le principe qui guide toute la conception, et les profils qui l'utilisent. Point d'entrée de la conception ; l'assemblage technique est décrit dans [architecture.md](../architecture.md).

## Règles fonctionnelles

### Objectif
Un site web basé sur un google sheet ou un excel. Les kits de créations de pages et autres éléments, permettraient d'utiliser ces ressources.

**Publics visés** : aussi bien les **communautés de jeux en ligne** que les **entreprises**.

> **Arbitrages** : ces deux publics tirent la conception dans des directions différentes. La règle retenue est de viser le **dénominateur commun**, sans fermer les portes dont l'un des deux a besoin :
> - **Sources** : Google Sheets (plutôt communautés) et Excel / Microsoft 365 (plutôt entreprises) sont tous deux supportés (voir [Sources de données](08-sources-donnees.md)).
> - **Apparence** : plusieurs thèmes permettent une identité visuelle riche (communauté) ou sobre (charte d'entreprise), voir [Page builder](06-page-builder.md#options-de-personnalisation-des-zones).
> - **Chat temps réel** : il est central pour une communauté et secondaire en entreprise (souvent déjà couvert par Teams ou Slack). C'est donc un module que l'admin place au cas par cas, sur les pages où il le juge utile.
> - **Hébergement** : le déploiement en une commande et la simplicité de maintenance sont vitaux pour les publics sans service informatique.
> - **Sécurité et données personnelles** : les entreprises sont plus exigeantes (compte admin, RGPD). Ces points ne sont pas tous traités en v1 mais restent ouverts (voir [Transverse](11-transverse.md#données-personnelles-rgpd)).

### Principe fondateur : aucun accès direct aux documents
Strategos fait toujours écran entre l'utilisateur et les fichiers Excel/Sheet : à aucun moment un utilisateur n'ouvre, ne lit ou n'écrit directement dans le document source. Toute interaction passe par une interface que l'administrateur définit au préalable :
- **En écriture** : l'administrateur construit un formulaire et relie chacun de ses champs à une cellule précise du document. L'utilisateur ne remplit que ce formulaire ; sa soumission reste une *proposition* en attente de validation admin (voir [Formulaires et soumissions](09-formulaires-soumissions.md)).
- **En lecture** : l'administrateur construit une page et y place des modules (tableau, catalogue, page simple...) qui vont chercher leurs données dans le document. L'utilisateur ne voit que ce que l'admin a choisi d'exposer, jamais le fichier brut (voir [Page builder](06-page-builder.md)).

Cet encadrement systématique des interactions a deux objectifs : **fluidifier le trafic** (pas d'accès concurrent non maîtrisé sur le fichier source, un seul point de passage pour l'écriture) et **limiter les erreurs** (l'utilisateur ne peut jamais casser une structure ou une formule du document, puisqu'il n'interagit qu'avec des champs et des affichages que l'admin a explicitement définis).

### Profils
- **Administrateur** : construit les pages, gère les groupes et les droits, valide les modifications des utilisateurs sur les excels et google sheet. **Un seul compte administrateur par instance** (pas de multi-admin en v1) — simplifie l'OAuth Google Sheets (une seule connexion par instance) et évite les conflits de validation concurrente. Le fait qu'un seul administrateur valide toutes les soumissions est un **choix assumé de simplicité pour la v1**, à réévaluer après les premiers tests.
- **Utilisateur** : consulte et interagit avec les pages selon les droits de ses groupes. Dispose d'un profil privé (voir [Profil utilisateur](05-profil-utilisateur.md)).

### Environnement construit par l'administrateur
L'administrateur construit **tout l'environnement** dans lequel évoluent les utilisateurs, du début à la fin. Il n'y a ni menu ni navigation automatiques : après la connexion, l'utilisateur arrive sur une page d'arrivée globale choisie par l'admin (voir [Droits et groupes](03-droits-groupes.md#visibilité-et-page-darrivée)). Il navigue ensuite uniquement par les boutons, images-liens et cartes cliquables que l'admin a placés (voir [Page builder](06-page-builder.md)).

## Dépendances
- [02 — Comptes et authentification](02-comptes-authentification.md) · [03 — Droits et groupes](03-droits-groupes.md) · [04 — Administration](04-administration.md) · [05 — Profil utilisateur](05-profil-utilisateur.md)
- [06 — Page builder](06-page-builder.md) · [07 — Discussions](07-discussions.md)
- [08 — Sources de données](08-sources-donnees.md) · [09 — Formulaires et soumissions](09-formulaires-soumissions.md) · [10 — Modèles et duplication](10-modeles-duplication.md)
- [11 — Transverse](11-transverse.md)

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- Publics : communautés de jeux en ligne et entreprises.
- Admin unique : choix assumé pour la v1.
- Pas de menu ni de navigation automatiques : l'admin construit tout l'environnement.
