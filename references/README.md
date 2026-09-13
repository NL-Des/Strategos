# Strategos

## Objectif
Un site web basé sur un google sheet ou un excel. Les kits de créations de pages et autres éléments, permettraient d'utiliser les ressources.

## Profils
- **Administrateur** : construit les pages, gère les groupes et les droits, valide les modifications des utilisateurs sur les excels et google sheet.
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
- **Moteur Excel/Sheets (`excel-sync`)** : reste en TypeScript/Node dans la v1, par choix et non par oubli. À l'échelle visée (voir section Excel et Google Sheets), le parsing/staging n'est pas le goulot d'étranglement ; les points réellement durs (résolution des liaisons inter-fichiers, fusion des soumissions concurrentes, lecture live de l'API Sheets) sont des problèmes de modélisation et d'orchestration, pas de vitesse brute. Introduire Rust ou Go ajouterait une image Docker, une frontière IPC et un second toolchain à maintenir sans résoudre ces points — à l'encontre de l'objectif "facile à déployer / facile à maintenir".

## Authentification
Authentification par **session**, mots de passe **hachés** (bcrypt ou argon2 — à sens unique, jamais réversible).

**Comptes créés par l'administrateur** : page admin dédiée où l'admin saisit lui-même pseudo et mot de passe pour chaque profil.

## Notifications
Pas de notifications de prévues pour le moment.

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

- Options de personnalisation des zones :
  - image ou couleur en arrière plan de page : pour une page ou toutes les pages. (Avec le page builder)
  - Textes : couleurs, polices d'écritures, styles,...
  - Couleur, style des encadrés des discussion et de leurs messages

Liste des modules intégrables dans chaque zone :
- Placement d'images simple
- Placement d'images amenant sur une page du site ou à l'extérieur
- Tableaux (Avec un appel de données de l'Excel ou du Sheet, ou un tableau simple à remplir)
- Tableaux pouvant accueillir des images et du texte, pour construire un catalogue (une image accompagné de textes, parfois en plusieurs cases à côté ou autour)(Avec un appel de données de l'Excel ou du Sheet, ou un tableau simple à remplir).
- Chatbot (messagerie interne simple, sans intégration IA)
- Sujets de discussion / messages (pouvant contenir des images)
- Page (Avec un appel de données de l'Excel ou du Sheet, ou une page simple à remplir)
- Boutons (nombre à indiquer, noms à renseigner, placement à indiquer (haut, bas, gauche, droite), destination à désigner)
- Formulaire de modification de l'excel ou du google sheet (l'administrateur relie à un champs d'écriture du formulaire, une case du document excel ou du google sheet)
- **Cartes cliquables** : image sur laquelle l'administrateur dessine des zones transparentes ou semi-transparentes ; un clic sur une zone mène vers une page interne ou une page externe. Composant le plus complexe de la liste (éditeur de zones dédié).
  - Zones en **polygones libres** (dessinées à la souris), pas de simples rectangles.
  - Zones **disjointes** : l'éditeur empêche/avertit en cas de chevauchement entre deux zones.
  - Une carte = **une seule image** avec ses zones ; pas de système de sous-images/calques imbriqués.

## Excel et Google Sheets
- Support des deux : **Excel** (connexion via une API ou équivalent disponible) et **Google Sheets** (connexion live via API, OAuth côté administrateur).
- **Formulaires de modification** : l'administrateur définit des formulaires (champs texte, menus de sélection...) mappés à des cellules. Une soumission utilisateur reste en attente jusqu'à validation par l'administrateur, qui applique alors la modification réelle au fichier/sheet. Il pourra accepter, refuser ou modifier la soumission.
- **Soumissions concurrentes** : si plusieurs utilisateurs soumettent des modifications sur la même cellule, toutes restent visibles en attente — l'administrateur voit le conflit et choisit, laquelle valider (ou les fusionne manuellement).
- **Google Sheets = source de vérité vivante** : l'état réel du Sheet est relu à chaque besoin (pas de copie figée en base) ; Strategos ne fait que proposer des modifications par-dessus. Les fichiers **Excel** uploadés, eux, sont importés à un instant T et nécessitent un réimport manuel déclenché par l'administrateur si le fichier source est modifié en dehors du système.
- **Échelle attendue** : dizaines à quelques centaines d'utilisateurs ; fichiers Excel/Sheets pouvant atteindre plusieurs milliers de lignes, plusieurs pages, avec des liaisons/appels internes entre différents fichiers Excel/Sheets.
  - Conséquence : les données Excel importées devront être mises en staging en base plutôt que reparsées à chaque lecture, et les liaisons inter-fichiers devront être résolues par référence (ID de fichier + cellule/plage) plutôt que par chemin de fichier.
- **Stockage des fichiers** : fichiers uploadés (images, Excel) stockés sur le système de fichiers (volume Docker), la BDD ne garde que les chemins et métadonnées.

## Points encore ouverts
- Détail du mécanisme de résolution des liaisons inter-fichiers Excel/Sheets (le point le plus délicat techniquement).