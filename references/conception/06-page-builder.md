# 06 — Page builder

## Objet
L'outil avec lequel l'administrateur compose les pages du site : des zones, des rangées, des modules préformatés et des thèmes. C'est l'unique moyen d'exposer en lecture les données des documents (voir [Vision](01-vision.md#principe-fondateur--aucun-accès-direct-aux-documents)), et l'unique moyen de construire la navigation.

## Règles fonctionnelles

### Structure d'une page
L'administrateur coche les zones présentes sur la page, puis y place ses modules.

- **Zones** : Header, Main, Sidebar, Footer. Il n'y a pas d'obligation à toutes les avoir : l'admin coche celles qu'il veut.
- **Header et footer partagés** : l'admin construit **un header et un footer communs** à tout le site (typiquement, les boutons de navigation). Page par page, il choisit de les afficher ou non. Main et Sidebar sont propres à chaque page.
- **Rangées et colonnes** : une zone est une pile de **rangées**, et chaque rangée contient **1, 2 ou 3 colonnes**. Chaque colonne accueille un module. L'admin ordonne les rangées et choisit la répartition des colonnes (ex. 1/2 + 1/2, 2/3 + 1/3).
- **Responsive** : sur mobile, les colonnes d'une rangée s'empilent et la Sidebar passe sous le Main.

### Brouillon et publication
- L'admin modifie toujours un **brouillon** et peut le voir en **aperçu**. Les utilisateurs continuent de voir la version publiée.
- Un bouton **Publier** remplace la version en ligne par le brouillon. La publication est tracée dans le [journal](04-administration.md#journal-des-modifications).
- Même règle pour le header et le footer partagés.
- Une page jamais publiée n'est visible par personne d'autre que l'admin.

### Thèmes
La personnalisation passe par des **thèmes**. L'administrateur crée plusieurs thèmes nommés, chacun regroupant :
- image ou couleur en arrière plan de page
- Textes : couleurs, polices d'écritures, styles,...
- Couleur, style des encadrés des discussion et de leurs messages
- style des boutons, des tableaux et des cartes de catalogue

L'admin désigne un **thème par défaut** et peut attribuer un **thème à chaque page** : une page sans thème attribué utilise le thème par défaut. Il n'y a ni thème par groupe ni choix de l'utilisateur.

La mise en forme des fichiers sources (gras, couleurs de cellules…) **n'est pas reproduite** : Strategos ne lit que des valeurs, et l'apparence vient du thème et des formats choisis par l'admin.

### Médiathèque
L'admin dispose d'une **médiathèque** où il uploade ses images. Elle alimente les modules Image, Catalogue, Contenu libre et Carte cliquable. Supprimer une image encore utilisée déclenche un avertissement qui liste les pages concernées.

### Menu de compte
Seul élément qui n'est pas construit par l'admin : une **icône de compte**, fixe dans un coin de l'écran sur toutes les pages. Elle ouvre **Profil**, **Notes**, **Mes soumissions** et **Déconnexion** (voir [Profil utilisateur](05-profil-utilisateur.md)). Son style suit le thème de la page.

### Destinations des liens
Un bouton, une image ou une zone de carte peut viser :
- une **page interne** ;
- une **URL externe** ;
- « **Ma page personnelle** » : chaque utilisateur est mené à la page personnelle que l'admin lui a désignée (voir [Droits et groupes](03-droits-groupes.md#visibilité-et-page-darrivée)). Cela permet un bouton « Mon espace » unique dans le header partagé. Le lien est masqué pour un utilisateur qui n'a pas de page personnelle.

### Liens vers des pages non autorisées
Un lien (bouton, image-lien, zone de carte) vers une page que l'utilisateur ne peut pas lire est **masqué** :
- un bouton disparaît ;
- une image reste affichée, mais sans lien ;
- une zone de carte devient inactive : elle n'a plus de surbrillance, plus de libellé, et n'est plus cliquable.

Les liens externes (URL) sont toujours affichés.

## Fiches des modules
Chaque module suit la même fiche : **rôle**, **réglages de l'admin**, **rendu pour l'utilisateur**, et **accès**.

| Module | Rôle | Données |
|---|---|---|
| [Image](#image) | Afficher une image, avec un lien facultatif | Médiathèque |
| [Boutons](#boutons) | Barre de navigation ou d'actions | — |
| [Carte cliquable](#carte-cliquable) | Image dont des zones mènent à des pages | Médiathèque |
| [Tableau](#tableau) | Afficher une plage d'un document | Source |
| [Catalogue](#catalogue) | Une carte (image + textes) par ligne d'un document | Source + médiathèque |
| [Contenu libre](#contenu-libre) | Texte mis en forme, avec des valeurs de cellules insérées | Saisie admin + source |
| [Formulaire](#formulaire) | Proposer une modification ou un ajout | Source |
| [Espace de discussion](#espace-de-discussion) | Mini-forum : sujets et messages | Base Strategos |
| [Chat](#chat) | Messagerie en temps réel | Base Strategos |

### Image
- **Réglages** : image de la médiathèque, texte alternatif, taille (largeur de la colonne ou taille d'origine), alignement, **lien facultatif** (page interne ou URL externe).
- **Rendu** : l'image, cliquable si un lien est défini et autorisé.

### Boutons
- **Réglages** : liste de boutons (libellé, destination : page interne ou URL externe), **orientation** (horizontale ou verticale) et **alignement** (gauche, centre, droite). Le style vient du thème.
- **Rendu** : une barre de boutons à l'endroit où le module est placé. La position dans la page découle du choix de la zone et de la rangée ; typiquement, le header partagé contient la barre de navigation. Sur mobile, une barre horizontale trop longue passe à la ligne.
- **Accès** : les boutons vers des pages non autorisées sont masqués.

### Carte cliquable
Image sur laquelle l'administrateur dessine des zones ; un clic sur une zone mène vers une page interne ou une page externe. C'est le composant le plus complexe de la liste (éditeur de zones dédié).
- **Réglages** :
  - une image de la médiathèque ;
  - des zones en **polygones libres** (dessinées à la souris), pas de simples rectangles ;
  - zones **disjointes** : l'éditeur empêche/avertit en cas de chevauchement entre deux zones ;
  - pour chaque zone : destination, **libellé**, **couleur** et **opacité** (invisible, semi-transparente, opaque), libellé affiché au survol ou en permanence ;
  - une carte = **une seule image** avec ses zones ; pas de système de sous-images/calques imbriqués.
- **Rendu** : au survol, la zone passe en **surbrillance** et son libellé s'affiche en infobulle. Sur mobile, un premier appui met la zone en surbrillance et affiche le libellé, et un second appui ouvre le lien. La carte s'adapte à la largeur de l'écran, les zones suivant l'image.
- **Accès** : les zones vers des pages non autorisées sont inactives.

### Tableau
- **Réglages** :
  - la source, la feuille et la **plage** (fixe ou extensible, voir [Plage des tableaux](#plage-des-tableaux-et-formulaires-dajout)) ;
  - si la première ligne sert d'en-têtes ;
  - pour chaque **colonne** : visible ou masquée, libellé affiché, **format** (texte, nombre, date, monnaie, image, lien) ;
  - le nombre de lignes par page ;
  - le tri et la recherche, activables ou non.
- **Formulaire de ligne** (facultatif) : l'admin peut relier le tableau à un formulaire de ligne de la même source ; chaque ligne affiche alors un bouton « Proposer une modification » (voir [Formulaires et soumissions](09-formulaires-soumissions.md#formulaires)).
- **Rendu** : un tableau paginé, **triable** par colonne et **filtrable** par une recherche. Une valeur marquée « à recalculer » (Excel uploadé, voir [Sources de données](08-sources-donnees.md#formules--strategos-ne-calcule-jamais)) porte un indicateur. Sur mobile, le tableau défile horizontalement.
- **Accès** : tous les lecteurs de la page voient la même donnée (pas de filtrage par groupe ou par utilisateur à ce stade).

### Catalogue
- **Réglages** :
  - source, feuille et plage (fixe ou extensible), comme pour le tableau ;
  - une **mise en page de carte** prédéfinie : image en haut, à gauche, à droite, ou en fond ;
  - la correspondance entre les emplacements et les colonnes : **image**, **titre**, **sous-titre**, **détails** (une ou plusieurs colonnes, avec leur libellé et leur format) ;
  - le nombre de cartes par rangée (1 à 4) ;
  - la pagination et la recherche ;
  - un formulaire de ligne relié, facultatif (bouton « Proposer une modification » sur chaque carte).
- **Images** : la colonne image contient soit le **nom d'un fichier de la médiathèque** (« epee.png »), soit un **lien web** (https://…). Si l'image est introuvable, une image par défaut est affichée.
- **Rendu** : une grille de cartes, une carte par ligne du document. Sur mobile, les cartes passent à une par rangée.

### Contenu libre
- **Réglages** : un éditeur de texte riche : titres, gras, italique, listes, liens, tableaux simples, images de la médiathèque. L'admin peut y **insérer des valeurs de cellules** (bouton « Insérer une valeur » : source, feuille, cellule, format), par exemple « Trésor de la guilde : **{Stock!B2}** pièces d'or ».
- **Rendu** : le texte mis en forme, dont les valeurs sont lues depuis la source (cache ou staging) à chaque affichage. Une valeur « à recalculer » porte l'indicateur.
- Ce module remplace l'ancien module « Page » et le module « Vue de données ».

### Formulaire
Formulaire de modification, de ligne ou d'ajout de l'excel ou du google sheet (détails dans [Formulaires et soumissions](09-formulaires-soumissions.md#formulaires)). Un formulaire de ligne n'est pas placé seul sur la page : il s'ouvre depuis le Tableau ou le Catalogue auquel il est relié.
- **Réglages** : titre, texte d'introduction, message affiché après l'envoi, puis les champs et leurs mappings (détaillés dans [Formulaires et soumissions](09-formulaires-soumissions.md)).
- **Rendu** : le formulaire ; « complet » pour un formulaire d'ajout dont la zone est pleine, « fermé » s'il a été fermé par l'admin ou si sa date limite est passée ; masqué tant qu'il n'est pas configuré.
- **Accès** : quiconque peut lire la page peut soumettre.

### Espace de discussion
Un mini-forum : une liste de sujets, et leurs messages (pouvant contenir des images). C'est une **ressource du modèle de droits** (lecture, ouverture de sujets, publication de messages). Règles détaillées dans [Discussions](07-discussions.md#espaces-de-discussion).
- **Réglages** : nom de l'espace, sujets épinglés, tri des sujets (activité récente ou date de création).
- **Accès** : si l'utilisateur ne peut pas lire l'espace, le module est **invisible**, même s'il peut lire la page.

### Chat
Messagerie interne en temps réel, sans intégration IA. L'admin le place sur les pages de son choix. Règles détaillées dans [Discussions](07-discussions.md#chat).
- **Réglages** : nom du salon, hauteur du module.
- **Accès** : quiconque peut lire la page peut lire le chat et y écrire.

### Plage des tableaux et formulaires d'ajout
Un tableau ou un catalogue relié à une source affiche une plage qui peut être :
- **fixe** : une plage précise, par exemple `A1:D11` ;
- **extensible** : des colonnes à partir d'une ligne donnée, **jusqu'à la dernière ligne remplie**, par exemple « colonnes A à D à partir de la ligne 1 ». Le tableau suit alors tout seul les lignes ajoutées, que ce soit par un formulaire d'ajout ou par l'admin directement dans le document.

**Avertissement** : si une plage fixe ne couvre pas la zone d'un formulaire d'ajout qui écrit dans la même source, l'administrateur est averti à la création du formulaire et à la modification du tableau.

> **Exemple** : une feuille « Inscriptions tournoi » contient les en-têtes en ligne 1 et 10 inscrits en lignes 2 à 11. L'admin place un tableau `A1:D11` et un formulaire d'ajout (ligne de départ 12, 20 lignes au maximum, voir [Formulaires et soumissions](09-formulaires-soumissions.md)). Quand une inscription est validée, elle est écrite en ligne 12, mais le tableau fixe ne l'affiche pas et le joueur croit que son inscription a échoué. Strategos avertit donc l'admin, qui choisit soit une plage **extensible** (« colonnes A à D à partir de la ligne 1 »), soit une plage fixe élargie `A1:D31`.

## Points techniques
- **PagesModule** : CRUD des pages, brouillon et publication, header/footer partagés, thèmes, médiathèque, soft-delete.
- **Brouillon/publication** : `pages.draft_config` et `pages.published_config` (JSONB), `published_at`. Le header et le footer partagés sont stockés dans `layout_parts(kind[header|footer], draft_config, published_config, published_at)`. La page porte `show_header` et `show_footer`.
- **Structure du JSON** d'une zone : `rows[] → { columns: [{ width, block }] }`, où `block = { id, type, config }`. Les `block.id` sont stables, parce que les formulaires, espaces de discussion et chats y sont rattachés (`page_block_id`).
- **Registre des modules** : `BlockRenderer` avec un registre `{ blockType: Component }` : `image`, `buttons`, `clickable_map`, `table`, `catalog`, `rich_content`, `form`, `discussion_space`, `chat`. Chaque type a son schéma de `config`, validé par `class-validator` côté backend.
- **Assemblage côté backend** : à la lecture d'une page publiée, le backend retire les modules non autorisés (espaces illisibles, formulaires non configurés, modules de données sans plage) et les liens vers des pages illisibles, puis résout les valeurs (cellules du contenu libre, plages). Le frontend ne reçoit jamais ce qu'il ne doit pas afficher.
- **Tableaux et catalogues** : `range_mode[fixed|extensible]`. La pagination, le tri et la recherche sont faits **côté backend** sur les données du staging ou du cache (milliers de lignes), avec une requête par page affichée. En mode extensible, la dernière ligne remplie est calculée à la lecture.
- **Médiathèque** : table `media(id, filename, path, mime, size, alt, uploaded_at, deleted_at)`, fichiers sur le volume `uploads`. Une image est référencée par son `filename` unique (catalogue) ou par son `id` (autres modules).
- **Carte cliquable** : l'éditeur (polygones libres, détection de chevauchement) est un composant isolé, sur canvas/SVG dédié. Les coordonnées des polygones sont stockées en **pourcentages** de l'image, pour s'adapter à toutes les tailles d'écran.
- **Contenu libre** : HTML en liste blanche, nettoyé côté backend (même bibliothèque que les notes, voir [Profil utilisateur](05-profil-utilisateur.md#points-techniques)). Les valeurs insérées sont des balises `{source_id, sheet_ref, cell_ref, format}` résolues à l'affichage.
- **Layout** : responsive par zones et par rangées, en CSS Grid/Flexbox, avec des breakpoints mobile et tablette.

## Dépendances
- [03 — Droits et groupes](03-droits-groupes.md) : accès aux pages et aux espaces de discussion.
- [04 — Administration](04-administration.md) : journal des publications.
- [07 — Discussions](07-discussions.md) : modules Espace de discussion et Chat.
- [08 — Sources de données](08-sources-donnees.md) : données des tableaux, catalogues et contenus libres.
- [09 — Formulaires et soumissions](09-formulaires-soumissions.md) : module formulaire.
- [10 — Modèles et duplication](10-modeles-duplication.md) : modèles de pages.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- Le module « Page » est remplacé par « Contenu libre », qui peut insérer des valeurs de cellules. « Vue de données » est supprimé. Tableau et Catalogue sont toujours reliés à une source.
- « Image simple » et « Image-lien » sont fusionnés en un module **Image** ; le module « Chatbot » devient **Chat** ; les sujets deviennent l'**Espace de discussion**.
- Plusieurs thèmes nommés, un thème par défaut et un thème par page. La mise en forme des sources n'est pas reproduite.
- Plage des tableaux fixe ou extensible, avec un avertissement si un formulaire d'ajout écrit hors de la plage fixe.
- Chat : module placé au cas par cas, sans interrupteur global.
- Header et footer partagés, affichables ou non page par page.
- Zones composées de rangées de 1 à 3 colonnes.
- Brouillon, aperçu et publication.
- Liens vers des pages non autorisées masqués.
- Médiathèque ; images du catalogue par nom de fichier ou par lien web.
- Tableaux : pagination, tri, recherche et colonnes configurables.
- Catalogue : mises en page de carte prédéfinies.
- Boutons : barre avec orientation et alignement.
- Carte : surbrillance, libellé et opacité réglable par zone.
- Menu de compte fixe (seule exception à la construction par l'admin).
- Destination « Ma page personnelle ».
- Tableaux et catalogues peuvent lancer un formulaire de ligne pré-rempli.
