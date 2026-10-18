// Regression coverage for saved-case reloads and repeated dives.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const cache = new Map(), storage = new Map();
const noop = () => 0;
const idleSystems = new Proxy({}, { get: () => noop });
let visible = false, now = 1000000;
const overrides = {
    'core/SaveStorage': {
        saveJSON: (key, data) => { storage.set(key, JSON.parse(JSON.stringify(data))); return true; },
        loadJSON: key => storage.has(key) ? JSON.parse(JSON.stringify(storage.get(key))) : null,
        removeKey: key => storage.delete(key),
    },
    'audio/AudioManager': idleSystems,
    'audio/AdaptiveMusic': {
        warmUpAdaptiveMusic: noop,
        getAdaptiveMusicPreparation: () => ({ status: 'ready' }),
        getAdaptiveMusicClock: () => ({ playing: true }),
    },
    'story/HomeScene': idleSystems,
    'logic/Particle': idleSystems,
    'logic/BreathSystem': idleSystems,
    'logic/Rope': idleSystems,
    'logic/ManualDrive': idleSystems,
    'logic/CollisionImpact': idleSystems,
    'logic/Collision': { checkMazeCollision: () => false },
    'logic/Marker': idleSystems,
    'logic/FishEnemy': { generateFishDens: () => [], updateAllFishEnemies: noop },
    'logic/OxygenTank': { buildOxygenTanksForMaze: () => [], createOxygenFeedback: () => ({}), updateOxygenTanks: noop },
    'logic/Relic': { buildRelicsForMaze: () => [], resetRelicDiscoveryForDive: noop, updateRelicDiscovery: noop },
    'logic/LifeDetector': idleSystems,
    'logic/NPCPerception': { isRescueTargetVisible: () => visible },
    'logic/DecompressionSystem': idleSystems,
    'logic/BCDSystem': idleSystems,
    'extraction': { onExtractionDiveStart: noop, updateCarryItemAnim: noop },
};
function compile(file, requireModule) {
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync(path.join(root, file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('exports', 'require', source)(exports, requireModule);
    return exports;
}
function load(file) {
    if (file in overrides) return overrides[file];
    if (cache.has(file)) return cache.get(file);
    if (!fs.existsSync(path.join(root, file + '.ts'))) file += '/index';
    const result = compile(file, name => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name))));
    cache.set(file, result);
    return result;
}
const originalNow = Date.now;
Date.now = () => now;
try {
    const core = load('core/state'), { state, player, input, touches } = core;
    const { CONFIG } = load('core/config');
    CONFIG.maze.fishEnabled = false;
    CONFIG.camera.adaptiveZoom = false;
    const map = load('world/map');
    overrides['world/map'] = { ...map, generateMazeMap: seed => map.generateMazeMap(seed ?? 128473) };
    const logic = load('logic/MazeLogic'), save = load('logic/MazeSave');
    logic.resetMazeLogic();
    let maze = state.mazeRescue;
    const seed = maze.seed;
    const spawn = { x: maze.exitX, y: ((CONFIG.maze.wallThickness || 5) + 1.5) * maze.mazeTileSize };
    const rope = { path: [{ x: spawn.x, y: spawn.y }, { x: spawn.x, y: spawn.y + 100 }] };
    state.rope.ropes.push(rope);
    state.markers.push({ x: spawn.x, y: spawn.y, type: 'arrow' });
    maze.mazeExplored[8][8] = true;
    maze.npcFound = true;
    maze.npcStateObserved = true; // Legacy saves used a case-wide speech flag.
    maze.npcRescued = true;
    maze.phase = 'debrief';
    player.x = maze.npcInitX;
    player.y = maze.npcInitY;
    player.o2 = 0;
    save.saveMazeProgress();
    assert(!('npcStateObserved' in storage.get(save.MAZE_SAVE_KEY).packed.rest));
    storage.get(save.MAZE_SAVE_KEY).packed.rest.npcStateObserved = true;

    logic.resetMazeLogic(); // Reload an actual seed-based save containing death coordinates.
    maze = state.mazeRescue;
    assert.equal(maze.seed, seed);
    assert.equal(player.x, spawn.x);
    assert.equal(player.y, spawn.y);
    assert.equal(state.camera.x, spawn.x);
    assert.equal(state.camera.y, spawn.y);
    assert(maze.mazeExplored[8][8]);
    assert.equal(state.rope.ropes.length, 1);
    assert.equal(state.markers.length, 1);

    // Simulate residual controls and feedback from a failed dive after binding the NPC.
    input.move = 1; input.speedUp = true; touches.joystickId = 42;
    state.manualDrive.activeTouches[42] = {};
    state.manualDrive.kickDrive = 1;
    state.manualDrive.turnVisual = 1;
    state.fishBite = { active: true };
    state.flashlightOn = false;
    state.playerAttack = { active: true, cooldownTimer: 99 };
    state.fx.shake = 12; state.fx.redOverlay = 1;
    state.camera.zoom = 2; state.camera.targetZoom = 2;
    player.welcomeArmsAnim.active = true;
    maze.npcRescueHolding = true; maze.retreatHolding = true;
    maze.npcEncounterNoteAt = now - 9000;
    maze._decoBlockedRescuedWarned = true;
    maze._decoBlockedRescuedSince = now - 9000;
    maze.shoreMapOpen = true; maze.codexOpen = true;
    logic.startMazeDive('scout'); // Menu historically forced scout, even for known NPCs.
    assert.equal(maze.phase, 'tape_rewind');
    assert.equal(maze.npcRescued, false);
    assert.equal(state.npc.state, 'wait');
    assert.equal(input.move, 0); assert.equal(input.speedUp, false);
    assert.equal(touches.joystickId, null);
    assert.deepEqual(state.manualDrive.activeTouches, {});
    assert.equal(state.manualDrive.kickDrive, 0);
    assert.equal(state.manualDrive.turnVisual, 0);
    assert.equal(state.fishBite, null); assert.equal(state.flashlightOn, true);
    assert.equal(state.playerAttack.active, false);
    assert.equal(state.playerAttack.cooldownTimer, 0);
    assert.equal(state.fx.shake, 0); assert.equal(state.fx.redOverlay, 0);
    assert.equal(player.welcomeArmsAnim.active, false);
    assert.equal(maze.npcRescueHolding, false); assert.equal(maze.retreatHolding, false);
    assert.equal(maze.npcEncounterNoteAt, 0);
    assert.equal(maze._decoBlockedRescuedWarned, false);
    assert.equal(maze._decoBlockedRescuedSince, 0);
    assert.equal(maze.shoreMapOpen, false); assert.equal(maze.codexOpen, false);
    assert.equal(player.o2, player.o2Max); assert(player.o2 > 0);
    assert.equal(player.x, spawn.x); assert.equal(player.y, spawn.y);
    assert.equal(state.camera.zoom, 1); assert.equal(state.camera.targetZoom, 1);
    now += 701; logic.updateMaze();
    for (let i = 0; i < 90 + 60; i++) logic.updateMaze();
    assert.equal(maze.phase, 'play');
    logic.updateMaze(); // A stale tether used to drag the player toward the previous death location here.
    assert.equal(player.x, spawn.x); assert.equal(player.y, spawn.y);

    // Legacy observation flags and known NPC positions must not suppress this dive's first speech.
    visible = true;
    logic.updateMaze();
    const firstNote = maze.npcEncounterNoteAt;
    assert.equal(firstNote, now);
    now += 10000; visible = false; logic.updateMaze();
    visible = true; logic.updateMaze();
    assert.equal(maze.npcEncounterNoteAt, firstNote, 'Reentering view during one dive must not repeat speech');
    logic.returnToShore();
    logic.startMazeDive('rescue');
    assert.equal(maze.npcEncounterNoteAt, 0);
    maze.phase = 'play';
    now += 1000; visible = false; logic.updateMaze();
    assert.equal(maze.npcEncounterNoteAt, 0, 'Speech waits for an actual encounter');
    visible = true; logic.updateMaze();
    assert.equal(maze.npcEncounterNoteAt, now, 'The next dive must speak again');
    assert(maze.mazeExplored[8][8]);
    assert.equal(state.rope.ropes.length, 1);
    assert.equal(state.markers.length, 1);

    // Exercise the real menu touch dispatch with real reset/start callbacks.
    const handlers = {};
    global.wx = {
        onTouchStart: fn => { handlers.start = fn; }, onTouchMove: noop,
        onTouchEnd: fn => { handlers.end = fn; }, onTouchCancel: noop,
    };
    const menuRect = { id: 'dive', x: 0, y: 0, w: 100, h: 100, enabled: true };
    const inputModule = compile('core/input', name => {
        if (name === './state') return core;
        if (name === './config') return { CONFIG };
        if (name === '../render/RenderMenu') return { getMenuButtonRects: () => [menuRect] };
        return idleSystems;
    });
    let selectedType;
    inputModule.initInput(noop, noop, logic.resetMazeLogic, noop, kind => {
        selectedType = kind; logic.startMazeDive(kind);
    });
    state.screen = 'menu';
    const touch = { identifier: 1, clientX: 50, clientY: 50 };
    handlers.start({ touches: [touch], changedTouches: [touch] });
    handlers.end({ touches: [], changedTouches: [touch] });
    assert.equal(selectedType, 'rescue');
    assert.equal(state.mazeRescue.phase, 'tape_rewind');
    assert.equal(state.mazeRescue.npcRescued, false);
    assert.equal(player.x, spawn.x); assert.equal(player.y, spawn.y);
    console.log('通过：旧档死亡坐标归位、绑绳后重新下潜无回拉、操作/反馈状态清理、同次发现不重复台词、下次首次发现重播、案件进度保留、主菜单一键下潜触摸流程。');
} finally {
    Date.now = originalNow;
    delete global.wx;
}
