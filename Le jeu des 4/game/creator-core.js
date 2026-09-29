"use strict";

/* ============================================================
   game/creator-core.js — Créateur de contenu : noyau
   (ex-game.js : constantes du créateur, noms d'origine,
   menu développeur, navigation par catégorie, listes,
   suppression, persistance contenuCue, fusion au chargement)
   Formulaires par type : creator-personnage/monstre/attaque/
   effet/energie/statut.js — images : creator-images.js
============================================================ */

/* ============================================================
   CONSTANTES DU CRÉATEUR
============================================================ */

const CREATOR_DEFAULT_EVOLUTION_LEVEL = 5;

const CREATOR_EVOLUTION_STEP_LEVEL = 5;

const CREATOR_MONSTER_ATTACK_COUNT = 4;

const CREATOR_TYPES = [
    "Personnages",
    "Attaques",
    "Effets",
    "Energies",
    "Statuts",
    "EffetsVisuels",
    "Items"
];

const CREATOR_TYPE_LABELS = {
    Personnages: "personnages",
    Monstres: "monstres",
    Attaques: "attaques",
    Effets: "effets",
    Energies: "énergies",
    Statuts: "statuts",
    EffetsVisuels: "effets visuels",
    Items: "items"
};

const CREATOR_EFFECT_TYPES = [
    "Degats",
    "Soin",
    "Brûlure",
    "Buff de puissance",
    "Debuff de puissance",
    "Augmenter l'armure",
    "Réduire l'armure",
    "Recharger l'énergie",
    "Effet personnalisé"
];

const CREATOR_EFFECT_TARGETS = ["Ennemi", "Joueur", "Tous les ennemis"];

const CREATOR_STATUT_TYPES = ["ContreAttaque", "RefletDegats"];

const CREATOR_RARETES = ["Commun", "Rare", "Légendaire"];

const creatorStockNames = {
    Personnages: [],
    Attaques: [],
    Effets: [],
    Energies: [],
    Statuts: [],
    Items: []
};

function captureStockContentNames() {
    CREATOR_TYPES.forEach(type => {
        creatorStockNames[type] = (state.contenu?.[type] || []).map(entry => entry && entry.Nom).filter(Boolean);
    });
}

function isStockContentName(type, nom) {
    return (creatorStockNames[type] || []).includes(nom);
}

/* ============================================================
   MENU DÉVELOPPEUR — OUVERTURE / FERMETURE
============================================================ */

function isDevMenuOpen() {
    const menu = $("#dev-menu");

    return !!(menu && !menu.classList.contains("hidden"));
}

function openDevMenu() {
    if (!state || !state.contenu) {
        showToast("Chargement en cours", "Le contenu du jeu n'est pas encore chargé.");

        return;
    }

    if ((state.busy && !state.battleOver) || xpAnimationInProgress) {
        showToast("Action en cours", "Impossible d'ouvrir le mode développeur pendant une animation.");

        return;
    }

    if (typeof closeSaveMenu === "function") closeSaveMenu();

    if (typeof closeAttackModal === "function") closeAttackModal();

    if (typeof closeSettingsMenu === "function") closeSettingsMenu();

    $("#dev-menu").classList.remove("hidden");

    showDevMenuMain();
}

function closeDevMenu() {
    const menu = $("#dev-menu");

    if (menu) menu.classList.add("hidden");

    resetDevPanel();
}

function toggleDevMenu() {
    if (isDevMenuOpen()) {
        closeDevMenu();
    } else {
        openDevMenu();
    }
}

function showDevMenuMain() {
    resetDevPanel();

    const main = $("#dev-menu-main");

    if (main) main.classList.remove("hidden");
}

function resetDevPanel() {
    const main = $("#dev-menu-main");

    if (main) main.classList.remove("hidden");

    const panel = $("#dev-panel");

    if (panel) {
        panel.classList.add("hidden");

        panel.innerHTML = "";
    }
}

/* ============================================================
   ACCÈS AUX DONNÉES CRÉÉES
============================================================ */

function getCreatorContenu() {
    return contenuMemory;
}

function creatorNameExists(type, nom) {
    const created = getCreatorContenu();

    if (Array.isArray(created[type]) && created[type].some(e => e && e.Nom === nom)) return !0;

    if (type === "Monstres") return !1;

    return (state.contenu?.[type] || []).some(e => e && e.Nom === nom);
}

function getCreatorEnergyNames() {
    return (state.contenu?.Energies || []).map(energie => energie.Nom).filter(Boolean);
}

/* ============================================================
   LECTURE DES CHAMPS DE FORMULAIRE
============================================================ */

function lireIntInput(selector, defaultValue) {
    const element = $(selector);

    if (!element) return Math.floor(Number(defaultValue) || 0);

    const value = Number.parseInt(element.value, 10);

    return Number.isInteger(value) ? value : Math.floor(Number(defaultValue) || 0);
}

function lireDoubleInput(selector, defaultValue) {
    const element = $(selector);

    if (!element) return Number(defaultValue) || 1;

    const value = Number(element.value.replace(",", "."));

    return Number.isFinite(value) ? value : Number(defaultValue);
}

/* ============================================================
   NAVIGATION PAR CATÉGORIE
============================================================ */

function showDevCategoryMenu(type) {
    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    const label = CREATOR_TYPE_LABELS[type] || "du contenu";

    panel.innerHTML = `
        <h3 style="margin-bottom:6px;">${type}</h3>
        <p class="dev-info-note">Que veux-tu faire avec ${label} ?</p>
        <div class="dev-form-actions" style="margin-top:8px;">
            <button type="button" class="primary-button" id="dev-cat-creer">Créer</button>
            <button type="button" class="secondary-button" id="dev-cat-modifier">Modifier</button>
            <button type="button" class="secondary-button" id="dev-cat-supprimer">Supprimer</button>
            <button type="button" class="secondary-button" id="dev-cat-voir">Voir la liste</button>
            <button type="button" class="secondary-button" id="dev-cat-retour" style="grid-column: 1 / -1;">← Retour</button>
        </div>`;

    $("#dev-cat-creer").addEventListener("click", () => startCreatorForm(type, null));

    $("#dev-cat-modifier").addEventListener("click", () => showDevObjectPicker(type, "modifier"));

    $("#dev-cat-supprimer").addEventListener("click", () => showDevObjectPicker(type, "supprimer"));

    $("#dev-cat-voir").addEventListener("click", () => showDevObjectList(type));

    $("#dev-cat-retour").addEventListener("click", showDevMenuMain);
}

function startCreatorForm(type, existing) {
    switch (type) {
        case "Personnages":
            startPersonnageCreator(null, existing);

            break;
        case "Monstres":
            startMonsterCreator(existing);

            break;
        case "Attaques":
            startAttackCreator(existing);

            break;
        case "Effets":
            startEffectCreator(existing);

            break;
        case "Energies":
            startEnergyCreator(existing);

            break;
        case "Statuts":
            startStatutCreator(existing);

            break;
        case "EffetsVisuels":
            startVfxCreator(existing);

            break;
        case "Items":
            startItemCreator(existing);

            break;
    }
}

function getDevObjectsForType(type) {
    if (type === "Monstres") return getCreatorContenu().Monstres || [];
    if (type === "EffetsVisuels") return getCreatorContenu().EffetsVisuels || [];
    return state.contenu?.[type] || [];
}

function getDevObjectSummary(type, obj) {
    switch (type) {
        case "Personnages":
            return `${obj.TypeEnergie || "?"}${obj.TypeEnergie2 ? `/${obj.TypeEnergie2}` : ""} · Vie ${obj.Vie} · Puissance ${obj.PuissanceBase}${obj.Rarete ? ` · ${obj.Rarete}` : ""}${obj.Evolution && obj.Evolution.Cible ? ` · Évolution → ${obj.Evolution.Cible}` : ""}`;
        case "Monstres":
            return `${obj.TypeEnergie || "?"} · Vie ${obj.Vie} · ${(obj.Attaques || []).length} attaque(s)`;
        case "Attaques":
            return `${obj.TypeEnergie || "?"}${obj.TypeEnergie2 ? `/${obj.TypeEnergie2}` : ""} · ${obj.CoutEnergie} énergie · ${(obj.Effets || []).length} effet(s)`;
        case "Effets":
            return `${obj.Type || "?"} · Valeur ${obj.Valeur} · ${obj.Cible || "Ennemi"}`;
        case "Energies":
            return `${obj.RechargeAutomatique ? `Régén.+${obj.GainParTour || 0}/tour` : "Sans régénération"}${obj.Faiblesse ? ` · Faiblesse:${obj.Faiblesse}` : ""}${obj.Avantage ? ` · Avantage:${obj.Avantage}` : ""}`;
        case "Statuts":
            return `${obj.TypeStatut || "?"} · ${obj.ChanceApplication ?? 100}% · ${obj.DureeTours ?? 1} tour(s)`;
        case "EffetsVisuels":
            return getVfxSummary(obj);
        case "Items":
            return `${obj.Categorie || "Autre"} · ${(obj.Effets || []).length} effet(s) · Qté max ${obj.QuantiteMax || 999}${obj.MegaStone ? " · Méga Stone" : ""}`;
        default:
            return "";
    }
}

/* ============================================================
   SÉLECTEURS / LISTES D'OBJETS
============================================================ */

function showDevObjectPicker(type, mode) {
    const objects = getDevObjectsForType(type);

    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    if (objects.length === 0) {
        panel.innerHTML = `<p class="dev-info-note">Aucun élément à ${mode === "modifier" ? "modifier" : "supprimer"}.</p><div class="dev-form-actions"><button type="button" class="secondary-button" id="dev-picker-retour">← Retour</button></div>`;

        $("#dev-picker-retour").addEventListener("click", () => showDevCategoryMenu(type));

        return;
    }

    let cards = "";

    objects.forEach(obj => {
        if (!obj || !obj.Nom) return;

        cards += `<button type="button" class="dev-entry-card" data-nom="${escapeHtml(obj.Nom)}"><span><span class="dev-entry-name">${escapeHtml(obj.Nom)}</span><span class="dev-entry-info">${escapeHtml(getDevObjectSummary(type, obj))}</span></span></button>`;
    });

    panel.innerHTML = `<h3 style="margin-bottom:12px;">${mode === "modifier" ? "Modifier" : "Supprimer"} — ${objects.length} élément(s)</h3><div class="dev-list-scroll">${cards}</div><div class="dev-form-actions"><button type="button" class="secondary-button" id="dev-picker-retour">← Retour</button></div>`;

    panel.querySelectorAll(".dev-entry-card").forEach(card => {
        card.addEventListener("click", () => {
            const nom = card.dataset.nom;

            const obj = objects.find(o => o && o.Nom === nom);

            if (!obj) return;

            if (mode === "modifier") {
                startCreatorForm(type, obj);
            } else if (mode === "supprimer") {
                confirmDevDelete(type, obj);
            }
        });
    });

    $("#dev-picker-retour").addEventListener("click", () => showDevCategoryMenu(type));
}

function showDevObjectList(type) {
    const objects = getDevObjectsForType(type);

    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    let cards = "";

    objects.forEach(obj => {
        if (!obj || !obj.Nom) return;

        cards += `<div class="dev-entry-card" style="cursor:default;"><span><span class="dev-entry-name">${escapeHtml(obj.Nom)}</span><span class="dev-entry-info">${escapeHtml(getDevObjectSummary(type, obj))}</span></span></div>`;
    });

    panel.innerHTML = `<h3 style="margin-bottom:12px;">${type} (${objects.length})</h3><div class="dev-list-scroll">${cards || '<p class="dev-info-note">Aucun élément.</p>'}</div><div class="dev-form-actions"><button type="button" class="secondary-button" id="dev-liste-retour">← Retour</button></div>`;

    $("#dev-liste-retour").addEventListener("click", () => showDevCategoryMenu(type));
}

/* ============================================================
   SUPPRESSION
============================================================ */

function getDevDeleteWarnings(type, nom) {
    const warnings = [];

    const personnages = state.contenu?.Personnages || [];

    const attaques = state.contenu?.Attaques || [];

    const energies = state.contenu?.Energies || [];

    if (type === "Personnages") {
        attaques.forEach(a => {
            if (a && a.Personnage === nom) warnings.push(`l'attaque « ${a.Nom} » lui appartient`);
        });

        personnages.forEach(p => {
            if (p && p.Evolution && p.Evolution.Cible === nom) warnings.push(`« ${p.Nom} » évolue vers ce personnage`);
        });

        if (state.hero && state.hero.Nom === nom) warnings.push("c'est le personnage actuellement utilisé");

        if (state.selectedHero && state.selectedHero.Nom === nom) warnings.push("c'est le personnage sélectionné");
    }

    if (type === "Attaques") {
        personnages.forEach(p => {
            if (p && Array.isArray(p.Attaques) && p.Attaques.includes(nom)) warnings.push(`référencé dans la liste d'attaques de « ${p.Nom} »`);
        });
    }

    if (type === "Energies") {
        personnages.forEach(p => {
            if (p && p.TypeEnergie === nom) warnings.push(`utilisé par « ${p.Nom} »`);
        });

        attaques.forEach(a => {
            if (a && (a.TypeEnergie === nom || a.TypeEnergie2 === nom)) warnings.push(`utilisé par l'attaque « ${a.Nom} »`);
        });

        energies.forEach(e => {
            if (e && (e.Faiblesse === nom || e.Avantage === nom)) warnings.push(`lié à la faiblesse/avantage de « ${e.Nom} »`);
        });
    }

    if (type === "Effets") {
        attaques.forEach(a => {
            if (a && Array.isArray(a.Effets) && a.Effets.some(e => e && e.Nom === nom)) warnings.push(`incorporé dans l'attaque « ${a.Nom} » (la copie restera)`);
        });
    }

    if (type === "Statuts") {
        attaques.forEach(a => {
            if (a && Array.isArray(a.Statuts) && a.Statuts.some(s => s && s.Nom === nom)) warnings.push(`incorporé dans l'attaque « ${a.Nom} » (la copie restera)`);
        });
    }

    return warnings;
}

function confirmDevDelete(type, obj) {
    if (type === "EffetsVisuels") {
        confirmVfxDelete(obj);

        return;
    }

    const nom = obj.Nom;

    const warnings = getDevDeleteWarnings(type, nom);

    let message = `Supprimer « ${nom} » ?`;

    if (warnings.length > 0) {
        message += "\n\nAttention :\n- " + warnings.join("\n- ");
    }

    if (!confirm(message)) return;

    deleteCreatorObject(type, nom);

    showToast("Supprimé", `« ${nom} » a été supprimé.`);

    showDevCategoryMenu(type);
}

function deleteCreatorObject(type, nom) {
    const created = getCreatorContenu();

    if (type === "Monstres") {
        const i = (created.Monstres || []).findIndex(m => m && m.Nom === nom);

        if (i >= 0) created.Monstres.splice(i, 1);

        const j = MONSTER_VARIETIES.findIndex(m => m.Nom === nom);

        if (j >= 0) MONSTER_VARIETIES.splice(j, 1);

        saveCreatorContenu();

        return;
    }

    const arr = created[type] || [];

    const i = arr.findIndex(e => e && e.Nom === nom);

    if (i >= 0) arr.splice(i, 1);

    if (isStockContentName(type, nom)) {
        const sup = created.suppressions[type];

        if (Array.isArray(sup) && !sup.includes(nom)) sup.push(nom);
    }

    const list = state.contenu?.[type];

    if (Array.isArray(list)) {
        const j = list.findIndex(e => e && e.Nom === nom);

        if (j >= 0) list.splice(j, 1);
    }

    saveCreatorContenu();
}

/* ============================================================
   PERSISTANCE contenuCue (mémoire + localStorage, sans
   écriture disque — voir creator-images.js pour l'export)
============================================================ */

function stripCreatorMeta(obj) {
    const clone = structuredClone(obj);

    if (clone && typeof clone === "object") delete clone._source;

    return clone;
}

function persistCreatorObject(type, obj) {
    const created = getCreatorContenu();

    const arr = created[type];

    if (!Array.isArray(arr)) return;

    const clone = structuredClone(obj);

    if (isStockContentName(type, clone.Nom)) clone._source = "stock";

    const i = arr.findIndex(e => e && e.Nom === clone.Nom);

    if (i >= 0) arr[i] = clone;
    else arr.push(clone);
}

function syncCreatorObjectRuntime(type, obj) {
    const list = state.contenu?.[type];

    if (!Array.isArray(list)) return;

    const clean = stripCreatorMeta(obj);

    const i = list.findIndex(e => e && e.Nom === clean.Nom);

    if (i >= 0) list[i] = structuredClone(clean);
    else list.push(structuredClone(clean));
}

function mergeCreatorContentIntoContenu() {
    if (!state.contenu) return;

    const created = getCreatorContenu();

    if (!created) return;

    CREATOR_TYPES.forEach(type => {
        const list = state.contenu[type];

        if (!Array.isArray(list)) return;

        const sup = (created.suppressions && created.suppressions[type]) || [];

        sup.forEach(nom => {
            const index = list.findIndex(existing => existing && existing.Nom === nom);

            if (index >= 0) list.splice(index, 1);
        });

        (created[type] || []).forEach(entry => {
            if (!entry || !entry.Nom) return;

            const clean = stripCreatorMeta(entry);

            const index = list.findIndex(existing => existing && existing.Nom === clean.Nom);

            if (index >= 0) list[index] = structuredClone(clean);
            else list.push(structuredClone(clean));
        });
    });

    (created.Monstres || []).forEach(monstre => {
        if (!monstre || !monstre.Nom) return;

        const index = MONSTER_VARIETIES.findIndex(existing => existing.Nom === monstre.Nom);

        if (index >= 0) MONSTER_VARIETIES[index] = structuredClone(monstre);
        else MONSTER_VARIETIES.push(structuredClone(monstre));
    });
}

function refreshHeroReferencesIfAffected() {
    if (!state.hero) return;

    const runtime = (state.contenu?.Personnages || []).find(p => p && p.Nom === state.hero.Nom);

    if (!runtime) return;

    state.hero = runtime;

    state.selectedHero = runtime;

    state.heroEnergyData = (state.contenu?.Energies || []).find(e => e && e.Nom === runtime.TypeEnergie) || null;

    state.heroAttacks = (state.contenu?.Attaques || []).filter(attaque => attaque.Personnage === runtime.Nom);

    if (typeof setOverworldPlayerSprite === "function") {
        setOverworldPlayerSprite(runtime);
    }

    updatePlayerImage();

    updateBattleUI();

    if (screens.character && screens.character.classList.contains("active")) {
        renderCharacters();
    }
}

function synchronizePersonnageAttackRelations() {
    if (!state.contenu) return;

    const attacksByCharacter = new Map();

    (state.contenu.Attaques || []).forEach(attaque => {
        if (!attaque || !attaque.Nom || !attaque.Personnage) return;

        if (!attacksByCharacter.has(attaque.Personnage)) {
            attacksByCharacter.set(attaque.Personnage, []);
        }

        const names = attacksByCharacter.get(attaque.Personnage);

        if (!names.includes(attaque.Nom)) {
            names.push(attaque.Nom);
        }
    });

    (state.contenu.Personnages || []).forEach(personnage => {
        if (!personnage || !personnage.Nom) return;

        const names = (attacksByCharacter.get(personnage.Nom) || []).slice();

        personnage.Attaques = names;

        const created = getCreatorContenu().Personnages?.find(entry => entry && entry.Nom === personnage.Nom);

        if (created) {
            created.Attaques = names.slice();
        }
    });
}

function saveCreatorContenu() {
    mergeCreatorContentIntoContenu();

    synchronizePersonnageAttackRelations();

    refreshHeroReferencesIfAffected();

    updateSaveMemory();
}