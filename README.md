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
- **Frontend** : React ou Vue + TypeScript (à trancher), rendu de pages piloté par une config JSON (liste ordonnée de blocs typés).
- **BDD** : PostgreSQL, données sauvegardées dans un volume Docker local.
- **Déploiement** : Docker Compose (une image front, une image back, une image BDD), lancement en une seule commande.

## Authentification
Comptes locaux (email / mot de passe, hash bcrypt ou argon2). Pas de SSO externe pour le moment.

## Droits d'accès — modèle par groupes
- L'administrateur crée des **groupes**.
- Chaque groupe reçoit des droits de **lecture**, **écriture**, **création** sur des ressources : sujets, messages, pages.
- Un utilisateur peut appartenir à plusieurs groupes ; ses droits effectifs sont l'union des permissions de ses groupes.
- Ce modèle permet à la fois des **espaces communs** (groupe partagé par plusieurs utilisateurs) et des **espaces privés** (groupe restreint à un seul utilisateur, ou groupe personnel).
- L'administrateur crée les profils utilisateurs et les assigne aux groupes.

## Page builder (modules préformatés)
Liste des zones constituant chaque page (il n'y a pas d'obligation à toutes les avoir) :
- Header
- Main
- Sidebar
- Footer

Liste des modules intégrables dans chaque zone :
- Tableaux
- Placement d'images
- Chatbot (messagerie interne simple, sans intégration IA)
- Sujets de discussion / messages
- Boutons
- Formulaire de modification de l'excel ou du google sheet
- **Cartes cliquables** : image sur laquelle l'administrateur dessine des zones transparentes ou semi-transparentes ; un clic sur une zone mène vers une page interne ou une page externe. Composant le plus complexe de la liste (éditeur de zones dédié).

Chaque module est un type enregistré côté backend (schéma + validation) avec un composant de rendu côté frontend. Une page = une séquence d'instances de modules, configuration stockée en base (JSON).

## Frontend / personnalisation
- Style simple, facilement personnalisable par l'administrateur (images de fond, vidéos, couleurs, polices).
- L'utilisateur peut construire son propre style si l'administrateur l'y autorise, avec accès à un tableau de personnalisation pour ses sujets et messages.

## Excel et Google Sheets
- Support des deux : **Excel** (upload/export de fichiers) et **Google Sheets** (connexion live via API, OAuth côté administrateur).
- **Formulaires de modification** : l'administrateur définit des formulaires (champs texte, menus de sélection...) mappés à des cellules. Une soumission utilisateur reste en attente jusqu'à validation par l'administrateur, qui applique alors la modification réelle au fichier/sheet.
- **Archive / historique** : chaque modification validée crée un snapshot, permettant un retour en arrière.
- **Échelle attendue** : dizaines à quelques centaines d'utilisateurs ; fichiers Excel/Sheets pouvant atteindre plusieurs milliers de lignes, plusieurs pages, avec des liaisons/appels internes entre différents fichiers Excel/Sheets.
  - Conséquence : les données Excel/Sheets importées devront être mises en staging en base plutôt que reparsées à chaque lecture, et les liaisons inter-fichiers devront être résolues par référence (ID de fichier + cellule/plage) plutôt que par chemin de fichier.

## Points encore ouverts
- Choix définitif React vs Vue pour le frontend.
- Détail du mécanisme de résolution des liaisons inter-fichiers Excel/Sheets (le point le plus délicat techniquement).
- Détail de l'éditeur de zones cliquables pour les cartes.
- Session vs JWT pour l'authentification locale.
