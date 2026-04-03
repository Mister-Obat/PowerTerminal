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

## 5. Port Monitor

### Capacités
- Depuis le dashboard, un bouton dédié ouvre une page "Ports actifs".
- La page liste les ports TCP en écoute avec colonnes enrichies: `port`, `process`, `pid`, `program`, `framework`, `status`.
- Pendant le chargement des ports, un indicateur visuel est affiché directement dans la zone de liste.
- Chaque colonne du tableau ports est redimensionnable indépendamment via drag sur l'entête.
- Chaque ligne expose une action `Kill` en un clic pour stopper le processus.
- Après kill, la liste est rafraîchie immédiatement pour refléter l'état réel.

### Contraintes
- Les données ports/process sont collectées côté `main` via IPC, jamais directement depuis le renderer.
- Le détail `tasklist /FI "PID eq <pid>"` est collecté côté `main` et exposé au renderer comme donnée d'affichage.
- Le renderer ne doit afficher que l'état runtime actuel (pas de cache persistant).
- En cas d'échec kill (droits insuffisants, PID invalide), l'UI doit afficher un message d'erreur clair.
