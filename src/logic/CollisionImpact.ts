// 撞击岩石反馈模块：音效 + 气泡爆发 + 氧气损失 + 氧气环红色损失弧动画
//
// 触发规则（全线性映射）：
// - 碰撞瞬间取撞前速度 |v|（以 preVx/preVy 而非反弹后速度）
// - |v| >= speedThreshold 才算"撞"，低于此值视为擦蹭忽略
// - strength = clamp((|v| - threshold) / range, 0, 1)
// - 所有反馈参数（音量/播放速率/气泡数/氧气损失）按 strength 在 min~max 之间线性插值
// - 同一次撞击 cooldownMs 内不重复触发（避免一帧内 X/Y 双轴都命中时触发两次）
//
// 音效策略（HitRock.mp3 暂未到位时的兜底）：
// - 主音效 collisionRock 正常播（若云存储无此文件会静默 fail）
// - 同时播一次 collisionBreath（复用 BreathBubble.mp3，但独立 SFX 实例，playbackRate 压低到 0.55~0.75 显得更闷重）
//   这样即便 HitRock 还没上线，也能听到一次明显的"撞击吐气"爆发音，和持续呼吸有明显区别
//
// 气泡策略：
// - 走 BreathSystem.spawnImpactBurst()，与呼吸气泡共用渲染通道
// - 数量远大于呼吸单次吐气（30~120 粒 vs 5~14 粒/秒）
// - 初速度向撞击点四周散射（扇形），半径更大，寿命更短，表现撞击激起的水花气泡感
//
// 对外只暴露一个函数 triggerCollisionImpact(preVx, preVy, x, y)，由碰撞分支统一调用。

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { playSFX } from '../audio/AudioManager';
import { triggerO2LossFlash } from './OxygenTank';
import { spawnImpactBurst } from './BreathSystem';

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
    const volume = lerp(c.volumeMin ?? 0.5, c.volumeMax ?? 1.0, strength);
    const playbackRate = lerp(c.playbackRateMin ?? 0.75, c.playbackRateMax ?? 0.55, strength);
    try {
        // 主音效（撞岩石闷响），若云存储文件未就绪会静默跳过
        playSFX('collisionRock', { volume, playbackRate });
        // 同时触发一次"撞击吐气"：复用呼吸气泡音，但 playbackRate 压低听感更闷重，和持续呼吸能区分开
        // 音量再压 0.8，避免和主音效叠加过大
        playSFX('collisionBreath', { volume: volume * 0.8, playbackRate });
    } catch (e) {
        // 播放失败静默，不影响其他反馈
    }

    // ---- 气泡爆发：走 BreathSystem 渲染管线，比呼吸气泡多得多也大得多 ----
    try {
        spawnImpactBurst(x, y, strength);
    } catch (e) {
        // 气泡生成失败不影响音效和氧气损失
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
