// 通用物品详情卡（浮层模态）
//
// 用途：
// - 水下背包：点击格子 → 详情卡 → "丢弃"
// - 商店：点击商品 → 详情卡 → "购买"
// - 仓库：点击库存 → 详情卡 → "卖出"（阶段 3 用）
//
// 渲染：居中 280×自适应 浮层，带半透明背景遮罩
// 交互：input.ts 的 hit-test 走 getDetailCardCloseRect / getDetailCardActionRect[]
//
// 状态：state.extraction.detailCard（瞬时 UI 态，不入存档）
//   { open, source, itemUniqueId?, itemId?, condition?, action[] }
// source：用于区分"丢弃 / 购买 / 卖出"的语义来源

import { ctx } from '../../render/Canvas';
import { CONFIG } from '../../core/config';
import { getItemDef, CONDITION_NAMES, CONDITION_MULTIPLIERS } from '../core/ExtractionRegistry';
import { ensureExtractionState } from '../core/ExtractionState';
import { computeItemPrice, getItemDisplayName } from '../logic/Economy';
import { drawRelicIconAt } from '../../render/RenderRelic';
import { ALL_RELIC_KINDS } from '../../logic/Relic';

// 物品 id 是否是古物
const RELIC_ID_SET: { [k: string]: boolean } = (() => {
    const m: { [k: string]: boolean } = {};
    for (const k of ALL_RELIC_KINDS) m[k] = true;
    return m;
})();

// =============================================
// 类型与状态
// =============================================

export type DetailCardSource = 'bag' | 'shop' | 'warehouse';

export interface DetailCardAction {
    /** 动作 id，input.ts 用此分发：'discard' / 'buy' / 'sell' / 'close' */
    id: string;
    /** 按钮文字 */
    label: string;
    /** 按钮主色调："danger" / "primary" / "secondary" */
    style: 'danger' | 'primary' | 'secondary';
    /** 是否禁用（金不够、已拥有等） */
    disabled?: boolean;
    /** 禁用时显示的副文字 */
    disabledLabel?: string;
}

export interface DetailCardData {
    open: boolean;
    source: DetailCardSource;
    /** bag 模式：背包内该物品的唯一实例 id */
    itemUniqueId?: number;
    /** itemId（共享，所有 source 都需要） */
    itemId?: string;
    /** 品相（bag/warehouse 来源时有；shop 来源时为 'normal' 占位） */
    condition?: string;
    /** shop 来源：覆盖售价（不是 baseValue × condition；可能含老板溢价/特价） */
    shopPrice?: number;
    /** 业务侧动作按钮 */
    actions: DetailCardAction[];
}

function ensureDetailState(): DetailCardData {
    const ex = ensureExtractionState() as any;
    if (!ex.detailCard) {
        ex.detailCard = {
            open: false,
            source: 'bag',
            actions: [],
        } as DetailCardData;
    }
    return ex.detailCard as DetailCardData;
}

export function isDetailCardOpen(): boolean {
    const ex = (ensureExtractionState() as any).detailCard as DetailCardData | undefined;
    return !!(ex && ex.open);
}

export function getDetailCardData(): DetailCardData | null {
    const ex = (ensureExtractionState() as any).detailCard as DetailCardData | undefined;
    if (!ex || !ex.open) return null;
    return ex;
}

/** 打开详情卡 */
export function openDetailCard(data: Omit<DetailCardData, 'open'>): void {
    const dc = ensureDetailState();
    dc.open = true;
    dc.source = data.source;
    dc.itemUniqueId = data.itemUniqueId;
    dc.itemId = data.itemId;
    dc.condition = data.condition || 'normal';
    dc.shopPrice = data.shopPrice;
    dc.actions = data.actions || [];
}

export function closeDetailCard(): void {
    const dc = ensureDetailState();
    dc.open = false;
    dc.itemUniqueId = undefined;
    dc.itemId = undefined;
    dc.condition = undefined;
    dc.shopPrice = undefined;
    dc.actions = [];
}

// =============================================
// hit-test 矩形（input.ts 静态 import）
// =============================================

let _backdropRect: { x: number; y: number; w: number; h: number } | null = null;
let _closeXRect: { x: number; y: number; w: number; h: number } | null = null;
const _actionBtnRects: { [actionId: string]: { x: number; y: number; w: number; h: number } } = {};

export function getDetailCardBackdropRect(): { x: number; y: number; w: number; h: number } | null {
    return _backdropRect;
}
export function getDetailCardCloseRect(): { x: number; y: number; w: number; h: number } | null {
    return _closeXRect;
}
export function getDetailCardActionRect(actionId: string): { x: number; y: number; w: number; h: number } | null {
    return _actionBtnRects[actionId] || null;
}
export function listDetailCardActionIds(): string[] {
    const dc = getDetailCardData();
    if (!dc) return [];
    return dc.actions.map(a => a.id);
}

// =============================================
// 工具
// =============================================

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

/** 品相 → 主色调（边框 + 标签条） */
function conditionMain(condition: string): string {
    switch (condition) {
        case 'pristine':  return 'rgba(255, 220, 130, 0.95)';
        case 'fine':      return 'rgba(180, 220, 255, 0.95)';
        case 'normal':    return 'rgba(200, 215, 230, 0.85)';
        case 'worn':      return 'rgba(200, 165, 130, 0.8)';
        case 'broken':    return 'rgba(180, 130, 110, 0.78)';
        default:          return 'rgba(200, 215, 230, 0.8)';
    }
}

function conditionStripe(condition: string): string {
    return conditionMain(condition);
}

/** 稀有度 → 副色调（用在稀有度小标签） */
function rarityColor(rarity: string): string {
    switch (rarity) {
        case 'common':    return 'rgba(180, 200, 220, 0.85)';
        case 'uncommon':  return 'rgba(120, 220, 160, 0.9)';
        case 'rare':      return 'rgba(110, 180, 255, 0.95)';
        case 'epic':      return 'rgba(190, 130, 255, 0.95)';
        case 'legendary': return 'rgba(255, 180, 80, 0.95)';
        default:          return 'rgba(180, 200, 220, 0.85)';
    }
}

function rarityLabel(rarity: string): string {
    switch (rarity) {
        case 'common':    return '普通';
        case 'uncommon':  return '不寻常';
        case 'rare':      return '稀有';
        case 'epic':      return '史诗';
        case 'legendary': return '传奇';
        default:          return '普通';
    }
}

function categoryLabel(cat: string): string {
    switch (cat) {
        case 'treasure':   return '战利品';
        case 'consumable': return '消耗品';
        case 'equipment':  return '永久装备';
        case 'emergency':  return '应急品';
        case 'material':   return '材料';
        default:           return '物品';
    }
}

/** 简化的中文换行（按字符宽度） */
function wrapTextLines(text: string, maxW: number, font: string): string[] {
    ctx.font = font;
    const chars = text.split('');
    const lines: string[] = [];
    let line = '';
    for (const ch of chars) {
        const test = ctx.measureText(line + ch).width;
        if (test > maxW && line.length > 0) {
            lines.push(line);
            line = ch;
        } else {
            line += ch;
        }
    }
    if (line) lines.push(line);
    return lines;
}

// =============================================
// 渲染（在所有 UI 顶层最后画一次）
// =============================================

const CARD_W = 280;

export function drawItemDetailCard(): void {
    const data = getDetailCardData();
    if (!data) {
        _backdropRect = null;
        _closeXRect = null;
        for (const k in _actionBtnRects) delete _actionBtnRects[k];
        return;
    }
    if (!data.itemId) {
        return;
    }
    const def = getItemDef(data.itemId);
    if (!def) return;

    const cw = CONFIG.screenWidth;
    const ch = CONFIG.screenHeight;
    const condition = data.condition || 'normal';

    // === 背景遮罩（拦截点击关闭）===
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, cw, ch);
    _backdropRect = { x: 0, y: 0, w: cw, h: ch };

    // === 估算卡片高度 ===
    const padding = 16;
    const titleH = 22;
    const stripeH = 6;          // 品相彩条
    const iconBoxH = 90;        // 图标区
    const infoLineH = 18;       // 信息行
    const infoLines = 3;        // 估值/格子/稀有度
    const descPadTop = 8;
    const descLines = wrapTextLines(def.desc, CARD_W - padding * 2, '11px "PingFang SC", Arial');
    const descH = descLines.length * 16;
    const descPadBottom = 8;
    const sepH = 1;
    const actionsH = data.actions.length > 0 ? 44 : 0;

    const cardH = padding + titleH + 8 + stripeH + 12 + iconBoxH + 12
        + infoLines * infoLineH + descPadTop + descH + descPadBottom
        + sepH + (data.actions.length > 0 ? 12 + actionsH : 0)
        + padding;

    const cardX = (cw - CARD_W) / 2;
    const cardY = (ch - cardH) / 2;

    // === 卡片底 ===
    const bgGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    bgGrad.addColorStop(0, 'rgba(28, 38, 52, 0.97)');
    bgGrad.addColorStop(1, 'rgba(18, 26, 38, 0.97)');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    rrect(ctx, cardX, cardY, CARD_W, cardH, 12);
    ctx.fill();
    // 描边随品相
    ctx.strokeStyle = conditionMain(condition);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, cardX, cardY, CARD_W, cardH, 12);
    ctx.stroke();

    let py = cardY + padding;

    // === 标题（含品相前缀）+ 关闭 X ===
    const titleStr = data.source === 'shop'
        ? def.name
        : getItemDisplayName(def.id, condition);
    ctx.fillStyle = 'rgba(240, 245, 250, 0.98)';
    ctx.font = 'bold 18px "PingFang SC", Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(titleStr, cardX + padding, py);

    // 关闭 X
    const xR = 12;
    const xCx = cardX + CARD_W - padding - xR;
    const xCy = py + 10;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(xCx, xCy, xR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 225, 235, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xCx - 4, xCy - 4); ctx.lineTo(xCx + 4, xCy + 4);
    ctx.moveTo(xCx + 4, xCy - 4); ctx.lineTo(xCx - 4, xCy + 4);
    ctx.stroke();
    _closeXRect = { x: xCx - xR, y: xCy - xR, w: xR * 2, h: xR * 2 };

    py += titleH + 8;

    // === 品相彩条 ===
    ctx.fillStyle = conditionStripe(condition);
    ctx.beginPath();
    rrect(ctx, cardX + padding, py, CARD_W - padding * 2, stripeH, stripeH / 2);
    ctx.fill();
    py += stripeH + 12;

    // === 图标区（大圆背景 + 古物矢量图 或 非古物首字 + 类目小标签） ===
    {
        const cx = cardX + CARD_W / 2;
        const cy = py + iconBoxH / 2;
        // 圆形底
        ctx.fillStyle = 'rgba(45, 60, 80, 0.7)';
        ctx.beginPath();
        ctx.arc(cx, cy, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = conditionMain(condition);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 38, 0, Math.PI * 2);
        ctx.stroke();

        // 物品图标：古物用矢量图 / 其他用暖金圆 + 首字
        if (RELIC_ID_SET[def.id]) {
            drawRelicIconAt(ctx, def.id as any, cx, cy, 48);
        } else {
            ctx.fillStyle = 'rgba(200, 165, 90, 0.85)';
            ctx.beginPath();
            ctx.arc(cx, cy, 28, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1a1a1a';
            ctx.font = 'bold 26px "PingFang SC", Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(def.name.charAt(0), cx, cy + 1);
        }

        // 类目小标签（图标右下方）
        ctx.fillStyle = 'rgba(160, 180, 200, 0.7)';
        ctx.font = '10px "PingFang SC", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(categoryLabel(def.category), cx, cy + 50);
    }
    py += iconBoxH + 12;

    // === 信息行：估值 / 格子 / 稀有度 ===
    {
        // 估值
        const valueStr = (() => {
            if (data.source === 'shop') {
                return (data.shopPrice != null ? data.shopPrice : def.baseValue) + ' 金';
            }
            return computeItemPrice(def.id, condition) + ' 金';
        })();
        const valueLabel = data.source === 'shop' ? '售价' : '估值';

        ctx.font = '12px "PingFang SC", Arial';
        ctx.fillStyle = 'rgba(170, 190, 210, 0.7)';
        ctx.textAlign = 'left';
        ctx.fillText(valueLabel, cardX + padding, py);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
        ctx.font = 'bold 13px "PingFang SC", Arial';
        ctx.fillText(valueStr, cardX + CARD_W - padding, py);
        py += infoLineH;

        // 占用格子（消耗品/装备 不参与背包格子用 "—"）
        ctx.font = '12px "PingFang SC", Arial';
        ctx.fillStyle = 'rgba(170, 190, 210, 0.7)';
        ctx.textAlign = 'left';
        ctx.fillText('占用格子', cardX + padding, py);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(220, 230, 240, 0.92)';
        ctx.font = 'bold 12px "PingFang SC", Arial';
        ctx.fillText(def.slots > 0 ? def.slots + ' 格' : '—', cardX + CARD_W - padding, py);
        py += infoLineH;

        // 稀有度
        ctx.font = '12px "PingFang SC", Arial';
        ctx.fillStyle = 'rgba(170, 190, 210, 0.7)';
        ctx.textAlign = 'left';
        ctx.fillText('稀有度', cardX + padding, py);
        ctx.textAlign = 'right';
        ctx.fillStyle = rarityColor(def.rarity);
        ctx.font = 'bold 12px "PingFang SC", Arial';
        ctx.fillText(rarityLabel(def.rarity), cardX + CARD_W - padding, py);
        py += infoLineH;
    }

    // === 描述 ===
    py += descPadTop;
    ctx.font = '11px "PingFang SC", Arial';
    ctx.fillStyle = 'rgba(180, 195, 215, 0.78)';
    ctx.textAlign = 'left';
    for (const line of descLines) {
        ctx.fillText(line, cardX + padding, py);
        py += 16;
    }
    py += descPadBottom;

    // 装备/消耗品 额外显示效果文字
    if ((def as any).effects) {
        const eff = (def as any).effects;
        const parts: string[] = [];
        if (eff.startO2 != null) parts.push('起始氧气 ' + eff.startO2);
        if (eff.flashlightRangeMul != null) parts.push('手电 ×' + eff.flashlightRangeMul.toFixed(2));
        if (eff.moveSpeedMul != null) parts.push('速度 ×' + eff.moveSpeedMul.toFixed(2));
        if (eff.o2DrainMul != null) parts.push('氧耗 ×' + eff.o2DrainMul.toFixed(2));
        if (eff.inventorySlots != null) parts.push('背包 ' + eff.inventorySlots + ' 格');
        if (eff.startRopeCount != null) parts.push('绳索 ' + eff.startRopeCount + ' 段');
        if (parts.length > 0) {
            ctx.fillStyle = 'rgba(140, 220, 200, 0.9)';
            ctx.font = '11px "PingFang SC", Arial';
            ctx.fillText('效果：' + parts.join('，'), cardX + padding, py);
            py += 16;
        }
    }

    // === 分隔线 ===
    if (data.actions.length > 0) {
        ctx.strokeStyle = 'rgba(120, 140, 170, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cardX + padding, py + 4);
        ctx.lineTo(cardX + CARD_W - padding, py + 4);
        ctx.stroke();
        py += 12 + 4;

        // === 动作按钮（横排平分） ===
        const totalBtnW = CARD_W - padding * 2;
        const btnGap = 8;
        const n = data.actions.length;
        const btnW = (totalBtnW - btnGap * (n - 1)) / n;
        const btnH = 36;
        for (let i = 0; i < n; i++) {
            const a = data.actions[i];
            const bx = cardX + padding + i * (btnW + btnGap);
            const by = py;

            // 按钮配色
            let g0 = 'rgba(60, 90, 130, 0.85)';
            let g1 = 'rgba(80, 120, 170, 0.85)';
            let stroke = 'rgba(160, 200, 255, 0.7)';
            let textC = 'rgba(220, 240, 255, 0.98)';
            if (a.style === 'danger') {
                g0 = 'rgba(150, 60, 50, 0.85)';
                g1 = 'rgba(190, 80, 70, 0.85)';
                stroke = 'rgba(255, 160, 140, 0.8)';
                textC = 'rgba(255, 220, 210, 0.98)';
            } else if (a.style === 'primary') {
                g0 = 'rgba(150, 100, 30, 0.95)';
                g1 = 'rgba(200, 140, 50, 0.95)';
                stroke = 'rgba(255, 210, 110, 0.85)';
                textC = 'rgba(255, 240, 180, 0.98)';
            } else if (a.style === 'secondary') {
                g0 = 'rgba(60, 70, 90, 0.7)';
                g1 = 'rgba(80, 92, 115, 0.7)';
                stroke = 'rgba(180, 200, 220, 0.55)';
                textC = 'rgba(210, 220, 235, 0.95)';
            }

            if (a.disabled) {
                ctx.fillStyle = 'rgba(45, 55, 70, 0.55)';
                ctx.beginPath();
                rrect(ctx, bx, by, btnW, btnH, btnH / 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(120, 130, 150, 0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                rrect(ctx, bx, by, btnW, btnH, btnH / 2);
                ctx.stroke();
                ctx.fillStyle = 'rgba(150, 160, 180, 0.6)';
                ctx.font = 'italic 12px "PingFang SC", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(a.disabledLabel || a.label, bx + btnW / 2, by + btnH / 2);
            } else {
                const grad = ctx.createLinearGradient(bx, by, bx + btnW, by);
                grad.addColorStop(0, g0);
                grad.addColorStop(1, g1);
                ctx.fillStyle = grad;
                ctx.beginPath();
                rrect(ctx, bx, by, btnW, btnH, btnH / 2);
                ctx.fill();
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                rrect(ctx, bx, by, btnW, btnH, btnH / 2);
                ctx.stroke();
                ctx.fillStyle = textC;
                ctx.font = 'bold 13px "PingFang SC", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(a.label, bx + btnW / 2, by + btnH / 2);

                _actionBtnRects[a.id] = { x: bx, y: by, w: btnW, h: btnH };
            }
        }
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
