// Signal Below v2：电子弦乐旋律 + 五层递增编排；第五层每拍十连音，20 次起音/秒。
export const VARIANTS = {
    undertow: { title: 'A · 深流', description: '幽暗弦乐与压迫脉冲，靠近后转为强推进的电子弦乐。',
        transpose: 0, leadGain: 0.17, driveGain: 0.14, rushGain: 0.13, bassGain: 0.25, style: 0 },
    flare: { title: 'B · 微光奔涌', description: '更长、更向上舒展的弦乐旋律，发现目标时突出激动和希望。',
        transpose: 2, leadGain: 0.19, driveGain: 0.15, rushGain: 0.12, bassGain: 0.23, style: 1 },
    pursuit: { title: 'C · 最后航线', description: '低弦短句、切分低音与碎拍，四五级突出争分夺秒的救援冲刺。',
        transpose: -2, leadGain: 0.18, driveGain: 0.16, rushGain: 0.14, bassGain: 0.27, style: 2 },
};
export type VariantName = keyof typeof VARIANTS;
export const DEFAULT_VARIANT: VariantName = 'undertow';
export const SCORE = {
    title: 'Signal Below II', bpm: 120, beatsPerBar: 4, bars: 8,
    sampleRate: 24000, duration: 16, masterGain: 0.78,
    pulseDivisions: [0, 0.25, 0.5, 1, 2, 10],
    stems: ['bed', 'beacon', 'bass', 'drums', 'arp', 'spark'] as const,
    labels: ['电子弦乐主题', '深处信标 · 30/min', '低弦与低音 · 60/min',
        '重鼓推进 · 120/min', '弦乐疾行 · 240/min', '十连音奔涌 · 1200/min'],
};
export type StemName = typeof SCORE.stems[number];
type Voice = 'strings' | 'lead' | 'sonar' | 'cello' | 'bass' | 'kick' | 'snare' | 'hat' | 'drive' | 'rush';
interface Note { beat: number; midi: number; length: number; amp: number; voice: Voice; }
const TAU = Math.PI * 2;
const roots = [38, 34, 43, 33]; // Dm(add9) / Bbmaj7 / Gm / A7；属和弦保留渴望与张力。
const chords = [[50, 53, 57, 64], [46, 50, 53, 57], [43, 50, 53, 58], [45, 52, 55, 61]];
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

export function notesFor(stem: StemName, variant: VariantName = DEFAULT_VARIANT): Note[] {
    const notes: Note[] = [], cfg = VARIANTS[variant];
    const add = (beat: number, midi: number, length: number, amp: number, voice: Voice) =>
        notes.push({ beat, midi: midi + cfg.transpose, length, amp, voice });
    for (let bar = 0; bar < SCORE.bars; bar++) {
        const b = bar * 4, c = Math.floor(bar / 2), chord = chords[c], root = roots[c];
        if (stem === 'bed') {
            if (bar % 2 === 0) {
                chord.forEach((n, i) => add(b, n, 8, i === 0 ? 0.048 : 0.034, 'strings'));
                add(b, root + 12, 8, 0.055, 'cello');
            }
            const melody = cfg.style === 1 ? risingMelody : cfg.style === 2 ? urgentMelody : melodies;
            melody[bar].forEach(([at, pitch, length]) => add(b + at, 62 + pitch,
                length, cfg.leadGain * (at === 0 ? 1 : 0.88), 'lead'));
        } else if (stem === 'beacon') {
            add(b, chord[0] + 12, 1.6, 0.17, 'sonar');
            add(b + 0.22, root + 12, 0.65, 0.07, 'sonar');
        } else if (stem === 'bass') {
            for (let i = 0; i < 2; i++) {
                add(b + i * 2, root, 1.5, cfg.bassGain * (i ? 0.9 : 1), 'bass');
                add(b + i * 2, root + 12, 1.2, 0.09, 'cello');
            }
        } else if (stem === 'drums') {
            const kicks = cfg.style === 2 ? [0, 1.5, 2, 2.75] : [0, 1, 2, 3];
            kicks.forEach(i => add(b + i, 0, 0.65, 0.39, 'kick'));
            [1, 3].forEach(i => add(b + i, 0, 0.4, cfg.style === 2 ? 0.25 : 0.2, 'snare'));
            [0.5, 1.5, 2.5, 3.5].forEach(i => add(b + i, 0, 0.13, 0.065, 'hat'));
        } else if (stem === 'arp') {
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
                const accent = i % 10 === 0 ? 1.15 : i % 5 === 0 ? 0.95 : 0.68;
                add(b + i / 10, chord[order[i % 5]] + 12, 0.085, cfg.rushGain * accent, 'rush');
            }
            for (let i = 0; i < 32; i++) add(b + i / 8, 0, 0.07, i % 4 ? 0.025 : 0.05, 'hat');
            const kicks = cfg.style === 2 ? [0.5, 1, 2.5, 3, 3.5] : [0.5, 1.5, 2.5, 3.5];
            kicks.forEach(i => add(b + i, 0, 0.4, 0.22, 'kick'));
            [1.75, 3.75].forEach(i => add(b + i, 0, 0.16, 0.085, 'snare'));
        }
    }
    return notes;
}

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

function* renderChunks(stem: StemName, rate: number, out: Float32Array, variant: VariantName): IterableIterator<void> {
    const notes = notesFor(stem, variant), beatSeconds = 60 / SCORE.bpm;
    for (let n = 0; n < notes.length; n++) {
        const note = notes[n], start = Math.round(note.beat * beatSeconds * rate);
        const freq = 440 * Math.pow(2, (note.midi - 69) / 12), duration = note.length * beatSeconds;
        const sustained = note.voice === 'strings' || note.voice === 'lead' || note.voice === 'cello';
        const tail = note.voice === 'strings' ? 0.7 : note.voice === 'lead' ? 0.24 : note.voice === 'rush' ? 0.012 : sustained ? 0.18 : 0.07;
        const total = duration + tail;
        let seed = (n + 1) * 7187, prevNoise = 0;
        for (let i = 0; i < Math.ceil(total * rate); i++) {
            const t = i / rate, phase = TAU * freq * t;
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
            const noise = (seed >>> 0) / 2147483648 - 1;
            let v = 0;
            if (note.voice === 'strings' || note.voice === 'lead') {
                const lead = note.voice === 'lead';
                const attack = Math.min(1, t / (lead ? 0.045 : 0.32));
                const end = t > duration ? Math.max(0, 1 - (t - duration) / tail) : 1;
                const swell = lead ? 0.92 + 0.08 * Math.sin(t * 3) : 0.8 + 0.2 * Math.min(1, t / 1.6);
                v = stringWave(phase, t, freq, lead, rate) * attack * end * swell;
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
            } else {
                const fast = note.voice === 'rush';
                const env = Math.min(1, t / 0.002) * (fast ? Math.exp(-t * 35) : Math.exp(-t * 13));
                v = Math.tanh((Math.sin(phase) + 0.48 * Math.sin(phase * 2.001)
                    + 0.29 * Math.sin(phase * 3) + 0.16 * Math.sin(phase * 4)
                    + 0.09 * Math.sin(phase * 5)) * 1.25) * env;
            }
            prevNoise = noise;
            const beatPhase = ((start + i) / rate / beatSeconds) % 1;
            const duck = stem === 'arp' || stem === 'spark' ? 0.65 + 0.35 * Math.min(1, beatPhase * 7) : 1;
            const release = Math.min(1, Math.max(0, (total - t) / (note.voice === 'rush' ? 0.006 : 0.01)));
            const value = v * note.amp * duck * release;
            out[(start + i) % out.length] += value;
            if (note.voice === 'lead' || note.voice === 'strings' || note.voice === 'drive' || note.voice === 'rush') {
                const wet = sustained ? 0.13 : note.voice === 'rush' ? 0.07 : 0.12;
                out[(start + i + Math.round(rate * 0.125)) % out.length] += value * wet;
                out[(start + i + Math.round(rate * 0.375)) % out.length] += value * wet * 0.7;
                out[(start + i + Math.round(rate * 0.625)) % out.length] += value * wet * 0.4;
            }
            if (i % 2048 === 2047) yield;
        }
    }
}

export function renderStem(stem: StemName, rate = SCORE.sampleRate, variant: VariantName = DEFAULT_VARIANT): Float32Array {
    const out = new Float32Array(Math.round(rate * SCORE.duration));
    const chunks = renderChunks(stem, rate, out, variant);
    while (!chunks.next().done) { /* 离线导出 */ }
    return out;
}

export async function renderStemAsync(stem: StemName, variant: VariantName = DEFAULT_VARIANT): Promise<Float32Array> {
    const out = new Float32Array(SCORE.sampleRate * SCORE.duration);
    const chunks = renderChunks(stem, SCORE.sampleRate, out, variant);
    let done = false;
    while (!done) {
        const deadline = Date.now() + 5;
        do { done = !!chunks.next().done; } while (!done && Date.now() < deadline);
        if (!done) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return out;
}

export function selectMusicLevel(intensity: number, previous: number, hysteresis = 0.03): number {
    if (!Number.isFinite(intensity) || intensity < 0) return 0;
    const x = Math.max(0, Math.min(1, intensity));
    let level = Math.max(1, Math.min(5, previous || 1));
    while (level < 5 && x >= level / 5 + hysteresis) level++;
    while (level > 1 && x < (level - 1) / 5 - hysteresis) level--;
    return level;
}
