# 06 — Page builder

## Objet
L'outil avec lequel l'administrateur compose les pages du site : des zones, des options de personnalisation et des modules préformatés placés dans ces zones. C'est l'unique moyen d'exposer en lecture les données des documents (voir [Vision](01-vision.md#principe-fondateur--aucun-accès-direct-aux-documents)).

## Règles fonctionnelles

### Zones
L'administrateur aura une page avec des cases à cocher pour valider la présence d'une zone. Puis il aura des cases à cocher pour valider les modules à mettre dedans.
Liste des zones constituant chaque page (il n'y a pas d'obligation à toutes les avoir) :
- Header
- Main
- Sidebar
- Footer

### Options de personnalisation des zones
La personnalisation passe par des **thèmes**. L'administrateur crée plusieurs thèmes nommés, chacun regroupant :
- image ou couleur en arrière plan de page
- Textes : couleurs, polices d'écritures, styles,...
- Couleur, style des encadrés des discussion et de leurs messages

L'admin désigne un **thème par défaut** et peut attribuer un **thème à chaque page** : une page sans thème attribué utilise le thème par défaut. Il n'y a ni thème par groupe ni choix de l'utilisateur.

### Modules intégrables dans chaque zone
- Placement d'images simple
- Placement d'images amenant sur une page du site ou à l'extérieur
- Tableaux (Avec un appel de données de l'Excel ou du Sheet, ou un tableau simple à remplir)
  - La plage de cellules affichée par un tableau est définie une fois par l'administrateur : tous les utilisateurs voyant la page voient la même donnée (pas de filtrage par groupe ou par utilisateur à ce stade). Elle est soit **fixe**, soit **extensible** (voir [Plage des tableaux](#plage-des-tableaux-et-formulaires-dajout)).
- Tableaux pouvant accueillir des images et du texte, pour construire un catalogue (une image accompagné de textes, parfois en plusieurs cases à côté ou autour)(Avec un appel de données de l'Excel ou du Sheet, ou un tableau simple à remplir).
- Chatbot (messagerie interne simple, sans intégration IA) — chat temps réel, placé par l'admin sur les pages de son choix, voir [Discussions](07-discussions.md)
- Sujets de discussion / messages (pouvant contenir des images) — voir [Discussions](07-discussions.md)
- **Vue de données** : affiche et met en forme des données tirées de l'Excel ou du Sheet.
- **Contenu libre** : contenu rédigé par l'administrateur (textes mis en forme, tableaux simples, images).
- Boutons (nombre à indiquer, noms à renseigner, placement à indiquer (haut, bas, gauche, droite), destination à désigner)
- Formulaire de modification ou d'ajout de l'excel ou du google sheet (modification : l'administrateur relie un champ à une case existante du document ; ajout : l'administrateur définit une ligne de départ, des colonnes autorisées et un nombre max de nouvelles lignes) — voir [Formulaires et soumissions](09-formulaires-soumissions.md)
- **Cartes cliquables** : image sur laquelle l'administrateur dessine des zones transparentes ou semi-transparentes ; un clic sur une zone mène vers une page interne ou une page externe. Composant le plus complexe de la liste (éditeur de zones dédié).
  - Zones en **polygones libres** (dessinées à la souris), pas de simples rectangles.
  - Zones **disjointes** : l'éditeur empêche/avertit en cas de chevauchement entre deux zones.
  - Une carte = **une seule image** avec ses zones ; pas de système de sous-images/calques imbriqués.

### Plage des tableaux et formulaires d'ajout
Un tableau ou un catalogue relié à une source affiche une plage qui peut être :
- **fixe** : une plage précise, par exemple `A1:D11` ;
- **extensible** : des colonnes à partir d'une ligne donnée, **jusqu'à la dernière ligne remplie**, par exemple « colonnes A à D à partir de la ligne 1 ». Le tableau suit alors tout seul les lignes ajoutées, que ce soit par un formulaire d'ajout ou par l'admin directement dans le document.

**Avertissement** : si une plage fixe ne couvre pas la zone d'un formulaire d'ajout qui écrit dans la même source, l'administrateur est averti à la création du formulaire et à la modification du tableau.

> **Exemple** : une feuille « Inscriptions tournoi » contient les en-têtes en ligne 1 et 10 inscrits en lignes 2 à 11. L'admin place un tableau `A1:D11` et un formulaire d'ajout (ligne de départ 12, 20 lignes au maximum, voir [Formulaires et soumissions](09-formulaires-soumissions.md)). Quand une inscription est validée, elle est écrite en ligne 12, mais le tableau fixe ne l'affiche pas et le joueur croit que son inscription a échoué. Strategos avertit donc l'admin, qui choisit soit une plage **extensible** (« colonnes A à D à partir de la ligne 1 »), soit une plage fixe élargie `A1:D31`.

## Points techniques
- **PagesModule** : CRUD des pages, config JSON des zones/blocs, soft-delete, thèmes.
- Thèmes : table `themes(id, name, config JSONB, is_default)` et `pages.theme_id` (nullable = thème par défaut).
- Le contenu des modules « Contenu libre » et des tableaux simples à remplir est stocké dans la config JSON de la page.
- Blocs tableau et catalogue liés à une source : `range_mode[fixed|extensible]`. En mode extensible, la dernière ligne remplie est calculée à la lecture, depuis le staging ou le cache (voir [Sources de données](08-sources-donnees.md)).
- Rendu piloté par la config JSON des pages : un `BlockRenderer` avec un registre `{ blockType: Component }` couvrant chaque module ci-dessus (image, tableau, catalogue, chatbot, sujets, vue de données, contenu libre, boutons, formulaire, carte cliquable).
- L'éditeur de **carte cliquable** (polygones libres, détection de chevauchement) est un composant isolé — le plus complexe du builder, sur canvas/SVG dédié.
- Layout responsive par zones (Header/Main/Sidebar/Footer) en CSS Grid/Flexbox, breakpoints mobile/tablette.

## Dépendances
- [03 — Droits et groupes](03-droits-groupes.md) : accès aux pages.
- [07 — Discussions](07-discussions.md) : modules chatbot et sujets.
- [08 — Sources de données](08-sources-donnees.md) : données des tableaux, catalogues et pages.
- [09 — Formulaires et soumissions](09-formulaires-soumissions.md) : module formulaire.
- [10 — Modèles et duplication](10-modeles-duplication.md) : modèles de pages.

## Questions ouvertes
_Aucune pour l'instant._

**Décisions (2026-09-25)**
- Le module « Page » est remplacé par « Vue de données » et « Contenu libre ».
- Plusieurs thèmes nommés, un thème par défaut et un thème par page.
- Plage des tableaux fixe ou extensible, avec un avertissement si un formulaire d'ajout écrit hors de la plage fixe.
- Chat : module placé au cas par cas, sans interrupteur global.
