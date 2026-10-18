const assert = require('assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
function compile(file, deps) {
    const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file + '.ts'), 'utf8'),
        { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }).outputText;
    new Function('exports', 'require', code)(exports, name => { assert(name in deps, 'Missing ' + name); return deps[name]; });
    return exports;
}
const physics = compile('logic/RescueRagdoll', {});
const state = { mazeRescue: { npcStunned: true, npcRescued: false }, npc: { active: true, x: 0, y: 0, vx: 0, vy: 0, angle: 0 } };
const player = { x: 500, y: 0, vx: 0, vy: 0, angle: 0 };
let wall = false;
const CONFIG = { maze: { npcTetherIdealDist: 70, npcTetherMaxDist: 220 } };
const tow = compile('logic/RescueTow', {
    '../core/config': { CONFIG }, '../core/state': { state, player }, './RescueRagdoll': physics,
    './Collision': { checkMazeCollision: x => wall && x > 3 && x < 175 },
});
// No rope means no self-propulsion, even with a distant diver.
for (let i = 0; i < 90; i++) tow.updateRescueTow();
assert.equal(state.npc.x, 0); assert.equal(state.npc.y, 0);
state.mazeRescue.npcRescued = true;
player.x = 170;
for (let i = 0; i < 12; i++) tow.updateRescueTow();
assert(state.npc.x > 0); assert(state.npc.vx > 0, 'Rope stretch pulls the casualty');
const initial = physics.getRescueLimpPose(state.mazeRescue.rescueRagdoll);
player.x = state.npc.x + 60; // Slack after a sudden stop: momentum persists and decays.
const v = state.npc.vx;
tow.updateRescueTow();
assert(state.npc.vx > 0 && state.npc.vx < v);
for (let i = 0; i < 30; i++) { player.x = state.npc.x + 60; tow.updateRescueTow(); }
const afterStop = physics.getRescueLimpPose(state.mazeRescue.rescueRagdoll);
assert(Object.keys(initial).some(k => Math.abs(initial[k] - afterStop[k]) > .1), 'Inertial joints continue moving after a stop');
const root = state.npc;
root.vx = root.vy = 0; player.x = root.x + 60;
for (let i = 0; i < 1200; i++) tow.updateRescueTow();
assert(state.mazeRescue.rescueRagdoll.joints.every(j => Math.abs(j.velocity) < .01), 'At rest joints settle, rather than secretly swimming on a clock');
const r = physics.createRescueRagdoll();
let angle = 0;
for (let i = 0; i < 1800; i++) {
    const vx = i % 120 < 60 ? 9 : -9, vy = i % 80 < 40 ? 7 : -7;
    angle = physics.stepRescueRagdoll(r, angle, vx, vy, Math.atan2(vy, vx));
    assert(Number.isFinite(angle));
    assert(r.joints.every(j => Number.isFinite(j.angle) && Number.isFinite(j.velocity) && Math.abs(j.velocity) <= 8));
}
assert(Math.abs(r.joints[0].angle - r.joints[1].angle) > .1, 'Upper and lower segments have independent joints');
root.x = root.y = root.vx = root.vy = 0; player.x = 500; player.y = 0;
wall = true;
for (let i = 0; i < 60; i++) tow.updateRescueTow();
assert(root.x <= 3, 'A taut rope cannot pull the casualty through rock');
assert(player.x < 500, 'When rock blocks the casualty the diver feels the rope');
wall = false;
player.x = root.x + 500;
tow.updateRescueTow();
assert(Math.hypot(player.x - root.x, player.y - root.y) <= CONFIG.maze.npcTetherMaxDist + 1e-6);
player.x = root.x; player.y = root.y;
tow.updateRescueTow();
assert(Math.hypot(player.x - root.x, player.y - root.y) >= 44 - 1e-6, 'Slack rope does not merge both bodies into one silhouette');
// Rendering consumes the physics pose directly and ignores the music dance while limp.
let motion;
const target = compile('render/RenderRescueTarget', {
    '../core/state': { state }, '../logic/RescueRagdoll': physics,
    './RenderDiver': { drawDiver: (...args) => { motion = args[5]; } },
    './RescueDance': { sampleRescueDance() { throw Error('A stunned NPC must not dance'); } },
});
target.drawRescueTarget({ globalAlpha: 1, save() {}, restore() {} }, { playing: true, beats: 99 });
assert(motion.limpPose); assert.equal(motion.dancePose, undefined);
const pcm = fs.readFileSync(path.join(__dirname, '../audio/rescue-bonk.wav'));
assert.equal(pcm.toString('ascii', 0, 4), 'RIFF');
assert(pcm.length < 30000, 'The bonk stays a small local asset');
let peak = 0;
for (let i = 44; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
assert(peak > 1000 && peak < 32767, 'The bonk is audible without clipping');
console.log('通过：未绑绳无主动游动、弹性拖行、急停惯性、独立关节与静止收敛、高速转弯稳定、岩石阻挡与绳长约束、渲染使用瘫软姿态、本地敲晕音效。');
