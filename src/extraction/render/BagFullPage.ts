// 背包全屏页（水下打开）
//
// 布局：
// - 顶部：标题 "🎒 背包" + 容量 N/M + 关闭 X
// - 中部：4 列大格子网格（每格 56×56），格子带品相边框 + 物品图标 + 价值小标签
// - 选中态：单击格子 → 选中该格子（高亮金边）→ 下方信息条显示物品详情 + 操作按钮
// - 底部：信息条（选中物品时显示），含"查看详情"和"丢到水底"按钮
// - 屏幕边缘左侧 / 顶部有"丢弃区"虚线轮廓提示（拖拽时高亮）
//
// 拖拽：
// - 触摸格子开始按住计时；超过 200ms 进入拖拽态
// - 拖拽中：跟随手指绘制半透明物品图标
// - 松手判定：
//   1) 落到另一个格子 → 交换位置 swapBagItems
//   2) 落到丢弃区（屏幕左/上边缘 80px 内） → 丢到水底
//   3) 落到屏幕外其他空白 → 取消（回原位置）
// - 拖拽中长按计时由 update() 推进；本模块需要每帧 update + draw

import { ctx } from '../../render/Canvas';
import { CONFIG } from '../../core/config';
import { state } from '../../core/state';
import { getBagItems, swapBagItems, moveBagItemToIndex } from '../logic/Inventory';
import { getItemDef } from '../core/ExtractionRegistry';
import { ensureExtractionState } from '../core/ExtractionState';
import { computeItemPrice, getItemDisplayName } from '../logic/Economy';
import { discardBagItemAtPlayer } from '../logic/ItemPickup';
import { isBagFullPageOpen, closeBagFullPage } from './InventoryHUD';
import { openDetailCard } from './ItemDetailCard';
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

// 品相 → 主色调
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
// 拖拽与选中状态
// =============================================

interface DragState {
    /** 正在拖拽的物品唯一 id */
    itemUniqueId: number;
    /** 起始格子索引 */
    fromIndex: number;
    /** 当前手指位置 */
    cursorX: number;
    cursorY: number;
}

interface PageState {
    /** 选中的物品唯一 id（点击单击选中；显示底部信息条） */
    selectedId: number | null;
    /** 长按计时（ms 时间戳）—— 触摸落在格子上后开始 */
    pressItemId: number | null;
    pressStartTime: number;
    pressStartX: number;
    pressStartY: number;
    /** 拖拽态 */
    drag: DragState | null;
}

const _page: PageState = {
    selectedId: null,
    pressItemId: null,
    pressStartTime: 0,
    pressStartX: 0,
    pressStartY: 0,
    drag: null,
};

const LONG_PRESS_MS = 220;
const DRAG_MOVE_THRESHOLD = 8; // 移动 8px 才算开始拖拽（区分单击/拖拽）

// hit-test 矩形（input.ts 用）
let _closeBtnRect: { x: number; y: number; w: number; h: number } | null = null;
let _detailBtnRect: { x: number; y: number; w: number; h: number } | null = null;
let _discardBtnRect: { x: number; y: number; w: number; h: number } | null = null;
let _discardZoneRect: { x: number; y: number; w: number; h: number } | null = null;
const _slotHitTests: { index: number; x: number; y: number; w: number; h: number; itemUniqueId: number | null }[] = [];

export function getBagPageCloseRect() { return _closeBtnRect; }
export function getBagPageDetailBtnRect() { return _detailBtnRect; }
export function getBagPageDiscardBtnRect() { return _discardBtnRect; }
export function getBagPageDiscardZoneRect() { return _discardZoneRect; }
export function getBagPageSlotHitTests() { return _slotHitTests.slice(); }

// =============================================
// 触摸生命周期（由 input.ts 转发）
// =============================================

/** 触摸落下：可能开始单击/长按。返回 true 表示该触摸被本页消费 */
export function onBagPageTouchStart(tx: number, ty: number): boolean {
    if (!isBagFullPageOpen()) return false;

    // 关闭按钮
    if (_closeBtnRect && tx >= _closeBtnRect.x && tx <= _closeBtnRect.x + _closeBtnRect.w &&
        ty >= _closeBtnRect.y && ty <= _closeBtnRect.y + _closeBtnRect.h) {
        closeBagFullPage();
        _page.selectedId = null;
        return true;
    }

    // 信息条按钮（仅有选中物品时）
    if (_page.selectedId != null) {
        if (_detailBtnRect && tx >= _detailBtnRect.x && tx <= _detailBtnRect.x + _detailBtnRect.w &&
            ty >= _detailBtnRect.y && ty <= _detailBtnRect.y + _detailBtnRect.h) {
            openSelectedDetail();
            return true;
        }
        if (_discardBtnRect && tx >= _discardBtnRect.x && tx <= _discardBtnRect.x + _discardBtnRect.w &&
            ty >= _discardBtnRect.y && ty <= _discardBtnRect.y + _discardBtnRect.h) {
            discardSelected();
            return true;
        }
    }

    // 落在某格上：开始按压计时（区分单击 vs 长按拖拽）
    for (const sh of _slotHitTests) {
        if (sh.itemUniqueId == null) continue;
        if (tx >= sh.x && tx <= sh.x + sh.w && ty >= sh.y && ty <= sh.y + sh.h) {
            _page.pressItemId = sh.itemUniqueId;
            _page.pressStartTime = Date.now();
            _page.pressStartX = tx;
            _page.pressStartY = ty;
            return true;
        }
    }

    // 点击空白处：取消选中
    _page.selectedId = null;
    return true; // 全屏页拦截所有触摸
}

/** 触摸移动：可能进入拖拽态 */
export function onBagPageTouchMove(tx: number, ty: number): void {
    if (!isBagFullPageOpen()) return;

    if (_page.drag) {
        _page.drag.cursorX = tx;
        _page.drag.cursorY = ty;
        return;
    }

    // 还没进入拖拽：判断是否触发
    if (_page.pressItemId != null) {
        const dx = tx - _page.pressStartX;
        const dy = ty - _page.pressStartY;
        const elapsed = Date.now() - _page.pressStartTime;
        const moved = Math.hypot(dx, dy);
        // 长按 OR 移动距离够 → 进入拖拽
        if (elapsed >= LONG_PRESS_MS || moved >= DRAG_MOVE_THRESHOLD) {
            // 找原索引
            let fromIndex = -1;
            for (const sh of _slotHitTests) {
                if (sh.itemUniqueId === _page.pressItemId) { fromIndex = sh.index; break; }
            }
            if (fromIndex >= 0) {
                _page.drag = {
                    itemUniqueId: _page.pressItemId,
                    fromIndex,
                    cursorX: tx,
                    cursorY: ty,
                };
            }
        }
    }
}

/** 触摸抬起：单击 / 拖拽完成 */
export function onBagPageTouchEnd(tx: number, ty: number): void {
    if (!isBagFullPageOpen()) return;

    // === 拖拽完成 ===
    if (_page.drag) {
        const drag = _page.drag;
        _page.drag = null;
        _page.pressItemId = null;

        // 1) 落到丢弃区
        if (_discardZoneRect &&
            tx >= _discardZoneRect.x && tx <= _discardZoneRect.x + _discardZoneRect.w &&
            ty >= _discardZoneRect.y && ty <= _discardZoneRect.y + _discardZoneRect.h) {
            discardBagItemAtPlayer(drag.itemUniqueId);
            if (_page.selectedId === drag.itemUniqueId) _page.selectedId = null;
            return;
        }

        // 2) 落到另一个格子 → 交换 / 移动
        for (const sh of _slotHitTests) {
            if (tx >= sh.x && tx <= sh.x + sh.w && ty >= sh.y && ty <= sh.y + sh.h) {
                if (sh.itemUniqueId == null) {
                    // 落到空格 → 移动到该索引
                    moveBagItemToIndex(drag.itemUniqueId, sh.index);
                } else if (sh.itemUniqueId !== drag.itemUniqueId) {
                    // 落到另一个物品 → 交换
                    swapBagItems(drag.itemUniqueId, sh.itemUniqueId);
                }
                return;
            }
        }
        // 落到其他位置：什么都不做（自动回原位）
        return;
    }

    // === 单击（无拖拽）===
    if (_page.pressItemId != null) {
        const id = _page.pressItemId;
        _page.pressItemId = null;
        // 如果触摸位置仍在原格子内：选中该物品
        for (const sh of _slotHitTests) {
            if (sh.itemUniqueId === id &&
                tx >= sh.x && tx <= sh.x + sh.w && ty >= sh.y && ty <= sh.y + sh.h) {
                _page.selectedId = id;
                return;
            }
        }
    }
}

// =============================================
// 选中物品的操作
// =============================================

function openSelectedDetail(): void {
    if (_page.selectedId == null) return;
    const items = getBagItems();
    const it = items.find(b => b.id === _page.selectedId);
    if (!it) return;
    openDetailCard({
        source: 'bag',
        itemUniqueId: it.id,
        itemId: it.itemId,
        condition: it.condition,
        actions: [
            { id: 'close', label: '关闭', style: 'secondary' },
            { id: 'discard:' + it.id, label: '丢到水底 ↓', style: 'danger' },
        ],
    });
}

function discardSelected(): void {
    if (_page.selectedId == null) return;
    const id = _page.selectedId;
    discardBagItemAtPlayer(id);
    _page.selectedId = null;
}

// =============================================
// 渲染主入口
// =============================================

export function drawBagFullPage(): void {
    // 重置 hit-test
    _slotHitTests.length = 0;
    _closeBtnRect = null;
    _detailBtnRect = null;
    _discardBtnRect = null;
    _discardZoneRect = null;

    if (!isBagFullPageOpen()) return;

    const ex = ensureExtractionState();
    const cw = CONFIG.screenWidth;
    const ch = CONFIG.screenHeight;
    const items = getBagItems();
    const slotN = Math.max(1, ex.bag.maxSlots);

    ctx.save();

    // === 背景遮罩（让玩家仍隐约看到水下场景，但聚焦背包）===
    ctx.fillStyle = 'rgba(8, 14, 22, 0.86)';
    ctx.fillRect(0, 0, cw, ch);

    // === 顶部：关闭按钮（左）+ 标题（中）+ 容量（右，避开胶囊）===
    // 全部在 SAFE_TOP 之下，避开微信胶囊和摄像头
    const titleY = SAFE_TOP + 14;

    // 关闭按钮（左侧，圆形 X）
    {
        const r = 16;
        const cx = SAFE_LEFT + r;
        const cy = titleY;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220, 230, 240, 0.7)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 6); ctx.lineTo(cx + 6, cy + 6);
        ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx - 6, cy + 6);
        ctx.stroke();
        _closeBtnRect = { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
    }

    // 标题（居中到"可用区"中心：cw - SAFE_RIGHT 的中点）
    const usableW = cw - SAFE_RIGHT;
    const titleCx = usableW / 2;
    ctx.fillStyle = 'rgba(220, 230, 240, 0.95)';
    ctx.font = 'bold 20px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎒  背包', titleCx, titleY);

    // 容量（在标题正下方一行，居中）
    let capColor = 'rgba(180, 200, 220, 0.7)';
    if (items.length >= slotN) capColor = 'rgba(255, 200, 100, 0.95)';
    else if (items.length / slotN >= 0.75) capColor = 'rgba(220, 200, 130, 0.85)';
    ctx.fillStyle = capColor;
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(items.length + ' / ' + slotN, titleCx, titleY + 22);

    // 提示文字
    ctx.fillStyle = 'rgba(160, 180, 200, 0.55)';
    ctx.font = '11px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('单击查看 · 按住拖动 · 拖到顶部丢弃', titleCx, titleY + 42);

    // === 顶部丢弃区 ===
    const discardZoneH = 52;
    const discardZoneY = titleY + 60;
    const dragging = _page.drag != null;
    {
        const x = 24;
        const w = cw - 48;
        const y = discardZoneY;
        const h = discardZoneH;
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = dragging ? 'rgba(255, 130, 110, 0.95)' : 'rgba(200, 110, 100, 0.4)';
        ctx.lineWidth = dragging ? 2 : 1.4;
        ctx.fillStyle = dragging ? 'rgba(140, 50, 40, 0.35)' : 'rgba(80, 30, 25, 0.18)';
        ctx.beginPath();
        rrect(ctx, x, y, w, h, 8);
        ctx.fill();
        ctx.beginPath();
        rrect(ctx, x, y, w, h, 8);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = dragging ? 'rgba(255, 200, 190, 0.95)' : 'rgba(220, 160, 150, 0.7)';
        ctx.font = dragging ? 'bold 14px "PingFang SC", Arial' : '12px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dragging ? '↓ 松手丢到水底 ↓' : '丢到水底（拖到这里）', x + w / 2, y + h / 2);
        ctx.restore();
        _discardZoneRect = { x, y, w, h };
    }

    // === 网格区 ===
    const COLS = 4;
    const SLOT = 64;
    const SLOT_GAP = 10;
    const rows = Math.max(1, Math.ceil(slotN / COLS));
    const gridW = SLOT * COLS + SLOT_GAP * (COLS - 1);
    const gridStartX = (cw - gridW) / 2;
    // 网格起点在丢弃区下方 + 20
    const gridStartY = discardZoneY + discardZoneH + 28;

    for (let i = 0; i < slotN; i++) {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const x = gridStartX + c * (SLOT + SLOT_GAP);
        const y = gridStartY + r * (SLOT + SLOT_GAP);

        const it = i < items.length ? items[i] : null;
        const itemId = it ? it.id : null;
        const isDraggingThis = _page.drag && _page.drag.itemUniqueId === itemId;

        drawSlot(x, y, SLOT, it, _page.selectedId === itemId, !!isDraggingThis);

        _slotHitTests.push({
            index: i,
            x, y, w: SLOT, h: SLOT,
            itemUniqueId: itemId,
        });
    }

    // === 底部信息条（选中时显示）===
    if (_page.selectedId != null) {
        const it = items.find(b => b.id === _page.selectedId);
        if (it) {
            drawBottomInfoBar(it, cw, ch);
        } else {
            _page.selectedId = null;
        }
    }

    // === 拖拽中：浮动图标跟手指 ===
    if (_page.drag) {
        const it = items.find(b => b.id === _page.drag!.itemUniqueId);
        if (it) drawDragGhost(_page.drag.cursorX, _page.drag.cursorY, it);
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

// =============================================
// 单格绘制
// =============================================

function drawSlot(
    x: number, y: number, size: number,
    it: { id: number; itemId: string; condition: string; slots: number } | null,
    selected: boolean, dragging: boolean,
): void {
    // 拖拽中：原位置画虚框
    if (dragging) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(180, 200, 220, 0.5)';
        ctx.lineWidth = 1.4;
        ctx.fillStyle = 'rgba(30, 40, 55, 0.4)';
        ctx.beginPath();
        rrect(ctx, x, y, size, size, 8);
        ctx.fill();
        ctx.beginPath();
        rrect(ctx, x, y, size, size, 8);
        ctx.stroke();
        ctx.restore();
        return;
    }

    // 格子底
    ctx.fillStyle = it ? 'rgba(40, 52, 70, 0.85)' : 'rgba(28, 36, 48, 0.65)';
    ctx.beginPath();
    rrect(ctx, x, y, size, size, 8);
    ctx.fill();

    // 边框（选中态金边 + 品相边）
    if (selected) {
        ctx.strokeStyle = 'rgba(255, 220, 130, 0.95)';
        ctx.lineWidth = 2.2;
    } else if (it) {
        ctx.strokeStyle = conditionColor(it.condition);
        ctx.lineWidth = 1.6;
    } else {
        ctx.strokeStyle = 'rgba(140, 160, 185, 0.25)';
        ctx.lineWidth = 1;
    }
    ctx.beginPath();
    rrect(ctx, x, y, size, size, 8);
    ctx.stroke();

    if (!it) return;

    const def = getItemDef(it.itemId);
    if (!def) return;

    // 内圆 + 首字
    const cx = x + size / 2;
    const cy = y + size / 2 - 4;
    ctx.fillStyle = 'rgba(190, 155, 80, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 18px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name.charAt(0), cx, cy + 1);

    // 价格小标签（底部居中）
    const price = computeItemPrice(def.id, it.condition);
    ctx.fillStyle = 'rgba(255, 220, 140, 0.92)';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(price + 'g', cx, y + size - 4);
}

// =============================================
// 拖拽幽灵
// =============================================

function drawDragGhost(
    cx: number, cy: number,
    it: { itemId: string; condition: string },
): void {
    const def = getItemDef(it.itemId);
    if (!def) return;

    const size = 64;
    ctx.save();
    ctx.globalAlpha = 0.85;

    // 影子
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + size / 2 + 6, size * 0.4, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 主体（与格子一致的样式 + 略放大）
    const x = cx - size / 2;
    const y = cy - size / 2;
    ctx.fillStyle = 'rgba(50, 65, 88, 0.95)';
    ctx.beginPath();
    rrect(ctx, x, y, size, size, 8);
    ctx.fill();
    ctx.strokeStyle = conditionColor(it.condition);
    ctx.lineWidth = 2;
    ctx.beginPath();
    rrect(ctx, x, y, size, size, 8);
    ctx.stroke();

    ctx.fillStyle = 'rgba(190, 155, 80, 0.95)';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 18px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name.charAt(0), cx, cy + 1);

    ctx.restore();
}

// =============================================
// 底部信息条
// =============================================

function drawBottomInfoBar(
    it: { id: number; itemId: string; condition: string; slots: number },
    cw: number, ch: number,
): void {
    const def = getItemDef(it.itemId);
    if (!def) return;

    const barH = 84;
    const barX = 14;
    const barW = cw - 28;
    const barY = ch - barH - 14;

    // 背景
    const grad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    grad.addColorStop(0, 'rgba(22, 32, 46, 0.95)');
    grad.addColorStop(1, 'rgba(14, 22, 34, 0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    rrect(ctx, barX, barY, barW, barH, 10);
    ctx.fill();
    ctx.strokeStyle = conditionColor(it.condition);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, barX, barY, barW, barH, 10);
    ctx.stroke();

    // 左：物品图标
    const iconSize = 56;
    const iconX = barX + 14;
    const iconY = barY + (barH - iconSize) / 2;
    ctx.fillStyle = 'rgba(45, 60, 80, 0.85)';
    ctx.beginPath();
    rrect(ctx, iconX, iconY, iconSize, iconSize, 8);
    ctx.fill();
    ctx.strokeStyle = conditionColor(it.condition);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    rrect(ctx, iconX, iconY, iconSize, iconSize, 8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(190, 155, 80, 0.9)';
    ctx.beginPath();
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 18px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name.charAt(0), iconX + iconSize / 2, iconY + iconSize / 2 + 1);

    // 中：信息文本
    const textX = iconX + iconSize + 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(240, 245, 250, 0.95)';
    ctx.font = 'bold 14px "PingFang SC", Arial';
    ctx.fillText(getItemDisplayName(def.id, it.condition), textX, barY + 14);
    ctx.fillStyle = 'rgba(170, 190, 210, 0.7)';
    ctx.font = '11px "PingFang SC", Arial';
    ctx.fillText('占用 ' + (def.slots > 0 ? def.slots + ' 格' : '—'), textX, barY + 36);
    ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
    ctx.font = 'bold 13px "PingFang SC", Arial';
    ctx.fillText('估值 ' + computeItemPrice(def.id, it.condition) + ' 金', textX, barY + 54);

    // 右：两个按钮
    const btnW = 92;
    const btnH = 32;
    const btnGap = 8;
    const btnY = barY + (barH - btnH) / 2;
    const detailX = barX + barW - btnW * 2 - btnGap - 14;
    const discardX = barX + barW - btnW - 14;

    // "查看详情" 次级按钮
    ctx.fillStyle = 'rgba(60, 80, 110, 0.9)';
    ctx.beginPath();
    rrect(ctx, detailX, btnY, btnW, btnH, btnH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 200, 240, 0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    rrect(ctx, detailX, btnY, btnW, btnH, btnH / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220, 235, 250, 0.95)';
    ctx.font = 'bold 12px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('查看详情', detailX + btnW / 2, btnY + btnH / 2);
    _detailBtnRect = { x: detailX, y: btnY, w: btnW, h: btnH };

    // "丢到水底" 危险按钮
    ctx.fillStyle = 'rgba(150, 60, 50, 0.92)';
    ctx.beginPath();
    rrect(ctx, discardX, btnY, btnW, btnH, btnH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 160, 140, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    rrect(ctx, discardX, btnY, btnW, btnH, btnH / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 220, 210, 0.98)';
    ctx.font = 'bold 12px "PingFang SC", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('丢到水底 ↓', discardX + btnW / 2, btnY + btnH / 2);
    _discardBtnRect = { x: discardX, y: btnY, w: btnW, h: btnH };
}
