// =============================================
// BCD 浮力控制系统（Buoyancy Control Device / 浮力补偿背心）
// ---------------------------------------------
//
// 真实潜水背景（决定了下面所有公式的形状）：
//
// 1. BCD 是一件带气囊的背心，气囊通过中压软管（LPI）直连气瓶第一级。
//    潜水员左手握 inflator 手柄，拇指按两颗钮：
//      - 充气钮（inflate）：气瓶的气进气囊 → 体积变大 → 浮力变大 → 上浮
//      - 排气钮（deflate）：气囊的气从肩阀排进水里 → 体积变小 → 下沉
//    真实使用是"点射"（short burst，0.2~0.5 秒一下），不是长按不放。
//
// 2. 浮力来源是阿基米德原理。潜水员整体受力：
//      配重铅块与装备的负浮力（恒定）
//    + BCD 气囊体积提供的正浮力（可控）
//    + 湿衣 neoprene 气孔提供的正浮力（随深度被压扁而减小）
//    + 肺容积提供的正浮力（呼吸微调，本项目已由 BreathSystem 实现）
//
// 3. 最核心、也最容易杀死潜水员的一条：玻意耳定律 P·V = 常数。
//    绝对压力 P = 1 + 深度/10（atm）。气囊内气体"物质量"不变，体积随深度反比：
//      - 下潜 → P 变大 → 气囊压小 → 浮力变小 → 沉更快 → 更深 …
//        正反馈 = 不受控下沉
//      - 上浮 → P 变小 → 气囊膨胀 → 浮力变大 → 升更快 → 更浅 …
//        正反馈 = 不受控上浮（runaway ascent），真实潜水最致命事故之一，
//        直接导致肺气压伤与重度减压病
//    所以真实潜水员整程都在微调 BCD，尤其上浮时必须持续排气。
//
// 4. 分工：BCD 是粗调，呼吸是微调。本项目已有呼吸浮力（BreathSystem），
//    BCD 叠加在它之上，形成"粗调 + 微调"两层，与真实潜水完全一致。
//
// ---------------------------------------------
// 游戏化实现模型
//
// 唯一状态真相是 gasNL —— 气囊内气体的"标准升"（换算到水面 1atm 下的体积）。
// 它只被玩家充/排气改变，不随深度变化。
//
//   P    = 1 + depth / depthPerAtmMeters              绝对压力（atm）
//   volL = gasNL / P                                  玻意耳：实际体积（升）
//   suit = suitLiftSurfaceL / P                       湿衣浮力，同样被压缩
//   a_y  = baseSinkAccel - (volL + suit) × liftAccelPerLiter
//
//   a_y > 0 下沉（+Y）；a_y < 0 上浮（-Y）；每帧 player.vy += a_y
//
// 中性浮力所需体积（玩家要努力维持的目标）：
//   neutralVolL(depth) = baseSinkAccel / liftAccelPerLiter - suitLiftSurfaceL / P
// 它随深度变大（湿衣越深越不给力）。UI 上的中性刻度线因此会动，
// 玩家下潜时会亲眼看到"刻度线往上跑、气量条往下掉"，教学完全自解释。
//
// 充排气都按"实际体积流量"推进（按住 1 秒得到的浮力变化恒定，操作可预期），
// 换算回 gasNL 时乘 P —— 于是"深处充气更费气瓶"自动涌现：
//   ΔgasNL = ΔvolL × P，气瓶消耗 = ΔgasNL × o2PerNL
//
// ---------------------------------------------
// 惩罚闭环（刻意不新增失败分支，复用已有减压系统）：
//   失控上浮时每秒往 nitrogenLoad 追加 ascentNitrogenPerSec，
//   于是"忘记排气 → 越升越快 → 氮负荷飙升 → 减压任务锁定 →
//   不做完减压出水 = 重度减压病"这条真实因果链自然成立。
//
// ---------------------------------------------
// 启用范围：仅迷宫救援模式（screen === 'mazeRescue' 且 phase === 'play'）。
//           主线 / 竞技场不启用（没有深度与气瓶经济）。
// =============================================

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { addNitrogenLoad, getCurrentDepthMeters } from './DecompressionSystem';
import { spawnBCDVentBubbles } from './BreathSystem';
import { playSFX } from '../audio/AudioManager';

// =============================================
// 运行时数据
// =============================================

export interface BCDRuntime {
    /** 气囊内气体的标准升（水面 1atm 下体积）。唯一状态真相 */
    gasNL: number;
    /** 当前实际体积（升）= gasNL / P，每帧由 gasNL 派生 */
    volumeL: number;
    /** 当前绝对压力（atm） */
    pressureAtm: number;
    /** 本帧净浮力加速度（>0 下沉 / <0 上浮），供渲染层画方向指示 */
    netAccel: number;

    /** 充气钮按下中 */
    inflateHeld: boolean;
    /** 排气钮按下中 */
    deflateHeld: boolean;
    /** 点按补足计时：松手过早时用它把这一下补成一个完整 short burst（秒） */
    inflateBurstRemain: number;
    deflateBurstRemain: number;
    /** 本帧是否真的在充/排气（含 burst 补足），供 UI 与音效判定 */
    inflating: boolean;
    deflating: boolean;
    /** 溢流：气囊已满还继续充（超压排气阀动作），供 UI 闪提示 */
    overflow: boolean;

    /** 待结算的气瓶消耗（氧气值），由 consumeBCDO2() 取走并清零 */
    o2Debt: number;
    /** 本次下潜累计充气消耗（结算 / 调试用） */
    o2SpentTotal: number;

    /** 失控上浮告警强度 0~1（平滑量，供 UI 脉冲） */
    ascentWarn: number;
    /** 失控下沉告警强度 0~1 */
    descentWarn: number;

    /** 系统是否激活（水下可操作） */
    active: boolean;
    /** 上一次嘶气音效时间戳（节流） */
    lastHissAt: number;
    /** 排气气泡生成累积（粒/帧） */
    ventBubbleAccum: number;
    /** 教学提示：是否已经推送过"气体被压缩"的首次提示 */
    tutorialShown: boolean;
    /** 教学提示待推送标志（由 consumeBCDTutorialRequest 取走） */
    tutorialPending: boolean;
}

const runtime: BCDRuntime = {
    gasNL: 0,
    volumeL: 0,
    pressureAtm: 1,
    netAccel: 0,
    inflateHeld: false,
    deflateHeld: false,
    inflateBurstRemain: 0,
    deflateBurstRemain: 0,
    inflating: false,
    deflating: false,
    overflow: false,
    o2Debt: 0,
    o2SpentTotal: 0,
    ascentWarn: 0,
    descentWarn: 0,
    active: false,
    lastHissAt: 0,
    ventBubbleAccum: 0,
    tutorialShown: false,
    tutorialPending: false,
};

function cfg(): any {
    return (CONFIG as any).bcd || {};
}

// =============================================
// 物理换算工具
// =============================================

/** 绝对压力（atm）：水面 1，每 depthPerAtmMeters 米 +1 */
function pressureAtDepth(depthMeters: number): number {
    const perAtm = cfg().depthPerAtmMeters || 10;
    return 1 + Math.max(0, depthMeters) / Math.max(0.1, perAtm);
}

/** 湿衣在该压力下还剩多少升等效浮力（neoprene 被压扁 → 越深越少） */
function suitLiftAt(pressure: number): number {
    return (cfg().suitLiftSurfaceL || 0) / Math.max(0.01, pressure);
}

/**
 * 该深度下达到中性浮力所需的气囊实际体积（升）。
 * = 配重负浮力换算出的总需求升数 − 湿衣此刻还能提供的升数
 * 随深度增大（湿衣失效），是 UI 上那条会动的中性刻度线。
 */
export function getNeutralVolumeL(depthMeters?: number): number {
    const c = cfg();
    const lift = c.liftAccelPerLiter || 0.0122;
    const p = pressureAtDepth(depthMeters != null ? depthMeters : getCurrentDepthMeters());
    const need = (c.baseSinkAccel || 0.02) / Math.max(1e-6, lift);
    return Math.max(0, need - suitLiftAt(p));
}

/** 给定实际体积与压力，算出净浮力加速度（>0 下沉） */
function netAccelFor(volumeL: number, pressure: number): number {
    const c = cfg();
    const lift = c.liftAccelPerLiter || 0.0122;
    return (c.baseSinkAccel || 0.02) - (volumeL + suitLiftAt(pressure)) * lift;
}

// =============================================
// 激活条件
// =============================================

function shouldBeActive(): boolean {
    const c = cfg();
    if (!c.enabled) return false;
    if (state.screen !== 'mazeRescue') return false;
    const maze: any = state.mazeRescue;
    if (!maze || maze.phase !== 'play') return false;
    // 被鱼咬住 / 死亡过场期间不响应操作（与呼吸系统一致）
    if (state.fishBite && state.fishBite.active) return false;
    return true;
}

// =============================================
// 生命周期
// =============================================

/**
 * 每次 startMazeDive 调用。
 * 按 initialFillMode 决定入水时气囊里有多少气：
 *   'neutral'（默认）= 恰好在入水深度中性，对玩家友好，下潜后会亲眼看到气被压缩
 *   'empty'          = 完全排空（硬核：入水就往下掉）
 *   'full'           = 充满（真实水面姿态：必须先排气才下得去）
 */
export function resetBCDSystem(): void {
    const c = cfg();
    runtime.inflateHeld = false;
    runtime.deflateHeld = false;
    runtime.inflateBurstRemain = 0;
    runtime.deflateBurstRemain = 0;
    runtime.inflating = false;
    runtime.deflating = false;
    runtime.overflow = false;
    runtime.o2Debt = 0;
    runtime.o2SpentTotal = 0;
    runtime.ascentWarn = 0;
    runtime.descentWarn = 0;
    runtime.active = false;
    runtime.lastHissAt = 0;
    runtime.ventBubbleAccum = 0;
    runtime.tutorialShown = false;
    runtime.tutorialPending = false;

    const depth = getCurrentDepthMeters();
    const p = pressureAtDepth(depth);
    const mode: string = c.initialFillMode || 'neutral';
    let vol: number;
    if (mode === 'empty') vol = 0;
    else if (mode === 'full') vol = c.capacityL || 4;
    else vol = getNeutralVolumeL(depth);

    runtime.pressureAtm = p;
    runtime.volumeL = vol;
    runtime.gasNL = vol * p;
    runtime.netAccel = netAccelFor(vol, p);
}

// =============================================
// UI 控制入口
// =============================================

/**
 * 充气钮按下 / 松手。
 * 松手时若按压过短，用 burst 计时把这一下补成完整的 short burst，
 * 让"轻点一下 = 给一小口气"的手感成立（真实潜水员就是这么点射的）。
 */
export function setBCDInflate(active: boolean): void {
    if (active) {
        if (!runtime.inflateHeld) {
            runtime.inflateBurstRemain = Math.max(runtime.inflateBurstRemain, cfg().minBurstSec || 0.18);
        }
        runtime.inflateHeld = true;
    } else {
        runtime.inflateHeld = false;
    }
}

/** 排气钮按下 / 松手（同样支持点射补足） */
export function setBCDDeflate(active: boolean): void {
    if (active) {
        if (!runtime.deflateHeld) {
            runtime.deflateBurstRemain = Math.max(runtime.deflateBurstRemain, cfg().minBurstSec || 0.18);
        }
        runtime.deflateHeld = true;
    } else {
        runtime.deflateHeld = false;
    }
}

/** 强制松开两颗钮（切场景 / 打开全屏页 / 被鱼咬时调用，避免卡住持续充气） */
export function releaseBCDControls(): void {
    runtime.inflateHeld = false;
    runtime.deflateHeld = false;
    runtime.inflateBurstRemain = 0;
    runtime.deflateBurstRemain = 0;
}

// =============================================
// 每帧推进
// =============================================

/**
 * 迷宫模式每帧调用（放在氧气结算之前）。dt 单位：秒。
 *
 * 顺序：
 *   1. 压力与体积从 gasNL 派生（玻意耳）
 *   2. 处理充/排气输入（体积流量 → 换算 gasNL → 记账气瓶消耗）
 *   3. 重算净浮力加速度
 *   4. 失控上浮 / 下沉告警与加氮惩罚
 */
export function updateBCDSystem(dt: number): void {
    const c = cfg();
    const active = shouldBeActive();

    if (!active) {
        if (runtime.active) releaseBCDControls();
        runtime.active = false;
        runtime.inflating = false;
        runtime.deflating = false;
        runtime.overflow = false;
        // ascentWarn / descentWarn 平滑归零，避免转场时告警硬切
        const fall = c.warnFallPerSec || 2.5;
        runtime.ascentWarn = Math.max(0, runtime.ascentWarn - fall * dt);
        runtime.descentWarn = Math.max(0, runtime.descentWarn - fall * dt);
        return;
    }
    runtime.active = true;

    // === 1. 玻意耳：由 gasNL 派生本帧实际体积 ===
    const depth = getCurrentDepthMeters();
    const p = pressureAtDepth(depth);
    runtime.pressureAtm = p;
    runtime.volumeL = runtime.gasNL / Math.max(0.01, p);

    // === 2. 充 / 排气 ===
    runtime.overflow = false;
    const capacity = c.capacityL || 4;

    // 排气优先：真实潜水里"要停下失控就先排气"，两钮同时按时排气赢
    const wantDeflate = runtime.deflateHeld || runtime.deflateBurstRemain > 0;
    const wantInflate = !wantDeflate && (runtime.inflateHeld || runtime.inflateBurstRemain > 0);

    runtime.inflating = false;
    runtime.deflating = false;

    if (wantDeflate) {
        const dVol = (c.deflateRateLPerSec || 0.7) * dt;
        const before = runtime.volumeL;
        runtime.volumeL = Math.max(0, runtime.volumeL - dVol);
        runtime.gasNL = runtime.volumeL * p;
        runtime.deflating = before > 0.0005;
        runtime.deflateBurstRemain = Math.max(0, runtime.deflateBurstRemain - dt);
        // 排气赢下这一帧时顺手清掉充气的点射欠账，
        // 否则"轻点充气 → 立刻改按排气"会在排气结束后诡异地补一口气进来
        runtime.inflateBurstRemain = 0;
    } else if (wantInflate) {
        // 气瓶空了充不进气（真实：第一级没压力，inflator 完全无效）。
        // 这个判断必须在扣账之前，否则会出现"氧气已空还在记欠账"
        if (player.o2 > 0 || CONFIG.infiniteO2) {
            const dVol = (c.inflateRateLPerSec || 0.5) * dt;
            const target = runtime.volumeL + dVol;
            if (target > capacity) runtime.overflow = true;
            const clamped = Math.min(capacity, target);
            const addedVol = clamped - runtime.volumeL;
            if (addedVol > 0) {
                // 体积流量换算回标准升：深处同样体积要更多气 → 深处充气更费气瓶
                const addedNL = addedVol * p;
                runtime.volumeL = clamped;
                runtime.gasNL = runtime.volumeL * p;
                const cost = addedNL * (c.o2PerNL || 0.3);
                runtime.o2Debt += cost;
                runtime.o2SpentTotal += cost;
                runtime.inflating = true;
            }
        }
        runtime.inflateBurstRemain = Math.max(0, runtime.inflateBurstRemain - dt);
    } else {
        runtime.inflateBurstRemain = 0;
        runtime.deflateBurstRemain = 0;
    }

    // 气瓶空了充不进气（真实：第一级没压力，inflator 无效）
    // 上面的分支已经做过 o2 判断，这里是双保险（例如同一帧被其他系统扣空）
    if (runtime.inflating && player.o2 <= 0 && !CONFIG.infiniteO2) {
        runtime.inflating = false;
    }

    // === 3. 净浮力 ===
    runtime.netAccel = netAccelFor(runtime.volumeL, p);

    // === 3b. 表现层：排气气泡束 + 嘶气音效 ===
    updateBCDEffects(dt);

    // === 4. 失控告警 + 加氮惩罚 ===
    // 只在"BCD 本身在推着你走"时判定，玩家主动游泳不算失控
    const rise = c.warnRisePerSec || 1.6;
    const fall = c.warnFallPerSec || 2.5;
    const vy = player.vy || 0;

    const runawayUp = runtime.netAccel < -(c.warnAccelDeadzone || 0.002)
        && vy < -(c.ascentWarnSpeed || 0.55);
    const runawayDown = runtime.netAccel > (c.warnAccelDeadzone || 0.002)
        && vy > (c.descentWarnSpeed || 0.85);

    runtime.ascentWarn = runawayUp
        ? Math.min(1, runtime.ascentWarn + rise * dt)
        : Math.max(0, runtime.ascentWarn - fall * dt);
    runtime.descentWarn = runawayDown
        ? Math.min(1, runtime.descentWarn + rise * dt)
        : Math.max(0, runtime.descentWarn - fall * dt);

    // 失控上浮 = 真实世界里最直接的减压病诱因：往氮负荷里灌
    if (runawayUp) {
        addNitrogenLoad((c.ascentNitrogenPerSec || 0.05) * dt);
    }

    // === 5. 教学提示：首次明显感到"气被压缩"时推一次文案 ===
    if (!runtime.tutorialShown && depth > (c.tutorialDepth || 12)) {
        runtime.tutorialShown = true;
        runtime.tutorialPending = true;
    }
}

// =============================================
// 表现层：排气气泡 + 嘶气音效
// =============================================

/** 排气阀世界坐标：肩后侧（沿身体朝向往后 + 往左肩偏），与真实肩部 dump valve 位置一致 */
export function getBCDVentPos(): { x: number; y: number } {
    const c = cfg();
    const back = c.ventOffsetBack || 8;
    const side = c.ventOffsetSide || 7;
    const cosA = Math.cos(player.angle);
    const sinA = Math.sin(player.angle);
    // 局部 (-back, -side) → 世界（+x 为朝向，+y 为右侧，所以 -side 是左肩）
    return {
        x: player.x + cosA * -back + -sinA * -side,
        y: player.y + sinA * -back + cosA * -side,
    };
}

function updateBCDEffects(dt: number): void {
    const c = cfg();

    // --- 排气气泡：从肩阀连续涌出一大串 ---
    if (runtime.deflating) {
        runtime.ventBubbleAccum += (c.ventBubbleRate || 26) * dt;
        if (runtime.ventBubbleAccum >= 1) {
            const n = Math.floor(runtime.ventBubbleAccum);
            runtime.ventBubbleAccum -= n;
            const vent = getBCDVentPos();
            spawnBCDVentBubbles(vent.x, vent.y, n, c.ventBubbleSizeMul || 0.85);
        }
    } else {
        runtime.ventBubbleAccum = 0;
    }

    // --- 嘶气音效：按住时按固定间隔重复播一次性短音 ---
    if (!c.sfxEnabled) return;
    if (!runtime.inflating && !runtime.deflating) return;
    const now = Date.now();
    const interval = c.sfxIntervalMs || 260;
    if (now - runtime.lastHissAt < interval) return;
    runtime.lastHissAt = now;
    if (runtime.deflating) {
        playSFX('collisionBreath', {
            volume: c.sfxDeflateVolume ?? 0.5,
            playbackRate: c.sfxDeflateRate ?? 1.25,
        });
    } else {
        playSFX('collisionBreath', {
            volume: c.sfxInflateVolume ?? 0.32,
            playbackRate: c.sfxInflateRate ?? 1.7,
        });
    }
}

// =============================================
// 对外读取
// =============================================

/** 返回本帧要叠加到 player.vy 的加速度（未激活时为 0） */
export function computeBCDBuoyancyAccel(): number {
    if (!cfg().enabled) return 0;
    if (!runtime.active) return 0;
    return runtime.netAccel;
}

/** 取走本帧充气欠下的气瓶消耗（读后清零），由 MazeLogic 加进 o2Consumption */
export function consumeBCDO2(): number {
    const v = runtime.o2Debt;
    runtime.o2Debt = 0;
    return v;
}

export function getBCDRuntime(): Readonly<BCDRuntime> {
    return runtime;
}

/** 本次下潜累计用在浮力控制上的气（结算展示用） */
export function getBCDO2SpentTotal(): number {
    return runtime.o2SpentTotal;
}

/**
 * 渲染层一次性拿齐画表所需的全部量。
 *   fillRatio    气量条填充比例（0~1，按 displayMaxL 归一）
 *   neutralRatio 中性刻度线位置（0~1，同一坐标系；随深度变化）
 *   netLiftNorm  净浮力归一到 [-1, +1]：+1 = 最大上浮，-1 = 最大下沉
 *   overRange    实际体积是否超出显示量程（条顶格 + 溢流警示）
 */
export function getBCDGaugeInfo(): {
    volumeL: number;
    neutralL: number;
    fillRatio: number;
    neutralRatio: number;
    netLiftNorm: number;
    pressureAtm: number;
    overRange: boolean;
} {
    const c = cfg();
    const displayMax = Math.max(0.1, c.displayMaxL || 2.5);
    const neutralL = getNeutralVolumeL();
    // 净浮力归一：以"排空时的最大下沉加速度"作为 -1 的参考尺度
    const sinkRef = Math.max(1e-6, c.baseSinkAccel || 0.02);
    const norm = Math.max(-1, Math.min(1, -runtime.netAccel / sinkRef));
    return {
        volumeL: runtime.volumeL,
        neutralL,
        fillRatio: Math.max(0, Math.min(1, runtime.volumeL / displayMax)),
        neutralRatio: Math.max(0, Math.min(1, neutralL / displayMax)),
        netLiftNorm: norm,
        pressureAtm: runtime.pressureAtm,
        overRange: runtime.volumeL > displayMax + 1e-6,
    };
}

/**
 * 供 RenderDiver 画背心膨胀：0~1（按 capacityL 归一）。
 *
 * 注意这里按 screen 而不是按 runtime.active 判定：
 *   - runtime.active 在 diving_in / surfacing / failed 等过场 phase 是 false，
 *     但那些 phase 仍然会绘制潜水员，气囊应该继续显示，否则背心会凭空消失
 *   - 反过来，离开迷宫模式（主线 / 竞技场 / 菜单）必须归零，
 *     否则上一次下潜残留的 volumeL 会让主线的潜水员莫名背着个鼓包
 */
export function getBCDInflationRatio(): number {
    if (!cfg().enabled) return 0;
    if (state.screen !== 'mazeRescue') return 0;
    const cap = Math.max(0.1, cfg().capacityL || 4);
    return Math.max(0, Math.min(1, runtime.volumeL / cap));
}

/** 供 RenderDiver 画肩阀高光：是否正在排气（同样按 screen 兜底归零） */
export function isBCDVenting(): boolean {
    if (!cfg().enabled) return false;
    if (state.screen !== 'mazeRescue') return false;
    return runtime.deflating;
}

/** MazeLogic 每帧轮询：首次深潜教学文案要不要弹（只返回一次 true） */
export function consumeBCDTutorialRequest(): boolean {
    if (!runtime.tutorialPending) return false;
    runtime.tutorialPending = false;
    return true;
}
