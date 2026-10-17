import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { SCORE, DEFAULT_VARIANT, VARIANTS, VariantName, WARM_LAYER_TRACKS, renderStemAsync, selectRescueMusicLevel } from './AdaptiveScore';
import { AdaptiveCuePlayer, musicCueDuck, renderPhrasePickup, MusicCue } from './AdaptiveCues';
import { isRescueTargetVisible, rescueTargetEntrySeconds } from '../logic/NPCPerception';
import { AdaptiveMusicEngine, MusicClock } from './AdaptiveMusicEngine';

let ctx: any = null;
let engine: AdaptiveMusicEngine | null = null;
let preparing = false, failed = false, hidden = false, lifecycleBound = false;
let selected = 0;
let loadedVariant: VariantName | null = null;
let cues: AdaptiveCuePlayer | null = null;
let observedMaze: any = null, previousPhase = '', previousRescued = false;
let retiring: AdaptiveMusicEngine[] = [];
let cueStartedAt = -Infinity;
let lastVisibleAt = -Infinity;
let encountered = false;

function desiredVariant(): VariantName {
    const id = CONFIG.lifeDetector.music.variant;
    return Object.prototype.hasOwnProperty.call(VARIANTS, id) ? id as VariantName : DEFAULT_VARIANT;
}

function playCue(cue: MusicCue): void {
    if (!cues || hidden || state.audio.muted || !CONFIG.lifeDetector.music.eventCues) return;
    if (cue === 'death') cues.stop();
    cues.play(cue, loadedVariant || desiredVariant());
    cueStartedAt = ctx.currentTime;
}

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
            cues = new AdaptiveCuePlayer(ctx);
        }
        if (ctx.resume && ctx.state !== 'running') {
            const result = ctx.resume();
            if (result && result.catch) result.catch(() => { /* 等待下一次用户手势 */ });
        }
        if (!lifecycleBound && wxAny && wxAny.onHide) {
            lifecycleBound = true;
            wxAny.onHide(() => { hidden = true; if (engine) engine.stop(true); if (cues) cues.stop(); retiring.forEach(e => e.dispose()); retiring = []; });
            wxAny.onShow(() => { hidden = false; warmUpAdaptiveMusic(); });
        }
        if ((!engine || loadedVariant !== desiredVariant()) && !preparing) {
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
    const variant = desiredVariant();
    const buffers: any[] = [];
    for (const stem of [...SCORE.stems, 'bedFound', 'bedReturn', ...WARM_LAYER_TRACKS] as const) {
        const pcm = await renderStemAsync(stem, variant);
        const buffer = ctx.createBuffer(1, pcm.length, SCORE.sampleRate);
        buffer.getChannelData(0).set(pcm);
        buffers.push(buffer);
    }
    // 合成期间可以继续切换；只提交最新选择，旧音乐保持播放直到替代版本就绪。
    if (variant !== desiredVariant()) return;
    if (engine) { engine.stop(false, 0.5); retiring.push(engine); }
    const pcm = renderPhrasePickup();
    const pickup = ctx.createBuffer(1, pcm.length, SCORE.sampleRate);
    pickup.getChannelData(0).set(pcm);
    engine = new AdaptiveMusicEngine(ctx, buffers.slice(0, 6), buffers.slice(6, 8), buffers.slice(8), pickup, variant);
    loadedVariant = variant;
    selected = 0;
}

// 主循环每帧调用，独立检查 phase，防止 updateMaze 提前 return 后音乐残留。
export function updateAdaptiveMusic(detector: { active: boolean; currentIntensity: number }): void {
    try {
        const cfg = CONFIG.lifeDetector, maze = state.mazeRescue;
        if (ctx && !preparing && loadedVariant !== desiredVariant()) warmUpAdaptiveMusic();
        retiring = retiring.filter(e => { if (e.hasSources() && !hidden && !state.audio.muted) return true; e.dispose(); return false; });
        const visible = state.screen === 'mazeRescue' && maze && maze.phase === 'play' && isRescueTargetVisible();
        if (cues) {
            cues.setVolume(state.audio.muted || hidden || !cfg.music.eventCues ? 0 : cfg.music.cueVolume * CONFIG.audio.sfxVolume);
            if (state.audio.muted || hidden || !cfg.music.eventCues || state.screen !== 'mazeRescue') cues.stop();
        }
        if (maze !== observedMaze) {
            observedMaze = maze; encountered = false; lastVisibleAt = -Infinity; previousPhase = ''; previousRescued = !!(maze && maze.npcRescued);
        }
        if (visible) { encountered = true; lastVisibleAt = ctx ? ctx.currentTime : -Infinity; }
        if (state.screen === 'mazeRescue' && maze) {
            if (maze.phase === 'failed' && previousPhase !== 'failed') playCue('death');
            else if (maze.npcRescued && !previousRescued) playCue('secured');
            previousPhase = maze.phase; previousRescued = maze.npcRescued;
        }
        if (!engine) return;
        const playing = !hidden && cfg.enabled && cfg.music.enabled && state.screen === 'mazeRescue'
            && maze && maze.phase === 'play';
        if (!playing) { engine.stop(false, maze && maze.phase === 'failed' ? 0.06 : 0.35); engine.getClock(); selected = 0; return; }
        engine.start();
        // 救起后/范围外回到底轨，底轨整个下潜持续存在。
        const detecting = detector.active && state.npc && state.npc.active && !maze.npcRescued;
        const entrySeconds = rescueTargetEntrySeconds();
        const enteringFrame = !hidden && !maze.npcRescued && Number.isFinite(entrySeconds);
        // 实际入镜后的120ms短保持消除屏幕边缘抖动；预判失效则立即撤销，避免画外误高潮。
        const frameHeld = !maze.npcRescued && ctx.currentTime - lastVisibleAt < 0.12;
        selected = selectRescueMusicLevel(detecting ? detector.currentIntensity : -1, selected, !!visible || enteringFrame || frameHeld, cfg.music.hysteresis);
        const mood = maze.npcRescued ? 'return' : encountered || enteringFrame ? 'found' : 'search';
        engine.setLevel(selected, !!maze.npcRescued, mood, enteringFrame ? entrySeconds : undefined);
        engine.setVolume(state.audio.muted ? 0 : cfg.music.volume * CONFIG.audio.bgmVolume * musicCueDuck(ctx.currentTime - cueStartedAt));
    } catch (err) {
        failed = true;
        if (engine) engine.dispose(); engine = null;
        console.warn('[AdaptiveMusic] 播放失败，回退原探测音:', err);
    }
}

export function resetAdaptiveMusic(): void {
    selected = 0; cueStartedAt = lastVisibleAt = -Infinity; encountered = false;
    if (engine) engine.stop(true);
    if (cues) cues.stop();
    retiring.forEach(e => e.dispose()); retiring = [];
    previousPhase = ''; previousRescued = false;
}
