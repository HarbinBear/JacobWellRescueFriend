// 音频管理器：负责 BGM 播放、淡入淡出、静音切换
// 整体思路：
// 1. 所有对外行为都通过一个模块内部的单例 InnerAudioContext（小游戏）或 HTMLAudioElement（兜底）
// 2. 静音 != 暂停：关闭开关时只把音量淡到 0，音频本体仍在播放，保留时间轴
// 3. BGM 仅在主菜单界面播放，离开主菜单则执行淡出并暂停
// 4. 淡入淡出都通过逐帧推进 currentVolume -> targetVolume 实现
// 5. 云存储：音频放在微信小游戏云开发的云存储里，不占主包体；
//    运行时先 wx.cloud.init() 初始化，再 getTempFileURL 把 cloud:// FileID 换成临时 HTTPS URL；
//    播放报网络/系统错误时重取 URL，30秒内最多一次自动刷新；
//    云端失败时保持静音，不能回退到包内不存在的 MP3。
// 6. SFX（一次性音效，如入水气泡）走独立 SFX 通道：
//    - 启动时同样预创建上下文并预拉取临时 URL，触发时尽量做到低延迟
//    - 不参与 BGM 的 _currentBGM / 淡入淡出逻辑
//    - 静音时直接跳过触发，而不是淡出
//    - 触发时 stop() -> seek(0) -> play()，保证在同一触发点可以重播

import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { ensureAssetCloud, resolveAssetPath, invalidateAsset } from '../assets/AssetStorage';

type AudioKey = 'menuBGM';
type SFXKey = 'diveSplash' | 'collisionRock' | 'collisionBreath' | 'quickReturn' | 'uiPrimary' | 'uiSecondary' | 'oxygenRefill' | 'fishBiteDie' | 'rescueBonk';
// SFX-Loop：常驻循环、可实时调整音量与播放速率（呼吸气泡等）
type SFXLoopKey = 'breathLoop';
// Ambience：常驻低音量环境音（鸟鸣、流水等），独立于 BGM 与 SFX，由 phase 驱动开关
type AmbienceKey = 'campAmbience';

interface AudioEntry {
    path: string;              // 浏览器/显式本地开发路径，不是云失败回退
    loop: boolean;
    ctx: any | null;           // wx.InnerAudioContext 或 HTMLAudioElement
    loaded: boolean;
    playing: boolean;          // 是否已调用 play（不代表一定在出声）
    currentVolume: number;     // 实时音量（受淡入淡出驱动）
    targetVolume: number;      // 目标音量（受主音量与静音状态影响）
    srcReady: boolean;         // src 是否已赋值（云存储模式下要等 URL 换回来）
    pendingPlay: boolean;      // 是否有一个"等 URL 就绪后自动播"的请求挂起
    urlResolving: boolean;     // 是否正在请求 getTempFileURL，避免重复发
}

// SFX 条目：相比 BGM 少了淡入淡出相关字段，因为一次性音效不做淡入淡出
interface SFXEntry {
    path: string;
    ctx: any | null;
    srcReady: boolean;
    urlResolving: boolean;
    pendingPlay: boolean;      // URL 还没回来时挂起的播放请求（到了立刻播一次）
}

// SFX-Loop 条目：常驻循环音频，支持运行时调音量与播放速率；与 BGM 一样做每帧音量逼近
interface SFXLoopEntry {
    path: string;
    ctx: any | null;
    srcReady: boolean;
    urlResolving: boolean;
    playing: boolean;          // 是否已 play
    pendingPlay: boolean;      // URL 还没就绪时挂起的 play 请求
    currentVolume: number;     // 当前实时音量
    targetVolume: number;      // 目标音量（外部通过 setSFXLoopParams 指定）
    desiredPlay: boolean;      // 外部是否希望这条 loop 处于播放状态（playSFXLoop/stopSFXLoop 设定）
    playbackRate: number;      // 播放速率（0.5~2.0）
    fadeStep: number;          // 音量逼近步长
}

// Ambience 条目：常驻循环环境音，只做音量淡入淡出，无播放速率调整
// 与 SFX-Loop 的区别：音量上限走 bgmVolume（环境音是背景层的一部分，不是音效），且不参与手动调参
interface AmbienceEntry {
    path: string;
    ctx: any | null;
    srcReady: boolean;
    urlResolving: boolean;
    playing: boolean;
    pendingPlay: boolean;
    currentVolume: number;
    targetVolume: number;      // 目标音量；外部调 playAmbience 时设为 maxVolume，stopAmbience 设为 0
    desiredPlay: boolean;
    maxVolume: number;         // 激活状态下的峰值音量（默认 0.5，相对 bgmVolume 再做一次乘法）
    fadeStep: number;
}

// 音频资源清单
const ENTRIES: Record<AudioKey, AudioEntry> = {
    menuBGM: {
        path: 'audio/Echoes_of_the_Sunken_Grotto_2026-04-22T150024.mp3',
        loop: true,
        ctx: null,
        loaded: false,
        playing: false,
        currentVolume: 0,
        targetVolume: 0,
        srcReady: false,
        pendingPlay: false,
        urlResolving: false,
    },
};

// SFX 清单（一次性音效）
const SFX_ENTRIES: Record<SFXKey, SFXEntry> = {
    rescueBonk: {
        path: 'audio/rescue-bonk.wav', ctx: null, srcReady: false,
        urlResolving: false, pendingPlay: false,
    },
    diveSplash: {
        path: 'audio/ElevenLabs_A_diver_jumps_into_the_.mp3',
        ctx: null,
        srcReady: false,
        urlResolving: false,
        pendingPlay: false,
    },
    collisionRock: {
        path: 'audio/HitRock.mp3',
        ctx: null,
        srcReady: false,
        urlResolving: false,
        pendingPlay: false,
    },
    // 撞击暂时复用 breathLoop（吐气泡）做一次性音效，独立 SFX 上下文避免与呼吸 loop 干扰
    // playbackRate 在调用时压到 0.55~0.75 区间，听感比呼吸更钝更闷，足够区分
    collisionBreath: {
        path: 'audio/BreathBubble.mp3',
        ctx: null,
        srcReady: false,
        urlResolving: false,
        pendingPlay: false,
    },
    // 结束潜水：蓄力后瞬间弹射出水的"上升破水"音效
    quickReturn: {
        path: 'audio/QuickReturn.mp3',
        ctx: null,
        srcReady: false,
        urlResolving: false,
        pendingPlay: false,
    },
    // UI 主按钮点击音（确认/开始/救援/安装/下潜 等决定性操作）
    uiPrimary: {
        path: 'audio/MainBtn.mp3',
        ctx: null,
        srcReady: false,
        urlResolving: false,
        pendingPlay: false,
    },
    // UI 次按钮（取消/关闭/返回/Tab 切换/折叠）：更轻更短更干的 "嗒" 声
    uiSecondary: {
        path: 'audio/SubBtn.mp3',
        ctx: null,
        srcReady: false,
        urlResolving: false,
        pendingPlay: false,
    },
    // 拾取氧气瓶：高压气体快速灌入钢瓶的嘶声 + 阀门拧紧的机械咔哒
    oxygenRefill: {
        path: 'audio/GetO2.mp3',
        ctx: null,
        srcReady: false,
        urlResolving: false,
        pendingPlay: false,
    },
    // 被食人鱼咬死：湿润咔嚓 + 被掐断闷惨叫 + 水花翻腾 + 低频嗡鸣 + 远气泡
    fishBiteDie: {
        path: 'audio/FishBiteManDie.mp3',
        ctx: null,
        srcReady: false,
        urlResolving: false,
        pendingPlay: false,
    },
};
// SFX-Loop 清单（循环音效，可实时调整）
const SFX_LOOP_ENTRIES: Record<SFXLoopKey, SFXLoopEntry> = {
    breathLoop: {
        path: 'audio/BreathBubble.mp3',
        ctx: null,
        srcReady: false,
        urlResolving: false,
        playing: false,
        pendingPlay: false,
        currentVolume: 0,
        targetVolume: 0,
        desiredPlay: false,
        playbackRate: 1,
        fadeStep: 0.08,
    },
};

// Ambience 清单（常驻环境音循环）
const AMBIENCE_ENTRIES: Record<AmbienceKey, AmbienceEntry> = {
    campAmbience: {
        path: 'audio/CampBird.mp3',
        ctx: null,
        srcReady: false,
        urlResolving: false,
        playing: false,
        pendingPlay: false,
        currentVolume: 0,
        targetVolume: 0,
        desiredPlay: false,
        // 环境音只是底噪，不抢戏；取 0.5 的峰值，再乘全局 bgmVolume
        maxVolume: 0.5,
        // 淡入淡出比 BGM 慢一点，让过渡更柔（约 3s 到位）
        fadeStep: 0.006,
    },
};

// 当前应该播放的 BGM 键（由外部设置）
let _currentBGM: AudioKey | null = null;
let _initialized = false;
let _cloudInited = false;   // wx.cloud.init 是否已调用（仅在小游戏且启用云存储时为 true）
let _bonkLoadVersion = 0, _bonkRetryAfter = 0, _bonkInvalidating = false, _bonkSourceAssigned = false;
let _bonkDecodeTimer: ReturnType<typeof setTimeout> | null = null;
const _cloudRetryAfter = new WeakMap<object, number>();

function _claimCloudRefresh(entry: object): boolean {
    if (Date.now() < (_cloudRetryAfter.get(entry) || 0)) return false;
    _cloudRetryAfter.set(entry, Date.now() + 30000);
    return true;
}
function _canResolveCloud(entry: { urlResolving: boolean }, refresh: boolean): boolean {
    return !entry.urlResolving && (refresh || Date.now() >= (_cloudRetryAfter.get(entry) || 0));
}
function _cloudUnavailable(entry: any): void {
    entry.srcReady = false; entry.pendingPlay = false;
    if ('playing' in entry) entry.playing = false;
    _cloudRetryAfter.set(entry, Date.now() + 30000);
}
function _localAudioEnabled(): boolean { return !CONFIG.audio.cloud || !CONFIG.audio.cloud.enabled; }

// ===== 初始化 =====

export function initAudio(): void {
    if (_initialized) return;
    _initialized = true;

    // 先尝试初始化云开发
    _tryInitCloud();

    // 创建所有 BGM 音频上下文
    for (const key of Object.keys(ENTRIES) as AudioKey[]) {
        _createContext(key);
        // 如果启用了云存储，立即发起 FileID→临时 URL 的请求（B 方案：预加载）
        // 这样到主菜单时通常 URL 已经就绪，不用等待
        if (_cloudInited) {
            _resolveAndApplyCloudURL(key);
        }
    }

    // 创建所有 SFX 上下文并预拉取云 URL
    for (const key of Object.keys(SFX_ENTRIES) as SFXKey[]) {
        _createSFXContext(key);
        if (key === 'rescueBonk') {
            _resolveCatalogBonk();
        } else if (_cloudInited) {
            _resolveAndApplySFXCloudURL(key);
        }
    }

    // 创建所有 SFX-Loop 上下文并预拉取云 URL
    for (const key of Object.keys(SFX_LOOP_ENTRIES) as SFXLoopKey[]) {
        _createSFXLoopContext(key);
        if (_cloudInited) {
            _resolveAndApplySFXLoopCloudURL(key);
        }
    }

    // 创建所有 Ambience 上下文并预拉取云 URL
    for (const key of Object.keys(AMBIENCE_ENTRIES) as AmbienceKey[]) {
        _createAmbienceContext(key);
        if (_cloudInited) {
            _resolveAndApplyAmbienceCloudURL(key);
        }
    }
}

// 显式关闭云音频时才使用开发用本地路径。
function _tryInitCloud(): void {
    if (!CONFIG.audio.cloud || !CONFIG.audio.cloud.enabled) return;
    _cloudInited = ensureAssetCloud();
}

function _createContext(key: AudioKey): void {
    const entry = ENTRIES[key];
    try {
        // 微信小游戏环境
        const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
        if (wxAny && typeof wxAny.createInnerAudioContext === 'function') {
            const ctx = wxAny.createInnerAudioContext();
            ctx.loop = entry.loop;
            ctx.volume = 0;
            ctx.autoplay = false;

            // 云存储启用时 src 会在 _resolveAndApplyCloudURL 里异步赋值；
            // 只有显式关闭云音频的本地开发模式才使用包内路径
            if (!_cloudInited && _localAudioEnabled()) {
                ctx.src = entry.path;
                entry.srcReady = true;
            }

            ctx.onCanplay(() => {
                entry.loaded = true;
            });
            ctx.onError((err: any) => {
                // 系统/网络错误可能由过期 URL 引起，但不能无限刷新。
                const code = err && (err.errCode || err.code);
                console.warn('[Audio] ' + key + ' 播放错误:', err);
                if (_cloudInited && (code === 10002 || code === -1 || code === undefined)) {
                    entry.srcReady = false;
                    entry.loaded = false;
                    entry.playing = false;
                    // 记住需要重新播
                    entry.pendingPlay = _currentBGM === key;
                    if (_claimCloudRefresh(entry)) _resolveAndApplyCloudURL(key, true);
                }
            });
            entry.ctx = ctx;
        } else if (typeof (globalThis as any).Audio !== 'undefined') {
            // 浏览器兜底（不走云存储，直接本地路径）
            const ctx = new (globalThis as any).Audio(entry.path);
            ctx.loop = entry.loop;
            ctx.volume = 0;
            entry.ctx = ctx;
            entry.srcReady = true;
            ctx.addEventListener('canplay', () => { entry.loaded = true; });
        }
    } catch (e) {
        console.warn('[Audio] 创建上下文失败:', e);
    }
}

// 把 cloud:// FileID 换成临时 HTTPS URL，并写回 ctx.src
function _resolveAndApplyCloudURL(key: AudioKey, refresh = false): void {
    const entry = ENTRIES[key];
    if (!entry || !entry.ctx) return;
    if (!_cloudInited) return;
    if (!_canResolveCloud(entry, refresh)) return;

    const fileID = CONFIG.audio.cloud.fileIDs[key];
    if (!fileID) {
        _cloudUnavailable(entry);
        return;
    }

    const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
    if (!wxAny || !wxAny.cloud || typeof wxAny.cloud.getTempFileURL !== 'function') {
        _cloudUnavailable(entry);
        return;
    }

    entry.urlResolving = true;
    wxAny.cloud.getTempFileURL({
        fileList: [fileID],
        success: (res: any) => {
            entry.urlResolving = false;
            const item = res && res.fileList && res.fileList[0];
            if (item && item.tempFileURL && (!item.status || item.status === 0)) {
                try {
                    entry.ctx.src = item.tempFileURL;
                    entry.srcReady = true;
                    // 若有挂起的播放请求，立即启动
                    if (entry.pendingPlay) {
                        entry.pendingPlay = false;
                        try {
                            entry.ctx.volume = 0;
                            entry.ctx.play();
                            entry.playing = true;
                        } catch (e) {
                            console.warn('[Audio] 延迟播放失败:', e);
                        }
                    }
                } catch (e) {
                    _cloudUnavailable(entry);
                    console.warn('[Audio] 写入临时 URL 失败:', e);
                }
            } else {
                console.warn('[Audio] 云音频暂不可用');
                _cloudUnavailable(entry);
            }
        },
        fail: (err: any) => {
            entry.urlResolving = false;
            console.warn('[Audio] 云音频请求失败');
            _cloudUnavailable(entry);
        },
    });
}

// ===== SFX 上下文创建与云 URL 解析 =====

// This one release-managed SFX uses the common verified file cache. Loading a
// one-shot never queues playback: a delayed bonk no longer matches its impact.
function _clearBonkDecodeTimer(): void {
    if (_bonkDecodeTimer !== null) clearTimeout(_bonkDecodeTimer);
    _bonkDecodeTimer = null;
}
function _catalogBonkCanPlay(): void {
    if (!_bonkSourceAssigned) return;
    _clearBonkDecodeTimer();
    SFX_ENTRIES.rescueBonk.srcReady = true;
}
function _resolveCatalogBonk(): void {
    const entry = SFX_ENTRIES.rescueBonk;
    if (!entry.ctx || entry.urlResolving || _bonkSourceAssigned || Date.now() < _bonkRetryAfter) return;
    const version = ++_bonkLoadVersion, ctx = entry.ctx;
    entry.srcReady = false; entry.pendingPlay = false; entry.urlResolving = true;
    resolveAssetPath(entry.path).then(path => {
        if (version !== _bonkLoadVersion || entry.ctx !== ctx) return;
        _bonkSourceAssigned = true;
        _clearBonkDecodeTimer();
        _bonkDecodeTimer = setTimeout(_invalidateCatalogBonk, 15000);
        ctx.src = path;
        // onCanplay marks it ready; do not queue a collision behind decoding.
    }).catch(() => {
        if (version !== _bonkLoadVersion) return;
        _clearBonkDecodeTimer();
        entry.srcReady = false; _bonkSourceAssigned = false; _bonkRetryAfter = Date.now() + 2000;
        console.warn('[Audio] rescueBonk 尚未就绪；后续碰撞可重试');
    }).then(() => { if (version === _bonkLoadVersion) entry.urlResolving = false; });
}

function _invalidateCatalogBonk(): void {
    const entry = SFX_ENTRIES.rescueBonk;
    _clearBonkDecodeTimer();
    entry.srcReady = false; entry.pendingPlay = false; _bonkSourceAssigned = false;
    if (_bonkInvalidating) return;
    _bonkInvalidating = true;
    const version = ++_bonkLoadVersion;
    entry.urlResolving = true; _bonkRetryAfter = Date.now() + 2000;
    try { entry.ctx.stop(); } catch (_) { /* already stopped */ }
    invalidateAsset(entry.path).catch(() => {
        console.warn('[Audio] rescueBonk 缓存失效处理失败');
    }).then(() => {
        if (version === _bonkLoadVersion) entry.urlResolving = false;
        _bonkInvalidating = false;
    });
}

function _createSFXContext(key: SFXKey): void {
    const entry = SFX_ENTRIES[key];
    try {
        const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
        if (wxAny && typeof wxAny.createInnerAudioContext === 'function') {
            const ctx = wxAny.createInnerAudioContext();
            ctx.loop = false;
            ctx.autoplay = false;
            if (key === 'rescueBonk') ctx.onCanplay(_catalogBonkCanPlay);
            // 云存储启用时 src 会在 _resolveAndApplySFXCloudURL 里异步赋值；
            // 只有显式关闭云音频的本地开发模式才使用包内路径
            if (!_cloudInited && _localAudioEnabled() && key !== 'rescueBonk') {
                ctx.src = entry.path;
                entry.srcReady = true;
            }
            ctx.onError((err: any) => {
                if (key === 'rescueBonk') { _invalidateCatalogBonk(); return; }
                const code = err && (err.errCode || err.code);
                console.warn('[Audio] SFX ' + key + ' 播放错误:', err);
                if (_cloudInited && (code === 10002 || code === -1 || code === undefined)) {
                    entry.srcReady = false;
                    entry.pendingPlay = false;
                    if (_claimCloudRefresh(entry)) _resolveAndApplySFXCloudURL(key, true);
                }
            });
            entry.ctx = ctx;
        } else if (typeof (globalThis as any).Audio !== 'undefined') {
            // 浏览器兜底（不走云存储，直接本地路径）
            const ctx = new (globalThis as any).Audio();
            ctx.loop = false;
            entry.ctx = ctx;
            if (key === 'rescueBonk') {
                ctx.addEventListener('error', _invalidateCatalogBonk);
                ctx.addEventListener('canplay', _catalogBonkCanPlay);
            }
            else { ctx.src = entry.path; entry.srcReady = true; }
        }
    } catch (e) {
        console.warn('[Audio] 创建 SFX 上下文失败:', e);
    }
}

// 把 SFX 的 cloud:// FileID 换成临时 HTTPS URL，并写回 ctx.src
function _resolveAndApplySFXCloudURL(key: SFXKey, refresh = false): void {
    const entry = SFX_ENTRIES[key];
    if (!entry || !entry.ctx) return;
    if (!_cloudInited) return;
    if (!_canResolveCloud(entry, refresh)) return;

    const fileID = CONFIG.audio.cloud.fileIDs[key];
    if (!fileID) {
        _cloudUnavailable(entry);
        return;
    }

    const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
    if (!wxAny || !wxAny.cloud || typeof wxAny.cloud.getTempFileURL !== 'function') {
        _cloudUnavailable(entry);
        return;
    }

    entry.urlResolving = true;
    wxAny.cloud.getTempFileURL({
        fileList: [fileID],
        success: (res: any) => {
            entry.urlResolving = false;
            const item = res && res.fileList && res.fileList[0];
            if (item && item.tempFileURL && (!item.status || item.status === 0)) {
                try {
                    entry.ctx.src = item.tempFileURL;
                    entry.srcReady = true;
                    // 若有挂起的播放请求（URL 未回来时触发了一次），URL 就绪后立刻播一次
                    if (entry.pendingPlay) {
                        entry.pendingPlay = false;
                        _actuallyPlaySFX(key);
                    }
                } catch (e) {
                    _cloudUnavailable(entry);
                    console.warn('[Audio] SFX 写入临时 URL 失败:', e);
                }
            } else {
                console.warn('[Audio] 云音效暂不可用');
                _cloudUnavailable(entry);
            }
        },
        fail: (err: any) => {
            entry.urlResolving = false;
            console.warn('[Audio] 云音效请求失败');
            _cloudUnavailable(entry);
        },
    });
}

// 内部：真正执行 SFX 播放（stop -> seek(startTime) -> play）
// options 可选地覆盖音量（0~1，会与 CONFIG.audio.sfxVolume 相乘）与播放速率（0.5~2.0）
// startTime（秒）：强制从音频的某个位置起播，用来削掉音频开头的拖尾部分
function _actuallyPlaySFX(key: SFXKey, options?: { volume?: number; playbackRate?: number; startTime?: number }): void {
    const entry = SFX_ENTRIES[key];
    if (!entry || !entry.ctx || !entry.srcReady) return;
    try {
        // 音量：受全局静音开关控制；静音时直接不播
        if (state.audio.muted) return;
        const volScale = options && typeof options.volume === 'number' ? Math.max(0, Math.min(1, options.volume)) : 1;
        entry.ctx.volume = Math.max(0, Math.min(1, CONFIG.audio.sfxVolume * volScale));
        // 播放速率（InnerAudioContext 手机端可能不生效，浏览器兼底路径生效）
        if (options && typeof options.playbackRate === 'number') {
            const rate = Math.max(0.5, Math.min(2.0, options.playbackRate));
            try { entry.ctx.playbackRate = rate; } catch (e) { /* 忽略不支持的路径 */ }
        }
        // 起播位置：默认 0；若传了 startTime 则从该位置起播（单位秒）
        const startAt = options && typeof options.startTime === 'number' && options.startTime > 0
            ? options.startTime
            : 0;
        // 尝试把播放头拉到指定位置：InnerAudioContext 支持 stop()/seek(t)
        try { entry.ctx.stop(); } catch (e) { /* 忽略 */ }
        try { if (typeof entry.ctx.seek === 'function') entry.ctx.seek(startAt); } catch (e) { /* 忽略 */ }
        // 浏览器兼底（HTMLAudioElement）没有 seek，但有 currentTime
        try {
            if (typeof entry.ctx.seek !== 'function' && 'currentTime' in entry.ctx) {
                (entry.ctx as any).currentTime = startAt;
            }
        } catch (e) { /* 忽略 */ }
        entry.ctx.play();
    } catch (e) {
        console.warn('[Audio] SFX 播放失败:', e);
    }
}
// ===== 播放控制 =====

// 请求播放某个 BGM；若已是当前 BGM 则保持
export function playBGM(key: AudioKey): void {
    _currentBGM = key;
    const entry = ENTRIES[key];
    if (!entry || !entry.ctx) return;

    if (!entry.playing) {
        // URL 还没就绪：挂一个 pendingPlay，等 URL 回来后自动 play
        if (!entry.srcReady) {
            entry.pendingPlay = true;
            // 兜底：如果云开发可用但还没发请求，发一个
            if (_cloudInited && !entry.urlResolving) {
                _resolveAndApplyCloudURL(key);
            }
            return;
        }
        try {
            entry.ctx.volume = 0;
            entry.ctx.play();
            entry.playing = true;
        } catch (e) {
            console.warn('[Audio] 播放失败:', e);
        }
    }
}

// 请求停止当前 BGM（淡出后真正 pause）
export function stopBGM(): void {
    _currentBGM = null;
}

// 播放一次性音效（SFX）。静音时直接跳过；云 URL 未就绪时挂起，就绪后立刻触发一次。
// options 可选：volume（0~1，最终音量 = sfxVolume * volume）、playbackRate（0.5~2.0）、startTime（秒，从该位置起播，用来削掉音频开头的拖尾）
// 若 URL 还没就绪，仅在"首次触发"时挂起 pending（不带动态参数），避免后续动态参数丢失
export function playSFX(key: SFXKey, options?: { volume?: number; playbackRate?: number; startTime?: number }): void {
    if (state.audio.muted) return;
    const entry = SFX_ENTRIES[key];
    if (!entry || !entry.ctx) return;
    if (!entry.srcReady) {
        if (key === 'rescueBonk') { _resolveCatalogBonk(); return; }
        // URL 还没回来：挂一个 pendingPlay，URL 回来时立刻播（不带动态参数）
        entry.pendingPlay = true;
        if (_cloudInited && !entry.urlResolving) {
            _resolveAndApplySFXCloudURL(key);
        }
        return;
    }
    _actuallyPlaySFX(key, options);
}

// 切换全局静音开关（true=静音，false=恢复）
export function setMuted(muted: boolean): void {
    state.audio.muted = muted;
}

export function isMuted(): boolean {
    return state.audio.muted;
}

export function toggleMuted(): void {
    state.audio.muted = !state.audio.muted;
}

// ===== 每帧更新 =====

// 由主循环调用，推进淡入淡出
export function updateAudio(): void {
    // 根据当前屏幕决定目标 BGM
    const desired = _computeDesiredBGM();
    if (desired !== _currentBGM) {
        if (desired) {
            playBGM(desired);
        } else {
            stopBGM();
        }
    } else if (desired && _cloudInited) {
        const entry = ENTRIES[desired];
        // Recover in place after a network outage; the shared cooldown and
        // in-flight guard prevent a per-frame URL request loop.
        if (entry.ctx && !entry.playing && _canResolveCloud(entry, false)) playBGM(desired);
    }

    // 逐条音频推进音量
    for (const key of Object.keys(ENTRIES) as AudioKey[]) {
        const entry = ENTRIES[key];
        if (!entry.ctx) continue;

        // 计算目标音量
        let target = 0;
        if (_currentBGM === key) {
            target = state.audio.muted ? 0 : CONFIG.audio.bgmVolume;
        }
        entry.targetVolume = target;

        // 线性逼近目标音量
        const fadeStep = CONFIG.audio.fadeStep;
        if (entry.currentVolume < entry.targetVolume) {
            entry.currentVolume = Math.min(entry.targetVolume, entry.currentVolume + fadeStep);
        } else if (entry.currentVolume > entry.targetVolume) {
            entry.currentVolume = Math.max(entry.targetVolume, entry.currentVolume - fadeStep);
        }

        // 写回音频上下文
        try {
            entry.ctx.volume = Math.max(0, Math.min(1, entry.currentVolume));
        } catch (e) {
            // 忽略平台差异性失败
        }

        // 当 BGM 被切走（_currentBGM !== key）并且音量已降到 0：暂停以节省资源
        // 静音（setMuted true）不会走到这里，因为 _currentBGM 仍指向这条 BGM，target=0 但 currentBGM 仍是它
        if (_currentBGM !== key && entry.playing && entry.currentVolume <= 0.001) {
            try {
                entry.ctx.pause();
            } catch (e) {
                // 忽略
            }
            entry.playing = false;
            entry.pendingPlay = false;   // 暂停后自然不再挂起
        }
    }

    // 推进循环动画相位：
    // - 开启时：累积旋转（匀速）
    // - 静音时：相位向 0 线性衰减，让音符"减速回正"，避免瞬间停住或角度残留
    if (!state.audio.muted) {
        state.audio.animPhase = (state.audio.animPhase + CONFIG.audio.animSpeed) % (Math.PI * 2);
    } else {
        // 把相位归一到 [-PI, PI]，再往 0 逼近
        let p = state.audio.animPhase;
        p = Math.atan2(Math.sin(p), Math.cos(p));
        const decay = CONFIG.audio.animSpeed; // 用同一速度回正，直观一致
        if (p > decay) p -= decay;
        else if (p < -decay) p += decay;
        else p = 0;
        state.audio.animPhase = p;
    }

    // 推进按钮切换动画进度（0=静音态，1=开启态），用于按钮图标淡入淡出
    const iconTarget = state.audio.muted ? 0 : 1;
    const iconStep = CONFIG.audio.iconFadeStep;
    if (state.audio.iconProgress < iconTarget) {
        state.audio.iconProgress = Math.min(iconTarget, state.audio.iconProgress + iconStep);
    } else if (state.audio.iconProgress > iconTarget) {
        state.audio.iconProgress = Math.max(iconTarget, state.audio.iconProgress - iconStep);
    }

    // 推进 Ambience 的音量逼近
    for (const key of Object.keys(AMBIENCE_ENTRIES) as AmbienceKey[]) {
        const entry = AMBIENCE_ENTRIES[key];
        if (!entry.ctx) continue;

        // 计算目标音量
        let target = 0;
        if (entry.desiredPlay) {
            target = state.audio.muted ? 0 : entry.maxVolume * CONFIG.audio.bgmVolume;
        }
        entry.targetVolume = target;

        // 线性逼近目标音量
        if (entry.currentVolume < entry.targetVolume) {
            entry.currentVolume = Math.min(entry.targetVolume, entry.currentVolume + entry.fadeStep);
        } else if (entry.currentVolume > entry.targetVolume) {
            entry.currentVolume = Math.max(entry.targetVolume, entry.currentVolume - entry.fadeStep);
        }

        // 写回音频上下文
        try {
            entry.ctx.volume = Math.max(0, Math.min(1, entry.currentVolume));
        } catch (e) {
            // 忽略平台差异性失败
        }

        // 当音量已降到 0 且外部不再希望播放：真正 pause 以省资源
        if (!entry.desiredPlay && entry.playing && entry.currentVolume <= 0.001) {
            try {
                entry.ctx.pause();
            } catch (e) {
                // 忽略
            }
            entry.playing = false;
            entry.pendingPlay = false;   // 暂停后自然不再挂起
        }
    }
}

// ===== 内部：当前屏幕应播的 BGM =====

function _computeDesiredBGM(): AudioKey | null {
    // 只在主菜单（含章节选择）播放主界面 BGM
    if (state.screen === 'menu') {
        return 'menuBGM';
    }
    return null;
}

// ===== SFX-Loop 上下文创建与云 URL 解析 =====

function _createSFXLoopContext(key: SFXLoopKey): void {
    const entry = SFX_LOOP_ENTRIES[key];
    try {
        const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
        if (wxAny && typeof wxAny.createInnerAudioContext === 'function') {
            const ctx = wxAny.createInnerAudioContext();
            ctx.loop = true;
            ctx.autoplay = false;
            ctx.volume = 0;
            if (!_cloudInited && _localAudioEnabled()) {
                ctx.src = entry.path;
                entry.srcReady = true;
            }
            ctx.onError((err: any) => {
                const code = err && (err.errCode || err.code);
                console.warn('[Audio] SFX-Loop ' + key + ' 播放错误:', err);
                if (_cloudInited && (code === 10002 || code === -1 || code === undefined)) {
                    entry.srcReady = false;
                    entry.playing = false;
                    if (entry.desiredPlay) entry.pendingPlay = true;
                    if (_claimCloudRefresh(entry)) _resolveAndApplySFXLoopCloudURL(key, true);
                }
            });
            entry.ctx = ctx;
        } else if (typeof (globalThis as any).Audio !== 'undefined') {
            const ctx = new (globalThis as any).Audio(entry.path);
            ctx.loop = true;
            ctx.volume = 0;
            entry.ctx = ctx;
            entry.srcReady = true;
        }
    } catch (e) {
        console.warn('[Audio] 创建 SFX-Loop 上下文失败:', e);
    }
}

function _resolveAndApplySFXLoopCloudURL(key: SFXLoopKey, refresh = false): void {
    const entry = SFX_LOOP_ENTRIES[key];
    if (!entry || !entry.ctx) return;
    if (!_cloudInited) return;
    if (!_canResolveCloud(entry, refresh)) return;

    const fileID = (CONFIG.audio.cloud.fileIDs as Record<string, string>)[key];
    if (!fileID) {
        _cloudUnavailable(entry);
        return;
    }

    const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
    if (!wxAny || !wxAny.cloud || typeof wxAny.cloud.getTempFileURL !== 'function') {
        _cloudUnavailable(entry);
        return;
    }

    entry.urlResolving = true;
    wxAny.cloud.getTempFileURL({
        fileList: [fileID],
        success: (res: any) => {
            entry.urlResolving = false;
            const item = res && res.fileList && res.fileList[0];
            if (item && item.tempFileURL && (!item.status || item.status === 0)) {
                try {
                    entry.ctx.src = item.tempFileURL;
                    entry.srcReady = true;
                    if (entry.pendingPlay) {
                        entry.pendingPlay = false;
                        _actuallyPlaySFXLoop(key);
                    }
                } catch (e) {
                    _cloudUnavailable(entry);
                    console.warn('[Audio] SFX-Loop 写入临时 URL 失败:', e);
                }
            } else {
                console.warn('[Audio] 云循环音效暂不可用');
                _cloudUnavailable(entry);
            }
        },
        fail: (err: any) => {
            entry.urlResolving = false;
            console.warn('[Audio] 云循环音效请求失败');
            _cloudUnavailable(entry);
        },
    });
}

function _actuallyPlaySFXLoop(key: SFXLoopKey): void {
    const entry = SFX_LOOP_ENTRIES[key];
    if (!entry || !entry.ctx || !entry.srcReady) return;
    if (entry.playing) return;
    try {
        entry.ctx.volume = 0;
        entry.ctx.play();
        entry.playing = true;
    } catch (e) {
        console.warn('[Audio] SFX-Loop 播放失败:', e);
    }
}

// 请求循环音频进入激活状态（已激活时不重复触发）；真实音量由 setSFXLoopParams 驱动
export function playSFXLoop(key: SFXLoopKey): void {
    const entry = SFX_LOOP_ENTRIES[key];
    if (!entry || !entry.ctx) return;
    entry.desiredPlay = true;
    if (!entry.srcReady) {
        entry.pendingPlay = true;
        if (_cloudInited && !entry.urlResolving) {
            _resolveAndApplySFXLoopCloudURL(key);
        }
        return;
    }
    _actuallyPlaySFXLoop(key);
}

// 请求循环音频淡出并最终暂停（音量淡到 0 后在 updateAudio 中 pause）
export function stopSFXLoop(key: SFXLoopKey): void {
    const entry = SFX_LOOP_ENTRIES[key];
    if (!entry) return;
    entry.desiredPlay = false;
    entry.pendingPlay = false;
    // 目标音量清零，由 updateAudio 的逐帧逼近完成淡出
    entry.targetVolume = 0;
}

// 动态设置 SFX-Loop 的目标音量与播放速率
// - targetVolume：0~1，按主配置的 sfxVolume 做上限裁剪
// - playbackRate：0.5~2.0，控制呼吸节奏（吐气快慢 / 音调轻微变化）
export function setSFXLoopParams(
    key: SFXLoopKey,
    params: { targetVolume?: number; playbackRate?: number }
): void {
    const entry = SFX_LOOP_ENTRIES[key];
    if (!entry) return;
    if (params.targetVolume !== undefined) {
        const upper = Math.max(0, Math.min(1, CONFIG.audio.sfxVolume));
        entry.targetVolume = Math.max(0, Math.min(upper, params.targetVolume));
    }
    if (params.playbackRate !== undefined) {
        entry.playbackRate = Math.max(0.5, Math.min(2.0, params.playbackRate));
    }
}

// 每帧推进 SFX-Loop 的音量逼近与播放速率应用（由 updateAudio 最后阶段调用）
function _updateSFXLoops(): void {
    for (const key of Object.keys(SFX_LOOP_ENTRIES) as SFXLoopKey[]) {
        const entry = SFX_LOOP_ENTRIES[key];
        if (!entry.ctx) continue;

        // 静音状态：所有 SFX-Loop 目标音量强制 0
        let actualTarget = entry.targetVolume;
        if (state.audio.muted) actualTarget = 0;
        // 外部 stopSFXLoop 会把 desiredPlay 置 false；此时也要往 0 走
        if (!entry.desiredPlay) actualTarget = 0;

        // 逐帧线性逼近
        if (entry.currentVolume < actualTarget) {
            entry.currentVolume = Math.min(actualTarget, entry.currentVolume + entry.fadeStep);
        } else if (entry.currentVolume > actualTarget) {
            entry.currentVolume = Math.max(actualTarget, entry.currentVolume - entry.fadeStep);
        }

        // 写回上下文
        try {
            entry.ctx.volume = Math.max(0, Math.min(1, entry.currentVolume));
            // playbackRate：微信 InnerAudioContext 是只读的，不一定生效；浏览器 Audio 支持
            if ('playbackRate' in entry.ctx) {
                try { entry.ctx.playbackRate = entry.playbackRate; } catch (e) { /* 忽略 */ }
            }
        } catch (e) { /* 忽略 */ }

        // 音量已降到 0 且外部不再希望播放：真正 pause 以省资源
        if (!entry.desiredPlay && entry.playing && entry.currentVolume <= 0.001) {
            try { entry.ctx.pause(); } catch (e) { /* 忽略 */ }
            entry.playing = false;
            entry.pendingPlay = false;
        }
    }
}

// 单独导出：由 game.ts 主循环在 updateAudio 之后调用一次
// 说明：SFX-Loop 的淡入淡出与播放速率应用独立于 BGM，放在 updateAudio 之后保证
// 在同一帧内所有音频目标音量都已写回上下文
export function updateSFXLoops(): void {
    _updateSFXLoops();
}

// ===== Ambience 上下文创建与云 URL 解析 =====
// Ambience 是常驻低音量环境音，独立于 BGM、SFX、SFX-Loop。
// 设计原则：
// 1. 由 phase 驱动（例如 mazeRescue 的 shore / resolved_idle），不由 state.screen 单独驱动
// 2. 音量上限 = maxVolume * bgmVolume（环境音是背景层的一部分，不是音效）
// 3. 静音（setMuted true）时目标音量压 0，但不调 pause，恢复后从 0 淡回
// 4. 外部通过 playAmbience / stopAmbience 切换，updateAudio 每帧推进淡入淡出

function _createAmbienceContext(key: AmbienceKey): void {
    const entry = AMBIENCE_ENTRIES[key];
    try {
        const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
        if (wxAny && typeof wxAny.createInnerAudioContext === 'function') {
            const ctx = wxAny.createInnerAudioContext();
            ctx.loop = true;
            ctx.autoplay = false;
            ctx.volume = 0;
            if (!_cloudInited && _localAudioEnabled()) {
                ctx.src = entry.path;
                entry.srcReady = true;
            }
            ctx.onError((err: any) => {
                const code = err && (err.errCode || err.code);
                console.warn('[Audio] Ambience ' + key + ' 播放错误:', err);
                if (_cloudInited && (code === 10002 || code === -1 || code === undefined)) {
                    entry.srcReady = false;
                    entry.playing = false;
                    if (entry.desiredPlay) entry.pendingPlay = true;
                    if (_claimCloudRefresh(entry)) _resolveAndApplyAmbienceCloudURL(key, true);
                }
            });
            entry.ctx = ctx;
        } else if (typeof (globalThis as any).Audio !== 'undefined') {
            const ctx = new (globalThis as any).Audio(entry.path);
            ctx.loop = true;
            ctx.volume = 0;
            entry.ctx = ctx;
            entry.srcReady = true;
        }
    } catch (e) {
        console.warn('[Audio] 创建 Ambience 上下文失败:', e);
    }
}

function _resolveAndApplyAmbienceCloudURL(key: AmbienceKey, refresh = false): void {
    const entry = AMBIENCE_ENTRIES[key];
    if (!entry || !entry.ctx) return;
    if (!_cloudInited) return;
    if (!_canResolveCloud(entry, refresh)) return;

    const fileID = (CONFIG.audio.cloud.fileIDs as Record<string, string>)[key];
    if (!fileID) {
        _cloudUnavailable(entry);
        return;
    }

    const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
    if (!wxAny || !wxAny.cloud || typeof wxAny.cloud.getTempFileURL !== 'function') {
        _cloudUnavailable(entry);
        return;
    }

    entry.urlResolving = true;
    wxAny.cloud.getTempFileURL({
        fileList: [fileID],
        success: (res: any) => {
            entry.urlResolving = false;
            const item = res && res.fileList && res.fileList[0];
            if (item && item.tempFileURL && (!item.status || item.status === 0)) {
                try {
                    entry.ctx.src = item.tempFileURL;
                    entry.srcReady = true;
                    if (entry.pendingPlay) {
                        entry.pendingPlay = false;
                        _actuallyPlayAmbience(key);
                    }
                } catch (e) {
                    _cloudUnavailable(entry);
                    console.warn('[Audio] Ambience 写入临时 URL 失败:', e);
                }
            } else {
                console.warn('[Audio] 云环境音暂不可用');
                _cloudUnavailable(entry);
            }
        },
        fail: (err: any) => {
            entry.urlResolving = false;
            console.warn('[Audio] 云环境音请求失败');
            _cloudUnavailable(entry);
        },
    });
}

function _actuallyPlayAmbience(key: AmbienceKey): void {
    const entry = AMBIENCE_ENTRIES[key];
    if (!entry || !entry.ctx || !entry.srcReady) return;
    if (entry.playing) return;
    try {
        entry.ctx.volume = 0;
        entry.ctx.play();
        entry.playing = true;
    } catch (e) {
        console.warn('[Audio] Ambience 播放失败:', e);
    }
}

// 请求激活环境音（idempotent，重复调用不会 seek 到头）
export function playAmbience(key: AmbienceKey): void {
    const entry = AMBIENCE_ENTRIES[key];
    if (!entry || !entry.ctx) return;
    entry.desiredPlay = true;
    if (!entry.srcReady) {
        entry.pendingPlay = true;
        if (_cloudInited && !entry.urlResolving) {
            _resolveAndApplyAmbienceCloudURL(key);
        }
        return;
    }
    _actuallyPlayAmbience(key);
}

// 请求停止环境音（目标音量清零，updateAudio 淡出到 0 后真正 pause）
export function stopAmbience(key: AmbienceKey): void {
    const entry = AMBIENCE_ENTRIES[key];
    if (!entry) return;
    entry.desiredPlay = false;
    entry.pendingPlay = false;
}

// 每帧推进环境音的音量逼近；由 updateAudio 末尾调用
function _updateAmbience(): void {
    for (const key of Object.keys(AMBIENCE_ENTRIES) as AmbienceKey[]) {
        const entry = AMBIENCE_ENTRIES[key];
        if (!entry.ctx) continue;

        // 目标音量：desiredPlay 且未静音时 = maxVolume * bgmVolume；否则 0
        let target = 0;
        if (entry.desiredPlay && !state.audio.muted) {
            target = Math.max(0, Math.min(1, entry.maxVolume * CONFIG.audio.bgmVolume));
        }
        entry.targetVolume = target;

        // 线性逼近
        if (entry.currentVolume < entry.targetVolume) {
            entry.currentVolume = Math.min(entry.targetVolume, entry.currentVolume + entry.fadeStep);
        } else if (entry.currentVolume > entry.targetVolume) {
            entry.currentVolume = Math.max(entry.targetVolume, entry.currentVolume - entry.fadeStep);
        }

        try {
            entry.ctx.volume = Math.max(0, Math.min(1, entry.currentVolume));
        } catch (e) { /* 忽略 */ }

        // 不再期望播放 且 已淡到 0：真正 pause 节省资源（静音不会走到这里，因为 desiredPlay 仍为 true）
        if (!entry.desiredPlay && entry.playing && entry.currentVolume <= 0.001) {
            try { entry.ctx.pause(); } catch (e) { /* 忽略 */ }
            entry.playing = false;
            entry.pendingPlay = false;
        }
    }
}

// 单独导出：由 game.ts 主循环在 updateSFXLoops 之后调用
export function updateAmbience(): void {
    _updateAmbience();
}

// ===== 调试辅助 =====

export function getAudioDebugInfo(): { currentBGM: string | null; volume: number; muted: boolean; cloudInited: boolean; srcReady: boolean } {
    const cur = _currentBGM;
    return {
        currentBGM: cur,
        volume: cur ? ENTRIES[cur].currentVolume : 0,
        muted: state.audio.muted,
        cloudInited: _cloudInited,
        srcReady: cur ? ENTRIES[cur].srcReady : false,
    };
}
