# PowerTerminal

PowerTerminal est une app desktop Windows pour lancer rapidement des commandes par projet, avec un terminal intégré.

![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron) ![xterm.js](https://img.shields.io/badge/xterm.js-5-green) ![Windows](https://img.shields.io/badge/Windows-11-0078D4?logo=windows)

## Aperçu

| Projets | Dashboard |
|---------|-----------|
| ![Projets](assets/screenshots/selection.png) | ![Dashboard](assets/screenshots/dashboard.png) |

## Ce que fait l'app

- Ajout manuel de projets via sélecteur de dossier
- Commandes personnalisées par projet (`emoji`, `label`, `command`)
- Terminal intégré avec multi-onglets
- Indicateur d'activité (`running`) basé sur les vrais processus en cours
- Persistance locale dans `config.json`

## Stack

- Electron 31
- Vite 5 + `vite-plugin-electron`
- `xterm.js` + `xterm-addon-fit`
- `node-pty`

## Démarrage

```bash
npm install
npm run dev
```

Note Windows: `start-dev.bat` lance aussi le mode dev.

## Build

```bash
npm run build
```

Le build génère un exécutable portable Windows dans `release/`.

## Configuration locale

Le fichier `config.json` est créé automatiquement. Clés principales:

- `rootPath`
- `projectMetadata`

Exemple minimal:

```json
{
  "rootPath": "C:/Users/...",
  "projectMetadata": {
    "C:/mon/projet": {
      "displayName": "Mon Projet",
      "customRoot": "C:/mon/projet",
      "isFavorite": false,
      "logoPath": "C:/mon/projet/logo.png",
      "customCommands": [
        {
          "emoji": "🚀",
          "label": "Dev",
          "command": "npm run dev"
        }
      ]
    }
  }
}
```

`config.json` est local (ignoré par git).

## Structure

```text
PowerTerminal/
├── src/
│   ├── main/
│   │   ├── main.js
│   │   └── preload.js
│   └── renderer/
│       ├── js/app.js
│       └── style/main.css
├── index.html
├── config.json
├── package.json
└── vite.config.js
```

## License
Ce projet est distribué sous licence AGPL-3.0.

---
*Codé 100% par des IA, supervisé à l'arrache par Obat 😏*