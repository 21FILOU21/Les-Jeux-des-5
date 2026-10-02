"use strict";

/* ============================================================
   game/animals.js — Système Animal
   Définitions, rencontres, exemplaires capturés, effets temporaires,
   capture et menu Créatures.
============================================================ */

const ANIMAL_RARITIES = ["Commun", "Rare", "Épique", "Mythique"];
const ANIMAL_RARITY_WEIGHTS = { Commun: 70, Rare: 20, Épique: 8, Mythique: 2 };
const ANIMAL_ACTIVATIONS = ["Sur attaque", "Sur dégâts subis"];
const ANIMAL_EFFECTS = [
    "", "Dégâts", "Puissance", "Armure", "Énergie",
    "Brûlure", "Paralysie", "Sommeil", "Shocked"
];
const ANIMAL_DEFAULT_LEVEL = 1;
const ANIMAL_ENCOUNTER_CHANCE = 10;

function normalizeAnimauxConfig(contenu) {
    if (!contenu || typeof contenu !== "object") return contenu;
    if (!Array.isArray(contenu.Animaux)) contenu.Animaux = [];
    if (!contenu.AnimauxConfig || typeof contenu.AnimauxConfig !== "object") contenu.AnimauxConfig = {};
    const weights = contenu.AnimauxConfig.Raretes;
    if (!weights || typeof weights !== "object") contenu.AnimauxConfig.Raretes = structuredClone(ANIMAL_RARITY_WEIGHTS);
    ANIMAL_RARITIES.forEach(r => {
        const value = Number(contenu.AnimauxConfig.Raretes[r]);
        if (!Number.isFinite(value) || value < 0) contenu.AnimauxConfig.Raretes[r] = ANIMAL_RARITY_WEIGHTS[r];
    });
    const total = ANIMAL_RARITIES.reduce((sum, r) => sum + Number(contenu.AnimauxConfig.Raretes[r] || 0), 0);
    if (total <= 0) contenu.AnimauxConfig.Raretes = structuredClone(ANIMAL_RARITY_WEIGHTS);
    contenu.Animaux = contenu.Animaux.filter(isValidAnimalDefinition).map(normalizeAnimalDefinition);
    return contenu;
}

function isValidAnimalDefinition(animal) {
    return !!animal && typeof animal === "object" && String(animal.Nom || "").trim();
}

function normalizeAnimalDefinition(animal) {
    const out = structuredClone(animal || {});
    out.Nom = String(out.Nom || "").trim();
    out.Description = String(out.Description || "");
    out.Image = String(out.Image || "");
    out.Vie = Math.max(1, Number(out.Vie) || 1);
    out.Puissance = Math.max(0, Number(out.Puissance) || 0);
    out.Armure = Math.max(0, Number(out.Armure) || 0);
    out.MaxEnergie = Math.max(0, Number(out.MaxEnergie) || 0);
    out.MinRoulette = Math.max(0, Math.floor(Number(out.MinRoulette) || 0));
    out.MaxRoulette = Math.max(out.MinRoulette, Math.floor(Number(out.MaxRoulette) || out.MinRoulette));
    out.ValeurBuff = Number.isFinite(Number(out.ValeurBuff)) ? Number(out.ValeurBuff) : 0;
    out.ValeurDebuff = Number.isFinite(Number(out.ValeurDebuff)) ? Number(out.ValeurDebuff) : 0;
    out.Tours = Math.max(1, Math.floor(Number(out.Tours) || 1));
    out.CooldownActivation = Math.max(0, Math.floor(Number(out.CooldownActivation) || 0));
    out.Rarete = ANIMAL_RARITIES.includes(out.Rarete) ? out.Rarete : "Commun";
    out.ChanceSelection = Math.max(0, Number(out.ChanceSelection) || 0);
    out.Maitre = String(out.Maitre || "");
    out.AugmentationMaitre = Number.isFinite(Number(out.AugmentationMaitre)) ? Number(out.AugmentationMaitre) : 0;
    out.Progression = {
        Mode: String(out.Progression?.Mode || "additive"),
        ValeurParNiveau: Number.isFinite(Number(out.Progression?.ValeurParNiveau)) ? Number(out.Progression.ValeurParNiveau) : 0,
        MultiplicateurParNiveau: Number.isFinite(Number(out.Progression?.MultiplicateurParNiveau)) ? Number(out.Progression.MultiplicateurParNiveau) : 1
    };
    out.TypeBuff = ANIMAL_EFFECTS.includes(out.TypeBuff) ? out.TypeBuff : "";
    out.TypeDebuff = ANIMAL_EFFECTS.includes(out.TypeDebuff) ? out.TypeDebuff : "";
    out.TypeActivation = ANIMAL_ACTIVATIONS.includes(out.TypeActivation) ? out.TypeActivation : "Sur attaque";
    out.Stackable = out.Stackable === true;
    return out;
}

function animalUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return "animal-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function getAnimalDefinition(name) {
    return (state.contenu?.Animaux || []).find(a => a && a.Nom === name) || null;
}

function getAnimalEffectValue(animal, instance, kind) {
    const definition = animal || {};
    const base = Number(kind === "buff" ? definition.ValeurBuff : definition.ValeurDebuff) || 0;
    const level = Math.max(1, Math.floor(Number(instance?.Niveau) || 1));
    const progression = definition.Progression || {};
    let value = base;
    if (progression.Mode === "multiplicative") {
        value = base * Math.pow(Number(progression.MultiplicateurParNiveau) || 1, level - 1);
    } else {
        value = base + (Number(progression.ValeurParNiveau) || 0) * (level - 1);
    }
    if (definition.Maitre && state.hero && definition.Maitre === state.hero.Nom) {
        value += Number(definition.AugmentationMaitre) || 0;
    }
    return Math.max(0, Math.round(value * 1000) / 1000);
}

function createCapturedAnimal(definition) {
    const animal = normalizeAnimalDefinition(definition);
    return {
        Id: animalUuid(),
        AnimalNom: animal.Nom,
        Niveau: 1,
        XP: 0
    };
}

function ensureAnimalCollection() {
    if (!Array.isArray(globalState.animaux)) globalState.animaux = [];
    globalState.animaux = globalState.animaux.filter(item => item && item.Id && item.AnimalNom && getAnimalDefinition(item.AnimalNom))
        .map(item => ({ Id: String(item.Id), AnimalNom: String(item.AnimalNom), Niveau: Math.max(1, Math.floor(Number(item.Niveau) || 1)), XP: Math.max(0, Number(item.XP) || 0) }));
}

function getCapturedAnimals() {
    ensureAnimalCollection();
    return globalState.animaux;
}

function addCapturedAnimal(animalName, level = 1) {
    const definition = getAnimalDefinition(animalName);
    if (!definition) return null;
    const instance = createCapturedAnimal(definition);
    instance.Niveau = Math.max(1, Math.floor(Number(level) || 1));
    globalState.animaux.push(instance);
    updateSaveMemory();
    return instance;
}

function rollWeighted(entries, weightGetter) {
    const valid = entries.filter(Boolean);
    const total = valid.reduce((sum, entry) => sum + Math.max(0, Number(weightGetter(entry)) || 0), 0);
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const entry of valid) {
        roll -= Math.max(0, Number(weightGetter(entry)) || 0);
        if (roll < 0) return entry;
    }
    return valid[valid.length - 1] || null;
}

function selectAnimalRarity() {
    const weights = state.contenu?.AnimauxConfig?.Raretes || ANIMAL_RARITY_WEIGHTS;
    return rollWeighted(ANIMAL_RARITIES, rarity => weights[rarity]) || null;
}

function selectAnimalForRarity(rarity) {
    const pool = (state.contenu?.Animaux || []).filter(a => a && a.Rarete === rarity && Number(a.ChanceSelection) > 0);
    return rollWeighted(pool, animal => animal.ChanceSelection);
}

function createAnimalEncounterInstance(definition) {
    const animal = normalizeAnimalDefinition(definition);
    return {
        id: "wild-animal-" + animalUuid(),
        definition: animal,
        hp: animal.Vie,
        maxHp: animal.Vie,
        energy: animal.MaxEnergie,
        maxEnergy: animal.MaxEnergie,
        power: animal.Puissance,
        armor: animal.Armure,
        level: 1,
        cooldown: 0,
        activeEffects: [],
        captured: false,
        unavailable: false
    };
}

function tryCreateAnimalEncounter() {
    if (Math.random() >= ANIMAL_ENCOUNTER_CHANCE / 100) return null;
    const rarity = selectAnimalRarity();
    if (!rarity) return null;
    const definition = selectAnimalForRarity(rarity);
    if (!definition) return null;
    return createAnimalEncounterInstance(definition);
}

function startAnimalEncounter() {
    state.battleAnimals = [];
    const encounter = tryCreateAnimalEncounter();
    if (encounter) {
        state.battleAnimals.push(encounter);
        addLog("Une rencontre animale apparaît : " + encounter.definition.Nom + " (" + encounter.definition.Rarete + ").", "system");
    }
    renderAnimalBattleSlots();
}

function animalActivationMatches(animal, activation) {
    return animal && animal.definition && animal.definition.TypeActivation === activation && !animal.unavailable && animal.cooldown <= 0;
}

function getAnimalTargetForEvent(eventType, context) {
    if (eventType === "Sur attaque") {
        return context.attackerIsEnemy ? "player" : context.target;
    }
    return context.attackerIsEnemy ? "player" : "player";
}

function getAnimalTargetObject(target) {
    if (target === "player") return "player";
    return target && typeof target === "object" ? target : null;
}

function removeAnimalAppliedEffect(target, key) {
    if (!state.animalActiveEffects) state.animalActiveEffects = [];
    const removed = state.animalActiveEffects.filter(effect => effect.targetKey === key);
    removed.forEach(effect => applyAnimalModifier(effect, -1));
    state.animalActiveEffects = state.animalActiveEffects.filter(effect => effect.targetKey !== key);
}

function applyAnimalModifier(effect, direction) {
    const target = effect.target;
    const value = Number(effect.value) || 0;
    if (effect.kind === "power") {
        if (target === "player") state.playerPowerModifier += direction * value;
        else if (target) target.powerModifier = (Number(target.powerModifier) || 0) + direction * value;
    } else if (effect.kind === "armor") {
        if (target === "player") state.playerArmorModifier += direction * value;
        else if (target) target.armorModifier = (Number(target.armorModifier) || 0) + direction * value;
    }
}

function applyAnimalEffect(animal, instance, kind, target, context) {
    const type = kind === "buff" ? animal.TypeBuff : animal.TypeDebuff;
    if (!type || !target) return;
    const value = getAnimalEffectValue(animal, instance, kind);
    if (value <= 0) return;
    const normalized = String(type).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const effectKey = instance.id + ":" + kind + ":" + normalized + ":" + (target === "player" ? "player" : target.id);
    if (!animal.Stackable) removeAnimalAppliedEffect(target, effectKey.split(":").slice(0, 3).join(":") + ":" + (target === "player" ? "player" : target.id));

    if (normalized === "brulure") {
        const burnTarget = target === "player" ? "player" : target;
        if (typeof addTimedEffect === "function") addTimedEffect(burnTarget, "rollburn", value, animal.Tours);
        return;
    }

    if (normalized === "paralysie" || normalized === "sommeil" || normalized === "shocked" || normalized === "electrocution") {
        const statusTarget = target === "player" ? state : target;
        if (!statusTarget.animalStatuses) statusTarget.animalStatuses = [];
        if (!animal.Stackable) statusTarget.animalStatuses = statusTarget.animalStatuses.filter(s => s.effectKey !== effectKey);
        statusTarget.animalStatuses.push({ effectKey, type: normalized, remainingTurns: animal.Tours });
        addLog((target === "player" ? state.hero.Nom : target.name) + " est affecté par " + type + " (" + animal.Tours + " tour(s)).", "system");
        return;
    }

    let modifierKind = null;
    if (normalized === "puissance" || normalized === "degats" || normalized === "damage") modifierKind = "power";
    if (normalized === "armure" || normalized === "armor") modifierKind = "armor";
    if (normalized === "energie" || normalized === "energy") {
        if (target === "player") state.playerEnergy = Math.min(state.playerMaxEnergy, state.playerEnergy + value);
        else target.energy = Math.min(target.maxEnergy, target.energy + value);
        return;
    }
    if (!modifierKind) return;

    const effect = {
        target: target === "player" ? "player" : target,
        targetKey: effectKey,
        sourceAnimalId: instance.id,
        kind: modifierKind,
        value,
        remainingTurns: Math.max(1, animal.Tours)
    };
    if (!state.animalActiveEffects) state.animalActiveEffects = [];
    if (!animal.Stackable) {
        const old = state.animalActiveEffects.filter(e => e.targetKey === effectKey);
        old.forEach(e => applyAnimalModifier(e, -1));
        state.animalActiveEffects = state.animalActiveEffects.filter(e => e.targetKey !== effectKey);
    }
    state.animalActiveEffects.push(effect);
    applyAnimalModifier(effect, 1);
    addLog((target === "player" ? state.hero.Nom : target.name) + " reçoit " + type + " (" + value + ", " + animal.Tours + " tour(s)).", "system");
}

function triggerAnimalEffects(activation, context = {}) {
    const animals = Array.isArray(state.battleAnimals) ? state.battleAnimals : [];
    animals.forEach(instance => {
        if (!animalActivationMatches(instance, activation)) return;
        const animal = instance.definition;
        const attackerIsEnemy = context.attackerIsEnemy === true;
        const buffTarget = state.hero ? "player" : null;
        const debuffTarget = context.target || (attackerIsEnemy ? "player" : getSelectedMonster());
        if (animal.TypeBuff) applyAnimalEffect(animal, instance, "buff", buffTarget, context);
        if (animal.TypeDebuff) applyAnimalEffect(animal, instance, "debuff", debuffTarget, context);
        instance.cooldown = Math.max(0, Math.floor(Number(animal.CooldownActivation) || 0));
    });
    updateBattleUI();
}

function tickAnimalEffects() {
    if (!state.animalActiveEffects) state.animalActiveEffects = [];
    for (const effect of state.animalActiveEffects) effect.remainingTurns--;
    const expired = state.animalActiveEffects.filter(e => e.remainingTurns <= 0);
    expired.forEach(effect => applyAnimalModifier(effect, -1));
    state.animalActiveEffects = state.animalActiveEffects.filter(e => e.remainingTurns > 0);
    [state, ...(state.monsters || [])].forEach(target => {
        if (!target.animalStatuses) return;
        target.animalStatuses.forEach(status => status.remainingTurns--);
        target.animalStatuses = target.animalStatuses.filter(status => status.remainingTurns > 0);
    });
}

function tickAnimalCooldowns() {
    (state.battleAnimals || []).forEach(animal => {
        animal.cooldown = Math.max(0, Math.floor(Number(animal.cooldown) || 0) - 1);
    });
}

function hasAnimalStatus(target, types) {
    const statuses = target?.animalStatuses || [];
    return statuses.some(status => types.includes(status.type) && status.remainingTurns > 0);
}

function isAnimalTurnBlocked(target) {
    return hasAnimalStatus(target, ["paralysie", "sommeil", "shocked", "electrocution"]);
}

function getAnimalCollectionEntry(id) {
    return getCapturedAnimals().find(item => item.Id === id) || null;
}

function captureBattleAnimal(item) {
    const animal = (state.battleAnimals || []).find(entry => entry && !entry.unavailable);
    if (!animal) return { ok: false, reason: "Aucun animal capturable." };
    const chance = Math.max(0, Math.min(100, Number(item.CaptureChance ?? item.Valeur) || 0));
    const success = Math.random() * 100 < chance;
    if (!success) {
        addLog("La capture de " + animal.definition.Nom + " échoue.", "system");
        return { ok: true, captured: false, animal };
    }
    const instance = addCapturedAnimal(animal.definition.Nom, 1);
    if (!instance) return { ok: false, reason: "Définition animale introuvable." };
    animal.captured = true;
    animal.unavailable = true;
    animal.hp = 0;
    state.battleAnimals = state.battleAnimals.filter(entry => entry.id !== animal.id);
    if (state.animalActiveEffects) {
        const active = state.animalActiveEffects.filter(effect => effect.sourceAnimalId === animal.id);
        active.forEach(effect => applyAnimalModifier(effect, -1));
        state.animalActiveEffects = state.animalActiveEffects.filter(effect => effect.sourceAnimalId !== animal.id);
    }
    addLog(animal.definition.Nom + " a été capturé !", "reward");
    renderAnimalBattleSlots();
    updateSaveMemory();
    return { ok: true, captured: true, animal, instance };
}

function canCaptureAnimalItem(item, context) {
    if (context !== "battle") return { ok: false, reason: "Attraper s'utilise uniquement en combat." };
    if (!item || item.Categorie !== "Attraper") return { ok: false, reason: "Cet objet n'est pas un Attraper." };
    if (!(state.battleAnimals || []).some(animal => animal && !animal.unavailable)) return { ok: false, reason: "Aucun animal à capturer." };
    return { ok: true };
}

function getAnimalDisplayValue(instance, kind) {
    const definition = instance?.definition || getAnimalDefinition(instance?.AnimalNom);
    if (!definition) return 0;
    return getAnimalEffectValue(definition, instance, kind);
}

function renderAnimalBattleSlots() {
    const container = document.getElementById("combat-log");
    if (!container) return;

    const animals = Array.isArray(state.battleAnimals) ? state.battleAnimals.slice(0, 6) : [];

    container.classList.add("animal-slots");
    container.setAttribute("aria-label", "Animaux en combat");
    container.innerHTML = "";

    for (let i = 0; i < 6; i++) {
        const animal = animals[i];
        const slot = document.createElement("article");
        slot.className = "animal-battle-slot" + (animal ? "" : " empty");

        if (animal) {
            const definition = animal.definition || {};
            const image = definition.Image
                ? '<img src="' + escapeHtml(definition.Image) + '" alt="' + escapeHtml(definition.Nom || "Animal") + '">'
                : '<span class="animal-slot-placeholder">🐾</span>';

            slot.innerHTML =
                '<div class="animal-slot-image">' + image + '</div>' +
                '<div class="animal-slot-footer">' +
                    '<strong>' + escapeHtml(definition.Nom || "Animal") + '</strong>' +
                    '<span>' + escapeHtml(definition.Rarete || "Commun") + '</span>' +
                '</div>';

            slot.addEventListener("click", () => {
                state.selectedAnimalId = animal.id;
                renderAnimalBattleSlots();
            });
        } else {
            slot.innerHTML =
                '<div class="animal-slot-image">' +
                    '<span class="animal-slot-placeholder">＋</span>' +
                '</div>' +
                '<div class="animal-slot-footer">' +
                    '<strong>Emplacement vide</strong>' +
                    '<span>—</span>' +
                '</div>';
        }

        container.appendChild(slot);
    }
}

function openCreaturesMenu() {
    const existing = document.getElementById("creatures-menu");
    if (existing) {
        existing.classList.remove("hidden");
        renderCreaturesMenu();
        return;
    }
    const modal = document.createElement("div");
    modal.id = "creatures-menu";
    modal.className = "save-menu";
    modal.innerHTML = '<div class="save-menu-content creatures-menu-content"><div class="save-menu-header"><div><span class="eyebrow">COLLECTION</span><h2>Créatures</h2><p>Animaux capturés individuellement.</p></div><button id="creatures-close" class="close-button" type="button">×</button></div><div id="creatures-list" class="creatures-list"></div><aside id="creatures-details" class="creatures-details"></aside><div class="save-menu-footer"><button id="creatures-close-footer" class="secondary-button" type="button">Fermer</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector("#creatures-close").addEventListener("click", closeCreaturesMenu);
    modal.querySelector("#creatures-close-footer").addEventListener("click", closeCreaturesMenu);
    renderCreaturesMenu();
}

function closeCreaturesMenu() {
    document.getElementById("creatures-menu")?.classList.add("hidden");
}

function renderCreaturesMenu() {
    const list = document.getElementById("creatures-list");
    const details = document.getElementById("creatures-details");
    if (!list || !details) return;
    const creatures = getCapturedAnimals();
    list.innerHTML = "";
    if (!creatures.length) {
        list.innerHTML = '<p class="inventory-empty">Aucun animal capturé.</p>';
        details.innerHTML = '<p class="inventory-empty">Capture un animal pour le consulter ici.</p>';
        return;
    }
    creatures.forEach((instance, index) => {
        const definition = getAnimalDefinition(instance.AnimalNom);
        if (!definition) return;
        const button = document.createElement("button");
        button.className = "inventory-entry";
        button.type = "button";
        button.innerHTML = '<span class="inventory-entry-icon">' + (definition.Image ? '<img src="' + escapeHtml(definition.Image) + '" alt="">' : '🐾') + '</span><span class="inventory-entry-text"><strong>' + escapeHtml(definition.Nom) + '</strong><small>' + escapeHtml(definition.Rarete) + ' · Niv. ' + instance.Niveau + ' · #' + (index + 1) + '</small></span>';
        button.addEventListener("click", () => renderCreatureDetails(instance));
        list.appendChild(button);
    });
    renderCreatureDetails(creatures[0]);
}

function renderCreatureDetails(instance) {
    const details = document.getElementById("creatures-details");
    const definition = getAnimalDefinition(instance?.AnimalNom);
    if (!details || !definition) return;
    const valueBuff = getAnimalEffectValue(definition, instance, "buff");
    const valueDebuff = getAnimalEffectValue(definition, instance, "debuff");
    details.innerHTML = '<div class="creature-detail-image">' + (definition.Image ? '<img src="' + escapeHtml(definition.Image) + '" alt="">' : '🐾') + '</div><h3>' + escapeHtml(definition.Nom) + '</h3><p>' + escapeHtml(definition.Description) + '</p><div class="creature-detail-grid"><span>Rareté</span><strong>' + escapeHtml(definition.Rarete) + '</strong><span>Niveau</span><strong>' + instance.Niveau + '</strong><span>Vie</span><strong>' + definition.Vie + '</strong><span>Puissance</span><strong>' + definition.Puissance + '</strong><span>Armure</span><strong>' + definition.Armure + '</strong><span>Énergie</span><strong>' + definition.MaxEnergie + '</strong><span>Min roulette</span><strong>' + definition.MinRoulette + '</strong><span>Max roulette</span><strong>' + definition.MaxRoulette + '</strong><span>Buff</span><strong>' + escapeHtml(definition.TypeBuff || "—") + ' · ' + valueBuff + '</strong><span>Débuff</span><strong>' + escapeHtml(definition.TypeDebuff || "—") + ' · ' + valueDebuff + '</strong><span>Tours</span><strong>' + definition.Tours + '</strong><span>Activation</span><strong>' + escapeHtml(definition.TypeActivation) + '</strong><span>Cooldown</span><strong>' + definition.CooldownActivation + '</strong><span>Stackable</span><strong>' + (definition.Stackable ? "Oui" : "Non") + '</strong><span>Maître</span><strong>' + escapeHtml(definition.Maitre || "Aucun") + '</strong><span>Bonus maître</span><strong>+' + (definition.AugmentationMaitre || 0) + '</strong></div>';
}

function gainAnimalXp(amount = 1) {
    getCapturedAnimals().forEach(instance => {
        instance.XP += Math.max(0, Number(amount) || 0);
        const threshold = 10 + instance.Niveau * 10;
        while (instance.XP >= threshold) {
            instance.XP -= threshold;
            instance.Niveau++;
        }
    });
    updateSaveMemory();
}