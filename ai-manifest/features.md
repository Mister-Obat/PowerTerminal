# Features Details - PowerTerminal

## 1. Gestion des Projets

### Ajout / Suppression
- Ajout manuel via dialogue natif (`project:pick-folder`).
- Suppression logique via flag `_removed` dans `projectMetadata`.
- Favoris et logos personnalisés gérés dans les métadonnées.

### Source de vérité
- Les projets affichés proviennent de `projectMetadata` uniquement.
- Pas de scan automatique de dossiers dans la version actuelle.

## 2. Commandes Personnalisées

### Modèle de commande
```json
{
  "emoji": "🚀",
  "label": "Start Dev",
  "command": "npm run dev"
}
```

### Capacités
- Création, édition, suppression.
- Réorganisation drag & drop.
- Lancement dans le terminal actif du projet.
- Si terminal absent ou invalide: auto-création/ré-attachement avant exécution.

### Limites actuelles
- Pas de templating (`{{root}}`, `{{input:...}}`, etc.) implémenté.
- Pas d'import auto des scripts `package.json`.

## 3. Gestion Multi-Terminal

### Cycle de vie
- Création via `node-pty`.
- Entrée clavier forwardée vers PTY.
- Resize dynamique via `xterm-addon-fit` + `ResizeObserver`.
- Destruction explicite d'un terminal ou cleanup global à la fermeture app.

### Statut d'activité (`running`)
- `main` publie `terminal:status` périodiquement.
- Statut basé sur présence de processus enfants du PTY.
- `renderer` applique l'état sur tabs, sidebar et cartes projet.

### Règle UX
- Le point vert indique uniquement `running=true`.
- Un terminal ouvert mais idle ne doit pas afficher l'indicateur actif.

## 4. Persistance

### Stockage
- Fichier local `config.json` (racine projet app).
- Clés principales:
  - `rootPath`
  - `projectMetadata`

### Non implémenté actuellement
- Pas de session persistée des terminaux (tabs/logs/cwd runtime).
- Pas de dossier `sessions/`.
