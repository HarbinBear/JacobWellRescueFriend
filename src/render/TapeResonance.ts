import { TapeVisual } from '../audio/AdaptiveMusicVisuals';
import { TAPE, tapeAccent } from './TapeDeckVisual';

const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export interface TapeBodyResponse {
    presence: number; bloom: number; kick: number;
    scaleX: number; scaleY: number; roll: number; lift: number; openArms: number;
}

/** All pose changes are visual only. Never move the collider or the camera. */
export function sampleTapeBody(v?: TapeVisual, echo = false): TapeBodyResponse {
    const neutral = { presence: 0, bloom: 0, kick: 0, scaleX: 1, scaleY: 1, roll: 0, lift: 0, openArms: 0 };
    if (!v || !v.playing || v.muted) return neutral;
    const presence = clamp(Math.max(...v.lanes.slice(1).map((l, i) => l.gain * [0.1, .25, .48, .65, 1][i])));
    const bloom = clamp(v.lanes[5].gain / .94);
    const kick = clamp(Math.max(v.kick, v.lanes[2].hit * .45, v.lanes[1].hit * .2));
    const amount = echo ? .4 : 1;
    const side = Math.floor(v.beats) % 2 === 0 ? 1 : -1;
    return { presence, bloom, kick,
        scaleX: 1 + amount * kick * (.012 + .045 * presence),
        scaleY: 1 + amount * kick * (.025 + .14 * presence),
        roll: amount * side * kick * (.012 + .065 * presence),
        lift: amount * kick * (presence + bloom * 2.5),
        openArms: amount * (presence * .055 + bloom * (.18 + kick * .1)) };
}

/** A small chest light stays inside the body; no surrounding outlines. */
export function drawTapeChestAccent(c: CanvasRenderingContext2D, v: TapeVisual, echo = false): void {
    const r = sampleTapeBody(v, echo);
    if (r.presence < .01) return;
    c.save();
    c.globalAlpha *= r.presence * (.35 + r.kick * .5);
    c.fillStyle = echo ? TAPE.paper : tapeAccent(v);
    c.beginPath(); c.ellipse(6, 0, 2.2 + r.kick * 1.4, 1.3 + r.kick, -.2, 0, TAU); c.fill();
    c.restore();
}
