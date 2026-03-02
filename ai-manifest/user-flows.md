# User Flows - PowerTerminal

## Flow 1 : Ajouter un Projet puis Lancer une Commande
1. L'utilisateur lance PowerTerminal.
2. Il clique sur `+` pour ajouter un dossier projet.
3. Le projet apparaît dans la liste (ou favoris).
4. Il ouvre le dashboard du projet.
5. Il crée une commande custom (emoji + label + commande).
6. Il clique sur `Lancer`.
7. Si aucun terminal valide n'est actif, l'app en crée un automatiquement puis exécute la commande.

## Flow 2 : Multi-Terminal et Monitoring Running
1. L'utilisateur est sur son Dashboard.
2. Il clique sur `+` dans la zone Terminal pour ouvrir un second onglet.
3. Les onglets s'adaptent automatiquement en largeur pour rester compacts.
4. Une commande longue est lancée dans un onglet.
5. Les indicateurs verts apparaissent uniquement pour les terminaux réellement `running`.
6. Il peut fermer un onglet via le bouton `－`; l'état visuel se met à jour.

## Flow 3 : Configuration d'une Commande avec Émoji
1. L'utilisateur clique sur "Ajouter une commande".
2. Il clique sur le champ Émoji.
3. Un sélecteur de 80 émojis apparaît élégamment.
4. L'utilisateur sélectionne 🐳, tape "Docker Up" et la commande associée.
5. La commande est immédiatement sauvegardée et prête à être lancée ou réorganisée.
