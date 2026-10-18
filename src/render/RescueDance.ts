import { TapeVisual } from '../audio/AdaptiveMusicVisuals';

export interface RescueDancePose {
    lu: number; ll: number; ru: number; rl: number;
    sway: number; roll: number; bounce: number; compress: number;
    legPhase: number; leftBend: number; rightBend: number;
}
const poses = [
    [-.45, -.45, 2, -2.4], [-.72, -.24, 2.2, -2.35],
    [-2, 2.4, .45, .45], [-2.2, 2.35, .72, .24],
    [-.82, .36, .82, -.36], [-1.2, -.18, .4, -.12],
    [-2.35, -1.1, 2.35, 1.1], [-2, 2.4, .45, .45],
];
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Continuous eight-beat choreography, including while the target is offscreen.
 * Pose phase comes from audible audio time. Kick/snare use the exact score onsets. */
export function sampleRescueDance(v?: TapeVisual): RescueDancePose | undefined {
    if (!v || !v.playing || v.fallback) return undefined;
    const b = v.beats, cycle = ((b % 8) + 8) % 8, i = Math.floor(cycle);
    const t = clamp((cycle - i) / .28), ease = t * t * (3 - 2 * t);
    const a = poses[i], next = poses[(i + 1) % 8];
    const p = a.map((n, j) => n + (next[j] - n) * ease);
    const weight = Math.sin(b * Math.PI / 2), step = Math.sin(b * Math.PI);
    const kick = clamp(v.kick * 1.35), snare = clamp(v.snare * 1.4);
    return {
        lu: p[0] - .24 * snare, ll: p[1] - .32 * snare,
        ru: p[2] + .24 * snare, rl: p[3] + .32 * snare,
        sway: 7.5 * weight, roll: .16 * weight + .06 * snare * Math.sign(weight || 1),
        bounce: 5 * kick - 4.5 * snare - 2.4 * Math.sin(Math.PI * (b % 1)),
        compress: 1 - .115 * kick + .045 * snare, legPhase: (b * .5) % 1,
        leftBend: clamp(.18 + .62 * Math.max(0, step) + .3 * kick),
        rightBend: clamp(.18 + .62 * Math.max(0, -step) + .3 * kick),
    };
}
