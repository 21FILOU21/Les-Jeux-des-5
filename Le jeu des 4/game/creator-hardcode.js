"use strict";

/*
 * Mise à jour explicite de ContenuJeu.json.
 * Aucun autre module ne doit écrire ce fichier.
 */

const HARDCODED_CONTENT_PATH = "ContenuJeu.json";
const HARDCODED_CONTENT_TYPES = [
    "Personnages",
    "Monstres",
    "Attaques",
    "Effets",
    "Energies",
    "Statuts",
    "EffetsVisuels",
    "Items",
    "Animaux"
];
const HARDCODED_MANAGED_TYPES = [
    "Personnages",
    "Attaques",
    "Effets",
    "Energies",
    "Statuts",
    "EffetsVisuels",
    "Items",
    "Animaux"
];

let hardcodePanelState = { diskContent: null, selectedKeys: new Set() };

function hardcodeEscape(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

function hardcodeClone(value) {
    return structuredClone(value);
}

function hardcodeRuntimeObjects(type) {
    if (type === "Monstres") {
        return (typeof getCreatorContenu === "function" ? getCreatorContenu()?.Monstres : []) || [];
    }
    return Array.isArray(state?.contenu?.[type]) ? state.contenu[type] : [];
}

function hardcodeDiskObjects(type) {
    const data = hardcodePanelState.diskContent;
    return Array.isArray(data?.[type]) ? data[type] : [];
}

function hardcodeKey(type, object, index) {
    if (!object || typeof object !== "object") return type + "::index::" + index;
    const id = String(object.Id ?? "").trim();
    const name = String(object.Nom ?? "").trim();
    return id ? type + "::id::" + id : type + "::name::" + name;
}

function hardcodeFindMatch(type, object, list) {
    const id = String(object?.Id ?? "").trim();
    const name = String(object?.Nom ?? "").trim();

    if (id) {
        const byId = list.find(item => item && String(item.Id ?? "").trim() === id);
        if (byId) return { object: byId, reason: "id", value: id };
    }

    if (name) {
        const byName = list.find(item => item && String(item.Nom ?? "").trim() === name);
        if (byName) return { object: byName, reason: "nom", value: name };
    }

    return null;
}

function hardcodeValueText(value) {
    if (value === undefined) return "inexistant";
    if (value === null) return "null";
    if (typeof value === "string") return '"' + value + '"';
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value, null, 2);
}

function hardcodeFlatten(value, prefix, result) {
    const map = result || new Map();
    const pathPrefix = prefix || "";

    if (value === null || typeof value !== "object") {
        map.set(pathPrefix || "$", value);
        return map;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            map.set(pathPrefix || "$", []);
            return map;
        }
        value.forEach((entry, index) => {
            const path = pathPrefix ? pathPrefix + "[" + index + "]" : "[" + index + "]";
            hardcodeFlatten(entry, path, map);
        });
        return map;
    }

    const keys = Object.keys(value);
    if (keys.length === 0) {
        map.set(pathPrefix || "$", {});
        return map;
    }

    keys.forEach(key => {
        const path = pathPrefix ? pathPrefix + "." + key : key;
        hardcodeFlatten(value[key], path, map);
    });

    return map;
}

function hardcodeDiffRows(oldObject, newObject) {
    const oldMap = hardcodeFlatten(oldObject);
    const newMap = hardcodeFlatten(newObject);
    const paths = Array.from(new Set(Array.from(oldMap.keys()).concat(Array.from(newMap.keys())))).sort();
    const rows = [];

    paths.forEach(path => {
        const oldExists = oldMap.has(path);
        const newExists = newMap.has(path);
        const oldValue = oldMap.get(path);
        const newValue = newMap.get(path);

        if (oldExists && newExists && JSON.stringify(oldValue) === JSON.stringify(newValue)) return;

        const row = document.createElement("div");
        row.className = "hardcode-diff-row";

        const pathNode = document.createElement("span");
        pathNode.className = "hardcode-diff-path";
        pathNode.textContent = path;

        const oldNode = document.createElement("span");
        oldNode.className = "hardcode-diff-old";
        oldNode.textContent = oldExists ? hardcodeValueText(oldValue) : "—";

        const arrowNode = document.createElement("span");
        arrowNode.className = "hardcode-diff-arrow";
        arrowNode.textContent = newExists ? "→" : "→";

        const newNode = document.createElement("span");
        newNode.className = "hardcode-diff-new";
        newNode.textContent = newExists ? hardcodeValueText(newValue) : "supprimé";

        row.append(pathNode, oldNode, arrowNode, newNode);
        rows.push(row);
    });

    return rows;
}

function hardcodeComparison(object, type) {
    const diskList = hardcodeDiskObjects(type);
    const match = hardcodeFindMatch(type, object, diskList);

    if (!match) {
        return {
            status: "add",
            label: "Ajout au contenu",
            match: null,
            rows: hardcodeDiffRows({}, object)
        };
    }

    const rows = hardcodeDiffRows(match.object, object);

    return {
        status: rows.length ? "update" : "same",
        label: rows.length
            ? "Update le contenu " + (object.Nom || object.Id || "")
            : "Identique au hardcode actuel",
        match,
        rows
    };
}

function hardcodeEntries() {
    const entries = [];

    HARDCODED_CONTENT_TYPES.forEach(type => {
        hardcodeRuntimeObjects(type).forEach((object, index) => {
            if (!object || typeof object !== "object") return;
            entries.push({
                type,
                index,
                object,
                key: hardcodeKey(type, object, index)
            });
        });
    });

    return entries;
}

function hardcodeEnsureStyles() {
    if (document.getElementById("hardcode-updater-styles")) return;

    const style = document.createElement("style");
    style.id = "hardcode-updater-styles";
    style.textContent = [
        ".hardcode-updater-panel{display:flex;flex-direction:column;gap:12px}",
        ".hardcode-updater-toolbar,.hardcode-updater-actions,.hardcode-type-actions{display:flex;gap:8px;flex-wrap:wrap}",
        ".hardcode-updater-note{color:var(--muted);font-size:.9rem;line-height:1.45}",
        ".hardcode-type-section{border:1px solid rgba(255,255,255,.09);border-radius:12px;overflow:hidden;background:rgba(0,0,0,.12)}",
        ".hardcode-type-header{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.035)}",
        ".hardcode-type-header h4{margin:0}",
        ".hardcode-type-count,.hardcode-runtime-only{color:var(--muted);font-size:.8rem}",
        ".hardcode-entry{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 12px;border-top:1px solid rgba(255,255,255,.06)}",
        ".hardcode-entry-checkbox{width:18px;height:18px;margin-top:2px;accent-color:#68d391}",
        ".hardcode-entry-main{min-width:0}",
        ".hardcode-entry-title{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}",
        ".hardcode-entry-name{font-weight:700}",
        ".hardcode-entry-meta{color:var(--muted);font-size:.78rem}",
        ".hardcode-entry-status{display:block;margin-top:3px;font-size:.82rem}",
        ".hardcode-entry-status.add{color:#68d391}.hardcode-entry-status.update{color:#f6ad55}.hardcode-entry-status.same{color:var(--muted)}",
        ".hardcode-entry-toggle{border:0;background:transparent;color:inherit;cursor:pointer;font-size:1.05rem;min-width:32px;min-height:32px}",
        ".hardcode-entry-details{grid-column:2/4;padding:8px;border-radius:8px;background:rgba(0,0,0,.16);overflow-x:auto}",
        ".hardcode-diff-table{display:grid;gap:4px;min-width:620px}",
        ".hardcode-diff-row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(120px,1fr) 24px minmax(120px,1fr);gap:6px;align-items:start;padding:6px 7px;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.74rem;line-height:1.35}",
        ".hardcode-diff-path{color:#cbd5e0;overflow-wrap:anywhere}.hardcode-diff-old{color:#fc8181;overflow-wrap:anywhere;white-space:pre-wrap}.hardcode-diff-new{color:#68d391;overflow-wrap:anywhere;white-space:pre-wrap}.hardcode-diff-arrow{color:var(--muted);text-align:center}",
        ".hardcode-danger-button{border:1px solid rgba(252,129,129,.45);color:#fc8181}",
        "@media(max-width:700px){.hardcode-diff-row{grid-template-columns:1fr}.hardcode-diff-arrow{display:none}}"
    ].join("");
    document.head.appendChild(style);
}

function hardcodeInstallButton() {
    const main = document.getElementById("dev-menu-main");
    const exportButton = document.getElementById("dev-export-disk-btn");
    if (!main || !exportButton || document.getElementById("dev-update-hardcode-btn")) return;

    const button = document.createElement("button");
    button.id = "dev-update-hardcode-btn";
    button.type = "button";
    button.className = "secondary-button";
    button.style.gridColumn = "1 / -1";
    button.textContent = "🧩 Mettre à jour le contenu hardcoded (ContenuJeu.json)";
    button.addEventListener("click", openHardcodeUpdater);
    exportButton.insertAdjacentElement("afterend", button);
}

async function hardcodeReadDiskContent() {
    const response = await fetch(HARDCODED_CONTENT_PATH + "?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Impossible de lire " + HARDCODED_CONTENT_PATH + " (" + response.status + ").");
    }
    return hardcodeClone(await response.json());
}

function hardcodeRenderDiff(container, comparison) {
    if (!comparison.rows.length) {
        const empty = document.createElement("p");
        empty.className = "hardcode-updater-note";
        empty.textContent = "Aucune différence : aucune écriture nécessaire.";
        container.appendChild(empty);
        return;
    }

    const table = document.createElement("div");
    table.className = "hardcode-diff-table";
    comparison.rows.forEach(row => table.appendChild(row));
    container.appendChild(table);
}

function hardcodeRenderEntries() {
    const panel = document.getElementById("hardcode-updater-panel");
    if (!panel) return;

    const entries = hardcodeEntries();
    panel.innerHTML = "";

    const toolbar = document.createElement("div");
    toolbar.className = "hardcode-updater-toolbar";

    const selectAll = document.createElement("button");
    selectAll.className = "secondary-button";
    selectAll.textContent = "Sélectionner tout";

    const unselectAll = document.createElement("button");
    unselectAll.className = "secondary-button";
    unselectAll.textContent = "Désélectionner tout";

    const refresh = document.createElement("button");
    refresh.className = "secondary-button";
    refresh.textContent = "Actualiser la comparaison";

    toolbar.append(selectAll, unselectAll, refresh);
    panel.appendChild(toolbar);

    const note = document.createElement("p");
    note.className = "hardcode-updater-note";
    note.innerHTML = "Coche les éléments à écrire dans <strong>ContenuJeu.json</strong>. La correspondance utilise d'abord l'<strong>Id</strong>, sinon le <strong>Nom</strong>. Rouge = ancienne valeur remplacée ; vert = nouvelle valeur/ajout.";
    panel.appendChild(note);

    HARDCODED_CONTENT_TYPES.forEach(type => {
        const typeEntries = entries.filter(entry => entry.type === type);
        const section = document.createElement("section");
        section.className = "hardcode-type-section";

        const header = document.createElement("div");
        header.className = "hardcode-type-header";

        const titleWrap = document.createElement("div");
        const title = document.createElement("h4");
        title.textContent = type === "EffetsVisuels" ? "Effets visuels" : type;
        const count = document.createElement("span");
        count.className = "hardcode-type-count";
        count.textContent = " " + typeEntries.length + " élément(s)";
        titleWrap.append(title, count);

        const actions = document.createElement("div");
        actions.className = "hardcode-type-actions";

        const typeSelect = document.createElement("button");
        typeSelect.className = "small-button";
        typeSelect.type = "button";
        typeSelect.textContent = "Tout cocher";

        const typeDelete = document.createElement("button");
        typeDelete.className = "small-button hardcode-danger-button";
        typeDelete.type = "button";
        typeDelete.textContent = "Supprimer du hardcode";
        typeDelete.dataset.type = type;

        actions.append(typeSelect);
        if (HARDCODED_MANAGED_TYPES.includes(type)) actions.append(typeDelete);

        header.append(titleWrap, actions);
        section.appendChild(header);

        if (type === "Monstres") {
            const info = document.createElement("p");
            info.className = "hardcode-runtime-only";
            info.style.padding = "8px 12px";
            info.textContent = "Les monstres du créateur sont affichés pour information : le ContenuJeu.json actuel ne possède pas de section Monstres consommée par le chargeur.";
            section.appendChild(info);
        }

        typeEntries.forEach(entry => {
            const comparison = hardcodeComparison(entry.object, type);
            const row = document.createElement("div");
            row.className = "hardcode-entry";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "hardcode-entry-checkbox";
            checkbox.checked = hardcodePanelState.selectedKeys.has(entry.key);
            checkbox.disabled = type === "Monstres" || comparison.status === "same";
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) hardcodePanelState.selectedKeys.add(entry.key);
                else hardcodePanelState.selectedKeys.delete(entry.key);
            });

            const main = document.createElement("div");
            main.className = "hardcode-entry-main";

            const titleLine = document.createElement("div");
            titleLine.className = "hardcode-entry-title";

            const name = document.createElement("span");
            name.className = "hardcode-entry-name";
            name.textContent = entry.object.Nom || entry.object.Id || "(sans nom)";

            const meta = document.createElement("span");
            meta.className = "hardcode-entry-meta";
            meta.textContent = entry.object.Id ? "Id: " + entry.object.Id : "Id: —";

            titleLine.append(name, meta);

            const status = document.createElement("span");
            status.className = "hardcode-entry-status " + comparison.status;
            status.textContent = comparison.label;

            main.append(titleLine, status);

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "hardcode-entry-toggle";
            toggle.textContent = "▼";
            toggle.title = "Voir la comparaison";

            const details = document.createElement("div");
            details.className = "hardcode-entry-details hidden";

            hardcodeRenderDiff(details, comparison);

            toggle.addEventListener("click", () => {
                const open = !details.classList.contains("hidden");
                details.classList.toggle("hidden", open);
                toggle.textContent = open ? "▼" : "▲";
            });

            row.append(checkbox, main, toggle, details);
            section.appendChild(row);
        });

        if (!typeEntries.length) {
            const empty = document.createElement("p");
            empty.className = "hardcode-updater-note";
            empty.style.padding = "8px 12px";
            empty.textContent = "Aucun élément dans cette catégorie.";
            section.appendChild(empty);
        }

        typeSelect.addEventListener("click", () => {
            typeEntries.forEach(entry => {
                const comparison = hardcodeComparison(entry.object, type);
                if (comparison.status !== "same" && type !== "Monstres") {
                    hardcodePanelState.selectedKeys.add(entry.key);
                }
            });
            hardcodeRenderEntries();
        });

        typeDelete.addEventListener("click", () => hardcodeDeleteType(type));
        panel.appendChild(section);
    });

    const actions = document.createElement("div");
    actions.className = "hardcode-updater-actions";

    const back = document.createElement("button");
    back.className = "secondary-button";
    back.type = "button";
    back.textContent = "← Retour";
    back.addEventListener("click", showDevMenuMain);

    const apply = document.createElement("button");
    apply.className = "primary-button";
    apply.type = "button";
    apply.textContent = "Mettre à jour le hardcode sélectionné";
    apply.addEventListener("click", applyHardcodeUpdates);

    actions.append(back, apply);
    panel.appendChild(actions);

    selectAll.addEventListener("click", () => {
        entries.forEach(entry => {
            const comparison = hardcodeComparison(entry.object, entry.type);
            if (comparison.status !== "same" && entry.type !== "Monstres") {
                hardcodePanelState.selectedKeys.add(entry.key);
            }
        });
        hardcodeRenderEntries();
    });

    unselectAll.addEventListener("click", () => {
        hardcodePanelState.selectedKeys.clear();
        hardcodeRenderEntries();
    });

    refresh.addEventListener("click", async () => {
        try {
            hardcodePanelState.diskContent = await hardcodeReadDiskContent();
            hardcodePanelState.selectedKeys.clear();
            hardcodeRenderEntries();
        } catch (error) {
            console.error(error);
            showToast("Lecture impossible", error.message);
        }
    });
}

function hardcodeShowPanel() {
    const main = document.getElementById("dev-menu-main");
    const panel = document.getElementById("dev-panel");
    if (!main || !panel) return;

    main.classList.add("hidden");
    panel.classList.remove("hidden");

    const wrapper = document.createElement("div");
    wrapper.id = "hardcode-updater-panel";
    wrapper.className = "hardcode-updater-panel";

    const loading = document.createElement("p");
    loading.className = "hardcode-updater-note";
    loading.textContent = "Lecture de " + HARDCODED_CONTENT_PATH + "…";
    wrapper.appendChild(loading);

    panel.innerHTML = "";
    panel.appendChild(wrapper);
    hardcodePanelState.selectedKeys.clear();

    hardcodeReadDiskContent()
        .then(content => {
            hardcodePanelState.diskContent = content;
            hardcodeRenderEntries();
        })
        .catch(error => {
            console.error(error);
            wrapper.innerHTML = "";
            const message = document.createElement("p");
            message.className = "dev-info-note";
            message.textContent = "Impossible de lire " + HARDCODED_CONTENT_PATH + " : " + error.message;
            const back = document.createElement("button");
            back.className = "secondary-button";
            back.textContent = "← Retour";
            back.addEventListener("click", showDevMenuMain);
            wrapper.append(message, back);
        });
}

async function hardcodeWriteFile(content) {
    if (!saveDirectoryHandle) {
        throw new Error("Aucun dossier de jeu n'est sélectionné. Utilise « Changer de dossier » dans le menu Fichiers.");
    }

    const fileHandle = await saveDirectoryHandle.getFileHandle(HARDCODED_CONTENT_PATH, { create: true });
    const writable = await fileHandle.createWritable();

    try {
        await writable.write(JSON.stringify(content, null, 2));
    } finally {
        await writable.close();
    }
}

function hardcodeReplaceOrAdd(target, type, object) {
    if (!Array.isArray(target[type])) target[type] = [];
    const list = target[type];
    const match = hardcodeFindMatch(type, object, list);

    if (match) {
        list[list.indexOf(match.object)] = hardcodeClone(object);
        return "update";
    }

    list.push(hardcodeClone(object));
    return "add";
}

async function applyHardcodeUpdates() {
    const selected = hardcodeEntries().filter(entry => hardcodePanelState.selectedKeys.has(entry.key));

    if (!selected.length) {
        showToast("Aucun contenu sélectionné", "Coche au moins un élément à ajouter ou mettre à jour.");
        return;
    }

    const supported = selected.filter(entry => entry.type !== "Monstres");
    if (!supported.length) {
        showToast("Aucun élément exportable", "Les monstres du créateur ne sont pas chargés depuis ContenuJeu.json.");
        return;
    }

    if (!confirm("Mettre à jour " + supported.length + " élément(s) dans " + HARDCODED_CONTENT_PATH + " ?")) return;

    try {
        const output = hardcodeClone(await hardcodeReadDiskContent());
        let updated = 0;
        let added = 0;

        supported.forEach(entry => {
            const result = hardcodeReplaceOrAdd(output, entry.type, entry.object);
            if (result === "update") updated++;
            else added++;
        });

        await hardcodeWriteFile(output);

        hardcodePanelState.diskContent = output;
        hardcodePanelState.selectedKeys.clear();
        hardcodeRenderEntries();

        showToast("Hardcode mis à jour", updated + " mise(s) à jour · " + added + " ajout(s).");
    } catch (error) {
        console.error("Écriture de ContenuJeu.json impossible :", error);
        showToast("Écriture impossible", error.message);
    }
}

async function hardcodeDeleteType(type) {
    if (!HARDCODED_MANAGED_TYPES.includes(type)) return;

    const current = hardcodeDiskObjects(type);
    if (!current.length) {
        showToast("Déjà vide", "La section " + type + " est déjà vide dans " + HARDCODED_CONTENT_PATH + ".");
        return;
    }

    if (!confirm("Supprimer tout le type " + type + " de " + HARDCODED_CONTENT_PATH + " ?\n\n" + current.length + " élément(s) seront supprimés.")) return;

    try {
        const output = hardcodeClone(await hardcodeReadDiskContent());
        output[type] = [];
        await hardcodeWriteFile(output);

        hardcodePanelState.diskContent = output;
        hardcodePanelState.selectedKeys = new Set(
            Array.from(hardcodePanelState.selectedKeys).filter(key => !key.startsWith(type + "::"))
        );
        hardcodeRenderEntries();

        showToast("Type supprimé du hardcode", "La section " + type + " est maintenant vide.");
    } catch (error) {
        console.error("Suppression du type impossible :", error);
        showToast("Suppression impossible", error.message);
    }
}

function openHardcodeUpdater() {
    if (!state?.contenu) {
        showToast("Chargement en cours", "Le contenu du jeu n'est pas encore disponible.");
        return;
    }

    if (state.busy && !state.battleOver) {
        showToast("Action en cours", "Attends la fin de l'action avant de modifier le hardcode.");
        return;
    }

    if (typeof closeSaveMenu === "function") closeSaveMenu();
    if (typeof closeSettingsMenu === "function") closeSettingsMenu();

    hardcodeEnsureStyles();
    hardcodeShowPanel();
}

document.addEventListener("DOMContentLoaded", () => {
    hardcodeEnsureStyles();
    hardcodeInstallButton();
});
