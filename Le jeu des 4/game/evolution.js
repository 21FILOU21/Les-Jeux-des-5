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

/* ============================================================
   MÉGA-ÉVOLUTION — action d'item en combat
============================================================ */

function getMegaEvolutionConfig(hero = state.hero) {
    if (!hero || !hero.MegaEvolution || typeof hero.MegaEvolution !== "object") return null;

    const cible = String(hero.MegaEvolution.Cible || "").trim();
    const stoneId = String(hero.MegaEvolution.StoneId || "").trim();

    if (!cible || !stoneId) return null;

    return { Cible: cible, StoneId: stoneId };
}

function canMegaEvolve(stone) {
    if (!stone) return { ok: !1, reason: "Cette Méga Stone est introuvable." };

    if (state.megaEvolutionUsed) {
        return { ok: !1, reason: "Ce personnage a déjà méga-évolué dans ce combat." };
    }

    if (!state.hero) {
        return { ok: !1, reason: "Aucun personnage actif." };
    }

    const config = getMegaEvolutionConfig(state.hero);

    if (!config) {
        return { ok: !1, reason: "Cette Méga Stone ne peut pas être utilisée avec ce personnage." };
    }

    if (String(config.StoneId) !== String(stone.Id)) {
        return { ok: !1, reason: "Cette Méga Stone n'est pas compatible avec ce personnage." };
    }

    const target = (state.contenu?.Personnages || []).find(personnage => personnage && personnage.Nom === config.Cible);

    if (!target) {
        return { ok: !1, reason: "La forme Méga configurée est introuvable." };
    }

    if (target.Nom === state.hero.Nom) {
        return { ok: !1, reason: "La forme Méga doit être différente du personnage actuel." };
    }

    return { ok: !0, target, config };
}

async function activateMegaEvolution(stone) {
    const validation = canMegaEvolve(stone);

    if (!validation.ok) {
        showToast("Méga-Évolution impossible", validation.reason);

        return validation;
    }

    const ancienNom = state.hero.Nom;
    const target = validation.target;

    state.busy = !0;
    state.megaEvolutionUsed = !0;
    state.megaEvolutionBaseHeroId = ancienNom;

    try {
        if (typeof showBattlePopup === "function") {
            await showBattlePopup(`${ancienNom} commence à méga-évoluer !`);
        }

        const panel = document.getElementById("player-panel");

        if (panel && typeof playCombatAnimation === "function") {
            playCombatAnimation(panel, "mega-evolving", 900);
        }

        await sleep(500);

        const oldHp = Math.max(0, Number(state.playerHp) || 0);
        const oldEnergy = Math.max(0, Number(state.playerEnergy) || 0);

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

        // La forme Méga doit conserver les bonus déjà gagnés grâce au niveau.
        // On part des stats natives de la forme cible, puis on réapplique
        // exactement les mêmes bonus de niveau que lors d'une évolution normale.
        for (let niveau = 2; niveau <= Math.max(1, Math.floor(globalState.playerLevel || 1)); niveau++) {
            applyLevelUp(niveau);
        }

        state.playerHp = Math.min(state.playerMaxHp, oldHp);
        state.playerEnergy = Math.min(state.playerMaxEnergy, oldEnergy);

        if (typeof setOverworldPlayerSprite === "function") setOverworldPlayerSprite(state.hero);

        if (typeof updatePlayerImage === "function") updatePlayerImage();
        if (typeof updateBattleUI === "function") updateBattleUI();

        addLog(`✨ ${ancienNom} devient ${target.Nom} !`, "reward");
        showToast("Méga-Évolution !", `${ancienNom} devient ${target.Nom}.`);

        if (typeof showBattlePopup === "function") {
            await showBattlePopup(`${target.Nom} a méga-évolué !`);
        }

        return { ok: !0, target };
    } catch (error) {
        state.megaEvolutionUsed = !1;
        state.megaEvolutionBaseHeroId = null;

        console.error("Méga-Évolution impossible :", error);

        showToast("Méga-Évolution impossible", "La transformation n'a pas pu être terminée.");

        return { ok: !1, reason: "La transformation n'a pas pu être terminée." };
    }
}

function restoreMegaEvolution() {
    const baseName = String(state.megaEvolutionBaseHeroId || "").trim();

    if (!baseName) {
        state.megaEvolutionUsed = !1;
        return;
    }

    const base = (state.contenu?.Personnages || []).find(personnage => personnage && personnage.Nom === baseName);

    if (!base) {
        console.warn(`Forme normale introuvable après Méga-Évolution : ${baseName}`);
        state.megaEvolutionUsed = !1;
        state.megaEvolutionBaseHeroId = null;
        return;
    }

    const oldHp = Math.max(0, Number(state.playerHp) || 0);
    const oldEnergy = Math.max(0, Number(state.playerEnergy) || 0);

    state.hero = base;
    state.selectedHero = base;
    state.heroEnergyData = (state.contenu?.Energies || []).find(energie => energie.Nom === base.TypeEnergie) || null;
    state.heroAttacks = (state.contenu?.Attaques || []).filter(attaque => attaque.Personnage === base.Nom);

    state.playerMaxHp = Math.max(1, Math.floor(Number(base.Vie) || 100));
    state.playerPowerBase = Number(base.PuissanceBase) || 1;
    state.playerArmorBase = Math.max(0, Math.floor(Number(base.Armure) || 0));
    state.playerMaxEnergy = Math.max(1, Math.floor(Number(base.MaxEnergie) || 100));
    state.playerMinRoulette = Math.max(0, Math.floor(Number(base.MinRoulette) || 0));

    let maxRoulette = Math.floor(Number(base.MaxRoulette) || 0);
    if (maxRoulette < state.playerMinRoulette) maxRoulette = state.playerMinRoulette;
    state.playerMaxRoulette = maxRoulette;
    state.playerNombreRoulette = Math.max(1, Math.floor(Number(base.NombreRoulette) || 1));

    state.playerHp = Math.min(state.playerMaxHp, oldHp);
    state.playerEnergy = Math.min(state.playerMaxEnergy, oldEnergy);

    state.megaEvolutionUsed = !1;
    state.megaEvolutionBaseHeroId = null;

    if (typeof setOverworldPlayerSprite === "function") setOverworldPlayerSprite(base);
}