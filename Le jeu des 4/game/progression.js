"use strict";

/* ============================================================
   game/progression.js — Progression : XP, niveaux, animation
   de victoire XP, récompenses XP des monstres
   (ex-game.js : bloc XP + computeTotalXpFromProgress de la
   fin du fichier)
   Note : rollEnemyLevel est dans enemy.js (génération ennemie).
============================================================ */

const XP_FILL_STEP_MS = 30;

const XP_FILL_MAX_STEPS = 50;

const XP_FULL_BAR_HOLD_MS = 450;

const XP_LEVEL_UP_PAUSE_MS = 700;

let xpAnimationInProgress = !1;

function xpRequiredForLevel(level) {
    const lv = Math.max(1, Math.floor(Number(level) || 1));

    return Math.round(25 * Math.pow(lv, 1.15));
}

function monsterXpReward(monster) {
    if (!monster) return 0;

    const level = Math.max(1, Math.floor(Number(monster.level) || 1));

    const base = 10 + level * 5;

    let reward = Math.round(monster.isBoss ? base * 2 : base);

    const rarete = normalizeEffectType(monster.rarete);

    if (rarete.startsWith("commun")) reward = Math.round(reward * 0.5);
    else if (rarete.startsWith("legend")) reward = Math.round(reward * 2);

    return reward;
}

function applyLevelUp(newLevel) {
    if (!state.hero) return;

    const oldMaxHp = state.playerMaxHp;

    state.playerMaxHp = Math.max(1, Math.round(state.playerMaxHp * 1.08));

    state.playerHp = Math.min(state.playerMaxHp, state.playerHp + (state.playerMaxHp - oldMaxHp));

    state.playerPowerBase = Math.round(state.playerPowerBase * 1.08 * 100) / 100;

    state.playerArmorBase = Math.round(state.playerArmorBase * 1.08);

    const oldMaxEnergy = state.playerMaxEnergy;

    state.playerMaxEnergy = Math.max(1, Math.round(state.playerMaxEnergy * 1.06));

    state.playerEnergy = Math.min(state.playerMaxEnergy, state.playerEnergy + (state.playerMaxEnergy - oldMaxEnergy));

    if (newLevel % 2 === 0) state.playerMaxRoulette++;

    if (newLevel % 4 === 0) state.playerMinRoulette = Math.min(state.playerMinRoulette + 1, state.playerMaxRoulette);

    if (newLevel % 5 === 0) state.playerNombreRoulette++;
}

function gainXp(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (!Number.isFinite(globalState.playerLevel) || globalState.playerLevel < 1) globalState.playerLevel = 1;

    if (!Number.isFinite(globalState.playerXp)) globalState.playerXp = 0;

    if (!Number.isFinite(globalState.playerXpToNext) || globalState.playerXpToNext < 1) {
        globalState.playerXpToNext = xpRequiredForLevel(globalState.playerLevel);
    }

    globalState.playerXp += Math.round(amount);

    globalState.playerXpTotal = Math.max(0, Number(globalState.playerXpTotal) || 0) + Math.round(amount);

    let leveledUp = !1;

    while (globalState.playerXp >= globalState.playerXpToNext) {
        globalState.playerXp -= globalState.playerXpToNext;

        globalState.playerLevel++;

        globalState.playerXpToNext = xpRequiredForLevel(globalState.playerLevel);

        applyLevelUp(globalState.playerLevel);

        leveledUp = !0;
    }

    if (leveledUp) {
        addLog(`🎉 ${state.hero ? state.hero.Nom : "Le héros"} monte au niveau ${globalState.playerLevel} !`, "reward");

        showToast("Niveau supérieur !", `Niveau ${globalState.playerLevel} atteint !`);
    }

    if (typeof updateBattleUI === "function") updateBattleUI();

    if (typeof updateWorldUI === "function") updateWorldUI();
}

async function animateVictoryXp() {
    const total = Math.max(0, Math.round(state.pendingXp || 0));

    state.pendingXp = 0;

    if (total <= 0) return;

    globalState.playerXpTotal = Math.max(0, Number(globalState.playerXpTotal) || 0) + total;

    addLog(`+${total} XP !`, "reward");

    xpAnimationInProgress = !0;

    try {
        if (!Number.isFinite(globalState.playerLevel) || globalState.playerLevel < 1) globalState.playerLevel = 1;

        if (!Number.isFinite(globalState.playerXp) || globalState.playerXp < 0) globalState.playerXp = 0;

        if (!Number.isFinite(globalState.playerXpToNext) || globalState.playerXpToNext < 1) {
            globalState.playerXpToNext = xpRequiredForLevel(globalState.playerLevel);
        }

        let remaining = total;

        while (remaining > 0) {
            const needed = globalState.playerXpToNext - globalState.playerXp;

            if (remaining < needed) {
                await animateXpFillTo(globalState.playerXp + remaining);

                remaining = 0;
            } else {
                await animateXpFillTo(globalState.playerXpToNext);

                globalState.playerXp = globalState.playerXpToNext;

                refreshProgressionUI();

                await sleep(XP_FULL_BAR_HOLD_MS);

                remaining -= needed;

                globalState.playerXp = 0;

                globalState.playerLevel++;

                globalState.playerXpToNext = xpRequiredForLevel(globalState.playerLevel);

                applyLevelUp(globalState.playerLevel);

                refreshProgressionUI();

                addLog(`🎉 Niveau ${globalState.playerLevel} atteint ! Les stats de base augmentent.`, "reward");

                showToast("Niveau supérieur !", `Niveau ${globalState.playerLevel} !`);

                await sleep(XP_LEVEL_UP_PAUSE_MS);
            }
        }

        refreshProgressionUI();
    } finally {
        xpAnimationInProgress = !1;
    }
}

async function animateXpFillTo(targetXp) {
    const distance = targetXp - globalState.playerXp;

    if (distance <= 0) return;

    const step = Math.max(1, Math.ceil(distance / XP_FILL_MAX_STEPS));

    while (globalState.playerXp < targetXp) {
        globalState.playerXp = Math.min(targetXp, globalState.playerXp + step);

        refreshProgressionUI();

        await sleep(XP_FILL_STEP_MS);
    }
}

function refreshProgressionUI() {
    const level = Math.max(1, globalState.playerLevel || 1);

    const xp = Math.max(0, globalState.playerXp || 0);

    const next = Math.max(1, globalState.playerXpToNext || xpRequiredForLevel(level));

    const levelElement = document.getElementById("player-level");

    if (levelElement) levelElement.textContent = String(level);

    const xpElement = document.getElementById("player-xp");

    if (xpElement) xpElement.textContent = String(xp);

    const nextElement = document.getElementById("player-xp-next");

    if (nextElement) nextElement.textContent = String(next);

    const fillElement = document.getElementById("player-xp-fill");

    if (fillElement) fillElement.style.width = Math.min(100, (xp / next) * 100).toFixed(1) + "%";

    const levelBadge = document.getElementById("player-level-badge");

    if (levelBadge) levelBadge.textContent = "Niv. " + String(level);
}

/* ============================================================
   XP TOTALE (reconstruction pour les vieilles sauvegardes)
   (ex-fin de game.js, juste avant le bloc évolution)
============================================================ */

function computeTotalXpFromProgress(level, xp) {
    const niveau = Math.max(1, Math.floor(Number(level) || 1));

    let total = 0;

    for (let l = 1; l < niveau; l++) {
        total += xpRequiredForLevel(l);
    }

    return total + Math.max(0, Math.floor(Number(xp) || 0));
}