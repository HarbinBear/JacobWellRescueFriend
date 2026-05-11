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
import { getExtractionState } from '../extraction/core/ExtractionState';

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

    drawRelicKindShape(ctx, relic.kind);

    ctx.restore();
}

/**
 * 在当前变换下绘制 relic 图形（不做 translate/rotate/scale）。
 * 每种 kind 的 drawXxx 都在单位坐标系（约 5~10px 量级）绘制。
 * 调用方应提前 scale 到合适大小。
 */
function drawRelicKindShape(ctx: CanvasRenderingContext2D, kind: RelicKind) {
    switch (kind) {
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
        case 'silverCoin':  drawSilverCoin(ctx); break;
        case 'humanSkull':  drawHumanSkull(ctx); break;
        case 'pocketWatch': drawPocketWatch(ctx); break;
        case 'oilLamp':     drawOilLamp(ctx); break;
        case 'smallKnife':  drawSmallKnife(ctx); break;
        case 'maskShard':   drawMaskShard(ctx); break;
        case 'waterFlask':  drawWaterFlask(ctx); break;
        case 'ironNail':    drawIronNail(ctx); break;
        case 'brassCompass':drawBrassCompass(ctx); break;
        case 'leatherBoot': drawLeatherBoot(ctx); break;
        case 'cross':       drawCross(ctx); break;
        case 'amulet':      drawAmulet(ctx); break;
        case 'idolFigure':  drawIdolFigure(ctx); break;
        case 'crystal':     drawCrystal(ctx); break;
        case 'ceramicBowl': drawCeramicBowl(ctx); break;
        case 'glassBottle': drawGlassBottle(ctx); break;
        case 'coralChunk':  drawCoralChunk(ctx); break;
        case 'sharkTooth':  drawSharkTooth(ctx); break;
        case 'fishSkeleton':drawFishSkeleton(ctx); break;
        case 'fossil':      drawFossil(ctx); break;
        case 'obsidian':    drawObsidian(ctx); break;
        case 'cameraHousing':drawCameraHousing(ctx); break;
    }
}

/**
 * 在 UI 场景（屏幕坐标）中以指定 iconSize 绘制某种古物图标。
 * 用于：背包格子、仓库格子、详情卡、商店卡片等。
 *
 * 单位坐标系下的古物轮廓约 14~18px；iconSize=32 表示最终图标占约 32px 宽。
 * 内部 scale = iconSize / 18（保留一点边距）。
 *
 * @param ctx 画布上下文
 * @param kind 古物类型
 * @param cx 图标中心 x（屏幕坐标）
 * @param cy 图标中心 y
 * @param iconSize 图标目标尺寸（像素，直径概念）
 */
export function drawRelicIconAt(
    ctx: CanvasRenderingContext2D,
    kind: RelicKind,
    cx: number,
    cy: number,
    iconSize: number,
) {
    const scale = iconSize / 18;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    drawRelicKindShape(ctx, kind);
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
// 【扩展 22 种】
// =============================================

// 银币：银色底 + 齿纹 + 头像凸点
function drawSilverCoin(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.silver;
    ctx.strokeStyle = PALETTE.silverEdge;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = PALETTE.silverEdge;
    ctx.lineWidth = 0.3;
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r1 = 5.5, r2 = 6.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
    }
    ctx.fillStyle = PALETTE.silverEdge;
    ctx.beginPath();
    ctx.ellipse(0, 0.5, 2, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
}

function drawHumanSkull(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.bone;
    ctx.strokeStyle = PALETTE.boneDark;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(0, -2, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.quadraticCurveTo(0, 9, 5, 4);
    ctx.lineTo(4, 2.5);
    ctx.lineTo(-4, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.stoneDark;
    ctx.beginPath();
    ctx.ellipse(-2.8, -2, 1.8, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(2.8, -2, 1.8, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(-1.2, 3);
    ctx.lineTo(1.2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.boneDark;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-3, 5.5); ctx.lineTo(3, 5.5);
    ctx.moveTo(-1.5, 5); ctx.lineTo(-1.5, 7);
    ctx.moveTo(0, 5); ctx.lineTo(0, 7.5);
    ctx.moveTo(1.5, 5); ctx.lineTo(1.5, 7);
    ctx.stroke();
}

function drawPocketWatch(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.brass;
    ctx.strokeStyle = PALETTE.brassEdge;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,230,200,0.88)';
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.brassEdge;
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0.35, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.strokeStyle = PALETTE.stoneDark;
    ctx.lineWidth = 0.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-2, -2.5);
    ctx.moveTo(0, 0); ctx.lineTo(3, 1.5);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(60,50,40,0.55)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-5, -3); ctx.lineTo(-1, 0); ctx.lineTo(2, 2); ctx.lineTo(5, 4);
    ctx.stroke();
    ctx.fillStyle = PALETTE.brassEdge;
    ctx.fillRect(-0.8, -8, 1.6, 1.5);
}

function drawOilLamp(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.iron;
    ctx.strokeStyle = PALETTE.ironEdge;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-5, 6);
    ctx.lineTo(5, 6);
    ctx.lineTo(4, 3);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3.5, 3);
    ctx.lineTo(3.5, 3);
    ctx.lineTo(3, 0);
    ctx.lineTo(-3, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(180,200,210,0.35)';
    ctx.strokeStyle = PALETTE.silverEdge;
    ctx.beginPath();
    ctx.moveTo(-2.5, 0);
    ctx.lineTo(-2.2, -5);
    ctx.lineTo(-1.5, -6.5);
    ctx.lineTo(1.5, -6.5);
    ctx.lineTo(2.2, -5);
    ctx.lineTo(2.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = PALETTE.ironEdge;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(5, 1.5, 2, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
}

function drawSmallKnife(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.pot;
    ctx.strokeStyle = PALETTE.potEdge;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-8, -1.2);
    ctx.lineTo(-2, -1.4);
    ctx.lineTo(-2, 1.4);
    ctx.lineTo(-8, 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.brassEdge;
    ctx.beginPath();
    ctx.arc(-6, 0, 0.4, 0, Math.PI * 2);
    ctx.arc(-4, 0, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.iron;
    ctx.strokeStyle = PALETTE.ironEdge;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-2, -1.2);
    ctx.lineTo(8, -0.4);
    ctx.lineTo(8.8, 0);
    ctx.lineTo(8, 0.6);
    ctx.lineTo(-2, 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.rust;
    ctx.beginPath();
    ctx.arc(2, 0, 0.5, 0, Math.PI * 2);
    ctx.arc(5, 0.3, 0.4, 0, Math.PI * 2);
    ctx.fill();
}

function drawMaskShard(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.stoneDark;
    ctx.beginPath();
    ctx.moveTo(-7, -4);
    ctx.quadraticCurveTo(0, -7, 7, -3);
    ctx.lineTo(6, -1);
    ctx.quadraticCurveTo(0, -4.5, -6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(140,170,180,0.55)';
    ctx.strokeStyle = 'rgba(80,100,110,0.8)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.quadraticCurveTo(0, -4, 5, -1.5);
    ctx.lineTo(4, 2);
    ctx.lineTo(2, 5);
    ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(-2, -1); ctx.lineTo(0, 1); ctx.lineTo(2, 3);
    ctx.moveTo(0, 1); ctx.lineTo(-2, 2);
    ctx.stroke();
}

function drawWaterFlask(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.silver;
    ctx.strokeStyle = PALETTE.silverEdge;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(4, -4);
    ctx.lineTo(5, 7);
    ctx.lineTo(-5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.lineTo(2, -6);
    ctx.lineTo(2, -4);
    ctx.lineTo(-2, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.ironEdge;
    ctx.fillRect(-2.4, -7.2, 4.8, 1.4);
    ctx.fillStyle = 'rgba(180,150,100,0.6)';
    ctx.fillRect(-3.2, 0, 6.4, 3);
    ctx.strokeStyle = PALETTE.silverEdge;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(-2, 4); ctx.quadraticCurveTo(-1, 5.5, 1, 4.5);
    ctx.stroke();
}

function drawIronNail(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.iron;
    ctx.strokeStyle = PALETTE.ironEdge;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-3, -7);
    ctx.lineTo(3, -7);
    ctx.lineTo(2.5, -5.5);
    ctx.lineTo(-2.5, -5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.2, -5.5);
    ctx.lineTo(1.2, -5.5);
    ctx.lineTo(0.4, 8);
    ctx.lineTo(-0.4, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.rust;
    ctx.beginPath();
    ctx.arc(0, -3, 0.5, 0, Math.PI * 2);
    ctx.arc(0.3, 0, 0.4, 0, Math.PI * 2);
    ctx.arc(-0.3, 3, 0.5, 0, Math.PI * 2);
    ctx.arc(0, -6.3, 0.6, 0, Math.PI * 2);
    ctx.fill();
}

function drawBrassCompass(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.brass;
    ctx.strokeStyle = PALETTE.brassEdge;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,230,200,0.8)';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.brassEdge;
    ctx.font = 'bold 3px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -4);
    ctx.fillText('S', 0, 4);
    ctx.fillText('E', 4, 0);
    ctx.fillText('W', -4, 0);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.save();
    ctx.rotate(0.3);
    ctx.fillStyle = '#a03020';
    ctx.beginPath();
    ctx.moveTo(0, -4.5);
    ctx.lineTo(-0.8, 0);
    ctx.lineTo(0.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.stoneDark;
    ctx.beginPath();
    ctx.moveTo(0, 4.5);
    ctx.lineTo(-0.8, 0);
    ctx.lineTo(0.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PALETTE.brassEdge;
    ctx.beginPath();
    ctx.arc(0, 0, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,0.45)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(-5, -2); ctx.lineTo(2, 0); ctx.lineTo(5, 3);
    ctx.stroke();
}

function drawLeatherBoot(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#5a3b22';
    ctx.strokeStyle = '#2e1f11';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(-3, -4);
    ctx.lineTo(-2, 3);
    ctx.lineTo(8, 3);
    ctx.lineTo(9, 5);
    ctx.lineTo(8, 6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1d1108';
    ctx.fillRect(-6, 5, 15, 1.2);
    ctx.fillStyle = '#2e1f11';
    ctx.beginPath();
    ctx.arc(-5, -2, 0.4, 0, Math.PI * 2);
    ctx.arc(-5, -0, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2e1f11';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(0, 3); ctx.quadraticCurveTo(2, 4.2, 5, 3.5);
    ctx.moveTo(-4, 1); ctx.lineTo(-2, 2);
    ctx.stroke();
}

function drawCross(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.brass;
    ctx.strokeStyle = PALETTE.brassEdge;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.rect(-1, -7, 2, 14);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-5, -2.5, 10, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.gem;
    ctx.beginPath();
    ctx.arc(0, -1.5, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(90,140,100,0.6)';
    ctx.beginPath();
    ctx.arc(-0.4, 3, 0.5, 0, Math.PI * 2);
    ctx.arc(3, -1.5, 0.4, 0, Math.PI * 2);
    ctx.fill();
}

function drawAmulet(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = '#6a4f30';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-4, -6); ctx.lineTo(0, -3); ctx.lineTo(4, -6);
    ctx.stroke();
    ctx.fillStyle = PALETTE.bone;
    ctx.strokeStyle = PALETTE.boneDark;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.quadraticCurveTo(-5, 2, -3, 6);
    ctx.quadraticCurveTo(0, 8, 3, 6);
    ctx.quadraticCurveTo(5, 2, 4, -2);
    ctx.quadraticCurveTo(0, -4.5, -4, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = PALETTE.stoneDark;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(-2, 0); ctx.lineTo(2, 0);
    ctx.moveTo(0, -0.5); ctx.lineTo(0, 4);
    ctx.moveTo(-1.5, 2); ctx.lineTo(1.5, 2);
    ctx.moveTo(-2, 4); ctx.lineTo(2, 4);
    ctx.stroke();
    ctx.fillStyle = PALETTE.stoneDark;
    ctx.beginPath();
    ctx.arc(0, -3, 0.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawIdolFigure(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.stone;
    ctx.strokeStyle = PALETTE.stoneDark;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-4, 7);
    ctx.lineTo(4, 7);
    ctx.lineTo(3, 4);
    ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2.5, 4);
    ctx.lineTo(2.5, 4);
    ctx.lineTo(2, -2);
    ctx.lineTo(-2, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.stoneDark;
    ctx.beginPath();
    ctx.arc(-1, -4.2, 0.5, 0, Math.PI * 2);
    ctx.arc(1, -4.2, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.stoneDark;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(-2, 0); ctx.lineTo(2, 0);
    ctx.moveTo(-1.5, 2); ctx.lineTo(1.5, 2);
    ctx.stroke();
}

function drawCrystal(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(180,220,230,0.75)';
    ctx.strokeStyle = 'rgba(80,120,140,0.9)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-2.5, -3);
    ctx.lineTo(-2.5, 5);
    ctx.lineTo(2.5, 5);
    ctx.lineTo(2.5, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,200,215,0.75)';
    ctx.beginPath();
    ctx.moveTo(-5, -4);
    ctx.lineTo(-6.5, 0);
    ctx.lineTo(-6.5, 5);
    ctx.lineTo(-3.5, 5);
    ctx.lineTo(-3.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, -5.5);
    ctx.lineTo(3.5, -1);
    ctx.lineTo(3.5, 5);
    ctx.lineTo(6.5, 5);
    ctx.lineTo(6.5, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(0, 4);
    ctx.stroke();
}

function drawCeramicBowl(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.pot;
    ctx.strokeStyle = PALETTE.potEdge;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4a3220';
    ctx.beginPath();
    ctx.ellipse(0, 0.5, 6.5, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(80,70,50,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, 1.5, 4.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.potEdge;
    ctx.lineWidth = 0.3;
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 7.2, Math.sin(a) * 5.4);
        ctx.lineTo(Math.cos(a) * 7.8, Math.sin(a) * 5.85);
        ctx.stroke();
    }
}

function drawGlassBottle(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(100,140,100,0.5)';
    ctx.strokeStyle = 'rgba(50,80,50,0.85)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-3, -2);
    ctx.lineTo(3, -2);
    ctx.lineTo(3.5, 8);
    ctx.lineTo(-3.5, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.2, -6);
    ctx.lineTo(1.2, -6);
    ctx.lineTo(1.5, -2);
    ctx.lineTo(-1.5, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(60,90,60,0.7)';
    ctx.fillRect(-1.5, -7.2, 3, 1.4);
    ctx.strokeRect(-1.5, -7.2, 3, 1.4);
    ctx.fillStyle = 'rgba(220,220,220,0.65)';
    ctx.beginPath();
    ctx.arc(-1.5, 2, 0.35, 0, Math.PI * 2);
    ctx.arc(0.5, 4, 0.4, 0, Math.PI * 2);
    ctx.arc(1.8, 6, 0.3, 0, Math.PI * 2);
    ctx.arc(-2, 5, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-2.4, 0); ctx.lineTo(-2.8, 6);
    ctx.stroke();
}

function drawCoralChunk(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = '#c85040';
    ctx.fillStyle = '#a04030';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.lineTo(0, -2);
    ctx.moveTo(0, 2); ctx.lineTo(-5, -3); ctx.moveTo(-5, -3); ctx.lineTo(-6, -6);
    ctx.moveTo(-5, -3); ctx.lineTo(-3, -7);
    ctx.moveTo(0, 0); ctx.lineTo(5, -4); ctx.moveTo(5, -4); ctx.lineTo(4, -7);
    ctx.moveTo(5, -4); ctx.lineTo(7, -6);
    ctx.moveTo(0, -2); ctx.lineTo(1, -7);
    ctx.stroke();
    ctx.fillStyle = '#d86050';
    ctx.beginPath();
    ctx.arc(-6, -6, 1, 0, Math.PI * 2);
    ctx.arc(-3, -7, 0.8, 0, Math.PI * 2);
    ctx.arc(4, -7, 0.9, 0, Math.PI * 2);
    ctx.arc(7, -6, 1, 0, Math.PI * 2);
    ctx.arc(1, -7, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'butt';
}

function drawSharkTooth(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#e8e0cc';
    ctx.strokeStyle = '#8a7f68';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-3.5, 6);
    ctx.lineTo(3.5, 6);
    ctx.lineTo(0, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b0a58d';
    ctx.beginPath();
    ctx.moveTo(-3.5, 6);
    ctx.lineTo(3.5, 6);
    ctx.lineTo(3, 4);
    ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a7f68';
    for (let i = 0; i < 4; i++) {
        const y = -4 + i * 2;
        ctx.beginPath();
        ctx.moveTo(-2 + i * 0.35, y);
        ctx.lineTo(-2.7 + i * 0.35, y + 0.3);
        ctx.lineTo(-2 + i * 0.35, y + 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(2 - i * 0.35, y);
        ctx.lineTo(2.7 - i * 0.35, y + 0.3);
        ctx.lineTo(2 - i * 0.35, y + 0.8);
        ctx.closePath();
        ctx.fill();
    }
}

function drawFishSkeleton(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = PALETTE.bone;
    ctx.fillStyle = PALETTE.bone;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(7, 0);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
        const x = -6 + i * 2;
        const len = 3 - Math.abs(i - 3) * 0.4;
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, -len);
        ctx.moveTo(x, 0); ctx.lineTo(x, len);
        ctx.stroke();
    }
    ctx.fillStyle = PALETTE.bone;
    ctx.strokeStyle = PALETTE.boneDark;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(7, -3);
    ctx.lineTo(10, 0);
    ctx.lineTo(7, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.stoneDark;
    ctx.beginPath();
    ctx.arc(8, 0, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.bone;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-11, -3);
    ctx.lineTo(-11, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineCap = 'butt';
}

function drawFossil(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PALETTE.stone;
    ctx.strokeStyle = PALETTE.stoneDark;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-7, -5);
    ctx.lineTo(6, -6);
    ctx.lineTo(8, 5);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#2a2520';
    ctx.lineWidth = 0.6;
    const cx = 0.5, cy = 0.5;
    ctx.beginPath();
    for (let t = 0; t < Math.PI * 4; t += 0.08) {
        const r = 4.5 - t * 0.5;
        if (r < 0.3) break;
        const x = cx + Math.cos(t) * r;
        const y = cy + Math.sin(t) * r;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,35,30,0.6)';
    ctx.lineWidth = 0.35;
    for (let t = 0; t < Math.PI * 4; t += 0.5) {
        const r = 4.5 - t * 0.5;
        if (r < 0.5) break;
        const x = cx + Math.cos(t) * r;
        const y = cy + Math.sin(t) * r;
        const ix = cx + Math.cos(t) * (r - 0.8);
        const iy = cy + Math.sin(t) * (r - 0.8);
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(ix, iy);
        ctx.stroke();
    }
}

function drawObsidian(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#18171c';
    ctx.strokeStyle = '#0a090c';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-6, -3);
    ctx.lineTo(-3, -6);
    ctx.lineTo(4, -5);
    ctx.lineTo(7, 0);
    ctx.lineTo(5, 5);
    ctx.lineTo(-2, 6);
    ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,200,220,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-3, -5); ctx.lineTo(0, 0); ctx.lineTo(5, 4);
    ctx.moveTo(0, 0); ctx.lineTo(-5, 2);
    ctx.moveTo(0, 0); ctx.lineTo(6, -2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,220,240,0.75)';
    ctx.beginPath();
    ctx.arc(-2, -2, 0.5, 0, Math.PI * 2);
    ctx.arc(3, 1.5, 0.4, 0, Math.PI * 2);
    ctx.fill();
}

function drawCameraHousing(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#2a2a28';
    ctx.strokeStyle = '#0f0f0e';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-7, -4);
    ctx.lineTo(7, -4);
    ctx.lineTo(7, 5);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f0f0e';
    ctx.beginPath();
    ctx.arc(0, 0.5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a7a78';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0.5, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0.5, 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(100,120,130,0.55)';
    ctx.beginPath();
    ctx.arc(-0.8, -0.3, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a4a48';
    ctx.fillRect(4, -5.5, 1.8, 1.5);
    ctx.strokeRect(4, -5.5, 1.8, 1.5);
    ctx.fillStyle = '#c0c0bc';
    ctx.fillRect(-6.2, -3.2, 1.8, 1.2);
    ctx.strokeStyle = '#0a0a08';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-5, 3); ctx.lineTo(-2, 4.2);
    ctx.moveTo(3, 3.5); ctx.lineTo(5, 2);
    ctx.stroke();
    ctx.fillStyle = '#a03020';
    ctx.fillRect(-6, -3.8, 3, 0.5);
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

    // 当次下潜已被拾取的 relic id 集合：必须在渲染层过滤掉，否则
    // 拾取后图形仍留在原地（数据/检测层都已记录，仅渲染层漏过滤）
    const ex = getExtractionState();
    const pickedIds = ex ? ex.diveSession.pickedRelicIds : null;
    const pickedSet = pickedIds && pickedIds.length > 0 ? new Set(pickedIds) : null;

    // 扩展 20px 的边缘兼底，避免物件跨视椒边界时突然闪掉
    const pad = 20;
    for (const relic of relics) {
        if (pickedSet && pickedSet.has(relic.id)) continue;
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

        const isNew = (h as any).kind === 'newCodex';

        if (isNew) {
            // 新图鉴：金色粗体 + 更大 + 轻微 scale 呼吸（入场 punch）
            const tp = Math.min(1, t / 0.2);
            const scale = 1 + (1 - tp) * 0.35;
            ctx.save();
            ctx.translate(h.x, h.y);
            ctx.scale(scale, scale);
            ctx.font = 'italic bold 15px Georgia, serif';
            // 金色辉光
            ctx.shadowColor = 'rgba(255, 200, 80, 0.9)';
            ctx.shadowBlur = 10;
            ctx.fillStyle = 'rgba(255, 230, 120, ' + a.toFixed(3) + ')';
            ctx.fillText(h.text, 0, 0);
            // 再叠一层黑色描边
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
            ctx.fillStyle = 'rgba(255, 245, 180, ' + a.toFixed(3) + ')';
            ctx.fillText(h.text, 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();
        } else {
            // 普通发现：米色 Georgia
            // 小圆点前缀
            ctx.fillStyle = 'rgba(255, 220, 150, ' + (a * 0.85).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(h.x - 40, h.y, 2, 0, Math.PI * 2);
            ctx.fill();
            // 文字
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowBlur = 4;
            ctx.fillStyle = 'rgba(255, 230, 175, ' + a.toFixed(3) + ')';
            ctx.fillText(h.text, h.x, h.y);
            ctx.shadowBlur = 0;
        }
    }

    ctx.restore();
}