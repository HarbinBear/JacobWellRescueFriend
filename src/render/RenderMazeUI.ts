import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { drawOxygenScreenGlow } from './RenderOxygenTank';
import { drawHUDTopLeft, initMazeHUDTopLeft } from './HUDTopLeft';

// 本文件已按职责拆分到 src/render/mazeUI/ 目录：
//   - mazeUI/shore.ts    岸上界面 + 全屏认知地图 + 下潜记录列表 / 单次手绘回放
//   - mazeUI/debrief.ts  入水动效 + 下潜结算数据页
//   - mazeUI/cases.ts    警情通报 / 救援成功 / 搜寻终止 3 个全屏叙事页 + 放弃按钮 + resolved_idle 按钮 + 所有按钮矩形 getter
// 本文件只保留：
//   - drawMazeHUD 总分发器（按 phase 调度到子模块）
//   - drawMazeMinimap 调试小地图（仅在 CONFIG.debug 下展示，体积小且只在此处使用，不拆）
//   - rrect / ensureMazeHUDInitialized 等本文件内部用到的辅助
//   - 对外 re-export 按钮矩形 getter，保持 input.ts 的导入路径不变
import { drawMazeShore } from './mazeUI/shore';
import { drawMazeDivingIn, drawMazeDebrief } from './mazeUI/debrief';
import {
    drawCaseBriefing,
    drawCaseResolved,
    drawCaseAbandoned,
    drawAbandonBtn,
    drawResolvedIdleNewCaseBtn,
} from './mazeUI/cases';

// 按钮矩形 getter 继续从本文件对外导出，兼容 input.ts 既有的
// `import { ... } from '../render/RenderMazeUI'` 路径
export {
    getAbandonBtnRect,
    getResolvedIdleNewCaseBtnRect,
    getBriefingAcceptBtnRect,
    getResolvedBtnRects,
    getAbandonedAcceptBtnRect,
} from './mazeUI/cases';

// 确保迷宫模式 HUD 管理器已初始化（仅初始化一次，跨会话也只初始化一次）
let _mazeHUDInitialized = false;
function ensureMazeHUDInitialized() {
    if (_mazeHUDInitialized) return;
    initMazeHUDTopLeft();
    _mazeHUDInitialized = true;
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
        // 放弃救援按钮（仅在岸上主界面显示，全屏地图与通报覆盖时不显示）
        if (!maze.shoreMapOpen && maze.briefingShown) {
            const hp = (maze.abandonHolding && maze.abandonHoldStart > 0)
                ? Math.min(1, (Date.now() - maze.abandonHoldStart) / 2000)
                : 0;
            drawAbandonBtn(cw, ch, time, hp);
        }
        // 警情通报 overlay（首次进入新地图时出现，点击"接受任务"后消失）
        // 放在按钮之后，确保通报页覆盖其它 UI
        if (!maze.briefingShown && !maze.shoreMapOpen) {
            drawCaseBriefing(maze, cw, ch, time);
        }
        ctx.restore();
        return;
    }

    // === 结案后"留在此处"状态：岸上画面但水面入口置灰 ===
    if (maze.phase === 'resolved_idle') {
        drawMazeShore(maze, cw, ch, time);
        if (!maze.shoreMapOpen) {
            // 水面入口上盖一层"本案已结案"半透明遮罩
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            const poolX = cw * 0.5, poolY = ch * 0.44;
            const poolW = 100, poolH = 52;
            ctx.beginPath();
            ctx.ellipse(poolX, poolY, poolW, poolH, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(220,255,230,0.85)';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('本案已结案', poolX, poolY);
            ctx.font = '10px Arial';
            ctx.fillStyle = 'rgba(200,220,210,0.65)';
            ctx.fillText('可查看记录，不能再下潜', poolX, poolY + 16);
            // 右上角"接受新任务"按钮
            drawResolvedIdleNewCaseBtn(cw, ch, time);
        }
        ctx.restore();
        return;
    }

    // === 救援成功结案页（全屏叙事） ===
    if (maze.phase === 'resolved') {
        drawCaseResolved(maze, cw, ch, time);
        ctx.restore();
        return;
    }

    // === 搜寻终止结案页（放弃救援全屏叙事） ===
    if (maze.phase === 'abandoned') {
        drawCaseAbandoned(maze, cw, ch, time);
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
    ensureMazeHUDInitialized();
    drawHUDTopLeft(time);

    // 仅保留"氧气拾取后屏幕级别的 +X% 飘字"（HUDTopLeft 内部不负责这个世界级飘字）
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


// 迷宫小地图绘制（仅调试模式用，保留在主文件以减少跨文件依赖）
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
    if (maze.fishDens && maze.fishDens.length > 0) {
        const baseY = mapY + toggleBtnSize + 4;
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
