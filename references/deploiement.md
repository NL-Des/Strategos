# Mise en production

Ce guide installe Strategos sur une machine accessible depuis Internet, avec un nom de domaine et le HTTPS automatique. Il vaut pour deux cas :

- **un serveur loué (VPS)** chez un hébergeur (OVH, Hetzner, Scaleway…) ;
- **une machine chez vous**, derrière votre box Internet.

Les étapes sont les mêmes ; les différences sont signalées par **VPS** ou **À domicile**. L'architecture déployée est décrite dans [architecture.md §7](architecture.md#7-déploiement).

Google Sheets et OneDrive ne sont pas nécessaires : ils restent désactivés tant qu'ils ne sont pas configurés (Google Sheets depuis le site, section 10), et le reste du site fonctionne sans eux (Excel uploadés compris).

## 1. Prérequis

- Une machine Linux (Debian 12 ou Ubuntu 24.04 conseillés), avec **2 Go de RAM** et **20 Go de disque** au moins, et un accès administrateur (`sudo`).
- Un **nom de domaine** (ou un sous-domaine), par exemple `strategos.mon-domaine.fr`.
- Sur la machine : **Docker** avec le plugin **Compose**, et **git**.

Installer Docker (méthode officielle), puis git :

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # puis se déconnecter et se reconnecter
sudo apt install -y git
docker compose version            # doit afficher une version 2.x
```

## 2. Nom de domaine

Le domaine doit pointer vers l'adresse IP **publique** de la machine.

- **VPS** : chez votre registrar (le fournisseur du domaine), créez un enregistrement `A` vers l'IPv4 du serveur, et un `AAAA` vers son IPv6 s'il en a une.
- **À domicile** :
  - l'adresse publique est celle de votre box, visible par exemple sur `https://ifconfig.me` ;
  - si elle change régulièrement, utilisez un **DNS dynamique** : celui de votre registrar s'il en propose, ou un service gratuit comme DuckDNS (le domaine devient alors `xxx.duckdns.org`). Un petit programme sur la machine met l'adresse à jour ;
  - **attention au CGNAT** : certains fournisseurs partagent une même adresse publique entre plusieurs clients. Dans ce cas, le site n'est pas joignable depuis Internet ; demandez à votre fournisseur une IPv4 « full stack » (souvent gratuite), ou passez par un VPS.

Vérifiez depuis votre PC que le domaine répond bien avec la bonne adresse : `ping strategos.mon-domaine.fr`. La propagation DNS peut prendre de quelques minutes à quelques heures.

## 3. Réseau

Trois ports doivent être ouverts vers la machine : **80/TCP**, **443/TCP** et **443/UDP**. Le port 80 est indispensable : c'est par lui que Caddy obtient le certificat HTTPS (Let's Encrypt).

- **Pare-feu de la machine** (si `ufw` est utilisé) :

  ```bash
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw allow 443/udp
  sudo ufw enable
  ```

- **VPS** : si l'hébergeur a un pare-feu dans son interface web, ouvrez-y les mêmes ports.
- **À domicile** : dans l'interface de la box, créez une **redirection de ports** (NAT/PAT) des ports 80 et 443 (TCP, et 443 en UDP) vers l'adresse locale de la machine, et donnez à celle-ci une adresse locale fixe (bail DHCP statique).

La base de données n'est **pas** exposée : seul Caddy écoute sur Internet.

## 4. Installation

```bash
git clone <adresse-du-dépôt> strategos
cd strategos
cp .env.example .env
```

Éditez `.env` (`nano .env`) :

| Variable | Valeur |
|---|---|
| `DOMAIN` | Votre domaine, sans `https://` : `strategos.mon-domaine.fr` |
| `TZ` | `Europe/Paris` (fuseau de la sauvegarde de 3 h) |
| `POSTGRES_PASSWORD` | Un mot de passe fort, généré par `openssl rand -base64 24` |
| `POSTGRES_USER`, `POSTGRES_DB` | Garder les valeurs proposées |
| `AZURE_*` | Laisser vides (OneDrive désactivé) |
| `TOKEN_ENCRYPTION_KEY` | Laisser vide : le site crée lui-même sa clé de chiffrement |

Le fichier `.env` n'est jamais versionné ; gardez-en une copie en lieu sûr.

> Choisissez `POSTGRES_PASSWORD` **avant** le premier lancement : la base est initialisée avec lui. Le changer ensuite demande de le changer aussi dans PostgreSQL.

## 5. Lancement

```bash
docker compose up -d --build
```

La première construction prend quelques minutes. Au démarrage, le backend applique lui-même les migrations de la base. Pour vérifier :

```bash
docker compose ps                          # les quatre services « running » (db « healthy »)
docker compose logs -f backend proxy       # Ctrl+C pour quitter
curl https://strategos.mon-domaine.fr/api/v1/health
```

Dans les journaux de `proxy`, Caddy indique l'obtention du certificat (`certificate obtained successfully`). Le site est alors accessible sur `https://strategos.mon-domaine.fr`.

## 6. Première connexion

Connectez-vous avec **`admin` / `admin`**. Strategos impose aussitôt de choisir un nouveau nom et un mot de passe (12 caractères au moins) : rien d'autre n'est accessible avant. Faites-le tout de suite après le lancement.

Si vous perdez ce mot de passe plus tard :

```bash
docker compose exec backend node dist/src/cli/reset-admin.js
```

La commande affiche un mot de passe temporaire, à changer à la connexion suivante.

## 7. Sauvegardes

- Une sauvegarde de la base et des fichiers uploadés est faite **chaque nuit à 3 h** (fuseau `TZ`), dans le volume Docker `backups`. Leur durée de conservation se règle dans **Admin › Réglages** (7 jours par défaut).
- Ces archives restent sur la même machine : si le disque ou le serveur est perdu, elles le sont aussi. **Routine à tenir** : téléchargez régulièrement la dernière sauvegarde depuis **Admin › Réglages › Sauvegardes** (par exemple chaque semaine, et avant chaque mise à jour) et gardez-la sur un autre support (PC, disque externe, stockage en ligne).
- Sauvegarde immédiate : `docker compose exec backend node dist/src/cli/run-backup.js`.
- Restauration : voir les commandes de la section « Exploitation » du [README](../README.md#exploitation-docker).

Les documents Google Sheets et OneDrive ne sont pas sauvegardés par Strategos : leur historique reste chez Google ou Microsoft. Les identifiants Google et les connexions aux comptes Google et Microsoft sont dans la sauvegarde, mais chiffrés avec une clé qui n'y est pas (volume Docker `keys`) : après une restauration sur une autre machine, ressaisissez les identifiants Google et reconnectez les comptes dans **Admin › Sources** ; un Google Sheet relié par un script est à retirer puis à relier de nouveau (nouveau script).

## 8. Mises à jour

```bash
cd strategos
docker compose exec backend node dist/src/cli/run-backup.js   # sauvegarde avant
git pull
docker compose up -d --build
```

Les migrations sont appliquées au redémarrage du backend. Téléchargez aussi la sauvegarde faite juste avant (section 7).

Pour les mises à jour du système : `sudo apt update && sudo apt upgrade`, et de temps en temps `docker system prune` pour libérer l'espace des anciennes images.

## 9. Dépannage

| Symptôme | Cause probable |
|---|---|
| Le certificat n'est pas obtenu, le navigateur signale un site non sécurisé | Le domaine ne pointe pas encore vers la machine (section 2), ou le port 80 est fermé (section 3). Voir `docker compose logs proxy` |
| Le site s'affiche, mais toute action échoue avec une erreur de sécurité (`CSRF_INVALID`) | Le site est ouvert par une autre adresse que `DOMAIN` (par exemple l'IP du serveur, ou `www.`). Utiliser exactement l'adresse de `DOMAIN` |
| Le backend redémarre en boucle | Voir `docker compose logs backend` ; souvent la base indisponible ou `POSTGRES_PASSWORD` changé après le premier lancement |
| Mot de passe admin perdu | `reset-admin` (section 6) |
| Disque plein | Réduire la durée de conservation des sauvegardes, `docker system prune`, vérifier la taille des volumes : `docker system df -v` |
| À domicile : site joignable chez vous mais pas de l'extérieur | Redirection de ports de la box, ou CGNAT (section 2) |

## 10. Activer Google Sheets (facultatif)

Rien à faire sur le serveur : tout se passe dans le site, dans **Admin › Sources**. Trois façons de relier un Google Sheet, à choisir pour chaque document :

| Carte de l'écran Sources | Mise en place | Écriture par les formulaires | Le Sheet |
|---|---|---|---|
| **Google Sheets par lien public** | Coller le lien de partage | Non (lecture seule) | Lisible par quiconque a le lien |
| **Google Sheets par script** | Coller un script dans le Sheet et le déployer (5 minutes, guidé) | Oui | Reste privé |
| **Google Sheets** (compte connecté) | Projet Google Cloud, décrit ci-dessous | Oui | Reste privé ; accès limité aux Sheets choisis |

Les deux premières ne demandent rien de plus que ce que l'écran explique. La suite de cette section ne concerne que la troisième, carte « Google Sheets ». L'écran affiche le même pas à pas que ci-dessous, avec les deux adresses de votre site prêtes à copier.

À faire une fois, dans la [console Google Cloud](https://console.cloud.google.com/), avec n'importe quel compte Google :

1. **Créer un projet** (menu des projets, en haut › « Nouveau projet »).
2. **Activer deux API** (« API et services » › « Bibliothèque ») : **Google Sheets API** et **Google Picker API**.
3. **Écran de consentement** (« API et services » › « Écran de consentement OAuth ») : type **Externe**, un nom d'application, votre adresse e-mail.
4. **Publier l'application** : sur le même écran, bouton « Publier l'application ». Sans cela, la connexion expire tous les 7 jours. Aucune validation par Google n'est demandée : Strategos ne demande l'accès qu'aux fichiers que vous choisissez.
5. **Client OAuth** (« Identifiants » › « Créer des identifiants » › « ID client OAuth ») : type **Application Web**. Copiez-y les deux adresses affichées par l'écran Sources :
   - Origines JavaScript autorisées : `https://strategos.mon-domaine.fr`
   - URI de redirection autorisés : `https://strategos.mon-domaine.fr/api/v1/google/callback`

   Notez l'**ID client** et le **code secret**.
6. **Clé d'API** (« Identifiants » › « Créer des identifiants » › « Clé API ») : restreignez-la aux sites web `https://strategos.mon-domaine.fr/*` et à l'API **Google Picker API**.

Collez l'ID client, le code secret et la clé d'API dans le formulaire de l'écran Sources, puis **Enregistrer**. Le bouton **Connecter mon compte Google** apparaît ; une fois connecté, **Choisir des Google Sheets** ouvre le sélecteur de fichiers de Google. Strategos n'accède qu'aux Sheets choisis.

Si la connexion échoue, vérifiez l'ID client, le code secret et les deux adresses déclarées chez Google : une faute de frappe ne se voit qu'à ce moment-là. Les identifiants se remplacent depuis le même écran (« Identifiants Google »).

### Vous installez le site pour quelqu'un d'autre

Pour que le gérant n'ait rien à saisir, faites vous-même les six étapes ci-dessus, puis mettez les valeurs dans `.env` au lieu du formulaire :

| Variable | Valeur |
|---|---|
| `GOOGLE_CLIENT_ID` | L'ID client (`123456789-….apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | Le code secret du client |
| `GOOGLE_API_KEY` | La clé d'API |

Puis `docker compose up -d`. Ces valeurs ont priorité sur celles du formulaire, qui n'est alors plus affiché : le gérant voit directement **Connecter mon compte Google**.

Si la connexion Google expire (accès révoqué depuis le compte Google, mot de passe changé, six mois sans usage), un bandeau le signale dans l'espace admin : **Reconnecter** suffit.
