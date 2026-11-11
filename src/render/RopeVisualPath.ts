import { pointOnStrand } from '../logic/RopeNet';
import type { RopeNet, RopePoint } from '../logic/RopeNet';

// Include each junction in the sampled lines. Every branch then has the same
// position at the junction while the impact travels through the net.
const cachedPaths = new WeakMap<RopeNet, Map<number, RopePoint[]>>();
export function getWovenPath(net: RopeNet, index: number, path: RopePoint[]): RopePoint[];
export function getWovenPath(net: RopeNet, index: number, path: RopePoint[], maxPoints: number): RopePoint[] | null;
export function getWovenPath(net: RopeNet, index: number, path: RopePoint[], maxPoints = Infinity): RopePoint[] | null {
    let cache = cachedPaths.get(net);
    if (!cache) { cache = new Map(); cachedPaths.set(net, cache); }
    const existing = cache.get(index);
    if (existing) return existing.length <= maxPoints ? existing : null;
    const knots = net.knots.filter(knot => knot.ropes.has(index));
    const sampled = [path[0]];
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const inner = knots.filter(knot => pointOnStrand(knot, a, b));
        inner.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
        for (const end of [...inner, b]) {
            const start = sampled[sampled.length - 1];
            const distance = Math.hypot(end.x - start.x, end.y - start.y);
            if (distance < .01) continue;
            const pieces = Math.ceil(distance / 8);
            if (sampled.length + pieces > maxPoints) return null;
            for (let step = 1; step < pieces; step++) {
                const t = step / pieces;
                sampled.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
            }
            sampled.push(end);
        }
    }
    cache.set(index, sampled);
    return sampled;
}

