"use strict";

/* ============================================================
   game/creator-vfx.js — Créateur : Effets visuels (VFX)
   Étape 1 : structure de données + CRUD + attachements.
   - frames[] : lecture de haut en bas, chaque frame = image PNG
     (sélection) ou pixel art (16/32/64, exporté en PNG data URL)
   - moteur de lecture + déclencheurs : game/vfx.js (étape 2)
   - éditeur de frames / preview : étape 3, pixel art : étape 4
============================================================ */

/* ============================================================
   MODÈLE — frame par défaut (toute frame fusionnée avec ceci)
============================================================ */

function createEmptyVfxFrame() {
    return {
        id: "frame-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1000),
        source: "",
        sourceType: "png",
        pixelSize: 32,
        duration: 300,
        x: 50,
        y: 40,
        surface: "battle",
        opacity: 100,
        scaleStart: 100,
        scaleEnd: 100,
        rotationSpeed: 0,
        motionX: 0,
        motionY: 0,
        easing: "linear",
        flipX: !1,
        flipY: !1,
        blend: "normal",
        tint: "",
        loop: 1,
        holdUntil: "",
        branchMode: "none",
        branchTarget: "",
        branchDelay: 0,
        sound: ""
    };
}

function normalizeVfxFrame(frame) {
    const base = createEmptyVfxFrame();

    if (!frame || typeof frame !== "object") return base;

    const merged = { ...base, ...frame };

    merged.duration = Math.max(1, Math.floor(Number(merged.duration) || 300));

    merged.x = clamp(Number(merged.x) || 0, 0, 100);

    merged.y = clamp(Number(merged.y) || 0, 0, 100);

    merged.opacity = clamp(Number(merged.opacity) || 0, 0, 100);

    merged.scaleStart = Math.max(1, Math.floor(Number(merged.scaleStart) || 100));

    merged.scaleEnd = Math.max(1, Math.floor(Number(merged.scaleEnd) || 100));

    merged.rotationSpeed = Number(merged.rotationSpeed) || 0;

    merged.motionX = Number(merged.motionX) || 0;

    merged.motionY = Number(merged.motionY) || 0;

    if (["battle", "screen"].indexOf(merged.surface) === -1) merged.surface = "battle";

    if (["linear", "easeIn", "easeOut"].indexOf(merged.easing) === -1) merged.easing = "linear";

    if (["normal", "screen", "multiply"].indexOf(merged.blend) === -1) merged.blend = "normal";

    merged.flipX = !!merged.flipX;

    merged.flipY = !!merged.flipY;

    merged.loop = Number.isInteger(merged.loop) ? merged.loop : 1;

    if (merged.loop === 0) merged.loop = 1;

    if (["none", "chain", "parallel"].indexOf(merged.branchMode) === -1) merged.branchMode = "none";

    merged.branchDelay = Math.max(0, Math.floor(Number(merged.branchDelay) || 0));

    if (typeof merged.tint !== "string") merged.tint = "";

    if (typeof merged.sound !== "string") merged.sound = "";

    if (typeof merged.branchTarget !== "string") merged.branchTarget = "";

    if (typeof merged.holdUntil !== "string") merged.holdUntil = "";

    return merged;
}

function createEmptyVfx(nom) {
    return {
        Nom: nom,
        frames: [],
        intensite: 100,
        remplaceInstance: !0,
        loopCap: 3000
    };
}

function normalizeVfx(vfx) {
    const base = createEmptyVfx(vfx && vfx.Nom ? vfx.Nom : "Effet visuel");

    if (!vfx || typeof vfx !== "object") return base;

    const merged = { ...base, ...vfx };

    if (!Array.isArray(merged.frames)) merged.frames = [];

    merged.frames = merged.frames.map(normalizeVfxFrame);

    merged.intensite = clamp(Number(merged.intensite) || 100, 1, 100);

    merged.remplaceInstance = !!merged.remplaceInstance;

    merged.loopCap = Math.max(100, Math.floor(Number(merged.loopCap) || 3000));

    return merged;
}

/* ============================================================
   LISTE DES EFFETS VISUELS
============================================================ */

function getVfxList() {
    return getCreatorContenu().EffetsVisuels || [];
}

function findVfxByName(nom) {
    return getVfxList().find(v => v && v.Nom === nom) || null;
}

function vfxNameExists(nom) {
    return getVfxList().some(v => v && v.Nom === nom);
}

/* ============================================================
   FORMULAIRE PRINCIPAL (étape 1 : identité + frames en lecture
   seule + attachements ; l'éditeur de frames arrive à l'étape 3)
============================================================ */

function startVfxCreator(existing) {
    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    const isEdit = Boolean(existing);

    const vfx = isEdit ? normalizeVfx(existing) : null;

    const titre = isEdit ? `Modifier l'effet visuel « ${escapeHtml(existing.Nom)} »` : "Nouvel effet visuel";

    const framesHtml = vfx && vfx.frames.length > 0 ? vfx.frames.map((f, i) => `
        <button type="button" class="dev-entry-card" data-frame-index="${i}">
            <span>
                <span class="dev-entry-name">Frame ${i + 1} · ${f.sourceType === "pixel" ? `pixel ${f.pixelSize}×${f.pixelSize}` : "PNG"} · ${f.duration} ms</span>
                <span class="dev-entry-info">pos ${Math.round(f.x)}%,${Math.round(f.y)}% · opacité ${f.opacity}%${f.loop === -1 ? " · ∞" : ""}${f.branchMode !== "none" ? ` · branche ${f.branchMode}` : ""}</span>
            </span>
        </button>`).join("") : `<p class="dev-info-note">Aucune frame — clique « Éditer les frames » pour commencer.</p>`;

    panel.innerHTML = `
        <h3 style="margin-bottom:12px;">${titre}</h3>
        <p class="dev-info-note">Pile de frames jouées de haut en bas. Édite-les dans l'éditeur, attache l'effet aux attaques ci-dessous, sauvegarde.</p>
        <div class="input-group"><label for="dev-vfx-nom">Nom de l'effet visuel</label><input type="text" id="dev-vfx-nom" maxlength="40" autocomplete="off" value="${escapeHtml(isEdit ? existing.Nom : "")}"></div>
        <div class="dev-form-row">
            <div class="input-group"><label for="dev-vfx-intensite">Intensité (%)</label><input type="number" id="dev-vfx-intensite" value="${vfx ? vfx.intensite : 100}" min="1" max="100" step="1"></div>
            <div class="input-group"><label for="dev-vfx-loopcap">Durée max des boucles ∞ (ms)</label><input type="number" id="dev-vfx-loopcap" value="${vfx ? vfx.loopCap : 3000}" min="100" step="100"></div>
        </div>
        <label class="dev-check-item" style="margin:10px 0;"><input type="checkbox" id="dev-vfx-remplace"${vfx && !vfx.remplaceInstance ? "" : " checked"}><span>Remplacer l'instance existante (anti-empilement)</span></label>
        <div class="dev-section-title">Frames (haut → bas)</div>
        <div class="dev-list-scroll">${framesHtml}</div>
        <div class="dev-form-actions">
            <button type="button" id="dev-vfx-edit-frames" class="primary-button">Éditer les frames</button>
            <button type="button" id="dev-vfx-cancel" class="secondary-button">Annuler</button>
            <button type="button" id="dev-vfx-save" class="secondary-button">${isEdit ? "Enregistrer" : "Créer l'effet visuel"}</button>
        </div>
        <div class="dev-section-title">Attacher à</div>
        <div id="dev-vfx-attachments"></div>`;

    renderVfxAttachmentPanel(existing ? existing.Nom : null);

    const editFramesBtn = $("#dev-vfx-edit-frames");

    if (editFramesBtn) {
        editFramesBtn.addEventListener("click", () => {
            const nom = $("#dev-vfx-nom").value.trim();

            if (!nom) {
                showToast("Nom manquant", "Donne un nom à l'effet avant d'éditer les frames.");

                return;
            }

            startVfxFrameEditor(collectVfxDraft(existing, vfx));
        });
    }

    panel.querySelectorAll("[data-frame-index]").forEach(btn => {
        btn.addEventListener("click", () => {
            const nom = $("#dev-vfx-nom").value.trim();

            if (!nom) return;

            const draft = collectVfxDraft(existing, vfx);

            startVfxFrameEditor(draft, Number(btn.dataset.frameIndex));
        });
    });

    $("#dev-vfx-cancel").addEventListener("click", () => showDevCategoryMenu("EffetsVisuels"));

    $("#dev-vfx-save").addEventListener("click", () => submitVfxCreator(existing, collectVfxDraft(existing, vfx)));
}

function collectVfxDraft(existing, vfx) {
    const base = vfx ? normalizeVfx(vfx) : createEmptyVfx($("#dev-vfx-nom") ? $("#dev-vfx-nom").value.trim() : (existing ? existing.Nom : "Effet visuel"));

    if ($("#dev-vfx-nom")) base.Nom = $("#dev-vfx-nom").value.trim() || base.Nom;

    if ($("#dev-vfx-intensite")) base.intensite = clamp(lireIntInput("#dev-vfx-intensite", 100), 1, 100);

    if ($("#dev-vfx-loopcap")) base.loopCap = Math.max(100, lireIntInput("#dev-vfx-loopcap", 3000));

    if ($("#dev-vfx-remplace")) base.remplaceInstance = $("#dev-vfx-remplace").checked;

    return base;
}

/* ============================================================
   ATTACHER — panel bidirectionnel (côté VFX)
   Les attachements vivent sur la CIBLE (champ EffetsVisuels),
   même modèle que la liste Attaques des personnages.
============================================================ */

const VFX_ATTACHMENT_TARGETS = [
    { type: "Personnages", label: "Personnages" },
    { type: "Monstres", label: "Monstres" },
    { type: "Attaques", label: "Attaques" },
    { type: "Effets", label: "Effets" },
    { type: "Statuts", label: "Statuts" },
    { type: "Energies", label: "Énergies" }
];

const VFX_TRIGGERS = [
    { id: "onAttack", label: "Déclenchement : attaque" },
    { id: "onDamageDealt", label: "Dégâts infligés" },
    { id: "onDamageTaken", label: "Dégâts subis" },
    { id: "onStatut", label: "Statut appliqué" },
    { id: "onHealSelf", label: "Soin reçu (soi)" },
    { id: "onHealTarget", label: "Soin infligé (cible)" },
    { id: "onKill", label: "Ennemi vaincu" },
    { id: "onResurrect", label: "Résurrection (totem)" },
    { id: "onCrit", label: "Coup critique" }
];

function renderVfxAttachmentPanel(vfxNom) {
    const container = $("#dev-vfx-attachments");

    if (!container) return;

    container.innerHTML = "";

    if (!vfxNom) {
        container.innerHTML = `<p class="dev-info-note">Enregistre l'effet visuel, puis rouvre-le pour l'attacher.</p>`;

        return;
    }

    VFX_ATTACHMENT_TARGETS.forEach(({ type, label }) => {
        const items = type === "Monstres" ? (getCreatorContenu().Monstres || []) : (state.contenu?.[type] || []);

        if (!Array.isArray(items) || items.length === 0) return;

        const block = document.createElement("div");

        block.className = "dev-check-list";

        block.style.marginBottom = "10px";

        const title = document.createElement("div");

        title.className = "dev-section-title";

        title.style.margin = "4px 0";

        title.textContent = label;

        block.appendChild(title);

        items.forEach(item => {
            if (!item || !item.Nom) return;

            const row = document.createElement("label");

            row.className = "dev-check-item";

            const checkbox = document.createElement("input");

            checkbox.type = "checkbox";

            const current = vfxGetAttachment(item, vfxNom);

            checkbox.checked = current !== null;

            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    vfxSetAttachment(item, vfxNom, VFX_TRIGGERS.map(t => t.id));
                } else {
                    vfxRemoveAttachment(item, vfxNom);
                }

                if (type === "Monstres") persistCreatorObject("Monstres", item);
                else persistCreatorObject(type, item);

                saveCreatorContenu();

                renderVfxAttachmentPanel(vfxNom);
            });

            row.appendChild(checkbox);

            const span = document.createElement("span");

            span.textContent = item.Nom;

            row.appendChild(span);

            block.appendChild(row);

            /* Sélecteur de déclencheurs sous l'attachement actif */
            if (current !== null) {
                const trigRow = document.createElement("div");

                trigRow.className = "vfx-trigger-row";

                VFX_TRIGGERS.forEach(trig => {
                    const t = document.createElement("label");

                    t.className = "dev-check-item vfx-trigger-item";

                    const tc = document.createElement("input");

                    tc.type = "checkbox";

                    tc.checked = current.triggers.includes(trig.id);

                    tc.addEventListener("change", () => {
                        const att = vfxGetAttachment(item, vfxNom);

                        if (!att) return;

                        if (tc.checked && !att.triggers.includes(trig.id)) att.triggers.push(trig.id);

                        if (!tc.checked) att.triggers = att.triggers.filter(id => id !== trig.id);

                        if (att.triggers.length === 0) att.triggers = VFX_TRIGGERS.map(x => x.id);

                        if (type === "Monstres") persistCreatorObject("Monstres", item);
                        else persistCreatorObject(type, item);

                        saveCreatorContenu();
                    });

                    t.appendChild(tc);

                    const ts = document.createElement("span");

                    ts.textContent = trig.label;

                    t.appendChild(ts);

                    trigRow.appendChild(t);
                });

                block.appendChild(trigRow);
            }
        });

        container.appendChild(block);
    });

    if (container.children.length === 0) {
        container.innerHTML = `<p class="dev-info-note">Aucun contenu auquel attacher (crée des attaques, personnages, effets… d'abord).</p>`;
    }
}

/* ============================================================
   SOUMISSION
============================================================ */

function submitVfxCreator(existing, draft = null) {
    const nom = $("#dev-vfx-nom").value.trim();

    if (!nom) {
        showToast("Nom invalide", "Le nom ne peut pas être vide.");

        return;
    }

    const isEdit = Boolean(existing);

    if ((!isEdit || nom !== existing.Nom) && vfxNameExists(nom)) {
        showToast("Nom déjà utilisé", `Un effet visuel nommé « ${nom} » existe déjà.`);

        return;
    }

    const intensite = clamp(lireIntInput("#dev-vfx-intensite", 100), 1, 100);

    const loopCap = Math.max(100, lireIntInput("#dev-vfx-loopcap", 3000));

    const remplaceInstance = !$("#dev-vfx-remplace") || $("#dev-vfx-remplace").checked;

    let vfx;

    if (draft) {
        vfx = draft;

        vfx.Nom = nom;

        vfx.intensite = intensite;

        vfx.loopCap = loopCap;

        vfx.remplaceInstance = remplaceInstance;

        vfx.frames = (Array.isArray(vfx.frames) ? vfx.frames : []).map(normalizeVfxFrame);
    } else if (isEdit) {
        vfx = normalizeVfx(existing);

        vfx.intensite = intensite;

        vfx.loopCap = loopCap;

        vfx.remplaceInstance = remplaceInstance;
    } else {
        vfx = createEmptyVfx(nom);

        vfx.intensite = intensite;

        vfx.loopCap = loopCap;

        vfx.remplaceInstance = remplaceInstance;
    }

    if (isEdit && nom !== existing.Nom) {
        propagateVfxRename(existing.Nom, nom);
    }

    if (isEdit) {
        const i = getVfxList().findIndex(v => v && v.Nom === existing.Nom);

        if (i >= 0) getCreatorContenu().EffetsVisuels[i] = vfx;
        else getCreatorContenu().EffetsVisuels.push(vfx);
    } else {
        if (!Array.isArray(getCreatorContenu().EffetsVisuels)) getCreatorContenu().EffetsVisuels = [];

        getCreatorContenu().EffetsVisuels.push(vfx);
    }

    saveCreatorContenu();

    showToast(isEdit ? "Effet visuel modifié" : "Effet visuel créé", `« ${nom} » ${vfx.frames.length} frame(s).`);

    showDevCategoryMenu("EffetsVisuels");

    if (draft && draft.frames.length > 0) {
        showToast("Astuce", "Rouvre Modifier pour éditer les frames à nouveau.");
    }
}

function vfxAttachmentNames(item) {
    return (item && Array.isArray(item.EffetsVisuels)) ? item.EffetsVisuels.map(a => typeof a === "string" ? a : (a && a.nom)) : [];
}

/* ============================================================
   RENOMMAGE — propagation vers tous les attachements
============================================================ */

function propagateVfxRename(oldNom, newNom) {
    VFX_ATTACHMENT_TARGETS.forEach(({ type }) => {
        const items = type === "Monstres" ? (getCreatorContenu().Monstres || []) : (state.contenu?.[type] || []);

        (items || []).forEach(item => {
            if (item && Array.isArray(item.EffetsVisuels) && item.EffetsVisuels.includes(oldNom)) {
                item.EffetsVisuels = item.EffetsVisuels.map(nom => nom === oldNom ? newNom : nom);

                if (type === "Monstres") {
                    persistCreatorObject("Monstres", item);
                } else {
                    persistCreatorObject(type, item);
                }
            }
        });
    });
}

function vfxGetAttachment(item, vfxNom) {
    if (!item || !Array.isArray(item.EffetsVisuels)) return null;

    const att = item.EffetsVisuels.find(a => (typeof a === "string" ? a : a && a.nom) === vfxNom);

    if (!att) return null;

    if (typeof att === "string") return { nom: att, triggers: VFX_TRIGGERS.map(t => t.id) };

    return { nom: att.nom, triggers: Array.isArray(att.triggers) && att.triggers.length > 0 ? att.triggers : VFX_TRIGGERS.map(t => t.id) };
}

function vfxSetAttachment(item, vfxNom, triggers) {
    if (!Array.isArray(item.EffetsVisuels)) item.EffetsVisuels = [];

    vfxRemoveAttachment(item, vfxNom);

    if (!Array.isArray(item.EffetsVisuels)) item.EffetsVisuels = [];

    item.EffetsVisuels.push({ nom: vfxNom, triggers: triggers.slice() });
}

function vfxRemoveAttachment(item, vfxNom) {
    if (!item || !Array.isArray(item.EffetsVisuels)) return;

    item.EffetsVisuels = item.EffetsVisuels.filter(a => (typeof a === "string" ? a : a && a.nom) !== vfxNom);

    if (item.EffetsVisuels.length === 0) delete item.EffetsVisuels;
}

/* ============================================================
   SUPPRESSION — avertissements d'attachements
============================================================ */

function getVfxDeleteWarnings(nom) {
    const warnings = [];

    VFX_ATTACHMENT_TARGETS.forEach(({ type, label }) => {
        const items = type === "Monstres" ? (getCreatorContenu().Monstres || []) : (state.contenu?.[type] || []);

        (items || []).forEach(item => {
            if (item && Array.isArray(item.EffetsVisuels) && item.EffetsVisuels.includes(nom)) {
                warnings.push(`attaché à « ${item.Nom} » (${label})`);
            }
        });
    });

    getVfxList().forEach(v => {
        if (v && v !== nom && Array.isArray(v.frames)) {
            v.frames.forEach(f => {
                if (f.branchTarget === nom) warnings.push(`branche de « ${v.Nom} » vers cet effet`);
            });
        }
    });

    return warnings;
}

function deleteVfx(nom) {
    const list = getCreatorContenu().EffetsVisuels;

    if (!Array.isArray(list)) return;

    const i = list.findIndex(v => v && v.Nom === nom);

    if (i >= 0) list.splice(i, 1);

    VFX_ATTACHMENT_TARGETS.forEach(({ type }) => {
        const items = type === "Monstres" ? (getCreatorContenu().Monstres || []) : (state.contenu?.[type] || []);

        (items || []).forEach(item => {
            if (item && Array.isArray(item.EffetsVisuels) && item.EffetsVisuels.includes(nom)) {
                item.EffetsVisuels = item.EffetsVisuels.filter(n => n !== nom);

                if (item.EffetsVisuels.length === 0) delete item.EffetsVisuels;

                if (type === "Monstres") {
                    persistCreatorObject("Monstres", item);
                } else {
                    persistCreatorObject(type, item);
                }
            }
        });
    });

    getVfxList().forEach(v => {
        if (v && Array.isArray(v.frames)) {
            v.frames.forEach(f => {
                if (f.branchTarget === nom) {
                    f.branchTarget = "";

                    f.branchMode = "none";
                }
            });
        }
    });

    saveCreatorContenu();
}

/* ============================================================
   INTÉGRATION PICKER / LISTE (personnalisations locales du
   créateur générique — appelées par creator-core via startCreatorForm)
============================================================ */

function startVfxForm(existing) {
    startVfxCreator(existing);
}

function getVfxSummary(obj) {
    const vfx = normalizeVfx(obj);

    return `${vfx.frames.length} frame(s) · intensité ${vfx.intensite}%${vfx.frames.some(f => f.loop === -1) ? " · boucle ∞" : ""}`;
}

function confirmVfxDelete(obj) {
    const nom = obj.Nom;

    const warnings = getVfxDeleteWarnings(nom);

    let message = `Supprimer « ${nom} » ?`;

    if (warnings.length > 0) {
        message += "\n\nAttention :\n- " + warnings.join("\n- ");
    }

    if (!confirm(message)) return;

    deleteVfx(nom);

    showToast("Supprimé", `« ${nom} » a été supprimé et détaché.`);

    showDevCategoryMenu("EffetsVisuels");
}

/* ============================================================
   ÉDITEUR DE FRAMES — scène de préview + pellicule +
   panneau de propriétés + PNG + déclencheurs de test
   (étape 3 ; pixel art arrive à l'étape 4)
============================================================ */

let vfxEditorDraft = null;

let vfxEditorSelected = 0;

function startVfxFrameEditor(draft, selectIndex = 0) {
    vfxEditorDraft = normalizeVfx(draft);

    vfxEditorSelected = Math.min(selectIndex, Math.max(0, vfxEditorDraft.frames.length - 1));

    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    panel.innerHTML = `
        <h3 style="margin-bottom:8px;">Frames — « ${escapeHtml(vfxEditorDraft.Nom)} »</h3>
        <input type="hidden" id="vfx-hidden-image"><input type="hidden" id="dev-vfx-nom" value="${escapeHtml(vfxEditorDraft.Nom)}">
        <div class="vfx-editor-grid">
            <div class="vfx-editor-left">
                <div class="dev-section-title" style="margin-top:0;">Pellicule (haut → bas)</div>
                <div id="vfx-filmstrip" class="vfx-filmstrip"></div>
                <div class="vfx-filmstrip-actions">
                    <button type="button" class="secondary-button" id="vfx-add-png">+ PNG</button>
                    <button type="button" class="secondary-button" id="vfx-add-pixel">+ Pixel</button>
                    <button type="button" class="secondary-button" id="vfx-dup-frame">Dupliquer</button>
                    <button type="button" class="secondary-button" id="vfx-move-up">↑</button>
                    <button type="button" class="secondary-button" id="vfx-move-down">↓</button>
                    <button type="button" class="secondary-button" id="vfx-del-frame">Suppr.</button>
                </div>
            </div>
            <div class="vfx-editor-right">
                <div class="dev-section-title" style="margin-top:0;">Scène <button type="button" class="small-button" id="vfx-test-play">▶ Tester</button></div>
                <div id="vfx-stage" class="vfx-stage">
                    <div class="vfx-stage-fighter vfx-stage-player">JOUEUR</div>
                    <div class="vfx-stage-fighter vfx-stage-enemy">ENNEMI</div>
                </div>
                <div class="dev-section-title">Propriétés de la frame</div>
                <div id="vfx-frame-props" class="vfx-frame-props"></div>
            </div>
        </div>
        <div class="dev-form-actions">
            <button type="button" id="vfx-frames-done" class="primary-button">Terminé — retour à l'effet</button>
        </div>`;

    vfxRenderFilmstrip();

    vfxRenderFrameProps();

    $("#vfx-add-png").addEventListener("click", () => {
        vfxPendingFrameSlot = "new";

        openDevImagePicker("#vfx-hidden-image", "#vfx-stage", "personnages", "#dev-vfx-nom");
    });

    const pixelBtn = $("#vfx-add-pixel");

    if (pixelBtn) {
        pixelBtn.addEventListener("click", () => {
            const nom = vfxEditorDraft.Nom;

            if (!nom) return;

            startVfxPixelEditor(vfxEditorDraft);
        });
    }

    $("#vfx-dup-frame").addEventListener("click", () => {
        if (vfxEditorDraft.frames.length === 0) return;

        const copy = normalizeVfxFrame({ ...vfxEditorDraft.frames[vfxEditorSelected], id: undefined });

        copy.id = "frame-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1000);

        vfxEditorDraft.frames.splice(vfxEditorSelected + 1, 0, copy);

        vfxEditorSelected++;

        vfxRenderFilmstrip();

        vfxRenderFrameProps();
    });

    $("#vfx-move-up").addEventListener("click", () => {
        if (vfxEditorSelected <= 0) return;

        const f = vfxEditorDraft.frames.splice(vfxEditorSelected, 1)[0];

        vfxEditorSelected--;

        vfxEditorDraft.frames.splice(vfxEditorSelected, 0, f);

        vfxRenderFilmstrip();

        vfxRenderFrameProps();
    });

    $("#vfx-move-down").addEventListener("click", () => {
        if (vfxEditorSelected >= vfxEditorDraft.frames.length - 1) return;

        const f = vfxEditorDraft.frames.splice(vfxEditorSelected, 1)[0];

        vfxEditorSelected++;

        vfxEditorDraft.frames.splice(vfxEditorSelected, 0, f);

        vfxRenderFilmstrip();

        vfxRenderFrameProps();
    });

    $("#vfx-del-frame").addEventListener("click", () => {
        if (vfxEditorDraft.frames.length === 0) return;

        vfxEditorDraft.frames.splice(vfxEditorSelected, 1);

        vfxEditorSelected = Math.min(vfxEditorSelected, vfxEditorDraft.frames.length - 1);

        if (vfxEditorSelected < 0) vfxEditorSelected = 0;

        vfxRenderFilmstrip();

        vfxRenderFrameProps();
    });

    $("#vfx-test-play").addEventListener("click", () => {
        vfxPlayPreviewOnStage();
    });

    $("#vfx-frames-done").addEventListener("click", () => {
        startVfxCreator(vfxEditorDraft);
    });
}

function vfxHandleImagePicked(chemin) {
    if (!chemin || !vfxPendingFrameSlot) return;

    if (vfxPendingFrameSlot === "new") {
        const frame = createEmptyVfxFrame();

        frame.source = chemin;

        frame.sourceType = "png";

        vfxEditorDraft.frames.push(frame);

        vfxEditorSelected = vfxEditorDraft.frames.length - 1;
    }

    vfxPendingFrameSlot = null;

    vfxRenderFilmstrip();

    vfxRenderFrameProps();
}

let vfxPendingFrameSlot = null;

function vfxRenderFilmstrip() {
    const strip = $("#vfx-filmstrip");

    if (!strip) return;

    strip.innerHTML = "";

    if (vfxEditorDraft.frames.length === 0) {
        strip.innerHTML = `<p class="dev-info-note">Vide — « + PNG » pour ajouter la première frame.</p>`;

        return;
    }

    vfxEditorDraft.frames.forEach((frame, i) => {
        const item = document.createElement("button");

        item.type = "button";

        item.className = "vfx-film-item" + (i === vfxEditorSelected ? " selected" : "");

        const thumb = document.createElement("img");

        thumb.src = frame.source;

        thumb.className = "vfx-film-thumb";

        item.appendChild(thumb);

        const label = document.createElement("span");

        label.className = "vfx-film-label";

        label.textContent = `${i + 1} · ${frame.duration}ms`;

        item.appendChild(label);

        item.addEventListener("click", () => {
            if (frame.sourceType === "pixel" && event.detail === 2) {
                startVfxPixelEditor(vfxEditorDraft, i);

                return;
            }

            vfxEditorSelected = i;

            vfxRenderFilmstrip();

            vfxRenderFrameProps();
        });

        strip.appendChild(item);
    });
}

function vfxCurrentFrame() {
    return vfxEditorDraft && vfxEditorDraft.frames[vfxEditorSelected] || null;
}

function vfxRenderFrameProps() {
    const container = $("#vfx-frame-props");

    if (!container) return;

    const frame = vfxCurrentFrame();

    if (!frame) {
        container.innerHTML = `<p class="dev-info-note">Aucune frame sélectionnée.</p>`;

        return;
    }

    container.innerHTML = `
        <div class="dev-form-row">
            <div class="input-group"><label>Durée (ms)</label><input type="number" data-prop="duration" value="${frame.duration}" min="1" step="1"></div>
            <div class="input-group"><label>Maintenir jusqu'à (hold)</label><select data-prop="holdUntil"><option value=""${frame.holdUntil === "" ? " selected" : ""}>Durée normale</option>${VFX_TRIGGERS.map(t => `<option value="${t.id}"${frame.holdUntil === t.id ? " selected" : ""}>${t.label}</option>`).join("")}</select></div>
            <div class="input-group"><label>Boucles (1–N, -1 = ∞)</label><input type="number" data-prop="loop" value="${frame.loop}" min="-1" step="1"></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label>Position X (%) — glisse sur la scène</label><input type="number" data-prop="x" value="${Math.round(frame.x)}" min="0" max="100" step="1"></div>
            <div class="input-group"><label>Position Y (%)</label><input type="number" data-prop="y" value="${Math.round(frame.y)}" min="0" max="100" step="1"></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label>Opacité (%)</label><input type="number" data-prop="opacity" value="${frame.opacity}" min="0" max="100" step="1"></div>
            <div class="input-group"><label>Surface</label><select data-prop="surface"><option value="battle"${frame.surface === "battle" ? " selected" : ""}>Combat (panneaux)</option><option value="screen"${frame.surface === "screen" ? " selected" : ""}>Écran entier</option></select></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label>Échelle début (%)</label><input type="number" data-prop="scaleStart" value="${frame.scaleStart}" min="1" step="1"></div>
            <div class="input-group"><label>Échelle fin (%)</label><input type="number" data-prop="scaleEnd" value="${frame.scaleEnd}" min="1" step="1"></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label>Rotation (deg/s)</label><input type="number" data-prop="rotationSpeed" value="${frame.rotationSpeed}" step="any"></div>
            <div class="input-group"><label>Dérive X (%/s)</label><input type="number" data-prop="motionX" value="${frame.motionX}" step="any"></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label>Dérive Y (%/s)</label><input type="number" data-prop="motionY" value="${frame.motionY}" step="any"></div>
            <div class="input-group"><label>Easing</label><select data-prop="easing"><option value="linear"${frame.easing === "linear" ? " selected" : ""}>Linéaire</option><option value="easeIn"${frame.easing === "easeIn" ? " selected" : ""}>Ease in</option><option value="easeOut"${frame.easing === "easeOut" ? " selected" : ""}>Ease out</option></select></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label>Blend</label><select data-prop="blend"><option value="normal"${frame.blend === "normal" ? " selected" : ""}>Normal</option><option value="screen"${frame.blend === "screen" ? " selected" : ""}>Screen (lueurs)</option><option value="multiply"${frame.blend === "multiply" ? " selected" : ""}>Multiply</option></select></div>
            <div class="input-group"><label>Tinte (couleur CSS, vide = aucun)</label><input type="text" data-prop="tint" value="${escapeHtml(frame.tint)}" maxlength="20"></div>
        </div>
        <div class="dev-form-row">
            <label class="dev-check-item"><input type="checkbox" data-prop="flipX"${frame.flipX ? " checked" : ""}><span>Flip X</span></label>
            <label class="dev-check-item"><input type="checkbox" data-prop="flipY"${frame.flipY ? " checked" : ""}><span>Flip Y</span></label>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label>Branchement</label><select data-prop="branchMode"><option value="none"${frame.branchMode === "none" ? " selected" : ""}>Aucun</option><option value="chain"${frame.branchMode === "chain" ? " selected" : ""}>Série (après)</option><option value="parallel"${frame.branchMode === "parallel" ? " selected" : ""}>Parallèle (avec)</option></select></div>
            <div class="input-group"><label>Branche vers (effet)</label><input type="text" data-prop="branchTarget" list="vfx-branch-list" value="${escapeHtml(frame.branchTarget)}" maxlength="40"><datalist id="vfx-branch-list">${getVfxList().filter(v => v && v.Nom !== vfxEditorDraft.Nom).map(v => `<option value="${escapeHtml(v.Nom)}">`).join("")}</datalist></div>
        </div>
        <div class="dev-form-row">
            <div class="input-group"><label>Délai branche (ms)</label><input type="number" data-prop="branchDelay" value="${frame.branchDelay}" min="0" step="1"></div>
            <div class="input-group"><label>Son (vide = silence)</label><input type="text" data-prop="sound" value="${escapeHtml(frame.sound)}" maxlength="40"></div>
        </div>`;

    container.querySelectorAll("[data-prop]").forEach(input => {
        const prop = input.dataset.prop;

        const apply = () => {
            if (input.type === "checkbox") {
                frame[prop] = input.checked;
            } else if (input.tagName === "SELECT") {
                frame[prop] = input.value;
            } else if (prop === "x" || prop === "y" || prop === "opacity") {
                frame[prop] = clamp(Number(input.value) || 0, 0, 100);
            } else if (prop === "duration" || prop === "scaleStart" || prop === "scaleEnd" || prop === "branchDelay") {
                frame[prop] = Math.max(prop === "duration" ? 1 : 0, Math.floor(Number(input.value) || 0));
            } else if (prop === "loop") {
                const n = Math.floor(Number(input.value) || 1);

                frame[prop] = n === 0 ? 1 : n;
            } else {
                frame[prop] = Number(input.value) || 0;
            }
        };

        input.addEventListener("input", apply);

        input.addEventListener("change", apply);
    });

    vfxPositionStageGhost();
}

/* Fantôme de la frame sur la scène — glissable */
function vfxPositionStageGhost() {
    const stage = $("#vfx-stage");

    if (!stage) return;

    let ghost = stage.querySelector(".vfx-stage-ghost");

    const frame = vfxCurrentFrame();

    if (!frame || !frame.source) {
        if (ghost) ghost.remove();

        return;
    }

    if (!ghost) {
        ghost = document.createElement("img");

        ghost.className = "vfx-stage-ghost";

        ghost.draggable = false;

        stage.appendChild(ghost);

        const onDrag = (ev) => {
            const rect = stage.getBoundingClientRect();

            const x = clamp(((ev.clientX - rect.left) / rect.width) * 100, 0, 100);

            const y = clamp(((ev.clientY - rect.top) / rect.height) * 100, 0, 100);

            frame.x = Math.round(x);

            frame.y = Math.round(y);

            ghost.style.left = x + "%";

            ghost.style.top = y + "%";

            const xInput = $("#vfx-frame-props [data-prop='x']");

            const yInput = $("#vfx-frame-props [data-prop='y']");

            if (xInput) xInput.value = Math.round(x);

            if (yInput) yInput.value = Math.round(y);
        };

        const onDown = (ev) => {
            ev.preventDefault();

            const move = (e) => onDrag(e);

            const up = () => {
                document.removeEventListener("pointermove", move);

                document.removeEventListener("pointerup", up);
            };

            document.addEventListener("pointermove", move);

            document.addEventListener("pointerup", up);
        };

        ghost.addEventListener("pointerdown", onDown);
    }

    ghost.src = frame.source;

    ghost.style.left = frame.x + "%";

    ghost.style.top = frame.y + "%";

    ghost.style.opacity = String(frame.opacity / 100);
}

/* Lecture de test sur la scène (mock) */
function vfxPlayPreviewOnStage() {
    if (!vfxEditorDraft || vfxEditorDraft.frames.length === 0) return;

    const stage = $("#vfx-stage");

    if (!stage) return;

    let layer = stage.querySelector(".vfx-stage-play");

    if (layer) layer.remove();

    layer = document.createElement("div");

    layer.className = "vfx-stage-play";

    stage.appendChild(layer);

    const speed = (typeof gameSpeed === "number" && gameSpeed > 0) ? gameSpeed : 1;

    let i = 0;

    let start = null;

    const step = (ts) => {
        if (!layer.parentElement) return;

        if (start === null) start = ts;

        while (i < vfxEditorDraft.frames.length) {
            const frame = vfxEditorDraft.frames[i];

            const elapsed = ts - start;

            const limit = frame.duration * Math.max(1, frame.loop);

            if (elapsed < limit || i === vfxEditorDraft.frames.length - 1) {
                if (!layer.dataset.frameIndex || Number(layer.dataset.frameIndex) !== i) {
                    layer.dataset.frameIndex = String(i);

                    layer.innerHTML = "";

                    const img = document.createElement("img");

                    img.src = frame.source;

                    img.className = "vfx-stage-play-img";

                    img.style.left = frame.x + "%";

                    img.style.top = frame.y + "%";

                    img.style.opacity = String(frame.opacity / 100);

                    layer.appendChild(img);
                }

                requestAnimationFrame(step);

                return;
            }

            start += limit;

            i++;
        }

        layer.remove();
    };

    requestAnimationFrame(step);
}

/* ============================================================
   ÉDITEUR PIXEL ART — 16/32/64, palette, outils, onion skin,
   export PNG data URL (même pipeline qu'un PNG sélectionné)
   (étape 4)
============================================================ */

const VFX_PIXEL_PALETTE = [
    "#000000", "#ffffff", "#ff0000", "#ff8000", "#ffff00", "#00ff00",
    "#00ffff", "#0080ff", "#0000ff", "#8000ff", "#ff00ff", "#ff8080",
    "#804000", "#402000", "#f4c95d", "#f4f7fb", "#8f9bad", "#6c7cff",
    "#45d69a", "#ff5364", "#2a3444", "#141a24"
];

let vfxPixelGrid = null;

let vfxPixelSize = 32;

let vfxPixelTool = "pencil";

let vfxPixelColor = "#ffffff";

let vfxPixelOnion = !1;

function startVfxPixelEditor(draft, selectIndex = 0) {
    vfxEditorDraft = normalizeVfx(draft);

    vfxEditorSelected = selectIndex;

    /* Grille de départ : frame courante si pixel, sinon vide. */
    const current = vfxEditorDraft.frames[vfxEditorSelected];

    vfxPixelSize = (current && current.sourceType === "pixel" && [16, 32, 64].includes(current.pixelSize)) ? current.pixelSize : 32;

    vfxPixelGrid = createEmptyPixelGrid(vfxPixelSize);

    if (current && current.sourceType === "pixel" && current.source) {
        /* Restauration différée : l'image se dessine au chargement. */
        vpxPixelRestoreFrom(current.source);
    }

    resetDevPanel();

    $("#dev-menu-main").classList.add("hidden");

    const panel = $("#dev-panel");

    panel.classList.remove("hidden");

    const paletteHtml = VFX_PIXEL_PALETTE.map(c =>
        `<button type="button" class="vpx-swatch${c === vfxPixelColor ? " selected" : ""}" data-color="${c}" style="background:${c}"></button>`
    ).join("");

    panel.innerHTML = `
        <h3 style="margin-bottom:8px;">Pixel art — « ${escapeHtml(vfxEditorDraft.Nom)} »</h3>
        <div class="vpx-grid">
            <div class="vpx-left">
                <div class="vpx-toolbar">
                    <button type="button" class="vpx-tool${vfxPixelTool === "pencil" ? " selected" : ""}" data-tool="pencil" title="Crayon">✏</button>
                    <button type="button" class="vpx-tool${vfxPixelTool === "eraser" ? " selected" : ""}" data-tool="eraser" title="Gomme">⌫</button>
                    <button type="button" class="vpx-tool${vfxPixelTool === "fill" ? " selected" : ""}" data-tool="fill" title="Remplir">▣</button>
                    <button type="button" class="vpx-tool${vfxPixelTool === "picker" ? " selected" : ""}" data-tool="picker" title="Pipette">💧</button>
                    <button type="button" class="vpx-tool${vfxPixelTool === "line" ? " selected" : ""}" data-tool="line" title="Ligne">╱</button>
                    <span class="vpx-sep"></span>
                    <label class="dev-check-item vpx-onion"><input type="checkbox" id="vpx-onion"><span>Onion</span></label>
                    <button type="button" class="secondary-button vpx-clear" id="vpx-clear">Vider</button>
                </div>
                <canvas id="vpx-canvas" class="vpx-canvas" width="${vfxPixelSize * 16}" height="${vfxPixelSize * 16}"></canvas>
                <div class="vpx-palette">${paletteHtml}</div>
            </div>
            <div class="vpx-right">
                <div class="dev-section-title" style="margin-top:0;">Taille</div>
                <div class="vpx-sizes">
                    <button type="button" class="secondary-button${vfxPixelSize === 16 ? " selected" : ""}" data-size="16">16×16</button>
                    <button type="button" class="secondary-button${vfxPixelSize === 32 ? " selected" : ""}" data-size="32">32×32</button>
                    <button type="button" class="secondary-button${vfxPixelSize === 64 ? " selected" : ""}" data-size="64">64×64</button>
                </div>
                <div class="dev-section-title">Aperçu (taille réelle de jeu)</div>
                <canvas id="vpx-preview" class="vpx-preview" width="96" height="96"></canvas>
                <div class="dev-section-title">Cadre</div>
                <label class="dev-check-item"><input type="checkbox" id="vpx-transparent-bg" checked><span>Fond transparent</span></label>
                <div class="dev-form-actions" style="margin-top:14px;">
                    <button type="button" id="vpx-cancel" class="secondary-button">Annuler</button>
                    <button type="button" id="vpx-save-frame" class="primary-button">→ Nouvelle frame</button>
                </div>
                <p class="dev-info-note">« → Nouvelle frame » exporte le dessin en PNG (data URL) et l'ajoute à la pile. Édite-la ensuite (durée, position…) dans l'éditeur de frames.</p>
            </div>
        </div>`;

    vpxBindPixelEditor();

    vpxRenderCanvas();

    vpxRenderPreview();
}

function createEmptyPixelGrid(size) {
    return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
}

function vpxBindPixelEditor() {
    const canvas = $("#vpx-canvas");

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    let painting = false;

    let lineStart = null;

    const cellFromEvent = (ev) => {
        const rect = canvas.getBoundingClientRect();

        const col = Math.floor(((ev.clientX - rect.left) / rect.width) * vfxPixelSize);

        const row = Math.floor(((ev.clientY - rect.top) / rect.height) * vfxPixelSize);

        return { col: clamp(col, 0, vfxPixelSize - 1), row: clamp(row, 0, vfxPixelSize - 1) };
    };

    const applyTool = (cell, previewOnly = false) => {
        if (vfxPixelTool === "pencil") {
            vfxPixelGrid[cell.row][cell.col] = vfxPixelColor;
        } else if (vfxPixelTool === "eraser") {
            vfxPixelGrid[cell.row][cell.col] = null;
        } else if (vfxPixelTool === "fill") {
            const target = vfxPixelGrid[cell.row][cell.col];

            if (target !== vfxPixelColor) {
                const stack = [[cell.col, cell.row]];

                while (stack.length > 0) {
                    const [c, r] = stack.pop();

                    if (c < 0 || c >= vfxPixelSize || r < 0 || r >= vfxPixelSize) continue;

                    if (vfxPixelGrid[r][c] !== target) continue;

                    vfxPixelGrid[r][c] = vfxPixelColor;

                    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
                }
            }
        } else if (vfxPixelTool === "picker") {
            const picked = vfxPixelGrid[cell.row][cell.col];

            if (picked) {
                vfxPixelColor = picked;

                document.querySelectorAll(".vpx-swatch").forEach(sw => sw.classList.toggle("selected", sw.dataset.color === picked));
            }

            return;
        }

        if (!previewOnly) {
            vpxRenderCanvas();

            vpxRenderPreview();
        }
    };

    canvas.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();

        const cell = cellFromEvent(ev);

        if (vfxPixelTool === "line") {
            lineStart = cell;

            return;
        }

        painting = true;

        applyTool(cell);

        const move = (e) => {
            if (!painting) return;

            applyTool(cellFromEvent(e));
        };

        const up = (e) => {
            painting = false;

            if (vfxPixelTool === "line" && lineStart) {
                const end = cellFromEvent(e);

                vpxDrawLine(lineStart, end);

                lineStart = null;
            }

            document.removeEventListener("pointermove", move);

            document.removeEventListener("pointerup", up);
        };

        document.addEventListener("pointermove", move);

        document.addEventListener("pointerup", up);
    });

    document.querySelectorAll(".vpx-tool").forEach(btn => {
        btn.addEventListener("click", () => {
            vfxPixelTool = btn.dataset.tool;

            document.querySelectorAll(".vpx-tool").forEach(b => b.classList.toggle("selected", b === btn));
        });
    });

    document.querySelectorAll(".vpx-swatch").forEach(sw => {
        sw.addEventListener("click", () => {
            vfxPixelColor = sw.dataset.color;

            document.querySelectorAll(".vpx-swatch").forEach(b => b.classList.toggle("selected", b === sw));
        });
    });

    document.querySelectorAll(".vpx-sizes [data-size]").forEach(btn => {
        btn.addEventListener("click", () => {
            const newSize = Number(btn.dataset.size);

            if (newSize === vfxPixelSize) return;

            if (vpxGridHasContent() && !confirm(`Changer la taille va ${newSize > vfxPixelSize ? "agrandir (le dessin reste en haut à gauche)" : "réduire (coupé aux nouvelles dimensions)"} la grille. Continuer ?`)) return;

            vfxPixelSize = newSize;

            vfxPixelGrid = createEmptyPixelGrid(newSize);

            document.querySelectorAll(".vpx-sizes [data-size]").forEach(b => b.classList.toggle("selected", b === btn));

            canvas.width = newSize * 16;

            canvas.height = newSize * 16;

            vpxRenderCanvas();

            vpxRenderPreview();
        });
    });

    const onion = $("#vpx-onion");

    if (onion) {
        onion.checked = vfxPixelOnion;

        onion.addEventListener("change", () => {
            vfxPixelOnion = onion.checked;

            vpxRenderCanvas();
        });
    }

    const clearBtn = $("#vpx-clear");

    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            vfxPixelGrid = createEmptyPixelGrid(vfxPixelSize);

            vpxRenderCanvas();

            vpxRenderPreview();
        });
    }

    $("#vpx-cancel").addEventListener("click", () => {
        startVfxFrameEditor(vfxEditorDraft);
    });

    $("#vpx-save-frame").addEventListener("click", () => {
        const source = vpxExportGrid();

        if (!source) {
            showToast("Grille vide", "Dessine quelque chose d'abord.");

            return;
        }

        const frame = createEmptyVfxFrame();

        frame.source = source;

        frame.sourceType = "pixel";

        frame.pixelSize = vfxPixelSize;

        vfxEditorDraft.frames.push(frame);

        vfxEditorSelected = vfxEditorDraft.frames.length - 1;

        showToast("Frame pixel ajoutée", `${vfxPixelSize}×${vfxPixelSize} — règle-la dans l'éditeur de frames.`);

        startVfxFrameEditor(vfxEditorDraft, vfxEditorSelected);
    });
}

function vpxGridHasContent() {
    return vfxPixelGrid && vfxPixelGrid.some(row => row.some(c => c !== null));
}

function vpxDrawLine(start, end) {
    let x0 = start.col, y0 = start.row;

    const x1 = end.col, y1 = end.row;

    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;

    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;

    let err = dx + dy;

    for (; ;) {
        vfxPixelGrid[y0][x0] = vfxPixelColor;

        if (x0 === x1 && y0 === y1) break;

        const e2 = 2 * err;

        if (e2 >= dy) { err += dy; x0 += sx; }

        if (e2 <= dx) { err += dx; y0 += sy; }
    }

    vpxRenderCanvas();

    vpxRenderPreview();
}

function vpxRenderCanvas() {
    const canvas = $("#vpx-canvas");

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const cell = canvas.width / vfxPixelSize;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* Damier de transparence */
    ctx.fillStyle = "#0d1117";

    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < vfxPixelSize; r++) {
        for (let c = 0; c < vfxPixelSize; c++) {
            if ((r + c) % 2 === 0) {
                ctx.fillStyle = "rgba(255,255,255,0.04)";

                ctx.fillRect(c * cell, r * cell, cell, cell);
            }
        }
    }

    /* Onion skin : frame précédente en fantôme */
    if (vfxPixelOnion && vfxEditorSelected > 0) {
        const prev = vfxEditorDraft.frames[vfxEditorSelected - 1];

        if (prev && prev.source) {
            ctx.globalAlpha = 0.25;

            const img = new Image();

            /* Dessin synchrone impossible pour data URL frais — l'onion
               s'affiche au prochain rendu après chargement. */
            img.onload = () => {
                ctx.globalAlpha = 0.25;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                ctx.globalAlpha = 1;
            };

            img.src = prev.source;
        }
    }

    /* Pixels */
    for (let r = 0; r < vfxPixelSize; r++) {
        for (let c = 0; c < vfxPixelSize; c++) {
            const color = vfxPixelGrid[r][c];

            if (!color) continue;

            ctx.fillStyle = color;

            ctx.fillRect(c * cell, r * cell, cell, cell);
        }
    }

    /* Grille */
    if (vfxPixelSize <= 32) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";

        ctx.lineWidth = 1;

        for (let i = 1; i < vfxPixelSize; i++) {
            ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height); ctx.stroke();

            ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(canvas.width, i * cell); ctx.stroke();
        }
    }
}

function vpxRenderPreview() {
    const canvas = $("#vpx-preview");

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const px = canvas.width / vfxPixelSize;

    for (let r = 0; r < vfxPixelSize; r++) {
        for (let c = 0; c < vfxPixelSize; c++) {
            const color = vfxPixelGrid[r][c];

            if (!color) continue;

            ctx.fillStyle = color;

            ctx.fillRect(c * px, r * px, Math.ceil(px), Math.ceil(px));
        }
    }
}

function vpxExportGrid() {
    if (!vpxGridHasContent()) return null;

    const canvas = document.createElement("canvas");

    canvas.width = vfxPixelSize;

    canvas.height = vfxPixelSize;

    const ctx = canvas.getContext("2d");

    for (let r = 0; r < vfxPixelSize; r++) {
        for (let c = 0; c < vfxPixelSize; c++) {
            const color = vfxPixelGrid[r][c];

            if (!color) continue;

            ctx.fillStyle = color;

            ctx.fillRect(c, r, 1, 1);
        }
    }

    return canvas.toDataURL("image/png");
}

function vpxPixelRestoreFrom(source) {
    const img = new Image();

    img.onload = () => {
        const temp = document.createElement("canvas");

        temp.width = vfxPixelSize;

        temp.height = vfxPixelSize;

        const tctx = temp.getContext("2d");

        tctx.drawImage(img, 0, 0, vfxPixelSize, vfxPixelSize);

        const data = tctx.getImageData(0, 0, vfxPixelSize, vfxPixelSize).data;

        for (let r = 0; r < vfxPixelSize; r++) {
            for (let c = 0; c < vfxPixelSize; c++) {
                const i = (r * vfxPixelSize + c) * 4;

                const alpha = data[i + 3];

                if (alpha < 128) {
                    vfxPixelGrid[r][c] = null;
                } else {
                    vfxPixelGrid[r][c] = "#" + [data[i], data[i + 1], data[i + 2]].map(v => v.toString(16).padStart(2, "0")).join("");
                }
            }
        }

        vpxRenderCanvas();

        vpxRenderPreview();
    };

    img.src = source;
}