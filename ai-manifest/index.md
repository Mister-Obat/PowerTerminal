# PowerTerminal Manifest

## Vision
PowerTerminal est une application desktop orientée exécution rapide de commandes par projet, avec une UX terminal riche et un monitoring visuel simple des processus en cours.

## Scope Actuel

### 1. Gestion de projets manuelle
- Les projets sont ajoutés via sélecteur de dossier natif.
- La liste est reconstruite depuis `projectMetadata` dans `config.json`.
- Pas de scanner automatique récursif dans l'état actuel.

### 2. Commandes personnalisées par projet
- Chaque projet possède des commandes custom (`emoji`, `label`, `command`).
- Les commandes sont éditables et réordonnables par drag & drop.
- Au lancement d'une commande, un terminal du projet est réutilisé ou créé automatiquement.

### 3. Multi-terminal avec indicateurs d'activité
- Plusieurs terminaux par projet (tabs compactes).
- Statut `running` basé sur la détection de processus enfants du PTY.
- Indicateur vert affiché uniquement quand un terminal est réellement en cours d'exécution.

### 4. Persistance légère locale
- `config.json` stocke `rootPath` et `projectMetadata`.
- Pas de restauration de session terminal (tabs/logs) au redémarrage pour l'instant.

## Invariants & Contraintes
- **Correctness first** : les indicateurs d'activité doivent refléter l'état runtime réel (`running`), pas l'ouverture simple d'un tab.
- **Fiabilité terminal** : création/destruction PTY propre, cleanup complet à la fermeture.
- **Réactivité UI** : rendu fluide avec sorties terminal continues.
- **Lisibilité** : architecture renderer/main explicite, sans abstraction inutile.

## Structure /ai-manifest/
- `index.md` : Vision et invariants globaux.
- `tech-stack.md` : Stack réelle et choix techniques.
- `features.md` : Fonctionnalités implémentées et limites actuelles.
- `design.md` : Guide visuel et composants UI.
- `user-flows.md` : Parcours utilisateur actuels.
- `debug/README.md` : Tickets de debug actifs et règles de suivi.

