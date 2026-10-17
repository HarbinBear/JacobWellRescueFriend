const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load } = require('./adaptiveAudioModules');
const { SCORE, VARIANTS, renderStem, renderStemAsync, notesFor, selectMusicLevel } = load('AdaptiveScore');
const { AdaptiveMusicEngine } = load('AdaptiveMusicEngine');

async function check() {
    const pcm = SCORE.stems.map(s => renderStem(s));
    let peak = 0, seam = 0;
    pcm.forEach((samples, index) => {
        assert.equal(samples.length, 384000);
        assert(samples.some(v => Math.abs(v) > 0.01), '音轨不能静默');
        assert(samples.every(Number.isFinite));
        const wav = fs.readFileSync(path.join(__dirname, '../design/adaptive-audio/stems', SCORE.stems[index] + '.wav'));
        assert.equal(wav.readUInt32LE(24), SCORE.sampleRate);
        assert.equal(wav.length, 44 + samples.length * 2);
        for (let i = 0; i < samples.length; i += 997) {
            assert(Math.abs(wav.readInt16LE(44 + i * 2) / 32767 - samples[i]) <= 1 / 32767,
                '导出音轨必须与游戏乐谱一致');
        }
        seam = Math.max(seam, Math.abs(samples[0] - samples[samples.length - 1]));
    });
    for (let i = 0; i < pcm[0].length; i++) {
        for (const mix of SCORE.levelMixes) {
            let sum = 0;
            for (let s = 0; s < pcm.length; s++) sum += pcm[s][i] * mix[s];
            peak = Math.max(peak, Math.abs(sum * SCORE.masterGain));
        }
    }
    assert(peak < 0.9, '全部混音必须保留至少约 1dB 余量');
    assert(seam < 0.03, '循环边缘不能出现明显阶跃');
    assert.deepEqual(await renderStemAsync('bed'), pcm[0], '分块合成必须与离线合成逐样本一致');

    for (const variant of Object.keys(VARIANTS)) {
        const folder = path.join(__dirname, '../design/adaptive-audio', variant);
        const tracks = SCORE.stems.map(stem => renderStem(stem, SCORE.sampleRate, variant));
        let variantPeak = 0, squares = 0;
        tracks.forEach((track, s) => {
            assert(track.every(Number.isFinite));
            assert(Math.abs(track[0] - track[track.length - 1]) < 0.03);
            const wav = fs.readFileSync(path.join(folder, 'stems', SCORE.stems[s] + '.wav'));
            assert.equal(wav.length, 44 + track.length * 2);
            for (let i = 0; i < track.length; i += 997) {
                assert(Math.abs(wav.readInt16LE(44 + i * 2) / 32767 - track[i]) <= 1 / 32767);
            }
        });
        for (let i = 0; i < tracks[0].length; i++) {
            let sum = 0;
            for (const mix of SCORE.levelMixes) {
                sum = tracks.reduce((v, track, s) => v + track[i] * mix[s], 0);
                variantPeak = Math.max(variantPeak, Math.abs(sum * SCORE.masterGain));
            }
            squares += Math.pow(sum * SCORE.masterGain, 2);
        }
        assert(variantPeak < 0.9, '三版的全部档位都必须保留余量');
        const rush = notesFor('spark', variant).filter(n => n.voice === 'rush');
        const drive = notesFor('arp', variant).filter(n => n.voice === 'drive');
        assert.equal(rush.length, 320, '16 秒中必须有 320 次有音高疾奏 = 1200 次/min');
        assert.equal(drive.length, 64, '四级 240 次/min');
        for (let i = 1; i < rush.length; i++) {
            assert(Math.abs((rush[i].beat - rush[i - 1].beat) * 60 / SCORE.bpm - 0.05) < 1e-9);
        }
        assert(notesFor('bed', variant).filter(n => n.voice === 'lead').length >= 20,
            '底轨须有完整弦乐旋律，不能退回零散铃音');
        for (const [name, seconds] of [['demo', 56], ['climax', 12], ['theme', 16], ['four-to-five', 16], ['fifth-solo', 8]]) {
            const wav = fs.readFileSync(path.join(folder, name + '.wav'));
            assert.equal(wav.length, 44 + seconds * SCORE.sampleRate * 2);
            assert.equal(wav.readInt16LE(44), 0);
            assert.equal(wav.readInt16LE(wav.length - 2), 0);
        }
        console.log(`${VARIANTS[variant].title}：峰值 ${(20 * Math.log10(variantPeak)).toFixed(2)} dBFS，满层 RMS ${(20 * Math.log10(Math.sqrt(squares / tracks[0].length))).toFixed(2)} dBFS；实际疾奏 1200/min。`);
    }
    assert.deepEqual(await renderStemAsync('spark', 'pursuit'), renderStem('spark', SCORE.sampleRate, 'pursuit'));

    assert.equal(selectMusicLevel(-1, 5), 0);
    assert.equal(selectMusicLevel(0, 0), 1);
    assert.equal(selectMusicLevel(0.21, 1), 1); // 没跨过上行缓冲
    assert.equal(selectMusicLevel(0.24, 1), 2);
    assert.equal(selectMusicLevel(0.18, 2), 2); // 没跨过下行缓冲
    assert.equal(selectMusicLevel(0.16, 2), 1);
    assert.equal(selectMusicLevel(1, 1), 5); // 远距离瞬移可一次跨多级
    assert.equal(selectMusicLevel(NaN, 3), 0);

    const gains = [], sources = [];
    const ctx = {
        currentTime: 10, destination: {},
        createGain() {
            const gain = { gain: { value: 0, events: [],
                cancelScheduledValues(t) { this.events.push(['cancel', t]); },
                setValueAtTime(v, t) { this.events.push(['set', v, t]); },
                linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); } },
                connect() {}, disconnect() { this.disconnected = true; } };
            gains.push(gain); return gain;
        },
        createBufferSource() {
            const source = { connect() {}, start(at) { this.started = at; },
                stop(at) { this.stopped = at; }, disconnect() { this.disconnected = true; } };
            sources.push(source); return source;
        },
    };
    const buffers = Array.from({ length: 6 }, () => ({ duration: 16 }));
    assert.throws(() => new AdaptiveMusicEngine(ctx, [{ duration: 15 }]));
    const engine = new AdaptiveMusicEngine(ctx, buffers);
    engine.start(); engine.setVolume(0.68);
    assert.equal(sources.length, 6);
    assert(sources.every(s => s.started === 10.06 && s.loop && s.loopEnd === 16), '六轨必须同一时刻起播');
    ctx.currentTime = 10.2;
    engine.setLevel(3);
    const events = gains[2].gain.events;
    assert(Math.abs(events[1][2] - 10.56) < 1e-8, '在下一拍开始切档');
    const eventCount = events.length;
    engine.setLevel(5); engine.setLevel(4); // 下一拍前连续变更，只保留最新请求
    assert.equal(events.length, eventCount);
    ctx.currentTime = 10.58;
    engine.setLevel(4);
    assert.equal(engine.getClock().level, 3);
    ctx.currentTime = 11.08;
    engine.setLevel(4);
    assert.equal(engine.getClock().level, 4);
    assert.equal(sources.length, 6, '切层不得重启音轨');
    engine.setVolume(0);
    assert.equal(sources.length, 6, '静音保持时间轴');
    engine.stop();
    assert(sources.every(s => s.stopped === 11.14));
    ctx.currentTime = 11.15;
    assert.equal(engine.getClock().playing, false);
    assert(sources.every(s => s.disconnected));
    engine.start(); engine.setLevel(5); engine.stop(true); engine.start();
    assert.equal(sources.length, 18, '快速停播/重启能够重新创建完整六轨');
    assert.equal(engine.getClock().level, 0);
    engine.setLevel(5);
    ctx.currentTime = 11.22;
    const denseClock = engine.getClock();
    assert.equal(denseClock.level, 5);
    assert(Math.abs(denseClock.subdivisionPhase - 0.2) < 1e-8, '视觉接口同步十连音时钟');
    assert.equal(gains[gains.length - 6].gain.events.slice(-1)[0][1], 0.72,
        '进入五级时底轨必须退后，给前景音型让位');
    engine.setLevel(4);
    ctx.currentTime = 11.72;
    assert.equal(engine.getClock().level, 4);
    assert.equal(gains[gains.length - 6].gain.events.slice(-1)[0][1], 1,
        '退出五级后底轨恢复原电平');
    engine.dispose();

    const html = fs.readFileSync(path.join(__dirname, '../design/adaptive-audio/listen.html'), 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.equal(scripts.length, 2);
    scripts.forEach((source, i) => new vm.Script(source, { filename: `listen-inline-${i}.js` }));
    const bundleContext = { window: {} };
    vm.runInNewContext(scripts[0], bundleContext);
    assert.equal(bundleContext.window.SignalBelow.SCORE.bpm, 120);
    assert.equal(typeof bundleContext.window.SignalBelow.AdaptiveMusicEngine, 'function');
    console.log(`通过：PCM/WAV 一致、循环接缝、所有档位余量、距离滞回、音频时钟切换、静音与生命周期。`);
    console.log(`最大混音峰值 ${(20 * Math.log10(peak)).toFixed(2)} dBFS；最大单轨循环阶跃 ${seam.toFixed(6)}。`);
}
check().catch(err => { console.error(err); process.exitCode = 1; });
