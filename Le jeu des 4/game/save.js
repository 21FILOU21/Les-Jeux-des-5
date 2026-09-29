"use strict";

/* ============================================================
   game/save.js — Couche de persistance des sauvegardes
   (ex-game.js : structures Saves.json, handles IndexedDB,
   écriture/lecture disque, synchronisation, backup local,
   sauvegarde automatique)
   La couche UI (menus, slots, restauration) est dans
   save-menu.js.
============================================================ */

const SAVE_PATH = "Saves.json";

const CONTENT_PATH = "Contenu.json";

const LEGACY_SAVE_PATH = "Save.json";

const MAX_SAVE_SLOTS = 10;

let saveDirectoryHandle = null;

let currentSaveFileHandle = null;

let currentContentFileHandle = null;

const SAVE_DB_NAME = "MonsterGameSaveDB";

const SAVE_DB_VERSION = 2;

const SAVE_DB_STORE = "handles";

const SAVE_DIRECTORY_KEY = "saveDirectoryHandle";

const SAVE_FILE_KEY = "saveFileHandle";

const CONTENT_FILE_KEY = "contenuFileHandle";

let autoSaveEnabled = !0;

let autoSaveInProgress = !1;

let saveMemoryData = createEmptySaveFile();

let saveJsonString = JSON.stringify(saveMemoryData, null, 4);

let saveDirty = !1;

const LOCAL_SAVE_KEY = "gameSaveBackup";

const LOCAL_SAVE_TIME_KEY = "gameSaveBackupTime";

const LOCAL_CONTENT_KEY = "gameContenuBackup";

const SAVE_WRITE_THROTTLE_MS = 10000;

let lastPhysicalWriteTime = 0;

let savePermissionBridgeAttached = !1;

let savePermissionBridgeUsed = !1;

let selectedSaveSlot = null;

/* ============================================================
   STRUCTURES DE SAUVEGARDE
============================================================ */

let contenuMemory = createEmptyContenu();

function createEmptyContenu() {
    return {
        Personnages: [],
        Monstres: [],
        Attaques: [],
        Effets: [],
        Energies: [],
        Statuts: [],
        EffetsVisuels: [],
        Items: [],
        suppressions: {
            Personnages: [],
            Attaques: [],
            Effets: [],
            Energies: [],
            Statuts: [],
            EffetsVisuels: []
            Items: []
        }
    }
}

function createEmptySaveFile() {
    return {
        version: 2,
        autoSave: null,
        sauvegardes: Array(MAX_SAVE_SLOTS).fill(null),
        dossier: null,
        fichier: null
    }
}

function normalizeContenuData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) data = createEmptyContenu();

    ["Personnages", "Monstres", "Attaques", "Effets", "Energies", "Statuts", "EffetsVisuels", "Items"].forEach(key => {
        if (!Array.isArray(data[key])) data[key] = [];
    });

    if (!data.suppressions || typeof data.suppressions !== "object" || Array.isArray(data.suppressions)) data.suppressions = {};

    ["Personnages", "Attaques", "Effets", "Energies", "Statuts", "EffetsVisuels", "Items"].forEach(key => {
        if (!Array.isArray(data.suppressions[key])) data.suppressions[key] = [];
    });

    return data;
}

function normalizeSaveFile(data) {
    if (!data || typeof data !== "object") {
        data = createEmptySaveFile();
    }

    if (!Array.isArray(data.sauvegardes)) {
        data.sauvegardes = Array(MAX_SAVE_SLOTS).fill(null);
    }

    while (data.sauvegardes.length < MAX_SAVE_SLOTS) {
        data.sauvegardes.push(null);
    }

    data.sauvegardes = data.sauvegardes.slice(0, MAX_SAVE_SLOTS);

    if (!("autoSave" in data)) {
        data.autoSave = null;
    }

    if (!("version" in data)) {
        data.version = 2;
    }

    if (!("dossier" in data)) {
        data.dossier = null;
    }

    if (!("fichier" in data)) {
        data.fichier = null;
    }

    return data;
}

function updateSaveMemory() {
    saveMemoryData = normalizeSaveFile(structuredClone(saveMemoryData));

    saveJsonString = JSON.stringify(saveMemoryData, null, 4);

    saveDirty = !0;

    writeLocalBackup(saveJsonString);
}

function stripImagesForBackup(jsonText, includeMonstres) {
    const clone = JSON.parse(jsonText);

    const stripImage = (obj) => {
        if (obj && typeof obj === "object" && typeof obj.Image === "string" && obj.Image.startsWith("data:")) obj.Image = "";
    };

    const saves = [clone.autoSave, ...(clone.sauvegardes || [])].filter(Boolean);

    saves.forEach(save => {
        if (save && save.state) {
            stripImage(save.state.hero);

            stripImage(save.state.selectedHero);

            (save.state.monsters || []).forEach(stripImage);
        }
    });

    if (includeMonstres && clone.contenuCue && Array.isArray(clone.contenuCue.Monstres)) {
        clone.contenuCue.Monstres.forEach(stripImage);
    }

    return clone;
}

function writeLocalBackup(jsonText) {
    persistContenuBackup();

    try {
        localStorage.setItem(LOCAL_SAVE_KEY, jsonText);

        localStorage.setItem(LOCAL_SAVE_TIME_KEY, String(Date.now()));

        return !0;
    } catch (error) {
        const stages = [
            { includeMonstres: !1, note: "images des slots retirées (re-relues au chargement)" },
            { includeMonstres: !0, note: "images des monstres créés aussi retirées — dernier recours" }
        ];

        for (const stage of stages) {
            try {
                const slim = stripImagesForBackup(jsonText, stage.includeMonstres);

                localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(slim));

                localStorage.setItem(LOCAL_SAVE_TIME_KEY, String(Date.now()));

                console.warn(`Backup local allégé (${stage.note}) : quota localStorage dépassé.`);

                return !0;
            } catch (error2) {
                /* on tente l'étape suivante */
            }
        }

        console.error("Impossible de sauvegarder le backup local : quota dépassé même allégé. Utilise « Écrire sur le disque » (menu développeur) pour préserver les images.");

        return !1;
    }
}

/* Récupère le contenuCue d'une sauvegarde monolithique (ancien format)
   vers contenuMemory — l'ancien champ est retiré des données de jeu. */
function absorbLegacyContenu(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return;

    if (data.contenuCue && typeof data.contenuCue === "object" && !Array.isArray(data.contenuCue)) {
        const hasLocalContent = contenuMemory.Personnages.length > 0 || contenuMemory.Monstres.length > 0 || contenuMemory.Attaques.length > 0;

        if (!hasLocalContent) {
            contenuMemory = normalizeContenuData(structuredClone(data.contenuCue));
        }

        delete data.contenuCue;
    }
}

/* Backup dédié du contenu (mode sans dossier lié). */
function loadContenuBackup() {
    try {
        const raw = localStorage.getItem(LOCAL_CONTENT_KEY);

        if (!raw) return;

        const data = JSON.parse(raw);

        if (data && typeof data === "object" && !Array.isArray(data)) {
            contenuMemory = normalizeContenuData(data);
        }
    } catch (error) {
        console.error("Erreur lors du chargement du backup de contenu :", error);
    }
}

function persistContenuBackup() {
    try {
        localStorage.setItem(LOCAL_CONTENT_KEY, JSON.stringify(contenuMemory));
    } catch (error) {
        console.warn("Backup de contenu impossible (quota) : lie un dossier de jeu ou utilise « Écrire sur le disque » pour préserver le contenu et les images.");
    }
}

function generateSaveJsonString() {
    updateSaveMemory();

    return saveJsonString;
}

/* ============================================================
   HANDLES INDEXEDDB (mémorisation dossier/fichier entre sessions)
============================================================ */

function openSaveDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(SAVE_DB_NAME, SAVE_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(SAVE_DB_STORE)) {
                db.createObjectStore(SAVE_DB_STORE);
            }

            if (!db.objectStoreNames.contains("mapAssets")) {
                db.createObjectStore("mapAssets");
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        }
    });
}

async function saveHandleToDatabase(key, handle) {
    if (!handle) {
        return;
    }

    try {
        const db = await openSaveDatabase();

        await new Promise((resolve, reject) => {
            const transaction = db.transaction(SAVE_DB_STORE, "readwrite");

            const store = transaction.objectStore(SAVE_DB_STORE);

            store.put(handle, key);

            transaction.oncomplete = resolve;

            transaction.onerror = () => reject(transaction.error);
        });

        db.close();
    } catch (error) {
        console.error("Impossible de mémoriser le handle de sauvegarde :", error);
    }
}

async function deleteHandleFromDatabase(key) {
    try {
        const db = await openSaveDatabase();

        await new Promise((resolve, reject) => {
            const transaction = db.transaction(SAVE_DB_STORE, "readwrite");

            const store = transaction.objectStore(SAVE_DB_STORE);

            store.delete(key);

            transaction.oncomplete = resolve;

            transaction.onerror = () => reject(transaction.error);
        });

        db.close();
    } catch (error) {
        console.error("Impossible d'oublier le handle de sauvegarde :", error);
    }
}

async function readHandleFromDatabase(key) {
    try {
        const db = await openSaveDatabase();

        const handle = await new Promise((resolve, reject) => {
            const transaction = db.transaction(SAVE_DB_STORE, "readonly");

            const store = transaction.objectStore(SAVE_DB_STORE);

            const request = store.get(key);

            request.onsuccess = () => resolve(request.result || null);

            request.onerror = () => reject(request.error);
        });

        db.close();

        return handle;
    } catch (error) {
        console.error("Impossible de récupérer le handle de sauvegarde :", error);

        return null;
    }
}

async function loadSavedHandles() {
    try {
        const directory = await readHandleFromDatabase(SAVE_DIRECTORY_KEY);

        if (directory) {
            saveDirectoryHandle = directory;
        }

        const file = await readHandleFromDatabase(SAVE_FILE_KEY);

        if (file) {
            currentSaveFileHandle = file;
        }

        return saveDirectoryHandle || currentSaveFileHandle;
    } catch (error) {
        console.error("Impossible de récupérer les handles de sauvegarde :", error);

        return null;
    }
}

/* ============================================================
   BACKUP LOCAL (localStorage) + FERMETURE
============================================================ */

function loadSaveMemoryBackup() {
    try {
        const backup = localStorage.getItem(LOCAL_SAVE_KEY);

        if (!backup) {
            return !1;
        }

        const data = JSON.parse(backup);

        if (!data || !Array.isArray(data.sauvegardes)) {
            console.warn("La sauvegarde locale est invalide.");

            return !1;
        }

        saveMemoryData = normalizeSaveFile(data);

        absorbLegacyContenu(saveMemoryData);

        loadContenuBackup();

        saveJsonString = JSON.stringify(saveMemoryData, null, 4);

        saveDirty = !1;

        console.log("Sauvegardes locales récupérées.");

        return !0;
    } catch (error) {
        console.error("Erreur lors du chargement des sauvegardes locales :", error);

        return !1;
    }
}

function backupSaveBeforeClosing() {
    try {
        if (typeof xpAnimationInProgress !== "undefined" && xpAnimationInProgress) {
            if (saveJsonString) writeLocalBackup(saveJsonString);
            return;
        }

        const battleIsStable = !state.busy && (state.turn === "player" || state.battleOver);
        const overworldIsStable = document.getElementById("world-screen")?.classList.contains("active") && !state.busy;
        const endIsStable = document.getElementById("end-screen")?.classList.contains("active") && !state.busy;

        if (globalState.adventureStarted && autoSaveEnabled && (battleIsStable || overworldIsStable || endIsStable)) {
            saveMemoryData.autoSave = createSaveData("Sauvegarde automatique");
            updateSaveMemory();
        } else if (saveJsonString) {
            writeLocalBackup(saveJsonString);
        }
    } catch (error) {
        console.error("Impossible de créer le backup avant fermeture :", error);
    }
}

window.addEventListener("beforeunload", backupSaveBeforeClosing);

window.addEventListener("pagehide", backupSaveBeforeClosing);

/* ============================================================
   SAUVEGARDE AUTOMATIQUE
============================================================ */

setInterval(() => {
    autoSaveGame();
}, 30000);

async function autoSaveGame() {
    if (!autoSaveEnabled) return;
    if (!globalState.adventureStarted) return;
    if (autoSaveInProgress) return;
    if (typeof xpAnimationInProgress !== "undefined" && xpAnimationInProgress) return;

    const battleIsStable = !state.busy && (state.turn === "player" || state.battleOver);
    const overworldIsStable = document.getElementById("world-screen")?.classList.contains("active") && !state.busy;
    const endIsStable = document.getElementById("end-screen")?.classList.contains("active") && !state.busy;

    if (!battleIsStable && !overworldIsStable && !endIsStable) return;

    autoSaveInProgress = !0;

    try {
        saveMemoryData.autoSave = createSaveData("Sauvegarde automatique");
        updateSaveMemory();
    } catch (error) {
        console.error("Erreur de sauvegarde automatique :", error);
    } finally {
        autoSaveInProgress = !1;
    }
}

function createSaveData(saveName) {
    const savedState = structuredClone(state);


    savedState.contenu = null;

    delete savedState.log;

    delete savedState._restoredScreen;

    return {
        name: saveName,
        date: new Date().toISOString(),
        globalState: structuredClone(globalState),
        state: savedState,
        ui: { screen: getActiveGameScreenName() },
        overworld: (typeof getOverworldSaveData === "function") ? getOverworldSaveData() : null
    }
}

function getActiveGameScreenName() {
    const active = document.querySelector(".screen.active");

    if (!active || !active.id) return null;

    const name = active.id.replace(/-screen$/, "");

    return (name in screens) ? name : null;
}

/* ============================================================
   PERMISSIONS + SÉLECTION DE DOSSIER
============================================================ */

async function choisirDossierSauvegarde() {
    try {
        const handle = await window.showDirectoryPicker({
            mode: "readwrite"
        });

        saveDirectoryHandle = handle;

        currentSaveFileHandle = null;

        await saveHandleToDatabase(SAVE_DIRECTORY_KEY, handle);

        await deleteHandleFromDatabase(SAVE_FILE_KEY);

        console.log("Dossier de sauvegarde mémorisé :", handle.name);

        return handle;
    } catch (error) {
        if (error.name === "AbortError") {
            return null;
        }

        console.error("Erreur lors du choix du dossier :", error);

        return null;
    }
}

async function verifyFilePermission(fileHandle) {
    if (!fileHandle) {
        return !1;
    }

    try {
        let permission = await fileHandle.queryPermission({
            mode: "readwrite"
        });

        if (permission === "granted") {
            return !0;
        }

        if (permission === "prompt") {
            permission = await fileHandle.requestPermission({
                mode: "readwrite"
            });
        }

        return permission === "granted";
    } catch (error) {
        console.error("Erreur de permission du fichier :", error);

        return !1;
    }
}

async function verifySavedDirectoryPermission() {
    if (!saveDirectoryHandle) {
        return !1;
    }

    try {
        let permission = await saveDirectoryHandle.queryPermission({
            mode: "readwrite"
        });

        if (permission === "granted") {
            return !0;
        }

        if (permission === "prompt") {
            permission = await saveDirectoryHandle.requestPermission({
                mode: "readwrite"
            });
        }

        return permission === "granted";
    } catch (error) {
        console.error("Erreur de permission du dossier :", error);

        return !1;
    }
}

async function requestSavePermissions() {
    try {
        if (currentSaveFileHandle) {
            let permission = await currentSaveFileHandle.queryPermission({
                mode: "readwrite"
            });

            if (permission === "prompt") {
                permission = await currentSaveFileHandle.requestPermission({
                    mode: "readwrite"
                });
            }

            if (permission !== "granted") {
                return !1;
            }
        }

        if (saveDirectoryHandle) {
            let permission = await saveDirectoryHandle.queryPermission({
                mode: "readwrite"
            });

            if (permission === "prompt") {
                permission = await saveDirectoryHandle.requestPermission({
                    mode: "readwrite"
                });
            }

            if (permission !== "granted") {
                return !1;
            }
        }

        return Boolean(currentSaveFileHandle || saveDirectoryHandle);
    } catch (error) {
        console.error("Impossible d'obtenir la permission de sauvegarde :", error);

        return !1;
    }
}

function attachSavePermissionBridge() {
    if (savePermissionBridgeAttached) {
        return;
    }

    savePermissionBridgeAttached = !0;

    const bridge = async () => {
        if (savePermissionBridgeUsed) {
            return;
        }

        if (!saveDirectoryHandle && !currentSaveFileHandle) {
            return;
        }

        savePermissionBridgeUsed = !0;

        try {
            const granted = await requestSavePermissions();

            if (granted) {
                await synchronizeSaveFileWithDisk();
            }
        } catch (error) {
            console.error("Pont de permission de sauvegarde :", error);
        }
    };

    document.addEventListener("pointerdown", bridge);

    document.addEventListener("keydown", bridge);
}

/* ============================================================
   LECTURE / ÉCRITURE DISQUE
============================================================ */

async function getSaveFileHandle(create = !0) {
    if (currentSaveFileHandle) {
        const permission = await verifyFilePermission(currentSaveFileHandle);

        if (!permission) {
            throw new Error("Le jeu n'a pas la permission d'utiliser ce fichier de sauvegarde.");
        }

        return currentSaveFileHandle;
    }

    if (!saveDirectoryHandle) {
        await loadSavedHandles();
    }

    if (!saveDirectoryHandle) {
        throw new Error("Aucun dossier de sauvegarde sélectionné.");
    }

    const permission = await verifySavedDirectoryPermission();

    if (!permission) {
        throw new Error("Le jeu n'a pas la permission d'utiliser le dossier de sauvegarde.");
    }

    currentSaveFileHandle = await saveDirectoryHandle.getFileHandle(SAVE_PATH, {
        create: create
    });

    return currentSaveFileHandle;
}

async function getContentFileHandle(create = !0) {
    if (currentContentFileHandle) {
        const permission = await verifyFilePermission(currentContentFileHandle);

        if (!permission) {
            throw new Error("Le jeu n'a pas la permission d'utiliser ce fichier de contenu.");
        }

        return currentContentFileHandle;
    }

    if (!saveDirectoryHandle) {
        await loadSavedHandles();
    }

    if (!saveDirectoryHandle) {
        throw new Error("Aucun dossier de sauvegarde sélectionné.");
    }

    const permission = await verifySavedDirectoryPermission();

    if (!permission) {
        throw new Error("Le jeu n'a pas la permission d'utiliser le dossier de sauvegarde.");
    }

    currentContentFileHandle = await saveDirectoryHandle.getFileHandle(CONTENT_PATH, {
        create: create
    });

    await saveHandleToDatabase(CONTENT_FILE_KEY, currentContentFileHandle);

    return currentContentFileHandle;
}

async function ecrireFichierContenu() {
    const fileHandle = await getContentFileHandle(!0);

    updateSaveLocationInfo();

    const texte = JSON.stringify(normalizeContenuData(structuredClone(contenuMemory)), null, 4);

    const writable = await fileHandle.createWritable();

    try {
        await writable.write(texte);
    } finally {
        await writable.close();
    }
}

/* MIGRATION une seule fois : l'ancien Saves.json monolithique est scindé en
   Saves.json (jeu) + Contenu.json (contenu créé). L'ancien fichier reste
   intact sur le disque — supprime-le manuellement quand tout te convient. */
async function migrateLegacySaveIfNeeded() {
    if (!saveDirectoryHandle) return;

    let legacyHandle = null;

    try {
        legacyHandle = await saveDirectoryHandle.getFileHandle(LEGACY_SAVE_PATH, { create: !1 });
    } catch (error) {
        return;
    }

    const savesHandle = await saveDirectoryHandle.getFileHandle(SAVE_PATH, { create: !1 }).catch(() => null);

    if (savesHandle) return;

    const file = await legacyHandle.getFile();

    if (file.size === 0) return;

    const text = await file.text();

    if (!text.trim()) return;

    let legacy;

    try {
        legacy = JSON.parse(text);
    } catch (error) {
        console.warn("Saves.json ancien illisible — migration ignorée.");

        return;
    }

    const legacyContent = legacy.contenuCue || null;

    const gameData = normalizeSaveFile(structuredClone(legacy));

    delete gameData.contenuCue;

    if (legacyContent) {
        contenuMemory = normalizeContenuData(structuredClone(legacyContent));
    }

    saveMemoryData = gameData;

    updateSaveLocationInfo();

    await ecrireFichierSauvegarde(saveMemoryData);

    await ecrireFichierContenu();

    updateSaveMemory();

    console.log("Migration effectuée : Saves.json → Saves.json + Contenu.json (l'ancien fichier est conservé).");
}

async function lireFichierSauvegarde() {
    const fileHandle = await getSaveFileHandle(!0);

    const file = await fileHandle.getFile();

    if (file.size === 0) {
        return createEmptySaveFile();
    }

    const texte = await file.text();

    if (!texte.trim()) {
        return createEmptySaveFile();
    }

    try {
        const data = JSON.parse(texte);

        return normalizeSaveFile(data);
    } catch (error) {
        throw new Error("Le fichier Saves.json contient un JSON invalide.");
    }
}

function updateSaveLocationInfo() {
    if (saveDirectoryHandle) {
        saveMemoryData.dossier = saveDirectoryHandle.name;
    }

    if (currentSaveFileHandle) {
        saveMemoryData.fichier = currentSaveFileHandle.name;
    } else if (saveDirectoryHandle) {
        saveMemoryData.fichier = SAVE_PATH;
    }
}

async function ecrireFichierSauvegarde(data = saveMemoryData) {
    const fileHandle = await getSaveFileHandle(!0);

    updateSaveLocationInfo();

    const normalized = normalizeSaveFile(structuredClone(data));

    const texte = JSON.stringify(normalized, null, 4);

    const writable = await fileHandle.createWritable();

    try {
        await writable.write(texte);
    } finally {
        await writable.close();
    }

    saveJsonString = texte;

    saveDirty = !1;

    lastPhysicalWriteTime = Date.now();
}

async function syncSaveFileToDisk() {
    try {
        await ecrireFichierSauvegarde();

        return !0;
    } catch (error) {
        console.warn("Écriture physique de Saves.json impossible :", error);

        return !1;
    }
}

/* ============================================================
   SYNCHRONISATION DISQUE ↔ MÉMOIRE
============================================================ */

async function canReadSaveHandlesSilently() {
    try {
        const handle = currentSaveFileHandle || saveDirectoryHandle;

        if (!handle) {
            return !1;
        }

        const permission = await handle.queryPermission({
            mode: "readwrite"
        });

        return permission === "granted";
    } catch (error) {
        console.error("Impossible de vérifier la permission de sauvegarde :", error);

        return !1;
    }
}

async function readSaveFileFromDisk() {
    let fileHandle = currentSaveFileHandle;

    if (!fileHandle && saveDirectoryHandle) {
        try {
            fileHandle = await saveDirectoryHandle.getFileHandle(SAVE_PATH, {
                create: !1
            });
        } catch (error) {
            return null;
        }
    }

    if (!fileHandle) {
        return null;
    }

    const file = await fileHandle.getFile();

    const text = await file.text();

    if (!text.trim()) {
        return {
            data: createEmptySaveFile(),
            text: "",
            lastModified: file.lastModified
        }
    }

    return {
        data: normalizeSaveFile(JSON.parse(text)),
        text: text,
        lastModified: file.lastModified
    }
}

async function synchronizeSaveFileWithDisk() {
    try {
        /* Contenu : le disque est la référence lorsqu'une source disque est disponible. */
        let contentHandle = currentContentFileHandle || null;

        if (saveDirectoryHandle) {
            try {
                contentHandle = await getContentFileHandle(!0);
            } catch (error) {
                console.warn("Lecture de Contenu.json impossible :", error);
                contentHandle = null;
            }
        }

        if (contentHandle) {
            try {
                const file = await contentHandle.getFile();

                if (file.size > 0) {
                    const text = await file.text();

                    if (text.trim()) {
                        contenuMemory = normalizeContenuData(JSON.parse(text));
                    }
                }
            } catch (error) {
                console.warn("Lecture de Contenu.json impossible :", error);
            }
        }

        await migrateLegacySaveIfNeeded();

        const readable = await canReadSaveHandlesSilently();

        if (!readable) {
            attachSavePermissionBridge();

            return;
        }

        const disk = await readSaveFileFromDisk();

        const localTime = Number(localStorage.getItem(LOCAL_SAVE_TIME_KEY)) || 0;

        if (disk && disk.lastModified > localTime) {
            saveMemoryData = structuredClone(disk.data);
            absorbLegacyContenu(saveMemoryData);

            updateSaveLocationInfo();

            updateSaveMemory();
        } else if (saveJsonString && (!disk || saveJsonString !== disk.text)) {
            await syncSaveFileToDisk();
        }
    } catch (error) {
        console.error("Synchronisation de Saves.json impossible :", error);
    }
}
async function saveCurrentGameBeforeSwitching() {
    if (!globalState.adventureStarted) {
        return;
    }

    await autoSaveGame();
}