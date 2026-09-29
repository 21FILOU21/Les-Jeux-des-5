"use strict";

/* ============================================================
   game/creator-images.js — Créateur : sélection d'images PNG
   (ex-game.js : sélecteur de fichiers, data URL sans écriture
   disque, copie vers assets/, export explicite sur le disque)
============================================================ */

let devImagePickerContext = null;

function openDevImagePicker(inputSelector, previewSelector, subfolder, nomInputSelector) {
    devImagePickerContext = {
        inputSelector,
        previewSelector,
        subfolder,
        nomInputSelector
    };

    const input = $("#dev-image-input");

    if (!input) {
        showToast("Sélecteur indisponible", "Impossible d'ouvrir le sélecteur d'image.");

        return;
    }

    input.value = "";

    input.click();
}

async function handleDevImageSelected(event) {
    const file = event.target.files && event.target.files[0];

    if (!file) return;

    if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
        showToast("Format non supporté", "Choisis un fichier .png.");

        return;
    }

    const context = devImagePickerContext;

    if (!context) return;

    const nom = ($(context.nomInputSelector)?.value || "").trim();

    if (!nom) {
        showToast("Nom manquant", "Entre d'abord le nom avant de choisir l'image.");

        return;
    }

    const chemin = await fileToDataUrl(file);

    if (file.size > 400 * 1024) {
        showToast("Image volumineuse", "L'image est stockée dans la sauvegarde (data URL). Les images de plus de 400 Ko alourdissent la sauvegarde.");
    } else {
        showToast("Image attachée", `L'image est enregistrée avec ${nom} (aucune écriture disque — utilise « Écrire sur le disque » pour exporter).`);
    }

    const input = $(context.inputSelector);

    if (input) input.value = chemin;

    if (typeof vfxHandleImagePicked === "function") {
        vfxHandleImagePicked(chemin);
    }

    const preview = $(context.previewSelector);

    if (preview) {
        preview.src = chemin;

        preview.classList.remove("hidden");
    }
}

async function copyDevImageToAssets(file, subfolder, nom) {
    if (!saveDirectoryHandle) return null;

    const granted = await verifySavedDirectoryPermission();

    if (!granted) return null;

    try {
        const assetsDir = await saveDirectoryHandle.getDirectoryHandle("assets", {
            create: !0
        });

        const targetDir = await assetsDir.getDirectoryHandle(subfolder, {
            create: !0
        });

        const fileHandle = await targetDir.getFileHandle(`${nom}.png`, {
            create: !0
        });

        const writable = await fileHandle.createWritable();

        try {
            await writable.write(file);
        } finally {
            await writable.close();
        }

        return `assets/${subfolder}/${nom}.png`;
    } catch (error) {
        console.error("Copie de l'image vers assets impossible :", error);

        return null;
    }
}

async function exportCreatorImagesToAssets() {
    const created = getCreatorContenu();

    if (!created) return 0;

    let exported = 0;

    const targets = [
        ... (created.Personnages || []).map(p => ({
            obj: p,
            subfolder: "personnages"
        })),
        ... (created.Monstres || []).map(m => ({
            obj: m,
            subfolder: "monstres"
        }))
    ];

    for (const entry of targets) {
        const image = entry.obj.Image;

        if (!image || !String(image).startsWith("data:")) continue;

        try {
            const blob = await (await fetch(image)).blob();

            const chemin = await copyDevImageToAssets(blob, entry.subfolder, entry.obj.Nom);

            if (chemin) {
                entry.obj.Image = chemin;

                exported++;
            }
        } catch (error) {
            console.error("Export d'image impossible :", error);
        }
    }

    return exported;
}

async function exportCreatorContentToDisk() {
    if (!confirm("Écrire Contenu.json + Saves.json et exporter les images vers assets/ sur le disque ?\n\n(Live Server peut recharger la page après l'écriture — c'est normal.)")) return;

    try {
        if (saveDirectoryHandle) {
            const contentHandle = await getContentFileHandle(!0);

            const file = await contentHandle.getFile();

            if (file.size > 0) {
                const text = await file.text();

                if (text.trim()) {
                    const diskContent = normalizeContenuData(JSON.parse(text));

                    /* Fusion : la mémoire (éditions en cours) gagne ;
                       le disque comble uniquement ce qui manque. */
                    ["Personnages", "Monstres", "Attaques", "Effets", "Energies", "Statuts", "Items"].forEach(key => {
                        diskContent[key].forEach(entry => {
                            if (!entry || !entry.Nom) return;

                            if (!contenuMemory[key].some(existing => existing && existing.Nom === entry.Nom)) {
                                contenuMemory[key].push(structuredClone(entry));
                            }
                        });
                    });
                }
            }
        }
    } catch (error) {
        console.warn("Fusion Contenu.json avant export impossible :", error);
    }

    let images = 0;

    try {
        images = await exportCreatorImagesToAssets();

        saveCreatorContenu();

        await ecrireFichierContenu();
    } catch (error) {
        console.error("Export impossible :", error);
    }

    const ok = await syncSaveFileToDisk();

    showToast(ok ? "Écriture terminée" : "Écriture impossible", ok ? `Contenu.json et Saves.json mis à jour${images > 0 ? ` · ${images} image(s) exportée(s) vers assets/` : ""}.` : "Aucun dossier/fichier accessible — utilise le menu Fichiers.");
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result || ""));

        reader.onerror = () => reject(reader.error);

        reader.readAsDataURL(file);
    });
}