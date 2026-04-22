import { CONFIG } from '../core/config';
import { state, player } from '../core/state';

// 绘制一个小钉子（锚点），angle 指向"外侧"方向
function drawAnchor(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.fillStyle = '#d7c48a';
    ctx.strokeStyle = 'rgba(80,60,30,0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

// 绘制绳节（小十字）
function drawKnot(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.fillStyle = '#b9a06a';
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// 绘制救援绳（玩家 ↔ NPC）：节点绳样式，复用 RenderRope 的基调
export function drawRescueRopeWorld(ctx: CanvasRenderingContext2D) {
    // 仅迷宫模式、已绑绳、NPC 激活时绘制
    if (state.screen !== 'mazeRescue') return;
    const maze = state.mazeRescue;
    if (!maze || !maze.npcRescued) return;
    if (!state.npc || !state.npc.active) return;

    const x1 = player.x;
    const y1 = player.y;
    const x2 = state.npc.x;
    const y2 = state.npc.y;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) return;

    const segs = CONFIG.maze.rescueRopeSegments;
    const slackAmp = CONFIG.maze.rescueRopeSlackAmp;
    const waveAmp = CONFIG.maze.rescueRopeWaveAmp;
    const time = Date.now() / 1000;

    // 根据距离与绳索极限的比例调整松弛程度：越接近 max 越绷紧
    const maxD = CONFIG.maze.npcTetherMaxDist;
    const tension = Math.max(0, Math.min(1, dist / maxD));
    const slackFactor = 1 - tension * 0.85; // 0.15 ~ 1

    // 法线方向（用于侧向松垂）
    const nx = -dy / dist;
    const ny = dx / dist;

    // 构造折线点
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        // 主线位置
        const px = x1 + dx * t;
        const py = y1 + dy * t;
        // 松弛包络（两端固定中间下垂）
        const env = Math.sin(t * Math.PI);
        const sag = slackAmp * slackFactor * env;
        const wave = Math.sin(t * Math.PI * 2 + time * 1.8) * waveAmp * slackFactor * env;
        // 重力方向分量（偏下）+ 水流摆动
        const offset = sag + wave;
        pts.push({
            x: px + nx * offset * 0.3,
            y: py + ny * offset * 0.3 + sag * 0.6, // 稍微整体下垂
        });
    }

    // 绘制主绳线
    ctx.save();
    ctx.strokeStyle = CONFIG.maze.rescueRopeColor;
    ctx.lineWidth = CONFIG.maze.rescueRopeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 绷紧时绳色略变暖（轻微提示拉满）
    if (tension > 0.85) {
        ctx.strokeStyle = '#e8a86a';
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();

    // 每隔几段画一个小绳节
    for (let i = 2; i < pts.length - 1; i += 3) {
        drawKnot(ctx, pts[i].x, pts[i].y);
    }

    // 两端锚点
    drawAnchor(ctx, x1, y1);
    drawAnchor(ctx, x2, y2);

    ctx.restore();
}

// 绘制 NPC 呼救表现：气泡、挥手手臂修正、远距离闪光圈
export function drawNPCDistressWorld(ctx: CanvasRenderingContext2D) {
    if (state.screen !== 'mazeRescue') return;
    if (!state.npc || !state.npc.active) return;
    const maze = state.mazeRescue;
    if (!maze || maze.npcRescued) return; // 被救后不再呼救

    const npc: any = state.npc;

    // 1. 呼救气泡（基础透明度，即使不激活也绘制已有粒子消散过程）
    if (npc.distressBubbles && npc.distressBubbles.length > 0) {
        ctx.save();
        for (const b of npc.distressBubbles) {
            const alpha = Math.max(0, b.life);
            ctx.fillStyle = `rgba(200,240,255,${alpha * 0.85})`;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
            ctx.fill();
            // 小高光
            ctx.fillStyle = `rgba(255,255,255,${alpha * 0.9})`;
            ctx.beginPath();
            ctx.arc(b.x - b.size * 0.3, b.y - b.size * 0.3, b.size * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // 2. 远距离方向闪光圈（黄色脉冲环，仅在激活期间生成，但已有圈会消散）
    if (npc.distressHalos && npc.distressHalos.length > 0) {
        ctx.save();
        for (const h of npc.distressHalos) {
            const tt = Math.max(0, Math.min(1, h.t));
            const r = 10 + tt * 55;
            const alpha = (1 - tt) * 0.55;
            ctx.strokeStyle = `rgba(255,230,90,${alpha})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(npc.x, npc.y, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // 3. 挥手动作（在 NPC 身旁画一条短小挥动的手臂线，补充近距离表现）
    if (npc.distressActive) {
        const swing = Math.sin(npc.distressArmPhase);
        const baseAng = npc.angle - Math.PI / 2; // 相对身体左上方
        const armLen = 12;
        const armAng = baseAng + swing * CONFIG.maze.npcDistressArmSwing;
        const sx = npc.x + Math.cos(npc.angle) * 2;
        const sy = npc.y + Math.sin(npc.angle) * 2;
        const ex = sx + Math.cos(armAng) * armLen;
        const ey = sy + Math.sin(armAng) * armLen;

        ctx.save();
        ctx.strokeStyle = 'rgba(210,170,130,0.85)';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // 手掌端点
        ctx.fillStyle = 'rgba(230,200,170,0.9)';
        ctx.beginPath();
        ctx.arc(ex, ey, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
