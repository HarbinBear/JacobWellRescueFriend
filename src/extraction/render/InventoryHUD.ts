import { getUILayout } from '../../core/UILayout';
import { state } from '../../core/state';
import { ctx } from '../../render/Canvas';
import { TAPE } from '../../render/TapeDeckVisual';
import { getBagOccupiedSlots } from '../logic/Inventory';
import { ensureExtractionState } from '../core/ExtractionState';

export function isInventoryHUDVisible(): boolean {
    return state.screen === 'mazeRescue' && state.mazeRescue?.phase === 'play';
}

/** 小图标沿用工具栏 44px 点击区域，切屏后立即使用新布局。 */
export function getInventoryHUDButtonRect() {
    if (!isInventoryHUDVisible()) return null;
    const { x, y } = getUILayout().bag;
    return { x: x - 22, y: y - 22, w: 44, h: 44 };
}

export function drawInventoryHUD(): void {
    if (!isInventoryHUDVisible()) return;
    const ex = ensureExtractionState(), slotN = Math.max(1, ex.bag.maxSlots);
    const used = getBagOccupiedSlots(), full = used >= slotN;
    const { x, y } = getUILayout().bag;
    ctx.save(); ctx.translate(x, y - 3);
    ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = full ? '#ffd48c' : TAPE.paper;
    if (used / slotN >= .8) {
        ctx.shadowColor = '#ffc864'; ctx.shadowBlur = 3 + 2 * Math.sin(Date.now() / 200);
    }
    // 提手、肩带和包身构成图标本身，不添加外框或底板。
    ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(-4, -14); ctx.lineTo(4, -14); ctx.lineTo(4, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.quadraticCurveTo(-16, -7, -14, 9);
    ctx.moveTo(10, -6); ctx.quadraticCurveTo(16, -7, 14, 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11, 9); ctx.lineTo(-11, -3);
    ctx.quadraticCurveTo(-11, -11, 0, -11); ctx.quadraticCurveTo(11, -11, 11, -3);
    ctx.lineTo(11, 9); ctx.quadraticCurveTo(11, 12, 8, 12); ctx.lineTo(-8, 12);
    ctx.quadraticCurveTo(-11, 12, -11, 9); ctx.closePath();
    ctx.fillStyle = full ? '#b58b4f' : '#b77d61'; ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(7, 2); ctx.lineTo(7, 8); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fillStyle = '#654b3d'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(4, -5); ctx.stroke();
    ctx.fillStyle = full ? '#ffdb98' : TAPE.paper;
    ctx.font = '9px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(used + '/' + slotN, 0, 21);
    ctx.restore();
}

export function openBagFullPage(): void {
    (ensureExtractionState() as any).bagPageOpen = true;
}

export function closeBagFullPage(): void {
    (ensureExtractionState() as any).bagPageOpen = false;
}

export function isBagFullPageOpen(): boolean {
    return !!(ensureExtractionState() as any).bagPageOpen;
}
