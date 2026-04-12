import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { getMazeSceneThemeConfigByIndex, getMazeMainThemeConfig } from '../world/mazeScene';
import { getMazeThemeLegendItems } from './RenderMazeScene';

// 兼容微信小游戏的圆角矩形
function rrect(c, x, y, w, h, r) {
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

export function drawMazeHUD() {
    const maze = state.mazeRescue;
    if (!maze) return;

    const cw = logicW;
    const ch = logicH;
    const time = Date.now() / 1000;

    ctx.save();

    // === 岸上阶段 ===
    if (maze.phase === 'shore') {
        drawMazeShore(maze, cw, ch, time);
        ctx.restore();
        return;
    }

    // === 入水动效阶段 ===
    if (maze.phase === 'diving_in') {
        drawMazeDivingIn(maze, cw, ch, time);
        ctx.restore();
        return;
    }

    // === 结算界面（探路返回 / 救援成功） ===
    if (maze.phase === 'debrief' || maze.phase === 'rescued') {
        drawMazeDebrief(maze, cw, ch, time);
        ctx.restore();
        return;
    }

    // === 上浮动画阶段 ===
    if (maze.phase === 'surfacing') {
        const progress = Math.min(1, maze.resultTimer / 60);
        ctx.globalAlpha = progress * 0.6;
        ctx.fillStyle = 'rgba(200,230,255,1)';
        ctx.fillRect(0, 0, cw, ch);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#aef';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('上浮中...', cw / 2, ch / 2);
        ctx.restore();
        return;
    }

    // === 游戏中 HUD ===

    // --- 深度 + 氧气一体化面板（左上角，简约胶囊风格） ---
    const o2Ratio = Math.max(0, player.o2 / 100);
    const depth = Math.max(0, Math.floor(player.y / maze.mazeTileSize));

    // 面板参数
    const panelW = 56;
    const panelH = 110;
    const panelX = 10;
    const panelY = 12;
    const panelR = 16;

    // 面板背景（半透明深色胶囊）
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(8,20,35,0.85)';
    ctx.beginPath();
    rrect(ctx, panelX, panelY, panelW, panelH, panelR);
    ctx.fill();
    // 面板边框
    ctx.strokeStyle = 'rgba(80,160,220,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, panelX, panelY, panelW, panelH, panelR);
    ctx.stroke();

    // 深度数字（大号）
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(160,220,255,0.95)';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${depth}`, panelX + panelW / 2, panelY + 30);
    // 深度单位
    ctx.fillStyle = 'rgba(120,180,220,0.6)';
    ctx.font = '10px Arial';
    ctx.fillText('m', panelX + panelW / 2, panelY + 42);

    // 分割线
    ctx.strokeStyle = 'rgba(80,160,220,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(panelX + 10, panelY + 50);
    ctx.lineTo(panelX + panelW - 10, panelY + 50);
    ctx.stroke();

    // 氧气环形指示器
    const o2CenterX = panelX + panelW / 2;
    const o2CenterY = panelY + 76;
    const o2Radius = 18;
    const o2LineW = 3;
    // 氧气颜色
    const o2Color = o2Ratio > 0.5 ? 'rgba(80,200,255,0.9)' :
                    o2Ratio > 0.25 ? 'rgba(255,200,80,0.9)' : 'rgba(255,80,80,0.9)';
    // 背景环
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = 'rgba(60,100,140,0.4)';
    ctx.lineWidth = o2LineW;
    ctx.beginPath();
    ctx.arc(o2CenterX, o2CenterY, o2Radius, 0, Math.PI * 2);
    ctx.stroke();
    // 氧气进度环（从顶部顺时针）
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = o2Color;
    ctx.lineWidth = o2LineW;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(o2CenterX, o2CenterY, o2Radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * o2Ratio);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // 氧气百分比数字
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = o2Color;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(player.o2)}`, o2CenterX, o2CenterY + 4);
    // 低氧闪烁警告
    if (o2Ratio <= 0.25) {
        const blink = Math.sin(time * 6) > 0 ? 0.8 : 0.3;
        ctx.globalAlpha = blink;
        ctx.strokeStyle = 'rgba(255,60,60,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(o2CenterX, o2CenterY, o2Radius + 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    // NPC 救援提示（靠近NPC时显示，发现后即可绑绳）
    if (!maze.npcRescued && state.npc.active) {
        const distToNpc = Math.hypot(player.x - state.npc.x, player.y - state.npc.y);
        if (distToNpc < CONFIG.maze.npcRescueRange) {
            ctx.globalAlpha = 0.9;
            ctx.textAlign = 'center';
            if (maze.npcRescueHolding) {
                const elapsed = (Date.now() - maze.npcRescueHoldStart) / 1000;
                const progress = Math.min(1, elapsed / CONFIG.maze.npcRescueHoldDuration);
                const zoom = state.camera ? state.camera.zoom : 1;
                const npcScreenX = cw / 2 + (state.npc.x - player.x) * zoom;
                const npcScreenY = ch / 2 + (state.npc.y - player.y) * zoom;
                ctx.strokeStyle = 'rgba(0,255,150,0.9)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(npcScreenX, npcScreenY - 40, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                ctx.stroke();
                ctx.fillStyle = 'rgba(0,255,150,0.9)';
                ctx.font = 'bold 13px Arial';
                ctx.fillText('绑绳中...', npcScreenX, npcScreenY - 70);
            } else {
                ctx.fillStyle = 'rgba(200,255,200,0.9)';
                ctx.font = '13px Arial';
                ctx.fillText('长按绑绳', cw / 2, ch * 0.85);
            }
        }
    }

    // 侦察下潜时靠近NPC的提示（未发现时）
    if (!maze.npcFound && state.npc.active) {
        const distToNpc = Math.hypot(player.x - state.npc.x, player.y - state.npc.y);
        if (distToNpc < CONFIG.maze.npcRescueRange * 2) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('发现被困者！记住位置！', cw / 2, ch * 0.85);
        }
    }

    // NPC 已跟随提示
    if (maze.npcRescued) {
        const distToExit = Math.hypot(player.x - maze.exitX, player.y - maze.exitY);
        if (distToExit < maze.mazeTileSize * 8) {
            const pulse = 0.7 + Math.sin(time * 4) * 0.3;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#0f8';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('↑ 出口就在上方！', cw / 2, ch * 0.15);
        }
    }

    // 撤离按钮（未带人时可用，左下角，简约上箭头风格）
    if (!maze.npcRescued) {
        const retreatBtnX = cw * CONFIG.maze.retreatBtnXRatio;
        const retreatBtnY = ch * CONFIG.maze.retreatBtnYRatio;
        const retreatR = CONFIG.maze.retreatBtnRadius;

        // 长按进度
        let retreatProgress = 0;
        if (maze.retreatHolding) {
            const elapsed = (Date.now() - maze.retreatHoldStart) / 1000;
            retreatProgress = Math.min(1, elapsed / CONFIG.maze.retreatHoldDuration);
        }

        // 按钮底色（磨砂玻璃感）
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = retreatProgress > 0 ? 'rgba(40,120,100,0.8)' : 'rgba(15,35,50,0.75)';
        ctx.beginPath();
        ctx.arc(retreatBtnX, retreatBtnY, retreatR, 0, Math.PI * 2);
        ctx.fill();

        // 外圈（静态细线）
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(100,200,220,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(retreatBtnX, retreatBtnY, retreatR, 0, Math.PI * 2);
        ctx.stroke();

        // 长按进度环
        if (retreatProgress > 0) {
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = 'rgba(80,255,200,0.85)';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(retreatBtnX, retreatBtnY, retreatR - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * retreatProgress);
            ctx.stroke();
            ctx.lineCap = 'butt';
        }

        // 上箭头图标（简洁三角 + 短线）
        ctx.globalAlpha = retreatProgress > 0 ? 0.95 : 0.75;
        ctx.fillStyle = retreatProgress > 0 ? 'rgba(150,255,220,0.95)' : 'rgba(150,210,230,0.85)';
        ctx.beginPath();
        ctx.moveTo(retreatBtnX, retreatBtnY - 12);
        ctx.lineTo(retreatBtnX - 6, retreatBtnY - 5);
        ctx.lineTo(retreatBtnX + 6, retreatBtnY - 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(retreatBtnX, retreatBtnY - 4);
        ctx.lineTo(retreatBtnX, retreatBtnY + 4);
        ctx.stroke();
        // "撤离"文字
        ctx.fillStyle = retreatProgress > 0 ? 'rgba(150,255,220,0.95)' : 'rgba(150,210,230,0.75)';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('撤离', retreatBtnX, retreatBtnY + 16);
    }

    // 小地图（仅调试模式显示，左上角面板下方，可折叠）
    if (CONFIG.debug) {
        drawMazeMinimap(maze, cw, ch, time, 130);
    }

    ctx.restore();
}

// 迷宫小地图绘制
function drawMazeMinimap(maze: any, cw: number, ch: number, time: number, yOffset: number = 0) {
    const mapSize = CONFIG.maze.minimapSize;
    const mapX = CONFIG.maze.minimapX;
    const mapY = CONFIG.maze.minimapY + yOffset;
    const toggleBtnSize = 28;

    // 折叠/展开按钮（左上角小图标）
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    rrect(ctx, mapX, mapY, toggleBtnSize, toggleBtnSize, 6);
    ctx.fill();
    ctx.fillStyle = maze.minimapExpanded ? '#0f8' : '#aef';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(maze.minimapExpanded ? '▼' : '▶', mapX + toggleBtnSize / 2, mapY + toggleBtnSize / 2 + 5);

    if (!maze.minimapExpanded) return;

    // 展开状态：绘制小地图
    const cols = maze.mazeCols;
    const rows = maze.mazeRows;
    const cellW = mapSize / cols;
    const cellH = mapSize / rows;

    ctx.globalAlpha = 0.85;
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    rrect(ctx, mapX, mapY + toggleBtnSize + 4, mapSize, mapSize, 4);
    ctx.fill();

    // 绘制已探索区域
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!maze.mazeExplored[r] || !maze.mazeExplored[r][c]) continue;
            const cell = maze.mazeMap[r][c];
            const px = mapX + c * cellW;
            const py = mapY + toggleBtnSize + 4 + r * cellH;
            if (cell === 0) {
                ctx.fillStyle = 'rgba(80,120,160,0.8)';
            } else {
                ctx.fillStyle = 'rgba(30,40,50,0.9)';
            }
            ctx.fillRect(px, py, Math.max(1, cellW), Math.max(1, cellH));
        }
    }

    // 出口标记
    const exitMapX = mapX + (maze.exitX / maze.mazeTileSize) * cellW;
    const exitMapY = mapY + toggleBtnSize + 4 + (maze.exitY / maze.mazeTileSize) * cellH;
    ctx.fillStyle = '#0f8';
    ctx.beginPath();
    ctx.arc(exitMapX, exitMapY, 3, 0, Math.PI * 2);
    ctx.fill();

    // NPC 标记
    if (state.npc.active) {
        const npcMapX = mapX + (state.npc.x / maze.mazeTileSize) * cellW;
        const npcMapY = mapY + toggleBtnSize + 4 + (state.npc.y / maze.mazeTileSize) * cellH;
        ctx.fillStyle = maze.npcRescued ? '#0f8' : '#ff0';
        ctx.beginPath();
        ctx.arc(npcMapX, npcMapY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // 玩家标记（闪烁）
    const playerMapX = mapX + (player.x / maze.mazeTileSize) * cellW;
    const playerMapY = mapY + toggleBtnSize + 4 + (player.y / maze.mazeTileSize) * cellH;
    const pulse = 0.6 + Math.sin(time * 5) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(playerMapX, playerMapY, 3, 0, Math.PI * 2);
    ctx.fill();

    // 绳索路径（已完成的绳索）
    if (state.rope && state.rope.ropes && state.rope.ropes.length > 0) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = 'rgba(255,200,100,0.8)';
        ctx.lineWidth = 1;
        for (const rope of state.rope.ropes) {
            if (!rope.path || rope.path.length < 2) continue;
            ctx.beginPath();
            const startPt = rope.path[0];
            ctx.moveTo(mapX + (startPt.x / maze.mazeTileSize) * cellW,
                       mapY + toggleBtnSize + 4 + (startPt.y / maze.mazeTileSize) * cellH);
            for (let i = 1; i < rope.path.length; i++) {
                const pt = rope.path[i];
                ctx.lineTo(mapX + (pt.x / maze.mazeTileSize) * cellW,
                           mapY + toggleBtnSize + 4 + (pt.y / maze.mazeTileSize) * cellH);
            }
            ctx.stroke();
        }
    }
}

// =============================================
// 岸上界面绘制
// =============================================
function drawMazeShore(maze: any, cw: number, ch: number, time: number) {
    // === 全屏地图查看页面 ===
    if (maze.shoreMapOpen) {
        drawMazeMapFullscreen(maze, cw, ch, time);
        return;
    }

    // === 背景：绿草地、阳光、树林 ===

    // 天空渐变
    const skyGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.4);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(0.5, '#B0E0FF');
    skyGrad.addColorStop(1, '#E8F5E9');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, cw, ch * 0.4);

    // 太阳
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

    // 远处树林（多层圆形树冠，底部与草地衔接）
    const treeLine = ch * 0.38; // 树林底部与草地齐平
    ctx.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
        const tx = (i * cw / 12) - 10 + Math.sin(i * 1.5) * 8;
        const treeH = 40 + Math.sin(i * 3.7) * 12;
        const crownR = 18 + Math.sin(i * 2.1) * 6;
        // 树干
        ctx.fillStyle = `rgba(${70 + i * 3},${50 + i * 2},${30},0.5)`;
        ctx.fillRect(tx - 2, treeLine - treeH * 0.4, 4, treeH * 0.5);
        // 树冠（多层圆形，颜色深浅交替）
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

    // 近处树林（更大更清晰，底部与草地齐平）
    ctx.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
        const tx = (i * cw / 6) - 15 + Math.sin(i * 2.1) * 5;
        const treeH = 65 + Math.sin(i * 4.2) * 15;
        const crownR = 22 + Math.sin(i * 3.3) * 8;
        const sway = Math.sin(time * 0.8 + i * 1.2) * 2;
        // 树干
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(tx - 3, treeLine - treeH * 0.35, 6, treeH * 0.45);
        // 主树冠
        ctx.fillStyle = `rgba(${35 + i * 6},${100 + i * 10},${40 + i * 4},0.85)`;
        ctx.beginPath();
        ctx.arc(tx + sway, treeLine - treeH * 0.5, crownR, 0, Math.PI * 2);
        ctx.fill();
        // 副树冠（左右偏移，增加层次）
        ctx.fillStyle = `rgba(${45 + i * 5},${120 + i * 8},${50 + i * 3},0.7)`;
        ctx.beginPath();
        ctx.arc(tx + sway - crownR * 0.5, treeLine - treeH * 0.45, crownR * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tx + sway + crownR * 0.5, treeLine - treeH * 0.42, crownR * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // 高光
        ctx.fillStyle = `rgba(${80 + i * 5},${160 + i * 6},${70 + i * 4},0.3)`;
        ctx.beginPath();
        ctx.arc(tx + sway - crownR * 0.2, treeLine - treeH * 0.58, crownR * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    // 草地
    const grassGrad = ctx.createLinearGradient(0, ch * 0.38, 0, ch);
    grassGrad.addColorStop(0, '#66BB6A');
    grassGrad.addColorStop(0.3, '#4CAF50');
    grassGrad.addColorStop(1, '#388E3C');
    ctx.globalAlpha = 1;
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, ch * 0.38, cw, ch * 0.62);

    // 草地纹理（小草丛，更密集更自然）
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 50; i++) {
        const gx = (i * cw / 45) + Math.sin(i * 3.1) * 12;
        const gy = ch * 0.39 + (i % 7) * ch * 0.06 + Math.sin(i * 2.7) * 6;
        const sway = Math.sin(time * 1.5 + i * 0.8) * 3;
        const grassH = 10 + Math.sin(i * 1.9) * 6;
        // 每丛2~3根草
        for (let j = -1; j <= 1; j++) {
            ctx.strokeStyle = `rgba(${80 + j * 10},${150 + i % 30},${60 + j * 5},0.6)`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(gx + j * 3, gy);
            ctx.quadraticCurveTo(gx + j * 3 + sway + j * 2, gy - grassH * 0.6, gx + sway * 1.5 + j * 4, gy - grassH);
            ctx.stroke();
        }
    }

    // 小花朵（散落在草地上）
    ctx.globalAlpha = 0.8;
    const flowerColors = ['#FF6B6B', '#FFD93D', '#FF8CC8', '#FFA07A', '#DDA0DD', '#87CEEB'];
    for (let i = 0; i < 18; i++) {
        const fx = cw * 0.05 + (i * cw / 16) + Math.sin(i * 4.3) * 15;
        const fy = ch * 0.41 + (i % 5) * ch * 0.07 + Math.sin(i * 3.1) * 8;
        const fSize = 3 + Math.sin(i * 2.7) * 1.5;
        const fColor = flowerColors[i % flowerColors.length];
        // 花瓣（4~5个小圆）
        ctx.fillStyle = fColor;
        for (let p = 0; p < 5; p++) {
            const pa = (p / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(fx + Math.cos(pa) * fSize, fy + Math.sin(pa) * fSize, fSize * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
        // 花心
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(fx, fy, fSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    // 蝴蝶（2~3只，飘动）
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 3; i++) {
        const bx = cw * 0.2 + i * cw * 0.25 + Math.sin(time * 1.2 + i * 2.5) * 30;
        const by = ch * 0.32 + Math.sin(time * 0.8 + i * 1.8) * 20 + i * 15;
        const wingFlap = Math.sin(time * 8 + i * 3) * 0.5; // 翅膀扇动
        const bColor = i === 0 ? '#FF69B4' : i === 1 ? '#87CEEB' : '#FFD700';
        ctx.save();
        ctx.translate(bx, by);
        // 左翅
        ctx.fillStyle = bColor;
        ctx.beginPath();
        ctx.ellipse(-3, 0, 5, 3 + wingFlap * 2, -0.3 + wingFlap * 0.3, 0, Math.PI * 2);
        ctx.fill();
        // 右翅
        ctx.beginPath();
        ctx.ellipse(3, 0, 5, 3 + wingFlap * 2, 0.3 - wingFlap * 0.3, 0, Math.PI * 2);
        ctx.fill();
        // 身体
        ctx.fillStyle = '#333';
        ctx.fillRect(-0.5, -3, 1, 6);
        ctx.restore();
    }

    // 小鸟（远处天空飞过，V字形）
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

    // 水面入口（洞穴口）— 这是下潜按钮
    const poolX = cw * 0.5;
    const poolY = ch * 0.44;
    const poolW = 80;
    const poolH = 40;
    // 洞口光晕呼吸效果
    const poolPulse = 0.6 + Math.sin(time * 2) * 0.2;
    ctx.globalAlpha = poolPulse * 0.3;
    ctx.fillStyle = '#64B5F6';
    ctx.beginPath();
    ctx.ellipse(poolX, poolY, poolW + 12, poolH + 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // 洞口本体
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#1565C0';
    ctx.beginPath();
    ctx.ellipse(poolX, poolY, poolW, poolH, 0, 0, Math.PI * 2);
    ctx.fill();
    // 水面波纹
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#90CAF9';
    ctx.lineWidth = 1;
    for (let w = 0; w < 3; w++) {
        const waveR = 20 + w * 15 + Math.sin(time * 2 + w) * 5;
        ctx.beginPath();
        ctx.ellipse(poolX, poolY, waveR, waveR * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    // 洞口点击提示
    ctx.globalAlpha = 0.7 + Math.sin(time * 3) * 0.3;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 3;
    ctx.fillText('点击下潜 ▼', poolX, poolY + poolH + 20);
    ctx.shadowBlur = 0;

    // === 信息面板 ===
    ctx.globalAlpha = 1;

    // 标题
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText('岸上营地', cw / 2, ch * 0.06 + 20);
    ctx.shadowBlur = 0;

    // 返回按钮（左上角）
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    rrect(ctx, 8, 8, 64, 32, 16);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('← 返回', 40, 28);

    // 信息卡片背景（下半部分，不被地图遮挡）
    const cardX = cw * 0.06;
    const cardY = ch * 0.56;
    const cardW = cw * 0.88;
    const cardH = ch * 0.40;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(76,175,80,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.stroke();

    // 信息内容
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    const infoX = cardX + 16;
    let infoY = cardY + 24;
    ctx.fillText('探索记录', infoX, infoY);

    // 认知地图图标按钮（卡片右上角）
    const mapIconX = cardX + cardW - 44;
    const mapIconY = cardY + 8;
    const mapIconSize = 36;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(76,175,80,0.15)';
    ctx.beginPath();
    rrect(ctx, mapIconX, mapIconY, mapIconSize, mapIconSize, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(76,175,80,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, mapIconX, mapIconY, mapIconSize, mapIconSize, 8);
    ctx.stroke();
    ctx.fillStyle = '#4CAF50';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    // 用绘制方式画地图图标（避免emoji兼容问题）
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 1.5;
    // 折叠地图轮廓
    const mIcx = mapIconX + mapIconSize / 2;
    const mIcy = mapIconY + mapIconSize / 2;
    ctx.beginPath();
    ctx.moveTo(mIcx - 8, mIcy - 8);
    ctx.lineTo(mIcx - 2, mIcy - 5);
    ctx.lineTo(mIcx + 4, mIcy - 8);
    ctx.lineTo(mIcx + 8, mIcy - 5);
    ctx.lineTo(mIcx + 8, mIcy + 8);
    ctx.lineTo(mIcx + 2, mIcy + 5);
    ctx.lineTo(mIcx - 4, mIcy + 8);
    ctx.lineTo(mIcx - 8, mIcy + 5);
    ctx.closePath();
    ctx.stroke();
    // 地图上的路线标记
    ctx.beginPath();
    ctx.moveTo(mIcx - 4, mIcy - 2);
    ctx.lineTo(mIcx, mIcy + 2);
    ctx.lineTo(mIcx + 4, mIcy - 1);
    ctx.stroke();
    // 小圆点标记
    ctx.fillStyle = '#F44336';
    ctx.beginPath();
    ctx.arc(mIcx + 4, mIcy - 1, 2, 0, Math.PI * 2);
    ctx.fill();

    // 统计数据
    ctx.textAlign = 'left';
    ctx.font = '13px Arial';
    ctx.fillStyle = '#555';
    infoY += 28;
    ctx.fillText(`下潜次数：${maze.diveCount}`, infoX, infoY);
    ctx.fillText(`铺设绳索：${maze.totalRopePlaced} 段`, infoX + cardW * 0.5, infoY);
    infoY += 22;
    const maxDepthM = Math.floor(maze.maxDepthReached / maze.mazeTileSize);
    ctx.fillText(`最深到达：${maxDepthM}m`, infoX, infoY);
    ctx.fillText(`被困者：${maze.npcFound ? '[已发现]' : '[未发现]'}`, infoX + cardW * 0.5, infoY);

    // 上次下潜摘要
    if (maze.diveHistory.length > 0) {
        const lastDive = maze.diveHistory[maze.diveHistory.length - 1];
        infoY += 28;
        ctx.fillStyle = '#777';
        ctx.font = '12px Arial';
        const reasonText = lastDive.returnReason === 'retreat' ? '主动撤离' :
                          lastDive.returnReason === 'o2' ? '氧气不足' :
                          lastDive.returnReason === 'rescued' ? '救援成功' : '返回';
        ctx.fillText(`上次：${reasonText} | 深度${lastDive.maxDepth}m | 新探索${lastDive.newExploredCount}格`, infoX, infoY);
        infoY += 18;
        ctx.fillText(`      绳索+${lastDive.ropePlaced} | 用时${Math.floor(lastDive.duration / 60)}分${lastDive.duration % 60}秒`, infoX, infoY);
    }

    // 下潜提示（卡片底部）
    infoY = cardY + cardH - 20;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#888';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    if (maze.npcFound) {
        ctx.fillText('已发现被困者，下潜后可靠近长按绑绳救援', cw / 2, infoY);
    } else {
        ctx.fillText('点击水面入口开始下潜探索', cw / 2, infoY);
    }

    ctx.globalAlpha = 1;
}

// =============================================
// 全屏认知地图查看页面
// =============================================
function drawMazeMapFullscreen(maze: any, cw: number, ch: number, time: number) {
    // 背景（旧纸张质感）
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(235,225,200,1)';
    ctx.fillRect(0, 0, cw, ch);
    // 纸张纹理（随机斑点）
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 80; i++) {
        const sx = Math.sin(i * 7.3 + 0.5) * cw * 0.5 + cw * 0.5;
        const sy = Math.cos(i * 5.1 + 1.2) * ch * 0.5 + ch * 0.5;
        const sr = Math.abs(2 + Math.sin(i * 3.7) * 1.5);
        ctx.fillStyle = i % 3 === 0 ? '#8B7355' : '#A0926B';
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
    }
    // 纸张折痕
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = '#8B7355';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cw * 0.5, 0);
    ctx.lineTo(cw * 0.5, ch);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, ch * 0.5);
    ctx.lineTo(cw, ch * 0.5);
    ctx.stroke();

    // 标题（手写风格）
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#5D4037';
    ctx.font = 'italic bold 18px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('认知地图', cw / 2, 30);
    // 标题下划线（手绘波浪线）
    ctx.strokeStyle = 'rgba(93,64,55,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = cw * 0.3; x < cw * 0.7; x += 3) {
        const wy = 35 + Math.sin(x * 0.15) * 1.5;
        if (x === cw * 0.3) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
    }
    ctx.stroke();

    // 关闭提示
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#888';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText('点击任意位置关闭', cw / 2, ch - 16);

    // 地图区域计算
    const padding = 24;
    const mapAreaW = cw - padding * 2;
    const mapAreaH = ch - 80;
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
    const mapY = 50;
    const cellW = mapW / cols;
    const cellH = mapH / rows;

    // 纸张底色（带圆角和阴影）
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(240,232,215,1)';
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    rrect(ctx, mapX - 6, mapY - 6, mapW + 12, mapH + 12, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 地图边框（手绘不规则线条）
    ctx.strokeStyle = 'rgba(120,100,80,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // 上边
    for (let x = mapX - 4; x < mapX + mapW + 4; x += 4) {
        const jitter = Math.sin(x * 0.3) * 1.2;
        if (x === mapX - 4) ctx.moveTo(x, mapY - 4 + jitter);
        else ctx.lineTo(x, mapY - 4 + jitter);
    }
    // 右边
    for (let y = mapY - 4; y < mapY + mapH + 4; y += 4) {
        const jitter = Math.sin(y * 0.25) * 1.2;
        ctx.lineTo(mapX + mapW + 4 + jitter, y);
    }
    // 下边
    for (let x = mapX + mapW + 4; x > mapX - 4; x -= 4) {
        const jitter = Math.sin(x * 0.28) * 1.2;
        ctx.lineTo(x, mapY + mapH + 4 + jitter);
    }
    // 左边
    for (let y = mapY + mapH + 4; y > mapY - 4; y -= 4) {
        const jitter = Math.sin(y * 0.22) * 1.2;
        ctx.lineTo(mapX - 4 + jitter, y);
    }
    ctx.closePath();
    ctx.stroke();

    // 未探索区域底色（迷雾感）
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'rgba(200,190,170,0.5)';
    ctx.fillRect(mapX, mapY, mapW, mapH);
    // 未探索区域的问号标记
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#8B7355';
    ctx.font = '14px Georgia, serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 6; i++) {
        const qx = mapX + mapW * (0.15 + i * 0.15);
        const qy = mapY + mapH * (0.3 + Math.sin(i * 2.1) * 0.2);
        ctx.fillText('?', qx, qy);
    }

    // === 手绘风格：将已探索区域按区块绘制，带笔迹抖动 ===
    // 先用较大的采样步长扫描，画出不规则的区域轮廓
    const step = 2; // 每2格采样一次，让线条更粗犷
    ctx.globalAlpha = 0.7;

    // 绘制已探索的水域区域（蓝色水彩笔触）
    for (let r = 0; r < rows; r += step) {
        for (let c = 0; c < cols; c += step) {
            // 检查这个区块是否有已探索的格子
            let hasExplored = false;
            let isWater = false;
            for (let dr = 0; dr < step && r + dr < rows; dr++) {
                for (let dc = 0; dc < step && c + dc < cols; dc++) {
                    if (maze.mazeExplored[r + dr] && maze.mazeExplored[r + dr][c + dc]) {
                        hasExplored = true;
                        if (maze.mazeMap[r + dr][c + dc] === 0) isWater = true;
                    }
                }
            }
            if (!hasExplored) continue;

            const px = mapX + c * cellW;
            const py = mapY + r * cellH;
            const bw = step * cellW;
            const bh = step * cellH;
            // 手绘抖动偏移
            const jx = Math.sin(r * 3.7 + c * 2.1) * 1.5;
            const jy = Math.cos(r * 2.3 + c * 4.1) * 1.5;

            if (isWater) {
                // 水域：根据区域主题着色
                let waterColor = `rgba(${120 + Math.sin(r + c) * 20},${175 + Math.sin(r * 2) * 15},${210 + Math.cos(c * 3) * 10},0.55)`;
                if (maze.sceneThemeMap) {
                    const tIdx = maze.sceneThemeMap[r] ? maze.sceneThemeMap[r][c] : -1;
                    const tCfg = getMazeSceneThemeConfigByIndex(maze.sceneThemeKeys, tIdx);
                    if (tCfg) waterColor = tCfg.mapColor;
                }
                ctx.fillStyle = waterColor;
                ctx.beginPath();
                ctx.moveTo(px + jx + 1, py + jy + 1);
                ctx.lineTo(px + bw + jx - 1 + Math.sin(r) * 0.8, py + jy + Math.cos(c) * 0.8);
                ctx.lineTo(px + bw + jx + Math.sin(r + 1) * 0.8, py + bh + jy - 1);
                ctx.lineTo(px + jx - Math.cos(c + 1) * 0.8, py + bh + jy + Math.sin(r) * 0.5);
                ctx.closePath();
                ctx.fill();
            } else {
                // 岩壁：棕色铅笔线条填充
                ctx.fillStyle = `rgba(${100 + Math.sin(r * 1.5) * 15},${85 + Math.cos(c * 2) * 10},${65 + Math.sin(r + c) * 8},0.45)`;
                ctx.beginPath();
                ctx.moveTo(px + jx, py + jy);
                ctx.lineTo(px + bw + jx + Math.sin(r * 2) * 1, py + jy + Math.cos(c * 2) * 1);
                ctx.lineTo(px + bw + jx, py + bh + jy);
                ctx.lineTo(px + jx + Math.cos(r) * 1, py + bh + jy + Math.sin(c) * 1);
                ctx.closePath();
                ctx.fill();
                // 岩壁纹理线（铅笔划痕）
                ctx.strokeStyle = `rgba(80,65,50,0.2)`;
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(px + jx + 1, py + jy + bh * 0.3);
                ctx.lineTo(px + bw + jx - 1, py + jy + bh * 0.6);
                ctx.stroke();
            }
        }
    }

    // 已探索区域的边缘轮廓（手绘不规则线条）
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = 'rgba(80,65,50,0.5)';
    ctx.lineWidth = 1.2;
    for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
            if (!maze.mazeExplored[r] || !maze.mazeExplored[r][c]) continue;
            if (maze.mazeMap[r][c] !== 0) continue;
            // 检查是否是边缘（相邻有未探索或岩壁）
            const neighbors = [
                [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]
            ];
            for (const [nr, nc] of neighbors) {
                const isEdge = !maze.mazeExplored[nr]?.[nc] || maze.mazeMap[nr][nc] !== 0;
                if (isEdge) {
                    const px = mapX + c * cellW + cellW / 2;
                    const py = mapY + r * cellH + cellH / 2;
                    const npx = mapX + nc * cellW + cellW / 2;
                    const npy = mapY + nr * cellH + cellH / 2;
                    const mx = (px + npx) / 2;
                    const my = (py + npy) / 2;
                    // 手绘短线段
                    const jitter = Math.sin(r * 5.3 + c * 3.7) * 1.5;
                    ctx.beginPath();
                    ctx.moveTo(mx - cellW * 0.4 + jitter, my + Math.cos(r + c) * 0.8);
                    ctx.lineTo(mx + cellW * 0.4 - jitter, my - Math.sin(r + c) * 0.8);
                    ctx.stroke();
                    break; // 每个边缘格只画一次
                }
            }
        }
    }

    // 绳索路径（手绘虚线风格）
    if (state.rope && state.rope.ropes && state.rope.ropes.length > 0) {
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = 'rgba(180,130,40,0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        for (const rope of state.rope.ropes) {
            if (!rope.path || rope.path.length < 2) continue;
            ctx.beginPath();
            const startPt = rope.path[0];
            let sx = mapX + (startPt.x / maze.mazeTileSize) * cellW;
            let sy = mapY + (startPt.y / maze.mazeTileSize) * cellH;
            ctx.moveTo(sx + Math.sin(sy) * 0.8, sy + Math.cos(sx) * 0.8);
            for (let i = 1; i < rope.path.length; i++) {
                const pt = rope.path[i];
                const rx = mapX + (pt.x / maze.mazeTileSize) * cellW;
                const ry = mapY + (pt.y / maze.mazeTileSize) * cellH;
                // 手绘抖动
                ctx.lineTo(rx + Math.sin(ry * 0.5 + i) * 1, ry + Math.cos(rx * 0.5 + i) * 1);
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    // 出口标记（手绘三角箭头 + 文字）
    const exitMapX = mapX + (maze.exitX / maze.mazeTileSize) * cellW;
    const exitMapY = mapY + (maze.exitY / maze.mazeTileSize) * cellH;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#4CAF50';
    // 手绘三角形
    ctx.beginPath();
    ctx.moveTo(exitMapX, exitMapY - 7);
    ctx.lineTo(exitMapX - 5, exitMapY + 3);
    ctx.lineTo(exitMapX + 5, exitMapY + 3);
    ctx.closePath();
    ctx.fill();
    // 手绘圈
    ctx.strokeStyle = '#2E7D32';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
        const cr = 7 + Math.sin(a * 3) * 0.8;
        const cx = exitMapX + Math.cos(a) * cr;
        const cy = exitMapY + Math.sin(a) * cr;
        if (a === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#2E7D32';
    ctx.font = 'italic 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('出口', exitMapX, exitMapY - 12);

    // NPC 标记（已发现时显示，手绘X标记 + 脉冲）
    if (maze.npcFound) {
        const npcMapX = mapX + (maze.npcInitX / maze.mazeTileSize) * cellW;
        const npcMapY = mapY + (maze.npcInitY / maze.mazeTileSize) * cellH;
        const pulse = 0.6 + Math.sin(time * 3) * 0.4;
        ctx.globalAlpha = pulse;
        // 手绘X标记
        ctx.strokeStyle = '#D32F2F';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(npcMapX - 5, npcMapY - 5);
        ctx.lineTo(npcMapX + 5 + Math.sin(time) * 0.5, npcMapY + 5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(npcMapX + 5, npcMapY - 5);
        ctx.lineTo(npcMapX - 5 + Math.cos(time) * 0.5, npcMapY + 5);
        ctx.stroke();
        // 手绘圈
        ctx.strokeStyle = 'rgba(211,47,47,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.15) {
            const cr = 9 + Math.sin(a * 4 + time) * 1.2;
            const cx = npcMapX + Math.cos(a) * cr;
            const cy = npcMapY + Math.sin(a) * cr;
            if (a === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#BF360C';
        ctx.font = 'italic 10px Georgia, serif';
        ctx.fillText('被困者', npcMapX, npcMapY - 14);
    }

    // 图例（手绘风格）
    ctx.globalAlpha = 0.6;
    ctx.font = 'italic 10px Georgia, serif';
    ctx.textAlign = 'left';
    const legendX = mapX + 4;
    let legendY = mapY + mapH + 16;
    const themeItems = getMazeThemeLegendItems(maze.sceneThemeKeys);
    let lx = legendX;
    const legendItemW = 62;
    const legendMaxX = mapX + mapW - 10;
    for (let ti = 0; ti < themeItems.length; ti++) {
        const item = themeItems[ti] as any;
        if (!item) continue;
        if (lx + legendItemW > legendMaxX && ti > 0) {
            lx = legendX;
            legendY += 16;
        }
        const discovered = maze.discoveredThemes && maze.discoveredThemes.includes(item.key);
        ctx.fillStyle = discovered ? item.mapColor : 'rgba(180,170,160,0.3)';
        ctx.beginPath();
        ctx.arc(lx + 4, legendY - 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = discovered ? '#5D4037' : 'rgba(150,140,130,0.5)';
        ctx.fillText(discovered ? item.name : '???', lx + 12, legendY + 2);
        lx += legendItemW;
    }
    // 绳索图例
    if (lx + 50 > legendMaxX) {
        lx = legendX;
        legendY += 16;
    }
    ctx.strokeStyle = 'rgba(180,130,40,0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(lx, legendY);
    ctx.lineTo(lx + 18, legendY - 1 + Math.sin(lx) * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#5D4037';
    ctx.fillText('绳索', lx + 22, legendY + 2);
}

// =============================================
// 入水动效绘制
// =============================================
function drawMazeDivingIn(maze: any, cw: number, ch: number, time: number) {
    const timer = maze.divingInTimer;
    const totalFrames = 90;
    const progress = Math.min(1, timer / totalFrames);

    // 阶段1（0~0.4）：岸上场景，水面涟漪扩大
    // 阶段2（0.4~0.7）：蓝色水面从中心扩散覆盖全屏
    // 阶段3（0.7~1.0）：水下深蓝渐入，气泡上浮

    if (progress < 0.4) {
        // 阶段1：岸上场景 + 水面涟漪
        const p1 = progress / 0.4;

        // 绘制简化的岸上背景
        const skyGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.4);
        skyGrad.addColorStop(0, '#87CEEB');
        skyGrad.addColorStop(1, '#E8F5E9');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, cw, ch * 0.4);
        const grassGrad = ctx.createLinearGradient(0, ch * 0.38, 0, ch);
        grassGrad.addColorStop(0, '#66BB6A');
        grassGrad.addColorStop(1, '#388E3C');
        ctx.fillStyle = grassGrad;
        ctx.fillRect(0, ch * 0.38, cw, ch * 0.62);

        // 洞口水面涟漪扩大
        const poolX = cw * 0.5;
        const poolY = ch * 0.48;
        const baseW = 80;
        const expandScale = 1 + p1 * 2;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#1565C0';
        ctx.beginPath();
        ctx.ellipse(poolX, poolY, baseW * expandScale, baseW * 0.5 * expandScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // 涟漪
        ctx.globalAlpha = 0.5 * (1 - p1);
        ctx.strokeStyle = '#90CAF9';
        ctx.lineWidth = 2;
        for (let w = 0; w < 5; w++) {
            const waveR = (30 + w * 20) * expandScale + Math.sin(time * 3 + w) * 5;
            ctx.beginPath();
            ctx.ellipse(poolX, poolY, waveR, waveR * 0.5, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 入水文字
        ctx.globalAlpha = p1;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText('入水...', poolX, poolY - 10);
        ctx.shadowBlur = 0;

    } else if (progress < 0.7) {
        // 阶段2：蓝色水面从中心扩散覆盖全屏
        const p2 = (progress - 0.4) / 0.3;
        const radius = Math.hypot(cw, ch) * p2;

        // 先画岸上残影
        ctx.globalAlpha = 1 - p2;
        const skyGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.4);
        skyGrad.addColorStop(0, '#87CEEB');
        skyGrad.addColorStop(1, '#E8F5E9');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, cw, ch * 0.4);
        const grassGrad = ctx.createLinearGradient(0, ch * 0.38, 0, ch);
        grassGrad.addColorStop(0, '#66BB6A');
        grassGrad.addColorStop(1, '#388E3C');
        ctx.fillStyle = grassGrad;
        ctx.fillRect(0, ch * 0.38, cw, ch * 0.62);

        // 蓝色圆形扩散
        ctx.globalAlpha = 1;
        const waterGrad = ctx.createRadialGradient(cw / 2, ch * 0.48, 0, cw / 2, ch * 0.48, radius);
        waterGrad.addColorStop(0, 'rgba(10,40,80,0.95)');
        waterGrad.addColorStop(0.6, 'rgba(15,50,100,0.9)');
        waterGrad.addColorStop(1, 'rgba(5,20,50,0.85)');
        ctx.fillStyle = waterGrad;
        ctx.beginPath();
        ctx.arc(cw / 2, ch * 0.48, radius, 0, Math.PI * 2);
        ctx.fill();

    } else {
        // 阶段3：水下深蓝 + 气泡上浮
        const p3 = (progress - 0.7) / 0.3;

        // 深蓝背景
        ctx.globalAlpha = 1;
        const deepGrad = ctx.createLinearGradient(0, 0, 0, ch);
        deepGrad.addColorStop(0, 'rgba(5,20,50,1)');
        deepGrad.addColorStop(0.5, 'rgba(8,30,60,1)');
        deepGrad.addColorStop(1, 'rgba(3,15,35,1)');
        ctx.fillStyle = deepGrad;
        ctx.fillRect(0, 0, cw, ch);

        // 气泡上浮
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 12; i++) {
            const bx = cw * 0.3 + (i % 4) * cw * 0.12 + Math.sin(i * 2.3 + time * 2) * 15;
            const by = ch * (1 - p3 * 0.8) - i * ch * 0.06 + Math.sin(i * 1.7 + time * 3) * 10;
            const br = 2 + (i % 3) * 1.5;
            ctx.fillStyle = 'rgba(150,200,255,0.4)';
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
        }

        // 光柱从上方射入
        ctx.globalAlpha = 0.15 * (1 - p3);
        const lightGrad = ctx.createLinearGradient(cw / 2, 0, cw / 2, ch * 0.6);
        lightGrad.addColorStop(0, 'rgba(100,180,255,0.5)');
        lightGrad.addColorStop(1, 'rgba(100,180,255,0)');
        ctx.fillStyle = lightGrad;
        ctx.beginPath();
        ctx.moveTo(cw * 0.35, 0);
        ctx.lineTo(cw * 0.65, 0);
        ctx.lineTo(cw * 0.7, ch * 0.6);
        ctx.lineTo(cw * 0.3, ch * 0.6);
        ctx.closePath();
        ctx.fill();

        // 下潜深度文字
        const depthShow = Math.floor(p3 * 10);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = 'rgba(150,200,255,0.8)';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`下潜中... ${depthShow}m`, cw / 2, ch / 2);
    }
}

// =============================================
// 迷宫结算界面（探路返回 / 救援成功）
// =============================================
function drawMazeDebrief(maze: any, cw: number, ch: number, time: number) {
    const isRescueSuccess = maze.phase === 'rescued';
    const showAlpha = Math.min(1, maze.resultTimer / 30);

    // 背景（深色渐变）
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

    // === 标题区域 ===
    const titleY = ch * 0.04 + 16;
    const lastDive = maze.diveHistory.length > 0 ? maze.diveHistory[maze.diveHistory.length - 1] : null;
    if (isRescueSuccess) {
        ctx.fillStyle = 'rgba(80,255,180,0.95)';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('救援成功', cw / 2, titleY);
    } else {
        const reason = lastDive ? lastDive.returnReason : 'retreat';
        ctx.fillStyle = reason === 'o2' ? 'rgba(255,180,80,0.95)' : 'rgba(160,210,255,0.95)';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(reason === 'o2' ? '氧气不足' : '安全返回', cw / 2, titleY);
    }

    // === 轨迹复盘地图（占据页面主体，尽量大） ===
    const mapPadding = 16;
    const mapTopY = titleY + 20;
    // 统计区域高度预估
    const statsAreaH = lastDive ? 100 : 20;
    const btnAreaH = 70;
    const mapAvailH = ch - mapTopY - statsAreaH - btnAreaH - mapPadding * 2;
    const mapAvailW = cw - mapPadding * 2;

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

    // 地图背景
    ctx.globalAlpha = showAlpha * 0.95;
    ctx.fillStyle = 'rgba(5,12,25,0.9)';
    ctx.beginPath();
    rrect(ctx, mapX - 4, mapY - 4, mapW + 8, mapH + 8, 8);
    ctx.fill();
    // 地图边框
    ctx.strokeStyle = isRescueSuccess ? 'rgba(60,200,140,0.25)' : 'rgba(60,120,180,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, mapX - 4, mapY - 4, mapW + 8, mapH + 8, 8);
    ctx.stroke();

    // 绘制已探索地图
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

    // 绘制绳索
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

    // 绘制轨迹（动画展开）
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

        // 轨迹终点标记（当前位置闪烁点）
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

    // 出口标记
    const exitMX = mapX + (maze.exitX / maze.mazeTileSize) * cellW;
    const exitMY = mapY + (maze.exitY / maze.mazeTileSize) * cellH;
    ctx.globalAlpha = showAlpha * 0.85;
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(exitMX, exitMY, Math.max(3, cellW * 2), 0, Math.PI * 2);
    ctx.fill();

    // NPC 标记
    if (maze.npcFound) {
        const npcMX = mapX + (maze.npcInitX / maze.mazeTileSize) * cellW;
        const npcMY = mapY + (maze.npcInitY / maze.mazeTileSize) * cellH;
        ctx.fillStyle = isRescueSuccess ? '#0f8' : '#f44';
        ctx.beginPath();
        ctx.arc(npcMX, npcMY, Math.max(3, cellW * 2), 0, Math.PI * 2);
        ctx.fill();
    }

    // === 统计数据区域（地图下方，紧凑横排） ===
    if (lastDive) {
        const statsY = mapY + mapH + 16;
        ctx.globalAlpha = showAlpha * 0.9;
        ctx.textAlign = 'center';

        // 统计数据横排（4列）
        const statItems = [];
        const minutes = Math.floor(lastDive.duration / 60);
        const seconds = lastDive.duration % 60;
        statItems.push({ label: '用时', value: `${minutes}:${seconds < 10 ? '0' + seconds : seconds}` });
        statItems.push({ label: '深度', value: `${lastDive.maxDepth}m` });
        statItems.push({ label: '探索', value: `+${lastDive.newExploredCount}` });
        statItems.push({ label: '绳索', value: `+${lastDive.ropePlaced}` });

        const statW = cw / statItems.length;
        for (let i = 0; i < statItems.length; i++) {
            const sx = statW * i + statW / 2;
            // 数值
            ctx.fillStyle = isRescueSuccess ? 'rgba(120,255,200,0.95)' : 'rgba(160,210,255,0.95)';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(statItems[i].value, sx, statsY + 4);
            // 标签
            ctx.fillStyle = 'rgba(120,160,200,0.5)';
            ctx.font = '10px Arial';
            ctx.fillText(statItems[i].label, sx, statsY + 18);
        }

        // 特殊提示（发现NPC / 新主题）
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

    // === 底部按钮 ===
    if (maze.resultTimer >= 60) {
        const btnAlpha = Math.min(1, (maze.resultTimer - 60) / 20);
        ctx.globalAlpha = showAlpha * btnAlpha;

        const btnY = ch - 50;
        const btnW = cw * 0.55;
        const btnH = 44;
        const btnX = (cw - btnW) / 2;

        if (isRescueSuccess) {
            // 渐变按钮
            const btnGrad = ctx.createLinearGradient(btnX, btnY - btnH / 2, btnX + btnW, btnY - btnH / 2);
            btnGrad.addColorStop(0, 'rgba(20,100,80,0.85)');
            btnGrad.addColorStop(1, 'rgba(30,130,100,0.85)');
            ctx.fillStyle = btnGrad;
            ctx.beginPath();
            rrect(ctx, btnX, btnY - btnH / 2, btnW, btnH, 22);
            ctx.fill();
            ctx.fillStyle = 'rgba(120,255,200,0.95)';
            ctx.font = 'bold 15px Arial';
            ctx.fillText('下一局', cw / 2, btnY + 5);

            // 返回主菜单提示
            const tapAlpha = 0.4 + Math.sin(time * 2.5) * 0.3;
            ctx.globalAlpha = showAlpha * btnAlpha * tapAlpha;
            ctx.fillStyle = 'rgba(120,160,180,0.6)';
            ctx.font = '11px Arial';
            ctx.fillText('点击其他区域返回主菜单', cw / 2, ch - 14);
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
            ctx.fillText('回到岸上', cw / 2, btnY + 5);
        }
    }
}
