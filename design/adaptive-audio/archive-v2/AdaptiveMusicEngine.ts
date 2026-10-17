import { SCORE } from './AdaptiveScore';

export interface MusicClock {
    playing: boolean; level: number; requestedLevel: number;
    beat: number; bar: number; beatPhase: number; subdivisionPhase: number;
    pulse: number; bpm: number;
}

// 所有 BufferSource 同一音频时间启动、始终循环。切档只操作 Gain，不重启文件。
export class AdaptiveMusicEngine {
    private sources: any[] = [];
    private gains: any[] = [];
    private master: any;
    private epoch = 0;
    private level = 0;
    private requested = 0;
    private pending: { level: number; at: number } | null = null;
    private masterTarget = -1;
    private stoppedAt = 0;
    constructor(private ctx: any, private buffers: any[]) {
        if (buffers.length !== SCORE.stems.length || buffers.some(b => Math.abs(b.duration - SCORE.duration) > 1 / SCORE.sampleRate)) {
            throw new Error('音乐必须为六条相同长度的 16 秒循环');
        }
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(ctx.destination);
    }

    start(): void {
        this.flush();
        if (this.stoppedAt) this.releaseSources();
        if (this.sources.length) return;
        this.epoch = this.ctx.currentTime + 0.06;
        this.level = this.requested = 0;
        this.pending = null;
        this.stoppedAt = 0;
        this.buffers.forEach(buffer => {
            const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
            source.buffer = buffer;
            source.loop = true;
            source.loopStart = 0;
            source.loopEnd = SCORE.duration;
            gain.gain.value = 0;
            source.connect(gain);
            gain.connect(this.master);
            this.sources.push(source);
            this.gains.push(gain);
        });
        this.gains[0].gain.setValueAtTime(0, this.epoch);
        this.gains[0].gain.linearRampToValueAtTime(1, this.epoch + 0.5);
        this.sources.forEach(source => source.start(this.epoch));
    }

    setVolume(value: number): void {
        const target = Math.max(0, Math.min(1, value));
        if (target === this.masterTarget) return;
        const now = this.ctx.currentTime;
        const p = this.master.gain;
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(target, now + 0.04);
        this.masterTarget = target;
    }

    setLevel(value: number): void {
        this.flush();
        const target = Math.max(0, Math.min(5, Math.round(value)));
        // 已排入下拍的切换先完成；新的请求合并，避免边界抖动重复重写自动化。
        this.requested = target;
        if (!this.sources.length || this.pending || target === this.level || this.stoppedAt) return;
        const beat = 60 / SCORE.bpm, now = this.ctx.currentTime;
        const at = this.epoch + Math.max(0, Math.ceil((now + 0.025 - this.epoch) / beat)) * beat;
        for (let i = 1; i < this.gains.length; i++) {
            const p = this.gains[i].gain;
            p.cancelScheduledValues(at);
            p.setValueAtTime(i <= this.level ? 1 : 0, at);
            p.linearRampToValueAtTime(i <= target ? 1 : 0, at + 0.09);
        }
        this.pending = { level: target, at };
    }

    private flush(): void {
        if (this.pending && this.ctx.currentTime >= this.pending.at) {
            this.level = this.pending.level;
            this.pending = null;
        }
        if (this.stoppedAt && this.ctx.currentTime >= this.stoppedAt) this.releaseSources();
    }

    stop(immediate = false): void {
        if (!this.sources.length || (this.stoppedAt && !immediate)) return;
        this.setVolume(0);
        this.stoppedAt = this.ctx.currentTime + (immediate ? 0 : 0.06);
        // 即使游戏下一帧不再执行，也由音频时钟停止。
        this.sources.forEach(source => { try { source.stop(this.stoppedAt); } catch (_) { /* 已停止 */ } });
        if (immediate) this.releaseSources();
    }

    private releaseSources(): void {
        this.sources.forEach(s => { try { s.disconnect(); } catch (_) { /* 已释放 */ } });
        this.gains.forEach(g => g.disconnect());
        this.sources = []; this.gains = []; this.pending = null;
        this.level = this.requested = 0;
        this.stoppedAt = 0;
    }

    getClock(): MusicClock {
        this.flush();
        const playing = this.sources.length > 0 && !this.stoppedAt && this.ctx.currentTime >= this.epoch;
        const beats = playing ? (this.ctx.currentTime - this.epoch) * SCORE.bpm / 60 : 0;
        const divisions = SCORE.pulseDivisions[this.level];
        const phase = (beats * divisions) % 1;
        return { playing, level: this.level, requestedLevel: this.requested,
            beat: Math.floor(beats), bar: Math.floor(beats / 4) % SCORE.bars,
            beatPhase: beats % 1, subdivisionPhase: phase,
            pulse: playing && this.level > 0 ? Math.exp(-phase * 9) : 0, bpm: SCORE.bpm };
    }

    dispose(): void { this.stop(true); this.master.disconnect(); }
}
