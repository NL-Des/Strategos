# 04 — Administration

## Objet
L'espace réservé à l'administrateur pour gérer les comptes, les groupes, comprendre qui a accès à quoi, et tracer les modifications.

## Règles fonctionnelles

### Espace d'administration
L'administrateur dispose d'un **espace d'administration dédié** pour gérer les comptes, les groupes et contrôler qui a accès à quoi.
- Comptes : voir [Comptes et authentification](02-comptes-authentification.md#cycle-de-vie-des-comptes).
- Groupes et permissions : voir [Droits et groupes](03-droits-groupes.md#gestion-des-groupes).
- La fiche d'un utilisateur permet aussi de désigner sa **page personnelle** (voir [Droits et groupes](03-droits-groupes.md#visibilité-et-page-darrivée)).

### Sources
Un écran liste les sources de données et permet de les gérer (voir [Sources de données](08-sources-donnees.md)) :
- **connecter ou reconnecter** son compte Google, puis **choisir** ses Google Sheets dans le sélecteur de fichiers de Google ; l'accès de chaque Sheet choisi est testé à l'ajout ;
- **connecter ou reconnecter** le compte OneDrive, puis ajouter un fichier ;
- **uploader** un Excel, le **télécharger** et le **réimporter** (avec l'avertissement prévu) ;
- **voir et modifier les cellules** d'un Excel uploadé : sa version de référence présentée comme un tableur (feuilles, fenêtres de 50 lignes × 26 colonnes, « aller à » une cellule). Un clic sur une cellule affiche sa formule ou sa valeur dans une barre de formule, où l'admin la modifie comme dans Excel : `=…` pour une formule, nombre, date, `VRAI`/`FAUX` ou texte. Les formules se lisent et s'écrivent **comme dans Excel en français** (`=SOMME(B2:B10;1,5)`) ; Strategos les convertit vers la syntaxe du fichier (`SUM(B2:B10,1.5)`) à l'enregistrement. À droite de la grille (dessous sur écran étroit), un **assistant de formules** aide à les lire et à les écrire, sans rien calculer : la formule décomposée en arbre (fonctions et leurs arguments nommés, opérations, références avec la valeur enregistrée des cellules citées), ses références surlignées dans la grille d'une couleur chacune, le guide des arguments de la fonction sous le curseur et un catalogue des fonctions courantes (recherche, catégories, insertion au curseur). Pendant la saisie d'une formule, un clic sur une cellule insère sa référence (Maj+clic ou glisser pour une plage, préfixée de la feuille si elle est ailleurs), comme dans Excel. Rien n'est calculé : une formule saisie garde la valeur de l'ancienne formule (vide s'il n'y en avait pas) et passe « à recalculer », comme les cellules qui dépendent d'une valeur modifiée ; Excel recalcule à l'ouverture du fichier téléchargé. Une formule ne peut pas citer un autre classeur (la liaison se crée dans Excel). Si une validation a changé la cellule pendant la saisie, la modification est refusée (conflit). Chaque modification est tracée et comptée au réimport comme une validation (voir [08](08-sources-donnees.md#excel-uploadé--version-de-référence-et-réimport)). Les sources connectées se consultent et se modifient dans Google Sheets ou OneDrive ;
- pour chaque source : type, état (joignable ou non), date de dernière lecture ou d'import, et pages qui l'utilisent, par un module ou par un formulaire (le header et le footer compris). Retirer une source encore utilisée déclenche un avertissement.

### Réglages de l'instance
Un écran regroupe les réglages globaux : **page d'arrivée**, **thème par défaut**, **durée de conservation des sauvegardes**, et téléchargement d'une sauvegarde.

### Visualisation des droits
Lecture seule, calculée selon la règle d'union des groupes :
- **Par utilisateur** : ses groupes et ses droits effectifs sur chaque page et chaque espace de discussion, avec pour chaque droit **le ou les groupes qui l'accordent** — permet de comprendre d'où vient un accès.
- **Par groupe** : ses membres et les permissions qu'il déclare, ressource par ressource.
- **Par ressource** (page, espace de discussion) : qui peut lire, ouvrir des sujets ou poster, et via quel groupe. Accessible aussi depuis le page builder.
- **Matrice globale** : tableau utilisateurs × ressources (cellules L pour lecture, S pour ouvrir un sujet, P pour poster), filtrable par groupe, type de ressource ou utilisateur, pour une vue d'ensemble.

### Tableau de bord des soumissions
Sans notifications (voir [Transverse](11-transverse.md#notifications)), l'espace admin rend les soumissions en attente impossibles à manquer :
- un **compteur** des soumissions en attente, visible en permanence dans l'espace admin ;
- une **file** triable et filtrable par formulaire, page, utilisateur et date : le formulaire se choisit parmi ceux de la page filtrée, l'utilisateur se cherche par pseudo (ou d'un clic sur une soumission) ;
- les **conflits** mis en évidence, c'est-à-dire plusieurs soumissions en attente sur une même cellule (voir [Formulaires et soumissions](09-formulaires-soumissions.md#soumissions)).

### Corbeille
Les éléments supprimés en douceur (pages, formulaires, sujets, messages des sujets et du chat, groupes, utilisateurs) sont listés dans une corbeille, filtrable par type, d'où l'administrateur peut les **restaurer** (voir [Suppression de contenu](11-transverse.md#suppression-de-contenu)).

Règles de restauration (tracée au journal, `trash.restore`) :
- **page** : seule la page revient ; ses formulaires, espaces et chats n'avaient pas été supprimés avec elle ;
- **formulaire** : son bloc est remis dans une nouvelle rangée, en fin de zone principale du brouillon de sa page ; il revient en ligne à la prochaine publication. Refusé si la page est elle-même supprimée ;
- **message de sujet** : refusé tant que son sujet est supprimé (restaurer le sujet d'abord) ; un message de chat reparaît au prochain chargement de l'historique ;
- **compte ou groupe** : refusé si son nom a été repris entre-temps (unicité partielle).

L'admin supprime un sujet depuis sa vue (bouton « Supprimer le sujet ») ; les messages et les autres éléments passent par leurs propres écrans.

> Les notes personnelles n'apparaissent pas dans la corbeille : l'admin ne peut ni les modifier ni les supprimer, donc pas davantage les restaurer (voir [Profil utilisateur](05-profil-utilisateur.md)).

### Journal des modifications
Sont tracées (action, cible, état avant/après, date) :
- les actions sur les comptes (y compris le changement d'identifiants ou de mot de passe fait par l'utilisateur lui-même), les appartenances aux groupes et les permissions ;
- les réglages de l'instance ;
- la **validation, le refus et la modification des soumissions**, y compris les validations automatiques, avec la valeur réellement écrite (avant/après pour un mouvement), la cellule et la source ;
- les sources : upload, ajout d'un Google Sheet ou d'un fichier OneDrive, connexion du compte Google ou OneDrive (compte connecté, jamais le jeton), téléchargement d'un Excel uploadé, modification d'une cellule dans la grille (cellule, contenu avant et après), réimport avec le choix fait (annuler, écraser, réappliquer) et retrait ;
- la modération par l'admin : masquage et rétablissement d'un message, modification ou suppression du message d'un autre, suppression d'un sujet ;
- les modifications et **publications** de pages, du header et du footer partagés, les modifications, publications et réglages de formulaires ;
- l'upload et la suppression des images de la médiathèque ;
- la création, la modification et la suppression des thèmes ;
- l'enregistrement, la suppression et l'instanciation des modèles ;
- la réinitialisation du compte admin par commande serveur (`user.reset_password`, acteur `cli`) ;
- les restaurations depuis la corbeille, et la restauration d'une sauvegarde (acteur `cli`) ;
- les consultations des notes personnelles (voir [Profil utilisateur](05-profil-utilisateur.md)).

Le journal est consultable et filtrable par l'administrateur, et non modifiable. Pas de purge automatique définie pour l'instant (point à retravailler plus tard, comme le backup).

## Points techniques
- **AuditModule** : écriture et consultation du journal des modifications ; appelé par AuthModule, UsersModule, GroupsModule, ProfileModule, SettingsModule, ThemesModule, MediaModule, PagesModule, SourcesModule, FormsModule, DiscussionsModule, ChatModule, TemplatesModule, TrashModule et les commandes serveur (CliModule). PermissionsModule ne fait que vérifier les droits et n'écrit rien.
- Les vues de droits s'appuient sur la fonction de résolution unique (voir [Calcul des droits effectifs](03-droits-groupes.md#calcul-des-droits-effectifs)).
- Routes d'administration (comptes, groupes, droits, journal) protégées par un guard de rôle admin.
- Chaque entrée du journal d'audit est écrite dans la **même transaction** que la modification qu'elle trace ; aucune route de modification ou de suppression du journal n'est exposée.

## Dépendances
- [02 — Comptes et authentification](02-comptes-authentification.md), [03 — Droits et groupes](03-droits-groupes.md) : objets administrés.
- [05 — Profil utilisateur](05-profil-utilisateur.md) : consultation des notes tracée dans le journal.
- [11 — Transverse](11-transverse.md) : backup, purge.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- Journal étendu aux soumissions, aux sources, aux pages, aux formulaires et aux restaurations.
- Corbeille avec restauration.
- Tableau de bord des soumissions en attente, avec mise en évidence des conflits.
- Écrans « Sources » et « Réglages de l'instance » ; page personnelle sur la fiche utilisateur.
