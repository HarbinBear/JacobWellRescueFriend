import { CONFIG } from '../core/config';
import { state, touches } from '../core/state';
import { getBCDLayout, isBCDUIVisible } from './RenderBCD';
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

/** 三种实验位置均与手指无关，顶部位于刘海/微信胶囊下方。 */
export function getStaminaLayout(width: number, height: number) {
    const position = CONFIG.semiAutoDrive.staminaPosition;
    const safeTop = Math.max(62, CONFIG.uiSafeTop || 62), safeBottom = Math.max(18, CONFIG.uiSafeBottom || 18);
    if (position === 'bcd' && isBCDUIVisible()) {
        const bcd = getBCDLayout();
        return { x: Math.min(width - 14, bcd.cx + bcd.btnR + 14), y: bcd.inflateY, width: 7, height: bcd.deflateY - bcd.inflateY, vertical: true };
    }
    const w = Math.min(238, width - 116);
    return { x: Math.max(92, (width - w) / 2), y: position === 'top' ? safeTop + 20 : height - safeBottom - 10,
        width: w, height: 6, vertical: false };
}

export function drawSemiAutoControls(c: CanvasRenderingContext2D, width: number, height: number): void {
    const sd = state.semiAutoDrive, feedback = getSemiAutoFeedback(), L = getStaminaLayout(width, height);
    c.save();
    if (CONFIG.semiAutoDrive.showJoystick && touches.joystickId !== null) {
        c.beginPath(); c.arc(touches.start.x, touches.start.y, 39, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(215,235,232,.3)'; c.lineWidth = 1.3; c.stroke();
        c.beginPath(); c.arc(touches.curr.x, touches.curr.y, 16, 0, Math.PI * 2);
        c.fillStyle = sd.exhausted ? 'rgba(239,181,108,.2)' : 'rgba(155,226,209,.4)'; c.fill();
        c.strokeStyle = feedback.color; c.stroke();
    }
    c.textBaseline = 'middle'; c.font = 'bold 9px Arial';
    c.fillStyle = 'rgba(5,16,23,.82)'; c.fillRect(L.x - 3, L.y - 3, L.width + 6, L.height + 6);
    c.fillStyle = 'rgba(155,190,193,.18)'; c.fillRect(L.x, L.y, L.width, L.height);
    c.fillStyle = feedback.color;
    if (L.vertical) {
        c.fillRect(L.x, L.y + L.height * (1 - sd.remaining), L.width, L.height * sd.remaining);
        c.textAlign = 'center'; c.font = 'bold 7px Arial'; c.fillText('STA', L.x + L.width / 2, L.y - 10);
        c.font = '8px Arial'; c.fillText(Math.round(sd.remaining * 100) + '', L.x + L.width / 2, L.y + L.height + 11);
    } else {
        c.fillRect(L.x, L.y, L.width * sd.remaining, L.height);
        c.textAlign = 'left'; c.fillText(feedback.title, L.x, L.y - 10);
        c.textAlign = 'right'; c.font = '9px Arial';
        c.fillText(feedback.hint + ' · ' + Math.round(sd.remaining * 100) + '%', L.x + L.width, L.y - 10);
    }
    c.restore();
}
