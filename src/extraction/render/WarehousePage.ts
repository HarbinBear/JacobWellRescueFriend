// 仓库全屏页（岸上打开）
//
// 布局（遵循 UISafeArea 规则，全部避开顶部胶囊）：
// - 顶部：[返回 X] + 标题"仓库"+件数 + [💰金币]（左上一行）
// - 标题下：总估值 / 按类型切换 tab
// - 中部：格子网格（4 列 × N 行，每格 68×68）
//   - 每格底部带估值小字
//   - 品相边框色
// - 底部：总估值大字 + "全部卖出"金色按钮
// - 单击格子 → 弹出 ItemDetailCard（含"卖出 XX 金"按钮）
//
// 与 BagFullPage 的区别：
// - 背景用浅棕羊皮纸（岸上场景）而非深蓝（水下）
// - 不支持拖拽（仓库不需要排序，卖出就是最终行为）
// - 点击即弹详情卡（单击立即，没有长按区分）

import { ctx } from '../../render/Canvas';
import { CONFIG } from '../../core/config';
import { state } from '../../core/state';
import { getItemDef } from '../core/ExtractionRegistry';
import { ensureExtractionState, WarehouseItem } from '../core/ExtractionState';
import {
    computeItemPrice,
    getItemDisplayName,
    computeWarehouseTotalValue,
    getCoins,
    sellAllWarehouseItems,
    sellWarehouseItem,
} from '../logic/Economy';
import { openDetailCard, closeDetailCard } from './ItemDetailCard';
import { SAFE_TOP, SAFE_LEFT, SAFE_RIGHT } from './UISafeArea';
import { drawRelicIconAt } from '../../render/RenderRelic';
import { ALL_RELIC_KINDS } from '../../logic/Relic';

// 物品 id 是否是古物
const RELIC_ID_SET: { [k: string]: boolean } = (() => {
    const m: { [k: string]: boolean } = {};
    for (const k of ALL_RELIC_KINDS) m[k] = true;
    return m;
})();

/** 在中心位置绘制物品图标（古物矢量图 / 非古物首字占位） */
function drawItemIcon(itemId: string, cx: number, cy: number, iconSize: number, fallbackName: string): void {
    if (RELIC_ID_SET[itemId]) {
        drawRelicIconAt(ctx, itemId as any, cx, cy, iconSize);
        return;
    }
    ctx.fillStyle = 'rgba(190, 155, 80, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, iconSize * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold ' + Math.round(iconSize * 0.55) + 'px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallbackName.charAt(0), cx, cy + 1);
}

// 圆角矩形
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

function conditionColor(condition: string): string {
    switch (condition) {
        case 'pristine':  return 'rgba(255, 220, 130, 0.95)';
        case 'fine':      return 'rgba(180, 220, 255, 0.95)';
        case 'normal':    return 'rgba(200, 215, 230, 0.85)';
        case 'worn':      return 'rgba(200, 165, 130, 0.8)';
        case 'broken':    return 'rgba(180, 130, 110, 0.78)';
        default:          return 'rgba(200, 215, 230, 0.8)';
    }
}

// =============================================
// 打开/关闭
// =============================================

export function isWarehousePageOpen(): boolean {
    const ex = ensureExtractionState() as any;
    return !!ex.warehousePageOpen;
}

export function openWarehousePage(): void {
    const ex = ensureExtractionState() as any;
    ex.warehousePageOpen = true;
}

export function closeWarehousePage(): void {
    const ex = ensureExtractionState() as any;
    ex.warehousePageOpen = false;
    closeDetailCard();
}

// =============================================
// hit-test
// =============================================

let _closeBtnRect: { x: number; y: number; w: number; h: number } | null = null;
let _sellAllBtnRect: { x: number; y: number; w: number; h: number } | null = null;
const _slotRects: { itemUniqueId: number; x: number; y: number; w: number; h: number }[] = [];

export function getWarehouseCloseBtnRect() { return _closeBtnRect; }
export function getWarehouseSellAllBtnRect() { return _sellAllBtnRect; }
export function getWarehouseSlotHitTests() { return _slotRects.slice(); }

// =============================================
// 业务：点格子 → 详情卡
// =============================================

export function openWarehouseItemDetail(itemUniqueId: number): void {
    const ex = ensureExtractionState();
    const it = ex.warehouse.find(w => w.id === itemUniqueId);
    if (!it) return;
    const def = getItemDef(it.itemId);
    if (!def) return;
    const price = computeItemPrice(it.itemId, it.condition);
    openDetailCard({
        source: 'warehouse',
        itemUniqueId: it.id,
        itemId: it.itemId,
        condition: it.condition,
        actions: [
            { id: 'close', label: '关闭', style: 'secondary' },
            { id: 'sell:' + it.id, label: '卖出 +' + price + ' 金', style: 'primary' },
        ],
    });
}

/** 详情卡"卖出"动作调用点 */
export function performWarehouseSell(actionId: string): { ok: boolean; earned: number; reason?: string } {
    if (!actionId.startsWith('sell:')) return { ok: false, earned: 0, reason: 'badAction' };
    const id = parseInt(actionId.slice(5), 10);
    if (isNaN(id)) return { ok: false, earned: 0, reason: 'badAction' };
    const earned = sellWarehouseItem(id);
    if (earned <= 0) return { ok: false, earned: 0, reason: 'notFound' };
    // 关闭详情卡（让玩家回到仓库网格继续操作）
    closeDetailCard();
    return { ok: true, earned };
}

/** "全部卖出"动作 */
export function performWarehouseSellAll(): number {
    return sellAllWarehouseItems();
}

// =============================================
// 渲染
// =============================================

export function drawWarehousePage(): void {
    _closeBtnRect = null;
    _sellAllBtnRect = null;
    _slotRects.length = 0;

    if (!isWarehousePageOpen()) return;

    const ex = ensureExtractionState();
    const cw = CONFIG.screenWidth;
    const ch = CONFIG.screenHeight;
    const items: WarehouseItem[] = ex.warehouse;
    const totalValue = computeWarehouseTotalValue();
    const coins = getCoins();

    ctx.save();

    // === 背景：浅棕羊皮纸（与商店风格一致但更亮一点，区分"自己的仓库"与"商店")===
    const bgGrad = ctx.createLinearGradient(0, 0, 0, ch);
    bgGrad.addColorStop(0, 'rgba(40, 30, 22, 0.96)');
    bgGrad.addColorStop(1, 'rgba(26, 20, 14, 0.96)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cw, ch);
    // 浅木纹噪点
    ctx.strokeStyle = 'rgba(90, 60, 35, 0.12)';
    ctx.lineWidth = 1;
    for (let y = 0; y < ch; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y + (Math.sin(y * 0.25) * 1.5));
        ctx.lineTo(cw, y + (Math.cos(y * 0.3) * 1.5));
        ctx.stroke();
    }

    // === 顶部布局（遵循 SAFE_TOP）===
    const titleY = SAFE_TOP + 14;

    // 关闭 X（左）
    {
        const r = 16;
        const cx = SAFE_LEFT + r;
        const cy = titleY;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220, 200, 160, 0.7)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 6); ctx.lineTo(cx + 6, cy + 6);
        ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx - 6, cy + 6);
        ctx.stroke();
        _closeBtnRect = { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
    }

    // 标题居中到"可用区"中心（避开胶囊）
    const usableW = cw - SAFE_RIGHT;
    const titleCx = usableW / 2;
    ctx.fillStyle = 'rgba(255, 230, 180, 0.95)';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📦  仓库', titleCx, titleY);

    // 副标题（件数 + 总估值）
    ctx.font = '12px "PingFang SC", Arial';
    ctx.fillStyle = 'rgba(210, 190, 150, 0.75)';
    ctx.fillText(items.length + ' 件待售   估值 ' + totalValue + ' 金', titleCx, titleY + 22);

    // 右上角金币（避开胶囊：落在 cw - SAFE_RIGHT 之内）
    {
        const text = '💰 ' + coins;
        ctx.font = 'bold 15px Arial';
        const tw = ctx.measureText(text).width;
        const x = cw - SAFE_RIGHT - tw - 4;
        const y = titleY;
        ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }

    // === 中部：网格 ===
    const gridTopY = titleY + 48;
    const bottomBarH = 64;
    const gridBottomLimit = ch - bottomBarH - 16;

    if (items.length === 0) {
        // 空仓库提示
        ctx.fillStyle = 'rgba(180, 150, 110, 0.55)';
        ctx.font = 'italic 14px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('仓库空空如也', cw / 2, (gridTopY + gridBottomLimit) / 2);
        ctx.fillStyle = 'rgba(150, 130, 100, 0.5)';
        ctx.font = '11px "PingFang SC", Arial';
        ctx.fillText('下潜 → 水下拾取战利品 → 撤离回岸自动入仓', cw / 2, (gridTopY + gridBottomLimit) / 2 + 24);
    } else {
        drawWarehouseGrid(items, gridTopY, gridBottomLimit, cw);
    }

    // === 底部栏：总估值 + 全部卖出 ===
    drawBottomBar(items, totalValue, cw, ch, bottomBarH);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

function drawWarehouseGrid(
    items: WarehouseItem[],
    gridTopY: number,
    gridBottomLimit: number,
    cw: number,
): void {
    const COLS = 4;
    const SLOT = 68;
    const GAP = 10;
    const gridW = SLOT * COLS + GAP * (COLS - 1);
    const startX = (cw - gridW) / 2;

    // 可视行数
    const rows = Math.max(1, Math.ceil(items.length / COLS));
    const maxVisibleRows = Math.floor((gridBottomLimit - gridTopY + GAP) / (SLOT + GAP));
    // 阶段 4：如果物品很多（>=36 件），仅显示前 maxVisibleRows 行 + 底部"…更多"
    // 后期阶段可加滚动条（暂简化）
    const displayRows = Math.min(rows, Math.max(1, maxVisibleRows));

    for (let i = 0; i < displayRows * COLS && i < items.length; i++) {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const x = startX + c * (SLOT + GAP);
        const y = gridTopY + r * (SLOT + GAP);
        const it = items[i];

        drawSlot(x, y, SLOT, it);
        _slotRects.push({ itemUniqueId: it.id, x, y, w: SLOT, h: SLOT });
    }

    // 超出：显示"还有 N 件…"
    if (items.length > displayRows * COLS) {
        const hidden = items.length - displayRows * COLS;
        const y = gridTopY + displayRows * (SLOT + GAP) - 6;
        ctx.fillStyle = 'rgba(220, 200, 160, 0.7)';
        ctx.font = 'italic 11px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('还有 ' + hidden + ' 件未显示（先卖掉一批腾空间）', cw / 2, y + 4);
    }
}

function drawSlot(x: number, y: number, size: number, it: WarehouseItem): void {
    const def = getItemDef(it.itemId);
    if (!def) return;

    const price = computeItemPrice(it.itemId, it.condition);

    // 格子底
    ctx.fillStyle = 'rgba(40, 52, 70, 0.82)';
    ctx.beginPath();
    rrect(ctx, x, y, size, size, 8);
    ctx.fill();

    // 品相边框
    ctx.strokeStyle = conditionColor(it.condition);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    rrect(ctx, x, y, size, size, 8);
    ctx.stroke();

    // 内圆 + 物品图标（古物矢量图）
    const cx = x + size / 2;
    const cy = y + size / 2 - 6;
    drawItemIcon(it.itemId, cx, cy, Math.round(size * 0.62), def.name);

    // 价格标签
    ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(price + 'g', cx, y + size - 4);
}

function drawBottomBar(
    items: WarehouseItem[],
    totalValue: number,
    cw: number, ch: number, barH: number,
): void {
    const barX = 14;
    const barW = cw - 28;
    const barY = ch - barH - 14;

    // 背景
    const grad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    grad.addColorStop(0, 'rgba(32, 24, 16, 0.95)');
    grad.addColorStop(1, 'rgba(22, 16, 10, 0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    rrect(ctx, barX, barY, barW, barH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 140, 80, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    rrect(ctx, barX, barY, barW, barH, 10);
    ctx.stroke();

    // 左侧：总估值
    const textX = barX + 16;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(180, 160, 130, 0.7)';
    ctx.font = '10px "PingFang SC", Arial';
    ctx.fillText('仓库总估值', textX, barY + 14);
    ctx.fillStyle = 'rgba(255, 220, 140, 0.98)';
    ctx.font = 'bold 22px "PingFang SC", Arial';
    ctx.fillText('+' + totalValue + ' 金', textX, barY + 28);

    // 右侧：全部卖出按钮
    const btnW = 150;
    const btnH = 40;
    const btnX = barX + barW - btnW - 14;
    const btnY = barY + (barH - btnH) / 2;

    if (items.length > 0) {
        const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
        btnGrad.addColorStop(0, 'rgba(150, 100, 30, 0.95)');
        btnGrad.addColorStop(1, 'rgba(200, 140, 50, 0.95)');
        ctx.fillStyle = btnGrad;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 210, 110, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.stroke();
        // 顶部高光
        const highGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH * 0.5);
        highGrad.addColorStop(0, 'rgba(255, 230, 160, 0.4)');
        highGrad.addColorStop(1, 'rgba(255, 230, 160, 0)');
        ctx.fillStyle = highGrad;
        ctx.beginPath();
        rrect(ctx, btnX + 2, btnY + 2, btnW - 4, btnH * 0.45, 18);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 240, 180, 0.98)';
        ctx.font = 'bold 14px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('全部卖出 ▶', btnX + btnW / 2, btnY + btnH / 2);
        _sellAllBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    } else {
        // 空仓：灰按钮
        ctx.fillStyle = 'rgba(45, 35, 25, 0.5)';
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 100, 80, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(140, 130, 110, 0.55)';
        ctx.font = 'italic 12px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('没有可卖出的物品', btnX + btnW / 2, btnY + btnH / 2);
        _sellAllBtnRect = null;
    }
}

// =============================================
// 岸上入口按钮
// =============================================

let _entryBtnRect: { x: number; y: number; w: number; h: number } | null = null;

export function getWarehouseEntryBtnRect() { return _entryBtnRect; }

/**
 * 岸上的"仓库"入口按钮
 * 位置策略：与商店入口按钮横向并排，放在商店按钮正下方一行
 * 避免与金币 HUD 冲突（金币 HUD 已在商店右边）
 */
export function drawWarehouseEntryBtn(cw: number, ch: number, time: number): void {
    _entryBtnRect = null;
    const maze: any = state.mazeRescue;
    if (!maze) return;
    if (maze.phase !== 'shore' && maze.phase !== 'resolved_idle') return;
    if (!maze.briefingShown) return;
    if (maze.shoreMapOpen) return;
    if (maze.codexOpen) return;

    const btnW = 90;
    const btnH = 32;
    // 位置：商店按钮（SAFE_LEFT, SAFE_TOP）正下方一行
    const btnX = SAFE_LEFT;
    const btnY = SAFE_TOP + 32 + 8;

    const ex = ensureExtractionState();
    const stockCount = ex.warehouse.length;

    ctx.save();

    // 背景（浅棕）
    ctx.fillStyle = 'rgba(48, 35, 22, 0.88)';
    ctx.beginPath();
    rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 160, 80, 0.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 220, 150, 0.95)';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📦 仓库', btnX + btnW / 2, btnY + btnH / 2 + 1);

    // 库存徽章
    if (stockCount > 0) {
        const bx = btnX + btnW - 8;
        const by = btnY + 2;
        const radius = 10;
        // 库存满 pulse
        if (stockCount >= 8) {
            const glow = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(Date.now() / 200));
            ctx.fillStyle = `rgba(255, 180, 80, ${glow})`;
            ctx.beginPath();
            ctx.arc(bx, by + 8, radius + 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(180, 60, 50, 0.95)';
        ctx.beginPath();
        ctx.arc(bx, by + 8, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 240, 220, 0.98)';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(stockCount), bx, by + 8);
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();

    _entryBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    void ch; void time;
}
