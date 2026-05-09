// 岸上顶部金币 HUD
//
// 显示位置：岸上的左上角偏右（避开微信小游戏右上角胶囊和左上的图鉴入口）
// 仅在迷宫 shore / resolved_idle 阶段显示

import { CONFIG } from '../../core/config';
import { state } from '../../core/state';
import { ctx } from '../../render/Canvas';
import { getCoins } from '../logic/Economy';

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

export function drawCoinHUD(): void {
    if (!isCoinHUDVisible()) return;

    const cw = CONFIG.screenWidth;

    const coins = getCoins();
    const text = String(coins);

    // 卡片：在屏幕中央偏左，避开左上的图鉴入口
    const padX = 12;
    const padY = 6;
    ctx.save();
    ctx.font = 'bold 16px Arial';
    const labelW = ctx.measureText(text).width;
    const cardW = labelW + padX * 2 + 26; // 留 26 像素给金币图标
    const cardH = 32;
    const cardX = (cw - cardW) / 2;
    const cardY = 14;

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

    // 金币图标（简化：金币 + 内圈 + 高光）
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
    // 内字 ¥（克制版）
    ctx.fillStyle = '#5a3a18';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¥', coinX, coinY + 0.5);

    // 金额文字
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
    ctx.fillText(text, cardX + 28, coinY + 1);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
