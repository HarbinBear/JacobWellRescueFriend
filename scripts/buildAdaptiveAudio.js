const fs = require('fs');
const path = require('path');
const { load, browserBundle } = require('./adaptiveAudioModules');
const { SCORE, VARIANTS, DEFAULT_VARIANT, renderStem } = load('AdaptiveScore');
const output = path.resolve(__dirname, '../design/adaptive-audio');
const stages = [0, 1, 2, 3, 4, 5, 5];
const stageSeconds = 8;

function readOurWav(file) {
    const data = fs.readFileSync(file);
    if (data.toString('ascii', 36, 40) !== 'data') throw new Error('预期自有 PCM WAV 格式');
    return Float32Array.from({ length: (data.length - 44) / 2 }, (_, i) => data.readInt16LE(44 + i * 2) / 32767);
}

function wav(samples) {
    const data = Buffer.alloc(44 + samples.length * 2);
    data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4);
    data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
    data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
    data.writeUInt32LE(SCORE.sampleRate, 24); data.writeUInt32LE(SCORE.sampleRate * 2, 28);
    data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
    data.write('data', 36); data.writeUInt32LE(samples.length * 2, 40);
    samples.forEach((v, i) => {
        if (!Number.isFinite(v) || Math.abs(v) >= 1) throw new Error('音频出现削波/非有限样本');
        data.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
    });
    return data;
}
function demo(stems, levels, seconds) {
    const stageSamples = Math.round(SCORE.sampleRate * seconds);
    const out = new Float32Array(stageSamples * levels.length);
    for (let i = 0; i < out.length; i++) {
        const stage = Math.floor(i / stageSamples), level = levels[stage];
        const previous = levels[Math.max(0, stage - 1)];
        const t = Math.min(1, (i % stageSamples) / (SCORE.sampleRate * 0.09));
        let value = 0;
        for (let s = 0; s < stems.length; s++) {
            const a = SCORE.levelMixes[previous][s], b = SCORE.levelMixes[level][s];
            value += stems[s][i % stems[s].length] * (a + (b - a) * t);
        }
        const edge = Math.min(1, i / (SCORE.sampleRate * 0.12), (out.length - 1 - i) / (SCORE.sampleRate * 0.2));
        out[i] = value * SCORE.masterGain * edge;
    }
    return out;
}

for (const [id, config] of Object.entries(VARIANTS)) {
    const folder = path.join(output, id);
    fs.mkdirSync(path.join(folder, 'stems'), { recursive: true });
    const stems = SCORE.stems.map(stem => renderStem(stem, SCORE.sampleRate, id));
    stems.forEach((samples, i) => fs.writeFileSync(path.join(folder, 'stems', SCORE.stems[i] + '.wav'), wav(samples)));
    fs.writeFileSync(path.join(folder, 'demo.wav'), wav(demo(stems, stages, stageSeconds)));
    // 12 秒最高档，便于先快速比较三版是否足够激昂。
    fs.writeFileSync(path.join(folder, 'climax.wav'), wav(demo(stems, [5], 12)));
    // 单独比较底轨音色/旋律，使用同一总增益，不按单轨响度放大。
    fs.writeFileSync(path.join(folder, 'theme.wav'), wav(demo(stems, [0], 16)));
    // 直接听关键的四级→五级跃迁；第五轨单独听时保留同一总增益。
    fs.writeFileSync(path.join(folder, 'four-to-five.wav'), wav(demo(stems, [4, 5], 8)));
    const solo = stems.map((track, s) => s === 5 ? track : new Float32Array(track.length));
    fs.writeFileSync(path.join(folder, 'fifth-solo.wav'), wav(demo(solo, [5], 8)));
    if (id === DEFAULT_VARIANT) {
        const oldFolder = path.join(output, 'archive-v2', id, 'stems');
        if (fs.existsSync(oldFolder)) {
            const old = SCORE.stems.map(stem => readOurWav(path.join(oldFolder, stem + '.wav')));
            const samePhrase = new Float32Array(SCORE.sampleRate * 24);
            const segments = [
                { tracks: old, mix: [1, 1, 1, 1, 1, 0] },
                { tracks: old, mix: [1, 1, 1, 1, 1, 1] },
                { tracks: stems, mix: SCORE.levelMixes[5] },
            ];
            segments.forEach(({ tracks, mix }, s) => {
                for (let i = 0; i < SCORE.sampleRate * 8; i++) {
                    let value = 0;
                    tracks.forEach((track, n) => { value += track[i] * mix[n]; });
                    const edge = Math.min(1, i / (SCORE.sampleRate * 0.005), (SCORE.sampleRate * 8 - 1 - i) / (SCORE.sampleRate * 0.005));
                    samePhrase[s * SCORE.sampleRate * 8 + i] = value * SCORE.masterGain * edge;
                }
            });
            fs.writeFileSync(path.join(output, 'reference-study', 'four-old-five-new-five.wav'), wav(samePhrase));
        }
    }
    const manifest = { ...SCORE, variant: id, ...config, key: { undertow: 'D minor', flare: 'E minor', pursuit: 'C minor' }[id],
        channels: 1, bitDepth: 16, loopSamples: stems[0].length,
        demoStages: stages, demoStageSeconds: stageSeconds,
        stems: SCORE.stems.map((stem, i) => ({ id: stem, label: SCORE.labels[i], file: `stems/${stem}.wav` })),
    };
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (id === DEFAULT_VARIANT) {
        fs.mkdirSync(path.join(output, 'stems'), { recursive: true });
        SCORE.stems.forEach(stem => fs.copyFileSync(path.join(folder, 'stems', stem + '.wav'), path.join(output, 'stems', stem + '.wav')));
        fs.copyFileSync(path.join(folder, 'demo.wav'), path.join(output, 'Signal-Below-demo.wav'));
        fs.copyFileSync(path.join(folder, 'manifest.json'), path.join(output, 'manifest.json'));
    }
    console.log(`${config.title}：6 条独立 WAV、56s 递进、12s 最高档、16s 弦乐主题`);
}
const template = fs.readFileSync(path.join(__dirname, 'adaptiveAudioPreview.html'), 'utf8');
fs.writeFileSync(path.join(output, 'listen.html'), template.replace('/* AUDIO_BUNDLE */', () => browserBundle()));
console.log(`试听输出：${output}`);
