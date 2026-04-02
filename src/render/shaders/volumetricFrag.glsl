// 体积光 fragment shader（在主画布上用 screen 模式叠加暖色泛光）
precision highp float;
varying vec2 v_uv;

uniform vec2 u_resolution;
uniform vec2 u_playerPos;
uniform float u_zoom;
uniform vec2 u_shake;
uniform float u_angle;
uniform float u_fov;
uniform float u_maxDist;
uniform float u_flashlightActive;
uniform float u_centerFov;
uniform sampler2D u_polyTex;
uniform float u_polyCount;

// VPL
uniform sampler2D u_vplTex;
uniform float u_vplCount;

// NPC
uniform vec2 u_npcPos;
uniform float u_npcAngle;
uniform float u_npcDist;
uniform float u_npcActive;

// 手电筒参数化
uniform float u_flatRatio;
uniform float u_edgeFadeRatio;
uniform float u_volOuterIntensity;
uniform float u_volCenterIntensity;
uniform vec3 u_volOuterColor;
uniform vec3 u_volCenterColor;

// VPL 参数化
uniform float u_vplRadius;
uniform float u_vplVolStrength;

// 纹理尺寸常量（与 WebGLLight.ts 中 POLY_TEX_WIDTH 保持一致）
const float POLY_TEX_SIZE = 512.0;

float angleDiff(float a, float b) {
    float d = a - b;
    d = d - floor(d / 6.2831853 + 0.5) * 6.2831853;
    return abs(d);
}

vec2 screenToWorld(vec2 uv) {
    vec2 screenPos = vec2(uv.x, 1.0 - uv.y) * u_resolution;
    vec2 centered = screenPos - u_resolution * 0.5 - u_shake;
    return centered / u_zoom + u_playerPos;
}

float smoothFade(float t) {
    t = clamp(t, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

float queryOcclusionDist(float fragAngle, float lightAngle, float fov) {
    float halfFov = fov * 0.5;
    float da = fragAngle - lightAngle;
    da = da - floor(da / 6.2831853 + 0.5) * 6.2831853;
    float t = (da + halfFov) / fov;
    if (t < 0.0 || t > 1.0) return 0.0;
    float texU = (t * u_polyCount + 0.5) / POLY_TEX_SIZE;
    vec4 s = texture2D(u_polyTex, vec2(texU, 0.25));
    return s.r * u_maxDist;
}

vec3 computeVolumetric(vec2 worldPos, vec2 lightPos, float lightAngle, float maxDist, float fov, float centerFov) {
    vec2 toFrag = worldPos - lightPos;
    float dist = length(toFrag);
    if (dist > maxDist * 1.1) return vec3(0.0);
    
    float fragAngle = atan(toFrag.y, toFrag.x);
    float halfFov = fov * 0.5;
    float da = angleDiff(fragAngle, lightAngle);
    if (da > halfFov + 0.1) return vec3(0.0);
    
    // 角度淡出：与遮罩层一致
    float fadeStartAngle = halfFov * (1.0 - u_edgeFadeRatio);
    float angularFade = da < fadeStartAngle ? 1.0 :
        1.0 - smoothFade((da - fadeStartAngle) / (halfFov * u_edgeFadeRatio + 0.001));
    
    // 遮挡
    float featherDist = maxDist * 0.2;
    float occDist = queryOcclusionDist(fragAngle, lightAngle, fov);
    if (dist > occDist + featherDist) return vec3(0.0);
    float occFade = dist > occDist ? (1.0 - smoothstep(0.0, 1.0, (dist - occDist) / featherDist)) : 1.0;
    
    // 径向衰减：与遮罩层一致，前 flatRatio 全亮，然后平滑衰减
    float dr = dist / maxDist;
    float radialFade;
    if (dr < u_flatRatio) {
        radialFade = 1.0;
    } else {
        float t = (dr - u_flatRatio) / (1.0 - u_flatRatio + 0.001);
        radialFade = 1.0 - smoothFade(t);
    }
    
    // 外层暖色泛光
    float outerAlpha = u_volOuterIntensity * angularFade * radialFade * occFade;
    vec3 outerColor = u_volOuterColor * outerAlpha;
    
    // 中心区域增强
    float centerHalfFov = centerFov * 0.5;
    float centerBlend = 1.0 - smoothstep(0.0, centerHalfFov, da);
    float centerAlpha = u_volCenterIntensity * centerBlend * radialFade * occFade;
    vec3 centerColor = u_volCenterColor * centerAlpha;
    
    return outerColor + centerColor;
}

void main() {
    vec2 worldPos = screenToWorld(v_uv);
    vec3 color = vec3(0.0);
    
    // 主手电筒体积光
    if (u_flashlightActive > 0.5) {
        color += computeVolumetric(worldPos, u_playerPos, u_angle, u_maxDist, u_fov, u_centerFov);
    }
    
    // NPC 手电筒体积光
    if (u_npcActive > 0.5) {
        color += computeVolumetric(worldPos, u_npcPos, u_npcAngle, u_npcDist, u_fov, u_centerFov) * 0.5;
    }
    
    // VPL 着色（暖色反弹光）
    for (int i = 0; i < 128; i++) {
        if (float(i) >= u_vplCount) break;
        float texU = (float(i) + 0.5) / 128.0;
        vec4 vplData = texture2D(u_vplTex, vec2(texU, 0.5));
        vec2 vplPos = vplData.xy;
        vec3 vplColor = vec3(vplData.z, vplData.z * 0.9, vplData.z * 0.7);
        float vplAlpha = vplData.a;
        if (vplAlpha < 0.005) continue;
        float vplDist = length(worldPos - vplPos);
        if (vplDist < u_vplRadius) {
            float vplFade = 1.0 - vplDist / u_vplRadius;
            vplFade = vplFade * vplFade; // 二次衰减，边缘更柔和
            color += vplColor * vplAlpha * u_vplVolStrength * vplFade;
        }
    }
    
    float a = max(color.r, max(color.g, color.b));
    if (a < 0.001) discard;
    gl_FragColor = vec4(color, a);
}
