// 主光照遮罩 fragment shader
// 在一个 draw call 中完成：手电筒光锥遮罩 + 自身发光 + 环境感知 + 漫散射 + VPL
precision highp float;
varying vec2 v_uv;

// 屏幕与相机
uniform vec2 u_resolution;
uniform vec2 u_playerPos;   // 玩家位置（光源中心）
uniform vec2 u_cameraPos;   // 相机位置（屏幕中心对应的世界坐标）
uniform float u_zoom;
uniform vec2 u_shake;

// 手电筒参数
uniform float u_angle;
uniform float u_fov;
uniform float u_maxDist;
uniform float u_flashlightActive;

// 中心光束
uniform float u_centerFov;

// 自身发光
uniform float u_selfGlowRadius;
uniform float u_selfGlowIntensity;

// 环境感知
uniform float u_ambientRadius;
uniform float u_ambientIntensity;

// 遮罩基础
uniform float u_maskAlpha;

// 手电筒参数化
uniform float u_flatRatio;        // 径向全亮区占比
uniform float u_edgeFadeRatio;    // 角度边缘淡出区占比
uniform float u_maskPow;          // 遮罩 alpha 的 pow 指数
uniform float u_maskMinAlpha;     // 最亮处最小遮罩 alpha

// VPL 参数化
uniform float u_vplRadius;        // VPL 影响半径
uniform float u_vplMaskStrength;  // VPL 在遮罩层的亮度系数

// 后处理参数
uniform float u_exposure;             // 曝光值（手动或自动）
uniform float u_enableToneMapping;    // 是否启用 tone mapping
uniform float u_toneMappingMode;      // 0=Reinhard, 1=ACES
uniform float u_reinhardWhitePoint;   // Reinhard 扩展白点

// 漫散射参数化
uniform float u_scatterIntensity;    // 漫散射强度
uniform float u_scatterDistRatio;    // 漫散射中心距离占 maxDist 比例
uniform float u_scatterRadiusRatio;  // 漫散射半径占 maxDist 比例

// 光锥多边形纹理
uniform sampler2D u_polyTex;
uniform float u_polyCount;

// 泥沙衰减纹理
uniform sampler2D u_siltTex;
uniform float u_hasSilt;
uniform float u_siltSteps;

// VPL 纹理
uniform sampler2D u_vplTex;
uniform float u_vplCount;

// NPC 光源
uniform vec2 u_npcPos;
uniform float u_npcAngle;
uniform float u_npcDist;
uniform float u_npcActive;

// 纹理尺寸常量（与 WebGLLight.ts 中 POLY_TEX_WIDTH 保持一致）
const float POLY_TEX_SIZE = 512.0;

// 稳健的角度差计算
float angleDiff(float a, float b) {
    float d = a - b;
    d = d - floor(d / 6.2831853 + 0.5) * 6.2831853;
    return abs(d);
}

// 将屏幕UV转换为世界坐标
vec2 screenToWorld(vec2 uv) {
    vec2 screenPos = vec2(uv.x, 1.0 - uv.y) * u_resolution;
    vec2 centered = screenPos - u_resolution * 0.5 - u_shake;
    return centered / u_zoom + u_cameraPos;
}

// 平滑步进函数
float smoothFade(float t) {
    t = clamp(t, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

// 从光锥多边形纹理查询某角度的遮挡距离
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

// 查询泥沙透射率
float querySiltTransmittance(float fragAngle, float lightAngle, float fov, float dist) {
    if (u_hasSilt < 0.5) return 1.0;
    float halfFov = fov * 0.5;
    float da = fragAngle - lightAngle;
    da = da - floor(da / 6.2831853 + 0.5) * 6.2831853;
    float rayT = (da + halfFov) / fov;
    if (rayT < 0.0 || rayT > 1.0) return 1.0;
    float texU = (rayT * u_polyCount + 0.5) / POLY_TEX_SIZE;
    float stepT = clamp(dist / u_maxDist, 0.0, 1.0);
    vec4 s = texture2D(u_siltTex, vec2(texU, stepT));
    return s.r;
}

// 计算手电筒光源的亮度贡献
// 均匀铺光模型：中间一大段全亮，到边缘迅速但平滑地变暗
float computeFlashlight(vec2 worldPos, vec2 lightPos, float lightAngle, float maxDist, float fov, float centerFov, bool isPrimary) {
    vec2 toFrag = worldPos - lightPos;
    float dist = length(toFrag);
    if (dist > maxDist * 1.15) return 0.0;
    
    float fragAngle = atan(toFrag.y, toFrag.x);
    float halfFov = fov * 0.5;
    float da = angleDiff(fragAngle, lightAngle);
    
    if (da > halfFov + 0.1) return 0.0;
    
    // 角度淡出：从 FOV 的 (1 - edgeFadeRatio) 处开始渐变到边缘
    float fadeStartAngle = halfFov * (1.0 - u_edgeFadeRatio);
    float angularFade = da < fadeStartAngle ? 1.0 : 
        1.0 - smoothFade((da - fadeStartAngle) / (halfFov * u_edgeFadeRatio + 0.001));
    
    // 遮挡查询
    float occDist = queryOcclusionDist(fragAngle, lightAngle, fov);
    float featherDist = maxDist * 0.25;
    if (dist > occDist + featherDist) return 0.0;
    
    // 被墙壁截断处的羽化
    float occFade = 1.0;
    if (dist > occDist) {
        float t = (dist - occDist) / featherDist;
        occFade = (1.0 - smoothFade(t)) * 0.5;
    }
    
    // 径向衰减：前 flatRatio 全亮，之后平滑衰减到 0
    float dr = dist / maxDist;
    float radialFade;
    if (dr < u_flatRatio) {
        radialFade = 1.0;
    } else {
        float t = (dr - u_flatRatio) / (1.0 - u_flatRatio + 0.001);
        radialFade = 1.0 - smoothFade(t);
    }
    
    // 泥沙衰减（仅主光源）
    float siltFade = 1.0;
    if (isPrimary) {
        siltFade = querySiltTransmittance(fragAngle, lightAngle, fov, dist);
    }
    
    float brightness = angularFade * radialFade * occFade * siltFade;
    
    return clamp(brightness, 0.0, 1.0);
}

void main() {
    vec2 worldPos = screenToWorld(v_uv);
    
    float darkness = u_maskAlpha;
    float totalLight = 0.0;
    
    // 主手电筒
    if (u_flashlightActive > 0.5) {
        totalLight += computeFlashlight(worldPos, u_playerPos, u_angle, u_maxDist, u_fov, u_centerFov, true);
    }
    
    // NPC 手电筒
    if (u_npcActive > 0.5) {
        totalLight += computeFlashlight(worldPos, u_npcPos, u_npcAngle, u_npcDist, u_fov, u_centerFov, false) * 0.8;
    }
    
    // 自身发光
    float selfDist = length(worldPos - u_playerPos);
    if (selfDist < u_selfGlowRadius) {
        float selfT = selfDist / u_selfGlowRadius;
        float selfGlow = u_selfGlowIntensity * (1.0 - smoothFade(selfT));
        totalLight += selfGlow;
    }
    
    // 环境感知
    if (selfDist < u_ambientRadius) {
        float ambT = selfDist / u_ambientRadius;
        float ambGlow = u_ambientIntensity * (1.0 - smoothFade(ambT));
        totalLight += ambGlow;
    }
    
    // NPC 自身发光
    if (u_npcActive > 0.5) {
        float npcDist = length(worldPos - u_npcPos);
        float npcGlowR = u_selfGlowRadius * 0.7;
        if (npcDist < npcGlowR) {
            float npcT = npcDist / npcGlowR;
            float npcGlow = u_selfGlowIntensity * 0.6 * (1.0 - smoothFade(npcT));
            totalLight += npcGlow;
        }
    }
    
    // 漫散射
    if (u_flashlightActive > 0.5) {
        float scatterDist = u_maxDist * u_scatterDistRatio;
        vec2 scatterPos = u_playerPos + vec2(cos(u_angle), sin(u_angle)) * scatterDist;
        float scatterR = u_maxDist * u_scatterRadiusRatio;
        float sDist = length(worldPos - scatterPos);
        if (sDist < scatterR) {
            float scatterT = sDist / scatterR;
            totalLight += u_scatterIntensity * (1.0 - smoothFade(scatterT));
        }
    }
    
    // VPL 反弹光
    for (int i = 0; i < 128; i++) {
        if (float(i) >= u_vplCount) break;
        float texU = (float(i) + 0.5) / 128.0;
        vec4 vplData = texture2D(u_vplTex, vec2(texU, 0.5));
        vec2 vplPos = vplData.xy;
        float vplAlpha = vplData.a;
        if (vplAlpha < 0.01) continue;
        float vplDist = length(worldPos - vplPos);
        if (vplDist < u_vplRadius) {
            float vplT = vplDist / u_vplRadius;
            // 用 smoothFade 让衰减曲线更平滑，边缘不突兀
            float vplFade = vplAlpha * u_vplMaskStrength * (1.0 - smoothFade(vplT));
            totalLight += vplFade;
        }
    }
    
    // 曝光
    totalLight *= u_exposure;

    // Tone Mapping
    if (u_enableToneMapping > 0.5) {
        if (u_toneMappingMode < 0.5) {
            // Reinhard 扩展
            float wp2 = u_reinhardWhitePoint * u_reinhardWhitePoint;
            totalLight = totalLight * (1.0 + totalLight / wp2) / (1.0 + totalLight);
        } else {
            // ACES Filmic
            float a = 2.51;
            float b = 0.03;
            float c = 2.43;
            float d = 0.59;
            float e = 0.14;
            totalLight = clamp((totalLight * (a * totalLight + b)) / (totalLight * (c * totalLight + d) + e), 0.0, 1.0);
        }
    }

    // 最终遮罩
    float lightClamped = clamp(totalLight, 0.0, 1.0);
    
    // 深蓝色基底（被照亮的水的颜色）
    vec3 darkWaterColor = vec3(0.008, 0.016, 0.039);
    // 被照亮区域的深蓝色调
    vec3 litWaterColor = vec3(0.02, 0.04, 0.12);
    
    // 光照越强，颜色越偏向深蓝（而非完全透明）
    vec3 finalColor = mix(darkWaterColor, litWaterColor, lightClamped);
    
    // alpha：光照区域大幅降低遮罩不透明度
    float lightPow = pow(lightClamped, u_maskPow);
    float finalAlpha = darkness * mix(1.0, u_maskMinAlpha, lightPow);
    
    gl_FragColor = vec4(finalColor, finalAlpha);
}
