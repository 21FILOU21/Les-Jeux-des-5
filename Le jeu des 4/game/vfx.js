"use strict";

/* ============================================================
   game/vfx.js — Moteur de lecture des effets visuels
   (étape 2 : instances, déclencheurs, miroir, branches,
   boucles, vitesse du jeu, surfaces)
   Données : creator-vfx.js (getVfxList / findVfxByName)
   Attacher : champ EffetsVisuels sur la cible (attaque,
   personnage, effet, statut…) — fireVfxFor le résout.
============================================================ */

/* ============================================================
   ÉTAT DU MOTEUR
============================================================ */

const VFX_MAX_INSTANCES = 12;

const VFX_OVERLAY_ID = "vfx-overlay";

let vfxInstances = [];

let vfxNextId = 1;

/* Surface de lecture courante : "battle" (écran de combat) ou
   "world" (overworld) ou null (hors jeu). */
let vfxCurrentSurface = null;

function getVfxOverlay(surface) {
    let overlay = document.getElementById(VFX_OVERLAY_ID + "-" + surface);

    if (!overlay) {
        overlay = document.createElement("div");

        overlay.id = VFX_OVERLAY_ID + "-" + surface;

        overlay.className = "vfx-overlay";

        const host = surface === "battle" ? document.getElementById("battle-screen") : document.getElementById("world-screen");

        if (!host) return null;

        host.appendChild(overlay);
    }

    return overlay;
}

function vfxSetSurface(surface) {
    vfxCurrentSurface = surface;
}

/* ============================================================
   ACCUMULATEUR TEMPOREL (gameSpeed) — un seul tick pour tout
============================================================ */

const VFX_TICK_MS = 40;

let vfxTickerActive = false;

function vfxEnsureTicker() {
    if (vfxTickerActive) return;

    vfxTickerActive = true;

    const tick = () => {
        if (!vfxTickerActive) return;

        const speed = (typeof gameSpeed === "number" && gameSpeed > 0) ? gameSpeed : 1;

        vfxUpdate(VFX_TICK_MS * speed);

        setTimeout(tick, VFX_TICK_MS);
    };

    setTimeout(tick, VFX_TICK_MS);
}

/* ============================================================
   LECTURE D'UN EFFET — point d'entrée
============================================================ */

function playVfx(nom, options = {}) {
    const vfx = findVfxByName(nom);

    if (!vfx || !vfx.frames || vfx.frames.length === 0) return null;

    const surface = options.surface || vfxCurrentSurface || "battle";

    const overlay = getVfxOverlay(surface);

    if (!overlay) return null;

    vfxEnsureTicker();

    /* Anti-empilement */
    if (vfx.remplaceInstance) {
        vfxInstances = vfxInstances.filter(inst => inst.vfxNom !== nom);
    }

    /* Cap d'instances — on vire la plus ancienne */
    while (vfxInstances.length >= VFX_MAX_INSTANCES) {
        const oldest = vfxInstances.shift();

        if (oldest && oldest.element && oldest.element.parentElement) {
            oldest.element.remove();
        }
    }

    const instance = {
        id: vfxNextId++,
        vfxNom: nom,
        surface,
        mirror: !!options.mirror,
        context: options.context || null,
        frameIndex: 0,
        elapsed: 0,
        loopCount: 0,
        startedAt: Date.now(),
        totalElapsed: 0,
        element: null,
        elementCreated: false,
        ended: false,
        holdWaiting: false,
        holdEventName: "",
        priority: Date.now()
    };

    vfxInstances.push(instance);

    vfxEnterFrame(instance, vfx);

    return instance;
}

/* ============================================================
   FRAME COURANTE — création / mise à jour / avance
============================================================ */

function vfxCurrentFrameOf(instance) {
    const vfx = findVfxByName(instance.vfxNom);

    if (!vfx) return null;

    return vfx.frames[instance.frameIndex] || null;
}

function vfxEnterFrame(instance, vfx) {
    const frame = vfx.frames[instance.frameIndex];

    if (!frame) {
        vfxEndInstance(instance);

        return;
    }

    instance.elapsed = 0;

    instance.elementCreated = false;

    /* Boucle ∞ : bornée par loopCap, fin de combat et fin de tour. */
    if (frame.loop === -1) {
        instance.loopDeadline = instance.totalElapsed + vfx.loopCap;
    } else {
        instance.loopDeadline = null;
    }

    vfxEnsureFrameElement(instance, vfx, frame);
}

function vfxEnsureFrameElement(instance, vfx, frame) {
    if (instance.elementCreated) return;

    const overlay = getVfxOverlay(instance.surface);

    if (!overlay) return;

    if (instance.element && instance.element.parentElement) {
        instance.element.remove();
    }

    const el = document.createElement("img");

    el.className = "vfx-frame";

    el.src = frame.source;

    el.style.position = "absolute";

    el.style.pointerEvents = "none";

    el.style.willChange = "transform, opacity";

    if (frame.blend && frame.blend !== "normal") {
        el.style.mixBlendMode = frame.blend;
    }

    if (frame.tint) {
        el.style.filter = `drop-shadow(0 0 0 ${frame.tint})`;
    }

    overlay.appendChild(el);

    instance.element = el;

    instance.elementCreated = true;

    /* Son optionnel (vide = silence) — vitesse naturelle, non accélérée. */
    if (frame.sound) {
        vfxPlaySound(frame.sound);
    }
}

function vfxUpdate(deltaMs) {
    if (vfxInstances.length === 0) return;

    const ending = [];

    vfxInstances.forEach(instance => {
        if (instance.ended) return;

        const vfx = findVfxByName(instance.vfxNom);

        if (!vfx) {
            ending.push(instance);

            return;
        }

        const frame = vfx.frames[instance.frameIndex];

        if (!frame) {
            ending.push(instance);

            return;
        }

        instance.totalElapsed += deltaMs;

        if (instance.holdWaiting) {
            /* Frame holdUntil : attend l'événement, mais l'opacité
               reste animée. Pas d'avance tant que l'événement ne vient pas. */
            vfxApplyFrameStyle(instance, vfx, frame, 0);

            return;
        }

        instance.elapsed += deltaMs;

        const loopLimit = frame.loop === -1 ? Math.max(1, vfx.loopCap) : frame.duration * Math.max(1, frame.loop);

        const t = Math.min(1, instance.elapsed / loopLimit);

        vfxApplyFrameStyle(instance, vfx, frame, t);

        /* Boucles finies de la frame ? */
        if (instance.elapsed >= loopLimit) {
            if (frame.loop === -1) {
                /* ∞ atteint son cap → frame suivante */
            } else if (instance.loopCount + 1 < frame.loop) {
                instance.loopCount++;

                instance.elapsed = 0;

                return;
            }

            /* Fin de frame → branchement parallèle éventuel */
            if (frame.branchMode === "parallel" && frame.branchTarget) {
                setTimeout(() => {
                    playVfx(frame.branchTarget, { surface: instance.surface, mirror: instance.mirror, context: instance.context });
                }, frame.branchDelay / ((typeof gameSpeed === "number" && gameSpeed > 0) ? gameSpeed : 1));
            }

            /* Frame suivante */
            instance.frameIndex++;

            instance.loopCount = 0;

            if (instance.frameIndex >= vfx.frames.length) {
                /* Fin de la pile → branchement série de la DERNIÈRE frame */
                const last = vfx.frames[vfx.frames.length - 1];

                if (last && last.branchMode === "chain" && last.branchTarget) {
                    vfxEndInstance(instance);

                    playVfx(last.branchTarget, { surface: instance.surface, mirror: instance.mirror, context: instance.context });

                    return;
                }

                ending.push(instance);
            } else {
                vfxEnterFrame(instance, vfx);
            }
        }
    });

    ending.forEach(vfxEndInstance);

    vfxInstances = vfxInstances.filter(inst => !inst.ended);
}

function vfxApplyFrameStyle(instance, vfx, frame, t) {
    const el = instance.element;

    if (!el) return;

    const intensite = vfx.intensite / 100;

    const eased = vfxEase(frame.easing, t);

    /* Échelle animée */
    const scale = frame.scaleStart + (frame.scaleEnd - frame.scaleStart) * eased;

    /* Position + dérive */
    let x = frame.x + frame.motionX * t;

    let y = frame.y + frame.motionY * t;

    /* Miroir côté ennemi */
    if (instance.mirror) {
        x = 100 - x;
    }

    /* Rotation */
    const rotation = frame.rotationSpeed * (instance.totalElapsed / 1000);

    const flip = (frame.flipX ? -1 : 1) * (instance.mirror ? -1 : 1);

    el.style.left = x + "%";

    el.style.top = y + "%";

    el.style.transformOrigin = "center";

    el.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${flip}) scaleY(${frame.flipY ? -1 : 1}) scale(${scale / 100})`;

    el.style.opacity = String((frame.opacity / 100) * intensite);

    /* Surface battle : viser les panneaux ; screen : écran entier. */
    if (frame.surface === "screen") {
        el.style.zIndex = "130";
    } else {
        el.style.zIndex = "15";
    }
}

function vfxEase(easing, t) {
    if (easing === "easeIn") return t * t;

    if (easing === "easeOut") return 1 - (1 - t) * (1 - t);

    return t;
}

function vfxEndInstance(instance) {
    instance.ended = true;

    if (instance.element && instance.element.parentElement) {
        instance.element.remove();
    }

    instance.element = null;
}

/* ============================================================
   STOP GLOBAL — fin de combat / fin de tour joueur
============================================================ */

function vfxStopAll(reason) {
    vfxInstances.forEach(vfxEndInstance);

    vfxInstances = [];
}

function vfxStopLoops() {
    /* Fin du tour joueur : les boucles ∞ passent à la frame suivante
       plutôt que de couper net (elles se terminent proprement). */
    vfxInstances.forEach(instance => {
        if (instance.ended) return;

        const vfx = findVfxByName(instance.vfxNom);

        if (!vfx) return;

        const frame = vfx.frames[instance.frameIndex];

        if (frame && frame.loop === -1) {
            instance.loopDeadline = instance.totalElapsed;
        }
    });
}

/* ============================================================
   SON — champ optionnel, vide = silence
============================================================ */

const vfxSoundCache = {};

function vfxPlaySound(soundName) {
    if (!soundName) return;

    try {
        if (!vfxSoundCache[soundName]) {
            vfxSoundCache[soundName] = new Audio(soundName);
        }

        const audio = vfxSoundCache[soundName].cloneNode();

        audio.volume = clamp(1, 0, 1);

        audio.play().catch(() => {});
    } catch (error) {
        console.debug("[VFX] son non jouable :", soundName, error);
    }
}

/* ============================================================
   DÉCLENCHEURS — API publique appelée par les hooks de combat
   context = { side: "player"|"enemy", target: monster|null,
              crit: bool|null, vfxNames: [noms] } (étape 5 :
              conditions de déclenchement par attachement)
============================================================ */

function fireVfxFor(names, triggerEvent, context = {}) {
    if (Array.isArray(names) && names.length > 0) {
        names.forEach(att => {
            const nom = typeof att === "string" ? att : (att && att.nom);

            if (!nom || !findVfxByName(nom)) return;

            const triggers = (typeof att === "object" && att && Array.isArray(att.triggers) && att.triggers.length > 0) ? att.triggers : null;

            if (triggers && !triggers.includes(triggerEvent)) return;

            playVfx(nom, {
                surface: vfxCurrentSurface || "battle",
                mirror: context.side === "enemy",
                context: { ...context, trigger: triggerEvent }
            });
        });

        return;
    }

    /* Ancien format : carrier unique (objet avec EffetsVisuels) */
    if (names && typeof names === "object") {
        const atts = Array.isArray(names.EffetsVisuels) ? names.EffetsVisuels : [];

        atts.forEach(att => {
            const nom = typeof att === "string" ? att : (att && att.nom);

            if (!nom || !findVfxByName(nom)) return;

            const triggers = (typeof att === "object" && att && Array.isArray(att.triggers) && att.triggers.length > 0) ? att.triggers : null;

            if (triggers && !triggers.includes(triggerEvent)) return;

            playVfx(nom, {
                surface: vfxCurrentSurface || "battle",
                mirror: context.side === "enemy",
                context: { ...context, trigger: triggerEvent }
            });
        });
    }
}

/* Liste les VFX attachés à un objet (champ EffetsVisuels). */
function vfxAttachedTo(obj) {
    return (obj && Array.isArray(obj.EffetsVisuels)) ? obj.EffetsVisuels : [];
}

/* Ouvre une frame holdUntil si l'événement attendu arrive. */
function vfxReleaseHolds(eventName) {
    vfxInstances.forEach(instance => {
        if (instance.ended || !instance.holdWaiting) return;

        if (!instance.holdEventName || instance.holdEventName === eventName) {
            instance.holdWaiting = false;

            instance.elapsed = 0;
        }
    });
}

/* holdUntil : posé à l'entrée de frame. */
const _origVfxEnterFrame = vfxEnterFrame;

vfxEnterFrame = function (instance, vfx) {
    _origVfxEnterFrame(instance, vfx);

    const frame = vfx.frames[instance.frameIndex];

    if (frame && frame.holdUntil) {
        instance.holdWaiting = true;

        instance.holdEventName = frame.holdUntil;
    }
};