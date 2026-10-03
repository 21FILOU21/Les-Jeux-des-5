"use strict";

/* ============================================================
   game/save-menu.js — Couche UI des sauvegardes
   (ex-game.js : menus sauvegarde/fichiers, slots, sauvegarder/
   charger, restauration d'état, gestion des fichiers Saves.json)
   La couche de persistance est dans save.js.
============================================================ */

/* ============================================================
   MENU SAUVEGARDE / CHARGEMENT
============================================================ */

function openSaveMenu() {
    if (!state) {
        return;
    }

    if ((state.busy && !state.battleOver) || xpAnimationInProgress) {
        if (typeof showToast === "function") {
            showToast("Action en cours", "Impossible d'ouvrir le menu pendant une animation.");
        }

        return;
    }

    const activeScreen = Object.entries(screens).find(([name, screen]) => screen.classList.contains("active"))?.[
        0
    ];

    if (activeScreen !== "world" && activeScreen !== "battle" && activeScreen !== "end") {
        return;
    }

    if (typeof closeDevMenu === "function") closeDevMenu();

    if (typeof closeSettingsMenu === "function") closeSettingsMenu();

    $("#save-menu").classList.remove("hidden");

    selectedSaveSlot = null;

    afficherSlotsSauvegarde();
}

function closeSaveMenu() {
    $("#save-menu").classList.add("hidden");

    selectedSaveSlot = null;
}

function toggleSaveMenu() {
    if ($("#save-menu").classList.contains("hidden")) {
        openSaveMenu();
    } else {
        closeSaveMenu();
    }
}

async function afficherSlotsSauvegarde() {
    const container = $("#save-slots");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    try {
        const saveFile = saveMemoryData;

        /* Ligne AUTOSAVE (au-dessus des slots) */

        if (saveFile.autoSave) {
            container.appendChild(buildSaveSlotRow(saveFile.autoSave, 0, true));
        }

        /* Slots 1 à 10 */

        for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
            const save = saveFile.sauvegardes[i];

            container.appendChild(buildSaveSlotRow(save, i + 1, false));
        }
    } catch (error) {
        console.error("Erreur lors de l'affichage des sauvegardes :", error);
    }
}

function buildSaveSlotRow(save, slotNumber, isAutoSave) {
    const row = document.createElement("div");

    row.className = "save-slot-row" + (save ? "" : " empty");

    /* ----- Carte principale (comportement existant conservé) ----- */

    const slot = document.createElement("button");

    slot.type = "button";

    slot.className = "save-slot" + (save ? "" : " empty");

    if (save) {
        const date = save.date ? new Date(save.date).toLocaleString("fr-CA") : "Date inconnue";

        slot.innerHTML = `

                    <span class="save-slot-number">
                        ${isAutoSave ? "A" : slotNumber}
                    </span>

                    <span class="save-slot-info">

                        <span class="save-slot-name">
                            ${escapeSaveText(save.name || "Sauvegarde automatique")}
                        </span>

                        <span class="save-slot-date">
                            ${escapeSaveText(date)}
                        </span>

                    </span>

                    <span class="save-slot-status">
                        ${isAutoSave ? "Auto" : (save ? "Occupé" : "Vide")}
                    </span>

                `;
    } else {
        slot.innerHTML = `

                    <span class="save-slot-number">
                        ${slotNumber}
                    </span>

                    <span class="save-slot-info">

                        <span class="save-slot-name">
                            [ SLOT VIDE ]
                        </span>

                        <span class="save-slot-date">
                            Aucun fichier de sauvegarde
                        </span>

                    </span>

                    <span class="save-slot-status">
                        Vide
                    </span>

                `;
    }

    slot.addEventListener("click", () => {
        if (!save) return;

        selectedSaveSlot = slotNumber;

        document.querySelectorAll(".save-slot").forEach(element => {
            element.classList.remove("selected");
        });

        slot.classList.add("selected");
    });

    row.appendChild(slot);

    /* ----- Bouton Charger (autosave uniquement) ----- */

    if (isAutoSave && save) {
        const loadButton = document.createElement("button");

        loadButton.type = "button";

        loadButton.className = "save-slot-load secondary-button";

        loadButton.textContent = "Charger";

        loadButton.addEventListener("click", () => {
            restoreSaveData(save);

            closeSaveMenu();

            showToast("Sauvegarde chargée", "Sauvegarde automatique");
        });

        row.appendChild(loadButton);
    }

    /* ----- Flèche ▼ + inspecteur globalState ----- */

    if (save) {
        const toggle = document.createElement("button");

        toggle.type = "button";

        toggle.className = "save-slot-toggle";

        toggle.textContent = "▼";

        toggle.title = "Voir les détails de la sauvegarde";

        const inspector = document.createElement("div");

        inspector.className = "save-slot-inspector hidden";

        inspector.appendChild(buildGlobalStateInspector(save));

        toggle.addEventListener("click", () => {
            inspector.classList.toggle("hidden");

            toggle.textContent = inspector.classList.contains("hidden") ? "▼" : "▲";
        });

        row.appendChild(toggle);

        row.appendChild(inspector);
    }

    return row;
}

function buildGlobalStateInspector(save) {
    const wrap = document.createElement("div");

    wrap.className = "save-inspector";

    const gs = save.globalState || {};

    const st = save.state || {};

    const heroName = st.hero && st.hero.Nom ? st.hero.Nom : (st.selectedHero && st.selectedHero.Nom ? st.selectedHero.Nom : "—");

    const rows = [
        ["Personnage", heroName],
        ["Niveau", Math.max(1, Math.floor(Number(gs.playerLevel) || 1))],
        ["XP", `${Math.max(0, Number(gs.playerXp) || 0)} / ${Math.max(1, Number(gs.playerXpToNext) || 1)}`],
        ["XP totale", Math.max(0, Number(gs.playerXpTotal) || 0)],
        ["Monstres vaincus", Math.max(0, Number(gs.monsterKilled) || 0)],
        ["Vie", `${Math.max(0, Number(st.playerHp) || 0)} / ${Math.max(0, Number(st.playerMaxHp) || 0)}`],
        ["Énergie", `${Math.max(0, Number(st.playerEnergy) || 0)} / ${Math.max(0, Number(st.playerMaxEnergy) || 0)}`],
        ["Inventaire", `⚔ ${Math.max(0, Number(st.itemPotionForce) || 0)} · ♥ ${Math.max(0, Number(st.itemBandage) || 0)} · 🛡 ${Math.max(0, Number(st.itemArmor) || 0)} · ✦ ${Math.max(0, Number(st.itemTotem) || 0)}`],
        ["Écran", (save.ui && save.ui.screen) || "—"],
        ["Overworld", save.overworld ? `(${Math.round(Number(save.overworld.playerX) || 0)}, ${Math.round(Number(save.overworld.playerY) || 0)})` : "—"]
    ];

    rows.forEach(([label, value]) => {
        const line = document.createElement("div");

        line.className = "save-inspector-line";

        const labelSpan = document.createElement("span");

        labelSpan.textContent = label;

        const valueSpan = document.createElement("span");

        valueSpan.textContent = String(value);

        line.appendChild(labelSpan);

        line.appendChild(valueSpan);

        wrap.appendChild(line);
    });

    return wrap;
}

function escapeSaveText(text) {
    const div = document.createElement("div");

    div.textContent = String(text ?? "");

    return div.innerHTML;
}

/* ============================================================
   SAUVEGARDER / CHARGER
============================================================ */

async function sauvegarder(slotForce = null) {
    try {
        let slot = slotForce ?? selectedSaveSlot;

        if (slot === null) {
            const slotInput = prompt("Dans quel slot voulez-vous sauvegarder ?\n\n" + "Choisissez un nombre entre 1 et 10.");

            if (slotInput === null) return;

            slot = Number(slotInput);
        }

        if (!Number.isInteger(slot) || slot < 1 || slot > MAX_SAVE_SLOTS) {
            alert("Slot invalide.\nVous devez choisir un nombre entre 1 et 10.");

            return;
        }

        const existingSave = saveMemoryData.sauvegardes[slot - 1];

        const defaultName = existingSave?.name || `Sauvegarde ${slot}`;

        const saveName = prompt(`Nom de la sauvegarde — Slot ${slot}`, defaultName);

        if (saveName === null) return;

        const finalName = saveName.trim();

        if (!finalName) {
            alert("Le nom de la sauvegarde ne peut pas être vide.");

            return;
        }

        if (existingSave) {
            const confirmer = confirm(`Le slot ${slot} contient déjà une sauvegarde.\n\n` + `"${existingSave.name}"\n\n` + "Voulez-vous l'écraser ?");

            if (!confirmer) return;
        }

        saveMemoryData.sauvegardes[slot - 1] = createSaveData(finalName);

        updateSaveLocationInfo();

        updateSaveMemory();

        selectedSaveSlot = slot;

        await afficherSlotsSauvegarde();

        showToast("Sauvegarde réussie", `Slot ${slot} : ${finalName}`);
    } catch (error) {
        console.error("Erreur lors de la sauvegarde :", error);

        alert("Erreur lors de la sauvegarde :\n\n" + error.message);
    }
}

function chargerDepuisMemoire(slotForce = null) {
    console.log("=== CHARGEMENT MEMOIRE ===");

    console.log("PAS DE Saves.json");

    console.trace();

    try {
        let slot = slotForce ?? selectedSaveSlot;

        if (slot === null) {
            let listeSlots = "Choisissez une sauvegarde à charger :\n\n";

            for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
                const save = saveMemoryData.sauvegardes[i];

                if (save) {
                    listeSlots += `${i + 1}. ${save.name || `Sauvegarde ${i + 1}`}\n`;
                } else {
                    listeSlots += `${i + 1}. [Vide]\n`;
                }
            }

            const slotInput = prompt(listeSlots + "\nEntrez le numéro du slot à charger :");

            if (slotInput === null) {
                return;
            }

            slot = Number(slotInput);
        }

        if (!Number.isInteger(slot) || slot < 1 || slot > MAX_SAVE_SLOTS) {
            alert("Slot invalide.\nVous devez choisir un nombre entre 1 et 10.");

            return;
        }

        const save = saveMemoryData.sauvegardes[slot - 1];

        if (!save) {
            alert(`Le slot ${slot} est vide.`);

            return;
        }

        restoreSaveData(save);

        selectedSaveSlot = slot;

        closeSaveMenu();

        if (typeof showToast === "function") {
            showToast("Sauvegarde chargée", `Slot ${slot} : ${save.name || `Sauvegarde ${slot}`}`);
        }
    } catch (error) {
        console.error("Erreur lors du chargement :", error);

        alert("Impossible de charger la sauvegarde : " + error.message);
    }
}

/* ============================================================
   RESTAURATION D'ÉTAT
============================================================ */

function restoreSaveData(save) {
    if (!save) {
        throw new Error("Sauvegarde vide.");
    }

    if (!save.globalState || !save.state) {
        throw new Error("Structure de sauvegarde invalide.");
    }

    globalState.playerXpTotal = NaN;

    globalState.evolutionDeclinedThreshold = null;

    globalState.evolutionDeclinedLevel = null;

    Object.assign(globalState, structuredClone(save.globalState));

    if (!Array.isArray(globalState.animaux)) globalState.animaux = [];
    if (typeof ensureAnimalCollection === "function") {
        ensureAnimalCollection();
    } else {
        globalState.animaux = globalState.animaux.slice(0, 6);
    }

    if (!Number.isFinite(globalState.playerLevel) || globalState.playerLevel < 1) {
        globalState.playerLevel = 1;
    }

    if (!Number.isFinite(globalState.playerXp) || globalState.playerXp < 0) {
        globalState.playerXp = 0;
    }

    if (!Number.isFinite(globalState.playerXpToNext) || globalState.playerXpToNext < 1) {
        globalState.playerXpToNext = xpRequiredForLevel(globalState.playerLevel);
    }

    if (!Number.isFinite(globalState.playerXpTotal) || globalState.playerXpTotal < 0) {
        globalState.playerXpTotal = computeTotalXpFromProgress(globalState.playerLevel, globalState.playerXp);
    }

    if (!Number.isFinite(globalState.evolutionDeclinedThreshold)) {
        globalState.evolutionDeclinedThreshold = null;
    }

    if (!Number.isFinite(globalState.evolutionDeclinedLevel)) {
        globalState.evolutionDeclinedLevel = null;
    }

    const restoredState = structuredClone(save.state);

    restoredState.contenu = state.contenu;

    restoredState.log = [];

    if (!Number.isFinite(restoredState.pendingXp)) {
        restoredState.pendingXp = 0;
    }

    if (!Number.isFinite(restoredState.escapeAttempts)) restoredState.escapeAttempts = 0;

    if (!restoredState.monsters) restoredState.monsters = [];
    if (!Array.isArray(restoredState.battleAnimals)) restoredState.battleAnimals = [];
    if (!Number.isFinite(restoredState.damageMultiplier)) restoredState.damageMultiplier = 1;
    if (restoredState.animalCaptureInProgress !== true) restoredState.animalCaptureInProgress = false;
    if (restoredState.animalCaptureCompleted !== true) restoredState.animalCaptureCompleted = false;

    Object.assign(state, restoredState);

    state.busy = !1;

    if (typeof encounterTransitionInProgress !== "undefined") encounterTransitionInProgress = !1;

    const transitionOverlay = document.getElementById("encounter-transition");

    if (transitionOverlay) {
        transitionOverlay.classList.remove("transitioning");

        transitionOverlay.classList.add("hidden");
    }

    if (!Array.isArray(state.playerStatusEffects)) {
        state.playerStatusEffects = [];
    }
    if (!Number.isFinite(state.damageMultiplier)) state.damageMultiplier = 1;

    if (!Array.isArray(state.heroAttacks)) {
        state.heroAttacks = [];
    }

    state.monsters.forEach(monster => {
        if (!monster.items || typeof monster.items !== "object" || Array.isArray(monster.items)) {
            monster.items = {
                force: 0,
                bandage: 0,
                armor: 0,
                totem: 0
            }
        }

        if (typeof monster.Image !== "string" || monster.Image.trim() === "") {
            let source = MONSTER_VARIETIES.find(m => m && m.Nom === monster.name);

            if (!source) {
                source = (state.contenu?.Personnages || []).find(p => p && p.Nom === monster.name);
            }

            if (source && typeof source.Image === "string" && source.Image.trim() !== "") {
                monster.Image = source.Image;
            }
        }

        if (!Number.isFinite(monster.Vitesse)) monster.Vitesse = 0;

        if (!Array.isArray(monster.statusEffects)) monster.statusEffects = [];

        if (!Number.isFinite(monster.powerModifier)) monster.powerModifier = 0;

        if (!Number.isFinite(monster.armorModifier)) monster.armorModifier = 0;

        const types = getMonsterEnergyTypes(monster);

        monster.energyTypes = types;

        monster.energyType = types[0] || monster.energyType || "Ennemi";

        if (!Array.isArray(monster.wheels) || monster.wheels.length === 0) {
            monster.wheels = getMonsterWheels(monster);
        }

        monster.nombreRoulette = monster.wheels.length;

        monster.minRoulette = monster.wheels[0].min;

        monster.maxRoulette = monster.wheels[0].max;
    });

    if (state.selectedHero && state.contenu && Array.isArray(state.contenu.Personnages)) {
        const savedHeroName = typeof state.selectedHero === "object" ? state.selectedHero.Nom : state.selectedHero;

        const realHero = state.contenu.Personnages.find(hero => hero.Nom === savedHeroName);

        if (realHero) {
            state.selectedHero = realHero;

            state.hero = realHero;
        }
    }

    if (state.hero) {
        state.heroEnergyData = state.contenu.Energies?.find(energie => energie.Nom === state.hero.TypeEnergie) || null;

        state.heroAttacks = (state.contenu.Attaques || []).filter(attaque => attaque.Personnage === state.hero.Nom);
    }

    if (save.overworld && typeof applyOverworldSaveData === "function") {
        applyOverworldSaveData(save.overworld);
    }

    state._restoredScreen = (save.ui && save.ui.screen) || null;

    clearLog();

    const monsterListDom = $("#monster-list");

    if (monsterListDom) monsterListDom.innerHTML = "";

    if (state.hero && typeof setOverworldPlayerSprite === "function") {
        setOverworldPlayerSprite(state.hero);
    }

    updatePlayerImage();

    updateUIAfterLoad();

    refreshBattleControlsAfterLoad();
}

function refreshBattleControlsAfterLoad() {
    const battleScreen = $("#battle-screen");

    if (!battleScreen) {
        return;
    }

    const controls = battleScreen.querySelectorAll("button");

    controls.forEach(button => {
        button.disabled = !1;
    });

    if (state.battleOver) {
        controls.forEach(button => {
            button.disabled = !0;
        });

        return;
    }

    if (state.turn !== "player") {
        controls.forEach(button => {
            button.disabled = !0;
        });
    }
}

function updateUIAfterLoad() {
    if (state.config) {
        const playerNameInput = document.querySelector("#player-name");

        const monsterNameInput = document.querySelector("#monster-name");

        const monsterCountInput = document.querySelector("#monster-count");

        const skipAnimationInput = document.querySelector("#skip-animation");

        const enemyPoolInput = document.querySelector("#enemy-pool");

        if (playerNameInput) playerNameInput.value = state.config.playerName ?? "";

        if (monsterNameInput) monsterNameInput.value = state.config.monsterName ?? "";

        if (monsterCountInput) monsterCountInput.value = state.config.monsterCount ?? 1;

        if (skipAnimationInput) skipAnimationInput.checked = isRouletteAnimationSkipped();

        if (enemyPoolInput) enemyPoolInput.value = (state.config.enemyPool === "personnages") ? "personnages" : "monstres";
    }

    closeSaveMenu();

    if (typeof closeSaveFilesMenu === "function") closeSaveFilesMenu();

    if (typeof closeAttackModal === "function") closeAttackModal();

    if (typeof closeItemModal === "function") closeItemModal();

    if (typeof closeDevMenu === "function") closeDevMenu();

    if (typeof closeSettingsMenu === "function") closeSettingsMenu();

    if (typeof updatePlayerUI === "function") updatePlayerUI();

    if (typeof updateWorldUI === "function") updateWorldUI();

    if (typeof updateBattleUI === "function") updateBattleUI();

    let targetScreen = state._restoredScreen;

    if (!targetScreen || !(targetScreen in screens)) {
        if (state.battleOver && state.playerHp <= 0) {
            targetScreen = "end";
        } else if (!state.battleOver && Array.isArray(state.monsters) && state.monsters.some(monster => monster.hp > 0)) {
            targetScreen = "battle";
        } else if (globalState.adventureStarted) {
            targetScreen = "world";
        } else {
            targetScreen = "setup";
        }
    }

    state._restoredScreen = null;

    showScreen(targetScreen);

    if (targetScreen === "world" && typeof startOverworldMode === "function") {
        startOverworldMode();
    }

    if (targetScreen === "battle" && !state.battleOver) {
        if (typeof updateActionButtons === "function") {
            updateActionButtons();
        }

        if (state.turn === "monster") {
            setTimeout(() => {
                if (!state.battleOver && state.turn === "monster" && !state.busy && typeof monsterTurn === "function") {
                    monsterTurn();
                }
            }, 600);
        }
    }
}

/* ============================================================
   MENU FICHIERS DE SAUVEGARDE
============================================================ */

async function openSaveFilesMenu() {
    $("#save-menu").classList.add("hidden");

    $("#save-files-menu").classList.remove("hidden");

    await updateSaveFileInterface();
}

function closeSaveFilesMenu() {
    $("#save-files-menu").classList.add("hidden");
}

async function updateSaveFileInterface() {
    const nameElement = $("#current-save-file-name");

    const pathElement = $("#current-save-file-path");

    const countElement = $("#save-file-count");

    const statusElement = $("#save-file-status");

    const savedCount = saveMemoryData.sauvegardes.filter(Boolean).length;

    const handle = currentSaveFileHandle || saveDirectoryHandle;

    if (!handle) {
        nameElement.textContent = "Aucun fichier sélectionné";

        pathElement.textContent = "Choisissez un fichier Saves.json";

        countElement.textContent = "0";

        statusElement.textContent = "Non chargé";

        return;
    }

    nameElement.textContent = currentSaveFileHandle ? currentSaveFileHandle.name : saveDirectoryHandle.name;

    pathElement.textContent = currentSaveFileHandle ? (saveMemoryData.dossier ? `Dossier : ${saveMemoryData.dossier}` : "Fichier sélectionné") : `Dossier de sauvegarde / ${SAVE_PATH}`;

    countElement.textContent = String(savedCount);

    try {
        const permission = await handle.queryPermission({
            mode: "readwrite"
        });

        statusElement.textContent = permission === "granted" ? "Prêt" : "Permission à confirmer";
    } catch (error) {
        statusElement.textContent = "Prêt";
    }
}

async function openExistingSaveFile() {
    try {
        if (!window.showOpenFilePicker) {
            throw new Error("File System Access API non supportée.");
        }

        const handles = await window.showOpenFilePicker({
            multiple: !1,
            types: [
                {
                    description: "Fichier de sauvegarde JSON",
                    accept: { "application/json": [".json"] }
                }
            ]
        });

        if (!handles.length) {
            return;
        }

        const handle = handles[0];

        const file = await handle.getFile();

        const text = await file.text();

        const data = normalizeSaveFile(JSON.parse(text));

        saveMemoryData = structuredClone(data);

        if (data.contenuCue) {
            contenuMemory = normalizeContenuData(structuredClone(data.contenuCue));

            delete saveMemoryData.contenuCue;
        }

        currentSaveFileHandle = handle;

        saveDirectoryHandle = null;

        await saveHandleToDatabase(SAVE_FILE_KEY, handle);

        await deleteHandleFromDatabase(SAVE_DIRECTORY_KEY);

        updateSaveLocationInfo();

        updateSaveMemory();

        await updateSaveFileInterface();

        await afficherSlotsSauvegarde();

        alert(`Fichier "${handle.name}" ouvert avec succès.`);
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        console.error(error);

        alert("Impossible d'ouvrir ce fichier :\n\n" + error.message);
    }
}

async function changeSaveFolder() {
    try {
        if (!window.showDirectoryPicker) {
            throw new Error("File System Access API non supportée.");
        }

        const directory = await window.showDirectoryPicker({
            mode: "readwrite"
        });

        saveDirectoryHandle = directory;

        currentSaveFileHandle = await directory.getFileHandle(SAVE_PATH, {
            create: !0
        });

        await saveHandleToDatabase(SAVE_DIRECTORY_KEY, directory);

        await deleteHandleFromDatabase(SAVE_FILE_KEY);

        const file = await currentSaveFileHandle.getFile();

        if (file.size === 0) {
            await ecrireFichierSauvegarde(saveMemoryData);
        } else {
            const text = await file.text();

            try {
                const data = normalizeSaveFile(JSON.parse(text));

                saveMemoryData = structuredClone(data);

                updateSaveLocationInfo();

                updateSaveMemory();
            } catch (error) {
                console.error("Saves.json invalide :", error);
            }
        }

        await updateSaveFileInterface();

        await afficherSlotsSauvegarde();
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        console.error(error);

        alert("Impossible d'accéder au dossier :\n\n" + error.message);
    }
}

async function createNewSaveFile() {
    try {
        if (!window.showSaveFilePicker) {
            throw new Error("File System Access API non supportée.");
        }

        const handle = await window.showSaveFilePicker({
            suggestedName: "Saves.json",
            types: [
                {
                    description: "Fichier de sauvegarde JSON",
                    accept: { "application/json": [".json"] }
                }
            ]
        });

        currentSaveFileHandle = handle;

        saveDirectoryHandle = null;

        await saveHandleToDatabase(SAVE_FILE_KEY, handle);

        await deleteHandleFromDatabase(SAVE_DIRECTORY_KEY);

        await ecrireFichierSauvegarde(saveMemoryData);

        await ecrireFichierContenu();

        await updateSaveFileInterface();

        alert(`Nouveau fichier "${handle.name}" créé !`);
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        console.error(error);

        alert("Impossible de créer le fichier :\n\n" + error.message);
    }
}