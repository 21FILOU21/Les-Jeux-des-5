"use strict";

/* ============================================================
   game/player.js — TOUTES les fonctions joueur
   (ex-game.js : stats joueur, tour du joueur, sélection
   d'attaque, exécution d'attaque, soin, recharge, fuite
   (S'enfuir + formules Pokémon), animation d'attaque)
   Stats ennemies (getMonsterPower…) : enemy.js.
   Moteur d'effets : effects.js.
============================================================ */

/* ============================================================
   STATS (GETTERS JOUEUR)
============================================================ */

function getPlayerPower() {
    return state.playerPowerBase + state.playerPowerModifier + (state.itemPotionForce * 0.5);
}

function getPlayerArmor() {
    return Math.max(0, state.playerArmorBase + state.playerArmorModifier);
}

function getPlayerSpeed() {
    const vitesse = Number(state.hero && state.hero.Vitesse);

    return Number.isFinite(vitesse) && vitesse > 0 ? Math.floor(vitesse) : 0;
}

/* ============================================================
   DÉBUT DU TOUR JOUEUR (EFFETS TEMPORISÉS + RÉGÉN)
============================================================ */

async function beginPlayerTurn() {
    vfxStopLoops();
    if (state.battleOver) {
        return;
    }

    state.turn = "player";

    await processTimedEffects("player");

    if (state.battleOver || state.playerHp <= 0) return;

    let autoRegen = 0;

    getHeroEnergyTypes().forEach(energieNom => {
        const energieData = (state.contenu?.Energies || []).find(energie => energie.Nom === energieNom);

        if (energieData && energieData.RechargeAutomatique) {
            autoRegen += Number(energieData.GainParTour) || 0;
        }
    });

    if (autoRegen > 0) {
        const oldEnergy = state.playerEnergy;

        state.playerEnergy = Math.min(state.playerMaxEnergy, state.playerEnergy + autoRegen);

        const gained = state.playerEnergy - oldEnergy;

        if (gained > 0) {
            addLog(`${getHeroEnergyTypes().join(" / ")} +${gained} grâce à la recharge automatique.`, "system");
        }
    }

    updateBattleUI();

    updateActionButtons();
}

/* ============================================================
   SÉLECTION D'ATTAQUE (MODAL)
============================================================ */

function openAttackModal() {
    if (!canPlayerAct()) {
        return;
    }

    renderAttackList();

    $("#attack-selection-title").textContent = "Choisir une attaque";

    $("#attack-list").classList.remove("hidden");

    $("#attack-modal").classList.remove("hidden");
}

function closeAttackModal() {
    $("#attack-modal").classList.add("hidden");
}

function renderAttackList() {
    const container = $("#attack-list");

    container.innerHTML = "";

    state.heroAttacks.forEach((attaque, index) => {
        const button = document.createElement("button");

        button.type = "button";

        button.className = "attack-card";

        const cannotAfford = state.playerEnergy < attaque.CoutEnergie && getAttackEnergyTypes(attaque).some(type => getHeroEnergyTypes().includes(type));

        button.disabled = cannotAfford;

        const description = replaceHero(attaque.Description || "");

        const attackSlot = index + 1;

        const slotKeys = (gameSettings && gameSettings.keybinds && Array.isArray(gameSettings.keybinds["attack" + attackSlot])) ? gameSettings.keybinds["attack" + attackSlot] : null;

        const slotKeyHint = (attackSlot <= 5 && slotKeys && slotKeys.length > 0 && String(slotKeys[0] || "").trim() !== "") ? `<span class="attack-key-hint">${escapeHtml(formatKeyLabel(slotKeys[0]))}</span>` : "";

        const energyLabel = attaque.TypeEnergie2 ? `${attaque.TypeEnergie} / ${attaque.TypeEnergie2}` : (attaque.TypeEnergie || state.hero.TypeEnergie);

        button.innerHTML = `

                <h3>
                    ${slotKeyHint}${escapeHtml(attaque.Nom)}
                </h3>

                <div class="attack-cost">
                    ${escapeHtml(energyLabel)}
                    · ${attaque.CoutEnergie} énergie
                </div>

                <p class="attack-description">
                    ${escapeHtml(description)}
                </p>

                <div class="attack-meta">

                    <span>
                        Cible :
                        ${escapeHtml(attaque.Cible || "Ennemi")}
                    </span>

                    <span>
                        ${cannotAfford ? "Énergie insuffisante" : "Disponible"}
                    </span>

                </div>
            `;

        button.addEventListener("click", () => selectAttackTarget(attaque));

        container.appendChild(button);
    });

    if (state.heroAttacks.length === 0) {
        container.innerHTML = `
            <p style="color: var(--muted);">
                Aucune attaque trouvée pour ce personnage.
            </p>
        `;
    }
}

function selectAttackTarget(attaque) {
    executeAttack(attaque, getSelectedMonster());
}

/* ============================================================
   EXÉCUTION D'ATTAQUE JOUEUR
============================================================ */

async function executeAttack(attaque, target = getSelectedMonster()) {
    if (!canPlayerAct()) return;

    if (!target || target.hp <= 0) return;

    if (state.playerEnergy < attaque.CoutEnergie && getAttackEnergyTypes(attaque).some(type => getHeroEnergyTypes().includes(type))) {
        addLog(`Énergie insuffisante pour utiliser ${attaque.Nom}.`, "system");

        showToast("Énergie insuffisante", `Il faut ${attaque.CoutEnergie} énergie.`);

        return;
    }

    closeAttackModal();

    state.busy = !0;

    updateActionButtons();

    state.playerEnergy -= attaque.CoutEnergie;

    state.escapeAttempts = 0;

    addLog(`${state.hero.Nom} utilise ${attaque.Nom}.`, "system");

    fireVfxFor(vfxAttachedTo(attaque), "onAttack", { side: "player", target });

    const effects = attaque.Effets || [];

    const damageEffects = effects.filter(effect => normalizeEffectType(effect.Type) === "degats");

    let effectivenessText = null;

    let effectivenessClass = "";

    if (damageEffects.length > 0) {
        const multiplier = getTypeMultiplier(pickBestAttackEnergyType(getAttackEnergyTypes(attaque), target), getMonsterEnergyTypes(target));

        effectivenessText = getEffectivenessMessage(multiplier);

        effectivenessClass = getEffectivenessClass(multiplier);
    }

    await showBattlePopup(`${state.hero.Nom} utilise ${attaque.Nom} !`, effectivenessText, effectivenessClass);

    const description = replaceHero(attaque.Description || "");

    if (description.trim() !== "") addLog(description, "system");

    let attackEnergyType = attaque.TypeEnergie || state.hero.TypeEnergie;

    const otherEffects = effects.filter(effect => normalizeEffectType(effect.Type) !== "degats");

    let nonDamageEffectsApplied = !1;

    const maxCoups = (Number.isInteger(attaque.NombreMaxCoups) && attaque.NombreMaxCoups > 0)
        ? Math.min(attaque.NombreMaxCoups, state.playerNombreRoulette)
        : state.playerNombreRoulette;

    for (let rouletteCompteur = 0; rouletteCompteur < maxCoups; rouletteCompteur++) {
        if (state.battleOver) break;

        const puissance = await rollRoulette(state.playerMinRoulette, state.playerMaxRoulette, isRouletteAnimationSkipped(), "Joueur");

        await sleep(150);

        target = getSelectedMonster();

        if (!target) break;

        attackEnergyType = pickBestAttackEnergyType(getAttackEnergyTypes(attaque), target);

        if (!nonDamageEffectsApplied && otherEffects.length > 0) {
            nonDamageEffectsApplied = !0;

            applyAttackEffects(otherEffects, target, puissance, 1, !1, attackEnergyType, !1, attaque);
        }

        const isCritical = rollCriticalHit();

        if (isCritical) {
            addLog("💥 COUP CRITIQUE !", "reward");
        }

        if (isCritical) fireVfxFor(vfxAttachedTo(attaque), "onCrit", { side: "player", target, crit: true });

        await animatePlayerAttack(target);

        state._currentAttack = attaque;
        applyAttackEffects(damageEffects, target, puissance, 1, isCritical, attackEnergyType, !1, attaque);
        fireVfxFor(vfxAttachedTo(attaque), "onDamageDealt", { side: "player", target, crit: isCritical });

        const effectiveness = getTypeMultiplier(attackEnergyType, getMonsterEnergyTypes(target));

        if (effectiveness >= 1.5) {
            addLog("C'est super efficace !", "reward");
        } else if (effectiveness > 1.0) {
            addLog("C'est efficace !", "reward");
        } else if (effectiveness < 0.9) {
            addLog("Ce n'est pas très efficace...", "system");
        }

        const defeatedMonsters = state.monsters.filter(monster =>
            monster && monster.hp <= 0 && !monster.defeatHandled
        );

        for (const defeatedMonster of defeatedMonsters) {
            await handleMonsterDeath(defeatedMonster, !1);
        }

        if (getLivingMonsters().length === 0) {
            await finishBattleIfNoLivingMonsters();
            break;
        }

        if (!state.battleOver) await sleep(120);
    }

    if (!nonDamageEffectsApplied && otherEffects.length > 0 && !state.battleOver) {
        const finalTarget = getSelectedMonster();

        if (finalTarget) {
            applyAttackEffects(otherEffects, finalTarget, 0, 1, !1, attackEnergyType, attaque);
        }
    }

    if (state.battleOver) return;

    state.busy = !1;

    state.turn = "monster";

    updateBattleUI();

    updateActionButtons();

    await sleep(400);

    if (!state.battleOver) await monsterTurn();
}

/* ============================================================
   SOIN JOUEUR
============================================================ */

async function playerHeal() {
    if (!canPlayerAct()) {
        return;
    }

    if (state.playerHp >= state.playerMaxHp) {
        addLog("La vie est déjà au maximum.", "system");

        showToast("Vie au maximum", "Aucun soin n'est nécessaire.");

        return;
    }

    state.busy = !0;

    updateActionButtons();

    let healedAnything = !1;

    for (let rouletteCompteur = 0; rouletteCompteur < state.playerNombreRoulette; rouletteCompteur++) {
        if (state.playerHp >= state.playerMaxHp) {
            break;
        }

        const puissance = await rollRoulette(1, 15, isRouletteAnimationSkipped(), "Soin");

        const bonus = roundAwayFromZero(puissance * state.itemBandage * 0.2);

        const healAmount = puissance + bonus;

        const oldHp = state.playerHp;

        state.playerHp = Math.min(state.playerMaxHp, state.playerHp + healAmount);

        const actualHeal = state.playerHp - oldHp;

        if (actualHeal > 0) {
            healedAnything = !0;

            showHealing(actualHeal);

            addLog(`${state.hero.Nom} récupère ${actualHeal} PV.`, "heal");
        }

        updateBattleUI();

        await sleep(100);
    }

    if (!healedAnything) {
        addLog("Aucun soin n'a été effectué.", "system");

        state.busy = !1;

        updateActionButtons();

        return;
    }

    state.busy = !1;

    state.turn = "monster";

    updateBattleUI();

    updateActionButtons();

    await sleep(400);

    if (!state.battleOver) {
        await monsterTurn();
    }
}

/* ============================================================
   RECHARGE D'ÉNERGIE
============================================================ */

async function playerRecharge() {
    if (!canPlayerAct()) {
        return;
    }

    if (state.playerEnergy >= state.playerMaxEnergy) {
        addLog("L'énergie est déjà au maximum.", "system");

        showToast("Énergie au maximum", "Impossible de recharger davantage.");

        return;
    }

    state.busy = !0;

    let gainedAnything = !1;

    updateActionButtons();

    for (let rouletteCompteur = 0; rouletteCompteur < state.playerNombreRoulette; rouletteCompteur++) {
        if (state.playerEnergy >= state.playerMaxEnergy) {
            break;
        }

        const gain = await rollRoulette(1, 15, isRouletteAnimationSkipped(), "Recharge")

        const oldEnergy = state.playerEnergy;

        state.playerEnergy = Math.min(state.playerMaxEnergy, state.playerEnergy + gain);

        const actualGain = state.playerEnergy - oldEnergy;


        updateBattleUI();

        if (actualGain > 0) {
            gainedAnything = !0;

            showHealing(actualGain);

            addLog(`${state.hero.Nom} récupère ${actualGain} énergie.`, "heal");
        }

        await sleep(100);
    }

    if (!gainedAnything) {
        addLog("Aucune recharge n'a été effectué.", "system");

        state.busy = !1;

        updateActionButtons();

        return;
    }

    state.busy = !1;

    state.turn = "monster";

    updateBattleUI();

    updateActionButtons();

    await sleep(400);

    if (!state.battleOver) {
        await monsterTurn();
    }
}

/* ============================================================
   S'ENFUIR (FUIE POKÉMON — GEN I/III/V)
============================================================ */

function getEscapeGeneration() {
    const value = Number(gameSettings && gameSettings.combat && gameSettings.combat.escapeGeneration);

    return value === 1 || value === 3 || value === 5 ? value : 5;
}

function computeEscapeSuccess(speedPlayer, speedWild, attempts, generation) {
    if (speedPlayer >= speedWild) return !0;

    const roll = randomInt(0, 255);

    if (generation === 1) {
        const wildDiv = Math.floor(speedWild / 4);

        if (wildDiv % 256 === 0) return !0;

        const odds = Math.floor((speedPlayer * wildDiv) / 256) + (30 * attempts);

        if (odds > 255) return !0;

        return roll < odds;
    }

    if (generation === 3) {
        const odds = (Math.floor((speedPlayer * 128) / speedWild) + (30 * attempts)) % 256;

        return roll < odds;
    }

    const wildDiv = Math.floor(speedWild / 4);

    if (wildDiv === 0) return !0;

    const odds = Math.floor((speedPlayer * 32) / wildDiv) + (30 * attempts);

    return roll < odds;
}

async function endBattleByEscape() {
    if (typeof restoreMegaEvolution === "function") restoreMegaEvolution();
    vfxStopAll();
    state.battleOver = !0;

    state.busy = !1;

    state.escapeAttempts = 0;

    updateActionButtons();

    const pending = Math.max(0, Math.round(state.pendingXp || 0));

    if (pending > 0) {
        state.pendingXp = 0;

        gainXp(pending);
    }

    await sleep(400);

    startOverworldMode();
}

async function playerFlee() {
    if (!canPlayerAct()) {
        return;
    }

    state.busy = !0;

    updateActionButtons();

    state.escapeAttempts = (Number(state.escapeAttempts) || 0) + 1;

    const attempts = state.escapeAttempts;

    const speedPlayer = getPlayerSpeed();

    const target = getSelectedMonster();

    const speedWild = target ? getMonsterSpeed(target) : 1;

    const generation = getEscapeGeneration();

    const success = computeEscapeSuccess(speedPlayer, speedWild, attempts, generation);

    if (success) {
        addLog(`${state.hero.Nom} s'enfuit du combat !`, "system");

        await showBattlePopup(`${state.hero.Nom} s'enfuit du combat !`);

        await endBattleByEscape();

        return;
    }

    addLog("Impossible de s'enfuir !", "system");

    await showBattlePopup("Impossible de s'enfuir !");

    state.turn = "monster";

    updateBattleUI();

    updateActionButtons();

    await sleep(350);

    state.busy = !1;

    if (!state.battleOver) {
        await monsterTurn();
    }
}

/* ============================================================
   ANIMATION D'ATTAQUE JOUEUR
============================================================ */

async function animatePlayerAttack(target = getSelectedMonster()) {
    const playerPanel = document.getElementById("player-panel");

    const monsterPanel = getMonsterPanel(target);

    playCombatAnimation(playerPanel, "player-attacking", 450);

    await sleep(250);

    playCombatAnimation(monsterPanel, "monster-hit", 400);

    showImpact(monsterPanel?.querySelector(".monster-art"));

    shakeBattleScreen();

    await sleep(200);
}