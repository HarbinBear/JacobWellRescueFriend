// =============================================
// 减压停留系统（Decompression System）
// ---------------------------------------------
//
// 作用：模拟真实潜水的氮气累积 / 减压停留 / DCS（Decompression Sickness）。
//
// 运行模型（简化版 Bühlmann 单隔室）：
//
//   每帧推进一个单值 nitrogenLoad ∈ [0, 2]
//   - 深于 ingestDepth（默认 20m）：每秒 += ingestRatePerSec × (depth - ingestDepth)
//     （>maxDepthAllowed 时额外乘 overDepthRateMul）
//   - 浅于 releaseDepth（默认 10m）：每秒 -= releaseRatePerSec
//   - 中间段（10~20m）：既不吸也不排
//
// 减压流程：
//   nitrogenLoad 达到阈值时，系统生成一个"减压任务"= 若干档停留（12/9/6/3m 全部 or 子集）。
//   玩家必须"按顺序从深到浅"在每档目标深度 ±tolerance 米内、|vy| < speedMax 停留 holdSec 秒。
//   完成一档：nitrogenLoad -= stopReduce[i]，指针推进到下一档。
//   全部完成：nitrogenLoad 回到绿灯区，减压任务清空。
//
// 长按加速：
//   玩家长按 HUD 减压灯时，如果此刻确实"在档内且静止"，则本帧内 holdProgress 增速 × speedUpMul；
//   同时产生 speedUpO2Mul 倍的额外氧气消耗（乘到 breath 的 o2 上）。
//
// DCS 惩罚：
//   finishMazeDive(reason) 被调用时，若 nitrogenLoad > thresholdYellow：
//   - severity = (nitrogenLoad >= thresholdCritical ? 2 : 1)
//   - 写入 state.extraction.decoPenalty：下次下潜 O2Max 打折、本次战利品打折、lv2 附紫标 debuff
//
// 对外 API：
//   - updateDecompressionSystem(dt)           每帧由 MazeLogic.updateMaze() 调用
//   - resetDecompressionSystem()              startMazeDive 时清零
//   - getDecoRuntime()                         HUD / 调试读运行时数据
//   - setDecoBoost(on)                         HUD 长按按下/松手
//   - triggerDecoPenaltyOnSurface()           finishMazeDive 里根据当前氮负荷触发惩罚
//   - getPenaltyO2MaxMul()                     Loadout 应用装备时读取"本次下潜 O2Max 打折系数"
//   - getPenaltyLootMul()                      Economy 结算时读取"战利品价值倍率"
//   - consumeDecoPenaltyDive()                finishMazeDive 结束后把 durationDives -1
// =============================================

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { getExtractionState, ensureExtractionState } from '../extraction/core/ExtractionState';

// =============================================
// 运行时数据
// =============================================

interface DecoRuntime {
    /** 氮气负荷（0=干净，>=阈值要减压，>1.5=严重 DCS 风险） */
    nitrogenLoad: number;
    /** 当前减压任务里每一档的完成进度秒数（长度 = CONFIG.deco.stopDepths.length） */
    stopProgress: number[];
    /** 当前应做档位索引（0~3），-1 表示没有减压任务 */
    currentStopIdx: number;
    /**
     * 减压任务锁定标志。一旦氮负荷进入黄线并生成任务，此标志置 true。
     * 只有"按顺序完成全部档位"才会清为 false；
     * 玩家在浅水自然排氮不会解锁；重置系统（新一潜）也会解锁。
     *
     * 外部（MazeLogic）根据此标志决定：
     *   - 锁定中玩家无法主动撤离（retreat）
     *   - 锁定中玩家无法通过出口判胜利（rescued）
     *   - 锁定中玩家若强行触达水面（y<=tileSize/2）→ 判 deco 失败
     */
    lockActive: boolean;
    /** 本帧是否处于"减压窗口"（深度匹配 + 速度合格）——供 HUD 显示 "holding" 动画 */
    inHoldWindow: boolean;
    /** 玩家是否正在长按加速 */
    boostActive: boolean;
    /** 上一帧玩家深度（米），用于检测"上浮到水面出水"瞬间触发惩罚判断 */
    lastDepth: number;
    /** 是否曾触达黄灯（用于首次教学文案） */
    hasShownWarning: boolean;
}

const runtime: DecoRuntime = {
    nitrogenLoad: 0,
    stopProgress: [0, 0, 0, 0],
    currentStopIdx: -1,
    lockActive: false,
    inHoldWindow: false,
    boostActive: false,
    lastDepth: 0,
    hasShownWarning: false,
};

// =============================================
// 对外查询
// =============================================

/** 读运行时状态（HUD 和调试层用） */
export function getDecoRuntime(): Readonly<DecoRuntime> {
    return runtime;
}

/** 当前氮负荷在哪个警戒级别：0=green 1=yellow 2=red 3=critical */
export function getDecoLevel(): 0 | 1 | 2 | 3 {
    const cfg: any = (CONFIG as any).deco;
    const n = runtime.nitrogenLoad;
    if (n >= cfg.thresholdCritical) return 3;
    if (n >= cfg.thresholdRed) return 2;
    if (n >= cfg.thresholdYellow) return 1;
    return 0;
}

/** 玩家当前深度（米）。读 player.y / mazeTileSize。 */
export function getCurrentDepthMeters(): number {
    const maze: any = state.mazeRescue;
    if (!maze) return 0;
    const tile = maze.mazeTileSize || 120;
    return Math.max(0, player.y / tile);
}

/** 当前"应做"的停留档信息；没有任务时返回 null */
export function getCurrentStopInfo(): { idx: number, depth: number, hold: number, progress: number } | null {
    if (runtime.currentStopIdx < 0) return null;
    const cfg: any = (CONFIG as any).deco;
    const i = runtime.currentStopIdx;
    return {
        idx: i,
        depth: cfg.stopDepths[i] || 0,
        hold: cfg.stopHoldSec[i] || 0,
        progress: runtime.stopProgress[i] || 0,
    };
}

/** 玩家是否处于"需要减压"状态（灯是黄或更亮，或还有未完成档位，或锁定中） */
export function isDecompressionRequired(): boolean {
    return runtime.lockActive || runtime.currentStopIdx >= 0 || getDecoLevel() >= 1;
}

/** 减压任务是否锁定：锁定中玩家不能自由出水，出水即判 DCS 失败 */
export function isDecoLockActive(): boolean {
    return runtime.lockActive;
}

// =============================================
// HUD 控制
// =============================================

/** HUD 长按按下/松手时调用 */
export function setDecoBoost(active: boolean): void {
    runtime.boostActive = !!active;
}

/** 供 BreathSystem / 耗氧系统查询：本帧长按减压加速是否生效（需要同时"在档内"） */
export function isDecoBoostActive(): boolean {
    return runtime.boostActive && runtime.inHoldWindow && runtime.currentStopIdx >= 0;
}

/** 氧气消耗倍率（如果长按加速生效，返回 speedUpO2Mul；否则 1） */
export function getDecoO2Mul(): number {
    if (!isDecoBoostActive()) return 1;
    const cfg: any = (CONFIG as any).deco;
    return cfg.speedUpO2Mul || 1;
}

// =============================================
// 生命周期
// =============================================

/** 迷宫每次 startMazeDive 调用：清空一切，新一轮从 0 开始 */
export function resetDecompressionSystem(): void {
    runtime.nitrogenLoad = 0;
    runtime.stopProgress = [0, 0, 0, 0];
    runtime.currentStopIdx = -1;
    runtime.lockActive = false;
    runtime.inHoldWindow = false;
    runtime.boostActive = false;
    runtime.lastDepth = 0;
    runtime.hasShownWarning = false;
}

// =============================================
// 每帧推进
// =============================================

/**
 * 迷宫模式每帧调用。放在 updateMaze() 的 play 分支里（碰撞/氧气之后）。
 * dt 单位：秒。上层按 1/60 传入。
 */
export function updateDecompressionSystem(dt: number): void {
    const cfg: any = (CONFIG as any).deco;
    if (!cfg || !cfg.enabled) return;
    const maze: any = state.mazeRescue;
    if (!maze || maze.phase !== 'play') return;

    const depth = getCurrentDepthMeters();
    runtime.lastDepth = depth;

    // === 1. 氮气吸排 ===
    if (depth > cfg.ingestDepth) {
        // 吸氮：线性比例
        let rate = cfg.ingestRatePerSec * (depth - cfg.ingestDepth);
        // 超出装备极限深度时额外惩罚
        const maxAllowed = (maze.maxDepthAllowed | 0) || 0;
        if (maxAllowed > 0 && depth > maxAllowed) {
            rate *= (cfg.overDepthRateMul || 2);
        }
        runtime.nitrogenLoad = Math.min(2, runtime.nitrogenLoad + rate * dt);
    } else if (depth < cfg.releaseDepth) {
        // 排氮
        runtime.nitrogenLoad = Math.max(0, runtime.nitrogenLoad - (cfg.releaseRatePerSec || 0) * dt);
    }
    // 中间段（releaseDepth ~ ingestDepth）保持不变，模拟"组织平衡区"

    // === 2. 触发减压任务（当氮负荷跨过黄线时，生成任务并锁定）===
    const level = getDecoLevel();
    if (runtime.currentStopIdx < 0 && !runtime.lockActive && level >= 1) {
        // 还没有任务：按等级起档
        const startIdxArr: number[] = cfg.startIdxByLevel || [3, 2, 1, 0];
        const startIdx = startIdxArr[level] !== undefined ? startIdxArr[level] : 3;
        if (startIdx >= 0 && startIdx < (cfg.stopDepths || []).length) {
            runtime.currentStopIdx = startIdx;
            runtime.stopProgress = (cfg.stopDepths as number[]).map(() => 0);
            runtime.lockActive = true;   // 锁定：直到按顺序完成所有档位才解锁
        }
    }
    // 注意：一旦 lockActive，浅水自然排氮不会取消任务——必须做完停留才能解锁
    // 玩家如果在任务已生成后继续下深，氮负荷会再涨，但当前档位不会回退

    // === 3. 减压窗口判定 + 进度推进 ===
    runtime.inHoldWindow = false;
    if (runtime.currentStopIdx >= 0) {
        const i = runtime.currentStopIdx;
        const targetDepth: number = cfg.stopDepths[i];
        const tol: number = cfg.depthTolerance || 1.5;
        const speedMax: number = cfg.holdSpeedMax || 0.8;
        const vy = Math.abs(player.vy || 0);
        const inDepth = Math.abs(depth - targetDepth) <= tol;
        const stillEnough = vy < speedMax;

        if (inDepth && stillEnough) {
            runtime.inHoldWindow = true;
            // 推进该档 holdProgress
            const speedMul = runtime.boostActive ? (cfg.speedUpMul || 5) : 1;
            runtime.stopProgress[i] += dt * speedMul;

            const holdSec: number = cfg.stopHoldSec[i] || 3;
            if (runtime.stopProgress[i] >= holdSec) {
                // 本档完成
                const reduce: number = cfg.stopReduce[i] || 0.3;
                runtime.nitrogenLoad = Math.max(0, runtime.nitrogenLoad - reduce);
                runtime.stopProgress[i] = 0;
                runtime.currentStopIdx = i + 1;
                // 超出最后一档 → 任务完成，解锁
                if (runtime.currentStopIdx >= (cfg.stopDepths as number[]).length) {
                    runtime.currentStopIdx = -1;
                    runtime.lockActive = false;
                    runtime.nitrogenLoad = 0;  // 减压完成，氮负荷归零
                }
            }
        }
    }

    // === 4. 教学提示（首次触达黄灯时）===
    // 放到 MazeLogic 那边做文案推送更合适，但为了不引入反向依赖，这里只记录"需要显示"的标志，
    // MazeLogic 在 updateMaze 里轮询到后播放提示。
    // 见 consumeDecoWarningRequest()
}

// =============================================
// 教学提示（首次黄灯提醒）
// =============================================

/**
 * MazeLogic 每帧轮询：若此次是首次触达黄灯则返回一次 true，之后永远 false。
 * 通过 storyManager.showText 派发教学文案。
 */
export function consumeDecoWarningRequest(): boolean {
    if (runtime.hasShownWarning) return false;
    if (getDecoLevel() >= 1) {
        runtime.hasShownWarning = true;
        return true;
    }
    return false;
}

// =============================================
// DCS 惩罚（finishMazeDive 调用）
// =============================================

/**
 * surfacing / failed 结算时调用。判断是否写入 DCS 惩罚。
 *
 * 新规则（lockActive 模型下）：
 *   - 未锁定（没进过黄线 or 已完成减压解锁）→ 无惩罚
 *   - 锁定中被强制出水（deco 失败）→ 按氮负荷严重度给 severity 1 或 2
 *   - 锁定中因其他原因结束（fishkill / o2）→ 同样叠加一次 DCS 惩罚（双重打击）
 *
 * 返回 severity：0 = 没事 / 1 = 轻度 / 2 = 重度
 */
export function triggerDecoPenaltyOnSurface(): 0 | 1 | 2 {
    const cfg: any = (CONFIG as any).deco;
    if (!cfg || !cfg.enabled) return 0;
    // 只有锁定中才算 DCS 惩罚场景（已完成减压 / 未触发过黄线 = 安全）
    if (!runtime.lockActive) return 0;

    const n = runtime.nitrogenLoad;
    // 锁定中出水最低也是 lv1（即使氮负荷因浅水排氮被蒙混到黄线以下，玩家也算"闯关失败"）
    const severity: 1 | 2 = (n >= cfg.thresholdCritical ? 2 : 1);
    const pen = cfg.penalty || {};

    const ex = ensureExtractionState() as any;
    const o2Mul = severity === 2 ? (pen.o2MaxMulLv2 || 0.7) : (pen.o2MaxMulLv1 || 0.7);
    const lootMul = severity === 2 ? (pen.lootMulLv2 ?? 0) : (pen.lootMulLv1 ?? 0.5);
    const durationDives = severity === 2 ? (pen.durationDivesLv2 || 2) : (pen.durationDivesLv1 || 1);

    // 写入持久化字段（若已有未消耗的惩罚，取更严重的一档）
    const existing = ex.decoPenalty as DecoPenaltyState | undefined;
    if (existing && existing.severity > severity) {
        // 已经有更严重的惩罚了，不覆盖，但本次战利品打折用新旧里更严的那个
        ex.decoPenalty = {
            ...existing,
            currentLootMul: Math.min(existing.currentLootMul ?? 1, lootMul),
        };
    } else {
        ex.decoPenalty = {
            severity,
            o2MaxMul: o2Mul,
            remainingDives: durationDives,
            currentLootMul: lootMul,
        };
    }
    return severity;
}

/**
 * 消耗一次下潜：每次 finishMazeDive 成功调用本函数把 remainingDives -= 1。
 * 减到 0 时清除整个 decoPenalty。
 * 必须在 triggerDecoPenaltyOnSurface 之后调用——但只减"遗留的"惩罚，不影响本次刚写入的。
 *
 * 调用顺序建议：finishMazeDive 里先调 triggerDecoPenaltyOnSurface()（记录新惩罚），
 * 然后 consumeDecoPenaltyDive()（把本次下潜算一次）。新写入的 remainingDives=1 或 2，减一后还有剩。
 */
export function consumeDecoPenaltyDive(): void {
    const ex = getExtractionState() as any;
    if (!ex || !ex.decoPenalty) return;
    const pen = ex.decoPenalty as DecoPenaltyState;
    pen.remainingDives = Math.max(0, (pen.remainingDives || 0) - 1);
    // 本次撤离的 currentLootMul 只生效一次，用完就清（避免下次还打折）
    pen.currentLootMul = undefined;
    if (pen.remainingDives <= 0) {
        ex.decoPenalty = undefined;
    }
}

/** Loadout 应用：本次下潜 O2Max 倍率（1 = 无惩罚）。
 *  会同时消耗"首次应用标志"，确保惩罚只在惩罚存在时起作用。 */
export function getPenaltyO2MaxMul(): number {
    const ex = getExtractionState() as any;
    if (!ex || !ex.decoPenalty) return 1;
    const pen = ex.decoPenalty as DecoPenaltyState;
    return pen.o2MaxMul || 1;
}

/** 战利品价值倍率：1 = 无惩罚；0.5 = 减半；0 = 全损。
 *  仅在 currentLootMul 存在时生效；被 consumeDecoPenaltyDive 清除后返回 1。 */
export function getPenaltyLootMul(): number {
    const ex = getExtractionState() as any;
    if (!ex || !ex.decoPenalty) return 1;
    const pen = ex.decoPenalty as DecoPenaltyState;
    const v = pen.currentLootMul;
    return typeof v === 'number' ? v : 1;
}

/** 是否处于"紫标 debuff"（lv2 严重 DCS 后的标识）——给岸上 HUD 用 */
export function isPurpleDebuffActive(): boolean {
    const ex = getExtractionState() as any;
    if (!ex || !ex.decoPenalty) return false;
    const cfg: any = (CONFIG as any).deco;
    const show = cfg?.penalty?.showPurpleBadgeLv2;
    if (!show) return false;
    return (ex.decoPenalty.severity | 0) >= 2;
}

// =============================================
// 类型导出（被 ExtractionState 的 patch 引用）
// =============================================

export interface DecoPenaltyState {
    /** 1 = 轻度、2 = 重度 */
    severity: 1 | 2;
    /** 下潜 O2Max 倍率（如 0.7） */
    o2MaxMul: number;
    /** 还剩多少次下潜受这个惩罚影响（每次 finishMazeDive 扣 1） */
    remainingDives: number;
    /** 本次撤离战利品价值倍率（首次生效后被 consumeDecoPenaltyDive 清除） */
    currentLootMul?: number;
}
