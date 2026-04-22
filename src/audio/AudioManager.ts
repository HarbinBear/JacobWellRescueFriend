// 音频管理器：负责 BGM 播放、淡入淡出、静音切换
// 整体思路：
// 1. 所有对外行为都通过一个模块内部的单例 InnerAudioContext（小游戏）或 HTMLAudioElement（兜底）
// 2. 静音 != 暂停：关闭开关时只把音量淡到 0，音频本体仍在播放，保留时间轴
// 3. BGM 仅在主菜单界面播放，离开主菜单则执行淡出并暂停
// 4. 淡入淡出都通过逐帧推进 currentVolume -> targetVolume 实现
// 5. 云存储：音频放在微信小游戏云开发的云存储里，不占主包体；
//    运行时先 wx.cloud.init() 初始化，再 getTempFileURL 把 cloud:// FileID 换成临时 HTTPS URL；
//    URL 有效期 2 小时，播放报 10002 过期错误时自动重新获取；
//    云开发不可用或请求失败时，降级到本地 path（仅在开发者工具里还能听）。

import { CONFIG } from '../core/config';
import { state } from '../core/state';

type AudioKey = 'menuBGM';

interface AudioEntry {
    path: string;              // 本地降级路径（云存储不可用时兜底）
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

// 当前应该播放的 BGM 键（由外部设置）
let _currentBGM: AudioKey | null = null;
let _initialized = false;
let _cloudInited = false;   // wx.cloud.init 是否已调用（仅在小游戏且启用云存储时为 true）

// ===== 初始化 =====

export function initAudio(): void {
    if (_initialized) return;
    _initialized = true;

    // 先尝试初始化云开发
    _tryInitCloud();

    // 创建所有音频上下文
    for (const key of Object.keys(ENTRIES) as AudioKey[]) {
        _createContext(key);
        // 如果启用了云存储，立即发起 FileID→临时 URL 的请求（B 方案：预加载）
        // 这样到主菜单时通常 URL 已经就绪，不用等待
        if (_cloudInited) {
            _resolveAndApplyCloudURL(key);
        }
    }
}

// 尝试初始化微信云开发；不可用或关闭时静默跳过，走本地路径兜底
function _tryInitCloud(): void {
    if (!CONFIG.audio.cloud || !CONFIG.audio.cloud.enabled) return;
    const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
    if (!wxAny || !wxAny.cloud || typeof wxAny.cloud.init !== 'function') return;
    try {
        wxAny.cloud.init({
            env: CONFIG.audio.cloud.envId,
            traceUser: false,
        });
        _cloudInited = true;
    } catch (e) {
        console.warn('[Audio] wx.cloud.init 失败，降级到本地路径:', e);
        _cloudInited = false;
    }
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
            // 否则立即用本地路径兜底
            if (!_cloudInited) {
                ctx.src = entry.path;
                entry.srcReady = true;
            }

            ctx.onCanplay(() => {
                entry.loaded = true;
            });
            ctx.onError((err: any) => {
                // 10002 = 系统错误 / 链接过期；临时 URL 失效时会落到这里
                // 常见 errCode 还有 -1 网络错误等；统一尝试重拉 URL 一次
                const code = err && (err.errCode || err.code);
                console.warn('[Audio] ' + key + ' 播放错误:', err);
                if (_cloudInited && (code === 10002 || code === -1 || code === undefined)) {
                    entry.srcReady = false;
                    entry.loaded = false;
                    // 记住需要重新播
                    if (entry.playing || _currentBGM === key) {
                        entry.pendingPlay = true;
                    }
                    _resolveAndApplyCloudURL(key);
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
function _resolveAndApplyCloudURL(key: AudioKey): void {
    const entry = ENTRIES[key];
    if (!entry || !entry.ctx) return;
    if (!_cloudInited) return;
    if (entry.urlResolving) return;

    const fileID = CONFIG.audio.cloud.fileIDs[key];
    if (!fileID) {
        // 没配 FileID，降级到本地
        try { entry.ctx.src = entry.path; entry.srcReady = true; } catch (e) { /* 忽略 */ }
        return;
    }

    const wxAny = (typeof wx !== 'undefined') ? (wx as any) : null;
    if (!wxAny || !wxAny.cloud || typeof wxAny.cloud.getTempFileURL !== 'function') {
        try { entry.ctx.src = entry.path; entry.srcReady = true; } catch (e) { /* 忽略 */ }
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
                    console.warn('[Audio] 写入临时 URL 失败:', e);
                }
            } else {
                console.warn('[Audio] getTempFileURL 返回异常，降级到本地:', item);
                try { entry.ctx.src = entry.path; entry.srcReady = true; } catch (e) { /* 忽略 */ }
            }
        },
        fail: (err: any) => {
            entry.urlResolving = false;
            console.warn('[Audio] getTempFileURL 请求失败，降级到本地:', err);
            try { entry.ctx.src = entry.path; entry.srcReady = true; } catch (e) { /* 忽略 */ }
        },
    });
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
}

// ===== 内部：当前屏幕应播的 BGM =====

function _computeDesiredBGM(): AudioKey | null {
    // 只在主菜单（含章节选择）播放主界面 BGM
    if (state.screen === 'menu') {
        return 'menuBGM';
    }
    return null;
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
