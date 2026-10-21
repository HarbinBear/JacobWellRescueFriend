// BCD：用气囊轮廓的收瘪/鼓起提示实际体积，配平由玩家感受。
import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { ctx } from './Canvas';
import { getBCDRuntime } from '../logic/BCDSystem';

export interface BCDLayout {
    cx: number; cy: number; btnR: number; inflateY: number; deflateY: number;
    indicatorX: number; indicatorY: number; indicatorSize: number;
}
function cfg(): any { return CONFIG.bcd || {}; }
export function isBCDUIVisible(): boolean {
    return !!(cfg().enabled && cfg().uiVisible && state.screen === 'mazeRescue' && state.mazeRescue?.phase === 'play');
}
export function getBCDLayout(): BCDLayout {
    const c = cfg(), cw = CONFIG.screenWidth, ch = CONFIG.screenHeight;
    const size = c.uiIndicatorSize || 52;
    const btnR = c.uiBtnRadius || 21, gap = Math.max(c.uiBtnGap || 72, size / 2 + btnR + 14);
    const cx = cw - (c.uiXFromRight || 46), halfSpan = gap + btnR + 20;
    const safeTop = Math.max(62, CONFIG.uiSafeTop || 62);
    const cy = Math.max(halfSpan + safeTop, Math.min(ch - halfSpan - 32, ch * (c.uiCenterYRatio || .52)));
    return { cx, cy, btnR, inflateY: cy - gap, deflateY: cy + gap,
        indicatorX: cx - size / 2, indicatorY: cy - size / 2, indicatorSize: size };
}
export function getBCDInflateBtn() { const L = getBCDLayout(); return { cx: L.cx, cy: L.inflateY, r: L.btnR + 6 }; }
export function getBCDDeflateBtn() { const L = getBCDLayout(); return { cx: L.cx, cy: L.deflateY, r: L.btnR + 6 }; }

/**
 * 只读实际气囊体积，不读净浮力或中性体积。
 * 同样的轮廓在不同配重/深度下可以有不同的浮沉状态，没有“配平形状”。
 */
export function getBCDInflationShape(volumeL: number, capacityL: number, size: number) {
    const inflation = Math.max(0, Math.min(1, volumeL / Math.max(.1, capacityL)));
    return { halfWidth: size * .36, halfHeight: size * (.065 + .225 * Math.sqrt(inflation)) };
}

export function drawBCDController(_time: number): void {
    if (!isBCDUIVisible()) return;
    const rt = getBCDRuntime(), L = getBCDLayout();
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(185,209,210,.65)'; ctx.font = 'bold 8px Arial'; ctx.fillText('BCD', L.cx, L.cy - L.indicatorSize * .6);
    drawBCDBladder(L.cx, L.cy, rt.volumeL, cfg().capacityL || 4, L.indicatorSize);
    drawBCDButton(L.cx, L.inflateY, L.btnR, 1, rt.inflating, rt.overflow);
    drawBCDButton(L.cx, L.deflateY, L.btnR, -1, rt.deflating, false);
    ctx.restore();
}

/** 扁平气囊：一笔柔软外缘、两侧封口和少量反光；没有容器、刻度或填充进度。 */
function drawBCDBladder(cx: number, cy: number, volumeL: number, capacityL: number, size: number): void {
    const { halfWidth: w, halfHeight: h } = getBCDInflationShape(volumeL, capacityL, size);
    const seam = size * .045;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - w, cy - seam);
    ctx.bezierCurveTo(cx - w, cy - h, cx - w * .55, cy - h, cx, cy - h);
    ctx.bezierCurveTo(cx + w * .55, cy - h, cx + w, cy - h, cx + w, cy - seam);
    ctx.lineTo(cx + w, cy + seam);
    ctx.bezierCurveTo(cx + w, cy + h, cx + w * .55, cy + h, cx, cy + h);
    ctx.bezierCurveTo(cx - w * .55, cy + h, cx - w, cy + h, cx - w, cy + seam);
    ctx.closePath();
    ctx.fillStyle = 'rgba(21,47,50,.8)'; ctx.fill();
    ctx.strokeStyle = 'rgba(170,218,206,.9)'; ctx.stroke();

    // 封口不会变长，鼓胀只体现在柔软轮廓上。
    ctx.beginPath();
    ctx.moveTo(cx - w - 2.5, cy - seam); ctx.lineTo(cx - w - 2.5, cy + seam);
    ctx.moveTo(cx + w + 2.5, cy - seam); ctx.lineTo(cx + w + 2.5, cy + seam);
    ctx.strokeStyle = 'rgba(170,218,206,.4)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - w * .58, cy - h * .5);
    ctx.quadraticCurveTo(cx - w * .42, cy - h * .72, cx - w * .14, cy - h * .72);
    ctx.strokeStyle = 'rgba(196,230,219,.38)'; ctx.stroke();
}

function drawBCDButton(cx: number, cy: number, radius: number, direction: number, active: boolean, overflow: boolean): void {
    const color = overflow ? '#efb56c' : direction > 0 ? '#9be2d1' : '#efb56c';
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = active ? 'rgba(100,171,166,.18)' : 'rgba(12,26,33,.5)'; ctx.fill();
    ctx.strokeStyle = active || overflow ? color : 'rgba(167,193,195,.42)'; ctx.lineWidth = active ? 2 : 1; ctx.stroke();
    ctx.strokeStyle = active ? color : '#d6e3df'; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(cx, cy + direction * 7); ctx.lineTo(cx, cy - direction * 7);
    ctx.moveTo(cx - 5, cy - direction * 2); ctx.lineTo(cx, cy - direction * 7); ctx.lineTo(cx + 5, cy - direction * 2); ctx.stroke();
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
