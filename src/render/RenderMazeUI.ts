import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { drawOxygenScreenGlow } from './RenderOxygenTank';
import { drawHUDTopLeft, initMazeHUDTopLeft } from './HUDTopLeft';
// BCD 浮力背心：水下 inflator 控件 + 失控告警层
import { drawBCDController, drawBCDWarnOverlay } from './RenderBCD';
// 撤离玩法 UI 模块（独立于现有 mazeUI 子目录，与撤离系统所有代码同处一个独立树下）
import { drawCoinHUD } from '../extraction/render/CoinHUD';
import { drawInventoryHUD } from '../extraction/render/InventoryHUD';
import { drawBagFullPage } from '../extraction/render/BagFullPage';
import { drawExtractionSettlement } from '../extraction/render/DebriefExtension';
import { drawShop, drawShopEntryBtn, isShopOpen as isExtractionShopOpen } from '../extraction/render/ShopUI';
import {
    drawWarehousePage,
    drawWarehouseEntryBtn,
    isWarehousePageOpen,
} from '../extraction/render/WarehousePage';
import { drawPickupHints } from '../extraction/render/PickupHints';
import { drawItemDetailCard } from '../extraction/render/ItemDetailCard';

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
import { drawMazeCodex } from './mazeUI/codex';
import { drawShoreButtonBar } from './mazeUI/ShoreButtonBar';

// 按钮矩形 getter 继续从本文件对外导出，兼容 input.ts 既有的
// `import { ... } from '../render/RenderMazeUI'` 路径
export {
    getAbandonBtnRect,
    getResolvedIdleNewCaseBtnRect,
    getBriefingAcceptBtnRect,
    getResolvedBtnRects,
    getAbandonedAcceptBtnRect,
} from './mazeUI/cases';
export {
    getCodexEntryBtnRect,
    getCodexCloseBtnRect,
    getCodexCellCount,
    getCodexCellRectByIndex,
} from './mazeUI/codex';

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
        // 图鉴全屏页：独立分发，不叠加任何其它 UI（返回按钮在全屏页自己画）
        if (maze.codexOpen) {
            drawMazeCodex(cw, ch, time);
            ctx.restore();
            return;
        }
        // 撤离玩法商店全屏页：独立分发
        if (isExtractionShopOpen()) {
            drawShop(cw, ch, time);
            // 详情卡（在商店上方）
            drawItemDetailCard();
            ctx.restore();
            return;
        }
        // 撤离玩法仓库全屏页
        if (isWarehousePageOpen()) {
            drawWarehousePage();
            drawItemDetailCard();
            ctx.restore();
            return;
        }
        drawMazeShore(maze, cw, ch, time);
        // 撤离玩法：顶部金币 HUD（仅在岸上 / resolved_idle 显示，避开警情通报和图鉴）
        if (!maze.shoreMapOpen && maze.briefingShown) {
            drawCoinHUD();
            // 商店入口按钮
            drawShopEntryBtn(cw, ch, time);
            // 仓库入口按钮（商店下方一行）
            drawWarehouseEntryBtn(cw, ch, time);
        }
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
        // 营地按钮栏（新主线 goHome 等；其内部 visible 已处理覆盖层互斥）
        drawShoreButtonBar(cw, ch, time);
        // 详情卡（最高层）
        drawItemDetailCard();
        ctx.restore();
        return;
    }

    // === 结案后"留在此处"状态：岸上画面但水面入口置灰 ===
    if (maze.phase === 'resolved_idle') {
        // 图鉴全屏页也允许在 resolved_idle 打开
        if (maze.codexOpen) {
            drawMazeCodex(cw, ch, time);
            ctx.restore();
            return;
        }
        // 撤离玩法商店全屏页：独立分发
        if (isExtractionShopOpen()) {
            drawShop(cw, ch, time);
            drawItemDetailCard();
            ctx.restore();
            return;
        }
        // 撤离玩法仓库全屏页
        if (isWarehousePageOpen()) {
            drawWarehousePage();
            drawItemDetailCard();
            ctx.restore();
            return;
        }
        drawMazeShore(maze, cw, ch, time);
        if (!maze.shoreMapOpen) {
            // 撤离玩法：顶部金币 HUD
            drawCoinHUD();
            drawShopEntryBtn(cw, ch, time);
            drawWarehouseEntryBtn(cw, ch, time);
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
        // 营地按钮栏（resolved_idle 也允许展示 goHome）
        drawShoreButtonBar(cw, ch, time);
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
        // 撤离玩法：在原结算页右上角追加"撤离结算"小卡片（含全部卖出按钮）
        drawExtractionSettlement(maze, cw, ch, time);
        ctx.restore();
        return;
    }

    // === 上浮动画阶段（0.5秒蓄力→弹射→破水爆裂全屏转场）===
    // 节奏对应 MazeLogic.updateMaze 的 surfacing 分支：
    //   帧 0..8   蓄力：屏幕边缘轻微向内挤压的暗角 + 淡淡的底部向上呼吸
    //   帧 8..22  爆发：屏幕顶部出现"被高速往上拖"的速度线 + 白色方向性径向模糊感
    //   帧 22..30 破水：全屏白色爆裂水花（径向放射状水滴线条 + 环形激波 + 中心白闪）
    if (maze.phase === 'surfacing') {
        const t = maze.resultTimer;
        const dur = CONFIG.maze.surfacingDuration; // 30
        ctx.save();

        if (t <= 8) {
            // === 蓄力 ===
            const k = t / 8; // 0..1
            // 轻微暗角，像憋气瞳孔收缩
            const grad = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.2, cw / 2, ch / 2, ch * 0.75);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, `rgba(0,0,0,${0.35 * k})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, cw, ch);
        } else if (t <= 22) {
            // === 爆发 ===
            const k = (t - 8) / 14; // 0..1
            // 顶部向下渐弱的"速度拖影"白雾，表现被向上拉扯
            const topGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.6);
            topGrad.addColorStop(0, `rgba(220,245,255,${0.55 * k})`);
            topGrad.addColorStop(1, 'rgba(220,245,255,0)');
            ctx.fillStyle = topGrad;
            ctx.fillRect(0, 0, cw, ch);

            // 速度线：从上向下快速甩出的长短白条，密度随 k 增加
            const lineCount = Math.floor(20 + k * 40);
            ctx.strokeStyle = `rgba(255,255,255,${0.35 + k * 0.45})`;
            ctx.lineWidth = 1.5;
            for (let i = 0; i < lineCount; i++) {
                // 用 t 当种子让线条逐帧变化，但不至于完全乱跳
                const seed = Math.sin(i * 12.9898 + t * 2.1) * 43758.5453;
                const rx = (seed - Math.floor(seed));
                const seed2 = Math.sin(i * 78.233 + t * 1.3) * 12345.678;
                const ry = (seed2 - Math.floor(seed2));
                const x = rx * cw;
                const y0 = ry * ch * 0.9;
                const len = 40 + (1 - ry) * 120 * k;
                ctx.beginPath();
                ctx.moveTo(x, y0);
                ctx.lineTo(x + (Math.sin(i) * 2), y0 + len);
                ctx.stroke();
            }
        } else {
            // === 破水爆裂 ===
            const k = (t - 22) / (dur - 22); // 0..1
            const cx = cw / 2;
            const cy = ch / 2;

            // 1. 中心白闪（最强在 k=0，快速淡出）
            const flashA = Math.max(0, 1 - k) * 0.9;
            if (flashA > 0.01) {
                const flashGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cw, ch) * 0.5);
                flashGrad.addColorStop(0, `rgba(255,255,255,${flashA})`);
                flashGrad.addColorStop(0.5, `rgba(230,245,255,${flashA * 0.5})`);
                flashGrad.addColorStop(1, 'rgba(180,220,240,0)');
                ctx.fillStyle = flashGrad;
                ctx.fillRect(0, 0, cw, ch);
            }

            // 2. 环形激波（白色圆环从中心快速向外扩散）
            const maxR = Math.hypot(cw, ch) * 0.6;
            const ringR = maxR * (k * 1.1);
            const ringA = Math.max(0, 1 - k) * 0.85;
            if (ringA > 0.02) {
                ctx.strokeStyle = `rgba(255,255,255,${ringA})`;
                ctx.lineWidth = 10 + (1 - k) * 16;
                ctx.beginPath();
                ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
                ctx.stroke();
                // 内圈淡一点的次波
                ctx.strokeStyle = `rgba(210,240,255,${ringA * 0.55})`;
                ctx.lineWidth = 4 + (1 - k) * 8;
                ctx.beginPath();
                ctx.arc(cx, cy, ringR * 0.72, 0, Math.PI * 2);
                ctx.stroke();
            }

            // 3. 放射状水滴线条（从中心向外甩的白色水滴）
            const dropCount = 48;
            ctx.strokeStyle = `rgba(240,255,255,${0.85 * (1 - k * 0.6)})`;
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            for (let i = 0; i < dropCount; i++) {
                const a = (i / dropCount) * Math.PI * 2 + Math.sin(i * 1.7) * 0.1;
                const r0 = 40 + k * maxR * 0.9;
                const r1 = r0 + 30 + (1 - k) * 60;
                const x0 = cx + Math.cos(a) * r0;
                const y0 = cy + Math.sin(a) * r0;
                const x1 = cx + Math.cos(a) * r1;
                const y1 = cy + Math.sin(a) * r1;
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
            }
            ctx.lineCap = 'butt';

            // 4. 底色淡青白过场（最终覆盖全屏，为切到 debrief 平滑铺底）
            ctx.fillStyle = `rgba(220,240,250,${0.3 + k * 0.5})`;
            ctx.fillRect(0, 0, cw, ch);
        }

        ctx.restore();
        ctx.restore();
        return;
    }

    // === 撤离失败转场（氧气耗尽 / 鱼咬死）===
    // 与 surfacing 的飞升不同：
    //   - 没有弹射/速度线/破水爆裂
    //   - 仅一个渐进的"失去视线"黑幕 + reason 专属色调
    //   - 45 帧内平滑铺底，然后切到 debrief（debrief 自己还有 fade-in）
    if (maze.phase === 'failed') {
        const t = maze.resultTimer;
        const dur = CONFIG.maze.failedDuration; // 45
        const k = Math.min(1, t / dur);
        ctx.save();

        // 1. 色调层：根据原因给一个淡淡的色罩
        if (maze.surfacingReason === 'fishkill') {
            // 被咬死：血红 → 暗红 淡出（FishEnemy 已把 redOverlay 拉到过 1.0，这里在它上面叠黑）
            ctx.fillStyle = `rgba(60, 10, 10, ${0.35 * k})`;
            ctx.fillRect(0, 0, cw, ch);
        } else if (maze.surfacingReason === 'deco') {
            // 减压病：紫色色调（关节疼痛 + 氮气析出视觉联想）
            ctx.fillStyle = `rgba(60, 10, 55, ${0.35 * k})`;
            ctx.fillRect(0, 0, cw, ch);
            // 边缘紫色压缩（痛感聚焦）
            const edgeGrad = ctx.createRadialGradient(cw / 2, ch / 2, ch * (0.3 - k * 0.15),
                                                       cw / 2, ch / 2, ch * 0.75);
            edgeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            edgeGrad.addColorStop(1, `rgba(80, 20, 90, ${0.5 * k})`);
            ctx.fillStyle = edgeGrad;
            ctx.fillRect(0, 0, cw, ch);
        } else {
            // 溺水：冷蓝 + 视野边缘压缩（缺氧瞳孔缩小）
            const edgeGrad = ctx.createRadialGradient(cw / 2, ch / 2, ch * (0.35 - k * 0.2),
                                                       cw / 2, ch / 2, ch * 0.75);
            edgeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            edgeGrad.addColorStop(1, `rgba(2, 10, 28, ${0.55 * k})`);
            ctx.fillStyle = edgeGrad;
            ctx.fillRect(0, 0, cw, ch);
            // 轻微冷色调
            ctx.fillStyle = `rgba(20, 50, 90, ${0.18 * k})`;
            ctx.fillRect(0, 0, cw, ch);
        }

        // 2. 黑幕淡入（末段加深，为 debrief 铺底）
        const blackK = Math.max(0, (k - 0.45) / 0.55);
        if (blackK > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${0.75 * blackK})`;
            ctx.fillRect(0, 0, cw, ch);
        }

        // 3. 末尾一行小字提示（淡入后淡出），告诉玩家发生了什么
        if (k > 0.25) {
            const textK = Math.min(1, (k - 0.25) / 0.35) * Math.max(0, 1 - blackK * 0.9);
            if (textK > 0.02) {
                const isDeco = maze.surfacingReason === 'deco';
                const isFish = maze.surfacingReason === 'fishkill';
                ctx.fillStyle = isFish ? `rgba(255, 180, 180, ${textK})`
                             : isDeco  ? `rgba(230, 180, 255, ${textK})`
                                       : `rgba(180, 220, 255, ${textK})`;
                ctx.font = 'bold 22px "PingFang SC", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('撤离失败', cw / 2, ch / 2 - 14);
                ctx.font = '12px "PingFang SC", Arial';
                ctx.fillStyle = isFish ? `rgba(220, 140, 140, ${textK * 0.85})`
                             : isDeco  ? `rgba(200, 160, 230, ${textK * 0.85})`
                                       : `rgba(150, 190, 220, ${textK * 0.85})`;
                const sub = isFish ? '被食人鱼撕碎 · 本次物品全部遗失'
                         : isDeco  ? '未完成减压 · 重度减压病 · 本次物品全部遗失'
                                   : '氧气耗尽 · 本次物品全部遗失';
                ctx.fillText(sub, cw / 2, ch / 2 + 14);
                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
            }
        }

        ctx.restore();
        ctx.restore();
        return;
    }
    // === 游戏中 HUD ===

    // 氧气拾取拾取后的全屏绿色辉光（在所有 HUD 之前绘制，不遮挖 HUD）
    drawOxygenScreenGlow(ctx, cw, ch);

    // --- 左上角 HUD（氧气环 / 深度仪表 / 手动挡 / 音频 / 生命探知仪，统一由 HUDTopLeft 管理） ---
    ensureMazeHUDInitialized();
    drawHUDTopLeft(time);

    // --- 顶部居中深度标牌 + 超深红警（场景内可视化"本次最大深度极限"） ---
    drawDepthBanner(maze, cw, ch);

    // --- BCD 浮力背心：失控上浮/下沉的屏幕边缘告警（压在控件下面，不挡控件）---
    drawBCDWarnOverlay(time);
    // --- BCD 浮力背心：右侧竖直 inflator 控件（充气钮 / 气囊量表 / 排气钮）---
    drawBCDController(time);

    // --- 撤离玩法：右下角背包胶囊 HUD（仅 play 阶段显示） ---
    drawInventoryHUD();
    // --- 撤离玩法：背包全屏页（点击胶囊后展开） ---
    drawBagFullPage();
    // --- 撤离玩法：拾取/容量飘字（世界坐标跟随，跟随相机变换） ---
    drawPickupHints();
    // --- 撤离玩法：物品详情卡（play 阶段也可能打开，最顶层） ---
    drawItemDetailCard();

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

// =============================================
// 顶部深度标牌 + 超深红警
// =============================================
//
// 设计：
// - 顶部居中（避开微信胶囊和左上 HUD）显示"30 / 60m"两段数字
// - 超过潜水衣极限时：标牌底变红 + 屏幕四周脉冲红雾（提示风险）
// - 不阻塞玩家视线（高度仅 26px、宽度约 110px）
function drawDepthBanner(maze: any, cw: number, ch: number): void {
    if (!maze || maze.phase !== 'play') return;

    const tile = maze.mazeTileSize || 120;
    const curDepth = Math.max(0, Math.floor(player.y / tile));
    const maxAllowed = (maze.maxDepthAllowed | 0) || 30;
    const overLimit = curDepth > maxAllowed;
    const ratio = Math.min(1.2, curDepth / Math.max(1, maxAllowed));

    // === 1. 屏幕边缘红警（仅超深时） ===
    if (overLimit) {
        const pulse = 0.35 + 0.25 * Math.sin(Date.now() / 250);
        // 四周径向暗角变红
        const grad = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.35, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.55);
        grad.addColorStop(0, 'rgba(180, 0, 0, 0)');
        grad.addColorStop(1, `rgba(180, 0, 0, ${pulse})`);
        ctx.save();
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);
        ctx.restore();
    }

    // === 2. 顶部居中标牌 ===
    // 位置：避开左上 HUD（左 92px 内是 HUD 区）和右上微信胶囊（右 110px 内）
    // 标牌宽 110、高 26，水平居中（如果可用宽度足够）
    const bannerW = 110;
    const bannerH = 26;
    const bannerX = (cw - bannerW) / 2;
    const bannerY = 16;

    ctx.save();

    // 底色：常态深蓝 / 临界（≥85%）橙色 / 超限红色
    let bgColor: string;
    let strokeColor: string;
    if (overLimit) {
        bgColor = 'rgba(140, 20, 20, 0.92)';
        strokeColor = 'rgba(255, 100, 100, 0.95)';
    } else if (ratio >= 0.85) {
        bgColor = 'rgba(80, 50, 10, 0.88)';
        strokeColor = 'rgba(255, 200, 100, 0.85)';
    } else {
        bgColor = 'rgba(15, 30, 50, 0.85)';
        strokeColor = 'rgba(140, 200, 240, 0.55)';
    }

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    rrect(ctx, bannerX, bannerY, bannerW, bannerH, 13);
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = overLimit ? 1.6 : 1.1;
    ctx.beginPath();
    rrect(ctx, bannerX, bannerY, bannerW, bannerH, 13);
    ctx.stroke();

    // 文字："深度 30 / 60m"
    const textColor = overLimit ? 'rgba(255, 220, 220, 0.98)'
                    : ratio >= 0.85 ? 'rgba(255, 230, 180, 0.95)'
                    : 'rgba(220, 240, 255, 0.95)';
    ctx.fillStyle = textColor;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cx = bannerX + bannerW / 2;
    const cy = bannerY + bannerH / 2;

    if (overLimit) {
        ctx.fillText(`⚠ ${curDepth}m / 极限 ${maxAllowed}m`, cx, cy);
    } else {
        ctx.fillText(`深度 ${curDepth} / ${maxAllowed}m`, cx, cy);
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
