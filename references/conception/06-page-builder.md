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
- image ou couleur en arrière plan de page : pour une page ou toutes les pages. (Avec le page builder)
- Textes : couleurs, polices d'écritures, styles,...
- Couleur, style des encadrés des discussion et de leurs messages

### Modules intégrables dans chaque zone
- Placement d'images simple
- Placement d'images amenant sur une page du site ou à l'extérieur
- Tableaux (Avec un appel de données de l'Excel ou du Sheet, ou un tableau simple à remplir)
  - La plage de cellules affichée par un tableau est fixe, définie une fois par l'administrateur : tous les utilisateurs voyant la page voient la même donnée (pas de filtrage par groupe ou par utilisateur à ce stade).
- Tableaux pouvant accueillir des images et du texte, pour construire un catalogue (une image accompagné de textes, parfois en plusieurs cases à côté ou autour)(Avec un appel de données de l'Excel ou du Sheet, ou un tableau simple à remplir).
- Chatbot (messagerie interne simple, sans intégration IA) — voir [Discussions](07-discussions.md)
- Sujets de discussion / messages (pouvant contenir des images) — voir [Discussions](07-discussions.md)
- Page (Avec un appel de données de l'Excel ou du Sheet, ou une page simple à remplir)
- Boutons (nombre à indiquer, noms à renseigner, placement à indiquer (haut, bas, gauche, droite), destination à désigner)
- Formulaire de modification ou d'ajout de l'excel ou du google sheet (modification : l'administrateur relie un champ à une case existante du document ; ajout : l'administrateur définit une ligne de départ, des colonnes autorisées et un nombre max de nouvelles lignes) — voir [Formulaires et soumissions](09-formulaires-soumissions.md)
- **Cartes cliquables** : image sur laquelle l'administrateur dessine des zones transparentes ou semi-transparentes ; un clic sur une zone mène vers une page interne ou une page externe. Composant le plus complexe de la liste (éditeur de zones dédié).
  - Zones en **polygones libres** (dessinées à la souris), pas de simples rectangles.
  - Zones **disjointes** : l'éditeur empêche/avertit en cas de chevauchement entre deux zones.
  - Une carte = **une seule image** avec ses zones ; pas de système de sous-images/calques imbriqués.

## Points techniques
- **PagesModule** : CRUD des pages, config JSON des zones/blocs, soft-delete.
- Rendu piloté par la config JSON des pages : un `BlockRenderer` avec un registre `{ blockType: Component }` couvrant chaque module ci-dessus (image, tableau, catalogue, chatbot, sujets, boutons, formulaire, carte cliquable).
- L'éditeur de **carte cliquable** (polygones libres, détection de chevauchement) est un composant isolé — le plus complexe du builder, sur canvas/SVG dédié.
- Layout responsive par zones (Header/Main/Sidebar/Footer) en CSS Grid/Flexbox, breakpoints mobile/tablette.

## Dépendances
- [03 — Droits et groupes](03-droits-groupes.md) : accès aux pages.
- [07 — Discussions](07-discussions.md) : modules chatbot et sujets.
- [08 — Sources de données](08-sources-donnees.md) : données des tableaux, catalogues et pages.
- [09 — Formulaires et soumissions](09-formulaires-soumissions.md) : module formulaire.
- [10 — Modèles et duplication](10-modeles-duplication.md) : modèles de pages.

## Questions ouvertes
_À compléter lors de la revue de cohérence._
