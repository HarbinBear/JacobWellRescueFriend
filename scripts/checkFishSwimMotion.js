// Fixed-step movement/pose contract. This is not a substitute for actual-game animation review.
const fs = require('fs'), path = require('path'), ts = require('typescript'), assert = require('assert/strict');
const ROOT = path.resolve(__dirname, '..'), modules = new Map();
function load(file) {
    file = path.posix.normalize(file);
    if (!fs.existsSync(path.join(ROOT, file + '.ts'))) file += '/index';
    if (modules.has(file)) return modules.get(file).exports;
    const m = { exports: {} }; modules.set(file, m);
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText;
    new Function('module', 'exports', 'require', code)(m, m.exports, name => load(path.posix.join(path.posix.dirname(file), name)));
    return m.exports;
}
const { beginFishSwimStep, finishFishSwimStep, steerFishSwim, getFishSwimMotion } = load('src/logic/FishSwimMotion');
const { buildFishVolumeMesh } = load('src/render/FishVolumeMesh');
const { fishHeadPoint, fishShape } = load('src/logic/FishGeometry');
function fish(overrides = {}) {
    return { kind: 'piranha', x: 0, y: 0, vx: 0, vy: 0, angle: 0, targetAngle: 0,
        state: 'roam', stateTimer: 0, animTime: .37, stunFrames: 0, stunUntil: 0, bound: false, dead: false,
        netGraceFrames: 0, lungeCharge: 0, circleAngle: 0, ...overrides };
}
const pose = f => ({ ...getFishSwimMotion(f) });
function step(f, steering, restrained = false) {
    const before = beginFishSwimStep(f);
    if (steering) steering(f);
    f.x += f.vx; f.y += f.vy; f.animTime += .08; f.stateTimer++;
    finishFishSwimStep(f, before, 1, restrained);
    const result = pose(f);
    for (const [key, value] of Object.entries(result)) assert(Number.isFinite(value), 'Non-finite motion value: ' + key);
    return result;
}
const drive = (heading, speed) => f => steerFishSwim(f, heading, speed, .12);
const forward = fish();
for (let i = 0; i < 90; i++) step(forward, drive(0, 2.5));
const cruising = pose(forward), glideStart = { x: forward.x, speed: Math.hypot(forward.vx, forward.vy) };
assert(cruising.amplitude > 0 && cruising.speed > 0, 'Active swimming must produce motion and tail movement');
for (let i = 0; i < 25; i++) step(forward, drive(0, 0));
const gliding = pose(forward);
assert(forward.x > glideStart.x + 1, 'Releasing propulsion must preserve a visible glide');
assert(Math.hypot(forward.vx, forward.vy) < glideStart.speed, 'Glide must lose speed');
assert(gliding.amplitude < cruising.amplitude, 'Gliding must reduce the powered tail stroke');
assert(gliding.drive < cruising.drive, 'Gliding is low propulsion, even while the fish is moving');

const braking = fish({ vx: 4 });
step(braking, drive(0, .8));
assert(braking.vx > .8 && braking.vx < 4, 'A lower target speed must brake gradually, not clamp momentum away');
for (let i = 0; i < 160; i++) step(braking, drive(0, .8));
assert(braking.vx < 1 && braking.vx > 0, 'Braking must converge to the requested cruise range');

// A long-lived legacy animation clock and abrupt AI labels must not rephase the body.
const changing = fish();
for (let i = 0; i < 30; i++) step(changing, drive(0, 1.8));
const phaseDeltas = [];
for (const state of ['lunge', 'fear', 'inspect', 'flee', 'roam']) {
    const before = pose(changing); changing.state = state; changing.animTime += 1000;
    const after = step(changing, drive(0, state === 'inspect' ? 0 : 2));
    const delta = Math.atan2(Math.sin(after.phase - before.phase), Math.cos(after.phase - before.phase));
    assert(delta > 0 && delta < Math.PI / 2, 'AI transition jumped or reversed the tail phase: ' + state);
    assert(after.clock > before.clock); phaseDeltas.push(delta);
}

const turns = [];
for (const sign of [-1, 1]) {
    const f = fish(); for (let i = 0; i < 70; i++) step(f, drive(0, 2));
    let bend = 0, rate = 0;
    for (let i = 0; i < 10; i++) { const p = step(f, drive(sign * 1.3, 1.5)); if (Math.abs(p.bend) > Math.abs(bend)) { bend = p.bend; rate = p.turnRate; } }
    assert(Math.abs(bend) > .005 && rate * sign > 0, 'Turn must have a measurable signed body response');
    const mesh = buildFishVolumeMesh([f], 0), head = fishHeadPoint(f), shape = fishShape(f);
    assert(mesh.positions.every(Number.isFinite) && mesh.normals.every(Number.isFinite));
    // Check the actual interaction head against the headward visible mesh, in local fish axes.
    const c = Math.cos(f.angle), s = Math.sin(f.angle), front = [];
    for (let i = 0; i < mesh.positions.length; i += 3) {
        const dx = mesh.positions[i] - f.x, dy = mesh.positions[i + 1] - f.y;
        const x = dx * c + dy * s, y = -dx * s + dy * c;
        if (x > shape.head * .65) front.push({ x, y });
    }
    assert(front.length > 10);
    const hx = (head.x - f.x) * c + (head.y - f.y) * s;
    assert(hx >= Math.min(...front.map(p => p.x)) && hx <= Math.max(...front.map(p => p.x)), 'Head anchor left the visible front of the fish');
    assert(Math.min(...front.map(p => p.y)) <= 0 && Math.max(...front.map(p => p.y)) >= 0, 'Body bending moved the whole head off its interaction axis');
    turns.push({ sign, bend, rate });
}
assert(turns[0].bend * turns[1].bend < 0, 'Opposite turns must bend in opposite directions');

const dragged = fish({ bound: true, state: 'bound', vx: 5 });
for (let i = 0; i < 45; i++) step(dragged, null, true);
assert(pose(dragged).drive < .1, 'Being dragged in a net must not be classified as active propulsion');
const beforeRender = JSON.stringify(changing), beforePose = pose(changing);
const a = buildFishVolumeMesh([changing], 0), b = buildFishVolumeMesh([changing], 0);
assert.deepEqual(a.positions, b.positions, 'Repeated rendering changed the pose');
assert.deepEqual(pose(changing), beforePose, 'Rendering advanced the fixed-step animation');
assert.equal(JSON.stringify(changing), beforeRender, 'Rendering mutated simulation state');
assert(!Object.keys(changing).some(key => /swimMotion|motionState/i.test(key)), 'Transient motion must not enter the saved fish object');
const restored = JSON.parse(beforeRender), fallback = pose(restored);
for (const value of Object.values(fallback)) assert(Number.isFinite(value), 'Restored object fallback must be finite');
assert(buildFishVolumeMesh([restored], 0).positions.every(Number.isFinite));
step(restored, drive(0, 1));
console.log(JSON.stringify({ status: 'passed', cruising, gliding, phaseDeltas, turns, dragged: pose(dragged),
    scope: 'Fixed-step motion, phase, head anchor, restraint and rendering purity; desktop CPU only' }, null, 2));
