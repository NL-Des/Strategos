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
- **Frontend** : React + TypeScript, rendu de pages piloté par une config JSON (liste ordonnée de blocs typés).
- **BDD** : PostgreSQL, données sauvegardées dans un volume Docker local.
- **Déploiement** : Docker Compose (une image front, une image back, une image BDD), lancement en une seule commande.

## Authentification
Comptes locaux (email / mot de passe, hash bcrypt ou argon2), authentification par **session**. Pas de SSO externe pour le moment.

## Droits d'accès — modèle par groupes
- L'administrateur crée des **groupes**.
- Chaque groupe reçoit des droits de **lecture**, **écriture**, **création** sur des ressources : sujets, messages, pages.
- Un utilisateur peut appartenir à plusieurs groupes ; ses droits effectifs sont l'union des permissions de ses groupes.
- Ce modèle permet à la fois des **espaces communs** (groupe partagé par plusieurs utilisateurs) et des **espaces privés** (groupe restreint à un seul utilisateur, ou groupe personnel).
- L'administrateur crée les profils utilisateurs et les assigne aux groupes.

## Page builder (modules préformatés)
L'administrateur aura une page avec des cases à cocher pour valider la présence d'une zone. Puis il aura des cases à cocher pour valider les modules à mettre dedans.
Liste des zones constituant chaque page (il n'y a pas d'obligation à toutes les avoir) :
- Header
- Main
- Sidebar
- Footer

Liste des modules intégrables dans chaque zone :
- Tableaux
- Placement d'images simple
- Placement d'images amenant sur une page du site ou à l'extérieur
- Chatbot (messagerie interne simple, sans intégration IA)
- Sujets de discussion / messages (pouvant contenir des images)
- Boutons (nombre à indiquer, noms à renseigner, placement à indiquer (haut, bas, gauche, droite))
- Formulaire de modification de l'excel ou du google sheet
- **Cartes cliquables** : image sur laquelle l'administrateur dessine des zones transparentes ou semi-transparentes ; un clic sur une zone mène vers une page interne ou une page externe. Composant le plus complexe de la liste (éditeur de zones dédié).

Chaque module est un type enregistré côté backend (schéma + validation) avec un composant de rendu côté frontend. Une page = une séquence d'instances de modules, configuration stockée en base (JSON).

## Prévisualisation en direct
- Chaque page a une configuration **brouillon** (draft) distincte de la configuration **publiée**. L'administrateur édite toujours le brouillon.
- Un onglet de prévisualisation (`/preview/:pageId`) affiche le rendu du brouillon en temps réel via **WebSocket** : chaque modification faite dans l'éditeur est poussée instantanément à l'onglet preview, sans rechargement.
- Cela permet de juger l'ergonomie et le rendu visuel pendant la construction, avant publication.
- Le bouton "Publier" copie la configuration brouillon vers la configuration publiée, visible par les utilisateurs.

## Frontend / personnalisation
- Style simple, facilement personnalisable par l'administrateur (images de fond, vidéos, couleurs, polices).
- L'utilisateur peut construire son propre style si l'administrateur l'y autorise, avec accès à un tableau de personnalisation pour ses sujets et messages.

## Excel et Google Sheets
- Support des deux : **Excel** (upload/export de fichiers) et **Google Sheets** (connexion live via API, OAuth côté administrateur).
- **Formulaires de modification** : l'administrateur définit des formulaires (champs texte, menus de sélection...) mappés à des cellules. Une soumission utilisateur reste en attente jusqu'à validation par l'administrateur, qui applique alors la modification réelle au fichier/sheet. Les formulaires devront pouvoir avoir des formules et actions cachées écrites par l'administrateur, qui seront visibles ou cachées de l'utilisateur.
- **Archive / historique** : chaque modification validée crée un snapshot, permettant un retour en arrière.
- **Échelle attendue** : dizaines à quelques centaines d'utilisateurs ; fichiers Excel/Sheets pouvant atteindre plusieurs milliers de lignes, plusieurs pages, avec des liaisons/appels internes entre différents fichiers Excel/Sheets.
  - Conséquence : les données Excel/Sheets importées devront être mises en staging en base plutôt que reparsées à chaque lecture, et les liaisons inter-fichiers devront être résolues par référence (ID de fichier + cellule/plage) plutôt que par chemin de fichier.

## Points encore ouverts
- Détail du mécanisme de résolution des liaisons inter-fichiers Excel/Sheets (le point le plus délicat techniquement).
- Détail de l'éditeur de zones cliquables pour les cartes.
