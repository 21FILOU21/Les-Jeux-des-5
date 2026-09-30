"use strict";

/* ============================================================
   game/enemy.js — TOUTES les fonctions ennemies
   (ex-game.js : types d'énergie, images/badges, stats, roulettes,
   butin/objets, génération, sélection, pool d'attaques,
   IA (tour/attaque/soin/objet), mort, animations ennemies)
   Stats joueur (getPlayerPower…) : player.js.
   Pool créateur (rollCreatorMonsterAttacks…) : creator-monstre.js.
============================================================ */

/* ============================================================
   TYPES D'ÉNERGIE (ENNEMIS)
============================================================ */

const DUAL_TYPE_ENEMY_CHANCE = 0.35;

function getMonsterEnergyTypes(monster) {
    if (!monster) return [];

    if (Array.isArray(monster.energyTypes) && monster.energyTypes.length > 0) {
        return [
            ... new Set(monster.energyTypes.filter(Boolean))
        ];
    }

    return monster.energyType ? [monster.energyType] : [];
}

function rollEnemyEnergyTypes() {
    const energies = (state.contenu?.Energies || []).map(e => e.Nom).filter(Boolean);

    if (energies.length === 0) return ["Ennemi"];

    const first = energies[randomInt(0, energies.length - 1)];

    const types = [first];

    if (energies.length >= 2 && Math.random() < DUAL_TYPE_ENEMY_CHANCE) {
        const others = energies.filter(e => e !== first);

        types.push(others[randomInt(0, others.length - 1)]);
    }

    return types;
}

function getRarityTable() {
    const playerLevel = Math.max(1, Math.floor(globalState.playerLevel || 1));

    /* Sous le niveau 5 : table FIXE — 60 % commun, 35 % rare, 5 % légendaire,
       indépendamment des kills (vraiment 5 %). */
    if (playerLevel < 5) {
        return { commun: 60, rare: 35, legendaire: 5 };
    }

    /* Niveau 5+ : la progression par kills s'applique. */
    const kills = Math.max(0, Math.floor(Number(globalState.monsterKilled) || 0));

    const shift = Math.floor(kills / 5);

    let commun = 60 - shift;

    let rare = 35 + shift;

    let legendaire = 5;

    if (rare > 50) {
        legendaire += rare - 50;

        rare = 50;
    }

    if (commun < 0) {
        legendaire += -commun;

        commun = 0;
    }

    if (legendaire > 100) legendaire = 100;

    return { commun, rare, legendaire };
}

function rollEnemyRarity() {
    const table = getRarityTable();

    const roll = Math.random() * 100;

    if (roll < table.legendaire) return "Légendaire";

    if (roll < table.legendaire + table.rare) return "Rare";

    return "Commun";
}

/* ============================================================
   IMAGES / BADGES DES MONSTRES
============================================================ */

const monsterImageFailures = new Set();

function getMonsterImagePath(monster) {
    if (monster && typeof monster.Image === "string" && monster.Image.trim() !== "") return monster.Image;

    return `assets/monstres/${monster.name}.png`;
}

function ensureMonsterLevelBadge(panel, monster) {
    let badge = panel.querySelector(".monster-level-badge");

    if (!badge) {
        badge = document.createElement("span");

        badge.className = "monster-level-badge";

        panel.insertBefore(badge, panel.firstChild);
    }

    badge.textContent = `Niv. ${monster.level || "?"}${monster.isBoss ? " · BOSS" : ""}`;
}

function ensureMonsterImage(panel, monster) {
    if (monsterImageFailures.has(monster.name)) return;

    const art = panel.querySelector(".fighter-art");

    if (!art) return;

    let img = art.querySelector("img.fighter-image");

    if (!img) {
        img = document.createElement("img");

        img.className = "fighter-image";

        img.alt = monster.name;

        art.insertBefore(img, art.firstChild);
    }

    if (img.dataset.monsterName === monster.name) return;

    img.dataset.monsterName = monster.name;

    img.onerror = () => {
        monsterImageFailures.add(monster.name);

        img.style.display = "none";

        console.warn(`Image du monstre introuvable : ${getMonsterImagePath(monster)}`);
    };

    img.onload = () => {
        img.style.display = "";
    };

    img.src = getMonsterImagePath(monster);
}

function renderMonsterEnergyBadges(panel, monster) {
    const types = getMonsterEnergyTypes(monster);

    panel.querySelectorAll(".monster-energy-badges, .energy-type").forEach(element => {
        element.remove();
    });

    if (types.length === 0) return;

    const container = document.createElement("div");

    container.className = "monster-energy-badges";

    types.forEach(type => {
        const badge = document.createElement("span");

        badge.className = "energy-type monster-type monster-energy-type";

        badge.textContent = type;

        container.appendChild(badge);
    });

    const top = panel.querySelector(".fighter-top");

    if (top) {
        top.appendChild(container);
    } else {
        panel.insertBefore(container, panel.firstChild);
    }
}

function decorateMonsterPanels() {
    if (!Array.isArray(state.monsters)) return;

    state.monsters.forEach(monster => {
        const panel = getMonsterPanel(monster);

        if (!panel) return;

        ensureMonsterLevelBadge(panel, monster);

        renderMonsterEnergyBadges(panel, monster);

        ensureMonsterImage(panel, monster);
    });
}

/* ============================================================
   STATS (GETTERS ENNEMIS)
============================================================ */

function rollEnemyLevel() {
    const playerLevel = Math.max(1, Math.floor(globalState.playerLevel || 1));

    let minOffset = -3;

    let maxOffset = 3;

    if (playerLevel >= 29) {
        minOffset = 0;

        maxOffset = 15;
    } else if (playerLevel >= 24) {
        minOffset = -1;

        maxOffset = 8;
    } else if (playerLevel >= 8) {
        minOffset = -3;

        maxOffset = 5;
    }

    const min = Math.max(1, playerLevel + minOffset);

    const max = playerLevel + maxOffset;

    return randomInt(min, max);
}

function getMonsterPower(monster) {
    return Math.max(0, monster.power + monster.powerModifier + ((monster.items && Number(monster.items.force)) || 0) * 0.5);
}

function getMonsterArmor(monster) {
    return Math.max(0, monster.armor + monster.armorModifier);
}

function getMonsterSpeed(monster) {
    if (!monster) return 0;

    const vitesse = Number(monster.Vitesse);

    if (Number.isFinite(vitesse) && vitesse > 0) return Math.floor(vitesse);

    return Math.max(1, Math.floor(Number(monster.level) || 1));
}

/* ============================================================
   ROULETTES ENNEMIES (PAR NIVEAU)
============================================================ */

const MONSTER_WHEEL_STEP = { min: 1, max: 2 };

function buildMonsterWheels(level) {
    const lv = Math.max(1, Math.floor(Number(level) || 1));

    const growth = lv - 1;

    const wheelCount = 1 + Math.floor(growth / 5);

    const rangeBonus = Math.floor(growth / 2);

    const minBonus = Math.floor(growth / 4);

    return Array.from({ length: wheelCount }, (_, i) => {
        const min = Math.max(0, 1 + minBonus + i * MONSTER_WHEEL_STEP.min);

        const max = 6 + rangeBonus + i * MONSTER_WHEEL_STEP.max;

        return min <= max ? { min, max } : { min: Math.max(0, max), max: min }
    });
}

function getMonsterWheels(monster) {
    if (Array.isArray(monster.wheels) && monster.wheels.length > 0) {
        return monster.wheels.map(w => {
            const min = Math.max(0, Math.floor(Number(w?.min ?? 0)));

            let max = Math.floor(Number(w?.max ?? 0));

            if (max < min) max = min;

            return { min, max }
        });
    }

    const count = Math.max(1, Math.floor(Number(monster?.nombreRoulette) || 1));

    const min = Math.max(0, Math.floor(Number(monster?.minRoulette ?? 1)));

    const max = Math.max(min, Math.floor(Number(monster?.maxRoulette ?? 10)));

    return Array.from({ length: count }, () => ({ min, max }));
}

/* ============================================================
   BUTIN & OBJETS (INVENTAIRE PASSIF DES MONSTRES)
============================================================ */

const MONSTER_LOOT_CHANCE = 0.35;

const MONSTER_LOOT_BOSS_CHANCE = 1.0;

const MONSTER_LOOT_TABLE = [
    { id: "bandage", label: "Bandage", weight: 40 },
    { id: "force", label: "Potion de Force", weight: 25 },
    { id: "armor", label: "Armure", weight: 20 },
    { id: "totem", label: "Totem", weight: 15 }
];

function rollMonsterLoot() {
    const total = MONSTER_LOOT_TABLE.reduce((sum, entry) => sum + entry.weight, 0);

    let roll = Math.random() * total;

    for (const entry of MONSTER_LOOT_TABLE) {
        roll -= entry.weight;

        if (roll <= 0) return entry;
    }

    return MONSTER_LOOT_TABLE[0];
}

function grantMonsterLoot(monster) {
    const chance = monster.isBoss ? MONSTER_LOOT_BOSS_CHANCE : MONSTER_LOOT_CHANCE;

    if (Math.random() >= chance) return;

    const loot = rollMonsterLoot();

    switch (loot.id) {
        case "bandage":
            state.itemBandage++;

            break;
        case "force":
            state.itemPotionForce++;

            break;
        case "armor":
            state.itemArmor++;

            break;
        case "totem":
            state.itemTotem++;

            break;
    }

    addLog(`Butin obtenu : ${loot.label} !`, "reward");
}

function rollMonsterItems(level) {
    const items = { force: 0, bandage: 0, armor: 0, totem: 0 };

    const lv = Math.max(1, Math.floor(Number(level) || 1));

    const count = Math.min(8, 1 + Math.floor(lv / 4));

    for (let i = 0; i < count; i++) {
        const loot = rollMonsterLoot();

        if (loot.id === "bandage") items.bandage++;
        else if (loot.id === "force") items.force++;
        else if (loot.id === "armor") items.armor++;
        else if (loot.id === "totem") items.totem++;
    }

    return items;
}

/* ============================================================
   GÉNÉRATION DES MONSTRES
============================================================ */

function createNextMonster() {
    const monsterNumber = state.currentMonsterNumber;

    const isBoss = ((monsterNumber - 1) % 5 === 0 && monsterNumber >= 5);

    if (isBoss) {
        const multiplier = Math.floor(monsterNumber / 5);

        state.monsterMaxHp = MONSTER_BASE_HP * 3 * multiplier;

        state.monsterHp = state.monsterMaxHp;

        const powerIncrease = roundToEven((monsterNumber - 1) / 15);

        state.monsterPowerRandom = randomInt(3 + powerIncrease, 6 + powerIncrease);

        const armorIncrease = roundToEven((monsterNumber - 1) / 50);

        state.monsterArmorRandom = randomInt(3 + armorIncrease, 6 + armorIncrease);

        addLog(`⚠ BOSS #${monsterNumber} !`, "reward");
    } else {
        state.monsterMaxHp = roundToEven(1.5 * monsterNumber + MONSTER_BASE_HP);

        state.monsterHp = state.monsterMaxHp;

        state.monsterPowerRandom = randomInt(1, 3);

        state.monsterArmorRandom = randomInt(1, 3);
    }

    if (MONSTER_BASE_MIN_ROULETTE - state.monsterPowerRandom < 0) {
        state.monsterMinRoulette = 0;
    } else {
        state.monsterMinRoulette = MONSTER_BASE_MIN_ROULETTE - state.monsterPowerRandom;
    }

    state.monsterMaxRoulette = MONSTER_BASE_MAX_ROULETTE - state.monsterPowerRandom;

    state.monsterNombreRoulette = MONSTER_BASE_NOMBRE_ROULETTE;
}

function createBattleMonsters(count, encounterRequest = null) {
    return Array.from({ length: count }, (_, index) => createMonster(globalState.monsterKilled + index + 1, index, encounterRequest));
}

function getRandomEnemyEnergyType() {
    const energies = state.contenu?.Energies || [];

    if (energies.length === 0) return "Ennemi";

    return energies[randomInt(0, energies.length - 1)].Nom;
}

function generateMonsterStats(baseMonster) {
    const level = Math.max(1, Math.floor(Number(baseMonster.level) || 1));

    const isBoss = baseMonster.isBoss;

    const scaling = Math.pow(1.08, level - 1);

    return {
        ...baseMonster,
        level,
        hp: Math.max(1, Math.floor(baseMonster.hp * scaling)),
        maxHp: Math.max(1, Math.floor(baseMonster.maxHp * scaling)),
        power: Math.max(1, Math.floor(baseMonster.power * scaling)),
        armor: Math.max(1, Math.floor(baseMonster.armor * scaling)),
        isBoss
    }
}

function buildVarietyWheels(variety, level = 1) {
    const lv = Math.max(1, Math.floor(Number(level) || 1));

    const growth = lv - 1;

    const count = Math.max(1, Math.floor(Number(variety?.NombreRoulette) || 1)) + Math.floor(growth / 5);

    const min = Math.max(0, Math.floor(Number(variety?.MinRoulette) || 0)) + Math.floor(growth / 4);

    let max = Math.floor(Number(variety?.MaxRoulette) || 0) + Math.floor(growth / 2);

    if (max < min) max = min;

    return Array.from({ length: count }, () => ({ min, max }));
}

const MONSTER_VARIETIES = [];

function createMonster(number, index, encounterRequest = null) {
    const monsterNumber = Math.max(1, Math.floor(Number(number) || 1));
    const exactDefinition = encounterRequest?.monsterDefinition || null;
    const level = exactDefinition
        ? Math.max(1, Math.floor(Number(encounterRequest.level) || 1))
        : rollEnemyLevel();

    const enemyPool = (state.config.enemyPool === "personnages") ? "personnages" : "monstres";

    let variety = exactDefinition;

    if (!variety && enemyPool === "personnages") {
        const personnages = (state.contenu?.Personnages || []).filter(p => p && p.Nom);
        if (personnages.length > 0) variety = personnages[randomInt(0, personnages.length - 1)];
    } else if (!variety && MONSTER_VARIETIES.length > 0) {
        variety = MONSTER_VARIETIES[randomInt(0, MONSTER_VARIETIES.length - 1)];
    }

    const isPersonnageEnemy = enemyPool === "personnages" && variety !== null;
    const bossMultiplier = Math.max(1, Math.floor(monsterNumber / 5));
    const rawBossChance = Math.floor(globalState.monsterKilled / 5);
    const bossChance = isPersonnageEnemy ? Math.floor(rawBossChance / 2) : rawBossChance;
    const isBoss = exactDefinition ? Boolean(exactDefinition.isBoss) : Math.random() * 100 < bossChance;

    const baseHp = variety ? Math.max(1, Math.floor(Number(variety.Vie) || MONSTER_BASE_HP)) * (isBoss ? 3 * bossMultiplier : 1) : (isBoss ? MONSTER_BASE_HP * 3 * bossMultiplier : roundToEven(1.5 * number + MONSTER_BASE_HP));

    const basePower = variety ? Math.max(1, Math.floor(Number(variety.PuissanceBase) || 1)) : (isBoss ? randomInt(3 + roundToEven((number - 1) / 15), 6 + roundToEven((number - 1) / 15)) : randomInt(1, 3));

    const baseArmor = variety ? Math.max(0, Math.floor(Number(variety.Armure) || 0)) : (isBoss ? randomInt(3 + roundToEven((number - 1) / 50), 6 + roundToEven((number - 1) / 50)) : randomInt(1, 3));

    const energyTypes = variety ? [variety.TypeEnergie, variety.TypeEnergie2].map(t => String(t || "").trim()).filter(Boolean) : rollEnemyEnergyTypes();

    const rarete = variety ? (variety.Rarete || null) : rollEnemyRarity();

    if (energyTypes.length === 0) energyTypes.push("Ennemi");

    const wheels = variety ? buildVarietyWheels(variety, level) : buildMonsterWheels(level);

    const attacks = variety && Array.isArray(variety.Attaques) ? variety.Attaques.slice() : rollCreatorMonsterAttacks(energyTypes).attaques;

    const items = rollMonsterItems(level);

    const monster = generateMonsterStats({
        id: `monster-${number}-${index}`,
        number,
        name: variety ? variety.Nom : state.config.monsterName,
        energyType: energyTypes[0],
        energyTypes,
        hp: baseHp,
        maxHp: baseHp,
        power: basePower,
        armor: baseArmor,
        level,
        wheels,
        minRoulette: wheels[0].min,
        maxRoulette: wheels[0].max,
        nombreRoulette: wheels.length,
        isBoss,
        powerModifier: 0,
        armorModifier: 0,
        statusEffects: [],
        deathAnimationPlayed: !1,
        defeatHandled: !1,
        attacks,
        items,
        Vitesse: variety ? Math.max(0, Math.floor(Number(variety.Vitesse) || 0)) : 0,
        Image: variety ? (variety.Image || (enemyPool === "personnages" ? `assets/personnages/${variety.Nom}.png` : "")) : "",
        rarete,
    });

    return monster;
}

/* ============================================================
   SÉLECTION & PANNEAUX
============================================================ */

function getLivingMonsters() {
    return state.monsters.filter(monster => monster.hp > 0);
}

function getSelectedMonster() {
    return state.monsters.find(monster => monster.id === state.selectedMonsterId && monster.hp > 0) || getLivingMonsters()[
        0
    ] || null;
}

function getMonsterPanel(monster) {
    return document.querySelector(`[data-monster-id="${monster.id}"]`);
}

/* ============================================================
   POOL D'ATTAQUES (SÉLECTION À L'EXÉCUTION)
============================================================ */

function pickMonsterAttackName(monster) {
    const list = Array.isArray(monster.attacks) ? monster.attacks : [];

    if (list.length === 0) return null;

    return list[randomInt(0, list.length - 1)];
}

function getMonsterAttackData(attackName) {
    if (!attackName) return null;

    return (state.contenu?.Attaques || []).find(attaque => attaque && attaque.Nom === attackName) || null;
}

/* ============================================================
   IA — TOUR DU MONSTRE
============================================================ */

async function monsterTurn() {
    if (state.battleOver || state.playerHp <= 0) {
        return;
    }

    state.turn = "monster";

    state.busy = !0;

    updateBattleUI();

    updateActionButtons();

    await sleep(400);

    for (const monster of getLivingMonsters()) {
        if (state.battleOver || state.playerHp <= 0) break;

        await processTimedEffects(monster);

        if (state.battleOver || monster.hp <= 0 || state.playerHp <= 0) continue;

        const hpPercent = calculateHealthPercentage(monster.hp, monster.maxHp);

        const action = (hpPercent >= 20 && hpPercent < 50) ? "heal" : "attack";

        if (action === "heal") {
            await monsterHeal(monster);
        } else {
            await monsterAttack(monster);
        }
    }

    if (state.battleOver) {
        return;
    }

    state.busy = !1;

    state.turn = "player";

    await beginPlayerTurn();
}

async function monsterAttack(monster) {
    const attackName = pickMonsterAttackName(monster);

    const attackData = getMonsterAttackData(attackName);

    if (attackName) {
        addLog(`${monster.name} #${monster.number} utilise ${attackName}.`, "system");
    } else {
        addLog(`${monster.name} #${monster.number} attaque.`, "system");
    }

    fireVfxFor(vfxAttachedTo(attackData), "onAttack", { side: "enemy" });

    let attackTypes = attackData ? getAttackEnergyTypes(attackData) : [];

    if (attackTypes.length === 0 && monster.energyType) attackTypes = [
        monster.energyType
    ];

    const heroTypes = getHeroEnergyTypes();

    let bestType = null;

    let effectivenessMultiplier = attackTypes.length === 0 ? 1 : 0;

    attackTypes.forEach(type => {
        const mult = getTypeMultiplier(type, heroTypes);

        if (mult > effectivenessMultiplier) {
            bestType = type;

            effectivenessMultiplier = mult;
        }
    });

    const attackEnergyType = bestType;

    const effectivenessText = getEffectivenessMessage(effectivenessMultiplier);

    const effectivenessClass = getEffectivenessClass(effectivenessMultiplier);

    await showBattlePopup(attackName ? `${monster.name} #${monster.number} utilise ${attackName} !` : `${monster.name} #${monster.number} attaque !`, effectivenessText, effectivenessClass);

    const effects = (attackData && Array.isArray(attackData.Effets)) ? attackData.Effets : [];

    const damageEffects = effects.filter(effect => normalizeEffectType(effect.Type) === "degats");

    const otherEffects = effects.filter(effect => normalizeEffectType(effect.Type) !== "degats");

    let otherEffectsApplied = !1;

    const wheels = getMonsterWheels(monster);

    state._currentAttack = attackData;

    for (let i = 0; i < wheels.length; i++) {
        if (state.battleOver) {
            return;
        }

        const puissance = await rollRoulette(wheels[i].min, wheels[i].max, isRouletteAnimationSkipped(), "Monstre");

        if (!otherEffectsApplied && otherEffects.length > 0) {
            otherEffectsApplied = !0;

            applyAttackEffects(otherEffects, monster, puissance, 1, !1, attackEnergyType, !0, attackData);
        }

        await animateMonsterAttack(monster);

        if (damageEffects.length > 0) {
            applyAttackEffects(damageEffects, monster, puissance, 1, !1, attackEnergyType, !0, attackData);
        } else {
            const baseDamage = puissance * getMonsterPower(monster) * (effectivenessMultiplier || 1);
            const rawDamage = roundAwayFromZero(baseDamage);
            let incoming = rawDamage;

            incoming -= incoming * 0.1 * state.itemArmor;

            const finalDamage = roundAwayFromZero(Math.max(0, incoming));

            damagePlayer(finalDamage);
        }

        animateHit($("#player-panel"));

        updateBattleUI();

        if (state.playerHp <= 0) {
            if (state.itemTotem > 0) {
                state.itemTotem--;

                const healAmount = Math.floor(state.playerMaxHp * 0.5);

                state.playerHp = healAmount;

                addLog(`🌟 L'attaque est fatale, mais le Totem se brise et ressuscite ${state.hero.Nom} !`, "reward");

                showHealing(healAmount);

                const playerPanel = document.getElementById("player-panel");

                playCombatAnimation(playerPanel, "heal-number", 600);

                updateBattleUI();

                await sleep(500);
            } else {
                endGame(!1);

                return;
            }
        }

        await sleep(150);
    }
}

async function monsterHeal(monster) {
    addLog(`${monster.name} #${monster.number} tente de se soigner.`, "system");

    const wheels = getMonsterWheels(monster);

    for (let i = 0; i < wheels.length; i++) {
        if (monster.hp >= monster.maxHp) {
            break;
        }

        const puissance = await rollRoulette(wheels[i].min, wheels[i].max, isRouletteAnimationSkipped(), "Soin monstre");

        const bandages = (monster.items && Number(monster.items.bandage)) || 0;

        const bonus = roundAwayFromZero(puissance * bandages * 0.2);

        const oldHp = monster.hp;

        monster.hp = Math.min(monster.maxHp, monster.hp + puissance + bonus);

        const actualHeal = monster.hp - oldHp;

        if (actualHeal > 0) {
            addLog(`${monster.name} #${monster.number} récupère ${actualHeal} PV.`, "heal");
        }

        updateBattleUI();

        await sleep(120);
    }
}

/* ============================================================
   MORT DU MONSTRE (RÉCOMPENSES + CHAÎNE DE DÉCÈS)
============================================================ */

async function handleMonsterDeath(monster) {
    if (!monster || monster.hp > 0 || monster.defeatHandled) return !1;

    const totems = (monster.items && Number(monster.items.totem)) || 0;

    if (totems > 0) {
        monster.items.totem = totems - 1;

        monster.hp = Math.max(1, Math.floor(monster.maxHp * 0.5));

        addLog(`🌟 ${monster.name} #${monster.number} tombe, mais son Totem se brise et le ressuscite !`, "reward");

        fireVfxFor(vfxAttachedTo(state._vfxCarrier || null), "onResurrect", { side: "enemy", target: monster });

        showMonsterHealing(monster.hp, monster);

        updateBattleUI();

        return !1;
    }

    monster.defeatHandled = !0;

    fireVfxFor(vfxAttachedTo(state._vfxCarrier || null), "onKill", { side: "player", target: monster });

    await animateMonsterDeath(monster);

    await monsterKilled(monster);

    return !0;
}

async function monsterKilled(target) {
    const wasAlive = target.hp > 0;

    const wasBoss = target.isBoss;

    grantMonsterLoot(target);

    const xpGain = monsterXpReward(target);

    state.pendingXp = (state.pendingXp || 0) + xpGain;

    addLog(`+${xpGain} XP gagnés.`, "reward");

    globalState.monsterKilled++;

    state.remainingMonsters = getLivingMonsters().length;

    state.currentMonsterNumber = globalState.monsterKilled + 1;

    updateBattleUI();

    if (state.remainingMonsters <= 0) {
        await sleep(500);

        state.battleOver = !0;

        await animateVictoryXp();

        await maybePromptEvolution();

        await sleep(400);

        startOverworldMode();

        return;
    }

    await handleMonsterDeath(target);

    state.selectedMonsterId = getLivingMonsters()[0].id;

    updateBattleUI();

    return wasAlive && target.hp <= 0;
}

/* ============================================================
   ANIMATIONS ENNEMIES
============================================================ */

async function animateMonsterAttack(monster) {
    const monsterPanel = getMonsterPanel(monster);

    const playerPanel = document.getElementById("player-panel");

    playCombatAnimation(monsterPanel, "monster-attacking", 450);

    await sleep(250);

    playCombatAnimation(playerPanel, "player-hit", 400);

    showImpact(document.querySelector(".player-art"));

    shakeBattleScreen();

    await sleep(200);
}

async function animateMonsterDeath(monster) {
    if (!monster || monster.deathAnimationPlayed) return;

    monster.deathAnimationPlayed = !0;

    const panel = getMonsterPanel(monster);

    if (panel) {
        panel.classList.add("monster-dying");

        await sleep(800);
    }
}