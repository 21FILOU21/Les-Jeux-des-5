"use strict";

/* ============================================================
   game/types.js — Système de types d'énergie / efficacité
   (ex-game.js : getTypeMultiplier + helpers de types)
   Réutilise le système existant Faiblesse/Avantage (×0,8 / ×1,5).
   Note : getMonsterEnergyTypes / rollEnemyEnergyTypes restent
   dans enemy.js (fonctions ennemies).
============================================================ */

function getTypeMultiplier(attackerType, defenderTypes) {
    if (!attackerType) return 1.0;

    const types = Array.isArray(defenderTypes) ? defenderTypes : [
        defenderTypes
    ];

    if (types.length === 0) return 1.0;

    const attackerEnergy = (state.contenu?.Energies || []).find(energy => energy.Nom === attackerType);

    if (!attackerEnergy) return 1.0;

    let combined = 1.0;

    const seen = new Set();

    for (const type of types) {
        if (!type || seen.has(type)) continue;

        seen.add(type);

        if (type === attackerEnergy.Avantage) combined *= 1.5;
        else if (type === attackerEnergy.Faiblesse) combined *= 0.8;
    }

    return combined;
}

function getAttackEnergyTypes(attaque) {
    if (!attaque) return [state.hero?.TypeEnergie].filter(Boolean);

    const types = [attaque.TypeEnergie, attaque.TypeEnergie2].map(t => String(t || "").trim()).filter(Boolean);

    const unique = [... new Set(types)];

    if (unique.length === 0 && state.hero && state.hero.TypeEnergie) return [
        state.hero.TypeEnergie
    ];

    return unique;
}

function getHeroEnergyTypes(hero = state.hero) {
    if (!hero) return [];

    const types = [hero.TypeEnergie, hero.TypeEnergie2].map(type => String(type || "").trim()).filter(Boolean);

    return [... new Set(types)];
}

function pickBestAttackEnergyType(types, target) {
    if (!Array.isArray(types) || types.length === 0) return null;

    if (types.length === 1) return types[0];

    let best = types[0];

    let bestMult = getTypeMultiplier(best, getMonsterEnergyTypes(target));

    for (let i = 1; i < types.length; i++) {
        const mult = getTypeMultiplier(types[i], getMonsterEnergyTypes(target));

        if (mult > bestMult) {
            best = types[i];

            bestMult = mult;
        }
    }

    return best;
}

function getEffectivenessMessage(multiplier) {
    if (multiplier >= 1.5) return "C'est super efficace !";

    if (multiplier > 1.0 && multiplier < 1.5) return "C'est efficace!";

    if (multiplier < 0.9 && multiplier > 0) return "Ce n'est pas très efficace...";

    return null;
}

function getEffectivenessClass(multiplier) {
    if (multiplier >= 1.5) return "super";

    if (multiplier < 0.9) return "low";

    return "mid";
}