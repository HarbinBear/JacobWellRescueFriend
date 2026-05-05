// 迷宫结算页 + 入水动效
// 从原 RenderMazeUI.ts 抽出；调用方仅 RenderMazeUI.drawMazeHUD。
// 依赖：CONFIG / state / ctx / logicW / logicH / getMazeMainThemeConfig

import { state } from '../../core/state';
import { ctx } from '../Canvas';
import { getMazeMainThemeConfig } from '../../world/mazeScene';

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
// 入水动效绘制：完全照搬剧情模式（state.transition）的气泡转场观感
// - 200 个气泡随机撒在全屏，速度方向为"从屏幕中心指向自己位置"，持续向外飘散并回绕
// - 气泡造型：纯白主体 + 左上角高亮小点（alpha 比主体大 1.5 倍）
// - 背景：rgba(0,60,100) 半透明覆盖，浓度跟随 alpha（和剧情模式 in 模式一致）
// - 节奏：90 帧总长，前 50 帧 alpha 从 0 渐入到 1，后 40 帧保持 1，到 90 帧后 phase 切 play 瞬接水下场景
// =============================================
export function drawMazeDivingIn(maze: any, cw: number, ch: number, time: number) {
    const timer = maze.divingInTimer;
    const inFrames = 50;

    const alpha = Math.min(1, timer / inFrames);

    const bubbles = maze.divingInBubbles;
    if (!bubbles || bubbles.length === 0) {
        ctx.fillStyle = `rgba(0, 60, 100, ${alpha})`;
        ctx.fillRect(0, 0, cw, ch);
        return;
    }

    ctx.fillStyle = `rgba(0, 60, 100, ${alpha})`;
    ctx.fillRect(0, 0, cw, ch);

    for (const b of bubbles) {
        b.x += b.vx;
        b.y += b.vy;

        b.wobble += 0.1;
        b.x += Math.sin(b.wobble) * 0.5;

        b.vx *= 0.98;
        b.vy *= 0.98;

        if (b.y < -100) b.y = ch + 100;
        if (b.y > ch + 100) b.y = -100;
        if (b.x < -100) b.x = cw + 100;
        if (b.x > cw + 100) b.x = -100;
    }

    for (const b of bubbles) {
        let bodyA = alpha * 0.6;
        if (bodyA > 1) bodyA = 1;

        ctx.fillStyle = `rgba(255, 255, 255, ${bodyA})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fill();

        let highA = bodyA * 1.5;
        if (highA > 1) highA = 1;
        ctx.fillStyle = `rgba(255, 255, 255, ${highA})`;
        ctx.beginPath();
        ctx.arc(b.x - b.size * 0.3, b.y - b.size * 0.3, b.size * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// =============================================
// 迷宫结算界面（探路返回 / 救援成功）
// =============================================
export function drawMazeDebrief(maze: any, cw: number, ch: number, time: number) {
    const isRescueSuccess = maze.phase === 'rescued';
    const showAlpha = Math.min(1, maze.resultTimer / 30);

    ctx.globalAlpha = showAlpha;
    const bgGrad = ctx.createLinearGradient(0, 0, 0, ch);
    if (isRescueSuccess) {
        bgGrad.addColorStop(0, 'rgba(0,25,20,0.96)');
        bgGrad.addColorStop(1, 'rgba(0,15,10,0.98)');
    } else {
        bgGrad.addColorStop(0, 'rgba(8,18,35,0.96)');
        bgGrad.addColorStop(1, 'rgba(4,10,20,0.98)');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cw, ch);

    ctx.globalAlpha = showAlpha;
    ctx.textAlign = 'center';

    const titleY = ch * 0.08 + 24;
    const lastDive = maze.diveHistory.length > 0 ? maze.diveHistory[maze.diveHistory.length - 1] : null;
    if (isRescueSuccess) {
        ctx.fillStyle = 'rgba(80,255,180,0.95)';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('救援成功', cw / 2, titleY);
    } else {
        const reason = lastDive ? lastDive.returnReason : 'retreat';
        ctx.fillStyle = reason === 'o2' ? 'rgba(255,180,80,0.95)' :
                        reason === 'fishkill' ? 'rgba(255,100,100,0.95)' : 'rgba(160,210,255,0.95)';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(reason === 'o2' ? '氧气不足' :
                     reason === 'fishkill' ? '被食人鱼袭击' : '安全返回', cw / 2, titleY);
    }

    const mapPadding = 28;
    const mapTopY = titleY + 40;
    const statsAreaH = lastDive ? 130 : 40;
    const btnAreaH = 90;
    const mapAvailH = ch - mapTopY - statsAreaH - btnAreaH - mapPadding * 2;
    const mapAvailW = cw - mapPadding * 6;

    const cols = maze.mazeCols;
    const rows = maze.mazeRows;
    const mapRatio = cols / rows;
    const areaRatio = mapAvailW / mapAvailH;
    let mapW: number, mapH: number;
    if (mapRatio > areaRatio) {
        mapW = mapAvailW;
        mapH = mapW / mapRatio;
    } else {
        mapH = mapAvailH;
        mapW = mapH * mapRatio;
    }
    const mapX = (cw - mapW) / 2;
    const mapY = mapTopY + (mapAvailH - mapH) / 2;
    const cellW = mapW / cols;
    const cellH = mapH / rows;

    const mapInnerPad = 10;
    ctx.globalAlpha = showAlpha * 0.95;
    ctx.fillStyle = 'rgba(5,12,25,0.9)';
    ctx.beginPath();
    rrect(ctx, mapX - mapInnerPad, mapY - mapInnerPad, mapW + mapInnerPad * 2, mapH + mapInnerPad * 2, 10);
    ctx.fill();
    ctx.strokeStyle = isRescueSuccess ? 'rgba(60,200,140,0.25)' : 'rgba(60,120,180,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, mapX - mapInnerPad, mapY - mapInnerPad, mapW + mapInnerPad * 2, mapH + mapInnerPad * 2, 10);
    ctx.stroke();

    ctx.globalAlpha = showAlpha * 0.9;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!maze.mazeExplored[r] || !maze.mazeExplored[r][c]) continue;
            const cell = maze.mazeMap[r][c];
            const px = mapX + c * cellW;
            const py = mapY + r * cellH;
            if (cell === 0) {
                const isNew = maze.thisExploredBefore && maze.thisExploredBefore[r] && !maze.thisExploredBefore[r][c];
                ctx.fillStyle = isNew ? 'rgba(80,190,255,0.85)' : 'rgba(35,65,90,0.65)';
            } else {
                ctx.fillStyle = 'rgba(20,30,40,0.85)';
            }
            ctx.fillRect(px, py, Math.max(1, cellW), Math.max(1, cellH));
        }
    }

    if (state.rope && state.rope.ropes && state.rope.ropes.length > 0) {
        ctx.globalAlpha = showAlpha * 0.65;
        ctx.strokeStyle = 'rgba(255,180,80,0.75)';
        ctx.lineWidth = Math.max(1, cellW * 0.8);
        for (const rope of state.rope.ropes) {
            if (!rope.path || rope.path.length < 2) continue;
            ctx.beginPath();
            const startPt = rope.path[0];
            ctx.moveTo(mapX + (startPt.x / maze.mazeTileSize) * cellW,
                       mapY + (startPt.y / maze.mazeTileSize) * cellH);
            for (let i = 1; i < rope.path.length; i++) {
                const pt = rope.path[i];
                ctx.lineTo(mapX + (pt.x / maze.mazeTileSize) * cellW,
                           mapY + (pt.y / maze.mazeTileSize) * cellH);
            }
            ctx.stroke();
        }
    }

    if (maze.playerPath && maze.playerPath.length > 0) {
        const pathLen = maze.playerPath.length;
        const animDuration = 90;
        const animProgress = Math.min(1, Math.max(0, (maze.resultTimer - 30) / animDuration));
        const drawCount = Math.floor(pathLen * animProgress);
        ctx.globalAlpha = showAlpha * 0.85;
        ctx.strokeStyle = 'rgba(255,220,80,0.8)';
        ctx.lineWidth = Math.max(1.5, cellW * 1.2);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < drawCount; i++) {
            const pt = maze.playerPath[i];
            const px = mapX + (pt.x / maze.mazeTileSize) * cellW;
            const py = mapY + (pt.y / maze.mazeTileSize) * cellH;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        if (drawCount > 0) {
            const lastPt = maze.playerPath[drawCount - 1];
            const lpx = mapX + (lastPt.x / maze.mazeTileSize) * cellW;
            const lpy = mapY + (lastPt.y / maze.mazeTileSize) * cellH;
            const pulse = 0.5 + Math.sin(time * 4) * 0.5;
            ctx.globalAlpha = showAlpha * pulse;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(lpx, lpy, Math.max(2, cellW * 2), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const exitMX = mapX + (maze.exitX / maze.mazeTileSize) * cellW;
    const exitMY = mapY + (maze.exitY / maze.mazeTileSize) * cellH;
    ctx.globalAlpha = showAlpha * 0.85;
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(exitMX, exitMY, Math.max(3, cellW * 2), 0, Math.PI * 2);
    ctx.fill();

    if (maze.npcFound) {
        const npcMX = mapX + (maze.npcInitX / maze.mazeTileSize) * cellW;
        const npcMY = mapY + (maze.npcInitY / maze.mazeTileSize) * cellH;
        ctx.fillStyle = isRescueSuccess ? '#0f8' : '#f44';
        ctx.beginPath();
        ctx.arc(npcMX, npcMY, Math.max(3, cellW * 2), 0, Math.PI * 2);
        ctx.fill();
    }

    if (lastDive) {
        const statsY = mapY + mapH + 36;
        ctx.globalAlpha = showAlpha * 0.9;
        ctx.textAlign = 'center';

        const statItems: {label: string; value: string}[] = [];
        const minutes = Math.floor(lastDive.duration / 60);
        const seconds = lastDive.duration % 60;
        statItems.push({ label: '用时', value: `${minutes}:${seconds < 10 ? '0' + seconds : seconds}` });
        statItems.push({ label: '深度', value: `${lastDive.maxDepth}m` });
        statItems.push({ label: '探索', value: `+${lastDive.newExploredCount}` });
        statItems.push({ label: '绳索', value: `+${lastDive.ropePlaced}` });

        const statW = cw / statItems.length;
        for (let i = 0; i < statItems.length; i++) {
            const sx = statW * i + statW / 2;
            ctx.fillStyle = isRescueSuccess ? 'rgba(120,255,200,0.95)' : 'rgba(160,210,255,0.95)';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(statItems[i].value, sx, statsY + 4);
            ctx.fillStyle = 'rgba(120,160,200,0.5)';
            ctx.font = '10px Arial';
            ctx.fillText(statItems[i].label, sx, statsY + 18);
        }

        let tipY = statsY + 36;
        if (maze.npcFound && lastDive.returnReason !== 'rescued') {
            ctx.fillStyle = 'rgba(255,220,80,0.85)';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('已发现被困者位置', cw / 2, tipY);
            tipY += 18;
        }
        if (maze.thisNewThemes && maze.thisNewThemes.length > 0) {
            ctx.font = '11px Arial';
            const themeNames = maze.thisNewThemes.map((tKey: string) => {
                const tCfg = getMazeMainThemeConfig(tKey);
                return tCfg ? tCfg.name : tKey;
            }).join('、');
            ctx.fillStyle = 'rgba(160,200,240,0.7)';
            ctx.fillText(`新发现：${themeNames}`, cw / 2, tipY);
        }
    }

    if (maze.resultTimer >= 60) {
        const btnAlpha = Math.min(1, (maze.resultTimer - 60) / 20);
        ctx.globalAlpha = showAlpha * btnAlpha;

        const btnY = ch - 50;
        const btnW = cw * 0.55;
        const btnH = 44;
        const btnX = (cw - btnW) / 2;

        if (isRescueSuccess) {
            const btnGrad = ctx.createLinearGradient(btnX, btnY - btnH / 2, btnX + btnW, btnY - btnH / 2);
            btnGrad.addColorStop(0, 'rgba(20,100,80,0.85)');
            btnGrad.addColorStop(1, 'rgba(30,130,100,0.85)');
            ctx.fillStyle = btnGrad;
            ctx.beginPath();
            rrect(ctx, btnX, btnY - btnH / 2, btnW, btnH, 22);
            ctx.fill();
            ctx.fillStyle = 'rgba(120,255,200,0.95)';
            ctx.font = 'bold 15px Arial';
            ctx.textBaseline = 'middle';
            ctx.fillText('继续 ▶', cw / 2, btnY);
            ctx.textBaseline = 'alphabetic';

            const tapAlpha = 0.4 + Math.sin(time * 2.5) * 0.3;
            ctx.globalAlpha = showAlpha * btnAlpha * tapAlpha;
            ctx.fillStyle = 'rgba(120,160,180,0.6)';
            ctx.font = '11px Arial';
            ctx.fillText('点击继续查看案件结案', cw / 2, ch - 14);
        } else {
            const btnGrad = ctx.createLinearGradient(btnX, btnY - btnH / 2, btnX + btnW, btnY - btnH / 2);
            btnGrad.addColorStop(0, 'rgba(20,70,140,0.85)');
            btnGrad.addColorStop(1, 'rgba(30,90,170,0.85)');
            ctx.fillStyle = btnGrad;
            ctx.beginPath();
            rrect(ctx, btnX, btnY - btnH / 2, btnW, btnH, 22);
            ctx.fill();
            ctx.fillStyle = 'rgba(180,220,255,0.95)';
            ctx.font = 'bold 15px Arial';
            ctx.textBaseline = 'middle';
            ctx.fillText('回到岸上', cw / 2, btnY);
            ctx.textBaseline = 'alphabetic';
        }
    }
}
