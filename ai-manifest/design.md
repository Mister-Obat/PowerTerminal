# Design System - PowerTerminal

## 1. Look & Feel : "Crystal Dark"
Le design doit évoquer la puissance et la clarté.

### Palette de Couleurs
- **Background** : `#0a0a0c` (Noir profond légèrement bleuté).
- **Surface (Glass)** : `rgba(255, 255, 255, 0.05)` avec `backdrop-filter: blur(20px)`.
- **Primary** : `#6366f1` (Indigo vibrant pour les actions principales).
- **Accent** : `#10b981` (Emeraude pour les terminaux actifs).
- **Danger** : `#ef4444` (Rouge pour les erreurs/stop).

### Typography
- **UI/Texte** : `Inter` ou `System UI Sans-Serif`.
- **Terminal/Code** : `Fira Code` ou `JetBrains Mono` (ligatures recommandées).

## 2. Composants Principaux

### Project Card
- Effet de survol : `scale(1.02)` + augmentation de l'opacité du glassmorphism.
- Badge indicateur si des processus sont en cours dans ce projet.
- Grille `Espace projets` responsive: `1` colonne (étroit), `2` colonnes (normal), puis `3`/`4` colonnes quand l'espace horizontal est suffisant.
- Action de suppression: corbeille déplacée dans la modale d'édition projet, bouton visible en haut à droite.
- Modale d'ajout projet (vierge): titre `Ajouter un projet` centré.
- Survol du bloc logo dans la modale: overlay avec icône Lucide d'ajout d'image.

### Command Cards
- **Structure** : Émoji, Nom, Preview de la commande et barre d'actions.
- **Actions** : Boutons "Coup de poing" (🗑️, ✏️, 🚀) centrés et toujours visibles sous la preview.
- **Drag & Drop** : Feedback visuel (opacité, scale) lors du déplacement organique.
- **Responsive Grid** : grille adaptative basée sur la largeur réelle de la zone commandes (pas la fenêtre globale), en `1` colonne (étroit), puis `2`, `3`, et `4` colonnes quand l'espace horizontal augmente.
- **Taille cible** : largeur visuelle optimale autour de `230px` par case (autorisé au-dessus, jamais en dessous).

### Emoji Picker
- **UI** : Grille de 80 émojis tech/dev dans un conteneur flottant glassmorphism et défilable.
- **Intégration** : Fusionné harmonieusement dans les modales de création.

### Terminal Section
- **Tabs Bar** : Barre d'onglets compacte avec bouton "+" et "－".
- **Compaction** : Réduction adaptive de la largeur des onglets avec troncature du texte (`ellipsis`).
- **Sidebar Apps** : bouton `+` (ajouter commande) positionné en bas, séparé visuellement de la liste des apps et toujours visible.
- **Scroll Apps** : si la liste d'apps est longue, seule la liste défile au-dessus du bloc du bouton `+`.
- **Drag Apps** : indicateur d'insertion directionnel (horizontal/vertical selon l'orientation de la barre) avec décalage visuel des apps cibles.

### Port Monitor Page
- **Entrée** : bouton "Ports actifs" dans la barre de navigation globale en haut de l'application.
- **Liste** : tableau glassmorphism affichant `PORT`, `PROCESS`, `PID`, `PROGRAM`, `FRAMEWORK`, `ACTION`.
- **Entêtes fixes** : la ligne d'entête du tableau reste visible pendant le scroll vertical.
- **Chargement** : spinner visible dans la zone tableau pendant le fetch.
- **Redimensionnement** : chaque colonne est redimensionnable indépendamment par poignée de drag sur l'entête.
- **Resize stable** : drag des colonnes borné (min/max) et sans saut brutal de largeur.
- **Guides de resize** : séparateurs verticaux visibles en permanence sur les entêtes.
- **Action principale** : bouton `Kill` rouge à droite de chaque ligne, visible en permanence.
- **Feedback** : message d'état en haut de page (succès/erreur) après tentative kill.

### Navigation Globale
- **Position** : barre commune en haut, visible sur toutes les pages.
- **Contenu** : `Terminaux`, `Espace projets`, `Ports actifs`.
- **Action secondaire** : bouton `Faire un don` aligné tout à droite de cette barre.
- **Mode compact** : en largeur réduite, les boutons de navigation et `Faire un don` passent en version icône.

### Titlebar Fenêtre
- Logo app (`logo.ico`) affiché à gauche du nom dans la barre système custom.
- Contrôles fenêtre (`min`, `max`, `close`) rendus avec icônes Lucide pour une meilleure lisibilité.

## 3. Animations & Transitions
- **Page Change** : Slide-fade entre le sélecteur et le dashboard.
- **Terminal Open** : Expand de bas en haut.
- **Feedback** : Micro-vibrations visuelles sur erreur.
