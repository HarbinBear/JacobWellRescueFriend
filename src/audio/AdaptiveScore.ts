// Signal Below VI：发现后重配为相对大调，主题保留开头动机、重写句尾落点；高潮按两小节乐句进入。
export const VARIANTS = {
    undertow: { title: 'A · 深流', description: '寻找时保留悬念，发现后转向温暖的大调与宽阔长句。',
        transpose: 0, leadGain: 0.17, driveGain: 0.14, rushGain: 0.34, bassGain: 0.25, style: 0 },
    flare: { title: 'B · 微光奔涌', description: '上行主题与柔和的六/九和弦，发现后更舒展、明亮。',
        transpose: 2, leadGain: 0.19, driveGain: 0.15, rushGain: 0.34, bassGain: 0.23, style: 1 },
    pursuit: { title: 'C · 最后航线', description: '切分推进保留行动感，发现后用明确的大调落点回应。',
        transpose: -2, leadGain: 0.18, driveGain: 0.16, rushGain: 0.36, bassGain: 0.27, style: 2 },
};
export type VariantName = keyof typeof VARIANTS;
export const DEFAULT_VARIANT: VariantName = 'undertow';
export const SCORE = {
    title: 'Signal Below VI', bpm: 120, beatsPerBar: 4, bars: 8,
    sampleRate: 24000, duration: 16, masterGain: 0.78,
    pulseDivisions: [0, 0.25, 0.5, 1, 2, 10],
    // 五级重新编排前景：底轨/第四轨让位，保留低频驱动，不只是整体加音量。
    levelMixes: [
        [1, 0, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0], [1, 1, 1, 0, 0, 0],
        [1, 1, 1, 1, 0, 0], [1, 1, 1, 1, 1, 0], [0.72, 0.78, 0.9, 1, 0.55, 1],
    ],
    stems: ['bed', 'beacon', 'bass', 'drums', 'arp', 'spark'] as const,
    labels: ['电子弦乐主题', '深处信标 · 30/min', '低弦与低音 · 60/min',
        '重鼓推进 · 120/min', '弦乐疾行 · 240/min', '前景疾奏 · 1200/min'],
};
export type StemName = typeof SCORE.stems[number];
export type MusicMood = 'search' | 'found' | 'return';
export const THEME_TRACKS = ['bed', 'bedFound', 'bedReturn'] as const;
export const WARM_LAYER_TRACKS = ['beaconFound', 'bassFound', 'arpFound', 'sparkFound'] as const;
export type ScoreTrack = StemName | 'bedFound' | 'bedReturn' | typeof WARM_LAYER_TRACKS[number];
export const PHRASE_BEATS = 8; // 每两小节一组：主题问句/答句与和声换位，共0/8/16/24拍四个入口。
export const DISCOVERY_CROSSFADE = 0.30;
export const RETURN_CROSSFADE = 0.65;
type Voice = 'strings' | 'lead' | 'sonar' | 'cello' | 'bass' | 'kick' | 'snare' | 'hat' | 'drive' | 'rush' | 'veil' | 'horizon' | 'home';
interface Note { beat: number; midi: number; length: number; amp: number; voice: Voice; }
const TAU = Math.PI * 2;
const roots = [38, 34, 43, 33]; // Dm(add9) / Bbmaj7 / Gm / A7；属和弦保留渴望与张力。
const chords = [[50, 53, 57, 64], [46, 50, 53, 57], [43, 50, 53, 58], [45, 52, 55, 61]];
// 发现后的完整配器共同换和声，不能只换底轨、让小调低音继续压在下面。
const warmHarmonies = [
    { roots: [41, 40, 34, 36], chords: [[53,57,60,67], [52,55,60,64], [50,53,57,60], [53,57,60,65]] }, // F(add9)/C-E/Bbmaj9/F-C
    { roots: [41, 33, 34, 36], chords: [[53,57,60,67], [48,52,55,60], [50,53,57,60], [48,52,55,57]] }, // F(add9)/Am7/Bbmaj9/C6
    { roots: [41, 34, 43, 41], chords: [[53,57,60,65], [50,53,55,60], [50,53,57,62], [53,57,60,67]] }, // F/Bb6-9/Gm9(no3)/F(add9)
];

// D小调的级数映射到F大调；保留开头节奏/轮廓，三音、六音、七音有实际改变。
function warmPitch(pitch: number): number {
    const map = [0,0,2,4,4,5,5,7,9,9,11,11];
    return 65 + Math.floor(pitch / 12) * 12 + map[((pitch % 12) + 12) % 12];
}

// 相对 D4 的主题旋律；三版的节奏、旋律轮廓与鼓型各不相同。
const melodies: number[][][] = [
    [[0,12,1.5],[1.5,7,0.5],[2,10,1],[3,12,1]], [[0,15,2],[2,14,1],[3,12,1]],
    [[0,12,1.5],[1.5,10,0.5],[2,8,2]], [[0,7,2],[2,3,1],[3,7,1]],
    [[0,8,1],[1,12,1],[2,15,2]], [[0,17,1.5],[1.5,15,0.5],[2,12,2]],
    [[0,14,2],[2,11,1],[3,9,1]], [[0,11,1],[1,14,1],[2,11,1],[3,7,1]],
];
const risingMelody: number[][][] = [
    [[0,7,1],[1,10,1],[2,12,2]], [[0,14,1],[1,15,3]],
    [[0,15,2],[2,12,1],[3,10,1]], [[0,8,3],[3,7,1]],
    [[0,8,1],[1,12,1],[2,15,1],[3,17,1]], [[0,20,2],[2,19,1],[3,17,1]],
    [[0,14,1],[1,11,1],[2,7,2]], [[0,11,2],[2,14,1],[3,19,1]],
];
const urgentMelody: number[][][] = [
    [[0,0,1.5],[1.5,7,0.5],[2,12,1],[3,10,1]], [[0,12,1],[1,14,0.5],[1.5,15,1],[2.5,14,1.5]],
    [[0,8,1.5],[1.5,12,0.5],[2,15,1],[3,12,1]], [[0,10,1],[1,8,1],[2,7,2]],
    [[0,3,0.75],[0.75,8,0.75],[1.5,12,0.5],[2,15,2]], [[0,17,1],[1,15,1],[2,12,1],[3,8,1]],
    [[0,7,1.5],[1.5,11,0.5],[2,14,1],[3,11,1]], [[0,14,1],[1,11,1],[2,7,1],[3,11,1]],
];

export function notesFor(stem: ScoreTrack, variant: VariantName = DEFAULT_VARIANT): Note[] {
    const notes: Note[] = [], cfg = VARIANTS[variant];
    const warm = stem === 'bedFound' || stem === 'bedReturn' || (WARM_LAYER_TRACKS as readonly string[]).indexOf(stem) >= 0;
    const part = stem.replace('Found', '');
    const add = (beat: number, midi: number, length: number, amp: number, voice: Voice) =>
        notes.push({ beat, midi: midi + cfg.transpose, length, amp, voice });
    for (let bar = 0; bar < SCORE.bars; bar++) {
        const b = bar * 4, c = Math.floor(bar / 2);
        const chord = warm ? warmHarmonies[cfg.style].chords[c] : chords[c];
        const root = warm ? warmHarmonies[cfg.style].roots[c] : roots[c];
        if (stem === 'bed' || stem === 'bedFound' || stem === 'bedReturn') {
            const searching = stem === 'bed', returning = stem === 'bedReturn';
            if (bar % 2 === 0) {
                // 寻找保留小调悬念；发现/返程真正换成F大调和声（B/C随版本移调）。
                if (searching) {
                    [root + 12, root + 19, chord[3]].forEach((n, i) => add(b, n, 8, i ? 0.025 : 0.055, 'strings'));
                    add(b, root, 8, 0.045, 'cello');
                } else {
                    const voicing = [chord[0], chord[1], chord[2] + 12, chord[3]];
                    voicing.forEach((n, i) => add(b, n, 8, (returning ? 0.036 : 0.045) * (i ? 0.8 : 1), 'strings'));
                    add(b, root + 12, 8, returning ? 0.065 : 0.05, 'cello');
                }
            }
            const melody = cfg.style === 1 ? risingMelody : cfg.style === 2 ? urgentMelody : melodies;
            // 保留开头动机，句尾改成和弦音并延长；返程末句落回主音，形成释放。
            // 问句保留原动机；答句删去末尾碎音，让第二个音落定并延伸到句末。
            const line = !searching && bar % 2 === 1 ? melody[bar].slice(0, 2) : melody[bar];
            line.forEach(([at, pitch, length], index) => {
                let midi = searching ? 50 + pitch : warmPitch(pitch);
                let held = length;
                if (!searching && index === line.length - 1) {
                    const pitchClass = returning && bar === 7 ? 5 : chord[bar % 2 === 0 ? 1 : 0] % 12;
                    midi += ((pitchClass - midi % 12 + 18) % 12) - 6;
                    held = 4 - at;
                }
                add(b + at, midi, held,
                    cfg.leadGain * (searching ? 0.86 : returning ? 0.95 : 1.08) * (at === 0 ? 1 : 0.88),
                    searching ? 'veil' : returning ? 'home' : 'horizon');
            });
            if (!searching && !returning && bar % 2 === 1) {
                add(b + 2.5, chord[1] + 12, 1.5, cfg.leadGain * 0.14, 'strings');
            }
        } else if (part === 'beacon') {
            add(b, chord[0] + 12, 1.6, 0.17, 'sonar');
            add(b + 0.22, root + 12, 0.65, 0.07, 'sonar');
        } else if (part === 'bass') {
            for (let i = 0; i < 2; i++) {
                add(b + i * 2, root, 1.5, cfg.bassGain * (i ? 0.9 : 1), 'bass');
                add(b + i * 2, root + 12, 1.2, 0.09, 'cello');
            }
        } else if (part === 'drums') {
            const kicks = cfg.style === 2 ? [0, 1.5, 2, 2.75] : [0, 1, 2, 3];
            kicks.forEach(i => add(b + i, 0, 0.65, 0.39, 'kick'));
            [1, 3].forEach(i => add(b + i, 0, 0.4, cfg.style === 2 ? 0.25 : 0.2, 'snare'));
            [0.5, 1.5, 2.5, 3.5].forEach(i => add(b + i, 0, 0.13, 0.065, 'hat'));
        } else if (part === 'arp') {
            const order = cfg.style === 1 ? [0, 1, 2, 3, 2, 3, 2, 1] : [0, 2, 1, 2, 0, 3, 2, 1];
            order.forEach((n, i) => {
                add(b + i / 2, chord[n] + 12, 0.36, cfg.driveGain * (i % 2 ? 0.82 : 1), 'drive');
                add(b + i / 2, root + 12, 0.3, 0.075, 'bass');
            });
            if (bar % 2 === 0) [chord[0] + 24, chord[2] + 12].forEach(n => add(b, n, 8, 0.037, 'strings'));
            for (let i = 0; i < 8; i++) add(b + i / 2 + 0.25, 0, 0.18, 0.06, 'hat');
            if (bar % 2) [2.75, 3.5, 3.75].forEach(i => add(b + i, 0, 0.22, 0.1, 'snare'));
        } else {
            // 1200 次/min 的有音高疾奏；五音分组重复两次，重音锚定四拍结构。
            const order = cfg.style === 1 ? [0, 1, 2, 3, 2] : cfg.style === 2 ? [2, 0, 1, 3, 1] : [0, 2, 1, 3, 2];
            for (let i = 0; i < 40; i++) {
                const accent = i % 10 === 0 ? 1.1 : i % 5 === 0 ? 0.98 : 0.8;
                add(b + i / 10, chord[order[i % 5]] + 24, 0.074, cfg.rushGain * accent, 'rush');
            }
            for (let i = 0; i < 32; i++) add(b + i / 8, 0, 0.07, i % 4 ? 0.025 : 0.05, 'hat');
            const kicks = cfg.style === 2 ? [0.5, 1, 2.5, 3, 3.5] : [0.5, 1.5, 2.5, 3.5];
            kicks.forEach(i => add(b + i, 0, 0.4, 0.22, 'kick'));
            [1.75, 3.75].forEach(i => add(b + i, 0, 0.16, 0.085, 'snare'));
        }
    }
    return notes;
}

function partName(stem: ScoreTrack): string { return stem.replace('Found', ''); }

function stringWave(phase: number, t: number, freq: number, lead: boolean, rate: number): number {
    const vibrato = lead ? Math.sin(TAU * 5.3 * t) * Math.min(1, t / 0.22) * freq * 0.00065 : 0;
    let sum = 0;
    for (let h = 1; h <= (lead ? 7 : 5); h++) {
        if (freq * h > rate * 0.45) break;
        const weight = Math.exp(-h / (lead ? 4.5 : 2.8)) / h;
        sum += weight * (Math.sin(phase * h + vibrato * h) * 0.62
            + Math.sin(phase * h * 1.003 + 0.4) * 0.19
            + Math.sin(phase * h * 0.997 - 0.4) * 0.19);
    }
    return sum;
}

function* renderChunks(stem: ScoreTrack, rate: number, out: Float32Array, variant: VariantName): IterableIterator<void> {
    const notes = notesFor(stem, variant), beatSeconds = 60 / SCORE.bpm;
    for (let n = 0; n < notes.length; n++) {
        const note = notes[n], start = Math.round(note.beat * beatSeconds * rate);
        const freq = 440 * Math.pow(2, (note.midi - 69) / 12), duration = note.length * beatSeconds;
        const melodic = ['lead', 'veil', 'horizon', 'home'].indexOf(note.voice) >= 0;
        const sustained = note.voice === 'strings' || melodic || note.voice === 'cello';
        const tail = note.voice === 'strings' ? 0.7 : melodic ? 0.24 : note.voice === 'rush' ? 0.012 : sustained ? 0.18 : 0.07;
        const total = duration + tail;
        let seed = (n + 1) * 7187, prevNoise = 0;
        for (let i = 0; i < Math.ceil(total * rate); i++) {
            const t = i / rate, phase = TAU * freq * t;
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
            const noise = (seed >>> 0) / 2147483648 - 1;
            let v = 0;
            if (note.voice === 'strings' || melodic) {
                const lead = melodic;
                const attack = Math.min(1, t / (note.voice === 'veil' ? 0.10 : note.voice === 'home' ? 0.065 : lead ? 0.035 : 0.32));
                const end = t > duration ? Math.max(0, 1 - (t - duration) / tail) : 1;
                const swell = lead ? 0.92 + 0.08 * Math.sin(t * 3) : 0.8 + 0.2 * Math.min(1, t / 1.6);
                let tone = stringWave(phase, t, freq, lead, rate);
                if (note.voice === 'veil') tone = tone * 0.4 + Math.sin(phase) * 0.38 + Math.sin(phase * 2) * 0.05;
                if (note.voice === 'horizon') tone = tone * 0.95 + Math.sin(phase * 2.001) * 0.09;
                if (note.voice === 'home') tone = tone * 0.45 + Math.sin(phase) * 0.35 + Math.sin(phase * 2) * 0.07;
                v = tone * attack * end * swell;
            } else if (note.voice === 'cello') {
                const env = Math.min(1, t / 0.035) * Math.min(1, Math.max(0, (total - t) / 0.2));
                v = env * (Math.sin(phase) * 0.65 + Math.sin(phase * 2.002) * 0.24
                    + Math.sin(phase * 3) * 0.13 + Math.sin(phase * 4) * 0.06);
            } else if (note.voice === 'sonar') {
                v = Math.min(1, t / 0.006) * Math.exp(-t * 5) *
                    (Math.sin(phase + Math.sin(phase * 0.5) * Math.exp(-t * 8) * 1.1) * 0.8
                    + Math.sin(phase * 2) * 0.12);
            } else if (note.voice === 'bass') {
                const env = Math.min(1, t / 0.006) * Math.exp(-t * 5.2);
                v = Math.tanh((Math.sin(phase) * 0.85 + Math.sin(phase * 2) * 0.24
                    + Math.sin(phase * 3) * 0.12) * 1.7) * env;
            } else if (note.voice === 'kick') {
                const p = TAU * (46 * t + 110 * (1 - Math.exp(-t * 34)) / 34);
                v = Math.min(1, t / 0.0015) * (Math.tanh(Math.sin(p) * 1.8) * Math.exp(-t * 13)
                    + noise * Math.exp(-t * 180) * 0.19);
            } else if (note.voice === 'snare') {
                v = Math.min(1, t / 0.001) * ((noise - prevNoise * 0.4) * 0.75 * Math.exp(-t * 24)
                    + Math.sin(TAU * 185 * t) * Math.exp(-t * 30) * 0.35);
            } else if (note.voice === 'hat') {
                v = (noise - prevNoise) * 0.5 * Math.exp(-t * (duration > 0.07 ? 35 : 95))
                    * Math.min(1, t / 0.001);
            } else if (note.voice === 'rush') {
                // 前景金属/锯齿疾奏：突出二至五次泛音，缩短每次发声以保留 50ms 间隔。
                // 不用 tanh 产生不可控的超奈奎斯特泛音；逐谐波截断。
                let tone = 0;
                const weights = [0.28, 0.48, 0.37, 0.24, 0.13, 0.07];
                for (let h = 1; h <= weights.length; h++) {
                    if (freq * h > rate * 0.44) break;
                    tone += weights[h - 1] * (Math.sin(phase * h) * 0.8
                        + Math.sin(phase * h * 1.004) * 0.2);
                }
                const env = Math.min(1, t / 0.0008) * Math.exp(-t * 52);
                v = tone * env + (noise - prevNoise) * 0.12 * Math.exp(-t * 420) * Math.min(1, t / 0.0006);
            } else {
                const env = Math.min(1, t / 0.002) * Math.exp(-t * 13);
                v = Math.tanh((Math.sin(phase) + 0.48 * Math.sin(phase * 2.001)
                    + 0.29 * Math.sin(phase * 3) + 0.16 * Math.sin(phase * 4)
                    + 0.09 * Math.sin(phase * 5)) * 1.25) * env;
            }
            prevNoise = noise;
            const beatPhase = ((start + i) / rate / beatSeconds) % 1;
            const duck = partName(stem) === 'arp' ? 0.65 + 0.35 * Math.min(1, beatPhase * 7) : 1;
            const release = Math.min(1, Math.max(0, (total - t) / (note.voice === 'rush' ? 0.006 : 0.01)));
            const value = v * note.amp * duck * release;
            out[(start + i) % out.length] += value;
            if (melodic || note.voice === 'strings' || note.voice === 'drive' || note.voice === 'rush') {
                const wet = sustained ? 0.13 : note.voice === 'rush' ? 0.025 : 0.12;
                out[(start + i + Math.round(rate * 0.125)) % out.length] += value * wet;
                out[(start + i + Math.round(rate * 0.375)) % out.length] += value * wet * 0.7;
                out[(start + i + Math.round(rate * 0.625)) % out.length] += value * wet * 0.4;
            }
            if (i % 2048 === 2047) yield;
        }
    }
}

// 新主题含高音声部，循环边缘仅做2ms消点击，不承担层进入的渐强。
function finishThemeLoop(out: Float32Array, stem: ScoreTrack, rate: number): Float32Array {
    if (stem === 'bedFound' || stem === 'bedReturn') {
        const edge = Math.round(rate * 0.002);
        for (let i = 0; i < edge; i++) {
            const gain = Math.sin(i / edge * Math.PI / 2) ** 2;
            out[i] *= gain;
            out[out.length - 1 - i] *= gain;
        }
    }
    return out;
}

export function renderStem(stem: ScoreTrack, rate = SCORE.sampleRate, variant: VariantName = DEFAULT_VARIANT): Float32Array {
    const out = new Float32Array(Math.round(rate * SCORE.duration));
    const chunks = renderChunks(stem, rate, out, variant);
    while (!chunks.next().done) { /* 离线导出 */ }
    return finishThemeLoop(out, stem, rate);
}

export async function renderStemAsync(stem: ScoreTrack, variant: VariantName = DEFAULT_VARIANT): Promise<Float32Array> {
    const out = new Float32Array(SCORE.sampleRate * SCORE.duration);
    const chunks = renderChunks(stem, SCORE.sampleRate, out, variant);
    let done = false;
    while (!done) {
        const deadline = Date.now() + 5;
        do { done = !!chunks.next().done; } while (!done && Date.now() < deadline);
        if (!done) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return finishThemeLoop(out, stem, SCORE.sampleRate);
}

export function selectMusicLevel(intensity: number, previous: number, hysteresis = 0.03): number {
    if (!Number.isFinite(intensity) || intensity < 0) return 0;
    const x = Math.max(0, Math.min(1, intensity));
    let level = Math.max(1, Math.min(5, previous || 1));
    while (level < 5 && x >= level / 5 + hysteresis) level++;
    while (level > 1 && x < (level - 1) / 5 - hysteresis) level--;
    return level;
}

// 第五层只在谱面两小节乐句的起点进入；前面由过门准备，不在任意拍中途闯入。
export function musicTransition(from: number, to: number, settle = false): { gridBeats: number; fadeSeconds: number } {
    if (settle) return { gridBeats: 1, fadeSeconds: 1.5 };
    if (to < from) return { gridBeats: to < 5 && from === 5 ? 0 : 1, fadeSeconds: 0.5 };
    return { gridBeats: [1, 4, 2, 1, 4, PHRASE_BEATS][to], fadeSeconds: 0.006 };
}

// 距离只申请前四层；人物入镜授权第五层，历史 npcFound 不授权。
export function selectRescueMusicLevel(intensity: number, previous: number, targetVisible: boolean, hysteresis = 0.03): number {
    const distanceLevel = selectMusicLevel(intensity, Math.min(4, previous), hysteresis);
    return targetVisible ? 5 : Math.min(4, distanceLevel);
}
