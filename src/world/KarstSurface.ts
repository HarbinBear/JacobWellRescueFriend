import type { KarstTerrain, KarstFormation } from './KarstTerrain';
import { karstDistances, sampleKarst } from './KarstTerrain';
import { karstClamp as clamp, karstSmooth as smooth, karstMix as mix, karstNoise as noise } from './KarstNoise';

export const KARST_SURFACE_HEIGHT = 288;
export const KARST_SURFACE_UV = 32768;
export const KARST_CHAMBER_UV = 65536;
export interface KarstSurface {
    geometry: Uint8Array; coordinates: Uint8Array; geology: Uint8Array;
    bakeMs: number; mappedFeatures: number; version: number;
}
const cache = new WeakMap<KarstTerrain, KarstSurface>();
const BUCKET = 192;
function pack(value: number, out: Uint8Array, index: number, range: number) {
    const v = Math.round(clamp(value / range + .5) * 65535);
    out[index] = v >>> 8; out[index + 1] = v & 255;
}
export function formationFrame(f: KarstFormation, x: number, y: number) {
    const extra = f as any, ax = extra.axisX ?? 0, ay = extra.axisY ?? f.direction;
    const px = x - f.x, py = y - f.y, depth = px * ax + py * ay, u = depth / f.length;
    const bend = f.bend * smooth(0, 1, u) + noise(depth, f.x, 44, f.seed) * (extra.kind === 'blade' ? .65 : 2.4);
    const across = px * ay - py * ax - bend;
    const taper = extra.kind === 'bulb' ? Math.sqrt(Math.max(0, 1 - Math.pow(clamp(u) * 1.04, 2))) :
        extra.kind === 'blade' ? Math.max(0, 1 - clamp(u) * .88) : Math.pow(Math.max(0, 1 - clamp(u)), extra.taper ?? .69);
    const width = f.width * taper * (1 + .12 * Math.sin(u * 21 + noise(x, y, 31, f.seed) * 2));
    return { depth, u, across, width: Math.max(2, width), axisX: ax, axisY: ay };
}
export function getKarstSurface(t: KarstTerrain): KarstSurface {
    const existing = cache.get(t); if (existing) return existing;
    const start = Date.now(), size = t.field.length, distance = karstDistances(t);
    const out: KarstSurface = { geometry: new Uint8Array(t.texture), coordinates: new Uint8Array(size * 4),
        geology: new Uint8Array(size * 4), bakeMs: 0, mappedFeatures: 0, version: 2 };
    const buckets = new Map<string, KarstFormation[]>();
    for (const f of t.formations) {
        const ax = (f as any).axisX ?? 0, ay = (f as any).axisY ?? f.direction, extent = f.width * 1.65 + Math.abs(f.bend) + 32;
        const ex = f.x + ax * f.length, ey = f.y + ay * f.length;
        for (let y = Math.floor((Math.min(f.y, ey) - extent) / BUCKET); y <= Math.floor((Math.max(f.y, ey) + extent) / BUCKET); y++)
            for (let x = Math.floor((Math.min(f.x, ex) - extent) / BUCKET); x <= Math.floor((Math.max(f.x, ex) + extent) / BUCKET); x++) {
                const key = x + ',' + y; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key)!.push(f);
            }
    }
    const chambers: any = (t as any).chambers;
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
        const i = r * t.cols + c, k = i * 4, x = t.x + c * t.step, y = t.y + r * t.step;
        const region = chambers?.at?.(x, y), inclination = region?.inclination || 0;
        const ca = Math.cos(inclination), sa = Math.sin(inclination);
        const broad = noise(x, y, 255, t.seed + 1151), eroded = noise(x + broad * 37, y - broad * 29, 74, t.seed + 619);
        let u = x * ca + y * sa + broad * 43, v = -x * sa + y * ca + eroded * 18;
        let family = region?.material ?? 0, tint = region?.mineral ?? (.5 + noise(x, y, 581, t.seed + 661) * .35), growth = 0;
        const dep = t.field[i] < 0 ? distance[i] : 0;
        const profileHeight = region?.relief ?? 128, bevel = region?.bevel ?? 42;
        const face = 1 - Math.exp(-dep / bevel);
        const ridge = noise(x + eroded * 19, y, 122, t.seed + 879) * (region?.roughness ?? 27);
        let h = Math.max(0, 12 + face * (profileHeight + broad * 35 + ridge));
        let best: KarstFormation | null = null, weight = 0;
        for (const f of buckets.get(Math.floor(x / BUCKET) + ',' + Math.floor(y / BUCKET)) || []) {
            const p = formationFrame(f, x, y);
            if (p.u < -.18 || p.u > 1.06 || Math.abs(p.across) > p.width * 1.25 + 12) continue;
            const w = (1 - smooth(.88, 1.22, Math.abs(p.across) / p.width)) * smooth(-.16, .09, p.u) * (1 - smooth(.96, 1.06, p.u));
            if (w > weight) { weight = w; best = f; }
        }
        if (best && weight > .002 && t.field[i] < 12) {
            const p = formationFrame(best, x, y), e = best as any, cross = clamp(p.across / p.width, -.995, .995);
            // Cylindrical coordinates converge to the actual tapered axis. The
            // center and taper here are the same as the physical deposition.
            const mappedU = Math.asin(cross) * best.width * (e.kind === 'blade' ? .85 : 1.15);
            const mappedV = p.depth + noise(p.depth, best.x, 91, best.seed) * 4;
            const rootBroad=noise(best.x,best.y,255,t.seed+1151),rootEroded=noise(best.x+rootBroad*37,best.y-rootBroad*29,74,t.seed+619);
            const originU=best.x*ca+best.y*sa+rootBroad*43,originV=-best.x*sa+best.y*ca+rootEroded*18;
            u = t.generation==='legacy'?mix(u,mappedU+originU,weight):mappedU+originU;
            v = t.generation==='legacy'?mix(v,mappedV+originV,weight):mappedV+originV;
            const asymmetry = e.faceOffset ?? (noise(best.x, best.y, 380, best.seed) * .22);
            const rounded = Math.sqrt(Math.max(0, 1 - Math.pow(clamp(cross - asymmetry, -1, 1), 2)));
            const localHeight = e.kind === 'blade' ? Math.max(0, 1 - Math.abs(cross - asymmetry) * .78) : rounded;
            const bodyHeight = (e.relief ?? (43 + best.width * 1.9)) * Math.pow(Math.max(0, 1 - clamp(p.u)), e.kind === 'blade' ? .26 : .50);
            const root = 14 + localHeight * bodyHeight;
            h = mix(h, root, weight);
            growth = weight; family = e.material ?? 1;
            tint = mix(tint, .42 + (best.seed % 29) / 100, weight);
            out.mappedFeatures++;
        }
        // Do not put a black bevel around every stone. This is the real narrow
        // edge of a continuous body; sharp tips cannot keep a broad flat center.
        h *= smooth(-2, 16, dep + (t.field[i] < 0 ? 2 : 0));
        out.geometry[k + 2] = Math.round(clamp(h / KARST_SURFACE_HEIGHT) * 255);
        out.geometry[k + 3] = Math.round(growth * 255);
        const range=t.generation==='legacy'?KARST_SURFACE_UV:KARST_CHAMBER_UV;
        pack(u, out.coordinates, k,range); pack(v, out.coordinates, k + 2,range);
        out.geology[k] = Math.round(clamp(family / 3) * 255);
        out.geology[k + 1] = Math.round(clamp(tint) * 255);
        out.geology[k + 2] = Math.round(clamp(growth) * 255);
        out.geology[k + 3] = Math.round(clamp(face) * 255);
    }
    out.bakeMs = Date.now() - start; cache.set(t, out); return out;
}
export function releaseKarstSurfaceData(t: KarstTerrain) { cache.delete(t); }
export function sampleKarstSurface(t: KarstTerrain, x: number, y: number) {
    const s = getKarstSurface(t), u = (x - t.x) / t.step, v = (y - t.y) / t.step;
    const c = Math.max(0, Math.min(t.cols - 1, Math.round(u))), r = Math.max(0, Math.min(t.rows - 1, Math.round(v))), k = (r * t.cols + c) * 4;
    const range=t.generation==='legacy'?KARST_SURFACE_UV:KARST_CHAMBER_UV;
    return { height: s.geometry[k + 2] / 255 * KARST_SURFACE_HEIGHT, family: s.geology[k] / 255 * 3,
        tint: s.geology[k + 1] / 255, growth: s.geology[k + 2] / 255,
        u: (s.coordinates[k] * 256 + s.coordinates[k + 1]) / 65535 * range - range * .5,
        v: (s.coordinates[k + 2] * 256 + s.coordinates[k + 3]) / 65535 * range - range * .5,
        solid: sampleKarst(t, x, y) < 0 };
}
