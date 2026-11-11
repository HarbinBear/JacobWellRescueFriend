// Real fish/rope modules, in-memory object reconstruction. No browser, network or disk saves.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
const root = path.resolve(__dirname, '../src'), cache = new Map(), noop = () => 0;
function load(file) {
    if (file === 'world/continuous/Runtime') return { stepAirFish: () => false, moveContinuousFish: () => null };
    if (file === 'audio/AudioManager') return { playSFX: noop };
    if (file === 'logic/BreathSystem') return { spawnImpactBurst: noop };
    if (file === 'render/Canvas') return { ctx: {}, logicW: 375, logicH: 667 };
    if (cache.has(file)) return cache.get(file);
    if (!fs.existsSync(path.join(root, file + '.ts'))) file += '/index';
    const out = {}; cache.set(file, out);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('exports', 'require', code)(out, name => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name))));
    return out;
}
const core = load('core/state'), { state, player, input } = core, { CONFIG } = load('core/config');
CONFIG.continuousWorld = false;
const fishLogic = load('logic/FishEnemy'), rope = load('logic/Rope'), handling = load('logic/FishHandling');
const clone = value => JSON.parse(JSON.stringify(value)), point = (x, y) => ({ x, y });
const strand = (a, b, threadId) => ({ start: a, end: b, path: [a, b], startWall: null, endWall: null,
    slackFactor: 0, mode: 'tight', threadId });
function mesh(x = 450, y = 610, id = 1) {
    return [...[-30, -15, 0, 15, 30].map((d, i) => strand(point(x - 150, y + d), point(x + 150, y + d), id + i)),
        ...[-40, -20, 0, 20, 40].map((d, i) => strand(point(x + d, y - 75), point(x + d, y + 65), id + i + 5))];
}
function setup() {
    state.screen = 'mazeRescue'; state.rope = core.createRopeState(); state.interaction = core.createInteractionState();
    state.fishBump = core.createFishBumpState(); state.fishEnemies = []; state.fishBite = null; state.flashlightOn = false;
    state.mazeRescue = { seed: 128473, phase: 'play', mazeCols: 100, mazeRows: 100, mazeTileSize: 120,
        mazeMap: Array.from({ length: 100 }, () => Array(100).fill(0)), mazeWalls: [], mazeExplored: [], diveHistory: [],
        caveRockRoom: { x: 0, y: 0, width: 1200, height: 1200 } };
    Object.assign(player, { x: 450, y: 450, vx: 0, vy: 0, angle: 0, o2: 100 });
    input.move = 0; input.speedUp = false; state.manualDrive.activeTouches = {};
    state.rope.ropes = mesh();
}
function radius(fish) { return CONFIG.fishEnemy.size * (fish.kind === 'shoal' ? .18 : fish.kind === 'provoked' ? .64 : fish.kind === 'rammer' ? .48 : .38); }
function step(fish, effort) {
    rope.updateRopeMotion(); const from = point(fish.x, fish.y);
    fish.vx = effort.x; fish.vy = effort.y; fish.x += effort.x; fish.y += effort.y;
    return rope.resolveWovenRopeContact(fish, from, radius(fish), effort, () => true);
}
function catchFish(kind = 'rammer', x = 450, id = 1, partial = false) {
    const fish = fishLogic.createFishEnemy(x - 1, 551, x, 610, 200, kind);
    Object.assign(fish, { worldId: id, angle: Math.PI / 2 }); state.fishEnemies.push(fish);
    for (let i = 0; i < 48; i++) {
        step(fish, point(0, 4.5)); const contact = rope.getRopeContact(fish);
        if (contact?.kind === (partial ? 'glide' : 'snag')) return fish;
    }
    throw Error('Capture failed: ' + kind);
}
function save() {
    const saved = clone({ fish: state.fishEnemies, ropes: state.rope.ropes, fishNet: rope.captureFishNetState() });
    assert(rope.validateFishNetState(saved.fishNet, saved.fish, saved.ropes), 'Every real capture must pass snapshot preflight');
    return saved;
}
function restore(saved, data = saved.fishNet) {
    state.fishEnemies = clone(saved.fish); state.rope = core.createRopeState(); state.rope.ropes = clone(saved.ropes);
    rope.resetRopeMotion(); return rope.restoreFishNetState(data);
}
function view(fish) {
    return clone({ x: fish.x, y: fish.y, vx: fish.vx, vy: fish.vy, contact: rope.getRopeContact(fish),
        posed: state.rope.ropes.map((r, i) => rope.getRopeDeformedPoint(r.path[0], i)), snapshot: rope.captureFishNetState() });
}

// Complete contact state round-trips exactly and produces the same later physics, for every species.
for (const kind of ['curious', 'piranha', 'provoked', 'rammer', 'shoal']) {
    setup(); const original = catchFish(kind);
    for (let i = 0; i < 19; i++) step(original, point(Math.sin(i) * .5, 1));
    assert.equal(rope.getRopeContact(original).kind, 'snag'); assert(!original.bound);
    const saved = save(), before = view(original);
    for (let i = 0; i < 28; i++) step(original, point(Math.cos(i) * .6, .8));
    const uninterrupted = view(original);
    assert.deepEqual(restore(saved), { restored: 1, rejected: 0 });
    const fish = state.fishEnemies[0]; assert.notEqual(fish, original);
    assert.deepEqual(view(fish), before, kind + ': reconstructed references retain the contact and spring');
    assert.deepEqual(rope.restoreFishNetState(saved.fishNet), { restored: 1, rejected: 0 });
    assert.deepEqual(view(fish), before, 'Restoring twice must not duplicate the spring');
    for (let i = 0; i < 28; i++) step(fish, point(Math.cos(i) * .6, .8));
    assert.deepEqual(view(fish), uninterrupted, kind + ': later physics is unchanged by save/resume');
}

// Early entanglement progress and the real release cooldown also survive, without promoting them to a capture.
setup(); let fish = catchFish('curious', 450, 1, true), saved = save();
assert.equal(saved.fishNet.contacts[0].kind, 'glide');
assert.equal(restore(saved).restored, 1); assert.deepEqual(rope.captureFishNetState(), saved.fishNet);
setup(); fish = catchFish();
for (let i = 0; i < 400 && rope.getRopeContact(fish); i++) step(fish, point(1, -1));
assert.equal(rope.getRopeContact(fish), null); saved = save();
assert(saved.fishNet.contacts[0].cooldown > 0);
assert.equal(restore(saved).restored, 1); assert.equal(rope.getRopeContact(state.fishEnemies[0]), null);

// Validate/round-trip every real transition, including partial contact, release and re-entry.
let checkedFrames = 0;
for (const kind of ['curious', 'piranha', 'provoked', 'rammer', 'shoal']) {
    setup(); fish = catchFish(kind, 450, 1, true);
    for (let frame = 0; frame < 420; frame++) {
        step(fish, frame < 30 ? point(0, 4.5) : point(Math.sin(frame * .13), frame < 250 ? 1 : -2));
        const current = save(), before = view(fish);
        assert.deepEqual(restore(current), { restored: current.fishNet.contacts.length, rejected: 0 });
        fish = state.fishEnemies[0]; assert.deepEqual(view(fish), before); checkedFrames++;
    }
}

// Off-screen unbound fish stop driving their spring; saving must not revive an already decayed visual pull.
setup(); fish = catchFish();
for (let frame = 0; frame < 300; frame++) rope.updateRopeMotion();
saved = save(); assert.equal(saved.fishNet.contacts[0].pull.active, false);
const dormant = view(fish); restore(saved); assert.deepEqual(view(state.fishEnemies[0]), dormant);

// The ordinary AI keeps moving and loosening the pocket, rather than freezing a saved visual pose.
setup(); fish = catchFish('curious'); saved = save(); restore(saved); fish = state.fishEnemies[0];
const beforeAI = { x: fish.x, y: fish.y, escape: rope.getRopeContact(fish).escape };
for (let i = 0; i < 24; i++) { rope.updateRopeMotion(); fishLogic.updateAllFishEnemies(1); }
assert.equal(rope.getRopeContact(fish).kind, 'snag');
assert(rope.getRopeContact(fish).escape > beforeAI.escape);
assert(Math.hypot(fish.x - beforeAI.x, fish.y - beforeAI.y) > .01, 'Real AI must still struggle');

// Bound/stunned fish remain physical contacts; removing a whole net cannot resurrect it from a stale record.
setup(); state.rope.ropes = mesh().concat(mesh(850, 610, 101));
fish = catchFish(); const other = catchFish('curious', 850, 2);
handling.stunFish(fish); fish.bound = true; saved = save();
assert.equal(restore(saved).restored, 2); fish = state.fishEnemies[0];
assert(fish.bound && fish.stunFrames > 0); assert.equal(rope.getRopeContact(fish).kind, 'snag');
const plan = rope.getRopeRemoval([{ rope: state.rope.ropes[0], point: point(450, 580) }]);
assert(rope.applyRopeRemoval(plan)); assert.equal(rope.getRopeContact(fish), null);
assert.equal(rope.getRopeContact(state.fishEnemies[1]).kind, 'snag');
assert.deepEqual(rope.captureFishNetState().contacts.map(c => c.fishId), [other.worldId]);
const afterCut = save(); assert.equal(restore(afterCut).restored, 1);
assert.equal(rope.getRopeContact(state.fishEnemies[0]), null);
assert.equal(rope.getRopeContact(state.fishEnemies[1]).kind, 'snag');
const ropeCount = state.rope.ropes.length; rope.restoreFishNetState(saved.fishNet);
assert.equal(state.rope.ropes.length, ropeCount); assert.equal(rope.getRopeContact(state.fishEnemies[0]), null);

// Legacy rope indices without threadId remain supported. Missing old fields never guess a capture from location.
setup(); for (const r of state.rope.ropes) delete r.threadId;
catchFish(); saved = save(); assert.equal(restore(saved).restored, 1);
delete saved.fishNet;
assert.deepEqual(restore(saved), { restored: 0, rejected: 0 }); assert.equal(rope.getRopeContact(state.fishEnemies[0]), null);

// Malformed values, wrong identity/geometry and duplicate references are rejected without mutating bodies or ropes.
setup(); catchFish(); saved = save();
const invalid = [
    s => { s.version = 2; }, s => { s.contacts[0].fishId = 999; }, s => { s.contacts[0].escape = NaN; },
    s => { s.contacts[0].phase = -1; }, s => { s.contacts[0].nx = 0; s.contacts[0].ny = 0; },
    s => { s.contacts[0].surface.x = Infinity; }, s => { s.contacts[0].pull.width = 0; },
    s => { s.contacts[0].fish.threads[0].rope = 999; }, s => { s.contacts[0].fish.threads[0].threadId = 999; },
    s => { s.contacts[0].fish.threads[0].ropeKey = 'wrong'; }, s => { s.contacts[0].fish.threads[0].point.x += 10000; },
    s => { s.contacts[0].fish.threads = [s.contacts[0].fish.threads[0]]; },
    s => { s.contacts[0].fish.threads.push(clone(s.contacts[0].fish.threads[0])); },
    s => { s.contacts.push(clone(s.contacts[0])); }, s => { s.contacts[0] = null; },
];
for (const mutate of invalid) {
    const data = clone(saved.fishNet); mutate(data);
    const live = view(state.fishEnemies[0]);
    assert.equal(rope.validateFishNetState(data, saved.fish, saved.ropes), false);
    assert.deepEqual(view(state.fishEnemies[0]), live, 'Preflight cannot modify active contacts');
    const result = restore(saved, data); assert.equal(result.restored, 0); assert(result.rejected > 0);
    assert.equal(rope.getRopeContact(state.fishEnemies[0]), null); assert.deepEqual(state.fishEnemies, saved.fish);
    assert.deepEqual(state.rope.ropes, saved.ropes);
}
const wrongGeometry = clone(saved); wrongGeometry.ropes[0].path[0].x += 20;
assert.equal(restore(wrongGeometry).restored, 0);
const duplicateFish = clone(saved); duplicateFish.fish.push(clone(duplicateFish.fish[0]));
assert.equal(rope.validateFishNetState(duplicateFish.fishNet, duplicateFish.fish, duplicateFish.ropes), false);
assert.equal(restore(duplicateFish).restored, 0); assert.equal(rope.captureFishNetState().contacts.length, 0);
const missingFish = clone(saved); missingFish.fish = []; assert.equal(restore(missingFish).restored, 0);
const missingNet = clone(saved); missingNet.ropes = []; assert.equal(restore(missingNet).restored, 0);
for (const data of [null, false, 0, [], {}, { version: 1, contacts: null }]) {
    assert.equal(rope.validateFishNetState(data, saved.fish, saved.ropes), false);
}
for (const worldId of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const invalidFish = clone(saved.fish); invalidFish[0].worldId = worldId;
    assert.equal(rope.validateFishNetState(saved.fishNet, invalidFish, saved.ropes), false);
}
assert.equal(rope.validateFishNetState(saved.fishNet, [null], saved.ropes), false);
assert.equal(rope.validateFishNetState(saved.fishNet, saved.fish, [null]), false);
assert.equal(rope.validateFishNetState(saved.fishNet, saved.fish, [{ path: null }]), false);
setup(); fish = catchFish(); fish.dead = true;
saved = save(); assert.equal(saved.fishNet.contacts.length, 0);
assert.deepEqual(restore(saved), { restored: 0, rejected: 0 });
console.log(`通过：五类鱼网捕完整续接、${checkedFrames}帧状态预检与精确续接、后续受力一致、真实AI挣扎、未绑/绑缚/眩晕、部分缠绕和挣脱冷却、独立网拆除、老档兼容、坏引用及重复恢复。`);
