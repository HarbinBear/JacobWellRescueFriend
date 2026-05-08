// 迷宫图鉴物件 - 世界层绘制
//
// 设计约束：
// - 全部纯矢量线稿，辨识度高但视觉噪音低
// - 绝对静态：不发光、不呼吸、不脉冲、不闪烁
// - 已发现和未发现外观完全一致（避免视觉噪音）
// - 调用时机：在 drawDustDarkLayer 之前、岩石/绳索/鱼/NPC 同层，会被光照遮罩统一压暗
//
// 2026-05 本轮调整：
// - 物件整体放大：本层额外乘一个 RELIC_SCALE_MUL 放大系数（配合生成侧 1.5~1.9 size）
// - 发现瞬间物件上方冒"发现 · <物件名>"小字（世界空间飘字，1.5s 淘汰）
//
// 对外函数：drawRelicsWorld / drawRelicHintsWorld

import { state } from '../core/state';
import { Relic, RelicKind, getRelicHints } from '../logic/Relic';

// 尺度放大系数：配合 Relic.ts 生成侧的 size 一起重调。
// 在 drawRelic 统一 scale(size * RELIC_SCALE_MUL)，为后续运行期调整留出空间。
const RELIC_SCALE_MUL = 1.1;

// 统一的"被水侵蚀"调色板
const PALETTE = {
    bone:       '#c9c0a8',  // 骨色（偏冷象牙白）
    boneDark:   '#706a58',
    coinBody:   '#8a7030',  // 青铜
    coinEdge:   '#5c4a20',
    pot:        '#6e4c34',  // 陶土
    potEdge:    '#3b2416',
    iron:       '#6a7378',  // 铁/钢
    ironEdge:   '#2e3437',
    rust:       '#a55a30',  // 铁锈点
    silver:     '#b8c0c5',  // 银
    silverEdge: '#676d72',
    gem:        '#4a8daf',  // 指环宝石
    stone:      '#6a655a',  // 石板
    stoneDark:  '#3a3530',
    brass:      '#a07030',  // 黄铜（铃/钥匙）
    brassEdge:  '#5c3a14',
    shell:      '#b8a27a',  // 海螺
    shellLine:  '#6a5432',
};

function drawRelic(ctx: CanvasRenderingContext2D, relic: Relic) {
    ctx.save();
    ctx.translate(relic.x, relic.y);
    ctx.rotate(relic.angle);
    ctx.scale(relic.size * RELIC_SCALE_MUL, relic.size * RELIC_SCALE_MUL);

    switch (relic.kind) {
        case 'skeleton':    drawSkeleton(ctx); break;
        case 'coin':        drawCoin(ctx); break;
        case 'potshard':    drawPotshard(ctx); break;
        case 'anchor':      drawAnchor(ctx); break;
        case 'ring':        drawRing(ctx); break;
        case 'stoneTablet': drawStoneTablet(ctx); break;
        case 'fishhook':    drawFishhook(ctx); break;
        case 'bell':        drawBell(ctx); break;
        case 'rustyKey':    drawRustyKey(ctx); break;
        case 'shell':       drawShell(ctx); break;
    }

    ctx.restore();
}

// =============================================
// 骸骨：一个简化的头骨 + 几根主骨，最大尺寸约 24px
// =============================================
function drawSkeleton(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.bone;
    ctx.strokeStyle = PALETTE.boneDark;
    ctx.lineWidth = 0.6;

    // 头骨：略扁椭圆 + 颚部凹口
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 眼窝两个黑点
    ctx.fillStyle = PALETTE.stoneDark;
    ctx.beginPath();
    ctx.arc(-2.4, -0.4, 1.4, 0, Math.PI * 2);
    ctx.arc(2.4, -0.4, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // 鼻腔
    ctx.fillStyle = PALETTE.boneDark;
    ctx.beginPath();
    ctx.moveTo(0, 1.4);
    ctx.lineTo(-0.8, 3);
    ctx.lineTo(0.8, 3);
    ctx.closePath();
    ctx.fill();

    // 三根散落的长骨（股骨感）：从头骨右下方向外延伸
    ctx.strokeStyle = PALETTE.bone;
    ctx.fillStyle = PALETTE.bone;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    // 骨 1
    ctx.beginPath();
    ctx.moveTo(6, 4);
    ctx.lineTo(14, 7);
    ctx.stroke();
    // 骨 2
    ctx.beginPath();
    ctx.moveTo(4, 6.5);
    ctx.lineTo(9, 11);
    ctx.stroke();
    // 骨 3（短）
    ctx.beginPath();
    ctx.moveTo(-5, 6);
    ctx.lineTo(-9, 9);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.lineWidth = 0.5;

    // 骨端关节小球
    ctx.beginPath();
    ctx.arc(14, 7, 1.2, 0, Math.PI * 2);
    ctx.arc(9, 11, 1.1, 0, Math.PI * 2);
    ctx.arc(-9, 9, 1.0, 0, Math.PI * 2);
    ctx.fill();
}

// =============================================
// 锈蚀硬币：带方孔的小圆
// =============================================
function drawCoin(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.coinBody;
    ctx.strokeStyle = PALETTE.coinEdge;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 外圈槽（磨损纹理）
    ctx.strokeStyle = PALETTE.coinEdge;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
    ctx.stroke();

    // 中心方孔
    ctx.fillStyle = PALETTE.stoneDark;
    ctx.fillRect(-1.3, -1.3, 2.6, 2.6);

    // 绿锈小点
    ctx.fillStyle = 'rgba(80, 130, 90, 0.7)';
    ctx.beginPath();
    ctx.arc(-3, -2, 0.6, 0, Math.PI * 2);
    ctx.arc(3, 2, 0.5, 0, Math.PI * 2);
    ctx.fill();
}

// =============================================
// 陶罐碎片：半圆弧 + 内部横纹
// =============================================
function drawPotshard(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.pot;
    ctx.strokeStyle = PALETTE.potEdge;
    ctx.lineWidth = 0.8;
    // 破碎弧形
    ctx.beginPath();
    ctx.moveTo(-9, 3);
    ctx.quadraticCurveTo(-8, -6, 0, -7);
    ctx.quadraticCurveTo(8, -6, 9, 3);
    // 底部破损边：折线（而非光滑）
    ctx.lineTo(7, 4);
    ctx.lineTo(5, 3);
    ctx.lineTo(2, 4.2);
    ctx.lineTo(-2, 3);
    ctx.lineTo(-5, 4);
    ctx.lineTo(-7, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 装饰横纹
    ctx.strokeStyle = PALETTE.potEdge;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-7, -2); ctx.lineTo(7, -2);
    ctx.moveTo(-6, 0);  ctx.lineTo(6, 0);
    ctx.stroke();
}

// =============================================
// 小铁锚
// =============================================
function drawAnchor(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = PALETTE.ironEdge;
    ctx.fillStyle = PALETTE.iron;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';

    // 顶部圆环
    ctx.beginPath();
    ctx.arc(0, -8, 2.2, 0, Math.PI * 2);
    ctx.stroke();
    // 横杆
    ctx.beginPath();
    ctx.moveTo(-4.5, -4);
    ctx.lineTo(4.5, -4);
    ctx.stroke();
    // 主轴
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 6);
    ctx.stroke();
    // 两侧钩臂
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(-6, 6, -6, 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(6, 6, 6, 1.5);
    ctx.stroke();
    // 钩尖三角
    ctx.fillStyle = PALETTE.ironEdge;
    ctx.beginPath();
    ctx.moveTo(-6, 1.5); ctx.lineTo(-7.2, 3.2); ctx.lineTo(-4.5, 2.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(6, 1.5); ctx.lineTo(7.2, 3.2); ctx.lineTo(4.5, 2.5);
    ctx.closePath(); ctx.fill();

    // 锈斑
    ctx.fillStyle = PALETTE.rust;
    ctx.beginPath();
    ctx.arc(-1, -1, 0.6, 0, Math.PI * 2);
    ctx.arc(1.8, 2.5, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'butt';
}

// =============================================
// 指环：一个圆环 + 中心小宝石
// =============================================
function drawRing(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = PALETTE.silver;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.silverEdge;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    // 中心宝石
    ctx.fillStyle = PALETTE.gem;
    ctx.beginPath();
    ctx.arc(0, -4.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.silverEdge;
    ctx.lineWidth = 0.3;
    ctx.stroke();
}

// =============================================
// 刻字石板：矩形 + 内部刻痕
// =============================================
function drawStoneTablet(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.stone;
    ctx.strokeStyle = PALETTE.stoneDark;
    ctx.lineWidth = 0.6;
    // 边缘稍微凹凸
    ctx.beginPath();
    ctx.moveTo(-8, -6);
    ctx.lineTo(7, -6.5);
    ctx.lineTo(8, 5);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 刻痕（三行伪文字）
    ctx.strokeStyle = PALETTE.stoneDark;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-6, -3); ctx.lineTo(-2, -3); ctx.moveTo(0, -3); ctx.lineTo(5, -3);
    ctx.moveTo(-6, -1); ctx.lineTo(6, -1);
    ctx.moveTo(-5, 1.2); ctx.lineTo(-1, 1.2); ctx.moveTo(1.5, 1.2); ctx.lineTo(4, 1.2);
    ctx.moveTo(-5, 3);   ctx.lineTo(4, 3);
    ctx.stroke();
}

// =============================================
// 锈蚀鱼钩：弯钩 + 断线
// =============================================
function drawFishhook(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = PALETTE.ironEdge;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    // 钩体
    ctx.beginPath();
    ctx.moveTo(-1, -6);
    ctx.lineTo(-1, 2);
    ctx.quadraticCurveTo(-1, 6, 3, 6);
    ctx.quadraticCurveTo(6, 6, 6, 2.5);
    ctx.stroke();
    // 倒刺
    ctx.beginPath();
    ctx.moveTo(6, 2.5); ctx.lineTo(4.2, 3.6);
    ctx.stroke();
    // 顶端环扣
    ctx.beginPath();
    ctx.arc(-1, -6.8, 1.2, 0, Math.PI * 2);
    ctx.stroke();
    // 断线（短短几段虚线）
    ctx.strokeStyle = 'rgba(220,210,180,0.7)';
    ctx.lineWidth = 0.4;
    ctx.setLineDash([1.5, 1.2]);
    ctx.beginPath();
    ctx.moveTo(-1, -8); ctx.lineTo(-4, -12);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
}

// =============================================
// 小铜铃
// =============================================
function drawBell(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.brass;
    ctx.strokeStyle = PALETTE.brassEdge;
    ctx.lineWidth = 0.6;
    // 铃体（钟形）
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.quadraticCurveTo(-5, -5, 0, -5);
    ctx.quadraticCurveTo(5, -5, 5, 4);
    ctx.lineTo(5.5, 4.8);
    ctx.lineTo(-5.5, 4.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 挂环
    ctx.strokeStyle = PALETTE.brassEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -6.2, 1.2, 0, Math.PI * 2);
    ctx.stroke();
    // 铃舌
    ctx.fillStyle = PALETTE.brassEdge;
    ctx.beginPath();
    ctx.arc(0, 6, 1.1, 0, Math.PI * 2);
    ctx.fill();
    // 绿锈
    ctx.fillStyle = 'rgba(90,140,100,0.6)';
    ctx.beginPath();
    ctx.arc(-2.5, 0, 0.8, 0, Math.PI * 2);
    ctx.arc(3, 2, 0.7, 0, Math.PI * 2);
    ctx.fill();
}

// =============================================
// 锈蚀钥匙：柄 + 杆 + 齿
// =============================================
function drawRustyKey(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = PALETTE.brassEdge;
    ctx.fillStyle = PALETTE.brass;
    ctx.lineWidth = 0.6;
    // 柄（大环）
    ctx.beginPath();
    ctx.arc(-6, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 柄中间镂空
    ctx.fillStyle = PALETTE.stoneDark;
    ctx.beginPath();
    ctx.arc(-6, 0, 1.4, 0, Math.PI * 2);
    ctx.fill();
    // 杆
    ctx.strokeStyle = PALETTE.brass;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-3, 0); ctx.lineTo(7, 0);
    ctx.stroke();
    // 齿（两个直角突起）
    ctx.fillStyle = PALETTE.brass;
    ctx.fillRect(4, 0.6, 1.4, 2.5);
    ctx.fillRect(6.4, 0.6, 1.2, 1.8);
    // 描边
    ctx.strokeStyle = PALETTE.brassEdge;
    ctx.lineWidth = 0.4;
    ctx.strokeRect(4, 0.6, 1.4, 2.5);
    ctx.strokeRect(6.4, 0.6, 1.2, 1.8);
    // 锈斑
    ctx.fillStyle = PALETTE.rust;
    ctx.beginPath();
    ctx.arc(0, -0.4, 0.5, 0, Math.PI * 2);
    ctx.arc(3, 0.4, 0.4, 0, Math.PI * 2);
    ctx.fill();
}

// =============================================
// 螺旋海螺
// =============================================
function drawShell(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.shell;
    ctx.strokeStyle = PALETTE.shellLine;
    ctx.lineWidth = 0.5;
    // 主体（不对称椭圆）
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 螺旋线
    ctx.strokeStyle = PALETTE.shellLine;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    // 从外向内画三圈渐缩的椭圆片段，模拟螺纹
    for (let i = 0; i < 3; i++) {
        const rx = 6 - i * 1.8;
        const ry = 4.5 - i * 1.4;
        ctx.moveTo(rx, 0);
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 1.6);
    }
    ctx.stroke();
    // 开口暗部
    ctx.fillStyle = PALETTE.shellLine;
    ctx.beginPath();
    ctx.ellipse(5.5, 0, 1.2, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
}

// =============================================
// 对外：每帧绘制所有图鉴物件（带视椒剞除）
// =============================================
export function drawRelicsWorld(
    ctx: CanvasRenderingContext2D,
    viewL: number, viewR: number, viewT: number, viewB: number
) {
    const maze = state.mazeRescue;
    if (!maze) return;
    const relics: Relic[] = (maze as any).relics || [];
    if (relics.length === 0) return;

    // 扩展 20px 的边缘兼底，避免物件跨视椒边界时突然闪掉
    const pad = 20;
    for (const relic of relics) {
        if (relic.x < viewL - pad || relic.x > viewR + pad) continue;
        if (relic.y < viewT - pad || relic.y > viewB + pad) continue;
        drawRelic(ctx, relic);
    }
}

// =============================================
// 对外：发现瞬间的世界空间飘字
// 调用时机：要求放在火光遮罩之后（不能被压暗），才会让玩家给个明确的"发现"反馈
// =============================================
export function drawRelicHintsWorld(
    ctx: CanvasRenderingContext2D,
    viewL: number, viewR: number, viewT: number, viewB: number
) {
    const hints = getRelicHints();
    if (!hints || hints.length === 0) return;
    const pad = 80;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic bold 13px Georgia, serif';

    for (const h of hints) {
        if (h.x < viewL - pad || h.x > viewR + pad) continue;
        if (h.y < viewT - pad || h.y > viewB + pad) continue;

        // 淘汰节奏：前 15% 淡入，中间保持，后 30% 淡出
        const t = h.life / h.maxLife;
        let a = 1;
        if (t < 0.15) a = t / 0.15;
        else if (t > 0.7) a = 1 - (t - 0.7) / 0.3;
        if (a <= 0) continue;

        // 小圆点前缀
        ctx.fillStyle = 'rgba(255, 220, 150, ' + (a * 0.85).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(h.x - 40, h.y, 2, 0, Math.PI * 2);
        ctx.fill();

        // 文字：米色 + 淡黑影 + 淡描边避免淹没在亮岩石上
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = 'rgba(255, 230, 175, ' + a.toFixed(3) + ')';
        ctx.fillText(h.text, h.x, h.y);
        ctx.shadowBlur = 0;
    }

    ctx.restore();
}