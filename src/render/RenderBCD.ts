// BCD 软气囊：轮廓随实际气体体积膨胀/压缩，只保留绝对气量，去掉净浮力副条。
import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { ctx } from './Canvas';
import { getBCDRuntime, getBCDGaugeInfo } from '../logic/BCDSystem';

export interface BCDLayout {
    cx: number; cy: number; btnR: number; inflateY: number; deflateY: number;
    gaugeX: number; gaugeY: number; gaugeW: number; gaugeH: number;
}
function cfg(): any { return CONFIG.bcd || {}; }
export function isBCDUIVisible(): boolean {
    return !!(cfg().enabled && cfg().uiVisible && state.screen === 'mazeRescue' && state.mazeRescue?.phase === 'play');
}
export function getBCDLayout(): BCDLayout {
    const c = cfg(), cw = CONFIG.screenWidth, ch = CONFIG.screenHeight;
    const gaugeW = c.uiGaugeW || 42, gaugeH = c.uiGaugeH || 132;
    const btnR = c.uiBtnRadius || 21;
    const gap = Math.max(c.uiBtnGap || 104, gaugeH / 2 + btnR + 26);
    const cx = cw - (c.uiXFromRight || 46);
    const halfSpan = gap + btnR + 20;
    const cy = Math.max(halfSpan + 62, Math.min(ch - halfSpan - 32, ch * (c.uiCenterYRatio || .52)));
    return { cx, cy, btnR, inflateY: cy - gap, deflateY: cy + gap,
        gaugeX: cx - gaugeW / 2, gaugeY: cy - gaugeH / 2, gaugeW, gaugeH };
}
export function getBCDInflateBtn() { const L = getBCDLayout(); return { cx: L.cx, cy: L.inflateY, r: L.btnR + 6 }; }
export function getBCDDeflateBtn() { const L = getBCDLayout(); return { cx: L.cx, cy: L.deflateY, r: L.btnR + 6 }; }

/** 体积改变的是整只柔性气囊的宽高，不是固定管子里的液面。 */
export function getBCDBladderDimensions(fill: number, width: number, height: number) {
    const expansion = Math.sqrt(Math.max(0, Math.min(1, fill)));
    return { width: width * (.30 + .70 * expansion), height: height * (.58 + .42 * expansion) };
}
function bladderPath(c: CanvasRenderingContext2D, w: number, h: number) {
    const x = w / 2, y = h / 2;
    c.beginPath(); c.moveTo(0, -y * .86);
    c.bezierCurveTo(x * .35, -y * 1.08, x, -y, x, -y * .58);
    c.bezierCurveTo(x, -y * .22, x * .65, -y * .12, x * .76, y * .22);
    c.bezierCurveTo(x * 1.05, y * .72, x * .8, y * 1.02, 0, y * .87);
    c.bezierCurveTo(-x * .8, y * 1.02, -x * 1.05, y * .72, -x * .76, y * .22);
    c.bezierCurveTo(-x * .65, -y * .12, -x, -y * .22, -x, -y * .58);
    c.bezierCurveTo(-x, -y, -x * .35, -y * 1.08, 0, -y * .86); c.closePath();
}
export function drawBCDController(time: number): void {
    if (!isBCDUIVisible()) return;
    const rt = getBCDRuntime(), g = getBCDGaugeInfo(), L = getBCDLayout();
    const fill = Math.max(0, Math.min(1, g.volumeL / Math.max(.1, cfg().capacityL)));
    const size = getBCDBladderDimensions(fill, L.gaugeW, L.gaugeH);
    ctx.save(); ctx.translate(L.cx, L.cy);
    // 很淡的最大容量轮廓，让压缩后的气囊有参照物，不添加第二个量表。
    bladderPath(ctx, L.gaugeW, L.gaugeH);
    ctx.strokeStyle = 'rgba(135,171,188,.18)'; ctx.lineWidth = 1; ctx.setLineDash([2, 5]); ctx.stroke(); ctx.setLineDash([]);
    bladderPath(ctx, size.width, size.height);
    const grad = ctx.createLinearGradient(-size.width / 2, 0, size.width / 2, 0);
    grad.addColorStop(0, '#29434e'); grad.addColorStop(.28, '#629caa');
    grad.addColorStop(.5, '#355966'); grad.addColorStop(.76, '#74b9bc'); grad.addColorStop(1, '#29434e');
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = rt.overflow ? '#efb56c' : 'rgba(174,224,218,.8)'; ctx.lineWidth = 1.3; ctx.stroke();
    // 缝线、腰带与压瘪时更明显的布料褶皱。
    ctx.strokeStyle = 'rgba(8,24,32,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -size.height * .39); ctx.lineTo(0, size.height * .39); ctx.stroke();
    ctx.fillStyle = 'rgba(12,26,34,.65)'; ctx.fillRect(-size.width * .43, -3, size.width * .86, 6);
    ctx.strokeStyle = `rgba(180,222,224,${.12 + (1 - fill) * .35})`; ctx.lineWidth = .8;
    for (const side of [-1, 1]) for (const y of [-.28, .22, .32]) {
        ctx.beginPath(); ctx.moveTo(side * size.width * .13, size.height * y);
        ctx.quadraticCurveTo(side * size.width * .2, size.height * y - (1 - fill) * 5, side * size.width * .38, size.height * y + 3); ctx.stroke();
    }
    ctx.restore();
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 8px Arial'; ctx.fillStyle = 'rgba(178,205,210,.75)'; ctx.fillText('BCD', L.cx, L.gaugeY - 11);
    ctx.font = 'bold 10px Arial'; ctx.fillStyle = '#d6ebe8';
    ctx.fillText(g.volumeL.toFixed(1) + ' L', L.cx, L.gaugeY + L.gaugeH + 10);
    // 唯一的绝对气量进度条，以真实容量为满格。
    ctx.fillStyle = 'rgba(180,214,217,.15)'; ctx.fillRect(L.cx - 18, L.gaugeY + L.gaugeH + 20, 36, 3);
    ctx.fillStyle = '#9be2d1'; ctx.fillRect(L.cx - 18, L.gaugeY + L.gaugeH + 20, 36 * fill, 3);
    drawInflateBtn(L, rt.inflating, rt.overflow, time);
    drawDeflateBtn(L, rt.deflating, g.volumeL <= .001, time);
    ctx.font = '8px Arial'; ctx.fillStyle = 'rgba(178,205,210,.65)';
    ctx.fillText(g.pressureAtm.toFixed(1) + ' ATA', L.cx, L.deflateY + L.btnR + 15); ctx.restore();
}

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
// 失控告警全屏层（仅保留边缘颜色，不弹教学或处置文案）
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

    }

    // --- 失控下沉：下缘琥珀（危险度低一档，配色偏暖不刺眼）---
    if (down > 0.02) {
        const a = down * pulse;
        const grad = ctx.createLinearGradient(0, ch, 0, ch * 0.74);
        grad.addColorStop(0, `rgba(255, 175, 70, ${0.38 * a})`);
        grad.addColorStop(1, 'rgba(255, 175, 70, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, ch * 0.74, cw, ch * 0.26);

    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
