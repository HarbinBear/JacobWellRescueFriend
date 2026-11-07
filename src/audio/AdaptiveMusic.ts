import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
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
let encountered = false, audibleEncounter = false;
let preparationProgress = 0;

function desiredVariant(): VariantName {
    const id = CONFIG.lifeDetector.music.variant;
    return Object.prototype.hasOwnProperty.call(VARIANTS, id) ? id as VariantName : DEFAULT_VARIANT;
}

export function getRescueMusicRange(): number {
    return (CONFIG.maze.npcRescueRange || 80) * (CONFIG.lifeDetector.music.encounterRangeMultiplier || 5);
}

function playCue(cue: MusicCue): void {
    if (!cues || !audibleEncounter || hidden || state.audio.muted || !CONFIG.lifeDetector.music.eventCues) return;
    if (cue === 'death') cues.stop();
    cues.play(cue, loadedVariant || desiredVariant());
    cueStartedAt = ctx.currentTime;
}

export function isAdaptiveMusicReady(): boolean { return !!engine && !failed; }
export function getAdaptiveMusicClock(): MusicClock | null { return engine ? engine.getClock() : null; }
export function getAdaptiveMusicPreparation(): { status: 'ready' | 'loading' | 'locked' | 'error'; progress: number } {
    if (!CONFIG.lifeDetector.music.enabled || !CONFIG.lifeDetector.enabled) return { status: 'ready', progress: 1 };
    if (failed) return { status: 'error', progress: preparationProgress };
    const ready = !!engine && loadedVariant === desiredVariant() && !preparing;
    const unlocked = ctx && (!ctx.state || ctx.state === 'running');
    return { status: ready ? unlocked && !hidden ? 'ready' : 'locked' : 'loading', progress: ready ? 1 : preparationProgress };
}
export function retryAdaptiveMusic(): void {
    if (ctx && ctx.state === 'closed') { ctx = null; engine = null; cues = null; loadedVariant = null; }
    failed = false;
    warmUpAdaptiveMusic();
}

// 用户手势只解锁音频；菜单、移动和工具输入不会重复触发乐谱生成。
export function unlockAdaptiveMusic(): void {
    if (!CONFIG.lifeDetector.enabled || !CONFIG.lifeDetector.music.enabled || failed) return;
    try {
        const wxAny = typeof wx !== 'undefined' ? wx as any : null;
        if (!ctx) {
            const Ctor = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
            ctx = wxAny && wxAny.createWebAudioContext ? wxAny.createWebAudioContext() : (Ctor ? new Ctor() : null);
            if (!ctx) throw new Error('平台没有 Web Audio');
            cues = new AdaptiveCuePlayer(ctx);
        }
        if (ctx.resume && ctx.state !== 'running') {
            const result = ctx.resume();
            if (result && result.catch) result.catch(() => { /* 等待下一次用户手势 */ });
        }
        if (!lifecycleBound && wxAny && wxAny.onHide) {
            lifecycleBound = true;
            wxAny.onHide(() => { hidden = true; if (engine) engine.stop(true); if (cues) cues.stop(); retiring.forEach(e => e.dispose()); retiring = []; });
            wxAny.onShow(() => { hidden = false; if (state.screen === 'mazeRescue') unlockAdaptiveMusic(); });
        }
    } catch (err) {
        failed = true;
        ctx = null; cues = null;
        console.warn('[AdaptiveMusic] 不可用，继续无音乐游玩:', err);
    }
}

// 下潜时后台准备一次，已生成的同一版本跨下潜复用；失败不阻塞游戏。
export function warmUpAdaptiveMusic(): void {
    unlockAdaptiveMusic();
    if (!ctx || failed || !CONFIG.lifeDetector.enabled || !CONFIG.lifeDetector.music.enabled || preparing
        || (engine && loadedVariant === desiredVariant())) return;
    preparing = true;
    preparationProgress = 0;
    prepare().catch(err => {
        failed = true;
        if (engine) engine.dispose();
        engine = null;
        if (ctx && ctx.close) {
            const result = ctx.close();
            if (result && result.catch) result.catch(() => { /* 已关闭 */ });
        }
        ctx = null; cues = null; loadedVariant = null;
        console.warn('[AdaptiveMusic] 准备失败，继续无音乐游玩:', err);
    }).then(() => { preparing = false; });
}

async function prepare(): Promise<void> {
    const variant = desiredVariant();
    const buffers: any[] = [];
    const tracks = [...SCORE.stems, 'bedFound', 'bedReturn', ...WARM_LAYER_TRACKS] as const;
    for (const stem of tracks) {
        const pcm = await renderStemAsync(stem, variant, progress => {
            preparationProgress = (buffers.length + progress) / (tracks.length + 1);
        });
        const buffer = ctx.createBuffer(1, pcm.length, SCORE.sampleRate);
        buffer.getChannelData(0).set(pcm);
        buffers.push(buffer);
        preparationProgress = buffers.length / (tracks.length + 1);
    }
    // 合成期间可以继续切换；只提交最新选择，旧音乐保持播放直到替代版本就绪。
    if (variant !== desiredVariant()) return;
    const pcm = renderPhrasePickup();
    const pickup = ctx.createBuffer(1, pcm.length, SCORE.sampleRate);
    pickup.getChannelData(0).set(pcm);
    const replacement = new AdaptiveMusicEngine(ctx, buffers.slice(0, 6), buffers.slice(6, 8), buffers.slice(8), pickup, variant);
    if (engine) { engine.stop(false, 0.5); retiring.push(engine); }
    engine = replacement;
    loadedVariant = variant;
    preparationProgress = 1;
    selected = 0;
}

// 主循环每帧调用。只有接近当前救援对象才开启音乐，不是全程底轨。
export function updateAdaptiveMusic(detector: { active: boolean; currentIntensity: number }): void {
    try {
        const cfg = CONFIG.lifeDetector, maze = state.mazeRescue;
        if (ctx && !preparing && loadedVariant !== desiredVariant() && state.screen === 'mazeRescue'
            && maze && (maze.phase === 'diving_in' || maze.phase === 'play')) warmUpAdaptiveMusic();
        retiring = retiring.filter(e => { if (e.hasSources() && !hidden && !state.audio.muted) return true; e.dispose(); return false; });
        const visible = state.screen === 'mazeRescue' && maze && maze.phase === 'play' && isRescueTargetVisible();
        if (cues) {
            cues.setVolume(state.audio.muted || hidden || !cfg.music.eventCues ? 0 : cfg.music.cueVolume * CONFIG.audio.sfxVolume);
            if (state.audio.muted || hidden || !cfg.music.eventCues || state.screen !== 'mazeRescue') cues.stop();
        }
        if (maze !== observedMaze) {
            observedMaze = maze; encountered = audibleEncounter = false; lastVisibleAt = -Infinity; previousPhase = ''; previousRescued = !!(maze && maze.npcRescued);
        }
        if (visible) { encountered = true; lastVisibleAt = ctx ? ctx.currentTime : -Infinity; }
        if (state.screen === 'mazeRescue' && maze) {
            if (maze.phase === 'failed' && previousPhase !== 'failed') playCue('death');
            else if (maze.npcRescued && !previousRescued) playCue('secured');
            previousPhase = maze.phase; previousRescued = maze.npcRescued;
        }
        if (!engine) return;
        const clock = engine.getClock();
        const distance = state.npc ? Math.hypot(state.npc.x - player.x, state.npc.y - player.y) : Infinity;
        const range = getRescueMusicRange();
        // 外圈15%滞回防止启停抖动；绑好绳也只在目标身边保留返程和声。
        const nearby = !!state.npc && state.npc.active && distance <= range * (engine.hasSources() ? 1.15 : 1);
        const playing = !hidden && cfg.enabled && cfg.music.enabled && state.screen === 'mazeRescue'
            && maze && maze.phase === 'play' && nearby && (!ctx.state || ctx.state === 'running');
        if (!playing) { engine.stop(false, maze && maze.phase === 'failed' ? 0.06 : 0.35); engine.getClock(); selected = 0; return; }
        engine.start();
        if (clock.playing && !state.audio.muted) {
            audibleEncounter = true;
            if (!maze.tapeNowPlayingAt) maze.tapeNowPlayingAt = Date.now();
        }
        const calm = !!(maze.npcRescued || maze.npcStunned);
        const detecting = detector.active && !calm;
        const entrySeconds = rescueTargetEntrySeconds();
        const enteringFrame = !hidden && !calm && Number.isFinite(entrySeconds);
        // 实际入镜后的120ms短保持消除屏幕边缘抖动；预判失效则立即撤销。
        const frameHeld = !calm && ctx.currentTime - lastVisibleAt < 0.12;
        selected = calm ? 0 : selectRescueMusicLevel(detecting ? detector.currentIntensity : -1, selected, !!visible || enteringFrame || frameHeld, cfg.music.hysteresis);
        const mood = calm ? 'return' : encountered || enteringFrame ? 'found' : 'search';
        engine.setLevel(selected, calm, mood, enteringFrame ? entrySeconds : undefined);
        const proximityGain = Math.max(0, Math.min(1, (range * 1.15 - distance) / (range * 0.4)));
        engine.setVolume(state.audio.muted ? 0 : cfg.music.volume * CONFIG.audio.bgmVolume * proximityGain * musicCueDuck(ctx.currentTime - cueStartedAt));
    } catch (err) {
        failed = true;
        if (engine) engine.dispose(); engine = null;
        console.warn('[AdaptiveMusic] 播放失败，继续无音乐游玩:', err);
    }
}

export function resetAdaptiveMusic(): void {
    selected = 0; cueStartedAt = lastVisibleAt = -Infinity; encountered = audibleEncounter = false;
    if (engine) engine.stop(true);
    if (cues) cues.stop();
    retiring.forEach(e => e.dispose()); retiring = [];
    previousPhase = ''; previousRescued = false;
}
