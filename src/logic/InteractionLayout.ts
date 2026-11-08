import { CONFIG } from '../core/config';
import { getUILayout } from '../core/UILayout';

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function getRopeControlPosition(width = CONFIG.screenWidth, height = CONFIG.screenHeight) {
    const p = getUILayout(width, height).rope;
    return { x: p.x, y: p.y };
}

export function getActionControlPosition(width = CONFIG.screenWidth, height = CONFIG.screenHeight) {
    const p = getUILayout(width, height).action;
    return { x: p.x, y: p.y, radius: CONFIG.fishInteraction.buttonRadius };
}

export function getActionWheelCenter(width = CONFIG.screenWidth, height = CONFIG.screenHeight) {
    const button = getActionControlPosition(width, height);
    const margin = CONFIG.fishInteraction.wheelRadius + 12;
    return { x: clamp(button.x, margin, width - margin), y: clamp(button.y, margin, height - margin) };
}

/** A socket outside the selector, on the side that actually fits the screen. */
export function getSelfSockets(centerX: number, centerY: number, outer: number, count = 1) {
    const radius = 20;
    const offset = outer + radius + 9;
    const side = centerX + offset + radius <= CONFIG.screenWidth - 8 ? 1 : -1;
    const x = clamp(centerX + side * offset, radius + 8, CONFIG.screenWidth - radius - 8);
    const spacing = radius * 2 + 4;
    const top = clamp(centerY - (count - 1) * spacing / 2, radius + 10,
        CONFIG.screenHeight - radius - 10 - (count - 1) * spacing);
    return Array.from({ length: count }, (_, index) => ({ x, y: top + index * spacing, radius, index }));
}
