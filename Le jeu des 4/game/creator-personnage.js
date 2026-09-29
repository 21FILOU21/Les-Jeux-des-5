"use strict";

/* ============================================================
   game/creator-personnage.js — Créateur : personnages
   (ex-game.js : formulaire (1–2 énergies, stats, roulettes,
   vitesse, image, évolution), soumission, chaînage d'évolution,
   propagation de renommage)
============================================================ */

function startPersonnageCreator(parentEvolution, existing) {
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

    const isStockEdit = isEdit && isStockContentName("Personnages", existing.Nom);

    const isEvolutionTarget = Boolean(parentEvolution && parentEvolution.SourceNom);

    const defaultLevel = isEvolutionTarget ? Math.floor(Number(parentEvolution.NiveauRequis) || CREATOR_DEFAULT_EVOLUTION_LEVEL) + CREATOR_EVOLUTION_STEP_LEVEL : CREATOR_DEFAULT_EVOLUTION_LEVEL;

    const evolution = isEdit ? (existing.Evolution || null) : null;

    const energyOptions = energies.map(nom => `<option value="${escapeHtml(nom)}"${existing && existing.TypeEnergie === nom ? " selected" : ""}>${escapeHtml(nom)}</option>`).join("");

    const secondEnergyOptions = `<option value="">— Aucune (un seul type) —</option>` + energies.map(nom => `<option value="${escapeHtml(nom)}"${existing && existing.TypeEnergie2 === nom ? " selected" : ""}>${escapeHtml(nom)}</option>`).join("");

    const rareteOptions = CREATOR_RARETES.map(r => `<option value="${escapeHtml(r)}"${existing && existing.Rarete === r ? " selected" : ""}>${escapeHtml(r)}</option>`).join("");

    const cibles = (state.contenu?.Personnages || []).map(personnage => personnage && personnage.Nom).filter(Boolean);

    const cibleOptions = cibles.map(nom => `<option value="${escapeHtml(nom)}"${evolution && evolution.Cible === nom ? " selected" : ""}>${escapeHtml(nom)}</option>`).join("");

    const titre = isEvolutionTarget ? `Personnage d'évolution de « ${escapeHtml(parentEvolution.SourceNom)} »` : (isEdit ? `Modifier « ${escapeHtml(existing.Nom)} »` : "Nouveau personnage");

    const note = isEvolutionTarget ? `Ce personnage deviendra la forme évoluée de « ${escapeHtml(parentEvolution.SourceNom)} ».` : (isEdit ? (isStockEdit ? "Personnage d'origine : les modifications sont enregistrées dans la sauvegarde et remplacent l'original au chargement. Le nom ne peut pas être changé." : "Modifie ton personnage créé.") : "Même structure que le créateur existant : énergie, statistiques, roulettes, image (.png) et évolution.");

    panel.innerHTML = `
        <h3 style="margin-bottom:12px;">${titre}</h3>
        <p class="dev-info-note">${note}</p>
        <div class="input-group"><label for="dev-p-nom">Nom du personnage</label><input type="text" id="dev-p-nom" maxlength="30" autocomplete="off" value="${escapeHtml(existing ? existing.Nom : "")}"${isStockEdit ? " disabled" : ""}></div>
        <div class="input-group"><label for="dev-p-energie">Type d'énergie</label><select id="dev-p-energie">${energyOptions}</select></div>
        <div class="input-group"><label for="dev-p-energie2">Type d'énergie 2 (optionnel)</label><select id="dev-p-energie2">${secondEnergyOptions}</select></div>
        <div class="input-group"><label for="dev-p-rarete">Rareté (en tant qu'ennemi)</label><select id="dev-p-rarete">${rareteOptions}</select></div>
        <label class="dev-check-item" style="margin-top:4px;"><input type="checkbox" id="dev-p-visible"${existing ? (existing.VisibleSelection === !1 ? "" : " checked") : " checked"}><span>Montrer le personnage dans la sélection des personnages dans la configuration.</span></label>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-p-minenergie">Énergie minimale</label><input type="number" id="dev-p-minenergie" value="${existing ? existing.MinEnergie : 0}" min="0" step="1"></div>
            <div class="input-group"><label for="dev-p-maxenergie">Énergie maximale</label><input type="number" id="dev-p-maxenergie" value="${existing ? existing.MaxEnergie : 100}" min="0" step="1"></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-p-puissance">Puissance de base</label><input type="number" id="dev-p-puissance" value="${existing ? existing.PuissanceBase : 1}" min="0.1" step="0.1"></div>
            <div class="input-group"><label for="dev-p-vie">Vie maximale</label><input type="number" id="dev-p-vie" value="${existing ? existing.Vie : 100}" min="1" step="1"></div>
        </div>
                <div class="dev-form-row">
            <div class="input-group"><label for="dev-p-armure">Armure</label><input type="number" id="dev-p-armure" value="${existing ? existing.Armure : 0}" min="0" step="1"></div>
            <div class="input-group"><label for="dev-p-vitesse">Vitesse (fuite)</label><input type="number" id="dev-p-vitesse" value="${existing ? existing.Vitesse : 0}" min="0" step="1"></div>
        </div>
        <div class="input-group"><label>Image (.png) — copiée dans assets/personnages/ du dossier lié au jeu</label>
            <div class="dev-image-row">
                <img id="dev-p-image-preview" class="dev-image-preview${existing && existing.Image ? "" : " hidden"}" src="${existing && existing.Image ? escapeHtml(existing.Image) : ""}" alt="Aperçu" onerror="this.classList.add('hidden')">
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <button type="button" class="secondary-button" id="dev-p-image-btn">Sélectionner une image</button>
                    <button type="button" class="small-button" id="dev-p-image-clear">Retirer l'image</button>
                </div>
            </div>
            <input type="hidden" id="dev-p-image" value="${escapeHtml(existing ? existing.Image || "" : "")}">
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-p-minroulette">Minimum roulette</label><input type="number" id="dev-p-minroulette" value="${existing ? existing.MinRoulette : 1}" min="0" step="1"></div>
            <div class="input-group"><label for="dev-p-maxroulette">Maximum roulette</label><input type="number" id="dev-p-maxroulette" value="${existing ? existing.MaxRoulette : 10}" min="0" step="1"></div>
        </div>
        <div class="input-group"><label for="dev-p-nombreroulette">Nombre de roulettes</label><input type="number" id="dev-p-nombreroulette" value="${existing ? existing.NombreRoulette : 1}" min="1" step="1"></div>
        <div class="input-group"><label for="dev-p-evolution">Évolution</label><select id="dev-p-evolution"><option value="0"${evolution ? "" : " selected"}>0. Aucune évolution</option><option value="1"${evolution ? " selected" : ""}>1. Évolution</option></select></div>
        <div id="dev-p-evolution-config" class="hidden">
            <div class="input-group"><label for="dev-p-evolution-mode">Forme d'évolution</label><select id="dev-p-evolution-mode"><option value="0"${evolution && evolution.Cible ? "" : " selected"}>0. Créer un nouveau personnage</option><option value="1"${evolution && evolution.Cible ? " selected" : ""}>1. Utiliser un personnage existant</option></select></div>
            <div id="dev-p-evolution-existing" class="hidden"><div class="input-group"><label for="dev-p-evolution-cible">Personnage cible</label><select id="dev-p-evolution-cible">${cibleOptions}</select></div></div>
            <div class="input-group"><label for="dev-p-evolution-niveau">Niveau requis pour évoluer</label><input type="number" id="dev-p-evolution-niveau" value="${evolution ? evolution.NiveauRequis : defaultLevel}" min="1" step="1"></div>
            <p class="dev-info-note">Première évolution : niveau ${CREATOR_DEFAULT_EVOLUTION_LEVEL}. Évolution suivante : +${CREATOR_EVOLUTION_STEP_LEVEL} niveaux.</p>
        </div>
        <div class="input-group"><label for="dev-p-mega-enabled">Méga-Évolution</label><select id="dev-p-mega-enabled"><option value="0">0. Aucune</option><option value="1">1. Méga-Évolution configurée</option></select></div>
        <div id="dev-p-mega-config" class="hidden">
            <div class="input-group"><label for="dev-p-mega-target">Personnage Méga cible</label><select id="dev-p-mega-target"><option value="">— Choisir —</option>${cibleOptions}</select></div>
            <div class="input-group"><label for="dev-p-mega-stone">Méga Stone requise</label><select id="dev-p-mega-stone"><option value="">— Choisir —</option></select></div>
        </div>
        <div class="dev-form-actions">
            <button type="button" id="dev-p-cancel" class="secondary-button">Annuler</button>
            <button type="button" id="dev-p-save" class="primary-button">${isEdit ? "Enregistrer" : "Créer le personnage"}</button>
        </div>`;

    if (evolution) {
        $("#dev-p-evolution-config").classList.remove("hidden");

        if (evolution.Cible) {
            $("#dev-p-evolution-existing").classList.remove("hidden");
        }
    }

    const megaStoneSelect = $("#dev-p-mega-stone");

    if (megaStoneSelect) {
        const megaStones = (state.contenu?.Items || []).filter(item => item && (item.Categorie === "Méga Stone" || item.Categorie === "Mega Stone" || item.MegaStone));
        megaStoneSelect.innerHTML = '<option value="">— Choisir —</option>' + megaStones.map(item => '<option value="' + escapeHtml(item.Id || "") + '">' + escapeHtml(item.Nom || item.Id || "") + '</option>').join("");
    }

    const megaEvolution = isEdit ? (existing.MegaEvolution || null) : null;

    if (megaEvolution && megaEvolution.Cible) {
        $("#dev-p-mega-enabled").value = "1";
        $("#dev-p-mega-config").classList.remove("hidden");
        $("#dev-p-mega-target").value = megaEvolution.Cible;
        $("#dev-p-mega-stone").value = megaEvolution.StoneId || "";
    }

    $("#dev-p-mega-enabled").addEventListener("change", event => {
        $("#dev-p-mega-config").classList.toggle("hidden", event.target.value !== "1");
    });

    $("#dev-p-evolution").addEventListener("change", () => {
        $("#dev-p-evolution-config").classList.toggle("hidden", $("#dev-p-evolution").value !== "1");
    });

    $("#dev-p-evolution-mode").addEventListener("change", () => {
        $("#dev-p-evolution-existing").classList.toggle("hidden", $("#dev-p-evolution-mode").value !== "1");
    });

    $("#dev-p-image-btn").addEventListener("click", () => openDevImagePicker("#dev-p-image", "#dev-p-image-preview", "personnages", "#dev-p-nom"));

    $("#dev-p-image-clear").addEventListener("click", () => {
        const input = $("#dev-p-image");

        if (input) input.value = "";

        const preview = $("#dev-p-image-preview");

        if (preview) {
            preview.classList.add("hidden");

            preview.src = "";
        }
    });

    $("#dev-p-cancel").addEventListener("click", () => {
        if (parentEvolution) {
            showToast("Évolution incomplète", `« ${parentEvolution.SourceNom} » reste sans cible d'évolution.`);

            showDevMenuMain();
        } else if (isEdit) {
            showDevCategoryMenu("Personnages");
        } else {
            showDevMenuMain();
        }
    });

    $("#dev-p-save").addEventListener("click", () => submitPersonnageCreator(parentEvolution, existing));
}

function submitPersonnageCreator(parentEvolution, existing) {
    const nom = $("#dev-p-nom").value.trim();

    if (!nom) {
        showToast("Nom invalide", "Le nom ne peut pas être vide.");

        return;
    }

    const isEdit = Boolean(existing);

    const isStockEdit = isEdit && isStockContentName("Personnages", existing.Nom);

    if (isStockEdit && nom !== existing.Nom) {
        showToast("Renommage impossible", "Un personnage d'origine ne peut pas être renommé (références par nom).");

        return;
    }

    if ((!isEdit || nom !== existing.Nom) && creatorNameExists("Personnages", nom)) {
        showToast("Nom déjà utilisé", `Un personnage nommé « ${nom} » existe déjà.`);

        return;
    }

    const typeEnergie = $("#dev-p-energie").value;

    const typeEnergie2 = ($("#dev-p-energie2")?.value) || "";

    const rarete = CREATOR_RARETES.includes($("#dev-p-rarete").value) ? $("#dev-p-rarete").value : "Rare";

    const visibleSelection = !$("#dev-p-visible") || $("#dev-p-visible").checked;

    if (typeEnergie2 && typeEnergie2 === typeEnergie) {
        showToast("Types identiques", "Un personnage ne peut avoir que deux types d'énergie différents (1 ou 2 maximum).");

        return;
    }

    const minEnergie = Math.max(0, lireIntInput("#dev-p-minenergie", 0));

    const maxEnergie = lireIntInput("#dev-p-maxenergie", 100);

    if (maxEnergie < minEnergie) {
        showToast("Énergie invalide", `Le maximum doit être supérieur ou égal au minimum (${minEnergie}).`);

        return;
    }

    const puissanceBase = Math.max(0.1, lireDoubleInput("#dev-p-puissance", 1));

    const vie = Math.max(1, lireIntInput("#dev-p-vie", 100));

    const armure = Math.max(0, lireIntInput("#dev-p-armure", 0));

    const vitesse = Math.max(0, lireIntInput("#dev-p-vitesse", 0));

    const minRoulette = Math.max(0, lireIntInput("#dev-p-minroulette", 1));

    const maxRoulette = lireIntInput("#dev-p-maxroulette", 10);

    if (maxRoulette < minRoulette) {
        showToast("Roulette invalide", `Le maximum doit être supérieur ou égal au minimum (${minRoulette}).`);

        return;
    }

    const nombreRoulette = Math.max(1, lireIntInput("#dev-p-nombreroulette", 1));

    const image = ($("#dev-p-image")?.value || "").trim();

    const evolutionActive = $("#dev-p-evolution").value === "1";

    let evolution = null;

    if (evolutionActive) {
        const niveauRequis = Math.max(1, lireIntInput("#dev-p-evolution-niveau", CREATOR_DEFAULT_EVOLUTION_LEVEL));

        const mode = $("#dev-p-evolution-mode").value;

        if (mode === "1") {
            const cible = $("#dev-p-evolution-cible").value;

            if (!cible) {
                showToast("Cible manquante", "Choisis un personnage existant comme cible d'évolution.");

                return;
            }

            if (cible === nom) {
                showToast("Cible invalide", "Un personnage ne peut pas évoluer en lui-même.");

                return;
            }

            evolution = { Cible: cible, NiveauRequis: niveauRequis }
        } else {
            evolution = { Cible: null, NiveauRequis: niveauRequis }
        }
    }

    const megaActive = $("#dev-p-mega-enabled")?.value === "1";
    let megaEvolution = null;

    if (megaActive) {
        const megaTarget = $("#dev-p-mega-target")?.value || "";
        const megaStoneId = $("#dev-p-mega-stone")?.value || "";

        if (!megaTarget || megaTarget === nom) {
            showToast("Cible Méga invalide", "Choisis un personnage existant différent du personnage actuel.");
            return;
        }

        const targetExists = (state.contenu?.Personnages || []).some(personnage => personnage && personnage.Nom === megaTarget);
        if (!targetExists) {
            showToast("Cible Méga introuvable", "Le personnage Méga cible n'existe plus.");
            return;
        }

        const stone = typeof getItemDefinition === "function" ? getItemDefinition(megaStoneId) : null;
        if (!stone || !isMegaStoneItem(stone)) {
            showToast("Méga Stone invalide", "Choisis une Méga Stone existante.");
            return;
        }

        megaEvolution = {
            Cible: megaTarget,
            StoneId: stone.Id
        };
    }

    const personnage = {
        Nom: nom,
        TypeEnergie: typeEnergie,
        TypeEnergie2: typeEnergie2 || "",
        Rarete: rarete,
        VisibleSelection: visibleSelection,
        PuissanceBase: puissanceBase,
        Vie: vie,
        Armure: armure,
        MinRoulette: minRoulette,
        MaxRoulette: maxRoulette,
        NombreRoulette: nombreRoulette,
        MinEnergie: minEnergie,
        MaxEnergie: maxEnergie,
        Vitesse: vitesse,
        Image: image,
        Attaques: isEdit ? (Array.isArray(existing.Attaques) ? existing.Attaques.slice() : []) : [],
        Evolution: evolution,
        MegaEvolution: megaEvolution
    };

    if (isEdit) {
        if (!isStockEdit && nom !== existing.Nom) {
            propagatePersonnageRename(existing.Nom, nom);
        }

        persistCreatorObject("Personnages", personnage);

        syncCreatorObjectRuntime("Personnages", personnage);

        saveCreatorContenu();

        showToast("Personnage modifié", `« ${nom} » a été mis à jour.`);

        showDevCategoryMenu("Personnages");

        return;
    }

    getCreatorContenu().Personnages.push(personnage);

    syncCreatorObjectRuntime("Personnages", personnage);

    if (parentEvolution) {
        linkEvolutionCible(parentEvolution.SourceNom, nom);
    }

    saveCreatorContenu();

    showToast("Personnage créé", `${nom} (${typeEnergie}) a été ajouté au jeu.`);

    if (evolution && evolution.Cible === null) {
        showToast("Évolution", "Crée maintenant le personnage vers lequel " + nom + " évoluera.");

        startPersonnageCreator({ SourceNom: nom, NiveauRequis: evolution.NiveauRequis });

        return;
    }

    showDevCategoryMenu("Personnages");
}

function linkEvolutionCible(parentNom, cibleNom) {
    const created = getCreatorContenu();

    const saved = (created.Personnages || []).find(p => p && p.Nom === parentNom);

    if (saved && saved.Evolution) {
        saved.Evolution.Cible = cibleNom;
    }

    const runtime = (state.contenu?.Personnages || []).find(p => p && p.Nom === parentNom);

    if (runtime && runtime.Evolution) {
        runtime.Evolution.Cible = cibleNom;
    }

    saveCreatorContenu();
}

function propagatePersonnageRename(oldNom, newNom) {
    (state.contenu?.Attaques || []).forEach(attaque => {
        if (attaque && attaque.Personnage === oldNom) {
            attaque.Personnage = newNom;

            persistCreatorObject("Attaques", attaque);
        }
    });

    (state.contenu?.Personnages || []).forEach(p => {
        if (p && p.Evolution && p.Evolution.Cible === oldNom) {
            p.Evolution.Cible = newNom;

            persistCreatorObject("Personnages", p);
        }
    });
}