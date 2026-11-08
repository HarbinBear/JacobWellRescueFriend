import { state } from '../core/state';
import { logicW } from './Canvas';
import { getUILayout } from '../core/UILayout';

export function caveRockTrialExitRect() { return { ...getUILayout().trialExit, w: 104, h: 28 }; }
export function isCaveRockTrialExitHit(x: number, y: number) {
    if (state.screen !== 'mazeRescue' || !state.mazeRescue?.rockTrial) return false;
    const r = caveRockTrialExitRect();
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
export function drawCaveRockTrialExit(ctx: CanvasRenderingContext2D) {
    if (state.screen !== 'mazeRescue' || !state.mazeRescue?.rockTrial) return;
    const r = caveRockTrialExitRect();
    ctx.save(); ctx.fillStyle = 'rgba(13,26,33,.92)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(193,186,146,.65)'; ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#e4dbc0'; ctx.font = '12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('退出岩体试跑', r.x + r.w / 2, r.y + r.h / 2);
    ctx.restore();
}
