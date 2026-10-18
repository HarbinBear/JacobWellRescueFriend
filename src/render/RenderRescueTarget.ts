import { state } from '../core/state';
import { TapeVisual } from '../audio/AdaptiveMusicVisuals';
import { drawDiver } from './RenderDiver';
import { sampleRescueDance } from './RescueDance';
import { getRescueLimpPose } from '../logic/RescueRagdoll';

/** A readable warm figure after the darkness pass, not a light cast onto the cave.
 * The exact same body and pose render once per frame, even outside the flashlight. */
export function drawRescueTarget(c: CanvasRenderingContext2D, visual?: TapeVisual): void {
    const npc = state.npc;
    if (!npc || !npc.active) return;
    const maze = state.mazeRescue;
    const limp = maze?.npcStunned && maze.rescueRagdoll ? getRescueLimpPose(maze.rescueRagdoll) : undefined;
    const dance = maze && !maze.npcRescued && !maze.npcStunned ? sampleRescueDance(visual) : undefined;
    c.save();
    c.globalAlpha *= .94;
    drawDiver(c, npc.x, npc.y, dance ? -Math.PI / 2 : npc.angle, {
        suit: '#a77b50', body: '#bf9769', tank: '#d2cbb0',
        mask: '#d8d9b8', fin: '#a57c56', accent: '#e0c491', skin: '#d4b595',
    }, {
        animTime: visual ? visual.beats / 2 : Date.now() / 150,
        hasTank: true, vx: npc.vx, vy: npc.vy, id: 'npc', dancePose: dance, limpPose: limp,
    });
    if (maze?.npcStunnedAt && maze.phase === 'play') {
        const age = (Date.now() - maze.npcStunnedAt) / 1000;
        if (age >= 0 && age < 1.6) {
            c.globalAlpha *= Math.min(1, (1.6 - age) * 2);
            for (let i = 0; i < 3; i++) {
                const a = age * 6 + i * Math.PI * 2 / 3;
                const x = npc.x + Math.cos(a) * 23, y = npc.y - 29 + Math.sin(a) * 7;
                c.save(); c.translate(x, y); c.rotate(a * .5);
                c.fillStyle = '#efd790'; c.beginPath();
                for (let j = 0; j < 8; j++) {
                    const r = j % 2 ? 1.6 : 4.5, t = j * Math.PI / 4;
                    if (j === 0) c.moveTo(Math.cos(t) * r, Math.sin(t) * r);
                    else c.lineTo(Math.cos(t) * r, Math.sin(t) * r);
                }
                c.closePath(); c.fill(); c.restore();
            }
            if (age < .3) {
                c.strokeStyle = '#efd790'; c.lineWidth = 1.5;
                c.beginPath(); c.arc(npc.x, npc.y, 10 + age * 90, 0, Math.PI * 2); c.stroke();
            }
        }
    }
    c.restore();
}
