const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { load } = require('./adaptiveAudioModules');
const score = load('AdaptiveScore'), { AdaptiveMusicEngine } = load('AdaptiveMusicEngine');
function compile(file, deps) {
    const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file + '.ts'), 'utf8'),
        { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }).outputText;
    new Function('exports', 'require', code)(exports, name => { assert(name in deps, name); return deps[name]; });
    return exports;
}
const visuals = compile('audio/AdaptiveMusicVisuals', { './AdaptiveScore': score });
const close = (a, b, why) => assert(Math.abs(a - b) < 1e-7, why || `${a} != ${b}`);
function clock(level, beats, variant, mood = 'search') {
    const gains = Array(12).fill(0), indices = mood === 'search' ? [0,1,2,3,4,5] : [mood === 'return' ? 7 : 6,8,9,3,10,11];
    indices.forEach((slot, i) => gains[slot] = score.SCORE.levelMixes[level][i]);
    return { playing: true, level, requestedLevel: level, mood, beats, beatPhase: beats % 1, bar: Math.floor(beats / 4) % 8, trackGains: gains, variant };
}
// Every actual note, every variant and score colour, before and after loop wrap.
for (const variant of Object.keys(score.VARIANTS)) for (const mood of ['search', 'found', 'return']) {
    for (const [layer, part, voice] of [[1,'beacon','sonar'],[2,'bass','bass'],[3,'drums','kick'],[4,'arp','drive'],[5,'spark','rush']]) {
        const track = mood === 'search' || part === 'drums' ? part : part + 'Found';
        const notes = score.notesFor(track, variant).filter(n => n.voice === voice);
        for (const note of notes) for (const cycle of [0, 32, 3200]) {
            const v = visuals.sampleTapeVisual(clock(layer, note.beat + cycle + .000001, variant, mood));
            assert(v.lanes[layer].hit > .1, `${variant}/${mood}/${track} onset ${note.beat} lost`);
            assert(v.lanes[layer].age < .00001);
        }
        if (layer === 5) assert.equal(notes.length, 320);
    }
    // At every frame rate that can show 20 events/s, each rush event changes
    // the cell position. Sampling never depends on catching a narrow peak.
    for (const fps of [30, 60, 120]) for (const offset of [0, .003, .017]) {
        const steps = new Set();
        for (let frame = 0; frame < fps * 16; frame++) {
            const seconds = frame / fps + offset;
            if (seconds >= 16) break;
            steps.add(visuals.sampleTapeVisual(clock(5, seconds * 2, variant, mood)).lanes[5].step);
        }
        assert.equal(steps.size, 320, `${variant}/${mood}/${fps}fps lost a rush cell`);
    }
}
// C's drums actually syncopate: there must be no phantom kick at beat 1.
assert(visuals.sampleTapeVisual(clock(3, 1, 'pursuit')).kick < .01);
assert(visuals.sampleTapeVisual(clock(3, 1.5, 'pursuit')).kick > .99);
assert(visuals.sampleTapeVisual(null).lanes.every(l => l.hit === 0 && l.gain === 0));
const silent = clock(5, 12, 'undertow'); silent.playing = false;
assert(visuals.sampleTapeVisual(silent).lanes.every(l => l.hit === 0));

// Real engine scheduling + audible output latency + gain ramps, not fixtures.
const ctx = { currentTime: 10, state: 'running', outputLatency: .08, destination: {},
    createGain: () => ({ gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }),
    createBufferSource: () => ({ start() {}, stop() {}, connect() {}, disconnect() {} }) };
const buffers = Array.from({ length: 6 }, () => ({ duration: 16 })), themes = Array.from({ length: 2 }, () => ({ duration: 16 })), warm = Array.from({ length: 4 }, () => ({ duration: 16 }));
const engine = new AdaptiveMusicEngine(ctx, buffers, themes, warm, undefined, 'pursuit'); engine.start();
ctx.currentTime = 10.13; assert.equal(engine.getClock().playing, false, 'visual waits for the speaker start');
ctx.currentTime = 10.2; engine.setLevel(3);
ctx.currentTime = 10.60;
assert.equal(engine.getClock().level, 0, 'audio rendering ahead of output must not show the new layer early');
ctx.currentTime = 10.643;
const ramp = engine.getClock();
close(ramp.trackGains[3], .5, 'visual gain follows the actual six-millisecond ramp');
close(ramp.seconds, .503); assert.equal(ramp.level, 3); assert.equal(ramp.variant, 'pursuit');
close(ramp.levelAgeSeconds, .003, 'entry blossom age starts at the audible transition');
ctx.currentTime = 10.7; engine.setLevel(4);
ctx.currentTime = 12.15;
assert.equal(engine.getClock().level, 4);
ctx.state = 'suspended'; assert.equal(engine.getClock().playing, false);
ctx.state = 'running'; engine.stop(true); assert.equal(engine.getClock().playing, false);
engine.start(); ctx.currentTime += .15; close(engine.getClock().seconds, .01, 'restart resets transport');
// Timestamp branch takes precedence over latency and gracefully handles unsupported APIs.
ctx.getOutputTimestamp = () => ({ contextTime: ctx.currentTime - .04, performanceTime: performance.now() });
assert(engine.getClock().outputTime > ctx.currentTime - .041 && engine.getClock().outputTime < ctx.currentTime - .035);
ctx.getOutputTimestamp = () => { throw Error('unsupported'); }; close(engine.getClock().outputTime, ctx.currentTime - .08);
engine.dispose();
console.log('通过：A/B/C × 寻找/发现/返程全部实际起音；320个疾奏音符在30/60/120fps逐一可见；切分、循环、增益淡入、输出延迟、暂停与重启。');

// Exercise the actual HUD stationary hold and release with a recording canvas.
const artwork = compile('render/TapeDeckVisual', {});
const resonance = compile('render/TapeResonance', { './TapeDeckVisual': artwork });
const v4 = visuals.sampleTapeVisual(clock(4, 8, 'undertow'));
const v5 = visuals.sampleTapeVisual(clock(5, 8, 'undertow'));
v5.levelAgeSeconds = .28;
const body4 = resonance.sampleTapeBody(v4), body5 = resonance.sampleTapeBody(v5);
assert.equal(body4.bloom, 0, 'fourth layer never gets the fifth-layer blossom');
assert.equal(body5.bloom, 1);
assert(body5.openArms > body4.openArms * 4, 'fifth layer has a clearly different whole-body pose');
assert(body5.scaleY > body4.scaleY && body5.lift > body4.lift * 2);
assert(resonance.sampleTapeBody(v5, true).lift < body5.lift, 'target echo stays subtle');
const neutral = resonance.sampleTapeBody();
assert.deepEqual(resonance.sampleTapeBody({ ...v5, muted: true }), neutral);
assert.deepEqual(resonance.sampleTapeBody({ ...v5, playing: false }), neutral);
assert.equal(resonance.tapeRushMarks(v4).length, 0);
assert.equal(resonance.tapeRushMarks({ ...v5, muted: true }).length, 0);
assert.equal(resonance.tapeRushMarks({ ...v5, levelAgeSeconds: .04 }).length, 1, 'entry does not invent notes before the layer started');
for (const fps of [15, 30, 60, 120]) {
    let previous = null;
    for (let frame = 0; frame < fps * 32; frame++) {
        const v = visuals.sampleTapeVisual(clock(5, frame / fps * 2 + 32, 'pursuit', 'found'));
        const marks = resonance.tapeRushMarks(v);
        assert(marks.length > 0 && marks.length <= 8, 'bounded current-time marks, never a queued backlog');
        assert.equal(marks[0].step, v.lanes[5].step);
        assert(marks.every(m => m.alpha >= 0 && m.alpha <= 1 && Number.isFinite(m.radius)));
        if (previous !== null) {
            // At 15fps some notes fall between frames; every skipped mark is
            // still present in the deterministic trail on the next frame.
            for (let step = previous + 1; step <= marks[0].step; step++) assert(marks.some(m => m.step === step));
        }
        previous = marks[0].step;
    }
}
let fieldCalls = 0;
const fieldContext = new Proxy({ globalAlpha: 1, createRadialGradient: () => ({ addColorStop() {} }) }, {
    get: (target, key) => key in target ? target[key] : (...args) => {
        fieldCalls++;
        for (const arg of args) if (typeof arg === 'number') assert(Number.isFinite(arg), key + ' non-finite draw');
    },
    set(target, key, value) { if (key === 'globalAlpha') assert(value >= 0 && value <= 1); target[key] = value; return true; },
});
resonance.drawTapeResonanceField(fieldContext, 0, 0, 0, { ...v5, muted: true });
assert.equal(fieldCalls, 0, 'muted music must not retain a strong field');
for (const v of [v4, v5, { ...v5, levelAgeSeconds: .9 }]) {
    resonance.drawTapeResonanceField(fieldContext, 0, 0, 0, v);
    resonance.drawTapeResonanceField(fieldContext, 25, 30, 1, v, true);
}
console.log('通过：五级全身姿态明显展开、目标轻呼应、15/30/60/120fps音符尾迹追帧、停止/静音清场、绘制坐标与透明度有效。');
const context = new Proxy({ measureText: text => ({ width: text.length * 7 }), createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }), globalAlpha: 1 }, { get(target, key) { return key in target ? target[key] : () => {}; } });
const CONFIG = { ...compile('core/config/gameplay', {}).gameplayConfig, ...compile('core/config/character', {}).characterConfig };
const state = { audio: { muted: false }, mazeRescue: { phase: 'play', mazeTileSize: 120 } }, player = { o2: 80, o2Max: 100, y: 600 };
let sleeves = 0, calls = 0, tapes = 0, time = 1000;
const originalNow = Date.now; Date.now = () => time;
try {
    const hud = compile('render/HUDTopLeft', {
        '../core/config': { CONFIG }, '../core/state': { state, player }, './Canvas': { ctx: context, logicW: 375, logicH: 667 },
        './TapeDeckVisual': { ...artwork,
            drawTapeDeck: (...args) => { tapes++; artwork.drawTapeDeck(...args); },
            drawTapeMixStrip: () => { throw Error('Default sidebar blocks the view'); },
            drawTapeSleeve: (...args) => { sleeves++; artwork.drawTapeSleeve(...args); } },
        './RescueTape': { getRescueTapeVisual: () => visuals.sampleTapeVisual(clock(5, 8, 'undertow')) },
        './RenderAudioToggle': { drawAudioIcon() {}, toggleMuted() {} }, '../gm/GMPanel': { toggleGMOpen() {}, isGMOpen: () => false },
        '../logic/BreathSystem': { getBreathPhaseAngle: () => 0, getBreathPhase: () => 'inhale', getBreathPressure: () => 0, getLungVolume: () => .5 },
        '../audio/AudioManager': { playSFX: () => { calls++; } }, '../extraction/logic/Loadout': { getActiveAirTanks: () => [] },
        '../logic/DecompressionSystem': { getDecoRuntime: () => ({ nitrogenLoad: 0 }), getDecoLevel: () => 0,
            getCurrentStopInfo: () => null, isDecompressionRequired: () => false, isDecoLockActive: () => false,
            setDecoBoost() {}, getCurrentDepthMeters: () => 5 },
    });
    hud.initMazeHUDTopLeft();
    hud.drawHUDTopLeft(0);
    assert.equal(tapes, 1); assert.equal(sleeves, 0, 'default HUD shows only the tape, no sleeve');
    // No deco slot: oxygen95, depth168, drive230, audio292, tape360.
    assert(hud.handleHUDTouchStart(1, 46, 360)); time += 300;
    hud.drawHUDTopLeft(0); assert.equal(sleeves, 1, 'stationary hold opens detail without touchmove');
    hud.handleHUDTouchEnd(1, 46, 360); hud.drawHUDTopLeft(0); assert.equal(sleeves, 1, 'release closes detail');
    assert.equal(calls, 0, 'long hold does not also tap');
    hud.handleHUDTouchStart(2, 46, 360); time += 50; hud.handleHUDTouchEnd(2, 46, 360); assert.equal(calls, 1);
} finally { Date.now = originalNow; }
console.log('通过：默认仅磁带、真实HUD静止长按展开、松手关闭、短按提示。');

// Keep the earliest narrative a clue, not an explanation of the voice's source.
const firstNight = compile('story/scripts/night_01_arrival', {}).night_01_arrival;
assert(firstNight.nodes.some(n => n.speaker === 'narration' && n.text.includes('怎么也找不到')));
assert(!firstNight.nodes.some(n => /心声|心里的声音|声音来自|被救.*声音/.test(n.text || '')));
