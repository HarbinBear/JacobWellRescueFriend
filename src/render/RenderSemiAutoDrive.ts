import { CONFIG } from '../core/config';
import { getUILayout } from '../core/UILayout';
import { state } from '../core/state';
import { getSemiAutoEnergyRates } from '../logic/SemiAutoDrive';

const MINT = '#9be2d1', AMBER = '#efb56c';
export function getSemiAutoFeedback() {
    const sd = state.semiAutoDrive;
    if (sd.exhausted) return { title: '体力耗尽', hint: '基础动力 · 仍可转向', color: AMBER };
    if (sd.remaining < .999 && (!sd.thrusting || sd.outputPower < getSemiAutoEnergyRates().sustainablePower)) {
        return { title: '体力', hint: sd.thrusting ? '轻推恢复' : '恢复中', color: MINT };
    }
    return { title: '体力', hint: sd.thrusting ? '推进' : '就绪', color: sd.remaining < .25 ? AMBER : MINT };
}

/** 固定左上短条，与移动触点、BCD 和展开轮盘无关。 */
export function getStaminaLayout(width: number, height: number) {
    return { ...getUILayout(width, height).stamina, vertical: false };
}

export function drawSemiAutoControls(c: CanvasRenderingContext2D, width: number, height: number): void {
    const sd = state.semiAutoDrive, feedback = getSemiAutoFeedback(), L = getStaminaLayout(width, height);
    c.save();
    // 移动区始终隐形，按住时也不绘制摇杆。
    c.textBaseline = 'middle'; c.font = 'bold 9px Arial';
    c.fillStyle = 'rgba(155,190,193,.18)'; c.fillRect(L.x, L.y, L.width, L.height);
    c.fillStyle = feedback.color;
    c.fillRect(L.x, L.y, L.width * sd.remaining, L.height);
    c.textAlign = 'left'; c.fillText('体力', L.x, L.y - 10);
    c.textAlign = 'right'; c.font = '9px Arial';
    c.fillText(Math.round(sd.remaining * 100) + '%', L.x + L.width, L.y - 10);
    c.restore();
}
