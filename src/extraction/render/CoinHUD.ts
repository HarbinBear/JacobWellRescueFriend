// 岸上顶部金币 HUD
//
// 显示位置：顶栏第二行（y = SAFE_TOP + 40），与杂货铺按钮左对齐
// 第一行（y = SAFE_TOP）已经被 [返回 / 杂货铺 / 仓库 / 图鉴] 占满，
// 在 cw=360 的小屏幕上没有空间再塞金币卡片，因此放第二行单独成行。
// 仅在迷宫 shore / resolved_idle 阶段显示

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

// 顶栏第一行的几何：返回 (14, SAFE_TOP, 72, 30) → 杂货铺 (94, 61, 92, 32)
// CoinHUD 与杂货铺按钮左对齐，纵向放在第一行下方 8px
const COIN_X = SAFE_LEFT + 72 + 8;       // 与杂货铺按钮左对齐 = 94
const COIN_Y_OFFSET = 32 + 8;            // 第一行底部 + 间距
const COIN_HUD_H = 28;

/** 取金币 HUD 的位置矩形（外部 hit-test 不需要，但布局调试可能用） */
export function getCoinHUDRect(): { x: number; y: number; w: number; h: number } {
    const coins = getCoins();
    const text = String(coins);

    ctx.save();
    ctx.font = 'bold 15px Arial';
    const labelW = ctx.measureText(text).width;
    ctx.restore();

    const padX = 12;
    const cardW = labelW + padX * 2 + 22;

    return { x: COIN_X, y: SAFE_TOP + COIN_Y_OFFSET, w: cardW, h: COIN_HUD_H };
}

export function drawCoinHUD(): void {
    if (!isCoinHUDVisible()) return;

    const coins = getCoins();
    const text = String(coins);

    ctx.save();
    ctx.font = 'bold 15px Arial';
    const labelW = ctx.measureText(text).width;
    const padX = 12;
    const cardW = labelW + padX * 2 + 22;
    const cardH = COIN_HUD_H;
    const cardX = COIN_X;
    const cardY = SAFE_TOP + COIN_Y_OFFSET;

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
    const coinR = 7;
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
    ctx.fillText('¥', coinX, coinY);

    // 金额（垂直居中）
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
    ctx.fillText(text, cardX + 26, coinY);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
