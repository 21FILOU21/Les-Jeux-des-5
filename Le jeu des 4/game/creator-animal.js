"use strict";

/* ============================================================
   game/creator-animal.js — Créateur d'animaux
============================================================ */

function getAnimalCreatorAbilityValues(existing, kind) {
    const definition = existing || {};
    const ability = definition[kind === "buff" ? "Buff" : "Debuff"] || {};
    return {
        type: ability.Type || (kind === "buff" ? definition.TypeBuff : definition.TypeDebuff) || "",
        value: ability.Valeur ?? (kind === "buff" ? definition.ValeurBuff : definition.ValeurDebuff) ?? 0,
        turns: ability.Tours ?? definition.Tours ?? 1,
        activation: ability.Activation || definition.TypeActivation || "Sur attaque",
        cooldown: ability.Cooldown ?? definition.CooldownActivation ?? 0,
        stackable: ability.Stackable === true || (ability.Stackable === undefined && definition.Stackable === true)
    };
}

function startAnimalCreator(existing) {
    resetDevPanel();
    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");
    panel.classList.remove("hidden");

    const animal = existing || {};
    const buff = getAnimalCreatorAbilityValues(animal, "buff");
    const debuff = getAnimalCreatorAbilityValues(animal, "debuff");

    const rarityOptions = ANIMAL_RARITIES.map(r =>
        '<option value="' + escapeHtml(r) + '"' + (animal.Rarete === r ? " selected" : "") + '>' +
        escapeHtml(r) + '</option>'
    ).join("");

    const energyOptions = (state.contenu?.Energies || []).map(energy =>
        '<option value="' + escapeHtml(energy.Nom) + '"' +
        (animal.TypeEnergie === energy.Nom ? " selected" : "") + '>' +
        escapeHtml(energy.Nom) + '</option>'
    ).join("");

    const activationOptions = ANIMAL_ACTIVATIONS.map(value =>
        '<option value="' + escapeHtml(value) + '"' + (buff.activation === value ? " selected" : "") + '>' +
        escapeHtml(value) + '</option>'
    ).join("");

    const debuffActivationOptions = ANIMAL_ACTIVATIONS.map(value =>
        '<option value="' + escapeHtml(value) + '"' + (debuff.activation === value ? " selected" : "") + '>' +
        escapeHtml(value) + '</option>'
    ).join("");

    const effectOptions = ANIMAL_EFFECTS.map(value =>
        '<option value="' + escapeHtml(value) + '"' + (buff.type === value ? " selected" : "") + '>' +
        escapeHtml(value || "Aucun") + '</option>'
    ).join("");

    const debuffOptions = ANIMAL_EFFECTS.map(value =>
        '<option value="' + escapeHtml(value) + '"' + (debuff.type === value ? " selected" : "") + '>' +
        escapeHtml(value || "Aucun") + '</option>'
    ).join("");

    const masters = (state.contenu?.Personnages || []).map(personnage => {
        const stableId = String(personnage.Id || personnage.id || personnage.Nom || "");
        const selected = String(animal.Maitre || "") === stableId || String(animal.Maitre || "") === String(personnage.Nom || "");
        return '<option value="' + escapeHtml(stableId) + '"' + (selected ? " selected" : "") + '>' +
            escapeHtml(personnage.Nom || stableId) + '</option>';
    }).join("");

    panel.innerHTML =
        '<h3 style="margin-bottom:12px;">' + (existing ? "Modifier" : "Nouvel") + ' animal</h3>' +

        '<div class="dev-section-title">Identité</div>' +
        '<div class="input-group"><label for="dev-a-id">ID unique</label><input id="dev-a-id" maxlength="60" value="' + escapeHtml(animal.Id || animalSlug(animal.Nom) || "") + '" placeholder="ex. loup-01"></div>' +
        '<div class="input-group"><label for="dev-a-nom">Nom</label><input id="dev-a-nom" maxlength="60" value="' + escapeHtml(animal.Nom || "") + '"></div>' +
        '<div class="input-group"><label for="dev-a-description">Description</label><textarea id="dev-a-description" rows="3">' + escapeHtml(animal.Description || "") + '</textarea></div>' +

        '<div class="input-group"><label>Image PNG / JPG</label>' +
        '<div class="dev-image-row"><img id="dev-a-image-preview" class="dev-image-preview ' + (animal.Image ? "" : "hidden") + '" src="' + escapeHtml(animal.Image || "") + '" alt="">' +
        '<button type="button" class="secondary-button" id="dev-a-image-btn">Sélectionner une image</button>' +
        '<button type="button" class="small-button" id="dev-a-image-clear">Retirer</button></div>' +
        '<input type="hidden" id="dev-a-image" value="' + escapeHtml(animal.Image || "") + '"></div>' +

        '<div class="dev-section-title">Statistiques</div>' +
        '<div class="dev-form-row">' +
        '<div class="input-group"><label for="dev-a-vie">Vie</label><input type="number" id="dev-a-vie" min="1" step="1" value="' + (animal.Vie ?? 100) + '"></div>' +
        '<div class="input-group"><label for="dev-a-puissance">Puissance</label><input type="number" id="dev-a-puissance" min="0" step="any" value="' + (animal.Puissance ?? 1) + '"></div>' +
        '</div>' +
        '<div class="dev-form-row">' +
        '<div class="input-group"><label for="dev-a-armure">Armure</label><input type="number" id="dev-a-armure" min="0" step="any" value="' + (animal.Armure ?? 0) + '"></div>' +
        '<div class="input-group"><label for="dev-a-energy-max">Énergie maximale</label><input type="number" id="dev-a-energy-max" min="0" step="1" value="' + (animal.MaxEnergie ?? 100) + '"></div>' +
        '</div>' +
        '<div class="dev-form-row">' +
        '<div class="input-group"><label for="dev-a-energy-type">Énergie</label><select id="dev-a-energy-type"><option value="">— Aucune —</option>' + energyOptions + '</select></div>' +
        '<div class="input-group"><label for="dev-a-min">Min roulette</label><input type="number" id="dev-a-min" min="0" step="1" value="' + (animal.MinRoulette ?? 1) + '"></div>' +
        '</div>' +
        '<div class="input-group"><label for="dev-a-max">Max roulette</label><input type="number" id="dev-a-max" min="0" step="1" value="' + (animal.MaxRoulette ?? 10) + '"></div>' +

        '<div class="dev-section-title">Buff</div>' +
        '<div class="dev-form-row"><div class="input-group"><label for="dev-a-buff">Type</label><select id="dev-a-buff">' + effectOptions + '</select></div>' +
        '<div class="input-group"><label for="dev-a-buff-value">Valeur</label><input type="number" id="dev-a-buff-value" min="0" step="any" value="' + buff.value + '"></div></div>' +
        '<div class="dev-form-row"><div class="input-group"><label for="dev-a-buff-turns">Tours</label><input type="number" id="dev-a-buff-turns" min="1" step="1" value="' + buff.turns + '"></div>' +
        '<div class="input-group"><label for="dev-a-buff-cd">Cooldown</label><input type="number" id="dev-a-buff-cd" min="0" step="1" value="' + buff.cooldown + '"></div></div>' +
        '<div class="input-group"><label for="dev-a-buff-activation">Activation</label><select id="dev-a-buff-activation">' + activationOptions + '</select></div>' +
        '<label class="dev-check-item"><input type="checkbox" id="dev-a-buff-stack" ' + (buff.stackable ? "checked" : "") + '> Stackable</label>' +

        '<div class="dev-section-title">Debuff</div>' +
        '<div class="dev-form-row"><div class="input-group"><label for="dev-a-debuff">Type</label><select id="dev-a-debuff">' + debuffOptions + '</select></div>' +
        '<div class="input-group"><label for="dev-a-debuff-value">Valeur</label><input type="number" id="dev-a-debuff-value" min="0" step="any" value="' + debuff.value + '"></div></div>' +
        '<div class="dev-form-row"><div class="input-group"><label for="dev-a-debuff-turns">Tours</label><input type="number" id="dev-a-debuff-turns" min="1" step="1" value="' + debuff.turns + '"></div>' +
        '<div class="input-group"><label for="dev-a-debuff-cd">Cooldown</label><input type="number" id="dev-a-debuff-cd" min="0" step="1" value="' + debuff.cooldown + '"></div></div>' +
        '<div class="input-group"><label for="dev-a-debuff-activation">Activation</label><select id="dev-a-debuff-activation">' + debuffActivationOptions + '</select></div>' +
        '<label class="dev-check-item"><input type="checkbox" id="dev-a-debuff-stack" ' + (debuff.stackable ? "checked" : "") + '> Stackable</label>' +

        '<div class="dev-section-title">Rencontre et rareté</div>' +
        '<div class="dev-form-row"><div class="input-group"><label for="dev-a-rarity">Rareté</label><select id="dev-a-rarity">' + rarityOptions + '</select></div>' +
        '<div class="input-group"><label for="dev-a-chance">Chance de rencontre (%)</label><input type="number" id="dev-a-chance" min="0" max="100" step="any" value="' + (animal.ChanceRencontre ?? animal.ChanceSelection ?? 0) + '"></div></div>' +

        '<div class="dev-section-title">Maître</div>' +
        '<div class="input-group"><label for="dev-a-master">Personnage maître</label><select id="dev-a-master"><option value="">— Aucun —</option>' + masters + '</select></div>' +
        '<div class="input-group"><label for="dev-a-master-bonus">AugmentationMaitre</label><input type="number" id="dev-a-master-bonus" step="any" value="' + (animal.AugmentationMaitre ?? 0) + '"></div>' +

        '<div class="dev-section-title">Progression</div>' +
        '<div class="dev-form-row"><div class="input-group"><label for="dev-a-level">Niveau initial</label><input type="number" id="dev-a-level" min="1" step="1" value="' + (animal.NiveauInitial ?? 1) + '"></div>' +
        '<div class="input-group"><label for="dev-a-prog-mode">Mode</label><select id="dev-a-prog-mode"><option value="additive">Addition par niveau</option><option value="multiplicative">Multiplication par niveau</option></select></div></div>' +
        '<div class="dev-form-row"><div class="input-group"><label for="dev-a-prog-value">Valeur par niveau</label><input type="number" id="dev-a-prog-value" step="any" value="' + (animal.Progression?.ValeurParNiveau ?? 0) + '"></div>' +
        '<div class="input-group"><label for="dev-a-prog-mult">Multiplicateur par niveau</label><input type="number" id="dev-a-prog-mult" min="0" step="any" value="' + (animal.Progression?.MultiplicateurParNiveau ?? 1) + '"></div></div>' +

        '<div class="dev-form-actions"><button type="button" id="dev-a-cancel" class="secondary-button">Annuler</button><button type="button" id="dev-a-save" class="primary-button">' + (existing ? "Enregistrer" : "Créer l’animal") + '</button></div>';

    $("#dev-a-prog-mode").value = animal.Progression?.Mode || "additive";

    $("#dev-a-image-btn").addEventListener("click", () =>
        openDevImagePicker("#dev-a-image", "#dev-a-image-preview", "animaux", "#dev-a-nom")
    );

    $("#dev-a-image-clear").addEventListener("click", () => {
        $("#dev-a-image").value = "";
        $("#dev-a-image-preview").classList.add("hidden");
    });

    $("#dev-a-cancel").addEventListener("click", () => showDevCategoryMenu("Animaux"));
    $("#dev-a-save").addEventListener("click", () => submitAnimalCreator(existing));
}

function readAnimalCreatorAbility(kind) {
    const prefix = kind === "buff" ? "buff" : "debuff";
    return {
        Type: $("#" + "dev-a-" + prefix).value,
        Valeur: Number($("#" + "dev-a-" + prefix + "-value").value),
        Tours: Math.floor(Number($("#" + "dev-a-" + prefix + "-turns").value)),
        Activation: $("#" + "dev-a-" + prefix + "-activation").value,
        Cooldown: Math.floor(Number($("#" + "dev-a-" + prefix + "-cd").value)),
        Stackable: $("#" + "dev-a-" + prefix + "-stack").checked
    };
}

function submitAnimalCreator(existing) {
    const nom = $("#dev-a-nom").value.trim();
    if (!nom) return showToast("Animal invalide", "Le nom est obligatoire.");

    if (existing && existing.Nom !== nom) {
        showToast("Renommage impossible", "Modifie les propriétés de l’animal sans changer son nom.");
        return;
    }

    if ((!existing || existing.Nom !== nom) && creatorNameExists("Animaux", nom)) {
        return showToast("Nom déjà utilisé", "Un animal portant ce nom existe déjà.");
    }

    const rawId = $("#dev-a-id").value.trim();
    const id = rawId.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!id) return showToast("ID invalide", "L'ID doit contenir des lettres, chiffres, tirets ou underscores.");

    const duplicateId = (state.contenu?.Animaux || []).some(animal =>
        animal && String(animal.Id || "") === id && (!existing || animal.Nom !== existing.Nom)
    );
    if (duplicateId) return showToast("ID déjà utilisé", "Cet identifiant Animal existe déjà.");

    const vie = Number($("#dev-a-vie").value);
    const puissance = Number($("#dev-a-puissance").value);
    const armure = Number($("#dev-a-armure").value);
    const maxEnergie = Number($("#dev-a-energy-max").value);
    const minRoulette = Number($("#dev-a-min").value);
    const maxRoulette = Number($("#dev-a-max").value);
    const chance = Number($("#dev-a-chance").value);
    const level = Number($("#dev-a-level").value);
    const master = $("#dev-a-master").value.trim();
    const masterDefinition = master
        ? (state.contenu?.Personnages || []).find(personnage => String(personnage.Id || personnage.id || personnage.Nom || "") === master)
        : null;

    if (!Number.isFinite(vie) || vie < 1) return showToast("Vie invalide", "La vie doit être supérieure ou égale à 1.");
    if (!Number.isFinite(puissance) || puissance < 0) return showToast("Puissance invalide", "La puissance ne peut pas être négative.");
    if (!Number.isFinite(armure) || armure < 0) return showToast("Armure invalide", "L'armure ne peut pas être négative.");
    if (!Number.isFinite(maxEnergie) || maxEnergie < 0) return showToast("Énergie invalide", "L'énergie maximale ne peut pas être négative.");
    if (!Number.isFinite(minRoulette) || !Number.isFinite(maxRoulette) || minRoulette < 0 || maxRoulette < minRoulette) return showToast("Roulette invalide", "Le maximum doit être supérieur ou égal au minimum.");
    if (!Number.isFinite(chance) || chance < 0 || chance > 100) return showToast("Chance invalide", "La chance de rencontre doit être comprise entre 0 et 100 %.");
    if (!Number.isInteger(level) || level < 1) return showToast("Niveau invalide", "Le niveau initial doit être supérieur ou égal à 1.");

    const energyType = $("#dev-a-energy-type").value.trim();
    if (energyType && !(state.contenu?.Energies || []).some(energy => energy && energy.Nom === energyType)) {
        return showToast("Énergie invalide", "Le type d'énergie sélectionné n'existe plus.");
    }

    const buff = readAnimalCreatorAbility("buff");
    const debuff = readAnimalCreatorAbility("debuff");
    const validateAbility = (ability, label, isDebuff) => {
        if (!ANIMAL_EFFECTS.includes(ability.Type)) return label + " : type invalide.";
        if (!Number.isFinite(ability.Valeur) || ability.Valeur < 0) return label + " : valeur invalide.";
        if ((ability.Type === "Dégâts") && isDebuff && ability.Valeur > 1) return label + " : un debuff de dégâts doit avoir une valeur comprise entre 0 et 1.";
        if (!Number.isInteger(ability.Tours) || ability.Tours < 1) return label + " : durée invalide.";
        if (!Number.isInteger(ability.Cooldown) || ability.Cooldown < 0) return label + " : cooldown invalide.";
        if (!ANIMAL_ACTIVATIONS.includes(ability.Activation)) return label + " : activation invalide.";
        return null;
    };
    const buffError = validateAbility(buff, "Buff", false);
    const debuffError = validateAbility(debuff, "Debuff", true);
    if (buffError) return showToast("Buff invalide", buffError);
    if (debuffError) return showToast("Debuff invalide", debuffError);

    const image = String($("#dev-a-image").value || "").trim();
    if (image && !/^data:image\/(png|jpeg|jpg);/i.test(image) && !/\.(png|jpe?g)(?:$|\?)/i.test(image)) {
        return showToast("Image invalide", "L'image doit être un PNG ou JPG.");
    }

    const masterValue = masterDefinition
        ? String(masterDefinition.Id || masterDefinition.id || masterDefinition.Nom || "")
        : master;

    const item = normalizeAnimalDefinition({
        Id: id,
        Nom: nom,
        Description: $("#dev-a-description").value.trim(),
        Image: image,
        Vie: Math.floor(vie),
        Puissance: puissance,
        Armure: armure,
        MaxEnergie: Math.floor(maxEnergie),
        TypeEnergie: energyType,
        MinRoulette: Math.floor(minRoulette),
        MaxRoulette: Math.floor(maxRoulette),
        Rarete: $("#dev-a-rarity").value,
        ChanceRencontre: chance,
        Maitre: masterValue,
        AugmentationMaitre: Number($("#dev-a-master-bonus").value) || 0,
        NiveauInitial: level,
        Buff: buff,
        Debuff: debuff,
        Progression: {
            Mode: $("#dev-a-prog-mode").value === "multiplicative" ? "multiplicative" : "additive",
            ValeurParNiveau: Number($("#dev-a-prog-value").value) || 0,
            MultiplicateurParNiveau: Number($("#dev-a-prog-mult").value) || 1
        }
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
