"use strict";

/* ============================================================
   game/animal.js — Système Animal
   Définitions, instances capturées, rencontres, capacités,
   capture, équipe de 6 et menu Créatures.
   Le combat, les effets et l'inventaire restent partagés.
============================================================ */

const ANIMAL_MAX_TEAM_SIZE = 6;
const ANIMAL_ENCOUNTER_CHANCE = 0.10;
const ANIMAL_DEFAULT_LEVEL = 1;
const ANIMAL_RARITIES = ["Commun", "Rare", "Épique", "Mythique"];
const ANIMAL_ACTIVATIONS = [
    "Sur attaque",
    "Sur attaque réussie",
    "Sur dégâts subis",
    "Sur dégâts reçus"
];
const ANIMAL_EFFECTS = [
    "",
    "Dégâts",
    "Puissance",
    "Armure",
    "Énergie",
    "Brûlure",
    "Paralysie",
    "Sommeil",
    "Shocked"
];

function animalSlug(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
}

function animalUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return "animal-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function normalizeAnimalAbility(raw, fallbackType, fallbackValue, fallbackTurns, fallbackActivation, fallbackCooldown, fallbackStackable) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
        Type: ANIMAL_EFFECTS.includes(source.Type) ? source.Type : (ANIMAL_EFFECTS.includes(fallbackType) ? fallbackType : ""),
        Valeur: Number.isFinite(Number(source.Valeur)) ? Number(source.Valeur) : Number(fallbackValue) || 0,
        Tours: Math.max(1, Math.floor(Number(source.Tours ?? fallbackTurns) || 1)),
        Activation: ANIMAL_ACTIVATIONS.includes(source.Activation) ? source.Activation : (ANIMAL_ACTIVATIONS.includes(fallbackActivation) ? fallbackActivation : "Sur attaque"),
        Cooldown: Math.max(0, Math.floor(Number(source.Cooldown ?? fallbackCooldown) || 0)),
        Stackable: source.Stackable === true || (source.Stackable === undefined && fallbackStackable === true)
    };
}

function normalizeAnimalDefinition(animal) {
    const out = structuredClone(animal || {});
    const oldBuff = normalizeAnimalAbility(
        out.Buff,
        out.TypeBuff,
        out.ValeurBuff,
        out.Tours,
        out.TypeActivation,
        out.CooldownActivation,
        out.Stackable
    );
    const oldDebuff = normalizeAnimalAbility(
        out.Debuff,
        out.TypeDebuff,
        out.ValeurDebuff,
        out.Tours,
        out.TypeActivation,
        out.CooldownActivation,
        out.Stackable
    );

    out.Id = String(out.Id || animalSlug(out.Nom) || animalUuid()).trim();
    out.Nom = String(out.Nom || "").trim();
    out.Description = String(out.Description || "");
    out.Image = String(out.Image || "");
    out.Vie = Math.max(1, Number(out.Vie) || 1);
    out.Puissance = Math.max(0, Number(out.Puissance) || 0);
    out.Armure = Math.max(0, Number(out.Armure) || 0);
    out.MinRoulette = Math.max(0, Math.floor(Number(out.MinRoulette) || 0));
    out.MaxRoulette = Math.max(out.MinRoulette, Math.floor(Number(out.MaxRoulette) || out.MinRoulette));
    out.MaxEnergie = Math.max(0, Math.floor(Number(out.MaxEnergie) || 0));
    out.TypeEnergie = String(out.TypeEnergie || "");
    out.Rarete = ANIMAL_RARITIES.includes(out.Rarete) ? out.Rarete : "Commun";
    out.ChanceRencontre = Math.max(0, Number(out.ChanceRencontre ?? out.ChanceSelection) || 0);
    out.Maitre = String(out.Maitre || "");
    out.AugmentationMaitre = Number.isFinite(Number(out.AugmentationMaitre)) ? Number(out.AugmentationMaitre) : 0;
    out.NiveauInitial = Math.max(1, Math.floor(Number(out.NiveauInitial) || ANIMAL_DEFAULT_LEVEL));
    out.Progression = {
        Mode: out.Progression?.Mode === "multiplicative" ? "multiplicative" : "additive",
        ValeurParNiveau: Number.isFinite(Number(out.Progression?.ValeurParNiveau)) ? Number(out.Progression.ValeurParNiveau) : 0,
        MultiplicateurParNiveau: Math.max(0, Number(out.Progression?.MultiplicateurParNiveau) || 1)
    };

    out.Buff = oldBuff;
    out.Debuff = oldDebuff;

    /* Compatibilité avec les anciennes données plates. */
    out.TypeBuff = oldBuff.Type;
    out.ValeurBuff = oldBuff.Valeur;
    out.TypeDebuff = oldDebuff.Type;
    out.ValeurDebuff = oldDebuff.Valeur;
    out.Tours = Math.max(oldBuff.Tours, oldDebuff.Tours);
    out.TypeActivation = oldBuff.Activation;
    out.CooldownActivation = Math.max(oldBuff.Cooldown, oldDebuff.Cooldown);
    out.Stackable = oldBuff.Stackable || oldDebuff.Stackable;

    return out;
}

function normalizeAnimauxConfig(contenu) {
    if (!contenu || typeof contenu !== "object") return contenu;
    if (!Array.isArray(contenu.Animaux)) contenu.Animaux = [];
    contenu.Animaux = contenu.Animaux
        .filter(animal => animal && typeof animal === "object" && String(animal.Nom || "").trim())
        .map(normalizeAnimalDefinition);

    const seen = new Set();
    contenu.Animaux = contenu.Animaux.filter(animal => {
        let id = animal.Id || animalSlug(animal.Nom) || animalUuid();
        if (seen.has(id)) id += "-" + animalUuid().slice(-6);
        animal.Id = id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
    return contenu;
}

function getAnimalDefinition(idOrName) {
    const value = String(idOrName || "").trim();
    return (state.contenu?.Animaux || []).find(animal =>
        animal && (String(animal.Id || "") === value || String(animal.Nom || "") === value)
    ) || null;
}

function getAnimalImagePath(animalOrDefinition) {
    return typeof animalOrDefinition?.Image === "string" ? animalOrDefinition.Image.trim() : "";
}

function getAnimalAbility(definition, kind) {
    const ability = definition?.[kind === "buff" ? "Buff" : "Debuff"];
    return normalizeAnimalAbility(
        ability,
        kind === "buff" ? definition?.TypeBuff : definition?.TypeDebuff,
        kind === "buff" ? definition?.ValeurBuff : definition?.ValeurDebuff,
        definition?.Tours,
        definition?.TypeActivation,
        definition?.CooldownActivation,
        definition?.Stackable
    );
}

function getAnimalEffectiveValue(definition, instance, kind) {
    const ability = getAnimalAbility(definition, kind);
    const level = Math.max(1, Math.floor(Number(instance?.Niveau) || definition?.NiveauInitial || 1));
    const progression = definition?.Progression || {};
    let value = Number(ability.Valeur) || 0;

    if (progression.Mode === "multiplicative") {
        value *= Math.pow(Number(progression.MultiplicateurParNiveau) || 1, level - 1);
    } else {
        value += (Number(progression.ValeurParNiveau) || 0) * (level - 1);
    }

    const master = String(instance?.Maitre || definition?.Maitre || "");
    const heroId = String(state.hero?.Id || state.hero?.id || "");
    const heroName = String(state.hero?.Nom || "");
    const masterMatches = master && (master === heroId || master === heroName);

    if (masterMatches) value += Number(definition?.AugmentationMaitre) || 0;

    return Math.max(0, Math.round(value * 1000) / 1000);
}

function createCapturedAnimal(definition, level = null) {
    const animal = normalizeAnimalDefinition(definition);
    return {
        Id: animalUuid(),
        AnimalId: animal.Id,
        AnimalNom: animal.Nom,
        Niveau: Math.max(1, Math.floor(Number(level) || animal.NiveauInitial || 1)),
        XP: 0,
        Maitre: animal.Maitre || "",
    };
}

function ensureAnimalCollection() {
    if (!Array.isArray(globalState.animaux)) globalState.animaux = [];

    const normalized = [];
    const used = new Set();

    for (const raw of globalState.animaux) {
        if (!raw || !raw.Id || used.has(String(raw.Id))) continue;
        const definition = getAnimalDefinition(raw.AnimalId || raw.AnimalNom);
        if (!definition) continue;

        const instance = {
            Id: String(raw.Id),
            AnimalId: definition.Id,
            AnimalNom: definition.Nom,
            Niveau: Math.max(1, Math.floor(Number(raw.Niveau) || definition.NiveauInitial || 1)),
            XP: Math.max(0, Number(raw.XP) || 0),
            Maitre: String(raw.Maitre ?? definition.Maitre ?? "")
        };

        used.add(instance.Id);
        normalized.push(instance);

        if (normalized.length >= ANIMAL_MAX_TEAM_SIZE) break;
    }

    globalState.animaux = normalized;
    return normalized;
}

function getCapturedAnimals() {
    return ensureAnimalCollection();
}

function getCapturedAnimalDefinition(instance) {
    return getAnimalDefinition(instance?.AnimalId || instance?.AnimalNom);
}

function addCapturedAnimal(definitionOrId, level = 1) {
    const team = getCapturedAnimals();
    if (team.length >= ANIMAL_MAX_TEAM_SIZE) return null;

    const definition = getAnimalDefinition(definitionOrId);
    if (!definition) return null;

    const instance = createCapturedAnimal(definition, level);
    team.push(instance);
    updateSaveMemory();
    renderAnimalBattleSlots();
    return instance;
}

function buildAnimalEncounterTable() {
    const entries = (state.contenu?.Animaux || [])
        .map(normalizeAnimalDefinition)
        .filter(animal => Number(animal.ChanceRencontre) > 0);

    const total = entries.reduce((sum, animal) => sum + Math.max(0, Number(animal.ChanceRencontre) || 0), 0);
    if (total <= 0) return [];

    /* Les pourcentages sont normalisés : 10 % global déclenche un animal,
       puis cette table choisit l'animal même si sa somme n'est pas exactement 100. */
    return entries.map(animal => ({
        definition: animal,
        weight: Math.max(0, Number(animal.ChanceRencontre) || 0) / total
    }));
}

function selectAnimalForEncounter() {
    const table = buildAnimalEncounterTable();
    if (table.length === 0) return null;

    let roll = Math.random();
    for (const entry of table) {
        roll -= entry.weight;
        if (roll < 0) return entry.definition;
    }
    return table[table.length - 1].definition;
}

function rollAnimalEncounterAtBattleStart(options = {}) {
    if (!options.force && Math.random() >= ANIMAL_ENCOUNTER_CHANCE) return null;

    const definition = selectAnimalForEncounter();
    if (!definition) return null;

    const level = Math.max(1, Math.floor(Number(definition.NiveauInitial) || ANIMAL_DEFAULT_LEVEL));
    return createAnimalCombatant(definition, level);
}

function buildAnimalWheels(definition, level) {
    const growth = Math.max(0, level - 1);
    const min = Math.max(0, Math.floor(Number(definition.MinRoulette) || 0) + Math.floor(growth / 4));
    const max = Math.max(min, Math.floor(Number(definition.MaxRoulette) || min) + Math.floor(growth / 2));
    return [{ min, max }];
}

function createAnimalCombatant(definition, level = 1) {
    const animal = normalizeAnimalDefinition(definition);
    const lv = Math.max(1, Math.floor(Number(level) || 1));
    const scale = Math.pow(1.08, lv - 1);
    const wheels = buildAnimalWheels(animal, lv);

    return {
        id: "animal-" + animalUuid(),
        type: "animal",
        isAnimal: true,
        definitionId: animal.Id,
        animalDefinition: animal,
        name: animal.Nom,
        number: 1,
        level: lv,
        hp: Math.max(1, Math.floor(animal.Vie * scale)),
        maxHp: Math.max(1, Math.floor(animal.Vie * scale)),
        power: Math.max(0, Math.floor(animal.Puissance * scale)),
        armor: Math.max(0, Math.floor(animal.Armure * scale)),
        powerModifier: 0,
        armorModifier: 0,
        damageMultiplier: 1,
        statusEffects: [],
        items: { force: 0, bandage: 0, armor: 0, totem: 0 },
        energyType: animal.TypeEnergie || "Animal",
        energyTypes: animal.TypeEnergie ? [animal.TypeEnergie] : ["Animal"],
        energy: animal.MaxEnergie,
        maxEnergy: animal.MaxEnergie,
        wheels,
        minRoulette: wheels[0].min,
        maxRoulette: wheels[0].max,
        nombreRoulette: wheels.length,
        attacks: [],
        Vitesse: lv,
        Image: getAnimalImagePath(animal),
        rarete: animal.Rarete,
        animalStatuses: [],
        defeatHandled: false,
        isBoss: false,
        unavailable: false
    };
}

function createBattleAnimalTeam() {
    return getCapturedAnimals().map(instance => {
        const definition = getCapturedAnimalDefinition(instance);
        if (!definition) return null;
        return {
            ...structuredClone(instance),
            definition,
            cooldowns: { buff: 0, debuff: 0 }
        };
    }).filter(Boolean).slice(0, ANIMAL_MAX_TEAM_SIZE);
}

function getAnimalTargetFromContext(activation, context) {
    if (activation === "Sur dégâts subis" || activation === "Sur dégâts reçus") {
        return context?.source && typeof context.source === "object" ? context.source : null;
    }
    return context?.target && typeof context.target === "object" ? context.target : getSelectedMonster();
}

function animalActivationMatches(ability, activation) {
    return ability && ability.Type && ability.Activation === activation;
}

function removeAnimalAbilityEffects(instanceId, abilityKind, target) {
    if (!target) return;

    const effects = target === "player" ? state.playerStatusEffects : target.statusEffects;
    if (!Array.isArray(effects)) return;

    const filtered = [];
    for (const effect of effects) {
        if (effect.sourceAnimalId === instanceId && effect.sourceAnimalKind === abilityKind) {
            if (effect.kind === "power") state.playerPowerModifier -= target === "player" ? effect.value : 0;
            if (effect.kind === "armor") state.playerArmorModifier -= target === "player" ? effect.value : 0;
            if (target !== "player" && effect.kind === "power") target.powerModifier -= effect.value;
            if (target !== "player" && effect.kind === "armor") target.armorModifier -= effect.value;
            continue;
        }
        filtered.push(effect);
    }

    if (target === "player") state.playerStatusEffects = filtered;
    else target.statusEffects = filtered;

    if (typeof recomputeDamageMultiplier === "function") recomputeDamageMultiplier(target);
}

function applyAnimalAbility(instance, kind, target, activation, context) {
    const definition = instance?.definition;
    if (!definition || !target) return false;

    const ability = getAnimalAbility(definition, kind);
    if (!animalActivationMatches(ability, activation)) return false;

    const cooldown = Math.max(0, Math.floor(Number(instance.cooldowns?.[kind]) || 0));
    if (cooldown > 0) return false;

    const value = getAnimalEffectiveValue(definition, instance, kind);
    if (value <= 0) return false;

    const normalized = String(ability.Type).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const metadata = {
        sourceAnimalId: instance.Id,
        sourceAnimalKind: kind,
        sourceAnimalAbility: ability.Type
    };

    if (!ability.Stackable) removeAnimalAbilityEffects(instance.Id, kind, target);

    if (normalized === "brulure") {
        if (typeof addTimedEffect === "function") addTimedEffect(target, "burn", value, ability.Tours, metadata);
    } else if (normalized === "paralysie" || normalized === "sommeil" || normalized === "shocked") {
        if (typeof addTimedStatus === "function") {
            addTimedStatus(target, normalized, ability.Tours, { ...metadata, stackable: ability.Stackable });
        }
    } else if (normalized === "puissance") {
        if (typeof addTimedEffect === "function") addTimedEffect(target, kind === "buff" ? "power" : "power", kind === "buff" ? value : -value, ability.Tours, metadata);
    } else if (normalized === "armure") {
        if (typeof addTimedEffect === "function") addTimedEffect(target, "armor", kind === "buff" ? value : -value, ability.Tours, metadata);
    } else if (normalized === "energie" || normalized === "energy") {
        if (target === "player") state.playerEnergy = Math.min(state.playerMaxEnergy, state.playerEnergy + value);
        else target.energy = Math.min(target.maxEnergy || 0, (Number(target.energy) || 0) + value);
    } else if (normalized === "degats" || normalized === "damage") {
        if (typeof addTimedDamageMultiplier === "function") {
            const multiplier = Math.max(0, value);
            const effectiveMultiplier = kind === "buff" ? multiplier : multiplier;
            addTimedDamageMultiplier(target, effectiveMultiplier, ability.Tours, metadata, ability.Stackable);
        }
    } else {
        return false;
    }

    if (!instance.cooldowns) instance.cooldowns = { buff: 0, debuff: 0 };
    instance.cooldowns[kind] = Math.max(0, Math.floor(Number(ability.Cooldown) || 0));

    addLog(
        (target === "player" ? state.hero?.Nom : target?.name || "Cible") +
        " reçoit " + ability.Type + " (" + value + ", " + ability.Tours + " tour(s)).",
        "system"
    );
    return true;
}

function triggerAnimalEffects(activation, context = {}) {
    if (!Array.isArray(state.battleAnimals) || state.battleAnimals.length === 0) return;

    const triggered = new Set();
    for (const instance of state.battleAnimals) {
        if (!instance?.Id || triggered.has(instance.Id)) continue;
        triggered.add(instance.Id);

        const buffTarget = "player";
        const debuffTarget = getAnimalTargetFromContext(activation, context);

        applyAnimalAbility(instance, "buff", buffTarget, activation, context);
        if (debuffTarget) applyAnimalAbility(instance, "debuff", debuffTarget, activation, context);
    }

    updateBattleUI();
}

function tickAnimalCooldowns() {
    for (const instance of state.battleAnimals || []) {
        if (!instance.cooldowns) instance.cooldowns = { buff: 0, debuff: 0 };
        instance.cooldowns.buff = Math.max(0, Math.floor(Number(instance.cooldowns.buff) || 0) - 1);
        instance.cooldowns.debuff = Math.max(0, Math.floor(Number(instance.cooldowns.debuff) || 0) - 1);
    }
}

function getAnimalCaptureChance(item, target) {
    const value = Number(item?.CaptureChance ?? item?.Valeur);
    if (!Number.isFinite(value)) return 0;

    /* Formule centrale : la Valeur d'attrape est directement exprimée en
       pourcentage. Elle est plafonnée à 99 % afin qu'un item courant ne
       transforme pas une capture en réussite garantie. */
    return Math.max(0, Math.min(99, value));
}

function captureBattleAnimal(item) {
    if (state.animalCaptureInProgress) return { ok: false, reason: "Une capture est déjà en cours." };
    state.animalCaptureInProgress = true;

    try {
        const target = getSelectedMonster();
        if (!target || !target.isAnimal || target.type !== "animal") {
            return { ok: false, reason: "Aucun Animal n'est actuellement combattu." };
        }

        if (getCapturedAnimals().length >= ANIMAL_MAX_TEAM_SIZE) {
            return { ok: false, reason: "Les 6 emplacements d'animaux sont déjà occupés." };
        }

        const chance = getAnimalCaptureChance(item, target);
        const success = Math.random() * 100 < chance;

        if (!success) {
            addLog("La capture de " + target.name + " échoue.", "system");
            return { ok: true, captured: false, animal: target };
        }

        const definition = getAnimalDefinition(target.definitionId || target.animalDefinition?.Id);
        if (!definition) return { ok: false, reason: "Définition animale introuvable." };

        const instance = addCapturedAnimal(definition, target.level);
        if (!instance) return { ok: false, reason: "Impossible d'ajouter l'Animal à l'équipe." };

        target.hp = 0;
        target.unavailable = true;
        target.defeatHandled = true;
        state.animalCaptureCompleted = true;
        state.remainingMonsters = 0;

        addLog(target.name + " a été capturé !", "reward");
        renderAnimalBattleSlots();
        updateSaveMemory();

        return { ok: true, captured: true, animal: target, instance };
    } finally {
        state.animalCaptureInProgress = false;
    }
}

function canCaptureAnimalItem(item, context) {
    if (context !== "battle") return { ok: false, reason: "Attraper s'utilise uniquement en combat." };
    if (!item || item.Categorie !== "Attraper") return { ok: false, reason: "Cet objet n'est pas un Attraper." };
    const target = getSelectedMonster();
    if (!target || !target.isAnimal || target.type !== "animal") {
        return { ok: false, reason: "Cet item ne peut être utilisé que contre un Animal." };
    }
    if (getCapturedAnimals().length >= ANIMAL_MAX_TEAM_SIZE) {
        return { ok: false, reason: "Les 6 emplacements d'animaux sont déjà occupés." };
    }
    const chance = getAnimalCaptureChance(item, target);
    if (chance <= 0) {
        return { ok: false, reason: "La Valeur d'attrape doit être supérieure à 0 et inférieure à 100 %." };
    }
    return { ok: true };
}

function getAnimalDisplayValue(instance, kind) {
    const definition = instance?.definition || getCapturedAnimalDefinition(instance);
    return definition ? getAnimalEffectiveValue(definition, instance, kind) : 0;
}

function renderAnimalBattleSlots() {
    const container = document.getElementById("combat-log");
    if (!container) return;

    const animals = getCapturedAnimals().slice(0, ANIMAL_MAX_TEAM_SIZE);
    container.classList.add("animal-slots");
    container.setAttribute("aria-label", "Équipe d'animaux");
    container.innerHTML = "";

    for (let i = 0; i < ANIMAL_MAX_TEAM_SIZE; i++) {
        const instance = animals[i];
        const slot = document.createElement("article");
        slot.className = "animal-battle-slot" + (instance ? "" : " empty");

        if (instance) {
            const definition = getCapturedAnimalDefinition(instance) || {};
            const imagePath = getAnimalImagePath(definition);
            const image = imagePath
                ? '<img src="' + escapeHtml(imagePath) + '" alt="' + escapeHtml(definition.Nom || "Animal") + '">'
                : '<span class="animal-slot-placeholder">🐾</span>';

            slot.innerHTML =
                '<div class="animal-slot-image">' + image + '</div>' +
                '<div class="animal-slot-footer">' +
                '<strong>' + escapeHtml(definition.Nom || instance.AnimalNom || "Animal") + '</strong>' +
                '<span>Niv. ' + escapeHtml(String(instance.Niveau || 1)) + ' · ' + escapeHtml(definition.Rarete || "Commun") + '</span>' +
                '</div>';

            slot.addEventListener("click", () => {
                state.selectedAnimalId = instance.Id;
                openCreaturesMenu();
            });
        } else {
            slot.innerHTML =
                '<div class="animal-slot-image"><span class="animal-slot-placeholder">＋</span></div>' +
                '<div class="animal-slot-footer"><strong>Emplacement vide</strong><span>—</span></div>';
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
    modal.innerHTML =
        '<div class="save-menu-content creatures-menu-content">' +
        '<div class="save-menu-header"><div><span class="eyebrow">COLLECTION</span><h2>Créatures</h2><p>Animaux capturés — équipe maximale de 6.</p></div><button id="creatures-close" class="close-button" type="button">×</button></div>' +
        '<div class="creatures-layout"><div id="creatures-list" class="creatures-list"></div><aside id="creatures-details" class="creatures-details"></aside></div>' +
        '<div class="save-menu-footer"><button id="creatures-close-footer" class="secondary-button" type="button">Fermer</button></div>' +
        '</div>';

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

    const animals = getCapturedAnimals();
    list.innerHTML = "";

    if (animals.length === 0) {
        list.innerHTML = '<p class="dev-info-note">Aucun animal capturé.</p>';
        details.innerHTML = '<p class="dev-info-note">Capture un Animal pour le retrouver ici.</p>';
        return;
    }

    const selectedId = state.selectedAnimalId || animals[0].Id;
    if (!animals.some(animal => animal.Id === selectedId)) state.selectedAnimalId = animals[0].Id;

    animals.forEach(instance => {
        const definition = getCapturedAnimalDefinition(instance);
        if (!definition) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "creature-card" + (instance.Id === state.selectedAnimalId ? " selected" : "");
        button.innerHTML =
            (getAnimalImagePath(definition)
                ? '<img src="' + escapeHtml(getAnimalImagePath(definition)) + '" alt="">'
                : '<span class="creature-placeholder">🐾</span>') +
            '<span class="creature-card-text"><strong>' + escapeHtml(definition.Nom) + '</strong>' +
            '<small>' + escapeHtml(definition.Rarete) + ' · Niveau ' + escapeHtml(String(instance.Niveau)) + '</small></span>';

        button.addEventListener("click", () => {
            state.selectedAnimalId = instance.Id;
            renderCreaturesMenu();
        });

        list.appendChild(button);
    });

    const selected = animals.find(instance => instance.Id === state.selectedAnimalId) || animals[0];
    const definition = getCapturedAnimalDefinition(selected);
    if (!definition) return;

    const buff = getAnimalAbility(definition, "buff");
    const debuff = getAnimalAbility(definition, "debuff");

    details.innerHTML =
        '<div class="creature-detail-head">' +
        (getAnimalImagePath(definition) ? '<img src="' + escapeHtml(getAnimalImagePath(definition)) + '" alt="">' : '<span class="creature-placeholder large">🐾</span>') +
        '<div><h3>' + escapeHtml(definition.Nom) + '</h3><p>' + escapeHtml(definition.Rarete) + ' · Niveau ' + escapeHtml(String(selected.Niveau)) + '</p></div></div>' +
        '<p class="creature-description">' + escapeHtml(definition.Description || "Aucune description.") + '</p>' +
        '<div class="creature-stat-grid">' +
        '<span>Énergie</span><strong>' + escapeHtml(definition.TypeEnergie || "—") + '</strong>' +
        '<span>Vie</span><strong>' + escapeHtml(String(definition.Vie)) + '</strong>' +
        '<span>Puissance</span><strong>' + escapeHtml(String(definition.Puissance)) + '</strong>' +
        '<span>Armure</span><strong>' + escapeHtml(String(definition.Armure)) + '</strong>' +
        '<span>Min roulette</span><strong>' + escapeHtml(String(definition.MinRoulette)) + '</strong>' +
        '<span>Max roulette</span><strong>' + escapeHtml(String(definition.MaxRoulette)) + '</strong>' +
        '<span>Maître</span><strong>' + escapeHtml(definition.Maitre || "Aucun") + '</strong>' +
        '<span>Bonus maître</span><strong>' + escapeHtml(String(definition.AugmentationMaitre || 0)) + '</strong>' +
        '</div>' +
        '<div class="creature-ability"><h4>Buff</h4><p>' + escapeHtml(buff.Type || "Aucun") + ' · Valeur effective ' + escapeHtml(String(getAnimalEffectiveValue(definition, selected, "buff"))) + ' · ' + escapeHtml(String(buff.Tours)) + ' tour(s)</p><p>Activation : ' + escapeHtml(buff.Activation) + ' · Cooldown : ' + escapeHtml(String(buff.Cooldown)) + ' · Stackable : ' + (buff.Stackable ? "Oui" : "Non") + '</p></div>' +
        '<div class="creature-ability"><h4>Debuff</h4><p>' + escapeHtml(debuff.Type || "Aucun") + ' · Valeur effective ' + escapeHtml(String(getAnimalEffectiveValue(definition, selected, "debuff"))) + ' · ' + escapeHtml(String(debuff.Tours)) + ' tour(s)</p><p>Activation : ' + escapeHtml(debuff.Activation) + ' · Cooldown : ' + escapeHtml(String(debuff.Cooldown)) + ' · Stackable : ' + (debuff.Stackable ? "Oui" : "Non") + '</p></div>';
}

function gainAnimalXp(amount) {
    const value = Math.max(0, Number(amount) || 0);
    if (value <= 0) return;

    for (const instance of getCapturedAnimals()) {
        instance.XP += value;
        while (instance.XP >= animalXpRequired(instance.Niveau)) {
            instance.XP -= animalXpRequired(instance.Niveau);
            instance.Niveau++;
        }
    }

    updateSaveMemory();
    renderAnimalBattleSlots();
}

function animalXpRequired(level) {
    return Math.max(10, Math.floor(40 * Math.pow(Math.max(1, level), 1.15)));
}

function handleAnimalDefeat(target) {
    if (!target || !target.isAnimal || target.defeatHandled) return false;
    target.defeatHandled = true;
    target.hp = 0;
    state.remainingMonsters = 0;
    addLog(target.name + " est vaincu.", "system");
    return true;
}
