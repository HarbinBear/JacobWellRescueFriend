import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { logicW, logicH } from './Canvas';
import { registerImage, getImage, releaseImages } from './ImageAssets';
import { getLightPolygon } from './RenderLight';
import { getKarstTerrain, KarstTerrain, releaseKarstTerrain, sampleKarst } from '../world/KarstTerrain';
import { getKarstSurface, releaseKarstSurfaceData, KARST_SURFACE_HEIGHT, KARST_SURFACE_UV, KARST_CHAMBER_UV, type KarstSurface } from '../world/KarstSurface';
import { getKarstBounce, releaseKarstBounce, karstBounceStats } from './KarstBounce';
import { KARST_FRAG_SRC } from './shaders/karstFrag.glsl';
import { KARST_COHERENT_FRAG_SRC } from './shaders/karstCoherentFrag.glsl';
import { KARST_LEGACY_FRAG_SRC } from './shaders/karstLegacyFrag.glsl';

const ASSETS = ['mineral-albedo.jpg', 'mineral-relief.png'];
const VERTEX = 'attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.0,1.0);}';
let surface: any = null, gl: WebGLRenderingContext | null = null, program: WebGLProgram | null = null;
let buffer: WebGLBuffer | null = null, textures: WebGLTexture[] = [], geometry: KarstTerrain | null = null, skin: KarstSurface | null = null;
let lastMaze: any = null, registered = false, retryAt = 0, failure = '', inspection = 0, activeMode = '';
let draws = 0, cacheHits = 0, generation = 0, key = '', beamKey = '', width = 0, height = 0;
let cpuMs = 0, lostCount = 0, beamUploads = 0;
let lastView: { l: number; r: number; top: number; b: number } | null = null;
const uniforms: Record<string, WebGLUniformLocation | null> = {}, beamBytes = new Uint8Array(512 * 4);
function now() { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(); }
function activeMaze() { return state.screen === 'mazeRescue' && (state.mazeRescue as any)?.continuous ? state.mazeRescue : null; }
function enhanced() { return CONFIG.karst.surfaceMode !== 'baseline'; }
export function updateKarstResources() {
    const maze = activeMaze();
    if (!maze) { if (registered || lastMaze) releaseKarstSurface(); return; }
    if (lastMaze && lastMaze !== maze) releaseKarstSurface();
    lastMaze = maze;
    if (!registered) { for (const file of ASSETS) registerImage('karst/' + file, 'images/karst/' + file); registered = true; }
}
export function karstAssetsReady() { return ASSETS.every(f => !!getImage('karst/' + f)); }
function location(name: string) {
    if (!(name in uniforms)) uniforms[name] = gl!.getUniformLocation(program!, name);
    return uniforms[name];
}
function disposeGL() {
    if (gl && !gl.isContextLost()) {
        textures.forEach(t => gl!.deleteTexture(t));
        if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program);
    }
    textures = []; buffer = null; program = null; geometry = null; skin = null; key = ''; beamKey = ''; activeMode = '';
    for (const name of Object.keys(uniforms)) delete uniforms[name];
}
function initialize(t: KarstTerrain) {
    disposeGL();
    if (!surface) {
        surface = wx.createCanvas();
        if (typeof surface.addEventListener === 'function') {
            surface.addEventListener('webglcontextlost', (event: any) => {
                event.preventDefault(); gl = null; program = null; geometry = null; textures = []; buffer = null;
                skin = null; key = ''; beamKey = ''; lostCount++;
            });
            surface.addEventListener('webglcontextrestored', () => { gl = null; program = null; geometry = null; retryAt = 0; });
        }
    }
    gl = surface.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl || gl.isContextLost()) return false;
    const compile = (type: number, source: string) => {
        const shader = gl!.createShader(type)!; gl!.shaderSource(shader, source); gl!.compileShader(shader);
        if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
            const error = gl!.getShaderInfoLog(shader) || '溶洞着色器编译失败'; gl!.deleteShader(shader); throw Error(error);
        }
        return shader;
    };
    const mode = enhanced(), vertex = compile(gl.VERTEX_SHADER, VERTEX), fragment = compile(gl.FRAGMENT_SHADER, mode ? (t.generation==='legacy'?KARST_COHERENT_FRAG_SRC:KARST_FRAG_SRC) : KARST_LEGACY_FRAG_SRC);
    program = gl.createProgram()!; gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program) || '溶洞着色器链接失败');
    gl.useProgram(program); gl.disable(gl.BLEND);
    buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    skin = mode ? getKarstSurface(t) : null;
    for (let i = 0; i < (mode ? 7 : 4); i++) {
        const texture = gl.createTexture()!; textures.push(texture); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texture);
        const filter = i === 3 || i === 6 ? gl.NEAREST : (mode&&t.generation==='chambers'&&(i===1||i===2)?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, i === 3 || i === 6 ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        if (i === 0) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.cols, t.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, skin?.geometry || t.texture);
        else if (i < 3) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, getImage('karst/' + ASSETS[i - 1]));
        else if (i === 3) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, beamBytes);
        else if (i < 6) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.cols, t.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, i === 4 ? skin!.coordinates : skin!.geology);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 6, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(64 * 6 * 4));
        if(mode&&t.generation==='chambers'&&(i===1||i===2))gl.generateMipmap(gl.TEXTURE_2D);
        gl.uniform1i(location(['geometry', 'mineral', 'relief', 'beam', 'coordinates', 'geology', 'bounceVisibility'][i]), i);
    }
    geometry = t; generation++; failure = ''; activeMode = CONFIG.karst.surfaceMode; return true;
}
function uploadBeam(poly?: any[]) {
    const next = [player.x, player.y, player.angle, CONFIG.lightRange, CONFIG.fov, CONFIG.quality.rayCount, CONFIG.karst.lightEnergy,
        CONFIG.karst.bounceStrength, CONFIG.quality.vplMax, generation].join('/');
    if (next === beamKey) return;
    const points = poly || getLightPolygon(player.x, player.y, player.angle, CONFIG.lightRange, CONFIG.fov);
    if (enhanced() && geometry) {
        const frame = getKarstBounce(geometry, points, player.x, player.y, player.angle, CONFIG.lightRange);
        gl!.uniform1f(location('bounceCount'), frame.count);
        gl!.uniform4fv(location('bouncePositions[0]'), frame.positions); gl!.uniform4fv(location('bounceDirections[0]'), frame.directions); gl!.uniform4fv(location('bounceColors[0]'), frame.colors);
        gl!.activeTexture(gl!.TEXTURE6); gl!.bindTexture(gl!.TEXTURE_2D, textures[6]);
        gl!.texSubImage2D(gl!.TEXTURE_2D, 0, 0, 0, 64, 6, gl!.RGBA, gl!.UNSIGNED_BYTE, frame.visibility);
    } else for (let j = 0; j < 3; j++) {
        const p = points.length ? points[Math.min(points.length - 1, Math.round((.2 + j * .3) * (points.length - 1)))] : null;
        const theta = (j * .3 - .3) * CONFIG.fov * Math.PI / 180;
        const power = p && p.dist < CONFIG.lightRange * .94 ? (Math.exp(-Math.pow(Math.abs(theta) / (.36 * CONFIG.fov * Math.PI / 180), 4)) * .65 + Math.exp(-theta * theta / .031) * .55) / (1 + Math.pow(p.dist / 188, 2)) : 0;
        gl!.uniform3f(location('bounce' + j), p?.x || 0, p?.y || 0, power * CONFIG.karst.lightEnergy);
    }
    if (points.length < 2) beamBytes.fill(0);
    else for (let i = 0; i < 512; i++) {
        const f = i / 511 * (points.length - 1), a = Math.min(points.length - 2, Math.floor(f)), u = f - a;
        const value = Math.round(Math.max(0, Math.min(1, (points[a].dist + (points[a + 1].dist - points[a].dist) * u) / CONFIG.lightRange)) * 65535);
        beamBytes[i * 4] = value >>> 8; beamBytes[i * 4 + 1] = value & 255; beamBytes[i * 4 + 3] = 255;
    }
    gl!.activeTexture(gl!.TEXTURE3); gl!.bindTexture(gl!.TEXTURE_2D, textures[3]);
    gl!.texSubImage2D(gl!.TEXTURE_2D, 0, 0, 0, 512, 1, gl!.RGBA, gl!.UNSIGNED_BYTE, beamBytes);
    beamKey = next; beamUploads++;
}
function fallback(ctx: CanvasRenderingContext2D, t: KarstTerrain, v: { l: number; r: number; top: number; b: number }) {
    const firstRow = Math.max(0, Math.floor((v.top - t.y) / t.step)), lastRow = Math.min(t.rows - 2, Math.ceil((v.b - t.y) / t.step));
    const firstCol = Math.max(0, Math.floor((v.l - t.x) / t.step)), lastCol = Math.min(t.cols - 2, Math.ceil((v.r - t.x) / t.step));
    ctx.save(); ctx.fillStyle = '#151d1d';
    for (let row = firstRow; row <= lastRow; row++) for (let col = firstCol; col <= lastCol; col++) {
        const i = row * t.cols + col, values = [t.field[i], t.field[i + 1], t.field[i + t.cols + 1], t.field[i + t.cols]];
        const corners = [[0, 0], [1, 0], [1, 1], [0, 1]], points: number[][] = [];
        for (let j = 0; j < 4; j++) {
            const k = (j + 1) % 4;
            if (values[j] < 0) points.push(corners[j]);
            if ((values[j] < 0) !== (values[k] < 0)) { const f = values[j] / (values[j] - values[k]); points.push([corners[j][0] + (corners[k][0] - corners[j][0]) * f, corners[j][1] + (corners[k][1] - corners[j][1]) * f]); }
        }
        if (!points.length) continue;
        ctx.beginPath(); points.forEach((p, j) => { const x = t.x + (col + p[0]) * t.step, y = t.y + (row + p[1]) * t.step; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
}
export function drawKarstSurface(ctx: CanvasRenderingContext2D, zoom: number, poly?: any[]) {
    updateKarstResources(); const maze = activeMaze(), t = getKarstTerrain(maze); if (!t) return;
    const c = state.camera, pad = 2 / zoom;
    const v = { l: c.x + c.swayX - logicW / (2 * zoom) - pad, r: c.x + c.swayX + logicW / (2 * zoom) + pad,
        top: Math.max(t.y, c.y + c.swayY - logicH / (2 * zoom) - pad), b: c.y + c.swayY + logicH / (2 * zoom) + pad };
    if (v.b <= v.top) return;
    const start = now();
    if (!karstAssetsReady()) { fallback(ctx, t, v); return; }
    if ((!gl || !program || geometry !== t || activeMode !== CONFIG.karst.surfaceMode || gl.isContextLost()) && Date.now() >= retryAt) {
        try { if (!initialize(t)) retryAt = Date.now() + 3000; }
        catch (error) { failure = String(error); console.warn('[溶洞表面] 降级绘制', error); disposeGL(); retryAt = Date.now() + 3000; }
    }
    if (!gl || !program || gl.isContextLost()) { fallback(ctx, t, v); return; }
    const quality = CONFIG.karst, resolution = Math.max(.65, Math.min(1.6, CONFIG.quality.scale * 2));
    let w = Math.ceil((v.r - v.l) * zoom * resolution), h = Math.ceil((v.b - v.top) * zoom * resolution);
    const shrink = Math.min(1, Math.sqrt(quality.pixelBudget / Math.max(1, w * h))); w = Math.max(2, Math.round(w * shrink)); h = Math.max(2, Math.round(h * shrink));
    const next = [v.l, v.r, v.top, v.b, w, h, player.x, player.y, player.angle, state.flashlightOn, CONFIG.lightRange, CONFIG.fov,
        CONFIG.quality.rayCount, inspection, quality.normalStrength, quality.occlusionStrength, quality.lightEnergy, quality.scatterStrength,
        quality.bounceStrength, CONFIG.quality.vplMax, quality.extinction.join(), generation].join('/');
    if (next !== key) {
        if (surface.width !== w) surface.width = w; if (surface.height !== h) surface.height = h;
        width = w; height = h; lastView = v; gl.viewport(0, 0, w, h); gl.useProgram(program); gl.disable(gl.BLEND); uploadBeam(poly);
        for (let i = 0; i < textures.length; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, textures[i]); }
        gl.uniform4f(location('view'), v.l, v.top, v.r - v.l, v.b - v.top);
        gl.uniform4f(location('terrainBounds'), t.x, t.y, (t.cols - 1) * t.step, (t.rows - 1) * t.step); gl.uniform2f(location('terrainPixels'), t.cols, t.rows);
        gl.uniform2f(location('light'), player.x, player.y); gl.uniform2f(location('camera'), c.x, c.y);
        gl.uniform3f(location('extinction'), quality.extinction[0], quality.extinction[1], quality.extinction[2]);
        gl.uniform1f(location('angle'), player.angle); gl.uniform1f(location('fov'), CONFIG.fov * Math.PI / 180); gl.uniform1f(location('range'), CONFIG.lightRange);
        gl.uniform1f(location('enabled'), state.flashlightOn === false ? 0 : 1); gl.uniform1f(location('surfaceY'), (maze as any).continuous.surfaceY);
        gl.uniform1f(location('pixelWorld'), (v.r - v.l) / w); gl.uniform1f(location('inspect'), inspection);
        gl.uniform1f(location('normalStrength'), quality.normalStrength); gl.uniform1f(location('occlusionStrength'), quality.occlusionStrength);
        gl.uniform1f(location('lightEnergy'), quality.lightEnergy); gl.uniform1f(location('scatterStrength'), quality.scatterStrength);
        gl.uniform1f(location('surfaceHeight'), KARST_SURFACE_HEIGHT); gl.uniform1f(location('surfaceUVRange'), t.generation === 'legacy' ? KARST_SURFACE_UV : KARST_CHAMBER_UV);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.flush(); draws++; key = next;
    } else cacheHits++;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(surface, v.l, v.top, v.r - v.l, v.b - v.top); ctx.restore(); cpuMs = Math.max(0, now() - start);
}
export function inspectKarst(mode = 0) { inspection = mode; key = ''; }
export function loseKarstContext() {
    const extension = gl?.getExtension('WEBGL_lose_context'); if (!extension) return false;
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 120); return true;
}
export function karstSurfaceStats() {
    const loaded = karstAssetsReady(), pixels = program ? width * height : 0;
    return { ready: loaded && !!program, mode: program && gl && !gl.isContextLost() ? (enhanced() ? 'shape-bound-normal-surface' : 'height-normal-surface') : 'fallback',
        surfaceMode: activeMode, failure, draws, cacheHits, generation, lostCount, beamUploads, surfacePixels: pixels, surfaceCPUms: cpuMs,
        skinBakeMs: skin?.bakeMs || 0, mappedSamples: skin?.mappedFeatures || 0, bounce: karstBounceStats(),
        gpuBytes: program ? (geometry?.texture.byteLength || 0) * (skin ? 3 : 1) + 1024 * 1024 * 4 * 2 + (skin && geometry?.generation === 'chambers' ? 2796200 : 0) + 512 * 4 + (skin ? 64 * 6 * 4 : 0) + pixels * 4 : 0,
        decodedImageBytes: loaded ? 1024 * 1024 * 4 * 2 : 0 };
}
export function karstCoverageDiagnostics() {
    if (!gl || !program || !geometry || !lastView) return { samples: 0, failures: ['表面尚未绘制'] };
    const bytes = new Uint8Array(width * height * 4), v = lastView; gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let samples = 0; const failures: any[] = [];
    for (let iy = 0; iy < 16; iy++) for (let ix = 0; ix < 24; ix++) {
        const px = Math.min(width - 1, Math.floor((ix + .37) / 24 * width)), py = Math.min(height - 1, Math.floor((iy + .61) / 16 * height));
        const x = v.l + (px + .5) / width * (v.r - v.l), y = v.top + (1 - (py + .5) / height) * (v.b - v.top);
        const density = sampleKarst(geometry, x, y), alpha = bytes[(py * width + px) * 4 + 3];
        if (Math.abs(density) < (v.r - v.l) / width * 2) continue; samples++;
        if (density < 0 ? alpha < 240 : alpha > 15) if (failures.length < 8) failures.push({ x, y, density, alpha });
    }
    return { samples, failures };
}
export function releaseKarstSurface() {
    const t = geometry; disposeGL(); gl = null; retryAt = 0; failure = ''; width = height = 0;
    if (surface) surface.width = surface.height = 1;
    releaseImages(ASSETS.map(f => 'karst/' + f)); registered = false; releaseKarstBounce();
    if (t) releaseKarstSurfaceData(t); if (lastMaze) releaseKarstTerrain(lastMaze); lastMaze = null;
}
