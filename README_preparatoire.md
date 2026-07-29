# Strategos
Objectifs : Faire un site facile à déployer(une ligne de commande), à utiliser, avec une sauvegarde locale des données, et modulable.

Types profils :
-Administrateur.
-Utilisateur.

Docker :
-Une image pour le front.
-Une image pour le back.
-Une image pour la BDD.

BDD :
-Les données du site sont sauvegardées dans un volume en local.
-Les informations des excels et google sheets ne seront pas mises dans la BDD.

Backend :
-Un site internet où l'administrateur peut créer des pages grâce à des modules préformatés (sidebar, header, tableaux, placement d'images, chatbot, sujets de discussions, boutons,...).
-L'administrateur peut donner des droits d'accès aux pages aux différents utilisateurs et groupes.
-L'administrateur peut créer des profils utilisateurs.

Frontend :
-Un style simple et facile à personnaliser pour l'administrateur (mettre des images en fonds, des vidéos, modifier des couleurs et polices d'écritures,...).
-L'utilisateur pourra construire son propre style si l'administrateur l'autorise, et donne accès au tableau de personnlisation pour ces sujets et messages.
-Cartes : l'administrateur devra pouvoir mettre des images qui seront des cartes, et dessiner des zones transparentes ou semi-transparentes. En cliquant dessus, cela ménera vers une page du site ou une page extérieure.

Excels et google sheets :
-Capacité à utiliser/exploiter des excels et des google sheets.
-Capacité à créer des formulaires pour modifier des cases de l'excel. Chaque formulaire sera créé par l'administrateur (champs de textes, menus de sélections,...). Une fois remplit par l'utilisateur, l'administrateur devra relire et valider pour que la modification se fasse.
-Capacité d'archive des excels et google sheets, pour faire des retours en arrière.

