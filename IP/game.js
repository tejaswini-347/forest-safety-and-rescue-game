"use strict";

const WORLD_WIDTH = 2600;
const WORLD_HEIGHT = 2000;
const BASE_SPEED = 190;
const RUN_MULTIPLIER = 1.62;
const AMBUSH_WARNING_TIME = 0.55;
const AMBUSH_FALL_TIME = 1.35;
const AMBUSH_IMPACT_TIME = 2.05;
const RIVER_SAMPLE_SPACING = 8;
const RIVER_COLLISION_RADIUS = 70;
const FORK = { x: 1300, y: 555 };
const AMBUSH_SAFE_Y = FORK.y + 102;
const ROUTES = [
    { id: "left", x: 470, y: 110, safe: false, animal: "🦌" },
    { id: "center", x: 1300, y: 80, safe: true, animal: "" },
    { id: "right", x: 2130, y: 110, safe: false, animal: "🐗" }
];
const HAZARDS = [
    { x: 1195, y: 1710, offset: 7 },
    { x: 1300, y: 1645, offset: 5.5 },
    { x: 1405, y: 1580, offset: 4 }
];
const AMBUSH_START_Y = 1670;
const $ = (selector) => document.querySelector(selector);
const world = $("#world");
const player = $("#player");
const game = $("#game");
const keys = new Set();
const pressedControls = new Set();
const environment = $("#environment");
const riverSegments = makeRiverSegments($(".river"));
const playerCanvas = $(".player-sprite");
const playerContext = playerCanvas.getContext("2d");
const idleCharacter = new Image();
const actionSheet = new Image();
const characterFrames = {
    walk: {
        front: [
            [23, 50, 47, 137], [80, 50, 45, 137], [136, 50, 44, 137],
            [190, 50, 44, 137], [243, 50, 47, 137]
        ],
        right: [
            [317, 50, 53, 137], [379, 50, 48, 137],
            [434, 50, 53, 137], [488, 50, 65, 137]
        ],
        back: [
            [601, 50, 46, 137], [658, 50, 48, 137], [717, 50, 47, 137],
            [775, 50, 46, 137], [831, 50, 46, 137]
        ],
        left: [
            [908, 50, 54, 137], [972, 50, 53, 137],
            [1035, 50, 51, 137], [1099, 50, 49, 137]
        ]
    },
    run: {
        front: [
            [20, 257, 53, 133], [80, 257, 49, 133], [135, 257, 46, 133],
            [180, 257, 50, 133], [236, 257, 57, 133]
        ],
        right: [
            [301, 257, 56, 133], [357, 257, 62, 133],
            [419, 257, 61, 133], [480, 257, 75, 133]
        ],
        back: [
            [603, 257, 47, 133], [650, 257, 59, 133], [720, 257, 47, 133],
            [778, 257, 45, 133], [833, 257, 46, 133]
        ],
        left: [
            [920, 257, 58, 133], [978, 257, 62, 133],
            [1040, 257, 62, 133], [1102, 257, 72, 133]
        ]
    },
    jump: {
        front: [
            [337, 449, 68, 132],
            [408, 449, 68, 132]
        ]
    }
};

let playerX = 1300;
let playerY = 1710;
let cameraX = 0;
let cameraY = 0;
let previousFrame = 0;
let elapsed = 0;
let taskElapsed = 0;
let gameStarted = false;
let task = 1;
let levelComplete = false;
let runToggled = false;
let returningToFork = false;
let gender = "Woman";
let outfit = "trail";
let soundEnabled = true;
let toastTimer = 0;
let audioContext = null;
let hazards = [];
let lastMissionText = "";
let spriteElapsed = 0;
let spriteIndex = 0;
let spriteState = "idle";
let dangerKind = "";
let ambushHesitation = 0;
let gogglesOwned = false;
let jumpRemaining = 0;
let jumpDirection = { x: 0, y: 1 };

idleCharacter.addEventListener("load", () => drawPlayerSprite("idle", "front", true));
idleCharacter.addEventListener("error", () => console.error("The player portrait could not be loaded."));
actionSheet.addEventListener("error", () => console.error("The player action sheet could not be loaded."));
idleCharacter.src = "assets/player/player.png";
actionSheet.src = "assets/player/player-actions.png";

function makeRiverSegments(path) {
    if (!path) {
        console.error("The river path is missing; river collision cannot be enabled.");
        return [];
    }

    const segments = [];
    const length = path.getTotalLength();
    let previous = path.getPointAtLength(0);
    for (let distance = RIVER_SAMPLE_SPACING; distance <= length; distance += RIVER_SAMPLE_SPACING) {
        const point = path.getPointAtLength(distance);
        segments.push({ x1: previous.x, y1: previous.y, x2: point.x, y2: point.y });
        previous = point;
    }
    const end = path.getPointAtLength(length);
    segments.push({ x1: previous.x, y1: previous.y, x2: end.x, y2: end.y });
    return segments;
}

function isOnRiver(x, y) {
    return riverSegments.some((segment) => {
        const dx = segment.x2 - segment.x1;
        const dy = segment.y2 - segment.y1;
        const lengthSquared = dx * dx + dy * dy;
        const projection = lengthSquared
            ? Math.max(0, Math.min(1, ((x - segment.x1) * dx + (y - segment.y1) * dy) / lengthSquared))
            : 0;
        const nearestX = segment.x1 + projection * dx;
        const nearestY = segment.y1 + projection * dy;
        return Math.hypot(x - nearestX, y - nearestY) <= RIVER_COLLISION_RADIUS;
    });
}

function makeForest() {
    let seed = 871042;
    const random = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };

    const canopyPalettes = [
        ["#6c9d43", "#3f7b3d", "#204b31", "#c1d76b"],
        ["#4f8740", "#2f6939", "#173d2d", "#a9c55b"],
        ["#849b47", "#53753a", "#294b30", "#d6d17a"],
        ["#39764a", "#265d3b", "#153b30", "#8fb85b"],
        ["#758d3e", "#456a35", "#263f2d", "#bdc965"]
    ];
    const treeMarkup = '<span class="trunk"></span><span class="canopy canopy-top"></span><span class="canopy canopy-mid"></span><span class="canopy canopy-low"></span>';

    const addTree = (x, y, scale, conifer) => {
        const palette = canopyPalettes[Math.floor(random() * canopyPalettes.length)];
        const tree = document.createElement("div");
        tree.className = `tree ${conifer ? "conifer" : "broadleaf"}`;
        tree.style.left = `${x}px`;
        tree.style.top = `${y}px`;
        tree.style.setProperty("--scale", scale.toFixed(2));
        tree.style.setProperty("--leaf-light", palette[0]);
        tree.style.setProperty("--leaf-mid", palette[1]);
        tree.style.setProperty("--leaf-dark", palette[2]);
        tree.style.setProperty("--leaf-sun", palette[3]);
        tree.innerHTML = treeMarkup;
        environment.appendChild(tree);
    };

    for (let index = 0; index < 238; index += 1) {
        const x = 75 + random() * (WORLD_WIDTH - 150);
        const y = 65 + random() * (WORLD_HEIGHT - 130);
        const scale = 0.62 + random() * 0.82;
        const nearMainTrail = y > 555 && Math.abs(x - (1300 + Math.sin(y / 145) * 24)) < 205;
        const nearFork = y <= 555 && y >= 65 && Math.abs(x - 1300) < Math.max(120, (555 - y) * 1.7);
        const nearRiver = Math.abs(x - (420 + Math.sin(y / 190) * 120)) < 105;

        if (nearMainTrail || nearFork || nearRiver) continue;
        addTree(x, y, scale, random() > 0.54);
    }

    const trailGrove = [
        [1130, 1850, 1.18], [1470, 1760, 1.05],
        [1465, 1490, 1.22], [1130, 1370, 1.08], [1470, 1240, 0.94],
        [1130, 1080, 1.2], [1470, 950, 1.03], [1130, 805, 0.92],
        [1470, 690, 1.15]
    ];
    trailGrove.forEach(([x, y, scale], index) => {
        addTree(x, y, scale, index % 2 === 0);
    });

    const details = [
        { kind: "bush", x: 930, y: 1580 }, { kind: "bush", x: 1690, y: 1525 },
        { kind: "bush", x: 1150, y: 1545 }, { kind: "bush", x: 1450, y: 1010 },
        { kind: "bush", x: 885, y: 1030 }, { kind: "bush", x: 1760, y: 830 },
        { kind: "bush", x: 1010, y: 475 }, { kind: "bush", x: 1600, y: 430 },
        { kind: "rock", x: 1010, y: 1750 }, { kind: "rock", x: 1585, y: 1600 },
        { kind: "rock", x: 940, y: 1195 }, { kind: "rock", x: 1690, y: 1035 },
        { kind: "rock", x: 1055, y: 690 }, { kind: "rock", x: 1555, y: 650 },
        { kind: "log", x: 835, y: 1460 }, { kind: "log", x: 1800, y: 1290 },
        { kind: "log", x: 890, y: 765 }, { kind: "log", x: 1710, y: 525 },
        { kind: "flower-patch", x: 800, y: 1680 }, { kind: "flower-patch", x: 1780, y: 955 },
        { kind: "flower-patch", x: 995, y: 390 }, { kind: "flower-patch", x: 1500, y: 1480 }
    ];

    const groundCover = ["fern", "flower-spray", "mushroom-cluster", "moss-patch"];
    for (let index = 0; index < 190; index += 1) {
        const x = 45 + random() * (WORLD_WIDTH - 90);
        const y = 45 + random() * (WORLD_HEIGHT - 90);
        const nearMainTrail = y > 555 && Math.abs(x - (1300 + Math.sin(y / 145) * 24)) < 178;
        const nearFork = y <= 555 && y >= 65 && Math.abs(x - 1300) < Math.max(130, (555 - y) * 1.7);
        const nearRiver = Math.abs(x - (420 + Math.sin(y / 190) * 120)) < 88;
        if (nearMainTrail || nearFork || nearRiver) continue;
        details.push({
            kind: groundCover[Math.floor(random() * groundCover.length)],
            x,
            y,
            rotation: Math.round(random() * 70 - 35)
        });
    }

    details.forEach((detail) => {
        const element = document.createElement("span");
        element.className = detail.kind;
        element.style.left = `${detail.x}px`;
        element.style.top = `${detail.y}px`;
        if (detail.rotation !== undefined) element.style.setProperty("--rotation", `${detail.rotation}deg`);
        environment.appendChild(element);
    });

    hazards = HAZARDS.map((hazard, index) => {
        const branch = document.createElement("div");
        const warning = document.createElement("div");
        branch.className = "branch-hazard";
        warning.className = "hazard-shadow";
        branch.style.left = `${hazard.x}px`;
        branch.style.top = `${hazard.y}px`;
        warning.style.left = `${hazard.x}px`;
        warning.style.top = `${hazard.y}px`;
        world.append(branch, warning);
        return { ...hazard, branch, warning, index, wasFalling: false };
    });
}

function playCue(frequency = 660, duration = 0.09) {
    if (!soundEnabled) return;
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioContext) audioContext = new AudioContextClass();
        if (audioContext.state === "suspended") audioContext.resume();
        const oscillator = audioContext.createOscillator();
        const volume = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        volume.gain.setValueAtTime(0.045, audioContext.currentTime);
        volume.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        oscillator.connect(volume);
        volume.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
        console.warn("The game sound could not be played.", error);
    }
}

function showToast(message, duration = 2200) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), duration);
}

function updateMission(message) {
    const defaultMessage = task === 1
        ? "Navigate the forest safely and complete the rescue tasks."
        : task === 2
            ? "Choose one of three forest trails and discover where it leads."
            : task === 3
                ? "Use your detection goggles to jump or steer around poisonous plants."
                : "You have completed every Level 1 rescue task.";
    const nextMessage = message || defaultMessage;
    if (nextMessage !== lastMissionText) {
        $("#missionText").textContent = nextMessage;
        lastMissionText = nextMessage;
    }
}

function setTask(nextTask) {
    task = nextTask;
    const branches = $("#step-branches");
    const paths = $("#step-path");
    const plants = $("#step-plants");
    branches.classList.toggle("done", nextTask > 1 || levelComplete);
    branches.classList.toggle("active", nextTask === 1 && !levelComplete);
    paths.classList.toggle("active", nextTask === 2 && !levelComplete);
    paths.classList.toggle("done", nextTask > 2 || levelComplete);
    plants.classList.toggle("active", nextTask === 3 && !levelComplete);
    plants.classList.toggle("done", levelComplete);
    branches.querySelector(".step-status").textContent = nextTask > 1 || levelComplete ? "✓" : "●";
    paths.querySelector(".step-status").textContent = nextTask > 2 || levelComplete ? "✓" : nextTask === 2 ? "●" : "○";
    plants.querySelector(".step-status").textContent = levelComplete ? "✓" : nextTask === 3 ? "●" : "○";
    $("#choice-routes").classList.toggle("is-hidden", nextTask !== 2);
    $("#route-markers").classList.toggle("is-hidden", nextTask !== 2);
    $("#third-task-trail").classList.toggle("is-hidden", nextTask < 3);
    $("#plant-garden").classList.toggle("is-hidden", nextTask !== 3);
    $("#safe-zone").classList.toggle("is-hidden", nextTask !== 1);
    $("#map-task-label").textContent = levelComplete ? "✦ COMPLETE" : `● TASK 0${nextTask}`;
    $("#mini-rescue").classList.toggle("is-hidden", nextTask < 3);
    updateMission();
}

function beginLevel() {
    gameStarted = true;
    elapsed = 0;
    taskElapsed = 0;
    playerX = 1300;
    playerY = 1710;
    setPlayerPosition(playerX, playerY);
    cameraX = Math.max(0, playerX - game.clientWidth / 2);
    cameraY = Math.max(0, playerY - game.clientHeight / 2);
    levelComplete = false;
    gogglesOwned = false;
    jumpRemaining = 0;
    ambushHesitation = 0;
    returningToFork = false;
    keys.clear();
    runToggled = false;
    window.clearTimeout(toastTimer);
    $("#toast").classList.remove("visible");
    player.classList.remove("facing-left", "moving");
    returningToFork = false;
    $("#rescue-person").classList.add("is-hidden");
    $("#wildlife").classList.add("is-hidden");
    $("#player-goggles").classList.add("is-hidden");
    $("#reward-overlay").classList.add("is-hidden");
    $("#reward-overlay").setAttribute("aria-hidden", "true");
    $("#level-complete-overlay").classList.add("is-hidden");
    $("#level-complete-overlay").setAttribute("aria-hidden", "true");
    $("#level-two-overlay").classList.add("is-hidden");
    $("#level-two-overlay").setAttribute("aria-hidden", "true");
    $("#ambush-bush").classList.add("is-rumbling");
    hazards.forEach((hazard) => {
        hazard.branch.classList.remove("active", "falling");
        hazard.warning.style.display = "none";
        hazard.wasFalling = false;
    });
    $("#run-button").classList.remove("is-running");
    $("#run-button").setAttribute("aria-pressed", "false");
    $("#start-overlay").classList.add("is-hidden");
    $("#start-overlay").setAttribute("aria-hidden", "true");
    $("#panel-overlay").classList.add("is-hidden");
    $("#panel-overlay").setAttribute("aria-hidden", "true");
    closeDangerDialog();
    setTask(1);
    updateMission("Keep RUN held with Shift or the RUN button and move north until you reach the safe camp. Stopping before camp lets a branch fall on you.");
    updateTimer();
    playCue(740, 0.13);
    previousFrame = performance.now();
}

function setPlayerPosition(x, y) {
    playerX = Math.max(55, Math.min(WORLD_WIDTH - 55, x));
    playerY = Math.max(70, Math.min(WORLD_HEIGHT - 45, y));
    player.style.left = `${playerX}px`;
    player.style.top = `${playerY}px`;
    $("#mini-player").style.left = `${(playerX / WORLD_WIDTH) * 100}%`;
    $("#mini-player").style.top = `${(playerY / WORLD_HEIGHT) * 100}%`;
}

function drawPlayerSprite(state = spriteState, direction = "front", force = false) {
    const changed = state !== spriteState;
    if (changed) {
        spriteState = state;
        spriteIndex = 0;
        spriteElapsed = 0;
        force = true;
    }
    if (state === "idle") {
        if (!changed && !force) return;
        if (idleCharacter.complete && idleCharacter.naturalWidth) {
            playerContext.clearRect(0, 0, playerCanvas.width, playerCanvas.height);
            playerContext.drawImage(idleCharacter, 0, 0, playerCanvas.width, playerCanvas.height);
        }
        return;
    }

    const frames = characterFrames[state][direction] || characterFrames[state].front;
    if (!force && spriteIndex >= frames.length) spriteIndex = 0;
    if (!actionSheet.complete || !actionSheet.naturalWidth) return;
    const [sourceX, sourceY, sourceWidth, sourceHeight] = frames[spriteIndex];
    const scale = Math.min((playerCanvas.width - 8) / sourceWidth, (playerCanvas.height - 6) / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const x = (playerCanvas.width - width) / 2;
    const y = playerCanvas.height - height - 3;
    playerContext.clearRect(0, 0, playerCanvas.width, playerCanvas.height);
    playerContext.drawImage(actionSheet, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function updatePlayerSprite(deltaTime, moving, running, horizontal, vertical) {
    if (!moving) {
        drawPlayerSprite("idle");
        return;
    }
    let direction = "front";
    if (Math.abs(horizontal) > Math.abs(vertical)) {
        direction = horizontal < 0 ? "left" : "right";
    } else if (vertical < 0) {
        direction = "back";
    }
    const state = jumpRemaining > 0 ? "jump" : running ? "run" : "walk";
    const facing = state === "jump" ? "front" : direction;
    if (state !== spriteState) {
        playerCanvas.dataset.direction = facing;
        drawPlayerSprite(state, facing, true);
        return;
    }
    spriteElapsed += deltaTime;
    const frames = characterFrames[state][facing] || characterFrames[state].front;
    const frameDuration = state === "jump" ? 0.16 : running ? 0.105 : 0.18;
    if (spriteElapsed >= frameDuration) {
        const steps = Math.floor(spriteElapsed / frameDuration);
        spriteElapsed %= frameDuration;
        spriteIndex = (spriteIndex + steps) % frames.length;
        drawPlayerSprite(state, direction, true);
    } else if (playerCanvas.dataset.direction !== facing) {
        spriteIndex = 0;
        drawPlayerSprite(state, facing, true);
    }
    playerCanvas.dataset.direction = facing;
}

function updateCamera(deltaTime) {
    const maxX = Math.max(0, WORLD_WIDTH - game.clientWidth);
    const maxY = Math.max(0, WORLD_HEIGHT - game.clientHeight);
    const targetX = Math.max(0, Math.min(maxX, playerX - game.clientWidth / 2));
    const targetY = Math.max(0, Math.min(maxY, playerY - game.clientHeight / 2));
    const easing = 1 - Math.exp(-deltaTime * 7);
    cameraX += (targetX - cameraX) * easing;
    cameraY += (targetY - cameraY) * easing;
    world.style.transform = `translate3d(${-cameraX}px, ${-cameraY}px, 0)`;
}

function updateTimer() {
    const totalSeconds = Math.floor(elapsed);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    $("#timer").textContent = `${minutes}:${seconds}`;
}

function updateHazards() {
    if (task !== 1) {
        hazards.forEach((hazard) => {
            hazard.branch.classList.remove("active", "falling");
            hazard.warning.style.display = "none";
        });
        return;
    }

    hazards.forEach((hazard) => {
        if (hazard.index === 0) return;
        const phase = (taskElapsed + hazard.offset) % 8.5;
        const warning = phase >= 0.2 && phase < 1.45;
        const active = phase >= 1.2 && phase < 4.65;
        const falling = active && !hazard.wasFalling;
        hazard.warning.style.display = warning ? "block" : "none";
        hazard.branch.classList.toggle("active", active);
        hazard.branch.classList.toggle("falling", falling);
        if (falling) {
            window.setTimeout(() => hazard.branch.classList.remove("falling"), 780);
        }
        hazard.wasFalling = active;
    });
}

function clearAmbushBranch() {
    const branch = hazards[0];
    if (!branch) return;
    branch.branch.classList.remove("active", "falling");
    branch.warning.style.display = "none";
    branch.wasFalling = false;
}

function checkAmbushProgress(deltaTime, moving, vertical, running) {
    if (task !== 1) return;

    const inDangerZone = playerY <= AMBUSH_START_Y && playerY > AMBUSH_SAFE_Y;
    if (!inDangerZone) {
        ambushHesitation = 0;
        clearAmbushBranch();
        return;
    }

    if (moving && running) {
        ambushHesitation = 0;
        clearAmbushBranch();
        return;
    }

    ambushHesitation += deltaTime;
    const branch = hazards[0];
    if (ambushHesitation >= AMBUSH_WARNING_TIME) {
        branch.x = playerX;
        branch.y = playerY;
        branch.branch.style.left = `${branch.x}px`;
        branch.branch.style.top = `${branch.y}px`;
        branch.warning.style.left = `${playerX}px`;
        branch.warning.style.top = `${playerY}px`;
        branch.warning.style.display = "block";
        branch.branch.classList.add("active");
    }
    if (ambushHesitation >= AMBUSH_FALL_TIME) {
        branch.branch.classList.add("falling");
    }
    if (ambushHesitation >= AMBUSH_IMPACT_TIME) {
        openDangerDialog("branch", branch);
    }
}

function completeFirstTask() {
    ambushHesitation = 0;
    clearAmbushBranch();
    setTask(2);
    playerX = FORK.x;
    playerY = FORK.y + 65;
    setPlayerPosition(playerX, playerY);
    updateMission("Three trails lie ahead. Choose a path and see where it leads.");
    showToast("Task Complete!", 2800);
    playCue(880, 0.16);
    window.setTimeout(() => playCue(1120, 0.18), 140);
}

function completeSecondTask() {
    if (task !== 2) return;
    gogglesOwned = true;
    returningToFork = false;
    $("#wildlife").classList.add("is-hidden");
    $("#player-goggles").classList.add("is-hidden");
    setTask(3);
    setPlayerPosition(1300, 115);
    updateMission("Task 2 complete! Your goggles detect the poisonous plants ahead. Jump with SPACE or steer around them.");
    $("#reward-overlay").classList.remove("is-hidden");
    $("#reward-overlay").setAttribute("aria-hidden", "false");
    playCue(990, 0.14);
    window.setTimeout(() => playCue(1320, 0.23), 150);
}

function continueWithGoggles() {
    $("#reward-overlay").classList.add("is-hidden");
    $("#reward-overlay").setAttribute("aria-hidden", "true");
    $("#player-goggles").classList.remove("is-hidden");
    $("#plant-garden").classList.add("plants-detected");
    updateMission("Goggles on! Cross the poisonous plants by jumping with SPACE or steering around each plant.");
    showToast("Goggles equipped! Poisonous plants detected.", 2600);
}

function placeWildlife(route) {
    const wildlife = $("#wildlife");
    wildlife.textContent = route.animal;
    wildlife.style.left = `${route.x}px`;
    wildlife.style.top = `${route.y - 67}px`;
    wildlife.classList.remove("is-hidden");
}

function completeLevel() {
    if (levelComplete) return;
    levelComplete = true;
    returningToFork = false;
    $("#rescue-person").classList.remove("is-hidden");
    $("#plant-garden").classList.add("is-hidden");
    setTask(4);
    updateMission("You found the rescue team and completed every Level 1 task.");
    showToast("Safe Path Found!", 3000);
    playCue(990, 0.14);
    window.setTimeout(() => playCue(1320, 0.23), 160);
    window.setTimeout(() => {
        $("#level-complete-overlay").classList.remove("is-hidden");
        $("#level-complete-overlay").setAttribute("aria-hidden", "false");
    }, 700);
}

function openDangerDialog(kind, hazard) {
    dangerKind = kind;
    keys.clear();
    pressedControls.clear();
    setRun(false);
    player.classList.remove("moving");
    $("#back-button").classList.toggle("is-hidden", kind === "river");
    if (kind === "river") {
        $("#danger-title").textContent = "Drowned in the river";
        $("#danger-message").textContent = "You went into the river and drowned. Please try this task again.";
    } else if (kind === "wildlife") {
        $("#danger-title").textContent = "Danger! Choose another path.";
        $("#danger-message").textContent = "A wild animal is resting on this trail. You are safe, but this is not the rescue route. Go back to the fork or retry this task.";
    } else if (kind === "plants") {
        $("#danger-title").textContent = "Poisonous plants detected!";
        $("#danger-message").textContent = "Your goggles found poisonous plants on the trail. Jump with SPACE, steer around the patch, or retry this task.";
    } else {
        $("#danger-title").textContent = "Caught under falling branches";
        $("#danger-message").textContent = "A falling branch caught you because you stopped before reaching the safe camp. Retry Task 1 and keep running north until you get there.";
        $("#danger-overlay").dataset.hazardX = String(hazard.x);
        $("#danger-overlay").dataset.hazardY = String(hazard.y);
    }
    $("#danger-overlay").classList.remove("is-hidden");
    $("#danger-overlay").setAttribute("aria-hidden", "false");
    playCue(250, 0.2);
}

function closeDangerDialog() {
    $("#danger-overlay").classList.add("is-hidden");
    $("#danger-overlay").setAttribute("aria-hidden", "true");
    $("#back-button").classList.remove("is-hidden");
}

function retryCurrentTask() {
    closeDangerDialog();
    keys.clear();
    pressedControls.clear();
    setRun(false);
    player.classList.remove("moving", "jumping");
    jumpRemaining = 0;
    ambushHesitation = 0;
    returningToFork = false;
    $("#wildlife").classList.add("is-hidden");

    if (task === 1) {
        taskElapsed = 0;
        hazards.forEach((hazard) => {
            hazard.branch.classList.remove("active", "falling");
            hazard.warning.style.display = "none";
            hazard.wasFalling = false;
        });
        setPlayerPosition(1300, 1710);
        $("#ambush-bush").classList.add("is-rumbling");
        updateMission("Task 1 restarted. Hold Shift or tap RUN and move north to the safe camp.");
    } else if (task === 2) {
        setPlayerPosition(FORK.x, FORK.y + 65);
        updateMission("Task 2 restarted. Choose another trail from the fork.");
    } else if (task === 3) {
        setPlayerPosition(1300, 115);
        $("#player-goggles").classList.remove("is-hidden");
        $("#plant-garden").classList.add("plants-detected");
        updateMission("Task 3 restarted. Your goggles are ready—jump with SPACE or steer around the poisonous plants.");
    }
}

function goBackFromDanger() {
    closeDangerDialog();
    $("#wildlife").classList.add("is-hidden");
    if (dangerKind === "plants") {
        jumpRemaining = 0;
        setPlayerPosition(1300, 145);
        updateMission("Back at the edge of the plant patch. Jump with SPACE or carefully steer around the poisonous plants.");
    } else if (dangerKind === "wildlife") {
        returningToFork = false;
        setPlayerPosition(FORK.x, FORK.y + 65);
        updateMission("Back at the fork. Choose a different trail to reach the rescue team.");
    } else {
        elapsed = 0;
        taskElapsed = 0;
        ambushHesitation = 0;
        updateTimer();
        hazards.forEach((branch) => {
            branch.branch.classList.remove("active", "falling");
            branch.warning.style.display = "none";
            branch.wasFalling = false;
        });
        setPlayerPosition(1300, AMBUSH_START_Y + 105);
        $("#ambush-bush").classList.add("is-rumbling");
        updateMission("Back at the trail start. Hold Shift or tap RUN and move north all the way to the safe camp.");
    }
}

function checkTaskProgress() {
    if (levelComplete) return;

    if (task === 1 && Math.hypot(playerX - 1300, playerY - 548) < 102) {
        completeFirstTask();
        return;
    }

    if (task === 3) {
        if (!gogglesOwned) return;
        const poisonPlants = [
            { x: 1175, y: 300 }, { x: 1300, y: 300 }, { x: 1425, y: 300 },
            { x: 1220, y: 400 }, { x: 1380, y: 400 }
        ];
        if (jumpRemaining <= 0) {
            const plant = poisonPlants.find((item) => Math.hypot(playerX - item.x, playerY - item.y) < 50);
            if (plant) {
                openDangerDialog("plants");
                return;
            }
        }
        if (playerY >= 535) {
            completeLevel();
        }
        return;
    }

    if (task !== 2) return;

    const distanceToFork = Math.hypot(playerX - FORK.x, playerY - FORK.y);
    if (returningToFork && distanceToFork < 120) {
        returningToFork = false;
        $("#wildlife").classList.add("is-hidden");
        updateMission("Back at the fork. Choose a trail you have not explored yet.");
        showToast("Back at the fork. Choose another trail.");
    }

    const nearbyRoute = ROUTES.find((route) => Math.hypot(playerX - route.x, playerY - route.y) < 225);
    if (nearbyRoute && !nearbyRoute.safe && !returningToFork) {
        placeWildlife(nearbyRoute);
    } else if (!returningToFork) {
        $("#wildlife").classList.add("is-hidden");
    }

    if (returningToFork) return;

    const reachedRoute = ROUTES.find((route) => Math.hypot(playerX - route.x, playerY - route.y) < 94);
    if (!reachedRoute) return;

    if (reachedRoute.safe) {
        completeSecondTask();
        return;
    }

    placeWildlife(reachedRoute);
    openDangerDialog("wildlife");
}

function getPanelContent(panelName) {
    const panels = {
        map: {
            title: "Forest map",
            content: '<div class="panel-map"><span class="panel-map-dot" id="panel-map-dot"></span></div><p>Follow the amber trail. The field map shows your position and the current mission area.</p>'
        },
        inventory: {
            title: "Explorer pack",
            content: `<ul class="tool-list"><li>Trail map — always with you</li><li>Explorer outfit — ${outfit}</li><li>Character — ${gender} explorer</li><li>${gogglesOwned ? "🥽 Poison plant detection goggles — equipped" : "Poison plant detection goggles — complete Task 2 to unlock"}</li><li>${levelComplete ? "Trailblazer badge — unlocked!" : "Trailblazer badge — earn it by completing Level 1"}</li></ul>`
        },
        compass: {
            title: "Trail compass",
            content: `<div class="compass-mark">✥</div><p>${task === 1 ? "Head north along the amber trail to reach the safe camp." : task === 3 ? "Your goggles mark poisonous plants. Jump with SPACE or steer around each detected plant, then continue south." : levelComplete ? "You made it! You detected and crossed the poisonous plants safely." : returningToFork ? "Turn back toward the trail fork. Your compass won't choose a route for you." : "The three trails are unmarked. Follow your judgment and return to the fork if you meet wildlife."}</p>`
        },
        tasks: {
            title: "Rescue checklist",
            content: `<div class="task-line"><span>${task > 1 || levelComplete ? "✓" : "01"}</span> Run past the falling branches to reach the safe camp</div><div class="task-line"><span>${task > 2 || levelComplete ? "✓" : "02"}</span> Choose the safe trail and earn the detection goggles</div><div class="task-line"><span>${levelComplete ? "✓" : task === 3 ? "03" : "03"}</span> Detect and safely cross the poisonous plants</div>${levelComplete ? '<p>All Level 1 tasks complete. Detection goggles earned!</p>' : '<p>Use SPACE to jump or steer around detected plants. Animals do not attack; return to the fork if you meet wildlife.</p>'}`
        }
    };
    return panels[panelName];
}

function openPanel(panelName, titleOverride, contentOverride) {
    const panel = getPanelContent(panelName) || {
        title: titleOverride,
        content: contentOverride
    };
    $("#tool-title").textContent = titleOverride || panel.title;
    $("#tool-content").innerHTML = contentOverride || panel.content;
    $("#panel-overlay").classList.remove("is-hidden");
    $("#panel-overlay").setAttribute("aria-hidden", "false");
    keys.clear();
    runToggled = false;
    $("#run-button").classList.remove("is-running");
    $("#run-button").setAttribute("aria-pressed", "false");
    updatePanelMap();
}

function closePanel() {
    $("#panel-overlay").classList.add("is-hidden");
    $("#panel-overlay").setAttribute("aria-hidden", "true");
}

function moveToLevelTwo() {
    $("#level-complete-overlay").classList.add("is-hidden");
    $("#level-complete-overlay").setAttribute("aria-hidden", "true");
    $("#level-two-overlay").classList.remove("is-hidden");
    $("#level-two-overlay").setAttribute("aria-hidden", "false");
}

function returnToStartMenu() {
    $("#level-two-overlay").classList.add("is-hidden");
    $("#level-two-overlay").setAttribute("aria-hidden", "true");
    $("#level-complete-overlay").classList.add("is-hidden");
    $("#level-complete-overlay").setAttribute("aria-hidden", "true");
    gameStarted = false;
    levelComplete = false;
    gogglesOwned = false;
    elapsed = 0;
    setPlayerPosition(1300, 1710);
    $("#player-goggles").classList.add("is-hidden");
    $("#plant-garden").classList.remove("plants-detected");
    updateTimer();
    $("#start-title").innerHTML = "The forest<br><em>is calling.</em>";
    $(".start-intro").textContent = "Sprint past falling branches, then find the rescue team and bring everyone home.";
    $("#start-button").querySelector("span").textContent = "START ADVENTURE";
    $("#start-overlay").classList.remove("is-hidden");
    $("#start-overlay").setAttribute("aria-hidden", "false");
    setTask(1);
}

function exitGame() {
    $("#level-two-overlay").classList.add("is-hidden");
    $("#level-two-overlay").setAttribute("aria-hidden", "true");
    $("#level-complete-overlay").classList.add("is-hidden");
    $("#level-complete-overlay").setAttribute("aria-hidden", "true");
    gameStarted = false;
    levelComplete = true;
    $("#start-title").innerHTML = "Adventure<br><em>complete!</em>";
    $(".start-intro").textContent = "Thanks for exploring the forest. You can close this browser tab, or start Level 1 again.";
    $("#start-button").querySelector("span").textContent = "PLAY LEVEL AGAIN";
    $("#start-overlay").classList.remove("is-hidden");
    $("#start-overlay").setAttribute("aria-hidden", "false");
}

function updatePanelMap() {
    const dot = $("#panel-map-dot");
    if (!dot) return;
    dot.style.left = `${(playerX / WORLD_WIDTH) * 100}%`;
    dot.style.top = `${(playerY / WORLD_HEIGHT) * 100}%`;
}

function setGender(value, selectedButton) {
    gender = value;
    $("#gender-options").querySelectorAll(".choice").forEach((button) => button.classList.toggle("selected", button === selectedButton));
    playerCanvas.setAttribute("aria-label", `${gender} forest explorer`);
}

function setOutfit(value, selectedButton) {
    outfit = value;
    $("#outfit-options").querySelectorAll(".outfit-choice").forEach((button) => button.classList.toggle("selected", button === selectedButton));
    player.classList.remove("outfit-trail", "outfit-sunrise", "outfit-lake");
    player.classList.add(`outfit-${outfit}`);
    playerCanvas.classList.remove("outfit-trail", "outfit-sunrise", "outfit-lake");
    playerCanvas.classList.add(`outfit-${outfit}`);
}

function setSound(enabled) {
    soundEnabled = enabled;
    const toggle = $("#sound-toggle");
    toggle.classList.toggle("is-on", enabled);
    toggle.setAttribute("aria-checked", String(enabled));
    toggle.querySelector("span").textContent = enabled ? "ON" : "OFF";
}

function setRun(active) {
    runToggled = active;
    $("#run-button").classList.toggle("is-running", active);
    $("#run-button").setAttribute("aria-pressed", String(active));
}

function gameLoop(timestamp) {
    const deltaTime = previousFrame ? Math.max(0, Math.min((timestamp - previousFrame) / 1000, 0.05)) : 0;
    previousFrame = timestamp;
    const panelOpen = !$("#panel-overlay").classList.contains("is-hidden");
    const overlayOpen = !$("#start-overlay").classList.contains("is-hidden");
    const dangerOpen = !$("#danger-overlay").classList.contains("is-hidden");
    const rewardOpen = !$("#reward-overlay").classList.contains("is-hidden");
    const completionOpen = !$("#level-complete-overlay").classList.contains("is-hidden");
    const nextLevelOpen = !$("#level-two-overlay").classList.contains("is-hidden");
    const canPlay = gameStarted && !overlayOpen && !panelOpen && !dangerOpen && !rewardOpen && !completionOpen && !nextLevelOpen && !levelComplete;

    if (canPlay) {
        elapsed += deltaTime;
        if (task === 1) taskElapsed += deltaTime;
        updateTimer();

        let horizontal = Number(keys.has("d") || keys.has("arrowright") || pressedControls.has("right")) -
            Number(keys.has("a") || keys.has("arrowleft") || pressedControls.has("left"));
        let vertical = Number(keys.has("s") || keys.has("arrowdown") || pressedControls.has("down")) -
            Number(keys.has("w") || keys.has("arrowup") || pressedControls.has("up"));
        let moving = horizontal !== 0 || vertical !== 0;
        const magnitude = moving ? Math.hypot(horizontal, vertical) : 1;
        const running = runToggled || keys.has("shift");
        const speed = BASE_SPEED * (running ? RUN_MULTIPLIER : 1);
        if (jumpRemaining > 0) {
            const jumpStep = Math.min(deltaTime, jumpRemaining);
            playerX += jumpDirection.x * 390 * jumpStep;
            playerY += jumpDirection.y * 390 * jumpStep;
            jumpRemaining = Math.max(0, jumpRemaining - deltaTime);
            moving = true;
        }
        updatePlayerSprite(deltaTime, moving, running, horizontal, vertical);

        if (moving) {
            horizontal /= magnitude;
            vertical /= magnitude;
            setPlayerPosition(playerX + horizontal * speed * deltaTime, playerY + vertical * speed * deltaTime);
            if (horizontal !== 0) player.classList.toggle("facing-left", horizontal < 0);
        }
        if (task === 3 && jumpRemaining > 0) {
            player.classList.add("jumping");
        } else {
            player.classList.remove("jumping");
        }
        if (moving && horizontal !== 0) player.classList.toggle("facing-left", horizontal < 0);
        if (playerY !== Number.parseFloat(player.style.top)) setPlayerPosition(playerX, playerY);
        if (task < 4 && isOnRiver(playerX, playerY)) {
            openDangerDialog("river");
        } else {
            updateHazards();
            checkAmbushProgress(deltaTime, moving, vertical, running);
            checkTaskProgress();
        }
    } else {
        updatePlayerSprite(0, false, false, 0, 0);
    }

    updateCamera(deltaTime);
    updatePanelMap();
    requestAnimationFrame(gameLoop);
}

document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    if (key === " " && !event.repeat && gameStarted && task === 3 && gogglesOwned &&
        $("#danger-overlay").classList.contains("is-hidden")) {
        const horizontal = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
        const vertical = Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup"));
        const magnitude = Math.hypot(horizontal, vertical) || 1;
        jumpDirection = horizontal || vertical
            ? { x: horizontal / magnitude, y: vertical / magnitude }
            : { x: 0, y: 1 };
        jumpRemaining = 0.72;
    }
    if (key === "escape") {
        closePanel();
        return;
    }
    if (gameStarted && !levelComplete && $("#danger-overlay").classList.contains("is-hidden")) keys.add(key);
});

document.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => {
    keys.clear();
    pressedControls.clear();
    setRun(false);
});

document.querySelectorAll("[data-direction]").forEach((button) => {
    const direction = button.dataset.direction;
    button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (!gameStarted || levelComplete) return;
        pressedControls.add(direction);
        button.classList.add("pressed");
        button.setPointerCapture(event.pointerId);
    });
    const release = () => {
        pressedControls.delete(direction);
        button.classList.remove("pressed");
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
});

$("#run-button").addEventListener("click", () => {
    if (!gameStarted || levelComplete) return;
    setRun(!runToggled);
});

$("#start-button").addEventListener("click", beginLevel);
$("#sound-toggle").addEventListener("click", () => setSound(!soundEnabled));

$("#gender-options").addEventListener("click", (event) => {
    const button = event.target.closest("[data-gender]");
    if (button) setGender(button.dataset.gender, button);
});

$("#outfit-options").addEventListener("click", (event) => {
    const button = event.target.closest("[data-outfit]");
    if (button) setOutfit(button.dataset.outfit, button);
});

document.querySelectorAll("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => openPanel(button.dataset.panel));
});

$("#panel-overlay").addEventListener("click", (event) => {
    if (event.target === $("#panel-overlay") || event.target.closest(".close-button")) {
        closePanel();
        return;
    }
    if (event.target.closest("#replay-button")) beginLevel();
});

$("#retry-button").addEventListener("click", retryCurrentTask);
$("#back-button").addEventListener("click", goBackFromDanger);
$("#claim-goggles-button").addEventListener("click", continueWithGoggles);
$("#level-two-button").addEventListener("click", moveToLevelTwo);
$("#exit-game-button").addEventListener("click", exitGame);
$("#level-two-menu-button").addEventListener("click", returnToStartMenu);
$("#level-two-exit-button").addEventListener("click", exitGame);

window.addEventListener("resize", () => updateCamera(0.05));

makeForest();
setPlayerPosition(playerX, playerY);
setTask(1);
setSound(true);
updateCamera(0.05);
requestAnimationFrame(gameLoop);
