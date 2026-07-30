# Strategos

## Objectif
Une plateforme web interne, facile à déployer (une seule commande), facile à utiliser, avec une sauvegarde locale des données, et modulable.

## Profils
- **Administrateur** : construit les pages, gère les groupes et les droits, valide les modifications des utilisateurs.
- **Utilisateur** : consulte et interagit avec les pages selon les droits de ses groupes.

## Stack technique
- **Backend** : Node.js + TypeScript, framework **NestJS**.
  - Modules Nest isolés par domaine (auth, groupes/permissions, pages, sujets/messages, excel-sync).
  - Guards Nest pour appliquer les permissions de groupe sur chaque route/action.
  - class-validator pour valider les configs de modules de page et les formulaires Excel dynamiques.
- **Frontend** : React + TypeScript, rendu de pages piloté par une config JSON (liste ordonnée de blocs typés), **responsive** (mobile et tablette pris en charge, pas seulement desktop).
- **BDD** : PostgreSQL, données sauvegardées dans un volume Docker local.
- **Déploiement** : Docker Compose (une image front, une image back, une image BDD), lancement en une seule commande.
- **Backup** : au-delà du volume Docker local, pas de stratégie de sauvegarde externe définie pour l'instant (point à retravailler plus tard).

## Authentification
Authentification par **session**, mots de passe **hachés** (bcrypt ou argon2 — à sens unique, jamais réversible). Pas de SSO externe pour le moment.

Deux modes possibles, **choisis une fois pour toutes par l'administrateur à l'initialisation du site** (pas de bascule entre les deux après coup) :
1. **Comptes créés par l'administrateur** : page admin dédiée où l'admin saisit lui-même pseudo et mot de passe pour chaque profil.
2. **Inscription classique par email** : formulaire d'inscription libre, avec validation par lien de confirmation envoyé par email avant activation du compte.

## Notifications
Notifications in-app uniquement (centre de notifications dans l'interface) : soumission en attente, validation, rejet, nouveau message. Pas d'email pour l'instant.

## Suppression de contenu
Suppression douce (soft-delete) pour sujets, messages, groupes et utilisateurs : le contenu est marqué supprimé et masqué de l'interface, mais reste en base — préserve l'historique des modifications Excel/Sheets validées et les références passées, et permet une restauration.

## Droits d'accès — modèle par groupes
- L'administrateur crée des **groupes**.
- Chaque groupe reçoit des droits de **lecture**, **écriture**, **création** sur des ressources : sujets, messages, pages.
- Un utilisateur peut appartenir à plusieurs groupes ; ses droits effectifs sont l'union des permissions de ses groupes.
- Ce modèle permet à la fois des **espaces communs** (groupe partagé par plusieurs utilisateurs) et des **espaces privés** (groupe restreint à un seul utilisateur, ou groupe personnel).
- L'administrateur crée les profils utilisateurs et les assigne aux groupes.
- **Conflits entre groupes** : union simple des permissions — dès qu'un des groupes d'un utilisateur autorise un droit sur une ressource, l'utilisateur l'a (pas de notion de refus explicite qui prime).

## Page builder (modules préformatés)
L'administrateur aura une page avec des cases à cocher pour valider la présence d'une zone. Puis il aura des cases à cocher pour valider les modules à mettre dedans.
Liste des zones constituant chaque page (il n'y a pas d'obligation à toutes les avoir) :
- Header
- Main
- Sidebar
- Footer

- Facilement personnalisable :
  - image ou couleur en arrière plan de page : pour une page ou toutes les pages. (Avec le page builder)
  - vidéos en arrière plan de page : pour une page ou toutes les pages. (Avec le page builder)
  - Textes : couleurs, polices d'écritures, styles,...
  - Couleur, style des encadrés des discussion et de leurs messages

Liste des modules intégrables dans chaque zone :
- Placement d'images simple
- Placement d'images amenant sur une page du site ou à l'extérieur
- Tableaux
- Tableaux pouvant accueillir des images et du texte, pour construire un catalogue (une image accompagné de textes, parfois en plusieurs cases à côté ou autour).
- Chatbot (messagerie interne simple, sans intégration IA)
- Sujets de discussion / messages (pouvant contenir des images)
- Boutons (nombre à indiquer, noms à renseigner, placement à indiquer (haut, bas, gauche, droite))
- Formulaire de modification de l'excel ou du google sheet
- **Cartes cliquables** : image sur laquelle l'administrateur dessine des zones transparentes ou semi-transparentes ; un clic sur une zone mène vers une page interne ou une page externe. Composant le plus complexe de la liste (éditeur de zones dédié).
  - Zones en **polygones libres** (dessinées à la souris), pas de simples rectangles.
  - Zones **disjointes** : l'éditeur empêche/avertit en cas de chevauchement entre deux zones.
  - Une carte = **une seule image** avec ses zones ; pas de système de sous-images/calques imbriqués.

Chaque module est un type enregistré côté backend (schéma + validation) avec un composant de rendu côté frontend. Une page = une séquence d'instances de modules, configuration stockée en base (JSON).

## Prévisualisation en direct
- Chaque page a une configuration **brouillon** (draft) distincte de la configuration **publiée**. L'administrateur édite toujours le brouillon.
- Un onglet de prévisualisation (`/preview/:pageId`) affiche le rendu du brouillon en temps réel via **WebSocket** : chaque modification faite dans l'éditeur est poussée instantanément à l'onglet preview, sans rechargement.
- Cela permet de juger l'ergonomie et le rendu visuel pendant la construction, avant publication.
- Le bouton "Publier" copie la configuration brouillon vers la configuration publiée, visible par les utilisateurs.
- **Accès à la prévisualisation** : réservé aux comptes administrateurs, quels que soient les droits de groupe définis sur la page.

## Frontend / personnalisation
- L'utilisateur devra avoir accès à un outil de construction de pages et de personnalisation. Pour si l'administrateur l'autorise, faire son propre style.

## Excel et Google Sheets
- Support des deux : **Excel** (upload/export de fichiers) et **Google Sheets** (connexion live via API, OAuth côté administrateur).
- **Formulaires de modification** : l'administrateur définit des formulaires (champs texte, menus de sélection...) mappés à des cellules. Une soumission utilisateur reste en attente jusqu'à validation par l'administrateur, qui applique alors la modification réelle au fichier/sheet. Les formulaires devront pouvoir avoir des formules et actions cachées écrites par l'administrateur, qui seront visibles ou cachées de l'utilisateur.
- **Soumissions concurrentes** : si plusieurs utilisateurs soumettent des modifications sur la même cellule avant validation, toutes restent visibles en attente — l'administrateur voit le conflit et choisit laquelle valider (ou les fusionne manuellement).
- **Archive / historique** : chaque modification validée crée un snapshot, permettant un retour en arrière.
- **Google Sheets = source de vérité vivante** : l'état réel du Sheet est relu à chaque besoin (pas de copie figée en base) ; Strategos ne fait que proposer des modifications par-dessus. Les fichiers **Excel** uploadés, eux, sont importés à un instant T et nécessitent un réimport manuel déclenché par l'administrateur si le fichier source est modifié en dehors du système.
- **Échelle attendue** : dizaines à quelques centaines d'utilisateurs ; fichiers Excel/Sheets pouvant atteindre plusieurs milliers de lignes, plusieurs pages, avec des liaisons/appels internes entre différents fichiers Excel/Sheets.
  - Conséquence : les données Excel importées devront être mises en staging en base plutôt que reparsées à chaque lecture, et les liaisons inter-fichiers devront être résolues par référence (ID de fichier + cellule/plage) plutôt que par chemin de fichier.
- **Stockage des fichiers** : fichiers uploadés (images, Excel) stockés sur le système de fichiers (volume Docker), la BDD ne garde que les chemins et métadonnées.

## Points encore ouverts
- Détail du mécanisme de résolution des liaisons inter-fichiers Excel/Sheets (le point le plus délicat techniquement).
