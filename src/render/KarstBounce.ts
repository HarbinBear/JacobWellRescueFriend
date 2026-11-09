import { CONFIG } from '../core/config';
import { karstRay, type KarstTerrain } from '../world/KarstTerrain';
import { sampleKarstSurface } from '../world/KarstSurface';
import { karstClamp as clamp } from '../world/KarstNoise';

export const KARST_BOUNCE_COUNT = 6, KARST_BOUNCE_RAYS = 64;
export interface KarstBounceFrame {
    key: string; positions: Float32Array; directions: Float32Array; colors: Float32Array;
    visibility: Uint8Array; count: number; energy: number; builds: number;
}
let cached: KarstBounceFrame | null = null, lastTerrain: KarstTerrain | null = null, builds = 0;
export function getKarstBounce(t: KarstTerrain, poly: any[], x: number, y: number, angle: number, range: number) {
    const k = CONFIG.karst, key = [t.seed,t.generation,t.version,x,y,angle,range,poly.length,k.lightEnergy,k.bounceStrength,k.extinction.join(),CONFIG.quality.scale,CONFIG.quality.vplMax].join('/');
    if (cached?.key === key && lastTerrain === t) return cached;
    const frame: KarstBounceFrame = { key, positions: new Float32Array(24), directions: new Float32Array(24), colors: new Float32Array(24),
        visibility: new Uint8Array(KARST_BOUNCE_RAYS * KARST_BOUNCE_COUNT * 4), count: 0, energy: 0, builds: ++builds };
    const candidates: { p: any; energy: number; nx: number; ny: number }[] = [], fov = CONFIG.fov * Math.PI / 180;
    for (let i = 0; i < poly.length; i += Math.max(1, Math.floor(poly.length / 72))) {
        const p = poly[i]; if (p.dist >= range * .95 || p.dist < 9) continue;
        const theta = -fov * .5 + i / Math.max(1, poly.length - 1) * fov, a = angle + theta;
        const hit = p.nx === undefined ? karstRay(t, x, y, Math.cos(a), Math.sin(a), p.dist + 2) : p;
        const nx = hit.nx || 0, ny = hit.ny || 0;
        const incidence = Math.max(0, -nx * Math.cos(a) - ny * Math.sin(a));
        const cone = Math.exp(-Math.pow(Math.abs(theta) / (fov * .36), 4)) * .65 + Math.exp(-theta * theta / .031) * .55;
        const power = cone * (.18 + .82 * incidence) / (1 + Math.pow(p.dist / 188, 2));
        if (power > .012) candidates.push({ p, nx, ny, energy: power });
    }
    candidates.sort((a, b) => b.energy - a.energy);
    const selected: typeof candidates = [], cap = CONFIG.quality.scale <= .3 ? 3 : KARST_BOUNCE_COUNT;
    for (const c of candidates) {
        if (selected.some(s => Math.hypot(s.p.x - c.p.x, s.p.y - c.p.y) < 43)) continue;
        selected.push(c); if (selected.length >= cap) break;
    }
    const palette = [[.54, .50, .39], [.74, .67, .48], [.41, .43, .43], [.60, .41, .25]];
    for (let i = 0; i < selected.length; i++) {
        const s = selected[i], p = s.p, skin = sampleKarstSurface(t, p.x - s.nx * 14, p.y - s.ny * 14);
        const radius = 146 + skin.growth * 54, bx = p.x + s.nx * 5, by = p.y + s.ny * 5, n = i * 4;
        const power = s.energy * k.lightEnergy * k.bounceStrength * .24;
        frame.positions.set([bx, by, Math.max(35, skin.height + 18), power], n);
        frame.directions.set([s.nx, s.ny, radius, skin.growth], n);
        const color = palette[Math.max(0, Math.min(3, Math.round(skin.family)))];
        frame.colors.set(color.map((v, c) => v * Math.exp(-k.extinction[c] * p.dist * 1.48)).concat([p.dist]), n);
        for (let j = 0; j < KARST_BOUNCE_RAYS; j++) {
            const a = (j / KARST_BOUNCE_RAYS - .5) * Math.PI * 2, hit = karstRay(t, bx, by, Math.cos(a), Math.sin(a), radius);
            const encoded = Math.round(clamp(hit.distance / radius) * 65535), index = (i * KARST_BOUNCE_RAYS + j) * 4;
            frame.visibility[index] = encoded >>> 8; frame.visibility[index + 1] = encoded & 255; frame.visibility[index + 3] = 255;
        }
        frame.energy += power;
    }
    frame.count = selected.length; cached = frame; lastTerrain = t; return frame;
}
export function karstBounceStats() { return { count: cached?.count || 0, energy: cached?.energy || 0, builds, visibilityRaysPerSource: KARST_BOUNCE_RAYS }; }
export function releaseKarstBounce() { cached = null; lastTerrain = null; }
