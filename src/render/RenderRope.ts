import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { ctx } from './Canvas';
import { getRopeNet, pointOnStrand } from '../logic/RopeNet';
import type { RopePoint } from '../logic/RopeNet';
import { getRopeApproach, getRopeContact, getRopeDeformedPoint } from '../logic/Rope';
import { pathLength, samplePolyline, polylineNormal } from '../logic/Pathfinding';

function generateSlackRopePoints(basePath: any[], slackFactor: number, animTime: number): any[] {
    if(!basePath || basePath.length < 2) return basePath || [];
    if(state.screen==='mazeRescue' && state.mazeRescue?.caveRockRoom)return basePath;
    const totalLen = pathLength(basePath);
    if(totalLen < 1) return basePath;
    const segLen = CONFIG.ropeSegmentLength;
    const steps = Math.max(2, Math.ceil(totalLen / segLen));
    const dt = totalLen / steps;
    const time = animTime || 0;
    const points: any[] = [];
    for(let i=0; i<=steps; i++) {
        const t = i * dt;
        const fraction = totalLen > 0 ? t/totalLen : 0;
        const pos = samplePolyline(basePath, t);
        const norm = polylineNormal(basePath, t);
        const sagEnvelope = Math.sin(fraction * Math.PI);
        const sag = sagEnvelope * CONFIG.ropeSlackAmplitude * slackFactor;
        const gravity = sagEnvelope * CONFIG.ropeSlackGravity * slackFactor;
        const wave = Math.sin(fraction*Math.PI*2*CONFIG.ropeWaveFrequency + time*CONFIG.ropeWaveSpeed) * CONFIG.ropeWaveAmplitude * slackFactor * sagEnvelope;
        const drift = Math.sin(fraction*Math.PI*1.3 + time*CONFIG.ropeDriftSpeed + 0.5) * CONFIG.ropeDriftAmplitude * slackFactor * sagEnvelope;
        points.push({ x: pos.x + norm.x*(sag+wave+drift), y: pos.y + norm.y*(sag+wave+drift) + gravity });
    }
    return points;
}

function strokeRopeLine(points: any[], color: string, width: number, exact = false) {
    if(!points || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    if(exact || (state.screen==='mazeRescue' && state.mazeRescue?.caveRockRoom)){
        for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
    } else if(points.length === 2) {
        ctx.lineTo(points[1].x, points[1].y);
    } else {
        for(let i=1; i<points.length-1; i++) {
            let midX=(points[i].x+points[i+1].x)/2, midY=(points[i].y+points[i+1].y)/2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
    }
    ctx.stroke(); ctx.restore();
}

function drawNail(x: number, y: number, wallX: number, wallY: number) {
    ctx.save();
    let angle = Math.atan2(y-wallY, x-wallX);
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = CONFIG.ropeNailColor; ctx.fillRect(-2, -1.5, CONFIG.ropeNailRadius*2, 3);
    ctx.beginPath(); ctx.arc(0, 0, CONFIG.ropeNailRadius*0.6, 0, Math.PI*2);
    ctx.fillStyle = '#aaa'; ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
}

function drawKnot(x: number, y: number) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, CONFIG.ropeKnotRadius, 0, Math.PI*2);
    ctx.fillStyle = CONFIG.ropeKnotColor; ctx.fill();
    ctx.strokeStyle = 'rgba(180,170,120,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(150,140,100,0.6)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x-2,y-1); ctx.lineTo(x+2,y+1); ctx.moveTo(x-2,y+1); ctx.lineTo(x+2,y-1); ctx.stroke();
    ctx.restore();
}

function drawReelIndicator(x: number, y: number, angle: number) {
    ctx.save(); ctx.translate(x, y);
    let reelX = -Math.cos(angle)*12, reelY = -Math.sin(angle)*12;
    ctx.beginPath(); ctx.arc(reelX, reelY, CONFIG.ropeReelRadius, 0, Math.PI*2);
    ctx.fillStyle = CONFIG.ropeReelColor; ctx.fill();
    ctx.strokeStyle = 'rgba(160,150,110,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    let t = Date.now()/500;
    ctx.strokeStyle = 'rgba(230,220,170,0.5)'; ctx.lineWidth = 0.8;
    for(let i=0; i<3; i++) {
        let a = t + i*Math.PI*2/3;
        ctx.beginPath(); ctx.moveTo(reelX, reelY);
        ctx.lineTo(reelX+Math.cos(a)*CONFIG.ropeReelRadius*0.8, reelY+Math.sin(a)*CONFIG.ropeReelRadius*0.8); ctx.stroke();
    }
    ctx.restore();
}

type RopeNet = ReturnType<typeof getRopeNet>;
type RopeContact = NonNullable<ReturnType<typeof getRopeContact>>;
type ViewBounds = { left: number; right: number; top: number; bottom: number };

// Include each junction in the sampled lines. Every branch then has the same
// position at the junction while the impact travels through the net.
const cachedPaths = new WeakMap<RopeNet, Map<number, RopePoint[]>>();
function getWovenPath(net: RopeNet, index: number, path: RopePoint[]) {
    let cache = cachedPaths.get(net);
    if (!cache) { cache = new Map(); cachedPaths.set(net, cache); }
    const existing = cache.get(index);
    if (existing) return existing;
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

function visiblePoint(point: RopePoint, view: ViewBounds, pad: number) {
    return point.x >= view.left - pad && point.x <= view.right + pad &&
        point.y >= view.top - pad && point.y <= view.bottom + pad;
}

function visibleSegment(a: RopePoint, b: RopePoint, view: ViewBounds, pad: number) {
    return Math.max(a.x, b.x) >= view.left - pad && Math.min(a.x, b.x) <= view.right + pad &&
        Math.max(a.y, b.y) >= view.top - pad && Math.min(a.y, b.y) <= view.bottom + pad;
}

function strokeWovenPath(path: RopePoint[], ropeIndex: number, view: ViewBounds) {
    const pad = 68; // Make room for spring deflection outside the camera bounds.
    let previous: RopePoint | null = null;
    let maxDeflection = 0;
    let visible = false;
    ctx.save();
    ctx.beginPath();
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        if (!visibleSegment(a, b, view, pad)) { previous = null; continue; }
        if (!previous) {
            const first = getRopeDeformedPoint(a, ropeIndex);
            ctx.moveTo(first.x, first.y);
        }
        previous = getRopeDeformedPoint(b, ropeIndex);
        ctx.lineTo(previous.x, previous.y);
        maxDeflection = Math.max(maxDeflection, Math.hypot(b.x - previous.x, b.y - previous.y));
        visible = true;
    }
    if (visible) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = 4.2; ctx.strokeStyle = 'rgba(19,31,29,.82)'; ctx.stroke();
        ctx.lineWidth = 2.4; ctx.strokeStyle = '#9eab86'; ctx.stroke();
        ctx.lineWidth = 1.1;
        ctx.setLineDash?.([2, 3]);
        ctx.strokeStyle = `rgba(244,223,165,${.5 + .42 * Math.min(1, maxDeflection / 22)})`;
        ctx.stroke();
    }
    ctx.restore();
}

function drawNetKnot(x: number, y: number, connections: number, selected = false) {
    const radius = selected ? 5 : 3 + Math.min(2, (connections - 2) * .75);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-.48);
    ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * .76, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7b8063'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#273b34'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-radius * .68, -.9); ctx.quadraticCurveTo(0, -radius, radius * .65, -.6);
    ctx.moveTo(-radius * .66, 1.1); ctx.quadraticCurveTo(0, -radius * .34, radius * .65, 1.2);
    ctx.strokeStyle = '#c0bb88'; ctx.stroke();
    ctx.restore();
}

export function drawRopesWorld(left: number, right: number, top: number, bottom: number) {
    if (!state.rope) return;
    const view = { left, right, top, bottom };
    const time = Date.now() / 1000;
    const net = state.screen === 'mazeRescue' ? getRopeNet(state.rope.ropes) : null;
    for (const [i, rope] of state.rope.ropes.entries()) {
        if (!rope.path || rope.path.length < 2) continue;
        if (net?.woven.has(i)) strokeWovenPath(getWovenPath(net, i, rope.path), i, view);
        else if (rope.path.some((p, index) => index > 0 && visibleSegment(rope.path[index - 1], p, view, 24))) {
            strokeRopeLine(rope.path, CONFIG.ropeTightColor, CONFIG.ropeTightWidth, true);
        }
        for (const [point, wall] of [[rope.start, rope.startWall], [rope.end, rope.endWall]]) {
            if (!point || !wall || !visiblePoint(point, view, 12)) continue;
            drawNail(point.x, point.y, wall.x, wall.y);
            drawKnot(point.x, point.y);
        }
    }
    if (net) for (const knot of net.knots) {
        if (!visiblePoint(knot, view, 68)) continue;
        const point = getRopeDeformedPoint(knot, knot.ropes.values().next().value);
        drawNetKnot(point.x, point.y, knot.ropes.size);
    }
    const cur = state.rope.current;
    if (!state.rope.active || !cur?.start) return;
    const parent = cur.startOnRope && net?.strands.find(s => pointOnStrand(cur.start, s.a, s.b));
    const start = parent ? getRopeDeformedPoint(cur.start, parent.rope) : cur.start;
    if (cur.path?.length >= 2) {
        const previewPath = [start, ...cur.path.slice(1)];
        const visualPts = generateSlackRopePoints(previewPath, cur.slackFactor ?? 1, cur.time || time);
        strokeRopeLine(visualPts, CONFIG.ropeColor, CONFIG.ropeWidth);
    }
    if (cur.startOnRope) drawNetKnot(start.x, start.y, 2, true);
    if (cur.startWall) {
        drawNail(start.x, start.y, cur.startWall.x, cur.startWall.y);
        drawKnot(start.x, start.y);
    }
    if (player.y > 0) drawReelIndicator(player.x, player.y, player.angle);
}

/** Front part of the loaded strand, drawn over the body that is pulling it. */
export function drawRopeContactWorld(c: CanvasRenderingContext2D, body: RopePoint, contact: RopeContact | null, radius: number) {
    if (!contact) return;
    const caught = contact.kind === 'snag';
    const fading = caught ? 1 : Math.max(0, 1 - contact.phase / 19);
    const load = contact.strength * fading;
    if (load < .04) return;
    const sx = body.x - contact.x, sy = body.y - contact.y;
    const distance = Math.hypot(sx, sy);
    if (distance > radius * (caught ? 4 : 2.2)) return;
    const wiggle = caught ? Math.sin(contact.phase * .45) * (2 + 3 * contact.pull) : 0;
    const ax = contact.x + sx * (caught ? .68 : .28), ay = contact.y + sy * (caught ? .68 : .28);
    c.save();
    c.globalAlpha *= fading;
    if (caught || contact.kind === 'rebound') {
        c.lineWidth = .9;
        for (let i = 0; i < 3; i++) {
            const age = (contact.phase + i * 6) % 22 / 22;
            const x = body.x + Math.sin(i * 2.4 + age * 3) * radius * (.45 + age * .4);
            const y = body.y - radius * .45 - age * (13 + load * 9);
            c.beginPath(); c.arc(x, y, .75 + age * 1.8, 0, Math.PI * 2);
            c.strokeStyle = `rgba(176,219,205,${(1 - age) * load * .62})`; c.stroke();
        }
    }
    c.translate(ax, ay);
    c.rotate(Math.atan2(contact.ny, contact.nx));
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    const width = radius * (caught ? 1.58 : 1.02);
    const bulge = radius * (.2 + load * (caught ? .9 : .5));
    c.moveTo(-radius * .32, -width);
    c.bezierCurveTo(bulge, -width * .65, bulge + wiggle, width * .7, -radius * .32, width);
    if (caught) {
        c.moveTo(-radius * .62, -width * .97);
        c.bezierCurveTo(-radius * .43, -width * .55, bulge + wiggle, width * .55, radius * .7, width * .78);
    }
    c.lineWidth = 4.2; c.strokeStyle = '#26342d'; c.stroke();
    c.lineWidth = 2.1; c.strokeStyle = caught ? '#debd85' : '#afc297'; c.stroke();
    c.lineWidth = .8; c.setLineDash?.([2, 2.4]);
    c.strokeStyle = '#f5dab0'; c.stroke();
    c.restore();
}

function drawResistanceLabel(c: CanvasRenderingContext2D, label: string, color: string, y: number, escape?: number) {
    c.font = '11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = Math.ceil(c.measureText(label).width) + 14;
    c.fillStyle = 'rgba(13,27,29,.9)'; c.fillRect(-w / 2, y - 10, w, 19);
    c.fillStyle = color; c.fillText(label, 0, y);
    if (escape !== undefined) {
        c.fillStyle = 'rgba(242,188,121,.22)'; c.fillRect(-w / 2, y + 10, w, 2);
        c.fillStyle = color; c.fillRect(-w / 2, y + 10, w * escape, 2);
    }
}

/** Show where the current momentum will load the net and how strongly it will hold. */
export function drawRopeApproachWorld(c: CanvasRenderingContext2D, zoom: number) {
    if (state.screen !== 'mazeRescue' || state.mazeRescue?.phase !== 'play' || state.wheel?.open) return;
    const contact = getRopeContact(player);
    if (contact) {
        if (contact.kind !== 'snag' || contact.phase < 8) return;
        c.save();
        c.translate(player.x, player.y);
        c.scale(1 / zoom, 1 / zoom);
        c.globalAlpha *= Math.min(1, (contact.phase - 8) / 8);
        drawResistanceLabel(c, '沿来路退', '#f2bc79', 42, contact.escape);
        c.strokeStyle = '#f2bc79'; c.lineWidth = 1.5; c.lineCap = 'round';
        c.rotate(Math.atan2(-contact.ny, -contact.nx));
        c.beginPath();
        c.moveTo(21, -5); c.lineTo(27, 0); c.lineTo(21, 5);
        c.stroke();
        c.restore();
        return;
    }
    const approach = getRopeApproach(player, CONFIG.maze.playerRadius);
    if (!approach || Math.hypot(player.x - approach.x, player.y - approach.y) > 150) return;
    const { kind, x, y, nx, ny, strength } = approach;
    const risk = kind === 'snag';
    const color = risk ? '#f2bc79' : kind === 'rebound' ? '#d2d5a1' : '#a9cfbb';
    const label = risk ? '易缠住' : kind === 'rebound' ? '会回弹' : '可挤过';
    c.save();
    c.translate(x, y);
    c.scale(1 / zoom, 1 / zoom);
    c.strokeStyle = color; c.lineWidth = 1.5; c.lineCap = 'round';
    c.globalAlpha *= .55 + strength * .4;
    c.save();
    c.rotate(Math.atan2(ny, nx));
    const spread = 8 + 8 * strength;
    c.beginPath();
    c.moveTo(-6, -spread - 5); c.lineTo(0, -spread); c.lineTo(-6, -spread + 5);
    c.moveTo(-6, spread - 5); c.lineTo(0, spread); c.lineTo(-6, spread + 5);
    c.stroke();
    c.restore();
    drawResistanceLabel(c, label, color, -27);
    c.restore();
}
