precision highp float;
// 三维岩面：定向手电、落点回光、弱环境显形，以及世界坐标连续的矿物底色。
varying vec3 P;
varying vec3 N;
varying vec4 LP;
uniform vec3 lightPos;
uniform vec3 lightDir;
uniform vec4 bounce[10];
uniform vec4 bounceNormal[10];
uniform float fov;
uniform vec3 extinction;
uniform float range;
uniform float farDepth;
uniform float enabled;
uniform float shadowOn;
uniform float energy;
uniform float surfaceY;
uniform float fadeTop;
uniform float inspect;
uniform float visibilityFill;
uniform float materialMix;
uniform vec2 gridOrigin;
uniform vec2 gridSize;
uniform float cellSize;
uniform sampler2D shadowMap;
uniform sampler2D sliceTex;

float stoneHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}
// 同一世界坐标下的岩面颗粒与解析梯度，跨网格接缝连续。
vec4 stoneNoise(vec3 p) {
    vec3 cell = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
    float a = stoneHash(cell), b = stoneHash(cell + vec3(1,0,0));
    float c = stoneHash(cell + vec3(0,1,0)), d = stoneHash(cell + vec3(1,1,0));
    float e = stoneHash(cell + vec3(0,0,1)), g = stoneHash(cell + vec3(1,0,1));
    float h = stoneHash(cell + vec3(0,1,1)), j = stoneHash(cell + vec3(1,1,1));
    float lower = mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
    float upper = mix(mix(e,g,u.x), mix(h,j,u.x), u.y);
    vec3 gradient = vec3(mix(mix(b-a,d-c,u.y),mix(g-e,j-h,u.y),u.z),
        mix(mix(c-a,d-b,u.x),mix(h-e,j-g,u.x),u.z), upper-lower) * du;
    return vec4(gradient, mix(lower, upper, u.z));
}
float shadow() {
    if (shadowOn < 0.5 || LP.w <= 0.0) return 1.0;
    vec3 q = LP.xyz / LP.w * 0.5 + 0.5;
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return 1.0;
    float s = 0.0, t = 0.75 / 1024.0;
    s += step(q.z - 0.0004, texture2D(shadowMap, q.xy + vec2(-t, -t)).r);
    s += step(q.z - 0.0004, texture2D(shadowMap, q.xy + vec2(t, -t)).r);
    s += step(q.z - 0.0004, texture2D(shadowMap, q.xy + vec2(-t, t)).r);
    s += step(q.z - 0.0004, texture2D(shadowMap, q.xy + vec2(t, t)).r);
    return s * 0.25;
}

void main() {
    vec3 n = normalize(N);
    vec4 coarse = stoneNoise(P / 31.0), fine = stoneNoise(P / 8.0 + 17.0);
    // 大片沉积沿重力拉长，粗糙基岩、浅色流石和铁染共用连续的覆盖场。
    // 不按三角面或分块抽颜色，游动时不会花屏；局部噪声打断机械等宽条纹。
    vec4 deposit = stoneNoise(P * vec3(0.009, 0.0025, 0.011) + 9.0);
    float calcite = smoothstep(0.56, 0.77, deposit.w);
    float iron = smoothstep(0.40, 0.55, deposit.w) * (1.0 - smoothstep(0.57, 0.70, deposit.w));
    iron *= smoothstep(0.32, 0.72, coarse.w) * 0.70;
    float bedding = P.y * 0.075 + P.x * 0.017 + P.z * 0.023 + coarse.w * 2.8 + deposit.w * 5.0;
    vec3 beddingGradient = vec3(0.017, 0.075, 0.023) + coarse.xyz * (2.8 / 31.0)
        + deposit.xyz * vec3(0.009, 0.0025, 0.011) * 5.0;
    float strata = sin(bedding);
    vec3 relief = cos(bedding) * beddingGradient * (0.35 + 0.65 * coarse.w);
    relief += coarse.xyz * 0.36 + fine.xyz * 0.12;
    float skin = smoothstep(0.0, 18.0, P.z);
    n = normalize(n - (relief - n * dot(n, relief)) * skin * (1.25 - calcite * 0.35));
    // 剖面：游戏平面上被剖开的岩石。真实洞穴里没有这个面，这里只在贴近洞壁处留一圈受光的边。
    float face = 1.0 - smoothstep(-2.6, -0.4, P.z);
    float alpha = smoothstep(fadeTop, fadeTop + 170.0, P.y);
    if (inspect > 0.5) {
        float diff = 0.18 + 0.82 * max(dot(normalize(N), normalize(vec3(-0.35, -0.55, -0.76))), 0.0);
        vec3 clay = pow(vec3(0.62, 0.66, 0.68) * diff * exp(-max(P.z, 0.0) / 420.0), vec3(1.0 / 2.2));
        gl_FragColor = vec4(mix(clay, vec3(0.03, 0.035, 0.04), face), alpha);
        return;
    }
    float mineral = (0.76 + 0.20 * coarse.w + 0.04 * fine.w) * (0.96 + 0.04 * strata);
    vec3 limestone = mix(vec3(0.23, 0.28, 0.29), vec3(0.42, 0.44, 0.40), coarse.w);
    vec3 surface = mix(limestone, vec3(0.46, 0.27, 0.12), iron);
    surface = mix(surface, vec3(0.68, 0.63, 0.49), calcite * 0.88);
    vec3 rock = mix(vec3(0.63, 0.61, 0.57), surface, materialMix * skin) * mineral;
    // 天光：越靠近水面越亮，朝上的面更亮。
    float depth = max(P.y - surfaceY, 0.0);
    vec3 day = rock * vec3(0.50, 0.70, 0.56) * exp(-depth / 300.0) * (0.30 + 0.70 * mix(max(-n.y, 0.0), 0.45, face)) * exp(-max(P.z, 0.0) / 500.0);
    vec3 col = day * 0.55;
    // 可玩性所需的弱水中环境光：只在真实岩面上显形，不画跟人的大光圈。
    // 与命中无关，空旷处也能辨认浅后壁；背向岩面和远深处仍压暗。
    vec3 toPlayer = lightPos - P;
    float planarDistance = length(toPlayer.xy);
    float front = 0.58 + 0.42 * smoothstep(-0.45, 0.45, dot(-toPlayer.xy, lightDir.xy) / max(planarDistance, 1.0));
    float form = 0.22 + 0.78 * max(dot(n, normalize(vec3(-0.25, -0.45, -0.86))), 0.0);
    float fill = visibilityFill * mix(0.28, 1.0, enabled) * front * form
        * exp(-max(P.z, 0.0) / 650.0) / (1.0 + pow(planarDistance / 1050.0, 2.0));
    col += rock * vec3(0.035, 0.050, 0.065) * fill;
    float lit = 0.0;
    if (enabled > 0.5) {
        vec3 toL = lightPos - P;
        float d = length(toL);
        vec3 l = toL / max(d, 0.01);
        // 与水中光柱同一支手电：65°锥边、中心高光及柔和外沿。
        float c = dot(-l, lightDir), diff = mix(max(dot(n, l), 0.0), 0.6, face);
        float theta = acos(clamp(c, -1.0, 1.0));
        float spill = exp(-pow(theta / max(0.01, fov * 0.36), 4.0));
        spill *= 1.0 - smoothstep(fov * 0.43, fov * 0.5, theta);
        float hot = exp(-theta * theta / 0.031);
        float cone = (spill * 0.63 + hot * 0.25) / 0.88;
        cone *= 1.0 - step(fov * 0.5, theta);
        float fall = 1.0 - smoothstep(range * 0.85, max(1.0, range * 1.2), d);
        float direct = cone * diff * shadow() * energy * fall / (1.0 + pow(d / 200.0, 2.0));
        float reflected = 0.0;
        for (int i = 0; i < 10; i++) {
            if (bounce[i].w <= 0.0) continue;
            vec3 toB = bounce[i].xyz - P;
            float db2 = dot(toB, toB);
            if (db2 >= 422500.0) continue;
            float db = sqrt(db2);
            vec3 towardSource = toB / max(db, 0.01);
            float diffuse = mix(max(dot(n, towardSource), 0.0), 0.5, face);
            float emission = max(dot(bounceNormal[i].xyz, -towardSource), 0.0);
            // 光只能从命中的岩面向水域反射；落点到接收面之间暂以半球近似二次可见性。
            reflected += bounce[i].w * emission * diffuse / (1.0 + db2 / 65000.0) * (1.0 - smoothstep(220.0, 650.0, db));
        }
        lit = direct * 0.55 + reflected * 0.65;
        // 近处灯光保留矿物本色，长水程逐渐转青蓝；避免把所有岩面都染成同一种蓝。
        vec3 beamColor = mix(vec3(0.76, 0.84, 0.78), vec3(0.16, 0.40, 0.61), smoothstep(200.0, 720.0, d));
        vec3 returnColor = vec3(0.12, 0.26, 0.35);
        vec3 light = beamColor * direct * 0.63 * exp(-extinction * d * 0.38) + returnColor * reflected;
        col += rock * light * exp(-max(P.z, 0.0) / 580.0);
    }
    // 往里越深越暗，最深处完全沉进黑暗里：大厅看不到底，只有浅的洞才看得到后壁。
    col *= 1.0 - smoothstep(farDepth * 0.80, farDepth * 0.99, P.z);
    col = pow(col / (1.0 + col), vec3(1.0 / 2.2));
    if (face > 0.0) {
        float depthIn = texture2D(sliceTex, ((P.xy - gridOrigin) / cellSize + 0.5) / gridSize).r * 72.0;
        float glow = pow(lit / (1.0 + lit), 1.0 / 2.2);
        vec3 cut = pow(day * 0.28, vec3(1.0 / 2.2)) + vec3(0.12, 0.34, 0.55) * glow * exp(-depthIn / 11.0) * 0.55;
        col = mix(col, cut, face);
    }
    gl_FragColor = vec4(col, alpha);
}
