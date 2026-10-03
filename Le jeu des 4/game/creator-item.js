"use strict";

/* ============================================================
   game/creator-item.js — Créateur d'items
============================================================ */

function getCreatorItemEffectOptions(selectedId = "") {
    return (state.contenu?.Effets || []).filter(effect => effect && (effect.Id || effect.Nom)).map(effect => {
        const id = String(effect.Id || effect.Nom);

        return `<option value="${escapeHtml(id)}"${id === selectedId ? " selected" : ""}>${escapeHtml(effect.Nom || id)}</option>`;
    }).join("");
}

function renderCreatorItemEffectRows(effects) {
    return (Array.isArray(effects) ? effects : []).map((effect, index) => `
        <div class="dev-item-effect-row" data-item-effect-row="${index}">
            <select data-item-effect-id="${index}">
                ${getCreatorItemEffectOptions(effect.EffetId || effect.Id || effect.Nom)}
            </select>
            <input type="number" step="any" data-item-effect-value="${index}" value="${escapeHtml(effect.Valeur ?? "")}" placeholder="Valeur">
            <input type="number" min="1" step="1" data-item-effect-turns="${index}" value="${escapeHtml(effect.Tours ?? "")}" placeholder="Tours">
            <select data-item-effect-target="${index}">
                ${CREATOR_EFFECT_TARGETS.map(target => `<option value="${escapeHtml(target)}"${effect.Cible === target ? " selected" : ""}>${escapeHtml(target)}</option>`).join("")}
            </select>
            <button type="button" class="secondary-button" data-item-effect-remove="${index}">×</button>
        </div>
    `).join("");
}

function startItemCreator(existing) {
    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");
    panel.classList.remove("hidden");

    const isEdit = Boolean(existing);
    const item = existing || {};
    const categories = ["Soin", "Combat", "Attraper", "Évolution", "Méga Stone", "Exploration", "Clé", "Récompense", "Autre"];
    const categoryOptions = categories.map(category => `<option value="${escapeHtml(category)}"${item.Categorie === category ? " selected" : ""}>${escapeHtml(category)}</option>`).join("");
    const effectRows = renderCreatorItemEffectRows(item.Effets || []);

    panel.innerHTML = `
        <h3 style="margin-bottom:12px;">${isEdit ? `Modifier l'item « ${escapeHtml(item.Nom || item.Id)} »` : "Nouvel item"}</h3>

        <div class="input-group"><label for="dev-item-id">ID unique</label><input type="text" id="dev-item-id" maxlength="60" value="${escapeHtml(item.Id || "")}" placeholder="ex: mega-stone-flamme"></div>
        <div class="input-group"><label for="dev-item-nom">Nom</label><input type="text" id="dev-item-nom" maxlength="60" value="${escapeHtml(item.Nom || "")}"></div>
        <div class="input-group"><label for="dev-item-description">Description</label><textarea id="dev-item-description" rows="3">${escapeHtml(item.Description || "")}</textarea></div>

        <div class="input-group">
            <label>Image</label>
            <button type="button" class="secondary-button" id="dev-item-image-pick">Importer PNG/JPG</button>
            <input type="hidden" id="dev-item-image" value="${escapeHtml(item.Image || "")}">
            <div class="dev-image-preview-wrap"><img id="dev-item-image-preview" class="dev-image-preview ${item.Image ? "" : "hidden"}" src="${escapeHtml(item.Image || "")}" alt=""></div>
        </div>

        <div class="dev-form-row">
            <div class="input-group"><label for="dev-item-category">Catégorie</label><select id="dev-item-category">${categoryOptions}</select></div>
            <div class="input-group"><label for="dev-item-max">Quantité maximale</label><input type="number" id="dev-item-max" min="1" step="1" value="${Math.max(1, Math.floor(Number(item.QuantiteMax) || 999))}"></div>
        </div>

        <label class="dev-check-item"><input type="checkbox" id="dev-item-usable" ${item.Utilisable !== !1 ? "checked" : ""}> Utilisable en combat</label>
        <label class="dev-check-item"><input type="checkbox" id="dev-item-outside" ${item.UtilisableHorsCombat === !0 ? "checked" : ""}> Utilisable hors combat</label>
        <label class="dev-check-item"><input type="checkbox" id="dev-item-consumable" ${item.MegaStone ? (item.Consommable !== !1 ? "checked" : "") : (item.Categorie === "Méga Stone" ? "" : "checked")}> Consommer une unité à l'utilisation</label>
        <div id="dev-item-capture-config" class="${item.Categorie === "Attraper" ? "" : "hidden"}">
            <div class="input-group"><label for="dev-item-capture-chance">Valeur d'attrape (%)</label><input type="number" id="dev-item-capture-chance" min="0" max="100" step="any" value="${item.Categorie === "Attraper" ? (item.CaptureChance ?? item.Valeur ?? 10) : 10}"></div>
            <p class="dev-info-note">La Valeur d'attrape est directement exprimée en pourcentage : 1 = 1 %, 5 = 5 %, 100 = 100 %.</p>
        </div>

        <div class="dev-section-title">Effets</div>
        <div id="dev-item-effects">${effectRows || '<p class="dev-info-note">Aucun effet configuré.</p>'}</div>
        <button type="button" id="dev-item-add-effect" class="secondary-button">+ Ajouter un effet</button>

        <div class="dev-section-title">Méga Stone</div>
        <label class="dev-check-item"><input type="checkbox" id="dev-item-mega" ${item.MegaStone ? "checked" : ""}> Cet item est une Méga Stone</label>
        <div id="dev-item-mega-config" class="${item.MegaStone ? "" : "hidden"}">
            <p class="dev-info-note">La correspondance avec le personnage est définie dans la section Méga-Évolution du créateur de personnages. Par défaut, la pierre n'est pas consommée.</p>
        </div>

        <div class="dev-form-actions">
            <button type="button" id="dev-item-cancel" class="secondary-button">Annuler</button>
            <button type="button" id="dev-item-save" class="primary-button">${isEdit ? "Enregistrer" : "Créer l'item"}</button>
        </div>
    `;

    const imagePicker = $("#dev-image-input");

    $("#dev-item-image-pick").addEventListener("click", () => {
        if (imagePicker) {
            openDevImagePicker("#dev-item-image", "#dev-item-image-preview", "items", "#dev-item-nom");
        }
    });

    $("#dev-item-add-effect").addEventListener("click", () => {
        const container = $("#dev-item-effects");
        const row = document.createElement("div");

        row.className = "dev-item-effect-row";
        const index = container.querySelectorAll(".dev-item-effect-row").length;

        row.dataset.itemEffectRow = String(index);
        row.innerHTML = `
            <select data-item-effect-id="${index}">${getCreatorItemEffectOptions()}</select>
            <input type="number" step="any" data-item-effect-value="${index}" placeholder="Valeur">
            <input type="number" min="1" step="1" data-item-effect-turns="${index}" placeholder="Tours">
            <select data-item-effect-target="${index}">${CREATOR_EFFECT_TARGETS.map(target => `<option value="${escapeHtml(target)}">${escapeHtml(target)}</option>`).join("")}</select>
            <button type="button" class="secondary-button" data-item-effect-remove="${index}">×</button>`;
        row.querySelector("[data-item-effect-remove]").addEventListener("click", () => row.remove());
        container.appendChild(row);
    });

    panel.querySelectorAll("[data-item-effect-remove]").forEach(button => {
        button.addEventListener("click", () => button.closest(".dev-item-effect-row")?.remove());
    });

    $("#dev-item-category").addEventListener("change", () => {
        const category = $("#dev-item-category").value;
        const mega = category === "Méga Stone";
        $("#dev-item-capture-config").classList.toggle("hidden", category !== "Attraper");
        $("#dev-item-mega").checked = mega || $("#dev-item-mega").checked;
        if (mega) {
            $("#dev-item-usable").checked = true;
            $("#dev-item-consumable").checked = false;
        }
        $("#dev-item-mega-config").classList.toggle("hidden", !$("#dev-item-mega").checked);
    });

    $("#dev-item-mega").addEventListener("change", event => {
        $("#dev-item-mega-config").classList.toggle("hidden", !event.target.checked);
    });

    $("#dev-item-cancel").addEventListener("click", () => showDevCategoryMenu("Items"));

    $("#dev-item-save").addEventListener("click", () => submitItemCreator(existing));
}

function submitItemCreator(existing) {
    const idInput = $("#dev-item-id");
    const nom = $("#dev-item-nom").value.trim();
    const rawId = idInput.value.trim();

    if (!nom) {
        showToast("Item invalide", "Le nom ne peut pas être vide.");
        return;
    }

    const id = rawId.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

    if (!id) {
        showToast("ID invalide", "L'ID doit contenir des lettres, chiffres, tirets ou underscores.");
        return;
    }

    const existingId = existing ? String(existing.Id || existing.Nom || "") : "";

    if ((!existing || id !== existingId) && getInventoryItemDefinitions().some(item => item.Id === id)) {
        showToast("ID déjà utilisé", `L'ID « ${id} » existe déjà.`);
        return;
    }

    if ((!existing || nom !== existing.Nom) && creatorNameExists("Items", nom)) {
        showToast("Nom déjà utilisé", `Un item nommé « ${nom} » existe déjà.`);
        return;
    }

    const effects = [...document.querySelectorAll("#dev-item-effects .dev-item-effect-row")].map(row => ({
        EffetId: row.querySelector("[data-item-effect-id]")?.value || "",
        Valeur: row.querySelector("[data-item-effect-value]")?.value || "",
        Tours: row.querySelector("[data-item-effect-turns]")?.value || "",
        Cible: row.querySelector("[data-item-effect-target]")?.value || "Joueur"
    })).filter(effect => effect.EffetId);

    const category = $("#dev-item-category").value;
    const mega = $("#dev-item-mega").checked;

    const item = {
        Id: id,
        Nom: nom,
        Description: $("#dev-item-description").value.trim(),
        Image: $("#dev-item-image").value || "",
        Categorie: category,
        Effets: effects,
        QuantiteMax: Math.max(1, lireIntInput("#dev-item-max", 999)),
        Utilisable: $("#dev-item-usable").checked,
        UtilisableHorsCombat: $("#dev-item-outside").checked,
        Consommable: $("#dev-item-consumable").checked
    };

    if (category === "Attraper") {
        const captureChance = Number($("#dev-item-capture-chance").value);
        if (!Number.isFinite(captureChance) || captureChance < 0 || captureChance > 100) {
            showToast("Chance de capture invalide", "La chance doit être comprise entre 0 et 100 %.");
            return;
        }
        item.Valeur = captureChance;
        item.CaptureChance = captureChance;
        item.Utilisable = true;
        item.UtilisableHorsCombat = false;
        item.Consommable = true;
        item.Effets = [];
    }

    if (mega) {
        item.Categorie = "Méga Stone";
        item.Utilisable = true;
        item.MegaStone = { Consommable: item.Consommable };
    }

    const duplicateName = (state.contenu?.Items || []).find(other => other && other.Nom === nom && (!existing || other.Id !== existing.Id));

    if (duplicateName) {
        showToast("Nom déjà utilisé", `Un item nommé « ${nom} » existe déjà.`);
        return;
    }

    persistCreatorObject("Items", item);
    syncCreatorObjectRuntime("Items", item);
    saveCreatorContenu();

    showToast(existing ? "Item modifié" : "Item créé", `« ${nom} » est disponible dans l'inventaire et les coffres.`);
    showDevCategoryMenu("Items");
}