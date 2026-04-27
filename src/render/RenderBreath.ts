// 呼吸气泡渲染模块
// 职责：在世界空间绘制 BreathSystem 生成的气泡粒子
// 气泡视觉：半透明主体 + 高光 + 薄边；随生命值淡出，随半径变大
//
// 调用时机：在光照层之后、UI 之前绘制，让气泡能像 silt 粒子一样被手电照亮
// 但气泡本身不参与光照计算（不走 WebGL 遮罩），只是在光照渲染后的 canvas 上叠加一层

import { CONFIG } from '../core/config';
import { getBreathBubbles } from '../logic/BreathSystem';

export function drawBreathBubblesWorld(
    ctx: CanvasRenderingContext2D,
    viewL: number,
    viewR: number,
    viewT: number,
    viewB: number,
) {
    const cfg = CONFIG.breath;
    if (!cfg.enabled) return;
    const bubbles = getBreathBubbles();
    if (!bubbles || bubbles.length === 0) return;

    for (const b of bubbles) {
        // 视椎剔除
        if (b.x < viewL - 20 || b.x > viewR + 20 || b.y < viewT - 20 || b.y > viewB + 20) continue;

        const life = Math.max(0, Math.min(1, b.life));
        // 生命末尾 30% 淡出
        const fade = life < 0.3 ? life / 0.3 : 1;
        const bodyAlpha = 0.55 * fade;
        const coreAlpha = 0.85 * fade;
        const r = b.radius;

        ctx.save();
        // 主体（半透明蓝白）
        ctx.fillStyle = `rgba(180, 220, 240, ${bodyAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        // 薄边（描边）
        if (r > 1.2) {
            ctx.strokeStyle = `rgba(220, 240, 255, ${(cfg.outlineAlpha * fade).toFixed(3)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
        }
        // 高光（左上偏移一点）
        const highlightR = Math.max(0.6, r * 0.28);
        ctx.fillStyle = `rgba(235, 250, 255, ${coreAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(b.x - r * 0.35, b.y - r * 0.35, highlightR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
