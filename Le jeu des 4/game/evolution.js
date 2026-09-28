"use strict";

/* ============================================================
   game/evolution.js — Évolution des personnages
   (ex-game.js : configuration, prompt, application)
   Seuils par défaut définis dans creator-core.js
   (CREATOR_DEFAULT_EVOLUTION_EXP / CREATOR_EVOLUTION_STEP_EXP).
============================================================ */

function getEvolutionConfig(hero) {
    if (!hero || !hero.Evolution || typeof hero.Evolution !== "object") return null;

    const lvl = Number(hero.Evolution.NiveauRequis);

    return {
        Cible: String(hero.Evolution.Cible || "").trim(),
        NiveauRequis: Number.isFinite(lvl) && lvl > 0 ? Math.round(lvl) : CREATOR_DEFAULT_EVOLUTION_LEVEL
    }
}

function getEvolutionTarget(config) {
    if (!config || !config.Cible) return null;

    return (state.contenu?.Personnages || []).find(personnage => personnage.Nom === config.Cible) || null;
}

async function maybePromptEvolution() {
    if (!state.hero || !globalState.adventureStarted) return;

    const config = getEvolutionConfig(state.hero);

    if (!config || !config.Cible) return;

    if (globalState.playerLevel < config.NiveauRequis) return;

    const target = getEvolutionTarget(config);

    if (!target) {
        addLog(`Évolution configurée pour ${state.hero.Nom} vers « ${config.Cible} », mais ce personnage est introuvable.`, "system");

        return;
    }

    if (target.Nom === state.hero.Nom) return;

    const reponse = confirm(`Est-ce que tu veux évoluer ${state.hero.Nom} ?`);

    if (!reponse) {
        addLog(`${state.hero.Nom} refuse d'évoluer pour l'instant.`, "system");

        return;
    }

    applyEvolution(target);
}

function applyEvolution(target) {
    const ancienNom = state.hero ? state.hero.Nom : "";

    const level = Math.max(1, Math.floor(globalState.playerLevel || 1));

    state.hero = target;

    state.selectedHero = target;

    state.heroEnergyData = (state.contenu?.Energies || []).find(energie => energie.Nom === target.TypeEnergie) || null;

    state.heroAttacks = (state.contenu?.Attaques || []).filter(attaque => attaque.Personnage === target.Nom);

    state.playerMaxHp = Math.max(1, Math.floor(Number(target.Vie) || 100));

    state.playerPowerBase = Number(target.PuissanceBase) || 1;

    state.playerArmorBase = Math.max(0, Math.floor(Number(target.Armure) || 0));

    state.playerMaxEnergy = Math.max(1, Math.floor(Number(target.MaxEnergie) || 100));

    state.playerMinRoulette = Math.max(0, Math.floor(Number(target.MinRoulette) || 0));

    let maxRoulette = Math.floor(Number(target.MaxRoulette) || 0);

    if (maxRoulette < state.playerMinRoulette) maxRoulette = state.playerMinRoulette;

    state.playerMaxRoulette = maxRoulette;

    state.playerNombreRoulette = Math.max(1, Math.floor(Number(target.NombreRoulette) || 1));

    state.playerPowerModifier = 0;

    state.playerArmorModifier = 0;

    state.playerStatusEffects = [];

    for (let niveau = 2; niveau <= level; niveau++) {
        applyLevelUp(niveau);
    }

    state.playerHp = state.playerMaxHp;

    state.playerEnergy = state.playerMaxEnergy;

    globalState.evolutionDeclinedThreshold = null;

    globalState.evolutionDeclinedLevel = null;

    addLog(`✨ Évolution ! ${ancienNom} devient ${target.Nom} (niveau ${level}).`, "reward");

    showToast("Évolution !", `${ancienNom} a évolué en ${target.Nom} !`);

    if (typeof setOverworldPlayerSprite === "function") {
        setOverworldPlayerSprite(state.hero);
    }

    updatePlayerImage();

    updateBattleUI();

    if (typeof updateWorldUI === "function") {
        updateWorldUI();
    }
}