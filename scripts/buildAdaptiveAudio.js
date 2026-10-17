const fs = require('fs');
const path = require('path');
const { load, browserBundle } = require('./adaptiveAudioModules');
const { SCORE, VARIANTS, DEFAULT_VARIANT, renderStem, musicTransition, WARM_LAYER_TRACKS, DISCOVERY_CROSSFADE, RETURN_CROSSFADE } = load('AdaptiveScore');
const { renderMusicCue, renderPhrasePickup } = load('AdaptiveCues');
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
function demo(stems, levels, seconds, themes, moods = levels.map(level => level === 5 ? 'found' : 'search')) {
    const stageSamples = Math.round(SCORE.sampleRate * seconds);
    const out = new Float32Array(stageSamples * levels.length);
    for (let i = 0; i < out.length; i++) {
        const stage = Math.floor(i / stageSamples), level = levels[stage];
        const previous = levels[Math.max(0, stage - 1)];
        const t = Math.min(1, (i % stageSamples) / (SCORE.sampleRate * musicTransition(previous, level, moods[stage] === 'return' && previous > 0).fadeSeconds));
        const mood = moods[stage], oldMood = moods[Math.max(0, stage - 1)];
        const elapsed = (i % stageSamples) / SCORE.sampleRate;
        const themeFade = Math.min(1, elapsed / (mood === 'return' ? RETURN_CROSSFADE : DISCOVERY_CROSSFADE));
        let value = 0;
        for (let s = 0; s < stems.length; s++) {
            const a = SCORE.levelMixes[previous][s], b = SCORE.levelMixes[level][s];
            const source = stems[s];
            if (themes) {
                const oldTrack = s === 0 ? themes[oldMood] : oldMood === 'search' ? source : themes.warm[s];
                const nextTrack = s === 0 ? themes[mood] : mood === 'search' ? source : themes.warm[s];
                const old = oldTrack[i % source.length], next = nextTrack[i % source.length];
                value += mood === oldMood || s === 3 || (s > 0 && mood !== 'search' && oldMood !== 'search') ? next * (a + (b - a) * t)
                    : old * a * (1 - themeFade) + next * b * themeFade;
            } else value += source[i % source.length] * (a + (b - a) * t);
        }
        const edge = Math.min(1, i / (SCORE.sampleRate * 0.12), (out.length - 1 - i) / (SCORE.sampleRate * 0.2));
        out[i] = value * SCORE.masterGain * edge;
    }
    const pickup = renderPhrasePickup();
    if (themes) levels.forEach((level, stage) => {
        if (stage === 0 || level !== 5 || levels[stage - 1] === 5) return;
        const begin = stage * stageSamples - pickup.length;
        for (let i = 0; i < pickup.length; i++) if (begin + i >= 0) out[begin + i] += pickup[i] * 0.24 * SCORE.masterGain;
    });
    return out;
}

for (const [id, config] of Object.entries(VARIANTS)) {
    const folder = path.join(output, id);
    fs.mkdirSync(path.join(folder, 'stems'), { recursive: true });
    const stems = SCORE.stems.map(stem => renderStem(stem, SCORE.sampleRate, id));
    stems.forEach((samples, i) => fs.writeFileSync(path.join(folder, 'stems', SCORE.stems[i] + '.wav'), wav(samples)));
    const themes = { search: stems[0], found: renderStem('bedFound', SCORE.sampleRate, id), return: renderStem('bedReturn', SCORE.sampleRate, id) };
    const warmParts = WARM_LAYER_TRACKS.map(stem => renderStem(stem, SCORE.sampleRate, id));
    themes.warm = [themes.found, warmParts[0], warmParts[1], stems[3], warmParts[2], warmParts[3]];
    WARM_LAYER_TRACKS.forEach((stem, i) => fs.writeFileSync(path.join(folder, 'stems', stem + '.wav'), wav(warmParts[i])));
    fs.writeFileSync(path.join(folder, 'stems/bedFound.wav'), wav(themes.found));
    fs.writeFileSync(path.join(folder, 'stems/bedReturn.wav'), wav(themes.return));
    fs.writeFileSync(path.join(folder, 'demo.wav'), wav(demo(stems, stages, stageSeconds, themes)));
    // 12 秒最高档，便于先快速比较三版是否足够激昂。
    fs.writeFileSync(path.join(folder, 'climax.wav'), wav(demo(stems, [5], 12, themes)));
    // 单独比较底轨音色/旋律，使用同一总增益，不按单轨响度放大。
    fs.writeFileSync(path.join(folder, 'theme.wav'), wav(demo(stems, [0], 16)));
    // 直接听关键的四级→五级跃迁；第五轨单独听时保留同一总增益。
    fs.writeFileSync(path.join(folder, 'four-to-five.wav'), wav(demo(stems, [4, 5], 8, themes)));
    // 同一乐句三种配器，各16秒；另给出40秒实际阶段切换，方便集中判断情绪衔接。
    fs.writeFileSync(path.join(folder, 'theme-found.wav'), wav(demo(stems, [0], 16, themes, ['found'])));
    fs.writeFileSync(path.join(folder, 'theme-return.wav'), wav(demo(stems, [0], 16, themes, ['return'])));
    fs.writeFileSync(path.join(folder, 'theme-colors.wav'), wav(demo(stems, [0, 0, 0], 16, themes, ['search', 'found', 'return'])));
    const journey = demo(stems, [2, 4, 5, 0, 0], 8, themes, ['search', 'search', 'found', 'return', 'return']);
    const secureCue = renderMusicCue('secured', id);
    for (let i = 0; i < secureCue.length; i++) {
        const at = 24 * SCORE.sampleRate + i;
        const duck = 1 - 0.45 * Math.min(1, i / (SCORE.sampleRate * 0.04));
        journey[at] = journey[at] * duck + secureCue[i] * 0.64;
    }
    // 确认音结束后平滑恢复背景电平。
    for (let i = 0; i < SCORE.sampleRate * 0.08; i++) journey[24 * SCORE.sampleRate + secureCue.length + i] *= 0.55 + 0.45 * i / (SCORE.sampleRate * 0.08);
    fs.writeFileSync(path.join(folder, 'rescue-journey.wav'), wav(journey));
    const solo = stems.map((track, s) => s === 5 ? track : new Float32Array(track.length));
    fs.writeFileSync(path.join(folder, 'fifth-solo.wav'), wav(demo(solo, [5], 8)));
    if (id === DEFAULT_VARIANT) {
        const archived = path.join(output, 'archive-v5/theme-found.wav');
        if (fs.existsSync(archived)) {
            const before = readOurWav(archived), after = demo(stems, [0], 16, themes, ['found']);
            const comparison = new Float32Array(before.length + after.length);
            comparison.set(before); comparison.set(after, before.length);
            fs.writeFileSync(path.join(output, 'color-v5-v6.wav'), wav(comparison));
        }
    }
    for (const cue of ['found', 'secured', 'death']) fs.writeFileSync(path.join(folder, cue + '.wav'), wav(renderMusicCue(cue, id)));
    const manifest = { ...SCORE, variant: id, ...config, key: { undertow: 'D minor', flare: 'E minor', pursuit: 'C minor' }[id],
        channels: 1, bitDepth: 16, loopSamples: stems[0].length,
        demoStages: stages, demoStageSeconds: stageSeconds, themeStates: ['search', 'found', 'return'],
        extraThemeFiles: ['stems/bedFound.wav', 'stems/bedReturn.wav'], warmLayerFiles: WARM_LAYER_TRACKS.map(s => 'stems/' + s + '.wav'),
        discoveryKeys: { undertow: 'F major', flare: 'G major', pursuit: 'E-flat major' }[id], phraseBeats: 8,
        stems: SCORE.stems.map((stem, i) => ({ id: stem, label: SCORE.labels[i], file: `stems/${stem}.wav` })),
    };
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (id === DEFAULT_VARIANT) {
        fs.mkdirSync(path.join(output, 'stems'), { recursive: true });
        SCORE.stems.forEach(stem => fs.copyFileSync(path.join(folder, 'stems', stem + '.wav'), path.join(output, 'stems', stem + '.wav')));
        fs.copyFileSync(path.join(folder, 'demo.wav'), path.join(output, 'Signal-Below-demo.wav'));
        fs.copyFileSync(path.join(folder, 'manifest.json'), path.join(output, 'manifest.json'));
    }
    console.log(`${config.title}：小调寻找→大调发现、完整伴奏转调、两小节乐句入口+过门、duang起音与暗尾`);
}
const template = fs.readFileSync(path.join(__dirname, 'adaptiveAudioPreview.html'), 'utf8');
fs.writeFileSync(path.join(output, 'listen.html'), template.replace('/* AUDIO_BUNDLE */', () => browserBundle()));
console.log(`试听输出：${output}`);
