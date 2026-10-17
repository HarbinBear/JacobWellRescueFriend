import { DEFAULT_VARIANT, SCORE, VARIANTS, VariantName } from './AdaptiveScore';

export type MusicCue = 'found' | 'secured' | 'death';
export const CUE_SECONDS = { found: 0.7, secured: 2.2, death: 6.4 };

// 原创合成。死亡先清楚duang一下，再下沉为遥远共鸣；乐句过门为无音高滚奏。
export function renderMusicCue(cue: MusicCue, variant: VariantName = DEFAULT_VARIANT): Float32Array {
    const rate = SCORE.sampleRate, seconds = CUE_SECONDS[cue];
    const out = new Float32Array(Math.round(rate * seconds));
    const tonic = 146.832 * Math.pow(2, VARIANTS[variant].transpose / 12);
    for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        let value = 0;
        if (cue === 'death') {
            // 手机也能辨认的中低频撞击主体；尾音仍可沉得很低，但起音不能消失。
            const strikePhase = 2 * Math.PI * tonic * (0.76 * t + 0.36 * (1 - Math.exp(-t * 18)) / 18);
            const strike = Math.min(1, t / 0.003) * Math.exp(-t * 2.9)
                * (Math.sin(strikePhase) * 0.43 + Math.sin(strikePhase * 2.71) * 0.24 * Math.exp(-t * 4.5)
                    + Math.sin(strikePhase * 4.03) * 0.12 * Math.exp(-t * 11));
            const base = tonic * 0.50;
            const fall = (u: number, ratio: number) => 2 * Math.PI * base * ratio
                * (0.73 * u + 0.27 * (1 - Math.exp(-u * 0.85)) / 0.85);
            const bloom = (u: number) => (1 - Math.exp(-u * 9)) ** 2 * Math.exp(-u * 0.52);
            // 明确撞击之后才是下坠的低频与远处共鸣。
            value = strike + bloom(t) * (Math.sin(fall(t, 1)) * 0.31
                + Math.sin(fall(t, 1.498) + Math.sin(t * 1.7) * 0.2) * 0.105
                + Math.sin(fall(t, 2.006)) * 0.055);
            [0.19, 0.43, 0.79].forEach((delay, n) => {
                const u = t - delay;
                if (u < 0) return;
                const distant = (1 - Math.exp(-u * 4)) ** 2 * Math.exp(-u * 0.68);
                value += distant * (Math.sin(fall(u, 2.99 + n * 0.007))
                    + Math.sin(fall(u, 4.004 + n * 0.009)) * 0.32) * 0.043 / (n + 1);
            });
        } else {
            const notes = cue === 'secured' ? [[0, 1, 0.25], [0.15, 1.5, 0.18], [0.3, 2, 0.10]]
                : [[0, 2, 0.14], [0.17, 3, 0.12]];
            notes.forEach(([at, ratio, gain]) => {
                const u = t - at;
                if (u < 0) return;
                const phase = 2 * Math.PI * tonic * ratio * u;
                value += (Math.sin(phase) + 0.16 * Math.sin(phase * 2.003)) * gain
                    * Math.min(1, u / 0.006) * Math.exp(-u * (cue === 'secured' ? 2.8 : 8));
            });
            if (cue === 'secured') {
                // 两下扣合声，用确定性高频瞬态，不依赖外部音效下载。
                [0, 0.065].forEach(at => {
                    const u = t - at;
                    if (u >= 0) value += Math.sin(2 * Math.PI * 1700 * u) * 0.11
                        * Math.min(1, u / 0.001) * Math.exp(-u * 160);
                });
            }
        }
        out[i] = value * Math.min(1, (seconds - t) / 0.18);
    }
    return out;
}

// 一小节的过门，最后一拍加密。无固定音高，避免与转调前和声相撞。
// 音源可从中途起播，排队时间不足一小节时只使用结尾一段。
export function renderPhrasePickup(): Float32Array {
    const rate = SCORE.sampleRate, duration = 4 * 60 / SCORE.bpm;
    const out = new Float32Array(Math.round(rate * duration));
    const beat = 60 / SCORE.bpm;
    const hits = [0, 1, 2, 2.5, 3, 3.25, 3.5, 3.75];
    let seed = 73491, smooth = 0;
    for (let i = 0; i < out.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const noise = (seed >>> 0) / 2147483648 - 1;
        smooth += (noise - smooth) * 0.22;
        const t = i / rate;
        let roll = 0;
        for (const hit of hits) {
            const u = t - hit * beat;
            if (u >= 0 && u < 0.16) roll += (smooth * 0.7 + Math.sin(2 * Math.PI * (180 * u + 18 * (1 - Math.exp(-u * 35)) / 35)) * 0.12)
                * Math.min(1, u / 0.002) * Math.exp(-u * 28) * (0.25 + 0.75 * t / duration);
        }
        const breath = (noise - smooth) * 0.035 * (t / duration) ** 2;
        out[i] = (roll + breath) * Math.min(1, t / 0.02, (duration - t) / 0.01);
    }
    return out;
}

// 独立于搜索音乐的总线；音乐停播后钟声仍可自然结束，静音/后台会停止所有尾音。
export class AdaptiveCuePlayer {
    private voices: any[] = [];
    private gain: any;
    constructor(private ctx: any) {
        this.gain = ctx.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(ctx.destination);
    }
    setVolume(value: number): void { this.gain.gain.value = Math.max(0, Math.min(1, value)); }
    play(cue: MusicCue, variant: VariantName): void {
        const pcm = renderMusicCue(cue, variant);
        const buffer = this.ctx.createBuffer(1, pcm.length, SCORE.sampleRate);
        buffer.getChannelData(0).set(pcm);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.gain);
        this.voices.push(source);
        source.onended = () => { source.disconnect(); this.voices = this.voices.filter(s => s !== source); };
        source.start(this.ctx.currentTime + 0.01);
    }
    stop(): void {
        this.voices.forEach(source => { try { source.stop(); source.disconnect(); } catch (_) { /* 已结束 */ } });
        this.voices = [];
    }
}
