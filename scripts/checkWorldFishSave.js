// Real GM creation, WorldSave, SaveStorage, Rope/RopeDynamics and FishIdentity.
// Storage stays in memory; audio/drawing and the continuous movement loop are isolated.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
const root = path.resolve(__dirname, '../src'), cache = new Map(), storage = new Map(), noop = () => {};
const clone = value => JSON.parse(JSON.stringify(value)), point = (x, y) => ({ x, y });
const originalWx = global.wx, originalNow = Date.now;
let now = 100000, failKey = null;
global.wx = {
    setStorageSync(key, value) { if (key === failKey) throw new Error('test storage full'); storage.set(key, value); },
    getStorageSync: key => storage.get(key) || '', removeStorageSync: key => storage.delete(key),
};
Date.now = () => now;
function load(file) {
    if (file === 'world/continuous/Runtime') return { stepAirFish: () => false, moveContinuousFish: () => null, isBootingWorld: () => false };
    if (file === 'audio/AudioManager') return { playSFX: noop };
    if (file === 'logic/BreathSystem') return { spawnImpactBurst: noop };
    if (file === 'render/Canvas') return { ctx: {}, logicW: 375, logicH: 667 };
    if (file === 'gm/GMRender' || file === 'render/QualityManager') return {};
    if (cache.has(file)) return cache.get(file);
    if (!fs.existsSync(path.join(root, file + '.ts'))) file += '/index';
    const out = {}; cache.set(file, out);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('exports', 'require', code)(out, name => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name))));
    return out;
}
try {
    const core = load('core/state'), { state, player } = core, { CONFIG } = load('core/config');
    const geometry = load('world/continuous/Geometry'), identity = load('world/continuous/FishIdentity');
    const fishLogic = load('logic/FishEnemy'), rope = load('logic/Rope'), save = load('world/continuous/WorldSave');
    const gm = load('gm/GMPanel'), gmConfig = load('gm/GMConfig');
    CONFIG.continuousWorld = true;
    state.screen = 'mazeRescue'; state.rope = core.createRopeState(); state.interaction = core.createInteractionState();
    state.fishEnemies = []; state.fishBump = core.createFishBumpState();
    state.extraction = load('extraction/core/ExtractionState').getInitialExtractionState();
    state.mazeRescue = { seed: 128473, phase: 'play', mazeRows: 20, mazeCols: 20, mazeTileSize: 120,
        mazeMap: Array.from({ length: 20 }, () => Array(20).fill(0)),
        mazeExplored: Array.from({ length: 20 }, () => Array(20).fill(false)), mazeWalls: [], oxygenTanks: [], relics: [], playerPath: [],
        continuous: { originX: 450, surfaceY: 100, seamY: 100, banks: [], boundaries: [], nextFishId: 1,
            elapsed: 12, chapterStatus: 'searching', walkPhase: 0, facing: 1, wet: 1, headWet: true,
            grounded: false, landBlend: 0, airTanks: ['airTankS'], journal: [], resting: false,
            panel: null, pendingAction: null, actionTime: 0, hidden: false, notice: '', noticeUntil: 0 },
    };
    Object.assign(player, { x: 450, y: 450, vx: 0, vy: 0, angle: 0, o2: 80, o2Max: 120 });
    const w = geometry.world();

    // Create a fish through the actual GM button, then commit a fish-to-player tether.
    gm.toggleGMOpen();
    const panel = gm.getGMState(), tab = gmConfig.TABS[panel.activeTab];
    const row = tab.items.findIndex(item => item.actionId === 'spawnCuriousFish');
    assert(row >= 0);
    const tx = panel.panelX + gmConfig.PANEL_W - 30;
    const ty = panel.panelY + gmConfig.DRAG_BAR_H + gmConfig.TAB_H + 2 + gmConfig.ITEM_PAD + row * gmConfig.ITEM_H + 8;
    assert(gm.handleGMTouchStart(tx, ty)); assert(gm.handleGMTouchEnd(tx, ty));
    assert.equal(state.fishEnemies.length, 1);
    const gmFish = state.fishEnemies[0]; assert(identity.isFishWorldId(gmFish.worldId));
    gmFish.bound = true; gmFish.stunUntil = now + 6000;
    assert(rope.placeRopeAt({ fish: gmFish, point: point(gmFish.x, gmFish.y) }));
    assert(rope.placeRopeAt({ self: true, point: point(player.x, player.y) }));
    assert.equal(state.rope.links[0].start.fish, gmFish);
    // Also preserve an unfinished rope whose start references this same fish.
    assert(rope.placeRopeAt({ fish: gmFish, point: point(gmFish.x, gmFish.y) }));

    // One real net capture proves the WorldSave integration, while the dedicated
    // checkFishNetSave test covers all species and subsequent capture physics.
    const strand = (a, b, threadId) => ({ start: a, end: b, path: [a, b], startWall: null, endWall: null,
        slackFactor: 0, mode: 'tight', threadId });
    state.rope.ropes = [...[-30, -15, 0, 15, 30].map((d, i) => strand(point(300, 610 + d), point(600, 610 + d), i + 1)),
        ...[-40, -20, 0, 20, 40].map((d, i) => strand(point(450 + d, 535), point(450 + d, 675), i + 6))];
    const trapped = fishLogic.createFishEnemy(449, 551, 450, 610, 200, 'rammer');
    identity.registerContinuousFish([trapped]); state.fishEnemies.push(trapped); trapped.angle = Math.PI / 2;
    for (let i = 0; i < 48 && rope.getRopeContact(trapped)?.kind !== 'snag'; i++) {
        rope.updateRopeMotion(); const from = point(trapped.x, trapped.y);
        trapped.vx = 0; trapped.vy = 4.5; trapped.y += 4.5;
        rope.resolveWovenRopeContact(trapped, from, CONFIG.fishEnemy.size * .48, point(0, 4.5), () => true);
    }
    assert.equal(rope.getRopeContact(trapped)?.kind, 'snag');
    const contact = clone(rope.getRopeContact(trapped));
    assert(save.saveWorldProgress());
    const snapshot = save.readWorldSnapshot(); assert(snapshot && save.validSnapshot(snapshot));
    assert.equal(snapshot.fishNet.contacts.length, 1, 'WorldSave must include actual net contact');
    assert.equal(snapshot.links[0].start.fish, gmFish.worldId);
    assert.equal(snapshot.current.startAttachment.fish, gmFish.worldId);
    const originalFish = state.fishEnemies.slice();
    now += 60000; state.fishEnemies = []; state.rope = core.createRopeState();
    save.restoreWorld(snapshot);
    const restoredGM = state.fishEnemies.find(f => f.worldId === gmFish.worldId);
    const restoredTrapped = state.fishEnemies.find(f => f.worldId === trapped.worldId);
    assert(restoredGM && restoredTrapped); assert(!originalFish.includes(restoredGM));
    assert.equal(state.rope.links[0].start.fish, restoredGM, 'Tether must bind the restored object, not an old object');
    assert.equal(state.rope.current.startAttachment.fish, restoredGM);
    assert(restoredGM.bound); assert.equal(restoredGM.stunUntil - now, 6000, 'Offline time must not consume stun');
    assert.deepEqual(rope.getRopeContact(restoredTrapped), contact);
    assert.deepEqual(rope.captureFishNetState(), snapshot.fishNet);
    assert(w.nextFishId > Math.max(...state.fishEnemies.map(f => f.worldId)));
    const valid = clone(save.captureWorld());

    // Legacy free fish had no IDs or fishNet; restore repairs identity without
    // guessing that location inside a net implies an existing capture.
    const legacy = clone(valid); delete legacy.fishNet;
    legacy.fish = [clone(valid.fish[0])]; delete legacy.fish[0].worldId; legacy.fish[0].bound = false;
    legacy.links = []; legacy.current = { start: null, startWall: -1, startAttachment: null, path: [], slackFactor: 1, time: 0 };
    legacy.ropeActive = false; legacy.world.nextFishId = 1;
    assert(save.validSnapshot(legacy)); save.restoreWorld(legacy);
    assert(identity.isFishWorldId(state.fishEnemies[0].worldId));
    assert(w.nextFishId > state.fishEnemies[0].worldId);
    assert.equal(rope.getRopeContact(state.fishEnemies[0]), null);
    save.restoreWorld(valid);

    // Corruption must be rejected before changing live state, and the reader must
    // select the complete good backup rather than partially restoring a bad primary.
    const mutations = [
        ['duplicate fish IDs', s => { s.fish[1].worldId = s.fish[0].worldId; }],
        ['missing tether fish', s => { s.links[0].start.fish = 99999; }],
        ['missing active-rope fish', s => { s.current.startAttachment.fish = 99999; }],
        ['invalid fishNet version', s => { s.fishNet.version = 2; }],
        ['missing net fish', s => { s.fishNet.contacts[0].fishId = 99999; }],
        ['invalid net phase', s => { s.fishNet.contacts[0].phase = -1; }],
        ['wrong net rope fingerprint', s => { s.fishNet.contacts[0].fish.threads[0].ropeKey = 'wrong'; }],
    ];
    for (const [label, mutate] of mutations) {
        const bad = clone(valid); mutate(bad);
        storage.set(save.WORLD_SAVE_KEY, JSON.stringify(bad)); storage.set(save.WORLD_BACKUP_KEY, JSON.stringify(valid));
        const live = clone(save.captureWorld());
        assert.equal(save.validSnapshot(bad), false, label + ' must fail preflight');
        assert.throws(() => save.restoreWorld(bad), undefined, label + ' must not partially restore');
        assert.deepEqual(clone(save.captureWorld()), live, label + ' validation must leave the live world unchanged');
        const selected = save.readWorldSnapshot(); assert.deepEqual(selected, valid, label + ' must use backup');
        save.restoreWorld(selected);
        assert.equal(state.rope.links[0].start.fish, state.fishEnemies.find(f => f.worldId === gmFish.worldId));
        assert.equal(rope.getRopeContact(state.fishEnemies.find(f => f.worldId === trapped.worldId)).kind, 'snag');
    }

    // A structurally valid primary with incomplete exploration data must never
    // replace the good backup, even if writing the new primary then fails.
    const damagedMap = clone(valid); damagedMap.explored = [-1];
    storage.set(save.WORLD_SAVE_KEY, JSON.stringify(damagedMap));
    storage.set(save.WORLD_BACKUP_KEY, JSON.stringify(valid));
    assert.deepEqual(save.readWorldSnapshot(), valid, 'Incomplete exploration must select the good backup');
    const goodBackup = storage.get(save.WORLD_BACKUP_KEY);
    failKey = save.WORLD_SAVE_KEY;
    assert.equal(save.saveWorldProgress(), false);
    assert.equal(storage.get(save.WORLD_BACKUP_KEY), goodBackup, 'A damaged primary must not overwrite the good backup');
    assert.deepEqual(save.readWorldSnapshot(), valid, 'The good backup must survive the subsequent primary-write failure');
    failKey = null;

    // Both backup-write and primary-write failures retain the previous primary.
    for (const failed of [save.WORLD_BACKUP_KEY, save.WORLD_SAVE_KEY]) {
        storage.set(save.WORLD_SAVE_KEY, JSON.stringify(valid)); storage.set(save.WORLD_BACKUP_KEY, JSON.stringify(valid));
        const oldPrimary = storage.get(save.WORLD_SAVE_KEY);
        player.x += 3; now += 1000; failKey = failed;
        assert.equal(save.saveWorldProgress(), false); assert.equal(w.saveOK, false);
        assert.equal(storage.get(save.WORLD_SAVE_KEY), oldPrimary, 'A failed write must not delete the previous primary');
        assert.deepEqual(save.readWorldSnapshot(), valid);
        failKey = null; assert(save.saveWorldProgress());
        assert.equal(save.readWorldSnapshot().player.x, player.x);
    }

    // Invalid live graph must never replace a good snapshot during autosave.
    const beforeBadSave = storage.get(save.WORLD_SAVE_KEY);
    state.rope.links[0].start.fish = { worldId: 99999, x: 0, y: 0 };
    assert.equal(save.saveWorldProgress(), false);
    assert.equal(storage.get(save.WORLD_SAVE_KEY), beforeBadSave);
    console.log('通过：真实GM鱼与腰绳/活动绳续档、网捕存续、旧自由鱼补ID、坏主档回退备份、预检不动现场、写失败保留原快照。');
} finally {
    Date.now = originalNow;
    if (originalWx === undefined) delete global.wx; else global.wx = originalWx;
}
