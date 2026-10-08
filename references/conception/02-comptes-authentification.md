# 02 — Comptes et authentification

## Objet
Comment un compte naît, se connecte, évolue et disparaît. Les comptes sont exclusivement créés et gérés par l'administrateur.

## Règles fonctionnelles

### Authentification
Authentification par **session**, mots de passe **hachés** (argon2id — à sens unique, jamais réversible). Une session expire après **7 jours sans activité**, et dans tous les cas **30 jours après la connexion** : il faut alors se reconnecter.

Mot de passe : **12 à 128 caractères**, sans autre règle (une phrase facile à retenir convient). Pseudo : 2 à 32 caractères, insensible à la casse.

**Comptes créés par l'administrateur** : page admin dédiée où l'admin saisit lui-même pseudo et mot de passe pour chaque profil.

### Mot de passe utilisateur
- L'utilisateur peut **changer son mot de passe** une fois connecté, depuis son profil, en saisissant l'ancien (voir [Profil utilisateur](05-profil-utilisateur.md)).
- L'administrateur peut **réinitialiser** le mot de passe d'un utilisateur, sans jamais avoir accès à l'ancien (seul un hash est stocké). Le mot de passe fixé par l'admin est **temporaire** : l'utilisateur doit le changer à sa connexion suivante.

### Protection de la connexion
- **Limitation des tentatives** : après 5 échecs consécutifs sur un même compte **depuis une même adresse IP**, ce couple est bloqué pendant **15 minutes** ; après 20 échecs consécutifs depuis une même adresse, tous comptes confondus, l'adresse l'est aussi. Un compte n'est jamais bloqué pour tout le monde : quand les échecs s'accumulent sur un pseudo depuis plusieurs adresses, chaque nouvelle tentative doit seulement attendre quelques secondes (15 au plus), et pas du tout depuis une adresse d'où le titulaire s'est déjà connecté. Personne ne peut donc verrouiller le compte d'un autre en se trompant exprès.
- **Protection CSRF** : toutes les requêtes qui modifient des données sont protégées, car l'authentification repose sur un cookie de session.

### Compte administrateur
- **Création** : le compte administrateur existe dès le déploiement, avec le nom d'utilisateur `admin` et le mot de passe `admin`.
- **Première connexion** : le changement du nom d'utilisateur et du mot de passe est **forcé** ; le nouveau nom doit différer de l'actuel (`admin`). Aucune autre page n'est accessible tant qu'il n'est pas fait, pas même le chat en temps réel, pour qu'une instance déployée ne reste jamais ouverte avec les identifiants par défaut.
- **Récupération de l'accès** : si l'administrateur perd son mot de passe, il le réinitialise avec une **commande lancée sur le serveur** (dans le conteneur backend). Il n'y a pas de récupération par le web, donc aucune surface d'attaque publique sur le seul compte qui a tous les pouvoirs : avoir accès au serveur suffit à prouver qu'on est l'administrateur.

### Cycle de vie des comptes
Géré depuis l'espace d'administration (voir [Administration](04-administration.md)) :
- Création (pseudo + mot de passe **temporaire** saisis par l'admin, voir [Authentification](#authentification)) : l'utilisateur doit le changer à sa première connexion, de sorte que l'admin ne connaît jamais durablement le mot de passe de personne.
- Modification du pseudo, **réinitialisation du mot de passe** par l'admin (nouveau mot de passe temporaire saisi par lui — pas d'envoi d'email, voir [Notifications](11-transverse.md#notifications) et [Mot de passe utilisateur](#mot-de-passe-utilisateur)).
- **Désactivation / réactivation** : un compte désactivé ne peut plus se connecter et ses sessions en cours sont immédiatement fermées ; ses groupes et son historique sont conservés.
- Suppression en soft-delete (voir [Suppression de contenu](11-transverse.md#suppression-de-contenu)).
- Consultation, en lecture seule, des notes personnelles de l'utilisateur depuis sa fiche (voir [Profil utilisateur](05-profil-utilisateur.md)).

## Points techniques
- **AuthModule** : session (jeton aléatoire de 256 bits dans le cookie ; la table `sessions` n'en garde que l'empreinte SHA-256), hash argon2id, `AuthGuard`.
- **UsersModule** : CRUD des comptes, réinitialisation du mot de passe par l'admin, désactivation/réactivation (révocation des sessions via la table `sessions` d'AuthModule).
- Sessions : cookie `httpOnly`, `SameSite=Strict`, `secure` sauf si `NODE_ENV` vaut `development` ou `test` (protégé par défaut : un `NODE_ENV` oublié ne retire rien), rotation à la connexion. Glissantes : 7 jours après la dernière activité (prolongation écrite au plus une fois par minute, et le cookie est alors renvoyé avec la nouvelle échéance), sans jamais dépasser 30 jours après l'ouverture de la session (`sessions.created_at`) ; purge quotidienne des sessions expirées.
- Désactivation ou suppression d'un compte → révocation immédiate de toutes ses sessions.
- Création d'un compte et réinitialisation par l'admin → `must_change_credentials = true` sur le compte, et révocation de ses sessions.
- Limitation des tentatives : table `login_attempts`. Trois règles, évaluées dans cet ordre : (1) les 5 dernières tentatives du couple pseudo + adresse sont des échecs et la dernière date de moins de 15 minutes → refus jusqu'à la fin des 15 minutes ; (2) même règle sur les 20 dernières tentatives de l'adresse (seuil plus haut : plusieurs personnes peuvent partager une adresse) ; (3) à partir de 5 échecs consécutifs récents sur le pseudo, toutes adresses confondues, un délai de 1, 2, 4, 8 puis 15 secondes au plus doit séparer deux tentatives, sauf depuis une adresse connue du compte (une connexion réussie dans `login_attempts`, ou une session ouverte depuis elle). Le refus est un `429 AUTH_TOO_MANY_ATTEMPTS` avec `retryAfter` ; une tentative refusée n'est pas enregistrée. La tentative est contrôlée puis **enregistrée comme un échec avant** la vérification du mot de passe, sous un verrou consultatif par pseudo et par adresse, et passée en succès ensuite : des requêtes simultanées ne dépassent pas les seuils. Limite connue de la règle (3) : pendant une attaque en cours, le titulaire qui se connecte depuis une adresse nouvelle peut devoir réessayer quelques secondes plus tard. L'adresse du client est lue derrière `TRUST_PROXY` proxys (1 par défaut : Caddy). S'applique aussi au mot de passe actuel saisi lors d'un changement d'identifiants ou de mot de passe : un échec compte comme à la connexion, un mot de passe actuel correct remet le compteur à zéro. Un compte désactivé ou supprimé n'est signalé (`AUTH_ACCOUNT_DISABLED`) qu'avec le bon mot de passe, pour ne pas révéler quels comptes existent.
- CSRF : cookie `SameSite=Strict`, vérification de l'en-tête `Origin` (obligatoire, parmi `APP_ORIGINS`) et jeton CSRF sur les requêtes qui modifient des données. Le jeton est un HMAC du `csrf_secret` de la session ; avant connexion, `GET /auth/csrf` pose un cookie de pré-session qui porte ce secret, supprimé à la connexion.
- Compte admin initial créé par la migration des comptes, avec le drapeau `users.must_change_credentials = true`. Tant que ce drapeau est actif, un guard global ne laisse passer que `auth/me`, le changement d'identifiants, la déconnexion et les routes publiques ; la passerelle WebSocket du chat refuse la connexion. Pour l'admin, `newUsername` est obligatoire (`400 VALIDATION_FAILED`, `isNotEmpty` ou `sameAsCurrent`) ; un autre compte ne peut pas changer de pseudo (`notAllowed`). Un changement d'identifiants réussi révoque les autres sessions du compte.
- Le compte admin ne peut être ni désactivé, ni supprimé, ni réinitialisé depuis le site (`422 ADMIN_ACCOUNT_PROTECTED`) : sa récupération passe uniquement par la commande serveur.
- Script CLI de réinitialisation, exécuté par `docker compose exec backend node dist/src/cli/reset-admin.js` : il génère et affiche un mot de passe temporaire, remet `must_change_credentials` à `true` et révoque les sessions de l'admin. L'action est tracée dans le journal (`user.reset_password`, acteur `cli`).

## Dépendances
- [13 — API](13-api.md#2-routes-utilisateur-apiv1) : routes d'authentification, CSRF et limitation (`429`).
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

**Décisions (2026-09-26)**
- Session de 7 jours glissants, 30 jours au plus ; blocage de 15 minutes après 5 échecs ; mot de passe de 12 à 128 caractères sans autre règle.
- Jeton CSRF avant connexion porté par un cookie de pré-session.
- Compte admin protégé des actions web de désactivation, suppression et réinitialisation.
