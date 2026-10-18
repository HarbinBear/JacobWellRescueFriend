import { state } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { cutPanel, TAPE } from './TapeDeckVisual';

export const RESCUE_ENCOUNTER_LINES = [
    '他似乎认不出这里了。',
    '把洞穴当成了舞池，还在笑。',
    '得先把他带回水面。',
];

/** Once on first encounter, as an observation rather than a diagnosis/source reveal. */
export function drawRescueEncounterNote(): void {
    const maze = state.mazeRescue;
    if (!maze || maze.phase !== 'play' || !maze.npcEncounterNoteAt) return;
    const age = (Date.now() - maze.npcEncounterNoteAt) / 1000;
    if (age < 0 || age > 8 || maze.npcRescued) return;
    const alpha = Math.max(0, Math.min(1, age / .45, (8 - age) / 1));
    const x = 91, width = Math.min(236, logicW - x - 80);
    const camera = state.camera, npc = state.npc;
    const screenX = camera && npc ? logicW / 2 + (npc.x - camera.x - camera.swayX) * camera.zoom : -100;
    const screenY = camera && npc ? logicH / 2 + (npc.y - camera.y - camera.swayY) * camera.zoom : -100;
    // Do not cover the very person this note introduces. Leave HUD/BCD controls clear.
    const coversTarget = screenX + 40 > x && screenX - 40 < x + width && screenY + 75 > 86 && screenY - 75 < 187;
    const y = coversTarget ? Math.max(205, logicH - 235) : 86;
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.translate(0, -(1 - alpha) * 5);
    ctx.fillStyle = 'rgba(17,28,30,.88)'; cutPanel(ctx, x, y, width, 101, 5); ctx.fill();
    ctx.fillStyle = '#b58962'; ctx.fillRect(x, y + 10, 2, 81);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '9px Arial'; ctx.fillStyle = '#a5ad9a'; ctx.fillText('潜水手记  /  01', x + 13, y + 17);
    ctx.font = '12px "PingFang SC", Arial'; ctx.fillStyle = TAPE.paper;
    RESCUE_ENCOUNTER_LINES.forEach((line, i) => ctx.fillText(line, x + 13, y + 40 + i * 20, width - 23));
    ctx.restore();
}
