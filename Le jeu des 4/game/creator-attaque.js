"use strict";

/* ============================================================
   game/creator-attaque.js — Créateur : attaques
   (ex-game.js : formulaire (1–2 types d'énergie, coût,
   effets/statuts incorporés), soumission, liaison
   attaque↔personnage, propagation de renommage)
============================================================ */

/* ============================================================
   CHECKLISTS GÉNÉRIQUES (EFFETS / STATUTS)
============================================================ */

function renderDevNameChecklist(containerSelector, type, selected) {
    const container = $(containerSelector);

    if (!container) return;

    const items = state.contenu?.[type] || [];

    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = `<p class="dev-info-note" style="margin:6px;">Aucun ${type === "Effets" ? "effet" : "statut"} existant. Crée-en d'abord dans la catégorie « ${type} ».</p>`;

        return;
    }

    items.forEach(item => {
        if (!item || !item.Nom) return;

        const label = document.createElement("label");

        label.className = "dev-check-item";

        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";

        checkbox.checked = selected.includes(item.Nom);

        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                if (!selected.includes(item.Nom)) selected.push(item.Nom);
            } else {
                const i = selected.indexOf(item.Nom);

                if (i >= 0) selected.splice(i, 1);
            }
        });

        label.appendChild(checkbox);

        const span = document.createElement("span");

        span.innerHTML = `<strong>${escapeHtml(item.Nom)}</strong> — ${escapeHtml(getDevObjectSummary(type, item))}`;

        label.appendChild(span);

        container.appendChild(label);
    });
}

/* ============================================================
   LIAISON ATTAQUE ↔ PERSONNAGE
============================================================ */

function addAttackToPersonnage(personnageNom, attackNom) {
    const personnage = (state.contenu?.Personnages || []).find(p => p && p.Nom === personnageNom);

    if (!personnage) return;

    if (!Array.isArray(personnage.Attaques)) personnage.Attaques = [];

    if (!personnage.Attaques.includes(attackNom)) {
        personnage.Attaques.push(attackNom);

        persistCreatorObject("Personnages", personnage);
    }
}

function removeAttackFromPersonnage(personnageNom, attackNom) {
    const personnage = (state.contenu?.Personnages || []).find(p => p && p.Nom === personnageNom);

    if (!personnage || !Array.isArray(personnage.Attaques)) return;

    const i = personnage.Attaques.indexOf(attackNom);

    if (i >= 0) {
        personnage.Attaques.splice(i, 1);

        persistCreatorObject("Personnages", personnage);
    }
}

function propagateAttackRename(oldNom, newNom) {
    (state.contenu?.Personnages || []).forEach(personnage => {
        if (personnage && Array.isArray(personnage.Attaques) && personnage.Attaques.includes(oldNom)) {
            personnage.Attaques = personnage.Attaques.map(nom => nom === oldNom ? newNom : nom);

            persistCreatorObject("Personnages", personnage);
        }
    });
}

/* ============================================================
   FORMULAIRE
============================================================ */

function startAttackCreator(existing) {
    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    const personnages = (state.contenu?.Personnages || []).filter(p => p && p.Nom);

    if (personnages.length === 0) {
        panel.innerHTML = `<p class="dev-info-note">Tu dois créer au moins un personnage avant de créer une attaque.</p><div class="dev-form-actions"><button type="button" class="secondary-button" id="dev-retour-btn">← Retour</button></div>`;

        $("#dev-retour-btn").addEventListener("click", showDevMenuMain);

        return;
    }

    const energies = getCreatorEnergyNames();

    if (energies.length === 0) {
        panel.innerHTML = `<p class="dev-info-note">Aucun type d'énergie n'existe. Crée d'abord une énergie dans la catégorie « Energies ».</p><div class="dev-form-actions"><button type="button" class="secondary-button" id="dev-retour-btn">← Retour</button></div>`;

        $("#dev-retour-btn").addEventListener("click", showDevMenuMain);

        return;
    }

    const isEdit = Boolean(existing);

    const isStockEdit = isEdit && isStockContentName("Attaques", existing.Nom);

    const personnageOptions = personnages.map(p => `<option value="${escapeHtml(p.Nom)}"${existing && existing.Personnage === p.Nom ? " selected" : ""}>${escapeHtml(p.Nom)}</option>`).join("");

    const energyOptions = energies.map(nom => `<option value="${escapeHtml(nom)}"${existing && existing.TypeEnergie === nom ? " selected" : ""}>${escapeHtml(nom)}</option>`).join("");

    const secondOptions = `<option value="">— Aucune (un seul type) —</option>` + energies.map(nom => `<option value="${escapeHtml(nom)}"${existing && existing.TypeEnergie2 === nom ? " selected" : ""}>${escapeHtml(nom)}</option>`).join("");

    let selectedEffets = isEdit && Array.isArray(existing.Effets) ? existing.Effets.map(e => e && e.Nom).filter(Boolean) : [];

    let selectedStatuts = isEdit && Array.isArray(existing.Statuts) ? existing.Statuts.map(s => s && s.Nom).filter(Boolean) : [];

    let selectedVfx = isEdit && Array.isArray(existing.EffetsVisuels) ? existing.EffetsVisuels.slice() : [];

    panel.innerHTML = `
        <h3 style="margin-bottom:12px;">${isEdit ? `Modifier l'attaque « ${escapeHtml(existing.Nom)} »` : "Nouvelle attaque"}</h3>
        <p class="dev-info-note">${isEdit ? (isStockEdit ? "Attaque d'origine:les modifications sont enregistrées dans la sauvegarde et remplacent l'original au chargement. Le nom ne peut pas être changé." : "Modifie ton attaque créée.") : "Une attaque peut avoir un ou deux types d'énergie(jamais plus de deux).Ses effets et statuts sont choisis dans les listes existantes."}</p>
        <div class="input-group"><label for="dev-a-nom">Nom de l'attaque</label><input type="text" id="dev-a-nom" maxlength="40" autocomplete="off" value="${escapeHtml(existing ? existing.Nom : "")}"${isStockEdit ? " disabled" : ""}></div>
        <div class="input-group"><label for="dev-a-description">Description</label><textarea id="dev-a-description" rows="3" style="width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius-small);background:var(--bg-secondary);color:var(--text);outline:none;resize:vertical;">${escapeHtml(existing ? existing.Description || "" : "")}</textarea></div>
        <div class="input-group"><label for="dev-a-personnage">Personnage propriétaire</label><select id="dev-a-personnage">${personnageOptions}</select></div>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-a-energie">Type d'énergie 1</label><select id="dev-a-energie">${energyOptions}</select></div>
            <div class="input-group"><label for="dev-a-energie2">Type d'énergie 2 (optionnel)</label><select id="dev-a-energie2">${secondOptions}</select></div>
        </div>
        <div class="input-group"><label for="dev-a-cout">Coût en énergie</label><input type="number" id="dev-a-cout" value="${existing ? existing.CoutEnergie : 5}" min="0" step="1"></div>
                <label class="dev-check-item" style="margin-top:10px;"><input type="checkbox" id="dev-a-maxcoups-active"${existing && existing.NombreMaxCoups ? " checked" : ""}><span>Nombre max de coup ?</span></label>
        <div id="dev-a-maxcoups-config" class="${existing && existing.NombreMaxCoups ? "" : "hidden"}">
            <div class="input-group"><label for="dev-a-maxcoups">Nombre maximum de coups (roulettes de cette attaque)</label><input type="number" id="dev-a-maxcoups" value="${existing && existing.NombreMaxCoups ? existing.NombreMaxCoups : 1}" min="1" step="1"></div>
        </div>
        <div class="dev-section-title">Effets incorporés</div>
        <div id="dev-a-effets" class="dev-check-list"></div>
        <div class="dev-section-title">Statuts attachés</div>
        <div id="dev-a-statuts" class="dev-check-list"></div>
        <div class="dev-section-title">Effets visuels attachés</div>
        <div id="dev-a-effets-visuels" class="dev-check-list"></div>
        <div class="dev-form-actions">
            <button type="button" id="dev-a-cancel" class="secondary-button">Annuler</button>
            <button type="button" id="dev-a-save" class="primary-button">${isEdit ? "Enregistrer" : "Créer l'attaque"}</button>
        </div>`;

    renderDevNameChecklist("#dev-a-effets", "Effets", selectedEffets);

    renderDevNameChecklist("#dev-a-statuts", "Statuts", selectedStatuts);

    renderDevNameChecklist("#dev-a-effets-visuels", "EffetsVisuels", selectedVfx);

    $("#dev-a-maxcoups-active").addEventListener("change", () => {
        $("#dev-a-maxcoups-config").classList.toggle("hidden", !$("#dev-a-maxcoups-active").checked);
    });

    $("#dev-a-cancel").addEventListener("click", () => showDevCategoryMenu("Attaques"));

    $("#dev-a-save").addEventListener("click", () => submitAttackCreator(existing, () => selectedEffets, () => selectedStatuts));

    $("#dev-a-save").addEventListener("click", () => submitAttackCreator(existing, () => selectedEffets, () => selectedStatuts, () => selectedVfx));
}

/* ============================================================
   SOUMISSION
============================================================ */

function submitAttackCreator(existing, getSelectedEffets, getSelectedStatuts, getSelectedVfx) {
    const nom = $("#dev-a-nom").value.trim();

    if (!nom) {
        showToast("Nom invalide", "Le nom ne peut pas être vide.");

        return;
    }

    const isEdit = Boolean(existing);

    const isStockEdit = isEdit && isStockContentName("Attaques", existing.Nom);

    if (isStockEdit && nom !== existing.Nom) {
        showToast("Renommage impossible", "Une attaque d'origine ne peut pas être renommée(références par nom).");

        return;
    }

    if ((!isEdit || nom !== existing.Nom) && creatorNameExists("Attaques", nom)) {
        showToast("Nom déjà utilisé", `Une attaque nommée « ${nom} » existe déjà.`);

        return;
    }

    const description = $("#dev-a-description").value.trim();

    const personnageNom = $("#dev-a-personnage").value;

    if (!personnageNom) {
        showToast("Personnage manquant", "Choisis le personnage propriétaire de l'attaque.");

        return;
    }

    const typeEnergie = $("#dev-a-energie").value;

    const typeEnergie2 = $("#dev-a-energie2").value;

    if (typeEnergie2 && typeEnergie2 === typeEnergie) {
        showToast("Types identiques", "Une attaque ne peut avoir que deux types d'énergie différents(1 ou 2 maximum).");

        return;
    }

    const coutEnergie = Math.max(0, lireIntInput("#dev-a-cout", 5));

    const maxCoupsActive = $("#dev-a-maxcoups-active").checked;

    let nombreMaxCoups = null;

    if (maxCoupsActive) {
        nombreMaxCoups = lireIntInput("#dev-a-maxcoups", 1);

        if (!Number.isInteger(nombreMaxCoups) || nombreMaxCoups < 1) {
            showToast("Nombre de coups invalide", "Le nombre maximum de coups doit être un entier ≥ 1.");

            return;
        }
    }

    const effets = (getSelectedEffets ? getSelectedEffets() : []).map(nomEffet => {
        const effet = (state.contenu?.Effets || []).find(e => e && e.Nom === nomEffet);

        return effet ? structuredClone(effet) : null;
    }).filter(Boolean);

    const statuts = (getSelectedStatuts ? getSelectedStatuts() : []).map(nomStatut => {
        const statut = (state.contenu?.Statuts || []).find(s => s && s.Nom === nomStatut);

        return statut ? structuredClone(statut) : null;
    }).filter(Boolean);

    const effetsVisuels = (getSelectedVfx ? getSelectedVfx() : []).slice();

    const attaque = {
        Nom: nom,
        Description: description,
        Personnage: personnageNom,
        TypeEnergie: typeEnergie,
        CoutEnergie: coutEnergie,
        Effets: effets,
        Statuts: statuts,
    };

    if (typeEnergie2) {
        attaque.TypeEnergie2 = typeEnergie2;
    }

    if (effetsVisuels.length > 0) {
        attaque.EffetsVisuels = effetsVisuels;
    }

    if (nombreMaxCoups !== null) {
        attaque.NombreMaxCoups = nombreMaxCoups;
    }

    if (isEdit) {
        if (!isStockEdit && nom !== existing.Nom) {
            propagateAttackRename(existing.Nom, nom);
        }

        if (existing.Personnage !== personnageNom) {
            removeAttackFromPersonnage(existing.Personnage, existing.Nom);
        }

        addAttackToPersonnage(personnageNom, nom);

        persistCreatorObject("Attaques", attaque);

        syncCreatorObjectRuntime("Attaques", attaque);

        saveCreatorContenu();

        showToast("Attaque modifiée", `« ${nom} » a été mise à jour.`);

        showDevCategoryMenu("Attaques");

        return;
    }

    getCreatorContenu().Attaques.push(attaque);

    syncCreatorObjectRuntime("Attaques", attaque);

    addAttackToPersonnage(personnageNom, nom);

    saveCreatorContenu();

    showToast("Attaque créée", `« ${nom} » ajoutée à ${personnageNom}.`);

    showDevCategoryMenu("Attaques");
}