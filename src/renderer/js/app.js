import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const state = {
    currentView: 'selection',
    projects: [],
    metadata: {}, // Map of path -> { displayName, customRoot, isFavorite, logoPath, customCommands: [{emoji, label, command, desc}] }
    activeProjectId: null,
    activeProjectRoot: null,
    terminals: [], 
    activeTerminalId: null,
    rootPath: null,
    editingProject: null,
    editingCommandIndex: null,
    deleteCallback: null,
    recentlyOpened: [], // Array of project paths opened in current session (non-favorites only)
    ports: [],
    portsFeedback: null,
    portsLoading: false
};

const dom = {
    navWorkspaceBtn: document.getElementById('nav-workspace-btn'),
    navProjectsBtn: document.getElementById('nav-projects-btn'),
    navPortsBtn: document.getElementById('nav-ports-btn'),
    selectionView: document.getElementById('selection-view'),
    dashboardView: document.getElementById('dashboard-view'),
    portsView: document.getElementById('ports-view'),
    projectList: document.getElementById('project-list'),
    favoritesList: document.getElementById('favorites-list'),
    commandGrid: document.getElementById('command-grid'),
    terminalWrapper: document.getElementById('terminal-wrapper'),
    tabsContainer: document.getElementById('tabs-container'),
    addTerminalBtn: document.getElementById('add-terminal'),
    removeTerminalBtn: document.getElementById('remove-terminal'),
    addCustomCmdBtn: document.getElementById('add-custom-command'),
    portsRefreshBtn: document.getElementById('ports-refresh-btn'),
    portsListBody: document.getElementById('ports-list-body'),
    portsFeedback: document.getElementById('ports-feedback'),
    portsTableHeadWrap: document.getElementById('ports-table-head-wrap'),
    portsTableScroll: document.getElementById('ports-table-scroll'),

    addProjectBtn: document.getElementById('add-project-btn'),

    // Logo
    sidebarFavorites: document.getElementById('sidebar-favorites'),

    // Modals
    editModal: document.getElementById('edit-modal'),
    modalName: document.getElementById('edit-display-name'),
    modalRoot: document.getElementById('edit-root-path'),
    modalSave: document.getElementById('modal-save'),
    modalCancel: document.getElementById('modal-cancel'),
    modalLogoPicker: document.getElementById('modal-logo-picker'),
    modalLogoImg: document.getElementById('modal-logo-img'),
    modalLogoPlaceholder: document.getElementById('modal-logo-placeholder'),

    cmdModal: document.getElementById('command-modal'),
    cmdModalTitle: document.getElementById('cmd-modal-title'),
    cmdEmoji: document.getElementById('cmd-emoji'),
    cmdName: document.getElementById('cmd-name'),
    cmdRaw: document.getElementById('cmd-raw'),
    emojiPicker: document.getElementById('emoji-picker'),
    cmdSave: document.getElementById('cmd-save'),
    cmdCancel: document.getElementById('cmd-cancel'),

    deleteModal: document.getElementById('delete-confirm-modal'),
    deleteConfirmBtn: document.getElementById('delete-confirm'),
    deleteCancelBtn: document.getElementById('delete-cancel'),
};
let portsTableResizeObserver = null;

function focusActiveTerminal() {
    const active = state.terminals.find(t => t.id === state.activeTerminalId);
    if (active) active.xterm.focus();
}

function isProjectRunning(projectId) {
    return state.terminals.some(t => t.projectId === projectId && t.isRunning);
}

function getFirstFavoriteProject() {
    return state.projects.find(p => p.isFavorite) || null;
}

function updateTopNav() {
    const workspaceEnabled = !!state.activeProjectId || !!getFirstFavoriteProject();
    dom.navWorkspaceBtn.disabled = !workspaceEnabled;
    dom.navWorkspaceBtn.classList.toggle('active', state.currentView === 'dashboard');
    dom.navProjectsBtn.classList.toggle('active', state.currentView === 'selection');
    dom.navPortsBtn.classList.toggle('active', state.currentView === 'ports');
}

/**
 * Sidebar Toggle
 */
/**
 * Switch views
 */
function renderView(viewName) {
    state.currentView = viewName;
    const showSelection = viewName === 'selection';
    const showDashboard = viewName === 'dashboard';
    const showPorts = viewName === 'ports';

    dom.selectionView.classList.toggle('hidden', !showSelection);
    dom.dashboardView.classList.toggle('hidden', !showDashboard);
    dom.portsView.classList.toggle('hidden', !showPorts);
    updateTopNav();

    if (showSelection) {
        loadProjects();
    }
}

function setPortsFeedback(message, type = 'success') {
    if (!message) {
        dom.portsFeedback.classList.add('hidden');
        dom.portsFeedback.textContent = '';
        dom.portsFeedback.classList.remove('success', 'error');
        return;
    }
    dom.portsFeedback.textContent = message;
    dom.portsFeedback.classList.remove('hidden', 'success', 'error');
    dom.portsFeedback.classList.add(type);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function updatePortsHeaderScrollbarGutter() {
    if (!dom.portsTableHeadWrap || !dom.portsTableScroll) return;
    const gutter = Math.max(0, dom.portsTableScroll.offsetWidth - dom.portsTableScroll.clientWidth);
    dom.portsTableHeadWrap.style.paddingRight = `${gutter}px`;
}

function syncPortsTableLayout() {
    const headTable = document.querySelector('.ports-table-head');
    const bodyTable = document.querySelector('.ports-table-body');
    if (!headTable || !bodyTable) return;

    const headCols = Array.from(headTable.querySelectorAll('colgroup col'));
    const bodyCols = Array.from(bodyTable.querySelectorAll('colgroup col'));
    if (!headCols.length || headCols.length !== bodyCols.length) return;

    const defaultWidthByIndex = [82, 130, 64, 240, 110, 74];
    let total = 0;
    headCols.forEach((headCol, idx) => {
        if (!headCol.style.width) {
            headCol.style.width = `${defaultWidthByIndex[idx]}px`;
        }
        bodyCols[idx].style.width = headCol.style.width;
        total += parseFloat(headCol.style.width || `${defaultWidthByIndex[idx]}`) || defaultWidthByIndex[idx];
    });

    const available = Math.max(
        0,
        dom.portsTableScroll?.clientWidth || 0,
        dom.portsTableHeadWrap?.clientWidth || 0
    );
    const minTableWidth = 980;
    const finalWidth = Math.max(Math.round(total), available, minTableWidth);
    const px = `${finalWidth}px`;
    headTable.style.width = px;
    bodyTable.style.width = px;

    updatePortsHeaderScrollbarGutter();
}

function initPortsTableResizers() {
    const headTable = document.querySelector('.ports-table-head');
    const bodyTable = document.querySelector('.ports-table-body');
    if (!headTable || !bodyTable) return;

    const headers = Array.from(headTable.querySelectorAll('thead th'));
    const headCols = Array.from(headTable.querySelectorAll('colgroup col'));
    const bodyCols = Array.from(bodyTable.querySelectorAll('colgroup col'));
    if (!headers.length || headers.length !== headCols.length || headCols.length !== bodyCols.length) return;
    if (headTable.dataset.resizersInitialized === '1') return;

    const minWidthByIndex = [82, 90, 56, 140, 90, 74];
    const maxWidthByIndex = [220, 420, 180, 1800, 280, 74];
    syncPortsTableLayout();

    headers.forEach((th, index) => {
        if (index === headers.length - 1) return; // Action column stays fixed-size.
        const handle = document.createElement('div');
        handle.className = 'col-resize-handle';
        th.appendChild(handle);

        handle.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const headCol = headCols[index];
            const bodyCol = bodyCols[index];
            const startX = event.clientX;
            const startWidth = Math.round(
                parseFloat(headCol.style.width || '0')
                || headCol.getBoundingClientRect().width
                || th.getBoundingClientRect().width
                || minWidthByIndex[index]
            );
            const minWidth = minWidthByIndex[index] || 90;
            const maxWidth = maxWidthByIndex[index] || 1200;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const onMouseMove = (moveEvent) => {
                const delta = moveEvent.clientX - startX;
                const nextWidth = Math.min(maxWidth, Math.max(minWidth, Math.round(startWidth + delta)));
                headCol.style.width = `${nextWidth}px`;
                bodyCol.style.width = `${nextWidth}px`;
                syncPortsTableLayout();
            };

            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    });

    if (dom.portsTableScroll && dom.portsTableHeadWrap) {
        dom.portsTableScroll.addEventListener('scroll', () => {
            headTable.style.transform = `translateX(${-dom.portsTableScroll.scrollLeft}px)`;
        });
    }
    if (!portsTableResizeObserver && dom.portsTableScroll) {
        portsTableResizeObserver = new ResizeObserver(() => {
            syncPortsTableLayout();
        });
        portsTableResizeObserver.observe(dom.portsTableScroll);
    }
    window.addEventListener('resize', syncPortsTableLayout);

    headTable.dataset.resizersInitialized = '1';
}

function renderPortsRows() {
    dom.portsListBody.innerHTML = '';
    if (state.portsLoading) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="6" class="ports-loading">
                <div class="ports-loading-wrap">
                    <span class="ports-spinner"></span>
                    <span>Chargement des ports actifs...</span>
                </div>
            </td>
        `;
        dom.portsListBody.appendChild(row);
        syncPortsTableLayout();
        return;
    }

    if (!state.ports.length) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" class="ports-empty">Aucun port actif détecté.</td>`;
        dom.portsListBody.appendChild(row);
        syncPortsTableLayout();
        return;
    }

    state.ports.forEach((entry) => {
        const row = document.createElement('tr');
        const safeName = escapeHtml(entry.processName || 'Inconnu');
        const safeProgram = escapeHtml(entry.program || '—');
        const safeFramework = escapeHtml(entry.framework || '—');
        row.innerHTML = `
            <td><span class="port-tag">:${entry.port}</span></td>
            <td class="process-cell" title="${safeName}">${safeName}</td>
            <td>${entry.pid}</td>
            <td class="program-cell" title="${safeProgram}">${safeProgram}</td>
            <td>${safeFramework}</td>
            <td><button class="btn-kill-port" data-pid="${entry.pid}" data-port="${entry.port}">Kill</button></td>
        `;
        dom.portsListBody.appendChild(row);
    });
    syncPortsTableLayout();
}

async function refreshPortsList() {
    state.portsLoading = true;
    renderPortsRows();
    try {
        state.ports = await window.api.listActivePorts();
    } catch (error) {
        setPortsFeedback(`Impossible de charger les ports: ${error.message}`, 'error');
    } finally {
        state.portsLoading = false;
        renderPortsRows();
    }
}

async function openPortsView() {
    renderView('ports');
    requestAnimationFrame(() => {
        syncPortsTableLayout();
        requestAnimationFrame(() => syncPortsTableLayout());
    });
    setPortsFeedback(null);
    await refreshPortsList();
}

async function killPortProcess(pid, port) {
    const result = await window.api.killProcessByPid(pid);
    if (!result?.ok) {
        const error = result?.error || 'Erreur inconnue';
        setPortsFeedback(`Kill impossible sur :${port} (PID ${pid}) - ${error}`, 'error');
        return;
    }
    setPortsFeedback(`Processus PID ${pid} (port :${port}) stoppé.`, 'success');
    await refreshPortsList();
}

/**
 * Logo Picking
 */
async function pickLogoForModal() {
    const p = state.editingProject;
    if (!p) return;
    const path = await window.api.pickLogo(p.customRoot || p.path);
    if (path) {
        if (!state.metadata[p.path]) state.metadata[p.path] = {};
        state.metadata[p.path].logoPath = path;
        updateModalLogo(path, p.displayName || p.name);
    }
}

function updateModalLogo(logoPath, name) {
    if (logoPath) {
        dom.modalLogoImg.src = `logo://img?path=${encodeURIComponent(logoPath)}`;
        dom.modalLogoImg.classList.remove('hidden');
        dom.modalLogoPlaceholder.textContent = '';
    } else {
        dom.modalLogoImg.classList.add('hidden');
        dom.modalLogoPlaceholder.textContent = (name || '?')[0].toUpperCase();
    }
}

/**
 * Metadata
 */
async function loadMetadata() {
    state.metadata = await window.api.getMetadata();
}

async function saveMetadata() {
    await window.api.saveMetadata(state.metadata);
}

/**
 * Projects — chargés depuis config.json (projectMetadata)
 */
async function loadProjects() {
    await loadMetadata();

    state.projects = Object.entries(state.metadata)
        .filter(([projectPath, meta]) => !meta._removed)
        .map(([projectPath, meta]) => {
            const normalizedPath = projectPath.replace(/\\/g, '/');
            const name = meta.displayName || normalizedPath.split('/').pop();
            return {
                id: normalizedPath,
                name,
                path: normalizedPath,
                displayName: meta.displayName || name,
                customRoot: (meta.customRoot || normalizedPath).replace(/\\/g, '/'),
                isFavorite: !!meta.isFavorite,
                logoPath: meta.logoPath ? meta.logoPath.replace(/\\/g, '/') : null,
                customCommands: meta.customCommands || []
            };
        });

    renderProjectLists();
    renderSidebarFavorites();
    updateTopNav();
}

/**
 * Ajouter un projet via dialog dossier
 */
async function addProject() {
    const project = await window.api.pickFolder();
    if (!project) return;
    const p = project.path.replace(/\\/g, '/');
    if (state.metadata[p] && !state.metadata[p]._removed) return; // déjà présent et actif
    const existing = state.metadata[p] || {};
    state.metadata[p] = {
        ...existing,
        displayName: existing.displayName || project.name,
        customRoot: existing.customRoot || p,
        isFavorite: existing.isFavorite || false,
        customCommands: existing.customCommands || [],
        _removed: false
    };
    await saveMetadata();
    await loadProjects();
}

function renderProjectLists() {
    dom.projectList.innerHTML = '';
    dom.favoritesList.innerHTML = '';

    const favs = state.projects.filter(p => p.isFavorite);
    const regular = state.projects.filter(p => !p.isFavorite);

    favs.forEach(p => dom.favoritesList.appendChild(createProjectItem(p)));
    regular.forEach(p => dom.projectList.appendChild(createProjectItem(p)));
}

function createProjectItem(p) {
    const item = document.createElement('div');
    item.className = 'project-item' + (isProjectRunning(p.path) ? ' running' : '');

    const initial = (p.displayName || p.name || '?')[0].toUpperCase();
    const avatarContent = p.logoPath
        ? `<img src="logo://img?path=${encodeURIComponent(p.logoPath)}" alt="${initial}">`
        : `<span>${initial}</span>`;

    item.innerHTML = `
        <div class="project-avatar">${avatarContent}</div>
        <div class="info">
            <div class="name">${p.displayName}</div>
            <div class="path">${p.path}</div>
        </div>
        <div class="actions">
            <button class="action-btn trash" title="Retirer le projet"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
            <button class="action-btn edit" title="Modifier">✎</button>
            <button class="action-btn star ${p.isFavorite ? 'active' : ''}" title="Favori">★</button>
        </div>
    `;

    item.onclick = (e) => {
        if (!e.target.closest('.actions')) selectProject(p);
    };

    item.querySelector('.star').onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(p);
    };

    item.querySelector('.edit').onclick = (e) => {
        e.stopPropagation();
        openEditModal(p);
    };

    item.querySelector('.trash').onclick = (e) => {
        e.stopPropagation();
        removeProject(p);
    };

    return item;
}

async function removeProject(p) {
    showConfirmModal(
        `Retirer le projet ?`,
        `Retirer "${p.displayName}" de la liste ? (Les commandes enregistrées seront conservées dans le fichier config.)`,
        async () => {
            if (state.metadata[p.path]) {
                state.metadata[p.path]._removed = true;
            }
            await saveMetadata();
            await loadProjects();
        }
    );
}

/**
 * Custom Commands Logic
 */
function openAddCommandModal() {
    state.editingCommandIndex = null;
    dom.cmdModalTitle.textContent = 'Nouvelle commande';
    dom.cmdSave.textContent = 'Ajouter';
    dom.cmdEmoji.value = '⚡';
    dom.cmdName.value = '';
    dom.cmdRaw.value = '';
    dom.cmdModal.classList.remove('hidden');
}

function openEditCommandModal(index, cmd) {
    state.editingCommandIndex = index;
    dom.cmdModalTitle.textContent = 'Modifier la commande';
    dom.cmdSave.textContent = 'Enregistrer';
    dom.cmdEmoji.value = cmd.emoji;
    dom.cmdName.value = cmd.label;
    dom.cmdRaw.value = cmd.command;
    dom.cmdModal.classList.remove('hidden');
}

function saveCustomCommand() {
    const meta = state.metadata[state.activeProjectId] || {};
    if (!meta.customCommands) meta.customCommands = [];
    
    const cmdData = {
        emoji: dom.cmdEmoji.value || '⚡',
        label: dom.cmdName.value || 'Sans nom',
        command: dom.cmdRaw.value || 'echo hello'
    };

    if (state.editingCommandIndex !== null) {
        meta.customCommands[state.editingCommandIndex] = cmdData;
    } else {
        meta.customCommands.push(cmdData);
    }

    state.metadata[state.activeProjectId] = meta;
    saveMetadata();
    dom.cmdModal.classList.add('hidden');
    focusActiveTerminal();
    renderCommands(state.activeProjectRoot);
}

function showConfirmModal(title, message, callback) {
    document.getElementById('delete-confirm-title').textContent = title;
    document.getElementById('delete-confirm-message').textContent = message;
    state.deleteCallback = callback;
    dom.deleteModal.classList.remove('hidden');
}

function confirmDeleteCommand(index) {
    state.editingCommandIndex = index;
    showConfirmModal(
        'Supprimer la commande ?',
        'Cette action est irréversible. Voulez-vous vraiment supprimer cette commande ?',
        () => {
            const meta = state.metadata[state.activeProjectId];
            if (meta && meta.customCommands) {
                meta.customCommands.splice(state.editingCommandIndex, 1);
                saveMetadata();
                renderCommands(state.activeProjectRoot);
            }
            state.editingCommandIndex = null;
        }
    );
}

function deleteCommand() {
    dom.deleteModal.classList.add('hidden');
    focusActiveTerminal();
    if (state.deleteCallback) {
        state.deleteCallback();
        state.deleteCallback = null;
    }
}

async function launchCommand(command) {
    let active = state.terminals.find(
        t => t.id === state.activeTerminalId && t.projectId === state.activeProjectId
    );

    const projectTerminals = state.terminals.filter(t => t.projectId === state.activeProjectId);
    if (!active && projectTerminals.length > 0) {
        const fallback = projectTerminals[projectTerminals.length - 1];
        switchTerminal(fallback.id);
        active = fallback;
    }

    if (active) {
        const exists = await window.api.terminalExists(active.ptyId);
        if (!exists) {
            const staleIndex = state.terminals.findIndex(t => t.id === active.id);
            if (staleIndex !== -1) {
                const stale = state.terminals[staleIndex];
                stale.xterm.dispose();
                stale.container.remove();
                state.terminals.splice(staleIndex, 1);
                if (state.activeTerminalId === stale.id) {
                    state.activeTerminalId = null;
                }
                renderTabs();
                renderSidebarFavorites();
            }
            active = null;
        }
    }

    if (!active && state.activeProjectRoot) {
        await addTerminal(state.activeProjectRoot);
        active = state.terminals.find(t => t.id === state.activeTerminalId);
    }

    if (active) {
        window.api.sendInput(active.ptyId, `${command}\r`);
    }
}

/**
 * Terminals
 */
async function addTerminal(cwd) {
    const id = `term-${Date.now()}`;
    const container = document.createElement('div');
    container.className = 'terminal-instance';
    dom.terminalWrapper.appendChild(container);

    const term = new Terminal({
        fontFamily: '"Fira Code", monospace',
        fontSize: 14,
        theme: { background: '#000000', foreground: '#e2e8f0', cursor: '#6366f1' },
        allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    
    const ptyId = await window.api.createTerminal(cwd);
    state.terminals.push({ id, ptyId, xterm: term, fitAddon, container, projectId: state.activeProjectId, isRunning: false });
    renderSidebarFavorites();

    term.onData(data => window.api.sendInput(ptyId, data));

    // Ctrl+C : copie si sélection (avant qu'xterm l'efface) ET envoie SIGINT
    // Interception via capture sur le conteneur pour lire la sélection avant xterm
    container.addEventListener('keydown', (e) => {
        const isC = (e.key || '').toLowerCase() === 'c';
        if (!isC || !e.ctrlKey || e.altKey) return;

        const selection = term.getSelection();
        if (e.shiftKey) {
            if (selection) {
                window.api.copyToClipboard(selection);
                term.clearSelection();
            }
            // Ctrl+Shift+C doit copier seulement (pas de SIGINT)
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (selection) {
            window.api.copyToClipboard(selection);
            term.clearSelection();
        }
        // On ne preventDefault pas : xterm envoie \u0003 dans tous les cas
    }, { capture: true });
    switchTerminal(id);
    renderTabs();

    // ResizeObserver : refit dès que le wrapper change de taille
    const ro = new ResizeObserver(() => {
        if (container.classList.contains('active')) {
            fitAddon.fit();
            window.api.resizeTerminal(ptyId, term.cols, term.rows);
        }
    });
    ro.observe(dom.terminalWrapper);

    // Fallback initial
    setTimeout(() => { fitAddon.fit(); window.api.resizeTerminal(ptyId, term.cols, term.rows); }, 50);
}

function switchTerminal(id) {
    state.activeTerminalId = id;
    state.terminals.forEach(t => {
        t.container.classList.toggle('active', t.id === id);
        if (t.id === id) {
            t.fitAddon.fit();
            t.xterm.focus();
        }
    });
    renderTabs();
}

function renderTabs() {
    dom.tabsContainer.innerHTML = '';
    const projectTerminals = state.terminals.filter(t => t.projectId === state.activeProjectId);
    projectTerminals.forEach((t, i) => {
        const tab = document.createElement('div');
        const isActive = t.id === state.activeTerminalId;
        tab.className = `tab ${isActive ? 'active' : ''} ${t.isRunning ? 'running' : ''}`.trim();
        tab.textContent = `Shell ${i + 1}`;
        tab.onclick = () => switchTerminal(t.id);
        dom.tabsContainer.appendChild(tab);
    });
}

function cleanupTerminals() {
    state.terminals.forEach(t => {
        window.api.destroyTerminal(t.ptyId);
        t.xterm.dispose();
        t.container.remove();
    });
    state.terminals = [];
    renderProjectLists();
    renderSidebarFavorites();
}

function removeActiveTerminal() {
    const index = state.terminals.findIndex(t => t.id === state.activeTerminalId);
    if (index === -1) return;

    const term = state.terminals[index];
    const projectTerminalIds = state.terminals
        .filter(t => t.projectId === term.projectId)
        .map(t => t.id);
    const removedProjectIndex = projectTerminalIds.indexOf(term.id);
    
    // Cleanup
    window.api.destroyTerminal(term.ptyId);
    term.xterm.dispose();
    term.container.remove();
    
    // Remove from state
    state.terminals.splice(index, 1);
    renderProjectLists();
    renderSidebarFavorites();
    
    // Keep focus in the same project: previous tab first, otherwise next.
    const projectTerminals = state.terminals.filter(t => t.projectId === term.projectId);
    if (projectTerminals.length) {
        const fallbackIndex = removedProjectIndex > 0 ? removedProjectIndex - 1 : 0;
        const fallback = projectTerminals[Math.min(fallbackIndex, projectTerminals.length - 1)];
        switchTerminal(fallback.id);
    } else {
        state.activeTerminalId = null;
        renderTabs();
    }
}

/**
 * Commands (Rich UI)
 */
async function renderCommands(projectPath) {
    dom.commandGrid.innerHTML = '';
    
    const emotes = {
        'start': '🚀', 'dev': '🚧', 'test': '🧪', 'build': '📦', 
        'lint': '🧹', 'clean': '🧼', 'serve': '🌐', 'watch': '👀'
    };

    const meta = state.metadata[state.activeProjectId] || {};
    const all = meta.customCommands || [];
    
    all.forEach((cmd, idx) => {
        const card = document.createElement('div');
        card.className = 'cmd-card-fancy';
        card.draggable = true;
        card.dataset.index = idx;
        
        const labelSafe = cmd.label.toLowerCase();
        const emoji = cmd.emoji || (Object.keys(emotes).find(k => labelSafe.includes(k)) ? emotes[Object.keys(emotes).find(k => labelSafe.includes(k))] : '⚡');
        
        card.innerHTML = `
            <div class="cmd-top">
                <span class="cmd-emoji">${emoji}</span>
                <div class="cmd-meta">
                    <div class="cmd-name">${cmd.label}</div>
                </div>
            </div>
            <div class="cmd-preview">${cmd.command}</div>
            <div class="cmd-actions">
                <button class="cmd-btn-action delete" title="Supprimer">🗑️</button>
                <button class="cmd-btn-action edit" title="Modifier">✏️</button>
                <button class="cmd-btn-action launch" title="Lancer">🚀</button>
            </div>
        `;

        card.querySelector('.delete').onclick = (e) => {
            e.stopPropagation();
            confirmDeleteCommand(idx);
        };

        card.querySelector('.edit').onclick = (e) => {
            e.stopPropagation();
            openEditCommandModal(idx, cmd);
        };

        card.querySelector('.launch').onclick = (e) => {
            e.stopPropagation();
            launchCommand(cmd.command);
        };

        // Drag & Drop (Organic)
        card.ondragstart = (e) => {
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        };

        card.ondragend = () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.cmd-card-fancy').forEach(c => c.classList.remove('drag-over'));
        };

        card.ondragover = (e) => {
            e.preventDefault();
            const dragging = dom.commandGrid.querySelector('.dragging');
            if (!dragging || dragging === card) return;

            const rect = card.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            
            // Si on est dans la moitié supérieure ou inférieure, on insère avant ou après
            if (e.clientY < midpoint) {
                dom.commandGrid.insertBefore(dragging, card);
            } else {
                dom.commandGrid.insertBefore(dragging, card.nextSibling);
            }
        };

        card.ondrop = (e) => {
            e.preventDefault();
            
            // Re-sync metadata based on final DOM order
            const newOrder = Array.from(dom.commandGrid.querySelectorAll('.cmd-card-fancy')).map(c => {
                const originalIdx = parseInt(c.dataset.index);
                return meta.customCommands[originalIdx];
            });

            meta.customCommands = newOrder;
            state.metadata[state.activeProjectId] = meta;
            saveMetadata();
            
            // Render again to reset dataset.index and listeners correctly
            renderCommands(state.activeProjectRoot);
        };
        
        dom.commandGrid.appendChild(card);
    });
}

/**
 * Project Selection
 */
async function selectProject(p) {
    state.activeProjectId = p.path;
    const meta = state.metadata[p.path] || {};

    const root = meta.customRoot || p.path;
    state.activeProjectRoot = root;

    // Add to recently opened if not a favorite
    if (!p.isFavorite && !state.recentlyOpened.includes(p.path)) {
        state.recentlyOpened.push(p.path);
    }

    renderSidebarFavorites();

    // Réattacher uniquement les conteneurs de terminaux du projet actif
    dom.terminalWrapper.innerHTML = '';
    state.terminals
        .filter(t => t.projectId === p.path)
        .forEach(t => dom.terminalWrapper.appendChild(t.container));

    renderCommands(root);
    renderView('dashboard');

    const projectTerminals = state.terminals.filter(t => t.projectId === p.path);
    if (projectTerminals.length > 0) {
        // Réutiliser les terminaux existants du projet
        switchTerminal(projectTerminals[projectTerminals.length - 1].id);
        renderTabs();
        setTimeout(() => {
            const active = state.terminals.find(t => t.id === state.activeTerminalId);
            if (active) { active.fitAddon.fit(); active.xterm.focus(); }
        }, 50);
    } else {
        addTerminal(root);
    }
}

async function openWorkspaceView() {
    if (state.activeProjectId) {
        renderView('dashboard');
        focusActiveTerminal();
        return;
    }

    const firstFavorite = getFirstFavoriteProject();
    if (firstFavorite) {
        await selectProject(firstFavorite);
        return;
    }

    renderView('selection');
}

function renderSidebarFavorites() {
    dom.sidebarFavorites.innerHTML = '';
    const favs = state.projects.filter(p => p.isFavorite);
    const recentProjects = state.projects.filter(p => state.recentlyOpened.includes(p.path));
    
    const allToShow = [...favs, ...recentProjects];
    allToShow.forEach(p => {
        const item = document.createElement('div');
        item.className = 'sidebar-fav-item'
            + (p.path === state.activeProjectId ? ' active' : '')
            + (isProjectRunning(p.path) ? ' running' : '');
        item.title = p.displayName;
        if (p.logoPath) {
            const img = document.createElement('img');
            img.src = `logo://img?path=${encodeURIComponent(p.logoPath)}`;
            img.alt = p.displayName[0].toUpperCase();
            item.appendChild(img);
        } else {
            item.textContent = p.displayName[0].toUpperCase();
        }
        item.onclick = () => selectProject(p);
        dom.sidebarFavorites.appendChild(item);
    });
}

/**
 * Favorites & Meta
 */
async function toggleFavorite(project) {
    const path = project.path;
    if (!state.metadata[path]) state.metadata[path] = {};
    state.metadata[path].isFavorite = !state.metadata[path].isFavorite;
    await saveMetadata();
    await loadProjects();
}

function openEditModal(p) {
    state.editingProject = p;
    dom.modalName.value = p.displayName;
    dom.modalRoot.value = p.customRoot;
    updateModalLogo(p.logoPath, p.displayName || p.name);
    dom.editModal.classList.remove('hidden');
}

const EMOJIS = [
    '🚀', '🛠️', '📦', '🧪', '⚡', '🐳', '🐧', '🐘', '🐍', '🦀', '🎨', '🔍', '🏗️', '🧹', '📁', '🌐', '📱', '🔋', '💾', '🔥',
    '💻', '🖥️', '⌨️', '🖱️', '📡', '🛰️', '🌡️', '🎬', '🎯', '📢', '🎧', '📷', '🎬', '🎭', '🎨', '🎹', '🎸', '🎮', '🕹️', '🎰',
    '⚙️', '🖇️', '🔨', '🔩', '🔧', '🪛', '🪚', '⛏️', '⚒️', '⛏️', '🛠️', '🧱', '⛓️', '🪝', '🪚', '🔫', '💣', '🛡️', '⚔️', '🗝️',
    '🧪', '🧬', '🔬', '🔭', '📡', '💉', '🩸', '💊', '🩹', '🩺', '🚪', '🪑', '🚽', '🚿', '🛁', '🪠', '🔑', '🗝️', '🛋️', '🛏️'
];

function initEmojiPicker() {
    dom.emojiPicker.innerHTML = '';
    EMOJIS.forEach(emoji => {
        const item = document.createElement('div');
        item.className = 'emoji-item';
        item.textContent = emoji;
        item.onclick = (e) => {
            e.stopPropagation();
            dom.cmdEmoji.value = emoji;
            dom.emojiPicker.classList.add('hidden');
        };
        dom.emojiPicker.appendChild(item);
    });
}

function bindTitlebarManualDrag() {
    const titlebar = document.getElementById('titlebar');
    if (!titlebar || titlebar.dataset.dragBound === '1') return;
    titlebar.dataset.dragBound = '1';

    titlebar.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        if (event.target.closest('.window-controls')) return;

        const startClientX = event.clientX;
        const startClientY = event.clientY;

        const onMouseMove = (moveEvent) => {
            const nextX = Math.round(moveEvent.screenX - startClientX);
            const nextY = Math.round(moveEvent.screenY - startClientY);
            window.api.moveWindow(nextX, nextY);
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

/**
 * Initialization
 */
async function init() {
    document.getElementById('win-min').onclick = () => window.api.windowControl('minimize');
    document.getElementById('win-max').onclick = () => window.api.windowControl('maximize');
    document.getElementById('win-close').onclick = () => window.api.windowControl('close');
    bindTitlebarManualDrag();

    initEmojiPicker();
    initPortsTableResizers();

    dom.cmdEmoji.onclick = (e) => {
        e.stopPropagation();
        dom.emojiPicker.classList.toggle('hidden');
    };

    document.addEventListener('click', () => {
        dom.emojiPicker.classList.add('hidden');
    });

    dom.addProjectBtn.onclick = addProject;
    document.getElementById('donate-btn').onclick = () => window.api.openUrl('https://www.paypal.com/paypalme/creaprisme');
    dom.navWorkspaceBtn.onclick = openWorkspaceView;
    dom.navProjectsBtn.onclick = () => renderView('selection');
    dom.navPortsBtn.onclick = openPortsView;
    dom.portsRefreshBtn.onclick = refreshPortsList;
    dom.addTerminalBtn.onclick = () => addTerminal(state.activeProjectRoot);
    dom.removeTerminalBtn.onclick = removeActiveTerminal;
    dom.addCustomCmdBtn.onclick = openAddCommandModal;

    // Modals
    dom.modalLogoPicker.onclick = pickLogoForModal;
    dom.modalCancel.onclick = () => { dom.editModal.classList.add('hidden'); focusActiveTerminal(); };
    dom.modalSave.onclick = async () => {
        const p = state.editingProject;
        if (!state.metadata[p.path]) state.metadata[p.path] = {};
        state.metadata[p.path].displayName = dom.modalName.value;
        state.metadata[p.path].customRoot = dom.modalRoot.value;
        await saveMetadata();
        dom.editModal.classList.add('hidden');
        focusActiveTerminal();
        await loadProjects();
    };

    dom.cmdCancel.onclick = () => { dom.cmdModal.classList.add('hidden'); focusActiveTerminal(); };
    dom.cmdSave.onclick = saveCustomCommand;

    dom.deleteCancelBtn.onclick = () => { dom.deleteModal.classList.add('hidden'); focusActiveTerminal(); };
    dom.deleteConfirmBtn.onclick = deleteCommand;

    dom.portsListBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-kill-port');
        if (!btn) return;
        const pid = Number(btn.dataset.pid);
        const port = Number(btn.dataset.port);
        await killPortProcess(pid, port);
    });

    // Entrée = valider dans les fenêtres d'édition
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (!dom.editModal.classList.contains('hidden')) {
            e.preventDefault();
            dom.modalSave.click();
        } else if (!dom.cmdModal.classList.contains('hidden')) {
            e.preventDefault();
            dom.cmdSave.click();
        } else if (!dom.deleteModal.classList.contains('hidden')) {
            e.preventDefault();
            dom.deleteConfirmBtn.click();
        }
    });

    // Panel resizers
    const resizer = document.getElementById('panel-resizer');
    const resizerH = document.getElementById('panel-resizer-h');
    const colMid = document.querySelector('.col-mid');
    const colLeft = document.querySelector('.col-left');
    const colRight = document.querySelector('.col-right');
    const dashboard = document.getElementById('dashboard-view');

    const VERTICAL_THRESHOLD = 700; // px — seuil de bascule
    let isVertical = false;
    let isResizing = false;
    let midRatio = parseFloat(localStorage.getItem('panel-ratio-h') ?? '0.4');
    let midRatioV = parseFloat(localStorage.getItem('panel-ratio-v') ?? '0.4');

    function applyLayout() {
        const width = dashboard.offsetWidth || window.innerWidth;
        const vertical = width < VERTICAL_THRESHOLD;
        if (vertical !== isVertical) {
            isVertical = vertical;
            dashboard.classList.toggle('vertical', vertical);
        }
        if (isVertical) {
            colMid.style.flexGrow = midRatioV;
            colRight.style.flexGrow = 1 - midRatioV;
        } else {
            colMid.style.flexGrow = midRatio;
            colRight.style.flexGrow = 1 - midRatio;
        }
    }

    applyLayout();

    // Resizer horizontal (mode normal)
    resizer.addEventListener('mousedown', () => {
        isResizing = 'h';
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    // Resizer vertical (mode portrait)
    resizerH.addEventListener('mousedown', () => {
        isResizing = 'v';
        resizerH.classList.add('dragging');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        if (isResizing === 'h') {
            const colLeftRect = colLeft.getBoundingClientRect();
            const dashRect = dashboard.getBoundingClientRect();
            const available = dashRect.width - colLeftRect.width - resizer.offsetWidth;
            const rawWidth = e.clientX - colLeftRect.right;
            const clamped = Math.min(Math.max(rawWidth, available * 0.05), available * 0.95);
            midRatio = clamped / available;
            colMid.style.flexGrow = midRatio;
            colRight.style.flexGrow = 1 - midRatio;
        } else if (isResizing === 'v') {
            const colCenter = document.querySelector('.col-center');
            const centerRect = colCenter.getBoundingClientRect();
            const available = centerRect.height - resizerH.offsetHeight;
            const rawHeight = e.clientY - centerRect.top;
            const clamped = Math.min(Math.max(rawHeight, available * 0.05), available * 0.95);
            midRatioV = clamped / available;
            colMid.style.flexGrow = midRatioV;
            colRight.style.flexGrow = 1 - midRatioV;
        }
    });

    window.addEventListener('mouseup', () => {
        if (!isResizing) return;
        resizer.classList.remove('dragging');
        resizerH.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('panel-ratio-h', midRatio);
        localStorage.setItem('panel-ratio-v', midRatioV);
        isResizing = false;
        state.terminals.forEach(t => {
            if (t.container.classList.contains('active')) {
                t.fitAddon.fit();
                window.api.resizeTerminal(t.ptyId, t.xterm.cols, t.xterm.rows);
            }
        });
    });

    window.addEventListener('resize', () => {
        applyLayout();
        state.terminals.forEach(t => {
            t.fitAddon.fit();
            window.api.resizeTerminal(t.ptyId, t.xterm.cols, t.xterm.rows);
        });
    });

    const config = await window.api.getConfig();
    state.rootPath = config.rootPath;
    await loadProjects();
    const firstFavorite = getFirstFavoriteProject();
    if (firstFavorite) {
        await selectProject(firstFavorite);
    } else {
        renderView('selection');
    }
}

window.api.onTerminalData(({ ptyId, data }) => {
    const term = state.terminals.find(t => t.ptyId === ptyId);
    if (term) term.xterm.write(data);
});

window.api.onTerminalStatus(({ ptyId, running }) => {
    const term = state.terminals.find(t => t.ptyId === ptyId);
    if (!term) return;
    if (term.isRunning === !!running) return;
    term.isRunning = !!running;
    renderProjectLists();
    renderSidebarFavorites();
    renderTabs();
});

window.api.onTerminalExit(({ ptyId }) => {
    const index = state.terminals.findIndex(t => t.ptyId === ptyId);
    if (index === -1) return;

    const term = state.terminals[index];
    term.xterm.dispose();
    term.container.remove();
    state.terminals.splice(index, 1);

    const activeProjectTerminals = state.terminals.filter(t => t.projectId === state.activeProjectId);
    if (!activeProjectTerminals.length) {
        state.activeTerminalId = null;
        renderTabs();
    } else if (!state.terminals.some(t => t.id === state.activeTerminalId)) {
        switchTerminal(activeProjectTerminals[activeProjectTerminals.length - 1].id);
    } else {
        renderTabs();
    }

    renderProjectLists();
    renderSidebarFavorites();
});

document.addEventListener('DOMContentLoaded', init);
