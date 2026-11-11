// Exercise real Runtime + WorldSave + loading HUD with a controlled clock and native storage.
// Terrain, movement, image download and drawing are isolated; no network or disk saves are used.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const compiled = new Map();
const realModules = new Set(['src/world/continuous/Runtime', 'src/world/continuous/WorldSave',
    'src/world/continuous/WorldHUD', 'src/core/SaveStorage']);
const noop = () => {};

function host() {
    const h = { now: 1000, blocked: true, failWrites: false, storage: new Map(), listeners: {}, logs: [], resets: 0 };
    const w = { originX: 0, surfaceY: 200, nextFishId: 1, elapsed: 12, panel: null, hidden: false,
        headWet: true, wet: 1, grounded: false, landBlend: 0, notice: '', noticeUntil: 0, journal: [], events: [] };
    const player = { x: 0, y: 250, vx: 0, vy: 0, o2: 80, o2Max: 100 };
    const state = { screen: 'menu', camera: {}, fishEnemies: [], npc: {}, markers: [], wheel: { open: false },
        semiAutoDrive: { remaining: .8, exhausted: false }, extraction: {}, story2: {},
        rope: { ropes: [], links: [], active: false, current: { start: null, startWall: null, startAttachment: null, path: [] } },
        mazeRescue: { seed: 7, mazeRows: 1, mazeCols: 1, mazeTileSize: 40, mazeMap: [[0]], mazeExplored: [[true]],
            mazeWalls: [], oxygenTanks: [], relics: [] } };
    const geometry = { world: () => w, activeWorld: () => state.screen === 'mazeRescue',
        attachWorldTerrain: m => { m.continuous = w; return w; }, circleCollision: () => false, groundAt: () => 100,
        layout: { version: 1, spawn: [0, 0], footReach: 24, stations: [] } };
    const config = { continuousWorld: true, karst: { geometryMode: 'volume', surfaceMode: 'baseline', style: 'natural' },
        fishEnemy: { size: 12 }, maze: { moveSpeed: 1 }, breath: { o2PerBreathPeak: .2 }, lightRange: 300 };
    const stubs = {
        'src/core/state': { state, player, input: {}, createFishBumpState: () => ({}) },
        'src/core/config': { CONFIG: config },
        'src/world/continuous/Geometry': geometry,
        'src/world/continuous/WorldAssets': { updateWorldAssets: noop, worldAssetsBlocked: () => h.blocked && geometry.activeWorld(),
            worldAssetStatus: () => ({ ready: 0, loading: 0, failed: 9, total: 9 }), retryWorldAssets: async () => {} },
        'src/logic/DriveMode': { resetDriveInput: () => { h.resets++; } },
        'src/logic/CameraLogic': { snapCameraToPlayer: noop },
        'src/logic/Interaction': { resetInteractions: noop, cancelInteractionInput: noop },
        'src/logic/BreathSystem': { resetBreathSystem: noop },
        'src/logic/BCDSystem': { releaseBCDControls: noop, resetBCDSystem: noop, getBCDRuntime: () => ({}) },
        'src/logic/DecompressionSystem': { getDecoRuntime: () => ({}) },
        'src/logic/FishEnemy': { createFishEnemy: (x, y, _hx, _hy, _r, kind) => ({ x, y, kind, stunUntil: 0 }) },
        'src/extraction/logic/Loadout': { getActiveAirTanks: () => ['test-tank'] },
        'src/audio/AdaptiveMusic': { resetAdaptiveMusic: noop },
        'src/render/Canvas': { logicW: 375, logicH: 667 },
    };
    const wx = {
        onHide: fn => { h.listeners.hide = fn; }, onShow: fn => { h.listeners.show = fn; },
        getStorageSync: key => h.storage.get(key) || '',
        setStorageSync: (key, value) => { if (h.failWrites) throw Error('storage full'); h.storage.set(key, value); },
        removeStorageSync: key => h.storage.delete(key),
    };
    const sandbox = vm.createContext({ wx, Date: { now: () => h.now }, performance: { now: () => h.now },
        console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => h.logs.push({ level, args })])) });
    const modules = new Map();
    function load(id) {
        if (!realModules.has(id)) return stubs[id] || {};
        if (modules.has(id)) return modules.get(id).exports;
        const module = { exports: {} }; modules.set(id, module);
        if (!compiled.has(id)) compiled.set(id, ts.transpileModule(fs.readFileSync(path.join(ROOT, id + '.ts'), 'utf8'),
            { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }).outputText);
        vm.runInContext('(function(module,exports,require){' + compiled.get(id) + '\n})', sandbox)(module, module.exports,
            name => load(path.posix.normalize(path.posix.join(path.posix.dirname(id), name))));
        return module.exports;
    }
    h.api = load('src/world/continuous/Runtime');
    h.save = load('src/world/continuous/WorldSave');
    h.hud = load('src/world/continuous/WorldHUD');
    h.w = w; h.state = state; h.player = player;
    h.api.enterContinuousWorld(() => { state.fishEnemies = [{ x: 0, y: 250, kind: 'curious', stunUntil: h.now + 10000 }]; });
    h.fish = state.fishEnemies[0];
    h.saved = () => JSON.parse(h.storage.get(h.save.WORLD_SAVE_KEY));
    h.remaining = () => (h.fish.stunUntil - h.now) / 1000;
    h.wait = milliseconds => { h.now += milliseconds; };
    h.api.updateContinuousWorld();
    h.clickExit = () => {
        const b = h.hud.worldButtons().find(button => button.id === 'asset-exit');
        assert(b, 'Loading screen must expose a return button');
        const event = { changedTouches: [{ identifier: 1, clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 }] };
        assert(h.hud.worldTouchStart(event)); assert(h.hud.worldTouchEnd(event));
    };
    h.drawLoadingText = () => {
        const text = [], c = { fillText: value => text.push(value) };
        for (const method of ['save', 'restore', 'fillRect', 'beginPath', 'arc', 'stroke', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath']) c[method] = noop;
        h.hud.drawWorldAssetLoading(c); return text;
    };
    return h;
}

// Returning from a failed download must save the same simulation state and remaining stun.
{
    const h = host(), elapsed = h.w.elapsed, oxygen = h.player.o2;
    h.wait(6000); h.api.updateContinuousWorld(); h.clickExit();
    assert.equal(h.state.screen, 'menu');
    assert.equal(h.saved().fish[0].stunRemaining, 10, 'Asset wait must not consume saved fish stun');
    assert.equal(h.saved().world.elapsed, elapsed); assert.equal(h.saved().player.o2, oxygen);
    assert(h.resets >= 2, 'Movement input must be released while waiting');
}

// Repeated hide/show cycles save at the paused instant; the eventual resume settles each millisecond once.
{
    const h = host();
    h.wait(3000); h.listeners.hide();
    assert(h.w.hidden); assert.equal(h.saved().fish[0].stunRemaining, 10);
    h.wait(5000); h.api.updateContinuousWorld(); // Hidden frames cannot advance the simulation.
    assert.equal(h.w.elapsed, 12);
    h.listeners.show(); h.api.updateContinuousWorld();
    h.wait(2000); h.listeners.hide(); assert.equal(h.saved().fish[0].stunRemaining, 10);
    h.wait(2000); h.blocked = false; h.listeners.show(); h.api.updateContinuousWorld();
    assert.equal(h.remaining(), 10, 'Hidden time and download time must both be paused');
    const settled = h.fish.stunUntil;
    h.listeners.show(); h.api.updateContinuousWorld(); h.api.updateContinuousWorld();
    assert.equal(h.fish.stunUntil, settled, 'Repeated show/update must not double-count an already settled pause');
    h.wait(500); assert(h.api.exitContinuousWorld());
    assert.equal(h.saved().fish[0].stunRemaining, 9.5, 'The asset pause must end when resources become ready');
}

// A disk failure keeps the world and previous save intact and presents the error on the loading screen.
{
    const h = host(), previous = h.storage.get(h.save.WORLD_SAVE_KEY);
    h.failWrites = true; h.wait(6000); h.clickExit();
    assert.equal(h.state.screen, 'mazeRescue'); assert.equal(h.w.saveOK, false);
    assert.match(h.w.notice, /保存未成功/); assert.equal(h.remaining(), 10);
    assert.equal(h.storage.get(h.save.WORLD_SAVE_KEY), previous, 'A failed exit must preserve the previous save');
    const text = h.drawLoadingText();
    assert(text.includes(h.w.notice), 'Loading screen must display the save error');
    assert(!text.some(line => /进度已保留/.test(line)), 'Loading failure must not claim a successful save');
    h.wait(2000); h.failWrites = false; h.clickExit();
    assert.equal(h.state.screen, 'menu'); assert.equal(h.saved().fish[0].stunRemaining, 10,
        'Retrying a failed save must settle only the additional wait');
}

// Existing navigation pause and asset pause may coexist; their shared duration must not be added twice.
{
    const h = host(); h.api.openWorldNavigation();
    h.wait(6000); h.blocked = false; h.api.updateContinuousWorld();
    assert.equal(h.remaining(), 10);
    h.api.updateContinuousWorld(); assert.equal(h.remaining(), 10);
    h.wait(2000); h.api.closeWorldPanel(); assert.equal(h.remaining(), 10);
    h.api.updateContinuousWorld(); assert.equal(h.remaining(), 10);
}

console.log('World asset pause verified: exit saves, hide/show saves, visible save failure, retry, unchanged oxygen/time and no duplicate pause compensation.');
