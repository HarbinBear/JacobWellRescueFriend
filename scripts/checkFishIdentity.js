// Exercise actual GM touch/action dispatch, config, fish factories and ID allocation.
// Drawing, unrelated game systems and terrain collision are isolated; no user save is read.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
const ROOT = path.resolve(__dirname, '..'), cache = new Map(), noop = () => {};
const realModules = new Set(['src/gm/GMPanel', 'src/gm/GMConfig', 'src/logic/FishEnemy', 'src/world/continuous/FishIdentity']);
const state = { screen: 'mazeRescue', fishEnemies: [], map: [], mazeRescue: {
    phase: 'play', continuous: { nextFishId: 1 }, mazeRows: 20, mazeCols: 20, mazeTileSize: 120,
    mazeMap: Array.from({ length: 20 }, () => Array(20).fill(0)),
} };
const player = { x: 600, y: 600, angle: 0 };
const CONFIG = { fishEnemy: { circleRadius: 90 }, maze: { denRadius: 600, playerRadius: 20, wallThickness: 2 },
    tileSize: 120, playerRadius: 20, screenWidth: 375, screenHeight: 667 };
const stubs = {
    'src/core/state': { state, player }, 'src/core/config': { CONFIG },
    'src/render/Canvas': { logicW: 375, logicH: 667 },
    'src/world/continuous/Geometry': { activeWorld: () => state.screen === 'mazeRescue' && !!state.mazeRescue?.continuous,
        world: () => state.mazeRescue?.continuous || null, circleCollision: () => false },
    'src/world/Visibility': { isLineOfSight: () => true },
    'src/audio/AudioManager': { playSFX: noop },
};
function load(id) {
    if (!realModules.has(id)) return stubs[id] || {};
    if (cache.has(id)) return cache.get(id);
    const exports = {}; cache.set(id, exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, id + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('exports', 'require', code)(exports, name => load(path.posix.normalize(path.posix.join(path.posix.dirname(id), name))));
    return exports;
}
const gm = load('src/gm/GMPanel'), config = load('src/gm/GMConfig');
const factory = load('src/logic/FishEnemy'), identity = load('src/world/continuous/FishIdentity');
gm.toggleGMOpen();
function clickAction(actionId) {
    const panel = gm.getGMState(), tab = config.TABS[panel.activeTab];
    const index = tab.items.findIndex(item => item.type === 'action' && item.actionId === actionId);
    assert(index >= 0, 'Fish actions must be reachable on the initial GM tab');
    const x = panel.panelX + config.PANEL_W - 30;
    const y = panel.panelY + config.DRAG_BAR_H + config.TAB_H + 2 + config.ITEM_PAD + index * config.ITEM_H + 8;
    assert(y < panel.panelY + config.PANEL_H, actionId + ' must be visible');
    assert(gm.handleGMTouchStart(x, y)); assert(gm.handleGMTouchEnd(x, y));
}
function spawn(action, expectedKind, count) {
    const before = state.fishEnemies.length;
    clickAction(action);
    const created = state.fishEnemies.slice(before);
    assert.equal(created.length, count, action + ' must invoke the real factory');
    assert(created.every(f => f.kind === expectedKind && f.state === 'roam' && !f.dead));
    return created;
}

// A stale saved counter must not collide with existing IDs or rewrite them.
const oldA = Object.assign(factory.createFishEnemy(100, 100), { worldId: 23 });
const oldB = Object.assign(factory.createFishEnemy(200, 100), { worldId: 41 });
state.fishEnemies.push(oldA, oldB);
const savedOld = JSON.stringify(state.fishEnemies), counter = state.mazeRescue.continuous;
const rammer = spawn('spawnRammerFish', 'rammer', 1)[0];
assert.equal(rammer.worldId, 42); assert.equal(counter.nextFishId, 43);
assert.equal(JSON.stringify(state.fishEnemies.slice(0, 2)), savedOld);
spawn('spawnCuriousFish', 'curious', 1);
const school = spawn('spawnFishSchool', 'shoal', 7);
assert.equal(new Set(school.map(f => f.schoolId)).size, 1, 'School membership must remain unchanged');
assert.equal(new Set(school.map(f => f.worldId)).size, 7, 'Each school member needs its own world identity');
spawn('spawnMazeFish', 'piranha', 1); spawn('spawnProvokedFish', 'provoked', 1);
const ids = state.fishEnemies.map(f => f.worldId);
assert(ids.every(identity.isFishWorldId)); assert.equal(new Set(ids).size, ids.length);
assert(counter.nextFishId > Math.max(...ids));

// Re-registering an already published batch preserves IDs and the counter.
const priorNext = counter.nextFishId;
assert.equal(identity.registerContinuousFish(school), school);
assert.deepEqual(state.fishEnemies.map(f => f.worldId), ids); assert.equal(counter.nextFishId, priorNext);

// Reloaded counter/identities and removed entities cannot cause IDs to be reused.
state.fishEnemies = JSON.parse(JSON.stringify(state.fishEnemies));
state.mazeRescue.continuous = JSON.parse(JSON.stringify(counter));
spawn('spawnCuriousFish', 'curious', 1);
const nextAfterRestore = state.mazeRescue.continuous.nextFishId;
clickAction('removeAllFish'); assert.equal(state.fishEnemies.length, 0);
assert.equal(spawn('spawnCuriousFish', 'curious', 1)[0].worldId, nextAfterRestore);

// In legacy maze and arena modes the same GM creation path must add no worldId.
const inactiveCounter = state.mazeRescue.continuous;
state.mazeRescue.continuous = null; state.fishEnemies = [];
assert(!Object.hasOwn(spawn('spawnCuriousFish', 'curious', 1)[0], 'worldId'));
assert(spawn('spawnFishSchool', 'shoal', 7).every(f => !Object.hasOwn(f, 'worldId')));
state.mazeRescue.continuous = inactiveCounter; state.screen = 'fishArena';
const inactiveNext = inactiveCounter.nextFishId;
assert(!Object.hasOwn(spawn('spawnMazeFish', 'piranha', 1)[0], 'worldId'));
assert.equal(inactiveCounter.nextFishId, inactiveNext);

// The shared allocator repairs missing/invalid IDs atomically, preserving valid saved IDs.
const repaired = [{ worldId: 100 }, {}, { worldId: 0 }, { worldId: NaN }, { worldId: -1 }, { worldId: 1.5 }];
const repairedCounter = { nextFishId: NaN };
identity.ensureFishIdentities(repaired, repairedCounter);
assert.deepEqual(repaired.map(f => f.worldId), [100, 101, 102, 103, 104, 105]);
assert.equal(repairedCounter.nextFishId, 106);
const duplicate = [{ worldId: 7 }, {}, { worldId: 7 }], duplicateCounter = { nextFishId: 1 };
assert.throws(() => identity.ensureFishIdentities(duplicate, duplicateCounter), /重复/);
assert(!Object.hasOwn(duplicate[1], 'worldId')); assert.equal(duplicateCounter.nextFishId, 1);
const overflow = [{}, {}], overflowCounter = { nextFishId: Number.MAX_SAFE_INTEGER - 1 };
assert.throws(() => identity.ensureFishIdentities(overflow, overflowCounter), /安全整数/);
assert(overflow.every(f => !Object.hasOwn(f, 'worldId')));
assert.equal(overflowCounter.nextFishId, Number.MAX_SAFE_INTEGER - 1);

console.log('Fish identity verified: real GM actions/factories, distinct school IDs, stable saved IDs, stale-counter repair, no reuse, unchanged legacy modes and atomic rejection.');
