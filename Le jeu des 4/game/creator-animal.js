"use strict";

/* ============================================================
   game/creator-animal.js — Créateur d'animaux
============================================================ */

function startAnimalCreator(existing) {
    resetDevPanel();
    $("#dev-menu-main").classList.add("hidden");
    const panel = $("#dev-panel");
    panel.classList.remove("hidden");
    const animal = existing || {};
    const rarityOptions = ANIMAL_RARITIES.map(r => '<option value="' + escapeHtml(r) + '"' + (animal.Rarete === r ? " selected" : "") + '>' + escapeHtml(r) + '</option>').join("");
    const activationOptions = ANIMAL_ACTIVATIONS.map(v => '<option value="' + escapeHtml(v) + '"' + (animal.TypeActivation === v ? " selected" : "") + '>' + escapeHtml(v) + '</option>').join("");
    const effectOptions = ANIMAL_EFFECTS.map(v => '<option value="' + escapeHtml(v) + '"' + (animal.TypeBuff === v ? " selected" : "") + '>' + escapeHtml(v || "Aucun") + '</option>').join("");
    const debuffOptions = ANIMAL_EFFECTS.map(v => '<option value="' + escapeHtml(v) + '"' + (animal.TypeDebuff === v ? " selected" : "") + '>' + escapeHtml(v || "Aucun") + '</option>').join("");
    const masters = (state.contenu?.Personnages || []).map(p => '<option value="' + escapeHtml(p.Nom) + '"' + (animal.Maitre === p.Nom ? " selected" : "") + '>' + escapeHtml(p.Nom) + '</option>').join("");
    panel.innerHTML = '<h3>' + (existing ? 'Modifier' : 'Nouvel') + ' animal</h3>' +
        '<div class="input-group"><label>Nom</label><input id="dev-a-nom" maxlength="50" value="' + escapeHtml(animal.Nom || "") + '"></div>' +
        '<div class="input-group"><label>Description</label><textarea id="dev-a-description" rows="3">' + escapeHtml(animal.Description || "") + '</textarea></div>' +
        '<div class="input-group"><label>Image PNG</label><div class="dev-image-row"><img id="dev-a-image-preview" class="dev-image-preview ' + (animal.Image ? "" : "hidden") + '" src="' + escapeHtml(animal.Image || "") + '"><button type="button" class="secondary-button" id="dev-a-image-btn">Sélectionner une image</button><button type="button" class="small-button" id="dev-a-image-clear">Retirer</button></div><input type="hidden" id="dev-a-image" value="' + escapeHtml(animal.Image || "") + '"></div>' +
        '<div class="dev-form-row"><div class="input-group"><label>Vie</label><input type="number" id="dev-a-vie" min="1" value="' + (animal.Vie ?? 100) + '"></div><div class="input-group"><label>Puissance</label><input type="number" id="dev-a-puissance" min="0" step="any" value="' + (animal.Puissance ?? 1) + '"></div></div>' +
        '<div class="dev-form-row"><div class="input-group"><label>Armure</label><input type="number" id="dev-a-armure" min="0" step="any" value="' + (animal.Armure ?? 0) + '"></div><div class="input-group"><label>Énergie maximale</label><input type="number" id="dev-a-energy" min="0" value="' + (animal.MaxEnergie ?? 100) + '"></div></div>' +
        '<div class="dev-form-row"><div class="input-group"><label>Min roulette</label><input type="number" id="dev-a-min" min="0" value="' + (animal.MinRoulette ?? 1) + '"></div><div class="input-group"><label>Max roulette</label><input type="number" id="dev-a-max" min="0" value="' + (animal.MaxRoulette ?? 10) + '"></div></div>' +
        '<div class="dev-section-title">Effets</div>' +
        '<div class="dev-form-row"><div class="input-group"><label>Type de buff</label><select id="dev-a-buff">' + effectOptions + '</select></div><div class="input-group"><label>Valeur du buff</label><input type="number" id="dev-a-buff-value" step="any" value="' + (animal.ValeurBuff ?? 0) + '"></div></div>' +
        '<div class="dev-form-row"><div class="input-group"><label>Type de débuff</label><select id="dev-a-debuff">' + debuffOptions + '</select></div><div class="input-group"><label>Valeur du débuff</label><input type="number" id="dev-a-debuff-value" step="any" value="' + (animal.ValeurDebuff ?? 0) + '"></div></div>' +
        '<div class="dev-form-row"><div class="input-group"><label>Nombre de tours</label><input type="number" id="dev-a-tours" min="1" value="' + (animal.Tours ?? 1) + '"></div><div class="input-group"><label>Cooldown d’activation</label><input type="number" id="dev-a-cd" min="0" value="' + (animal.CooldownActivation ?? 0) + '"></div></div>' +
        '<div class="input-group"><label>Type d’activation</label><select id="dev-a-activation">' + activationOptions + '</select></div>' +
        '<label class="dev-check-item"><input type="checkbox" id="dev-a-stack" ' + (animal.Stackable ? "checked" : "") + '> Stackable</label>' +
        '<div class="dev-section-title">Sélection</div>' +
        '<div class="dev-form-row"><div class="input-group"><label>Rareté</label><select id="dev-a-rarity">' + rarityOptions + '</select></div><div class="input-group"><label>Chance de sélection (%)</label><input type="number" id="dev-a-chance" min="0" max="100" step="any" value="' + (animal.ChanceSelection ?? 1) + '"></div></div>' +
        '<div class="input-group"><label>Maître</label><select id="dev-a-master"><option value="">— Aucun —</option>' + masters + '</select></div>' +
        '<div class="input-group"><label>Augmentation de maître (addition)</label><input type="number" id="dev-a-master-bonus" step="any" value="' + (animal.AugmentationMaitre ?? 0) + '"></div>' +
        '<div class="dev-section-title">Progression de valeur</div>' +
        '<div class="dev-form-row"><div class="input-group"><label>Mode</label><select id="dev-a-prog-mode"><option value="additive">Addition par niveau</option><option value="multiplicative">Multiplication par niveau</option></select></div><div class="input-group"><label>Valeur par niveau</label><input type="number" id="dev-a-prog-value" step="any" value="' + (animal.Progression?.ValeurParNiveau ?? 0) + '"></div></div>' +
        '<div class="input-group"><label>Multiplicateur par niveau</label><input type="number" id="dev-a-prog-mult" min="0" step="any" value="' + (animal.Progression?.MultiplicateurParNiveau ?? 1) + '"></div>' +
        '<div class="dev-form-actions"><button type="button" id="dev-a-cancel" class="secondary-button">Annuler</button><button type="button" id="dev-a-save" class="primary-button">' + (existing ? "Enregistrer" : "Créer l’animal") + '</button></div>';
    $("#dev-a-prog-mode").value = animal.Progression?.Mode || "additive";
    $("#dev-a-image-btn").addEventListener("click", () => openDevImagePicker("#dev-a-image", "#dev-a-image-preview", "animaux", "#dev-a-nom"));
    $("#dev-a-image-clear").addEventListener("click", () => { $("#dev-a-image").value = ""; $("#dev-a-image-preview").classList.add("hidden"); });
    $("#dev-a-cancel").addEventListener("click", () => showDevCategoryMenu("Animaux"));
    $("#dev-a-save").addEventListener("click", () => submitAnimalCreator(existing));
}

function submitAnimalCreator(existing) {
    const nom = $("#dev-a-nom").value.trim();
    if (!nom) return showToast("Animal invalide", "Le nom est obligatoire.");
    if ((!existing || existing.Nom !== nom) && creatorNameExists("Animaux", nom)) return showToast("Nom déjà utilisé", "Un animal portant ce nom existe déjà.");
    const vie = Math.floor(Number($("#dev-a-vie").value) || 0);
    const puissance = Number($("#dev-a-puissance").value);
    const armure = Number($("#dev-a-armure").value);
    const energy = Math.floor(Number($("#dev-a-energy").value) || 0);
    const min = Math.floor(Number($("#dev-a-min").value) || 0);
    const max = Math.floor(Number($("#dev-a-max").value) || 0);
    const tours = Math.floor(Number($("#dev-a-tours").value) || 0);
    const cd = Math.floor(Number($("#dev-a-cd").value) || 0);
    const chance = Number($("#dev-a-chance").value);
    if (vie < 1 || !Number.isFinite(puissance) || puissance < 0 || !Number.isFinite(armure) || armure < 0 || energy < 0) return showToast("Statistiques invalides", "Vérifie les statistiques.");
    if (max < min) return showToast("Roulette invalide", "Le maximum doit être supérieur ou égal au minimum.");
    if (tours < 1 || cd < 0) return showToast("Durée invalide", "La durée doit être positive et le cooldown non négatif.");
    if (!Number.isFinite(chance) || chance < 0 || chance > 100) return showToast("Chance invalide", "La chance doit être comprise entre 0 et 100 %.");
    const master = $("#dev-a-master").value;
    if (master && !(state.contenu?.Personnages || []).some(p => p && p.Nom === master)) return showToast("Maître invalide", "Le personnage choisi n'existe pas.");
    const image = ($("#dev-a-image").value || "").trim();
    if (image && !image.startsWith("data:image/png") && !/\.png(?:$|\?)/i.test(image)) return showToast("Image invalide", "L'image doit être un PNG.");
    const item = normalizeAnimalDefinition({
        Nom: nom,
        Description: $("#dev-a-description").value.trim(),
        Image: image,
        Vie: vie,
        Puissance: puissance,
        Armure: armure,
        MaxEnergie: energy,
        MinRoulette: min,
        MaxRoulette: max,
        TypeBuff: $("#dev-a-buff").value,
        TypeDebuff: $("#dev-a-debuff").value,
        ValeurBuff: Number($("#dev-a-buff-value").value) || 0,
        ValeurDebuff: Number($("#dev-a-debuff-value").value) || 0,
        Tours: tours,
        TypeActivation: $("#dev-a-activation").value,
        CooldownActivation: cd,
        Stackable: $("#dev-a-stack").checked,
        Rarete: $("#dev-a-rarity").value,
        ChanceSelection: chance,
        Maitre: master,
        AugmentationMaitre: Number($("#dev-a-master-bonus").value) || 0,
        Progression: { Mode: $("#dev-a-prog-mode").value, ValeurParNiveau: Number($("#dev-a-prog-value").value) || 0, MultiplicateurParNiveau: Number($("#dev-a-prog-mult").value) || 1 }
    });
    if (existing) {
        persistCreatorObject("Animaux", item);
        syncCreatorObjectRuntime("Animaux", item);
    } else {
        getCreatorContenu().Animaux.push(item);
        syncCreatorObjectRuntime("Animaux", item);
    }
    saveCreatorContenu();
    showToast(existing ? "Animal modifié" : "Animal créé", "« " + nom + " » est disponible.");
    showDevCategoryMenu("Animaux");
}