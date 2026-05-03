// 画质分档与 FPS 自适应管理器
// --------------------------------------------------------------
// 职责：
//   1. 维护当前画质档位（0=low / 1=medium / 2=high / 3=ultra）
//   2. 按 CONFIG.quality.auto 决定是走自动自适应还是手动档位
//   3. 自动模式下每 N 帧采样一次 FPS，连续低 FPS 降档，连续高 FPS 升档
//   4. 档位切换时通知 WebGLLight 调整 glCanvas 分辨率
//
// 使用方式（由 Render.ts / game.ts 驱动）：
//   每帧：QualityManager.onFrame(frameDtMs);
//   读取参数：const p = QualityManager.getLevelParams();
//   手动切档：QualityManager.setManualLevel(2);
//   开关 auto：QualityManager.setAuto(true/false);

import { CONFIG } from '../core/config';

export interface QualityLevelParams {
    scale: number;          // WebGL canvas 相对主画布的分辨率缩放（0~1）
    vplMax: number;         // 本档允许上传到 GPU 的 VPL 点数上限
    enableScatter: boolean; // 是否启用漫散射
    enableNpcVol: boolean;  // 是否启用 NPC 体积光
    label: string;          // 档位标识（low / medium / high / ultra）
}

// 当前运行时档位（0~3）
let _currentLevel = 2;
// 当前是否激活了 auto 模式（缓存 CONFIG.quality.auto 的运行时值）
let _lastAutoMode = true;
// 上一次切档的时间戳（ms），用于冷却
let _lastSwitchMs = 0;
// 低 FPS / 高 FPS 连续窗口计数
let _lowWindowCount = 0;
let _highWindowCount = 0;
// 当前窗口内的帧耗时样本
let _windowFrameMs: number[] = [];
// 档位切换回调（WebGLLight 注册，用来调整 glCanvas 分辨率）
type SwitchCallback = (level: number, params: QualityLevelParams) => void;
const _callbacks: SwitchCallback[] = [];

// 初始化（game.ts 启动时调一次）
export function initQualityManager(): void {
    const q = (CONFIG as any).quality;
    if (!q) return;
    _lastAutoMode = !!q.auto;
    _currentLevel = q.auto ? clampLevel(q.initialAutoLevel) : clampLevel(q.manualLevel);
    _lastSwitchMs = now();
    _lowWindowCount = 0;
    _highWindowCount = 0;
    _windowFrameMs.length = 0;
}

// 获取当前档位 index（0~3）
export function getCurrentLevel(): number {
    return _currentLevel;
}

// 获取当前档位的参数（从 CONFIG 中取，允许 GM 面板实时改参数）
export function getLevelParams(level: number = _currentLevel): QualityLevelParams {
    const q = (CONFIG as any).quality;
    if (!q || !q.levels) {
        return { scale: 1, vplMax: 128, enableScatter: true, enableNpcVol: true, label: 'ultra' };
    }
    const lv = q.levels[clampLevel(level)];
    return {
        scale: lv.scale,
        vplMax: lv.vplMax,
        enableScatter: !!lv.enableScatter,
        enableNpcVol: !!lv.enableNpcVol,
        label: lv.label || `level${level}`,
    };
}

// 注册档位切换回调
export function onQualitySwitch(cb: SwitchCallback): void {
    _callbacks.push(cb);
}

// 手动切档（立即生效，绕过 auto 逻辑）
// 注意：这会触发 CONFIG.quality.manualLevel 写入，但不改 CONFIG.quality.auto
export function setManualLevel(level: number): void {
    const q = (CONFIG as any).quality;
    if (q) q.manualLevel = clampLevel(level);
    if (!q || !q.auto) {
        applyLevel(clampLevel(level), true);
    }
}

// 切换 auto 模式开关
export function setAuto(auto: boolean): void {
    const q = (CONFIG as any).quality;
    if (q) q.auto = !!auto;
    _lastAutoMode = !!auto;
    if (auto) {
        // 重新从 initialAutoLevel 开始
        applyLevel(q ? clampLevel(q.initialAutoLevel) : 2, true);
        _lowWindowCount = 0;
        _highWindowCount = 0;
        _windowFrameMs.length = 0;
    } else {
        // 切到手动档
        applyLevel(q ? clampLevel(q.manualLevel) : 2, true);
    }
}

// 每帧调用：传入本帧耗时（ms）
export function onFrame(frameDtMs: number): void {
    const q = (CONFIG as any).quality;
    if (!q) return;

    // 检测运行时 auto 开关切换（例如 GM 面板改了）
    if (!!q.auto !== _lastAutoMode) {
        setAuto(!!q.auto);
        return;
    }

    // 手动模式：只同步 manualLevel
    if (!q.auto) {
        if (_currentLevel !== clampLevel(q.manualLevel)) {
            applyLevel(clampLevel(q.manualLevel), true);
        }
        return;
    }

    // 自动模式：采样 FPS
    if (frameDtMs <= 0 || frameDtMs > 500) return; // 过滤异常帧
    _windowFrameMs.push(frameDtMs);
    const windowSize = Math.max(10, q.fpsWindowFrames || 60);
    if (_windowFrameMs.length < windowSize) return;

    // 窗口结束：计算平均 FPS
    let sum = 0;
    for (let i = 0; i < _windowFrameMs.length; i++) sum += _windowFrameMs[i];
    const avgFrameMs = sum / _windowFrameMs.length;
    const avgFps = avgFrameMs > 0 ? 1000 / avgFrameMs : 60;
    _windowFrameMs.length = 0;

    // 按阈值累计连续窗口数
    const downTh = q.fpsDownThreshold || 45;
    const upTh = q.fpsUpThreshold || 55;
    if (avgFps < downTh) {
        _lowWindowCount++;
        _highWindowCount = 0;
    } else if (avgFps > upTh) {
        _highWindowCount++;
        _lowWindowCount = 0;
    } else {
        // 中间区间：慢慢衰减两边计数器
        if (_lowWindowCount > 0) _lowWindowCount--;
        if (_highWindowCount > 0) _highWindowCount--;
    }

    // 冷却中不切档
    const cooldown = q.switchCooldownMs || 2000;
    if (now() - _lastSwitchMs < cooldown) return;

    // 降档判定
    if (_lowWindowCount >= (q.downWindows || 2) && _currentLevel > 0) {
        applyLevel(_currentLevel - 1, false);
        _lowWindowCount = 0;
        _highWindowCount = 0;
        return;
    }

    // 升档判定（不超过 autoMaxLevel）
    const autoMax = clampLevel(q.autoMaxLevel != null ? q.autoMaxLevel : 2);
    if (_highWindowCount >= (q.upWindows || 3) && _currentLevel < autoMax) {
        applyLevel(_currentLevel + 1, false);
        _lowWindowCount = 0;
        _highWindowCount = 0;
        return;
    }
}

// ---------------- 内部辅助 ----------------

function clampLevel(level: number): number {
    if (level == null || isNaN(level)) return 2;
    let v = Math.floor(level);
    if (v < 0) v = 0;
    if (v > 3) v = 3;
    return v;
}

function applyLevel(newLevel: number, immediate: boolean): void {
    if (newLevel === _currentLevel && !immediate) return;
    _currentLevel = newLevel;
    _lastSwitchMs = now();
    const params = getLevelParams(newLevel);
    for (let i = 0; i < _callbacks.length; i++) {
        try { _callbacks[i](newLevel, params); } catch (e) { /* ignore */ }
    }
    try { console.log('[Quality] 切换到档位', newLevel, params.label, 'scale=', params.scale, 'vplMax=', params.vplMax); } catch (e) {}
}

function now(): number {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
