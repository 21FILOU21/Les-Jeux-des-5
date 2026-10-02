"use strict";

/* ============================================================
   game/utils.js — Outils partagés : maths, formatage, toast,
   animations DOM génériques, chemin d'image personnage
   (ex-game.js : helpers dispersés entre combat et progression)
============================================================ */

function randomInt(min, max) {
    min = Math.ceil(Number(min));

    max = Math.floor(Number(max));

    if (max < min) {
        return min;
    }

    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds / gameSpeed));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function roundAwayFromZero(value) {
    if (value >= 0) {
        return Math.floor(value + 0.5);
    }

    return Math.ceil(value - 0.5);
}

function roundToEven(value, decimals = 0) {
    const factor = Math.pow(10, decimals);

    const scaled = value * factor;

    const lower = Math.floor(scaled);

    const fraction = scaled - lower;

    let rounded;

    if (fraction < 0.5) {
        rounded = lower;
    } else if (fraction > 0.5) {
        rounded = lower + 1;
    } else {
        rounded = lower % 2 === 0 ? lower : lower + 1;
    }

    return rounded / factor;
}

function calculateHealthPercentage(current, maximum) {
    if (maximum <= 0) {
        return 0;
    }

    return roundToEven((current * 100) / maximum, 2);
}

function healthBarPercentage(current, maximum) {
    if (maximum <= 0) {
        return 0;
    }

    return clamp((current / maximum) * 100, 0, 100);
}

function replaceHero(text) {
    return String(text).replaceAll("{HERO}", state.hero?.Nom || "Héros");
}

function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

let toastTimeout = null;

function showToast(title, message) {
    const toast = $("#toast");

    $("#toast-title").textContent = title;

    $("#toast-message").textContent = message;

    toast.classList.remove("hidden");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.add("hidden");
    }, 3000);
}

/* ============================================================
   ANIMATIONS DOM GÉNÉRIQUES
   (les animations spécifiques au combat — showDamage,
   showPlayerDamage, showHealing, animatePlayerAttack,
   animateMonsterAttack — restent dans battle-ui.js / enemy.js)
============================================================ */

function animateHit(element) {
    if (!element) {
        return;
    }

    element.classList.remove("hit");

    void element.offsetWidth;

    element.classList.add("hit");
}

function playCombatAnimation(element, className, duration = 450) {
    if (!element) {
        return;
    }

    element.classList.remove(className);

    void element.offsetWidth;

    element.classList.add(className);

    setTimeout(() => {
        element.classList.remove(className);
    }, duration);
}

function showCombatNumber(container, value, className = "damage-number") {
    if (!container) {
        return;
    }

    const number = document.createElement("div");

    number.className = className;

    number.textContent = value;

    container.appendChild(number);

    setTimeout(() => {
        number.remove();
    }, 900);
}

function showImpact(container) {
    if (!container) {
        return;
    }

    const flash = document.createElement("div");
    flash.className = "impact-flash";
    container.appendChild(flash);

    // Gerbe courte de pixels : 8 particules maximum, sans boucle permanente.
    const burst = document.createElement("div");
    burst.className = "impact-particles";
    const directions = [
        [-1, -1], [0, -1], [1, -1], [-1, 0],
        [1, 0], [-1, 1], [0, 1], [1, 1]
    ];

    directions.forEach(([dx, dy], index) => {
        const particle = document.createElement("i");
        particle.className = "impact-particle";
        particle.style.setProperty("--dx", String(dx * (18 + (index % 3) * 7)));
        particle.style.setProperty("--dy", String(dy * (16 + (index % 2) * 8)));
        particle.style.setProperty("--delay", String((index % 3) * 12) + "ms");
        burst.appendChild(particle);
    });

    container.appendChild(burst);

    setTimeout(() => {
        flash.remove();
        burst.remove();
    }, 340);
}

function shakeBattleScreen() {
    const battleScreen = document.getElementById("battle-screen");

    if (!battleScreen) {
        return;
    }

    battleScreen.classList.remove("battle-shake");

    void battleScreen.offsetWidth;

    battleScreen.classList.add("battle-shake");

    setTimeout(() => {
        battleScreen.classList.remove("battle-shake");
    }, 300);
}

/* ============================================================
   CHEMIN D'IMAGE PERSONNAGE
   (utilisé par l'écran de sélection, le combat et world.js
   via son garde typeof getCharacterImagePath)
============================================================ */

function normalizeCharacterImagePath(path) {
    let value = String(path || "").trim();
    if (!value) return "";

    value = value.replaceAll("\\", "/");
    while (value.startsWith("./")) value = value.slice(2);

    if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
        return value;
    }

    while (value.toLowerCase().startsWith("assets/personnages/assets/personnages/")) {
        value = value.slice("assets/personnages/".length);
    }

    if (value.toLowerCase().startsWith("assets/personnages/personnages/")) {
        value = "assets/personnages/" + value.slice("assets/personnages/personnages/".length);
    } else if (value.toLowerCase().startsWith("personnages/")) {
        value = "assets/" + value;
    } else if (!value.toLowerCase().startsWith("assets/personnages/")) {
        value = "assets/personnages/" + value.replace(/^\/+/, "");
    }

    return value;
}

function getCharacterImagePath(hero) {
    if (!hero || typeof hero !== "object") return "";
    return normalizeCharacterImagePath(hero.Image);
}