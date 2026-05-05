// 岸上界面 + 全屏认知地图 + 下潜记录列表 + 单次下潜手绘地图回放 + 历史 legacy 铅笔素描地图
// 从原 RenderMazeUI.ts 抽出。调用方：RenderMazeUI.drawMazeHUD（shore / resolved_idle 两个 phase）

import { state } from '../../core/state';
import { ctx } from '../Canvas';

// 兼容微信小游戏的圆角矩形（本文件内部私有工具）
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
// 岸上界面绘制
// =============================================
export function drawMazeShore(maze: any, cw: number, ch: number, time: number) {
    if (maze.shoreMapOpen) {
        drawMazeMapFullscreen(maze, cw, ch, time);
        return;
    }

    const skyGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.4);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(0.5, '#B0E0FF');
    skyGrad.addColorStop(1, '#E8F5E9');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, cw, ch * 0.4);

    const sunX = cw * 0.8;
    const sunY = ch * 0.08;
    const sunPulse = 1 + Math.sin(time * 0.5) * 0.05;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#FFE082';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 60 * sunPulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#FFF9C4';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30 * sunPulse, 0, Math.PI * 2);
    ctx.fill();

    const treeLine = ch * 0.38;
    ctx.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
        const tx = (i * cw / 12) - 10 + Math.sin(i * 1.5) * 8;
        const treeH = 40 + Math.sin(i * 3.7) * 12;
        const crownR = 18 + Math.sin(i * 2.1) * 6;
        ctx.fillStyle = `rgba(${70 + i * 3},${50 + i * 2},${30},0.5)`;
        ctx.fillRect(tx - 2, treeLine - treeH * 0.4, 4, treeH * 0.5);
        const g1 = 80 + i * 6;
        const g2 = 110 + i * 5;
        ctx.fillStyle = `rgba(${30 + i * 3},${g1},${40 + i * 2},0.55)`;
        ctx.beginPath();
        ctx.arc(tx, treeLine - treeH * 0.5, crownR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${40 + i * 4},${g2},${50 + i * 3},0.45)`;
        ctx.beginPath();
        ctx.arc(tx - crownR * 0.3, treeLine - treeH * 0.55, crownR * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tx + crownR * 0.35, treeLine - treeH * 0.48, crownR * 0.65, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
        const tx = (i * cw / 6) - 15 + Math.sin(i * 2.1) * 5;
        const treeH = 65 + Math.sin(i * 4.2) * 15;
        const crownR = 22 + Math.sin(i * 3.3) * 8;
        const sway = Math.sin(time * 0.8 + i * 1.2) * 2;
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(tx - 3, treeLine - treeH * 0.35, 6, treeH * 0.45);
        ctx.fillStyle = `rgba(${35 + i * 6},${100 + i * 10},${40 + i * 4},0.85)`;
        ctx.beginPath();
        ctx.arc(tx + sway, treeLine - treeH * 0.5, crownR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${45 + i * 5},${120 + i * 8},${50 + i * 3},0.7)`;
        ctx.beginPath();
        ctx.arc(tx + sway - crownR * 0.5, treeLine - treeH * 0.45, crownR * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tx + sway + crownR * 0.5, treeLine - treeH * 0.42, crownR * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${80 + i * 5},${160 + i * 6},${70 + i * 4},0.3)`;
        ctx.beginPath();
        ctx.arc(tx + sway - crownR * 0.2, treeLine - treeH * 0.58, crownR * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    const grassGrad = ctx.createLinearGradient(0, ch * 0.38, 0, ch);
    grassGrad.addColorStop(0, '#66BB6A');
    grassGrad.addColorStop(0.3, '#4CAF50');
    grassGrad.addColorStop(1, '#388E3C');
    ctx.globalAlpha = 1;
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, ch * 0.38, cw, ch * 0.62);

    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 50; i++) {
        const gx = (i * cw / 45) + Math.sin(i * 3.1) * 12;
        const gy = ch * 0.39 + (i % 7) * ch * 0.06 + Math.sin(i * 2.7) * 6;
        const sway = Math.sin(time * 1.5 + i * 0.8) * 3;
        const grassH = 10 + Math.sin(i * 1.9) * 6;
        for (let j = -1; j <= 1; j++) {
            ctx.strokeStyle = `rgba(${80 + j * 10},${150 + i % 30},${60 + j * 5},0.6)`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(gx + j * 3, gy);
            ctx.quadraticCurveTo(gx + j * 3 + sway + j * 2, gy - grassH * 0.6, gx + sway * 1.5 + j * 4, gy - grassH);
            ctx.stroke();
        }
    }

    ctx.globalAlpha = 0.8;
    const flowerColors = ['#FF6B6B', '#FFD93D', '#FF8CC8', '#FFA07A', '#DDA0DD', '#87CEEB'];
    for (let i = 0; i < 18; i++) {
        const fx = cw * 0.05 + (i * cw / 16) + Math.sin(i * 4.3) * 15;
        const fy = ch * 0.41 + (i % 5) * ch * 0.07 + Math.sin(i * 3.1) * 8;
        const fSize = 3 + Math.sin(i * 2.7) * 1.5;
        const fColor = flowerColors[i % flowerColors.length];
        ctx.fillStyle = fColor;
        for (let p = 0; p < 5; p++) {
            const pa = (p / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(fx + Math.cos(pa) * fSize, fy + Math.sin(pa) * fSize, fSize * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(fx, fy, fSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 3; i++) {
        const bx = cw * 0.2 + i * cw * 0.25 + Math.sin(time * 1.2 + i * 2.5) * 30;
        const by = ch * 0.32 + Math.sin(time * 0.8 + i * 1.8) * 20 + i * 15;
        const wingFlap = Math.sin(time * 8 + i * 3) * 0.5;
        const bColor = i === 0 ? '#FF69B4' : i === 1 ? '#87CEEB' : '#FFD700';
        ctx.save();
        ctx.translate(bx, by);
        ctx.fillStyle = bColor;
        ctx.beginPath();
        ctx.ellipse(-3, 0, 5, 3 + wingFlap * 2, -0.3 + wingFlap * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(3, 0, 5, 3 + wingFlap * 2, 0.3 - wingFlap * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.fillRect(-0.5, -3, 1, 6);
        ctx.restore();
    }

    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
        const birdX = ((time * 20 + i * 80) % (cw + 100)) - 50;
        const birdY = ch * 0.12 + i * 18 + Math.sin(time * 2 + i * 1.5) * 8;
        const wingSpan = 6 + i * 1.5;
        const wingUp = Math.sin(time * 5 + i * 2) * 3;
        ctx.beginPath();
        ctx.moveTo(birdX - wingSpan, birdY - wingUp);
        ctx.quadraticCurveTo(birdX - wingSpan * 0.3, birdY + 2, birdX, birdY);
        ctx.quadraticCurveTo(birdX + wingSpan * 0.3, birdY + 2, birdX + wingSpan, birdY - wingUp);
        ctx.stroke();
    }

    const poolX = cw * 0.5;
    const poolY = ch * 0.44;
    const poolW = 80;
    const poolH = 40;
    const poolPulse = 0.6 + Math.sin(time * 2) * 0.2;
    ctx.globalAlpha = poolPulse * 0.3;
    ctx.fillStyle = '#64B5F6';
    ctx.beginPath();
    ctx.ellipse(poolX, poolY, poolW + 12, poolH + 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#1565C0';
    ctx.beginPath();
    ctx.ellipse(poolX, poolY, poolW, poolH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#90CAF9';
    ctx.lineWidth = 1;
    for (let w = 0; w < 3; w++) {
        const waveR = 20 + w * 15 + Math.sin(time * 2 + w) * 5;
        ctx.beginPath();
        ctx.ellipse(poolX, poolY, waveR, waveR * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 0.7 + Math.sin(time * 3) * 0.3;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 3;
    ctx.fillText('点击下潜 ▼', poolX, poolY + poolH + 20);
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText('岸上营地', cw / 2, ch * 0.06 + 20);
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    rrect(ctx, 8, 8, 64, 32, 16);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('← 返回', 40, 24);
    ctx.textBaseline = 'alphabetic';

    const cardX = cw * 0.06;
    const cardW = cw * 0.88;
    const isRecordOpen = maze._shoreRecordOpen;
    const cardCollapsedH = 48;
    const cardExpandedH = ch * 0.42;

    if (!maze._shoreRecordAnim) maze._shoreRecordAnim = 0;
    const targetAnim = isRecordOpen ? 1 : 0;
    maze._shoreRecordAnim += (targetAnim - maze._shoreRecordAnim) * 0.12;
    if (Math.abs(maze._shoreRecordAnim - targetAnim) < 0.01) maze._shoreRecordAnim = targetAnim;
    const animT = maze._shoreRecordAnim;
    const animEase = animT * animT * (3 - 2 * animT);
    const cardH = cardCollapsedH + (cardExpandedH - cardCollapsedH) * animEase;
    const cardY = ch - cardH - 16;

    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(76,175,80,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.stroke();

    ctx.globalAlpha = 1;
    const infoX = cardX + 16;
    const titleCenterY = cardY + cardCollapsedH / 2;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    const arrowChar = animEase > 0.5 ? '▼' : '▶';
    ctx.fillStyle = '#999';
    ctx.font = '12px Arial';
    ctx.fillText(arrowChar, infoX, titleCenterY);
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('探索记录', infoX + 18, titleCenterY);
    ctx.textBaseline = 'alphabetic';

    const mapIconSize = 34;
    const mapIconX = cardX + cardW - mapIconSize - 12;
    const mapIconY = cardY + (cardCollapsedH - mapIconSize) / 2;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(76,175,80,0.12)';
    ctx.beginPath();
    rrect(ctx, mapIconX, mapIconY, mapIconSize, mapIconSize, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(76,175,80,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, mapIconX, mapIconY, mapIconSize, mapIconSize, 8);
    ctx.stroke();
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 1.5;
    const mIcx = mapIconX + mapIconSize / 2;
    const mIcy = mapIconY + mapIconSize / 2;
    ctx.beginPath();
    ctx.moveTo(mIcx, mIcy - 7);
    ctx.lineTo(mIcx, mIcy + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mIcx, mIcy - 7);
    ctx.quadraticCurveTo(mIcx - 8, mIcy - 5, mIcx - 8, mIcy + 5);
    ctx.lineTo(mIcx, mIcy + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mIcx, mIcy - 7);
    ctx.quadraticCurveTo(mIcx + 8, mIcy - 5, mIcx + 8, mIcy + 5);
    ctx.lineTo(mIcx, mIcy + 7);
    ctx.stroke();
    const countNum = Math.min(5, (maze.diveHistory && maze.diveHistory.length) ? maze.diveHistory.length : 0);
    if (countNum > 0) {
        ctx.fillStyle = '#F44336';
        ctx.beginPath();
        ctx.arc(mapIconX + mapIconSize - 6, mapIconY + 6, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(countNum), mapIconX + mapIconSize - 6, mapIconY + 6);
        ctx.textBaseline = 'alphabetic';
    }

    if (animEase > 0.3) {
        const contentAlpha = Math.min(1, (animEase - 0.3) / 0.5);
        ctx.globalAlpha = contentAlpha;
        ctx.textAlign = 'left';
        ctx.font = '13px Arial';
        ctx.fillStyle = '#555';
        let infoY = cardY + cardCollapsedH + 8;
        ctx.fillText(`下潜次数：${maze.diveCount}`, infoX, infoY);
        ctx.fillText(`铺设绳索：${maze.totalRopePlaced} 段`, infoX + cardW * 0.5, infoY);
        infoY += 22;
        const maxDepthM = Math.floor(maze.maxDepthReached / maze.mazeTileSize);
        ctx.fillText(`最深到达：${maxDepthM}m`, infoX, infoY);
        ctx.fillText(`被困者：${maze.npcFound ? '[已发现]' : '[未发现]'}`, infoX + cardW * 0.5, infoY);

        if (maze.diveHistory.length > 0) {
            const lastDive = maze.diveHistory[maze.diveHistory.length - 1];
            infoY += 28;
            ctx.fillStyle = '#777';
            ctx.font = '12px Arial';
            const reasonText = lastDive.returnReason === 'retreat' ? '主动撤离' :
                              lastDive.returnReason === 'o2' ? '氧气不足' :
                              lastDive.returnReason === 'rescued' ? '救援成功' :
                              lastDive.returnReason === 'fishkill' ? '被食人鱼袭击' : '返回';
            ctx.fillText(`上次：${reasonText} | 深度${lastDive.maxDepth}m | 新探索${lastDive.newExploredCount}格`, infoX, infoY);
            infoY += 18;
            ctx.fillText(`      绳索+${lastDive.ropePlaced} | 用时${Math.floor(lastDive.duration / 60)}分${lastDive.duration % 60}秒`, infoX, infoY);
        }

        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#888';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        if (maze.npcFound) {
            ctx.fillText('已发现被困者，下潜后可靠近长按绑绳救援', cw / 2, cardY + cardH - 14);
        } else {
            ctx.fillText('点击水面入口开始下潜探索', cw / 2, cardY + cardH - 14);
        }
    }

    ctx.globalAlpha = 1;
}

// =============================================
// 全屏认知地图查看页面（分发到列表页或单次手绘回放页）
// =============================================
function drawMazeMapFullscreen(maze: any, cw: number, ch: number, time: number) {
    const idx = (typeof maze.shoreMapDiveIndex === 'number') ? maze.shoreMapDiveIndex : -1;
    if (idx >= 0 && maze.diveHistory && maze.diveHistory[idx]) {
        drawShoreDiveReplay(maze, maze.diveHistory[idx], idx, cw, ch, time);
        return;
    }
    drawShoreDiveList(maze, cw, ch, time);
}

// =============================================
// 岸上下潜记录列表（B1：点"下潜记录"按钮后弹出的总入口）
// =============================================
function drawShoreDiveList(maze: any, cw: number, ch: number, time: number) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(235,225,200,1)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 60; i++) {
        const sx = Math.sin(i * 7.3 + 0.5) * cw * 0.5 + cw * 0.5;
        const sy = Math.cos(i * 5.1 + 1.2) * ch * 0.5 + ch * 0.5;
        const sr = Math.abs(2 + Math.sin(i * 3.7) * 1.5);
        ctx.fillStyle = i % 3 === 0 ? '#8B7355' : '#A0926B';
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic bold 18px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('下潜记录', cw / 2, 34);
    ctx.strokeStyle = 'rgba(62,44,35,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = cw * 0.32; x < cw * 0.68; x += 3) {
        const wy = 40 + Math.sin(x * 0.15) * 1.5;
        if (x === cw * 0.32) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#7A6B5C';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText('仅保留最近 5 次 · 点击任一条可翻开手绘地图', cw / 2, 58);

    ctx.globalAlpha = 0.45;
    ctx.fillText('点击左上角 ← 返回岸上', cw / 2, ch - 16);

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(62,44,35,0.12)';
    ctx.beginPath();
    rrect(ctx, 8, 8, 68, 30, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(62,44,35,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, 8, 8, 68, 30, 14);
    ctx.stroke();
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('← 返回', 42, 23);
    ctx.textBaseline = 'alphabetic';

    const list = maze.diveHistory || [];
    if (list.length === 0) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#7A6B5C';
        ctx.font = 'italic 13px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('还没有下潜记录', cw / 2, ch * 0.5);
        ctx.fillText('从水面入口下潜一次，就会有手绘地图留下', cw / 2, ch * 0.5 + 22);
        return;
    }

    const listTop = 78;
    const listBottom = ch - 36;
    const maxCards = 5;
    const avail = listBottom - listTop;
    const gap = 10;
    const cardH = Math.min(92, (avail - gap * (maxCards - 1)) / maxCards);
    const cardX = cw * 0.06;
    const cardW = cw * 0.88;

    for (let i = 0; i < list.length; i++) {
        const reverseIdx = list.length - 1 - i;
        const record = list[reverseIdx];
        const cy = listTop + i * (cardH + gap);

        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(243,234,215,1)';
        ctx.shadowColor = 'rgba(0,0,0,0.12)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.beginPath();
        rrect(ctx, cardX, cy, cardW, cardH, 10);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.strokeStyle = 'rgba(70,55,45,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        rrect(ctx, cardX, cy, cardW, cardH, 10);
        ctx.stroke();

        const thumbPad = 8;
        const thumbSize = cardH - thumbPad * 2;
        const thumbX = cardX + thumbPad;
        const thumbY = cy + thumbPad;
        ctx.fillStyle = 'rgba(245,238,220,1)';
        ctx.beginPath();
        rrect(ctx, thumbX, thumbY, thumbSize, thumbSize, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(70,55,45,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        rrect(ctx, thumbX, thumbY, thumbSize, thumbSize, 4);
        ctx.stroke();
        const snap = record.exploredSnapshot;
        if (snap) {
            const rows = snap.length;
            const cols = rows > 0 ? snap[0].length : 0;
            if (rows > 0 && cols > 0) {
                const cellSz = thumbSize / Math.max(rows, cols);
                const offX = thumbX + (thumbSize - cellSz * cols) / 2;
                const offY = thumbY + (thumbSize - cellSz * rows) / 2;
                ctx.fillStyle = 'rgba(90,70,55,0.55)';
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (!snap[r][c]) continue;
                        ctx.fillRect(offX + c * cellSz, offY + r * cellSz, Math.max(0.8, cellSz), Math.max(0.8, cellSz));
                    }
                }
            }
        }
        if (record.playerPath && record.playerPath.length > 1 && record.exploredSnapshot) {
            const rowsP = record.exploredSnapshot.length;
            const colsP = rowsP > 0 ? record.exploredSnapshot[0].length : 0;
            if (rowsP > 0 && colsP > 0) {
                const cellSzP = thumbSize / Math.max(rowsP, colsP);
                const offXP = thumbX + (thumbSize - cellSzP * colsP) / 2;
                const offYP = thumbY + (thumbSize - cellSzP * rowsP) / 2;
                const tile = maze.mazeTileSize || 1;
                ctx.strokeStyle = 'rgba(170,90,40,0.85)';
                ctx.lineWidth = 1.2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                for (let k = 0; k < record.playerPath.length; k++) {
                    const pt = record.playerPath[k];
                    const px = offXP + (pt.x / tile) * cellSzP;
                    const py = offYP + (pt.y / tile) * cellSzP;
                    if (k === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
        }

        const txtX = thumbX + thumbSize + 14;
        let txtY = cy + 20;
        const diveNumber = maze.diveCount - list.length + reverseIdx + 1;
        ctx.fillStyle = '#3E2C23';
        ctx.font = 'italic bold 14px Georgia, serif';
        ctx.textAlign = 'left';
        ctx.fillText(`第 ${diveNumber} 次下潜`, txtX, txtY);
        txtY += 18;
        const reason = record.returnReason;
        const reasonText = reason === 'retreat' ? '主动撤离' :
                          reason === 'o2' ? '氧气耗尽' :
                          reason === 'rescued' ? '救援成功' :
                          reason === 'fishkill' ? '被食人鱼袭击' : '返回';
        const reasonColor = reason === 'rescued' ? 'rgba(40,120,60,0.95)' :
                           reason === 'o2' ? 'rgba(180,100,30,0.95)' :
                           reason === 'fishkill' ? 'rgba(160,40,30,0.95)' :
                           'rgba(70,55,45,0.85)';
        ctx.fillStyle = reasonColor;
        ctx.font = 'italic 12px Georgia, serif';
        ctx.fillText(reasonText, txtX, txtY);
        txtY += 16;
        ctx.fillStyle = '#7A6B5C';
        ctx.font = '11px Arial';
        const minutes = Math.floor(record.duration / 60);
        const seconds = record.duration % 60;
        ctx.fillText(`用时 ${minutes}:${seconds < 10 ? '0' + seconds : seconds}  深度 ${record.maxDepth}m`, txtX, txtY);
        txtY += 14;
        ctx.fillText(`新探索 +${record.newExploredCount}  绳索 +${record.ropePlaced}`, txtX, txtY);

        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#7A6B5C';
        ctx.font = 'italic 10px Georgia, serif';
        ctx.textAlign = 'right';
        ctx.fillText('翻开 →', cardX + cardW - 10, cy + cardH - 10);
        ctx.globalAlpha = 1;
    }
}

// =============================================
// 岸上单次下潜的手绘地图回放
// =============================================
function drawShoreDiveReplay(maze: any, record: any, idx: number, cw: number, ch: number, time: number) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(235,225,200,1)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 60; i++) {
        const sx = Math.sin(i * 7.3 + 0.5) * cw * 0.5 + cw * 0.5;
        const sy = Math.cos(i * 5.1 + 1.2) * ch * 0.5 + ch * 0.5;
        const sr = Math.abs(2 + Math.sin(i * 3.7) * 1.5);
        ctx.fillStyle = i % 3 === 0 ? '#8B7355' : '#A0926B';
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic bold 17px Georgia, serif';
    ctx.textAlign = 'center';
    const diveNumber = maze.diveCount - maze.diveHistory.length + idx + 1;
    ctx.fillText(`第 ${diveNumber} 次下潜 · 手绘地图`, cw / 2, 30);

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(62,44,35,0.12)';
    ctx.beginPath();
    rrect(ctx, 8, 8, 78, 30, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(62,44,35,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, 8, 8, 78, 30, 14);
    ctx.stroke();
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic 12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('← 记录', 47, 23);
    ctx.textBaseline = 'alphabetic';

    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#7A6B5C';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('点击其它区域返回下潜记录', cw / 2, ch - 14);

    const padding = 24;
    const mapTopY = 48;
    const mapBottomY = ch - 36;
    const mapAreaW = cw - padding * 2;
    const mapAreaH = mapBottomY - mapTopY;
    const cols = maze.mazeCols;
    const rows = maze.mazeRows;
    const mapRatio = cols / rows;
    const areaRatio = mapAreaW / mapAreaH;
    let mapW: number, mapH: number;
    if (mapRatio > areaRatio) {
        mapW = mapAreaW;
        mapH = mapW / mapRatio;
    } else {
        mapH = mapAreaH;
        mapW = mapH * mapRatio;
    }
    const mapX = (cw - mapW) / 2;
    const mapY = mapTopY + (mapAreaH - mapH) / 2;
    const cellW = mapW / cols;
    const cellH = mapH / rows;

    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(243,234,215,1)';
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    rrect(ctx, mapX - 10, mapY - 10, mapW + 20, mapH + 20, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(70,55,45,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, mapX - 10, mapY - 10, mapW + 20, mapH + 20, 10);
    ctx.stroke();

    const snap = record.exploredSnapshot;
    const before = record.exploredBeforeSnapshot;
    if (snap) {
        for (let r = 0; r < rows; r++) {
            if (!snap[r]) continue;
            for (let c = 0; c < cols; c++) {
                if (!snap[r][c]) continue;
                const cell = maze.mazeMap[r] ? maze.mazeMap[r][c] : 1;
                const px = mapX + c * cellW;
                const py = mapY + r * cellH;
                if (cell === 0) {
                    const isNew = before && before[r] && !before[r][c];
                    ctx.fillStyle = isNew ? 'rgba(170,90,40,0.55)' : 'rgba(140,115,85,0.28)';
                } else {
                    ctx.fillStyle = 'rgba(60,45,35,0.55)';
                }
                ctx.fillRect(px, py, Math.max(1, cellW), Math.max(1, cellH));
            }
        }
    }

    if (record.ropesSnapshot && record.ropesSnapshot.length > 0) {
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = 'rgba(140,70,25,0.85)';
        ctx.lineWidth = Math.max(1, cellW * 0.8);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const rope of record.ropesSnapshot) {
            if (!rope.path || rope.path.length < 2) continue;
            ctx.beginPath();
            for (let i = 0; i < rope.path.length; i++) {
                const pt = rope.path[i];
                const px = mapX + (pt.x / maze.mazeTileSize) * cellW;
                const py = mapY + (pt.y / maze.mazeTileSize) * cellH;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
    }

    if (record.playerPath && record.playerPath.length > 0) {
        const pathLen = record.playerPath.length;
        const animDuration = 90;
        const animProgress = Math.min(1, Math.max(0, maze.shoreMapAnimTimer / animDuration));
        const drawCount = Math.max(1, Math.floor(pathLen * animProgress));
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = 'rgba(200,140,40,0.45)';
        ctx.lineWidth = Math.max(1.8, cellW * 1.4);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < drawCount; i++) {
            const pt = record.playerPath[i];
            const px = mapX + (pt.x / maze.mazeTileSize) * cellW;
            const py = mapY + (pt.y / maze.mazeTileSize) * cellH;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(130,60,20,0.9)';
        ctx.lineWidth = Math.max(1, cellW * 0.9);
        ctx.beginPath();
        for (let i = 0; i < drawCount; i++) {
            const pt = record.playerPath[i];
            const px = mapX + (pt.x / maze.mazeTileSize) * cellW;
            const py = mapY + (pt.y / maze.mazeTileSize) * cellH;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        if (animProgress < 1 && drawCount > 0) {
            const lastPt = record.playerPath[drawCount - 1];
            const lpx = mapX + (lastPt.x / maze.mazeTileSize) * cellW;
            const lpy = mapY + (lastPt.y / maze.mazeTileSize) * cellH;
            const pulse = 0.5 + Math.sin(time * 6) * 0.5;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = 'rgba(130,60,20,1)';
            ctx.beginPath();
            ctx.arc(lpx, lpy, Math.max(2, cellW * 1.8), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    {
        const exitMX = mapX + (maze.exitX / maze.mazeTileSize) * cellW;
        const exitMY = mapY + (maze.exitY / maze.mazeTileSize) * cellH;
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = 'rgba(40,120,60,0.95)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(exitMX, exitMY, Math.max(4, cellW * 2.2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(40,120,60,0.65)';
        ctx.beginPath();
        ctx.arc(exitMX, exitMY, Math.max(2, cellW * 1.3), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(40,120,60,0.95)';
        ctx.font = 'italic 10px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('出口', exitMX, exitMY - 12);
    }

    if (record.npcFoundAtEnd) {
        const npcMX = mapX + (maze.npcInitX / maze.mazeTileSize) * cellW;
        const npcMY = mapY + (maze.npcInitY / maze.mazeTileSize) * cellH;
        const rescued = record.returnReason === 'rescued';
        const col = rescued ? 'rgba(40,120,60,0.95)' : 'rgba(170,40,30,0.95)';
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(npcMX - 6, npcMY - 6);
        ctx.lineTo(npcMX + 6, npcMY + 6);
        ctx.moveTo(npcMX + 6, npcMY - 6);
        ctx.lineTo(npcMX - 6, npcMY + 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(npcMX, npcMY, Math.max(5, cellW * 2.4), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.font = 'italic 10px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(rescued ? '已救出' : '被困者', npcMX, npcMY - 14);
    }

    const infoBarY = ch - 32;
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.textAlign = 'center';
    const minutes = Math.floor(record.duration / 60);
    const seconds = record.duration % 60;
    const reasonText = record.returnReason === 'retreat' ? '主动撤离' :
                      record.returnReason === 'o2' ? '氧气耗尽' :
                      record.returnReason === 'rescued' ? '救援成功' :
                      record.returnReason === 'fishkill' ? '被食人鱼袭击' : '返回';
    ctx.fillText(`${reasonText} · 用时 ${minutes}:${seconds < 10 ? '0' + seconds : seconds} · 深度 ${record.maxDepth}m · 新探索 +${record.newExploredCount} · 绳索 +${record.ropePlaced}`, cw / 2, infoBarY);

    maze.shoreMapAnimTimer = (maze.shoreMapAnimTimer || 0) + 1;
}

// 注意：原 RenderMazeUI.ts 中的 drawMazeMapFullscreenLegacy（~470 行铅笔素描方案）在实际运行路径下未被调用，
// 拆分时按"不搬无调用的死代码"原则舍弃；如需恢复可到历史 commit 中取回。
