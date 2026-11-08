import { getRopeNet, pointOnStrand, projectOntoStrand } from './RopeNet';
import type { RopePoint } from './RopeNet';
import type { TetherLine } from './InteractionTypes';

const EPS = .035;
const distance = (a: RopePoint, b: RopePoint) => Math.hypot(a.x - b.x, a.y - b.y);
export interface RopeNode extends RopePoint { id: number; pinned: boolean; wall?: any; external?: boolean }
export interface RopeSpan {
    rope: any; from: number; to: number; path: RopePoint[]; start: RopeNode; end: RopeNode;
}
export interface RopeTopology { ropes: any[]; nodes: RopeNode[]; spans: RopeSpan[] }
export interface RopeRemovalPlan {
    topology: RopeTopology; selected: RopeSpan[]; removed: RopeSpan[]; kept: RopeSpan[]; links?: TetherLine[];
}
const cache = new WeakMap<any[], { key: string; topology: RopeTopology }>();

export function ropePathPosition(path: RopePoint[], point: RopePoint) {
    let at = 0, best = Infinity, total = 0;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], q = projectOntoStrand(point, a, b), d = distance(q, point);
        if (d < best) { at = total + distance(a, q); best = d; }
        total += distance(a, b);
    }
    return { at, distance: best, length: total };
}
function atPath(path: RopePoint[], value: number) {
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], length = distance(a, b);
        if (value <= length || i === path.length - 1) {
            const t = Math.max(0, Math.min(1, value / (length || 1)));
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
        value -= length;
    }
    return { ...path[0] };
}
export function ropePathSlice(path: RopePoint[], from: number, to: number) {
    const points = [atPath(path, from)]; let travelled = 0;
    for (let i = 1; i < path.length; i++) {
        travelled += distance(path[i - 1], path[i]);
        if (travelled > from + EPS && travelled < to - EPS) points.push({ ...path[i] });
    }
    points.push(atPath(path, to)); return points;
}

export function getRopeTopology(ropes: any[], attachments: { rope: any; point: RopePoint }[] = []): RopeTopology {
    const key = attachments.map(a => `${ropes.indexOf(a.rope)}:${a.point.x.toFixed(2)}:${a.point.y.toFixed(2)}`).join('|');
    const old = cache.get(ropes); if (old?.key === key) return old.topology;
    const nodes: RopeNode[] = [], spans: RopeSpan[] = [], net = getRopeNet(ropes);
    const nodeAt = (point: RopePoint, pinned = false, wall?: any, external = false) => {
        let node = nodes.find(n => distance(n, point) <= EPS);
        if (!node) { node = { ...point, id: nodes.length, pinned, wall, external }; nodes.push(node); }
        else { node.pinned ||= pinned; node.wall ||= wall; node.external ||= external; }
        return node;
    };
    ropes.forEach((rope, index) => {
        const path: RopePoint[] = rope.path; if (!path?.length || path.length < 2) return;
        const length = ropePathPosition(path, path[path.length - 1]).length;
        const marks = [{ at: 0, node: nodeAt(path[0], !rope.startOnRope && !rope.startLoose, rope.startWall) },
            { at: length, node: nodeAt(path[path.length - 1], !rope.endOnRope && !rope.endLoose, rope.endWall) }];
        const add = (point: RopePoint, external = false) => {
            const location = ropePathPosition(path, point);
            if (location.distance <= EPS) marks.push({ at: location.at, node: nodeAt(point, external, undefined, external) });
        };
        for (const knot of net.knots) if (knot.ropes.has(index)) add(knot);
        for (const attachment of attachments) if (attachment.rope === rope) add(attachment.point, true);
        marks.sort((a, b) => a.at - b.at);
        const unique = marks.filter((m, i) => !i || m.at - marks[i - 1].at > EPS);
        for (let i = 1; i < unique.length; i++) spans.push({ rope, from: unique[i - 1].at, to: unique[i].at,
            path: ropePathSlice(path, unique[i - 1].at, unique[i].at), start: unique[i - 1].node, end: unique[i].node });
    });
    const topology = { ropes, nodes, spans }; cache.set(ropes, { key, topology }); return topology;
}

export function ropeSpanAt(topology: RopeTopology, rope: any, point: RopePoint, angle = 0): RopeSpan | null {
    const location = ropePathPosition(rope.path, point); if (location.distance > .1) return null;
    const candidates = topology.spans.filter(s => s.rope === rope && location.at >= s.from - EPS && location.at <= s.to + EPS);
    if (candidates.length <= 1) return candidates[0] || null;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    candidates.sort((a, b) => {
        const middle = (s: RopeSpan) => atPath(s.path, (s.to - s.from) / 2);
        const pa = middle(a), pb = middle(b);
        return (pb.x - point.x) * dx + (pb.y - point.y) * dy - (pa.x - point.x) * dx - (pa.y - point.y) * dy;
    });
    return candidates[0];
}

/** Intentionally remove the whole connected weave. Disconnected guides/nets
 * survive unchanged, so no dangling tip, collapsed loop or guessed tension remains. */
export function planRopeRemoval(topology:RopeTopology,selected:RopeSpan[]):RopeRemovalPlan{
    const net=getRopeNet(topology.ropes),origins=new Set<any>();
    for(const span of selected){
        origins.add(span.rope);
        const group=net.groups.get(topology.ropes.indexOf(span.rope));
        for(const index of group?.indices||[])origins.add(topology.ropes[index]);
    }
    return{topology,selected,kept:topology.spans.filter(s=>!origins.has(s.rope)),removed:topology.spans.filter(s=>origins.has(s.rope))};
}

/** The reference plan remains valid only while all source ropes are present. */
export function isRemovalPlanValid(plan: RopeRemovalPlan, ropes: any[]) {
    return plan.topology.ropes === ropes && plan.selected.length > 0 && plan.selected.every(s => ropes.includes(s.rope));
}
export function pointOnRopeSpan(point: RopePoint, span: RopeSpan) {
    return span.path.slice(1).some((b, i) => pointOnStrand(point, span.path[i], b));
}
