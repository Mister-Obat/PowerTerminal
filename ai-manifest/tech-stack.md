# Tech Stack Justification: PowerTerminal

## Runtime Desktop
- **Electron 31** pour coupler UI web et opérations système locales (PTY, IPC, dialogues natifs).
- Main process en ESM (`type: module`).

## Build / Dev
- **Vite 5** pour bundling renderer.
- **vite-plugin-electron** pour builder/lancer main + preload.
- **electron-builder** pour packaging Windows (portable).

## UI Renderer
- **Vanilla JS + CSS** sans framework UI.
- **xterm.js** + **xterm-addon-fit** (+ webgl) pour l'affichage terminal.

## Exécution Shell
- **node-pty** pour shell réel.
- Shell par défaut:
  - Windows: `powershell.exe`
  - Linux/macOS: `bash`

## Persistance
- Persistance actuelle via fichier JSON local (`config.json`) lu/écrit avec `fs/promises`.
- La dépendance `electron-store` est présente dans `package.json` mais non utilisée dans le code actuel.

## Sécurité / I/O locale
- `contextIsolation: true`, `nodeIntegration: false`.
- API bridgée via preload (`contextBridge`).
- Protocole custom `logo://` pour afficher des logos locaux.
