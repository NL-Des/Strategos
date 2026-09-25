# 12 — Parcours

## Objet
Mettre la conception à l'épreuve avec des scénarios complets, qui traversent plusieurs parties. Chaque étape renvoie à la règle qui la permet. Quand aucune règle ne couvrait une étape, elle a été marquée comme **trou**, puis tranchée : chaque trou renvoie à la règle qui le résout.

## Parcours A — Première installation (communauté « Les Loups Gris »)

1. Nadia, l'admin, dépose le Compose sur son serveur, renseigne le nom de domaine et la clé du compte de service Google, puis lance `docker compose up`. Caddy obtient le certificat HTTPS ([11](11-transverse.md#stack-technique)).
2. Elle se connecte avec `admin` / `admin` et doit immédiatement changer d'identifiants ([02](02-comptes-authentification.md#compte-administrateur)).
3. Elle veut relier le Google Sheet de la guilde. Il faut qu'elle le partage avec l'adresse du compte de service ([08](08-sources-donnees.md#trois-types-de-source)).
   - **✔ Trou 1** : aucun écran n'est décrit pour **gérer les sources** (ajouter un Sheet par son lien, voir l'adresse du compte de service, tester la connexion, voir l'état et la date de synchro, uploader et télécharger un Excel, reconnecter OneDrive). → *Résolu* : écran **Sources** dans l'espace admin, qui affiche l'adresse du compte de service et teste l'accès ([04](04-administration.md#sources)).
4. Elle crée les groupes « Partie commune », « Membres » et « Officiers », puis les comptes des joueurs ([03](03-droits-groupes.md), [04](04-administration.md)).
   - **✔ Trou 2** : le mot de passe saisi à la **création** d'un compte est-il temporaire, comme lors d'une réinitialisation ? Sinon, Nadia connaît durablement le mot de passe de chacun. → *Résolu* : oui, le mot de passe de création est **temporaire** ([02](02-comptes-authentification.md#cycle-de-vie-des-comptes)).
5. Elle construit le header partagé avec une barre de boutons (Accueil, Tournoi, Taverne), puis la page d'accueil, qu'elle publie et désigne comme page d'arrivée ([06](06-page-builder.md#structure-dune-page)).
   - **✔ Trou 3** : aucun écran n'est décrit pour les **réglages de l'instance** (page d'arrivée, thème par défaut, durée de conservation des sauvegardes). → *Résolu* : écran **Réglages de l'instance** ([04](04-administration.md#réglages-de-linstance)).
6. Kira se connecte pour la première fois et arrive sur l'accueil.
   - **✔ Trou 4** : comment Kira accède-t-elle à **son profil**, à ses **notes**, à **« mes soumissions »**, et comment **se déconnecte**-t-elle ? Toute la navigation est construite par l'admin ([01](01-vision.md#environnement-construit-par-ladministrateur)), mais ces pages sont hors page builder. Si Nadia oublie de placer ces liens, Kira ne peut même pas se déconnecter. → *Résolu* : un **menu de compte** fixe, seule exception à la construction par l'admin ([06](06-page-builder.md#menu-de-compte)).

## Parcours B — Tournoi de guilde (Google Sheets, formulaire d'ajout)

1. La feuille « Inscriptions » contient les colonnes Pseudo, Classe, Niveau et Équipe. Nadia crée la page « Tournoi » avec :
   - un Contenu libre : « Règlement… Places restantes : **{Inscriptions!F1}** » ([06](06-page-builder.md#contenu-libre)) ;
   - un Tableau en plage extensible ([06](06-page-builder.md#plage-des-tableaux-et-formulaires-dajout)) ;
   - un Formulaire d'ajout avec la ligne de départ 2 et 64 lignes au maximum ([09](09-formulaires-soumissions.md)) ;
   - un Espace de discussion lisible par « Membres », où ceux-ci peuvent ouvrir des sujets et poster ([07](07-discussions.md#espaces-de-discussion)).
2. Kira remplit le formulaire.
   - **✔ Trou 5** : le champ **Pseudo** devrait être rempli automatiquement avec le pseudo de Kira, sans être modifiable. Sinon, n'importe qui peut inscrire n'importe qui. Il n'existe pas de **champ automatique** (pseudo, date). → *Résolu* : **champ automatique** « pseudo », non modifiable ([09](09-formulaires-soumissions.md#formulaires)).
   - **✔ Trou 6** : le champ **Classe** est une liste déroulante, mais on ne sait pas d'où viennent ses options (saisies par l'admin ? lues dans une plage du Sheet ?). Plus largement, les **types de champs et leurs règles de validation** (obligatoire, nombre min/max, longueur) ne sont pas décrits. → *Résolu* : types de champs, règles de validation, options de liste **saisies ou lues dans une plage** ([09](09-formulaires-soumissions.md#formulaires)).
3. La soumission apparaît dans le tableau de bord de Nadia ([04](04-administration.md#tableau-de-bord-des-soumissions)). Elle valide : la première ligne vide de la zone reçoit l'inscription, le cache est invalidé, et le tableau l'affiche aussitôt. Côté Kira, la page « mes soumissions » indique « validée » ([09](09-formulaires-soumissions.md#soumissions)).
4. La veille du tournoi, Nadia veut clore les inscriptions alors qu'il reste des places.
   - **✔ Trou 7** : un formulaire ne peut se fermer que lorsqu'il est **complet**. Il manque une **fermeture manuelle**, voire une date limite. → *Résolu* : **fermeture manuelle** et **date limite** facultative ([09](09-formulaires-soumissions.md#formulaires)).

## Parcours C — Gestion de stock (entreprise, OneDrive)

1. Marc, l'admin de l'entreprise, connecte son OneDrive (accès délégué) et relie `stock.xlsx`, qui contient 200 produits ([08](08-sources-donnees.md)).
2. Il crée la page « Stock » avec un Catalogue : image du produit tirée de la médiathèque, nom, référence, quantité ([06](06-page-builder.md#catalogue)).
3. Julie, magasinière, veut signaler qu'il ne reste que 5 cartons du produit n°137.
   - **✔ Trou 8** : un formulaire de modification relie chaque champ à **une cellule fixe**. Pour 200 produits, il faudrait donc 200 formulaires. Il manque un **formulaire de modification de ligne**, où l'utilisateur choisit la ligne (par exemple depuis la carte ou la ligne du tableau, ou dans une liste), et où chaque champ correspond à une colonne. → *Résolu* : **formulaire de ligne**, identifié par une colonne clé, lancé et pré-rempli depuis la ligne du Tableau ou la carte du Catalogue ([09](09-formulaires-soumissions.md#formulaires), [06](06-page-builder.md#tableau)).
4. Au même moment, Paul propose 7 pour le même produit. Les deux propositions apparaissent en conflit, et Marc choisit ([09](09-formulaires-soumissions.md#soumissions)).
   - **✔ Trou 9** : pour un stock, on raisonne souvent en **mouvements** (« −3 cartons ») plutôt qu'en valeur finale. Une valeur absolue proposée le matin peut être fausse à la validation, l'après-midi. → *Résolu* : **champ « mouvement »** : Julie saisit −3, Paul −1, le stock final vaut 4 quel que soit l'ordre, sans conflit ([09](09-formulaires-soumissions.md#formulaires)).
   - **✔ Trou 10** : avec des dizaines de mouvements par jour, **tout faire valider par l'admin unique** risque d'être intenable en entreprise (choix assumé pour la v1, [01](01-vision.md#profils)). Faut-il une **validation automatique**, activable formulaire par formulaire ? → *Résolu* : **validation automatique** activable par formulaire ; en cas d'échec, la soumission repasse en attente chez l'admin ([09](09-formulaires-soumissions.md#formulaires)).

## Parcours D — Espace privé d'un joueur (modèles, profil)

1. Nadia crée un modèle de page « Espace joueur » : un Tableau (inventaire), un Contenu libre (« Or : {…} ») et un Formulaire de modification.
2. Pour Arkan, elle instancie le modèle. La copie est créée en brouillon, avec des plages et des mappings vides ([10](10-modeles-duplication.md)). Elle choisit la feuille « Arkan », crée le groupe personnel « Arkan », lui donne la lecture sur la page, et publie ([03](03-droits-groupes.md#modèle-par-groupes)).
3. Il faut maintenant un lien vers cette page.
   - **✔ Trou 11** : le header est **partagé**, donc un bouton « Mon espace » ne peut viser qu'**une seule** page. Chaque joueur ayant la sienne, il faudrait une destination « **page personnelle de l'utilisateur** », résolue pour chacun. → *Résolu* : destination « **Ma page personnelle** », désignée sur la fiche de chaque utilisateur ([06](06-page-builder.md#destinations-des-liens)).
4. Arkan consulte ses notes et ses soumissions depuis son profil ([05](05-profil-utilisateur.md)). Le trou 4 se pose à nouveau pour y accéder.

## Dépendances
Toutes les parties.

## Questions ouvertes
_Aucune pour l'instant : les trous 1 à 11 sont résolus._

**Décisions (2026-09-25)**
- Voir la résolution de chaque trou ci-dessus.
