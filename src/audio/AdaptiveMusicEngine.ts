import { SCORE, MusicMood, VariantName, DEFAULT_VARIANT, PHRASE_BEATS, DISCOVERY_CROSSFADE, RETURN_CROSSFADE, musicTransition, planDiscoveryEntry, PICKUP_GAIN } from './AdaptiveScore';

export interface MusicClock {
    playing: boolean; level: number; requestedLevel: number;
    beat: number; bar: number; beatPhase: number; subdivisionPhase: number;
    pulse: number; bpm: number; entryWaitSeconds: number; mood: MusicMood; requestedMood: MusicMood;
    /** Audible transport, never integrated by the render loop. */
    beats: number; seconds: number; outputTime: number; trackGains: number[]; variant: VariantName; levelAgeSeconds: number;
}

// 所有 BufferSource 同一音频时间启动、始终循环。切档只操作 Gain，不重启文件。
export class AdaptiveMusicEngine {
    private sources: any[] = [];
    private gains: any[] = [];
    private master: any;
    private epoch = 0;
    private level = 0;
    private requested = 0;
    private mood: MusicMood = 'search';
    private requestedMood: MusicMood = 'search';
    private pending: { level: number; mood: MusicMood; at: number } | null = null;
    private envelopes: { from: number; to: number; start: number; end: number }[][] = [];
    private pickup: { source: any; gain: any } | null = null;
    private masterTarget = -1;
    private stoppedAt = 0;
    private visualTimeline: { at: number; level: number; mood: MusicMood }[] = [];
    constructor(private ctx: any, private buffers: any[], private themes: any[] = [], private warmLayers: any[] = [], private pickupBuffer?: any, private variant: VariantName = DEFAULT_VARIANT) {
        if (buffers.length !== SCORE.stems.length || (themes.length !== 0 && themes.length !== 2) || (warmLayers.length !== 0 && (warmLayers.length !== 4 || themes.length !== 2)) || [...buffers, ...themes, ...warmLayers].some(b => Math.abs(b.duration - SCORE.duration) > 1 / SCORE.sampleRate)) {
            throw new Error('音乐必须有六轨，可选两条主题变体；均为16秒循环');
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
        this.mood = this.requestedMood = 'search';
        this.pending = null;
        this.stoppedAt = 0;
        this.envelopes = [];
        this.visualTimeline = [{ at: this.epoch, level: 0, mood: 'search' }];
        [...this.buffers, ...this.themes, ...this.warmLayers].forEach((buffer, i) => {
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
            this.envelopes.push([{ from: 0, to: i === 0 ? 1 : 0, start: this.epoch, end: this.epoch + 0.5 }]);
        });
        this.gains[0].gain.setValueAtTime(0, this.epoch);
        this.gains[0].gain.linearRampToValueAtTime(1, this.epoch + 0.5);
        this.sources.forEach(source => source.start(this.epoch));
    }

    setVolume(value: number): void {
        const target = Math.max(0, Math.min(1, value));
        if (target === this.masterTarget || (this.stoppedAt && target > 0)) return;
        const now = this.ctx.currentTime;
        const p = this.master.gain;
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(target, now + 0.04);
        this.masterTarget = target;
    }

    setLevel(value: number, settle = false, mood?: MusicMood, secondsUntilEntry?: number): void {
        this.flush();
        const target = Number.isFinite(value) ? Math.max(0, Math.min(5, Math.round(value))) : 0;
        const nextMood = mood || (settle ? 'return' : target === 5 ? 'found' : this.requestedMood);
        if (!this.sources.length || this.stoppedAt) return;
        if (target === this.requested && nextMood === this.requestedMood) {
            // 恒速预判不会反复排队；只有到达估计明显偏移才修正尚未播放的入口。
            if (target !== 5 || !this.pending || secondsUntilEntry === undefined
                || this.pending.at - this.ctx.currentTime < 0.08) return;
            const revised = planDiscoveryEntry(this.ctx.currentTime, this.epoch, secondsUntilEntry);
            if (!(secondsUntilEntry > this.pending.at - this.ctx.currentTime + 0.25 || revised < this.pending.at - 0.3)) return;
        }
        this.cancelPickup();
        this.requested = target;
        this.requestedMood = nextMood;
        const now = this.ctx.currentTime;
        const plan = musicTransition(this.level, target, settle);
        const themeChanged = this.mood !== nextMood;
        const gridBeats = themeChanged ? (nextMood === 'found' ? 2 : 1) : plan.gridBeats;
        const grid = gridBeats * 60 / SCORE.bpm;
        const at = target === 5 || (themeChanged && nextMood === 'found') ? planDiscoveryEntry(now, this.epoch, secondsUntilEntry) : gridBeats === 0 ? now + 0.025
            : this.epoch + Math.max(0, Math.ceil((now + 0.025 - this.epoch) / grid)) * grid;
        const mix = SCORE.levelMixes[target];
        const activeTheme = this.themes.length ? { search: 0, found: 6, return: 7 }[nextMood] : 0;
        const warm = nextMood !== 'search' && this.warmLayers.length > 0;
        const layerSlots = warm ? [activeTheme, 8, 9, 3, 10, 11] : [activeTheme, 1, 2, 3, 4, 5];
        const nextMix = this.gains.map((_, i) => {
            const slot = layerSlots.indexOf(i);
            return slot < 0 ? 0 : mix[slot];
        });
        for (let i = 0; i < this.gains.length; i++) {
            const p = this.gains[i].gain;
            let current = this.envelopes[i][0].from;
            for (const e of this.envelopes[i]) {
                if (now < e.start) break;
                const fraction = Math.max(0, Math.min(1, (now - e.start) / (e.end - e.start)));
                current = e.from + (e.to - e.from) * fraction;
            }
            // 自己求当前包络，兼容没有 cancelAndHoldAtTime 的微信实现。
            p.cancelScheduledValues(now);
            p.setValueAtTime(current, now);
            let from = current;
            const envelopes = [];
            if (i === 0 && now < this.epoch + 0.5 && at >= this.epoch + 0.5) {
                // 等小节期间照常完成底轨首次淡入，不把它拉长到下一个小节。
                p.linearRampToValueAtTime(1, this.epoch + 0.5);
                envelopes.push({ from: current, to: 1, start: now, end: this.epoch + 0.5 });
                from = 1;
            }
            p.setValueAtTime(from, at);
            const recoloring = themeChanged && (i === 0 || i === 6 || i === 7 || ((nextMood === 'found' || this.mood === 'search') && i !== 3));
            const fade = target === 5 && (i === 5 || i === 11) ? plan.fadeSeconds : recoloring ? (nextMood === 'return' ? RETURN_CROSSFADE : DISCOVERY_CROSSFADE) : plan.fadeSeconds;
            p.linearRampToValueAtTime(nextMix[i], at + fade);
            envelopes.push({ from, to: nextMix[i], start: at, end: at + fade });
            // Retain the short audible past: currentTime can lead the speaker by a buffer.
            const history = this.envelopes[i].filter(e => e.start < now && e.end > now - 1).map(e => ({
                ...e, to: e.end > now ? current : e.to, end: Math.min(e.end, now),
            }));
            this.envelopes[i] = [...history, ...envelopes];
        }
        if (target === 5 && this.level < 5 && this.pickupBuffer && at - now >= 0.12) {
            const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
            source.buffer = this.pickupBuffer;
            gain.gain.value = PICKUP_GAIN;
            source.connect(gain); gain.connect(this.master);
            const start = Math.max(now + 0.025, at - this.pickupBuffer.duration);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(PICKUP_GAIN, Math.min(at, start + 0.012));
            source.start(start, Math.max(0, start - (at - this.pickupBuffer.duration)));
            source.stop(at);
            const pickup = { source, gain };
            this.pickup = pickup;
            source.onended = () => {
                source.disconnect(); gain.disconnect();
                if (this.pickup === pickup) this.pickup = null;
            };
        }
        this.pending = { level: target, mood: nextMood, at };
        this.visualTimeline = this.visualTimeline.filter(e => e.at <= now);
        this.visualTimeline.push({ at, level: target, mood: nextMood });
        if (this.visualTimeline.length > 16) this.visualTimeline.shift();
    }

    private cancelPickup(): void {
        if (!this.pickup) return;
        try { this.pickup.source.stop(); this.pickup.source.disconnect(); this.pickup.gain.disconnect(); } catch (_) { /* 已结束 */ }
        this.pickup = null;
    }

    private flush(): void {
        if (this.pending && this.ctx.currentTime >= this.pending.at) {
            this.level = this.pending.level;
            this.mood = this.pending.mood;
            this.pending = null;
        }
        if (this.stoppedAt && this.ctx.currentTime >= this.stoppedAt) this.releaseSources();
    }

    stop(immediate = false, fadeSeconds = 0.35): void {
        if (!this.sources.length || (this.stoppedAt && !immediate)) return;
        this.cancelPickup();
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(this.master.gain.value, now);
        this.master.gain.linearRampToValueAtTime(0, now + (immediate ? 0 : fadeSeconds));
        this.masterTarget = 0;
        this.stoppedAt = now + (immediate ? 0 : fadeSeconds + 0.02);
        // 即使游戏下一帧不再执行，也由音频时钟停止。
        this.sources.forEach(source => { try { source.stop(this.stoppedAt); } catch (_) { /* 已停止 */ } });
        if (immediate) this.releaseSources();
    }

    private releaseSources(): void {
        this.cancelPickup();
        this.sources.forEach(s => { try { s.disconnect(); } catch (_) { /* 已释放 */ } });
        this.gains.forEach(g => g.disconnect());
        this.sources = []; this.gains = []; this.pending = null;
        this.level = this.requested = 0;
        this.stoppedAt = 0;
    }

    secondsToNextBeat(): number {
        const beat = 60 / SCORE.bpm;
        const at = this.epoch + Math.max(0, Math.ceil((this.ctx.currentTime + 0.025 - this.epoch) / beat)) * beat;
        return Math.max(0, at - this.ctx.currentTime);
    }

    secondsToNextPhrase(): number {
        const seconds = PHRASE_BEATS * 60 / SCORE.bpm;
        const at = this.epoch + Math.max(0, Math.ceil((this.ctx.currentTime + 0.025 - this.epoch) / seconds)) * seconds;
        return Math.max(0, at - this.ctx.currentTime);
    }

    hasSources(): boolean { this.flush(); return this.sources.length > 0; }

    private audibleTime(): number {
        // Browser output timestamp includes the hardware path; WeChat implementations
        // without it use their reported output/base latency, never an invented delay.
        if (this.ctx.getOutputTimestamp && typeof performance !== 'undefined') {
            try {
                const stamp = this.ctx.getOutputTimestamp();
                if (stamp && stamp.contextTime > 0 && stamp.performanceTime > 0) {
                    const age = (performance.now() - stamp.performanceTime) / 1000;
                    if (age >= 0 && age < 0.25) return Math.min(this.ctx.currentTime, Math.max(0, stamp.contextTime + age));
                }
            } catch (_) { /* Some WeChat contexts expose an unsupported method. */ }
        }
        const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
        return Math.max(0, this.ctx.currentTime - (Number.isFinite(latency) ? Math.max(0, latency) : 0));
    }

    getClock(): MusicClock {
        this.flush();
        const outputTime = this.audibleTime();
        const playing = this.sources.length > 0 && !this.stoppedAt && outputTime >= this.epoch && this.ctx.state !== 'suspended' && this.ctx.state !== 'closed';
        const seconds = playing ? outputTime - this.epoch : 0;
        const beats = seconds * SCORE.bpm / 60;
        let level = 0, mood: MusicMood = 'search', levelAt = this.epoch;
        for (const event of this.visualTimeline) if (event.at <= outputTime) {
            if (event.level !== level) levelAt = event.at;
            level = event.level; mood = event.mood;
        }
        const trackGains = this.envelopes.map(events => {
            let value = events.length ? events[0].from : 0;
            for (const e of events) {
                if (outputTime < e.start) break;
                const t = e.end > e.start ? Math.max(0, Math.min(1, (outputTime - e.start) / (e.end - e.start))) : 1;
                value = e.from + (e.to - e.from) * t;
            }
            return playing ? value : 0;
        });
        const divisions = SCORE.pulseDivisions[level];
        const phase = (beats * divisions) % 1;
        return { playing, level, requestedLevel: this.requested, beats, seconds, outputTime, trackGains, variant: this.variant, levelAgeSeconds: playing ? Math.max(0, outputTime - levelAt) : 0,
            beat: Math.floor(beats), bar: Math.floor(beats / 4) % SCORE.bars,
            beatPhase: beats % 1, subdivisionPhase: phase,
            pulse: playing && level > 0 ? Math.exp(-phase * 9) : 0, bpm: SCORE.bpm, entryWaitSeconds: this.pending ? Math.max(0, this.pending.at - outputTime) : 0, mood, requestedMood: this.requestedMood };
    }

    dispose(): void { this.stop(true); this.master.disconnect(); }
}
