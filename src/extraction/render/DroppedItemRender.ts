// 丢弃物的世界层渲染
//
// 表现：
// - 画物品本身（矢量图），保持与原 Relic 一致的视觉语言
// - 上下浮动（bob）模拟水下漂移
// - 玩家靠近时加一圈柔光提示"可拾取"（不破坏物品本体外观）
// - 标签淡入：玩家靠近 < 200px 时显示物品名
//
// 调用方：Render.ts 在 drawRelicsWorld 之后调用

import { ctx } from '../../render/Canvas';
import { player } from '../../core/state';
import { getDroppedItems } from '../logic/DroppedItem';
import { getItemDef } from '../core/ExtractionRegistry';
import { drawRelicIconAt } from '../../render/RenderRelic';
import { ALL_RELIC_KINDS } from '../../logic/Relic';

// 物品 id 是否是古物（可用矢量图绘制）
const RELIC_ID_SET: { [k: string]: boolean } = (() => {
    const m: { [k: string]: boolean } = {};
    for (const k of ALL_RELIC_KINDS) m[k] = true;
    return m;
})();

export function drawDroppedItemsWorld(viewL: number, viewR: number, viewT: number, viewB: number): void {
    const items = getDroppedItems();
    if (items.length === 0) return;

    const time = Date.now() / 1000;

    ctx.save();
    for (const it of items) {
        // 视锥裁剪
        if (it.x < viewL - 40 || it.x > viewR + 40 || it.y < viewT - 40 || it.y > viewB + 40) continue;

        const bob = Math.sin(time * 1.6 + it.bobPhase) * 1.5;
        const cx = it.x;
        const cy = it.y + bob;

        // 玩家距离：靠近时物品辉光提示"可拾取"
        const d = Math.hypot(player.x - it.x, player.y - it.y);
        const near = d < 220;

        // 柔和辉光（只在靠近时出现，视觉提示"可拾取"）
        if (near) {
            const pulse = 0.5 + 0.5 * Math.sin(time * 2.4 + it.bobPhase);
            const glowAlpha = Math.max(0, (220 - d) / 220) * (0.18 + 0.12 * pulse);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
            grad.addColorStop(0, `rgba(255, 230, 160, ${glowAlpha})`);
            grad.addColorStop(0.7, `rgba(255, 210, 130, ${glowAlpha * 0.4})`);
            grad.addColorStop(1, 'rgba(255, 210, 130, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, 22, 0, Math.PI * 2);
            ctx.fill();
        }

        // 物品本身（古物矢量图）
        if (RELIC_ID_SET[it.itemId]) {
            drawRelicIconAt(ctx, it.itemId as any, cx, cy, 22);
        } else {
            // 非古物兜底（消耗品/装备理论上不会被丢到水底，但留个退路）
            const def = getItemDef(it.itemId);
            ctx.fillStyle = 'rgba(200, 165, 90, 0.9)';
            ctx.beginPath();
            ctx.arc(cx, cy, 8, 0, Math.PI * 2);
            ctx.fill();
            if (def) {
                ctx.fillStyle = '#1a1a1a';
                ctx.font = 'bold 10px "PingFang SC", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(def.name.charAt(0), cx, cy + 1);
            }
        }

        // 玩家靠近时显示物品名
        if (near) {
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
