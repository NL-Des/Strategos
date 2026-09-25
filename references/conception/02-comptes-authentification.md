# 02 — Comptes et authentification

## Objet
Comment un compte naît, se connecte, évolue et disparaît. Les comptes sont exclusivement créés et gérés par l'administrateur.

## Règles fonctionnelles

### Authentification
Authentification par **session**, mots de passe **hachés** (bcrypt ou argon2 — à sens unique, jamais réversible).

**Comptes créés par l'administrateur** : page admin dédiée où l'admin saisit lui-même pseudo et mot de passe pour chaque profil.

### Mot de passe utilisateur
- L'utilisateur peut **changer son mot de passe** une fois connecté, depuis son profil, en saisissant l'ancien (voir [Profil utilisateur](05-profil-utilisateur.md)).
- L'administrateur peut **réinitialiser** le mot de passe d'un utilisateur, sans jamais avoir accès à l'ancien (seul un hash est stocké). Le mot de passe fixé par l'admin est **temporaire** : l'utilisateur doit le changer à sa connexion suivante.

### Protection de la connexion
- **Limitation des tentatives** : après 5 échecs consécutifs sur un même compte ou depuis une même adresse IP, la connexion est temporairement bloquée.
- **Protection CSRF** : toutes les requêtes qui modifient des données sont protégées, car l'authentification repose sur un cookie de session.

### Compte administrateur
- **Création** : le compte administrateur existe dès le déploiement, avec le nom d'utilisateur `admin` et le mot de passe `admin`.
- **Première connexion** : le changement du nom d'utilisateur et du mot de passe est **forcé**. Aucune autre page n'est accessible tant qu'il n'est pas fait, pour qu'une instance déployée ne reste jamais ouverte avec les identifiants par défaut.
- **Récupération de l'accès** : si l'administrateur perd son mot de passe, il le réinitialise avec une **commande lancée sur le serveur** (dans le conteneur backend). Il n'y a pas de récupération par le web, donc aucune surface d'attaque publique sur le seul compte qui a tous les pouvoirs : avoir accès au serveur suffit à prouver qu'on est l'administrateur.

### Cycle de vie des comptes
Géré depuis l'espace d'administration (voir [Administration](04-administration.md)) :
- Création (pseudo + mot de passe **temporaire** saisis par l'admin, voir [Authentification](#authentification)) : l'utilisateur doit le changer à sa première connexion, de sorte que l'admin ne connaît jamais durablement le mot de passe de personne.
- Modification du pseudo, **réinitialisation du mot de passe** par l'admin (nouveau mot de passe temporaire saisi par lui — pas d'envoi d'email, voir [Notifications](11-transverse.md#notifications) et [Mot de passe utilisateur](#mot-de-passe-utilisateur)).
- **Désactivation / réactivation** : un compte désactivé ne peut plus se connecter et ses sessions en cours sont immédiatement fermées ; ses groupes et son historique sont conservés.
- Suppression en soft-delete (voir [Suppression de contenu](11-transverse.md#suppression-de-contenu)).
- Consultation, en lecture seule, des notes personnelles de l'utilisateur depuis sa fiche (voir [Profil utilisateur](05-profil-utilisateur.md)).

## Points techniques
- **AuthModule** : session (cookie signé, table `sessions` en Postgres), hash bcrypt/argon2, `AuthGuard`.
- **UsersModule** : CRUD des comptes, réinitialisation du mot de passe par l'admin, désactivation/réactivation (révocation des sessions via la table `sessions` d'AuthModule).
- Sessions : cookie `httpOnly`, `secure` en production, rotation à la connexion.
- Désactivation ou suppression d'un compte → révocation immédiate de toutes ses sessions.
- Création d'un compte et réinitialisation par l'admin → `must_change_credentials = true` sur le compte, et révocation de ses sessions.
- Limitation des tentatives : compteur d'échecs par compte et par IP, avec blocage temporaire (throttler NestJS ou équivalent).
- CSRF : cookie `SameSite=Strict`, vérification de l'en-tête `Origin` et jeton CSRF sur les requêtes qui modifient des données.
- Compte admin initial créé par une migration ou un seed au premier démarrage, avec le drapeau `users.must_change_credentials = true`. Tant que ce drapeau est actif, un guard global ne laisse passer que la route de changement d'identifiants et la déconnexion.
- Script CLI de réinitialisation, exécuté par `docker compose exec backend …` : il fixe un mot de passe temporaire, remet `must_change_credentials` à `true` et révoque les sessions de l'admin. L'action est tracée dans le journal.

## Dépendances
- [03 — Droits et groupes](03-droits-groupes.md) : appartenance d'un compte aux groupes.
- [04 — Administration](04-administration.md) : interface de gestion et journal des modifications.
- [11 — Transverse](11-transverse.md) : notifications, suppression douce.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- L'utilisateur change son mot de passe lui-même ; la création du compte et la réinitialisation par l'admin produisent un mot de passe temporaire.
- Limitation des tentatives de connexion et protection CSRF.
- Compte `admin` / `admin` au déploiement, avec changement forcé à la première connexion.
- Récupération par commande serveur uniquement : pas de question secrète.
