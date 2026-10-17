import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { SCORE, renderStemAsync, selectMusicLevel } from './AdaptiveScore';
import { AdaptiveMusicEngine, MusicClock } from './AdaptiveMusicEngine';

let ctx: any = null;
let engine: AdaptiveMusicEngine | null = null;
let preparing = false, failed = false, hidden = false, lifecycleBound = false;
let selected = 0;

export function isAdaptiveMusicReady(): boolean { return !!engine && !failed; }
export function getAdaptiveMusicClock(): MusicClock | null { return engine ? engine.getClock() : null; }

// 必须从触摸/按键回调调用 resume；乐谱生成分块让出主线程，不读网络或云存储。
export function warmUpAdaptiveMusic(): void {
    const cfg = CONFIG.lifeDetector.music;
    if (!cfg.enabled || failed) return;
    try {
        const wxAny = typeof wx !== 'undefined' ? wx as any : null;
        if (!ctx) {
            const Ctor = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
            ctx = wxAny && wxAny.createWebAudioContext ? wxAny.createWebAudioContext() : (Ctor ? new Ctor() : null);
            if (!ctx) throw new Error('平台没有 Web Audio，继续使用原探测音');
        }
        if (ctx.resume && ctx.state !== 'running') {
            const result = ctx.resume();
            if (result && result.catch) result.catch(() => { /* 等待下一次用户手势 */ });
        }
        if (!lifecycleBound && wxAny && wxAny.onHide) {
            lifecycleBound = true;
            wxAny.onHide(() => { hidden = true; if (engine) engine.stop(true); });
            wxAny.onShow(() => { hidden = false; warmUpAdaptiveMusic(); });
        }
        if (!engine && !preparing) {
            preparing = true;
            prepare().catch(err => {
                failed = true;
                if (engine) engine.dispose();
                engine = null;
                if (ctx && ctx.close) {
                    const result = ctx.close();
                    if (result && result.catch) result.catch(() => { /* 已关闭 */ });
                }
                console.warn('[AdaptiveMusic] 初始化失败，回退原探测音:', err);
            }).then(() => { preparing = false; });
        }
    } catch (err) {
        failed = true;
        console.warn('[AdaptiveMusic] 不可用，回退原探测音:', err);
    }
}

async function prepare(): Promise<void> {
    const buffers: any[] = [];
    for (const stem of SCORE.stems) {
        const pcm = await renderStemAsync(stem);
        const buffer = ctx.createBuffer(1, pcm.length, SCORE.sampleRate);
        buffer.getChannelData(0).set(pcm);
        buffers.push(buffer);
    }
    engine = new AdaptiveMusicEngine(ctx, buffers);
}

// 主循环每帧调用，独立检查 phase，防止 updateMaze 提前 return 后音乐残留。
export function updateAdaptiveMusic(detector: { active: boolean; currentIntensity: number }): void {
    if (!engine) return;
    try {
        const cfg = CONFIG.lifeDetector, maze = state.mazeRescue;
        const playing = !hidden && cfg.enabled && cfg.music.enabled && state.screen === 'mazeRescue'
            && maze && maze.phase === 'play';
        if (!playing) { engine.stop(); engine.getClock(); selected = 0; return; }
        engine.start();
        // 救起后/范围外回到底轨，底轨整个下潜持续存在。
        const detecting = detector.active && state.npc && state.npc.active && !maze.npcRescued;
        selected = selectMusicLevel(detecting ? detector.currentIntensity : -1, selected, cfg.music.hysteresis);
        engine.setLevel(selected);
        engine.setVolume(state.audio.muted ? 0 : cfg.music.volume * CONFIG.audio.bgmVolume);
    } catch (err) {
        failed = true;
        engine.dispose(); engine = null;
        console.warn('[AdaptiveMusic] 播放失败，回退原探测音:', err);
    }
}

export function resetAdaptiveMusic(): void {
    selected = 0;
    if (engine) engine.stop(true);
}
