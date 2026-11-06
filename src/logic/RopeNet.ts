export interface RopePoint { x: number; y: number }
export interface NetRope {
    path: RopePoint[];
    startOnRope?: boolean;
    endOnRope?: boolean;
}

const KNOT_EPSILON = 0.025;
const STRAND_RADIUS = 2;
const KNOT_RADIUS = 5;
const MAX_POSE_OFFSET = 48;
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

export function projectOntoStrand(p: RopePoint, a: RopePoint, b: RopePoint): RopePoint {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
    return { x: a.x + dx * t, y: a.y + dy * t };
}

export function pointOnStrand(p: RopePoint, a: RopePoint, b: RopePoint): boolean {
    const q = projectOntoStrand(p, a, b);
    return Math.hypot(p.x - q.x, p.y - q.y) <= KNOT_EPSILON;
}

interface Strand { a: RopePoint; b: RopePoint; rope: number }
interface Knot extends RopePoint { ropes: Set<number> }
export interface RopeGroup { indices: Set<number>; strands: Strand[]; knots: Knot[]; pins: RopePoint[] }
export interface RopeNet {
    strands: Strand[];
    knots: Knot[];
    woven: Set<number>;
    groups: Map<number, RopeGroup>;
}
const nets = new WeakMap<NetRope[], { length: number; net: RopeNet }>();
const collisionBounds = new WeakMap<RopeNet, { left: number; right: number; top: number; bottom: number }>();

function crossing(a: Strand, b: Strand): RopePoint | null {
    const ax = a.b.x - a.a.x, ay = a.b.y - a.a.y;
    const bx = b.b.x - b.a.x, by = b.b.y - b.a.y;
    const det = cross(ax, ay, bx, by);
    if (Math.abs(det) < 1e-6) return null;
    const dx = b.a.x - a.a.x, dy = b.a.y - a.a.y;
    const t = cross(dx, dy, bx, by) / det, u = cross(dx, dy, ax, ay) / det;
    if (t < -1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) return null;
    return { x: a.a.x + ax * t, y: a.a.y + ay * t };
}

export function getRopeNet(ropes: NetRope[]): RopeNet {
    const cached = nets.get(ropes);
    if (cached?.length === ropes.length) return cached.net;
    const strands: Strand[] = [], knots: Knot[] = [];
    const woven = new Set<number>();
    ropes.forEach((rope, index) => {
        const path = rope.path || [];
        for (let i = 1; i < path.length; i++) {
            const a = path[i - 1], b = path[i];
            if (Math.hypot(a.x - b.x, a.y - b.y) > KNOT_EPSILON) strands.push({ a, b, rope: index });
        }
    });
    const knotBins = new Map<string, number[]>();
    const join = (p: RopePoint, a: number, b: number) => {
        let index = knots.length;
        // An epsilon-sized search visits only the one-pixel bins touching the point.
        for (let x = Math.floor(p.x - KNOT_EPSILON); x <= Math.floor(p.x + KNOT_EPSILON); x++) {
            for (let y = Math.floor(p.y - KNOT_EPSILON); y <= Math.floor(p.y + KNOT_EPSILON); y++) {
                const candidates = knotBins.get(`${x}:${y}`);
                if (!candidates) continue;
                for (const candidate of candidates) {
                    const knot = knots[candidate];
                    if (candidate < index && Math.hypot(p.x - knot.x, p.y - knot.y) <= KNOT_EPSILON) index = candidate;
                }
            }
        }
        if (index === knots.length) {
            const cell = `${Math.floor(p.x)}:${Math.floor(p.y)}`;
            const candidates = knotBins.get(cell);
            if (candidates) candidates.push(index);
            else knotBins.set(cell, [index]);
            knots.push({ ...p, ropes: new Set() });
        }
        const knot = knots[index];
        knot.ropes.add(a); knot.ropes.add(b);
        woven.add(a); woven.add(b);
    };
    const isTip = (p: RopePoint, rope: NetRope) =>
        [rope.path[0], rope.path[rope.path.length - 1]].some(q => Math.hypot(p.x - q.x, p.y - q.y) <= KNOT_EPSILON);

    for (let i = 0; i < strands.length; i++) {
        const a = strands[i];
        for (let j = i + 1; j < strands.length; j++) {
            const b = strands[j];
            if (a.rope === b.rope) continue;
            const p = crossing(a, b);
            // Two wall anchors sharing a tip do not create a junction in the water.
            if (p && !(isTip(p, ropes[a.rope]) && isTip(p, ropes[b.rope]))) join(p, a.rope, b.rope);
        }
    }
    ropes.forEach((rope, index) => {
        const ends = [rope.startOnRope && rope.path[0], rope.endOnRope && rope.path[rope.path.length - 1]];
        for (const p of ends) {
            if (!p) continue;
            for (const s of strands) {
                if (s.rope !== index && pointOnStrand(p, s.a, s.b)) join(p, index, s.rope);
            }
        }
    });
    const groups = new Map<number, RopeGroup>();
    const links = new Map<number, Knot[]>();
    for (const knot of knots) {
        for (const index of knot.ropes) {
            if (!links.has(index)) links.set(index, []);
            links.get(index)!.push(knot);
        }
    }
    for (const index of woven) {
        if (groups.has(index)) continue;
        const group: RopeGroup = { indices: new Set([index]), strands: [], knots: [], pins: [] };
        const seenKnots = new Set<Knot>();
        for (const member of group.indices) {
            groups.set(member, group);
            for (const knot of links.get(member) || []) {
                seenKnots.add(knot);
                for (const neighbor of knot.ropes) group.indices.add(neighbor);
            }
            const rope = ropes[member], path = rope.path;
            if (!rope.startOnRope) group.pins.push(path[0]);
            if (!rope.endOnRope) group.pins.push(path[path.length - 1]);
            // A rope going around a rock bears against the bend as well as its nails.
            for (let i = 1; i < path.length - 1; i++) {
                if (!pointOnStrand(path[i], path[i - 1], path[i + 1])) group.pins.push(path[i]);
            }
        }
        group.knots = Array.from(seenKnots);
    }
    for (const strand of strands) groups.get(strand.rope)?.strands.push(strand);
    const net = { strands, knots, woven, groups };
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const { a, b, rope } of strands) {
        if (!woven.has(rope)) continue;
        bounds.left = Math.min(bounds.left, a.x, b.x);
        bounds.right = Math.max(bounds.right, a.x, b.x);
        bounds.top = Math.min(bounds.top, a.y, b.y);
        bounds.bottom = Math.max(bounds.bottom, a.y, b.y);
    }
    for (const knot of knots) {
        bounds.left = Math.min(bounds.left, knot.x);
        bounds.right = Math.max(bounds.right, knot.x);
        bounds.top = Math.min(bounds.top, knot.y);
        bounds.bottom = Math.max(bounds.bottom, knot.y);
    }
    collisionBounds.set(net, bounds);
    nets.set(ropes, { length: ropes.length, net });
    return net;
}

export interface RopeHit { time: number; nx: number; ny: number; point: RopePoint; surface: RopePoint; rope: number }
type StrandPose = (p: RopePoint, rope: number) => RopePoint;

// A moving circle against the sides and round caps of each strand, and against knots.
export function sweepRopeNet(net: RopeNet, from: RopePoint, to: RopePoint, radius: number, pose?: StrandPose): RopeHit | null {
    if (!net.woven.size) return null;
    const left = Math.min(from.x, to.x), right = Math.max(from.x, to.x);
    const top = Math.min(from.y, to.y), bottom = Math.max(from.y, to.y);
    const posePadding = pose ? MAX_POSE_OFFSET : 0;
    const knotPadding = radius + KNOT_RADIUS + posePadding;
    const bounds = collisionBounds.get(net);
    if (bounds && (right + knotPadding < bounds.left || left - knotPadding > bounds.right ||
        bottom + knotPadding < bounds.top || top - knotPadding > bounds.bottom)) return null;
    const dx = to.x - from.x, dy = to.y - from.y;
    const speedSquared = dx * dx + dy * dy;
    if (speedSquared < 1e-8) return null;
    let hit: RopeHit | null = null;
    const consider = (time: number, nx: number, ny: number, point: RopePoint, surface: RopePoint, rope: number) => {
        if (time >= 0 && time <= 1 && (!hit || time < hit.time) && dx * nx + dy * ny < -1e-6) {
            hit = { time, nx, ny, point, surface, rope };
        }
    };
    const circle = (p: RopePoint, r: number, rope: number, surface: RopePoint) => {
        const px = from.x - surface.x, py = from.y - surface.y;
        const b = px * dx + py * dy, c = px * px + py * py - r * r;
        const det = b * b - speedSquared * c;
        if (b >= 0 || det < 0) return;
        const t = Math.max(0, (-b - Math.sqrt(det)) / speedSquared);
        const x = px + dx * t, y = py + dy * t, len = Math.hypot(x, y);
        if (len > 1e-6) consider(t, x / len, y / len, p, surface, rope);
    };
    const r = radius + STRAND_RADIUS;
    const nearSweep = (a: RopePoint, b: RopePoint, padding: number) =>
        right + padding >= Math.min(a.x, b.x) && left - padding <= Math.max(a.x, b.x) &&
        bottom + padding >= Math.min(a.y, b.y) && top - padding <= Math.max(a.y, b.y);
    const test = (restA: RopePoint, restB: RopePoint, a: RopePoint, b: RopePoint, rope: number) => {
        if (!nearSweep(a, b, r)) return;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < .001) return;
        const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
        const px = from.x - a.x, py = from.y - a.y;
        const side = -px * uy + py * ux;
        const across = -dx * uy + dy * ux;
        if (side * across < 0) {
            const time = Math.max(0, (Math.sign(side) * r - side) / across);
            const along = (px + dx * time) * ux + (py + dy * time) * uy;
            if (along >= 0 && along <= len) {
                const t = along / len;
                consider(time, -uy * Math.sign(side), ux * Math.sign(side),
                    { x: restA.x + (restB.x - restA.x) * t, y: restA.y + (restB.y - restA.y) * t },
                    { x: a.x + ux * along, y: a.y + uy * along }, rope);
            }
        }
        circle(restA, r, rope, a);
        circle(restB, r, rope, b);
    };
    for (const { a, b, rope } of net.strands) {
        if (!net.woven.has(rope)) continue;
        if (!pose) { test(a, b, a, b, rope); continue; }
        const padding = r + posePadding;
        if (!nearSweep(a, b, padding)) continue;
        const spanX = b.x - a.x, spanY = b.y - a.y;
        let enter = 0, exit = 1;
        if (spanX !== 0) {
            const t1 = (left - padding - a.x) / spanX, t2 = (right + padding - a.x) / spanX;
            enter = Math.max(enter, Math.min(t1, t2));
            exit = Math.min(exit, Math.max(t1, t2));
        }
        if (spanY !== 0) {
            const t1 = (top - padding - a.y) / spanY, t2 = (bottom + padding - a.y) / spanY;
            enter = Math.max(enter, Math.min(t1, t2));
            exit = Math.min(exit, Math.max(t1, t2));
        }
        if (enter > exit + 1e-8) continue;
        // Preserve the strand's fixed 8 px sampling lattice so clipping cannot change its posed curve.
        const pieces = Math.ceil(Math.hypot(spanX, spanY) / 8);
        const first = Math.max(1, Math.ceil(enter * pieces - 1e-8));
        const last = Math.min(pieces, Math.floor(exit * pieces + 1e-8) + 1);
        const start = (first - 1) / pieces;
        let previous = first === 1 ? a : { x: a.x + spanX * start, y: a.y + spanY * start };
        let posedPrevious = pose(previous, rope);
        for (let i = first; i <= last; i++) {
            const t = i / pieces;
            const point = { x: a.x + spanX * t, y: a.y + spanY * t };
            const posed = pose(point, rope);
            test(previous, point, posedPrevious, posed, rope);
            previous = point;
            posedPrevious = posed;
        }
    }
    for (const knot of net.knots) {
        if (nearSweep(knot, knot, knotPadding)) {
            const rope = knot.ropes.values().next().value;
            circle(knot, radius + KNOT_RADIUS, rope, pose ? pose(knot, rope) : knot);
        }
    }
    return hit;
}
