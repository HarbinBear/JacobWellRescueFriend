import { getRopeNet } from '../logic/RopeNet';
import { buildRopeVolumeMesh, supportsRopeVolume, validRopeVolumePath, ROPE_VOLUME_RADIUS,
    type RopeVolumeSource } from './RopeVolumeMesh';

interface Snapshot { rope: RopeVolumeSource; flags: string; values: unknown[]; }
const flags = (r: RopeVolumeSource) => [!!r.startWall, !!r.endWall, !!r.startLoose, !!r.endLoose,
    !!r.startOnRope, !!r.endOnRope, r.mode || ''].join('/');
function snapshot(rope: RopeVolumeSource): Snapshot {
    return { rope, flags: flags(rope), values: Array.isArray(rope.path) ? rope.path.reduce<unknown[]>((a, p) => {
        a.push(p?.x, p?.y); return a;
    }, []) : [] };
}
function same(ropes: readonly RopeVolumeSource[], saved: Snapshot[]) {
    if (ropes.length !== saved.length) return false;
    for (let i = 0; i < ropes.length; i++) {
        const r = ropes[i], s = saved[i], path = Array.isArray(r.path) ? r.path : [];
        if (s.rope !== r || s.flags !== flags(r) || s.values.length !== path.length * 2) return false;
        for (let j = 0; j < path.length; j++) {
            if (!Object.is(path[j]?.x, s.values[j * 2]) || !Object.is(path[j]?.y, s.values[j * 2 + 1])) return false;
        }
    }
    return true;
}
function segmentInBox(ax: number, ay: number, bx: number, by: number, l: number, r: number, t: number, b: number) {
    let enter = 0, leave = 1;
    for (const [start, delta, low, high] of [[ax, bx - ax, l, r], [ay, by - ay, t, b]]) {
        if (Math.abs(delta) < 1e-12) { if (start < low || start > high) return false; continue; }
        const a = (low - start) / delta, z = (high - start) / delta;
        enter = Math.max(enter, Math.min(a, z)); leave = Math.min(leave, Math.max(a, z));
        if (enter > leave) return false;
    }
    return true;
}
function inRange(rope: RopeVolumeSource, cx: number, cy: number, halfW: number, halfH: number,
    light: { x: number; y: number; radius: number }) {
    const pad = 20, path = rope.path;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        if (segmentInBox(a.x, a.y, b.x, b.y, cx - halfW - pad, cx + halfW + pad, cy - halfH - pad, cy + halfH + pad)) return true;
        if (light.radius <= 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
        const t = length2 ? Math.max(0, Math.min(1, ((light.x - a.x) * dx + (light.y - a.y) * dy) / length2)) : 0;
        if (Math.hypot(a.x + dx * t - light.x, a.y + dy * t - light.y) <= light.radius + pad) return true;
    }
    return false;
}

/** Four persistent static buffers; membership changes and actual point edits invalidate the mesh. */
export class RopeVolumePass {
    private buffers: WebGLBuffer[] = [];
    private topology: Snapshot[] = [];
    private selected: Snapshot[] = [];
    private woven = new Set<RopeVolumeSource>();
    private included = new Set<RopeVolumeSource>();
    private disposed = false;
    private topologyTooLarge = false;
    count = 0;
    triangles = 0;
    bytes = 0;
    revision = 0;
    builds = 0;
    rejected = 0;
    failure = '';
    fallbackReason = '';
    constructor(private gl: WebGLRenderingContext) {
        for (let i = 0; i < 4; i++) {
            const buffer = gl.createBuffer();
            if (!buffer) { this.buffers.forEach(b => gl.deleteBuffer(b)); throw Error('实体绳缓冲区分配失败'); }
            this.buffers.push(buffer);
        }
    }
    prepare(ropes: readonly RopeVolumeSource[], _time: number, cx: number, cy: number, halfW: number, halfH: number,
        enabled: boolean, light: { x: number; y: number; radius: number }, surfaceY: number) {
        if (this.disposed) return;
        if (!same(ropes, this.topology)) {
            this.topology = ropes.map(snapshot);
            const valid = ropes.filter(validRopeVolumePath);
            // Bound the quadratic junction scan too; never silently omit a crossing rope.
            this.topologyTooLarge = valid.reduce((n, rope) => n + rope.path.length - 1, 0) > 2048;
            this.woven.clear();
            if (!this.topologyTooLarge) {
                // A fresh array bypasses RopeNet's length-only cache when coordinates were edited in place.
                const net = getRopeNet(valid);
                for (const index of net.woven) this.woven.add(valid[index]);
            }
        }
        this.fallbackReason = this.failure ? 'upload-failed' : this.topologyTooLarge ? 'topology-budget' : '';
        const candidates = enabled && !this.failure && !this.topologyTooLarge && Number.isFinite(surfaceY) ? ropes.filter(rope =>
            supportsRopeVolume(rope) && !this.woven.has(rope) &&
            rope.path.every(p => p.y >= surfaceY + ROPE_VOLUME_RADIUS * 2) &&
            inRange(rope, cx, cy, halfW, halfH, light)) : [];
        if (same(candidates, this.selected)) return;
        this.selected = candidates.map(snapshot);
        this.revision++;
        this.included.clear(); this.count = this.triangles = this.bytes = this.rejected = 0;
        if (!candidates.length) return;
        const mesh = buildRopeVolumeMesh(candidates);
        this.builds++;
        this.rejected = mesh.rejected.length;
        if (!mesh.ropes.length) return;
        const gl = this.gl;
        try {
            [mesh.positions, mesh.normals, mesh.colors, mesh.indices].forEach((data, i) => {
                const target = i === 3 ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
                gl.bindBuffer(target, this.buffers[i]); gl.bufferData(target, data, gl.STATIC_DRAW);
            });
            this.included = new Set(mesh.ropes);
            this.count = mesh.ropes.length; this.triangles = mesh.indices.length / 3;
            this.bytes = mesh.positions.byteLength + mesh.normals.byteLength + mesh.colors.byteLength + mesh.indices.byteLength;
        } catch (error) {
            this.failure = String(error); // Leave every rope in the complete 2D fallback on upload failure.
            this.fallbackReason = 'upload-failed';
            console.warn('[实体绳] 回退二维绘制', error);
        }
    }
    contains(rope: RopeVolumeSource) { return this.included.has(rope); }
    draw(shadow = false) {
        if (!this.count || this.disposed) return;
        const gl = this.gl;
        for (let i = 0; i < (shadow ? 1 : 3); i++) {
            gl.enableVertexAttribArray(i); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 0, 0);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers[3]);
        gl.drawElements(gl.TRIANGLES, this.triangles * 3, gl.UNSIGNED_SHORT, 0);
        gl.disableVertexAttribArray(2);
    }
    dispose() {
        if (this.disposed) return;
        this.buffers.forEach(buffer => this.gl.deleteBuffer(buffer)); this.buffers = [];
        this.included.clear(); this.topology = []; this.selected = [];
        this.count = this.triangles = this.bytes = 0; this.revision++; this.disposed = true;
    }
}
