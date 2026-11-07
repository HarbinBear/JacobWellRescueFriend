import { projectOntoStrand, sweepRopeNet } from './RopeNet';
import type { RopeGroup, RopeHit, RopeNet, RopePoint } from './RopeNet';

export type NetContactKind = 'glide' | 'rebound' | 'snag';
export interface RopeBody extends RopePoint {
    vx: number;
    vy: number;
    kind?: 'curious' | 'piranha' | 'provoked' | 'rammer' | 'shoal';
    angle?: number;
}
export interface NetApproach extends RopePoint {
    kind: NetContactKind;
    nx: number;
    ny: number;
    density: number;
    strength: number;
}
export interface NetContactView extends NetApproach {
    phase: number;
    pull: number;
    escape: number;
    threads: number;
}

interface NetPull {
    group: RopeGroup;
    point: RopePoint;
    nx: number;
    ny: number;
    amount: number;
    velocity: number;
    width: number;
    driven: boolean;
    age: number;
}
interface Contact extends NetApproach {
    pull: NetPull;
    phase: number;
    escape: number;
    depth: number;
    speed: number;
    side: number;
    gap: number;
    cooldown: number;
    surface: RopePoint;
    fish?: {
        threads: Map<number, { point: RopePoint; lastSeen: number; across: boolean }>;
        entry: RopePoint | null;
        grip: number;
        emptyFrames: number;
    };
}
interface Motion {
    contacts: WeakMap<RopeBody, Contact>;
    pulls: NetPull[];
}
const motionByNet = new WeakMap<RopeNet, Motion>();
const densityRadius = 86;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const unit = (n: number) => clamp(n, 0, 1);

function motionFor(net: RopeNet): Motion {
    let motion = motionByNet.get(net);
    if (!motion) {
        motion = { contacts: new WeakMap(), pulls: [] };
        motionByNet.set(net, motion);
    }
    return motion;
}

export function resetNetMotion(net: RopeNet) {
    motionByNet.delete(net);
}

function densityAt(group: RopeGroup, point: RopePoint, nx: number, ny: number): number {
    let density = .045;
    for (const knot of group.knots) {
        density += Math.max(0, 1 - Math.hypot(point.x - knot.x, point.y - knot.y) / densityRadius) * .16;
        if (density >= 1) return 1;
    }
    for (const { a, b } of group.strands) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
        const dx = point.x - a.x, dy = point.y - a.y;
        const distance = Math.abs(dx * uy - dy * ux);
        if (distance >= densityRadius) continue;
        const halfChord = Math.sqrt(densityRadius * densityRadius - distance * distance);
        const along = dx * ux + dy * uy;
        const localLength = Math.max(0, Math.min(len, along + halfChord) - Math.max(0, along - halfChord));
        const across = .35 + .65 * Math.abs(nx * uy - ny * ux);
        density += .14 * localLength / (2 * densityRadius) * (1 - distance / densityRadius) * across;
        if (density >= 1) return 1;
    }
    return density;
}

function response(net: RopeNet, hit: RopeHit, vx: number, vy: number, referenceSpeed: number): NetApproach {
    const nx = -hit.nx, ny = -hit.ny;
    const density = densityAt(net.groups.get(hit.rope)!, hit.point, nx, ny);
    const speed = Math.max(0, vx * nx + vy * ny);
    const load = density * (.12 + .98 * Math.min(1.7, speed / referenceSpeed));
    return { ...hit.surface, nx, ny, density, strength: unit(load), kind: load < .50 ? 'glide' : load < .84 ? 'rebound' : 'snag' };
}

function movingNetHit(net: RopeNet, from: RopePoint, to: RopePoint, radius: number) {
    const hasLoad = !!motionByNet.get(net)?.pulls.length;
    return sweepRopeNet(net, from, to, radius, hasLoad ? (p, i) => deformNetPoint(net, p, i) : undefined);
}

export function netResponseAlong(net: RopeNet, from: RopePoint, to: RopePoint, radius: number, vx: number, vy: number, referenceSpeed: number, swimmer?: RopeBody) {
    const hit = movingNetHit(net, from, to, radius);
    if (!hit) return null;
    const result = response(net, hit, vx, vy, referenceSpeed);
    if (swimmer?.kind) {
        const threads = touchedFishThreads(net, { ...swimmer, ...to }, from, radius, net.groups.get(hit.rope));
        const crossing = Array.from(threads.values()).filter(thread => thread.across).length;
        result.kind = threads.size >= fishProfiles[swimmer.kind].required && crossing >= 2 ? 'snag' : 'glide';
    }
    return {
        ...result,
        ropeIndex: hit.rope,
        entry: { x: from.x + (to.x - from.x) * hit.time, y: from.y + (to.y - from.y) * hit.time },
    };
}

export function stepNetMotion(net: RopeNet) {
    const motion = motionByNet.get(net);
    if (!motion) return;
    for (let i = motion.pulls.length - 1; i >= 0; i--) {
        const pull = motion.pulls[i];
        pull.age++;
        if (pull.driven && pull.age < 2) continue;
        pull.driven = false;
        pull.velocity = (pull.velocity - pull.amount * .044) * .9;
        pull.amount += pull.velocity;
        if (Math.abs(pull.amount) + Math.abs(pull.velocity) < .09) motion.pulls.splice(i, 1);
    }
}

export function deformNetPoint(net: RopeNet, point: RopePoint, ropeIndex: number): RopePoint {
    const group = net.groups.get(ropeIndex), motion = motionByNet.get(net);
    if (!group || !motion?.pulls.length) return point;
    let dx = 0, dy = 0;
    for (const pull of motion.pulls) {
        if (pull.group !== group) continue;
        const distance = Math.hypot(point.x - pull.point.x, point.y - pull.point.y);
        const falloff = 1 - distance / pull.width;
        if (falloff <= 0) continue;
        const deflection = pull.amount * falloff * falloff * (3 - 2 * falloff);
        dx += pull.nx * deflection;
        dy += pull.ny * deflection;
    }
    if (Math.abs(dx) + Math.abs(dy) < .001) return point;
    let pin = 1;
    for (const anchor of group.pins) pin = Math.min(pin, Math.hypot(point.x - anchor.x, point.y - anchor.y) / 25);
    const scale = Math.min(pin, 48 / (Math.hypot(dx, dy) || 1));
    return { x: point.x + dx * scale, y: point.y + dy * scale };
}

export function applyNetBodyImpulse(net: RopeNet, body: RopeBody, vx: number, vy: number) {
    body.vx += vx;
    body.vy += vy;
    const contact = motionByNet.get(net)?.contacts.get(body);
    if (!contact || contact.cooldown > 0 || contact.kind === 'glide') return;
    const force = vx * contact.nx + vy * contact.ny;
    contact.speed = clamp(contact.speed + force * .72, -10, 14);
    contact.pull.velocity += force * .2;
    if (force < 0) contact.escape = unit(contact.escape - force * .025);
}

export function viewNetContact(net: RopeNet, body: RopeBody): NetContactView | null {
    const contact = motionByNet.get(net)?.contacts.get(body);
    if (!contact || contact.cooldown > 0) return null;
    const { kind, density, strength, phase, escape, nx, ny, pull } = contact;
    const point = deformNetPoint(net, pull.point, pull.group.indices.values().next().value);
    return { ...point, kind, density, strength, nx, ny, phase, escape, pull: unit(pull.amount / 36), threads: contact.fish?.threads.size || 1 };
}

function release(contact: Contact, body: RopeBody, impulse: number) {
    contact.cooldown = 12;
    contact.pull.driven = false;
    contact.pull.velocity = -Math.min(5.2, 1 + contact.pull.amount * .17);
    const sideSpeed = body.vy * contact.nx - body.vx * contact.ny;
    body.vx = -contact.nx * impulse - contact.ny * sideSpeed;
    body.vy = -contact.ny * impulse + contact.nx * sideSpeed;
}

const fishProfiles = {
    curious: { tail: 20, retain: 45, required: 3, gripFrames: 7 },
    piranha: { tail: 28, retain: 50, required: 3, gripFrames: 5 },
    provoked: { tail: 46, retain: 70, required: 4, gripFrames: 4 },
    rammer: { tail: 44, retain: 64, required: 4, gripFrames: 3 },
    shoal: { tail: 12, retain: 30, required: 3, gripFrames: 8 },
};

function segmentDistance(a: RopePoint, b: RopePoint, c: RopePoint, d: RopePoint): number {
    const ax = b.x - a.x, ay = b.y - a.y, bx = d.x - c.x, by = d.y - c.y;
    const det = ax * by - ay * bx;
    if (Math.abs(det) > 1e-7) {
        const dx = c.x - a.x, dy = c.y - a.y;
        const t = (dx * by - dy * bx) / det, u = (dx * ay - dy * ax) / det;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
    }
    const distances = [[a, c, d], [b, c, d], [c, a, b], [d, a, b]].map(([p, x, y]) => {
        const q = projectOntoStrand(p, x, y);
        return Math.hypot(p.x - q.x, p.y - q.y);
    });
    return Math.min(...distances);
}

// Count separate ropes actually crossed by the body and trailing fins, including
// their current deformation. Subdividing a rope never adds extra entanglement.
function touchedFishThreads(net: RopeNet, body: RopeBody, from: RopePoint, radius: number, group?: RopeGroup) {
    const profile = fishProfiles[body.kind!];
    const angle = body.angle ?? Math.atan2(body.y - from.y, body.x - from.x);
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const tail = { x: from.x - ux * profile.tail, y: from.y - uy * profile.tail };
    const nose = { x: body.x + ux * 5, y: body.y + uy * 5 };
    const reach = radius * .78 + 2;
    const threads = new Map<number, { point: RopePoint; across: boolean }>();
    const loaded = !!motionByNet.get(net)?.pulls.length;
    const padding = reach + (loaded ? 48 : 0);
    for (const strand of group?.strands || net.strands) {
        if (!net.woven.has(strand.rope) || threads.has(strand.rope)) continue;
        const { a, b, rope } = strand;
        if (Math.max(a.x, b.x) < Math.min(tail.x, nose.x) - padding || Math.min(a.x, b.x) > Math.max(tail.x, nose.x) + padding ||
            Math.max(a.y, b.y) < Math.min(tail.y, nose.y) - padding || Math.min(a.y, b.y) > Math.max(tail.y, nose.y) + padding) continue;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const across = Math.abs(ux * (b.y - a.y) - uy * (b.x - a.x)) / length > .45;
        if (!loaded) {
            if (segmentDistance(tail, nose, a, b) <= reach) threads.set(rope, { point: projectOntoStrand(body, a, b), across });
            continue;
        }
        // Only pose a small portion of long ropes around the fish.
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const q = projectOntoStrand(body, a, b);
        const middle = Math.hypot(q.x - a.x, q.y - a.y) / len;
        const span = (profile.tail + padding + Math.hypot(body.x - from.x, body.y - from.y)) / len;
        const start = Math.max(0, middle - span), end = Math.min(1, middle + span);
        const pieces = Math.max(1, Math.ceil((end - start) * len / 8));
        let previous = deformNetPoint(net, { x: a.x + (b.x - a.x) * start, y: a.y + (b.y - a.y) * start }, rope);
        for (let i = 1; i <= pieces; i++) {
            const t = start + (end - start) * i / pieces;
            const rest = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            const posed = deformNetPoint(net, rest, rope);
            if (segmentDistance(tail, nose, previous, posed) <= reach) { threads.set(rope, { point: q, across }); break; }
            previous = posed;
        }
    }
    return threads;
}

function gatherFish(net: RopeNet, motion: Motion, body: RopeBody, from: RopePoint, radius: number,
    canOccupy: (x: number, y: number) => boolean, current?: Contact): NetContactKind | null {
    const profile = fishProfiles[body.kind!];
    const touched = touchedFishThreads(net, body, from, radius, current?.pull.group);
    if (!current && !touched.size) return null;
    let contact = current;
    if (!contact) {
        const [rope, first] = touched.entries().next().value;
        const point = first.point;
        const dx = body.x - from.x, dy = body.y - from.y, speed = Math.hypot(dx, dy);
        const nx = speed > .01 ? dx / speed : Math.cos(body.angle || 0);
        const ny = speed > .01 ? dy / speed : Math.sin(body.angle || 0);
        const group = net.groups.get(rope)!;
        const surface = deformNetPoint(net, point, rope);
        const pull: NetPull = { group, point, nx, ny, width: 72, amount: 0, velocity: 0, driven: true, age: 0 };
        contact = {
            ...surface, kind: 'glide', nx, ny, density: densityAt(group, point, nx, ny), strength: 0,
            phase: 0, escape: 0, pull, depth: 0, speed, side: 0, gap: 0, cooldown: 0, surface,
            fish: { threads: new Map(), entry: null, grip: 0, emptyFrames: 0 },
        };
        motion.contacts.set(body, contact);
        motion.pulls.push(pull);
    }
    const fish = contact.fish!;
    contact.phase++;
    for (const [rope, thread] of touched) {
        if (net.groups.get(rope) !== contact.pull.group) continue;
        fish.threads.set(rope, { ...thread, lastSeen: contact.phase });
        if (thread.across && !fish.entry) fish.entry = deformNetPoint(net, thread.point, rope);
    }
    for (const [rope, thread] of fish.threads) {
        const p = deformNetPoint(net, thread.point, rope);
        if (contact.phase - thread.lastSeen > 18 || Math.hypot(body.x - p.x, body.y - p.y) > profile.retain) fish.threads.delete(rope);
    }
    fish.emptyFrames = touched.size ? 0 : fish.emptyFrames + 1;
    if (!fish.threads.size || fish.emptyFrames > 12) {
        contact.pull.driven = false;
        motion.contacts.delete(body);
        return null;
    }
    const coverage = unit(fish.threads.size / profile.required);
    const dx = body.x - from.x, dy = body.y - from.y;
    const drag = .035 + coverage * .13;
    const x = body.x - dx * drag, y = body.y - dy * drag;
    if (canOccupy(x, y)) { body.x = x; body.y = y; }
    body.vx *= 1 - drag; body.vy *= 1 - drag;
    const pull = contact.pull;
    const points = Array.from(fish.threads.values(), thread => thread.point);
    const centre = {
        x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
        y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    };
    pull.point = { x: pull.point.x + (centre.x - pull.point.x) * .24, y: pull.point.y + (centre.y - pull.point.y) * .24 };
    contact.surface = deformNetPoint(net, pull.point, pull.group.indices.values().next().value);
    contact.x = contact.surface.x; contact.y = contact.surface.y;
    contact.strength = coverage * contact.density;
    pull.driven = true; pull.age = 0;
    const travelled = Math.max(0, (body.x - contact.surface.x) * contact.nx + (body.y - contact.surface.y) * contact.ny + radius);
    const flex = Math.min(23, 2 + travelled * .43 + coverage * 5);
    pull.amount += (flex - pull.amount) * .3;
    const crossings = Array.from(fish.threads.values()).filter(thread => thread.across).length;
    const entered = fish.entry && (body.x - fish.entry.x) * contact.nx + (body.y - fish.entry.y) * contact.ny > radius * .6;
    const engaged = fish.threads.size >= profile.required && crossings >= 2 && entered;
    // A burst threads through several layers within a few frames. Scale the
    // tightening by distance travelled so it catches inside the mesh as well.
    const tightening = clamp(Math.hypot(dx, dy) / 3, .5, 2.5);
    fish.grip = Math.max(0, fish.grip + (engaged ? tightening : -.6));
    if (fish.grip < profile.gripFrames) return 'glide';

    // Re-anchor the pocket around all engaged ropes, keeping the fish's current
    // position continuous as the fins tighten the mesh around it.
    pull.point = centre;
    const surface = deformNetPoint(net, pull.point, pull.group.indices.values().next().value);
    contact.x = surface.x; contact.y = surface.y; contact.surface = surface;
    contact.depth = Math.max(12, pull.amount);
    contact.gap = contact.depth - ((body.x - surface.x) * contact.nx + (body.y - surface.y) * contact.ny);
    contact.side = (body.y - surface.y) * contact.nx - (body.x - surface.x) * contact.ny;
    contact.speed = Math.min(3.2, Math.max(0, body.vx * contact.nx + body.vy * contact.ny));
    contact.strength = Math.max(.65, coverage * contact.density);
    contact.kind = 'snag'; contact.phase = 0;
    return 'snag';
}

export function moveThroughNet(
    net: RopeNet, body: RopeBody, from: RopePoint, radius: number, referenceSpeed: number,
    intent: RopePoint, canOccupy: (x: number, y: number) => boolean,
): NetContactKind | null {
    if (!net.woven.size) return null;
    const motion = motionFor(net);
    let contact = motion.contacts.get(body);
    const dx = body.x - from.x, dy = body.y - from.y;
    if (contact?.cooldown > 0) {
        if (--contact.cooldown === 0) motion.contacts.delete(body);
        return null;
    }
    if (body.kind && (!contact || contact.kind === 'glide')) {
        return gatherFish(net, motion, body, from, radius, canOccupy, contact);
    }
    if (!contact) {
        const hit = movingNetHit(net, from, body, radius);
        if (!hit) return null;
        const impact = response(net, hit, dx, dy, referenceSpeed);
        const speed = Math.max(0, dx * impact.nx + dy * impact.ny);
        const pull: NetPull = {
            group: net.groups.get(hit.rope)!, point: hit.point, nx: impact.nx, ny: impact.ny,
            width: 55 + impact.density * 49, amount: 0, velocity: 0, driven: true, age: 0,
        };
        contact = {
            ...impact, pull, surface: hit.surface, phase: 0, escape: 0, depth: -speed * hit.time,
            speed, side: 0, gap: -((from.x - hit.surface.x) * impact.nx + (from.y - hit.surface.y) * impact.ny) - speed * hit.time,
            cooldown: 0,
        };
        motion.contacts.set(body, contact);
        motion.pulls.push(pull);
    }
    contact.phase++;
    const { kind, nx, ny, density, strength, phase, pull } = contact;
    const inward = dx * nx + dy * ny;
    if (kind === 'glide') {
        // Drag acts in the direction crossing the strand. Leave lateral swimming intact.
        const drag = inward * (.08 + density * .34) * Math.max(0, 1 - (phase - 1) / 7);
        const x = body.x - drag * nx, y = body.y - drag * ny;
        if (canOccupy(x, y)) { body.x = x; body.y = y; }
        body.vx -= drag * nx;
        body.vy -= drag * ny;
        if (phase === 1) { pull.amount = 3 + strength * 13; pull.velocity = Math.min(3.4, inward * .35); }
        pull.driven = false;
        const distance = (body.x - contact.x) * nx + (body.y - contact.y) * ny;
        if (Math.abs(distance) > radius + 8 || phase >= 54) {
            contact.cooldown = 3;
        }
        return kind;
    }

    const effort = clamp((intent.x * nx + intent.y * ny) / 8, -1, 1);
    const sideEffort = clamp((intent.y * nx - intent.x * ny) / 8, -1, 1);
    const snagged = kind === 'snag';
    const target = snagged ? radius + 11 + 10 * density : 0;
    const slack = snagged ? 0 : 8;
    const displacement = snagged ? contact.depth - target : Math.max(0, contact.depth - slack);
    contact.speed = clamp((contact.speed - displacement * (.048 + .037 * density) + effort * (snagged ? .26 : .3)) * .88, -10, 14);
    const previousDepth = contact.depth;
    contact.depth = Math.min(43, contact.depth + contact.speed);
    const limit = snagged ? radius * .85 : 34;
    contact.side = clamp(contact.side + (dy * nx - dx * ny) * (snagged ? .16 : .6), -limit, limit);
    const tug = snagged && phase > 7 ? Math.sin(phase * .66) * (1.4 + Math.abs(sideEffort) * 2.8) : 0;
    const x = contact.surface.x + nx * (contact.depth - contact.gap) - ny * (contact.side + tug);
    const y = contact.surface.y + ny * (contact.depth - contact.gap) + nx * (contact.side + tug);
    if (canOccupy(x, y)) {
        body.x = x;
        body.y = y;
        body.vx = x - from.x;
        body.vy = y - from.y;
    } else {
        body.x = from.x;
        body.y = from.y;
        body.vx = body.vy = 0;
        contact.depth = previousDepth;
        contact.speed *= -.24;
    }
    pull.amount = Math.max(0, contact.depth) * .96 + tug * .46;
    pull.velocity = 0;
    pull.age = 0;
    pull.driven = true;
    if (snagged) {
        const backingOut = Math.max(0, -effort);
        const loosen = contact.fish ? .0028 + .006 * backingOut + .004 * Math.abs(sideEffort)
            : .007 - .003 * density + (.034 - .012 * density) * backingOut + .014 * Math.abs(sideEffort);
        contact.escape = unit(contact.escape + loosen);
        if (contact.escape >= 1) release(contact, body, contact.fish ? 2.2 + strength * 1.5 : 6 + strength * 3);
    } else if ((phase >= 5 && contact.depth < -.5) || phase >= 36 || Math.abs(contact.side) >= 33) {
        release(contact, body, clamp(-contact.speed, 2.2, 7));
    }
    return kind;
}
