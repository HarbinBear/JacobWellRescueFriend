import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { getMazeMainThemeConfig } from '../world/mazeScene';
import { drawOxygenScreenGlow } from './RenderOxygenTank';
import { drawHUDTopLeft, initMazeHUDTopLeft } from './HUDTopLeft';

// 确保迷宫模式 HUD 管理器已初始化（仅初始化一次，跨会话也只初始化一次）
let _mazeHUDInitialized = false;
function ensureMazeHUDInitialized() {
    if (_mazeHUDInitialized) return;
    initMazeHUDTopLeft();
    _mazeHUDInitialized = true;
}

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
        // 文字提示由 storyManager 统一显示，不在此重复
        ctx.restore();
        return;
    }

    // === 游戏中 HUD ===

    // 氧气拾取拾取后的全屏绿色辉光（在所有 HUD 之前绘制，不遮挖 HUD）
    drawOxygenScreenGlow(ctx, cw, ch);

    // --- 左上角 HUD（氧气环 / 手动挡 / 音频 / 生命探知仪，统一由 HUDTopLeft 管理） ---
    // 在 HUDTopLeft.ts 中实现竖向布局、入场动效、统一tip、长短按交互
    ensureMazeHUDInitialized();
    drawHUDTopLeft(time);

    // 仅保留"氧气拾取后屏幕级别的 +X% 飘字"（HUDTopLeft 内部不负责这个世界级飘字）
    // 氧气环拾取脉冲由 HUDTopLeft 内部处理，此处只绘制向上飘动的 "+X%" 文本
    if (maze.oxygenFeedback && maze.oxygenFeedback.floatText) {
        const ft = maze.oxygenFeedback.floatText;
        const ftT = Math.max(0, Math.min(1, ft.timer));
        const floatY = 48 - 8 - (1 - ftT) * 28;
        ctx.save();
        ctx.globalAlpha = ftT * 0.95;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(160, 255, 200, 1)';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(ft.text, 46 + 22 + 10, floatY);
        ctx.shadowBlur = 0;
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
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

    // 撤离按钮（未带人时可用，左下角，按住展开说明）
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

        // 撤离详情展开动画（长按时展开说明文字）
        if (maze.retreatHolding && retreatProgress > 0) {
            maze._retreatDetailOpen = Math.min(1, (maze._retreatDetailOpen || 0) + 0.06);
        } else if (!maze.retreatHolding) {
            maze._retreatDetailOpen = Math.max(0, (maze._retreatDetailOpen || 0) - 0.1);
        }
        const retDetailEase = (maze._retreatDetailOpen || 0);
        const retDE = retDetailEase * retDetailEase * (3 - 2 * retDetailEase);

        // 展开的说明面板（按钮上方）
        if (retDE > 0.01) {
            const rpW = 80 * retDE;
            const rpH = 28 * retDE;
            const rpX = retreatBtnX - rpW / 2;
            const rpY = retreatBtnY - retreatR - 10 - rpH;
            ctx.globalAlpha = 0.85 * retDE;
            ctx.fillStyle = 'rgba(8,20,35,0.88)';
            ctx.beginPath();
            rrect(ctx, rpX, rpY, rpW, rpH, 8 * retDE);
            ctx.fill();
            if (retDE > 0.4) {
                const cA = Math.min(1, (retDE - 0.4) / 0.6);
                ctx.globalAlpha = 0.9 * cA;
                ctx.fillStyle = 'rgba(150,255,220,0.9)';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('撤离上浮', retreatBtnX, rpY + rpH / 2 + 4);
            }
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

        // 上箭头图标
        ctx.globalAlpha = retreatProgress > 0 ? 0.95 : 0.75;
        ctx.fillStyle = retreatProgress > 0 ? 'rgba(150,255,220,0.95)' : 'rgba(150,210,230,0.85)';
        ctx.beginPath();
        ctx.moveTo(retreatBtnX, retreatBtnY - 10);
        ctx.lineTo(retreatBtnX - 7, retreatBtnY - 2);
        ctx.lineTo(retreatBtnX + 7, retreatBtnY - 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(retreatBtnX, retreatBtnY - 1);
        ctx.lineTo(retreatBtnX, retreatBtnY + 10);
        ctx.stroke();
    }

    // 小地图（仅调试模式显示，左上角，可折叠）
    if (CONFIG.debug) {
        drawMazeMinimap(maze, cw, ch, time);
    }
    ctx.restore();
}


// 迷宫小地图绘制
function drawMazeMinimap(maze: any, cw: number, ch: number, time: number) {
    const mapSize = CONFIG.maze.minimapSize;
    const mapX = CONFIG.maze.minimapX;
    const mapY = CONFIG.maze.minimapY;
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

    // === 食人鱼聚集点调试可视化 ===
    // 显示聚集点活动半径、中心、骷髅位置与当前活着的食人鱼
    if (maze.fishDens && maze.fishDens.length > 0) {
        const baseY = mapY + toggleBtnSize + 4;
        // 坐标换算：世界坐标 → 小地图坐标
        const toMapX = (wx: number) => mapX + (wx / maze.mazeTileSize) * cellW;
        const toMapY = (wy: number) => baseY + (wy / maze.mazeTileSize) * cellH;

        for (const den of maze.fishDens) {
            const dxCenter = toMapX(den.x);
            const dyCenter = toMapY(den.y);
            const dRadius = (den.radius / maze.mazeTileSize) * cellW;

            // 活动半径填充（淡红色）
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = 'rgba(255,80,80,1)';
            ctx.beginPath();
            ctx.arc(dxCenter, dyCenter, dRadius, 0, Math.PI * 2);
            ctx.fill();

            // 活动半径边框（红色虚线）
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = 'rgba(255,60,60,1)';
            ctx.lineWidth = 1;
            if ((ctx as any).setLineDash) (ctx as any).setLineDash([2, 2]);
            ctx.beginPath();
            ctx.arc(dxCenter, dyCenter, dRadius, 0, Math.PI * 2);
            ctx.stroke();
            if ((ctx as any).setLineDash) (ctx as any).setLineDash([]);

            // 中心红色 X
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ff3030';
            ctx.lineWidth = 2;
            const xs = 4;
            ctx.beginPath();
            ctx.moveTo(dxCenter - xs, dyCenter - xs);
            ctx.lineTo(dxCenter + xs, dyCenter + xs);
            ctx.moveTo(dxCenter + xs, dyCenter - xs);
            ctx.lineTo(dxCenter - xs, dyCenter + xs);
            ctx.stroke();

            // 骷髅位置：白色小点
            if (den.skulls && den.skulls.length > 0) {
                ctx.globalAlpha = 0.9;
                ctx.fillStyle = '#fff';
                for (const sk of den.skulls) {
                    ctx.beginPath();
                    ctx.arc(toMapX(sk.x), toMapY(sk.y), 1.2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // 活着的食人鱼：红色小点（方便观察鱼相对聚集点的分布）
        if (state.fishEnemies && state.fishEnemies.length > 0) {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#ff6040';
            for (const fish of state.fishEnemies) {
                if (fish.dead) continue;
                ctx.beginPath();
                ctx.arc(toMapX(fish.x), toMapY(fish.y), 1.8, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
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

    // 返回按钮（左上角，文字居中在框内）
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

    // 信息卡片（可折叠，带动效过渡）
    const cardX = cw * 0.06;
    const cardW = cw * 0.88;
    const isRecordOpen = maze._shoreRecordOpen;
    const cardCollapsedH = 48;
    const cardExpandedH = ch * 0.42;

    // 折叠/展开动效（平滑过渡）
    if (!maze._shoreRecordAnim) maze._shoreRecordAnim = 0;
    const targetAnim = isRecordOpen ? 1 : 0;
    maze._shoreRecordAnim += (targetAnim - maze._shoreRecordAnim) * 0.12;
    if (Math.abs(maze._shoreRecordAnim - targetAnim) < 0.01) maze._shoreRecordAnim = targetAnim;
    const animT = maze._shoreRecordAnim;
    const animEase = animT * animT * (3 - 2 * animT); // smoothstep
    const cardH = cardCollapsedH + (cardExpandedH - cardCollapsedH) * animEase;
    const cardY = ch - cardH - 16;

    // 卡片背景（半透明磨砂感）
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

    // 标题栏（始终显示，点击切换折叠）
    ctx.globalAlpha = 1;
    const infoX = cardX + 16;
    const titleCenterY = cardY + cardCollapsedH / 2;

    // 左侧：探索记录标题 + 折叠箭头
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    // 箭头旋转动效（▶ 旋转到 ▼）
    const arrowChar = animEase > 0.5 ? '▼' : '▶';
    ctx.fillStyle = '#999';
    ctx.font = '12px Arial';
    ctx.fillText(arrowChar, infoX, titleCenterY);
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('探索记录', infoX + 18, titleCenterY);
    ctx.textBaseline = 'alphabetic';

    // 右侧：下潜记录按钮（独立位置，不和标题重合）——点击打开列表
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
    // 小书本图标（代表"下潜记录")
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 1.5;
    const mIcx = mapIconX + mapIconSize / 2;
    const mIcy = mapIconY + mapIconSize / 2;
    // 书脊
    ctx.beginPath();
    ctx.moveTo(mIcx, mIcy - 7);
    ctx.lineTo(mIcx, mIcy + 7);
    ctx.stroke();
    // 左页
    ctx.beginPath();
    ctx.moveTo(mIcx, mIcy - 7);
    ctx.quadraticCurveTo(mIcx - 8, mIcy - 5, mIcx - 8, mIcy + 5);
    ctx.lineTo(mIcx, mIcy + 7);
    ctx.stroke();
    // 右页
    ctx.beginPath();
    ctx.moveTo(mIcx, mIcy - 7);
    ctx.quadraticCurveTo(mIcx + 8, mIcy - 5, mIcx + 8, mIcy + 5);
    ctx.lineTo(mIcx, mIcy + 7);
    ctx.stroke();
    // 右下角数字徽标（显示记录条数，最多5）
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

    // 展开时显示详情内容（带淡入动效）
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

        // 上次下潜摘要
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

        // 下潜提示
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
// 全屏认知地图查看页面（手绘铅笔素描风）
// 设计要点：
//   1. 纯米白羊皮纸底 + 墨色铅笔线轮廓 + 红笔标注，不再按主题填彩色
//   2. 用 marching-squares 提取"已探索水域"的闭合外轮廓，而不是逐格填色
//   3. 对轮廓做 Chaikin 平滑，沿法线加手绘抖动，双层叠笔（淡灰底 + 墨色细线）
//   4. 未探索区留白（就是纸色本身），不贴问号
// =============================================
function drawMazeMapFullscreen(maze: any, cw: number, ch: number, time: number) {
    // 新逻辑：根据 shoreMapDiveIndex 分发：
    //   -1 或无有效历史 → 画"下潜记录列表"
    //   >=0 且 diveHistory 中该条存在 → 画该次下潜的"手绘地图回放"
    const idx = (typeof maze.shoreMapDiveIndex === 'number') ? maze.shoreMapDiveIndex : -1;
    if (idx >= 0 && maze.diveHistory && maze.diveHistory[idx]) {
        drawShoreDiveReplay(maze, maze.diveHistory[idx], idx, cw, ch, time);
        return;
    }
    drawShoreDiveList(maze, cw, ch, time);
}

// =============================================
// 岸上下潜记录列表（B1：点"下潜记录"按钮后弹出的总入口）
// 样式：岸上羊皮纸风外层 + 每项是一次下潜的缩略卡片
// =============================================
function drawShoreDiveList(maze: any, cw: number, ch: number, time: number) {
    // 岸上羊皮纸米白底（a2：外层用岸上颜色）
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(235,225,200,1)';
    ctx.fillRect(0, 0, cw, ch);
    // 纸张斑点纹理
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

    // 标题（手写风）
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic bold 18px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('下潜记录', cw / 2, 34);
    // 波浪下划线
    ctx.strokeStyle = 'rgba(62,44,35,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = cw * 0.32; x < cw * 0.68; x += 3) {
        const wy = 40 + Math.sin(x * 0.15) * 1.5;
        if (x === cw * 0.32) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
    }
    ctx.stroke();

    // 副标题
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#7A6B5C';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText('仅保留最近 5 次 · 点击任一条可翻开手绘地图', cw / 2, 58);

    // 关闭提示
    ctx.globalAlpha = 0.45;
    ctx.fillText('点击左上角 ← 返回岸上', cw / 2, ch - 16);

    // 返回按钮（左上）
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

    // 列表区域
    const list = maze.diveHistory || [];
    if (list.length === 0) {
        // 空状态
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#7A6B5C';
        ctx.font = 'italic 13px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('还没有下潜记录', cw / 2, ch * 0.5);
        ctx.fillText('从水面入口下潜一次，就会有手绘地图留下', cw / 2, ch * 0.5 + 22);
        return;
    }

    // 每条卡片
    const listTop = 78;
    const listBottom = ch - 36;
    const maxCards = 5;
    const avail = listBottom - listTop;
    const gap = 10;
    const cardH = Math.min(92, (avail - gap * (maxCards - 1)) / maxCards);
    const cardX = cw * 0.06;
    const cardW = cw * 0.88;

    // 最近的下潜排最上方（逆序展示）
    for (let i = 0; i < list.length; i++) {
        const reverseIdx = list.length - 1 - i; // 数组中真实下标
        const record = list[reverseIdx];
        const cy = listTop + i * (cardH + gap);

        // 卡片底（羊皮纸色块）
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

        // 卡片边框（淡墨）
        ctx.strokeStyle = 'rgba(70,55,45,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        rrect(ctx, cardX, cy, cardW, cardH, 10);
        ctx.stroke();

        // 左侧：缩略图（把该次 exploredSnapshot 低分辨率铺一下，给玩家一眼辨别）
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
        // 探索格子缩略
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
        // 缩略图内叠一条路径概览（深棕）
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

        // 右侧：文字信息
        const txtX = thumbX + thumbSize + 14;
        let txtY = cy + 20;
        // 第 N 次下潜
        const diveNumber = maze.diveCount - list.length + reverseIdx + 1;
        ctx.fillStyle = '#3E2C23';
        ctx.font = 'italic bold 14px Georgia, serif';
        ctx.textAlign = 'left';
        ctx.fillText(`第 ${diveNumber} 次下潜`, txtX, txtY);
        txtY += 18;
        // 返回原因
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
        // 用时 / 深度 / 新探索 / 绳索
        ctx.fillStyle = '#7A6B5C';
        ctx.font = '11px Arial';
        const minutes = Math.floor(record.duration / 60);
        const seconds = record.duration % 60;
        ctx.fillText(`用时 ${minutes}:${seconds < 10 ? '0' + seconds : seconds}  深度 ${record.maxDepth}m`, txtX, txtY);
        txtY += 14;
        ctx.fillText(`新探索 +${record.newExploredCount}  绳索 +${record.ropePlaced}`, txtX, txtY);

        // 右上角小提示"点开"
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#7A6B5C';
        ctx.font = 'italic 10px Georgia, serif';
        ctx.textAlign = 'right';
        ctx.fillText('翻开 →', cardX + cardW - 10, cy + cardH - 10);
        ctx.globalAlpha = 1;
    }
}

// =============================================
// 岸上单次下潜的手绘地图回放（C1：每次打开重放轨迹动画）
// 样式：岸上羊皮纸外层 + 结算页内容风格（格子+绳索+轨迹+出口+NPC）
// =============================================
function drawShoreDiveReplay(maze: any, record: any, idx: number, cw: number, ch: number, time: number) {
    // 岸上羊皮纸底（a2：外层岸上色）
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

    // 标题
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic bold 17px Georgia, serif';
    ctx.textAlign = 'center';
    const diveNumber = maze.diveCount - maze.diveHistory.length + idx + 1;
    ctx.fillText(`第 ${diveNumber} 次下潜 · 手绘地图`, cw / 2, 30);

    // 返回列表按钮（左上）
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

    // 底部关闭提示
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#7A6B5C';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('点击其它区域返回下潜记录', cw / 2, ch - 14);

    // ---- 地图区域 ----
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

    // 纸张地图底（羊皮纸圆角卡）
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
    // 边框
    ctx.strokeStyle = 'rgba(70,55,45,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, mapX - 10, mapY - 10, mapW + 20, mapH + 20, 10);
    ctx.stroke();

    // ---- 地图内容（结算页风格：格子 + 绳索 + 轨迹 + 出口 + NPC） ----
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
                    // 用羊皮纸友好色调：本次新探 = 棕红高亮，旧探 = 淡褐底
                    const isNew = before && before[r] && !before[r][c];
                    ctx.fillStyle = isNew ? 'rgba(170,90,40,0.55)' : 'rgba(140,115,85,0.28)';
                } else {
                    // 墙体：更深的墨褐
                    ctx.fillStyle = 'rgba(60,45,35,0.55)';
                }
                ctx.fillRect(px, py, Math.max(1, cellW), Math.max(1, cellH));
            }
        }
    }

    // ---- 绳索（快照；棕红色） ----
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

    // ---- 玩家轨迹（每次打开重播动画，90 帧展开） ----
    if (record.playerPath && record.playerPath.length > 0) {
        const pathLen = record.playerPath.length;
        const animDuration = 90;
        const animProgress = Math.min(1, Math.max(0, maze.shoreMapAnimTimer / animDuration));
        const drawCount = Math.max(1, Math.floor(pathLen * animProgress));
        ctx.globalAlpha = 0.9;
        // 手绘铅笔感：双勾
        // 底笔（粗而淡）
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
        // 面笔（细而深）
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

        // 轨迹笔尖闪烁
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

    // ---- 出口标记（红圈） ----
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

    // ---- NPC 标记（若这次已发现） ----
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

    // ---- 本次下潜数据条（底部） ----
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

    // 每帧推进轨迹动画计时
    maze.shoreMapAnimTimer = (maze.shoreMapAnimTimer || 0) + 1;
}

// （保留）旧的"铅笔素描全屏认知地图"，已不再直接作为入口使用；
// 如果未来需要回退老方案，可以从这里恢复。
function drawMazeMapFullscreenLegacy(maze: any, cw: number, ch: number, time: number) {
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

    // ---- 标题（手写风格） ----
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic bold 18px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('认知地图', cw / 2, 30);
    // 标题下划线（手绘波浪线）
    ctx.strokeStyle = 'rgba(62,44,35,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = cw * 0.3; x < cw * 0.7; x += 3) {
        const wy = 35 + Math.sin(x * 0.15) * 1.5;
        if (x === cw * 0.3) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
    }
    ctx.stroke();

    // 关闭提示
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#7A6B5C';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText('点击任意位置关闭', cw / 2, ch - 16);

    // ---- 地图区域计算 ----
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

    // ---- 纸张底色（带圆角和阴影） ----
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(243,234,215,1)';
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

    // 地图边框（手绘不规则线条，淡墨色）
    ctx.strokeStyle = 'rgba(70,55,45,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = mapX - 4; x < mapX + mapW + 4; x += 4) {
        const jitter = Math.sin(x * 0.3) * 1.2;
        if (x === mapX - 4) ctx.moveTo(x, mapY - 4 + jitter);
        else ctx.lineTo(x, mapY - 4 + jitter);
    }
    for (let y = mapY - 4; y < mapY + mapH + 4; y += 4) {
        const jitter = Math.sin(y * 0.25) * 1.2;
        ctx.lineTo(mapX + mapW + 4 + jitter, y);
    }
    for (let x = mapX + mapW + 4; x > mapX - 4; x -= 4) {
        const jitter = Math.sin(x * 0.28) * 1.2;
        ctx.lineTo(x, mapY + mapH + 4 + jitter);
    }
    for (let y = mapY + mapH + 4; y > mapY - 4; y -= 4) {
        const jitter = Math.sin(y * 0.22) * 1.2;
        ctx.lineTo(mapX - 4 + jitter, y);
    }
    ctx.closePath();
    ctx.stroke();

    // ============================================================
    // 核心：把"已探索的洞穴(可通行)"提取成闭合轮廓，用铅笔笔触描出
    // ============================================================

    // 1. 生成 mask：已探索 + 洞穴(mazeMap==0) = true，否则 false
    //    mask 尺寸 = (cols+1) x (rows+1)，外围一圈补 false 方便提取边缘
    const maskCols = cols + 2;
    const maskRows = rows + 2;
    const mask: Uint8Array = new Uint8Array(maskCols * maskRows);
    for (let r = 0; r < rows; r++) {
        const row = maze.mazeExplored[r];
        if (!row) continue;
        for (let c = 0; c < cols; c++) {
            if (row[c] && maze.mazeMap[r][c] === 0) {
                mask[(r + 1) * maskCols + (c + 1)] = 1;
            }
        }
    }
    const inMask = (mc: number, mr: number) => (mc >= 0 && mr >= 0 && mc < maskCols && mr < maskRows && mask[mr * maskCols + mc] === 1);

    // 将 mask 格坐标转成屏幕坐标（mask 偏移了 1）
    const mcToScreenX = (mc: number) => mapX + (mc - 1) * cellW;
    const mrToScreenY = (mr: number) => mapY + (mr - 1) * cellH;

    // 2. marching squares 提取所有闭合轮廓
    //    做法：遍历所有"mask 为 true 的格子的边"，如果它的另一侧是 false，就是轮廓边。
    //    用 edge key 去重并串联成多边形。
    type Pt = { x: number; y: number };
    const contours: Pt[][] = [];
    // edges 存一条有向边 (a -> b)，走向约定为：cave 在左手边，墙体在右手边（逆时针围住 cave）
    // 每个 cave 格（mc, mr）有 4 条潜在边：
    //   上边 (mc, mr)->(mc+1, mr)   要求 (mc, mr-1) 不是 cave
    //   右边 (mc+1, mr)->(mc+1, mr+1) 要求 (mc+1, mr) 不是 cave
    //   下边 (mc+1, mr+1)->(mc, mr+1) 要求 (mc, mr+1) 不是 cave
    //   左边 (mc, mr+1)->(mc, mr)   要求 (mc-1, mr) 不是 cave
    // 用 map 把"起点"映射到"终点"，然后串连起来。
    const nextOf = new Map<string, string>();
    const ptKey = (mc: number, mr: number) => mc + ',' + mr;
    const addEdge = (ax: number, ay: number, bx: number, by: number) => {
        nextOf.set(ptKey(ax, ay), ptKey(bx, by));
    };

    for (let mr = 0; mr < maskRows; mr++) {
        for (let mc = 0; mc < maskCols; mc++) {
            if (!inMask(mc, mr)) continue;
            if (!inMask(mc, mr - 1)) addEdge(mc, mr, mc + 1, mr);
            if (!inMask(mc + 1, mr)) addEdge(mc + 1, mr, mc + 1, mr + 1);
            if (!inMask(mc, mr + 1)) addEdge(mc + 1, mr + 1, mc, mr + 1);
            if (!inMask(mc - 1, mr)) addEdge(mc, mr + 1, mc, mr);
        }
    }

    // 串联所有闭合路径
    const visited = new Set<string>();
    for (const startKey of nextOf.keys()) {
        if (visited.has(startKey)) continue;
        const poly: Pt[] = [];
        let cur = startKey;
        let guard = 0;
        while (!visited.has(cur) && guard < 200000) {
            visited.add(cur);
            const [mcStr, mrStr] = cur.split(',');
            const mc = parseInt(mcStr, 10);
            const mr = parseInt(mrStr, 10);
            poly.push({ x: mcToScreenX(mc), y: mrToScreenY(mr) });
            const nxt = nextOf.get(cur);
            if (!nxt) break;
            cur = nxt;
            guard++;
        }
        if (poly.length >= 3) contours.push(poly);
    }

    // 3. Chaikin 平滑（闭合多边形，2 次迭代）
    const chaikin = (poly: Pt[], iter: number) => {
        let cur = poly;
        for (let k = 0; k < iter; k++) {
            const nxt: Pt[] = [];
            const n = cur.length;
            for (let i = 0; i < n; i++) {
                const p0 = cur[i];
                const p1 = cur[(i + 1) % n];
                nxt.push({ x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 });
                nxt.push({ x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 });
            }
            cur = nxt;
        }
        return cur;
    };
    const smoothed = contours.map(p => chaikin(p, 2));

    // 4. 如果还没有任何已探索区域，直接跳过洞穴绘制
    if (smoothed.length > 0) {
        // 4.1 内部斜线阴影（极淡铅笔填充，仅在洞穴内）
        //     用 canvas 的 clip 裁出洞穴区域，画 45° 斜线
        ctx.save();
        ctx.beginPath();
        for (const poly of smoothed) {
            const n = poly.length;
            for (let i = 0; i < n; i++) {
                const p = poly[i];
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
        }
        ctx.clip('evenodd');
        // 斜线
        ctx.globalAlpha = 0.07;
        ctx.strokeStyle = '#5D4A3B';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        const diag = mapW + mapH;
        const hatchGap = 5;
        for (let d = -mapH; d < diag; d += hatchGap) {
            const x1 = mapX + d;
            const y1 = mapY;
            const x2 = mapX + d + mapH;
            const y2 = mapY + mapH;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.stroke();
        ctx.restore();

        // 4.2 双层叠笔轮廓：先淡灰粗底色笔，再墨色细线收口
        // 共通工具：沿多边形绘制，带法线抖动和起笔/收笔淡入淡出
        const drawPencilStroke = (poly: Pt[], jitterAmp: number, lineWidth: number, color: string, phase: number) => {
            const n = poly.length;
            if (n < 3) return;
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = color;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            // 预计算每个点的法线方向 + 抖动偏移
            const pts: Pt[] = new Array(n);
            for (let i = 0; i < n; i++) {
                const prev = poly[(i - 1 + n) % n];
                const next = poly[(i + 1) % n];
                const dx = next.x - prev.x;
                const dy = next.y - prev.y;
                const len = Math.hypot(dx, dy) || 1;
                const nxv = -dy / len;
                const nyv = dx / len;
                const jitter = Math.sin(i * 0.6 + phase) * 0.6 + Math.sin(i * 1.73 + phase * 1.4) * 0.4;
                pts[i] = { x: poly[i].x + nxv * jitter * jitterAmp, y: poly[i].y + nyv * jitter * jitterAmp };
            }
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i <= n; i++) {
                const p = pts[i % n];
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        };

        for (const poly of smoothed) {
            // 底笔：淡灰色、略粗、抖动大
            ctx.globalAlpha = 0.35;
            drawPencilStroke(poly, 1.4, 2.0, 'rgba(90,70,55,0.55)', 0);
            // 收口笔：墨色、细、抖动小、相位错开
            ctx.globalAlpha = 0.85;
            drawPencilStroke(poly, 0.7, 1.0, 'rgba(40,28,20,0.9)', 2.1);
        }
    }

    // ============================================================
    // 绳索路径（棕红色铅笔，双勾）
    // ============================================================
    if (state.rope && state.rope.ropes && state.rope.ropes.length > 0) {
        const drawRopeStroke = (rope: any, width: number, color: string, alpha: number, phase: number) => {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            let prevX = 0, prevY = 0;
            for (let i = 0; i < rope.path.length; i++) {
                const pt = rope.path[i];
                const rx = mapX + (pt.x / maze.mazeTileSize) * cellW;
                const ry = mapY + (pt.y / maze.mazeTileSize) * cellH;
                const jitter = Math.sin(i * 0.9 + phase) * 0.6;
                // 用上一段方向的法线做偏移
                let nx = 0, ny = 0;
                if (i > 0) {
                    const dx = rx - prevX;
                    const dy = ry - prevY;
                    const len = Math.hypot(dx, dy) || 1;
                    nx = -dy / len;
                    ny = dx / len;
                }
                const ox = rx + nx * jitter;
                const oy = ry + ny * jitter;
                if (i === 0) ctx.moveTo(ox, oy);
                else ctx.lineTo(ox, oy);
                prevX = rx;
                prevY = ry;
            }
            ctx.stroke();
        };
        for (const rope of state.rope.ropes) {
            if (!rope.path || rope.path.length < 2) continue;
            // 底笔：较粗、暖棕
            drawRopeStroke(rope, 2.6, 'rgba(165,95,45,0.55)', 0.6, 0);
            // 面笔：细、深褐
            drawRopeStroke(rope, 1.2, 'rgba(100,55,25,0.9)', 0.85, 1.3);
        }
        ctx.setLineDash([]);
    }

    // ============================================================
    // 出口标记（红色铅笔圆圈 + 内部小三角 + "出口"文字）
    // ============================================================
    const exitMapX = mapX + (maze.exitX / maze.mazeTileSize) * cellW;
    const exitMapY = mapY + (maze.exitY / maze.mazeTileSize) * cellH;
    {
        const redInk = 'rgba(160,40,30,0.9)';
        const redInkLight = 'rgba(160,40,30,0.45)';
        // 双勾圈（多画一圈让它更像手绘）
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let pass = 0; pass < 2; pass++) {
            ctx.globalAlpha = pass === 0 ? 0.5 : 0.9;
            ctx.strokeStyle = pass === 0 ? redInkLight : redInk;
            ctx.lineWidth = pass === 0 ? 2.2 : 1.1;
            ctx.beginPath();
            for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.15) {
                const cr = 8 + Math.sin(a * 3 + pass) * 0.8;
                const cx = exitMapX + Math.cos(a) * cr;
                const cy = exitMapY + Math.sin(a) * cr;
                if (a === 0) ctx.moveTo(cx, cy);
                else ctx.lineTo(cx, cy);
            }
            ctx.stroke();
        }
        // 内部向上小三角
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = redInk;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(exitMapX, exitMapY - 4);
        ctx.lineTo(exitMapX - 3.2, exitMapY + 2.5);
        ctx.lineTo(exitMapX + 3.2, exitMapY + 2.5);
        ctx.closePath();
        ctx.stroke();
        // 文字
        ctx.fillStyle = redInk;
        ctx.font = 'italic 10px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('出口', exitMapX, exitMapY - 12);
    }

    // ============================================================
    // NPC 标记（红色铅笔 X + 圈注 + 手写体"被困者"）
    // ============================================================
    if (maze.npcFound) {
        const npcMapX = mapX + (maze.npcInitX / maze.mazeTileSize) * cellW;
        const npcMapY = mapY + (maze.npcInitY / maze.mazeTileSize) * cellH;
        const pulse = 0.65 + Math.sin(time * 3) * 0.35;
        ctx.lineCap = 'round';
        // 双勾 X（先粗淡、再细浓）
        const drawX = (w: number, a: number, col: string) => {
            ctx.globalAlpha = a;
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(npcMapX - 5.5, npcMapY - 5.5);
            ctx.lineTo(npcMapX + 5.5 + Math.sin(time) * 0.4, npcMapY + 5.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(npcMapX + 5.5, npcMapY - 5.5);
            ctx.lineTo(npcMapX - 5.5 + Math.cos(time) * 0.4, npcMapY + 5.5);
            ctx.stroke();
        };
        drawX(2.6, 0.45 * pulse, 'rgba(170,45,35,0.55)');
        drawX(1.2, 0.95 * pulse, 'rgba(130,25,20,0.95)');
        // 手绘圈
        ctx.globalAlpha = 0.55 * pulse;
        ctx.strokeStyle = 'rgba(160,40,30,0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.15) {
            const cr = 10 + Math.sin(a * 4 + time) * 1;
            const cx = npcMapX + Math.cos(a) * cr;
            const cy = npcMapY + Math.sin(a) * cr;
            if (a === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
        }
        ctx.closePath();
        ctx.stroke();
        // 文字
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(130,25,20,0.95)';
        ctx.font = 'italic 10px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('被困者', npcMapX, npcMapY - 16);
    }

    // ============================================================
    // 图例（素描风，只保留三类手绘标记语义，不再出现主题色块）
    // ============================================================
    ctx.globalAlpha = 0.75;
    ctx.font = 'italic 10px Georgia, serif';
    ctx.textAlign = 'left';
    const legendX = mapX + 4;
    const legendY = mapY + mapH + 18;
    let lx = legendX;
    const legendMaxX = mapX + mapW - 10;
    const advance = (w: number) => {
        lx += w;
        if (lx > legendMaxX) {
            lx = legendX;
        }
    };

    // 出口图例：红色小圈 + "出口"
    ctx.strokeStyle = 'rgba(160,40,30,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(lx + 6, legendY - 1, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#3E2C23';
    ctx.fillText('出口', lx + 15, legendY + 2);
    advance(50);

    // 被困者图例：红色小 X
    ctx.strokeStyle = 'rgba(130,25,20,0.95)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(lx + 2, legendY - 4);
    ctx.lineTo(lx + 10, legendY + 3);
    ctx.moveTo(lx + 10, legendY - 4);
    ctx.lineTo(lx + 2, legendY + 3);
    ctx.stroke();
    ctx.fillStyle = '#3E2C23';
    ctx.fillText('被困者', lx + 15, legendY + 2);
    advance(60);

    // 绳索图例：棕色实线带一点抖动
    ctx.strokeStyle = 'rgba(100,55,25,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(lx, legendY);
    ctx.lineTo(lx + 6, legendY - 1);
    ctx.lineTo(lx + 12, legendY + 0.5);
    ctx.lineTo(lx + 18, legendY - 0.5);
    ctx.stroke();
    ctx.fillStyle = '#3E2C23';
    ctx.fillText('绳索', lx + 22, legendY + 2);
    advance(50);

    // 已探索图例：双勾铅笔圆圈（象征洞穴轮廓）
    ctx.strokeStyle = 'rgba(90,70,55,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx + 6, legendY - 1, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,28,20,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(lx + 6, legendY - 1, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#3E2C23';
    ctx.fillText('已探区', lx + 15, legendY + 2);
}

// =============================================
// 入水动效绘制：完全照搬剧情模式（state.transition）的气泡转场观感
// - 200 个气泡随机撒在全屏，速度方向为"从屏幕中心指向自己位置"，持续向外飘散并回绕
// - 气泡造型：纯白主体 + 左上角高亮小点（alpha 比主体大 1.5 倍）
// - 背景：rgba(0,60,100) 半透明覆盖，浓度跟随 alpha（和剧情模式 in 模式一致）
// - 节奏：90 帧总长，前 50 帧 alpha 从 0 渐入到 1，后 40 帧保持 1，到 90 帧后 phase 切 play 瞬接水下场景
// =============================================
function drawMazeDivingIn(maze: any, cw: number, ch: number, time: number) {
    const timer = maze.divingInTimer;
    const inFrames = 50;  // 前 50 帧气泡与背景浓度从 0 渐入到 1，之后保持满值

    // alpha 曲线：0 → 1 后保持（对应剧情模式 out 阶段，屏幕被气泡+蓝色覆盖物逐渐吞没）
    // 不做淡出，因为迷宫 diving_in 期间底层不画水下场景，淡出会露出空白画布
    // 90 帧结束瞬切 play，此时蓝色覆盖直接换成水下场景主画面，色调接近观感连贯
    const alpha = Math.min(1, timer / inFrames);

    // --- 气泡更新与绘制 ---
    const bubbles = maze.divingInBubbles;
    if (!bubbles || bubbles.length === 0) {
        // 气泡数据缺失兜底：仅画背景
        ctx.fillStyle = `rgba(0, 60, 100, ${alpha})`;
        ctx.fillRect(0, 0, cw, ch);
        return;
    }

    // --- 背景：蓝色半透明覆盖，浓度跟随 alpha ---
    ctx.fillStyle = `rgba(0, 60, 100, ${alpha})`;
    ctx.fillRect(0, 0, cw, ch);

    // --- 气泡运动：照搬剧情模式的 update 公式 ---
    for (const b of bubbles) {
        b.x += b.vx;
        b.y += b.vy;

        b.wobble += 0.1;
        b.x += Math.sin(b.wobble) * 0.5;

        // 剧情模式里 out 阶段做轻微减速
        b.vx *= 0.98;
        b.vy *= 0.98;

        // 超出屏幕回绕到另一边（照搬剧情模式）
        if (b.y < -100) b.y = ch + 100;
        if (b.y > ch + 100) b.y = -100;
        if (b.x < -100) b.x = cw + 100;
        if (b.x > cw + 100) b.x = -100;
    }

    // --- 气泡绘制：照搬剧情模式（主体半透白 + 左上小高光）---
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

    // === 标题区域（充足顶部padding） ===
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

    // === 轨迹复盘地图（充足padding，布局宽松） ===
    const mapPadding = 28;
    const mapTopY = titleY + 40;
    // 统计区域高度预估
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

    // 地图背景（增大内边距）
    const mapInnerPad = 10;
    ctx.globalAlpha = showAlpha * 0.95;
    ctx.fillStyle = 'rgba(5,12,25,0.9)';
    ctx.beginPath();
    rrect(ctx, mapX - mapInnerPad, mapY - mapInnerPad, mapW + mapInnerPad * 2, mapH + mapInnerPad * 2, 10);
    ctx.fill();
    // 地图边框
    ctx.strokeStyle = isRescueSuccess ? 'rgba(60,200,140,0.25)' : 'rgba(60,120,180,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, mapX - mapInnerPad, mapY - mapInnerPad, mapW + mapInnerPad * 2, mapH + mapInnerPad * 2, 10);
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
        const statsY = mapY + mapH + 36;
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
            ctx.textBaseline = 'middle';
            ctx.fillText('下一局', cw / 2, btnY);
            ctx.textBaseline = 'alphabetic';

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
            ctx.textBaseline = 'middle';
            ctx.fillText('回到岸上', cw / 2, btnY);
            ctx.textBaseline = 'alphabetic';
        }
    }
}
