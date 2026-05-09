// 商店全屏页（阶段 1 最简版）
//
// 阶段 1 简化：
// - 仅显示永久装备货架的 3 个槽位（8/12/16 格背包）
// - 不刷新货架，只展示固定 3 件
// - 已购买的不再显示"购买"按钮（变灰显示"已拥有"）
// - 没有"换一批""特价架""消耗品架"等高级机制（阶段 2 加）
//
// 入口：岸上 shoreShopOpen=true 时全屏显示
// 详见 design/extraction/02-shop-randomization.md

import { CONFIG } from '../../core/config';
import { state } from '../../core/state';
import { ctx } from '../../render/Canvas';
import { getCoins, spendCoins } from '../logic/Economy';
import { getItemDef } from '../core/ExtractionRegistry';
import { ensureExtractionState } from '../core/ExtractionState';
import { equipPermanent } from '../logic/Loadout';
import { setBagMaxSlots } from '../logic/Inventory';

// 阶段 1：固定货架（未来由 shop-pool.json 驱动）
const SHELF_ITEMS = ['bag8', 'bag12', 'bag16'];

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

// =============================================
// 入口按钮（岸上）
// =============================================

let _entryBtnRect: { x: number; y: number; w: number; h: number } | null = null;
let _closeBtnRect: { x: number; y: number; w: number; h: number } | null = null;
const _slotBuyBtnRects: { [itemId: string]: { x: number; y: number; w: number; h: number } } = {};

export function getShopEntryBtnRect(): { x: number; y: number; w: number; h: number } | null {
    return _entryBtnRect;
}
export function getShopCloseBtnRect(): { x: number; y: number; w: number; h: number } | null {
    return _closeBtnRect;
}
export function getShopBuyBtnRect(itemId: string): { x: number; y: number; w: number; h: number } | null {
    return _slotBuyBtnRects[itemId] || null;
}

/** 检测当前是否打开了商店 */
export function isShopOpen(): boolean {
    const ex = ensureExtractionState();
    return !!(ex as any).shopOpen;
}

/** 打开商店 */
export function openShop(): void {
    const ex = ensureExtractionState();
    (ex as any).shopOpen = true;
}

/** 关闭商店 */
export function closeShop(): void {
    const ex = ensureExtractionState();
    (ex as any).shopOpen = false;
}

// =============================================
// 入口按钮渲染（在 shore 阶段右上角，避开微信胶囊）
// =============================================

export function drawShopEntryBtn(cw: number, ch: number, time: number): void {
    // 仅在 mazeRescue shore / resolved_idle + 已显示警情通报后显示
    const maze: any = state.mazeRescue;
    if (!maze) return;
    if (maze.phase !== 'shore' && maze.phase !== 'resolved_idle') return;
    if (!maze.briefingShown) return;
    if (maze.shoreMapOpen) return;
    if (maze.codexOpen) return;

    // 位置：左上角偏下，避开图鉴入口（图鉴在右上）和金币 HUD（顶部中央）
    const btnW = 90;
    const btnH = 32;
    const btnX = 14;
    const btnY = 64;

    ctx.save();
    // 背景（深棕底）
    ctx.fillStyle = 'rgba(60, 38, 22, 0.85)';
    ctx.beginPath();
    rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
    ctx.fill();

    // 描边（金色）
    ctx.strokeStyle = 'rgba(220, 180, 80, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
    ctx.stroke();

    // 小铺图标 + 文字
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
// 商店全屏页渲染
// =============================================

export function drawShop(cw: number, ch: number, time: number): void {
    if (!isShopOpen()) {
        _closeBtnRect = null;
        for (const k in _slotBuyBtnRects) delete _slotBuyBtnRects[k];
        return;
    }

    ctx.save();

    // 背景：深棕色羊皮纸感
    ctx.fillStyle = 'rgba(35, 25, 18, 0.95)';
    ctx.fillRect(0, 0, cw, ch);

    // 顶部：标题 + 金币 + 返回按钮
    const titleY = 70;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 220, 150, 0.95)';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('雅各布井杂货铺', cw / 2, titleY);

    ctx.font = '14px Georgia, serif';
    ctx.fillStyle = 'rgba(220, 200, 160, 0.7)';
    ctx.fillText('—— 老板：「装备的事，找我就对了。」 ——', cw / 2, titleY + 28);

    // 顶部金币显示
    const coins = getCoins();
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
    ctx.fillText('💰 ' + coins + ' 金', cw / 2, titleY + 60);

    // 返回按钮（左上角）
    const closeBtnW = 64;
    const closeBtnH = 28;
    const closeBtnX = 14;
    const closeBtnY = 14;
    ctx.fillStyle = 'rgba(80, 60, 40, 0.85)';
    ctx.beginPath();
    rrect(ctx, closeBtnX, closeBtnY, closeBtnW, closeBtnH, closeBtnH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 150, 100, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    rrect(ctx, closeBtnX, closeBtnY, closeBtnW, closeBtnH, closeBtnH / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220, 200, 160, 0.95)';
    ctx.font = 'bold 13px Arial';
    ctx.fillText('◀ 返回', closeBtnX + closeBtnW / 2, closeBtnY + closeBtnH / 2 + 1);
    _closeBtnRect = { x: closeBtnX, y: closeBtnY, w: closeBtnW, h: closeBtnH };

    // 货架区：3 列，每件物品一个卡片
    const cardsTopY = titleY + 100;
    const cardW = 100;
    const cardH = 160;
    const cardGap = 12;
    const totalW = cardW * SHELF_ITEMS.length + cardGap * (SHELF_ITEMS.length - 1);
    const startX = (cw - totalW) / 2;

    const ex = ensureExtractionState();
    const currentBagMax = ex.bag.maxSlots;

    for (let i = 0; i < SHELF_ITEMS.length; i++) {
        const itemId = SHELF_ITEMS[i];
        const def = getItemDef(itemId);
        if (!def) continue;
        const x = startX + i * (cardW + cardGap);
        const y = cardsTopY;

        // 卡片底（暗棕色）
        ctx.fillStyle = 'rgba(50, 35, 22, 0.95)';
        ctx.beginPath();
        rrect(ctx, x, y, cardW, cardH, 8);
        ctx.fill();

        // 描边（金色）
        ctx.strokeStyle = 'rgba(180, 140, 80, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        rrect(ctx, x, y, cardW, cardH, 8);
        ctx.stroke();

        // 图标占位（背包剪影）
        const iconCx = x + cardW / 2;
        const iconCy = y + 38;
        ctx.fillStyle = 'rgba(180, 140, 80, 0.6)';
        ctx.beginPath();
        ctx.arc(iconCx, iconCy, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(70, 50, 30, 0.85)';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const slots = (def as any).effects?.inventorySlots || 0;
        ctx.fillText(String(slots), iconCx, iconCy + 1);

        // 名称
        ctx.fillStyle = 'rgba(220, 200, 160, 0.95)';
        ctx.font = 'bold 13px Arial';
        ctx.fillText(def.name, x + cardW / 2, y + 78);

        // 描述
        ctx.fillStyle = 'rgba(180, 160, 130, 0.7)';
        ctx.font = '10px Arial';
        wrapText(def.desc, x + cardW / 2, y + 96, cardW - 16, 12);

        // 状态判断：已拥有 vs 可购买
        const owned = currentBagMax >= slots;
        const canAfford = coins >= def.baseValue;

        const btnY = y + cardH - 32;
        const btnX_ = x + 8;
        const btnW = cardW - 16;
        const btnH = 24;

        if (owned) {
            // 已拥有
            ctx.fillStyle = 'rgba(60, 100, 70, 0.6)';
            ctx.beginPath();
            rrect(ctx, btnX_, btnY, btnW, btnH, btnH / 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(180, 220, 180, 0.85)';
            ctx.font = 'bold 11px Arial';
            ctx.fillText('已拥有 ✓', btnX_ + btnW / 2, btnY + btnH / 2 + 1);
        } else if (canAfford) {
            // 可购买
            const grad = ctx.createLinearGradient(btnX_, btnY, btnX_ + btnW, btnY);
            grad.addColorStop(0, 'rgba(140, 100, 30, 0.85)');
            grad.addColorStop(1, 'rgba(180, 130, 40, 0.85)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            rrect(ctx, btnX_, btnY, btnW, btnH, btnH / 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 230, 150, 0.95)';
            ctx.font = 'bold 11px Arial';
            ctx.fillText('💰 ' + def.baseValue + ' 购买', btnX_ + btnW / 2, btnY + btnH / 2 + 1);
            _slotBuyBtnRects[itemId] = { x: btnX_, y: btnY, w: btnW, h: btnH };
        } else {
            // 钱不够
            ctx.fillStyle = 'rgba(60, 50, 40, 0.6)';
            ctx.beginPath();
            rrect(ctx, btnX_, btnY, btnW, btnH, btnH / 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(160, 140, 110, 0.7)';
            ctx.font = 'bold 11px Arial';
            ctx.fillText('💰 ' + def.baseValue + ' 不足', btnX_ + btnW / 2, btnY + btnH / 2 + 1);
        }
    }

    // 底部老板话术
    ctx.fillStyle = 'rgba(180, 160, 130, 0.7)';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let banter = '';
    if (coins < 50) banter = '"年轻人也是要先攒钱的。"';
    else if (currentBagMax >= 16) banter = '"看你这装备，是个老手了。"';
    else if (currentBagMax >= 8) banter = '"这背包不错，再升级也不亏。"';
    else banter = '"想多带点东西回来？买个大背包吧。"';
    ctx.fillText(banter, cw / 2, ch - 40);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

/** 简化的文字换行（阶段 1 用） */
function wrapText(text: string, cx: number, y: number, maxW: number, lineH: number): void {
    const chars = text.split('');
    const lines: string[] = [];
    let line = '';
    for (const ch of chars) {
        const testW = ctx.measureText(line + ch).width;
        if (testW > maxW && line.length > 0) {
            lines.push(line);
            line = ch;
        } else {
            line += ch;
        }
    }
    if (line) lines.push(line);
    // 最多 2 行
    for (let i = 0; i < Math.min(lines.length, 2); i++) {
        ctx.fillText(lines[i], cx, y + i * lineH);
    }
}

// =============================================
// 购买动作（由 input.ts 在按钮 hit-test 后调用）
// =============================================

/** 尝试购买；返回 true 表示成功 */
export function performShopBuy(itemId: string): boolean {
    const def = getItemDef(itemId);
    if (!def) return false;
    if (!spendCoins(def.baseValue)) return false;

    // 装备永久效果（阶段 1 仅支持背包）
    if ((def as any).effects?.inventorySlots != null) {
        setBagMaxSlots((def as any).effects.inventorySlots);
    } else {
        equipPermanent(itemId);
    }
    return true;
}
