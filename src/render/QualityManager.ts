// 画质预设 + FPS 自适应管理器（PC 游戏式）
// --------------------------------------------------------------
// 职责：
//   1. 维护画质预设（low/medium/high/ultra/custom）
//   2. 预设切换时同步写入 CONFIG.quality 的 5 个小项
//   3. 小项被手动改时自动把预设置为 custom
//   4. auto 模式下按 FPS 自适应升降档，直接改小项
//   5. 档位切换时通知 WebGLLight 调整 glCanvas 分辨率
//
// 使用方式（由 game.ts 驱动）：
//   初始化：initQualityManager()
//   每帧：onFrame(frameDtMs)
//   读取参数：getLevelParams()
//   切预设：setPreset('high')
//   开关 auto：setAuto(true/false)

import { CONFIG } from '../core/config';

// 预设名称列表（有序，用于 auto 升降档索引）
const PRESET_ORDER = ['low', 'medium', 'high', 'ultra'] as const;
type PresetName = typeof PRESET_ORDER[number];

export interface QualityLevelParams {
    scale: number;
    rayCount: number;
    vplMax: number;
    enableScatter: boolean;
    enableNpcVol: boolean;
    skipOcclusion: boolean;
    label: string;
}

// 档位切换回调
type SwitchCallback = (label: string, params: QualityLevelParams) => void;
const _callbacks: SwitchCallback[] = [];

// FPS 自适应运行态
let _lastAutoMode = true;
let _lastSwitchMs = 0;
let _lowWindowCount = 0;
let _highWindowCount = 0;
let _windowFrameMs: number[] = [];
// 上一帧快照（用于检测小项被外部改动）
let _lastSnapshot = '';

// ============ 公共接口 ============

export function initQualityManager(): void {
    const q = (CONFIG as any).quality;
    if (!q) return;
    _lastAutoMode = !!q.auto;
    // 按初始预设同步小项
    if (q.preset !== 'custom') {
        syncFromPreset(q.preset);
    }
    _lastSwitchMs = now();
    _lowWindowCount = 0;
    _highWindowCount = 0;
    _windowFrameMs.length = 0;
    _lastSnapshot = snapshotItems();
}

// 获取当前运行时参数（直接从 CONFIG.quality 小项读取）
export function getLevelParams(): QualityLevelParams {
    const q = (CONFIG as any).quality;
    if (!q) {
        return { scale: 1, rayCount: 360, vplMax: 128, enableScatter: true, enableNpcVol: true, skipOcclusion: false, label: 'ultra' };
    }
    return {
        scale: q.scale ?? 1,
        rayCount: q.rayCount ?? 360,
        vplMax: q.vplMax ?? 128,
        enableScatter: q.enableScatter !== false,
        enableNpcVol: q.enableNpcVol !== false,
        skipOcclusion: !!q.skipOcclusion,
        label: q.preset || 'custom',
    };
}

// 获取当前预设名在 PRESET_ORDER 中的索引（custom 返回 -1）
export function getCurrentPresetIndex(): number {
    const q = (CONFIG as any).quality;
    if (!q) return 2;
    return PRESET_ORDER.indexOf(q.preset as PresetName);
}

// 注册档位切换回调
export function onQualitySwitch(cb: SwitchCallback): void {
    _callbacks.push(cb);
}

// 切换预设（立即同步小项 + 通知回调）
export function setPreset(name: string): void {
    const q = (CONFIG as any).quality;
    if (!q) return;
    q.preset = name;
    if (name !== 'custom') {
        syncFromPreset(name);
    }
    _lastSnapshot = snapshotItems();
    fireCallbacks();
}

// 切换 auto 模式
export function setAuto(auto: boolean): void {
    const q = (CONFIG as any).quality;
    if (!q) return;
    q.auto = !!auto;
    _lastAutoMode = !!auto;
    if (auto) {
        // 从 initialAutoLevel 对应的预设开始
        const idx = clampIdx(q.initialAutoLevel ?? 2);
        q.preset = 'custom'; // auto 模式下 preset 始终为 custom
        syncFromPreset(PRESET_ORDER[idx]);
        q.preset = 'custom';
        _lowWindowCount = 0;
        _highWindowCount = 0;
        _windowFrameMs.length = 0;
    }
    _lastSnapshot = snapshotItems();
    fireCallbacks();
}

// 当 GM 面板手动改了某个小项时调用：把 preset 置为 custom
export function onItemEdited(): void {
    const q = (CONFIG as any).quality;
    if (!q) return;
    if (q.preset !== 'custom') {
        q.preset = 'custom';
    }
    _lastSnapshot = snapshotItems();
    fireCallbacks();
}

// 每帧调用
export function onFrame(frameDtMs: number): void {
    const q = (CONFIG as any).quality;
    if (!q) return;

    // 检测 auto 开关切换（GM 面板可能改了）
    if (!!q.auto !== _lastAutoMode) {
        setAuto(!!q.auto);
        return;
    }

    // 检测小项被外部改动（GM 面板直接改了 scale/rayCount 等）
    const snap = snapshotItems();
    if (snap !== _lastSnapshot) {
        // 小项变了但不是我们改的 → 置 custom
        if (q.preset !== 'custom' && !q.auto) {
            q.preset = 'custom';
        }
        _lastSnapshot = snap;
        fireCallbacks();
    }

    // 非 auto 模式：检测预设切换（GM 面板可能改了 preset）
    if (!q.auto) {
        return;
    }

    // ---- auto 模式：FPS 自适应 ----
    if (frameDtMs <= 0 || frameDtMs > 500) return;
    _windowFrameMs.push(frameDtMs);
    const windowSize = Math.max(10, q.fpsWindowFrames || 60);
    if (_windowFrameMs.length < windowSize) return;

    // 窗口结束：计算平均 FPS
    let sum = 0;
    for (let i = 0; i < _windowFrameMs.length; i++) sum += _windowFrameMs[i];
    const avgFrameMs = sum / _windowFrameMs.length;
    const avgFps = avgFrameMs > 0 ? 1000 / avgFrameMs : 60;
    _windowFrameMs.length = 0;

    const downTh = q.fpsDownThreshold || 45;
    const upTh = q.fpsUpThreshold || 55;
    if (avgFps < downTh) {
        _lowWindowCount++;
        _highWindowCount = 0;
    } else if (avgFps > upTh) {
        _highWindowCount++;
        _lowWindowCount = 0;
    } else {
        if (_lowWindowCount > 0) _lowWindowCount--;
        if (_highWindowCount > 0) _highWindowCount--;
    }

    // 冷却
    const cooldown = q.switchCooldownMs || 2000;
    if (now() - _lastSwitchMs < cooldown) return;

    // 找到当前小项最接近哪个预设索引
    const curIdx = findClosestPresetIndex();

    // 降档
    if (_lowWindowCount >= (q.downWindows || 2) && curIdx > 0) {
        autoApplyPreset(curIdx - 1);
        _lowWindowCount = 0;
        _highWindowCount = 0;
        return;
    }

    // 升档（不超过 autoMaxLevel）
    const autoMax = clampIdx(q.autoMaxLevel != null ? q.autoMaxLevel : 3);
    if (_highWindowCount >= (q.upWindows || 3) && curIdx < autoMax) {
        autoApplyPreset(curIdx + 1);
        _lowWindowCount = 0;
        _highWindowCount = 0;
        return;
    }
}

// ============ 内部辅助 ============

function clampIdx(idx: number): number {
    if (idx == null || isNaN(idx)) return 2;
    return Math.max(0, Math.min(PRESET_ORDER.length - 1, Math.floor(idx)));
}

function syncFromPreset(name: string): void {
    const q = (CONFIG as any).quality;
    if (!q || !q.presets) return;
    const p = q.presets[name];
    if (!p) return;
    q.scale = p.scale;
    q.rayCount = p.rayCount;
    q.vplMax = p.vplMax;
    q.enableScatter = p.enableScatter;
    q.enableNpcVol = p.enableNpcVol;
    q.skipOcclusion = !!p.skipOcclusion;
}

function autoApplyPreset(idx: number): void {
    const q = (CONFIG as any).quality;
    if (!q) return;
    idx = clampIdx(idx);
    const name = PRESET_ORDER[idx];
    syncFromPreset(name);
    q.preset = 'custom'; // auto 模式下始终 custom
    _lastSwitchMs = now();
    _lastSnapshot = snapshotItems();
    fireCallbacks();
    try { console.log('[Quality] auto 切换到', name, 'scale=', q.scale, 'rayCount=', q.rayCount, 'vplMax=', q.vplMax); } catch (e) {}
}

function findClosestPresetIndex(): number {
    const q = (CONFIG as any).quality;
    if (!q || !q.presets) return 2;
    // 按 scale 找最接近的预设
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < PRESET_ORDER.length; i++) {
        const p = q.presets[PRESET_ORDER[i]];
        if (!p) continue;
        const diff = Math.abs(q.scale - p.scale);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
        }
    }
    return bestIdx;
}

function snapshotItems(): string {
    const q = (CONFIG as any).quality;
    if (!q) return '';
    return `${q.scale}|${q.rayCount}|${q.vplMax}|${q.enableScatter}|${q.enableNpcVol}|${!!q.skipOcclusion}`;
}

function fireCallbacks(): void {
    const params = getLevelParams();
    for (let i = 0; i < _callbacks.length; i++) {
        try { _callbacks[i](params.label, params); } catch (e) { /* ignore */ }
    }
}

function now(): number {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
