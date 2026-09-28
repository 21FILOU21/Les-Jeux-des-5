"use strict";

/* ============================================================
   game/creator-energie.js — Créateur : types d'énergie
   (ex-game.js : formulaire (régénération, faiblesse/avantage),
   propagation de renommage d'énergie, soumission)
   Le système Faiblesse/Avantage (×0,8 / ×1,5) reste dans
   types.js — ce créateur ne fait que l'éditer.
============================================================ */

function propagateEnergyRename(oldNom, newNom) {
    (state.contenu?.Personnages || []).forEach(p => {
        if (p && p.TypeEnergie === oldNom) {
            p.TypeEnergie = newNom;

            persistCreatorObject("Personnages", p);
        }
    });

    (state.contenu?.Attaques || []).forEach(a => {
        if (!a) return;

        let touched = !1;

        if (a.TypeEnergie === oldNom) {
            a.TypeEnergie = newNom;

            touched = !0;
        }

        if (a.TypeEnergie2 === oldNom) {
            a.TypeEnergie2 = newNom;

            touched = !0;
        }

        if (touched) persistCreatorObject("Attaques", a);
    });

    (state.contenu?.Energies || []).forEach(e => {
        if (!e) return;

        let touched = !1;

        if (e.Faiblesse === oldNom) {
            e.Faiblesse = newNom;

            touched = !0;
        }

        if (e.Avantage === oldNom) {
            e.Avantage = newNom;

            touched = !0;
        }

        if (touched) persistCreatorObject("Energies", e);
    });
}

function startEnergyCreator(existing) {
    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    const isEdit = Boolean(existing);

    const isStockEdit = isEdit && isStockContentName("Energies", existing.Nom);

    const otherEnergies = (state.contenu?.Energies || []).map(e => e && e.Nom).filter(nom => nom && !(existing && existing.Nom === nom));

    const faiblesseOptions = `<option value="">— Aucune —</option>` + otherEnergies.map(nom => `<option value="${escapeHtml(nom)}"${existing && existing.Faiblesse === nom ? " selected" : ""}>${escapeHtml(nom)}</option>`).join("");

    const avantageOptions = `<option value="">— Aucune —</option>` + otherEnergies.map(nom => `<option value="${escapeHtml(nom)}"${existing && existing.Avantage === nom ? " selected" : ""}>${escapeHtml(nom)}</option>`).join("");

    panel.innerHTML = `<h3 style="margin-bottom:12px;">${isEdit ? `Modifier l'énergie « ${escapeHtml(existing.Nom)} »` : "Nouvelle énergie"}</h3><p class="dev-info-note">La faiblesse et l'avantage utilisent directement le système existant (×0,8 / ×1,5 dans getTypeMultiplier).</p>
        <div class="input-group"><label for="dev-e-nom">Nom de l'énergie</label><input type="text" id="dev-e-nom" maxlength="30" autocomplete="off" value="${escapeHtml(existing ? existing.Nom : "")}"${isStockEdit ? " disabled" : ""}></div><label class="dev-check-item" style="margin:10px 0;"><input type="checkbox" id="dev-e-auto"${existing && existing.RechargeAutomatique ? " checked" : ""}>Régénération automatique à chaque tour</label><div class="input-group"><label for="dev-e-gain">Gain par tour(si régénération automatique)</label><input type="number" id="dev-e-gain" value="${existing ? existing.GainParTour || 0 : 5}" min="0" step="1"></div><div class="dev-form-row"><div class="input-group"><label for="dev-e-faiblesse">Faiblesse(type qui résiste)</label><select id="dev-e-faiblesse">${faiblesseOptions}</select></div><div class="input-group"><label for="dev-e-avantage">Avantage(type qui subit)</label><select id="dev-e-avantage">${avantageOptions}</select></div></div><div class="dev-form-actions"><button type="button" id="dev-e-cancel" class="secondary-button">Annuler</button><button type="button" id="dev-e-save" class="primary-button">${isEdit ? "Enregistrer" : "Créer l'énergie"}</button></div>`;

    $("#dev-e-cancel").addEventListener("click", () => showDevCategoryMenu("Energies"));

    $("#dev-e-save").addEventListener("click", () => submitEnergyCreator(existing));
}

function submitEnergyCreator(existing) {
    const nom = $("#dev-e-nom").value.trim();

    if (!nom) {
        showToast("Nom invalide", "Le nom ne peut pas être vide.");

        return;
    }

    const isEdit = Boolean(existing);

    const isStockEdit = isEdit && isStockContentName("Energies", existing.Nom);

    if (isStockEdit && nom !== existing.Nom) {
        showToast("Renommage impossible", "Une énergie d'origine ne peut pas être renommée (références par nom).");

        return;
    }

    if ((!isEdit || nom !== existing.Nom) && creatorNameExists("Energies", nom)) {
        showToast("Nom déjà utilisé", `Une énergie nommée « ${nom}» existe déjà.`);

        return;
    }

    const autoRecharge = $("#dev-e-auto").checked;

    const gainParTour = autoRecharge ? Math.max(0, lireIntInput("#dev-e-gain", 5)) : 0;

    const faiblesse = $("#dev-e-faiblesse").value || null;

    const avantage = $("#dev-e-avantage").value || null;

    if (faiblesse === nom || avantage === nom) {
        showToast("Référence circulaire", "Une énergie ne peut pas être sa propre faiblesse ou son propre avantage.");

        return;
    }

    const energie = {
        Nom: nom,
        RechargeAutomatique: autoRecharge,
        GainParTour: gainParTour,
        Faiblesse: faiblesse,
        Avantage: avantage
    };

    if (isEdit) {
        if (!isStockEdit && nom !== existing.Nom) {
            propagateEnergyRename(existing.Nom, nom);
        }

        persistCreatorObject("Energies", energie);

        syncCreatorObjectRuntime("Energies", energie);

        saveCreatorContenu();

        showToast("Énergie modifiée", `« ${nom}» a été mise à jour.`);
    } else {
        getCreatorContenu().Energies.push(energie);

        syncCreatorObjectRuntime("Energies", energie);

        saveCreatorContenu();

        showToast("Énergie créée", `« ${nom}» a été ajoutée.`);
    }

    showDevCategoryMenu("Energies");
}