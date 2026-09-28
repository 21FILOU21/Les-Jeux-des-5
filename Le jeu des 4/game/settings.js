"use strict";

/* ============================================================
   game/settings.js — Réglages : combat, notifications, touches
   (ex-fin de game.js : bloc RÉGLAGES complet)
   - Persistance : localStorage (clé "gameSettings")
   - Touches : 2 max par action, capture, conflits
   - Listener de capture en phase de capture (priorité absolue)
============================================================ */

// ==========================================
// RÉGLAGES (SETTINGS)
// ==========================================

const GAME_SETTINGS_STORAGE_KEY = "gameSettings";

const DEFAULT_GAME_SETTINGS = {
    combat: {
        skipRouletteAnimation: !1,
        allowPopupSkip: !0,
        escapeGeneration: 5,
        fastForwardToggle: !1,
        gameSpeedPercent: 100
    },
    keybinds: {
        up: ["arrowup", "w"],
        down: ["arrowdown", "s"],
        left: ["arrowleft", "a"],
        right: ["arrowright", "d"],
        confirm: ["enter"],
        cancel: ["escape"],
        devMenu: ["m"],
        saveMenu: ["p"],
        settings: ["r"],
        skipAttackText: [" "],
        fastWalk: ["shift"],
        fastForward: ["f"],
        action1: ["1"],
        action2: ["2"],
        action3: ["3"],
        action4: ["4"],
        attack1: ["1"],
        attack2: ["2"],
        attack3: ["3"],
        attack4: ["4"],
        attack5: ["5"]
    }
};

const KEYBIND_ACTIONS = [
    { action: "up", label: "Monter" },
    { action: "down", label: "Descendre" },
    { action: "left", label: "Aller à gauche" },
    { action: "right", label: "Aller à droite" },
    { action: "fastWalk", label: "Marche rapide" },
    { action: "fastForward", label: "Avance rapide" },
    { action: "action1", label: "Action 1 — Attaquer" },
    { action: "action2", label: "Action 2 — Soigner" },
    { action: "action3", label: "Action 3 — S'enfuir" },
    { action: "action4", label: "Action 4 — Recharger" },
    { action: "attack1", label: "Attaque 1 (sélection)" },
    { action: "attack2", label: "Attaque 2 (sélection)" },
    { action: "attack3", label: "Attaque 3 (sélection)" },
    { action: "attack4", label: "Attaque 4 (sélection)" },
    { action: "attack5", label: "Attaque 5 (sélection)" },
    { action: "confirm", label: "Confirmer / Menu" },
    { action: "cancel", label: "Annuler / Retour" },
    { action: "saveMenu", label: "Menu de sauvegarde" },
    { action: "settings", label: "Réglages" },
    { action: "skipAttackText", label: "Passer le texte d'attaque" },
    { action: "devMenu", label: "Mode développeur" }
];

function loadGameSettings() {
    try {
        const raw = localStorage.getItem(GAME_SETTINGS_STORAGE_KEY);

        if (!raw) return structuredClone(DEFAULT_GAME_SETTINGS);

        const data = JSON.parse(raw);

        const merged = structuredClone(DEFAULT_GAME_SETTINGS);

        if (data && typeof data === "object") {
            if (data.combat && typeof data.combat === "object") {
                if ("skipRouletteAnimation" in data.combat) merged.combat.skipRouletteAnimation = !!data.combat.skipRouletteAnimation;

                if ("allowPopupSkip" in data.combat) merged.combat.allowPopupSkip = !!data.combat.allowPopupSkip;

                if ("escapeGeneration" in data.combat) {
                    const value = Number(data.combat.escapeGeneration);

                    merged.combat.escapeGeneration = (value === 1 || value === 3 || value === 5) ? value : 5;
                }

                if ("fastForwardToggle" in data.combat) merged.combat.fastForwardToggle = !!data.combat.fastForwardToggle;

                if ("gameSpeedPercent" in data.combat) {
                    const p = Number(data.combat.gameSpeedPercent);

                    merged.combat.gameSpeedPercent = (Number.isFinite(p) && p >= 10 && p <= 1000) ? Math.round(p) : 100;
                }
            }

            if (data.keybinds && typeof data.keybinds === "object" && !Array.isArray(data.keybinds)) {
                Object.keys(merged.keybinds).forEach(action => {
                    const value = data.keybinds[action];

                    if (typeof value === "string") {
                        merged.keybinds[action] = [
                            value.toLowerCase()
                        ];
                    } else if (Array.isArray(value)) {
                        merged.keybinds[action] = value.map(key => String(key).toLowerCase()).filter(Boolean).slice(0, 2);
                    }
                });
            }
        }

        return merged
    } catch (error) {
        console.error("Impossible de charger les réglages:", error);

        return structuredClone(DEFAULT_GAME_SETTINGS);
    }
}

let gameSettings = loadGameSettings();

let fastForwardActive = !1;

function getBaseGameSpeed() {
    const p = Number(gameSettings && gameSettings.combat && gameSettings.combat.gameSpeedPercent);

    return (Number.isFinite(p) && p >= 10 && p <= 1000) ? p / 100 : 1;
}

function applyGameSpeed() {
    const base = getBaseGameSpeed();

    gameSpeed = fastForwardActive ? base * 4 : base;

    document.documentElement.style.setProperty("--game-speed", gameSpeed);
}

function isFastForwardActive() { return fastForwardActive }

function setFastForwardActive(on) { fastForwardActive = !!on; applyGameSpeed(); }

applyGameSpeed();

function saveGameSettings() {
    try {
        localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(gameSettings));
    } catch (error) {
        console.error("Impossible de sauvegarder les réglages:", error);
    }
}

function isRouletteAnimationSkipped() {
    return !!(gameSettings && gameSettings.combat && gameSettings.combat.skipRouletteAnimation);
}

function isPopupSkipAllowed() {
    return !(gameSettings && gameSettings.combat && gameSettings.combat.allowPopupSkip === !1);
}

function isFastForwardToggleMode() {
    return !!(gameSettings && gameSettings.combat && gameSettings.combat.fastForwardToggle);
}

function getKeyAction(eventKey) {
    const key = String(eventKey || "").toLowerCase();

    if (!key) return null;

    const binds = gameSettings && gameSettings.keybinds;

    if (!binds) return null;

    for (const action of Object.keys(binds)) {
        const keys = binds[action];

        if (Array.isArray(keys) && keys.includes(key)) return action;
    }

    return null;
}

function syncSetupSkipCheckbox() {
    const checkbox = $("#skip-animation");

    if (checkbox) checkbox.checked = isRouletteAnimationSkipped();
}

function formatKeyLabel(key) {
    const labels = {
        arrowup: "↑",
        arrowdown: "↓",
        arrowleft: "←",
        arrowright: "→",
        " ": "Espace",
        escape: "Échap",
        enter: "Entrée",
        tab: "Tab",
        shift: "Shift"
    };

    const normalized = String(key || "").toLowerCase();

    if (labels[normalized]) return labels[normalized];

    return normalized.length === 1 ? normalized.toUpperCase() : normalized;
}

let keybindCaptureAction = null;

let keybindCaptureSlot = - 1;

document.addEventListener("keydown", (event) => {
    if (keybindCaptureAction === null) return;

    const tag = (event.target && event.target.tagName) || "";

    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    event.preventDefault();

    event.stopPropagation();

    captureKeybind(event.key);
}, !0);

function isKeybindCaptureActive() {
    return keybindCaptureAction !== null;
}

const BATTLE_KEY_GROUPS = [
    ["action1", "action2", "action3", "action4"],
    ["attack1", "attack2", "attack3", "attack4", "attack5"]
];

function battleKeyGroupOf(action) {
    for (let g = 0; g < BATTLE_KEY_GROUPS.length; g++) {
        if (BATTLE_KEY_GROUPS[g].includes(action)) return g;
    }

    return -1;
}

function findKeybindConflict(key, ignoreAction, ignoreSlot) {
    const binds = gameSettings.keybinds;

    const ignoreGroup = battleKeyGroupOf(ignoreAction);

    for (const action of Object.keys(binds)) {
        const keys = binds[action];

        if (!Array.isArray(keys)) continue;

        const actionGroup = battleKeyGroupOf(action);

        if (ignoreGroup !== -1 && actionGroup !== -1 && ignoreGroup !== actionGroup) continue;

        for (let slot = 0; slot < keys.length; slot++) {
            if (keys[slot] === key && !(action === ignoreAction && slot === ignoreSlot)) {
                return { action, slot }
            }
        }
    }

    return null;
}

function captureKeybind(key) {
    const normalized = String(key || "").toLowerCase();

    const action = keybindCaptureAction;

    const slot = keybindCaptureSlot;

    keybindCaptureAction = null;

    keybindCaptureSlot = - 1;

    if (!normalized || !action) {
        renderKeybindList();

        return;
    }

    if (normalized === "escape") {
        showToast("Capture annulée", "La touche Échap annule la capture.");

        renderKeybindList();

        return;
    }

    if (normalized === "tab") {
        showToast("Touche invalide", "Tab ne peut pas être assigné.");

        renderKeybindList();

        return;
    }

    const conflict = findKeybindConflict(normalized, action, slot);

    if (conflict) {
        const conflictedLabel = KEYBIND_ACTIONS.find(entry => entry.action === conflict.action);

        showToast("Touche déjà utilisée", `« ${formatKeyLabel(normalized)} » est déjà assignée à « ${conflictedLabel ? conflictedLabel.label : conflict.action} ».`);

        renderKeybindList();

        return;
    }

    if (!Array.isArray(gameSettings.keybinds[action])) gameSettings.keybinds[
        action
    ] = [];

    const current = gameSettings.keybinds[action];

    const existingIndex = current.indexOf(normalized);

    if (existingIndex >= 0 && existingIndex !== slot) {
        current.splice(existingIndex, 1);
    }

    if (slot >= current.length) {
        current.push(normalized);
    } else {
        current[slot] = normalized;
    }

    gameSettings.keybinds[action] = [... new Set(current)].slice(0, 2);

    saveGameSettings();

    renderKeybindList();

    const actionLabel = KEYBIND_ACTIONS.find(entry => entry.action === action);

    showToast("Touche assignée", `${actionLabel ? actionLabel.label : action} : ${formatKeyLabel(normalized)}`);
}

function removeKeybindSlot(action, slot) {
    if (slot <= 0) return;

    const keys = gameSettings.keybinds[action];

    if (!Array.isArray(keys)) return;

    keys.splice(slot, 1);

    saveGameSettings();

    renderKeybindList();
}

function buildKeybindRow(action, label) {
    const row = document.createElement("div");

    row.className = "keybind-row";

    const labelSpan = document.createElement("span");

    labelSpan.className = "keybind-label";

    labelSpan.textContent = label;

    row.appendChild(labelSpan);

    const keys = Array.isArray(gameSettings.keybinds[action]) ? gameSettings.keybinds[
        action
    ].slice() : [];

    const listening = keybindCaptureAction === action;

    keys.forEach((key, slot) => {
        const chip = document.createElement("button");

        chip.type = "button";

        chip.className = "keybind-key" + (listening && keybindCaptureSlot === slot ? " capturing" : "");

        chip.textContent = (listening && keybindCaptureSlot === slot) ? "…" : formatKeyLabel(key);

        chip.title = slot === 0 ? "Touche principale — cliquer pour la changer" : "Touche secondaire — cliquer pour la changer";

        chip.addEventListener("click", () => {
            chip.blur();

            keybindCaptureAction = action;

            keybindCaptureSlot = slot;

            renderKeybindList();
        });

        row.appendChild(chip);

        if (slot > 0) {
            const removeButton = document.createElement("button");

            removeButton.type = "button";

            removeButton.className = "keybind-remove";

            removeButton.textContent = "×";

            removeButton.title = "Retirer la touche secondaire";

            removeButton.addEventListener("click", () => {
                removeButton.blur();

                removeKeybindSlot(action, slot);
            });

            row.appendChild(removeButton);
        }
    });

    if (keys.length < 2) {
        const targetSlot = keys.length;

        const addButton = document.createElement("button");

        addButton.type = "button";

        addButton.className = "keybind-key keybind-add" + (listening && keybindCaptureSlot === targetSlot ? " capturing" : "");

        addButton.textContent = (listening && keybindCaptureSlot === targetSlot) ? "…" : "+";

        addButton.title = keys.length === 0 ? "Ajouter la touche principale" : "Ajouter une touche secondaire";

        addButton.addEventListener("click", () => {
            addButton.blur();

            keybindCaptureAction = action;

            keybindCaptureSlot = targetSlot;

            renderKeybindList();
        });

        row.appendChild(addButton);
    }

    if (listening) {
        const hint = document.createElement("span");

        hint.className = "keybind-hint";

        hint.textContent = "Appuie sur une touche(Échap:annuler)";

        row.appendChild(hint);
    }

    return row;
}

function buildFastForwardToggleRow() {
    const wrapper = document.createElement("div");

    wrapper.className = "keybind-subtoggle";

    const label = document.createElement("label");

    label.className = "dev-check-item";

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";

    checkbox.id = "setting-fastforward-toggle";

    checkbox.checked = isFastForwardToggleMode();

    checkbox.addEventListener("change", () => {
        gameSettings.combat.fastForwardToggle = checkbox.checked;

        saveGameSettings();

        fastForwardActive = !1;

        applyGameSpeed();

        showToast("Avance rapide", checkbox.checked ? "Mode bascule : appuie une fois pour activer, une fois pour désactiver." : "Mode maintien : garde la touche enfoncée pour accélérer.");
    });

    label.appendChild(checkbox);

    const span = document.createElement("span");

    span.textContent = "Bascule (appuyer pour activer/désactiver) au lieu de maintenir";

    label.appendChild(span);

    wrapper.appendChild(label);

    return wrapper;
}

function buildGameSpeedSliderRow() {
    const wrapper = document.createElement("div");

    wrapper.className = "keybind-subtoggle game-speed-row";

    const label = document.createElement("span");

    label.className = "keybind-label";

    label.textContent = "Vitesse du jeu";

    const slider = document.createElement("input");

    slider.type = "range";

    slider.id = "setting-gamespeed";

    slider.min = "10";

    slider.max = "1000";

    slider.step = "10";

    slider.value = String(Math.round(getBaseGameSpeed() * 100));

    const valueLabel = document.createElement("span");

    valueLabel.className = "game-speed-value";

    valueLabel.textContent = `${Math.round(getBaseGameSpeed() * 100)} %`;

    slider.addEventListener("input", () => {
        const percent = Math.round(Number(slider.value) || 100);

        gameSettings.combat.gameSpeedPercent = (percent >= 10 && percent <= 1000) ? percent : 100;

        saveGameSettings();

        valueLabel.textContent = `${percent} %`;

        applyGameSpeed();
    });

    wrapper.appendChild(label);

    wrapper.appendChild(slider);

    wrapper.appendChild(valueLabel);

    return wrapper;
}

function renderKeybindList() {
    const container = $("#keybind-list");

    if (container) {
        container.innerHTML = "";

        KEYBIND_ACTIONS.forEach(({ action, label }) => {
            container.appendChild(buildKeybindRow(action, label));

            if (action === "fastForward") {
                container.appendChild(buildFastForwardToggleRow());

                container.appendChild(buildGameSpeedSliderRow());
            }
        });
    }

    const combatRow = $("#skip-attack-keybind-row");

    if (combatRow) {
        combatRow.innerHTML = "";

        combatRow.appendChild(buildKeybindRow("skipAttackText", "Passer le texte d'attaque"));
    }

    if (typeof updateActionNumberBadges === "function") updateActionNumberBadges();
}

function resetKeybinds() {
    gameSettings.keybinds = structuredClone(DEFAULT_GAME_SETTINGS.keybinds);

    saveGameSettings();

    renderKeybindList();

    showToast("Touches rétablies", "Les touches par défaut ont été restaurées.");
}

function isSettingsMenuOpen() {
    const menu = $("#settings-menu");

    return !!(menu && !menu.classList.contains("hidden"));
}

function openSettingsMenu() {
    if ((state.busy && !state.battleOver) || xpAnimationInProgress) {
        showToast("Action en cours", "Impossible d'ouvrir les réglages pendant une animation.");

        return;
    }

    if (typeof closeDevMenu === "function") closeDevMenu();

    if (typeof closeSaveMenu === "function") closeSaveMenu();

    const menu = $("#settings-menu");

    if (!menu) {
        console.error("L'élément #settings-menu est introuvable : vérifie que le bloc Réglages est présent dans index.html, directement dans <body>, au même niveau que #save-menu (pas imbriqué dans un autre menu).");

        showToast("Réglages indisponibles", "L'interface des réglages est absente du HTML(détails dans la console).");

        return;
    }

    const skipRouletteCheckbox = $("#setting-skip-roulette");

    const escapeGenSelect = $("#setting-escape-gen");

    if (escapeGenSelect) escapeGenSelect.value = String(getEscapeGeneration());

    if (skipRouletteCheckbox) skipRouletteCheckbox.checked = isRouletteAnimationSkipped();

    const popupSkipCheckbox = $("#setting-popup-skip");

    if (popupSkipCheckbox) popupSkipCheckbox.checked = isPopupSkipAllowed();

    keybindCaptureAction = null;

    keybindCaptureSlot = - 1;

    renderKeybindList();

    menu.classList.remove("hidden");
}

function closeSettingsMenu() {
    const menu = $("#settings-menu");

    if (menu) menu.classList.add("hidden");

    keybindCaptureAction = null;

    keybindCaptureSlot = - 1;
}

function toggleSettingsMenu() {
    if (isSettingsMenuOpen()) {
        closeSettingsMenu();
    } else {
        openSettingsMenu();
    }
}