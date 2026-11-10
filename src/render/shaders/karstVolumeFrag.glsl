precision highp float;
// 三维洞腔的灰模着色：只有形体、手电、遮挡和水的衰减。矿物材质是之后的独立课题。
varying vec3 P;
varying vec3 N;
varying vec4 LP;
uniform vec3 lightPos;
uniform vec3 lightDir;
uniform vec4 bounce[7];
uniform float roomLight;
uniform vec3 extinction;
uniform float range;
uniform float farDepth;
uniform float enabled;
uniform float shadowOn;
uniform float energy;
uniform float surfaceY;
uniform float fadeTop;
uniform float inspect;
uniform vec2 gridOrigin;
uniform vec2 gridSize;
uniform float cellSize;
uniform sampler2D shadowMap;
uniform sampler2D sliceTex;

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
    // 剖面：游戏平面上被剖开的岩石。真实洞穴里没有这个面，这里只在贴近洞壁处留一圈受光的边。
    float face = 1.0 - smoothstep(-2.6, -0.4, P.z);
    float alpha = smoothstep(fadeTop, fadeTop + 170.0, P.y);
    if (inspect > 0.5) {
        float diff = 0.18 + 0.82 * max(dot(n, normalize(vec3(-0.35, -0.55, -0.76))), 0.0);
        vec3 clay = pow(vec3(0.62, 0.66, 0.68) * diff * exp(-max(P.z, 0.0) / 420.0), vec3(1.0 / 2.2));
        gl_FragColor = vec4(mix(clay, vec3(0.03, 0.035, 0.04), face), alpha);
        return;
    }
    vec3 rock = vec3(0.80, 0.76, 0.68);
    // 天光：越靠近水面越亮，朝上的面更亮。
    float depth = max(P.y - surfaceY, 0.0);
    vec3 day = rock * vec3(0.50, 0.70, 0.56) * exp(-depth / 300.0) * (0.30 + 0.70 * mix(max(-n.y, 0.0), 0.45, face)) * exp(-max(P.z, 0.0) / 500.0);
    vec3 col = day * 0.55;
    float lit = 0.0;
    if (enabled > 0.5) {
        vec3 toL = lightPos - P;
        float d = length(toL);
        vec3 l = toL / max(d, 0.01);
        // S03 小样的三维光锥：中心高光，外围宽柔光，近身留一点散射。
        float c = dot(-l, lightDir), diff = mix(max(dot(n, l), 0.0), 0.6, face);
        float cone = 0.22 * smoothstep(0.26, 0.85, c) + 0.78 * smoothstep(0.80, 0.96, c);
        float fall = 1.0 - smoothstep(range * 0.85, max(1.0, range * 1.2), d);
        float direct = cone * diff * shadow() * energy * fall / (1.0 + pow(d / 200.0, 2.0));
        float nearGlow = (0.25 + 0.75 * diff) * 0.10 / (1.0 + pow(d / 90.0, 2.0)) * (1.0 - smoothstep(120.0, 330.0, d));
        float reflected = 0.0;
        for (int i = 0; i < 7; i++) {
            if (bounce[i].w <= 0.0) continue;
            vec3 toB = bounce[i].xyz - P;
            float db2 = dot(toB, toB);
            if (db2 >= 160000.0) continue;
            float db = sqrt(db2);
            float diffuse = mix(max(dot(n, toB / max(db, 0.01)), 0.0), 0.5, face);
            reflected += bounce[i].w * (0.3 + 0.7 * diffuse) / (1.0 + db2 / 16900.0) * (1.0 - smoothstep(150.0, 400.0, db));
        }
        // 回光铺开到洞顶和两侧，灯背后只留很弱的一层。
        float planar = dot(-toL.xy, lightDir.xy) / max(length(toL.xy), 70.0);
        float forward = smoothstep(-0.74, 0.18, planar);
        float room = roomLight * (0.06 + 0.94 * forward) * (0.58 + 0.42 * diff) / (1.0 + pow(d / 620.0, 2.0));
        lit = direct * 0.55 + nearGlow + reflected * 0.65 + room * 0.15;
        vec3 beamColor = vec3(0.12, 0.35, 0.61);
        vec3 returnColor = vec3(0.028, 0.21, 0.50);
        vec3 light = beamColor * (direct * 0.63 + nearGlow * 0.45) + returnColor * (reflected + room);
        col += rock * light * exp(-extinction * d * 0.38) * exp(-max(P.z, 0.0) / 580.0);
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
