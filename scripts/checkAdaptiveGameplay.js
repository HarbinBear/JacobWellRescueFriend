const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { load } = require('./adaptiveAudioModules');

function compile(file, dependencies) {
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file + '.ts'), 'utf8'),
        { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {};
    new Function('exports', 'require', code)(exports, name => {
        assert(name in dependencies, 'Missing dependency ' + name);
        return dependencies[name];
    });
    return exports;
}

async function check() {
    const CONFIG = { lifeDetector: { enabled: true, music: {
        enabled: true, variant: 'undertow', eventCues: true, cueVolume: 0.8, volume: 0.78, hysteresis: 0.03,
    } }, audio: { bgmVolume: 1, sfxVolume: 1 }, maze: { npcRescueRange: 80 }, lightRange: 400, fov: 90,
        bShowNpcFlashLight: false };
    const state = { screen: 'mazeRescue', audio: { muted: false },
        mazeRescue: { phase: 'play', npcRescued: false, npcFound: true, mazeTileSize: 80,
            mazeMap: Array.from({ length: 20 }, () => Array(10).fill(0)), mazeWalls: [] },
        npc: { active: true, x: 100, y: 1000 }, flashlightOn: true,
        camera: { x: 50, y: 1000, zoom: 1, swayX: 0, swayY: 0 } };
    const player = { x: 0, y: 1000, angle: 0 };
    const baseDeps = { '../core/config': { CONFIG }, '../core/state': { state, player } };
    const perception = compile('logic/NPCPerception', { '../core/state': { state },
        '../core/WindowMetrics': { getWindowMetrics: () => ({ windowWidth: 375, windowHeight: 667 }) } });
    assert(perception.isRescueTargetVisible());
    state.mazeRescue.mazeMap[12][1] = 2;
    state.flashlightOn = false; player.angle = Math.PI;
    assert(perception.isRescueTargetVisible(), '入镜不受岩石、手电或朝向限制');
    state.npc.x = 250;
    assert(perception.isRescueTargetVisible(), '超出160px发现范围但身体进入画面边缘，仍授权高潮');
    state.npc.x = 270;
    assert(!perception.isRescueTargetVisible());
    state.camera.vx = 1;
    assert(perception.isRescueTargetVisible(0.4), '在下一拍前预判身体入镜');
    state.camera.vx = -1;
    assert(!perception.isRescueTargetVisible(0.4), '镜头反向运动撤销预判');
    state.camera.vx = 0;
    state.camera.zoom = 0.5;
    assert(perception.isRescueTargetVisible(), '视口按实际缩放计算');
    state.camera.zoom = 1;
    state.camera.x = -500;
    assert(!perception.isRescueTargetVisible(), '历史已发现不授权画面外高潮');
    state.camera.x = 50; state.npc.x = 100;

    const sources = [], parameters = [];
    const ctx = { currentTime: 10, state: 'running', destination: {},
        createGain() { const node = { gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {},
            linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; parameters.push(node); return node; },
        createBuffer(channels, length, rate) { const data = new Float32Array(length); return {
            duration: length / rate, getChannelData: () => data, data }; },
        createBufferSource() { const source = { connect() {}, start(at) { this.started = at; },
            stop(at) { this.stopped = at === undefined ? ctx.currentTime : at; },
            disconnect() { this.disconnected = true; } }; sources.push(source); return source; },
    };
    const lifecycle = {};
    global.wx = { createWebAudioContext: () => ctx, onHide: fn => lifecycle.hide = fn, onShow: fn => lifecycle.show = fn };
    const score = load('AdaptiveScore');
    let visible = false, predicted = false;
    const music = compile('audio/AdaptiveMusic', { ...baseDeps,
        './AdaptiveScore': { ...score, renderStemAsync: async (stem, variant) => {
            const pcm = new Float32Array(score.SCORE.sampleRate * score.SCORE.duration);
            pcm[0] = Object.keys(score.VARIANTS).indexOf(variant) + 1;
            return pcm;
        } }, './AdaptiveMusicEngine': load('AdaptiveMusicEngine'), './AdaptiveCues': load('AdaptiveCues'),
        '../logic/NPCPerception': { isRescueTargetVisible: (ahead = 0) => visible || (ahead > 0 && predicted) } });
    const tick = () => music.updateAdaptiveMusic({ active: true, currentIntensity: 1 });
    const settle = () => new Promise(resolve => setImmediate(resolve));
    music.warmUpAdaptiveMusic(); await settle();
    assert(music.isAdaptiveMusicReady());
    tick();
    assert.equal(music.getAdaptiveMusicClock().requestedLevel, 4);
    predicted = true; tick();
    assert.equal(music.getAdaptiveMusicClock().requestedLevel, 5);
    assert.equal(music.getAdaptiveMusicClock().requestedMood, 'found');
    predicted = false; tick();
    assert.equal(music.getAdaptiveMusicClock().requestedLevel, 4);
    assert.equal(music.getAdaptiveMusicClock().requestedMood, 'search', '未实际入镜，预判失败回到寻找');
    visible = true; tick(); tick();
    assert.equal(music.getAdaptiveMusicClock().requestedLevel, 5);
    const cues = name => sources.filter(s => Math.abs(s.buffer.duration - load('AdaptiveCues').CUE_SECONDS[name]) < 1e-8);
    assert.equal(cues('found').length, 0, '主题展开本身作为发现反馈，不压低高潮另放提示音');
    visible = false; tick(); visible = true; tick();
    assert.equal(music.getAdaptiveMusicClock().requestedMood, 'found', '入镜后主题状态保持');
    state.mazeRescue.npcRescued = true; visible = false; tick(); tick();
    assert.equal(cues('secured').length, 1);
    assert.equal(music.getAdaptiveMusicClock().requestedLevel, 0);
    assert.equal(music.getAdaptiveMusicClock().requestedMood, 'return');
    state.mazeRescue.phase = 'failed'; tick(); tick();
    assert.equal(cues('secured')[0].stopped, ctx.currentTime, '死亡不能继续播放绑绳成功的尾音');
    assert.equal(cues('death').length, 1, '失败钟声只触发一次');
    state.mazeRescue.phase = 'debrief'; tick();
    assert.equal(cues('death')[0].stopped, undefined, '结算画面不切断钟声尾音');
    state.audio.muted = true; tick();
    assert.equal(cues('death')[0].stopped, ctx.currentTime, '静音立即停止事件尾音');
    state.audio.muted = false;
    music.resetAdaptiveMusic(); state.mazeRescue.phase = 'play'; state.mazeRescue.npcRescued = false; tick();
    ctx.currentTime += 1; tick();
    CONFIG.lifeDetector.music.variant = 'flare'; tick();
    CONFIG.lifeDetector.music.variant = 'pursuit'; tick();
    await settle(); tick(); await settle(); tick();
    const active = sources.filter(s => s.buffer.duration === 16 && !s.disconnected);
    assert(active.some(s => s.buffer.data[0] === 3), '快速切换只提交最后选择的 C 版');
    const old = active.filter(s => s.buffer.data[0] === 1);
    assert(old.length === 12 && old.every(s => s.stopped > ctx.currentTime), '替换版本就绪后旧版本仍完成淡出');
    ctx.currentTime += 0.6; tick();
    assert(old.every(s => s.disconnected), '淡出结束后释放旧版本音源');
    lifecycle.hide();
    assert.equal(music.getAdaptiveMusicClock().playing, false);
    assert(sources.every(s => s.stopped !== undefined || s.disconnected), '后台不残留循环或事件音');
    lifecycle.show(); tick();
    assert.equal(music.getAdaptiveMusicClock().requestedLevel, 4);
    delete global.wx;
    console.log('通过：入镜/边缘/缩放/运动预判与撤销、发现情绪保持、绑绳返程、死亡尾音、静音/后台、A/B/C快速切换。');
}
check().catch(err => { console.error(err); process.exitCode = 1; });
