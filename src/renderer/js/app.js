import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const state = {
    currentView: 'selection',
    projects: [],
    projectOrder: [],
    emojiRecentOrder: [],
    metadata: {}, // Map of path -> { displayName, customRoot, isFavorite, logoPath, customCommands: [{emoji, label, command, desc}] }
    activeProjectId: null,
    activeProjectRoot: null,
    terminals: [], 
    activeTerminalId: null,
    rootPath: null,
    editingProject: null,
    isCreatingProject: false,
    modalDraftLogoPath: null,
    editingCommandIndex: null,
    deleteCallback: null,
    deleteCancelCallback: null,
    isSelectingProject: false,
    draggingProjectPath: null,
    projectDragMoved: false,
    sidebarDropIndex: null,
    recentlyOpened: [], // Array of project paths opened in current session (non-favorites only)
    ports: [],
    portsFeedback: null,
    portsLoading: false
};

const dom = {
    navWorkspaceBtn: document.getElementById('nav-workspace-btn'),
    navProjectsBtn: document.getElementById('nav-projects-btn'),
    navPortsBtn: document.getElementById('nav-ports-btn'),
    navInfoBtn: document.getElementById('nav-info-btn'),
    selectionView: document.getElementById('selection-view'),
    dashboardView: document.getElementById('dashboard-view'),
    portsView: document.getElementById('ports-view'),
    infosView: document.getElementById('infos-view'),
    projectList: document.getElementById('project-list'),
    favoritesList: document.getElementById('favorites-list'),
    selectionDivider: document.getElementById('selection-divider'),
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
    infosRepoBtn: document.getElementById('infos-repo-btn'),
    infosSiteBtn: document.getElementById('infos-site-btn'),
    infosSupportBtn: document.getElementById('infos-support-btn'),

    addProjectBtn: document.getElementById('add-project-btn'),

    // Logo
    sidebarFavorites: document.getElementById('sidebar-favorites'),

    // Modals
    editModal: document.getElementById('edit-modal'),
    editModalTitle: document.getElementById('edit-modal-title'),
    modalName: document.getElementById('edit-display-name'),
    modalRoot: document.getElementById('edit-root-path'),
    editModalFeedback: document.getElementById('edit-modal-feedback'),
    modalBrowseRoot: document.getElementById('modal-browse-root'),
    modalDeleteProject: document.getElementById('modal-delete-project'),
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
let sidebarWheelRaf = null;
let sidebarWheelTarget = 0;

function focusActiveTerminal() {
    const active = state.terminals.find(t => t.id === state.activeTerminalId);
    if (active) active.xterm.focus();
}

function setEditModalFeedback(message = '') {
    if (!dom.editModalFeedback) return;
    dom.editModalFeedback.textContent = message;
    dom.editModalFeedback.classList.toggle('hidden', !message);
}

function isProjectRunning(projectId) {
    return state.terminals.some(t => t.projectId === projectId && t.isRunning);
}

function animateSidebarWheelScroll() {
    const el = dom.sidebarFavorites;
    if (!el) {
        sidebarWheelRaf = null;
        return;
    }

    const current = el.scrollLeft;
    const delta = sidebarWheelTarget - current;
    if (Math.abs(delta) < 0.5) {
        el.scrollLeft = sidebarWheelTarget;
        sidebarWheelRaf = null;
        return;
    }

    el.scrollLeft = current + delta * 0.22;
    sidebarWheelRaf = requestAnimationFrame(animateSidebarWheelScroll);
}

function getFirstFavoriteProject() {
    return state.projects.find(p => p.isFavorite) || null;
}

function getFavoriteProjects() {
    return state.projects.filter((project) => project.isFavorite);
}

function updateTopNav() {
    const workspaceEnabled = state.projects.length > 0 || !!state.activeProjectId || !!getFirstFavoriteProject();
    dom.navWorkspaceBtn.disabled = !workspaceEnabled;
    dom.navWorkspaceBtn.classList.toggle('active', state.currentView === 'dashboard');
    dom.navProjectsBtn.classList.toggle('active', state.currentView === 'selection');
    dom.navPortsBtn.classList.toggle('active', state.currentView === 'ports');
    dom.navInfoBtn.classList.toggle('active', state.currentView === 'infos');
}

function setWorkspaceActionsEnabled(enabled) {
    dom.addCustomCmdBtn.disabled = !enabled;
    dom.addTerminalBtn.disabled = !enabled;
    dom.removeTerminalBtn.disabled = !enabled;
}

function renderWorkspaceEmptyState() {
    state.activeProjectId = null;
    state.activeProjectRoot = null;
    state.activeTerminalId = null;

    dom.commandGrid.innerHTML = `
        <div class="workspace-empty-block">
            Ajoute des projets dans Espace projets et
            <span class="workspace-empty-inline">clique sur <span class="workspace-empty-star"><span class="icon-mask icon-star" aria-hidden="true"></span></span> pour le mettre en favoris.</span>
        </div>
    `;
    dom.tabsContainer.innerHTML = '';
    dom.terminalWrapper.innerHTML = `
        <div class="workspace-empty-shell">Ajoute des projets dans Espace projets pour commencer.</div>
    `;
    setWorkspaceActionsEnabled(false);
    renderSidebarFavorites();
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
    const showInfos = viewName === 'infos';

    dom.selectionView.classList.toggle('hidden', !showSelection);
    dom.dashboardView.classList.toggle('hidden', !showDashboard);
    dom.portsView.classList.toggle('hidden', !showPorts);
    dom.infosView.classList.toggle('hidden', !showInfos);
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

function openInfosView() {
    renderView('infos');
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
    const basePath = normalizePath(dom.modalRoot.value || p.customRoot || p.path || state.rootPath);
    const path = await window.api.pickLogo(basePath);
    if (path) {
        state.modalDraftLogoPath = normalizePath(path);
        updateModalLogo(state.modalDraftLogoPath, dom.modalName.value || p.displayName || p.name);
    }
}

function updateModalLogo(logoPath, name) {
    if (logoPath) {
        dom.modalLogoImg.src = `logo://img?path=${encodeURIComponent(logoPath)}`;
        dom.modalLogoImg.classList.remove('hidden');
        dom.modalLogoPlaceholder.innerHTML = '';
    } else {
        dom.modalLogoImg.classList.add('hidden');
        dom.modalLogoPlaceholder.innerHTML = `
            <svg class="modal-lucide-icon modal-lucide-image-plus" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M16 5h6"></path>
                <path d="M19 2v6"></path>
                <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"></path>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
                <circle cx="9" cy="9" r="2"></circle>
            </svg>
        `;
    }
}

/**
 * Metadata
 */
function normalizeMetadataMap(rawMetadata = {}) {
    const normalized = {};
    let changed = false;

    Object.entries(rawMetadata || {}).forEach(([rawPath, rawMeta]) => {
        const normalizedPath = normalizePath(rawPath);
        const meta = rawMeta || {};
        const nextMeta = {
            ...meta,
            customRoot: normalizePath(meta.customRoot || normalizedPath),
            logoPath: meta.logoPath ? normalizePath(meta.logoPath) : null,
            customCommands: Array.isArray(meta.customCommands) ? meta.customCommands : []
        };

        if (rawPath !== normalizedPath) changed = true;
        if (!Array.isArray(meta.customCommands)) changed = true;
        if ((meta.customRoot || '') !== nextMeta.customRoot) changed = true;
        if ((meta.logoPath || null) !== nextMeta.logoPath) changed = true;

        normalized[normalizedPath] = {
            ...(normalized[normalizedPath] || {}),
            ...nextMeta
        };
    });

    const rawKeys = Object.keys(rawMetadata || {}).map(normalizePath).sort();
    const normalizedKeys = Object.keys(normalized).sort();
    if (rawKeys.length !== normalizedKeys.length || rawKeys.some((value, idx) => value !== normalizedKeys[idx])) {
        changed = true;
    }

    return { normalized, changed };
}

async function loadMetadata() {
    const rawMetadata = await window.api.getMetadata();
    const { normalized, changed } = normalizeMetadataMap(rawMetadata);
    state.metadata = normalized;
    if (changed) {
        await saveMetadata();
    }
}

async function saveMetadata() {
    await window.api.saveMetadata(state.metadata);
}

function normalizePath(pathValue) {
    return String(pathValue || '').replace(/\\/g, '/');
}

async function loadProjectOrder() {
    state.projectOrder = await window.api.getProjectOrder();
}

async function loadEmojiOrder() {
    const raw = await window.api.getEmojiOrder();
    state.emojiRecentOrder = Array.isArray(raw)
        ? [...new Set(raw.map((item) => String(item || '')).filter(Boolean))]
        : [];
}

async function saveProjectOrder(order = state.projectOrder) {
    state.projectOrder = [...order];
    await window.api.saveProjectOrder(state.projectOrder);
}

async function saveEmojiOrder(order = state.emojiRecentOrder) {
    state.emojiRecentOrder = [...new Set(order.map((item) => String(item || '')).filter(Boolean))];
    await window.api.saveEmojiOrder(state.emojiRecentOrder);
}

function normalizeProjectOrder(order, existingPaths) {
    const existingSet = new Set(existingPaths);
    const unique = [];
    const seen = new Set();

    order.forEach((rawPath) => {
        const normalized = normalizePath(rawPath);
        if (!normalized || seen.has(normalized) || !existingSet.has(normalized)) return;
        seen.add(normalized);
        unique.push(normalized);
    });

    existingPaths.forEach((projectPath) => {
        if (seen.has(projectPath)) return;
        seen.add(projectPath);
        unique.push(projectPath);
    });

    return unique;
}

async function syncAndSaveProjectOrder(optionalOrder = null) {
    const currentPaths = state.projects.map((project) => project.path);
    const nextOrder = normalizeProjectOrder(optionalOrder || state.projectOrder, currentPaths);
    const changed = nextOrder.length !== state.projectOrder.length
        || nextOrder.some((value, idx) => value !== state.projectOrder[idx]);
    state.projectOrder = nextOrder;
    if (changed) {
        await saveProjectOrder(nextOrder);
    }
}

/**
 * Projects — chargés depuis config.json (projectMetadata)
 */
async function loadProjects() {
    await Promise.all([loadMetadata(), loadProjectOrder()]);

    state.projects = Object.entries(state.metadata)
        .filter(([projectPath, meta]) => !meta._removed)
        .map(([projectPath, meta]) => {
            const normalizedPath = normalizePath(projectPath);
            const name = meta.displayName || normalizedPath.split('/').pop();
            return {
                id: normalizedPath,
                name,
                path: normalizedPath,
                displayName: meta.displayName || name,
                customRoot: normalizePath(meta.customRoot || normalizedPath),
                isFavorite: !!meta.isFavorite,
                logoPath: meta.logoPath ? normalizePath(meta.logoPath) : null,
                customCommands: meta.customCommands || []
            };
        });

    await syncAndSaveProjectOrder();
    renderProjectLists();
    renderSidebarFavorites();
    updateTopNav();
}

/**
 * Ajouter un projet via dialog dossier
 */
async function addProject() {
    state.editingProject = { path: '', name: '', displayName: '', customRoot: '' };
    state.isCreatingProject = true;
    state.modalDraftLogoPath = null;
    setEditModalFeedback('');
    dom.editModal.classList.add('creating');
    dom.editModalTitle.textContent = 'Ajouter un projet';
    dom.modalDeleteProject.classList.add('hidden');
    dom.modalName.value = '';
    dom.modalRoot.value = '';
    updateModalLogo(null, '?');
    dom.editModal.classList.remove('hidden');
}

function renderProjectLists() {
    dom.projectList.innerHTML = '';
    dom.favoritesList.innerHTML = '';

    const sorter = (a, b) => a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' });
    const favs = state.projects.filter(p => p.isFavorite).sort(sorter);
    const regular = state.projects.filter(p => !p.isFavorite).sort(sorter);

    dom.selectionDivider.classList.toggle('hidden', favs.length === 0);

    favs.forEach(p => dom.favoritesList.appendChild(createProjectItem(p)));
    regular.forEach(p => dom.projectList.appendChild(createProjectItem(p)));
}

function createProjectItem(p) {
    const item = document.createElement('div');
    item.dataset.path = p.path;
    item.className = 'project-item' + (isProjectRunning(p.path) ? ' running' : '');

    const initial = (p.displayName || p.name || '?')[0].toUpperCase();
    const avatarContent = p.logoPath
        ? `<img src="logo://img?path=${encodeURIComponent(p.logoPath)}" alt="${initial}" draggable="false">`
        : `<span>${initial}</span>`;

    item.innerHTML = `
        <div class="project-avatar">${avatarContent}</div>
        <div class="info">
            <div class="name">${p.displayName}</div>
            <div class="path">${p.customRoot || p.path}</div>
        </div>
        <div class="actions">
            <button class="action-btn star ${p.isFavorite ? 'active' : ''}" title="Favori"><span class="icon-mask icon-star" aria-hidden="true"></span></button>
        </div>
    `;

    item.onclick = (e) => {
        if (!e.target.closest('.actions')) openEditModal(p);
    };

    item.querySelector('.star').onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(p);
    };

    return item;
}

async function removeProject(p, options = {}) {
    const { onCancel = null } = options;
    showConfirmModal(
        `Retirer le projet ?`,
        `Retirer "${p.displayName}" de la liste ? (Les commandes enregistrées seront conservées dans le fichier config.)`,
        async () => {
            if (state.metadata[p.path]) {
                state.metadata[p.path]._removed = true;
            }
            await saveMetadata();
            await loadProjects();
        },
        onCancel
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

async function saveCustomCommand() {
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
    await saveMetadata();

    const usedEmoji = String(cmdData.emoji || '').trim();
    if (usedEmoji) {
        state.emojiRecentOrder = state.emojiRecentOrder.filter((emoji) => emoji !== usedEmoji);
        state.emojiRecentOrder.unshift(usedEmoji);
        await saveEmojiOrder();
        initEmojiPicker();
    }

    dom.cmdModal.classList.add('hidden');
    focusActiveTerminal();
    renderCommands(state.activeProjectRoot);
}

function showConfirmModal(title, message, callback, onCancel = null) {
    document.getElementById('delete-confirm-title').textContent = title;
    document.getElementById('delete-confirm-message').textContent = message;
    state.deleteCallback = callback;
    state.deleteCancelCallback = onCancel;
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
    state.deleteCancelCallback = null;
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
    if (!p || state.isSelectingProject) return;
    if (state.activeProjectId === p.path && state.currentView === 'dashboard') {
        focusActiveTerminal();
        return;
    }

    state.isSelectingProject = true;
    try {
        state.activeProjectId = p.path;
        const meta = state.metadata[p.path] || {};

        const root = meta.customRoot || p.path;
        state.activeProjectRoot = root;
        setWorkspaceActionsEnabled(true);

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
            await addTerminal(root);
        }
    } finally {
        state.isSelectingProject = false;
    }
}

async function openWorkspaceView() {
    const favorites = getFavoriteProjects();
    if (favorites.length === 0) {
        renderView('dashboard');
        renderWorkspaceEmptyState();
        return;
    }

    if (favorites.length === 1) {
        await selectProject(favorites[0]);
        return;
    }

    if (state.activeProjectId) {
        const active = state.projects.find((project) => project.path === state.activeProjectId);
        if (active) {
            renderView('dashboard');
            setWorkspaceActionsEnabled(true);
            focusActiveTerminal();
            return;
        }
    }

    await selectProject(favorites[0]);
}

function clearSidebarDropHints() {
    dom.sidebarFavorites
        .querySelectorAll('.sidebar-fav-item.drop-shift-block, .sidebar-fav-item.drop-shift-inline')
        .forEach((node) => node.classList.remove('drop-shift-block', 'drop-shift-inline'));
    const indicator = dom.sidebarFavorites.querySelector('.sidebar-drop-indicator');
    if (indicator) {
        indicator.classList.remove('visible', 'axis-x', 'axis-y');
        indicator.style.top = '';
        indicator.style.left = '';
    }
    state.sidebarDropIndex = null;
}

function updateSidebarDropHintFromPointer(clientX, clientY) {
    const draggingPath = state.draggingProjectPath;
    if (!draggingPath) return;

    const allItems = Array.from(dom.sidebarFavorites.querySelectorAll('.sidebar-fav-item'));
    const candidates = allItems
        .filter((node) => node.dataset.path && node.dataset.path !== draggingPath);
    if (!candidates.length) {
        clearSidebarDropHints();
        return;
    }

    const containerRect = dom.sidebarFavorites.getBoundingClientRect();
    const firstRect = candidates[0].getBoundingClientRect();
    const lastRect = candidates[candidates.length - 1].getBoundingClientRect();
    const isHorizontalBar = getComputedStyle(dom.sidebarFavorites).flexDirection.startsWith('row');

    let insertIndex = candidates.length;
    let lineX = null;
    let lineY = null;

    if (isHorizontalBar) {
        const midpoints = candidates.map((node) => {
            const rect = node.getBoundingClientRect();
            return rect.left + (rect.width / 2);
        });
        insertIndex = midpoints.findIndex((midpoint) => clientX < midpoint);
        if (insertIndex === -1) insertIndex = candidates.length;

        if (insertIndex <= 0) {
            lineX = (firstRect.left - containerRect.left) - 4;
        } else if (insertIndex >= candidates.length) {
            lineX = (lastRect.right - containerRect.left) + 4;
        } else {
            const prevRect = candidates[insertIndex - 1].getBoundingClientRect();
            const nextRect = candidates[insertIndex].getBoundingClientRect();
            lineX = ((prevRect.right + nextRect.left) / 2) - containerRect.left;
        }
    } else {
        const midpoints = candidates.map((node) => {
            const rect = node.getBoundingClientRect();
            return rect.top + (rect.height / 2);
        });
        insertIndex = midpoints.findIndex((midpoint) => clientY < midpoint);
        if (insertIndex === -1) insertIndex = candidates.length;

        if (insertIndex <= 0) {
            lineY = (firstRect.top - containerRect.top) - 4;
        } else if (insertIndex >= candidates.length) {
            lineY = (lastRect.bottom - containerRect.top) + 4;
        } else {
            const prevRect = candidates[insertIndex - 1].getBoundingClientRect();
            const nextRect = candidates[insertIndex].getBoundingClientRect();
            lineY = ((prevRect.bottom + nextRect.top) / 2) - containerRect.top;
        }
    }

    clearSidebarDropHints();
    state.sidebarDropIndex = insertIndex;

    const indicator = dom.sidebarFavorites.querySelector('.sidebar-drop-indicator');
    if (indicator) {
        if (isHorizontalBar) {
            indicator.classList.add('axis-x');
            indicator.style.left = `${Math.max(0, Math.round(lineX))}px`;
        } else {
            indicator.classList.add('axis-y');
            indicator.style.top = `${Math.max(0, Math.round(lineY))}px`;
        }
        indicator.classList.add('visible');
    }

    candidates
        .slice(insertIndex)
        .forEach((node) => node.classList.add(isHorizontalBar ? 'drop-shift-inline' : 'drop-shift-block'));
}

async function commitSidebarProjectDrop({ fallbackToEnd = false } = {}) {
    const draggingPath = state.draggingProjectPath;
    if (!draggingPath) return false;

    const visibleOrder = Array.from(dom.sidebarFavorites.querySelectorAll('.sidebar-fav-item'))
        .map((node) => node.dataset.path)
        .filter(Boolean);
    const fromIndex = visibleOrder.indexOf(draggingPath);
    if (fromIndex === -1) return false;

    const reordered = [...visibleOrder];
    reordered.splice(fromIndex, 1);

    let insertIndex = Number.isInteger(state.sidebarDropIndex) ? state.sidebarDropIndex : reordered.length;
    if (!Number.isInteger(state.sidebarDropIndex) && !fallbackToEnd) {
        return false;
    }

    insertIndex = Math.max(0, Math.min(insertIndex, reordered.length));
    reordered.splice(insertIndex, 0, draggingPath);

    const hiddenStillKnown = state.projectOrder.filter((projectPath) => !reordered.includes(projectPath));
    await syncAndSaveProjectOrder([...reordered, ...hiddenStillKnown]);
    clearSidebarDropHints();
    state.projectDragMoved = false;
    renderProjectLists();
    renderSidebarFavorites();
    return true;
}

function renderSidebarFavorites() {
    dom.sidebarFavorites.innerHTML = '';
    state.sidebarDropIndex = null;
    const favs = state.projects.filter(p => p.isFavorite);
    const recentProjects = state.projects.filter(p => state.recentlyOpened.includes(p.path));

    const dedup = new Map();
    [...favs, ...recentProjects].forEach((project) => {
        if (!dedup.has(project.path)) {
            dedup.set(project.path, project);
        }
    });
    const position = new Map(state.projectOrder.map((projectPath, index) => [projectPath, index]));
    const allToShow = [...dedup.values()].sort((a, b) => {
        const indexA = position.has(a.path) ? position.get(a.path) : Number.MAX_SAFE_INTEGER;
        const indexB = position.has(b.path) ? position.get(b.path) : Number.MAX_SAFE_INTEGER;
        if (indexA !== indexB) return indexA - indexB;
        return a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' });
    });

    allToShow.forEach(p => {
        const item = document.createElement('div');
        item.dataset.path = p.path;
        item.draggable = true;
        item.className = 'sidebar-fav-item'
            + (p.path === state.activeProjectId ? ' active' : '')
            + (isProjectRunning(p.path) ? ' running' : '');
        item.title = p.displayName;
        if (p.logoPath) {
            const img = document.createElement('img');
            img.src = `logo://img?path=${encodeURIComponent(p.logoPath)}`;
            img.alt = p.displayName[0].toUpperCase();
            img.draggable = false;
            img.addEventListener('dragstart', (event) => event.preventDefault());
            item.appendChild(img);
        } else {
            item.textContent = p.displayName[0].toUpperCase();
        }
        item.onclick = () => {
            selectProject(p);
        };

        item.ondragstart = (event) => {
            state.draggingProjectPath = p.path;
            state.projectDragMoved = false;
            item.classList.add('dragging');
            dom.sidebarFavorites.classList.add('drag-active');
            event.dataTransfer.setData('text/plain', p.path);
            event.dataTransfer.effectAllowed = 'move';
            setTimeout(() => {
                if (state.draggingProjectPath === p.path) {
                    item.classList.add('drag-source');
                }
            }, 0);
            clearSidebarDropHints();
        };

        item.ondragover = (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const draggingPath = state.draggingProjectPath;
            if (!draggingPath || draggingPath === p.path) return;
            state.projectDragMoved = true;
            updateSidebarDropHintFromPointer(event.clientX, event.clientY);
        };

        item.ondrop = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            updateSidebarDropHintFromPointer(event.clientX, event.clientY);
            await commitSidebarProjectDrop({ fallbackToEnd: true });
        };

        item.ondragend = () => {
            item.classList.remove('dragging');
            item.classList.remove('drag-source');
            clearSidebarDropHints();
            dom.sidebarFavorites.classList.remove('drag-active');
            state.projectDragMoved = false;
            state.draggingProjectPath = null;
        };

        dom.sidebarFavorites.appendChild(item);
    });

    const dropIndicator = document.createElement('div');
    dropIndicator.className = 'sidebar-drop-indicator';
    dom.sidebarFavorites.appendChild(dropIndicator);

    dom.sidebarFavorites.ondragover = (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        state.projectDragMoved = true;
        updateSidebarDropHintFromPointer(event.clientX, event.clientY);
    };

    dom.sidebarFavorites.ondrop = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        updateSidebarDropHintFromPointer(event.clientX, event.clientY);
        await commitSidebarProjectDrop({ fallbackToEnd: true });
    };
}

/**
 * Favorites & Meta
 */
async function toggleFavorite(project) {
    const path = project.path;
    if (!state.metadata[path]) state.metadata[path] = {};
    const nextFavorite = !state.metadata[path].isFavorite;
    state.metadata[path].isFavorite = nextFavorite;
    if (nextFavorite) {
        state.projectOrder = state.projectOrder.filter((projectPath) => projectPath !== path);
        state.projectOrder.push(path);
        await saveProjectOrder();
    }
    await saveMetadata();
    await loadProjects();
}

function openEditModal(p) {
    state.editingProject = p;
    state.isCreatingProject = false;
    state.modalDraftLogoPath = p.logoPath ? normalizePath(p.logoPath) : null;
    setEditModalFeedback('');
    dom.editModal.classList.remove('creating');
    dom.editModalTitle.textContent = 'Personnaliser le projet';
    dom.modalDeleteProject.classList.remove('hidden');
    dom.modalName.value = p.displayName;
    dom.modalRoot.value = normalizePath(p.customRoot || p.path);
    updateModalLogo(state.modalDraftLogoPath, p.displayName || p.name);
    dom.editModal.classList.remove('hidden');
}

const EMOJIS = [
    '💻', '🧑‍💻', '⚙️', '🔧', '🛠️', '🚀', '🔥', '⚡', '🐞', '🧪', '📦', '🐳', '🌐', '🔒', '🔑', '📊', '📈', '📉', '🧠', '🤖',
    '🔍', '🔄', '♻️', '⏱️', '⌛', '☕', '💡', '🧩', '🧱', '🔀', '🌿', '📥', '📤', '🏷️', '🗂️', '📁', '📂', '🗄️', '📡', '📶',
    '🛰️', '🔌', '🔋', '🖥️', '⌨️', '🖱️', '💾', '💿', '📀', '📜', '📝', '🧾', '🧮', '🔬', '🧬', '🛡️', '⚠️', '❌', '✅', '✔️',
    '☑️', '🚧', '🎯', '⭐', '✨', '🌙', '🌞', '🎧', '🍕', '🍔', '🌩️', '⛅', '🌥️', '❄️', '🌡️', '☠️', '🕵️', '👁️', '🕸️', '🧭',
    '📌', '📍', '🧷', '📬', '🏗️', '🧯', '🪛', '📱', '🧹', '🔫'
];

function initEmojiPicker() {
    const baseEmojis = [...new Set(EMOJIS)];
    const recentFirst = state.emojiRecentOrder.filter((emoji) => baseEmojis.includes(emoji));
    const remaining = baseEmojis.filter((emoji) => !recentFirst.includes(emoji));
    const ordered = [...recentFirst, ...remaining];

    dom.emojiPicker.innerHTML = '';
    ordered.forEach(emoji => {
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

    await loadEmojiOrder();
    initEmojiPicker();
    initPortsTableResizers();

    dom.cmdEmoji.onclick = (e) => {
        e.stopPropagation();
        dom.emojiPicker.classList.toggle('hidden');
    };

    document.addEventListener('click', () => {
        dom.emojiPicker.classList.add('hidden');
    });

    dom.sidebarFavorites.addEventListener('wheel', (event) => {
        const dashboard = dom.dashboardView;
        if (!dashboard?.classList.contains('vertical')) return;
        if (!dom.sidebarFavorites) return;

        const hasHorizontalOverflow = dom.sidebarFavorites.scrollWidth > dom.sidebarFavorites.clientWidth;
        if (!hasHorizontalOverflow) return;

        const horizontalDelta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
        if (!horizontalDelta) return;

        event.preventDefault();
        const maxScrollLeft = Math.max(0, dom.sidebarFavorites.scrollWidth - dom.sidebarFavorites.clientWidth);
        sidebarWheelTarget = Math.max(0, Math.min(maxScrollLeft, sidebarWheelTarget + horizontalDelta));
        if (!sidebarWheelRaf) {
            sidebarWheelRaf = requestAnimationFrame(animateSidebarWheelScroll);
        }
    }, { passive: false });

    dom.sidebarFavorites.addEventListener('scroll', () => {
        if (sidebarWheelRaf) return;
        sidebarWheelTarget = dom.sidebarFavorites.scrollLeft;
    }, { passive: true });

    document.addEventListener('dragover', (event) => {
        if (!state.draggingProjectPath) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    });

    document.addEventListener('drop', async (event) => {
        if (!state.draggingProjectPath) return;
        if (event.defaultPrevented) return;
        event.preventDefault();
        await commitSidebarProjectDrop({ fallbackToEnd: true });
        state.projectDragMoved = false;
        state.draggingProjectPath = null;
    });

    dom.addProjectBtn.onclick = addProject;
    dom.navWorkspaceBtn.onclick = openWorkspaceView;
    dom.navProjectsBtn.onclick = () => renderView('selection');
    dom.navPortsBtn.onclick = openPortsView;
    dom.navInfoBtn.onclick = openInfosView;
    dom.infosRepoBtn.onclick = () => window.api.openUrl('https://github.com/Mister-Obat/PowerTerminal');
    dom.infosSiteBtn.onclick = () => window.api.openUrl('https://creaprisme.fr');
    dom.infosSupportBtn.onclick = () => window.api.openUrl('https://creaprisme.fr/soutenir');
    dom.portsRefreshBtn.onclick = refreshPortsList;
    dom.addTerminalBtn.onclick = () => addTerminal(state.activeProjectRoot);
    dom.removeTerminalBtn.onclick = removeActiveTerminal;
    dom.addCustomCmdBtn.onclick = openAddCommandModal;

    // Modals
    dom.modalLogoPicker.onclick = pickLogoForModal;
    dom.modalDeleteProject.onclick = async () => {
        if (state.isCreatingProject) return;
        const editing = state.editingProject;
        if (!editing) return;
        dom.editModal.classList.add('hidden');
        await removeProject(editing, {
            onCancel: () => {
                dom.editModal.classList.remove('hidden');
            }
        });
    };
    dom.modalBrowseRoot.onclick = async () => {
        const editing = state.editingProject;
        if (!editing) return;
        const defaultPath = normalizePath(dom.modalRoot.value || editing.customRoot || editing.path || state.rootPath);
        const folder = await window.api.pickFolder(defaultPath);
        if (!folder?.path) return;
        dom.modalRoot.value = normalizePath(folder.path);
        if (state.isCreatingProject && !dom.modalName.value.trim()) {
            const guessedName = folder.name || dom.modalRoot.value.split('/').pop() || '';
            dom.modalName.value = guessedName;
            updateModalLogo(state.modalDraftLogoPath, guessedName);
        }
    };
    dom.modalCancel.onclick = () => {
        dom.editModal.classList.add('hidden');
        dom.editModal.classList.remove('creating');
        state.isCreatingProject = false;
        state.modalDraftLogoPath = null;
        setEditModalFeedback('');
        focusActiveTerminal();
    };
    dom.modalSave.onclick = async () => {
        const p = state.editingProject;
        const typedName = dom.modalName.value.trim();
        const typedRoot = normalizePath(dom.modalRoot.value).trim();

        if (state.isCreatingProject) {
            if (!typedRoot) {
                setEditModalFeedback('Choisis un dossier racine avant de continuer.');
                return;
            }

            // Re-sync with disk to avoid stale in-memory duplicates
            // (e.g. config.json deleted while app is still running).
            const latestMetadata = await window.api.getMetadata();
            const { normalized } = normalizeMetadataMap(latestMetadata);
            state.metadata = normalized;

            const projectPath = typedRoot;
            const existing = state.metadata[projectPath];
            if (existing && !existing._removed) {
                const existingName = existing.displayName || projectPath.split('/').pop() || 'Projet';
                setEditModalFeedback(`Projet déjà existant sous le nom de "${existingName}".`);
                return;
            }
            const existingMeta = existing || {};

            state.metadata[projectPath] = {
                ...existingMeta,
                displayName: typedName || existingMeta.displayName || projectPath.split('/').pop() || 'Projet',
                customRoot: projectPath,
                isFavorite: !!existingMeta.isFavorite,
                customCommands: Array.isArray(existingMeta.customCommands) ? existingMeta.customCommands : [],
                logoPath: state.modalDraftLogoPath || existingMeta.logoPath || null,
                _removed: false
            };

            await saveMetadata();
            if (!state.projectOrder.includes(projectPath)) {
                state.projectOrder = [...state.projectOrder, projectPath];
                await saveProjectOrder();
            }
            dom.editModal.classList.add('hidden');
            dom.editModal.classList.remove('creating');
            state.isCreatingProject = false;
            state.modalDraftLogoPath = null;
            setEditModalFeedback('');
            focusActiveTerminal();
            await loadProjects();
            return;
        }

        if (!state.metadata[p.path]) state.metadata[p.path] = {};
        const displayName = typedName || p.displayName || p.name;
        const nextRoot = typedRoot || normalizePath(p.path);
        state.metadata[p.path].displayName = displayName;
        state.metadata[p.path].customRoot = nextRoot;
        state.metadata[p.path].logoPath = state.modalDraftLogoPath || null;
        await saveMetadata();
        if (state.activeProjectId === p.path) {
            state.activeProjectRoot = nextRoot;
        }
        dom.editModal.classList.add('hidden');
        state.modalDraftLogoPath = null;
        setEditModalFeedback('');
        focusActiveTerminal();
        await loadProjects();
    };

    dom.cmdCancel.onclick = () => { dom.cmdModal.classList.add('hidden'); focusActiveTerminal(); };
    dom.cmdSave.onclick = saveCustomCommand;

    dom.deleteCancelBtn.onclick = () => {
        dom.deleteModal.classList.add('hidden');
        if (state.deleteCancelCallback) {
            state.deleteCancelCallback();
            state.deleteCancelCallback = null;
            state.deleteCallback = null;
            return;
        }
        focusActiveTerminal();
        state.deleteCallback = null;
    };
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
