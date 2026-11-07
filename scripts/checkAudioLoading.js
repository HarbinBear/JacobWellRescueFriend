const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { load } = require('./adaptiveAudioModules');

function compile(file, deps) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('exports', 'require', code)(exports, name => {
        assert(name in deps, name);
        return deps[name];
    });
    return exports;
}

async function check() {
    const score = load('AdaptiveScore');
    const realNow = Date.now, realTimeout = global.setTimeout;
    const jobs = [], delays = [], progress = [];
    let fakeNow = 0, complete = false, samples, failure;
    try {
        Date.now = () => fakeNow++;
        global.setTimeout = (fn, delay) => { jobs.push(fn); delays.push(delay); return jobs.length; };
        const result = score.renderStemAsync('bedFound', 'pursuit', value => progress.push(value));
        assert.equal(progress.length, 0, '首片也必须让出用户手势，不同步生成音乐');
        assert.deepEqual(delays, [0]);
        result.then(value => { complete = true; samples = value; }, err => { failure = err; complete = true; });
        while (!complete) {
            const job = jobs.shift();
            assert(job, '每片都应通过任务队列让出主线程');
            job();
            await Promise.resolve();
            await Promise.resolve();
        }
        if (failure) throw failure;
        assert(progress.length > 100, '一条长主题内部也有细粒度进度');
        assert(progress[0] > 0 && progress[0] < .01);
        assert.equal(progress[progress.length - 1], 1);
        assert(progress.every((v, i) => Number.isFinite(v) && v >= 0 && v <= 1 && (!i || v >= progress[i - 1])));
        assert(delays.slice(1).every(delay => delay === 8), '各片之间给游戏输入和绘制留出时间');
    } finally {
        Date.now = realNow;
        global.setTimeout = realTimeout;
    }
    assert.deepEqual(samples, score.renderStem('bedFound', score.SCORE.sampleRate, 'pursuit'), '异步只是调度变化，不能改音轨PCM');

    const CONFIG = { maze: { npcRescueRange: 120 }, lifeDetector: {
        enabled: true, rangeMultiplier: 50, curvePower: .6, music: { enabled: true },
    } };
    const state = { screen: 'mazeRescue', mazeRescue: { phase: 'play', npcRescued: false }, npc: { active: true, x: 1200, y: 0 } };
    const player = { x: 0, y: 0 };
    let beeps = 0;
    const detector = compile('logic/LifeDetector', {
        '../core/config': { CONFIG }, '../core/state': { state, player },
        '../audio/LifeDetectorSynth': { playSonarLow: () => beeps++, playSonarHigh: () => beeps++ },
        '../audio/AdaptiveMusic': { getRescueMusicRange: () => 600, getAdaptiveMusicClock: () => null, resetAdaptiveMusic() {} },
    });
    detector.updateLifeDetector();
    assert.equal(detector.getLifeDetectorRuntime().active, false, '旧50倍外圈不能使音乐常驻');
    state.npc.x = 200;
    detector.updateLifeDetector();
    assert.equal(detector.getLifeDetectorRuntime().active, true);
    assert.equal(beeps, 0, '音乐未就绪时也不能偷偷替换成探测双音');
    const visuals = compile('audio/AdaptiveMusicVisuals', { './AdaptiveScore': score });
    const tape = compile('render/RescueTape', {
        '../core/config': { CONFIG }, '../core/state': { state: { ...state, audio: { muted: false } } },
        '../audio/AdaptiveMusic': { getAdaptiveMusicClock: () => null },
        '../audio/AdaptiveMusicVisuals': visuals,
        '../logic/LifeDetector': { getLifeDetectorRuntime: () => ({ active: true, pulseT: 1 }) },
    });
    assert.equal(tape.getRescueTapeVisual().playing, false);
    assert.equal(tape.getRescueTapeVisual().fallback, false, '加载中不伪造磁带播放/舞步');
    CONFIG.lifeDetector.music.enabled = false;
    detector.updateLifeDetector();
    assert.equal(beeps, 1, '显式切回旧探测器时仍保留双音模式');
    console.log('通过：首片异步、2ms分片与任务让出、单轨真实单调进度、异步PCM完全一致、局部探测范围、加载中无替代双音或伪造舞步。');
}
check().catch(err => { console.error(err); process.exitCode = 1; });
