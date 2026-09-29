"use strict";

/* ============================================================
   game/core.js — État global, écrans, normalisation du contenu
   (ex-game.js : tête du fichier + helpers d'écrans)
============================================================ */

let gameSpeed = 1;

const globalState = {
    adventureStarted: !1,
    monsterKilled: 0,
    playerHp: 0,
    playerMaxHp: 0,
    playerEnergy: 0,
    playerMaxEnergy: 0,
    coins: 0,
    itemPotionForce: 0,
    itemBandage: 0,
    itemTotem: 0,
    itemArmor: 0,
    playerLevel: 1,
    playerXp: 0,
    playerXpToNext: 40,
    playerXpTotal: 0,
    evolutionDeclinedThreshold: null,
    evolutionDeclinedLevel: null,
};

const state = {
    contenu: null,
    config: {
        playerName: "",
        monsterName: "Monstre",
        monsterCount: 1,
        skipAnimation: !1
    },
    selectedHero: null,
    hero: null,
    heroEnergyData: null,
    heroAttacks: [],
    playerArmorBase: 0,
    playerMinRoulette: 0,
    playerMaxRoulette: 0,
    playerNombreRoulette: 0,
    playerPowerBase: 0,
    playerPowerModifier: 0,
    playerArmorModifier: 0,
    playerStatusEffects: [],
    pendingXp: 0,
    monsterHp: 0,
    monsterMaxHp: 0,
    monsterMinRoulette: MONSTER_BASE_MIN_ROULETTE,
    monsterMaxRoulette: MONSTER_BASE_MAX_ROULETTE,
    monsterNombreRoulette: MONSTER_BASE_NOMBRE_ROULETTE,
    monsterArmorRandom: 1,
    monsterPowerRandom: 1,
    monsters: [],
    selectedMonsterId: null,
    currentMonsterNumber: 1,
    remainingMonsters: 1,
    turn: "player",
    battleOver: !1,
    busy: !1,
    escapeAttempts: 0,
    inventory: {},
    megaEvolutionUsed: !1,
    megaEvolutionBaseHeroId: null,
};

function normalizeContenu(contenu) {
    if (!contenu || typeof contenu !== "object") return contenu;

    if (!Array.isArray(contenu.Personnages)) contenu.Personnages = [];

    if (!Array.isArray(contenu.Attaques)) contenu.Attaques = [];

    if (!Array.isArray(contenu.Effets)) contenu.Effets = [];

    if (!Array.isArray(contenu.Energies)) contenu.Energies = [];

    if (!Array.isArray(contenu.Statuts)) contenu.Statuts = [];

    contenu.Energies.forEach(energy => {
        if (!("Faiblesse" in energy)) energy.Faiblesse = null;

        if (!("Avantage" in energy)) energy.Avantage = null;
    });

    return contenu;
}

const $ = (selector) => document.querySelector(selector);

const screens = {
    loading: $("#loading-screen"),
    setup: $("#setup-screen"),
    character: $("#character-screen"),
    world: $("#world-screen"),
    battle: $("#battle-screen"),
    end: $("#end-screen"),
};

function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        screen.classList.remove("active");
    });

    screens[screenName].classList.add("active");
}

function setLoadingText(text) {
    $("#loading-text").textContent = text;
}