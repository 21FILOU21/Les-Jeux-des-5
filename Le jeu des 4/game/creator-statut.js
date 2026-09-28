"use strict";

/* ============================================================
   game/creator-statut.js — Créateur : statuts
   (ex-game.js : formulaire + soumission des statuts)
   Note (comportement existant) : les statuts sont stockés et
   attachables aux attaques ; le moteur de combat navigateur
   n'exécute pas encore ContreAttaque / RefletDegats.
============================================================ */

function startStatutCreator(existing) {
    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    const isEdit = Boolean(existing);

    const isStockEdit = isEdit && isStockContentName("Statuts", existing.Nom);

    const typeOptions = CREATOR_STATUT_TYPES.map(t => `<option value="${escapeHtml(t)}"${existing && existing.TypeStatut === t ? " selected" : ""}>${escapeHtml(t)}</option>`).join("");

    panel.innerHTML = `<h3 style="margin-bottom:12px;">${isEdit ? `Modifier le statut « ${escapeHtml(existing.Nom)} »` : "Nouveau statut"}</h3><p class="dev-info-note">Mêmes attributs que le créateur d'origine. Les statuts sont stockés, sauvegardés et attachables aux attaques ; le moteur de combat navigateur n'exécute pas encore leurs comportements(ContreAttaque,RefletDegats).</p><div class="input-group"><label for="dev-s-nom">Nom du statut</label><input type="text" id="dev-s-nom" maxlength="40" autocomplete="off" value="${escapeHtml(existing ? existing.Nom : "")}"${isStockEdit ? " disabled" : ""}></div><div class="input-group"><label for="dev-s-type">Type de statut</label><select id="dev-s-type">${typeOptions}</select></div><div class="dev-form-row"><div class="input-group"><label for="dev-s-chance">Chance d'application (%)</label><input type="number" id="dev-s-chance" value="${existing ? existing.ChanceApplication : 100}" min="0" max="100" step="1"></div>
            <div class="input-group"><label for="dev-s-duree">Durée (tours)</label><input type="number" id="dev-s-duree" value="${existing ? existing.DureeTours : 2}" min="1" step="1"></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-s-declenchement">Chance de déclenchement (%)</label><input type="number" id="dev-s-declenchement" value="${existing ? existing.ChanceDeclenchement : 50}" min="0" max="100" step="1"></div>
            <div class="input-group"><label for="dev-s-riposte">Pourcentage de riposte (%)</label><input type="number" id="dev-s-riposte" value="${existing ? existing.PourcentageRiposte : 50}" min="0" max="100" step="1"></div>
        </div>
        <div class="dev-form-actions">
            <button type="button" id="dev-s-cancel" class="secondary-button">Annuler</button>
            <button type="button" id="dev-s-save" class="primary-button">${isEdit ? "Enregistrer" : "Créer le statut"}</button>
        </div>`;

    $("#dev-s-cancel").addEventListener("click", () => showDevCategoryMenu("Statuts"));

    $("#dev-s-save").addEventListener("click", () => submitStatutCreator(existing));
}

function submitStatutCreator(existing) {
    const nom = $("#dev-s-nom").value.trim();

    if (!nom) {
        showToast("Nom invalide", "Le nom ne peut pas être vide.");

        return;
    }

    const isEdit = Boolean(existing);

    const isStockEdit = isEdit && isStockContentName("Statuts", existing.Nom);

    if (isStockEdit && nom !== existing.Nom) {
        showToast("Renommage impossible", "Un statut d'origine ne peut pas être renommé(références par nom).");

        return;
    }

    if ((!isEdit || nom !== existing.Nom) && creatorNameExists("Statuts", nom)) {
        showToast("Nom déjà utilisé", `Un statut nommé « ${nom} » existe déjà.`);

        return;
    }

    const typeStatut = $("#dev-s-type").value;

    const chanceApplication = clamp(lireDoubleInput("#dev-s-chance", 100), 0, 100);

    const dureeTours = Math.max(1, lireIntInput("#dev-s-duree", 2));

    const chanceDeclenchement = clamp(lireDoubleInput("#dev-s-declenchement", 50), 0, 100);

    const pourcentageRiposte = clamp(lireDoubleInput("#dev-s-riposte", 50), 0, 100);

    const statut = {
        Nom: nom,
        TypeStatut: typeStatut,
        ChanceApplication: chanceApplication,
        DureeTours: dureeTours,
        ChanceDeclenchement: chanceDeclenchement,
        PourcentageRiposte: pourcentageRiposte
    };

    if (isEdit) {
        persistCreatorObject("Statuts", statut);

        syncCreatorObjectRuntime("Statuts", statut);

        saveCreatorContenu();

        showToast("Statut modifié", `« ${nom} » a été mis à jour.`);
    } else {
        getCreatorContenu().Statuts.push(statut);

        syncCreatorObjectRuntime("Statuts", statut);

        saveCreatorContenu();

        showToast("Statut créé", `« ${nom} » (${typeStatut}) a été ajouté.`);
    }

    showDevCategoryMenu("Statuts");
}