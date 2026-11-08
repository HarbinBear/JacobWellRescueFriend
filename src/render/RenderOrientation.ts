import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { getOrientationButton } from '../core/UILayout';
import { isOrientationSwitchPending } from '../core/ScreenOrientation';

function phone(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    c.beginPath(); c.moveTo(x + 2, y);
    c.arcTo(x + w, y, x + w, y + h, 2); c.arcTo(x + w, y + h, x, y + h, 2);
    c.arcTo(x, y + h, x, y, 2); c.arcTo(x, y, x + w, y, 2); c.closePath();
}

export function getScreenOrientationButton() {
    if ((state as any).extraction?.bagPageOpen) return null;
    const inDive = state.screen === 'mazeRescue' && state.mazeRescue?.phase === 'play';
    return { ...getOrientationButton(inDive), hitRadius: 22 };
}

/** 横竖两部手机与切换箭头共用一个图标。 */
export function drawScreenOrientationButton(c: CanvasRenderingContext2D) {
    const b = getScreenOrientationButton();
    if (!b) return;
    const toLandscape = CONFIG.screenWidth <= CONFIG.screenHeight;
    c.save(); c.translate(b.x, b.y - 4);
    c.globalAlpha = isOrientationSwitchPending() ? .45 : 1;
    c.strokeStyle = '#f4e7c7'; c.lineWidth = 1.4; c.lineJoin = 'round';
    phone(c, -13, -12, 12, 21);
    c.stroke();
    c.fillStyle = '#f4e7c7';
    c.beginPath(); c.arc(-7, -9, .7, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#10232b'; phone(c, -5, -2, 20, 12); c.fill(); c.stroke();
    c.fillStyle = '#f4e7c7';
    c.beginPath(); c.arc(12, 4, .7, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#e8ad70'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(2, -10); c.quadraticCurveTo(10, -13, 13, -5);
    c.moveTo(9, -7); c.lineTo(13, -5); c.lineTo(15, -9);
    c.stroke(); c.font = '10px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#f4e7c7'; c.fillText(toLandscape ? '横屏' : '竖屏', 0, 22);
    c.restore();
}
