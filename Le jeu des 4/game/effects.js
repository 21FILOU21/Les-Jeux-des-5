"use strict";

/* ============================================================
   game/effects.js — Moteur de résolution des effets
   (ex-game.js : critiques, application dégâts/soins/énergie,
   effets temporisés, effets personnalisés)
   Moteur partagé : traite le joueur ET les monstres.
   Les getters de stats (getPlayerPower, getMonsterPower…)
   sont dans player.js / enemy.js.
============================================================ */

/* ============================================================
   COUPS CRITIQUES
============================================================ */

function rollCriticalHit() {
    return Math.random() < CRITICAL_HIT_CHANCE;
}

function showCriticalBanner(target) {
    const panel = getMonsterPanel(target);

    if (!panel) return;

    const art = panel.querySelector(".fighter-art");

    if (!art) return;

    const banner = document.createElement("span");

    banner.className = "critical-banner";

    banner.textContent = "CRITIQUE !";

    art.appendChild(banner);

    setTimeout(() => banner.remove(), 900);
}

/* ============================================================
   APPLICATION DES DÉGÂTS
============================================================ */

function damageMonster(damage, target) {
    const wasAlive = target.hp > 0;

    if (wasAlive && typeof triggerAnimalEffects === "function") triggerAnimalEffects("Sur dégâts subis", { attackerIsEnemy: false, target });

    const finalDamage = Math.max(0, damage);

    target.hp = Math.max(0, target.hp - finalDamage);

    addLog(`${target.name} #${target.number} reçoit ${finalDamage} dégâts.`, "damage");

    fireVfxFor(vfxAttachedTo(state._currentAttack));

    animateHit(getMonsterPanel(target));

    updateBattleUI();
}

function damagePlayer(damage) {
    if (typeof triggerAnimalEffects === "function") triggerAnimalEffects("Sur dégâts subis", { attackerIsEnemy: true, target: "player" });
    const finalDamage = Math.max(0, damage - getPlayerArmor());

    state.playerHp = Math.max(0, state.playerHp - finalDamage);

    showPlayerDamage(finalDamage);

    addLog(`${state.hero.Nom} reçoit ${finalDamage} dégâts.`, "damage");

    fireVfxFor(vfxAttachedTo(state._currentAttack));
}

/* ============================================================
   HELPERS DE TYPES / CIBLES / VALEURS
============================================================ */

function normalizeEffectType(type) {
    return String(type || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toLowerCase();
}

function getEffectTargets(effect, selectedMonster, fromEnemy = !1) {
    const target = normalizeEffectType(effect.Cible);

    if (target.includes("joueur") || target.includes("player") || target.includes("hero") || target.includes("soi") || target.includes("allie")) {
        return fromEnemy ? (selectedMonster ? [selectedMonster] : []) : ["player"];
    }

    if (target.includes("tous") || target.includes("all")) {
        return fromEnemy ? ["player"] : getLivingMonsters();
    }

    return fromEnemy ? ["player"] : (selectedMonster ? [selectedMonster] : []);
}

function getEffectValue(effect) {
    const value = Number(effect.Valeur);

    return Number.isFinite(value) ? value : 1;
}

/* ============================================================
   DISPATCHER PRINCIPAL
============================================================ */

function applyAttackEffects(effects, selectedMonster, roulettePower, typeMultiplier, critical = !1, attackEnergyType = null, fromEnemy = !1, carrier = null) {
    effects.forEach(effect => {
        const type = normalizeEffectType(effect.Type);

        const value = getEffectValue(effect);

        const attackerPower = fromEnemy ? getMonsterPower(selectedMonster) : getPlayerPower();

        const vfxNames = vfxAttachedTo(carrier);

        state._vfxCarrier = carrier;

        state._currentAttack = null;

        getEffectTargets(effect, selectedMonster, fromEnemy).forEach(target => {
            if (type === "degats" || type === "damage") {
                const typeMult = attackEnergyType ? (target === "player" ? (fromEnemy ? getTypeMultiplier(attackEnergyType, getHeroEnergyTypes()) : 1) : getTypeMultiplier(attackEnergyType, getMonsterEnergyTypes(target))) : (typeMultiplier || 1);

                let baseDamage = roulettePower * attackerPower * typeMult * value;

                if (critical) baseDamage *= CRITICAL_HIT_MULTIPLIER;

                const rawDamage = roundAwayFromZero(baseDamage);

                if (target === "player") {
                    let incoming = rawDamage;

                    if (fromEnemy) incoming -= incoming * 0.1 * state.itemArmor;

                    damagePlayer(roundAwayFromZero(Math.max(0, incoming)));

                    if (vfxNames.length > 0) fireVfxFor(vfxNames, "onDamageTaken", { side: "player", target: null });
                } else {
                    let damage = rawDamage - clamp(rawDamage * 0.05 * getMonsterArmor(target), 0, 75);

                    const armorItems = (target.items && Number(target.items.armor)) || 0;

                    if (armorItems > 0) {
                        damage -= damage * 0.1 * armorItems;
                    }

                    const finalDamage = roundAwayFromZero(Math.max(0, damage));

                    damageMonster(finalDamage, target);

                    if (vfxNames.length > 0) fireVfxFor(vfxNames, "onDamageTaken", { side: "enemy", target });

                    showDamage(Math.max(0, finalDamage), target);

                    if (critical) showCriticalBanner(target);
                }

                return;
            }

            if (type === "soin" || type === "heal") {
                if (vfxNames.length > 0) fireVfxFor(vfxNames, target === "player" ? "onHealSelf" : "onHealTarget", { side: fromEnemy ? "enemy" : "player", target });
                healEffectTarget(target, roundAwayFromZero(roulettePower * value));

                return;
            }

            if (type === "brulure" || type === "burn") {
                addTimedEffect(target, "burn", value, effect.Tours);

                return;
            }

            if (type === "buffdepuissance" || type === "powerbuff" || type === "buffpuissance") {
                addTimedEffect(target, "power", Math.abs(value), effect.Tours);

                return;
            }

            if (type === "debuffdepuissance" || type === "powerdebuff" || type === "debuffpuissance") {
                addTimedEffect(target, "power", - Math.abs(value), effect.Tours);

                return;
            }

            if (type === "augmenterlarmure" || type === "armorup" || type === "buffarmure" || type === "augmenterarmure") {
                addTimedEffect(target, "armor", Math.abs(value), effect.Tours);

                return;
            }

            if (type === "reduirelarmure" || type === "armordown" || type === "debuffarmure" || type === "reduirearmure") {
                addTimedEffect(target, "armor", - Math.abs(value), effect.Tours);

                return;
            }

            if (type === "rechargerlenergie" || type === "rechargeenergy" || type === "energie" || type === "rechargeenergie") {
                rechargeEffectTarget(target, roundAwayFromZero(roulettePower * value));

                return;
            }

            if (type === "effetpersonnalise" || type === "custom" || type === "personnalise") {
                applyCustomEffect(effect, target, roulettePower, typeMultiplier, attackEnergyType, fromEnemy, fromEnemy ? selectedMonster : null);
            }
        });
    });

    updateBattleUI();
}

/* ============================================================
   SOIN / ÉNERGIE
============================================================ */

function healEffectTarget(target, amount) {
    if (target === "player") {
        const oldHp = state.playerHp;

        state.playerHp = Math.min(state.playerMaxHp, state.playerHp + amount);

        const healed = state.playerHp - oldHp;

        if (healed > 0) {
            showHealing(healed);

            addLog(`${state.hero.Nom} récupère ${healed} PV.`, "heal");
        }

        return;
    }

    const oldHp = target.hp;

    target.hp = Math.min(target.maxHp, target.hp + amount);

    const healed = target.hp - oldHp;

    if (healed > 0) {
        showMonsterHealing(healed, target);

        addLog(`${target.name} #${target.number} récupère ${healed} PV.`, "heal");
    }
}

function rechargeEffectTarget(target, amount) {
    if (target !== "player") return;

    const oldEnergy = state.playerEnergy;

    state.playerEnergy = Math.min(state.playerMaxEnergy, state.playerEnergy + amount);

    const gained = state.playerEnergy - oldEnergy;

    if (gained > 0) addLog(`${state.hero.Nom} récupère ${gained} énergie.`, "heal");
}

/* ============================================================
   EFFETS TEMPORISÉS (brûlure, buffs, debuffs)
============================================================ */

function addTimedEffect(target, kind, value, turns) {
    const duration = Math.max(1, Number.parseInt(turns, 10) || 1);

    const effects = target === "player" ? state.playerStatusEffects : target.statusEffects;

    const remainingTurns = target !== "player" && kind === "power" ? duration + 1 : duration;

    fireVfxFor(vfxAttachedTo(state._vfxCarrier || null), "onStatut", { side: target === "player" ? "player" : "enemy", target });

    effects.push({ kind, value, remainingTurns });

    if (kind === "power") {
        target === "player" ? state.playerPowerModifier += value : target.powerModifier += value;
    } else if (kind === "armor") {
        target === "player" ? state.playerArmorModifier += value : target.armorModifier += value;
    }

    const name = target === "player" ? state.hero.Nom : `${target.name} #${target.number}`;

    const kindLabels = {
        burn: "Brûlure",
        power: value >= 0 ? "Buff de puissance" : "Debuff de puissance",
        armor: value >= 0 ? "Buff d'armure" : "Debuff d'armure"
    };

    addLog(`${name} : ${kindLabels[kind] || kind} (${duration} tour(s)).`, "system");
}

async function processTimedEffects(target) {
    const effects = target === "player" ? state.playerStatusEffects : target.statusEffects;

    const targetName = target === "player" ? state.hero.Nom : `${target.name} #${target.number}`;

    for (const effect of effects) {
        if (effect.kind === "burn") {
            const damage = Math.max(0, roundAwayFromZero(effect.value));

            if (target === "player") {
                state.playerHp = Math.max(0, state.playerHp - damage);

                showPlayerDamage(damage);
            } else {
                damageMonster(damage, target);
            }

            addLog(`${targetName} subit ${damage} dégâts de brûlure.`, "damage");
        }

        if (effect.kind === "rollburn") {
            const roulettePower = await rollRoulette(state.playerMinRoulette, state.playerMaxRoulette, isRouletteAnimationSkipped(), "Brûlure");

            let baseDamage = roulettePower * getPlayerPower() * effect.value;

            const damage = Math.max(0, roundAwayFromZero(baseDamage));

            if (target === "player") {
                state.playerHp = Math.max(0, state.playerHp - damage);

                showPlayerDamage(damage);
            } else {
                damageMonster(damage, target);
            }

            addLog(`${targetName} subit ${damage} dégâts de brûlure.`, "damage");
        }

        effect.remainingTurns--;
    }

    const expired = effects.filter(effect => effect.remainingTurns <= 0);

    expired.forEach(effect => {
        if (effect.kind === "power") {
            target === "player" ? state.playerPowerModifier -= effect.value : target.powerModifier -= effect.value;
        } else if (effect.kind === "armor") {
            target === "player" ? state.playerArmorModifier -= effect.value : target.armorModifier -= effect.value;
        }
    });

    const active = effects.filter(effect => effect.remainingTurns > 0);

    if (target === "player") state.playerStatusEffects = active;
    else target.statusEffects = active;

    if (target !== "player") await handleMonsterDeath(target);

    if (target === "player" && state.playerHp <= 0) endGame(!1);

    updateBattleUI();
}

/* ============================================================
   EFFETS PERSONNALISÉS (délégation, profondeur max 3)
============================================================ */

function applyCustomEffect(effect, target, roulettePower, typeMultiplier, attackEnergyType = null, fromEnemy = !1, attackerMonster = null) {
    const depth = Number(effect._customDepth) || 0;

    if (depth >= 3) {
        addLog(`${effect.Nom || "Effet personnalisé"} imbriqué trop profondément : arrêt.`, "system");

        return;
    }

    const delegatedType = effect.EffetPersonnalise || effect.CustomEffect || effect.Action;

    if (!delegatedType) {
        addLog(`${effect.Nom || "Effet personnalisé"} n'a pas de comportement défini.`, "system");

        return;
    }

    if (normalizeEffectType(delegatedType) === normalizeEffectType(effect.Type)) {
        addLog(`${effect.Nom || "Effet personnalisé"} ne peut pas renvoyer vers lui-même.`, "system");

        return;
    }

    applyAttackEffects([
        { ...effect, Type: delegatedType, _customDepth: depth + 1 }
    ], fromEnemy ? attackerMonster : (target === "player" ? getSelectedMonster() : target), roulettePower, typeMultiplier, !1, attackEnergyType, fromEnemy);
}