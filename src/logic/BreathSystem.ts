// 潜水员呼吸系统
// 职责：
// 1. 呼吸相位机：exhale（吐气）→ holdEmpty（吐完保持）→ inhale（吸气）→ holdFull（吸完保持）→ 循环
//    吐完和吸完都有"停顿保持"期，不是立刻反转，肺会保持一下再切换
// 2. 急促度（breathRate）：运动 / 撞击会抬高急促度，让四相整体时长缩短、holdEmpty/holdFull 几乎为 0
// 3. 肺容积（lungVolume 0~1）：0=吐完最小，1=吸完最大；由四相位机按各自曲线连续推进，用于肺动画与浮力
// 4. 浮力为"加速度"模型：吐完气（肺空）→ 向下加速度最大；吸完气（肺满）→ 向上加速度最大；通过 +=player.vy 叠加
// 5. 气泡只在 exhale 阶段生成；音频只在 exhale 阶段拉起音量
// 6. 每次 exhale → holdEmpty 切换瞬间递增 exhalePulseCounter，用于阶梯耗氧订阅
//
// 启用范围：仅在水下可操作状态（迷宫 play 阶段 / 主线 play 阶段）；其他阶段自动静默
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
// 呼吸相位与运行态（四相位机）
// =============================================
//   exhale：吐气，肺容积从 1 → 0
//   holdEmpty：吐完保持，肺容积保持 0
//   inhale：吸气，肺容积从 0 → 1
//   holdFull：吸完保持，肺容积保持 1
// =============================================
type BreathPhase = 'exhale' | 'holdEmpty' | 'inhale' | 'holdFull' | 'idle';

interface BreathRuntime {
    phase: BreathPhase;        // 当前相位
    phaseTimer: number;        // 当前相位已持续秒数

    // 本轮循环（一次完整 exhale→holdEmpty→inhale→holdFull）下四相时长
    exhaleDuration: number;
    holdEmptyDuration: number;
    inhaleDuration: number;
    holdFullDuration: number;

    bubbleAccum: number;       // 气泡生成累积（粒/帧 * dt）
    active: boolean;           // 系统是否处于激活状态（水下可操作）
    audioPlaying: boolean;     // 是否已启动 breathLoop（避免重复调用）
    lastIntensity: number;     // 上次计算的运动量（0~1，用于平滑）
    bubbles: BreathBubble[];   // 活跃气泡列表

    // ========== 呼吸急促度（breathRate）三分量 ==========
    // 急促度越高：四相时长越短；holdEmpty / holdFull 几乎为 0；耗氧增量越大；浮力波幅越大
    // breathRate = clamp(baseline + movement*moveCoef + impact*impactCoef, 0, 1)
    rateMovement: number;      // 运动分量（指数平滑，升快降慢）
    rateImpact: number;        // 撞击分量（registerImpact 注入，线性衰减）
    breathRate: number;        // 合成总急促度（供外部只读）

    // ========== 肺容积 lungVolume（0~1 连续量）==========
    // 0 = 吐完最小；1 = 吸完最大
    // exhale 阶段：1 → 0（smoothstep 曲线）
    // holdEmpty：保持 0
    // inhale 阶段：0 → 1（smoothstep 曲线）
    // holdFull：保持 1
    lungVolume: number;

    // ========== 呼气脉冲计数（供阶梯耗氧订阅）==========
    // 每次 exhale → holdEmpty 切换瞬间递增一次
    exhalePulseCounter: number;
    lastExhaleBreathRate: number;  // 最近一次 exhale 结束时的急促度，用于插值 o2PerBreath
}

const runtime: BreathRuntime = {
    phase: 'idle',
    phaseTimer: 0,
    exhaleDuration: 1.0,
    holdEmptyDuration: 0.5,
    inhaleDuration: 1.0,
    holdFullDuration: 2.0,
    bubbleAccum: 0,
    active: false,
    audioPlaying: false,
    lastIntensity: 0,
    bubbles: [],
    rateMovement: 0,
    rateImpact: 0,
    breathRate: 0,
    lungVolume: 1.0,  // 初始默认肺满（放松态）
    exhalePulseCounter: 0,
    lastExhaleBreathRate: 0,
};

// =============================================
// 运动量 → 呼吸四相时长 / 气泡 / 音频 参数映射
// 线性插值：static（静止） ↔ peak（全速）
// 注意：四相时长的映射使得 peak 时 holdEmpty / holdFull 几乎为 0（急促时没时间停）
// =============================================
function mapByIntensity(intensity: number) {
    const cfg: any = CONFIG.breath;
    const t = Math.max(0, Math.min(1, intensity));
    return {
        exhaleDuration: (cfg.exhaleDurationStatic ?? 1.0) + ((cfg.exhaleDurationPeak ?? 0.5) - (cfg.exhaleDurationStatic ?? 1.0)) * t,
        holdEmptyDuration: (cfg.holdEmptyDurationStatic ?? 0.5) + ((cfg.holdEmptyDurationPeak ?? 0.05) - (cfg.holdEmptyDurationStatic ?? 0.5)) * t,
        inhaleDuration: (cfg.inhaleDurationStatic ?? 1.0) + ((cfg.inhaleDurationPeak ?? 0.4) - (cfg.inhaleDurationStatic ?? 1.0)) * t,
        holdFullDuration: (cfg.holdFullDurationStatic ?? 2.0) + ((cfg.holdFullDurationPeak ?? 0.1) - (cfg.holdFullDurationStatic ?? 2.0)) * t,
        bubbleRate: cfg.bubbleRateStatic + (cfg.bubbleRatePeak - cfg.bubbleRateStatic) * t,
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
// 推进急促度（breathRate）三分量
//   rateMovement：指数平滑，升快降慢（玩家停下后呼吸不会立刻平复）
//   rateImpact：线性衰减（每秒降 impactRecoverPerSec）
// =============================================
function advanceBreathRate(dt: number, rawMovement: number): void {
    const cfg: any = CONFIG.breath;
    const riseRate: number = cfg.rateRise ?? cfg.pressureRise ?? 0.15;
    const fallRate: number = cfg.rateFall ?? cfg.pressureFall ?? 0.02;
    const m = runtime.rateMovement;
    if (rawMovement > m) {
        runtime.rateMovement = m + (rawMovement - m) * riseRate;
    } else {
        runtime.rateMovement = m + (rawMovement - m) * fallRate;
    }
    const recoverPerSec: number = cfg.impactRecoverPerSec ?? 0.25;
    runtime.rateImpact = Math.max(0, runtime.rateImpact - recoverPerSec * dt);

    const baseline: number = cfg.rateBaseline ?? cfg.pressureBaseline ?? 0.0;
    const moveCoef: number = cfg.rateMoveCoef ?? cfg.pressureMoveCoef ?? 1.0;
    const impactCoef: number = cfg.rateImpactCoef ?? cfg.pressureImpactCoef ?? 1.0;
    const r = baseline + runtime.rateMovement * moveCoef + runtime.rateImpact * impactCoef;
    runtime.breathRate = Math.max(0, Math.min(1, r));
}

// =============================================
// 判断当前是否应激活呼吸系统
// =============================================
function shouldBeActive(): boolean {
    if (!CONFIG.breath.enabled) return false;
    if (state.screen === 'mazeRescue') {
        const maze = state.mazeRescue;
        if (!maze || maze.phase !== 'play') return false;
        if (state.fishBite && state.fishBite.active) return false;
        return true;
    }
    if (state.screen === 'play') {
        // 旧主线 blackScreen 已废弃。
        if (state.fishBite && state.fishBite.active) return false;
        return true;
    }
    return false;
}

// =============================================
// 计算嘴部世界坐标
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
    // CCR（闭式循环呼吸器）不向外排气泡：呼出的气体被 CO2 吸收罐处理后回收循环，物理上看不到气泡
    // 撞岩石的"撞击吐气"气泡（spawnImpactBurst）不在此路径，照常表现，因为那是物理冲击不是呼吸
    const ex = (state as any).extraction;
    if (ex?.equipped?.suit === 'suitCCR') return;

    const cfg = CONFIG.breath;
    const mouth = getMouthPos();
    const jitter = cfg.spawnJitter;
    const x = mouth.x + (Math.random() - 0.5) * jitter;
    const y = mouth.y + (Math.random() - 0.5) * jitter;
    const sideAngle = player.angle + Math.PI / 2;
    const sideVel = (Math.random() - 0.5) * cfg.sideInitSpeed;
    const buoyancy = cfg.buoyancyMin + Math.random() * (cfg.buoyancyMax - cfg.buoyancyMin);
    const vx = Math.cos(sideAngle) * sideVel + (Math.random() - 0.5) * 0.1;
    const vy = -buoyancy;
    const baseR = cfg.bubbleSizeStatic + (cfg.bubbleSizePeak - cfg.bubbleSizeStatic) * intensity;
    const radius = baseR * (0.7 + Math.random() * 0.6);
    const maxRadius = radius * (1.4 + Math.random() * 0.5);
    const lifeSec = cfg.lifeMinSec + Math.random() * (cfg.lifeMaxSec - cfg.lifeMinSec);
    const fadeRate = 1 / (lifeSec * 60);
    runtime.bubbles.push({
        x, y, vx, vy,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleFreq: cfg.wobbleFreqMin + Math.random() * (cfg.wobbleFreqMax - cfg.wobbleFreqMin),
        wobbleAmp: cfg.wobbleAmpMin + Math.random() * (cfg.wobbleAmpMax - cfg.wobbleAmpMin),
        radius,
        growRate: (maxRadius - radius) / (lifeSec * 60),
        life: 1,
        fadeRate,
        maxRadius,
    });
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
        b.wobblePhase += b.wobbleFreq;
        const wobbleDX = Math.cos(b.wobblePhase) * b.wobbleAmp;
        b.x += b.vx + wobbleDX;
        b.y += b.vy;
        b.vy -= 0.03;
        b.vx *= 0.98;
        if (b.radius < b.maxRadius) b.radius += b.growRate;
        b.life -= b.fadeRate;
        if (b.life <= 0) {
            runtime.bubbles.splice(i, 1);
            continue;
        }
        const distY = player.y - b.y;
        if (distY > CONFIG.breath.despawnUpDist) {
            b.life -= b.fadeRate * 3;
        }
    }
}

// =============================================
// smoothstep：3t²-2t³，t∈[0,1]
// =============================================
function smoothstep(t: number): number {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
}

// =============================================
// 推进呼吸相位机（四相位）并更新 lungVolume
// =============================================
function advancePhase(dt: number, intensity: number) {
    runtime.phaseTimer += dt;

    if (runtime.phase === 'exhale') {
        // 吐气：肺容积从 1 → 0（smoothstep，两端慢中间快）
        const t = Math.max(0, Math.min(1, runtime.phaseTimer / Math.max(0.01, runtime.exhaleDuration)));
        runtime.lungVolume = 1 - smoothstep(t);

        // 吐气阶段生成气泡
        const params = mapByIntensity(intensity);
        runtime.bubbleAccum += params.bubbleRate * dt;
        while (runtime.bubbleAccum >= 1) {
            spawnBubble(intensity);
            runtime.bubbleAccum -= 1;
        }

        if (runtime.phaseTimer >= runtime.exhaleDuration) {
            // exhale → holdEmpty：触发呼气脉冲（阶梯耗氧订阅）
            runtime.exhalePulseCounter += 1;
            runtime.lastExhaleBreathRate = runtime.breathRate;
            runtime.phase = 'holdEmpty';
            runtime.phaseTimer = 0;
            runtime.bubbleAccum = 0;
            runtime.lungVolume = 0;
        }
    } else if (runtime.phase === 'holdEmpty') {
        // 吐完保持：肺容积保持 0，不生成气泡
        runtime.lungVolume = 0;
        if (runtime.phaseTimer >= runtime.holdEmptyDuration) {
            runtime.phase = 'inhale';
            runtime.phaseTimer = 0;
        }
    } else if (runtime.phase === 'inhale') {
        // 吸气：肺容积从 0 → 1（smoothstep）
        const t = Math.max(0, Math.min(1, runtime.phaseTimer / Math.max(0.01, runtime.inhaleDuration)));
        runtime.lungVolume = smoothstep(t);
        if (runtime.phaseTimer >= runtime.inhaleDuration) {
            runtime.phase = 'holdFull';
            runtime.phaseTimer = 0;
            runtime.lungVolume = 1;
        }
    } else if (runtime.phase === 'holdFull') {
        // 吸完保持：肺容积保持 1
        runtime.lungVolume = 1;
        if (runtime.phaseTimer >= runtime.holdFullDuration) {
            // 新一轮循环：按当前运动量重新采样四相时长
            const params = mapByIntensity(intensity);
            runtime.phase = 'exhale';
            runtime.phaseTimer = 0;
            runtime.exhaleDuration = params.exhaleDuration;
            runtime.holdEmptyDuration = params.holdEmptyDuration;
            runtime.inhaleDuration = params.inhaleDuration;
            runtime.holdFullDuration = params.holdFullDuration;
            runtime.bubbleAccum = 0;
        }
    } else {
        // idle：激活后的第一帧，从 holdFull 起步（模拟"放松状态"肺偏满）
        const params = mapByIntensity(intensity);
        runtime.exhaleDuration = params.exhaleDuration;
        runtime.holdEmptyDuration = params.holdEmptyDuration;
        runtime.inhaleDuration = params.inhaleDuration;
        runtime.holdFullDuration = params.holdFullDuration;
        runtime.phase = 'holdFull';
        runtime.phaseTimer = 0;
        runtime.lungVolume = 1;
        runtime.bubbleAccum = 0;
    }
}

// =============================================
// 每帧主更新入口
// =============================================
export function updateBreathSystem() {
    const cfg = CONFIG.breath;
    const active = shouldBeActive();

    const dt = 1 / 60;

    const rawIntensity = computeIntensity();
    const smooth = cfg.intensitySmooth;
    runtime.lastIntensity += (rawIntensity - runtime.lastIntensity) * smooth;
    const intensity = runtime.lastIntensity;

    // 急促度三分量始终推进（非激活也推进，确保离开 play 后平复继续发生）
    advanceBreathRate(dt, rawIntensity);

    if (!active) {
        if (runtime.audioPlaying) {
            stopSFXLoop('breathLoop');
            runtime.audioPlaying = false;
        }
        runtime.active = false;
        runtime.phase = 'idle';
        runtime.phaseTimer = 0;
        runtime.bubbleAccum = 0;
        // lungVolume 不重置，保持连续
        updateBubbles();
        return;
    }

    if (!runtime.audioPlaying) {
        playSFXLoop('breathLoop');
        runtime.audioPlaying = true;
    }
    runtime.active = true;

    advancePhase(dt, intensity);

    // 音频参数：只在 exhale 阶段拉起音量，其余三相压 0
    const params = mapByIntensity(intensity);
    let targetVol: number;
    let targetRate: number = params.playbackRate;
    if (runtime.phase === 'exhale') {
        // 吐气内部再做一个小包络：起吐渐强、收吐渐弱
        const t = runtime.phaseTimer;
        const total = runtime.exhaleDuration;
        let envelope = 1;
        const attack = Math.min(0.15, total * 0.2);
        const release = Math.min(0.25, total * 0.3);
        if (t < attack) envelope = t / attack;
        else if (t > total - release) envelope = Math.max(0, (total - t) / release);
        targetVol = params.volume * envelope;
    } else {
        targetVol = 0;
    }
    setSFXLoopParams('breathLoop', { targetVolume: targetVol, playbackRate: targetRate });

    updateBubbles();
}

// =============================================
// 撞击气泡爆发（撞岩石时调用）
// =============================================
export function spawnImpactBurst(cx: number, cy: number, strength: number): void {
    const cfg = CONFIG.breath;
    const impactCfg = (CONFIG as any).collisionImpact || {};
    const countMin: number = impactCfg.impactBubbleCountMin ?? 30;
    const countMax: number = impactCfg.impactBubbleCountMax ?? 120;
    const sizeMul: number = impactCfg.impactBubbleSizeMul ?? 1.6;
    const spreadSpeed: number = impactCfg.impactBubbleSpreadSpeed ?? 2.4;
    const lifeMul: number = impactCfg.impactBubbleLifeMul ?? 0.55;

    const t = Math.max(0, Math.min(1, strength));
    const count = Math.round(countMin + (countMax - countMin) * t);

    for (let i = 0; i < count; i++) {
        const px = cx + (Math.random() - 0.5) * 12;
        const py = cy + (Math.random() - 0.5) * 12;
        const dirAngle = Math.random() * Math.PI * 2;
        const speedScale = 0.4 + Math.random() * 0.6;
        const initSpeed = spreadSpeed * speedScale * (0.5 + t * 0.5);
        const vx = Math.cos(dirAngle) * initSpeed;
        const vy = Math.sin(dirAngle) * initSpeed - (cfg.buoyancyMin + Math.random() * (cfg.buoyancyMax - cfg.buoyancyMin)) * 0.6;
        const baseR = (cfg.bubbleSizeStatic + (cfg.bubbleSizePeak - cfg.bubbleSizeStatic) * t) * sizeMul;
        const radius = baseR * (0.7 + Math.random() * 0.8);
        const maxRadius = radius * (1.3 + Math.random() * 0.5);
        const lifeSec = (cfg.lifeMinSec + Math.random() * (cfg.lifeMaxSec - cfg.lifeMinSec)) * lifeMul;
        const fadeRate = 1 / (lifeSec * 60);
        runtime.bubbles.push({
            x: px, y: py, vx, vy,
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
    runtime.rateMovement = 0;
    runtime.rateImpact = 0;
    runtime.breathRate = 0;
    runtime.lungVolume = 1.0;
    runtime.exhalePulseCounter = 0;
    runtime.lastExhaleBreathRate = 0;
    if (runtime.audioPlaying) {
        stopSFXLoop('breathLoop');
        runtime.audioPlaying = false;
    }
}

// =============================================
// 撞击应激：由 CollisionImpact 调用，把 rateImpact 抬到目标值
//   只上拉不下拉（避免覆盖未衰减完的更强应激）
// =============================================
export function registerImpact(strength: number, target?: number): void {
    const t = Math.max(0, Math.min(1, target != null ? target : strength));
    if (t > runtime.rateImpact) {
        runtime.rateImpact = t;
    }
}

// =============================================
// 对外只读接口
// =============================================
export function getBreathRate(): number { return runtime.breathRate; }
export function getBreathMovementRate(): number { return runtime.rateMovement; }
export function getBreathImpactRate(): number { return runtime.rateImpact; }
export function getLungVolume(): number { return runtime.lungVolume; }
export function getBreathPhase(): BreathPhase { return runtime.phase; }
export function getExhalePulseCounter(): number { return runtime.exhalePulseCounter; }
export function getLastExhaleBreathRate(): number { return runtime.lastExhaleBreathRate; }
export function isBreathActive(): boolean { return runtime.active; }

// ---- 旧命名兼容层（避免外部调用处一次性全部要改；新代码请用上面的新接口）----
export function getBreathPressure(): number { return runtime.breathRate; }
export function getBreathMovementPressure(): number { return runtime.rateMovement; }
export function getBreathImpactPressure(): number { return runtime.rateImpact; }
export function getLastExhalePressure(): number { return runtime.lastExhaleBreathRate; }
// phaseAngle 兼容：把 lungVolume 反算回一个 0~2π 的相位供现有肺绘制
//   吐气（lungVolume 从 1→0）→ phaseAngle 0→π（sin > 0）
//   吸气（lungVolume 从 0→1）→ phaseAngle π→2π（sin < 0）
//   holdEmpty → π（sin ≈ 0）；holdFull → 0（sin ≈ 0）
export function getBreathPhaseAngle(): number {
    if (runtime.phase === 'exhale') {
        // lungVolume: 1→0 映射到 phaseAngle: 0→π
        return Math.PI * (1 - runtime.lungVolume);
    }
    if (runtime.phase === 'holdEmpty') return Math.PI;
    if (runtime.phase === 'inhale') {
        // lungVolume: 0→1 映射到 phaseAngle: π→2π
        return Math.PI + Math.PI * runtime.lungVolume;
    }
    // holdFull 或 idle
    return 0;
}

// =============================================
// 呼吸浮力：加速度模型
//   返回值 = 每帧 vy 的加速度增量（由调用方 player.vy += computeBuoyancyOffset()）
//   肺容积 lungVolume 映射：
//     lungVolume = 0（肺空，吐完）→ 向下加速度最大（正值）
//     lungVolume = 0.5（中性浮力点）→ 加速度 = 0
//     lungVolume = 1（肺满，吸完）→ 向上加速度最大（负值）
//   加速度幅度 = buoyancyStrength × (1 + breathRate × buoyancyRateCoef)
//
// 关键效果（由于每帧都在 vy 上积分）：
//   吐完气瞬间：肺空 → 持续下沉加速度 → 身体开始下沉（但不是立刻到最大速度）
//   吸气过程：浮力渐增 → 向下加速度减小 → 减速下沉
//   吸完气瞬间：肺满 → 持续上浮加速度 → 身体开始上浮
//   吐气过程：浮力渐减 → 向上加速度减小 → 减速上浮
//   表现：身体起伏比呼吸"晚半拍"，有明显的呼吸→浮力→位移因果链
// =============================================
export function computeBuoyancyOffset(): number {
    const cfg: any = CONFIG.breath;
    if (!cfg.buoyancyEnabled) return 0;
    if (!runtime.active) return 0;
    // strength 优先用新名，兜底回退到老的 buoyancyAmp（保持向后兼容）
    const strength: number = cfg.buoyancyStrength ?? cfg.buoyancyAmp ?? 0.08;
    const rateCoef: number = cfg.buoyancyRateCoef ?? cfg.buoyancyPressureCoef ?? 0.6;
    // (lungVolume - 0.5) * 2 ∈ [-1, +1]：肺空 = -1（对应向下），肺满 = +1（对应向上）
    // 然后乘以 -strength：肺空 → 正加速度（向下，Y 增大）；肺满 → 负加速度（向上，Y 减小）
    const signed = (runtime.lungVolume - 0.5) * 2;
    const scaledStrength = strength * (1 + rateCoef * runtime.breathRate);
    return -signed * scaledStrength;
}

// =============================================
// 阶梯式氧气消耗订阅器
// =============================================
let _lastSeenExhalePulse = 0;
export function consumeBreathO2(): number {
    const cfg: any = CONFIG.breath;
    if (!runtime.active) {
        return cfg.o2IdleDrain ?? 0.005;
    }
    if (runtime.exhalePulseCounter > _lastSeenExhalePulse) {
        _lastSeenExhalePulse = runtime.exhalePulseCounter;
        const staticLoss: number = cfg.o2PerBreathStatic ?? 0.6;
        const peakLoss: number = cfg.o2PerBreathPeak ?? 2.5;
        const r = Math.max(0, Math.min(1, runtime.lastExhaleBreathRate));
        return staticLoss + (peakLoss - staticLoss) * r;
    }
    return 0;
}

export function resetBreathO2Consumer(): void {
    _lastSeenExhalePulse = runtime.exhalePulseCounter;
}
