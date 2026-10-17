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

/** Larger luminous cloth seams make the whole body read at gameplay scale. */
export function drawTapeBodySeams(c: CanvasRenderingContext2D, v: TapeVisual, echo = false): void {
    const r = sampleTapeBody(v, echo);
    if (r.presence < .01) return;
    c.save();
    const alpha = c.globalAlpha;
    c.strokeStyle = echo ? TAPE.paper : tapeAccent(v);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const side of [-1, 1]) {
        c.beginPath(); c.moveTo(-13, side * 5); c.quadraticCurveTo(-3, side * (10 + r.bloom * 2), 10, side * 5);
        c.globalAlpha = alpha * r.presence * (.18 + r.kick * .32); c.lineWidth = 4 + r.bloom * 2; c.stroke();
        c.globalAlpha = alpha * r.presence * (.45 + r.kick * .5); c.lineWidth = 1.1 + r.bloom * .8; c.stroke();
    }
    // Small organic chest accent, repeated on the target without a second tape.
    c.globalAlpha = alpha * r.presence * (.35 + r.kick * .5);
    c.fillStyle = TAPE.paper; c.beginPath(); c.ellipse(6, 0, 2.2 + r.kick * 1.4, 1.3 + r.kick, -.2, 0, TAU); c.fill();
    c.restore();
}

export interface RushMark { step: number; angle: number; radius: number; alpha: number; length: number; }
/** No spawned particle queue: even after a dropped frame, every mark is located
 * by its real 50ms note age. At most eight marks are alive. */
export function tapeRushMarks(v: TapeVisual): RushMark[] {
    if (!v.playing || v.muted || v.lanes[5].gain < .001) return [];
    const lane = v.lanes[5], marks: RushMark[] = [];
    for (let tail = 0; tail < 8; tail++) {
        const age = lane.age + tail * .05, step = lane.step - tail;
        if (age < 0 || age > .38 || step < 0) continue;
        if (v.level === 5 && age > v.levelAgeSeconds + 1e-8) continue;
        const t = age / .38;
        marks.push({ step, angle: step * 2.3999632297,
            radius: 24 + Math.pow(t, .72) * 118,
            alpha: lane.gain * (1 - t) * .95,
            length: 9 + Math.sin(t * Math.PI) * 22 });
    }
    return marks;
}

/** Spacious, lyrical currents rather than a bigger instrument readout.
 * Draw after the darkness mask and before danger overlays and the HUD. */
export function drawTapeResonanceField(c: CanvasRenderingContext2D, x: number, y: number, angle: number, v: TapeVisual, echo = false): void {
    const r = sampleTapeBody(v, echo);
    if (r.presence < .01) return;
    c.save(); c.translate(x, y); c.rotate(angle);
    const alpha = c.globalAlpha, color = tapeAccent(v);
    const radius = echo ? 30 : 28 + r.bloom * 118;
    const glow = c.createRadialGradient(3, 0, 2, 3, 0, radius);
    glow.addColorStop(0, echo ? 'rgba(244,231,199,.28)' : 'rgba(215,238,116,.22)');
    glow.addColorStop(.35, 'rgba(129,227,206,.08)'); glow.addColorStop(1, 'rgba(129,227,206,0)');
    c.globalAlpha = alpha * r.presence * (.55 + r.kick * .45);
    c.fillStyle = glow; c.beginPath(); c.ellipse(3, 0, radius, radius * .85, 0, 0, TAU); c.fill();

    // Contours around the whole swimmer, visible even with a tiny chest device.
    c.strokeStyle = echo ? TAPE.paper : color; c.lineCap = 'round';
    for (const side of [-1, 1]) {
        c.beginPath(); c.moveTo(-35, side * (7 + r.kick * 3));
        c.bezierCurveTo(-13, side * (18 + r.kick * 9), 16, side * (16 + r.bloom * 5), 28, side * 3);
        c.globalAlpha = alpha * r.presence * (.2 + r.kick * .5); c.lineWidth = 3.2 + r.bloom * 2; c.stroke();
        c.globalAlpha = alpha * r.presence * (.4 + r.kick * .5); c.lineWidth = 1.2; c.stroke();
    }
    if (echo || r.bloom < .005) { c.restore(); return; }

    // Wide silk-like streams: stable presence at level five, shaped by the kicks.
    const sway = Math.sin(v.beats * Math.PI) * 13;
    for (let i = 0; i < 3; i++) {
        const side = i % 2 ? -1 : 1, spread = 36 + i * 19;
        c.beginPath(); c.moveTo(-100 - i * 9, side * (spread + sway));
        c.bezierCurveTo(-65, side * (-20 + sway), 26, side * (spread + r.kick * 35), 118 + i * 12, side * (spread * .3 - sway));
        c.globalAlpha = alpha * r.bloom * (.1 + r.kick * .2);
        c.strokeStyle = i === 1 ? TAPE.mint : color; c.lineWidth = 8 + r.kick * 6; c.stroke();
        c.globalAlpha = alpha * r.bloom * (.32 + r.kick * .4); c.lineWidth = 1.5 + i * .25; c.stroke();
    }

    // A single entry blossom, aged on the actual audible layer transition.
    if (v.level === 5 && v.levelAgeSeconds < 1.15) {
        const age = clamp(v.levelAgeSeconds / 1.15), reach = 24 + age * 140;
        for (let i = 0; i < 7; i++) {
            c.save(); c.rotate(i * TAU / 7 + age * .25);
            c.globalAlpha = alpha * r.bloom * (1 - age) * .5;
            c.fillStyle = i % 2 ? TAPE.mint : TAPE.lime;
            c.beginPath(); c.moveTo(17, 0); c.quadraticCurveTo(reach * .55, -18 * (1 - age), reach, -4);
            c.quadraticCurveTo(reach * .62, 17 * (1 - age), 17, 0); c.fill(); c.restore();
        }
    }
    // Each of the twenty notes per second gets its own bright, travelling stroke.
    for (const mark of tapeRushMarks(v)) {
        c.save(); c.rotate(mark.angle);
        c.globalAlpha = alpha * mark.alpha; c.strokeStyle = color; c.lineWidth = 2.6;
        c.beginPath(); c.moveTo(mark.radius, 0); c.lineTo(mark.radius + mark.length, 2); c.stroke();
        c.fillStyle = TAPE.paper; c.fillRect(mark.radius + mark.length - 1, 0, 2.5, 2.5); c.restore();
    }
    c.restore();
}
