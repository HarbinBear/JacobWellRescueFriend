// 商店全屏页（场景化版本）
//
// 视觉构图（自上而下）：
//   ┌─────────────────────────────────────┐
//   │ ◀返回      💰金币   🔄换一批         │  顶栏（一行内对齐）
//   │                                       │
//   │            雅各布井杂货铺              │  大标题（居中）
//   │       "随便看看，不强买"               │  老板话术（居中斜体）
//   │                                       │
//   │   ┌───────────────────────────────┐   │
//   │   │ 商品挂在木墙上（3 列网格）    │   │  货架区（不分类，所有商品平铺）
//   │   │ ⬜ ⬜ ⬜                        │   │
//   │   │ ⬜ ⬜ ⬜                        │   │
//   │   │ ⬜ ⬜                           │   │
//   │   └───────────────────────────────┘   │
//   │                                       │
//   │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │  柜台木板（横线分隔）
//   │            ╔═╗                         │
//   │     ┌─────┤ ☻├──────┐                  │  老板（戴帽小老头）+ 柜台
//   │     │     ╚═╝       │                  │
//   │     │═══════════════│                  │
//   │     └───────────────┘                  │
//   └─────────────────────────────────────┘
//
// 与微信胶囊的协调：顶栏所有元素 y 起点都从 SAFE_TOP 开始，避开胶囊
// 标题居中：直接 cw / 2（标题在 SAFE_TOP 之下，胶囊不影响）
//
// 详见 design/extraction/02-shop-randomization.md（旧"分类货架"已废弃）

import { CONFIG } from '../../core/config';
import { state } from '../../core/state';
import { ctx } from '../../render/Canvas';
import { getCoins } from '../logic/Economy';
import { getItemDef } from '../core/ExtractionRegistry';
import { ensureExtractionState, ShopSlot } from '../core/ExtractionState';
import {
    ensureShopInitialized,
    refreshShopSlots,
    getRerollCost,
    performShopReroll,
    performShopBuySlot,
    getEquipmentStock,
    getConsumableCount,
} from '../logic/Shop';
import {
    openDetailCard,
    closeDetailCard,
    isDetailCardOpen,
} from './ItemDetailCard';
import { SAFE_TOP, SAFE_LEFT, SAFE_RIGHT } from './UISafeArea';
import { drawShopItemIcon, hasShopItemIcon } from './ShopItemIcons';

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

// =============================================
// 入口/关闭按钮 hit-test
// =============================================

let _entryBtnRect: { x: number; y: number; w: number; h: number } | null = null;
let _closeBtnRect: { x: number; y: number; w: number; h: number } | null = null;
let _rerollBtnRect: { x: number; y: number; w: number; h: number } | null = null;
const _slotCardRects: { [slotId: number]: { x: number; y: number; w: number; h: number } } = {};

export function getShopEntryBtnRect(): { x: number; y: number; w: number; h: number } | null {
    return _entryBtnRect;
}
export function getShopCloseBtnRect(): { x: number; y: number; w: number; h: number } | null {
    return _closeBtnRect;
}
export function getShopRerollBtnRect(): { x: number; y: number; w: number; h: number } | null {
    return _rerollBtnRect;
}
/** 取所有商店卡片的 hit-test 矩形（slotId -> rect） */
export function getShopSlotHitTests(): { slotId: number; x: number; y: number; w: number; h: number }[] {
    const out: { slotId: number; x: number; y: number; w: number; h: number }[] = [];
    for (const k in _slotCardRects) {
        if (Object.prototype.hasOwnProperty.call(_slotCardRects, k)) {
            const r = _slotCardRects[k];
            out.push({ slotId: parseInt(k, 10), x: r.x, y: r.y, w: r.w, h: r.h });
        }
    }
    return out;
}

// 兼容旧接口（input.ts 还可能用到）
export function getShopBuyBtnRect(_itemId: string): { x: number; y: number; w: number; h: number } | null {
    return null;
}

// =============================================
// 打开/关闭
// =============================================

export function isShopOpen(): boolean {
    const ex = ensureExtractionState();
    return !!(ex as any).shopOpen;
}

export function openShop(): void {
    const ex = ensureExtractionState();
    (ex as any).shopOpen = true;
    ensureShopInitialized();
}

export function closeShop(): void {
    const ex = ensureExtractionState();
    (ex as any).shopOpen = false;
    closeDetailCard();
}

// =============================================
// 入口按钮（岸上）
// =============================================

export function drawShopEntryBtn(cw: number, ch: number, time: number): void {
    const maze: any = state.mazeRescue;
    if (!maze) return;
    if (maze.phase !== 'shore' && maze.phase !== 'resolved_idle') return;
    if (!maze.briefingShown) return;
    if (maze.shoreMapOpen) return;
    if (maze.codexOpen) return;

    // 位置：紧挨"返回主菜单"按钮（mazeUI/shore.ts 把"返回"画在 SAFE_LEFT, SAFE_TOP, 72×30）
    // 杂货铺按钮：x = 14 + 72 + 8 = 94，与返回同 y 基线
    const btnW = 92;
    const btnH = 32;
    const btnX = SAFE_LEFT + 72 + 8;
    const btnY = SAFE_TOP - 1;   // 微调到与返回按钮中线齐

    ctx.save();
    ctx.fillStyle = 'rgba(60, 38, 22, 0.85)';
    ctx.beginPath();
    rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 180, 80, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 220, 150, 0.95)';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏪 杂货铺', btnX + btnW / 2, btnY + btnH / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();

    _entryBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
}

// =============================================
// 商店全屏页
// =============================================

export function drawShop(cw: number, ch: number, time: number): void {
    if (!isShopOpen()) {
        _closeBtnRect = null;
        _rerollBtnRect = null;
        for (const k in _slotCardRects) delete _slotCardRects[k];
        return;
    }

    const ex = ensureExtractionState();
    if (!ex.shop) ensureShopInitialized();

    ctx.save();

    // === 背景：深棕室内 ===
    ctx.fillStyle = 'rgba(30, 22, 16, 0.97)';
    ctx.fillRect(0, 0, cw, ch);
    // 木纹横线（很浅）
    ctx.strokeStyle = 'rgba(80, 50, 30, 0.12)';
    ctx.lineWidth = 1;
    for (let y = 0; y < ch; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y + (Math.sin(y * 0.3) * 1.2));
        ctx.lineTo(cw, y + (Math.cos(y * 0.4) * 1.2));
        ctx.stroke();
    }
    // 顶部窗户柔光（微弱）
    {
        const lightGrad = ctx.createRadialGradient(cw * 0.5, -ch * 0.2, 20, cw * 0.5, ch * 0.3, ch * 0.55);
        lightGrad.addColorStop(0, 'rgba(255, 220, 160, 0.06)');
        lightGrad.addColorStop(1, 'rgba(255, 220, 160, 0)');
        ctx.fillStyle = lightGrad;
        ctx.fillRect(0, 0, cw, ch);
    }

    // === 几何参数 ===
    const counterH = 110;                    // 底部老板柜台高度
    const counterTopY = ch - counterH - 8;   // 柜台木板顶边 Y

    // === 顶栏：一行三段（左 关闭 / 中 金币 / 右 换一批）===
    // 三个按钮共用同一基线 SAFE_TOP，确保水平对齐
    const topBarY = SAFE_TOP;
    const topBtnH = 30;

    // 关闭按钮
    {
        const btnW = 64;
        ctx.fillStyle = 'rgba(80, 60, 40, 0.85)';
        ctx.beginPath();
        rrect(ctx, SAFE_LEFT, topBarY, btnW, topBtnH, topBtnH / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180, 150, 100, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        rrect(ctx, SAFE_LEFT, topBarY, btnW, topBtnH, topBtnH / 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(220, 200, 160, 0.95)';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('◀ 返回', SAFE_LEFT + btnW / 2, topBarY + topBtnH / 2);
        _closeBtnRect = { x: SAFE_LEFT, y: topBarY, w: btnW, h: topBtnH };
    }

    // 换一批按钮（贴右，避开胶囊）
    const coins = getCoins();
    {
        const cost = getRerollCost();
        const btnW = 100;
        const btnX = cw - SAFE_RIGHT - btnW;
        const btnY = topBarY;

        ctx.fillStyle = coins >= cost ? 'rgba(50, 80, 100, 0.9)' : 'rgba(50, 60, 70, 0.6)';
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, topBtnH, topBtnH / 2);
        ctx.fill();
        ctx.strokeStyle = coins >= cost ? 'rgba(140, 200, 240, 0.7)' : 'rgba(120, 130, 150, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, topBtnH, topBtnH / 2);
        ctx.stroke();

        ctx.fillStyle = coins >= cost ? 'rgba(180, 220, 250, 0.95)' : 'rgba(160, 170, 180, 0.6)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = cost === 0 ? '🔄 换一批 · 免费' : '🔄 换一批 · ' + cost + ' 金';
        ctx.fillText(label, btnX + btnW / 2, btnY + topBtnH / 2);
        _rerollBtnRect = { x: btnX, y: btnY, w: btnW, h: topBtnH };
    }

    // 金币标牌（中间偏右，挤进顶栏；与按钮同基线）
    // 注意：胶囊在右侧 SAFE_RIGHT 内，金币要画在 [关闭按钮右边 + 12, 换一批左边 - 12] 区间居中
    {
        const leftEdge = SAFE_LEFT + 64 + 12;          // 关闭按钮右侧 + 12
        const rightEdge = cw - SAFE_RIGHT - 100 - 12;  // 换一批按钮左侧 - 12
        const coinCx = (leftEdge + rightEdge) / 2;
        const coinCy = topBarY + topBtnH / 2;
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💰 ' + coins, coinCx, coinCy);
    }

    // === 标题 + 老板话术（居中）===
    const titleY = topBarY + topBtnH + 18;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 220, 150, 0.95)';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('雅各布井杂货铺', cw / 2, titleY);

    // 副标题（老板话术）
    ctx.font = 'italic 12px Georgia, serif';
    ctx.fillStyle = 'rgba(220, 200, 160, 0.65)';
    ctx.fillText('"' + bossLine() + '"', cw / 2, titleY + 22);

    // === 货架区（一个木墙背景 + 商品网格）===
    // 货架顶 = 副标题下方 + 18，底 = 柜台顶上方 - 12
    const shelfTop = titleY + 22 + 18;
    const shelfBottom = counterTopY - 12;
    const shelfPad = 12;
    const shelfX = SAFE_LEFT + 4;
    const shelfW = cw - (SAFE_LEFT + 4) * 2;
    const shelfH = shelfBottom - shelfTop;

    // 木墙背景
    {
        ctx.fillStyle = 'rgba(48, 32, 22, 0.85)';
        ctx.beginPath();
        rrect(ctx, shelfX, shelfTop, shelfW, shelfH, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 85, 50, 0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        rrect(ctx, shelfX, shelfTop, shelfW, shelfH, 10);
        ctx.stroke();
        // 木纹竖纹
        ctx.strokeStyle = 'rgba(90, 60, 35, 0.25)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 8; i++) {
            const px = shelfX + shelfW * (i / 8);
            ctx.beginPath();
            ctx.moveTo(px, shelfTop + 4);
            ctx.lineTo(px, shelfTop + shelfH - 4);
            ctx.stroke();
        }
    }

    // 商品网格：3 列，行高根据剩余空间自适应（最大卡高 130）
    for (const k in _slotCardRects) delete _slotCardRects[k];
    const slots: ShopSlot[] = ex.shop ? ex.shop.slots : [];

    if (slots.length === 0) {
        ctx.fillStyle = 'rgba(180, 160, 130, 0.55)';
        ctx.font = 'italic 13px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('（架子是空的）', shelfX + shelfW / 2, shelfTop + shelfH / 2);
    } else {
        const COLS = 3;
        const rows = Math.ceil(slots.length / COLS);
        const gridX = shelfX + shelfPad;
        const gridY = shelfTop + shelfPad;
        const gridW = shelfW - shelfPad * 2;
        const gridH = shelfH - shelfPad * 2;
        const cardGapX = 10;
        const cardGapY = 10;
        const cardW = (gridW - cardGapX * (COLS - 1)) / COLS;
        const cardH = Math.min(130, (gridH - cardGapY * (rows - 1)) / rows);

        for (let i = 0; i < slots.length; i++) {
            const r = Math.floor(i / COLS);
            const c = i % COLS;
            const x = gridX + c * (cardW + cardGapX);
            const y = gridY + r * (cardH + cardGapY);
            drawSlotCard(slots[i], x, y, cardW, cardH, time);
            _slotCardRects[slots[i].slotId] = { x, y, w: cardW, h: cardH };
        }
    }

    // === 柜台（底部）===
    drawCounter(cw, ch, counterTopY, counterH, time);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

// =============================================
// 柜台 + 老板（场景化装饰）
// =============================================

function drawCounter(cw: number, ch: number, topY: number, h: number, time: number): void {
    // 柜台底色：棕色木板（横纹）
    const counterX = 0;
    const counterW = cw;

    // 柜台主体
    const grad = ctx.createLinearGradient(0, topY, 0, topY + h);
    grad.addColorStop(0, 'rgba(86, 56, 32, 0.95)');
    grad.addColorStop(0.5, 'rgba(70, 45, 26, 0.95)');
    grad.addColorStop(1, 'rgba(55, 35, 20, 0.98)');
    ctx.fillStyle = grad;
    ctx.fillRect(counterX, topY, counterW, h);

    // 顶面金属边线（柜台台面反光）
    ctx.fillStyle = 'rgba(180, 140, 80, 0.5)';
    ctx.fillRect(counterX, topY, counterW, 3);
    ctx.fillStyle = 'rgba(255, 220, 150, 0.25)';
    ctx.fillRect(counterX, topY + 1, counterW, 1);

    // 木板拼缝（竖线）
    ctx.strokeStyle = 'rgba(40, 25, 15, 0.55)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
        const px = counterX + counterW * (i / 6);
        ctx.beginPath();
        ctx.moveTo(px, topY + 4);
        ctx.lineTo(px, topY + h);
        ctx.stroke();
    }

    // 老板（简笔小老头：居中略偏左，柜台后面探出半身）
    const bossCx = cw * 0.5;
    const bossCy = topY + 32;          // 头中心：柜台台面上方 32
    const bossBob = Math.sin(time * 1.2) * 1.5;  // 微微摇晃
    drawShopkeeper(bossCx, bossCy + bossBob, time);

    // 老板对话气泡（柜台上方右侧，循环话术）
    // 以"有什么需要的？" 简洁话术贴在头部右侧
    {
        const bubbleX = bossCx + 38;
        const bubbleY = bossCy + bossBob - 12;
        const text = '欢迎光临';
        ctx.font = 'italic 11px Georgia, serif';
        const tw = ctx.measureText(text).width;
        const padX = 8;
        const bw = tw + padX * 2;
        const bh = 20;
        ctx.fillStyle = 'rgba(245, 235, 210, 0.85)';
        ctx.beginPath();
        rrect(ctx, bubbleX, bubbleY, bw, bh, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 90, 60, 0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        rrect(ctx, bubbleX, bubbleY, bw, bh, 10);
        ctx.stroke();
        // 小尾巴
        ctx.fillStyle = 'rgba(245, 235, 210, 0.85)';
        ctx.beginPath();
        ctx.moveTo(bubbleX + 4, bubbleY + bh - 1);
        ctx.lineTo(bubbleX - 4, bubbleY + bh + 6);
        ctx.lineTo(bubbleX + 10, bubbleY + bh - 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(70, 50, 35, 0.95)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bubbleX + padX, bubbleY + bh / 2);
    }
}

/** 简笔小老头老板（戴帽子、白胡子、围裙），中心点 (cx, cy) 是头的中心 */
function drawShopkeeper(cx: number, cy: number, time: number): void {
    ctx.save();

    // 阴影（柜台上）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 38, 20, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 身体（围裙的上半身，柜台只露胸以上）
    ctx.fillStyle = 'rgba(120, 80, 50, 0.95)';
    ctx.beginPath();
    rrect(ctx, cx - 18, cy + 14, 36, 30, 4);
    ctx.fill();
    // 围裙白线
    ctx.strokeStyle = 'rgba(220, 200, 170, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 14);
    ctx.lineTo(cx, cy + 44);
    ctx.stroke();

    // 头（圆脸，肉色）
    ctx.fillStyle = 'rgba(235, 200, 170, 0.98)';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    // 脸颊
    ctx.fillStyle = 'rgba(220, 130, 110, 0.45)';
    ctx.beginPath();
    ctx.arc(cx - 6, cy + 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 6, cy + 3, 2, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛（两个小点，会眨）
    const blink = (Math.sin(time * 0.7) > 0.97) ? 0.2 : 1;
    ctx.fillStyle = 'rgba(40, 30, 25, 0.95)';
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy - 1, 1.2, 1.6 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 4, cy - 1, 1.2, 1.6 * blink, 0, 0, Math.PI * 2);
    ctx.fill();

    // 白胡子（嘴下半圆）
    ctx.fillStyle = 'rgba(245, 240, 230, 0.92)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // 微笑（嘴）
    ctx.strokeStyle = 'rgba(120, 70, 50, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy + 5, 3, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // 帽子（圆顶矿工帽，深棕色）
    ctx.fillStyle = 'rgba(70, 45, 30, 0.95)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 11, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy - 14, 11, 7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // 帽顶高光
    ctx.fillStyle = 'rgba(150, 110, 70, 0.5)';
    ctx.beginPath();
    ctx.ellipse(cx - 3, cy - 16, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// =============================================
// 单卡片渲染（不分类版）
// =============================================

function drawSlotCard(slot: ShopSlot, x: number, y: number, w: number, h: number, time: number): void {
    const def = getItemDef(slot.itemId);
    if (!def) return;

    const ex = ensureExtractionState();
    // 库存数量（消耗品 = 已购库存；装备 = 已持有件数）
    const equipStock = def.category === 'equipment' ? getEquipmentStock(slot.itemId) : 0;
    const stockCount = (def.category === 'consumable' || def.category === 'emergency')
        ? getConsumableCount(slot.itemId)
        : equipStock;
    const sold = slot.sold;
    const canAfford = ex.coins >= slot.price;
    const isSpecial = !!slot.isSpecial;

    // 卡片底（特价时金边）
    ctx.fillStyle = sold ? 'rgba(38, 28, 22, 0.85)' : 'rgba(50, 35, 22, 0.95)';
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = sold
        ? 'rgba(120, 100, 80, 0.4)'
        : (isSpecial ? 'rgba(255, 200, 80, 0.95)' : 'rgba(180, 140, 80, 0.55)');
    ctx.lineWidth = isSpecial ? 1.8 : 1.2;
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 8);
    ctx.stroke();

    // 特价角标（左上）
    if (isSpecial && !sold) {
        ctx.fillStyle = 'rgba(255, 200, 80, 0.95)';
        ctx.beginPath();
        rrect(ctx, x + 4, y + 4, 28, 14, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(60, 40, 10, 0.95)';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('70%', x + 4 + 14, y + 4 + 7);
    }

    // 库存徽章（右上）
    if (stockCount > 0) {
        const bx = x + w - 16;
        const by = y + 4;
        ctx.fillStyle = 'rgba(50, 100, 80, 0.95)';
        ctx.beginPath();
        ctx.arc(bx, by + 8, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(220, 250, 230, 0.95)';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×' + stockCount, bx, by + 8);
    }

    // 图标（矢量画法：背包/脚蹼/潜水衣/氧气瓶/电池/绳索 都有专属图标）
    const iconCx = x + w / 2;
    const iconCy = y + 38;
    const iconSize = 56;

    // 优先用矢量图标；不认识的 itemId 兜底到"圆形 + 首字"
    if (hasShopItemIcon(slot.itemId)) {
        // 售出态用半透明叠加压暗
        if (sold) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            drawShopItemIcon(ctx, slot.itemId, iconCx, iconCy, iconSize);
            ctx.restore();
        } else {
            drawShopItemIcon(ctx, slot.itemId, iconCx, iconCy, iconSize);
        }
    } else {
        const iconR = 22;
        ctx.fillStyle = sold ? 'rgba(100, 80, 60, 0.5)' : 'rgba(180, 140, 80, 0.65)';
        ctx.beginPath();
        ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = sold ? 'rgba(120, 100, 80, 0.4)' : 'rgba(220, 180, 100, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = sold ? 'rgba(140, 130, 120, 0.7)' : 'rgba(255, 240, 200, 0.95)';
        ctx.font = 'bold 18px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.name.charAt(0), iconCx, iconCy);
    }

    // 名称（居中）
    ctx.fillStyle = sold ? 'rgba(160, 140, 120, 0.7)' : 'rgba(220, 200, 160, 0.95)';
    ctx.font = 'bold 11px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name, iconCx, y + 72);

    // 价格 / 状态条（居中文字）
    const tagW = w - 16;
    const tagH = 20;
    const tagX = x + 8;
    const tagY = y + h - tagH - 8;
    if (sold) {
        ctx.fillStyle = 'rgba(60, 65, 75, 0.7)';
        ctx.beginPath();
        rrect(ctx, tagX, tagY, tagW, tagH, tagH / 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(160, 160, 170, 0.85)';
        ctx.font = 'italic 10px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('已售出', tagX + tagW / 2, tagY + tagH / 2);
    } else {
        const grad = ctx.createLinearGradient(tagX, tagY, tagX + tagW, tagY);
        if (canAfford) {
            grad.addColorStop(0, 'rgba(140, 100, 30, 0.92)');
            grad.addColorStop(1, 'rgba(190, 140, 50, 0.92)');
        } else {
            grad.addColorStop(0, 'rgba(70, 60, 50, 0.7)');
            grad.addColorStop(1, 'rgba(85, 70, 55, 0.7)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        rrect(ctx, tagX, tagY, tagW, tagH, tagH / 2);
        ctx.fill();
        ctx.fillStyle = canAfford ? 'rgba(255, 230, 150, 0.98)' : 'rgba(180, 170, 160, 0.7)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💰 ' + slot.price, tagX + tagW / 2, tagY + tagH / 2);
    }
}

// =============================================
// 老板话术（依玩家状态变化）
// =============================================

function bossLine(): string {
    const ex = ensureExtractionState();
    if (ex.coins < 50) return '年轻人，先攒攒钱再说。';
    if (ex.bag.maxSlots >= 16) return '看这装备，是老手了。';
    if (ex.bag.maxSlots >= 8) return '还想再升级？我这有的是好货。';
    return '想多带东西回来？买个大背包吧。';
}

// =============================================
// 点击 → 详情卡 / 购买
// =============================================

/** 玩家点了某个 shop slot：打开详情卡 */
export function openShopSlotDetail(slotId: number): void {
    const ex = ensureExtractionState();
    if (!ex.shop) return;
    const slot = ex.shop.slots.find(s => s.slotId === slotId);
    if (!slot) return;

    const def = getItemDef(slot.itemId);
    if (!def) return;

    const canAfford = ex.coins >= slot.price;
    const sold = slot.sold;
    // 装备允许重复购买（作为备用件，撤离失败会消耗一件）
    let actionLabel = '购买 (' + slot.price + ' 金)';
    if (def.category === 'equipment') {
        const stock = getEquipmentStock(slot.itemId);
        if (stock > 0) actionLabel = '再买一件 (' + slot.price + ' 金)';
    }

    let disabled = false;
    let disabledLabel: string | undefined;
    if (sold) { disabled = true; disabledLabel = '已售出'; }
    else if (!canAfford) { disabled = true; disabledLabel = '金不够'; }

    openDetailCard({
        source: 'shop',
        itemId: slot.itemId,
        condition: 'normal',
        shopPrice: slot.price,
        actions: [
            { id: 'close', label: '关闭', style: 'secondary' },
            {
                id: 'buy:' + slot.slotId,
                label: actionLabel,
                style: 'primary',
                disabled,
                disabledLabel,
            },
        ],
    });
}

/** 商店"购买"动作分发（input.ts 在详情卡按钮 hit-test 后调） */
export function performShopBuy(actionId: string): { ok: boolean; reason?: string } {
    if (!actionId.startsWith('buy:')) return { ok: false, reason: 'badAction' };
    const slotId = parseInt(actionId.slice(4), 10);
    if (isNaN(slotId)) return { ok: false, reason: 'badAction' };
    const r = performShopBuySlot(slotId);
    if (r.ok) {
        // 关闭详情卡
        closeDetailCard();
    }
    return r;
}

// =============================================
// "换一批"动作
// =============================================

export function performShopRerollAction(): { ok: boolean; cost: number; reason?: string } {
    return performShopReroll();
}

// 旧 API 残留兼容（input.ts 还可能调用 closeShop / openShop / 旧 performShopBuy）
// 上面已经全部覆盖
