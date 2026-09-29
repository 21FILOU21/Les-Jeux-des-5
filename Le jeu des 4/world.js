"use strict";

/* ============================================================
   LES JEUX DES 4 — MONDE 2D (OVERWORLD)
============================================================

   Architecture (reprise de l'ancien world.js, intégrée à la
   version actuelle) :
   - TILE_SIZE (16px)  = coordonnées logiques / sauvegardes
   - DISPLAY_TILE_SIZE (48px) = zoom d'affichage ×3 (entier → net)
   - VIEWPORT_* = fenêtre visible (~912×624 px)
   - Caméra centrée sur le joueur, bloquée aux bords de la carte
   - Déplacement fluide + collisions avec les arbres
   - Rencontres dans les hautes herbes

   Interface utilisée par game.js :
   - startOverworldMode() / stopOverworldMode()
   - setOverworldPlayerSprite(hero)
   - updateWorldUI()
   - getOverworldSaveData() / applyOverworldSaveData(data)
   - resetOverworldState()
============================================================ */

/* ============================================================
   CONSTANTES
============================================================ */

const TILE_SIZE = 16;
const DISPLAY_TILE_SIZE = 48;                 // zoom ×4 (échelle entière → net)
const WORLD_SCALE = DISPLAY_TILE_SIZE / TILE_SIZE;

let MAP_COLS = 30;
let MAP_ROWS = 20;
let MAP_WIDTH = MAP_COLS * TILE_SIZE;       // 480 (coordonnées logiques)
let MAP_HEIGHT = MAP_ROWS * TILE_SIZE;      // 320

const VIEWPORT_COLS = 19;                     // 19 × 64 = 1280 px ≈ 1280
const VIEWPORT_ROWS = 13;                     // 11 × 64 = 704 px
const VIEWPORT_WIDTH = VIEWPORT_COLS * DISPLAY_TILE_SIZE;
const VIEWPORT_HEIGHT = VIEWPORT_ROWS * DISPLAY_TILE_SIZE;

const TILE_TYPES = {
    GRASS: 0,
    TREE: 1,
    TALL_GRASS: 2
};

const WORLD_PLAYER_SPEED = 90;
const WORLD_MOVEMENT = { stepDurationMs: 140, fastStepDurationMs: 90, stepRepeatDelayMs: 90, fastStepRepeatDelayMs: 30 };
const WORLD_ENCOUNTER_CHANCE = 0.12;          // par tuile d'herbe traversée
const WORLD_GRACE_TILES = 3;                  // grâce après combat / chargement
const worldUnknownTileWarnings = new Set();

let WORLD_START_X = Math.floor(MAP_COLS / 2) * TILE_SIZE - TILE_SIZE / 2;
let WORLD_START_Y = Math.floor(MAP_ROWS / 2) * TILE_SIZE - TILE_SIZE / 2;

/* ============================================================
   CARTE (ancien world.js — déterministe : les positions
   sauvegardées restent valides d'une session à l'autre)
============================================================ */

const mapData = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 2, 2, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 2, 2, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 2, 2, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 2, 2, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

/* Normalisation défensive : chaque ligne fait exactement MAP_COLS
   colonnes, bordures gauche/droite garanties fermées. */
let worldMap = mapData.map(row => {
    const copy = Array.isArray(row) ? row.slice(0, MAP_COLS) : [];
    while (copy.length < MAP_COLS) copy.push(TILE_TYPES.TREE);
    copy[0] = TILE_TYPES.TREE;
    copy[MAP_COLS - 1] = TILE_TYPES.TREE;
    return copy;
});

/* ============================================================
   ÉTAT DE L'OVERWORLD
============================================================ */

const overworldState = { started: !1, active: !1, playerX: WORLD_START_X, playerY: WORLD_START_Y, facing: "right", hero: null, heroImage: null, heroSpriteFailed: !1, keys: new Set(), walking: !1, walkPhase: 0, distanceSinceCheck: 0, graceDistance: WORLD_GRACE_TILES * TILE_SIZE, camera: { x: 0, y: 0 }, dialogueTimer: null, rafId: null, lastFrameTime: 0, moveFrom: null, moveTarget: null, moveProgress: 0, moveDurationMs: WORLD_MOVEMENT.stepDurationMs, stepCooldown: 0, fastWalkHeld: !1 };

let worldCanvas = null;
let worldContext = null;
let worldMapCanvas = null;    // carte pré-rendue à l'échelle d'affichage

/* ============================================================
   RENDU DES TUILES (pixel art à l'échelle d'affichage)
============================================================ */

function drawTileArt(ctx, type, S) {
    if (typeof drawMapEditorRuntimeTile === "function" && drawMapEditorRuntimeTile(ctx, type, S)) return;
    const u = S / 16;

    if (type === TILE_TYPES.TREE) {
        ctx.fillStyle = "#173821";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "#2c5e33";
        ctx.fillRect(u, u, S - 2 * u, S - 5 * u);
        ctx.fillStyle = "#3d7a42";
        ctx.fillRect(3 * u, 2 * u, 5 * u, 4 * u);
        ctx.fillStyle = "#5b3a24";
        ctx.fillRect(6 * u, S - 4 * u, 4 * u, 3 * u);
        return;
    }

    if (type === TILE_TYPES.TALL_GRASS) {
        ctx.fillStyle = "#2f6b33";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "#245727";
        ctx.fillRect(2 * u, 3 * u, u, 3 * u);
        ctx.fillRect(7 * u, 2 * u, u, 4 * u);
        ctx.fillRect(12 * u, 5 * u, u, 3 * u);
        ctx.fillRect(4 * u, 10 * u, u, 3 * u);
        ctx.fillRect(10 * u, 11 * u, u, 3 * u);
        ctx.fillStyle = "#4a8f43";
        ctx.fillRect(5 * u, 7 * u, u, 2 * u);
        ctx.fillRect(13 * u, 2 * u, u, 2 * u);
        return;
    }

    ctx.fillStyle = "#8fbf6a";
    ctx.fillRect(0, 0, S, S);
}

/* Pré-rendu de TOUTE la carte une seule fois, à l'échelle ×3.
   Chaque frame ne fait ensuite qu'un seul drawImage. */
function buildWorldMapCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = MAP_COLS * DISPLAY_TILE_SIZE;
    canvas.height = MAP_ROWS * DISPLAY_TILE_SIZE;
    const ctx = canvas.getContext("2d");
    const tileCanvases = {};
    const tileIds = new Set();

    for (let row = 0; row < MAP_ROWS; row++) {
        for (let col = 0; col < MAP_COLS; col++) tileIds.add(worldMap[row]?.[col]);
    }

    tileIds.forEach(type => {
        const tile = document.createElement("canvas");
        tile.width = DISPLAY_TILE_SIZE;
        tile.height = DISPLAY_TILE_SIZE;
        const tileContext = tile.getContext("2d");

        if (type === undefined || type === null) {
            tileContext.fillStyle = "#8fbf6a";
            tileContext.fillRect(0, 0, DISPLAY_TILE_SIZE, DISPLAY_TILE_SIZE);
            tileCanvases[type] = tile;
            return;
        }

        if (typeof mapEditorFindTile === "function" && typeof type !== "number" && !mapEditorFindTile(type)) {
            const warningKey = String(type);
            if (!worldUnknownTileWarnings.has(warningKey)) {
                worldUnknownTileWarnings.add(warningKey);
                console.error("Tuile runtime inconnue :", type);
            }
        }

        drawTileArt(tileContext, type, DISPLAY_TILE_SIZE);
        tileCanvases[type] = tile;
    });

    const u = DISPLAY_TILE_SIZE / 16;
    for (let row = 0; row < MAP_ROWS; row++) {
        for (let col = 0; col < MAP_COLS; col++) {
            const type = worldMap[row]?.[col];
            const x = col * DISPLAY_TILE_SIZE;
            const y = row * DISPLAY_TILE_SIZE;
            const tileCanvas = tileCanvases[type];

            if (tileCanvas) {
                ctx.drawImage(tileCanvas, x, y);
            } else {
                ctx.fillStyle = "#8fbf6a";
                ctx.fillRect(x, y, DISPLAY_TILE_SIZE, DISPLAY_TILE_SIZE);
                const warningKey = String(type);
                if (!worldUnknownTileWarnings.has(warningKey)) {
                    worldUnknownTileWarnings.add(warningKey);
                    console.error("Tuile runtime sans rendu :", type);
                }
            }

            if (type === TILE_TYPES.GRASS || type === "grass") {
                if ((col + row) % 2 === 1) {
                    ctx.fillStyle = "rgba(0, 0, 0, 0.035)";
                    ctx.fillRect(x, y, DISPLAY_TILE_SIZE, DISPLAY_TILE_SIZE);
                }
                if ((col * 7 + row * 13) % 11 === 0) {
                    ctx.fillStyle = "#7aa95a";
                    ctx.fillRect(x + 4 * u, y + 6 * u, 2 * u, u);
                    ctx.fillRect(x + 9 * u, y + 10 * u, 2 * u, u);
                }
                if ((col * 5 + row * 3) % 13 === 0) {
                    ctx.fillStyle = "#e8e2c8";
                    ctx.fillRect(x + 7 * u, y + 4 * u, 2 * u, 2 * u);
                }
            }
        }
    }

    return canvas;
}

/* ============================================================
   COLLISIONS
============================================================ */

function resolveWorldTile(col, row) {
    if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) {
        return { tileId: null, isBlocking: true, allowsEncounter: false };
    }

    const tileId = worldMap[row]?.[col];

    if (typeof mapEditorFindTile === "function") {
        const definition = mapEditorFindTile(tileId);
        if (definition) {
            return {
                tileId,
                isBlocking: definition.collision === true,
                allowsEncounter: definition.encounters === true
            };
        }
    }

    if (tileId === TILE_TYPES.TREE || tileId === "tree") {
        return { tileId, isBlocking: true, allowsEncounter: false };
    }

    if (tileId === TILE_TYPES.TALL_GRASS || tileId === "tall-grass") {
        return { tileId, isBlocking: false, allowsEncounter: true };
    }

    return { tileId, isBlocking: false, allowsEncounter: false };
}

function isWorldTileTree(col, row) {
    const resolved = resolveWorldTile(col, row);
    if (resolved.isBlocking) return true;
    if (typeof isMapEditorRuntimeBlocked === "function" && isMapEditorRuntimeBlocked(resolved.tileId, col, row)) return true;
    return false;
}

/* Le sprite fait TILE_SIZE × TILE_SIZE : on vérifie ses 4 coins. */
function isWorldWalkablePixel(x, y) {
    return !isWorldTileTree(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))
        && !isWorldTileTree(Math.floor((x + TILE_SIZE - 1) / TILE_SIZE), Math.floor(y / TILE_SIZE))
        && !isWorldTileTree(Math.floor(x / TILE_SIZE), Math.floor((y + TILE_SIZE - 1) / TILE_SIZE))
        && !isWorldTileTree(Math.floor((x + TILE_SIZE - 1) / TILE_SIZE), Math.floor((y + TILE_SIZE - 1) / TILE_SIZE));
}

/* Si la carte a changé depuis une sauvegarde, la position
   restaurée peut être dans un arbre → case libre la plus proche. */
function findNearestWalkablePosition(x, y) {
    if (isWorldWalkablePixel(x, y)) return { x, y };

    const col = Math.floor((x + TILE_SIZE / 2) / TILE_SIZE);
    const row = Math.floor((y + TILE_SIZE / 2) / TILE_SIZE);

    for (let radius = 1; radius <= 12; radius++) {
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                const c = col + dc;
                const r = row + dr;
                if (c < 1 || c >= MAP_COLS - 1 || r < 1 || r >= MAP_ROWS - 1) continue;
                if (isWorldWalkablePixel(c * TILE_SIZE, r * TILE_SIZE)) {
                    return { x: c * TILE_SIZE, y: r * TILE_SIZE };
                }
            }
        }
    }

    return { x: WORLD_START_X, y: WORLD_START_Y };
}

/* ============================================================
   CAMÉRA (architecture de l'ancien world.js)
============================================================ */

function updateWorldCamera() {
    const playerCenterX = (overworldState.playerX + TILE_SIZE / 2) * WORLD_SCALE;
    const playerCenterY = (overworldState.playerY + TILE_SIZE / 2) * WORLD_SCALE;

    const maxCamX = MAP_COLS * DISPLAY_TILE_SIZE - VIEWPORT_WIDTH;
    const maxCamY = MAP_ROWS * DISPLAY_TILE_SIZE - VIEWPORT_HEIGHT;

    /* Centrée sur le joueur, bloquée aux bords, jamais hors carte.
       Math.round → pas de sous-pixel → pas de tremblement. */
    overworldState.camera.x = Math.round(Math.max(0, Math.min(playerCenterX - VIEWPORT_WIDTH / 2, maxCamX)));
    overworldState.camera.y = Math.round(Math.max(0, Math.min(playerCenterY - VIEWPORT_HEIGHT / 2, maxCamY)));
}

/* ============================================================
   RENDU DU JOUEUR
============================================================ */

function drawWorldFallbackPlayer(ctx, x, y) {
    const u = WORLD_SCALE;

    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.fillRect(x + 3 * u, y + 14 * u, 10 * u, 2 * u);

    ctx.fillStyle = "#2b3a55";
    ctx.fillRect(x + 4 * u, y + 12 * u, 3 * u, 4 * u);
    ctx.fillRect(x + 9 * u, y + 12 * u, 3 * u, 4 * u);

    ctx.fillStyle = "#6c7cff";
    ctx.fillRect(x + 3 * u, y + 7 * u, 10 * u, 5 * u);

    ctx.fillStyle = "#f2c9a0";
    ctx.fillRect(x + 4 * u, y + 2 * u, 8 * u, 5 * u);

    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(x + 4 * u, y + u, 8 * u, 2 * u);

    ctx.fillStyle = "#141414";
    if (overworldState.facing === "left") {
        ctx.fillRect(x + 5 * u, y + 4 * u, u, 2 * u);
        ctx.fillRect(x + 8 * u, y + 4 * u, u, 2 * u);
    } else {
        ctx.fillRect(x + 7 * u, y + 4 * u, u, 2 * u);
        ctx.fillRect(x + 10 * u, y + 4 * u, u, 2 * u);
    }
}

function drawWorldPlayer(ctx) {
    const bob = overworldState.walking ? (Math.floor(overworldState.walkPhase / 8) % 2) : 0;

    const displayX = Math.round(overworldState.playerX * WORLD_SCALE - overworldState.camera.x);
    const displayY = Math.round((overworldState.playerY - bob) * WORLD_SCALE - overworldState.camera.y);

    const image = overworldState.heroImage;

    if (image && image.complete && image.naturalWidth > 0) {
        ctx.save();

        /* Petit pixel-art → lissage OFF (upscale entier net).
           Grande image (portrait) → lissage ON (downscale lisible). */
        ctx.imageSmoothingEnabled = image.naturalWidth > 64;

        if (overworldState.facing === "left") {
            /* Le sprite de base regarde à droite → miroir horizontal */
            ctx.translate(displayX + DISPLAY_TILE_SIZE, displayY);
            ctx.scale(-1, 1);
            ctx.drawImage(image, 0, 0, DISPLAY_TILE_SIZE, DISPLAY_TILE_SIZE);
        } else {
            ctx.drawImage(image, displayX, displayY, DISPLAY_TILE_SIZE, DISPLAY_TILE_SIZE);
        }

        ctx.restore();
        return;
    }

    drawWorldFallbackPlayer(ctx, displayX, displayY);
}

function renderWorld() {
    if (!worldContext || !worldMapCanvas) return;

    worldContext.imageSmoothingEnabled = false;
    worldContext.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    worldContext.drawImage(worldMapCanvas, -overworldState.camera.x, -overworldState.camera.y);
    drawWorldPlayer(worldContext);
}

/* ============================================================
   BOUCLE + DÉPLACEMENT
============================================================ */

function isWorldScreenActive() {
    const screen = document.getElementById("world-screen");
    return !!(screen && screen.classList.contains("active"));
}

function isOverworldBlocked() { const saveMenu = document.getElementById("save-menu"); const filesMenu = document.getElementById("save-files-menu"); const devMenu = document.getElementById("dev-menu"); const settingsMenu = document.getElementById("settings-menu"); if (saveMenu && !saveMenu.classList.contains("hidden")) return !0; if (filesMenu && !filesMenu.classList.contains("hidden")) return !0; if (devMenu && !devMenu.classList.contains("hidden")) return !0; if (settingsMenu && !settingsMenu.classList.contains("hidden")) return !0; return !1 }

function overworldLoop(timestamp) {
    const deltaTime = Math.min(0.05, (timestamp - overworldState.lastFrameTime) / 1000 || 0);
    overworldState.lastFrameTime = timestamp;

    if (isWorldScreenActive()) {
        updateOverworld(deltaTime);
        updateWorldCamera();
        renderWorld();
    }

    overworldState.rafId = requestAnimationFrame(overworldLoop);
}

function ensureWorldLoop() {
    if (overworldState.rafId !== null) return;
    overworldState.lastFrameTime = performance.now();
    overworldState.rafId = requestAnimationFrame(overworldLoop);
}

function updateOverworld(deltaTime) {
    if (!overworldState.active || isOverworldBlocked()) { overworldState.walking = !1; return }
    const speedMultiplier = (typeof gameSpeed === "number" && gameSpeed > 0) ? gameSpeed : 1;
    if (overworldState.moveTarget) {
        overworldState.moveProgress += deltaTime * 1000 * speedMultiplier; const duration = Math.max(1, overworldState.moveDurationMs || WORLD_MOVEMENT.stepDurationMs); const progress = Math.min(1, overworldState.moveProgress / duration); const from = overworldState.moveFrom; const to = overworldState.moveTarget; overworldState.playerX = from.x + (to.x - from.x) * progress; overworldState.playerY = from.y + (to.y - from.y) * progress; overworldState.walking = !0; overworldState.walkPhase += WORLD_PLAYER_SPEED * deltaTime * speedMultiplier; if (progress >= 1) { overworldState.playerX = to.x; overworldState.playerY = to.y; overworldState.moveFrom = null; overworldState.moveTarget = null; overworldState.moveProgress = 0; overworldState.walking = !1; overworldState.stepCooldown = overworldState.fastWalkHeld ? WORLD_MOVEMENT.fastStepRepeatDelayMs : WORLD_MOVEMENT.stepRepeatDelayMs; completeWorldStep() }
        return
    }
    if (overworldState.stepCooldown > 0) { overworldState.stepCooldown = Math.max(0, overworldState.stepCooldown - deltaTime * 1000 * speedMultiplier); return }
    const heldDirection = getHeldWorldDirection(); if (heldDirection) { requestWorldStep(heldDirection) }
}

function completeWorldStep() {
    if (overworldState.graceDistance > 0) { overworldState.graceDistance = Math.max(0, overworldState.graceDistance - TILE_SIZE) }
    tryWorldEncounter()
}
function requestWorldStep(direction) { if (!overworldState.active || isOverworldBlocked()) return; if (overworldState.moveTarget) return; if (direction === "left") overworldState.facing = "left"; else if (direction === "right") overworldState.facing = "right"; let dx = 0; let dy = 0; if (direction === "left") dx = -1; else if (direction === "right") dx = 1; else if (direction === "up") dy = -1; else if (direction === "down") dy = 1; else return; const targetX = Math.min(Math.max(overworldState.playerX + dx * TILE_SIZE, TILE_SIZE), MAP_WIDTH - TILE_SIZE * 2); const targetY = Math.min(Math.max(overworldState.playerY + dy * TILE_SIZE, TILE_SIZE), MAP_HEIGHT - TILE_SIZE * 2); if (targetX === overworldState.playerX && targetY === overworldState.playerY) return; if (!isWorldWalkablePixel(targetX, targetY)) return; overworldState.moveFrom = { x: overworldState.playerX, y: overworldState.playerY }; overworldState.moveTarget = { x: targetX, y: targetY }; overworldState.moveProgress = 0; overworldState.moveDurationMs = overworldState.fastWalkHeld ? WORLD_MOVEMENT.fastStepDurationMs : WORLD_MOVEMENT.stepDurationMs }
function getHeldWorldDirection() {
    let direction = null; overworldState.keys.forEach(key => {
        let action = null; if (typeof getKeyAction === "function") { action = getKeyAction(key) } else { action = WORLD_KEY_DIRECTIONS[key] || null }
        if (action === "up" || action === "down" || action === "left" || action === "right") { direction = action }
    }); return direction
}
function snapOverworldPlayerToGrid() { const col = Math.min(Math.max(Math.round(overworldState.playerX / TILE_SIZE), 0), MAP_COLS - 1); const row = Math.min(Math.max(Math.round(overworldState.playerY / TILE_SIZE), 0), MAP_ROWS - 1); const safe = findNearestWalkablePosition(col * TILE_SIZE, row * TILE_SIZE); overworldState.playerX = safe.x; overworldState.playerY = safe.y; overworldState.moveFrom = null; overworldState.moveTarget = null; overworldState.moveProgress = 0; overworldState.stepCooldown = 0; overworldState.walking = !1 }

/* ============================================================
   RENCONTRES SAUVAGES
============================================================ */

function tryWorldEncounter() {
    if (overworldState.graceDistance > 0) return;
    const centerX = overworldState.playerX + TILE_SIZE / 2;
    const centerY = overworldState.playerY + TILE_SIZE / 2;
    const col = Math.floor(centerX / TILE_SIZE);
    const row = Math.floor(centerY / TILE_SIZE);
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return;
    const resolvedTile = resolveWorldTile(col, row);
    if (!resolvedTile.allowsEncounter) return;
    if (typeof tryMapEditorEncounter === "function" && tryMapEditorEncounter(col, row)) return;
    if (resolvedTile.tileId !== TILE_TYPES.TALL_GRASS && resolvedTile.tileId !== "tall-grass") return;
    if (Math.random() >= WORLD_ENCOUNTER_CHANCE) return;
    overworldState.graceDistance = WORLD_GRACE_TILES * TILE_SIZE;
    stopOverworldMode();
    showWorldDialogue("Un monstre sauvage apparaît !", 1400);
    if (typeof runEncounterTransition === "function") runEncounterTransition();
    else setTimeout(() => { if (typeof triggerWildBattle === "function") triggerWildBattle() }, 450);
}

/* ============================================================
   DIALOGUE
============================================================ */

function showWorldDialogue(text, duration = 2600) {
    const box = document.getElementById("world-dialogue");
    const textElement = document.getElementById("dialogue-text");
    if (!box || !textElement) return;

    textElement.textContent = text;
    box.classList.remove("hidden");

    clearTimeout(overworldState.dialogueTimer);
    overworldState.dialogueTimer = setTimeout(hideWorldDialogue, duration);
}

function hideWorldDialogue() {
    const box = document.getElementById("world-dialogue");
    if (box) box.classList.add("hidden");
    clearTimeout(overworldState.dialogueTimer);
}

/* ============================================================
   HUD
============================================================ */

function updateWorldUI() {
    const hudText = document.querySelector("#world-screen .world-hud p");
    if (!hudText) return;

    let progression = "";

    if (typeof globalState !== "undefined" && globalState) {
        const level = Math.max(1, globalState.playerLevel || 1);
        const xp = Math.max(0, globalState.playerXp || 0);
        const next = Math.max(1, globalState.playerXpToNext || 40);
        progression = `Niveau ${level} · XP ${xp}/${next} · `;
    }

    const col = Math.floor((overworldState.playerX + TILE_SIZE / 2) / TILE_SIZE);
    const row = Math.floor((overworldState.playerY + TILE_SIZE / 2) / TILE_SIZE);
    const facing = overworldState.facing === "left" ? "gauche" : "droite";

    hudText.textContent =`${progression}`;
}

/* ============================================================
   SPRITE DU JOUEUR — FIX LEANDRE (générique)
============================================================ */

function getOverworldSpritePath(hero) {
    if (!hero || !hero.Nom) return "";

    /* 1. Fonction existante du projet (game.js), si disponible */
    if (typeof getCharacterImagePath === "function") {
        try {
            const path = getCharacterImagePath(hero);
            if (path && String(path).trim() !== "") return path;
        } catch (error) {
            /* on continue avec les fallbacks */
        }
    }

    /* 2. Champ Image du héros (ContenuJeu.json) */
    if (hero.Image && String(hero.Image).trim() !== "") return hero.Image;

    /* 3. Convention du projet. Léandre a un champ Image VIDE dans
       ContenuJeu.json : sans ce fallback, son sprite ne chargeait
       jamais. Fonctionne pour tous les héros, sans hard-code. */
    return `assets/personnages/personnages/${hero.Nom}.png`;
}

function setOverworldPlayerSprite(hero) {
    overworldState.hero = hero || null;
    overworldState.heroImage = null;
    overworldState.heroSpriteFailed = false;

    const imagePath = hero ? getOverworldSpritePath(hero) : "";
    if (!imagePath) return;

    const image = new Image();
    image.onload = () => {
        overworldState.heroImage = image;
    };
    image.onerror = () => {
        overworldState.heroImage = null;
        if (!overworldState.heroSpriteFailed) {
            overworldState.heroSpriteFailed = true;
            console.warn(`Sprite overworld introuvable : ${imagePath}`);
        }
    };
    image.src = imagePath;
}

/* ============================================================
   API PUBLIQUE (utilisée par game.js)
============================================================ */

function startOverworldMode() {
    if (typeof vfxSetSurface === "function") vfxSetSurface("world");
    snapOverworldPlayerToGrid(); if (!overworldState.started) { overworldState.started = !0; showWorldDialogue("Utilise les flèches ou WASD pour explorer. Les hautes herbes cachent des monstres sauvages !", 4500) }
    overworldState.active = !0; if (typeof showScreen === "function") { showScreen("world") }
    ensureWorldLoop(); updateWorldUI()
}

function stopOverworldMode() {
    if (typeof vfxSetSurface === "function") vfxSetSurface("battle");
    overworldState.active = !1; overworldState.keys.clear(); overworldState.walking = !1; overworldState.stepCooldown = 0; if (overworldState.moveTarget) { overworldState.playerX = overworldState.moveTarget.x; overworldState.playerY = overworldState.moveTarget.y }
    overworldState.moveFrom = null; overworldState.moveTarget = null; overworldState.moveProgress = 0
}

function getOverworldSaveData() {
    const data = {
        playerX: Math.round(overworldState.playerX),
        playerY: Math.round(overworldState.playerY),
        facing: overworldState.facing === "left" ? "left" : "right"
    };

    if (typeof getMapEditorOverworldSaveData === "function") {
        Object.assign(data, getMapEditorOverworldSaveData());
    }

    return data;
}

function applyOverworldSaveData(data) {
    if (!data) return;

    if (typeof applyMapEditorOverworldSaveData === "function" && data.mapId) {
        applyMapEditorOverworldSaveData(data);
    }

    let x = overworldState.playerX;
    let y = overworldState.playerY;

    if (Number.isFinite(data.playerX)) x = Math.min(Math.max(data.playerX, TILE_SIZE), MAP_WIDTH - TILE_SIZE * 2);
    if (Number.isFinite(data.playerY)) y = Math.min(Math.max(data.playerY, TILE_SIZE), MAP_HEIGHT - TILE_SIZE * 2);

    const col = Math.min(Math.max(Math.round(x / TILE_SIZE), 0), MAP_COLS - 1);
    const row = Math.min(Math.max(Math.round(y / TILE_SIZE), 0), MAP_ROWS - 1);
    const safe = findNearestWalkablePosition(col * TILE_SIZE, row * TILE_SIZE);

    overworldState.playerX = safe.x;
    overworldState.playerY = safe.y;

    if (data.facing === "left" || data.facing === "right") overworldState.facing = data.facing;

    overworldState.graceDistance = WORLD_GRACE_TILES * TILE_SIZE;
    overworldState.distanceSinceCheck = 0;
    overworldState.keys.clear();
    overworldState.walking = !1;
    overworldState.moveFrom = null;
    overworldState.moveTarget = null;
    overworldState.moveProgress = 0;
    overworldState.stepCooldown = 0;
    hideWorldDialogue();
}

function resetOverworldState() { overworldState.playerX = WORLD_START_X; overworldState.playerY = WORLD_START_Y; overworldState.facing = "right"; overworldState.keys.clear(); overworldState.walking = !1; overworldState.walkPhase = 0; overworldState.distanceSinceCheck = 0; overworldState.graceDistance = WORLD_GRACE_TILES * TILE_SIZE; overworldState.moveFrom = null; overworldState.moveTarget = null; overworldState.moveProgress = 0; overworldState.stepCooldown = 0; overworldState.fastWalkHeld = !1; hideWorldDialogue() }

/* ============================================================
   ENTRÉES CLAVIER (flèches + WASD + ZQSD)
============================================================ */

const WORLD_KEY_DIRECTIONS = {
    "arrowleft": "left",
    "arrowright": "right",
    "arrowup": "up",
    "arrowdown": "down",
    "a": "left",
    "d": "right",
    "w": "up",
    "s": "down",
};

function bindWorldEvents() {
    document.addEventListener("keydown", (event) => {
        const tag = (event.target && event.target.tagName) || ""; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; if (typeof isKeybindCaptureActive === "function" && isKeybindCaptureActive()) { if (event.key.startsWith("Arrow")) { event.preventDefault() } return }
        const keyName = String(event.key || "").toLowerCase(); let action = null; if (typeof getKeyAction === "function") { action = getKeyAction(keyName) } else { action = WORLD_KEY_DIRECTIONS[keyName] || null }
        if (action === "fastWalk") { overworldState.fastWalkHeld = !0; return }
        if (action !== "up" && action !== "down" && action !== "left" && action !== "right") return; overworldState.keys.add(keyName); if (event.key.startsWith("Arrow")) { event.preventDefault() }
        if (!event.repeat) { requestWorldStep(action) }
    }); document.addEventListener("keyup", (event) => {
        const keyName = String(event.key || "").toLowerCase(); let action = null; if (typeof getKeyAction === "function") { action = getKeyAction(keyName) } else { action = WORLD_KEY_DIRECTIONS[keyName] || null }
        if (action === "fastWalk") { overworldState.fastWalkHeld = !1; return }
        if (action === "up" || action === "down" || action === "left" || action === "right") { overworldState.keys.delete(keyName) }
    }); window.addEventListener("blur", () => { overworldState.keys.clear(); overworldState.fastWalkHeld = !1 })
}

/* ============================================================
   INITIALISATION
============================================================ */

(function initWorld() {
    worldCanvas = document.getElementById("world-canvas");

    if (worldCanvas) {
        /* Résolution interne = viewport zoomé (912×624) :
           le pixel art est dessiné À cette échelle → jamais
           étiré par le CSS → net. */
        worldCanvas.width = VIEWPORT_WIDTH;
        worldCanvas.height = VIEWPORT_HEIGHT;

        worldContext = worldCanvas.getContext("2d");
        worldContext.imageSmoothingEnabled = false;
    }

    worldMapCanvas = buildWorldMapCanvas();

    bindWorldEvents();
})();