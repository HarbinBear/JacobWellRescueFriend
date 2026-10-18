import { state, player } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { TAPE } from './TapeDeckVisual';

export const RESCUE_ENCOUNTER_LINES = [
    '……他认不出这儿了。',
    '还以为自己在舞池里……',
    '先带他上去。',
];

/** Quiet, actor-attached speech. No journal, speaker label or source reveal. */
export function drawRescueEncounterNote(): void {
    const maze = state.mazeRescue;
    if (!maze || maze.phase !== 'play' || !maze.npcEncounterNoteAt) return;
    const age = (Date.now() - maze.npcEncounterNoteAt) / 1000;
    if (age < 0 || age >= 8.4 || maze.npcRescued || maze.npcRescueHolding) return;
    const index = Math.floor(age / 2.8), local = age % 2.8;
    const alpha = Math.max(0, Math.min(.9, local / .25, (2.8 - local) / .4));
    const camera = state.camera;
    const px = logicW / 2 + (player.x - camera.x - camera.swayX) * camera.zoom;
    const py = logicH / 2 + (player.y - camera.y - camera.swayY) * camera.zoom;
    if (px < -25 || px > logicW + 25 || py < 50 || py > logicH - 30) return;
    // A small mouth-directed tail identifies the speaking diver; text follows him.
    const width = 176, x = Math.max(84, Math.min(logicW - width - 54, px - width + 25));
    let y = Math.max(100, Math.min(logicH - 125, py - 66));
    const nx = logicW / 2 + (state.npc.x - camera.x - camera.swayX) * camera.zoom;
    const ny = logicH / 2 + (state.npc.y - camera.y - camera.swayY) * camera.zoom;
    const below = nx + 42 > x && nx - 42 < x + width && ny + 65 > y && ny - 65 < y + 30;
    if (below) y = Math.min(logicH - 125, py + 42);
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.fillStyle = 'rgba(15,28,30,.84)';
    ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.lineTo(x + width, y + 2);
    ctx.lineTo(x + width - 5, y + 30);
    ctx.lineTo(x, y + 28); ctx.lineTo(x + 3, y + 5); ctx.closePath(); ctx.fill();
    const edgeY = below ? y + 1 : y + 29;
    const tailX = Math.max(x + 12, Math.min(x + width - 20, px));
    ctx.beginPath(); ctx.moveTo(tailX - 5, edgeY); ctx.lineTo(px + 12, py + (below ? 13 : -19));
    ctx.lineTo(tailX + 8, edgeY); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '12px "PingFang SC", Arial'; ctx.fillStyle = TAPE.paper;
    ctx.fillText(RESCUE_ENCOUNTER_LINES[index], x + 11, y + 15, width - 22);
    ctx.restore();
}
