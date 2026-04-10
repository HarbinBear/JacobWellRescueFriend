// WebGL 光照渲染器
// 用一个 WebGL canvas 替代 Canvas 2D lightLayer，将光照计算移到 GPU
// CPU 端仍负责射线碰撞和泥沙计算，结果通过纹理传给 shader

import { CONFIG } from '../core/config';
import { canvas, dpr, logicW, logicH } from './Canvas';
import { VERT_SRC } from './shaders/vert.glsl';
import { MASK_FRAG_SRC } from './shaders/maskFrag.glsl';
import { VOLUMETRIC_FRAG_SRC } from './shaders/volumetricFrag.glsl';

// ============ WebGL 画布与上下文 ============
const glCanvas = wx.createCanvas();
glCanvas.width = canvas.width;
glCanvas.height = canvas.height;

let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let posBuffer: WebGLBuffer | null = null;

// 光锥多边形纹理（将射线碰撞结果编码为纹理）
let polyTexture: WebGLTexture | null = null;
let polyTexData: Float32Array | null = null;
const POLY_TEX_WIDTH = 512; // 光锥角度分辨率，越高光锥边缘越平滑

// 泥沙衰减纹理
let siltTexture: WebGLTexture | null = null;
let siltTexData: Float32Array | null = null;
const SILT_TEX_HEIGHT = 32; // 最多32步

// VPL 点纹理（存储反弹光位置和颜色）
let vplTexture: WebGLTexture | null = null;
let vplTexData: Float32Array | null = null;
const MAX_VPL_POINTS = 128;

// uniform 位置缓存
let uniforms: Record<string, WebGLUniformLocation | null> = {};

// Shader 源码从独立文件导入，见 src/render/shaders/ 目录

// ============ 初始化 ============
let _initialized = false;
let _maskProgram: WebGLProgram | null = null;
let _volProgram: WebGLProgram | null = null;
let _maskUniforms: Record<string, WebGLUniformLocation | null> = {};
let _volUniforms: Record<string, WebGLUniformLocation | null> = {};

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

// 是否使用 float 纹理（初始化时检测）
let _useFloatTex = false;

function createDataTexture(gl: WebGLRenderingContext, width: number, height: number): { texture: WebGLTexture | null, data: Float32Array } {
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
    if (_useFloatTex) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data);
    } else {
        const byteData = new Uint8Array(width * height * 4);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, byteData);
    }
    return { texture, data };
}

export function initWebGLLight(): boolean {
    if (_initialized) return gl !== null;
    _initialized = true;
    
    try {
        // preserveDrawingBuffer: true 是关键！
        // 没有它，WebGL canvas 的内容在合成（drawImage）后会被清空
        // 手机上 drawImage 读取 WebGL canvas 时，如果 buffer 已被清空就会读到空白
        gl = (glCanvas as any).getContext('webgl', {
            preserveDrawingBuffer: true,
            antialias: false,
            alpha: true,
            premultipliedAlpha: false
        }) as WebGLRenderingContext | null;
        if (!gl) {
            console.error('WebGL context 获取失败，回退到 Canvas 2D');
            return false;
        }
        
        // 检查 WebGL 是否有错误状态
        let glError = gl.getError();
        if (glError !== gl.NO_ERROR) {
            console.error('WebGL 初始状态异常，错误码:', glError);
            gl = null;
            return false;
        }
        
        // 检测 float 纹理支持
        const floatExt = gl.getExtension('OES_texture_float');
        const floatLinearExt = gl.getExtension('OES_texture_float_linear');
        // 只有同时支持 float 纹理和 float 线性过滤时才使用 float 纹理
        // 但我们用 NEAREST 过滤，所以只需要 OES_texture_float
        _useFloatTex = !!floatExt;
        console.log('[WebGL] OES_texture_float:', !!floatExt, 'OES_texture_float_linear:', !!floatLinearExt, '使用float纹理:', _useFloatTex);
        
        // 创建全屏四边形顶点缓冲
        posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1,  -1, 1,
            -1,  1,  1, -1,   1, 1
        ]), gl.STATIC_DRAW);
        
        // 编译遮罩 shader
        _maskProgram = createProgram(gl, VERT_SRC, MASK_FRAG_SRC);
        if (!_maskProgram) {
            console.error('遮罩 shader 编译失败，回退到 Canvas 2D');
            gl = null;
            return false;
        }
        
        // 编译体积光 shader
        _volProgram = createProgram(gl, VERT_SRC, VOLUMETRIC_FRAG_SRC);
        if (!_volProgram) {
            console.error('体积光 shader 编译失败，回退到 Canvas 2D');
            gl = null;
            return false;
        }
        
        // 获取 uniform 位置
        const uniformNames = [
            'u_resolution', 'u_playerPos', 'u_cameraPos', 'u_zoom', 'u_shake',
            'u_angle', 'u_fov', 'u_maxDist', 'u_flashlightActive',
            'u_centerFov', 'u_selfGlowRadius', 'u_selfGlowIntensity',
            'u_ambientRadius', 'u_ambientIntensity', 'u_maskAlpha',
            'u_polyTex', 'u_polyCount',
            'u_siltTex', 'u_hasSilt', 'u_siltSteps',
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
        _maskUniforms = getUniforms(gl, _maskProgram, uniformNames);
        _volUniforms = getUniforms(gl, _volProgram, uniformNames);
        
        // 创建数据纹理
        const polyResult = createDataTexture(gl, POLY_TEX_WIDTH, 1);
        polyTexture = polyResult.texture;
        polyTexData = polyResult.data;
        
        const siltResult = createDataTexture(gl, POLY_TEX_WIDTH, SILT_TEX_HEIGHT);
        siltTexture = siltResult.texture;
        siltTexData = siltResult.data;
        
        const vplResult = createDataTexture(gl, MAX_VPL_POINTS, 1);
        vplTexture = vplResult.texture;
        vplTexData = vplResult.data;
        
        // 验证性渲染测试：实际执行一次 draw call，检查是否有 GL 错误
        gl.viewport(0, 0, glCanvas.width, glCanvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(_maskProgram);
        const testPosLoc = gl.getAttribLocation(_maskProgram, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.enableVertexAttribArray(testPosLoc);
        gl.vertexAttribPointer(testPosLoc, 2, gl.FLOAT, false, 0, 0);
        // 设置必要的 uniform 避免 shader 报错
        if (_maskUniforms['u_resolution']) gl.uniform2f(_maskUniforms['u_resolution']!, logicW, logicH);
        if (_maskUniforms['u_maskAlpha']) gl.uniform1f(_maskUniforms['u_maskAlpha']!, 0.0);
        if (_maskUniforms['u_flashlightActive']) gl.uniform1f(_maskUniforms['u_flashlightActive']!, 0.0);
        if (_maskUniforms['u_npcActive']) gl.uniform1f(_maskUniforms['u_npcActive']!, 0.0);
        if (_maskUniforms['u_polyCount']) gl.uniform1f(_maskUniforms['u_polyCount']!, 0.0);
        if (_maskUniforms['u_vplCount']) gl.uniform1f(_maskUniforms['u_vplCount']!, 0.0);
        if (_maskUniforms['u_zoom']) gl.uniform1f(_maskUniforms['u_zoom']!, 1.0);
        if (_maskUniforms['u_playerPos']) gl.uniform2f(_maskUniforms['u_playerPos']!, 0, 0);
        if (_maskUniforms['u_cameraPos']) gl.uniform2f(_maskUniforms['u_cameraPos']!, 0, 0);
        if (_maskUniforms['u_shake']) gl.uniform2f(_maskUniforms['u_shake']!, 0, 0);
        if (_maskUniforms['u_hasSilt']) gl.uniform1f(_maskUniforms['u_hasSilt']!, 0.0);
        // 绑定纹理
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, polyTexture);
        if (_maskUniforms['u_polyTex']) gl.uniform1i(_maskUniforms['u_polyTex']!, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, siltTexture);
        if (_maskUniforms['u_siltTex']) gl.uniform1i(_maskUniforms['u_siltTex']!, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, vplTexture);
        if (_maskUniforms['u_vplTex']) gl.uniform1i(_maskUniforms['u_vplTex']!, 2);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        glError = gl.getError();
        if (glError !== gl.NO_ERROR) {
            console.error('WebGL 验证渲染失败，错误码:', glError, '回退到 Canvas 2D');
            gl = null;
            return false;
        }
        
        console.log('[WebGL] 光照初始化成功，画布尺寸:', glCanvas.width, 'x', glCanvas.height, 'float纹理:', _useFloatTex);
        console.log('[WebGL] GL_RENDERER:', gl.getParameter(gl.RENDERER), 'GL_VERSION:', gl.getParameter(gl.VERSION));
        return true;
    } catch (e) {
        console.error('WebGL 初始化异常:', e, '回退到 Canvas 2D');
        gl = null;
        return false;
    }
}

// ============ 数据上传 ============

// 将光锥多边形数据编码到纹理
export function uploadPolyData(poly: any[], maxDist: number) {
    if (!gl || !polyTexture || !polyTexData) return;
    
    // 清零
    polyTexData.fill(0);
    
    // 编码：每个射线点存储归一化距离
    for (let i = 0; i < poly.length && i < POLY_TEX_WIDTH; i++) {
        let normalizedDist = poly[i].dist / maxDist;
        polyTexData[i * 4] = normalizedDist;     // R: 归一化距离
        polyTexData[i * 4 + 1] = 0;
        polyTexData[i * 4 + 2] = 0;
        polyTexData[i * 4 + 3] = 1;
    }
    
    // 上传纹理
    gl.bindTexture(gl.TEXTURE_2D, polyTexture);
    if (_useFloatTex) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, POLY_TEX_WIDTH, 1, 0, gl.RGBA, gl.FLOAT, polyTexData);
    } else {
        // 回退：将 float 编码为 UNSIGNED_BYTE（精度损失可接受）
        const byteData = new Uint8Array(POLY_TEX_WIDTH * 4);
        for (let i = 0; i < POLY_TEX_WIDTH; i++) {
            byteData[i * 4] = Math.min(255, Math.floor(polyTexData[i * 4] * 255));
            byteData[i * 4 + 1] = 0;
            byteData[i * 4 + 2] = 0;
            byteData[i * 4 + 3] = 255;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, POLY_TEX_WIDTH, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, byteData);
    }
}

// 将泥沙衰减数据编码到纹理
export function uploadSiltData(siltData: any) {
    if (!gl || !siltTexture || !siltTexData) return;
    
    siltTexData.fill(0);
    
    if (!siltData) return;
    
    const { perStep, rays, steps, stride } = siltData;
    for (let i = 0; i <= rays && i < POLY_TEX_WIDTH; i++) {
        for (let s = 0; s <= steps && s < SILT_TEX_HEIGHT; s++) {
            let idx = (s * POLY_TEX_WIDTH + i) * 4;
            siltTexData[idx] = perStep[i * stride + s]; // R: 透射率
            siltTexData[idx + 3] = 1;
        }
    }
    
    gl.bindTexture(gl.TEXTURE_2D, siltTexture);
    if (_useFloatTex) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, POLY_TEX_WIDTH, SILT_TEX_HEIGHT, 0, gl.RGBA, gl.FLOAT, siltTexData);
    } else {
        const byteData = new Uint8Array(POLY_TEX_WIDTH * SILT_TEX_HEIGHT * 4);
        for (let i = 0; i < POLY_TEX_WIDTH * SILT_TEX_HEIGHT; i++) {
            byteData[i * 4] = Math.min(255, Math.floor(siltTexData[i * 4] * 255));
            byteData[i * 4 + 3] = 255;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, POLY_TEX_WIDTH, SILT_TEX_HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, byteData);
    }
}

// 将 VPL 数据编码到纹理
export function uploadVPLData(poly: any[], maxDist: number, getWallColor?: (r: number, c: number) => { r: number, g: number, b: number }) {
    if (!gl || !vplTexture || !vplTexData) return;
    
    vplTexData.fill(0);
    
    let vplIdx = 0;
    for (let i = 0; i < poly.length && vplIdx < MAX_VPL_POINTS; i++) {
        let p = poly[i];
        // 只取打在墙上的射线（距离 < 95% 最大距离）
        if (p.dist > maxDist * 0.95) continue;
        // 每隔2条射线采样一个 VPL 点，128 点足够覆盖整个光锥
        if (i % 2 !== 0) continue;
        
        let distRatio = p.dist / maxDist;
        // 衰减：近处反弹强，远处弱
        let distFade = Math.max(0, 1 - distRatio * distRatio); // 平方衰减
        let bounceAlpha = CONFIG.flashlight.vplBounceBase * distFade;
        
        // 获取墙壁颜色亮度
        let colorBrightness = 0.6; // 默认
        if (getWallColor) {
            // 这里简化处理，不查颜色了，用默认值
            colorBrightness = 0.6;
        }
        
        vplTexData[vplIdx * 4] = p.x;         // R: 世界X
        vplTexData[vplIdx * 4 + 1] = p.y;     // G: 世界Y
        vplTexData[vplIdx * 4 + 2] = colorBrightness; // B: 颜色亮度
        vplTexData[vplIdx * 4 + 3] = bounceAlpha;     // A: alpha
        vplIdx++;
    }
    
    gl.bindTexture(gl.TEXTURE_2D, vplTexture);
    if (_useFloatTex) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_VPL_POINTS, 1, 0, gl.RGBA, gl.FLOAT, vplTexData);
    } else {
        // VPL 数据包含世界坐标，UNSIGNED_BYTE 精度不够
        // UNSIGNED_BYTE 模式下禁用 VPL（alpha 全 0）
        const byteData = new Uint8Array(MAX_VPL_POINTS * 4);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_VPL_POINTS, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, byteData);
    }
    
    return vplIdx;
}

// ============ 渲染 ============

function setupProgram(prog: WebGLProgram, u: Record<string, WebGLUniformLocation | null>) {
    if (!gl || !posBuffer) return;
    
    gl.useProgram(prog);
    
    // 绑定顶点
    const posLoc = gl.getAttribLocation(prog, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
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
        // 简化估算：手电筒开着时亮度较高，关着时亮度很低
        // 用手电筒状态 + VPL 数量 + 自发光等因素估算场景亮度
        let estimatedBrightness = 0.05; // 基础环境亮度
        if (flashlightActive) {
            estimatedBrightness += 0.35; // 手电筒贡献
        }
        estimatedBrightness += CONFIG.selfGlowIntensity * 0.3; // 自发光贡献
        estimatedBrightness += (CONFIG.ambientPerceptionIntensity || 0.35) * 0.15; // 环境感知贡献

        _lastFrameAvgLight = estimatedBrightness;

        // 目标曝光 = 目标亮度 / 当前亮度
        let targetExposure = pp.autoExposureTarget / Math.max(_lastFrameAvgLight, 0.01);
        targetExposure = Math.max(pp.autoExposureMin, Math.min(pp.autoExposureMax, targetExposure));

        // 平滑过渡
        _autoExposureValue += (targetExposure - _autoExposureValue) * pp.autoExposureSpeed;
        _autoExposureValue = Math.max(pp.autoExposureMin, Math.min(pp.autoExposureMax, _autoExposureValue));

        exposure = _autoExposureValue;
    }

    // 手动曝光叠加
    if (pp.enableManualExposure) {
        exposure *= pp.manualExposure;
    }

    return exposure;
}

function setCommonUniforms(u: Record<string, WebGLUniformLocation | null>, params: {
    playerX: number, playerY: number,
    cameraX: number, cameraY: number,
    zoom: number, shakeX: number, shakeY: number,
    angle: number, maxDist: number,
    flashlightActive: boolean,
    npcX: number, npcY: number, npcAngle: number, npcDist: number, npcActive: boolean,
    polyCount: number, vplCount: number
}) {
    if (!gl) return;
    
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
    gl.uniform1f(u['u_flatRatio']!, fl.flatRatio);
    gl.uniform1f(u['u_edgeFadeRatio']!, fl.edgeFadeRatio);
    gl.uniform1f(u['u_maskPow']!, fl.maskPow);
    gl.uniform1f(u['u_maskMinAlpha']!, fl.maskMinAlpha);
    gl.uniform1f(u['u_vplRadius']!, fl.vplRadius);
    gl.uniform1f(u['u_vplMaskStrength']!, fl.vplMaskStrength);
    gl.uniform1f(u['u_scatterIntensity']!, fl.scatterIntensity);
    gl.uniform1f(u['u_scatterDistRatio']!, fl.scatterDistRatio);
    gl.uniform1f(u['u_scatterRadiusRatio']!, fl.scatterRadiusRatio);
    // 体积光参数化
    gl.uniform1f(u['u_volOuterIntensity']!, fl.volOuterIntensity);
    gl.uniform1f(u['u_volCenterIntensity']!, fl.volCenterIntensity);
    gl.uniform3f(u['u_volOuterColor']!, fl.volOuterColor[0], fl.volOuterColor[1], fl.volOuterColor[2]);
    gl.uniform3f(u['u_volCenterColor']!, fl.volCenterColor[0], fl.volCenterColor[1], fl.volCenterColor[2]);
    gl.uniform1f(u['u_vplVolStrength']!, fl.vplVolStrength);

    // 后处理参数
    const pp = CONFIG.postProcess;
    const exposure = computeExposure(params.flashlightActive);
    gl.uniform1f(u['u_exposure']!, exposure);
    gl.uniform1f(u['u_enableToneMapping']!, pp.enableToneMapping ? 1.0 : 0.0);
    gl.uniform1f(u['u_toneMappingMode']!, pp.toneMappingMode);
    gl.uniform1f(u['u_reinhardWhitePoint']!, pp.reinhardWhitePoint);
}

function bindTextures(u: Record<string, WebGLUniformLocation | null>) {
    if (!gl) return;
    
    // 纹理单元 0: 光锥多边形
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, polyTexture);
    gl.uniform1i(u['u_polyTex']!, 0);
    
    // 纹理单元 1: 泥沙
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, siltTexture);
    gl.uniform1i(u['u_siltTex']!, 1);
    
    // 纹理单元 2: VPL
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, vplTexture);
    gl.uniform1i(u['u_vplTex']!, 2);
}

// 渲染光照遮罩层（替代 Canvas 2D lightLayer）
export function renderLightMask(params: {
    playerX: number, playerY: number,
    cameraX: number, cameraY: number,
    zoom: number, shakeX: number, shakeY: number,
    angle: number, maxDist: number,
    flashlightActive: boolean,
    maskAlpha: number,
    hasSilt: boolean, siltSteps: number,
    npcX: number, npcY: number, npcAngle: number, npcDist: number, npcActive: boolean,
    polyCount: number, vplCount: number
}) {
    if (!gl || !_maskProgram) return;
    
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    setupProgram(_maskProgram, _maskUniforms);
    setCommonUniforms(_maskUniforms, params);
    
    // 遮罩特有 uniforms
    gl.uniform1f(_maskUniforms['u_selfGlowRadius']!, CONFIG.selfGlowRadius);
    gl.uniform1f(_maskUniforms['u_selfGlowIntensity']!, CONFIG.selfGlowIntensity);
    gl.uniform1f(_maskUniforms['u_ambientRadius']!, CONFIG.ambientPerceptionRadius || 80);
    gl.uniform1f(_maskUniforms['u_ambientIntensity']!, CONFIG.ambientPerceptionIntensity || 0.35);
    gl.uniform1f(_maskUniforms['u_maskAlpha']!, params.maskAlpha);
    gl.uniform1f(_maskUniforms['u_hasSilt']!, params.hasSilt ? 1.0 : 0.0);
    gl.uniform1f(_maskUniforms['u_siltSteps']!, params.siltSteps);
    
    bindTextures(_maskUniforms);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // 手机上必须 flush，确保 GPU 命令执行完毕后 drawImage 才能正确读取
    gl.flush();
}

// 渲染体积光层
// 渲染体积光层（需要在主画布上用 screen 模式合成）
export function renderVolumetricLight(params: {
    playerX: number, playerY: number,
    cameraX: number, cameraY: number,
    zoom: number, shakeX: number, shakeY: number,
    angle: number, maxDist: number,
    flashlightActive: boolean,
    npcX: number, npcY: number, npcAngle: number, npcDist: number, npcActive: boolean,
    polyCount: number, vplCount: number
}) {
    if (!gl || !_volProgram) return;
    
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    
    setupProgram(_volProgram, _volUniforms);
    setCommonUniforms(_volUniforms, params);
    
    bindTextures(_volUniforms);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // 手机上必须 flush，确保 GPU 命令执行完毕后 drawImage 才能正确读取
    gl.flush();
}

// 获取 WebGL canvas 用于 drawImage 合成
export function getGLCanvas(): any {
    return glCanvas;
}

// 检查 WebGL 是否可用
export function isWebGLAvailable(): boolean {
    return gl !== null;
}
