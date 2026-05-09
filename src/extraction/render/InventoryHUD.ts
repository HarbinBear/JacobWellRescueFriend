// 下潜中的背包 HUD（右下角网格）
//
// 仅在迷宫 play 阶段显示
// 自适应布局：固定 4 列，行数 = ceil(slotN / 4)
//   - 4 格 → 1 行 × 4 列
//   - 8 格 → 2 行 × 4 列
//   - 12 格 → 3 行 × 4 列
//   - 16 格 → 4 行 × 4 列
// 这样无论背包大小，整体宽度恒定，右下角贴边稳定，不会溢出屏幕
//
// 交互：点击已占用的格子 → 打开物品详情卡（含丢弃按钮）

import { CONFIG } from '../../core/config';
import { state } from '../../core/state';
import { ctx } from '../../render/Canvas';
import { getBagItems, getBagOccupiedSlots } from '../logic/Inventory';
import { getItemDef } from '../core/ExtractionRegistry';
import { ensureExtractionState } from '../core/ExtractionState';
import { openDetailCard } from './ItemDetailCard';

// =============================================
// 业务：打开某件背包物品的详情卡
// =============================================

/** 玩家点了背包某个格子：打开详情卡，含"丢弃"按钮 */
export function openBagItemDetail(itemUniqueId: number): void {
    const items = getBagItems();
    const it = items.find(b => b.id === itemUniqueId);
    if (!it) return;
    const def = getItemDef(it.itemId);
    if (!def) return;

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

// 品相 → 边框色（视觉差异化稀有度）
function conditionColor(condition: string): string {
    switch (condition) {
        case 'perfect':    return 'rgba(255, 220, 130, 0.95)';   // 金
        case 'inscribed':  return 'rgba(180, 130, 255, 0.95)';   // 紫
        case 'pristine':   return 'rgba(140, 220, 255, 0.95)';   // 浅蓝
        case 'intact':
        case 'normal':     return 'rgba(180, 200, 220, 0.85)';   // 银白
        case 'cracked':
        case 'rusted':
        case 'damaged':    return 'rgba(160, 130, 100, 0.7)';    // 锈褐
        default:           return 'rgba(180, 200, 220, 0.7)';
    }
}

export function isInventoryHUDVisible(): boolean {
    if (state.screen !== 'mazeRescue') return false;
    const maze: any = state.mazeRescue;
    if (!maze) return false;
    return maze.phase === 'play';
}

const COLS = 4;            // 固定 4 列
const SLOT_SIZE = 32;      // 单格尺寸
const SLOT_GAP = 4;        // 格间距
const PAD_X = 8;           // 容器内边距
const PAD_Y = 6;
const TITLE_H = 12;        // 顶部标题区高度（"背包 N/M"）
const RIGHT_MARGIN = 14;   // 距右边距
const BOTTOM_MARGIN = 14;  // 距下边距

// 格子的 hit-test 矩形（itemUniqueId -> rect）
// 仅记录"已占用"的格子（空格不可点）
const _slotRects: { [bagItemId: number]: { x: number; y: number; w: number; h: number } } = {};

/** 取背包格子矩形（input.ts hit-test 用），返回所有已占用格子的矩形列表 */
export function getInventorySlotHitTests(): { itemUniqueId: number; x: number; y: number; w: number; h: number }[] {
    const out: { itemUniqueId: number; x: number; y: number; w: number; h: number }[] = [];
    for (const k in _slotRects) {
        if (Object.prototype.hasOwnProperty.call(_slotRects, k)) {
            const r = _slotRects[k];
            out.push({ itemUniqueId: parseInt(k, 10), x: r.x, y: r.y, w: r.w, h: r.h });
        }
    }
    return out;
}

export function drawInventoryHUD(): void {
    if (!isInventoryHUDVisible()) return;

    const ex = ensureExtractionState();
    const cw = CONFIG.screenWidth;
    const ch = CONFIG.screenHeight;

    const slotN = Math.max(1, ex.bag.maxSlots);
    const items = getBagItems();
    const used = getBagOccupiedSlots();

    // 自适应行数（按 4 列分行）
    const rows = Math.max(1, Math.ceil(slotN / COLS));
    const gridW = SLOT_SIZE * COLS + SLOT_GAP * (COLS - 1);
    const gridH = SLOT_SIZE * rows + SLOT_GAP * (rows - 1);

    // 容器外框
    const containerW = gridW + PAD_X * 2;
    const containerH = gridH + PAD_Y * 2 + TITLE_H + 4;
    const containerX = cw - containerW - RIGHT_MARGIN;
    const containerY = ch - containerH - BOTTOM_MARGIN;

    ctx.save();

    // === 容器背景（深玻璃质感） ===
    ctx.fillStyle = 'rgba(15, 22, 32, 0.72)';
    ctx.beginPath();
    rrect(ctx, containerX, containerY, containerW, containerH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 150, 180, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, containerX, containerY, containerW, containerH, 8);
    ctx.stroke();

    // === 顶部标题：背包 used/total ===
    ctx.fillStyle = 'rgba(200, 220, 240, 0.78)';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('背包', containerX + PAD_X, containerY + 4);
    ctx.textAlign = 'right';
    // 容量颜色：满了变金色提示
    if (used >= slotN) {
        ctx.fillStyle = 'rgba(255, 200, 100, 0.95)';
    } else if (used >= slotN * 0.75) {
        ctx.fillStyle = 'rgba(255, 230, 150, 0.85)';
    } else {
        ctx.fillStyle = 'rgba(180, 200, 220, 0.7)';
    }
    ctx.fillText(used + ' / ' + slotN, containerX + containerW - PAD_X, containerY + 4);

    // === 网格起点 ===
    const gridX = containerX + PAD_X;
    const gridY = containerY + PAD_Y + TITLE_H + 4;

    // 阶段 1：所有物品按 1 格画（slots 多格的合并表现留到阶段 2）
    // 清空旧 hit-test
    for (const k in _slotRects) delete _slotRects[k];

    let slotIdx = 0;
    for (let i = 0; i < slotN; i++) {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const x = gridX + c * (SLOT_SIZE + SLOT_GAP);
        const y = gridY + r * (SLOT_SIZE + SLOT_GAP);

        const filled = slotIdx < items.length;

        // 格子底（已占用色更亮）
        ctx.fillStyle = filled
            ? 'rgba(50, 65, 85, 0.75)'
            : 'rgba(30, 40, 55, 0.55)';
        ctx.beginPath();
        rrect(ctx, x, y, SLOT_SIZE, SLOT_SIZE, 4);
        ctx.fill();

        // 边框
        if (filled) {
            const it = items[slotIdx];
            ctx.strokeStyle = conditionColor(it.condition);
            ctx.lineWidth = 1.4;
        } else {
            ctx.strokeStyle = 'rgba(140, 160, 185, 0.22)';
            ctx.lineWidth = 1;
        }
        ctx.beginPath();
        rrect(ctx, x, y, SLOT_SIZE, SLOT_SIZE, 4);
        ctx.stroke();

        // 物品图标占位（首字 + 圆形底）
        if (filled) {
            const it = items[slotIdx];
            const def = getItemDef(it.itemId);
            if (def) {
                const cx = x + SLOT_SIZE / 2;
                const cy = y + SLOT_SIZE / 2;
                // 内圆：暖金色
                ctx.fillStyle = 'rgba(190, 155, 80, 0.85)';
                ctx.beginPath();
                ctx.arc(cx, cy, SLOT_SIZE * 0.34, 0, Math.PI * 2);
                ctx.fill();
                // 首字
                ctx.fillStyle = '#1a1a1a';
                ctx.font = 'bold 12px "PingFang SC", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(def.name.charAt(0), cx, cy + 0.5);
            }
            // 记录 hit-test 矩形（按 BagItem 唯一 id）
            _slotRects[it.id] = { x, y, w: SLOT_SIZE, h: SLOT_SIZE };
            slotIdx++;
        }
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
