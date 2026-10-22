const assert = require('assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
const root = path.resolve(__dirname, '../src'), cache = new Map();
let sounds = 0;
function load(file) {
    if (file === 'audio/AudioManager') return { playSFX: () => sounds++ };
    if (cache.has(file)) return cache.get(file);
    if (!fs.existsSync(path.join(root, file + '.ts'))) file += '/index';
    const result = {};
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS }
    }).outputText;
    new Function('exports', 'require', code)(result, name => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name))));
    cache.set(file, result);
    return result;
}
const { CONFIG } = load('core/config');
const { state, input, player, createSemiAutoDriveState } = load('core/state');
const semi = load('logic/SemiAutoDrive');
const originalNow = Date.now;
let now = 10000;
Date.now = () => now;
function setup(stamina, power) {
    CONFIG.driveMode = 'semiAuto';
    state.screen = 'mazeRescue'; state.mazeRescue = { phase: 'play', retreatHolding: false };
    state.rope.hold.active = false; state.fishBite = { active: false };
    state.semiAutoDrive = createSemiAutoDriveState();
    state.semiAutoDrive.remaining = stamina;
    state.semiAutoDrive.lastUpdateAt = now;
    state.semiAutoDrive.inputPower = power;
    input.move = power > 0 ? 1 : 0; input.targetAngle = 0;
    player.vx = player.vy = player.angle = 0;
}
function tick(dt) { now += dt * 1000; semi.processSemiAutoDrive(); }
function near(actual, expected, message) { assert(Math.abs(actual - expected) < 1e-8, message + ': ' + actual + ' != ' + expected); }
try {
    const rates = semi.getSemiAutoEnergyRates();
    for (const fps of [30, 60, 120]) {
        const dt = 1 / fps;
        setup(1, 1);
        for (let i = 0; i < Math.round(CONFIG.semiAutoDrive.sprintDuration * fps); i++) tick(dt);
        near(state.semiAutoDrive.remaining, 0, 'Full-power net sprint duration at ' + fps + 'Hz');
        const soundCount = sounds;
        for (let i = 0; i < fps * 5; i++) {
            tick(dt); assert(state.semiAutoDrive.thrusting);
            near(state.semiAutoDrive.outputPower, rates.sustainablePower, 'Stable empty-tank power');
            near(state.semiAutoDrive.remaining, 0, 'Empty-tank balance');
        }
        assert.equal(sounds, soundCount, 'No repeated depletion sound while holding');
        assert(player.vx > 0, 'Empty tank still propels');
        setup(0, 0);
        for (let i = 0; i < Math.ceil(CONFIG.semiAutoDrive.recoveryDuration * fps); i++) tick(dt);
        near(state.semiAutoDrive.remaining, 1, 'Rest recovery duration at ' + fps + 'Hz');
        setup(.4, rates.sustainablePower);
        for (let i = 0; i < fps * 5; i++) tick(dt);
        near(state.semiAutoDrive.remaining, .4, 'Balanced propulsion preserves reserve');
        for (const power of [0, .3, .7, .9, 1]) {
            setup(.4, power); tick(dt);
            const cost = rates.fullDrain * Math.pow(state.semiAutoDrive.outputPower, rates.exponent) * dt;
            near(state.semiAutoDrive.remaining - .4 + cost, rates.recovery * dt, 'Recovery is constant at every input level');
        }
        setup(1, .3);
        for (let i = 0; i < fps * 10; i++) tick(dt);
        near(state.semiAutoDrive.remaining, 1, 'Light propulsion can remain full indefinitely');
    }
    setup(.001, 1); tick(.1);
    near(state.semiAutoDrive.remaining, 0, 'Last reserve spent without negative energy');
    const power = state.semiAutoDrive.outputPower;
    assert(power > rates.sustainablePower && power < 1, 'Last-reserve frame uses a partial, affordable output');
    near(.1 * rates.fullDrain * Math.pow(power, rates.exponent), .001 + .1 * rates.recovery, 'Boundary-frame energy conservation');
    tick(0); near(state.semiAutoDrive.outputPower, rates.sustainablePower, 'Duplicate timestamps cannot restore peak thrust');
    setup(.4, 1); state.fishBite.active = true; tick(1 / 60);
    assert(!state.semiAutoDrive.thrusting && state.semiAutoDrive.remaining > .4, 'Blocked input stops thrust but not recovery');
    setup(.4, .3); const before = state.semiAutoDrive.remaining; semi.releaseSemiAutoDrive();
    assert.equal(state.semiAutoDrive.remaining, before, 'Release cannot instantly refill');
    console.log('通过：30/60/120Hz 能量守恒、恒定恢复、轻推满槽、平衡力度、4秒冲刺、1.8秒休息恢复、空槽连续动力、边界帧限力、同时间戳防跳变、阻塞恢复及单次提示音。');
} finally { Date.now = originalNow; }
