// 撞击岩石反馈模块：音效 + 气泡爆发 + 氧气损失 + 氧气环红色损失弧动画
//
// 触发规则（全线性映射）：
// - 碰撞瞬间取撞前速度 |v|（以 preVx/preVy 而非反弹后速度）
// - |v| >= speedThreshold 才算"撞"，低于此值视为擦蹭忽略
// - strength = clamp((|v| - threshold) / range, 0, 1)
// - 所有反馈参数（音量/播放速率/气泡数/氧气损失）按 strength 在 min~max 之间线性插值
// - 同一次撞击 cooldownMs 内不重复触发（避免一帧内 X/Y 双轴都命中时触发两次）
//
// 对外只暴露一个函数 triggerCollisionImpact(preVx, preVy, x, y)，由碰撞分支统一调用。

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { triggerSilt } from './Particle';
import { playSFX } from '../audio/AudioManager';
import { triggerO2LossFlash } from './OxygenTank';

// 最近一次触发时间戳（用于 cooldown）
let _lastImpactTime = 0;

// 线性插值工具
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * 撞岩石反馈入口：根据撞前速度触发音效 + 气泡 + 氧气损失 + 氧气环红条
 * @param preVx 撞击前 X 速度（碰撞分支中取反弹赋值前的速度）
 * @param preVy 撞击前 Y 速度
 * @param x 撞击点世界坐标 X（一般传 player.x）
 * @param y 撞击点世界坐标 Y（一般传 player.y）
 */
export function triggerCollisionImpact(preVx: number, preVy: number, x: number, y: number): void {
    const c = (CONFIG as any).collisionImpact;
    if (!c || !c.enabled) return;

    const speed = Math.hypot(preVx, preVy);
    const threshold: number = c.speedThreshold ?? 2.0;
    if (speed < threshold) return;

    // 冷却：避免 X/Y 双轴同帧触发或连续几帧夹在墙里触发多次
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const cooldownMs: number = c.cooldownMs ?? 400;
    if (now - _lastImpactTime < cooldownMs) return;
    _lastImpactTime = now;

    // 线性强度（0~1）
    const range: number = c.speedRange ?? 5.0;
    const strength = Math.max(0, Math.min(1, (speed - threshold) / range));

    // ---- 音效：按强度线性映射音量与播放速率 ----
    const volume = lerp(c.volumeMin ?? 0.35, c.volumeMax ?? 1.0, strength);
    const playbackRate = lerp(c.playbackRateMin ?? 1.1, c.playbackRateMax ?? 0.85, strength);
    try {
        playSFX('collisionRock', { volume, playbackRate });
    } catch (e) {
        // 播放失败静默，不影响其他反馈
    }

    // ---- 气泡爆发：强度越大气泡数越多（借用 silt 粒子表现撞击溅起） ----
    const bubbleCount = Math.round(lerp(c.bubbleCountMin ?? 6, c.bubbleCountMax ?? 30, strength));
    if (bubbleCount > 0) {
        triggerSilt(x, y, bubbleCount);
    }

    // ---- 氧气损失：按强度线性扣氧，且在氧气环上触发红色损失弧动画 ----
    const loss = lerp(c.o2LossMin ?? 0.8, c.o2LossMax ?? 4.5, strength);
    // 只在迷宫模式下触发视觉反馈（主线模式 oxygenFeedback 不存在）
    const maze = state.mazeRescue;
    const isMazePlay = !!(maze && state.screen === 'mazeRescue' && maze.phase === 'play');

    // debug / infiniteO2 跳过扣氧但仍保留音效和气泡
    const infO2 = !!(CONFIG as any).infiniteO2;
    if (!infO2 && player.o2 > 0) {
        const fromO2 = player.o2;
        const toO2 = Math.max(0, fromO2 - loss);
        player.o2 = toO2;
        if (isMazePlay) {
            triggerO2LossFlash(fromO2, toO2);
        }
    } else if (isMazePlay) {
        // infinite 模式下也给一个"假"的红条反馈，方便测试；以当前氧气值为起点、扣去 loss 为终点
        const fromO2 = player.o2;
        const toO2 = Math.max(0, fromO2 - loss);
        triggerO2LossFlash(fromO2, toO2);
    }
}

// 重置冷却时间（模式切换/下潜开始时调用，避免跨场景被冷却误挡）
export function resetCollisionImpact(): void {
    _lastImpactTime = 0;
}
