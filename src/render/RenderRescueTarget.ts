import { state } from '../core/state';
import { TapeVisual } from '../audio/AdaptiveMusicVisuals';
import { drawDiver } from './RenderDiver';
import { sampleRescueDance } from './RescueDance';

/** A readable warm figure after the darkness pass, not a light cast onto the cave.
 * The exact same body and pose render once per frame, even outside the flashlight. */
export function drawRescueTarget(c: CanvasRenderingContext2D, visual?: TapeVisual): void {
    const npc = state.npc;
    if (!npc || !npc.active) return;
    const dance = state.mazeRescue && !state.mazeRescue.npcRescued ? sampleRescueDance(visual) : undefined;
    c.save();
    c.globalAlpha *= .94;
    drawDiver(c, npc.x, npc.y, dance ? -Math.PI / 2 : npc.angle, {
        suit: '#a77b50', body: '#bf9769', tank: '#d2cbb0',
        mask: '#d8d9b8', fin: '#a57c56', accent: '#e0c491', skin: '#d4b595',
    }, {
        animTime: visual ? visual.beats / 2 : Date.now() / 150,
        hasTank: true, vx: npc.vx, vy: npc.vy, id: 'npc', dancePose: dance,
    });
    c.restore();
}
