import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { getOrientationButton } from '../core/UILayout';
import { isOrientationSwitchPending } from '../core/ScreenOrientation';

export function getScreenOrientationButton() {
    if ((state as any).extraction?.bagPageOpen) return null;
    const inDive = state.screen === 'mazeRescue' && state.mazeRescue?.phase === 'play';
    return { ...getOrientationButton(inDive), hitRadius: 22 };
}

/** 横向/竖向屏幕轮廓表达目标方向，不使用重来/刷新箭头。 */
export function drawScreenOrientationButton(c: CanvasRenderingContext2D) {
    const b = getScreenOrientationButton();
    if (!b) return;
    const toLandscape = CONFIG.screenWidth <= CONFIG.screenHeight;
    const w = toLandscape ? 23 : 14, h = toLandscape ? 14 : 22;
    c.save(); c.translate(b.x, b.y - 4);
    c.globalAlpha = isOrientationSwitchPending() ? .45 : 1;
    c.strokeStyle = '#f4e7c7'; c.lineWidth = 1.4; c.lineJoin = 'round';
    c.strokeRect(-w / 2, -h / 2, w, h);
    c.strokeStyle = '#e8ad70'; c.lineWidth = 1;
    c.beginPath();
    if (toLandscape) { c.moveTo(-w / 2 + 3, -3); c.lineTo(-w / 2 + 3, 3); }
    else { c.moveTo(-3, h / 2 - 3); c.lineTo(3, h / 2 - 3); }
    c.stroke(); c.font = '10px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#f4e7c7'; c.fillText(toLandscape ? '横屏' : '竖屏', 0, 22);
    c.restore();
}
