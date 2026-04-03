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

### Command Cards
- **Structure** : Émoji, Nom, Preview de la commande et barre d'actions.
- **Actions** : Boutons "Coup de poing" (🗑️, ✏️, 🚀) centrés et toujours visibles sous la preview.
- **Drag & Drop** : Feedback visuel (opacité, scale) lors du déplacement organique.

### Emoji Picker
- **UI** : Grille de 80 émojis tech/dev dans un conteneur flottant glassmorphism et défilable.
- **Intégration** : Fusionné harmonieusement dans les modales de création.

### Terminal Section
- **Tabs Bar** : Barre d'onglets compacte avec bouton "+" et "－".
- **Compaction** : Réduction adaptive de la largeur des onglets avec troncature du texte (`ellipsis`).

### Port Monitor Page
- **Entrée** : bouton icône "ports/processus" dans la sidebar dashboard, positionné au-dessus du bouton `+`.
- **Liste** : tableau glassmorphism affichant `PORT`, `PROCESS`, `PID`, `PROGRAM`, `FRAMEWORK`, `STATUS`, `ACTION`.
- **Chargement** : spinner visible dans la zone tableau pendant le fetch.
- **Redimensionnement** : chaque colonne est redimensionnable indépendamment par poignée de drag sur l'entête.
- **Guides de resize** : séparateurs verticaux visibles en permanence sur les entêtes.
- **Action principale** : bouton `Kill` rouge à droite de chaque ligne, visible en permanence.
- **Feedback** : message d'état en haut de page (succès/erreur) après tentative kill.

## 3. Animations & Transitions
- **Page Change** : Slide-fade entre le sélecteur et le dashboard.
- **Terminal Open** : Expand de bas en haut.
- **Feedback** : Micro-vibrations visuelles sur erreur.
