// 丢弃物的世界层渲染
//
// 表现：
// - 小金色光点（半径 8px）+ 上下浮动（bob）+ 转动光环
// - 标签淡入：玩家靠近 < 200px 时显示物品名
//
// 调用方：Render.ts 在 drawRelicsWorld 之后调用

import { ctx } from '../../render/Canvas';
import { player } from '../../core/state';
import { getDroppedItems } from '../logic/DroppedItem';
import { getItemDef } from '../core/ExtractionRegistry';

export function drawDroppedItemsWorld(viewL: number, viewR: number, viewT: number, viewB: number): void {
    const items = getDroppedItems();
    if (items.length === 0) return;

    const time = Date.now() / 1000;

    ctx.save();
    for (const it of items) {
        // 视锥裁剪
        if (it.x < viewL - 40 || it.x > viewR + 40 || it.y < viewT - 40 || it.y > viewB + 40) continue;

        const bob = Math.sin(time * 1.6 + it.bobPhase) * 2;
        const cx = it.x;
        const cy = it.y + bob;

        // 外圈光环（旋转）
        const ringR = 14;
        ctx.strokeStyle = 'rgba(255, 220, 140, 0.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const ringRot = time * 1.2 + it.bobPhase;
        for (let i = 0; i < 3; i++) {
            const a0 = ringRot + (i * Math.PI * 2) / 3;
            const a1 = a0 + Math.PI * 2 / 3 * 0.55;
            ctx.moveTo(cx + Math.cos(a0) * ringR, cy + Math.sin(a0) * ringR);
            ctx.arc(cx, cy, ringR, a0, a1);
        }
        ctx.stroke();

        // 内圈辉光（径向渐变）
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
        grad.addColorStop(0, 'rgba(255, 220, 140, 0.65)');
        grad.addColorStop(0.6, 'rgba(255, 200, 110, 0.25)');
        grad.addColorStop(1, 'rgba(255, 200, 110, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, Math.PI * 2);
        ctx.fill();

        // 中心圆点
        ctx.fillStyle = 'rgba(255, 230, 160, 0.95)';
        ctx.beginPath();
        ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 250, 220, 0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
        ctx.stroke();

        // 玩家靠近时显示物品名
        const d = Math.hypot(player.x - it.x, player.y - it.y);
        if (d < 220) {
            const labelAlpha = Math.max(0, Math.min(1, (220 - d) / 80));
            const def = getItemDef(it.itemId);
            const nm = def ? def.name : '物品';
            ctx.globalAlpha = labelAlpha;
            ctx.fillStyle = 'rgba(255, 240, 200, 0.95)';
            ctx.font = 'bold 11px "PingFang SC", Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(nm, cx, cy - 18);
            ctx.globalAlpha = 1;
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        }
    }
    ctx.restore();
}
