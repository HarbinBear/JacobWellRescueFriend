// 岸上顶部金币 HUD
//
// 显示位置：左上方"杂货铺"按钮的右侧（横排排列），位于 SAFE_TOP 安全区下方
// 这样既避开了微信小游戏右上角胶囊和设备前置摄像头，
// 也与右上"图鉴"按钮形成左右对称的布局。
// 仅在迷宫 shore / resolved_idle 阶段显示

import { CONFIG } from '../../core/config';
import { state } from '../../core/state';
import { ctx } from '../../render/Canvas';
import { getCoins } from '../logic/Economy';
import { SAFE_TOP, SAFE_LEFT } from './UISafeArea';

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

export function isCoinHUDVisible(): boolean {
    if (state.screen !== 'mazeRescue') return false;
    const maze: any = state.mazeRescue;
    if (!maze) return false;
    const phase = maze.phase;
    return phase === 'shore' || phase === 'resolved_idle';
}

// 杂货铺按钮的固定参数（与 ShopUI 中的 drawShopEntryBtn 保持一致）
const SHOP_BTN_W = 90;
const SHOP_BTN_H = 32;
const GAP_BETWEEN = 8;  // 杂货铺按钮与金币 HUD 之间的间隙

/** 取金币 HUD 的位置矩形（外部 hit-test 不需要，但布局调试可能用） */
export function getCoinHUDRect(): { x: number; y: number; w: number; h: number } {
    const cw = CONFIG.screenWidth;
    const coins = getCoins();
    const text = String(coins);

    ctx.save();
    ctx.font = 'bold 16px Arial';
    const labelW = ctx.measureText(text).width;
    ctx.restore();

    const padX = 12;
    const cardW = labelW + padX * 2 + 26;
    const cardH = 32;

    // 紧贴杂货铺按钮右侧
    const cardX = SAFE_LEFT + SHOP_BTN_W + GAP_BETWEEN;
    const cardY = SAFE_TOP;
    void cw;
    return { x: cardX, y: cardY, w: cardW, h: cardH };
}

export function drawCoinHUD(): void {
    if (!isCoinHUDVisible()) return;

    const coins = getCoins();
    const text = String(coins);

    ctx.save();
    ctx.font = 'bold 16px Arial';
    const labelW = ctx.measureText(text).width;
    const padX = 12;
    const cardW = labelW + padX * 2 + 26; // 留 26 像素给金币图标
    const cardH = SHOP_BTN_H; // 与杂货铺按钮等高，视觉对齐
    const cardX = SAFE_LEFT + SHOP_BTN_W + GAP_BETWEEN;
    const cardY = SAFE_TOP;

    // 阴影底
    ctx.fillStyle = 'rgba(20, 28, 40, 0.78)';
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, cardH / 2);
    ctx.fill();

    // 描边（金色）
    ctx.strokeStyle = 'rgba(220, 180, 80, 0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, cardH / 2);
    ctx.stroke();

    // 金币图标
    const coinX = cardX + 14;
    const coinY = cardY + cardH / 2;
    const coinR = 8;
    ctx.fillStyle = '#f4c860';
    ctx.beginPath();
    ctx.arc(coinX, coinY, coinR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d99a36';
    ctx.beginPath();
    ctx.arc(coinX, coinY, coinR - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3a18';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¥', coinX, coinY + 0.5);

    // 金额
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
    ctx.fillText(text, cardX + 28, coinY + 1);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
