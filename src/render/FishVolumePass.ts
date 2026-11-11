import { getRopeContact } from '../logic/Rope';
import { isFishStunned } from '../logic/FishHandling';
import { FishEnemy } from '../logic/FishEnemy';
import { buildFishVolumeMesh, supportsFishVolume } from './FishVolumeMesh';

// 所有鱼共用四个动态缓冲，不为每条鱼新建 WebGL 对象。
export class FishVolumePass {
    private buffers: WebGLBuffer[];
    private fishes = new Set<FishEnemy>();
    count = 0;
    triangles = 0;
    bytes = 0;
    constructor(private gl: WebGLRenderingContext) {
        this.buffers = Array.from({ length: 4 }, () => gl.createBuffer()!);
    }
    prepare(fishes: readonly FishEnemy[], time: number, x: number, y: number, halfW: number, halfH: number, enabled: boolean, light: { x: number; y: number; radius: number }) {
        const inView = (f: FishEnemy) => Math.abs(f.x - x) < halfW + 80 && Math.abs(f.y - y) < halfH + 80;
        const selected = enabled ? fishes.filter(f => supportsFishVolume(f) && (inView(f) || Math.hypot(f.x - light.x, f.y - light.y) < light.radius + 50))
            .sort((a, b) => Number(inView(b)) - Number(inView(a)) || Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, 24) : [];
        this.fishes = new Set(selected);
        const mesh = buildFishVolumeMesh(selected, time, fish => { const c = getRopeContact(fish); return c?.kind === 'snag' && !isFishStunned(fish) ? Math.sin(c.phase * .6) * (.54 + c.pull * .46) : 0; });
        this.count = mesh.fishCount; this.triangles = mesh.indices.length / 3;
        this.bytes = mesh.positions.byteLength + mesh.normals.byteLength + mesh.colors.byteLength + mesh.indices.byteLength;
        if (!this.count) return;
        const gl = this.gl;
        [mesh.positions, mesh.normals, mesh.colors, mesh.indices].forEach((data, i) => {
            const target = i === 3 ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
            gl.bindBuffer(target, this.buffers[i]); gl.bufferData(target, data, gl.DYNAMIC_DRAW);
        });
    }
    contains(fish: FishEnemy) { return this.fishes.has(fish); }
    draw(shadow = false) {
        if (!this.count) return;
        const gl = this.gl;
        for (let i = 0; i < (shadow ? 1 : 3); i++) {
            gl.enableVertexAttribArray(i); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 0, 0);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers[3]); gl.drawElements(gl.TRIANGLES, this.triangles * 3, gl.UNSIGNED_SHORT, 0);
        gl.disableVertexAttribArray(2);
    }
    dispose() { for (const buffer of this.buffers) this.gl.deleteBuffer(buffer); }
}
