// 下潜中的背包 HUD（折叠胶囊态）
//
// 设计：
// - 折叠态：右下角胶囊小条 "🎒 背包 N/M"，位于拾取按钮上方（避免和轮盘按钮重叠）
//   - 占用空间小，不挡视野
//   - 容量将满时变金色脉冲提示
// - 展开态：全屏背包页（BagFullPage）—— 由本模块的 openBagFullPage() 进入
//
// 注意：原"右下角格子条"已废弃（被全屏页接管）
//       格子点击/拖拽都在 BagFullPage 内做，HUD 这里不再处理格子 hit-test

import { CONFIG } from '../../core/config';
import { state } from '../../core/state';
import { ctx } from '../../render/Canvas';
import { getBagOccupiedSlots } from '../logic/Inventory';
import { ensureExtractionState } from '../core/ExtractionState';

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
// HUD 可见性
// =============================================

export function isInventoryHUDVisible(): boolean {
    if (state.screen !== 'mazeRescue') return false;
    const maze: any = state.mazeRescue;
    if (!maze) return false;
    return maze.phase === 'play';
}

// =============================================
// 折叠态胶囊
// =============================================

const HUD_W = 96;   // 胶囊宽度
const HUD_H = 28;   // 胶囊高度

// hit-test 矩形（input.ts 用）
let _hudCapsuleRect: { x: number; y: number; w: number; h: number } | null = null;

export function getInventoryHUDCapsuleRect(): { x: number; y: number; w: number; h: number } | null {
    return _hudCapsuleRect;
}

/**
 * 计算折叠胶囊位置：左下角，紧贴撤离按钮上方（与撤离按钮中线左对齐，自然形成"撤离 + 背包"竖排）
 *
 * 撤离按钮中心 (cw * retreatBtnXRatio, ch * retreatBtnYRatio)，半径 retreatBtnRadius。
 * 背包胶囊横向：跟撤离按钮共享中线 → 居中对齐
 * 背包胶囊纵向：撤离按钮顶边再上方 12px
 */
function getCapsulePosition(cw: number, ch: number): { x: number; y: number } {
    const retreatCx = cw * (CONFIG.maze as any).retreatBtnXRatio;
    const retreatCy = ch * (CONFIG.maze as any).retreatBtnYRatio;
    const retreatR = (CONFIG.maze as any).retreatBtnRadius || 36;

    // 居中对齐撤离按钮
    const x = retreatCx - HUD_W / 2;
    // 撤离按钮顶边上方 12px
    const y = retreatCy - retreatR - 12 - HUD_H;
    return { x, y };
}

export function drawInventoryHUD(): void {
    _hudCapsuleRect = null;
    if (!isInventoryHUDVisible()) return;

    const ex = ensureExtractionState();
    const cw = CONFIG.screenWidth;
    const ch = CONFIG.screenHeight;

    const slotN = Math.max(1, ex.bag.maxSlots);
    const used = getBagOccupiedSlots();
    const fillRatio = used / slotN;

    const { x, y } = getCapsulePosition(cw, ch);

    ctx.save();

    // 容量脉冲（>= 80% 时金色脉冲）
    let glowAlpha = 0;
    if (fillRatio >= 0.8) {
        glowAlpha = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(Date.now() / 200));
    }

    // 背景胶囊
    if (glowAlpha > 0) {
        // 金色辉光圈
        ctx.fillStyle = `rgba(255, 200, 100, ${glowAlpha * 0.4})`;
        ctx.beginPath();
        rrect(ctx, x - 3, y - 3, HUD_W + 6, HUD_H + 6, (HUD_H + 6) / 2);
        ctx.fill();
    }
    ctx.fillStyle = 'rgba(15, 22, 32, 0.78)';
    ctx.beginPath();
    rrect(ctx, x, y, HUD_W, HUD_H, HUD_H / 2);
    ctx.fill();

    // 描边（容量越满颜色越暖）
    let strokeColor = 'rgba(140, 170, 200, 0.45)';
    if (used >= slotN) strokeColor = 'rgba(255, 200, 100, 0.95)';
    else if (fillRatio >= 0.75) strokeColor = 'rgba(220, 200, 130, 0.7)';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    rrect(ctx, x, y, HUD_W, HUD_H, HUD_H / 2);
    ctx.stroke();

    // 内部填充进度条（背景层）
    const innerPad = 4;
    const fillW = (HUD_W - innerPad * 2) * fillRatio;
    if (fillW > 0) {
        const grad = ctx.createLinearGradient(x, y, x + HUD_W, y);
        if (used >= slotN) {
            grad.addColorStop(0, 'rgba(255, 180, 70, 0.35)');
            grad.addColorStop(1, 'rgba(255, 200, 100, 0.45)');
        } else {
            grad.addColorStop(0, 'rgba(120, 180, 220, 0.28)');
            grad.addColorStop(1, 'rgba(160, 210, 240, 0.38)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        rrect(ctx, x + innerPad, y + innerPad, fillW, HUD_H - innerPad * 2, (HUD_H - innerPad * 2) / 2);
        ctx.fill();
    }

    // 文字 "🎒 N / M"
    const textColor = used >= slotN ? 'rgba(255, 230, 160, 0.98)' : 'rgba(220, 235, 250, 0.92)';
    ctx.fillStyle = textColor;
    ctx.font = 'bold 12px "PingFang SC", Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎒', x + 10, y + HUD_H / 2);
    ctx.font = 'bold 13px "PingFang SC", Arial';
    ctx.fillText('背包', x + 30, y + HUD_H / 2);
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(used + '/' + slotN, x + HUD_W - 10, y + HUD_H / 2);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();

    _hudCapsuleRect = { x, y, w: HUD_W, h: HUD_H };
}

// =============================================
// 进入全屏背包页
// =============================================

export function openBagFullPage(): void {
    const ex = ensureExtractionState() as any;
    ex.bagPageOpen = true;
}

export function closeBagFullPage(): void {
    const ex = ensureExtractionState() as any;
    ex.bagPageOpen = false;
}

export function isBagFullPageOpen(): boolean {
    const ex = ensureExtractionState() as any;
    return !!ex.bagPageOpen;
}
