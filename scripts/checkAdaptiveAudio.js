const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load } = require('./adaptiveAudioModules');
const { SCORE, VARIANTS, THEME_TRACKS, WARM_LAYER_TRACKS, renderStem, renderStemAsync, notesFor, selectMusicLevel, selectRescueMusicLevel, PHRASE_BEATS, DISCOVERY_CROSSFADE } = load('AdaptiveScore');
const { renderMusicCue, renderPhrasePickup } = load('AdaptiveCues');
const { AdaptiveMusicEngine } = load('AdaptiveMusicEngine');
const close = (a, b, why) => assert(Math.abs(a - b) < 1e-8, why);
function validateExport(samples, file) {
    assert(samples.every(Number.isFinite));
    assert(samples.some(v => Math.abs(v) > 0.01));
    assert(Math.abs(samples[0] - samples[samples.length - 1]) < 0.03, '循环接缝');
    const wav = fs.readFileSync(file);
    assert.equal(wav.length, 44 + samples.length * 2);
    assert.equal(wav.readUInt32LE(24), SCORE.sampleRate);
    for (let i = 0; i < samples.length; i += 997)
        assert(Math.abs(wav.readInt16LE(44 + i * 2) / 32767 - samples[i]) <= 1 / 32767, 'PCM与导出一致');
}
function mix(tracks, ratios, i) { return tracks.reduce((v, track, n) => v + track[i] * ratios[n], 0); }
async function check() {
    for (const variant of Object.keys(VARIANTS)) {
        const folder = path.join(__dirname, '../design/adaptive-audio', variant);
        const names = [...SCORE.stems, 'bedFound', 'bedReturn', ...WARM_LAYER_TRACKS];
        const pcm = Object.fromEntries(names.map(stem => [stem, renderStem(stem, SCORE.sampleRate, variant)]));
        names.forEach(stem => validateExport(pcm[stem], path.join(folder, 'stems', stem + '.wav')));
        const search = SCORE.stems.map(stem => pcm[stem]);
        const found = [pcm.bedFound, pcm.beaconFound, pcm.bassFound, pcm.drums, pcm.arpFound, pcm.sparkFound];
        const home = [...found];
        home[0] = pcm.bedReturn;
        let peak = 0;
        for (const tracks of [search, found, home]) {
            for (let i = 0; i < tracks[0].length; i++)
                for (const ratios of SCORE.levelMixes)
                    peak = Math.max(peak, Math.abs(mix(tracks, ratios, i) * SCORE.masterGain));
            for (const cue of ['secured', 'death']) {
                const samples = renderMusicCue(cue, variant);
                for (let offset = 0; offset < tracks[0].length; offset += SCORE.sampleRate / 2) {
                    for (let i = 0; i < samples.length; i += 23) {
                        const t = i / SCORE.sampleRate + 0.01, at = (offset + Math.round(t * SCORE.sampleRate)) % tracks[0].length;
                        const duck = 1 - 0.45 * Math.min(1, t / 0.04);
                        assert(Math.abs(mix(tracks, SCORE.levelMixes[5], at) * SCORE.masterGain * duck + samples[i] * 0.64) < 1, '事件与任一主题叠加不得削波');
                    }
                }
            }
        }
        assert(peak < 0.9, '全部配器/档位保留余量');
        const pickup = renderPhrasePickup();
        for (let phrase = 0; phrase < 4; phrase++) {
            const entry = phrase * PHRASE_BEATS * 60 / SCORE.bpm * SCORE.sampleRate;
            for (let i = 0; i < pickup.length; i += 7) {
                const at = (entry - pickup.length + i + search[0].length) % search[0].length;
                assert(Math.abs(mix(search, SCORE.levelMixes[4], at) * SCORE.masterGain + pickup[i] * 0.24 * SCORE.masterGain) < 1, '过门叠加不得削波');
            }
            for (let i = 0; i < SCORE.sampleRate * DISCOVERY_CROSSFADE; i += 7) {
                const t = i / (SCORE.sampleRate * DISCOVERY_CROSSFADE), at = (entry + i) % search[0].length;
                const value = mix(search, SCORE.levelMixes[4], at) * (1 - t) + mix(found, SCORE.levelMixes[5], at) * t;
                assert(Math.abs(value * SCORE.masterGain) < 1, '整套和声交接不得削波');
            }
        }
        const oldMotif = notesFor('bed', variant).filter(n => n.voice === 'veil');
        const newMotif = notesFor('bedFound', variant).filter(n => n.voice === 'horizon');
        assert(newMotif.length < oldMotif.length, '答句删去碎音，留出较长的落定');
        assert.deepEqual(newMotif.filter(n => n.beat < 4).map(n => n.beat), oldMotif.filter(n => n.beat < 4).map(n => n.beat), '开头动机节奏仍可辨认');
        const original = new Map(oldMotif.map(n => [n.beat, n]));
        assert(newMotif.some(n => n.length > original.get(n.beat).length), '答句确实延长，不只改音色');
        assert(new Set(newMotif.map(n => n.midi - original.get(n.beat).midi)).size > 2, '旋律必须改变调式与句尾，不能仅统一移调/换乐器');
        const majorPCs = new Set([5, 7, 9, 10, 0, 2, 4]); // F大调，减去各版移调量后检查。
        for (const stem of ['bedFound', 'bedReturn', ...WARM_LAYER_TRACKS]) {
            for (const note of notesFor(stem, variant))
                if (!['kick', 'snare', 'hat'].includes(note.voice)) {
                    assert(majorPCs.has(((note.midi - VARIANTS[variant].transpose) % 12 + 12) % 12), '发现后的所有有音高声部共用大调配器');
                }
        }
        assert.notDeepEqual(pcm.bass, pcm.bassFound, '低音同步改变和声');
        assert.notDeepEqual(pcm.arp, pcm.arpFound);
        assert.notDeepEqual(pcm.spark, pcm.sparkFound);
        const returning = notesFor('bedReturn', variant).filter(n => n.voice === 'home');
        assert.equal((returning[returning.length - 1].midi - VARIANTS[variant].transpose) % 12, 5, '返程句尾落到大调主音');
        for (const stem of ['spark', 'sparkFound']) {
            const rush = notesFor(stem, variant).filter(n => n.voice === 'rush');
            assert.equal(rush.length, 320);
            for (let i = 1; i < rush.length; i++)
                close((rush[i].beat - rush[i - 1].beat) * 60 / SCORE.bpm, 0.05);
        }
        for (const [name, seconds] of [['demo', 56], ['climax', 12], ['theme', 16], ['theme-found', 16], ['theme-return', 16], ['theme-colors', 48], ['rescue-journey', 40], ['four-to-five', 16], ['fifth-solo', 8], ['death', 6.4]]) {
            const wav = fs.readFileSync(path.join(folder, name + '.wav'));
            assert.equal(wav.length, 44 + seconds * SCORE.sampleRate * 2);
            assert.equal(wav.readInt16LE(44), 0);
            assert(Math.abs(wav.readInt16LE(wav.length - 2)) <= 1);
        }
        console.log(`${VARIANTS[variant].title}：寻找/发现/返程全部档位峰值 ${(20 * Math.log10(peak)).toFixed(2)} dBFS；大调伴奏、动机变奏、过门与事件叠加通过。`);
    }
    assert.deepEqual(await renderStemAsync('bedFound', 'pursuit'), renderStem('bedFound', SCORE.sampleRate, 'pursuit'));
    assert.deepEqual(await renderStemAsync('sparkFound'), renderStem('sparkFound'));
    assert.equal(selectMusicLevel(-1, 5), 0);
    assert.equal(selectMusicLevel(.21, 1), 1);
    assert.equal(selectMusicLevel(.24, 1), 2);
    assert.equal(selectMusicLevel(.18, 2), 2);
    assert.equal(selectMusicLevel(.16, 2), 1);
    assert.equal(selectRescueMusicLevel(1, 4, false), 4);
    assert.equal(selectRescueMusicLevel(-1, 4, true), 5);
    const death = renderMusicCue('death');
    let earlyEnergy = 0, earlyPeak = 0;
    for (let i = 0; i < SCORE.sampleRate * .08; i++) {
        earlyEnergy += death[i] ** 2;
        earlyPeak = Math.max(earlyPeak, Math.abs(death[i]));
    }
    assert(earlyPeak > .4 && Math.sqrt(earlyEnergy / (SCORE.sampleRate * .08)) > .15, '死亡必须有清楚的duang起音');
    assert(death.slice(SCORE.sampleRate * 2, SCORE.sampleRate * 4).some(v => Math.abs(v) > .02), '保留低沉尾音');
    assert(death.every(Number.isFinite));
    const gains = [], sources = [];
    const ctx = { currentTime: 10, destination: {}, createGain() { const node = { gain: { value: 0, events: [], cancelScheduledValues(t) { this.events.push(['cancel', t]); }, setValueAtTime(v, t) { this.events.push(['set', v, t]); }, linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); } }, connect() { }, disconnect() { this.disconnected = true; } }; gains.push(node); return node; },
        createBufferSource() { const node = { connect() { }, start(at, offset) { this.started = at; this.offset = offset; }, stop(at) { this.stopped = at === undefined ? ctx.currentTime : at; }, disconnect() { this.disconnected = true; } }; sources.push(node); return node; } };
    const last = (parameter, type) => parameter.events.filter(e => e[0] === type).slice(-1)[0];
    const buffers = Array.from({ length: 6 }, () => ({ duration: 16 })), themes = [{ duration: 16 }, { duration: 16 }], warm = Array.from({ length: 4 }, () => ({ duration: 16 }));
    assert.throws(() => new AdaptiveMusicEngine(ctx, [{ duration: 15 }]));
    const engine = new AdaptiveMusicEngine(ctx, buffers, themes, warm, { duration: 2 });
    engine.start();
    engine.setVolume(.68);
    assert.equal(sources.length, 12);
    assert(sources.every(s => s.started === 10.06));
    ctx.currentTime = 10.2;
    engine.setLevel(3);
    close(last(gains[4].gain, 'set')[2], 10.56);
    ctx.currentTime = 10.8;
    engine.setLevel(4);
    close(last(gains[5].gain, 'set')[2], 12.06);
    ctx.currentTime = 12.08;
    engine.setLevel(5);
    close(last(gains[12].gain, 'set')[2], 14.06, '第五层等两小节乐句起点，不是下一拍12.56');
    close(last(gains[9].gain, 'set')[2], 14.06, '有音高伴奏同一入口转调');
    close(last(gains[2].gain, 'ramp')[1], 0, '旧小调信标退出');
    close(last(gains[12].gain, 'ramp')[2], 14.36, '短交接覆盖全部新配器');
    const firstPickup = sources[sources.length - 1];
    assert.equal(firstPickup.buffer.duration, 2);
    close(firstPickup.started, 12.105);
    close(firstPickup.offset, .045);
    const queued = gains[12].gain.events.length;
    engine.setLevel(5);
    assert.equal(gains[12].gain.events.length, queued, '不重复排队');
    ctx.currentTime = 12.2;
    engine.setLevel(4, false, 'search');
    assert(firstPickup.disconnected, '预判失效撤销过门');
    assert.equal(last(gains[12].gain, 'ramp')[1], 0);
    ctx.currentTime = 14.08;
    engine.setLevel(5);
    const secondPickup = sources[sources.length - 1];
    close(secondPickup.started, 16.06, '提前一小节过门');
    close(secondPickup.stopped, 18.06);
    ctx.currentTime = 18.21;
    engine.setLevel(4, false, 'found');
    const held = gains[12].gain.events.filter(e => e[0] === 'set' && Math.abs(e[2] - 18.21) < 1e-8);
    close(held[0][1], .5, '中途撤回保持当前包络连续');
    assert.equal(engine.getClock().requestedMood, 'found');
    ctx.currentTime = 19.2;
    engine.setLevel(0, true);
    close(last(gains[10].gain, 'ramp')[2], 21.06, '暖色低音在返程时1.5s收束');
    close(last(gains[8].gain, 'ramp')[2], 20.21, '返程主题650ms接尾音');
    ctx.currentTime = 20.22;
    assert.equal(engine.getClock().mood, 'return');
    engine.stop();
    const stopEvents = gains[0].gain.events.length;
    engine.setVolume(.78);
    assert.equal(gains[0].gain.events.length, stopEvents);
    ctx.currentTime = 20.6;
    assert.equal(engine.hasSources(), false);
    engine.start();
    assert.equal(engine.getClock().requestedMood, 'search');
    engine.dispose();
    const html = fs.readFileSync(path.join(__dirname, '../design/adaptive-audio/listen.html'), 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.equal(scripts.length, 2);
    scripts.forEach(code => new vm.Script(code));
    const scope = { window: {} };
    vm.runInNewContext(scripts[0], scope);
    assert.equal(scope.window.SignalBelow.PHRASE_BEATS, 8);
    console.log('通过：两小节入口、过门排队/撤销、伴奏共同转调、当前包络接续、返程、死亡起音与尾音、静音停播及试听脚本。');
}
check().catch(err => { console.error(err); process.exitCode = 1; });
