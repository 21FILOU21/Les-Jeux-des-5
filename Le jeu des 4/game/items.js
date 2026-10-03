"use strict";

/* ============================================================
   game/items.js — Registre d'items + inventaire unifié
   Les anciens compteurs item* restent la compatibilité runtime
   des sauvegardes et des mécaniques existantes.
============================================================ */

const LEGACY_ITEM_DEFINITIONS = [
    {
        Id: "bandage",
        Nom: "Bandage",
        Description: "Renforce l'efficacité des soins du joueur.",
        Image: "",
        Categorie: "Soin",
        Effets: [],
        QuantiteMax: 999,
        Utilisable: !1,
        UtilisableHorsCombat: !1,
        Consommable: !1
    },
    {
        Id: "force",
        Nom: "Potion de Force",
        Description: "Augmente la puissance du joueur selon la mécanique de Force existante.",
        Image: "",
        Categorie: "Combat",
        Effets: [],
        QuantiteMax: 999,
        Utilisable: !1,
        UtilisableHorsCombat: !1,
        Consommable: !1
    },
    {
        Id: "armor",
        Nom: "Armure",
        Description: "Réduit les dégâts entrants selon la mécanique d'Armure existante.",
        Image: "",
        Categorie: "Combat",
        Effets: [],
        QuantiteMax: 999,
        Utilisable: !1,
        UtilisableHorsCombat: !1,
        Consommable: !1
    },
    {
        Id: "partage-experiences",
        Nom: "Partage d'expériences",
        Description: "Permet à tous les animaux de l'équipe de recevoir l'XP gagnée contre les monstres.",
        Image: "",
        Categorie: "Récompense",
        Effets: [],
        Valeur: 0,
        QuantiteMax: 1,
        Utilisable: !1,
        UtilisableHorsCombat: !1,
        Consommable: !1
    },
    {
        Id: "totem",
        Nom: "Totem",
        Description: "Objet spécial conservé par le système d'inventaire existant.",
        Image: "",
        Categorie: "Autre",
        Effets: [],
        QuantiteMax: 999,
        Utilisable: !1,
        UtilisableHorsCombat: !1,
        Consommable: !1
    }
];

function normalizeItemDefinition(item) {
    if (!item || typeof item !== "object") return null;

    const clone = structuredClone(item);

    clone.Id = String(clone.Id || clone.id || clone.Nom || "").trim();

    clone.Nom = String(clone.Nom || clone.Id || "Item").trim();

    clone.Description = String(clone.Description || "");

    clone.Image = typeof clone.Image === "string" ? clone.Image : "";

    clone.Categorie = String(clone.Categorie || clone.Type || "Autre");

    clone.Effets = Array.isArray(clone.Effets) ? clone.Effets : [];

    const max = Number(clone.QuantiteMax);
    clone.QuantiteMax = Number.isFinite(max) && max > 0 ? Math.floor(max) : 999;

    clone.Utilisable = clone.Utilisable !== !1;

    clone.UtilisableHorsCombat = clone.UtilisableHorsCombat === !0;

    clone.Consommable = clone.Consommable !== !1;

    if (clone.MegaStone && typeof clone.MegaStone !== "object") clone.MegaStone = null;

    return clone.Id ? clone : null;
}

function getInventoryItemDefinitions() {
    const definitions = [];
    const seen = new Set();

    [...((state.contenu && Array.isArray(state.contenu.Items)) ? state.contenu.Items : []), ...LEGACY_ITEM_DEFINITIONS].forEach(item => {
        const normalized = normalizeItemDefinition(item);

        if (!normalized || seen.has(normalized.Id)) return;

        seen.add(normalized.Id);
        definitions.push(normalized);
    });

    return definitions;
}

function getItemDefinition(itemId) {
    const id = String(itemId || "").trim();

    return getInventoryItemDefinitions().find(item => item.Id === id) || null;
}

function getItemDefinitionByName(name) {
    const value = String(name || "").trim();

    return getInventoryItemDefinitions().find(item => item.Nom === value || item.Id === value) || null;
}

function isLegacyInventoryItem(itemId) {
    return ["bandage", "force", "armor", "totem"].includes(String(itemId || ""));
}

function getLegacyInventoryQuantity(itemId) {
    switch (String(itemId || "")) {
        case "bandage": return Math.max(0, Math.floor(Number(state.itemBandage) || 0));
        case "force": return Math.max(0, Math.floor(Number(state.itemPotionForce) || 0));
        case "armor": return Math.max(0, Math.floor(Number(state.itemArmor) || 0));
        case "totem": return Math.max(0, Math.floor(Number(state.itemTotem) || 0));
        default: return 0;
    }
}

function setLegacyInventoryQuantity(itemId, quantity) {
    const value = Math.max(0, Math.floor(Number(quantity) || 0));

    switch (String(itemId || "")) {
        case "bandage": state.itemBandage = value; break;
        case "force": state.itemPotionForce = value; break;
        case "armor": state.itemArmor = value; break;
        case "totem": state.itemTotem = value; break;
    }

    return value;
}

function getItemQuantity(itemId) {
    const id = String(itemId || "").trim();

    if (isLegacyInventoryItem(id)) return getLegacyInventoryQuantity(id);

    if (!state.inventory || typeof state.inventory !== "object" || Array.isArray(state.inventory)) {
        state.inventory = {};
    }

    return Math.max(0, Math.floor(Number(state.inventory[id]) || 0));
}

function setItemQuantity(itemId, quantity) {
    const id = String(itemId || "").trim();

    if (!id) return 0;

    const definition = getItemDefinition(id);

    if (!definition) return 0;

    const max = Math.max(1, Math.floor(Number(definition.QuantiteMax) || 999));
    const value = Math.min(max, Math.max(0, Math.floor(Number(quantity) || 0)));

    if (isLegacyInventoryItem(id)) {
        return setLegacyInventoryQuantity(id, value);
    }

    if (!state.inventory || typeof state.inventory !== "object" || Array.isArray(state.inventory)) {
        state.inventory = {};
    }

    if (value > 0) state.inventory[id] = value;
    else delete state.inventory[id];

    return value;
}

function addItemToInventory(itemId, quantity = 1) {
    const definition = getItemDefinition(itemId);

    if (!definition) {
        console.warn("Item introuvable :", itemId);

        return 0;
    }

    return setItemQuantity(definition.Id, getItemQuantity(definition.Id) + Number(quantity || 0));
}

function removeItemFromInventory(itemId, quantity = 1) {
    return setItemQuantity(itemId, getItemQuantity(itemId) - Math.max(0, Number(quantity) || 0));
}

function normalizeInventoryState() {
    if (!state.inventory || typeof state.inventory !== "object" || Array.isArray(state.inventory)) {
        state.inventory = {};
    }

    const normalized = {};

    Object.entries(state.inventory).forEach(([id, quantity]) => {
        const definition = getItemDefinition(id);

        if (!definition) return;

        const value = Math.max(0, Math.min(definition.QuantiteMax, Math.floor(Number(quantity) || 0)));

        if (value > 0) normalized[definition.Id] = value;
    });

    state.inventory = normalized;
}

function resolveItemEffects(item) {
    if (!item || !Array.isArray(item.Effets)) return [];

    return item.Effets.map(reference => {
        if (!reference) return null;

        const effectId = String(reference.EffetId || reference.Id || reference.Nom || "").trim();

        const source = (state.contenu?.Effets || []).find(effect =>
            effect && (
                String(effect.Id || "").trim() === effectId ||
                String(effect.Nom || "").trim() === effectId
            )
        );

        if (!source) {
            console.warn("Effet d'item introuvable :", effectId || reference.Nom || "inconnu");

            return null;
        }

        const effect = structuredClone(source);

        if (reference.Valeur !== undefined && reference.Valeur !== "") effect.Valeur = Number(reference.Valeur);

        if (reference.Tours !== undefined && reference.Tours !== "") effect.Tours = Math.max(1, Math.floor(Number(reference.Tours) || 1));

        if (reference.Cible) effect.Cible = reference.Cible;

        return effect;
    }).filter(Boolean);
}

function isMegaStoneItem(item) {
    return !!item && (
        String(item.Categorie || "").toLowerCase() === "méga stone" ||
        String(item.Categorie || "").toLowerCase() === "mega stone" ||
        item.MegaStone
    );
}

function canUseItem(item, context = "battle") {
    if (!item || getItemQuantity(item.Id) <= 0) return { ok: !1, reason: "Quantité indisponible." };

    if (context === "battle" && item.Utilisable === !1) {
        return { ok: !1, reason: "Cet item ne peut pas être utilisé en combat." };
    }

    if (context !== "battle" && item.UtilisableHorsCombat !== !0) {
        return { ok: !1, reason: "Cet item ne peut pas être utilisé hors combat." };
    }

    if (String(item.Categorie || "").toLowerCase() === "nourritures") {
        const animals = typeof getCapturedAnimals === "function" ? getCapturedAnimals() : [];
        if (!animals.length) return { ok: !1, reason: "Il faut avoir au moins un animal." };
        const value = Number(item.Valeur);
        if (!Number.isFinite(value) || value <= 0) return { ok: !1, reason: "Cette nourriture n'a pas de valeur d'XP valide." };
        return { ok: !0 };
    }

    if (item.Categorie === "Attraper" && typeof canCaptureAnimalItem === "function") return canCaptureAnimalItem(item, context);

    if (isMegaStoneItem(item)) {
        if (context !== "battle") return { ok: !1, reason: "La Méga Stone s'utilise pendant un combat." };

        if (typeof canMegaEvolve !== "function") {
            return { ok: !1, reason: "La Méga-Évolution n'est pas disponible." };
        }

        const mega = canMegaEvolve(item);

        return mega;
    }

    const effects = resolveItemEffects(item);

    if (effects.length === 0) {
        return { ok: !1, reason: "Cet item n'a aucun effet utilisable." };
    }

    return { ok: !0 };
}

function isInventoryOpen() {
    const modal = document.getElementById("item-modal");
    return !!(modal && !modal.classList.contains("hidden"));
}

function openInventoryModal(context = "battle") {
    const modal = document.getElementById("item-modal");

    if (!modal) return;

    if (context === "battle" && typeof canPlayerAct === "function" && !canPlayerAct()) return;

    if (typeof closeAttackModal === "function") closeAttackModal();

    modal.dataset.context = context;
    modal.classList.remove("hidden");

    renderInventoryModal();
}

function closeItemModal() {
    const modal = document.getElementById("item-modal");

    if (modal) modal.classList.add("hidden");

    if (typeof updateActionButtons === "function") updateActionButtons();
}

function renderInventoryModal() {
    const modal = document.getElementById("item-modal");

    if (!modal) return;

    const context = modal.dataset.context || "battle";
    const list = document.getElementById("inventory-list");
    const details = document.getElementById("inventory-details");
    const title = document.getElementById("inventory-context-title");

    if (!list || !details) return;

    if (title) title.textContent = context === "battle" ? "Inventaire de combat" : "Inventaire";

    list.innerHTML = "";

    const definitions = getInventoryItemDefinitions().filter(item => getItemQuantity(item.Id) > 0);

    if (definitions.length === 0) {
        list.innerHTML = '<p class="inventory-empty">Votre inventaire est vide.</p>';
        details.innerHTML = '<p class="inventory-empty">Aucun item sélectionné.</p>';
        return;
    }

    definitions.forEach(item => {
        const quantity = getItemQuantity(item.Id);
        const button = document.createElement("button");

        button.type = "button";
        button.className = "inventory-entry";
        button.innerHTML = `
            <span class="inventory-entry-icon">${item.Image ? `<img src="${escapeHtml(item.Image)}" alt="">` : "✦"}</span>
            <span class="inventory-entry-text"><strong>${escapeHtml(item.Nom)}</strong><small>×${quantity}</small></span>
        `;

        button.addEventListener("mouseenter", () => renderInventoryDetails(item, context));
        button.addEventListener("focus", () => renderInventoryDetails(item, context));
        button.addEventListener("click", () => renderInventoryDetails(item, context));

        list.appendChild(button);
    });

    renderInventoryDetails(definitions[0], context);
}

function renderInventoryDetails(item, context) {
    const details = document.getElementById("inventory-details");

    if (!details || !item) return;

    const quantity = getItemQuantity(item.Id);
    const usage = canUseItem(item, context);

    details.innerHTML = `
        <div class="inventory-detail-image">${item.Image ? `<img src="${escapeHtml(item.Image)}" alt="">` : "✦"}</div>
        <h3>${escapeHtml(item.Nom)}</h3>
        <p>${escapeHtml(item.Description || "Aucune description.")}</p>
        <div class="inventory-detail-meta">
            <span>Quantité : ${quantity}</span>
            <span>Catégorie : ${escapeHtml(item.Categorie || "Autre")}</span>
        </div>
        <div class="inventory-detail-actions">
            <button type="button" class="primary-button" id="inventory-use-btn" ${usage.ok ? "" : "disabled"}>${isMegaStoneItem(item) ? "Méga-évoluer" : "Utiliser"}</button>
            <span class="inventory-use-note">${escapeHtml(usage.ok ? "Disponible." : usage.reason)}</span>
        </div>
    `;

    const useButton = document.getElementById("inventory-use-btn");

    if (useButton) {
        useButton.addEventListener("click", () => useInventoryItem(item.Id, context));
    }
}

async function useInventoryItem(itemId, context = "battle") {
    const item = getItemDefinition(itemId);

    if (!item) return;

    const usage = canUseItem(item, context);

    if (!usage.ok) {
        showToast("Item indisponible", usage.reason);

        return;
    }

    if (context === "battle" && typeof canPlayerAct === "function" && !canPlayerAct()) return;

    if (String(item.Categorie || "").toLowerCase() === "nourritures") {
        const value = Math.max(0, Number(item.Valeur) || 0);
        const result = typeof gainAnimalXp === "function" ? gainAnimalXp(value, state.selectedAnimalId) : null;
        if (!result) {
            showToast("Nourriture indisponible", "Aucun animal sélectionné.");
            return;
        }

        if (item.Consommable !== !1) removeItemFromInventory(item.Id, 1);
        addLog(result.levelsGained > 0
            ? item.Nom + " : +" + value + " XP à " + result.instance.AnimalNom + " (niveau " + result.instance.Niveau + ")."
            : item.Nom + " : +" + value + " XP à " + result.instance.AnimalNom + ".", "reward");
        showToast(item.Nom, "+" + value + " XP pour " + result.instance.AnimalNom + ".");

        closeItemModal();
        updateBattleUI();
        if (context === "battle") {
            state.busy = !1;
            state.turn = "monster";
            updateActionButtons();
            await sleep(400);
            if (!state.battleOver && typeof monsterTurn === "function") await monsterTurn();
        }
        return;
    }

    if (item.Categorie === "Attraper") {
        closeItemModal();
        state.busy = context === "battle";

        const result = typeof captureBattleAnimal === "function" ? captureBattleAnimal(item) : { ok: false, reason: "Le système de capture est indisponible." };

        if (!result.ok) {
            if (context === "battle") state.busy = !1;
            showToast("Capture impossible", result.reason || "Impossible d'utiliser cet item.");
            updateActionButtons();
            return;
        }

        if (item.Consommable !== !1) removeItemFromInventory(item.Id, 1);

        addLog(result.captured ? item.Nom + " a réussi la capture." : item.Nom + " n'a pas réussi la capture.", "system");
        renderInventoryModal();
        updateBattleUI();

        if (context === "battle") {
            state.busy = !1;

            if (result.captured) {
                updateActionButtons();
                if (typeof finishBattleIfNoLivingMonsters === "function") {
                    await finishBattleIfNoLivingMonsters();
                }
                return;
            }

            state.turn = "monster";
            updateActionButtons();
            await sleep(400);
            if (!state.battleOver && typeof monsterTurn === "function") await monsterTurn();
        }
        return;
    }

    if (isMegaStoneItem(item)) {
        closeItemModal();
        state.busy = !0;
        updateActionButtons();

        const result = await activateMegaEvolution(item);

        if (result && result.ok) {
            state.busy = !1;
            state.turn = "monster";

            updateBattleUI();
            updateActionButtons();

            await sleep(400);

            if (!state.battleOver) await monsterTurn();
        } else {
            state.busy = !1;
            updateActionButtons();
        }

        return;
    }

    if (context === "battle") state.busy = !0;

    const effects = resolveItemEffects(item);

    try {
        if (typeof applyAttackEffects === "function") {
            applyAttackEffects(effects, typeof getSelectedMonster === "function" ? getSelectedMonster() : null, 1, 1, !1, null, !1, item);
        }

        if (item.Consommable !== !1) removeItemFromInventory(item.Id, 1);

        addLog(`${item.Nom} a été utilisé.`, "system");
        showToast(item.Nom, "Item utilisé.");

        closeItemModal();
        updateBattleUI();

        if (context === "battle") {
            state.busy = !1;
            state.turn = "monster";
            updateActionButtons();
            await sleep(400);

            if (!state.battleOver) await monsterTurn();
        }
    } catch (error) {
        if (context === "battle") state.busy = !1;

        console.error("Utilisation d'item impossible :", error);
        showToast("Item indisponible", "L'effet n'a pas pu être appliqué.");
        updateActionButtons();
    }
}

function syncInventoryBeforeSave() {
    normalizeInventoryState();
}

function addInventoryWorldButton() {
    const button = document.getElementById("inventory-world-btn");

    if (!button || button.dataset.bound === "1") return;

    button.dataset.bound = "1";
    button.addEventListener("click", () => openInventoryModal("world"));
}

function initItemSystem() {
    normalizeInventoryState();
    addInventoryWorldButton();
}

document.addEventListener("DOMContentLoaded", initItemSystem);