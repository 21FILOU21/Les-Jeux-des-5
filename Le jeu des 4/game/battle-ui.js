"use strict";

/* ============================================================
   game/battle-ui.js — Interface de combat
   (ex-game.js : roulette animée, panneaux joueur/monstres,
   boutons d'action, journal de combat, popup d'attaque unifiée,
   nombres de dégâts/soins, image du joueur)
============================================================ */

/* ============================================================
   ROULETTE ANIMÉE
============================================================ */

async function rollRoulette(minimum, maximum, skipAnimation, source) {
    minimum = Number(minimum);

    maximum = Number(maximum);

    if (minimum > maximum) {
        const temp = minimum;

        minimum = maximum;

        maximum = temp;
    }

    if (skipAnimation) {
        const result = randomInt(minimum, maximum);

        setRoulette(result, "Résultat");

        return result;
    }

    const nombreTours = randomInt(12, 17);

    const rouletteCard = $(".roulette-card");

    rouletteCard.classList.add("spinning");

    setRoulette("—", `${source} : roulette`);

    for (let i = 0; i < nombreTours; i++) {
        const temporaryValue = randomInt(minimum, maximum);

        setRoulette(temporaryValue, `${source} : roulette`);

        const delay = 30 + (i * 5);

        await sleep(delay);
    }

    const finalValue = randomInt(minimum, maximum);

    setRoulette(finalValue, "Résultat");

    rouletteCard.classList.remove("spinning");

    await sleep(300);

    return finalValue;
}

function setRoulette(value, status) {
    $("#roulette-value").textContent = value;

    $("#roulette-status").textContent = status;
}

/* ============================================================
   MISE À JOUR DU PANNEAU DE COMBAT
============================================================ */

function updateBattleUI() {
    if (!state.hero) {
        return;
    }

    $("#player-display-name").textContent = state.hero.Nom;

    const heroEnergyLabel = getHeroEnergyTypes().join(" / ");

    $("#player-energy-type").textContent = heroEnergyLabel;

    $("#player-energy-label").textContent = heroEnergyLabel;

    const levelBadge = $("#player-level-badge");

    if (levelBadge) levelBadge.textContent = "Niv. " + Math.max(1, globalState.playerLevel || 1);

    $("#player-hp").textContent = state.playerHp;

    $("#player-max-hp").textContent = state.playerMaxHp;

    $("#player-energy").textContent = state.playerEnergy;

    $("#player-max-energy").textContent = state.playerMaxEnergy;

    $("#player-hp-fill").style.width = `${healthBarPercentage(state.playerHp, state.playerMaxHp)}%`;

    $("#player-energy-fill").style.width = `${healthBarPercentage(state.playerEnergy, state.playerMaxEnergy)}%`;

    $("#player-power").textContent = state.playerPowerBase;

    $("#player-armor").textContent = state.playerArmorBase;

    $("#player-wheels").textContent = state.playerNombreRoulette;

    $("#player-range").textContent = `${state.playerMinRoulette} - ${state.playerMaxRoulette}`;

    renderMonsterCards();

    const selectedMonster = getSelectedMonster();

    $("#monster-number").textContent = selectedMonster ? `#${selectedMonster.number}` : "—";

    if (state.turn === "player") {
        $("#turn-text").textContent = "Tour du joueur";
    } else {
        $("#turn-text").textContent = "Tour du monstre";
    }
}

/* ============================================================
   CARTES DES MONSTRES (mise à jour EN PLACE — ne détruit pas
   les nombres de dégâts / bannières ajoutés aux panneaux)
============================================================ */

function renderMonsterCards() {
    const list = $("#monster-list");

    if (!list) return;

    const seenIds = new Set();

    state.monsters.forEach(monster => {
        seenIds.add(monster.id);

        let panel = list.querySelector(`[data-monster-id="${monster.id}"]`);

        if (!panel) {
            panel = document.createElement("article");

            panel.className = "fighter-panel monster-panel";

            panel.dataset.monsterId = monster.id;

            panel.innerHTML = `
            <div class="fighter-top">
                <div><span class="fighter-label">${monster.isBoss ? "BOSS" : "ENNEMI"}${monster.rarete ? ` · ${escapeHtml(monster.rarete)}` : ""}</span><h2>${escapeHtml(monster.name)} #${monster.number}</h2></div>
                <div class="energy-type monster-type">${escapeHtml(monster.energyType)}</div>
            </div>
            <div class="fighter-art monster-art"><div class="fighter-art-content">☠</div></div>
            <div class="resource-block"><div class="resource-header"><span>Vie</span><span><strong>${monster.hp}</strong> / <span>${monster.maxHp}</span></span></div><div class="resource-bar hp-bar"><div class="resource-fill" style="width: ${healthBarPercentage(monster.hp, monster.maxHp)}%;"></div></div></div>
            <div class="stats-grid"><div class="stat-box"><span>Puissance</span><strong>${monster.power}</strong></div><div class="stat-box"><span>Armure</span><strong>${roundToEven(monster.armor * 5)}%</strong></div><div class="stat-box"><span>Roulettes</span><strong>${monster.nombreRoulette}</strong></div><div class="stat-box"><span>Roulette</span><strong>${monster.minRoulette} - ${monster.maxRoulette}</strong></div></div>`;

            if (monster.hp > 0) {
                panel.addEventListener("click", () => {
                    state.selectedMonsterId = monster.id;

                    updateBattleUI();
                });
            }

            list.appendChild(panel);
        }

        panel.classList.toggle("selected-target", monster.id === state.selectedMonsterId && monster.hp > 0);

        panel.classList.toggle("monster-dead", monster.hp <= 0);

        const hpHeader = panel.querySelector(".resource-block .resource-header");

        if (hpHeader) {
            const hpStrong = hpHeader.querySelector("strong");

            if (hpStrong) hpStrong.textContent = monster.hp;

            const maxSpan = hpHeader.querySelector("span span");

            if (maxSpan) maxSpan.textContent = monster.maxHp;
        }

        const hpFill = panel.querySelector(".hp-bar .resource-fill");

        if (hpFill) hpFill.style.width = `${healthBarPercentage(monster.hp, monster.maxHp)}%`;
    });

    list.querySelectorAll(".monster-panel").forEach(existingPanel => {
        if (!seenIds.has(existingPanel.dataset.monsterId)) {
            existingPanel.remove();
        }
    });
}

/* ============================================================
   BOUTONS D'ACTION
============================================================ */

function updateActionButtons() {
    const enabled = canPlayerAct();

    $("#attack-btn").disabled = !enabled;

    $("#heal-btn").disabled = !enabled;

    $("#inventory-btn").disabled = !enabled;

    $("#ignore-btn").disabled = !enabled;

    $("#recharge-btn").disabled = !enabled;

    updateActionNumberBadges();
}

function updateActionNumberBadges() {
    const slots = [
        ["#attack-btn", "action1", "1"],
        ["#heal-btn", "action2", "2"],
        ["#ignore-btn", "action3", "3"],
        ["#recharge-btn", "action4", "4"],
        ["#inventory-btn", "action5", "5"]
    ];

    slots.forEach(([selector, bind, fallback]) => {
        const button = $(selector);

        if (!button) return;

        const badge = button.querySelector(".action-number");

        if (!badge) return;

        const keys = gameSettings && gameSettings.keybinds && gameSettings.keybinds[bind];

        badge.textContent = (Array.isArray(keys) && keys.length > 0 && String(keys[0] || "").trim() !== "") ? formatKeyLabel(keys[0]) : fallback;
    });
}

function canPlayerAct() {
    return (!state.battleOver && state.turn === "player" && !state.busy && state.playerHp > 0 && state.remainingMonsters > 0);
}

/* ============================================================
   JOURNAL DE COMBAT
============================================================ */

function addLog(message, type = "") {
    const container = $("#combat-log");

    const entry = document.createElement("div");

    entry.className = `log-entry ${type}`;

    const time = new Date().toLocaleTimeString("fr-CA", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    entry.innerHTML = `

        <span class="log-time">
            [${escapeHtml(time)}]
        </span>

        ${escapeHtml(message)}
    `;

    container.appendChild(entry);

    container.scrollTop = container.scrollHeight;

    state.log.push({ message, type, time });
}

function clearLog() {
    $("#combat-log").innerHTML = "";

    state.log = [];
}

/* ============================================================
   POPUP D'ATTAQUE UNIFIÉ (FAÇON POKÉMON)
============================================================ */

const BATTLE_POPUP_NAME_MS = 650;

const BATTLE_POPUP_EFFECT_MS = 950;

let battlePopupTimerA = null;

let battlePopupTimerB = null;

let battlePopupResolve = null;

function isBattlePopupActive() {
    const popup = document.getElementById("battle-popup");

    return !!(popup && !popup.classList.contains("hidden"));
}

function closeBattlePopupNow() {
    clearTimeout(battlePopupTimerA);

    clearTimeout(battlePopupTimerB);

    battlePopupTimerA = null;

    battlePopupTimerB = null;

    const popup = document.getElementById("battle-popup");

    if (popup) popup.classList.add("hidden");

    if (battlePopupResolve) {
        const resolve = battlePopupResolve;

        battlePopupResolve = null;

        resolve();
    }
}

function showBattlePopup(attackerText, effectivenessText = null, effectivenessClass = "") {
    return new Promise(resolve => {
        const popup = document.getElementById("battle-popup");

        const textElement = document.getElementById("battle-popup-text");

        const effectivenessElement = document.getElementById("battle-popup-effectiveness");

        const skipButton = document.getElementById("battle-popup-skip");

        const speedMultiplier = (typeof gameSpeed === "number" && gameSpeed > 0) ? gameSpeed : 1;

        if (!popup || !textElement) {
            resolve();

            return;
        }

        closeBattlePopupNow();

        textElement.textContent = attackerText;

        if (effectivenessElement) {
            effectivenessElement.textContent = effectivenessText || "";

            effectivenessElement.className = "battle-popup-effectiveness " + (effectivenessClass || "") + (effectivenessText ? "" : " hidden");
        }

        if (skipButton) {
            const allowed = isPopupSkipAllowed();

            skipButton.classList.toggle("hidden", !allowed);

            if (allowed) {
                const key = (gameSettings && gameSettings.keybinds && gameSettings.keybinds.skipAttackText && gameSettings.keybinds.skipAttackText[
                    0
                ]) || null;

                skipButton.textContent = key ? `Passer ▶ (${formatKeyLabel(key)})` : "Passer ▶";
            }
        }

        popup.classList.remove("hidden");

        battlePopupResolve = resolve;

        battlePopupTimerA = setTimeout(() => {
            battlePopupTimerA = null;

            if (effectivenessText) {
                if (effectivenessElement) effectivenessElement.classList.remove("hidden");

                battlePopupTimerB = setTimeout(() => {
                    battlePopupTimerB = null;

                    closeBattlePopupNow();
                }, BATTLE_POPUP_EFFECT_MS / speedMultiplier);
            } else {
                closeBattlePopupNow();
            }
        }, BATTLE_POPUP_NAME_MS / speedMultiplier);
    });
}

/* ============================================================
   NOMBRES DE DÉGÂTS / SOINS
============================================================ */

function showDamage(damage, target = getSelectedMonster()) {
    const monsterArt = getMonsterPanel(target)?.querySelector(".monster-art");

    showCombatNumber(monsterArt, `-${damage}`, "damage-number");
}

function showPlayerDamage(damage) {
    const playerArt = document.querySelector(".player-art");

    showCombatNumber(playerArt, `-${damage}`, "damage-number");
}

function showHealing(amount) {
    const playerArt = document.querySelector(".player-art");

    showCombatNumber(playerArt, `+${amount}`, "heal-number");
}

function showMonsterHealing(amount, target) {
    const monsterArt = getMonsterPanel(target)?.querySelector(".monster-art");

    showCombatNumber(monsterArt, `+${amount}`, "heal-number");
}

/* ============================================================
   IMAGE DU JOUEUR (ÉCRAN DE COMBAT)
============================================================ */

function updatePlayerImage() {
    const image = document.getElementById("player-image");

    const fallback = document.getElementById("player-art-content");

    if (!image || !fallback || !state.hero) {
        return;
    }

    const imagePath = getCharacterImagePath(state.hero);

    if (!imagePath) {
        image.src = "";

        fallback.style.display = "flex";

        return;
    }

    image.onload = () => {
        image.style.display = "block";

        fallback.style.display = "none";
    };

    image.onerror = () => {
        if (!image.dataset.nestedFallback && imagePath === `assets/personnages/${state.hero?.Nom}.png`) {
            image.dataset.nestedFallback = "1";
            image.src = `assets/personnages/personnages/${state.hero.Nom}.png`;
            return;
        }

        image.src = "";
        image.style.display = "none";
        fallback.style.display = "flex";
        console.warn(`Image introuvable pour ${state.hero.Nom}: ${imagePath}`);
    };

    image.src = imagePath;

    image.alt = state.hero.Nom;
}