// 迷宫模式：氧气瓶渲染
//
// 职责分三层：
//   1. 世界层：静态氧气瓶（呼吸发光 + 按住进度环 + 靠近高亮）
//   2. 世界层：安装中的飞行瓶 + 气泡爆发
//   3. 屏幕层：拾取成功后的全屏绿色辉光、"+X%" 跳字、氧气环脉冲（在 RenderMazeUI 里单独调用）
//
// 绘制风格要与整体风格统一：Canvas 2D 矢量、不过度饱和、带轻微自发光

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import type { OxygenTank, FlyingTank, OxygenFeedback, CompanionProp } from '../logic/OxygenTank';

// =============================================
// 世界层：绘制所有氧气瓶（视口剔除由外部调用者保证已做好范围判断）
// =============================================
export function drawOxygenTanksWorld(ctx: CanvasRenderingContext2D, viewL: number, viewR: number, viewT: number, viewB: number) {
    const maze = state.mazeRescue;
    if (!maze || !maze.oxygenTanks) return;
    const tanks: OxygenTank[] = maze.oxygenTanks;
    const c = (CONFIG as any).oxygenTank || {};
    const pickRange: number = c.pickRange ?? 90;
    const bodyScale: number = c.bodyScale ?? 1;

    // 第一遍：先画伴生遗物（静态暗沉，不发光，作为"前人留下"的背景叙事）
    for (const t of tanks) {
        if (t.consumed) continue;
        if (t.x < viewL - 60 || t.x > viewR + 60 || t.y < viewT - 60 || t.y > viewB + 60) continue;
        if (t.companions && t.companions.length > 0) {
            drawCompanions(ctx, t);
        }
    }
    // 第二遍：再画氧气瓶本体（发光、呼吸，画在最上层，强调"活的、救命的"对比）
    for (const t of tanks) {
        if (t.consumed) continue;
        if (t.x < viewL - 40 || t.x > viewR + 40 || t.y < viewT - 40 || t.y > viewB + 40) continue;
        drawSingleTank(ctx, t, bodyScale);
        // 靠近时画按住进度环 + 高亮
        const distToPlayer = Math.hypot(player.x - t.x, player.y - t.y);
        if (distToPlayer < pickRange) {
            drawPickHint(ctx, t, distToPlayer, pickRange);
        }
    }
}

// =============================================
// 伴生遗物绘制：潜水镜、潜水衣、布条碎片
// 风格：暗沉、静态、不发光、不呼吸 —— 强调"前人遗物"的死寂感
// 与呼吸发光的氧气瓶形成"活 vs 死"的视觉对比
// =============================================
function drawCompanions(ctx: CanvasRenderingContext2D, t: OxygenTank) {
    if (!t.companions) return;
    for (const comp of t.companions) {
        const wx = t.x + comp.offsetX;
        const wy = t.y + comp.offsetY;
        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(comp.angle);
        ctx.scale(comp.size, comp.size);
        if (comp.kind === 'goggles') {
            drawGoggles(ctx, comp);
        } else if (comp.kind === 'suit') {
            drawSuit(ctx, comp);
        } else if (comp.kind === 'clothStrip') {
            drawClothStrip(ctx, comp);
        }
        ctx.restore();
    }
}

// 潜水镜：两个小圆镜片 + 中间桥 + 头带
function drawGoggles(ctx: CanvasRenderingContext2D, c: CompanionProp) {
    // 镜框颜色：0=黑 1=黄 2=蓝
    const FRAME_COLORS = ['#1a1a1a', '#8a6e1e', '#1c3a55'];
    const frame = FRAME_COLORS[c.color % 3];
    // 先画头带（一条弯曲的软皮带，淡色）
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const bandPhase = pseudoRand(c.seed) * Math.PI;
    for (let i = 0; i <= 10; i++) {
        const tt = i / 10;
        const bx = -14 + tt * 28;
        const by = -6 + Math.sin(tt * Math.PI * 2 + bandPhase) * 1.5;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
    // 两个镜框
    const eyeR = 4;
    // 左镜
    ctx.fillStyle = frame;
    ctx.beginPath();
    ctx.arc(-5, 0, eyeR, 0, Math.PI * 2);
    ctx.fill();
    // 右镜
    ctx.beginPath();
    ctx.arc(5, 0, eyeR, 0, Math.PI * 2);
    ctx.fill();
    // 镜片（暗蓝灰，死气沉沉）
    const lensColor = 'rgba(55, 70, 80, 0.75)';
    ctx.fillStyle = lensColor;
    ctx.beginPath();
    ctx.arc(-5, 0, eyeR - 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, 0, eyeR - 1.2, 0, Math.PI * 2);
    ctx.fill();
    // 中间桥
    ctx.fillStyle = frame;
    ctx.fillRect(-2, -1, 4, 2);
    // 根据形态变体：裂纹 / 单边碎
    if (c.formVariant === 1) {
        // 两边都有裂纹
        ctx.strokeStyle = 'rgba(200, 210, 215, 0.5)';
        ctx.lineWidth = 0.5;
        for (const ex of [-5, 5]) {
            ctx.beginPath();
            ctx.moveTo(ex - 2.5, -1);
            ctx.lineTo(ex + 0.5, 0.5);
            ctx.lineTo(ex + 2, 2);
            ctx.stroke();
        }
    } else if (c.formVariant === 2) {
        // 单边碎（右镜），镜片被一坨暗色覆盖表示空洞
        ctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
        ctx.beginPath();
        ctx.arc(5, 0, eyeR - 1.5, 0, Math.PI * 2);
        ctx.fill();
        // 碎裂辐射线
        ctx.strokeStyle = 'rgba(180, 185, 190, 0.4)';
        ctx.lineWidth = 0.4;
        for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2 + pseudoRand(c.seed + k) * 0.5;
            ctx.beginPath();
            ctx.moveTo(5, 0);
            ctx.lineTo(5 + Math.cos(a) * 5, Math.sin(a) * 5);
            ctx.stroke();
        }
    }
}

// 潜水衣：形态 0=完整上衣 1=腰片 2=撕开的碎布
function drawSuit(ctx: CanvasRenderingContext2D, c: CompanionProp) {
    // 颜色：0=黑 1=深蓝 2=深红
    const SUIT_COLORS = ['#181a1d', '#1a2840', '#3a1614'];
    const SUIT_EDGES = ['#0a0b0d', '#0c1220', '#1e0807'];
    const main = SUIT_COLORS[c.color % 3];
    const edge = SUIT_EDGES[c.color % 3];
    if (c.formVariant === 0) {
        // 完整上衣：梯形躯干 + 破损下摆
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.moveTo(-7, -10);
        ctx.lineTo(7, -10);
        ctx.lineTo(9, 8);
        // 破损下摆
        const seedBase = c.seed;
        ctx.lineTo(7, 10 + pseudoRand(seedBase) * 2);
        ctx.lineTo(4, 7 + pseudoRand(seedBase + 1) * 2);
        ctx.lineTo(1, 11 + pseudoRand(seedBase + 2) * 2);
        ctx.lineTo(-3, 8 + pseudoRand(seedBase + 3) * 2);
        ctx.lineTo(-6, 11 + pseudoRand(seedBase + 4) * 2);
        ctx.lineTo(-9, 8);
        ctx.closePath();
        ctx.fill();
        // 边缘暗线
        ctx.strokeStyle = edge;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // 胸口拉链
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.6)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 6);
        ctx.stroke();
        // 破洞（2~3 个）
        ctx.fillStyle = 'rgba(5, 5, 5, 0.9)';
        for (let k = 0; k < 2; k++) {
            const r1 = pseudoRand(c.seed + 10 + k);
            const r2 = pseudoRand(c.seed + 20 + k);
            ctx.beginPath();
            ctx.arc(-4 + r1 * 8, -5 + r2 * 10, 1 + r1 * 1.2, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (c.formVariant === 1) {
        // 腰片：一小段横向撕扯的布片
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.moveTo(-10, -3);
        ctx.lineTo(-7, -4);
        ctx.lineTo(-3, -3);
        ctx.lineTo(2, -4);
        ctx.lineTo(7, -3);
        ctx.lineTo(10, -2);
        ctx.lineTo(10, 3);
        ctx.lineTo(7, 4);
        ctx.lineTo(3, 3);
        ctx.lineTo(-2, 4);
        ctx.lineTo(-7, 3);
        ctx.lineTo(-10, 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 0.6;
        ctx.stroke();
    } else {
        // 撕开的碎布：不规则多边形
        const seedBase = c.seed;
        ctx.fillStyle = main;
        ctx.beginPath();
        const pts = 7;
        for (let i = 0; i < pts; i++) {
            const a = (i / pts) * Math.PI * 2;
            const r = 4 + pseudoRand(seedBase + i) * 4;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
}

// 布条：简单的撕裂条形（当 suit 被抽成 clothStrip 时用）
function drawClothStrip(ctx: CanvasRenderingContext2D, c: CompanionProp) {
    const COLORS = ['#1a1a1c', '#1a2840', '#3a1614'];
    const col = COLORS[c.color % 3];
    const seedBase = c.seed;
    ctx.fillStyle = col;
    ctx.beginPath();
    // 一条弯曲的撕布
    const len = 14;
    const topPts: number[][] = [];
    const botPts: number[][] = [];
    for (let i = 0; i <= 5; i++) {
        const tt = i / 5;
        const bx = -len / 2 + tt * len;
        const by = Math.sin(tt * Math.PI * 2 + pseudoRand(seedBase) * Math.PI) * 1.8;
        const thick = 1.5 + pseudoRand(seedBase + i) * 1.5;
        topPts.push([bx, by - thick]);
        botPts.push([bx, by + thick]);
    }
    ctx.moveTo(topPts[0][0], topPts[0][1]);
    for (let i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i][0], topPts[i][1]);
    for (let i = botPts.length - 1; i >= 0; i--) ctx.lineTo(botPts[i][0], botPts[i][1]);
    ctx.closePath();
    ctx.fill();
    // 末端抽丝
    ctx.strokeStyle = 'rgba(40, 40, 45, 0.6)';
    ctx.lineWidth = 0.4;
    for (let k = 0; k < 3; k++) {
        const side = k < 2 ? -1 : 1;
        const y0 = (pseudoRand(seedBase + 40 + k) - 0.5) * 3;
        ctx.beginPath();
        ctx.moveTo(side * len / 2, y0);
        ctx.lineTo(side * (len / 2 + 2 + pseudoRand(seedBase + 50 + k) * 2), y0 + (pseudoRand(seedBase + 60 + k) - 0.5) * 3);
        ctx.stroke();
    }
}

function drawSingleTank(ctx: CanvasRenderingContext2D, t: OxygenTank, scale: number) {
    const v = t.variant;
    ctx.save();
    ctx.translate(t.x, t.y);
    // 瓶身本来头朝外（法线方向），这里把瓶身画竖直，再按法线方向旋转；
    // 瓶身默认指向 -Y（即"头朝上"），法线方向是"瓶头朝向"
    // 所以旋转量 = normalAngle - (-π/2) = normalAngle + π/2
    // 再叠加 variant.tilt 模拟自然倾倒（前人丢下的，不会整整齐齐对准）
    ctx.rotate(t.normalAngle + Math.PI / 2 + (v ? v.tilt : 0));
    ctx.scale(scale, scale);

    // 呼吸：周期性缩放 + 自发光
    const pulse = 0.5 + 0.5 * Math.sin(t.breathPhase);
    const glowAlpha = 0.25 + pulse * 0.35;

    // 背光晕（大范围柔光，远距离可见）
    const glowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
    glowGrad.addColorStop(0, `rgba(120, 220, 180, ${glowAlpha})`);
    glowGrad.addColorStop(1, 'rgba(120, 220, 180, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();

    // === 瓶体：按 variant.bodyColor 取色 ===
    // 0=老黄 1=暗红 2=军绿 3=褪色灰蓝
    const BODY_COLORS: Array<[string, string, string]> = [
        ['#d4b340', 'rgba(255, 240, 160, 0.55)', 'rgba(60, 40, 20, 0.4)'],   // 老黄
        ['#9a3f2e', 'rgba(220, 130, 110, 0.45)', 'rgba(40, 15, 10, 0.5)'],   // 暗红
        ['#5d6b3a', 'rgba(170, 190, 120, 0.45)', 'rgba(25, 35, 15, 0.5)'],   // 军绿
        ['#6e8590', 'rgba(180, 205, 220, 0.45)', 'rgba(30, 45, 55, 0.5)'],   // 褪色灰蓝
    ];
    const bodyIdx = v ? (v.bodyColor & 3) : 0;
    const [bodyMain, bodyHi, bodyShade] = BODY_COLORS[bodyIdx];

    // 竖直方向尺寸：高度 26，宽度 10
    const bodyH = 26, bodyW = 10;
    // 主体
    ctx.fillStyle = bodyMain;
    roundedRect(ctx, -bodyW / 2, -bodyH / 2 + 3, bodyW, bodyH - 6, 2.5);
    ctx.fill();
    // 高光条（左侧竖向）
    ctx.fillStyle = bodyHi;
    ctx.fillRect(-bodyW / 2 + 1.5, -bodyH / 2 + 5, 2, bodyH - 10);
    // 暗边（右侧）
    ctx.fillStyle = bodyShade;
    ctx.fillRect(bodyW / 2 - 2, -bodyH / 2 + 5, 1.5, bodyH - 10);

    // === 锈蚀斑点（按 rustLevel） ===
    if (v && v.rustLevel > 0) {
        const rustSeed = v.seed;
        const rustCount = v.rustLevel === 1 ? 3 : 7;
        for (let i = 0; i < rustCount; i++) {
            const r = pseudoRand(rustSeed + i * 17);
            const r2 = pseudoRand(rustSeed + i * 31 + 5);
            const r3 = pseudoRand(rustSeed + i * 53 + 11);
            const rx = (r - 0.5) * (bodyW - 3);
            const ry = (r2 - 0.5) * (bodyH - 10);
            const rr = 0.7 + r3 * 1.3;
            const rustAlpha = v.rustLevel === 1 ? 0.35 : 0.55;
            ctx.fillStyle = `rgba(70, 38, 18, ${rustAlpha})`;
            ctx.beginPath();
            ctx.arc(rx, ry, rr, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // === 瓶身裂口（15% 概率） ===
    if (v && v.hasCrack) {
        const crackSeed = v.seed + 99;
        ctx.strokeStyle = 'rgba(20, 10, 5, 0.85)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const cStart = pseudoRand(crackSeed) * (bodyH - 12) - (bodyH - 12) / 2;
        ctx.moveTo(-bodyW / 2 + 1, cStart);
        // 锯齿三段
        ctx.lineTo(-bodyW / 2 + 2.5 + pseudoRand(crackSeed + 1) * 1.5, cStart + 2);
        ctx.lineTo(-bodyW / 2 + 1 + pseudoRand(crackSeed + 2) * 1.5, cStart + 4);
        ctx.lineTo(-bodyW / 2 + 3 + pseudoRand(crackSeed + 3) * 1.5, cStart + 6);
        ctx.stroke();
    }

    // === 顶阀（朝外那一端，按 valveColor 取色） ===
    // 0=红 1=橙 2=黑
    const VALVE_COLORS: Array<[string, string]> = [
        ['#c83a2a', '#6b1e12'],
        ['#d97a1c', '#7a3e0c'],
        ['#2a2420', '#0c0806'],
    ];
    const valveIdx = v ? (v.valveColor % 3) : 0;
    const [valveMain, valveDark] = VALVE_COLORS[valveIdx];
    ctx.fillStyle = valveMain;
    roundedRect(ctx, -4, -bodyH / 2, 8, 5, 2);
    ctx.fill();
    // 阀门小帽
    ctx.fillStyle = valveDark;
    ctx.fillRect(-1.5, -bodyH / 2 - 2.5, 3, 3);
    // 顶阀发光点（呼吸感知核心，始终发光）
    const topGlow = 0.4 + pulse * 0.6;
    ctx.fillStyle = `rgba(160, 255, 200, ${topGlow * 0.85})`;
    ctx.beginPath();
    ctx.arc(0, -bodyH / 2 + 2, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // === 底部束带（黑色） ===
    ctx.fillStyle = '#2a2014';
    ctx.fillRect(-bodyW / 2 - 0.5, bodyH / 2 - 4, bodyW + 1, 2);

    // === 瓶身中央标识：按 labelKind 变化 ===
    // 0=O₂ 1=AIR 2=32% 3=模糊不清
    const labelIdx = v ? (v.labelKind & 3) : 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (labelIdx === 0) {
        ctx.fillStyle = 'rgba(20,10,5,0.85)';
        ctx.font = 'bold 7px Arial';
        ctx.fillText('O₂', 0, 2);
    } else if (labelIdx === 1) {
        ctx.fillStyle = 'rgba(20,10,5,0.85)';
        ctx.font = 'bold 6px Arial';
        ctx.fillText('AIR', 0, 2);
    } else if (labelIdx === 2) {
        ctx.fillStyle = 'rgba(20,10,5,0.85)';
        ctx.font = 'bold 6px Arial';
        ctx.fillText('32%', 0, 2);
    } else {
        // 模糊标签：只画一坨破损矩形底色
        ctx.fillStyle = 'rgba(240, 230, 200, 0.4)';
        ctx.fillRect(-3, -1, 6, 4);
        ctx.fillStyle = 'rgba(30,20,10,0.5)';
        ctx.fillRect(-2.5, 0, 2, 1);
        ctx.fillRect(0.5, 1, 2, 1);
    }

    ctx.restore();
}

// 确定性伪随机（给渲染细节用，不消耗 srand）
function pseudoRand(seed: number): number {
    let s = (seed | 0) ^ 0x9E3779B9;
    s = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
    s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35);
    s = s ^ (s >>> 16);
    return ((s >>> 0) % 10000) / 10000;
}

function drawPickHint(ctx: CanvasRenderingContext2D, t: OxygenTank, dist: number, pickRange: number) {
    ctx.save();
    // 范围进入反馈：越近越亮
    const proximity = Math.max(0, 1 - dist / pickRange);

    // === 交互环：脚下环形提示，按住时填充进度 ===
    const ringR = 22;
    ctx.translate(t.x, t.y);

    // 背景虚圈
    ctx.strokeStyle = `rgba(180, 255, 210, ${0.18 + proximity * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 按住进度
    if (t.holdProgress > 0.002) {
        ctx.strokeStyle = 'rgba(120, 255, 180, 0.95)';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t.holdProgress);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // 进度填到一半之后，瓶子开始微微震动（手感反馈）
        // 这里不做模态文字"安装中"，保持画面简洁
    }

    ctx.restore();
}

// =============================================
// 世界层：飞行氧气瓶 + 气泡爆发
// =============================================
export function drawOxygenFeedbackWorld(ctx: CanvasRenderingContext2D) {
    const maze = state.mazeRescue;
    if (!maze || !maze.oxygenFeedback) return;
    const fb: OxygenFeedback = maze.oxygenFeedback;

    // 飞行瓶（迷你发光圆点，尾迹）
    for (const fly of fb.flyingTanks) {
        if (fly.done) continue;
        ctx.save();
        // 尾迹
        const tailGrad = ctx.createLinearGradient(fly.x - fly.vx * 4, fly.y - fly.vy * 4, fly.x, fly.y);
        tailGrad.addColorStop(0, 'rgba(160, 255, 200, 0)');
        tailGrad.addColorStop(1, 'rgba(160, 255, 200, 0.6)');
        ctx.strokeStyle = tailGrad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fly.x - fly.vx * 4, fly.y - fly.vy * 4);
        ctx.lineTo(fly.x, fly.y);
        ctx.stroke();
        // 主体：微型氧气瓶剪影
        const glow = ctx.createRadialGradient(fly.x, fly.y, 0, fly.x, fly.y, 10);
        glow.addColorStop(0, 'rgba(220, 255, 220, 0.95)');
        glow.addColorStop(0.5, 'rgba(160, 240, 200, 0.6)');
        glow.addColorStop(1, 'rgba(160, 240, 200, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(fly.x, fly.y, 10, 0, Math.PI * 2);
        ctx.fill();
        // 核心黄色小瓶
        ctx.fillStyle = '#e6c850';
        ctx.beginPath();
        ctx.arc(fly.x, fly.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 气泡爆发
    for (const b of fb.bubbleBurst) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, b.life) * 0.9;
        // 气泡白色外环
        ctx.strokeStyle = 'rgba(220, 245, 255, 0.9)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.stroke();
        // 内部淡填充
        ctx.fillStyle = 'rgba(180, 230, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size * 0.85, 0, Math.PI * 2);
        ctx.fill();
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(b.x - b.size * 0.3, b.y - b.size * 0.3, b.size * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// =============================================
// 屏幕层：拾取后的绿色全屏辉光（由 RenderMazeUI 调用，坐标为屏幕空间）
// =============================================
export function drawOxygenScreenGlow(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    const maze = state.mazeRescue;
    if (!maze || !maze.oxygenFeedback) return;
    const fb: OxygenFeedback = maze.oxygenFeedback;
    if (fb.screenGlowTimer <= 0) return;

    const t = fb.screenGlowTimer;
    // 边缘发光更亮、中心通透（让玩家看清画面，不挡视野）
    const grad = ctx.createRadialGradient(screenW / 2, screenH / 2, Math.min(screenW, screenH) * 0.25, screenW / 2, screenH / 2, Math.max(screenW, screenH) * 0.75);
    grad.addColorStop(0, `rgba(120, 255, 180, 0)`);
    grad.addColorStop(1, `rgba(120, 255, 180, ${0.22 * t})`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, screenW, screenH);
    ctx.restore();
}

// =============================================
// 辅助：圆角矩形
// =============================================
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
