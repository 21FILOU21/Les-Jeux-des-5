"use strict";

/* ============================================================
   game/creator-monstre.js — Créateur : monstres
   (ex-game.js : formulaire (1 énergie unique, stats, roulettes,
   image, checklist d'attaques max 4), pool d'attaques
   compatibles, soumission)
   Utilisé par enemy.js (createMonster → rollCreatorMonsterAttacks).
============================================================ */

/* ============================================================
   POOL D'ATTAQUES COMPATIBLES
============================================================ */

function getCompatibleMonsterAttacks(energie) {
    return (state.contenu?.Attaques || []).filter(attaque => attaque && attaque.Nom && getAttackEnergyTypes(attaque).includes(energie));
}

function rollCreatorMonsterAttacks(energyTypes) {
    const types = Array.isArray(energyTypes) ? energyTypes.filter(Boolean) : [
        energyTypes
    ].filter(Boolean);

    const compatible = (state.contenu?.Attaques || []).filter(attaque => attaque && attaque.Nom && getAttackEnergyTypes(attaque).some(t => types.includes(t)));

    const pool = compatible.slice();

    const chosen = [];

    while (chosen.length < CREATOR_MONSTER_ATTACK_COUNT && pool.length > 0) {
        chosen.push(pool.splice(randomInt(0, pool.length - 1), 1)[0]);
    }

    return {
        attaques: chosen.map(attaque => attaque.Nom),
        disponibles: compatible.length
    }
}

/* ============================================================
   FORMULAIRE
============================================================ */

function startMonsterCreator(existing) {
    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    const energies = getCreatorEnergyNames();

    if (energies.length === 0) {
        panel.innerHTML = `<p class="dev-info-note">Aucun type d'énergie n'existe. Crée d'abord une énergie dans la catégorie « Energies ».</p><div class="dev-form-actions"><button type="button" class="secondary-button" id="dev-retour-btn">← Retour</button></div>`;

        $("#dev-retour-btn").addEventListener("click", showDevMenuMain);

        return;
    }

    const isEdit = Boolean(existing);

    const energyOptions = energies.map(nom => `<option value="${escapeHtml(nom)}"${existing && existing.TypeEnergie === nom ? " selected" : ""}>${escapeHtml(nom)}</option>`).join("");

    const rareteOptions = CREATOR_RARETES.map(r => `<option value="${escapeHtml(r)}"${existing && existing.Rarete === r ? " selected" : ""}>${escapeHtml(r)}</option>`).join("");

    let selectedAttacks = isEdit && Array.isArray(existing.Attaques) ? existing.Attaques.slice() : rollCreatorMonsterAttacks(energies[
        0
    ]).attaques.slice();

    panel.innerHTML = `
        <h3 style="margin-bottom:12px;">${isEdit ? `Modifier le monstre « ${escapeHtml(existing.Nom)}»` : "Nouveau monstre"}</h3>
        <p class="dev-info-note">Un monstre possède exactement un type d'énergie. ${CREATOR_MONSTER_ATTACK_COUNT} attaques aléatoires compatibles avec son énergie sont générées (tu peux aussi les choisir manuellement, ${CREATOR_MONSTER_ATTACK_COUNT} maximum). Les monstres créés apparaissent dans les rencontres.</p>
        <div class="input-group"><label for="dev-m-nom">Nom du monstre</label><input type="text" id="dev-m-nom" maxlength="30" autocomplete="off" value="${escapeHtml(existing ? existing.Nom : "")}"></div>
        <div class="input-group"><label for="dev-m-energie">Type d'énergie (unique)</label><select id="dev-m-energie">${energyOptions}</select></div>
        <div class="input-group"><label for="dev-m-rarete">Rareté</label><select id="dev-m-rarete">${rareteOptions}</select></div>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-m-minenergie">Énergie minimale</label><input type="number" id="dev-m-minenergie" value="${existing ? existing.MinEnergie : 0}" min="0" step="1"></div>
            <div class="input-group"><label for="dev-m-maxenergie">Énergie maximale</label><input type="number" id="dev-m-maxenergie" value="${existing ? existing.MaxEnergie : 100}" min="0" step="1"></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-m-puissance">Puissance de base</label><input type="number" id="dev-m-puissance" value="${existing ? existing.PuissanceBase : 1}" min="0.1" step="0.1"></div>
            <div class="input-group"><label for="dev-m-vie">Vie</label><input type="number" id="dev-m-vie" value="${existing ? existing.Vie : 30}" min="1" step="1"></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-m-armure">Armure</label><input type="number" id="dev-m-armure" value="${existing ? existing.Armure : 1}" min="0" step="1"></div>
            <div class="input-group"><label for="dev-m-vitesse">Vitesse (fuite)</label><input type="number" id="dev-m-vitesse" value="${existing ? existing.Vitesse : 0}" min="0" step="1"></div>
        </div>
        <div class="input-group"><label>Image (.png) — copiée dans assets/monstres/ du dossier lié au jeu</label>
            <div class="dev-image-row">
                <img id="dev-m-image-preview" class="dev-image-preview${existing && existing.Image ? "" : " hidden"}" src="${existing && existing.Image ? escapeHtml(existing.Image) : ""}" alt="Aperçu" onerror="this.classList.add('hidden')">
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <button type="button" class="secondary-button" id="dev-m-image-btn">Sélectionner une image</button>
                    <button type="button" class="small-button" id="dev-m-image-clear">Retirer l'image</button>
                </div>
            </div>
            <input type="hidden" id="dev-m-image" value="${escapeHtml(existing ? existing.Image || "" : "")}">
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-m-minroulette">Minimum roulette</label><input type="number" id="dev-m-minroulette" value="${existing ? existing.MinRoulette : 1}" min="0" step="1"></div>
            <div class="input-group"><label for="dev-m-maxroulette">Maximum roulette</label><input type="number" id="dev-m-maxroulette" value="${existing ? existing.MaxRoulette : 10}" min="0" step="1"></div>
        </div>
        <div class="input-group"><label for="dev-m-nombreroulette">Nombre de roulettes</label><input type="number" id="dev-m-nombreroulette" value="${existing ? existing.NombreRoulette : 1}" min="1" step="1"></div>
        <div class="dev-section-title">Attaques (maximum ${CREATOR_MONSTER_ATTACK_COUNT})</div>
        <button type="button" class="secondary-button" id="dev-m-roll-attacks" style="width:100%;">Ré-générer ${CREATOR_MONSTER_ATTACK_COUNT} attaques aléatoires</button>
        <div id="dev-m-attacks" class="dev-check-list" style="margin-top:8px;"></div>
        <div class="dev-form-actions">
            <button type="button" id="dev-m-cancel" class="secondary-button">Annuler</button>
            <button type="button" id="dev-m-save" class="primary-button">${isEdit ? "Enregistrer" : "Créer le monstre"}</button>
        </div>`;

    function renderMonsterAttackChecklist() {
        const energie = $("#dev-m-energie").value;

        const compatible = getCompatibleMonsterAttacks(energie);

        const container = $("#dev-m-attacks");

        container.innerHTML = "";

        selectedAttacks = selectedAttacks.filter(nomAttaque => compatible.some(a => a.Nom === nomAttaque));

        if (compatible.length === 0) {
            container.innerHTML = `<p class="dev-info-note" style="margin:6px;">Aucune attaque compatible avec ${escapeHtml(energie)}. Crée des attaques de cette énergie dans la catégorie « Attaques ».</p>`;

            return;
        }

        compatible.forEach(attaque => {
            const label = document.createElement("label");

            label.className = "dev-check-item";

            const checkbox = document.createElement("input");

            checkbox.type = "checkbox";

            checkbox.checked = selectedAttacks.includes(attaque.Nom);

            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    if (selectedAttacks.length >= CREATOR_MONSTER_ATTACK_COUNT) {
                        checkbox.checked = !1;

                        showToast("Maximum atteint", `Un monstre ne peut avoir que ${CREATOR_MONSTER_ATTACK_COUNT} attaques.`);

                        return;
                    }

                    selectedAttacks.push(attaque.Nom);
                } else {
                    const i = selectedAttacks.indexOf(attaque.Nom);

                    if (i >= 0) selectedAttacks.splice(i, 1);
                }
            });

            label.appendChild(checkbox);

            const span = document.createElement("span");

            span.innerHTML = `<strong>${escapeHtml(attaque.Nom)}</strong> — ${escapeHtml(attaque.TypeEnergie || "")}${attaque.TypeEnergie2 ? `/${escapeHtml(attaque.TypeEnergie2)}` : ""} · ${attaque.CoutEnergie} énergie`;

            label.appendChild(span);

            container.appendChild(label);
        });
    }

    renderMonsterAttackChecklist();

    $("#dev-m-energie").addEventListener("change", renderMonsterAttackChecklist);

    $("#dev-m-roll-attacks").addEventListener("click", () => {
        const tirage = rollCreatorMonsterAttacks($("#dev-m-energie").value);

        selectedAttacks = tirage.attaques.slice();

        renderMonsterAttackChecklist();

        showToast("Attaques générées", `${selectedAttacks.length} attaque(s) tirée(s)${tirage.disponibles < CREATOR_MONSTER_ATTACK_COUNT ? `(${tirage.disponibles}compatible(s))` : ""}.`);
    });

    $("#dev-m-image-btn").addEventListener("click", () => openDevImagePicker("#dev-m-image", "#dev-m-image-preview", "monstres", "#dev-m-nom"));

    $("#dev-m-image-clear").addEventListener("click", () => {
        const input = $("#dev-m-image");

        if (input) input.value = "";

        const preview = $("#dev-m-image-preview");

        if (preview) {
            preview.classList.add("hidden");

            preview.src = "";
        }
    });

    $("#dev-m-cancel").addEventListener("click", () => {
        if (isEdit) {
            showDevCategoryMenu("Monstres");
        } else {
            showDevMenuMain();
        }
    });

    $("#dev-m-save").addEventListener("click", () => submitMonsterCreator(existing, () => selectedAttacks));
}

function submitMonsterCreator(existing, getSelectedAttacks) {
    const nom = $("#dev-m-nom").value.trim();

    if (!nom) {
        showToast("Nom invalide", "Le nom ne peut pas être vide.");

        return;
    }

    const isEdit = Boolean(existing);

    if ((!isEdit || nom !== existing.Nom) && creatorNameExists("Monstres", nom)) {
        showToast("Nom déjà utilisé", `Un monstre nommé « ${nom} » existe déjà.`);

        return;
    }

    const typeEnergie = $("#dev-m-energie").value;

    const rarete = CREATOR_RARETES.includes($("#dev-m-rarete").value) ? $("#dev-m-rarete").value : "Rare";

    const minEnergie = Math.max(0, lireIntInput("#dev-m-minenergie", 0));

    const maxEnergie = lireIntInput("#dev-m-maxenergie", 100);

    if (maxEnergie < minEnergie) {
        showToast("Énergie invalide", `Le maximum doit être supérieur ou égal au minimum (${minEnergie}).`);

        return;
    }

    const puissanceBase = Math.max(0.1, lireDoubleInput("#dev-m-puissance", 1));

    const vie = Math.max(1, lireIntInput("#dev-m-vie", 30));

    const armure = Math.max(0, lireIntInput("#dev-m-armure", 1));

    const vitesse = Math.max(0, lireIntInput("#dev-m-vitesse", 0));

    const minRoulette = Math.max(0, lireIntInput("#dev-m-minroulette", 1));

    const maxRoulette = lireIntInput("#dev-m-maxroulette", 10);

    if (maxRoulette < minRoulette) {
        showToast("Roulette invalide", `Le maximum doit être supérieur ou égal au minimum (${minRoulette}).`);

        return;
    }

    const nombreRoulette = Math.max(1, lireIntInput("#dev-m-nombreroulette", 1));

    const image = ($("#dev-m-image")?.value || "").trim();

    let attaques = (getSelectedAttacks ? getSelectedAttacks() : []).slice();

    if (attaques.length === 0) {
        attaques = rollCreatorMonsterAttacks(typeEnergie).attaques.slice();
    }

    const compatible = getCompatibleMonsterAttacks(typeEnergie);

    attaques = attaques.filter(nomAttaque => compatible.some(a => a.Nom === nomAttaque)).slice(0, CREATOR_MONSTER_ATTACK_COUNT);

    const monstre = {
        Nom: nom,
        TypeEnergie: typeEnergie,
        Rarete: rarete,
        PuissanceBase: puissanceBase,
        Vie: vie,
        Armure: armure,
        Vitesse: vitesse,
        MinRoulette: minRoulette,
        MaxRoulette: maxRoulette,
        NombreRoulette: nombreRoulette,
        MinEnergie: minEnergie,
        MaxEnergie: maxEnergie,
        Image: image,
        Attaques: attaques
    };

    const created = getCreatorContenu();

    if (isEdit) {
        const i = (created.Monstres || []).findIndex(m => m && m.Nom === existing.Nom);

        if (i >= 0) created.Monstres[i] = monstre;
        else created.Monstres.push(monstre);

        const j = MONSTER_VARIETIES.findIndex(m => m.Nom === existing.Nom);

        if (j >= 0) MONSTER_VARIETIES[j] = structuredClone(monstre);
        else MONSTER_VARIETIES.push(structuredClone(monstre));
    } else {
        created.Monstres.push(monstre);

        MONSTER_VARIETIES.push(structuredClone(monstre));
    }

    saveCreatorContenu();

    showToast(isEdit ? "Monstre modifié" : "Monstre créé", `${nom} (${typeEnergie}) — ${attaques.length} attaque(s).`);

    showDevCategoryMenu("Monstres");
}