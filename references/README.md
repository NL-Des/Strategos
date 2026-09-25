# Strategos

## Objectif
Un site web basé sur un google sheet ou un excel. Les kits de créations de pages et autres éléments, permettraient d'utiliser ces ressources.

## Principe fondateur : aucun accès direct aux documents
Strategos fait toujours écran entre l'utilisateur et les fichiers Excel/Sheet : à aucun moment un utilisateur n'ouvre, ne lit ou n'écrit directement dans le document source. Toute interaction passe par une interface que l'administrateur définit au préalable :
- **En écriture** : l'administrateur construit un formulaire et relie chacun de ses champs à une cellule précise du document. L'utilisateur ne remplit que ce formulaire ; sa soumission reste une *proposition* en attente de validation admin (voir [Excel et Google Sheets](#excel-et-google-sheets)).
- **En lecture** : l'administrateur construit une page et y place des modules (tableau, catalogue, page simple...) qui vont chercher leurs données dans le document. L'utilisateur ne voit que ce que l'admin a choisi d'exposer, jamais le fichier brut (voir [Page builder](#page-builder-modules-préformatés)).

Cet encadrement systématique des interactions a deux objectifs : **fluidifier le trafic** (pas d'accès concurrent non maîtrisé sur le fichier source, un seul point de passage pour l'écriture) et **limiter les erreurs** (l'utilisateur ne peut jamais casser une structure ou une formule du document, puisqu'il n'interagit qu'avec des champs et des affichages que l'admin a explicitement définis).

## Profils
- **Administrateur** : construit les pages, gère les groupes et les droits, valide les modifications des utilisateurs sur les excels et google sheet. **Un seul compte administrateur par instance** (pas de multi-admin en v1) — simplifie l'OAuth Google Sheets (une seule connexion par instance) et évite les conflits de validation concurrente.
- **Utilisateur** : consulte et interagit avec les pages selon les droits de ses groupes. Dispose d'un profil privé (voir [Profil utilisateur](#profil-utilisateur)).

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
Suppression douce (soft-delete) pour sujets, messages, groupes, utilisateurs, notes personnelles, **formulaires et pages** : le contenu est marqué supprimé et masqué de l'interface, mais reste en base — préserve l'historique des modifications Excel/Sheets validées (on garde la trace du formulaire/page d'origine) et les références passées, et permet une restauration.

## Droits d'accès — modèle par groupes
- L'administrateur crée des **groupes**.
- Chaque groupe reçoit des droits de **lecture** et **écriture** sur des ressources : sujets, messages, pages. Le droit de **création** ne s'applique qu'aux sujets et aux messages — les pages restent entièrement construites par l'administrateur via le page builder, jamais par les utilisateurs.
- Un utilisateur peut appartenir à plusieurs groupes ; ses droits effectifs sont l'union des permissions de ses groupes.
- Ce modèle permet à la fois des **espaces communs** (groupe partagé par plusieurs utilisateurs) et des **espaces privés** (groupe restreint à un seul utilisateur, ou groupe personnel). En v1, un espace privé reste une page dupliquée et paramétrée manuellement par l'administrateur (plage de cellules fixée à la main pour chaque utilisateur) — pas de mécanisme de page modèle générant automatiquement une plage par utilisateur.
- L'administrateur crée les profils utilisateurs et les assigne aux groupes (voir [Gestion des comptes et des groupes](#gestion-des-comptes-et-des-groupes)).
- **Conflits entre groupes** : union simple des permissions — dès qu'un des groupes d'un utilisateur autorise un droit sur une ressource, l'utilisateur l'a (pas de notion de refus explicite qui prime).
- **Formulaires (modification et ajout)** : ils ne constituent pas une ressource à part dans le modèle de droits — un formulaire est accessible à quiconque a le droit de lecture sur la page qui le contient ; c'est cet accès à la page qui conditionne la possibilité de soumettre. Cette règle s'applique identiquement aux formulaires de modification et aux formulaires d'ajout.

## Gestion des comptes et des groupes
L'administrateur dispose d'un **espace d'administration dédié** pour gérer les comptes, les groupes et contrôler qui a accès à quoi.

- **Comptes** :
  - Création (pseudo + mot de passe saisis par l'admin, voir [Authentification](#authentification)).
  - Modification du pseudo, **réinitialisation du mot de passe** par l'admin (nouveau mot de passe saisi par lui — pas d'envoi d'email, voir [Notifications](#notifications)).
  - **Désactivation / réactivation** : un compte désactivé ne peut plus se connecter et ses sessions en cours sont immédiatement fermées ; ses groupes et son historique sont conservés.
  - Suppression en soft-delete (voir [Suppression de contenu](#suppression-de-contenu)).
  - Consultation, en lecture seule, des notes personnelles de l'utilisateur depuis sa fiche (voir [Profil utilisateur](#profil-utilisateur)).
- **Groupes** :
  - Création, renommage, description, suppression (soft-delete).
  - Ajout / retrait de membres, aussi bien depuis la fiche du groupe que depuis la fiche d'un utilisateur.
  - Définition des permissions lecture / écriture / création par ressource (voir [Droits d'accès](#droits-daccès--modèle-par-groupes)).
- **Visualisation des droits** (lecture seule, calculée selon la règle d'union des groupes) :
  - **Par utilisateur** : ses groupes et ses droits effectifs sur chaque page, sujet et messages, avec pour chaque droit **le ou les groupes qui l'accordent** — permet de comprendre d'où vient un accès.
  - **Par groupe** : ses membres et les permissions qu'il déclare, ressource par ressource.
  - **Par ressource** (page, sujet) : qui peut lire, écrire ou créer, et via quel groupe. Accessible aussi depuis le page builder.
  - **Matrice globale** : tableau utilisateurs × ressources (cellules L / É / C), filtrable par groupe, type de ressource ou utilisateur, pour une vue d'ensemble.
- **Journal des modifications** : chaque action sur les comptes, les appartenances aux groupes et les permissions est tracée (action, cible, état avant/après, date). Consultable et filtrable par l'administrateur, non modifiable. Pas de purge automatique définie pour l'instant (point à retravailler plus tard, comme le backup).

## Profil utilisateur
Chaque utilisateur dispose d'un **profil privé**, accessible par lui seul et par l'administrateur — jamais par les autres utilisateurs. Le profil est hors du modèle de droits par groupes : aucun groupe ne peut donner accès au profil d'un autre. Ses deux pages sont fixes, **hors page builder** (pas de zones ni de modules personnalisables).

- **Page administrative** (lecture seule stricte) :
  - Pseudo, date de création du compte, statut du compte.
  - Groupes d'appartenance et droits effectifs, avec le ou les groupes qui accordent chaque droit (même calcul que la vue "par utilisateur" de l'admin, voir [Gestion des comptes et des groupes](#gestion-des-comptes-et-des-groupes)).
  - Lien vers la page "mes soumissions" (voir [Excel et Google Sheets](#excel-et-google-sheets)).
  - Rien n'y est modifiable, pas même le mot de passe : il n'est changé que par réinitialisation de l'administrateur.
- **Page de notes** :
  - Liste de notes personnelles, chacune avec un titre et un texte mis en forme simplement (gras, italique, listes, liens).
  - L'utilisateur crée, modifie et supprime ses notes (soft-delete, voir [Suppression de contenu](#suppression-de-contenu)).
  - Pas d'images, pas de partage entre utilisateurs.
- **Accès de l'administrateur** : lecture seule des notes, depuis la fiche de l'utilisateur ; il ne peut ni les modifier ni les supprimer. Chaque consultation est tracée dans le journal des modifications. Une mention permanente sur la page de notes indique à l'utilisateur qu'elles sont visibles par l'administrateur.

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
  - La plage de cellules affichée par un tableau est fixe, définie une fois par l'administrateur : tous les utilisateurs voyant la page voient la même donnée (pas de filtrage par groupe ou par utilisateur à ce stade).
- Tableaux pouvant accueillir des images et du texte, pour construire un catalogue (une image accompagné de textes, parfois en plusieurs cases à côté ou autour)(Avec un appel de données de l'Excel ou du Sheet, ou un tableau simple à remplir).
- Chatbot (messagerie interne simple, sans intégration IA)
- Sujets de discussion / messages (pouvant contenir des images)
- Page (Avec un appel de données de l'Excel ou du Sheet, ou une page simple à remplir)
- Boutons (nombre à indiquer, noms à renseigner, placement à indiquer (haut, bas, gauche, droite), destination à désigner)
- Formulaire de modification ou d'ajout de l'excel ou du google sheet (modification : l'administrateur relie un champ à une case existante du document ; ajout : l'administrateur définit une ligne de départ, des colonnes autorisées et un nombre max de nouvelles lignes)
- **Cartes cliquables** : image sur laquelle l'administrateur dessine des zones transparentes ou semi-transparentes ; un clic sur une zone mène vers une page interne ou une page externe. Composant le plus complexe de la liste (éditeur de zones dédié).
  - Zones en **polygones libres** (dessinées à la souris), pas de simples rectangles.
  - Zones **disjointes** : l'éditeur empêche/avertit en cas de chevauchement entre deux zones.
  - Une carte = **une seule image** avec ses zones ; pas de système de sous-images/calques imbriqués.

## Excel et Google Sheets
- Support des deux : **Excel** (connexion via une API ou équivalent disponible) et **Google Sheets** (connexion live via API, OAuth côté administrateur).
- **Formulaires de modification** : l'administrateur définit des formulaires (champs texte, menus de sélection...) dont chaque champ est mappé à exactement une cellule (un champ = une cellule, jamais plusieurs cellules pour un même champ). Une soumission utilisateur reste en attente jusqu'à validation par l'administrateur, qui applique alors la modification réelle au fichier/sheet. Il pourra accepter, refuser ou modifier la soumission.
- **Deux types de formulaires** :
  - **Formulaire de modification** : un champ = une cellule déjà existante (voir ci-dessus).
  - **Formulaire d'ajout** : permet à l'utilisateur de proposer une **nouvelle ligne**, dans un cadre entièrement défini par l'admin à la création du formulaire :
    - **Ligne de départ** : l'admin choisit la ligne/cellule à partir de laquelle les nouvelles lignes peuvent être ajoutées (par ex. juste après la dernière ligne existante, ou une ligne précise si de la place a été laissée).
    - **Colonnes autorisées** : chaque champ du formulaire est mappé à une colonne (et non plus à une cellule fixe) dans la plage définie par l'admin — un champ = une colonne, jamais plusieurs colonnes pour un même champ (miroir de la règle "un champ = une cellule" ci-dessus).
    - **Nombre maximum de nouvelles lignes** : l'admin fixe une limite totale de lignes que ce formulaire peut créer ; une fois la limite atteinte, le formulaire n'accepte plus de nouvelles soumissions (affiché comme complet/fermé côté utilisateur).
  - La **ligne réellement attribuée** à une soumission "ajout" n'est déterminée qu'**à la validation** (pas à la soumission) : la prochaine ligne libre dans la plage est calculée à partir du nombre de soumissions déjà validées sur ce formulaire — cohérent avec la gestion des soumissions concurrentes ci-dessous, où plusieurs soumissions "ajout" en attente ne se réservent pas de ligne tant qu'elles ne sont pas validées. Si la limite de lignes est atteinte alors que des soumissions sont encore en attente, l'admin peut toujours les refuser, mais ne peut plus les valider (message d'erreur explicite) — évite de dépasser silencieusement la limite.
- **Cellule-formule ciblée** : l'administrateur peut mapper un champ de formulaire à une cellule contenant une formule ou une liaison vers un autre fichier ; valider une soumission dessus écrase la formule par une valeur brute. Ce n'est pas interdit, mais un avertissement explicite est affiché à l'admin à la création du formulaire et à la validation de chaque soumission le concernant.
- **Soumissions concurrentes** : si plusieurs utilisateurs soumettent des modifications sur la même cellule, toutes restent visibles en attente — l'administrateur voit le conflit et choisit, laquelle valider (ou les fusionne manuellement).
- **Suivi des soumissions** : l'utilisateur dispose d'une page "mes soumissions" listant ses propositions et leur statut (en attente, validée, refusée, modifiée par l'admin). Pas de notification active (email, push...) — l'information est consultable, pas poussée.
- **Formulaire modifié ou supprimé** : si l'administrateur change le mapping champ→cellule d'un formulaire ou le supprime alors que des soumissions sont encore en attente dessus, ces soumissions sont automatiquement invalidées ; l'utilisateur devra resoumettre via la nouvelle version du formulaire.
- **Google Sheets = source de vérité vivante** : l'état réel du Sheet fait foi (pas de copie figée en base) ; Strategos ne fait que proposer des modifications par-dessus. En pratique, la lecture passe par un **cache court** (30-60 secondes) pour éviter de cogner les quotas de l'API Sheets à chaque affichage de page — quasi-live du point de vue utilisateur, sans appel API à chaque requête. Les fichiers **Excel** uploadés, eux, sont importés à un instant T et nécessitent un réimport manuel déclenché par l'administrateur si le fichier source est modifié en dehors du système.
- **Édition directe par l'administrateur** : rien n'empêche l'administrateur de modifier le Sheet/fichier directement en dehors de Strategos (édition Google Sheets native, etc.). Si la cellule visée a changé depuis qu'une soumission a été faite dessus, aucune détection automatique n'est prévue — la validation applique la modification telle quelle, la vigilance repose sur l'administrateur.
- **Échelle attendue** : dizaines à quelques centaines d'utilisateurs ; fichiers Excel/Sheets pouvant atteindre plusieurs milliers de lignes, plusieurs pages, avec des liaisons/appels internes entre différents fichiers Excel/Sheets.
  - Conséquence : les données Excel importées devront être mises en staging en base plutôt que reparsées à chaque lecture, et les liaisons inter-fichiers devront être résolues par référence (ID de fichier + cellule/plage) plutôt que par chemin de fichier.
- **Stockage des fichiers** : fichiers uploadés (images, Excel) stockés sur le système de fichiers (volume Docker), la BDD ne garde que les chemins et métadonnées.

## Modèles et duplication
Pour éviter à l'administrateur de reconstruire formulaires, pages et sujets de discussion à chaque fois, il peut les enregistrer comme **modèles nommés** et les réutiliser :
- **Ressources concernées** : formulaires de modification, pages entières, sujets de discussion. (Les groupes n'entrent pas dans ce mécanisme.)
- **Bibliothèque de modèles** : l'administrateur peut sauvegarder une réalisation existante comme modèle nommé, puis l'instancier autant de fois que nécessaire depuis une bibliothèque dédiée.
- **Instanciation d'un modèle de formulaire** : la copie garde les champs, labels et types du modèle, mais son mapping champ→cellule est réinitialisé — l'administrateur choisit la cellule cible pour chaque nouvelle instance. Évite que deux formulaires distincts écrivent silencieusement sur la même cellule. Pour un modèle de formulaire d'ajout, la réinitialisation porte aussi sur la ligne de départ, les colonnes autorisées et le nombre max de nouvelles lignes — l'administrateur doit les redéfinir à chaque nouvelle instance.
- **Instanciation d'un modèle de page** : la nouvelle page est une copie complète et indépendante — tous ses modules internes (dont les formulaires et tableaux) sont eux aussi dupliqués, avec leurs mappings de cellule réinitialisés le cas échéant. Utile notamment pour créer rapidement une page privée par utilisateur (voir [Droits d'accès](#droits-daccès--modèle-par-groupes)).
- **Instanciation d'un modèle de sujet** : seule la structure de départ est reprise (titre type, message d'ouverture éventuel) — pas les messages déjà postés sur les sujets précédemment créés à partir de ce modèle.