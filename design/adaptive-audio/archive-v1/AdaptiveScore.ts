// 原创电子音乐草案「Signal Below」。离线 WAV 和游戏内 PCM 共用同一份乐谱/合成器。
export const SCORE = {
    title: 'Signal Below', bpm: 120, beatsPerBar: 4, bars: 8,
    sampleRate: 24000, duration: 16,
    stems: ['bed', 'beacon', 'bass', 'drums', 'arp', 'spark'] as const,
    labels: ['旋律与水下和声', '稀疏信标 · 30/min', '低音脉冲 · 60/min',
        '推进鼓组 · 120/min', '八分琶音 · 240/min', '十六分细拍 · 480/min'],
};
export type StemName = typeof SCORE.stems[number];
type Voice = 'pad' | 'bell' | 'bass' | 'kick' | 'snare' | 'hat' | 'pluck';
interface Note { beat: number; midi: number; length: number; amp: number; voice: Voice; }
const TAU = Math.PI * 2;
const roots = [40, 36, 43, 38]; // Em9 / Cmaj9 / Gmaj9 / Dadd9，每和弦 2 小节
const chords = [[52, 55, 59, 66], [48, 52, 55, 62], [55, 59, 62, 69], [50, 54, 57, 64]];

function notesFor(stem: StemName): Note[] {
    const notes: Note[] = [];
    const add = (beat: number, midi: number, length: number, amp: number, voice: Voice) =>
        notes.push({ beat, midi, length, amp, voice });
    for (let bar = 0; bar < SCORE.bars; bar++) {
        const b = bar * 4, chord = chords[Math.floor(bar / 2)];
        if (stem === 'bed') {
            if (bar % 2 === 0) chord.forEach(n => add(b, n, 8, 0.033, 'pad'));
            // 慢速、留白的旋律，无鼓；所有节奏层关闭时仍可独立循环。
            const melody = [76, 71, 74, 76, 79, 78, 76, 74];
            add(b + (bar % 2 ? 1.5 : 0), melody[bar], 2.6, 0.065, 'bell');
        } else if (stem === 'beacon') {
            add(b, chord[2] + 12, 1.3, 0.12, 'bell');
        } else if (stem === 'bass') {
            add(b, roots[Math.floor(bar / 2)], 1.4, 0.15, 'bass');
            add(b + 2, roots[Math.floor(bar / 2)] + (bar % 2 ? 7 : 0), 1.2, 0.13, 'bass');
        } else if (stem === 'drums') {
            for (let i = 0; i < 4; i++) add(b + i, 0, 0.8, 0.27, 'kick');
            add(b + 1, 0, 0.35, 0.105, 'snare');
            add(b + 3, 0, 0.35, 0.12, 'snare');
        } else if (stem === 'arp') {
            const order = [0, 2, 1, 3, 2, 1, 3, 2];
            order.forEach((n, i) => add(b + i / 2, chord[n] + 12, 0.45,
                i % 2 ? 0.065 : 0.085, 'pluck'));
        } else {
            for (let i = 0; i < 16; i++) add(b + i / 4, 0, i % 4 === 2 ? 0.22 : 0.11,
                i % 4 === 2 ? 0.07 : (i % 2 ? 0.025 : 0.04), 'hat');
            // 每两拍一次高八度碎光，避免密集层只有白噪声。
            [0.75, 2.75].forEach((x, i) => add(b + x, chord[i + 1] + 24, 0.3, 0.038, 'pluck'));
        }
    }
    return notes;
}

// 分块生成，移动端每次只计算少量样本；尾音与延迟绕回循环开头，保留跨循环混响。
function* renderChunks(stem: StemName, rate: number, out: Float32Array): IterableIterator<void> {
    const notes = notesFor(stem);
    for (let n = 0; n < notes.length; n++) {
        const note = notes[n], start = Math.round(note.beat * 0.5 * rate);
        const freq = 440 * Math.pow(2, (note.midi - 69) / 12);
        const duration = note.length * 0.5;
        const total = duration + (note.voice === 'pad' ? 1 : 0.16);
        let seed = (n + 1) * 7187, prevNoise = 0;
        for (let i = 0; i < Math.ceil(total * rate); i++) {
            const t = i / rate, phase = TAU * freq * t;
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
            const noise = (seed >>> 0) / 2147483648 - 1;
            let v = 0;
            if (note.voice === 'pad') {
                const env = Math.min(1, t / 0.45) * Math.min(1, Math.max(0, (total - t) / 1.1));
                v = env * (Math.sin(phase) * 0.65 + Math.sin(phase * 1.002) * 0.2
                    + Math.sin(phase * 2) * 0.1 + Math.sin(phase * 3) * 0.05);
            } else if (note.voice === 'bell') {
                v = Math.min(1, t / 0.008) * Math.exp(-t * 3.4) *
                    (Math.sin(phase + 1.3 * Math.sin(phase * 2) * Math.exp(-t * 7))
                    + 0.14 * Math.sin(phase * 3)) * 0.85;
            } else if (note.voice === 'bass') {
                v = Math.min(1, t / 0.012) * Math.exp(-t * 4.8) *
                    (Math.sin(phase) * 0.75 + Math.sin(phase * 2) * 0.18 + Math.sin(phase * 3) * 0.07);
            } else if (note.voice === 'kick') {
                const p = TAU * (48 * t + (138 - 48) * (1 - Math.exp(-t * 32)) / 32);
                v = Math.min(1, t / 0.002) * (Math.sin(p) * Math.exp(-t * 11)
                    + noise * Math.exp(-t * 230) * 0.17);
            } else if (note.voice === 'snare') {
                v = Math.min(1, t / 0.001) * (noise * 0.8 * Math.exp(-t * 28)
                    + Math.sin(TAU * 185 * t) * Math.exp(-t * 35) * 0.3);
            } else if (note.voice === 'hat') {
                v = (noise - prevNoise) * 0.5 * Math.exp(-t * (duration > 0.1 ? 35 : 85))
                    * Math.min(1, t / 0.001);
            } else {
                v = Math.min(1, t / 0.003) * Math.exp(-t * 18) *
                    (Math.sin(phase + 0.9 * Math.sin(phase * 2) * Math.exp(-t * 22))
                    + Math.sin(phase * 2) * 0.16) * 0.85;
            }
            prevNoise = noise;
            // 节奏层轻微侧链，给底鼓腾空间；所有音轨使用固定增益，不逐轨归一化。
            const beatPhase = ((start + i) / rate * 2) % 1;
            const duck = (stem === 'bed' || stem === 'arp') ? 0.82 + 0.18 * Math.min(1, beatPhase * 5) : 1;
            const release = Math.min(1, Math.max(0, (total - t) / 0.008));
            const value = v * note.amp * duck * release;
            out[(start + i) % out.length] += value;
            if (note.voice === 'bell' || note.voice === 'pluck') {
                out[(start + i + Math.round(rate * 0.375)) % out.length] += value * 0.27;
                out[(start + i + Math.round(rate * 0.75)) % out.length] += value * 0.11;
            }
            if (i % 4096 === 4095) yield;
        }
    }
}

export function renderStem(stem: StemName, rate = SCORE.sampleRate): Float32Array {
    const out = new Float32Array(Math.round(rate * SCORE.duration));
    const chunks = renderChunks(stem, rate, out);
    while (!chunks.next().done) { /* 离线导出 */ }
    return out;
}

export async function renderStemAsync(stem: StemName): Promise<Float32Array> {
    const out = new Float32Array(SCORE.sampleRate * SCORE.duration);
    const chunks = renderChunks(stem, SCORE.sampleRate, out);
    let done = false;
    while (!done) {
        const deadline = Date.now() + 5;
        do { done = !!chunks.next().done; } while (!done && Date.now() < deadline);
        if (!done) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return out;
}

// 距离强度线性分档，3% 滞回避免在边界来回切换。范围外由调用方传入 -1。
export function selectMusicLevel(intensity: number, previous: number, hysteresis = 0.03): number {
    if (!Number.isFinite(intensity) || intensity < 0) return 0;
    const x = Math.max(0, Math.min(1, intensity));
    let level = Math.max(1, Math.min(5, previous || 1));
    while (level < 5 && x >= level / 5 + hysteresis) level++;
    while (level > 1 && x < (level - 1) / 5 - hysteresis) level--;
    return level;
}
