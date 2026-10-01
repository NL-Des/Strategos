# Mise en production

Ce guide installe Strategos sur une machine accessible depuis Internet, avec un nom de domaine et le HTTPS automatique. Il vaut pour deux cas :

- **un serveur loué (VPS)** chez un hébergeur (OVH, Hetzner, Scaleway…) ;
- **une machine chez vous**, derrière votre box Internet.

Les étapes sont les mêmes ; les différences sont signalées par **VPS** ou **À domicile**. L'architecture déployée est décrite dans [architecture.md §7](architecture.md#7-déploiement).

Google Sheets et OneDrive ne sont pas nécessaires : ils restent désactivés tant que leurs secrets ne sont pas fournis, et le reste du site fonctionne sans eux (Excel uploadés compris).

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
| `GOOGLE_*` | Laisser vides (Google Sheets désactivé) ; pour l'activer, voir la [section 10](#10-activer-google-sheets-facultatif) |
| `AZURE_*` | Laisser vides (OneDrive désactivé) |
| `TOKEN_ENCRYPTION_KEY` | Vide tant que ni Google Sheets ni OneDrive ne sont activés |

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

Les documents Google Sheets et OneDrive ne sont pas sauvegardés par Strategos : leur historique reste chez Google ou Microsoft. La connexion au compte Google ou Microsoft, elle, est dans la sauvegarde, chiffrée avec `TOKEN_ENCRYPTION_KEY` : sans votre copie de `.env`, il suffit de reconnecter le compte dans **Admin › Sources**.

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

À faire une fois, par la personne qui installe le site. Ensuite, l'administrateur n'a plus qu'à cliquer sur **Connecter mon compte Google** dans **Admin › Sources**, puis à choisir ses Sheets : Strategos n'accède qu'aux Sheets choisis.

Dans la [console Google Cloud](https://console.cloud.google.com/), avec n'importe quel compte Google :

1. **Créer un projet** (menu des projets, en haut › « Nouveau projet »).
2. **Activer deux API** (« API et services » › « Bibliothèque ») : **Google Sheets API** et **Google Picker API**.
3. **Écran de consentement** (« API et services » › « Écran de consentement OAuth ») : type **Externe**, un nom d'application, votre adresse e-mail. Ajoutez le scope `…/auth/drive.file` (« Consulter et modifier les fichiers Google Drive que vous utilisez avec cette application »).
4. **Publier l'application** : sur le même écran, bouton « Publier l'application ». Sans cela, la connexion expire tous les 7 jours. Aucune validation par Google n'est demandée : `drive.file` n'est pas un accès sensible.
5. **Client OAuth** (« Identifiants » › « Créer des identifiants » › « ID client OAuth ») : type **Application Web**.
   - Origines JavaScript autorisées : `https://strategos.mon-domaine.fr`
   - URI de redirection autorisés : `https://strategos.mon-domaine.fr/api/v1/google/callback`

   Notez l'**ID client** et le **code secret**.
6. **Clé d'API** (« Identifiants » › « Créer des identifiants » › « Clé API ») : restreignez-la aux sites web `https://strategos.mon-domaine.fr/*` et à l'API **Google Picker API**.

Reportez ces valeurs dans `.env` :

| Variable | Valeur |
|---|---|
| `GOOGLE_CLIENT_ID` | L'ID client (`123456789-….apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | Le code secret du client |
| `GOOGLE_API_KEY` | La clé d'API |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32`, si elle n'est pas déjà remplie. **Ne la changez plus ensuite** : la connexion enregistrée deviendrait illisible |

Puis `docker compose up -d` pour que le backend relise `.env`.

Si la connexion Google expire (accès révoqué depuis le compte Google, mot de passe changé, six mois sans usage), un bandeau le signale dans l'espace admin : **Reconnecter** suffit.
