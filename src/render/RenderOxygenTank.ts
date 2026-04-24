// 迷宫模式：氧气瓶渲染
//
// 职责分三层：
//   1. 世界层：静态氧气瓶（呼吸发光 + 按住进度环 + 靠近高亮）
//   2. 世界层：安装中的飞行瓶 + 气泡爆发
//   3. 屏幕层：拾取成功后的全屏绿色辉光、"+X%" 跳字、氧气环脉冲（在 RenderMazeUI 里单独调用）
//
// 绘制风格要与整体风格统一：Canvas 2D 矢量、不过度饱和、带轻微自发光

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import type { OxygenTank, FlyingTank, OxygenFeedback } from '../logic/OxygenTank';

// =============================================
// 世界层：绘制所有氧气瓶（视口剔除由外部调用者保证已做好范围判断）
// =============================================
export function drawOxygenTanksWorld(ctx: CanvasRenderingContext2D, viewL: number, viewR: number, viewT: number, viewB: number) {
    const maze = state.mazeRescue;
    if (!maze || !maze.oxygenTanks) return;
    const tanks: OxygenTank[] = maze.oxygenTanks;
    const c = (CONFIG as any).oxygenTank || {};
    const pickRange: number = c.pickRange ?? 90;
    const bodyScale: number = c.bodyScale ?? 1;

    for (const t of tanks) {
        if (t.consumed) continue;
        if (t.x < viewL - 40 || t.x > viewR + 40 || t.y < viewT - 40 || t.y > viewB + 40) continue;
        drawSingleTank(ctx, t, bodyScale);
        // 靠近时画按住进度环 + 高亮
        const distToPlayer = Math.hypot(player.x - t.x, player.y - t.y);
        if (distToPlayer < pickRange) {
            drawPickHint(ctx, t, distToPlayer, pickRange);
        }
    }
}

function drawSingleTank(ctx: CanvasRenderingContext2D, t: OxygenTank, scale: number) {
    ctx.save();
    ctx.translate(t.x, t.y);
    // 瓶身本来头朝外（法线方向），这里把瓶身画竖直，再按法线方向旋转；
    // 瓶身默认指向 -Y（即"头朝上"），法线方向是"瓶头朝向"
    // 所以旋转量 = normalAngle - (-π/2) = normalAngle + π/2
    ctx.rotate(t.normalAngle + Math.PI / 2);
    ctx.scale(scale, scale);

    // 呼吸：周期性缩放 + 自发光
    const pulse = 0.5 + 0.5 * Math.sin(t.breathPhase);
    const glowAlpha = 0.25 + pulse * 0.35;

    // 背光晕（大范围柔光，远距离可见）
    const glowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
    glowGrad.addColorStop(0, `rgba(120, 220, 180, ${glowAlpha})`);
    glowGrad.addColorStop(1, 'rgba(120, 220, 180, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();

    // === 瓶体：黄色圆柱（带两端圆角） ===
    // 竖直方向尺寸：高度 26，宽度 10
    const bodyH = 26, bodyW = 10;
    // 主体
    ctx.fillStyle = '#d4b340';   // 底色（深黄）
    roundedRect(ctx, -bodyW / 2, -bodyH / 2 + 3, bodyW, bodyH - 6, 2.5);
    ctx.fill();
    // 高光条（左侧竖向）
    ctx.fillStyle = 'rgba(255, 240, 160, 0.55)';
    ctx.fillRect(-bodyW / 2 + 1.5, -bodyH / 2 + 5, 2, bodyH - 10);
    // 暗边（右侧）
    ctx.fillStyle = 'rgba(60, 40, 20, 0.4)';
    ctx.fillRect(bodyW / 2 - 2, -bodyH / 2 + 5, 1.5, bodyH - 10);

    // === 顶阀（红色瓶头，朝外那一端） ===
    // "朝外"是瓶体的 -Y 方向
    ctx.fillStyle = '#c83a2a';
    roundedRect(ctx, -4, -bodyH / 2, 8, 5, 2);
    ctx.fill();
    // 阀门小帽
    ctx.fillStyle = '#6b1e12';
    ctx.fillRect(-1.5, -bodyH / 2 - 2.5, 3, 3);
    // 顶阀发光点（呼吸感知核心）
    const topGlow = 0.4 + pulse * 0.6;
    ctx.fillStyle = `rgba(160, 255, 200, ${topGlow * 0.85})`;
    ctx.beginPath();
    ctx.arc(0, -bodyH / 2 + 2, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // === 底部束带（黑色） ===
    ctx.fillStyle = '#2a2014';
    ctx.fillRect(-bodyW / 2 - 0.5, bodyH / 2 - 4, bodyW + 1, 2);

    // === 瓶身中央标识：O₂ 文字 ===
    ctx.fillStyle = 'rgba(20,10,5,0.85)';
    ctx.font = 'bold 7px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('O₂', 0, 2);

    ctx.restore();
}

function drawPickHint(ctx: CanvasRenderingContext2D, t: OxygenTank, dist: number, pickRange: number) {
    ctx.save();
    // 范围进入反馈：越近越亮
    const proximity = Math.max(0, 1 - dist / pickRange);

    // === 交互环：脚下环形提示，按住时填充进度 ===
    const ringR = 22;
    ctx.translate(t.x, t.y);

    // 背景虚圈
    ctx.strokeStyle = `rgba(180, 255, 210, ${0.18 + proximity * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 按住进度
    if (t.holdProgress > 0.002) {
        ctx.strokeStyle = 'rgba(120, 255, 180, 0.95)';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t.holdProgress);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // 进度填到一半之后，瓶子开始微微震动（手感反馈）
        // 这里不做模态文字"安装中"，保持画面简洁
    }

    ctx.restore();
}

// =============================================
// 世界层：飞行氧气瓶 + 气泡爆发
// =============================================
export function drawOxygenFeedbackWorld(ctx: CanvasRenderingContext2D) {
    const maze = state.mazeRescue;
    if (!maze || !maze.oxygenFeedback) return;
    const fb: OxygenFeedback = maze.oxygenFeedback;

    // 飞行瓶（迷你发光圆点，尾迹）
    for (const fly of fb.flyingTanks) {
        if (fly.done) continue;
        ctx.save();
        // 尾迹
        const tailGrad = ctx.createLinearGradient(fly.x - fly.vx * 4, fly.y - fly.vy * 4, fly.x, fly.y);
        tailGrad.addColorStop(0, 'rgba(160, 255, 200, 0)');
        tailGrad.addColorStop(1, 'rgba(160, 255, 200, 0.6)');
        ctx.strokeStyle = tailGrad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fly.x - fly.vx * 4, fly.y - fly.vy * 4);
        ctx.lineTo(fly.x, fly.y);
        ctx.stroke();
        // 主体：微型氧气瓶剪影
        const glow = ctx.createRadialGradient(fly.x, fly.y, 0, fly.x, fly.y, 10);
        glow.addColorStop(0, 'rgba(220, 255, 220, 0.95)');
        glow.addColorStop(0.5, 'rgba(160, 240, 200, 0.6)');
        glow.addColorStop(1, 'rgba(160, 240, 200, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(fly.x, fly.y, 10, 0, Math.PI * 2);
        ctx.fill();
        // 核心黄色小瓶
        ctx.fillStyle = '#e6c850';
        ctx.beginPath();
        ctx.arc(fly.x, fly.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 气泡爆发
    for (const b of fb.bubbleBurst) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, b.life) * 0.9;
        // 气泡白色外环
        ctx.strokeStyle = 'rgba(220, 245, 255, 0.9)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.stroke();
        // 内部淡填充
        ctx.fillStyle = 'rgba(180, 230, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size * 0.85, 0, Math.PI * 2);
        ctx.fill();
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(b.x - b.size * 0.3, b.y - b.size * 0.3, b.size * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// =============================================
// 屏幕层：拾取后的绿色全屏辉光（由 RenderMazeUI 调用，坐标为屏幕空间）
// =============================================
export function drawOxygenScreenGlow(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    const maze = state.mazeRescue;
    if (!maze || !maze.oxygenFeedback) return;
    const fb: OxygenFeedback = maze.oxygenFeedback;
    if (fb.screenGlowTimer <= 0) return;

    const t = fb.screenGlowTimer;
    // 边缘发光更亮、中心通透（让玩家看清画面，不挡视野）
    const grad = ctx.createRadialGradient(screenW / 2, screenH / 2, Math.min(screenW, screenH) * 0.25, screenW / 2, screenH / 2, Math.max(screenW, screenH) * 0.75);
    grad.addColorStop(0, `rgba(120, 255, 180, 0)`);
    grad.addColorStop(1, `rgba(120, 255, 180, ${0.22 * t})`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, screenW, screenH);
    ctx.restore();
}

// =============================================
// 辅助：圆角矩形
// =============================================
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
