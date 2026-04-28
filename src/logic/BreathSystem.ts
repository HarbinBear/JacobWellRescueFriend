// 潜水员呼吸系统
// 职责：
// 1. 呼吸相位机：exhale（吐气）→ pause（停顿）→ exhale → pause...（不是持续吐气）
// 2. 运动量映射：速度越快 → 吐气越频繁 / 停顿越短 / 气泡数量越多 / 音量越大 / 音调略上扬
// 3. 生成气泡粒子（在吐气阶段按速率从嘴部位置涌出）
// 4. 驱动 AudioManager 的 breathLoop 通道（吐气阶段拉起音量，停顿阶段降到 0）
//
// 启用范围：仅在水下可操作状态（迷宫 play 阶段 / 主线 play 阶段）；其他阶段自动静默
//
// 调用入口：updateBreathSystem() 每帧由 MazeLogic.updateMaze() 和 Logic.update() 调用

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { playSFXLoop, stopSFXLoop, setSFXLoopParams } from '../audio/AudioManager';

// =============================================
// 气泡粒子数据结构
// =============================================
export interface BreathBubble {
    x: number;
    y: number;
    vx: number;            // 侧向初速度
    vy: number;            // 纵向速度（负值=上浮）
    wobblePhase: number;   // 侧向正弦摆动相位
    wobbleFreq: number;    // 侧向摆动频率
    wobbleAmp: number;     // 侧向摆动幅度
    radius: number;        // 当前半径
    growRate: number;      // 半径增长速度（每帧）
    life: number;          // 生命值 1~0
    fadeRate: number;      // 生命衰减速度（每帧）
    maxRadius: number;     // 最大半径（到了就进入破裂淡出）
}

// =============================================
// 呼吸相位与运行态
// =============================================
type BreathPhase = 'exhale' | 'pause' | 'idle';

interface BreathRuntime {
    phase: BreathPhase;        // 当前相位
    phaseTimer: number;        // 当前相位已持续秒数
    exhaleDuration: number;    // 本次吐气总时长（秒）
    pauseDuration: number;     // 本次停顿总时长（秒）
    bubbleAccum: number;       // 气泡生成累积（粒/帧 * dt）
    active: boolean;           // 系统是否处于激活状态（水下可操作）
    audioPlaying: boolean;     // 是否已启动 breathLoop（避免重复调用）
    lastIntensity: number;     // 上次计算的运动量（0~1，用于平滑）
    bubbles: BreathBubble[];   // 活跃气泡列表
}

const runtime: BreathRuntime = {
    phase: 'idle',
    phaseTimer: 0,
    exhaleDuration: 1.0,
    pauseDuration: 3.0,
    bubbleAccum: 0,
    active: false,
    audioPlaying: false,
    lastIntensity: 0,
    bubbles: [],
};

// =============================================
// 运动量 → 呼吸参数 映射表
// 线性插值：static（静止） ↔ peak（全速）
// =============================================
function mapByIntensity(intensity: number) {
    const cfg = CONFIG.breath;
    const t = Math.max(0, Math.min(1, intensity));
    return {
        exhaleDuration: cfg.exhaleDurationStatic + (cfg.exhaleDurationPeak - cfg.exhaleDurationStatic) * t,
        pauseDuration: cfg.pauseDurationStatic + (cfg.pauseDurationPeak - cfg.pauseDurationStatic) * t,
        bubbleRate: cfg.bubbleRateStatic + (cfg.bubbleRatePeak - cfg.bubbleRateStatic) * t,  // 粒/秒（吐气阶段）
        volume: cfg.volumeStatic + (cfg.volumePeak - cfg.volumeStatic) * t,
        playbackRate: cfg.playbackRateStatic + (cfg.playbackRatePeak - cfg.playbackRateStatic) * t,
        bubbleSize: cfg.bubbleSizeStatic + (cfg.bubbleSizePeak - cfg.bubbleSizeStatic) * t,
    };
}

// =============================================
// 计算运动量（0~1）
// 来源：玩家当前速度 normalize 到配置的最大参考速度
// =============================================
function computeIntensity(): number {
    const speed = Math.hypot(player.vx, player.vy);
    const refSpeed = CONFIG.breath.refSpeed;
    return Math.min(1, speed / Math.max(0.001, refSpeed));
}

// =============================================
// 判断当前是否应激活呼吸系统
// =============================================
function shouldBeActive(): boolean {
    if (!CONFIG.breath.enabled) return false;
    // 迷宫模式：仅在 play 阶段激活（入水、结算、岸上、上浮等阶段不触发）
    if (state.screen === 'mazeRescue') {
        const maze = state.mazeRescue;
        if (!maze || maze.phase !== 'play') return false;
        // 被咬 / 死亡过场不吐
        if (state.fishBite && state.fishBite.active) return false;
        return true;
    }
    // 主线模式：仅在 play 阶段激活
    if (state.screen === 'play') {
        // 黑屏 / 过场 / 濒死红屏过重时不吐
        if (state.story.flags.blackScreen) return false;
        if (state.fishBite && state.fishBite.active) return false;
        return true;
    }
    return false;
}

// =============================================
// 计算嘴部世界坐标
// RenderDiver 中头部圆心在局部 (15.8, 0)，半径 6.5；嘴部大致在头部最前端
// 将局部前向 +22 像素作为嘴部偏移
// =============================================
function getMouthPos(): { x: number; y: number } {
    const mouthOffset = CONFIG.breath.mouthOffsetForward;
    const cx = Math.cos(player.angle);
    const sy = Math.sin(player.angle);
    return {
        x: player.x + cx * mouthOffset,
        y: player.y + sy * mouthOffset,
    };
}

// =============================================
// 生成一个气泡粒子
// =============================================
function spawnBubble(intensity: number) {
    const cfg = CONFIG.breath;
    const mouth = getMouthPos();
    // 在嘴部位置小范围抖动
    const jitter = cfg.spawnJitter;
    const x = mouth.x + (Math.random() - 0.5) * jitter;
    const y = mouth.y + (Math.random() - 0.5) * jitter;
    // 侧向初速度：沿身体朝向的侧向（角度 + 90°）小随机
    const sideAngle = player.angle + Math.PI / 2;
    const sideVel = (Math.random() - 0.5) * cfg.sideInitSpeed;
    // 纵向速度：真正向上（-Y），受浮力
    const buoyancy = cfg.buoyancyMin + Math.random() * (cfg.buoyancyMax - cfg.buoyancyMin);
    const vx = Math.cos(sideAngle) * sideVel + (Math.random() - 0.5) * 0.1;
    const vy = -buoyancy;
    // 半径：基础 + 运动强度拉大
    const baseR = cfg.bubbleSizeStatic + (cfg.bubbleSizePeak - cfg.bubbleSizeStatic) * intensity;
    const radius = baseR * (0.7 + Math.random() * 0.6);
    const maxRadius = radius * (1.4 + Math.random() * 0.5);
    // 生命衰减：气泡寿命 1.5~2.5 秒（相当于上浮很长一段距离）
    const lifeSec = cfg.lifeMinSec + Math.random() * (cfg.lifeMaxSec - cfg.lifeMinSec);
    const fadeRate = 1 / (lifeSec * 60); // 60fps 假设
    runtime.bubbles.push({
        x,
        y,
        vx,
        vy,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleFreq: cfg.wobbleFreqMin + Math.random() * (cfg.wobbleFreqMax - cfg.wobbleFreqMin),
        wobbleAmp: cfg.wobbleAmpMin + Math.random() * (cfg.wobbleAmpMax - cfg.wobbleAmpMin),
        radius,
        growRate: (maxRadius - radius) / (lifeSec * 60),
        life: 1,
        fadeRate,
        maxRadius,
    });
    // 溢出保护
    if (runtime.bubbles.length > cfg.maxBubbles) {
        runtime.bubbles.splice(0, runtime.bubbles.length - cfg.maxBubbles);
    }
}

// =============================================
// 每帧更新气泡位置 / 透明度 / 半径
// =============================================
function updateBubbles() {
    for (let i = runtime.bubbles.length - 1; i >= 0; i--) {
        const b = runtime.bubbles[i];
        // 侧向摆动（正弦）
        b.wobblePhase += b.wobbleFreq;
        const wobbleDX = Math.cos(b.wobblePhase) * b.wobbleAmp;
        b.x += b.vx + wobbleDX;
        b.y += b.vy;
        // 纵向加速（浮力继续作用）
        b.vy -= 0.03;
        // 侧向速度衰减
        b.vx *= 0.98;
        // 半径缓慢增长
        if (b.radius < b.maxRadius) b.radius += b.growRate;
        // 生命衰减
        b.life -= b.fadeRate;
        if (b.life <= 0) {
            runtime.bubbles.splice(i, 1);
            continue;
        }
        // 撞墙或游出视野太远时加速淡出（简单处理：气泡升得离玩家太远就快速消失）
        const distY = player.y - b.y;
        if (distY > CONFIG.breath.despawnUpDist) {
            b.life -= b.fadeRate * 3;
        }
    }
}

// =============================================
// 推进呼吸相位机
// =============================================
function advancePhase(dt: number, intensity: number) {
    runtime.phaseTimer += dt;
    if (runtime.phase === 'exhale') {
        // 吐气阶段：按速率生成气泡
        const params = mapByIntensity(intensity);
        runtime.bubbleAccum += params.bubbleRate * dt;
        while (runtime.bubbleAccum >= 1) {
            spawnBubble(intensity);
            runtime.bubbleAccum -= 1;
        }
        if (runtime.phaseTimer >= runtime.exhaleDuration) {
            runtime.phase = 'pause';
            runtime.phaseTimer = 0;
            runtime.bubbleAccum = 0;
        }
    } else if (runtime.phase === 'pause') {
        // 停顿阶段：不生成气泡，音量拉到 0
        if (runtime.phaseTimer >= runtime.pauseDuration) {
            // 进入下一次吐气，按当前运动量重新采样两个时长
            const params = mapByIntensity(intensity);
            runtime.phase = 'exhale';
            runtime.phaseTimer = 0;
            runtime.exhaleDuration = params.exhaleDuration;
            runtime.pauseDuration = params.pauseDuration;
        }
    } else {
        // idle：刚激活的第一帧，立即进入吐气
        const params = mapByIntensity(intensity);
        runtime.phase = 'exhale';
        runtime.phaseTimer = 0;
        runtime.exhaleDuration = params.exhaleDuration;
        runtime.pauseDuration = params.pauseDuration;
        runtime.bubbleAccum = 0;
    }
}

// =============================================
// 每帧主更新入口
// =============================================
export function updateBreathSystem() {
    const cfg = CONFIG.breath;
    const active = shouldBeActive();

    // 运动量（带平滑，避免急停急启）
    const rawIntensity = computeIntensity();
    const smooth = cfg.intensitySmooth;
    runtime.lastIntensity += (rawIntensity - runtime.lastIntensity) * smooth;
    const intensity = runtime.lastIntensity;

    // 非激活状态：停止音频，让残留气泡继续飘完
    if (!active) {
        if (runtime.audioPlaying) {
            stopSFXLoop('breathLoop');
            runtime.audioPlaying = false;
        }
        runtime.active = false;
        runtime.phase = 'idle';
        runtime.phaseTimer = 0;
        runtime.bubbleAccum = 0;
        updateBubbles();
        return;
    }

    // 激活状态：确保音频已启动
    if (!runtime.audioPlaying) {
        playSFXLoop('breathLoop');
        runtime.audioPlaying = true;
    }
    runtime.active = true;

    // dt：按 60fps 估算
    const dt = 1 / 60;
    advancePhase(dt, intensity);

    // 音频参数：吐气阶段用目标音量与目标速率，停顿阶段音量拉到 0
    const params = mapByIntensity(intensity);
    let targetVol: number;
    let targetRate: number;
    if (runtime.phase === 'exhale') {
        // 吐气内部再做一个小包络：起吐渐强、收吐渐弱（0~0.15s 上升，最后 0.2s 下降）
        const t = runtime.phaseTimer;
        const total = runtime.exhaleDuration;
        let envelope = 1;
        const attack = Math.min(0.15, total * 0.2);
        const release = Math.min(0.25, total * 0.3);
        if (t < attack) envelope = t / attack;
        else if (t > total - release) envelope = Math.max(0, (total - t) / release);
        targetVol = params.volume * envelope;
        targetRate = params.playbackRate;
    } else {
        targetVol = 0;
        targetRate = params.playbackRate;
    }
    setSFXLoopParams('breathLoop', { targetVolume: targetVol, playbackRate: targetRate });

    // 气泡粒子更新
    updateBubbles();
}

// =============================================
// 撞击气泡爆发（撞岩石时调用）
// 与呼吸气泡复用同一条渲染通道，但数量更多、初速度向四周散射、半径更大、寿命更短
// 参数：
//   cx, cy：撞击点世界坐标（一般传 player.x / player.y）
//   strength：撞击强度 0~1（由 CollisionImpact 线性映射而来）
// =============================================
export function spawnImpactBurst(cx: number, cy: number, strength: number): void {
    const cfg = CONFIG.breath;
    // 从 CONFIG.collisionImpact.bubble* 取撞击气泡参数，缺省时用默认值
    const impactCfg = (CONFIG as any).collisionImpact || {};
    const countMin: number = impactCfg.impactBubbleCountMin ?? 30;
    const countMax: number = impactCfg.impactBubbleCountMax ?? 120;
    const sizeMul: number = impactCfg.impactBubbleSizeMul ?? 1.6;
    const spreadSpeed: number = impactCfg.impactBubbleSpreadSpeed ?? 2.4;
    const lifeMul: number = impactCfg.impactBubbleLifeMul ?? 0.55;

    const t = Math.max(0, Math.min(1, strength));
    const count = Math.round(countMin + (countMax - countMin) * t);

    for (let i = 0; i < count; i++) {
        // 位置：撞击点 +/- 少量抖动
        const px = cx + (Math.random() - 0.5) * 12;
        const py = cy + (Math.random() - 0.5) * 12;
        // 初速度：四周扇形散射（不局限于朝前），略偏向上（-Y）模拟气泡被撞出又快速浮起
        const dirAngle = Math.random() * Math.PI * 2;
        // 稍微压低向下的分量（让 vy < 0 概率大一点，气泡整体偏向上浮）
        const speedScale = 0.4 + Math.random() * 0.6;
        const initSpeed = spreadSpeed * speedScale * (0.5 + t * 0.5);
        const vx = Math.cos(dirAngle) * initSpeed;
        const vy = Math.sin(dirAngle) * initSpeed - (cfg.buoyancyMin + Math.random() * (cfg.buoyancyMax - cfg.buoyancyMin)) * 0.6;
        // 半径：比呼吸气泡更大（sizeMul 倍放大）
        const baseR = (cfg.bubbleSizeStatic + (cfg.bubbleSizePeak - cfg.bubbleSizeStatic) * t) * sizeMul;
        const radius = baseR * (0.7 + Math.random() * 0.8);
        const maxRadius = radius * (1.3 + Math.random() * 0.5);
        // 寿命：比呼吸气泡更短（lifeMul 倍缩短，爆发式消散）
        const lifeSec = (cfg.lifeMinSec + Math.random() * (cfg.lifeMaxSec - cfg.lifeMinSec)) * lifeMul;
        const fadeRate = 1 / (lifeSec * 60);
        runtime.bubbles.push({
            x: px,
            y: py,
            vx,
            vy,
            wobblePhase: Math.random() * Math.PI * 2,
            wobbleFreq: cfg.wobbleFreqMin + Math.random() * (cfg.wobbleFreqMax - cfg.wobbleFreqMin),
            wobbleAmp: cfg.wobbleAmpMin + Math.random() * (cfg.wobbleAmpMax - cfg.wobbleAmpMin),
            radius,
            growRate: (maxRadius - radius) / (lifeSec * 60),
            life: 1,
            fadeRate,
            maxRadius,
        });
    }

    // 溢出保护：共享呼吸气泡的上限，避免极端情况下无限堆积
    if (runtime.bubbles.length > cfg.maxBubbles) {
        runtime.bubbles.splice(0, runtime.bubbles.length - cfg.maxBubbles);
    }
}

// =============================================
// 对外获取气泡列表（供 Render 绘制）
// =============================================
export function getBreathBubbles(): BreathBubble[] {
    return runtime.bubbles;
}

// =============================================
// 重置（模式切换 / 死亡重开 / 读档时调用）
// =============================================
export function resetBreathSystem() {
    runtime.phase = 'idle';
    runtime.phaseTimer = 0;
    runtime.bubbleAccum = 0;
    runtime.bubbles.length = 0;
    runtime.lastIntensity = 0;
    runtime.active = false;
    if (runtime.audioPlaying) {
        stopSFXLoop('breathLoop');
        runtime.audioPlaying = false;
    }
}
