"use strict";

/* ============================================================
   game/battle-flow.js — Orchestration du combat + démarrage
   (ex-game.js : init, bindEvents, sélection de personnage,
   startBattle, beginAdventure, transition de rencontre,
   fin de combat, redémarrage, IIFE final de wrap)
   Ce fichier enregistre DOMContentLoaded — il DOIT charger
   après battle-ui.js (l'IIFE réassigne updateBattleUI).
============================================================ */

/* ============================================================
   DÉMARRAGE
============================================================ */

document.addEventListener("DOMContentLoaded", init);

async function init() {
    bindEvents();

    syncSetupSkipCheckbox();

    await loadSavedHandles();

    loadSaveMemoryBackup();

    await synchronizeSaveFileWithDisk();

    try {
        setLoadingText("Chargement de ContenuJeu.json...");

        const response = await fetch(JSON_PATH);

        if (!response.ok) {
            throw new Error(`Impossible de charger ${JSON_PATH} (${response.status})`);
        }

        state.contenu = normalizeContenu(await response.json());

        captureStockContentNames();

        mergeCreatorContentIntoContenu();

        setLoadingText("Données chargées.");

        await sleep(400);

        showScreen("setup");
    } catch (error) {
        console.error(error);

        setLoadingText("Erreur : impossible de charger ContenuJeu.json.");

        showToast("Erreur de chargement", "Utilise un serveur local comme Live Server.");
    }
}

/* ============================================================
   LIAISON DES ÉVÉNEMENTS
============================================================ */

function bindEvents() {
    $("#start-selection-btn").addEventListener("click", startCharacterSelection);

    $("#back-to-setup-btn").addEventListener("click", () => {
        showScreen("setup");
    });

    $("#confirm-character-btn").addEventListener("click", () => {
        state.hero = state.selectedHero;

        beginAdventure();

        if (typeof setOverworldPlayerSprite === "function") {
            setOverworldPlayerSprite(state.hero);
        }

        startOverworldMode();
    });

    $("#attack-btn").addEventListener("click", openAttackModal);

    $("#heal-btn").addEventListener("click", playerHeal);

    $("#ignore-btn").addEventListener("click", playerFlee);

    $("#recharge-btn").addEventListener("click", playerRecharge);
    $("#inventory-btn").addEventListener("click", () => openInventoryModal("battle"));

    $("#close-attack-modal").addEventListener("click", closeAttackModal);

    $("#close-item-modal").addEventListener("click", closeItemModal);
    $("#inventory-close-footer").addEventListener("click", closeItemModal);

    $("#clear-log-btn").addEventListener("click", clearLog);

    $("#restart-btn").addEventListener("click", restartGame);

    $("#close-save-menu").addEventListener("click", closeSaveMenu);

    $("#cancel-save-menu").addEventListener("click", closeSaveMenu);

    $("#save-game-btn").addEventListener("click", () => {
        if (selectedSaveSlot !== null) {
            sauvegarder(selectedSaveSlot);
        } else {
            sauvegarder();
        }
    });

    $("#load-game-btn").addEventListener("click", () => {
        if (selectedSaveSlot !== null) {
            chargerDepuisMemoire(selectedSaveSlot);
        } else {
            chargerDepuisMemoire();
        }
    });

    $("#open-save-file-btn").addEventListener("click", openExistingSaveFile);

    $("#change-save-folder-btn").addEventListener("click", changeSaveFolder);

    $("#create-save-file-btn").addEventListener("click", createNewSaveFile);

    $("#write-save-file-btn").addEventListener("click", async () => {
        const ok = await syncSaveFileToDisk();

        showToast(ok ? "Saves.json écrit" : "Écriture impossible", ok ? "Le fichier de sauvegarde a été mis à jour sur le disque." : "Aucun dossier/fichier accessible — utilise « Changer de dossier » ou « Créer un nouveau fichier ».");
    });

    $("#close-save-files-menu").addEventListener("click", closeSaveFilesMenu);

    $("#close-save-files-footer").addEventListener("click", closeSaveFilesMenu);

    $("#back-to-save-menu").addEventListener("click", async () => {
        closeSaveFilesMenu();

        $("#save-menu").classList.remove("hidden");

        await afficherSlotsSauvegarde();
    });

    $("#manage-save-files-btn").addEventListener("click", openSaveFilesMenu);

    $("#close-dev-menu").addEventListener("click", closeDevMenu);

    $("#close-dev-menu-footer").addEventListener("click", closeDevMenu);

    $("#dev-cat-personnages").addEventListener("click", () => showDevCategoryMenu("Personnages"));

    $("#dev-cat-monstres").addEventListener("click", () => showDevCategoryMenu("Monstres"));

    $("#dev-cat-attaques").addEventListener("click", () => showDevCategoryMenu("Attaques"));

    $("#dev-cat-effets").addEventListener("click", () => showDevCategoryMenu("Effets"));

    $("#dev-cat-energies").addEventListener("click", () => showDevCategoryMenu("Energies"));

    $("#dev-cat-statuts").addEventListener("click", () => showDevCategoryMenu("Statuts"));

    $("#dev-cat-vfx").addEventListener("click", () => showDevCategoryMenu("EffetsVisuels"));

    $("#dev-image-input").addEventListener("change", handleDevImageSelected);

    const devExportBtn = $("#dev-export-disk-btn");

    if (devExportBtn) {
        devExportBtn.addEventListener("click", exportCreatorContentToDisk);
    } else {
        console.warn("Élément introuvable dans le HTML : #dev-export-disk-btn");
    }

    document.addEventListener("keydown", (event) => {
        const tag = event.target.tagName;

        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
            return;
        }

        if (event.repeat) return;

        if (encounterTransitionInProgress) {
            event.preventDefault();

            return;
        }

        if (isKeybindCaptureActive()) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        const action = getKeyAction(event.key);

        if (isBattlePopupActive()) {
            if (action === "skipAttackText" && isPopupSkipAllowed()) {
                event.preventDefault();

                closeBattlePopupNow();
            }

            return;
        }

        // RACCOURCIS D'ACTION EN COMBAT (Actions 1–4 + sélection d'attaque 1–5)
        if (screens.battle && screens.battle.classList.contains("active")
            && !isSettingsMenuOpen() && !isDevMenuOpen()
            && $("#save-menu").classList.contains("hidden")
            && $("#save-files-menu").classList.contains("hidden")) {
            const keyName = String(event.key || "").toLowerCase();

            const attackModalOpen = !$("#attack-modal").classList.contains("hidden");

            if (attackModalOpen) {
                for (let slot = 1; slot <= 5; slot++) {
                    const keys = gameSettings && gameSettings.keybinds && gameSettings.keybinds["attack" + slot];

                    if (Array.isArray(keys) && keys.includes(keyName)) {
                        event.preventDefault();

                        const cards = document.querySelectorAll("#attack-list .attack-card");

                        const card = cards[slot - 1];

                        if (card && !card.disabled) card.click();

                        return;
                    }
                }
            } else {
                for (let slot = 1; slot <= 5; slot++) {
                    const keys = gameSettings && gameSettings.keybinds && gameSettings.keybinds["action" + slot];

                    if (Array.isArray(keys) && keys.includes(keyName)) {
                        event.preventDefault();

                        if (slot === 1) openAttackModal();
                        else if (slot === 2) playerHeal();
                        else if (slot === 3) playerFlee();
                        else if (slot === 4) playerRecharge();
                        else if (slot === 5) openInventoryModal("battle");

                        return;
                    }
                }
            }
        }

        if (action === "devMenu") {
            event.preventDefault();

            toggleDevMenu();

            return;
        }

        if (isSettingsMenuOpen()) {
            if (action === "cancel" || action === "confirm" || action === "settings") {
                event.preventDefault();

                closeSettingsMenu();
            }

            return;
        }

        if (isDevMenuOpen()) {
            if (action === "cancel") {
                event.preventDefault();

                closeDevMenu();

                return;
            }

            if (event.target && event.target.closest && event.target.closest("#dev-menu")) {
                return;
            }

            if (action === "confirm" || action === "saveMenu" || action === "settings") {
                event.preventDefault();

                closeDevMenu();

                return;
            }
        }

        if (action === "settings") {
            event.preventDefault();

            toggleSettingsMenu();

            return;
        }

        if (action === "saveMenu") {
            event.preventDefault();

            toggleSaveMenu();

            return;
        }

        if (action === "confirm") {
            event.preventDefault();

            toggleSaveMenu();

            return;
        }

        if (action === "cancel") {
            event.preventDefault();

            closeSaveMenu();
        }

        if (action === "fastForward") {
            event.preventDefault();

            if (isFastForwardToggleMode()) {
                setFastForwardActive(!isFastForwardActive());
            } else {
                setFastForwardActive(!0);
            }

            return;
        }
    });

    document.addEventListener("keyup", (event) => {
        if (getKeyAction(event.key) === "fastForward" && !isFastForwardToggleMode()) {
            setFastForwardActive(!1);
        }
    });

    const settingsBindings = [
        ["#battle-popup-skip", "click", closeBattlePopupNow],
        [
            "#setting-escape-gen",
            "change",
            (event) => {
                const value = Number.parseInt(event.target.value, 10);

                gameSettings.combat.escapeGeneration = (value === 1 || value === 3 || value === 5) ? value : 5;

                saveGameSettings();
            }
        ],
        [
            "#open-settings-btn",
            "click",
            () => {
                closeSaveMenu();

                openSettingsMenu();
            }
        ],
        ["#close-settings-menu", "click", closeSettingsMenu],
        ["#close-settings-footer", "click", closeSettingsMenu],
        ["#reset-keybinds-btn", "click", resetKeybinds],
        [
            "#setting-skip-roulette",
            "change",
            (event) => {
                gameSettings.combat.skipRouletteAnimation = event.target.checked;

                saveGameSettings();

                syncSetupSkipCheckbox();
            }
        ],
        [
            "#setting-popup-skip",
            "change",
            (event) => {
                gameSettings.combat.allowPopupSkip = event.target.checked;

                saveGameSettings();
            }
        ]
    ];

    settingsBindings.forEach(([selector, eventType, handler]) => {
        const element = $(selector);

        if (element) {
            element.addEventListener(eventType, handler);
        } else {
            console.warn("Élément de réglages introuvable dans le HTML :", selector);
        }
    });

    $("#attack-modal").addEventListener("click", (event) => {
        if (event.target === $("#attack-modal")) {
            closeAttackModal();
        }
    });

    $("#item-modal").addEventListener("click", (event) => {
        if (event.target === $("#item-modal")) {
            closeItemModal();
        }
    });
}

/* ============================================================
   SÉLECTION DU PERSONNAGE
============================================================ */

function startCharacterSelection() {
    const playerName = $("#player-name").value.trim() || "Joueur";

    const monsterName = $("#monster-name").value.trim() || "Monstre";

    let monsterCount = Number.parseInt($("#monster-count").value, 10);

    if (!Number.isInteger(monsterCount) || monsterCount <= 0) {
        monsterCount = 1;
    }

    const skipAnimation = $("#skip-animation").checked;

    state.config.playerName = playerName;

    state.config.monsterName = monsterName;

    state.config.monsterCount = monsterCount;

    state.config.skipAnimation = skipAnimation;

    const enemyPool = ($("#enemy-pool")?.value === "personnages") ? "personnages" : "monstres";

    state.config.enemyPool = enemyPool;

    gameSettings.combat.skipRouletteAnimation = skipAnimation;

    saveGameSettings();

    renderCharacters();

    showScreen("character");
}

function renderCharacters() {
    const container = $("#character-list");

    container.innerHTML = "";

    const personnages = (state.contenu.Personnages || []).filter(p => p && p.VisibleSelection !== !1);

    personnages.forEach((personnage, index) => {
        const card = document.createElement("button");

        card.type = "button";

        card.className = "character-card";

        card.dataset.index = index;

        const initial = personnage.Nom.charAt(0).toUpperCase();

        const chemin = getCharacterImagePath(personnage);

        card.innerHTML = `

            <div class="character-avatar">
                <img src="${chemin}" 
                alt="${escapeHtml(personnage)}"
                class="avatar-img"
                onerror="if(!this.dataset.nestedFallback){this.dataset.nestedFallback='1';this.src='assets/personnages/personnages/${escapeHtml(initial)}.png';}else{this.onerror=null; this.parentElement.innerHTML='${escapeHtml(initial)}';}">
            </div>

            <h2>
                ${escapeHtml(personnage.Nom)}
            </h2>

            <div class="character-energy">
                ${escapeHtml(personnage.TypeEnergie)}${personnage.TypeEnergie2 ? ` / ${escapeHtml(personnage.TypeEnergie2)}` : ""}
            </div>

            <div class="character-stats">

                <div class="character-stat">
                    <span>Vie</span>
                    <strong>${personnage.Vie}</strong>
                </div>

                <div class="character-stat">
                    <span>Armure</span>
                    <strong>${personnage.Armure}</strong>
                </div>

                <div class="character-stat">
                    <span>Puissance</span>
                    <strong>${personnage.PuissanceBase}</strong>
                </div>

                <div class="character-stat">
                    <span>Roulettes</span>
                    <strong>${personnage.NombreRoulette}</strong>
                </div>

                <div class="character-stat">
                    <span>Énergie max</span>
                    <strong>${personnage.MaxEnergie}</strong>
                </div>

                <div class="character-stat">
                    <span>Roulette</span>
                    <strong>${personnage.MinRoulette}-${personnage.MaxRoulette}</strong>
                </div>

            </div>
        `;

        card.addEventListener("click", () => {
            document.querySelectorAll(".character-card").forEach(other => {
                other.classList.remove("selected");
            });

            card.classList.add("selected");

            state.selectedHero = personnage;

            $("#confirm-character-btn").disabled = !1;
        });

        container.appendChild(card);
    });
}

/* ============================================================
   DÉBUT DE COMBAT / DÉBUT D'AVENTURE
============================================================ */

function startBattle(request = null) {
    if (!state.selectedHero) {
        return;
    }
    
    let encounterRequest = null;

    if (request) {
        const requestedId = request.monsterId || request.monsterName;
        const definition = (state.contenu?.Monstres || []).find(monster =>
            monster && (String(monster.Nom || "") === String(requestedId) || String(monster.id || "") === String(requestedId))
        );

        if (!definition) {
            console.error("Rencontre personnalisée : monstre introuvable, fallback aléatoire :", requestedId);
            showToast("Rencontre invalide", `Le monstre « ${requestedId || "?"} » n'existe plus. Une rencontre aléatoire sera utilisée.`);
            state.config.monsterCount = randomInt(1, 3);
            state.config.monsterName = "Monstre";
        } else {
            encounterRequest = {
                encounterId: request.encounterId || null,
                mapId: request.mapId || null,
                monsterId: definition.Nom || definition.id,
                monsterName: definition.Nom || definition.name || requestedId,
                level: Math.max(1, Math.floor(Number(request.level) || 1)),
                count: Math.max(1, Math.floor(Number(request.count) || 1)),
                monsterDefinition: definition
            };
        }
    }

    if (encounterRequest) {
        state.config.monsterCount = encounterRequest.count;
        state.config.monsterName = encounterRequest.monsterName;
    } else {
        state.config.monsterCount = randomInt(1, 3);
        state.config.monsterName = state.config.monsterName || "Monstre";
    }

    if (typeof vfxSetSurface === "function") vfxSetSurface("battle");

    state.hero = state.selectedHero;

    state.heroEnergyData = state.contenu.Energies?.find(energie => energie.Nom === state.hero.TypeEnergie) || null;

    if (!globalState.adventureStarted) {
        beginAdventure();
    }

    updatePlayerImage();

    state.heroAttacks = (state.contenu.Attaques || []).filter(attaque => attaque.Personnage === state.hero.Nom);

    state.remainingMonsters = state.config.monsterCount;

    state.currentMonsterNumber = globalState.monsterKilled + 1;

    state.monsters = createBattleMonsters(state.config.monsterCount, encounterRequest);

    const monsterList = $("#monster-list");

    if (monsterList) monsterList.innerHTML = "";

    state.selectedMonsterId = state.monsters[0]?.id || null;

    state.turn = "player";

    state.battleOver = !1;

    state.busy = !1;

    state.escapeAttempts = 0;
    state.megaEvolutionUsed = !1;
    state.megaEvolutionBaseHeroId = null;

    state.log = [];

    showScreen("battle");

    updateBattleUI();

    clearLog();

    addLog(`Le combat commence contre ${state.config.monsterName}.`, "system");

    addLog(`${state.hero.Nom} entre dans le combat.`, "system");

    updateActionButtons();
}

function beginAdventure() {
    state.playerHp = state.hero.Vie;

    state.playerMaxHp = state.hero.Vie;

    state.playerEnergy = state.hero.MaxEnergie;

    state.playerMaxEnergy = state.hero.MaxEnergie;

    state.playerMinRoulette = state.hero.MinRoulette;

    state.playerMaxRoulette = state.hero.MaxRoulette;

    state.playerNombreRoulette = state.hero.NombreRoulette;

    state.playerPowerBase = state.hero.PuissanceBase;

    state.playerArmorBase = state.hero.Armure;

    state.playerPowerModifier = 0;

    state.playerArmorModifier = 0;

    state.playerStatusEffects = [];

    state.itemPotionForce = 0;

    state.itemBandage = 0;

    state.itemTotem = 0;

    state.itemArmor = 0;
    state.inventory = {};
    state.megaEvolutionUsed = !1;
    state.megaEvolutionBaseHeroId = null;

    state.coins = 0;

    state.pendingXp = 0;

    globalState.monsterKilled = 0;

    globalState.adventureStarted = !0;

    globalState.playerLevel = 1;

    globalState.playerXp = 0;

    globalState.playerXpToNext = xpRequiredForLevel(1);

    globalState.playerXpTotal = 0;

    globalState.evolutionDeclinedThreshold = null;

    globalState.evolutionDeclinedLevel = null;

    if (typeof resetOverworldState === "function") {
        resetOverworldState();
    }
}

/* ============================================================
   RENCONTRES SAUVAGES + TRANSITION (FONDU POKÉMON)
   Note (bug connu, non corrigé ici) : world.js appelle
   triggerWildBattle via setTimeout, jamais runEncounterTransition
   → la transition est actuellement du code mort.
============================================================ */

let encounterTransitionInProgress = !1;

let encounterTransitionResolve = null;

function runEncounterTransition(request = null) {
    if (encounterTransitionInProgress) return;

    encounterTransitionInProgress = !0;

    const skip = (typeof isRouletteAnimationSkipped === "function") && isRouletteAnimationSkipped();
    const overlay = document.getElementById("encounter-transition");

    const startBattleNow = () => {
        try {
            triggerWildBattle(request);
        } finally {
            encounterTransitionInProgress = !1;
        }
    };

    if (skip || !overlay) {
        setTimeout(() => {
            if (typeof triggerWildBattle === "function") triggerWildBattle(request);
        }, 450);

        encounterTransitionInProgress = !1;
        return;
    }

    overlay.classList.remove("hidden");
    void overlay.offsetWidth;
    overlay.classList.add("transitioning");

    setTimeout(() => {
        startBattleNow();

        setTimeout(() => {
            overlay.classList.remove("transitioning");
            setTimeout(() => overlay.classList.add("hidden"), 450);
        }, 150);
    }, 450);
}

function triggerWildBattle(request = null) {
    startBattle(request);

    addLog(` Combat engagé ! ${state.config.monsterCount} ennemi(s) apparaît(vent) dans les hautes herbes !`, "system");
}

/* ============================================================
   FIN DE COMBAT
============================================================ */

function endGame(victory) {
    if (state.battleOver) {
        return;
    }

    if (typeof restoreMegaEvolution === "function") {
        restoreMegaEvolution();
    }

    state.battleOver = !0;

    state.busy = !1;

    updateActionButtons();

    if (victory) {
        $("#end-icon").textContent = "🏆";

        $("#end-eyebrow").textContent = "VICTOIRE";

        $("#end-title").textContent = "Victoire !";

        $("#end-description").textContent = `Tous les monstres ont été vaincus.`;
    } else {
        $("#end-icon").textContent = "☠";

        $("#end-eyebrow").textContent = "DÉFAITE";

        $("#end-title").textContent = "Défaite";

        $("#end-description").textContent = `${state.hero.Nom} est tombé au combat.`;
    }

    const killed = state.config.monsterCount - state.remainingMonsters;

    $("#end-kills").textContent = Math.max(0, killed);

    $("#end-coins").textContent = state.coins;

    $("#end-health").textContent = state.playerHp;

    showScreen("end");
}

function restartGame() {
    state.selectedHero = null;

    state.hero = null;

    state.heroEnergyData = null;

    state.heroAttacks = [];

    state.battleOver = !1;

    state.busy = !1;

    state.log = [];

    $("#confirm-character-btn").disabled = !0;

    document.querySelectorAll(".character-card").forEach(card => {
        card.classList.remove("selected");
    });

    showScreen("setup");
}

/* ============================================================
   IIFE FINAL — WRAP DE updateBattleUI / endGame / restartGame
   (exécuté au chargement de CE fichier → doit venir APRÈS
   battle-ui.js dans l'ordre des <script>)
============================================================ */

(function () {
    if (typeof updateBattleUI === "function") {
        const baseUpdateBattleUI = updateBattleUI;

        updateBattleUI = function (...args) {
            const result = baseUpdateBattleUI.apply(this, args);

            try {
                refreshProgressionUI();
            } catch (error) {
                console.error("refreshProgressionUI :", error);
            }

            try {
                decorateMonsterPanels();
            } catch (error) {
                console.error("decorateMonsterPanels :", error);
            }

            return result;
        }
    }

    if (typeof endGame === "function") {
        const baseEndGame = endGame;

        endGame = function (...args) {
            vfxStopAll();
            try {
                if ((state.pendingXp || 0) > 0) {
                    const pending = state.pendingXp;

                    state.pendingXp = 0;

                    gainXp(pending);
                }
            } catch (error) {
                console.error("Crédit XP avant fin de combat :", error);
            }

            const result = baseEndGame.apply(this, args);

            try {
                const levelElement = document.getElementById("end-level");

                if (levelElement) {
                    levelElement.textContent = String(Math.max(1, globalState.playerLevel || 1));
                }
            } catch (error) {
                console.error("Mise à jour end-level :", error);
            }

            return result;
        }
    }

    if (typeof restartGame === "function") {
        const baseRestartGame = restartGame;

        restartGame = function (...args) {
            globalState.playerLevel = 1;

            globalState.playerXp = 0;

            globalState.playerXpToNext = xpRequiredForLevel(1);

            globalState.playerXpTotal = 0;

            globalState.evolutionDeclinedThreshold = null;

            globalState.evolutionDeclinedLevel = null;

            state.pendingXp = 0;

            globalState.monsterKilled = 0;

            if (typeof resetOverworldState === "function") {
                resetOverworldState();
            }

            return baseRestartGame.apply(this, args);
        }
    }
})();