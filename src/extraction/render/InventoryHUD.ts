// 下潜中的背包 HUD（右下角格子条）
//
// 仅在迷宫 play 阶段显示
// 4 格背包：横排 4 个格子；8/12 格未来再做换行

import { CONFIG } from '../../core/config';
import { state } from '../../core/state';
import { ctx } from '../../render/Canvas';
import { getBagItems, getBagOccupiedSlots } from '../logic/Inventory';
import { getItemDef } from '../core/ExtractionRegistry';
import { ensureExtractionState } from '../core/ExtractionState';

// 兼容微信小游戏的圆角矩形
function rrect(c: any, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
}

export function isInventoryHUDVisible(): boolean {
    if (state.screen !== 'mazeRescue') return false;
    const maze: any = state.mazeRescue;
    if (!maze) return false;
    return maze.phase === 'play';
}

export function drawInventoryHUD(): void {
    if (!isInventoryHUDVisible()) return;

    const ex = ensureExtractionState();
    const cw = CONFIG.screenWidth;
    const ch = CONFIG.screenHeight;

    const slotN = ex.bag.maxSlots;
    const items = getBagItems();
    const used = getBagOccupiedSlots();

    // 布局：右下角，避开氧气环（左上）和撤离按钮（中下/右下）
    const slotSize = 36;
    const slotGap = 6;
    const totalW = slotSize * slotN + slotGap * (slotN - 1);
    const startX = cw - totalW - 16;
    const startY = ch - slotSize - 16;

    // 背景容器
    const padX = 8;
    const padY = 6;
    ctx.save();
    ctx.fillStyle = 'rgba(20, 28, 40, 0.55)';
    ctx.beginPath();
    rrect(ctx, startX - padX, startY - padY - 14, totalW + padX * 2, slotSize + padY * 2 + 14, 8);
    ctx.fill();

    // 顶部小字 "背包 N/M"
    ctx.fillStyle = 'rgba(200, 220, 240, 0.7)';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('背包 ' + used + '/' + slotN, startX - padX + 6, startY - padY - 12);

    // 渲染每个格子
    // 物品占多格（slots>1）：横向连占；阶段 1 暂用每件一律按 1 格画（视觉简化），未来要画大方块
    let slotIdx = 0;
    for (let i = 0; i < slotN; i++) {
        const x = startX + i * (slotSize + slotGap);
        const y = startY;

        // 格子底
        ctx.fillStyle = 'rgba(40, 50, 65, 0.6)';
        ctx.beginPath();
        rrect(ctx, x, y, slotSize, slotSize, 5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(160, 180, 200, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        rrect(ctx, x, y, slotSize, slotSize, 5);
        ctx.stroke();

        // 已占用：画物品图标占位（首字 / 缩略名）
        if (slotIdx < items.length) {
            const it = items[slotIdx];
            const def = getItemDef(it.itemId);
            if (def) {
                const cx = x + slotSize / 2;
                const cy = y + slotSize / 2;
                // 简化：圆点 + 物品名首字
                ctx.fillStyle = 'rgba(200, 170, 100, 0.85)';
                ctx.beginPath();
                ctx.arc(cx, cy, slotSize * 0.32, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#1a1a1a';
                ctx.font = 'bold 12px "PingFang SC", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(def.name.charAt(0), cx, cy + 0.5);
            }
            slotIdx++;
        }
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
