"use strict";

/* ============================================================
   game/creator-effet.js — Créateur : effets
   (ex-game.js : formulaire (type, valeur, tours, cible,
   délégation personnalisée), application aux attaques
   existantes, soumission)
============================================================ */

function startEffectCreator(existing) {
    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    const isEdit = Boolean(existing);

    const isStockEdit = isEdit && isStockContentName("Effets", existing.Nom);

    const typeOptions = CREATOR_EFFECT_TYPES.map(t => `<option value="${escapeHtml(t)}"${existing && existing.Type === t ? " selected" : ""}>${escapeHtml(t)}</option>`).join("");

    const cibleOptions = CREATOR_EFFECT_TARGETS.map(c => `<option value="${escapeHtml(c)}"${existing && existing.Cible === c ? " selected" : ""}>${escapeHtml(c)}</option>`).join("");

    const delegationOptions = `<option value="">— Aucun —</option>` + CREATOR_EFFECT_TYPES.filter(t => t !== "Effet personnalisé").map(t => `<option value="${escapeHtml(t)}"${existing && existing.EffetPersonnalise === t ? " selected" : ""}>${escapeHtml(t)}</option>`).join("");

    panel.innerHTML = `
        <h3 style="margin-bottom:12px;">${isEdit ? `Modifier l'effet « ${escapeHtml(existing.Nom)} »` : "Nouvel effet"}</h3>
        <p class="dev-info-note">Les types correspondent aux effets compris par le moteur de combat existant (dégâts, soin, brûlure, buffs, armure, énergie). « Effet personnalisé » délègue vers un autre type d'effet. La « Recharger l'énergie » ne s'applique qu'au joueur (comportement existant).</p>
        <div class="input-group"><label for="dev-eff-nom">Nom de l'effet</label><input type="text" id="dev-eff-nom" maxlength="40" autocomplete="off" value="${escapeHtml(existing ? existing.Nom : "")}"${isStockEdit ? " disabled" : ""}></div>
        <div class="input-group"><label for="dev-eff-type">Type</label><select id="dev-eff-type">${typeOptions}</select></div>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-eff-valeur">Valeur</label><input type="number" id="dev-eff-valeur" value="${existing ? existing.Valeur : 1}" step="any"></div>
            <div class="input-group"><label for="dev-eff-tours">Tours</label><input type="number" id="dev-eff-tours" value="${existing ? existing.Tours : 1}" min="1" step="1"></div>
        </div>
        <div class="input-group"><label for="dev-eff-cible">Cible</label><select id="dev-eff-cible">${cibleOptions}</select></div>
        <div id="dev-eff-delegation" class="hidden">
            <div class="input-group"><label for="dev-eff-delegation-select">Effet personnalisé : délègue vers</label><select id="dev-eff-delegation-select">${delegationOptions}</select></div>
        </div>
        ${isEdit ? `<label class="dev-check-item" style="margin-top:10px;"><input type="checkbox" id="dev-eff-apply"> Appliquer aussi aux attaques qui incorporent cet effet</label>` : ""}
        <div class="dev-form-actions">
            <button type="button" id="dev-eff-cancel" class="secondary-button">Annuler</button>
            <button type="button" id="dev-eff-save" class="primary-button">${isEdit ? "Enregistrer" : "Créer l'effet"}</button>
        </div>`;

    if (existing && existing.Type === "Effet personnalisé") {
        $("#dev-eff-delegation").classList.remove("hidden");
    }

    $("#dev-eff-type").addEventListener("change", () => {
        $("#dev-eff-delegation").classList.toggle("hidden", $("#dev-eff-type").value !== "Effet personnalisé");
    });

    $("#dev-eff-cancel").addEventListener("click", () => showDevCategoryMenu("Effets"));

    $("#dev-eff-save").addEventListener("click", () => submitEffectCreator(existing));
}

function applyEffectUpdateToAttacks(effet, matchNom) {
    let modified = 0;

    (state.contenu?.Attaques || []).forEach(attaque => {
        if (!attaque || !Array.isArray(attaque.Effets)) return;

        let touched = !1;

        attaque.Effets = attaque.Effets.map(e => {
            if (e && e.Nom === matchNom) {
                touched = !0;

                return structuredClone(effet);
            }

            return e;
        });

        if (touched) {
            modified++;

            persistCreatorObject("Attaques", attaque);
        }
    });

    return modified;
}

function submitEffectCreator(existing) {
    const nom = $("#dev-eff-nom").value.trim();

    if (!nom) {
        showToast("Nom invalide", "Le nom ne peut pas être vide.");

        return;
    }

    const isEdit = Boolean(existing);

    const isStockEdit = isEdit && isStockContentName("Effets", existing.Nom);

    if (isStockEdit && nom !== existing.Nom) {
        showToast("Renommage impossible", "Un effet d'origine ne peut pas être renommé(références par nom).");

        return;
    }

    if ((!isEdit || nom !== existing.Nom) && creatorNameExists("Effets", nom)) {
        showToast("Nom déjà utilisé", `Un effet nommé « ${nom} » existe déjà.`);

        return;
    }

    const type = $("#dev-eff-type").value;

    const valeur = lireDoubleInput("#dev-eff-valeur", 1);

    const tours = Math.max(1, lireIntInput("#dev-eff-tours", 1));

    const cible = $("#dev-eff-cible").value;

    const effet = {
        Nom: nom,
        Type: type,
        Valeur: valeur,
        Cible: cible,
        Tours: tours
    };

    if (type === "Effet personnalisé") {
        const delegation = $("#dev-eff-delegation-select").value;

        if (!delegation) {
            showToast("Délégation manquante", "Un effet personnalisé doit déléguer vers un autre type d'effet.");

            return;
        }

        effet.EffetPersonnalise = delegation;
    }

    if (isEdit) {
        persistCreatorObject("Effets", effet);

        syncCreatorObjectRuntime("Effets", effet);

        const applyCheckbox = $("#dev-eff-apply");

        if (applyCheckbox && applyCheckbox.checked) {
            const count = applyEffectUpdateToAttacks(effet, existing.Nom);

            if (count > 0) {
                showToast("Attaques mises à jour", `${count} attaque(s) incorporent maintenant cette version de l'effet.`);
            }
        }

        saveCreatorContenu();

        showToast("Effet modifié", `« ${nom}» a été mis à jour.`);
    } else {
        getCreatorContenu().Effets.push(effet);

        syncCreatorObjectRuntime("Effets", effet);

        saveCreatorContenu();

        showToast("Effet créé", `« ${nom}»(${type})a été ajouté.`);
    }

    showDevCategoryMenu("Effets");
}