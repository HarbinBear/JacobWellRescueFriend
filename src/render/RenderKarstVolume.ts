// 三维洞腔的绘制：玩法仍是二维，这里只把岩石这一层换成带透视的三维网格。
// 相机的消失点在屏幕正中，游戏平面（z=0）与二维镜头逐像素对齐，所以潜水员、鱼和绳索不用改。
// 网格按镜头附近分块生成，每帧最多新生成一块；离开很远的块会被释放。
import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { logicW, logicH } from './Canvas';
import { type KarstTerrain } from '../world/KarstTerrain';
import { startVolumeChunk, stepVolumeChunk, VOLUME_CHUNK, VOLUME_DEPTH, type KarstVolumeJob, type KarstVolumeMesh } from '../world/KarstVolume';
import { KARST_VOLUME_VERT_SRC } from './shaders/karstVolumeVert.glsl';
import { KARST_VOLUME_FRAG_SRC } from './shaders/karstVolumeFrag.glsl';
import { planVolumeChunks } from './KarstVolumeStreaming';
import { sampleVolumeProbe, raycastVolumeProbe, type VolumeProbeField } from './KarstVolumeProbes';

interface Chunk { key: number; ci: number; cj: number; vb: WebGLBuffer; nb: WebGLBuffer; ib: WebGLBuffer; count: number; bytes: number; used: number; probe: VolumeProbeField }
const DEPTH_VERT = 'attribute vec3 position;uniform mat4 lightVP;void main(){gl_Position=lightVP*vec4(position,1.0);}';
const DEPTH_FRAG = 'precision mediump float;void main(){gl_FragColor=vec4(1.0);}';
const SHADOW = 1024, KEEP = 40, FRAME_BUDGET = 6, FIRST_BUDGET = 28;
// 光轴略朝洞内，XY 投影仍沿角色朝向；让同一束窄角手电能扫到纵深岩面。
const TORCH_PITCH = Math.PI / 10;
// 在同一个手电锥内向侧壁和纵深取样。后壁不是单独的一盏灯：中间的岩石也会挡住射线。
const bounceRays = [[0, 0, .24], [-.70, 0, .16], [.70, 0, .16], [-.34, .32, .20], [.34, .32, .20],
    [0, .62, .24], [-.60, .48, .18], [.60, .48, .18], [-.20, .84, .20], [.20, .84, .20]];
const bounceLights = new Float32Array(bounceRays.length * 4), bounceNormals = new Float32Array(bounceRays.length * 4);
let job: KarstVolumeJob | null = null, pending = 0, longestStep = 0, shownFrame = -1, overlay: any = null, overlayCtx: any = null;
let surface: any = null, gl: WebGLRenderingContext | null = null, main: any = null, depth: any = null, terrain: KarstTerrain | null = null;
let shadowFB: WebGLFramebuffer | null = null, shadowTex: WebGLTexture | null = null, sliceTex: WebGLTexture | null = null;
let chunks = new Map<number, Chunk>(), empty = new Set<number>(), frame = 0, key = '', uploads = 0, retryAt = 0, failure = '', inspection = 0;
let width = 0, height = 0, bounceCount = 0, returnedLight = 0, bounceProbeMs = 0;
let visiblePending = 0, shadowPending = 0, preloadPending = 0, visibleChunks = 0, shadowChunks = 0, offscreenShadowChunks = 0;
let draws = 0, cacheHits = 0, lostCount = 0, lastBuildMs = 0, maxBuildMs = 0, builds = 0, triangles = 0, cpuMs = 0, dropped = 0;
function now() { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(); }
function clearBounce() { bounceLights.fill(0); bounceNormals.fill(0); bounceCount = 0; returnedLight = 0; bounceProbeMs = 0; }
function program(vs: string, fs: string) {
    const p = gl!.createProgram()!;
    for (const [type, source] of [[gl!.VERTEX_SHADER, vs], [gl!.FRAGMENT_SHADER, fs]] as [number, string][]) {
        const s = gl!.createShader(type)!; gl!.shaderSource(s, source); gl!.compileShader(s);
        if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) { const error = gl!.getShaderInfoLog(s) || '三维洞腔着色器编译失败'; gl!.deleteShader(s); throw Error(error); }
        gl!.attachShader(p, s); gl!.deleteShader(s);
    }
    gl!.bindAttribLocation(p, 0, 'position'); gl!.bindAttribLocation(p, 1, 'normal'); gl!.linkProgram(p);
    if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) throw Error(gl!.getProgramInfoLog(p) || '三维洞腔着色器链接失败');
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (let i = 0, n = gl!.getProgramParameter(p, gl!.ACTIVE_UNIFORMS); i < n; i++) { const name = gl!.getActiveUniform(p, i)!.name; u[name] = gl!.getUniformLocation(p, name); }
    return { p, u };
}
function texture(format: number, type: number, w: number, h: number, data: ArrayBufferView | null, filter: number) {
    const t = gl!.createTexture()!; gl!.bindTexture(gl!.TEXTURE_2D, t); gl!.pixelStorei(gl!.UNPACK_ALIGNMENT, 1);
    gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0); gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, 0);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, format, w, h, 0, format, type, data);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, filter); gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, filter);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE); gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return t;
}
function forget() { job = null; gl = null; main = null; depth = null; shadowFB = null; shadowTex = null; sliceTex = null; chunks = new Map(); empty = new Set(); terrain = null; key = ''; triangles = 0;
    pending = visiblePending = shadowPending = preloadPending = visibleChunks = shadowChunks = offscreenShadowChunks = 0; clearBounce(); }
function dispose() {
    if (gl && !gl.isContextLost()) {
        for (const c of chunks.values()) { gl.deleteBuffer(c.vb); gl.deleteBuffer(c.nb); gl.deleteBuffer(c.ib); }
        if (sliceTex) gl.deleteTexture(sliceTex); if (shadowTex) gl.deleteTexture(shadowTex); if (shadowFB) gl.deleteFramebuffer(shadowFB);
        if (main) gl.deleteProgram(main.p); if (depth) gl.deleteProgram(depth.p);
    }
    forget();
}
function initialize(t: KarstTerrain) {
    dispose();
    if (!surface) {
        surface = wx.createCanvas();
        if (typeof surface.addEventListener === 'function') {
            surface.addEventListener('webglcontextlost', (event: any) => { event.preventDefault(); forget(); lostCount++; });
            surface.addEventListener('webglcontextrestored', () => { forget(); retryAt = 0; });
        }
    }
    gl = surface.getContext('webgl', { alpha: true, depth: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl || gl.isContextLost()) { gl = null; return false; }
    main = program(KARST_VOLUME_VERT_SRC, KARST_VOLUME_FRAG_SRC); depth = program(DEPTH_VERT, DEPTH_FRAG);
    // 剖面贴边受光用：每格岩石离洞壁有多深。
    const bytes = new Uint8Array(t.cols * t.rows); for (let i = 0; i < bytes.length; i++) bytes[i] = Math.max(0, Math.min(255, -t.field[i] / 72 * 255));
    sliceTex = texture(gl.LUMINANCE, gl.UNSIGNED_BYTE, t.cols, t.rows, bytes, gl.LINEAR);
    if (gl.getExtension('WEBGL_depth_texture')) {
        const color = texture(gl.RGBA, gl.UNSIGNED_BYTE, SHADOW, SHADOW, null, gl.NEAREST); shadowTex = texture(gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, SHADOW, SHADOW, null, gl.NEAREST);
        shadowFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { shadowFB = null; shadowTex = null; }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    terrain = t; failure = ''; return true;
}
function upload(ci: number, cj: number, mesh: KarstVolumeMesh) {
    const id = cj * 4096 + ci; builds++; lastBuildMs = mesh.ms; maxBuildMs = Math.max(maxBuildMs, mesh.ms); dropped += mesh.dropped;
    const hasMesh = mesh.indices.length > 0;
    if (!hasMesh) empty.add(id);
    const c: Chunk = { key: id, ci, cj, vb: hasMesh ? gl!.createBuffer()! : null, nb: hasMesh ? gl!.createBuffer()! : null, ib: hasMesh ? gl!.createBuffer()! : null,
        count: mesh.indices.length, used: frame, probe: mesh.probe, bytes: mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength };
    if (hasMesh) {
        gl!.bindBuffer(gl!.ARRAY_BUFFER, c.vb); gl!.bufferData(gl!.ARRAY_BUFFER, mesh.positions, gl!.STATIC_DRAW);
        gl!.bindBuffer(gl!.ARRAY_BUFFER, c.nb); gl!.bufferData(gl!.ARRAY_BUFFER, mesh.normals, gl!.STATIC_DRAW);
        gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, c.ib); gl!.bufferData(gl!.ELEMENT_ARRAY_BUFFER, mesh.indices, gl!.STATIC_DRAW);
    }
    chunks.set(id, c); uploads++; triangles += c.count / 3; return c;
}
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], unit = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function perspective(fovy: number, aspect: number, n: number, f: number) { const t = 1 / Math.tan(fovy / 2); return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
function lookAt(eye: number[], target: number[], up: number[]) { const z = unit(sub(eye, target)), x = unit(cross(up, z)), y = cross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]; }
function multiply(a: number[], b: number[]) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
function drawChunks(list: Chunk[]) {
    for (const c of list) {
        if (!c.count) continue;
        gl!.bindBuffer(gl!.ARRAY_BUFFER, c.vb); gl!.vertexAttribPointer(0, 3, gl!.FLOAT, false, 0, 0);
        gl!.bindBuffer(gl!.ARRAY_BUFFER, c.nb); gl!.vertexAttribPointer(1, 3, gl!.FLOAT, false, 0, 0);
        gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, c.ib); gl!.drawElements(gl!.TRIANGLES, c.count, gl!.UNSIGNED_SHORT, 0);
    }
}
function updateBounce(t: KarstTerrain, lightOn: boolean, range: number, strength: number) {
    clearBounce();
    if (!lightOn || strength <= 0 || range <= 0) return;
    const started = now(), limit = range * 1.2, size = t.step * VOLUME_CHUNK, halfFov = CONFIG.fov * Math.PI / 360;
    const sample = (x: number, y: number, z: number) => {
        const ci = Math.floor((x - t.x) / size), cj = Math.floor((y - t.y) / size), chunk = chunks.get(cj * 4096 + ci);
        return chunk ? sampleVolumeProbe(chunk.probe, x, y, z) : NaN;
    };
    const fade = (a: number, b: number, x: number) => { const v = Math.max(0, Math.min(1, (x - a) / (b - a))); return v * v * (3 - 2 * v); };
    for (let i = 0; i < bounceRays.length; i++) {
        const [horizontal, vertical, weight] = bounceRays[i], offset = horizontal * halfFov, pitch = TORCH_PITCH + vertical * halfFov, angle = player.angle + offset;
        const dx = Math.cos(angle) * Math.cos(pitch), dy = Math.sin(angle) * Math.cos(pitch), dz = Math.sin(pitch);
        const theta = Math.acos(Math.max(-1, Math.min(1, Math.cos(offset) * Math.cos(pitch) * Math.cos(TORCH_PITCH) + Math.sin(pitch) * Math.sin(TORCH_PITCH))));
        const spill = Math.exp(-Math.pow(theta / (halfFov * .72), 4)) * (1 - fade(halfFov * .86, halfFov, theta));
        const hot = Math.exp(-theta * theta / .031), cone = (spill * .63 + hot * .25) / .88;
        if (cone < .001) continue;
        const hit = raycastVolumeProbe(sample, player.x, player.y, 0, dx, dy, dz, limit);
        if (!hit) continue;
        const incidence = Math.max(0, -hit.nx * dx - hit.ny * dy - hit.nz * dz);
        const power = 4.8 * strength * weight * cone * incidence * (1 - fade(range * .85, limit, hit.distance)) / (1 + (hit.distance / 200) ** 2);
        if (power <= 0) continue;
        // 只离开表面两单位，避免把反射源挪回角色或穿过近处石笋。
        const j = i * 4;
        bounceLights[j] = hit.x + hit.nx * 2; bounceLights[j + 1] = hit.y + hit.ny * 2; bounceLights[j + 2] = hit.z + hit.nz * 2;
        bounceLights[j + 3] = power;
        bounceNormals[j] = hit.nx; bounceNormals[j + 1] = hit.ny; bounceNormals[j + 2] = hit.nz; bounceNormals[j + 3] = 650;
        bounceCount++; returnedLight += power;
    }
    bounceProbeMs = now() - started;
}
// 返回 true 表示这一帧的岩石已由三维洞腔画出。
export function drawKarstVolume(ctx: CanvasRenderingContext2D, t: KarstTerrain, zoom: number, lightOn: boolean) {
    shownFrame = -1;
    if (!lightOn) clearBounce();
    if (t.generation !== 'volume' || !t.volume) { clearBounce(); return false; }
    const start = now(), c = state.camera, cx = c.x + c.swayX, cy = c.y + c.swayY, halfW = logicW / (2 * zoom), halfH = logicH / (2 * zoom);
    // 还在岸上时就开始准备井口附近的洞壁，下水时不用等。
    const onScreen = cy + halfH > t.y; if (!onScreen && cy + halfH < t.y - 1400) { clearBounce(); return true; }
    if ((!gl || !main || terrain !== t || gl.isContextLost()) && Date.now() >= retryAt) {
        try { if (!initialize(t)) retryAt = Date.now() + 3000; }
        catch (error) { failure = String(error); console.warn('[三维洞腔] 无法绘制', error); dispose(); retryAt = Date.now() + 3000; }
    }
    if (!gl || !main || gl.isContextLost()) { clearBounce(); return false; }
    frame++;
    // 透视强度固定为“中”：相机到游戏平面的距离约为画面高度的 1.45 倍，且不小于小样里选定的 900。
    const D = Math.max(900, Math.min(1400, 2.9 * halfH)), reach = (D + VOLUME_DEPTH) / D, size = VOLUME_CHUNK * t.step;
    const shadowOn = !!shadowFB && lightOn && !inspection && CONFIG.quality.scale > .3;
    // 速度单位为每个 60 Hz 逻辑步的位移。准备约一秒后的视野，并额外保留转向余量。
    const aheadX = Math.max(-size, Math.min(size, player.vx * 60 + c.vx * 20));
    const aheadY = Math.max(-size, Math.min(size, player.vy * 60 + c.vy * 20));
    const requested = planVolumeChunks(t, VOLUME_CHUNK,
        { x: cx, y: cy, halfW: halfW * reach, halfH: halfH * reach, aheadX, aheadY },
        { x: player.x, y: player.y, radius: lightOn && !inspection ? CONFIG.lightRange * 1.2 : 0 }, KEEP);
    const missing = requested.filter(r => !chunks.has(r.id) && !empty.has(r.id));
    const activeJob = job && requested.find(r => r.ci === job!.ci && r.cj === job!.cj);
    // 传送后抛弃旧位置任务。尚在求场的预热任务可以让位给新进入画面的缺块。
    if (job && (!activeJob || job.phase === 0 && activeJob.priority > (missing[0]?.priority ?? activeJob.priority))) job = null;
    if (!job && missing.length) job = startVolumeChunk(t, missing[0].ci, missing[0].cj);
    if (job) {
        const hasVisible = requested.some(r => r.visible && chunks.has(r.id));
        const mesh = stepVolumeChunk(t, job, Date.now() + (hasVisible || !onScreen ? FRAME_BUDGET : FIRST_BUDGET));
        longestStep = Math.max(longestStep, job.longestStep);
        if (mesh) { upload(job.ci, job.cj, mesh); job = null; }
    }
    const visible: Chunk[] = [], shadowCasters: Chunk[] = [];
    visiblePending = shadowPending = preloadPending = offscreenShadowChunks = 0;
    for (const r of requested) {
        const chunk = chunks.get(r.id);
        if (chunk) {
            chunk.used = frame;
            if (r.visible) visible.push(chunk);
            if (r.shadow) { shadowCasters.push(chunk); if (!r.visible) offscreenShadowChunks++; }
        } else if (!empty.has(r.id)) {
            if (r.visible) visiblePending++;
            else if (r.shadow) shadowPending++;
            else preloadPending++;
        }
    }
    pending = visiblePending + shadowPending + preloadPending;
    visibleChunks = visible.length; shadowChunks = shadowCasters.length;
    for (const old of Array.from(chunks.values()).sort((p, q) => p.used - q.used)) {
        if (chunks.size <= KEEP || old.used === frame) break;
        gl.deleteBuffer(old.vb); gl.deleteBuffer(old.nb); gl.deleteBuffer(old.ib); triangles -= old.count / 3; chunks.delete(old.key); empty.delete(old.key);
    }
    if (!onScreen) { clearBounce(); return true; }
    const quality = CONFIG.karst, resolution = Math.max(.65, Math.min(1.6, CONFIG.quality.scale * 2));
    let w = Math.ceil(logicW * resolution), h = Math.ceil(logicH * resolution);
    const shrink = Math.min(1, Math.sqrt(quality.pixelBudget / Math.max(1, w * h))); w = Math.max(2, Math.round(w * shrink)); h = Math.max(2, Math.round(h * shrink));
    const next = [cx, cy, zoom, w, h, player.x, player.y, player.angle, lightOn, shadowOn, CONFIG.lightRange, CONFIG.fov, quality.lightEnergy, quality.bounceStrength, quality.volumeVisibility, quality.volumeMaterial, quality.extinction.join(), uploads, visible.length, inspection].join('/');
    if (next !== key) {
        if (surface.width !== w) surface.width = w; if (surface.height !== h) surface.height = h; width = w; height = h;
        const viewProj = multiply(perspective(2 * Math.atan(halfH / D), halfW / halfH, D * .3, D + VOLUME_DEPTH + 200), lookAt([cx, cy, -D], [cx, cy, 0], [0, -1, 0]));
        const lightPos = [player.x, player.y, 0], dir = [Math.cos(player.angle) * Math.cos(TORCH_PITCH), Math.sin(player.angle) * Math.cos(TORCH_PITCH), Math.sin(TORCH_PITCH)], range = CONFIG.lightRange;
        const lightVP = multiply(perspective(CONFIG.fov * Math.PI / 180, 1, 8, Math.max(1100, range * 1.3)), lookAt(lightPos, [lightPos[0] + dir[0], lightPos[1] + dir[1], lightPos[2] + dir[2]], [0, 0, -1]));
        gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enableVertexAttribArray(0);
        if (shadowOn) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.viewport(0, 0, SHADOW, SHADOW); gl.clearColor(0, 0, 0, 1); gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null); gl.disableVertexAttribArray(1);
            gl.useProgram(depth.p); gl.uniformMatrix4fv(depth.u.lightVP, false, lightVP); drawChunks(shadowCasters); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.enableVertexAttribArray(1); gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT); gl.useProgram(main.p);
        updateBounce(t, lightOn && !inspection, range, quality.bounceStrength * quality.lightEnergy / 3.4);
        gl.uniformMatrix4fv(main.u.viewProj, false, viewProj); gl.uniformMatrix4fv(main.u.lightVP, false, lightVP);
        gl.uniform3fv(main.u.lightPos, lightPos); gl.uniform3fv(main.u.lightDir, dir);
        gl.uniform4fv(main.u['bounce[0]'], bounceLights);
        gl.uniform4fv(main.u['bounceNormal[0]'], bounceNormals); gl.uniform1f(main.u.fov, CONFIG.fov * Math.PI / 180);
        gl.uniform3f(main.u.extinction, quality.extinction[0], quality.extinction[1], quality.extinction[2]);
        gl.uniform1f(main.u.range, range); gl.uniform1f(main.u.farDepth, VOLUME_DEPTH); gl.uniform1f(main.u.enabled, lightOn ? 1 : 0);
        gl.uniform1f(main.u.shadowOn, shadowOn ? 1 : 0); gl.uniform1f(main.u.energy, quality.lightEnergy); gl.uniform1f(main.u.inspect, inspection);
        gl.uniform1f(main.u.visibilityFill, quality.volumeVisibility); gl.uniform1f(main.u.materialMix, quality.volumeMaterial);
        gl.uniform1f(main.u.surfaceY, (state.mazeRescue as any)?.continuous?.surfaceY || 0); gl.uniform1f(main.u.fadeTop, t.y);
        gl.uniform2f(main.u.gridOrigin, t.x, t.y); gl.uniform2f(main.u.gridSize, t.cols, t.rows); gl.uniform1f(main.u.cellSize, t.step);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sliceTex); gl.uniform1i(main.u.sliceTex, 1);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowOn ? shadowTex : null); gl.uniform1i(main.u.shadowMap, 0);
        drawChunks(visible); gl.flush(); draws++; key = next;
    } else cacheHits++;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(surface, cx - halfW, cy - halfH, halfW * 2, halfH * 2); ctx.restore(); cpuMs = Math.max(0, now() - start);
    shownFrame = frame; return true;
}
// 游戏的黑暗遮罩是为二维画面做的，盖在洞壁上会把洞壁再压暗一次，反照会被盖掉。
// 这里把遮罩压掉的那部分洞壁亮度原样加回去：洞壁最终只按自己的三维光照显示，人物、鱼和绳索仍然被遮罩压暗。
// 要在遮罩画完之后、屏幕坐标下调用。mask 是遮罩画布，clipTop 是水面在屏幕上的位置。
export function restoreKarstVolumeLight(ctx: CanvasRenderingContext2D, mask: any, maskW: number, maskH: number, clipTop: number, volumeMix: number) {
    if (!gl || !main || shownFrame !== frame || !width || !height || !mask) return;
    if (!overlay) { overlay = wx.createCanvas(); overlayCtx = overlay.getContext('2d'); }
    if (!overlayCtx) return;
    if (overlay.width !== width) overlay.width = width; if (overlay.height !== height) overlay.height = height;
    overlayCtx.globalCompositeOperation = 'source-over'; overlayCtx.clearRect(0, 0, width, height); overlayCtx.drawImage(surface, 0, 0, width, height);
    overlayCtx.globalCompositeOperation = 'destination-in'; overlayCtx.drawImage(mask, 0, 0, maskW, maskH, 0, 0, width, height);
    ctx.save(); ctx.beginPath(); ctx.rect(0, clipTop, logicW, Math.max(0, logicH - clipTop)); ctx.clip();
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(overlay, 0, 0, width, height, 0, 0, logicW, logicH);
    ctx.restore();
}
export function getKarstVolumeBounceLights() { return bounceLights; }
export function getKarstVolumeBounceNormals() { return bounceNormals; }
export function inspectKarstVolume(mode = 0) { inspection = mode; key = ''; }
export function loseKarstVolumeContext() {
    const extension = gl?.getExtension('WEBGL_lose_context'); if (!extension) return false;
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 120); return true;
}
export function karstVolumeStats() {
    let bytes = 0, cpuProbeBytes = 0; for (const c of chunks.values()) { bytes += c.bytes; cpuProbeBytes += c.probe.values.byteLength; }
    return { ready: !!gl && !!main, failure, chunks: chunks.size, emptyChunks: empty.size, pending, triangles, builds, lastBuildMs, maxBuildMs, longestStepMs: longestStep, droppedQuads: dropped, shadows: !!shadowFB, draws, cacheHits, lostCount,
        visiblePending, shadowPending, preloadPending, visibleChunks, shadowChunks, offscreenShadowChunks, bounceCount, returnedLight, bounceProbeMs, cpuProbeBytes,
        surfacePixels: width * height, cpuMs, gpuBytes: bytes + (terrain ? terrain.cols * terrain.rows : 0) + (shadowFB ? SHADOW * SHADOW * 8 : 0) + width * height * 8 };
}
export function releaseKarstVolume() { dispose(); retryAt = 0; failure = ''; width = height = 0; shownFrame = -1; if (surface) surface.width = surface.height = 1; if (overlay) overlay.width = overlay.height = 1; }
