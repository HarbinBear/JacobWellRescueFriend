// 商店全屏页（黄金矿工式有限随机）
//
// 货架结构（自上而下）：
//   消耗品架 [氧气瓶 / 电池 / 绳索]    3 槽
//   装备架   [背包 / 脚蹼]            2 槽
//   特价架   [随机一件 0.7×]          1 槽
//
// 交互：
// - 点击商品卡片 → 打开物品详情卡（含"购买"按钮）
// - "换一批"按钮（费用递增）刷新所有槽
// - 已售/已拥有的卡片 灰显
//
// 详见 design/extraction/02-shop-randomization.md

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
    isEquipmentOwned,
    getConsumableCount,
} from '../logic/Shop';
import {
    openDetailCard,
    closeDetailCard,
    isDetailCardOpen,
} from './ItemDetailCard';
import { SAFE_TOP, SAFE_LEFT, SAFE_RIGHT } from './UISafeArea';

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

function shelfTitle(shelf: string): string {
    switch (shelf) {
        case 'consumable': return '消耗品';
        case 'emergency':  return '应急装备';
        case 'equipment':  return '永久装备';
        case 'special':    return '今日特价';
        default:           return '货架';
    }
}

function shelfTint(shelf: string): string {
    switch (shelf) {
        case 'consumable': return 'rgba(180, 200, 230, 0.85)';
        case 'emergency':  return 'rgba(255, 180, 130, 0.85)';
        case 'equipment':  return 'rgba(180, 220, 180, 0.85)';
        case 'special':    return 'rgba(255, 220, 130, 0.95)';
        default:           return 'rgba(200, 200, 200, 0.8)';
    }
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

    // 位置：贴左 SAFE_LEFT，顶部 SAFE_TOP（避开胶囊和摄像头）
    // 与右上"图鉴"按钮形成左右对称
    const btnW = 90;
    const btnH = 32;
    const btnX = SAFE_LEFT;
    const btnY = SAFE_TOP;

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
    ctx.fillText('🏪 杂货铺', btnX + btnW / 2, btnY + btnH / 2 + 1);
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

    // === 背景：深棕羊皮纸 ===
    ctx.fillStyle = 'rgba(35, 25, 18, 0.97)';
    ctx.fillRect(0, 0, cw, ch);
    // 木纹噪点（用很浅的 alpha 横线模拟）
    ctx.strokeStyle = 'rgba(80, 50, 30, 0.15)';
    ctx.lineWidth = 1;
    for (let y = 0; y < ch; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y + (Math.sin(y * 0.3) * 1.5));
        ctx.lineTo(cw, y + (Math.cos(y * 0.4) * 1.5));
        ctx.stroke();
    }

    // === 顶部布局（全部在 SAFE_TOP 之下，避开胶囊和摄像头）===
    // 第一行（SAFE_TOP）：左[返回] - 中[标题] - 右[金币]（避开胶囊：金币要在 cw - SAFE_RIGHT 内）
    // 第二行（SAFE_TOP + 36）：右[换一批]
    // 标题副标题（SAFE_TOP + 42）：居中显示老板话术

    // 关闭按钮（贴左）
    {
        const btnW = 64;
        const btnH = 28;
        const btnX = SAFE_LEFT;
        const btnY = SAFE_TOP + 2;
        ctx.fillStyle = 'rgba(80, 60, 40, 0.85)';
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180, 150, 100, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(220, 200, 160, 0.95)';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('◀ 返回', btnX + btnW / 2, btnY + btnH / 2 + 1);
        _closeBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    }

    // 标题（居中，但要避开右侧胶囊；位置考虑胶囊宽度后微调到画面真实中心偏左）
    const usableW = cw - SAFE_RIGHT;
    const titleCx = usableW / 2;
    const titleY = SAFE_TOP + 16;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 220, 150, 0.95)';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText('雅各布井杂货铺', titleCx, titleY);

    // 副标题（老板话术）
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillStyle = 'rgba(220, 200, 160, 0.6)';
    ctx.fillText('"' + bossLine() + '"', titleCx, titleY + 22);

    // 金币显示（左侧，紧贴关闭按钮右边）
    const coins = getCoins();
    {
        const coinX = SAFE_LEFT + 64 + 10;
        const coinY = SAFE_TOP + 2 + 28 / 2;
        ctx.font = 'bold 15px Arial';
        ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('💰 ' + coins, coinX, coinY);
    }

    // === "换一批" 按钮（贴右，避开胶囊）===
    {
        const cost = getRerollCost();
        const btnW = 96;
        const btnH = 28;
        const btnX = cw - SAFE_RIGHT - btnW;
        const btnY = SAFE_TOP + 2;

        ctx.fillStyle = coins >= cost ? 'rgba(50, 80, 100, 0.9)' : 'rgba(50, 60, 70, 0.6)';
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.fill();
        ctx.strokeStyle = coins >= cost ? 'rgba(140, 200, 240, 0.7)' : 'rgba(120, 130, 150, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.stroke();

        ctx.fillStyle = coins >= cost ? 'rgba(180, 220, 250, 0.95)' : 'rgba(160, 170, 180, 0.6)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = cost === 0 ? '🔄 换一批 · 免费' : '🔄 换一批 · ' + cost + ' 金';
        ctx.fillText(label, btnX + btnW / 2, btnY + btnH / 2 + 1);
        _rerollBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    }

    // === 货架（按 shelf 分组） ===
    for (const k in _slotCardRects) delete _slotCardRects[k];

    const slots = ex.shop ? ex.shop.slots : [];
    const grouped: { [shelf: string]: ShopSlot[] } = {};
    for (const s of slots) {
        if (!grouped[s.shelf]) grouped[s.shelf] = [];
        grouped[s.shelf].push(s);
    }

    const shelfOrder = ['consumable', 'equipment', 'special', 'emergency'];
    // 货架起点：副标题（titleY + 22）下方再加 28
    let shelfY = titleY + 22 + 28;

    for (const shelfId of shelfOrder) {
        const list = grouped[shelfId];
        if (!list || list.length === 0) continue;

        // 货架标题
        ctx.fillStyle = shelfTint(shelfId);
        ctx.font = 'bold 14px Georgia, serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('— ' + shelfTitle(shelfId) + ' —', 20, shelfY);
        shelfY += 22;

        // 货架卡片
        const cardW = 96;
        const cardH = 124;
        const cardGap = 10;
        const totalW = cardW * list.length + cardGap * (list.length - 1);
        const startX = (cw - totalW) / 2;

        for (let i = 0; i < list.length; i++) {
            const slot = list[i];
            const x = startX + i * (cardW + cardGap);
            const y = shelfY;
            drawSlotCard(slot, x, y, cardW, cardH, time);
            _slotCardRects[slot.slotId] = { x, y, w: cardW, h: cardH };
        }

        shelfY += cardH + 18;
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

// =============================================
// 单卡片渲染
// =============================================

function drawSlotCard(slot: ShopSlot, x: number, y: number, w: number, h: number, time: number): void {
    const def = getItemDef(slot.itemId);
    if (!def) return;

    const ex = ensureExtractionState();
    const owned = def.category === 'equipment' && isEquipmentOwned(slot.itemId);
    const stockCount = (def.category === 'consumable' || def.category === 'emergency')
        ? getConsumableCount(slot.itemId)
        : 0;
    const sold = slot.sold;
    const canAfford = ex.coins >= slot.price;

    // 卡片底
    ctx.fillStyle = sold || owned ? 'rgba(38, 28, 22, 0.85)' : 'rgba(50, 35, 22, 0.95)';
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = sold || owned
        ? 'rgba(120, 100, 80, 0.4)'
        : (slot.shelf === 'special' ? 'rgba(255, 200, 80, 0.85)' : 'rgba(180, 140, 80, 0.55)');
    ctx.lineWidth = slot.shelf === 'special' ? 1.6 : 1.2;
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 8);
    ctx.stroke();

    // 特价标签
    if (slot.shelf === 'special' && !sold) {
        ctx.fillStyle = 'rgba(255, 200, 80, 0.95)';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('70%', x + w - 6, y + 5);
    }

    // 库存徽章（消耗品已有库存时）
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

    // 图标圆 + 首字
    const iconCx = x + w / 2;
    const iconCy = y + 36;
    ctx.fillStyle = sold || owned ? 'rgba(100, 80, 60, 0.5)' : 'rgba(180, 140, 80, 0.65)';
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = sold || owned ? 'rgba(120, 100, 80, 0.4)' : 'rgba(220, 180, 100, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = sold || owned ? 'rgba(140, 130, 120, 0.7)' : 'rgba(255, 240, 200, 0.95)';
    ctx.font = 'bold 18px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name.charAt(0), iconCx, iconCy + 1);

    // 名称
    ctx.fillStyle = sold || owned ? 'rgba(160, 140, 120, 0.7)' : 'rgba(220, 200, 160, 0.95)';
    ctx.font = 'bold 11px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(def.name, x + w / 2, y + 66);

    // 价格 / 状态条
    const tagY = y + h - 24;
    if (sold) {
        ctx.fillStyle = 'rgba(60, 65, 75, 0.7)';
        ctx.beginPath();
        rrect(ctx, x + 8, tagY, w - 16, 18, 9);
        ctx.fill();
        ctx.fillStyle = 'rgba(160, 160, 170, 0.85)';
        ctx.font = 'italic 10px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('已售出', x + w / 2, tagY + 9);
    } else if (owned) {
        ctx.fillStyle = 'rgba(40, 70, 50, 0.7)';
        ctx.beginPath();
        rrect(ctx, x + 8, tagY, w - 16, 18, 9);
        ctx.fill();
        ctx.fillStyle = 'rgba(160, 220, 180, 0.9)';
        ctx.font = 'bold 10px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('已拥有 ✓', x + w / 2, tagY + 9);
    } else {
        const grad = ctx.createLinearGradient(x, tagY, x + w, tagY);
        if (canAfford) {
            grad.addColorStop(0, 'rgba(140, 100, 30, 0.9)');
            grad.addColorStop(1, 'rgba(190, 140, 50, 0.9)');
        } else {
            grad.addColorStop(0, 'rgba(70, 60, 50, 0.7)');
            grad.addColorStop(1, 'rgba(85, 70, 55, 0.7)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        rrect(ctx, x + 8, tagY, w - 16, 18, 9);
        ctx.fill();
        ctx.fillStyle = canAfford ? 'rgba(255, 230, 150, 0.95)' : 'rgba(180, 170, 160, 0.7)';
        ctx.font = 'bold 11px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💰 ' + slot.price, x + w / 2, tagY + 9);
    }
}

// =============================================
// 老板话术
// =============================================

function bossLine(): string {
    const ex = ensureExtractionState();
    if (ex.coins < 50) return '年轻人，先攒攒钱再说。';
    if (ex.bag.maxSlots >= 16) return '看这背包，是个老手了。';
    if (ex.bag.maxSlots >= 8) return '这装备不错，再升级也不亏。';
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

    const owned = def.category === 'equipment' && isEquipmentOwned(slot.itemId);
    const canAfford = ex.coins >= slot.price;
    const sold = slot.sold;

    let actionLabel = '购买 (' + slot.price + ' 金)';
    let disabled = false;
    let disabledLabel: string | undefined;
    if (sold) { disabled = true; disabledLabel = '已售出'; }
    else if (owned) { disabled = true; disabledLabel = '已拥有'; }
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
