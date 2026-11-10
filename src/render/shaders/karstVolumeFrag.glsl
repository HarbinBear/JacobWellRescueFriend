precision highp float;
// 三维洞腔的灰模着色：只有形体、手电、遮挡和水的衰减。矿物材质是之后的独立课题。
varying vec3 P;
varying vec3 N;
varying vec4 LP;
uniform vec3 lightPos;
uniform vec3 lightDir;
uniform vec4 bounce;
uniform vec3 extinction;
uniform float coneCos;
uniform float range;
uniform float camDist;
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
        vec3 l = toL / d;
        // 玩法是二维的：光锥按游戏平面上的方向判断，所以画面上被照亮的范围和二维光锥一致；
        // 明暗按真实的三维距离和朝向算，越往里越暗，深处照不到底。
        vec2 planar = P.xy - lightPos.xy;
        float fd = length(planar), c = fd > 1.0 ? dot(planar / fd, lightDir.xy) : 1.0;
        float diff = mix(0.10 + 0.90 * max(dot(n, l), 0.0), 0.6, face);
        float cone = 0.14 * smoothstep(coneCos - 0.45, coneCos + 0.05, c) + 0.86 * smoothstep(coneCos - 0.05, coneCos + 0.06, c);
        float shown = fd * camDist / (camDist + max(P.z, 0.0));
        float fall = (1.0 - smoothstep(range * 0.80, range * 1.20, shown)) / (1.0 + pow(d / 230.0, 2.0));
        float lum = cone * diff * shadow() * energy * fall + (0.25 + 0.75 * diff) * 0.10 / (1.0 + pow(d / 90.0, 2.0)) * smoothstep(330.0, 120.0, d);
        // 光束打到洞壁后的反照：只在落点放一盏补光，没有算遮挡。
        vec3 toB = bounce.xyz - P;
        float db = length(toB);
        lum += bounce.w * (0.3 + 0.7 * mix(max(dot(n, toB / db), 0.0), 0.5, face)) / (1.0 + pow(db / 130.0, 2.0)) * smoothstep(420.0, 150.0, db);
        lit = lum;
        col += rock * vec3(1.20, 1.04, 0.90) * lum * exp(-extinction * (d * 1.2 + max(P.z, 0.0) * 1.3));
    }
    // 往里越深越暗，最深处完全沉进黑暗里：大厅看不到底，只有浅的洞才看得到后壁。
    col *= 1.0 - smoothstep(farDepth * 0.45, farDepth * 0.92, P.z);
    col = pow(col / (1.0 + col), vec3(1.0 / 2.2));
    if (face > 0.0) {
        float depthIn = texture2D(sliceTex, ((P.xy - gridOrigin) / cellSize + 0.5) / gridSize).r * 72.0;
        float glow = pow(lit / (1.0 + lit), 1.0 / 2.2);
        vec3 cut = pow(day * 0.28, vec3(1.0 / 2.2)) + vec3(0.80, 0.78, 0.72) * glow * exp(-depthIn / 11.0) * 0.75;
        col = mix(col, cut, face);
    }
    gl_FragColor = vec4(col, alpha);
}
