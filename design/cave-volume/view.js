// 灰模查看：只负责把三维洞腔按透视投影画出来，加一盏能看出形体的手电和一束示意用的天光。材质、水体光束都不在这里。
(function () {
'use strict';
const G = window.CaveGen, $ = id => document.getElementById(id), canvas = $('gl'), hud = $('hud'), info = $('info'), ctx = hud.getContext('2d');
const query = new URLSearchParams(location.search), num = (key, fallback) => query.has(key) ? +query.get(key) : fallback;
const PERSP = [{ name: '无（正交）', d: 60000 }, { name: '弱', d: 1500 }, { name: '中', d: 900 }, { name: '强', d: 560 }], CUT = ['纯黑', '贴边受光', '暗岩纹'];
const state = { seed: num('seed', 7), persp: num('persp', 2), light: num('light', 0), tilt: num('tilt', 0), line: num('line', 0), cut: num('cut', 1), map: num('map', 0), x: 0, y: 0, angle: Math.PI / 2, mx: 0, my: 0 };
const api = window.CaveVolume = { state, cave: null, ready: false };
window.DeepTapeGame = api; // 仅为复用仓库里现成的无头浏览器截图封装，它按这个名字判断页面已加载。
const gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true });
if (!gl) { info.textContent = '此设备无法创建 WebGL，无法显示小样'; return; }
const uintIndex = gl.getExtension('OES_element_index_uint'), depthTexture = gl.getExtension('WEBGL_depth_texture');

const VERT = `attribute vec3 position; attribute vec3 normal; uniform mat4 viewProj; uniform mat4 lightVP;
varying vec3 P; varying vec3 N; varying vec4 LP;
void main(){ P=position; N=normal; LP=lightVP*vec4(position+normal*5.0,1.0); gl_Position=viewProj*vec4(position,1.0); }`;
const FRAG = `precision highp float;
varying vec3 P; varying vec3 N; varying vec4 LP;
uniform vec3 lightPos; uniform vec3 lightDir; uniform vec4 bounce; uniform vec4 sky; uniform float mode; uniform float shadowOn; uniform float cutMode;
uniform sampler2D shadowMap; uniform sampler2D sliceTex; uniform vec2 gridSize; uniform float cellSize;
float shadow(){
    if(shadowOn<0.5||LP.w<=0.0) return 1.0;
    vec3 q=LP.xyz/LP.w*0.5+0.5;
    if(q.x<0.0||q.y<0.0||q.x>1.0||q.y>1.0) return 1.0;
    float s=0.0, t=0.75/1024.0;
    s+=step(q.z-0.0004,texture2D(shadowMap,q.xy+vec2(-t,-t)).r); s+=step(q.z-0.0004,texture2D(shadowMap,q.xy+vec2(t,-t)).r);
    s+=step(q.z-0.0004,texture2D(shadowMap,q.xy+vec2(-t,t)).r); s+=step(q.z-0.0004,texture2D(shadowMap,q.xy+vec2(t,t)).r);
    return s*0.25;
}
void main(){
    if(mode>2.5){ gl_FragColor=vec4(0.55,0.74,0.72,0.20); return; } // 水面
    if(mode>1.5){ float t=clamp((sky.w-P.y)/600.0,0.0,1.0); gl_FragColor=vec4(mix(vec3(0.66,0.73,0.72),vec3(0.38,0.52,0.64),t),1.0); return; } // 天空
    vec3 n=normalize(N), col; float face=smoothstep(-2.5,-3.5,P.z), lit;
    // 天光：地面以上是露天，水潭上方有一束往下照的光，随水深变暗。这里没有算遮挡，只是示意。
    float under=max(P.y-sky.y,0.0), shaft=1.0-smoothstep(sky.z+under*0.30,sky.z+under*0.30+130.0,abs(P.x-sky.x));
    shaft=max(shaft,1.0-smoothstep(sky.y-10.0,sky.y+40.0,P.y));
    float day=shaft*(0.25+0.75*mix(max(-n.y,0.0),0.4,face))*exp(-max(P.y-sky.w,0.0)/230.0);
    if(mode<0.5){
        vec3 toL=lightPos-P; float d=length(toL); vec3 l=toL/d;
        float c=dot(-l,lightDir), diff=mix(max(dot(n,l),0.0),0.6,face);
        float cone=0.22*smoothstep(0.26,0.85,c)+0.78*smoothstep(0.80,0.96,c);
        float lum=cone*diff*shadow()*3.0/(1.0+pow(d/200.0,2.0))+(0.25+0.75*diff)*0.10/(1.0+pow(d/90.0,2.0))*smoothstep(330.0,120.0,d);
        vec3 toB=bounce.xyz-P; float db=length(toB);
        lum+=bounce.w*(0.3+0.7*mix(max(dot(n,toB/db),0.0),0.5,face))/(1.0+pow(db/130.0,2.0))*smoothstep(400.0,150.0,db);
        lum+=day*0.9;
        lit=lum/(1.0+lum); col=vec3(0.86,0.85,0.82)*lum*exp(-max(P.z,0.0)/420.0); col=col/(1.0+col);
    }else{
        float diff=0.18+0.82*max(dot(n,normalize(vec3(-0.35,-0.55,-0.76))),0.0);
        lit=0.3; col=vec3(0.62,0.66,0.68)*diff*exp(-max(P.z,0.0)/230.0);
    }
    col=pow(col,vec3(1.0/2.2));
    if(face>0.0){
        // 剖面：真实洞穴里这个面不存在，这里只是几种交代方式。
        vec3 cut=vec3(0.018,0.021,0.024); float glow=pow(lit,1.0/2.2);
        float depthIn=texture2D(sliceTex,(P.xy/cellSize+0.5)/gridSize).r*72.0;
        if(cutMode>0.5&&cutMode<1.5) cut+=vec3(0.80,0.79,0.76)*glow*exp(-depthIn/11.0)*0.75;
        if(cutMode>1.5){
            float f=fract((P.y+sin(P.x*0.013)*14.0+sin(P.x*0.0041+1.7)*30.0)/27.0), band=smoothstep(0.0,0.10,f)*(1.0-smoothstep(0.82,1.0,f));
            cut+=vec3(0.52,0.50,0.46)*glow*(0.20+0.16*band)*exp(-depthIn/60.0);
        }
        col=mix(col,cut,face);
    }
    gl_FragColor=vec4(col,1.0);
}`;
const DEPTH_VERT = 'attribute vec3 position; uniform mat4 lightVP; void main(){ gl_Position=lightVP*vec4(position,1.0); }';
const DEPTH_FRAG = 'precision mediump float; void main(){ gl_FragColor=vec4(1.0); }';
function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'position'); gl.bindAttribLocation(p, 1, 'normal'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
}
const main = program(VERT, FRAG), depth = program(DEPTH_VERT, DEPTH_FRAG);
const vb = gl.createBuffer(), nb = gl.createBuffer(), ib = gl.createBuffer(), qb = gl.createBuffer(), SHADOW = 1024;
function texture(format, type, width, height, data, filter) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, type, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, filter], [gl.TEXTURE_MAG_FILTER, filter], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
}
let shadowFB = null, shadowTex = null, sliceTex = null, count = 0, cave = null;
if (depthTexture) {
    const color = texture(gl.RGBA, gl.UNSIGNED_BYTE, SHADOW, SHADOW, null, gl.NEAREST); shadowTex = texture(gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, SHADOW, SHADOW, null, gl.NEAREST);
    shadowFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) shadowFB = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function bindMesh() {
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(1); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
}
function drawQuad(a, b, c, d, mode) { // 四个角按顺序给出
    gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), gl.DYNAMIC_DRAW); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1); gl.vertexAttrib3f(1, 0, -1, 0); gl.uniform1f(main.u.mode, mode); gl.drawArrays(gl.TRIANGLES, 0, 6);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function perspective(fovy, aspect, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
function lookAt(eye, target, up) { const z = unit(sub(eye, target)), x = unit(cross(up, z)), y = cross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]; }
function multiply(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }

function label() {
    $('b-seed').textContent = '换一个洞（种子 ' + state.seed + '）'; $('b-persp').textContent = '透视：' + PERSP[state.persp].name;
    $('b-light').textContent = state.light ? '照明：全亮看结构' : '照明：手电'; $('b-tilt').textContent = state.tilt ? '视角：斜看' : '视角：正面';
    $('b-line').textContent = '碰撞轮廓：' + (state.line ? '开' : '关'); $('b-cut').textContent = '剖面：' + CUT[state.cut]; $('b-map').textContent = state.map ? '镜头：全景' : '镜头：跟随';
    if (cave) { const r = cave.report; info.textContent = '灰模 S03 · 种子 ' + r.seed + ' · 通路校验' + (r.targetReachable && r.reachable === r.waypoints ? '通过' : '未通过') + '（' + r.reachable + '/' + r.waypoints + ' 个路点可达，岔口 ' + r.forks + '，死胡同 ' + r.deadEnds + '，回环 ' + r.loops + '，拐到后面的支洞 ' + r.backBranches + '）· 主路宽 ' + r.narrowest + ' 到 ' + r.widest + ' · 水下空腔占 ' + r.waterPercent + '% · 生成 ' + r.ms + ' 毫秒 · ' + Math.round(r.triangles / 1000) + ' 千三角面' + (shadowFB ? '' : ' · 此设备无阴影'); }
}
function rebuild() {
    cave = api.cave = G.generate(state.seed);
    if (cave.mesh.positions.length / 3 > 65535 && !uintIndex) { info.textContent = '此设备不支持大网格索引，无法显示小样'; return; }
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, cave.mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, cave.mesh.normals, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, uintIndex ? cave.mesh.indices : new Uint16Array(cave.mesh.indices), gl.STATIC_DRAW);
    const bytes = new Uint8Array(cave.NX * cave.NY); for (let i = 0; i < bytes.length; i++) bytes[i] = Math.min(255, cave.rockDepth[i] / 72 * 255);
    if (sliceTex) gl.deleteTexture(sliceTex); sliceTex = texture(gl.LUMINANCE, gl.UNSIGNED_BYTE, cave.NX, cave.NY, bytes, gl.LINEAR);
    count = cave.mesh.indices.length; state.x = cave.pool.x; state.y = cave.pool.y; state.angle = Math.PI / 2; api.ready = true; label();
}
api.set = options => { const seed = state.seed; Object.assign(state, options); if (state.seed !== seed) rebuild(); label(); };
api.go = (x, y, angle) => { state.x = x; state.y = y; if (angle !== undefined) state.angle = angle; };
api.sites = () => {
    const look = (name, p) => { // 手电朝最远能看到的方向
        let best = 0, angle = 0;
        for (let i = 0; i < 24; i++) { const a = i / 24 * 6.2832; let d = 0; while (d < 600 && cave.clearAt(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d) > .5) d += 8; if (d > best) { best = d; angle = a; } }
        return { name, x: p.x, y: p.y, angle };
    };
    return [look('hall', cave.sites.hall), look('squeeze', cave.sites.squeeze), { name: 'pool', x: cave.sites.pool.x, y: cave.sites.pool.y, angle: Math.PI / 2 }];
};

const keys = {}; let stick = null, last = 0, viewProj = new Float32Array(16);
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = 1; }); addEventListener('keyup', e => { keys[e.key.toLowerCase()] = 0; });
hud.addEventListener('pointerdown', e => { stick = { id: e.pointerId, x: e.clientX, y: e.clientY }; hud.setPointerCapture(e.pointerId); });
hud.addEventListener('pointermove', e => { if (stick && stick.id === e.pointerId) { state.mx = Math.max(-1, Math.min(1, (e.clientX - stick.x) / 46)); state.my = Math.max(-1, Math.min(1, (e.clientY - stick.y) / 46)); } });
for (const type of ['pointerup', 'pointercancel']) hud.addEventListener(type, () => { stick = null; state.mx = state.my = 0; });
$('b-seed').onclick = () => { info.textContent = '生成中…'; setTimeout(() => api.set({ seed: state.seed + 1 }), 30); };
$('b-persp').onclick = () => api.set({ persp: (state.persp + 1) % PERSP.length }); $('b-light').onclick = () => api.set({ light: state.light ? 0 : 1 });
$('b-tilt').onclick = () => api.set({ tilt: state.tilt ? 0 : 1 }); $('b-line').onclick = () => api.set({ line: state.line ? 0 : 1 });
$('b-cut').onclick = () => api.set({ cut: (state.cut + 1) % CUT.length }); $('b-map').onclick = () => api.set({ map: state.map ? 0 : 1 });

function move(dt) {
    let vx = state.mx + (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), vy = state.my + (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    const l = Math.hypot(vx, vy); if (l < .06) return; if (l > 1) { vx /= l; vy /= l; }
    let turn = Math.atan2(vy, vx) - state.angle; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); state.angle += turn * Math.min(1, dt * 7);
    const nx = state.x + vx * 170 * dt, ny = Math.max(cave.SURFACE + 8, state.y + vy * 170 * dt);
    if (cave.clearAt(nx, state.y) >= 12) state.x = nx; if (cave.clearAt(state.x, ny) >= 12) state.y = ny;
}
function project(x, y, z) {
    const m = viewProj, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * .5 + .5) * hud.width, (.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * .5) * hud.height];
}
function overlay(scale, cx, cy, span) {
    ctx.clearRect(0, 0, hud.width, hud.height);
    if (state.line) {
        const c = cave.contour; ctx.strokeStyle = 'rgba(120,235,215,.85)'; ctx.lineWidth = Math.max(1, scale * 1.3); ctx.beginPath();
        for (let i = 0; i < c.length; i += 4) { if (Math.abs(c[i] - cx) > span || Math.abs(c[i + 1] - cy) > span) continue; const a = project(c[i], c[i + 1], 0), b = project(c[i + 2], c[i + 3], 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        ctx.stroke();
    }
    const nodes = cave.plan.nodes, mark = Math.max(scale, .7), goal = nodes[cave.plan.target]; ctx.font = Math.round(13 * mark) + 'px sans-serif'; ctx.textAlign = 'center';
    const p0 = project(goal.x, goal.y, 0); ctx.strokeStyle = ctx.fillStyle = '#ffb057'; ctx.lineWidth = 2 * mark; ctx.beginPath(); ctx.arc(p0[0], p0[1], 9 * mark, 0, 6.3); ctx.stroke(); ctx.fillText('被救者', p0[0], p0[1] - 15 * mark);
    const p = project(state.x, state.y, 0); ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(state.angle); ctx.scale(scale, scale);
    ctx.fillStyle = '#1b2224'; ctx.beginPath(); ctx.ellipse(-22, 0, 12, 5, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#c9b48e'; ctx.beginPath(); ctx.ellipse(0, 0, 17, 6.5, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#5d6b6c'; ctx.fillRect(-9, -9.5, 17, 5); ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(17, 0, 2.6, 0, 6.3); ctx.fill(); ctx.restore();
}
function frame(now) {
    requestAnimationFrame(frame); if (!api.ready) return;
    const dt = Math.min(.05, (now - last) / 1000 || 0); last = now; move(dt);
    const ratio = Math.min(2, devicePixelRatio || 1), w = Math.round(canvas.clientWidth * ratio), h = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = hud.width = w; canvas.height = hud.height = h; }
    const aspect = w / h, baseH = Math.max(620, 430 / aspect), viewH = state.map ? Math.max(G.H + 40, (G.W + 40) / aspect) : baseH;
    const cx = state.map ? G.W / 2 : state.x, cy = state.map ? G.H / 2 : state.y, D = PERSP[state.persp].d * viewH / baseH;
    const eye = state.tilt ? [cx + D * .55, cy - D * .3, -D * .78] : [cx, cy, -D];
    viewProj = multiply(perspective(2 * Math.atan(viewH / 2 / D), aspect, D * .3, D + 2600), lookAt(eye, [cx, cy, state.tilt ? 90 : 0], [0, -1, 0]));
    const lightPos = [state.x, state.y, 0], lightDir = [Math.cos(state.angle), Math.sin(state.angle), 0];
    const lightVP = multiply(perspective(152 * Math.PI / 180, 1, 8, 1100), lookAt(lightPos, [lightPos[0] + lightDir[0], lightPos[1] + lightDir[1], 0], [0, 0, -1]));
    let reach = 0; while (reach < 520 && cave.clearAt(state.x + lightDir[0] * reach, state.y + lightDir[1] * reach) > .5) reach += 6;
    const back = Math.max(0, reach - 18), bounce = [state.x + lightDir[0] * back, state.y + lightDir[1] * back, 30, reach < 520 ? 1.6 / (1 + Math.pow(reach / 200, 2)) : 0];
    const shadowOn = shadowFB && !state.light, type = uintIndex ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT; gl.enable(gl.DEPTH_TEST); bindMesh();
    if (shadowOn) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.viewport(0, 0, SHADOW, SHADOW); gl.clearColor(0, 0, 0, 1); gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.useProgram(depth.p); gl.uniformMatrix4fv(depth.u.lightVP, false, lightVP); gl.drawElements(gl.TRIANGLES, count, type, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, w, h); gl.clearColor(.018, .021, .024, 1); gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT); gl.useProgram(main.p);
    gl.uniformMatrix4fv(main.u.viewProj, false, viewProj); gl.uniformMatrix4fv(main.u.lightVP, false, lightVP); gl.uniform3fv(main.u.lightPos, lightPos); gl.uniform3fv(main.u.lightDir, lightDir); gl.uniform4fv(main.u.bounce, bounce);
    gl.uniform4f(main.u.sky, cave.pool.x, cave.GROUND, 120, cave.SURFACE);
    gl.uniform1f(main.u.shadowOn, shadowOn ? 1 : 0); gl.uniform1f(main.u.cutMode, state.cut); gl.uniform2f(main.u.gridSize, cave.NX, cave.NY); gl.uniform1f(main.u.cellSize, cave.S);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sliceTex); gl.uniform1i(main.u.sliceTex, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowOn ? shadowTex : null); gl.uniform1i(main.u.shadowMap, 0);
    const far = G.ZMAX + 30, sy = cave.SURFACE;
    drawQuad([-2500, -2500, far], [G.W + 2500, -2500, far], [G.W + 2500, sy, far], [-2500, sy, far], 2);
    bindMesh(); gl.uniform1f(main.u.mode, state.light); gl.drawElements(gl.TRIANGLES, count, type, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    drawQuad([-2500, sy, -5], [G.W + 2500, sy, -5], [G.W + 2500, sy, far], [-2500, sy, far], 3);
    gl.depthMask(true); gl.disable(gl.BLEND);
    overlay(h / viewH, cx, cy, state.map ? 1e9 : viewH * Math.max(1, aspect) * (state.tilt ? 1.6 : .8));
}
label(); setTimeout(() => { rebuild(); requestAnimationFrame(frame); }, 30);
})();
