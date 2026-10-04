"use strict";

/* ============================================================
   game/trainer.js — Trainers
   Extension du système de tuiles interactives + combat existant.
   Aucun moteur de combat, d'inventaire ou de monnaie parallèle.
============================================================ */

const TRAINER_MAX_TEAM_SIZE = 6;
const TRAINER_MAX_ACTIVE_SIZE = 3;
const TRAINER_DEFAULT_DETECTION_DISTANCE = 3;

let trainerMovementTimers = new Map();
let trainerMovementEpoch = 0;
let trainerShopBusy = false;

function trainerUid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return "trainer-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function normalizeTrainerDirection(value) {
    const direction = String(value || "").toLowerCase();
    return ["up", "down", "left", "right"].includes(direction) ? direction : "down";
}

function normalizeTrainerMovement(movement) {
    return (Array.isArray(movement) ? movement : []).map(step => ({
        enabled: step?.enabled !== false,
        delayMs: Math.max(0, Math.floor(Number(step?.delayMs ?? step?.delay ?? 0) || 0)),
        action: "turn",
        direction: normalizeTrainerDirection(step?.direction)
    }));
}

function normalizeTrainerTeam(team) {
    return (Array.isArray(team) ? team : []).slice(0, TRAINER_MAX_TEAM_SIZE).map(slot => ({
        type: slot?.type === "Personnage" ? "Personnage" : "Monstre",
        id: String(slot?.id || slot?.Id || slot?.Nom || ""),
        level: Math.max(1, Math.floor(Number(slot?.level ?? slot?.Niveau ?? 1) || 1))
    })).filter(slot => slot.id);
}

function normalizeTrainerShop(shop) {
    if (!shop || typeof shop !== "object") return null;
    const items = (Array.isArray(shop.items) ? shop.items : [])
        .map(entry => ({
            itemId: String(entry?.itemId || entry?.Id || ""),
            price: Math.max(0, Math.floor(Number(entry?.price ?? entry?.Prix ?? 0) || 0))
        }))
        .filter(entry => entry.itemId);
    return {
        id: String(shop.id || shop.Id || trainerUid()),
        name: String(shop.name || shop.Nom || "Boutique"),
        items
    };
}

function normalizeTrainerDefinitionData(raw) {
    const source = raw && typeof raw === "object" ? structuredClone(raw) : {};
    source.Id = String(source.Id || source.id || trainerUid());
    source.Nom = String(source.Nom || source.name || "Trainer").trim() || "Trainer";
    source.Image = String(source.Image || "");
    source.Equipe = normalizeTrainerTeam(source.Equipe || source.team);
    source.DistanceActivation = Math.max(
        0,
        Math.floor(Number(source.DistanceActivation ?? source.activationDistance ?? TRAINER_DEFAULT_DETECTION_DISTANCE) || 0)
    );
    source.Mouvement = normalizeTrainerMovement(source.Mouvement || source.movement);
    source.BoucleMouvement = source.BoucleMouvement !== false;
    source.RecompensePieces = Math.max(0, Math.floor(Number(source.RecompensePieces ?? source.coins ?? 0) || 0));
    source.Boutique = normalizeTrainerShop(source.Boutique || source.shop);
    return source;
}

function getTrainerDefinition(instance) {
    if (!instance) return null;
    if (instance.trainerDefinition) return normalizeTrainerDefinitionData(instance.trainerDefinition);

    const props = typeof mapEditorGetInstanceProps === "function"
        ? mapEditorGetInstanceProps(instance)
        : null;

    const raw = props?.trainer || props;
    if (!raw || String(instance.type || props?.type || "") !== "trainer") return null;

    return normalizeTrainerDefinitionData(raw);
}

function getTrainerInstanceProps(instance) {
    if (!instance) return null;
    const props = typeof mapEditorGetInstanceProps === "function"
        ? mapEditorGetInstanceProps(instance)
        : {};
    const base = normalizeTrainerDefinitionData(props?.trainer || props);
    const overrides = instance?.overrides?.trainer || {};
    return normalizeTrainerDefinitionData(Object.assign({}, base, overrides));
}

function getTrainerDefinitionById(id) {
    const value = String(id || "");
    const m = typeof mapEditorCurrent === "function" ? mapEditorCurrent() : null;
    const local = m?.tileDefinitions?.find(tile =>
        tile?.interactive && String(tile.id) === value && String(tile.kind || tile.interactive?.type || "") === "trainer"
    );
    if (local) return normalizeTrainerDefinitionData(local.trainer || local.interactive?.trainer || local);

    if (typeof mapEditorInteractiveDefinitions !== "undefined") {
        const global = mapEditorInteractiveDefinitions.find(tile =>
            tile?.interactive && String(tile.id) === value && String(tile.kind || tile.interactive?.type || "") === "trainer"
        );
        if (global) return normalizeTrainerDefinitionData(global.trainer || global.interactive?.trainer || global);
    }

    return null;
}

function trainerResolveDefinitionEntry(slot) {
    const type = slot?.type === "Personnage" ? "Personnage" : "Monstre";
    const id = String(slot?.id || "");
    const pool = type === "Personnage"
        ? (state.contenu?.Personnages || [])
        : (state.contenu?.Monstres || []);

    return pool.find(entry =>
        entry && (String(entry.Id || entry.id || "") === id || String(entry.Nom || "") === id)
    ) || null;
}

function trainerGetEnergyTypes(definition) {
    return [definition?.TypeEnergie, definition?.TypeEnergie2]
        .map(value => String(value || "").trim())
        .filter(Boolean);
}

function trainerBuildWheels(definition) {
    const count = Math.max(1, Math.floor(Number(definition?.NombreRoulette) || 1));
    const min = Math.max(0, Math.floor(Number(definition?.MinRoulette) || 0));
    const max = Math.max(min, Math.floor(Number(definition?.MaxRoulette) || min));
    return Array.from({ length: count }, () => ({ min, max }));
}

function trainerCreateCombatant(slot, index) {
    const definition = trainerResolveDefinitionEntry(slot);
    if (!definition) return null;

    const level = Math.max(1, Math.floor(Number(slot.level) || 1));
    const scale = Math.pow(1.08, level - 1);
    const hp = Math.max(1, Math.floor((Number(definition.Vie) || 1) * scale));
    const power = Math.max(0, Math.floor((Number(definition.PuissanceBase) || 1) * scale));
    const armor = Math.max(0, Math.floor((Number(definition.Armure) || 0) * scale));
    const wheels = trainerBuildWheels(definition);
    const energyTypes = trainerGetEnergyTypes(definition);
    if (energyTypes.length === 0) energyTypes.push("Ennemi");

    return {
        id: "trainer-" + trainerUid(),
        trainerCombatant: true,
        trainerTeamIndex: index,
        isTrainerReserve: index >= TRAINER_MAX_ACTIVE_SIZE,
        type: "trainer",
        sourceType: slot.type,
        sourceId: String(definition.Id || definition.id || definition.Nom || ""),
        definitionId: String(definition.Id || definition.id || definition.Nom || ""),
        name: definition.Nom || "Combattant",
        number: index + 1,
        level,
        hp: index >= TRAINER_MAX_ACTIVE_SIZE ? 0 : hp,
        maxHp: hp,
        power,
        armor,
        powerModifier: 0,
        armorModifier: 0,
        damageMultiplier: 1,
        statusEffects: [],
        items: { force: 0, bandage: 0, armor: 0, totem: 0 },
        energyType: energyTypes[0],
        energyTypes,
        energy: Math.max(0, Number(definition.MaxEnergie) || 0),
        maxEnergy: Math.max(0, Number(definition.MaxEnergie) || 0),
        wheels,
        minRoulette: wheels[0].min,
        maxRoulette: wheels[wheels.length - 1].max,
        nombreRoulette: wheels.length,
        attacks: Array.isArray(definition.Attaques) ? definition.Attaques.slice() : [],
        Vitesse: Math.max(0, Math.floor(Number(definition.Vitesse) || 0)),
        Image: typeof definition.Image === "string" ? definition.Image : "",
        rarete: definition.Rarete || null,
        isBoss: false,
        defeatHandled: false,
        unavailable: false
    };
}

function trainerCreateCombatTeam(definition) {
    const team = normalizeTrainerDefinitionData(definition).Equipe;
    return team.map((slot, index) => trainerCreateCombatant(slot, index)).filter(Boolean).slice(0, TRAINER_MAX_TEAM_SIZE);
}

function trainerGetActiveCombatants() {
    return (state.monsters || []).filter(monster =>
        monster?.trainerCombatant && !monster.isTrainerReserve && !monster.unavailable && monster.hp > 0
    );
}

function trainerGetReserveCombatants() {
    return (state.monsters || []).filter(monster =>
        monster?.trainerCombatant && monster.isTrainerReserve && !monster.unavailable
    );
}

function trainerActivateNextReserve() {
    const reserve = trainerGetReserveCombatants()[0];
    if (!reserve) return null;

    reserve.isTrainerReserve = false;
    reserve.hp = reserve.maxHp;
    reserve.energy = reserve.maxEnergy;
    reserve.statusEffects = [];
    reserve.defeatHandled = false;
    reserve.unavailable = false;

    state.selectedMonsterId = reserve.id;
    state.remainingMonsters = trainerGetActiveCombatants().length;

    addLog(reserve.name + " entre dans le combat !", "system");
    updateBattleUI();
    return reserve;
}

function handleTrainerCombatantDefeat(monster, finalizeBattle = true) {
    if (!monster?.trainerCombatant || monster.defeatHandled) return false;

    monster.defeatHandled = true;
    monster.unavailable = true;
    monster.hp = 0;

    const replacement = trainerActivateNextReserve();
    if (!replacement) {
        state.remainingMonsters = 0;
        if (finalizeBattle && typeof finishBattleIfNoLivingMonsters === "function") {
            finishBattleIfNoLivingMonsters();
        }
        return true;
    }

    state.remainingMonsters = trainerGetActiveCombatants().length;
    return true;
}

function stopTrainerMovementPrograms() {
    trainerMovementEpoch++;
    for (const timer of trainerMovementTimers.values()) clearTimeout(timer);
    trainerMovementTimers.clear();
}

function trainerGetInstances() {
    const m = typeof mapEditorCurrent === "function" ? mapEditorCurrent() : null;
    return (m?.objects || []).filter(instance => String(instance.type || "") === "trainer");
}

function trainerScheduleMovement(instance, epoch) {
    if (epoch !== trainerMovementEpoch) return;

    const definition = getTrainerInstanceProps(instance);
    const movement = normalizeTrainerMovement(definition?.Mouvement);
    if (movement.length === 0 || instance?.state?.defeated) return;

    let cursor = Math.max(0, Math.floor(Number(instance.state?.movementIndex) || 0));
    if (cursor >= movement.length) cursor = 0;

    let steps = 0;
    while (steps < movement.length && movement[cursor]?.enabled === false) {
        cursor = (cursor + 1) % movement.length;
        steps++;
    }
    if (steps >= movement.length) return;

    const step = movement[cursor];
    const timer = setTimeout(() => {
        trainerMovementTimers.delete(instance.instanceId);

        if (epoch !== trainerMovementEpoch || instance.state?.defeated) return;
        if (state.currentEncounterType === "trainer" && state.trainerRuntime?.instanceId === instance.instanceId) return;

        if (step.action === "turn") {
            instance.state = instance.state || {};
            instance.state.facing = normalizeTrainerDirection(step.direction);
        }

        const nextIndex = cursor + 1;
        if (nextIndex >= movement.length) {
            if (!definition.BoucleMouvement) {
                instance.state.movementIndex = movement.length;
                return;
            }
            instance.state.movementIndex = 0;
        } else {
            instance.state.movementIndex = nextIndex;
        }

        if (typeof mapEditorSaveCurrent === "function") mapEditorSaveCurrent();
        if (typeof buildWorldMapCanvas === "function") {
            worldMapCanvas = buildWorldMapCanvas();
            if (typeof renderWorld === "function") renderWorld();
        }

        trainerScheduleMovement(instance, epoch);
    }, Math.max(0, step.delayMs));

    trainerMovementTimers.set(instance.instanceId, timer);
}

function startTrainerMovementPrograms() {
    stopTrainerMovementPrograms();
    const epoch = trainerMovementEpoch;
    for (const instance of trainerGetInstances()) trainerScheduleMovement(instance, epoch);
}

function trainerFacePlayer(instance, playerCol, playerRow) {
    const dx = playerCol - Number(instance.x || 0);
    const dy = playerRow - Number(instance.y || 0);
    let direction = instance.state?.facing || "down";

    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) direction = dx > 0 ? "right" : "left";
    else if (dy !== 0) direction = dy > 0 ? "down" : "up";

    instance.state = instance.state || {};
    instance.state.facing = direction;
}

function trainerDistance(instance, playerCol, playerRow) {
    return Math.abs(Number(instance.x || 0) - playerCol) + Math.abs(Number(instance.y || 0) - playerRow);
}

function mapEditorCheckTrainerDetections() {
    if (typeof overworldState === "undefined" || !overworldState.active) return false;
    if (state.busy || state.battleOver || state.currentEncounterType === "trainer") return false;

    const m = typeof mapEditorCurrent === "function" ? mapEditorCurrent() : null;
    if (!m) return false;

    const playerCol = Math.floor((overworldState.playerX + TILE_SIZE / 2) / TILE_SIZE);
    const playerRow = Math.floor((overworldState.playerY + TILE_SIZE / 2) / TILE_SIZE);

    for (const instance of trainerGetInstances()) {
        if (instance.state?.defeated || instance.state?.activationLock) continue;

        const props = getTrainerInstanceProps(instance);
        const distance = Math.max(0, Math.floor(Number(props.DistanceActivation) || 0));
        if (trainerDistance(instance, playerCol, playerRow) > distance) continue;

        instance.state = instance.state || {};
        instance.state.activationLock = true;
        trainerFacePlayer(instance, playerCol, playerRow);
        stopTrainerMovementPrograms();
        if (typeof mapEditorSaveCurrent === "function") mapEditorSaveCurrent();

        if (typeof stopOverworldMode === "function") stopOverworldMode();
        overworldState.graceDistance = WORLD_GRACE_TILES * TILE_SIZE;

        const request = {
            encounterType: "trainer",
            trainerInstanceId: instance.instanceId,
            trainerDefinition: props
        };

        if (typeof showWorldDialogue === "function") showWorldDialogue(props.Nom + " vous défie !", 1000);

        if (typeof runEncounterTransition === "function") {
            runEncounterTransition(request);
        } else if (typeof triggerWildBattle === "function") {
            setTimeout(() => triggerWildBattle(request), 450);
        }
        return true;
    }

    return false;
}

function trainerMarkDefeated() {
    const runtime = state.trainerRuntime;
    if (!runtime?.instanceId || typeof mapEditorCurrent !== "function") return false;

    const instance = mapEditorCurrent()?.objects?.find(o => o.instanceId === runtime.instanceId);
    if (!instance) return false;

    instance.state = instance.state || {};
    instance.state.defeated = true;
    instance.state.activationLock = false;
    runtime.defeated = true;

    const reward = Math.max(0, Math.floor(Number(runtime.rewardCoins) || 0));
    if (reward > 0) {
        state.coins = Math.max(0, Math.floor(Number(state.coins) || 0)) + reward;
        addLog("+" + reward + " pièces !", "reward");
    }

    if (typeof mapEditorSaveCurrent === "function") mapEditorSaveCurrent();
    if (typeof updateSaveMemory === "function") updateSaveMemory();
    return true;
}

function trainerFinishBattle(victory) {
    const runtime = state.trainerRuntime;
    if (!runtime) return;

    if (victory) {
        trainerMarkDefeated();
    } else {
        const m = typeof mapEditorCurrent === "function" ? mapEditorCurrent() : null;
        const instance = m?.objects?.find(o => o.instanceId === runtime.instanceId);
        if (instance) {
            instance.state = instance.state || {};
            instance.state.activationLock = false;
        }
    }

    state.trainerRuntime = null;
    if (typeof startTrainerMovementPrograms === "function") startTrainerMovementPrograms();
}

function getTrainerShopForInstance(instance) {
    const props = getTrainerInstanceProps(instance);
    return normalizeTrainerShop(props?.Boutique);
}

function openTrainerShopForInstance(instance) {
    const shop = getTrainerShopForInstance(instance);
    if (!shop) {
        if (typeof showWorldDialogue === "function") showWorldDialogue("Ce Trainer n'a pas de boutique.", 1600);
        return false;
    }

    let modal = document.getElementById("trainer-shop-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "trainer-shop-modal";
        modal.className = "save-menu";
        document.body.appendChild(modal);
    }

    modal.classList.remove("hidden");
    modal.innerHTML =
        '<div class="save-menu-content trainer-shop-content">' +
        '<div class="save-menu-header"><div><span class="eyebrow">BOUTIQUE</span><h2></h2><p id="trainer-shop-coins"></p></div><button id="trainer-shop-close" class="close-button" type="button">×</button></div>' +
        '<div id="trainer-shop-list" class="trainer-shop-list"></div>' +
        '<div class="save-menu-footer"><button id="trainer-shop-close-footer" class="secondary-button" type="button">Fermer</button></div>' +
        '</div>';

    modal.querySelector("h2").textContent = shop.name;
    const close = () => modal.classList.add("hidden");
    modal.querySelector("#trainer-shop-close").onclick = close;
    modal.querySelector("#trainer-shop-close-footer").onclick = close;

    const list = modal.querySelector("#trainer-shop-list");
    const coinsElement = modal.querySelector("#trainer-shop-coins");
    coinsElement.textContent = "Pièces : " + Math.max(0, Math.floor(Number(state.coins) || 0));

    for (const entry of shop.items) {
        const item = typeof getItemDefinition === "function" ? getItemDefinition(entry.itemId) : null;
        if (!item) continue;

        const row = document.createElement("article");
        row.className = "trainer-shop-entry";
        const image = item.Image
            ? '<img src="' + escapeHtml(item.Image) + '" alt="">'
            : '<span class="trainer-shop-placeholder">✦</span>';

        row.innerHTML =
            '<div class="trainer-shop-image">' + image + '</div>' +
            '<div class="trainer-shop-info"><strong>' + escapeHtml(item.Nom) + '</strong>' +
            '<p>' + escapeHtml(item.Description || "Aucune description.") + '</p>' +
            '<span>' + entry.price + ' pièces</span></div>' +
            '<button type="button" class="primary-button trainer-shop-buy">Acheter</button>';

        const button = row.querySelector(".trainer-shop-buy");
        button.onclick = () => {
            if (trainerShopBusy) return;
            trainerShopBusy = true;
            try {
                const coins = Math.max(0, Math.floor(Number(state.coins) || 0));
                const price = Math.max(0, Math.floor(Number(entry.price) || 0));

                if (coins < price) {
                    if (typeof showToast === "function") showToast("Achat impossible", "Pas assez de pièces.");
                    return;
                }

                const before = typeof getItemQuantity === "function" ? getItemQuantity(item.Id) : 0;
                const after = typeof addItemToInventory === "function" ? addItemToInventory(item.Id, 1) : before;
                if (after <= before) {
                    if (typeof showToast === "function") showToast("Achat impossible", "L'inventaire ne peut pas recevoir cet item.");
                    return;
                }

                state.coins = coins - price;
                if (typeof updateSaveMemory === "function") updateSaveMemory();
                if (typeof showToast === "function") showToast("Achat effectué", item.Nom + " ajouté à l'inventaire.");
                openTrainerShopForInstance(instance);
            } finally {
                trainerShopBusy = false;
            }
        };

        list.appendChild(row);
    }

    return true;
}

function mapEditorOpenTrainerAt(col, row) {
    const m = typeof mapEditorCurrent === "function" ? mapEditorCurrent() : null;
    const instance = m?.objects?.find(o => Number(o.x) === col && Number(o.y) === row);
    if (!instance || String(instance.type || "") !== "trainer") return false;
    return openTrainerShopForInstance(instance);
}

function mapEditorSetTrainerDefeatedState(ids) {
    const wanted = new Set((Array.isArray(ids) ? ids : []).map(String));
    const m = typeof mapEditorCurrent === "function" ? mapEditorCurrent() : null;
    if (!m) return;
    for (const instance of m.objects || []) {
        if (String(instance.type || "") !== "trainer") continue;
        instance.state = instance.state || {};
        instance.state.defeated = wanted.has(String(instance.instanceId));
        instance.state.activationLock = false;
    }
}

function getTrainerSaveState() {
    const m = typeof mapEditorCurrent === "function" ? mapEditorCurrent() : null;
    return (m?.objects || [])
        .filter(o => String(o.type || "") === "trainer" && o.state?.defeated)
        .map(o => String(o.instanceId))
        .filter(Boolean);
}

function createTrainerDefinitionForMapEditor(raw) {
    const trainer = normalizeTrainerDefinitionData(raw);
    return {
        id: trainer.Id,
        name: trainer.Nom,
        kind: "trainer",
        collision: false,
        terrainType: "interactive",
        encounters: false,
        description: "Trainer",
        fallback: "#6d4c8d",
        imageKey: null,
        interactive: {
            type: "trainer",
            collision: false,
            closedImageKey: null,
            openImageKey: null,
            transitionImageKey: null,
            imageOpacity: 1,
            lootTable: [],
            initialOpen: false,
            trainer
        },
        trainer
    };
}
