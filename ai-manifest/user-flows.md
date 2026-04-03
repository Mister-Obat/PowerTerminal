# User Flows - PowerTerminal

## Flow 1 : Ajouter un Projet puis Lancer une Commande
1. L'utilisateur lance PowerTerminal.
2. Il clique sur `+` pour ouvrir la modale d'ajout de projet (vierge).
3. Il choisit le dossier via `Browse`, ajuste le nom/logo puis enregistre.
4. Si l'utilisateur clique `Annuler`, aucun projet n'est créé.
5. Le projet apparaît dans la liste (ou favoris) uniquement après `Enregistrer`.
6. Dans `Espace projets`, il clique sur un projet pour ouvrir la modale d'édition.
7. Depuis cette modale, il peut ajuster le nom, le logo et le `Dossier racine` (champ + bouton `Browse`).
8. Depuis cette même modale, il peut retirer le projet via le bouton corbeille en haut à droite, puis confirmer l'action.
9. Il passe ensuite par `Terminaux` pour ouvrir/activer le projet.
10. Il crée une commande custom (emoji + label + commande) puis clique sur `Lancer`.
11. Si aucun terminal valide n'est actif, l'app en crée un automatiquement puis exécute la commande.

## Flow 2 : Multi-Terminal et Monitoring Running
1. L'utilisateur est sur son Dashboard.
2. Il clique sur `+` dans la zone Terminal pour ouvrir un second onglet.
3. Les onglets s'adaptent automatiquement en largeur pour rester compacts.
4. Une commande longue est lancée dans un onglet.
5. Les indicateurs verts apparaissent uniquement pour les terminaux réellement `running`.
6. Il peut fermer un onglet via le bouton `－`; l'état visuel se met à jour.

## Flow 6 : Entrée dans Terminaux selon favoris
1. L'utilisateur ouvre `Terminaux`.
2. Si un seul projet favori existe, ce projet est ouvert automatiquement (commandes + shell).
3. Si aucun favori n'existe, l'écran `Terminaux` reste vide de commandes/shell projet et affiche un message d'aide:
4. Le message invite à ajouter des projets dans `Espace projets` puis activer l'étoile.

## Flow 5 : Organiser les Apps dans Terminaux
1. L'utilisateur ouvre la vue `Terminaux`.
2. Il glisse-dépose une app dans la barre des apps.
3. Un indicateur d'insertion apparaît selon l'orientation de la barre (verticale ou horizontale).
4. L'app est réordonnée et l'ordre est sauvegardé dans `config.json` (`projectOrder`).
5. En mode vertical, le scroll molette sur la barre apps défile horizontalement la liste.

## Flow 3 : Configuration d'une Commande avec Émoji
1. L'utilisateur clique sur "Ajouter une commande".
2. Il clique sur le champ Émoji.
3. Un sélecteur de 80 émojis apparaît élégamment.
4. L'utilisateur sélectionne 🐳, tape "Docker Up" et la commande associée.
5. La commande est immédiatement sauvegardée et prête à être lancée ou réorganisée.

## Flow 4 : Monitoring des Ports Actifs
1. L'utilisateur est sur l'app (n'importe quelle page principale).
2. Il clique sur `Ports actifs` dans la barre de navigation du haut.
3. L'app ouvre une page dédiée listant les ports actifs.
4. L'utilisateur clique `Kill` sur une ligne pour arrêter le processus lié.
5. La liste est rafraîchie automatiquement et l'état affiché reste aligné au runtime.
