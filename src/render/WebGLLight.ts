// WebGL 光照渲染器
// 用独立 WebGL canvas 替代 Canvas 2D lightLayer，将光照计算移到 GPU
// CPU 端仍负责射线碰撞，结果通过纹理传给 shader
//
// 【双 WebGL context 架构】（iOS 体积光修复）
// 历史上遮罩 pass 和体积光 pass 共用同一张 glCanvas：
//   1) 体积光 pass 画到 glCanvas
//   2) ctx.drawImage(glCanvas) 合成体积光
//   3) 遮罩 pass 的 gl.clear() 清空 glCanvas
//   4) 遮罩 pass 画遮罩到 glCanvas
//   5) ctx.drawImage(glCanvas) 合成遮罩
// 在 iOS WebKit 上，drawImage(WebGLCanvas) 不是立即复制像素，而是保留引用，
// 等主画布真正显示时才去源 canvas 读取。到那时 glCanvas 上已经是遮罩内容，
// 所以体积光和遮罩都读到遮罩像素，表现为"体积光完全消失、遮罩正常"。
// 本轮改为两套完全独立的 WebGL context（各自一个 canvas/gl/program/buffer/textures），
// 两次 drawImage 从不同的源 canvas 读取，iOS 延迟读取也能读到正确内容。

import { CONFIG } from '../core/config';
import { canvas, dpr, logicW, logicH } from './Canvas';
import { VERT_SRC } from './shaders/vert.glsl';
import { MASK_FRAG_SRC } from './shaders/maskFrag.glsl';
import { VOLUMETRIC_FRAG_SRC } from './shaders/volumetricFrag.glsl';
import { getLevelParams, onQualitySwitch } from './QualityManager';

// ============ 单个 WebGL 渲染器上下文（一个 canvas + 一个 gl + 一个 program + 一套纹理） ============
interface GLCtx {
    canvas: any;                                          // WebGL 目标 canvas（wx.createCanvas 出来）
    gl: WebGLRenderingContext | null;                     // WebGL 上下文
    program: WebGLProgram | null;                         // 该 context 专属 program
    posBuffer: WebGLBuffer | null;                        // 全屏四边形顶点 buffer
    polyTexture: WebGLTexture | null;                     // 光锥多边形纹理
    polyTexData: Float32Array | null;                     // 上传前的 CPU 端 buffer
    vplTexture: WebGLTexture | null;                      // VPL 点纹理
    vplTexData: Float32Array | null;                      // 上传前的 CPU 端 buffer
    uniforms: Record<string, WebGLUniformLocation | null>;
    useFloatTex: boolean;                                 // 是否支持 OES_texture_float
    npcVolGate: number;                                   // 画质档位缓存（体积光 context 才用）
}

function createEmptyCtx(): GLCtx {
    return {
        canvas: wx.createCanvas(),
        gl: null,
        program: null,
        posBuffer: null,
        polyTexture: null,
        polyTexData: null,
        vplTexture: null,
        vplTexData: null,
        uniforms: {},
        useFloatTex: false,
        npcVolGate: 1.0,
    };
}

// 两套完全独立的上下文：遮罩 / 体积光
const _maskCtx: GLCtx = createEmptyCtx();
const _volCtx: GLCtx = createEmptyCtx();

// 初始分辨率
_maskCtx.canvas.width = canvas.width;
_maskCtx.canvas.height = canvas.height;
_volCtx.canvas.width = canvas.width;
_volCtx.canvas.height = canvas.height;

// 光锥多边形纹理常量
const POLY_TEX_WIDTH = 512; // 光锥角度分辨率，越高光锥边缘越平滑
const MAX_VPL_POINTS = 128; // VPL 点上限

// 当前 WebGL 画布相对主画布的分辨率缩放（画质档位控制）
let _currentScale = 1.0;

// 根据画质档位调整两张 glCanvas 的实际像素尺寸
// scale 取 0~1，越小渲染负担越轻，drawImage 合成时自动放大回主画布尺寸
function applyQualityScale(scale: number): void {
    if (scale <= 0) scale = 0.25;
    if (scale > 1) scale = 1;
    _currentScale = scale;
    const w = Math.max(2, Math.floor(canvas.width * scale));
    const h = Math.max(2, Math.floor(canvas.height * scale));
    // 两张 canvas 必须同步缩放，否则合成时源矩形会不一致
    if (_maskCtx.canvas.width !== w) _maskCtx.canvas.width = w;
    if (_maskCtx.canvas.height !== h) _maskCtx.canvas.height = h;
    if (_volCtx.canvas.width !== w) _volCtx.canvas.width = w;
    if (_volCtx.canvas.height !== h) _volCtx.canvas.height = h;
}

// 导出：合成阶段（Render.ts 的 drawImage）需要知道当前 glCanvas 实际像素尺寸
// 两张 canvas 尺寸始终同步，任取其一即可
export function getGLCanvasPixelSize(): { w: number, h: number } {
    return { w: _maskCtx.canvas.width, h: _maskCtx.canvas.height };
}

// Shader 源码从独立文件导入，见 src/render/shaders/ 目录

// ============ 初始化 ============
let _initialized = false;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
    const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;
    
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(prog));
        gl.deleteProgram(prog);
        return null;
    }
    return prog;
}

function getUniforms(gl: WebGLRenderingContext, prog: WebGLProgram, names: string[]): Record<string, WebGLUniformLocation | null> {
    const result: Record<string, WebGLUniformLocation | null> = {};
    for (const name of names) {
        result[name] = gl.getUniformLocation(prog, name);
    }
    return result;
}

function createDataTexture(gl: WebGLRenderingContext, width: number, height: number, useFloatTex: boolean): { texture: WebGLTexture | null, data: Float32Array } {
    const texture = gl.createTexture();
    const data = new Float32Array(width * height * 4);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // 手机 WebGL 1.0 很多不支持 float 纹理的 LINEAR 过滤
    // 统一用 NEAREST 避免依赖 OES_texture_float_linear 扩展
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // 必须上传初始数据，否则手机 GPU 上纹理未分配存储，采样结果未定义
    if (useFloatTex) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data);
    } else {
        const byteData = new Uint8Array(width * height * 4);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, byteData);
    }
    return { texture, data };
}

// 初始化单个 GLCtx（一个 canvas + gl context + program + buffers + textures）
// fragSrc 决定该 context 用什么 fragment shader（遮罩 / 体积光）
// 返回 true 表示初始化成功
function initOneCtx(ctx: GLCtx, fragSrc: string, label: string): boolean {
    // preserveDrawingBuffer: true 是关键！
    // 没有它，WebGL canvas 的内容在合成（drawImage）后会被清空
    // 手机上 drawImage 读取 WebGL canvas 时，如果 buffer 已被清空就会读到空白
    const gl = (ctx.canvas as any).getContext('webgl', {
        preserveDrawingBuffer: true,
        antialias: false,
        alpha: true,
        premultipliedAlpha: false
    }) as WebGLRenderingContext | null;
    if (!gl) {
        console.error('[WebGL] ' + label + ' context 获取失败');
        return false;
    }

    // 检查初始 GL 状态
    let glError = gl.getError();
    if (glError !== gl.NO_ERROR) {
        console.error('[WebGL] ' + label + ' 初始状态异常，错误码:', glError);
        return false;
    }

    ctx.gl = gl;

    // 检测 float 纹理支持
    const floatExt = gl.getExtension('OES_texture_float');
    const floatLinearExt = gl.getExtension('OES_texture_float_linear');
    ctx.useFloatTex = !!floatExt;
    console.log('[WebGL] ' + label + ' OES_texture_float:', !!floatExt, 'linear:', !!floatLinearExt, '使用float纹理:', ctx.useFloatTex);

    // 创建全屏四边形顶点缓冲
    ctx.posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ctx.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1,  -1, 1,
        -1,  1,  1, -1,   1, 1
    ]), gl.STATIC_DRAW);

    // 编译 shader program
    ctx.program = createProgram(gl, VERT_SRC, fragSrc);
    if (!ctx.program) {
        console.error('[WebGL] ' + label + ' shader 编译失败');
        ctx.gl = null;
        return false;
    }

    // 获取 uniform 位置
    const uniformNames = [
        'u_resolution', 'u_playerPos', 'u_cameraPos', 'u_zoom', 'u_shake',
        'u_angle', 'u_fov', 'u_maxDist', 'u_flashlightActive',
        'u_centerFov', 'u_selfGlowRadius', 'u_selfGlowIntensity',
        'u_ambientRadius', 'u_ambientIntensity', 'u_maskAlpha',
        'u_polyTex', 'u_polyCount',
        'u_vplTex', 'u_vplCount',
        'u_npcPos', 'u_npcAngle', 'u_npcDist', 'u_npcActive',
        // 手电筒参数化
        'u_flatRatio', 'u_edgeFadeRatio', 'u_maskPow', 'u_maskMinAlpha',
        'u_vplRadius', 'u_vplMaskStrength',
        'u_scatterIntensity', 'u_scatterDistRatio', 'u_scatterRadiusRatio',
        // 体积光参数化
        'u_volOuterIntensity', 'u_volCenterIntensity',
        'u_volOuterColor', 'u_volCenterColor',
        'u_vplVolStrength',
        // 后处理
        'u_exposure', 'u_enableToneMapping', 'u_toneMappingMode', 'u_reinhardWhitePoint'
    ];
    ctx.uniforms = getUniforms(gl, ctx.program, uniformNames);

    // 创建数据纹理
    const polyResult = createDataTexture(gl, POLY_TEX_WIDTH, 1, ctx.useFloatTex);
    ctx.polyTexture = polyResult.texture;
    ctx.polyTexData = polyResult.data;

    const vplResult = createDataTexture(gl, MAX_VPL_POINTS, 1, ctx.useFloatTex);
    ctx.vplTexture = vplResult.texture;
    ctx.vplTexData = vplResult.data;

    // 验证性渲染测试：实际执行一次 draw call，检查是否有 GL 错误
    gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(ctx.program);
    const testPosLoc = gl.getAttribLocation(ctx.program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, ctx.posBuffer);
    gl.enableVertexAttribArray(testPosLoc);
    gl.vertexAttribPointer(testPosLoc, 2, gl.FLOAT, false, 0, 0);
    // 设置必要的 uniform 避免 shader 报错
    const u = ctx.uniforms;
    if (u['u_resolution']) gl.uniform2f(u['u_resolution']!, logicW, logicH);
    if (u['u_maskAlpha']) gl.uniform1f(u['u_maskAlpha']!, 0.0);
    if (u['u_flashlightActive']) gl.uniform1f(u['u_flashlightActive']!, 0.0);
    if (u['u_npcActive']) gl.uniform1f(u['u_npcActive']!, 0.0);
    if (u['u_polyCount']) gl.uniform1f(u['u_polyCount']!, 0.0);
    if (u['u_vplCount']) gl.uniform1f(u['u_vplCount']!, 0.0);
    if (u['u_zoom']) gl.uniform1f(u['u_zoom']!, 1.0);
    if (u['u_playerPos']) gl.uniform2f(u['u_playerPos']!, 0, 0);
    if (u['u_cameraPos']) gl.uniform2f(u['u_cameraPos']!, 0, 0);
    if (u['u_shake']) gl.uniform2f(u['u_shake']!, 0, 0);
    // 绑定纹理
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ctx.polyTexture);
    if (u['u_polyTex']) gl.uniform1i(u['u_polyTex']!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ctx.vplTexture);
    if (u['u_vplTex']) gl.uniform1i(u['u_vplTex']!, 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    glError = gl.getError();
    if (glError !== gl.NO_ERROR) {
        console.error('[WebGL] ' + label + ' 验证渲染失败，错误码:', glError);
        ctx.gl = null;
        return false;
    }

    console.log('[WebGL] ' + label + ' 初始化成功，画布:', ctx.canvas.width, 'x', ctx.canvas.height);
    return true;
}

export function initWebGLLight(): boolean {
    if (_initialized) return _maskCtx.gl !== null && _volCtx.gl !== null;
    _initialized = true;

    try {
        // 独立初始化遮罩 context
        if (!initOneCtx(_maskCtx, MASK_FRAG_SRC, 'mask')) {
            console.error('[WebGL] 遮罩 context 初始化失败，回退到 Canvas 2D');
            _maskCtx.gl = null;
            _volCtx.gl = null;
            return false;
        }
        // 独立初始化体积光 context
        if (!initOneCtx(_volCtx, VOLUMETRIC_FRAG_SRC, 'vol')) {
            console.error('[WebGL] 体积光 context 初始化失败，回退到 Canvas 2D');
            _maskCtx.gl = null;
            _volCtx.gl = null;
            return false;
        }

        // 打印一个 context 的 renderer / version 供排障
        const maskGL = _maskCtx.gl!;
        console.log('[WebGL] GL_RENDERER:', maskGL.getParameter(maskGL.RENDERER), 'GL_VERSION:', maskGL.getParameter(maskGL.VERSION));

        // 注册画质档位切换回调：档位变化时同步两张 glCanvas 分辨率
        onQualitySwitch((_label, params) => {
            applyQualityScale(params.scale);
        });
        // 初始化时按当前档位立即调整一次
        try {
            const initParams = getLevelParams();
            applyQualityScale(initParams.scale);
        } catch (e) { /* ignore */ }

        return true;
    } catch (e) {
        console.error('WebGL 初始化异常:', e, '回退到 Canvas 2D');
        _maskCtx.gl = null;
        _volCtx.gl = null;
        return false;
    }
}

// ============ 数据上传 ============
// 因为遮罩和体积光现在是两套独立的 WebGL context，纹理不能共享，必须各自上传一份。
// 同一帧内两次上传使用的是同一份源数据，只是 texImage2D 目标不同。

// 内部：把已编码好的 polyTexData 写到指定 ctx 的 polyTexture
function uploadPolyToCtx(ctx: GLCtx, srcData: Float32Array) {
    if (!ctx.gl || !ctx.polyTexture) return;
    const gl = ctx.gl;
    gl.bindTexture(gl.TEXTURE_2D, ctx.polyTexture);
    if (ctx.useFloatTex) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, POLY_TEX_WIDTH, 1, 0, gl.RGBA, gl.FLOAT, srcData);
    } else {
        const byteData = new Uint8Array(POLY_TEX_WIDTH * 4);
        for (let i = 0; i < POLY_TEX_WIDTH; i++) {
            byteData[i * 4] = Math.min(255, Math.floor(srcData[i * 4] * 255));
            byteData[i * 4 + 1] = 0;
            byteData[i * 4 + 2] = 0;
            byteData[i * 4 + 3] = 255;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, POLY_TEX_WIDTH, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, byteData);
    }
}

// 将光锥多边形数据编码并同时上传到两个 context
export function uploadPolyData(poly: any[], maxDist: number) {
    if (!_maskCtx.gl || !_volCtx.gl) return;
    // 编码一次到 mask 的 CPU 端 buffer（作为主源），然后 copy 到 vol 的 CPU 端 buffer
    const src = _maskCtx.polyTexData;
    if (!src) return;
    src.fill(0);
    // 编码：每个射线点存储归一化距离
    for (let i = 0; i < poly.length && i < POLY_TEX_WIDTH; i++) {
        const normalizedDist = poly[i].dist / maxDist;
        src[i * 4] = normalizedDist;     // R: 归一化距离
        src[i * 4 + 1] = 0;
        src[i * 4 + 2] = 0;
        src[i * 4 + 3] = 1;
    }
    // 同步到 vol 的 CPU 端 buffer（虽然 upload 时只用到 src，但保留两份 buffer 用于调试一致性）
    if (_volCtx.polyTexData) _volCtx.polyTexData.set(src);

    uploadPolyToCtx(_maskCtx, src);
    uploadPolyToCtx(_volCtx, src);
}

// 内部：把已编码好的 vplTexData 写到指定 ctx 的 vplTexture
function uploadVPLToCtx(ctx: GLCtx, srcData: Float32Array) {
    if (!ctx.gl || !ctx.vplTexture) return;
    const gl = ctx.gl;
    gl.bindTexture(gl.TEXTURE_2D, ctx.vplTexture);
    if (ctx.useFloatTex) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_VPL_POINTS, 1, 0, gl.RGBA, gl.FLOAT, srcData);
    } else {
        // VPL 数据包含世界坐标，UNSIGNED_BYTE 精度不够
        // UNSIGNED_BYTE 模式下禁用 VPL（alpha 全 0）
        const byteData = new Uint8Array(MAX_VPL_POINTS * 4);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_VPL_POINTS, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, byteData);
    }
}

// 将 VPL 数据编码到纹理（受画质档位 vplMax 限制：低档上传更少点，少跑 shader 内循环）
// 编码一次 → 同步到两个 context
export function uploadVPLData(poly: any[], maxDist: number, getWallColor?: (r: number, c: number) => { r: number, g: number, b: number }) {
    if (!_maskCtx.gl || !_volCtx.gl) return 0;
    const src = _maskCtx.vplTexData;
    if (!src) return 0;
    src.fill(0);

    // 根据当前画质档位读取 VPL 上限（不超过 MAX_VPL_POINTS）
    let vplCap = MAX_VPL_POINTS;
    try {
        const qp = getLevelParams();
        if (qp && qp.vplMax && qp.vplMax > 0) {
            vplCap = Math.min(MAX_VPL_POINTS, Math.floor(qp.vplMax));
        }
    } catch (e) { /* ignore */ }

    // 第一遍：收集所有"打到墙上"的候选射线索引
    // 之所以两遍走，是因为旧实现用 `i % 2 === 0 && vplIdx < vplCap` 从 i=0 线性填到上限就停，
    // 在 vplCap < 候选总数/2 的档位下，VPL 只会覆盖光锥"起始半边"，导致 VPL 亮堆和手电主轴看起来有固定角度偏移。
    // 现在改成先收集候选，再按均匀步长抽样覆盖整个光锥，保证左右对称。
    const candidates: number[] = [];
    const distThreshold = maxDist * 0.95;
    for (let i = 0; i < poly.length; i++) {
        if (poly[i].dist <= distThreshold) candidates.push(i);
    }

    // 光锥角度权重参数：让靠光锥中心的 VPL 更亮、靠边缘的 VPL 更暗
    const rayCount = Math.max(1, poly.length - 1);
    const rayHalf = rayCount * 0.5;
    const conePow = CONFIG.flashlight.vplConeFalloffPow;
    const coneExp = CONFIG.flashlight.vplConeFalloffExp;
    const coneFloor = CONFIG.flashlight.vplConeEdgeFloor;

    let vplIdx = 0;
    const candN = candidates.length;
    if (candN > 0 && vplCap > 0) {
        const takeN = Math.min(candN, vplCap);
        const stride = candN / takeN;
        const startOffset = stride * 0.5;

        for (let k = 0; k < takeN; k++) {
            const ci = Math.min(candN - 1, Math.floor(startOffset + k * stride));
            const rayI = candidates[ci];
            const p = poly[rayI];

            // 径向衰减
            const distRatio = p.dist / maxDist;
            const distFade = Math.max(0, 1 - distRatio * distRatio);

            // 角度衰减
            const t = (rayI - rayHalf) / rayHalf;
            const absT = Math.min(1, Math.abs(t));
            const coneRaw = Math.pow(Math.max(0, 1 - Math.pow(absT, conePow)), coneExp);
            const coneWeight = Math.max(coneFloor, coneRaw);

            const bounceAlpha = CONFIG.flashlight.vplBounceBase * distFade * coneWeight;

            // 墙壁颜色亮度（暂未接入按墙体取色，用默认值）
            let colorBrightness = 0.6;
            if (getWallColor) {
                colorBrightness = 0.6;
            }

            src[vplIdx * 4] = p.x;                 // R: 世界X
            src[vplIdx * 4 + 1] = p.y;             // G: 世界Y
            src[vplIdx * 4 + 2] = colorBrightness; // B: 颜色亮度
            src[vplIdx * 4 + 3] = bounceAlpha;     // A: alpha
            vplIdx++;
        }
    }

    // 同步到 vol 的 CPU 端 buffer
    if (_volCtx.vplTexData) _volCtx.vplTexData.set(src);

    uploadVPLToCtx(_maskCtx, src);
    uploadVPLToCtx(_volCtx, src);

    return vplIdx;
}

// ============ 渲染 ============

// 绑定当前 ctx 的 program 和顶点 buffer
function setupProgram(ctx: GLCtx) {
    const gl = ctx.gl;
    if (!gl || !ctx.program || !ctx.posBuffer) return;

    gl.useProgram(ctx.program);

    // 绑定顶点
    const posLoc = gl.getAttribLocation(ctx.program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, ctx.posBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
}

// ============ 自动曝光状态 ============
let _autoExposureValue = 1.0;  // 当前自动曝光值（平滑后）
let _lastFrameAvgLight = 0.25; // 上一帧的平均亮度估算

// 根据配置计算当前帧的曝光值
function computeExposure(flashlightActive: boolean): number {
    const pp = CONFIG.postProcess;
    let exposure = 1.0;

    // 自动曝光：根据上一帧估算的平均亮度调整
    if (pp.enableAutoExposure) {
        let estimatedBrightness = 0.05;
        if (flashlightActive) estimatedBrightness += 0.35;
        estimatedBrightness += CONFIG.selfGlowIntensity * 0.3;
        estimatedBrightness += (CONFIG.ambientPerceptionIntensity || 0.35) * 0.15;

        _lastFrameAvgLight = estimatedBrightness;

        let targetExposure = pp.autoExposureTarget / Math.max(_lastFrameAvgLight, 0.01);
        targetExposure = Math.max(pp.autoExposureMin, Math.min(pp.autoExposureMax, targetExposure));

        _autoExposureValue += (targetExposure - _autoExposureValue) * pp.autoExposureSpeed;
        _autoExposureValue = Math.max(pp.autoExposureMin, Math.min(pp.autoExposureMax, _autoExposureValue));

        exposure = _autoExposureValue;
    }

    if (pp.enableManualExposure) {
        exposure *= pp.manualExposure;
    }

    return exposure;
}

// 设置通用 uniform（两个 context 都用这套）
function setCommonUniforms(ctx: GLCtx, params: {
    playerX: number, playerY: number,
    cameraX: number, cameraY: number,
    zoom: number, shakeX: number, shakeY: number,
    angle: number, maxDist: number,
    flashlightActive: boolean,
    npcX: number, npcY: number, npcAngle: number, npcDist: number, npcActive: boolean,
    polyCount: number, vplCount: number
}) {
    const gl = ctx.gl;
    if (!gl) return;
    const u = ctx.uniforms;

    const fovRad = CONFIG.fov * Math.PI / 180;
    const centerFovRad = CONFIG.flashlightCenterFov * Math.PI / 180;

    gl.uniform2f(u['u_resolution']!, logicW, logicH);
    gl.uniform2f(u['u_playerPos']!, params.playerX, params.playerY);
    gl.uniform2f(u['u_cameraPos']!, params.cameraX, params.cameraY);
    gl.uniform1f(u['u_zoom']!, params.zoom);
    gl.uniform2f(u['u_shake']!, params.shakeX, params.shakeY);
    gl.uniform1f(u['u_angle']!, params.angle);
    gl.uniform1f(u['u_fov']!, fovRad);
    gl.uniform1f(u['u_maxDist']!, params.maxDist);
    gl.uniform1f(u['u_flashlightActive']!, params.flashlightActive ? 1.0 : 0.0);
    gl.uniform1f(u['u_centerFov']!, centerFovRad);
    gl.uniform1f(u['u_polyCount']!, params.polyCount);
    gl.uniform1f(u['u_vplCount']!, params.vplCount);

    // NPC
    gl.uniform2f(u['u_npcPos']!, params.npcX, params.npcY);
    gl.uniform1f(u['u_npcAngle']!, params.npcAngle);
    gl.uniform1f(u['u_npcDist']!, params.npcDist);
    gl.uniform1f(u['u_npcActive']!, params.npcActive ? 1.0 : 0.0);

    // 手电筒参数化
    const fl = CONFIG.flashlight;
    // 按画质档位可能关闭漫散射（低档）
    let scatterGate = 1.0;
    let npcVolGate = 1.0;
    try {
        const qp = getLevelParams();
        if (qp) {
            scatterGate = qp.enableScatter ? 1.0 : 0.0;
            npcVolGate = qp.enableNpcVol ? 1.0 : 0.0;
        }
    } catch (e) { /* ignore */ }
    gl.uniform1f(u['u_flatRatio']!, fl.flatRatio);
    gl.uniform1f(u['u_edgeFadeRatio']!, fl.edgeFadeRatio);
    gl.uniform1f(u['u_maskPow']!, fl.maskPow);
    gl.uniform1f(u['u_maskMinAlpha']!, fl.maskMinAlpha);
    gl.uniform1f(u['u_vplRadius']!, fl.vplRadius);
    gl.uniform1f(u['u_vplMaskStrength']!, fl.vplMaskStrength);
    gl.uniform1f(u['u_scatterIntensity']!, fl.scatterIntensity * scatterGate);
    gl.uniform1f(u['u_scatterDistRatio']!, fl.scatterDistRatio);
    gl.uniform1f(u['u_scatterRadiusRatio']!, fl.scatterRadiusRatio);
    // 体积光参数化
    gl.uniform1f(u['u_volOuterIntensity']!, fl.volOuterIntensity);
    gl.uniform1f(u['u_volCenterIntensity']!, fl.volCenterIntensity);
    gl.uniform3f(u['u_volOuterColor']!, fl.volOuterColor[0], fl.volOuterColor[1], fl.volOuterColor[2]);
    gl.uniform3f(u['u_volCenterColor']!, fl.volCenterColor[0], fl.volCenterColor[1], fl.volCenterColor[2]);
    gl.uniform1f(u['u_vplVolStrength']!, fl.vplVolStrength);
    // 缓存 npcVolGate 供体积光程序在 renderVolumetricLight 里使用
    ctx.npcVolGate = npcVolGate;

    // 后处理参数
    const pp = CONFIG.postProcess;
    const exposure = computeExposure(params.flashlightActive);
    gl.uniform1f(u['u_exposure']!, exposure);
    gl.uniform1f(u['u_enableToneMapping']!, pp.enableToneMapping ? 1.0 : 0.0);
    gl.uniform1f(u['u_toneMappingMode']!, pp.toneMappingMode);
    gl.uniform1f(u['u_reinhardWhitePoint']!, pp.reinhardWhitePoint);
}

// 绑定当前 ctx 的纹理（每个 context 有自己的 texture 对象）
function bindTextures(ctx: GLCtx) {
    const gl = ctx.gl;
    if (!gl) return;
    const u = ctx.uniforms;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ctx.polyTexture);
    gl.uniform1i(u['u_polyTex']!, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ctx.vplTexture);
    gl.uniform1i(u['u_vplTex']!, 1);
}

// 渲染光照遮罩层（独立的遮罩 canvas）
export function renderLightMask(params: {
    playerX: number, playerY: number,
    cameraX: number, cameraY: number,
    zoom: number, shakeX: number, shakeY: number,
    angle: number, maxDist: number,
    flashlightActive: boolean,
    maskAlpha: number,
    npcX: number, npcY: number, npcAngle: number, npcDist: number, npcActive: boolean,
    polyCount: number, vplCount: number
}) {
    const ctx = _maskCtx;
    const gl = ctx.gl;
    if (!gl || !ctx.program) return;

    gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    // 非预乘 alpha：shader 输出是 vec4(color, a)，走标准 source-over
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    setupProgram(ctx);
    setCommonUniforms(ctx, params);

    const u = ctx.uniforms;
    // 遮罩特有 uniforms
    gl.uniform1f(u['u_selfGlowRadius']!, CONFIG.selfGlowRadius);
    gl.uniform1f(u['u_selfGlowIntensity']!, CONFIG.selfGlowIntensity);
    gl.uniform1f(u['u_ambientRadius']!, CONFIG.ambientPerceptionRadius || 80);
    gl.uniform1f(u['u_ambientIntensity']!, CONFIG.ambientPerceptionIntensity || 0.35);
    gl.uniform1f(u['u_maskAlpha']!, params.maskAlpha);

    bindTextures(ctx);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // 手机上必须 flush，确保 GPU 命令执行完毕后 drawImage 才能正确读取
    gl.flush();
}

// 渲染体积光层（独立的体积光 canvas）
export function renderVolumetricLight(params: {
    playerX: number, playerY: number,
    cameraX: number, cameraY: number,
    zoom: number, shakeX: number, shakeY: number,
    angle: number, maxDist: number,
    flashlightActive: boolean,
    npcX: number, npcY: number, npcAngle: number, npcDist: number, npcActive: boolean,
    polyCount: number, vplCount: number
}) {
    const ctx = _volCtx;
    const gl = ctx.gl;
    if (!gl || !ctx.program) return;

    gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    // 非预乘 alpha 的 additive 混合：shader 输出 vec4(color, a)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    setupProgram(ctx);
    setCommonUniforms(ctx, params);

    // 画质档位：低档关闭 NPC 体积光（遮罩仍保留，避免完全看不到 NPC）
    if (ctx.npcVolGate === 0) {
        gl.uniform1f(ctx.uniforms['u_npcActive']!, 0.0);
    }

    bindTextures(ctx);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // 手机上必须 flush
    gl.flush();
}

// 获取遮罩 canvas（用于 drawImage 合成遮罩层）
export function getGLCanvas(): any {
    return _maskCtx.canvas;
}

// 获取体积光 canvas（用于 drawImage 合成体积光层）
// iOS 修复关键：体积光和遮罩从两张独立的 canvas 读取，避免 drawImage 延迟读取踩坑
export function getVolGLCanvas(): any {
    return _volCtx.canvas;
}

// 检查 WebGL 是否可用
export function isWebGLAvailable(): boolean {
    return _maskCtx.gl !== null && _volCtx.gl !== null;
}
