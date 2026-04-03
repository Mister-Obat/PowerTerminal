# Features Details - PowerTerminal

## 1. Gestion des Projets

### Ajout / Suppression
- Ajout via modale d'édition vierge: l'utilisateur ouvre `+`, choisit le dossier via `Browse`, renseigne le nom puis enregistre.
- Tant que la modale d'ajout est annulée, aucun projet n'est créé.
- Si le dossier choisi existe déjà, la modale affiche un message explicite avec le nom déjà enregistré du projet (pas d'échec silencieux).
- Suppression logique via flag `_removed` dans `projectMetadata`.
- Favoris et logos personnalisés gérés dans les métadonnées.
- Un clic sur un projet dans `Espace projets` ouvre directement la modale d'édition (plus d'ouverture terminal depuis cette vue).
- Le chemin racine terminal (`customRoot`) est modifiable dans la modale via saisie et bouton `Browse` sans perte des commandes du projet.
- La suppression d'un projet se déclenche depuis la modale d'édition via un bouton corbeille dédié (coin haut droit), avec confirmation avant application.

### Source de vérité
- Les projets affichés proviennent de `projectMetadata` uniquement.
- Pas de scan automatique de dossiers dans la version actuelle.
- Dans `Espace projets`, l'affichage reste trié alphabétiquement (favoris et non-favoris).

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
- Le sélecteur d'émojis priorise les émojis récemment utilisés (ordre persistant), puis affiche les autres.

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
- En mode vertical (barre apps horizontale), la molette souris sur la zone apps scroll horizontalement de manière fluide.
- À l'ouverture de `Terminaux`: si un seul favori existe, il est auto-sélectionné; si aucun favori n'existe, l'écran affiche un état vide guidant vers `Espace projets` + activation via étoile.

## 4. Persistance

### Stockage
- Fichier local `config.json` (racine projet app).
- Clés principales:
  - `rootPath`
  - `projectMetadata`
  - `projectOrder` (ordre personnalisé des apps/projets dans la barre `Terminaux`)
  - `emojiRecentOrder` (ordre des émojis récemment utilisés dans la modale commande)

### Règles d'ordre
- Le drag & drop de la barre apps (`Terminaux`) fonctionne en orientation verticale et horizontale avec indicateur d'insertion adapté.
- Le passage en favori positionne le projet en fin d'ordre dans la barre `Terminaux`.
- L'ordre manuel n'est pas utilisé dans `Espace projets` (tri alphabétique uniquement).

### Non implémenté actuellement
- Pas de session persistée des terminaux (tabs/logs/cwd runtime).
- Pas de dossier `sessions/`.

## 5. Port Monitor

### Capacités
- Depuis le menu de navigation global en haut, un bouton dédié ouvre la page "Ports actifs".
- La page liste les ports TCP en écoute avec colonnes enrichies: `port`, `process`, `pid`, `program`, `framework`.
- Pendant le chargement des ports, un indicateur visuel est affiché directement dans la zone de liste.
- Chaque colonne du tableau ports est redimensionnable indépendamment via drag sur l'entête.
- Chaque ligne expose une action `Kill` en un clic pour stopper le processus.
- Après kill, la liste est rafraîchie immédiatement pour refléter l'état réel.

### Contraintes
- Les données ports/process sont collectées côté `main` via IPC, jamais directement depuis le renderer.
- Le détail `tasklist /FI "PID eq <pid>"` est collecté côté `main` et exposé au renderer comme donnée d'affichage.
- Le renderer ne doit afficher que l'état runtime actuel (pas de cache persistant).
- En cas d'échec kill (droits insuffisants, PID invalide), l'UI doit afficher un message d'erreur clair.
