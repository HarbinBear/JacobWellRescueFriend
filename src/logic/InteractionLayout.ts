import { CONFIG } from '../core/config';

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function getRopeControlPosition(width = CONFIG.screenWidth, height = CONFIG.screenHeight) {
    const margin = CONFIG.marker.wheelOuterRadius + 12;
    const footer = CONFIG.driveMode === 'semiAuto' && CONFIG.semiAutoDrive.staminaPosition === 'bottom'
        ? Math.max(18, CONFIG.uiSafeBottom || 18) + 36 : 0;
    return {
        x: clamp(width * CONFIG.marker.btnXRatio, margin, width - margin),
        y: clamp(height * CONFIG.marker.btnYRatio, margin, height - margin - footer),
    };
}

export function getActionControlPosition(width = CONFIG.screenWidth, height = CONFIG.screenHeight) {
    const rope = getRopeControlPosition(width, height);
    const radius = CONFIG.fishInteraction.buttonRadius;
    const y = Math.min(height - CONFIG.fishInteraction.wheelRadius - 12,
        Math.max(rope.y - 66, height / 2 + CONFIG.fishInteraction.wheelRadius + 16));
    return { x: rope.x - CONFIG.marker.btnRadius - radius - 15, y, radius };
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
