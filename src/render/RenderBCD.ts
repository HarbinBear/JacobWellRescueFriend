// =============================================
// BCD 浮力背心 —— 水下操作控件与告警层
// ---------------------------------------------
//
// 交互原型来自真实装备：潜水员左手握着一根从左肩垂下来的 inflator（充气管）手柄，
// 手柄上竖着排两颗按钮，拇指按上面那颗充气、按下面那颗排气。
// 所以这里也做成一根**竖直的手柄**，而不是两个散落的圆按钮：
//
//        ┌──────┐
//        │  ＋  │   充气钮（上）：气进气囊 → 上浮
//        ├──────┤
//        │ ▓▓▓▓ │   气囊量表：显示气囊"实际体积"
//        │ ┈┈┈┈ │   中性刻度线（会随深度上移，因为湿衣被压扁）
//        │ ▓▓▓▓ │   右侧细条 = 净浮力方向与强度
//        ├──────┤
//        │  －  │   排气钮（下）：气出气囊 → 下沉
//        └──────┘
//
// 三条设计约束（不遵守就会失去教学意义）：
//
// 1. **"上=充气=上浮" 的方向语义必须与屏幕方向一致。**
//    真实装备上充气钮反而在下面，但那是握持姿态决定的；在屏幕上必须服从
//    "按上面的钮身体往上走"这个直觉，否则玩家永远建立不起条件反射。
//
// 2. **中性刻度线必须画成"会动的"。**
//    玩家下潜时会亲眼看到：气量条自己往下掉（气被压缩）、中性线自己往上爬
//    （湿衣失效），两条线越拉越开 —— 这就是玻意耳定律的可视化，
//    比任何一段文字教程都有效。
//
// 3. **净浮力指示必须与气量分开显示。**
//    玩家真正要控的不是"气量"，而是"净浮力=0"。所以量表右侧另挂一根
//    中心为零的双向条：绿色向上=正在被托起，橙色向下=正在被拽下去，
//    完全归中时整个控件亮一圈青色"配平良好"光环，给正反馈。
//
// 告警层（drawBCDWarnOverlay）：
//   失控上浮时屏幕上缘泛橙红脉冲 + "上浮过快 · 立即排气"；
//   失控下沉时屏幕下缘泛琥珀脉冲 + "下沉过快 · 立即补气"。
//   都是边缘渐变，不挡视野中心。
// =============================================

import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { ctx } from './Canvas';
import { getBCDRuntime, getBCDGaugeInfo } from '../logic/BCDSystem';

// =============================================
// 布局
// =============================================

export interface BCDLayout {
    /** 控件竖轴 x */
    cx: number;
    /** 控件竖向中心 y */
    cy: number;
    /** 按钮半径 */
    btnR: number;
    /** 充气钮中心 y */
    inflateY: number;
    /** 排气钮中心 y */
    deflateY: number;
    /** 量表矩形 */
    gaugeX: number;
    gaugeY: number;
    gaugeW: number;
    gaugeH: number;
}

function cfg(): any {
    return (CONFIG as any).bcd || {};
}

/** 控件是否应该出现（迷宫 play 阶段 + 系统开启 + UI 开启） */
export function isBCDUIVisible(): boolean {
    const c = cfg();
    if (!c.enabled || !c.uiVisible) return false;
    if (state.screen !== 'mazeRescue') return false;
    const maze: any = state.mazeRescue;
    if (!maze || maze.phase !== 'play') return false;
    return true;
}

export function getBCDLayout(): BCDLayout {
    const c = cfg();
    const cw = CONFIG.screenWidth;
    const ch = CONFIG.screenHeight;
    const gaugeW = c.uiGaugeW || 26;
    const gaugeH = c.uiGaugeH || 96;
    const btnR = c.uiBtnRadius || 25;
    const gap = c.uiBtnGap || 50;
    const cx = cw - (c.uiXFromRight || 44);
    // 竖向中心做一次安全夹紧，保证整根手柄（含两颗钮）不会顶出屏幕
    const halfSpan = gap + btnR + 6;
    const cy = Math.max(halfSpan + 24, Math.min(ch - halfSpan - 24, ch * (c.uiCenterYRatio || 0.52)));
    return {
        cx, cy, btnR,
        inflateY: cy - gap,
        deflateY: cy + gap,
        gaugeX: cx - gaugeW / 2,
        gaugeY: cy - gaugeH / 2,
        gaugeW,
        gaugeH,
    };
}

/** 充气钮命中圆（input.ts 用） */
export function getBCDInflateBtn(): { cx: number; cy: number; r: number } {
    const L = getBCDLayout();
    return { cx: L.cx, cy: L.inflateY, r: L.btnR + 6 };
}

/** 排气钮命中圆（input.ts 用） */
export function getBCDDeflateBtn(): { cx: number; cy: number; r: number } {
    const L = getBCDLayout();
    return { cx: L.cx, cy: L.deflateY, r: L.btnR + 6 };
}

// =============================================
// 绘制辅助
// =============================================

function rrectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
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
// 主绘制入口
// =============================================

export function drawBCDController(time: number): void {
    if (!isBCDUIVisible()) return;

    const rt = getBCDRuntime();
    const g = getBCDGaugeInfo();
    const L = getBCDLayout();
    const c = cfg();

    // 配平良好（净浮力接近 0）时给整根手柄一圈青色呼吸光环 —— 正反馈
    const trimmed = Math.abs(g.netLiftNorm) < 0.12;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.0);

    ctx.save();

    // ---------- 手柄底板（把两颗钮和量表在视觉上连成一根 inflator）----------
    {
        const padX = L.cx - (L.gaugeW / 2 + 9);
        const padY = L.inflateY - L.btnR - 8;
        const padW = L.gaugeW + 18;
        const padH = (L.deflateY + L.btnR + 8) - padY;
        ctx.fillStyle = 'rgba(8, 18, 28, 0.5)';
        rrectPath(ctx, padX, padY, padW, padH, 16);
        ctx.fill();
        ctx.strokeStyle = trimmed
            ? `rgba(110, 235, 220, ${0.35 + 0.3 * pulse})`
            : 'rgba(110, 165, 195, 0.28)';
        ctx.lineWidth = trimmed ? 1.4 : 0.9;
        rrectPath(ctx, padX, padY, padW, padH, 16);
        ctx.stroke();
    }

    // ---------- 气囊量表 ----------
    drawGauge(L, g, time);

    // ---------- 两颗按钮 ----------
    drawInflateBtn(L, rt.inflating, rt.overflow, time);
    drawDeflateBtn(L, rt.deflating, g.volumeL <= 0.001, time);

    // ---------- 深度压力小标（告诉玩家"现在几个大气压"，玻意耳的自变量）----------
    ctx.fillStyle = 'rgba(150, 195, 220, 0.7)';
    ctx.font = '9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.pressureAtm.toFixed(1) + ' ATA', L.cx, L.deflateY + L.btnR + 15);

    // ---------- 首次可见时的一次性上手提示 ----------
    if (c.uiVisible) drawFirstHintIfNeeded(L, time);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

// =============================================
// 气囊量表：填充 + 会动的中性线 + 净浮力副条
// =============================================

function drawGauge(L: BCDLayout, g: ReturnType<typeof getBCDGaugeInfo>, time: number): void {
    const x = L.gaugeX;
    const y = L.gaugeY;
    const w = L.gaugeW;
    const h = L.gaugeH;

    // 背景槽
    ctx.fillStyle = 'rgba(6, 14, 22, 0.85)';
    rrectPath(ctx, x, y, w, h, 7);
    ctx.fill();

    // 内壁刻度（每 25% 一道细线，纯装饰，帮助读数）
    ctx.strokeStyle = 'rgba(120, 160, 185, 0.16)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
        const ly = y + h * (i / 4);
        ctx.moveTo(x + 2, ly);
        ctx.lineTo(x + w - 2, ly);
    }
    ctx.stroke();

    // ---- 气体填充（从底部往上长）----
    const fillH = h * g.fillRatio;
    if (fillH > 0.5) {
        const fy = y + h - fillH;
        // 颜色按"离中性有多远"变化：配平良好 = 青绿；偏正浮力 = 亮蓝；偏负 = 暗蓝灰
        const off = g.netLiftNorm;   // +1 上浮 / -1 下沉
        let top: string, bot: string;
        if (Math.abs(off) < 0.12) {
            top = 'rgba(130, 250, 225, 0.95)'; bot = 'rgba(60, 175, 165, 0.85)';
        } else if (off > 0) {
            top = 'rgba(120, 215, 255, 0.95)'; bot = 'rgba(55, 135, 200, 0.85)';
        } else {
            top = 'rgba(130, 165, 195, 0.9)'; bot = 'rgba(60, 85, 115, 0.85)';
        }
        const grad = ctx.createLinearGradient(0, fy, 0, y + h);
        grad.addColorStop(0, top);
        grad.addColorStop(1, bot);
        ctx.save();
        rrectPath(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 6);
        ctx.clip();
        ctx.fillStyle = grad;
        ctx.fillRect(x + 1.5, fy, w - 3, fillH);

        // 气体表面的微弱晃动高光（表示里面是气不是液体）
        ctx.strokeStyle = 'rgba(235, 255, 255, 0.75)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
            const px = x + 2 + (w - 4) * (i / 6);
            const py = fy + Math.sin(time * 4 + i * 0.9) * 1.1;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
    }

    // ---- 中性刻度线（会随深度上移，是本控件最重要的一条线）----
    const nY = y + h * (1 - g.neutralRatio);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 226, 130, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3.5, 2.5]);
    ctx.beginPath();
    ctx.moveTo(x - 3, nY);
    ctx.lineTo(x + w + 3, nY);
    ctx.stroke();
    ctx.setLineDash([]);
    // 左侧小三角箭头，强调"目标在这"
    ctx.fillStyle = 'rgba(255, 226, 130, 0.95)';
    ctx.beginPath();
    ctx.moveTo(x - 4, nY);
    ctx.lineTo(x - 9, nY - 3.2);
    ctx.lineTo(x - 9, nY + 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ---- 顶部溢流警示（气囊满了还在充）----
    if (g.overRange) {
        const a = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(time * 10));
        ctx.fillStyle = `rgba(255, 150, 90, ${a})`;
        ctx.beginPath();
        ctx.moveTo(L.cx, y - 6);
        ctx.lineTo(L.cx - 5, y - 1);
        ctx.lineTo(L.cx + 5, y - 1);
        ctx.closePath();
        ctx.fill();
    }

    // 外框
    ctx.strokeStyle = 'rgba(150, 195, 220, 0.4)';
    ctx.lineWidth = 1;
    rrectPath(ctx, x, y, w, h, 7);
    ctx.stroke();

    // ---- 净浮力副条（贴在量表右侧，中心为零的双向条）----
    drawNetLiftBar(L, g.netLiftNorm);
}

/**
 * 净浮力条：中心 = 0（中性），向上填绿 = 正在被托起，向下填橙 = 正在被拽下去。
 * 玩家真正要控的是这一根归零，气量条只是手段。
 */
function drawNetLiftBar(L: BCDLayout, norm: number): void {
    const bw = 5;
    const bx = L.gaugeX + L.gaugeW + 4;
    const by = L.gaugeY + 4;
    const bh = L.gaugeH - 8;
    const midY = by + bh / 2;

    ctx.fillStyle = 'rgba(6, 14, 22, 0.8)';
    rrectPath(ctx, bx, by, bw, bh, 2.5);
    ctx.fill();

    // 中性中线
    ctx.strokeStyle = 'rgba(200, 225, 240, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx - 1.5, midY);
    ctx.lineTo(bx + bw + 1.5, midY);
    ctx.stroke();

    const mag = Math.min(1, Math.abs(norm));
    if (mag > 0.02) {
        const len = (bh / 2) * mag;
        if (norm > 0) {
            // 正浮力 → 向上填（被托起）
            ctx.fillStyle = 'rgba(120, 240, 190, 0.9)';
            ctx.fillRect(bx + 0.8, midY - len, bw - 1.6, len);
        } else {
            // 负浮力 → 向下填（被拽沉）
            ctx.fillStyle = 'rgba(255, 175, 105, 0.9)';
            ctx.fillRect(bx + 0.8, midY, bw - 1.6, len);
        }
    }
}

// =============================================
// 按钮
// =============================================

function drawInflateBtn(L: BCDLayout, active: boolean, overflow: boolean, time: number): void {
    const { cx, inflateY: cy, btnR: r } = L;
    const pulse = 0.5 + 0.5 * Math.sin(time * 12);

    // 按下时的外扩光环
    if (active) {
        ctx.fillStyle = `rgba(120, 215, 255, ${0.16 + 0.14 * pulse})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5 + pulse * 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.2, cx, cy, r);
    if (active) {
        grad.addColorStop(0, 'rgba(190, 245, 255, 0.98)');
        grad.addColorStop(1, 'rgba(45, 145, 200, 0.95)');
    } else {
        grad.addColorStop(0, 'rgba(70, 110, 135, 0.9)');
        grad.addColorStop(1, 'rgba(22, 48, 68, 0.92)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = overflow
        ? 'rgba(255, 165, 100, 0.95)'
        : (active ? 'rgba(215, 250, 255, 0.95)' : 'rgba(150, 200, 225, 0.5)');
    ctx.lineWidth = overflow ? 2 : 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 图标：向上箭头 + 上方三小道"进气流"短线（气从软管压进来）
    const ic = active ? 'rgba(255,255,255,0.98)' : 'rgba(205, 235, 250, 0.9)';
    ctx.strokeStyle = ic;
    ctx.fillStyle = ic;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy + 6.5);
    ctx.lineTo(cx, cy - 3.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8.5);
    ctx.lineTo(cx - 5.5, cy - 2.5);
    ctx.lineTo(cx + 5.5, cy - 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
        const lx = cx + i * 6.5;
        const jitter = active ? Math.sin(time * 18 + i) * 1.2 : 0;
        ctx.moveTo(lx, cy + 11 + jitter);
        ctx.lineTo(lx, cy + 14.5 + jitter);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
}

function drawDeflateBtn(L: BCDLayout, active: boolean, empty: boolean, time: number): void {
    const { cx, deflateY: cy, btnR: r } = L;
    const pulse = 0.5 + 0.5 * Math.sin(time * 12);

    if (active) {
        ctx.fillStyle = `rgba(255, 190, 130, ${0.14 + 0.12 * pulse})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5 + pulse * 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.2, cx, cy, r);
    if (active) {
        grad.addColorStop(0, 'rgba(255, 232, 195, 0.98)');
        grad.addColorStop(1, 'rgba(190, 110, 45, 0.95)');
    } else {
        grad.addColorStop(0, 'rgba(105, 92, 78, 0.9)');
        grad.addColorStop(1, 'rgba(48, 38, 28, 0.92)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 已经完全排空时描边变灰，暗示"再按也没用了"
    ctx.strokeStyle = empty
        ? 'rgba(130, 140, 145, 0.4)'
        : (active ? 'rgba(255, 235, 200, 0.95)' : 'rgba(215, 175, 130, 0.5)');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 图标：向下箭头 + 下方三个上浮的小气泡（气被排进水里）
    const ic = empty
        ? 'rgba(160, 168, 172, 0.7)'
        : (active ? 'rgba(255,255,255,0.98)' : 'rgba(250, 225, 195, 0.9)');
    ctx.strokeStyle = ic;
    ctx.fillStyle = ic;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6.5);
    ctx.lineTo(cx, cy + 3.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + 8.5);
    ctx.lineTo(cx - 5.5, cy + 2.5);
    ctx.lineTo(cx + 5.5, cy + 2.5);
    ctx.closePath();
    ctx.fill();
    // 气泡：排气时向上飘动
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
        const bx = cx - 6 + i * 6;
        const drift = active ? ((time * 26 + i * 5) % 9) : 0;
        const br = 1.5 + (i === 1 ? 0.7 : 0);
        ctx.beginPath();
        ctx.arc(bx, cy - 11 - drift, br, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.lineCap = 'butt';
}

// =============================================
// 一次性上手提示（前若干秒在控件左侧浮一张小卡）
// =============================================

let _hintStartAt = 0;
let _hintDoneForDive = false;
let _lastSeenDiveStamp = 0;

function drawFirstHintIfNeeded(L: BCDLayout, time: number): void {
    void time;
    const maze: any = state.mazeRescue;
    if (!maze) return;
    // 换一次下潜就重新给一次提示（用 startTime 当代际标识）
    const stamp = maze.startTime || 0;
    if (stamp !== _lastSeenDiveStamp) {
        _lastSeenDiveStamp = stamp;
        _hintStartAt = Date.now();
        _hintDoneForDive = false;
    }
    if (_hintDoneForDive) return;
    if (_hintStartAt === 0) _hintStartAt = Date.now();

    const age = Date.now() - _hintStartAt;
    const total = 5000;
    if (age > total) { _hintDoneForDive = true; return; }
    let alpha = 1;
    if (age < 350) alpha = age / 350;
    else if (age > total - 700) alpha = (total - age) / 700;
    alpha = Math.max(0, Math.min(1, alpha));

    const lines = ['浮力背心', '＋ 充气上浮', '－ 排气下沉', '黄线＝中性'];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '10px Arial';
    let maxW = 0;
    for (const s of lines) maxW = Math.max(maxW, ctx.measureText(s).width);
    const padding = 8;
    const lineH = 14;
    const panelW = maxW + padding * 2;
    const panelH = lines.length * lineH + padding * 2 - 2;
    const px = L.gaugeX - 10 - panelW;
    const py = L.cy - panelH / 2;

    ctx.fillStyle = 'rgba(8, 20, 32, 0.9)';
    rrectPath(ctx, px, py, panelW, panelH, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 190, 220, 0.4)';
    ctx.lineWidth = 0.8;
    rrectPath(ctx, px, py, panelW, panelH, 7);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = i === 0 ? 'rgba(150, 235, 255, 0.95)' : 'rgba(215, 235, 245, 0.85)';
        ctx.font = i === 0 ? 'bold 10px Arial' : '10px Arial';
        ctx.fillText(lines[i], px + padding, py + padding + i * lineH);
    }
    ctx.restore();
}

// =============================================
// 失控告警全屏层（边缘脉冲 + 一行处置指令）
// =============================================

export function drawBCDWarnOverlay(time: number): void {
    if (!cfg().enabled) return;
    if (!isBCDUIVisible()) return;
    const rt = getBCDRuntime();
    const cw = CONFIG.screenWidth;
    const ch = CONFIG.screenHeight;

    const up = rt.ascentWarn;
    const down = rt.descentWarn;
    if (up < 0.02 && down < 0.02) return;

    const pulse = 0.62 + 0.38 * Math.sin(time * 9);
    ctx.save();

    // --- 失控上浮：上缘橙红（更危险，配色更刺眼）---
    if (up > 0.02) {
        const a = up * pulse;
        const grad = ctx.createLinearGradient(0, 0, 0, ch * 0.3);
        grad.addColorStop(0, `rgba(255, 95, 70, ${0.45 * a})`);
        grad.addColorStop(1, 'rgba(255, 95, 70, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch * 0.3);

        if (up > 0.35) {
            const ta = Math.min(1, (up - 0.35) / 0.3) * pulse;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.75)';
            ctx.shadowBlur = 6;
            ctx.fillStyle = `rgba(255, 225, 210, ${ta})`;
            ctx.font = 'bold 17px "PingFang SC", Arial';
            ctx.fillText('⚠ 上浮过快', cw / 2, ch * 0.13);
            ctx.font = '11px "PingFang SC", Arial';
            ctx.fillStyle = `rgba(255, 195, 175, ${ta * 0.9})`;
            ctx.fillText('立即按 － 排气 · 氮气正在飙升', cw / 2, ch * 0.13 + 20);
            ctx.shadowBlur = 0;
        }
    }

    // --- 失控下沉：下缘琥珀（危险度低一档，配色偏暖不刺眼）---
    if (down > 0.02) {
        const a = down * pulse;
        const grad = ctx.createLinearGradient(0, ch, 0, ch * 0.74);
        grad.addColorStop(0, `rgba(255, 175, 70, ${0.38 * a})`);
        grad.addColorStop(1, 'rgba(255, 175, 70, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, ch * 0.74, cw, ch * 0.26);

        if (down > 0.4) {
            const ta = Math.min(1, (down - 0.4) / 0.3) * pulse;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.75)';
            ctx.shadowBlur = 6;
            ctx.fillStyle = `rgba(255, 238, 205, ${ta})`;
            ctx.font = 'bold 15px "PingFang SC", Arial';
            ctx.fillText('下沉过快 · 按 ＋ 补气', cw / 2, ch * 0.9);
            ctx.shadowBlur = 0;
        }
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
