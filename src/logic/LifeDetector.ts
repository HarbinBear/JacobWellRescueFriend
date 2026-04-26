// 生命探知仪（Life Detector）：
// 玩家身上携带一个"盖革计数器"式的声纳仪器，检测到被救援者（NPC）在一定距离范围内时，
// 按距离远近以不同节奏播放 D# + F 双音"嘀嘀"声，同时驱动 HUD 脉冲点与角色 LED 闪烁。
//
// 设计原则：
// - 只在迷宫模式（mazeRescue）启用
// - 玩家已发现 NPC（npcFound）或 NPC 已被救起（npcRescued）后自动关闭
// - 只提示距离，不提示方向（方向由 NPC 自身的呼救表现负责）
// - 节奏映射：最远处约 1.4s 响一次"嘀嘀"，最近时约 80ms 响一次，指数曲线让逼近感更强
//
// 运行态：
// - nextGroupAt：下一次播放"嘀嘀"组的时间戳（ms）
// - pendingHigh：本组 D# 已播放、等待 F 的时间戳
// - currentIntensity：当前节奏强度（0~1），用于视觉同步
// - pulseT：本次播放后的脉冲余晖相位（每次触发重置为 1，每帧衰减）

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { playSonarLow, playSonarHigh } from '../audio/LifeDetectorSynth';

// 运行态（模块级单例；整局游戏共享）
interface DetectorRuntime {
    active: boolean;            // 本帧是否激活
    currentIntensity: number;   // 0~1，越靠近越大（仅在 active 时有效）
    distance: number;           // 当前到 NPC 距离（像素，仅在 active 时有效）
    nextGroupAt: number;        // 下一次播"嘀嘀"组的时间戳（ms）
    pendingHighAt: number;      // 本组 F 音待播的时间戳（0=不等）
    pulseT: number;             // 视觉脉冲余晖（0~1，每次触发重置为 1）
    pulseIsHigh: boolean;       // 当前脉冲来自高音还是低音（用于视觉细节区分）
}

const runtime: DetectorRuntime = {
    active: false,
    currentIntensity: 0,
    distance: 0,
    nextGroupAt: 0,
    pendingHighAt: 0,
    pulseT: 0,
    pulseIsHigh: false,
};

// 暴露给渲染层查询
export function getLifeDetectorRuntime(): DetectorRuntime {
    return runtime;
}

// 每帧调用：在 updateMaze 的合适位置（玩家已移动、NPC 已更新后）
export function updateLifeDetector(): void {
    const cfg = (CONFIG as any).lifeDetector;
    if (!cfg || !cfg.enabled) {
        runtime.active = false;
        runtime.pulseT = Math.max(0, runtime.pulseT - 0.05);
        return;
    }

    const maze = state.mazeRescue;
    if (!maze) {
        runtime.active = false;
        return;
    }

    // 条件：迷宫模式 + play 阶段 + NPC 激活 + NPC 未被救（绑绳）
    // 设计变更：发现NPC后仍保持响应，只有绑绳成功才停止（用户需求："绑住了不用再响就行"）
    const shouldDetect = state.screen === 'mazeRescue'
        && maze.phase === 'play'
        && state.npc && state.npc.active
        && !maze.npcRescued;

    if (!shouldDetect) {
        runtime.active = false;
        runtime.pendingHighAt = 0;
        // 脉冲余晖继续衰减
        runtime.pulseT = Math.max(0, runtime.pulseT - 0.05);
        return;
    }

    // 计算到 NPC 的距离
    const dx = state.npc.x - player.x;
    const dy = state.npc.y - player.y;
    const dist = Math.hypot(dx, dy);
    runtime.distance = dist;

    // 最大探知半径：以 npcRescueRange 为基准的倍数
    const maxDist = (CONFIG.maze.npcRescueRange || 80) * (cfg.rangeMultiplier || 4);
    const minDist = CONFIG.maze.npcRescueRange || 80;  // 到达 NPC 呼救反馈范围时达到最大节奏

    if (dist > maxDist) {
        // 超出探知范围：完全静默
        runtime.active = false;
        runtime.pendingHighAt = 0;
        runtime.currentIntensity = 0;
        runtime.pulseT = Math.max(0, runtime.pulseT - 0.05);
        return;
    }

    // 计算强度 t：最外圈 0，最内圈 1
    const tRaw = (maxDist - dist) / Math.max(1, maxDist - minDist);
    const t = Math.max(0, Math.min(1, tRaw));
    // 指数曲线：远处变化慢，近处变化快（pow < 1 让近端收敛更快）
    const tCurve = Math.pow(t, cfg.curvePower || 0.6);
    runtime.currentIntensity = tCurve;
    runtime.active = true;

    // 节奏映射：组间隔从 gapMaxMs 降到 gapMinMs；两音间隔从 beepIntervalMaxMs 降到 beepIntervalMinMs
    const gapMax = cfg.gapMaxMs || 1400;
    const gapMin = cfg.gapMinMs || 80;
    const groupGap = gapMax - (gapMax - gapMin) * tCurve;
    // 两音间隔同样随强度渐进：远处 #D 和 F 听感像"嘀—嘀"（150ms），近处几乎黏成一个音（80ms）
    const beepMax = cfg.beepIntervalMaxMs || 150;
    const beepMin = cfg.beepIntervalMinMs || 80;
    const beepInterval = beepMax - (beepMax - beepMin) * tCurve;
    const now = Date.now();

    // 延迟播 F：到时才播
    if (runtime.pendingHighAt > 0 && now >= runtime.pendingHighAt) {
        playSonarHigh();
        runtime.pendingHighAt = 0;
        runtime.pulseT = 1;
        runtime.pulseIsHigh = true;
    }

    // 到时播下一组 D#
    if (now >= runtime.nextGroupAt && runtime.pendingHighAt === 0) {
        playSonarLow();
        runtime.pulseT = 1;
        runtime.pulseIsHigh = false;
        runtime.pendingHighAt = now + beepInterval;
        runtime.nextGroupAt = now + groupGap;
    }

    // 脉冲余晖衰减（每帧基于节奏强度调节衰减速度，越快节奏越快熄灭）
    const pulseDecay = 0.04 + tCurve * 0.08;
    runtime.pulseT = Math.max(0, runtime.pulseT - pulseDecay);
}

// 重置运行态（模式切换、下潜重置时调用）
export function resetLifeDetector(): void {
    runtime.active = false;
    runtime.currentIntensity = 0;
    runtime.distance = 0;
    runtime.nextGroupAt = 0;
    runtime.pendingHighAt = 0;
    runtime.pulseT = 0;
    runtime.pulseIsHigh = false;
}
