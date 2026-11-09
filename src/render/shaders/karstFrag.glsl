precision highp float;
varying vec2 uv;
uniform sampler2D geometry;
uniform sampler2D coordinates;
uniform sampler2D geology;
uniform sampler2D mineral;
uniform sampler2D relief;
uniform sampler2D beam;
uniform sampler2D bounceVisibility;
uniform vec4 view;
uniform vec4 terrainBounds;
uniform vec2 terrainPixels;
uniform vec2 light;
uniform vec2 camera;
uniform vec3 extinction;
uniform float angle;
uniform float fov;
uniform float range;
uniform float enabled;
uniform float surfaceY;
uniform float pixelWorld;
uniform float inspect;
uniform float normalStrength;
uniform float occlusionStrength;
uniform float lightEnergy;
uniform float scatterStrength;
uniform float surfaceHeight;
uniform float surfaceUVRange;
uniform float bounceCount;
uniform vec4 bouncePositions[6];
uniform vec4 bounceDirections[6];
uniform vec4 bounceColors[6];

vec2 terrainUV(vec2 p) {
    vec2 local = (p - terrainBounds.xy) / terrainBounds.zw;
    return (local * (terrainPixels - 1.0) + 0.5) / terrainPixels;
}
float density(vec4 g) { return (g.r * 65280.0 + g.g * 255.0) / 65535.0 * 384.0 - 192.0; }
vec2 decodeUV(vec4 m) { return vec2(m.r * 65280.0 + m.g * 255.0, m.b * 65280.0 + m.a * 255.0) / 65535.0 * surfaceUVRange - surfaceUVRange * 0.5; }
float beamDistance(float theta) {
    float index = clamp(theta / fov + 0.5, 0.0, 1.0) * 511.0;
    float i = floor(index);
    vec2 a = texture2D(beam, vec2((i + 0.5) / 512.0, 0.5)).rg;
    vec2 b = texture2D(beam, vec2((min(i + 1.0, 511.0) + 0.5) / 512.0, 0.5)).rg;
    return mix(a.r * 65280.0 + a.g * 255.0, b.r * 65280.0 + b.g * 255.0, fract(index)) / 65535.0 * range;
}
vec2 atlasUV(vec2 p, float tile) {
    return (vec2(mod(tile, 2.0), floor(tile / 2.0)) * 512.0 + 8.0 + fract(p) * 496.0) / 1024.0;
}
vec2 hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
struct Mineral { vec3 color; vec2 slope; float ao; };
Mineral mineralPatch(vec2 q, vec2 vertex, float tile, float isotropic) {
    vec2 random = hash2(vertex + tile * 41.7);
    float a = isotropic * floor(random.x * 4.0) * 1.5707963;
    float cs = cos(a), sn = sin(a);
    mat2 rotation = mat2(cs, sn, -sn, cs);
    vec2 st = atlasUV(rotation * q + random * 7.31, tile);
    vec4 detail = texture2D(relief, st);
    vec2 xy = detail.rg * 2.0 - 1.0;
    float nz = sqrt(max(0.16, 1.0 - dot(xy, xy)));
    Mineral m; m.color = texture2D(mineral, st).rgb;
    m.slope = vec2(cs * xy.x + sn * xy.y, -sn * xy.x + cs * xy.y) / nz;
    m.ao = detail.a;
    if(tile>0.5&&tile<1.5)m.slope.y*=0.18;
    return m;
}
Mineral sampleMineral(vec2 q, float tile) {
    // Barycentric patch synthesis: no axis-aligned checker grid and no fixed
    // phase repeating every atlas width. Anisotropic flow is never rotated.
    vec2 lattice = vec2(q.x - q.y * 0.57735027, q.y * 1.15470054) * 1.6;
    vec2 cell = floor(lattice), f = fract(lattice);
    vec2 v0, v1, v2; vec3 w;
    if (f.x + f.y < 1.0) { v0 = cell; v1 = cell + vec2(1.0, 0.0); v2 = cell + vec2(0.0, 1.0); w = vec3(1.0 - f.x - f.y, f.x, f.y); }
    else { v0 = cell + vec2(1.0); v1 = cell + vec2(0.0, 1.0); v2 = cell + vec2(1.0, 0.0); w = vec3(f.x + f.y - 1.0, 1.0 - f.x, 1.0 - f.y); }
    w = w * w * w; w /= max(0.0001, w.x + w.y + w.z);
    float isotropic = tile < 0.5 || tile > 2.5 ? 1.0 : 0.0;
    Mineral a = mineralPatch(q, v0, tile, isotropic), b = mineralPatch(q, v1, tile, isotropic), c = mineralPatch(q, v2, tile, isotropic);
    Mineral m; m.color = a.color * w.x + b.color * w.y + c.color * w.z;
    m.slope = a.slope * w.x + b.slope * w.y + c.slope * w.z; m.ao = a.ao * w.x + b.ao * w.y + c.ao * w.z; return m;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float heightShadow(vec2 p, float h, vec3 source) {
    vec2 delta = source.xy - p;
    float d = length(delta), visible = 1.0;
    vec2 direction = delta / max(0.01, d);
    for (int i = 0; i < 4; i++) {
        float length = min(7.0 * pow(2.0, float(i)), max(0.0, d - 0.5));
        vec4 other = texture2D(geometry, terrainUV(p + direction * length));
        float rayH = h + (source.z - h) * length / max(d, 1.0);
        float rock = 1.0 - smoothstep(-2.0, 2.0, density(other));
        visible = min(visible, 1.0 - smoothstep(rayH + 3.0, rayH + 16.0, other.b * surfaceHeight) * rock * occlusionStrength);
    }
    return visible;
}
float bounceLimit(vec2 delta, float i, float radius) {
    float theta = atan(delta.y, delta.x), st = (theta / 6.2831853 + 0.5) * 64.0;
    float a = floor(st), b = mod(a + 1.0, 64.0);
    vec2 x = texture2D(bounceVisibility, vec2((a + 0.5) / 64.0, (i + 0.5) / 6.0)).rg;
    vec2 y = texture2D(bounceVisibility, vec2((b + 0.5) / 64.0, (i + 0.5) / 6.0)).rg;
    return mix(x.r * 65280.0 + x.g * 255.0, y.r * 65280.0 + y.g * 255.0, fract(st)) / 65535.0 * radius;
}

void main() {
    vec2 p = vec2(view.x + uv.x * view.z, view.y + (1.0 - uv.y) * view.w);
    vec2 local = (p - terrainBounds.xy) / terrainBounds.zw;
    if (local.x < 0.0 || local.y < 0.0 || local.x > 1.0 || local.y > 1.0) { gl_FragColor = vec4(0.0); return; }
    vec2 st = terrainUV(p), texel = 1.0 / terrainPixels;
    vec4 g = texture2D(geometry, st), geo = texture2D(geology, st);
    float coverage = 1.0 - smoothstep(-pixelWorld * 0.9, pixelWorld * 0.9, density(g));
    if (coverage < 0.003) { gl_FragColor = vec4(0.0); return; }
    float h = g.b * surfaceHeight;
    vec2 gridOrigin=terrainBounds.xy+floor((p-terrainBounds.xy)/(terrainBounds.zw/(terrainPixels-1.0)))*(terrainBounds.zw/(terrainPixels-1.0));
    vec4 g0 = texture2D(geometry, st - vec2(texel.x, 0.0)), g1 = texture2D(geometry, st + vec2(texel.x, 0.0));
    vec4 g2 = texture2D(geometry, st - vec2(0.0, texel.y)), g3 = texture2D(geometry, st + vec2(0.0, texel.y));
    vec2 macro = vec2(g1.b - g0.b, g3.b - g2.b) * surfaceHeight / 24.0;
    vec2 mapping = decodeUV(texture2D(coordinates, st));
    vec2 mx0 = decodeUV(texture2D(coordinates, st - vec2(texel.x, 0.0))), mx1 = decodeUV(texture2D(coordinates, st + vec2(texel.x, 0.0)));
    vec2 my0 = decodeUV(texture2D(coordinates, st - vec2(0.0, texel.y))), my1 = decodeUV(texture2D(coordinates, st + vec2(0.0, texel.y)));
    vec2 jacX = clamp((mx1 - mx0) / 24.0, vec2(-2.2), vec2(2.2));
    vec2 jacY = clamp((my1 - my0) / 24.0, vec2(-2.2), vec2(2.2));
    float family = geo.r * 3.0, growth = geo.b;
    float bedType = family > 1.6 ? floor(family + 0.5) : 0.0;
    // Shape-aware triplanar stone: steep sides see the actual height coordinate,
    // not a camera-facing piece of a wallpaper. Smooth weights avoid face seams.
    vec3 macroNormal=normalize(vec3(-macro,1.0));
    vec3 projection=pow(abs(macroNormal),vec3(4.0));projection/=max(.001,projection.x+projection.y+projection.z);
    Mineral detail=sampleMineral(p/347.0,bedType);
    vec3 mineralColor=detail.color*projection.z;
    float materialAO=detail.ao*projection.z;
    vec2 micro=detail.slope*projection.z;
    if(projection.x>.018){
        Mineral side=sampleMineral(vec2(p.y,h)/347.0,bedType);
        mineralColor+=side.color*projection.x;materialAO+=side.ao*projection.x;
        micro+=vec2(side.slope.y*macro.x,side.slope.x+side.slope.y*macro.y)*projection.x;
    }
    if(projection.y>.018){
        Mineral side=sampleMineral(vec2(p.x,h)/347.0,bedType);
        mineralColor+=side.color*projection.y;materialAO+=side.ao*projection.y;
        micro+=vec2(side.slope.x+side.slope.y*macro.x,side.slope.y*macro.y)*projection.y;
    }
    detail.color=mineralColor;detail.ao=materialAO;
    if (growth > 0.02) {
        float type = floor(family + 0.5);
        Mineral deposit = sampleMineral(mapping / vec2(245.0, 410.0), type);
        detail.color = mix(detail.color, deposit.color, growth);
        micro=mix(micro,vec2(dot(deposit.slope,jacX),dot(deposit.slope,jacY)),growth);
        detail.ao = mix(detail.ao, deposit.ao, growth);
    }
    // Silhouette slope is primary. At a sharp edge, micro texture cannot flatten
    // the contour into a pasted plank, nor put a stripe over unrelated rock.
    float edge = 1.0 - smoothstep(2.0, 30.0, -density(g));
    micro *= mix(0.62, 0.12, edge) * normalStrength;
    vec3 n = normalize(vec3(-macro + micro, 1.0));
    vec3 base = detail.color;
    float stain = smoothstep(0.28, 0.82, geo.g);
    vec3 rockPalette=family>2.5?vec3(1.22,0.66,0.34):family>1.5?vec3(0.77,0.86,0.93):family>0.5?vec3(1.08,1.03,0.91):mix(vec3(1.04,1.02,0.96),vec3(.93,.68,.42),smoothstep(.36,.82,geo.g));
    base*=rockPalette;
    base*=mix(vec3(1.04,1.01,.96),vec3(.99,.87,.73),stain*.30);
    base = pow(clamp(base, 0.0, 1.0), vec3(2.2));
    float ao = mix(0.55, 1.0, detail.ao);
    vec2 delta = p - light;
    float distance = length(delta), theta = atan(delta.y, delta.x) - angle;
    theta = atan(sin(theta), cos(theta));
    float spill = exp(-pow(abs(theta) / max(0.01, fov * 0.36), 4.0));
    spill *= 1.0 - smoothstep(fov * 0.43, fov * 0.5, abs(theta));
    float hot = exp(-theta * theta / 0.031), cone = (spill * 0.65 + hot * 0.55) * enabled;
    float limit = beamDistance(theta), reach = 1.0 - smoothstep(limit + 12.0, limit + 170.0, distance);
    float fall = (1.0 - smoothstep(range * 0.72, range, distance)) / (1.0 + pow(distance / 188.0, 2.0));
    float lightHeight = 300.0;
    vec3 l = normalize(vec3(-delta, lightHeight - h));
    float diffuse = max(0.0, dot(n, l)), cameraPath = 30.0 + max(0.0, 160.0 - h) * 0.26;
    vec3 transmission = exp(-extinction * (distance * 1.48 + cameraPath));
    vec3 direct = vec3(1.24, 1.04, 0.88) * transmission * cone * reach * fall * lightEnergy;
    float visible = heightShadow(p, h, vec3(light, lightHeight));
    vec3 reflected = vec3(0.0);
    for (int i = 0; i < 6; i++) {
        if (float(i) >= bounceCount) break;
        vec4 source = bouncePositions[i], direction = bounceDirections[i];
        vec2 toSurface = p - source.xy;
        float d = length(toSurface), radius = direction.z;
        if (d > radius + 60.0) continue;
        vec3 incoming = normalize(vec3(-toSurface, source.z - h));
        float diffuseBounce = max(0.0, dot(n, incoming));
        float spread = pow(1.0 - smoothstep(0.0, radius + 40.0, d), 2.0) / (1.0 + pow(d / 77.0, 2.0));
        float secondary = bounceLimit(toSurface, float(i), radius);
        float occluded = 1.0 - smoothstep(secondary + 8.0, secondary + 82.0, d);
        float shadow = heightShadow(p, h, source.xyz);
        reflected += bounceColors[i].rgb * source.w * spread * (0.12 + 0.88 * diffuseBounce) * occluded * shadow;
    }
    vec3 color = base * (direct * (0.05 + 0.95 * diffuse) * visible + reflected * enabled) * ao;
    float nearby = exp(-distance / 185.0) * enabled;
    color += base * vec3(0.006, 0.018, 0.021) * nearby * ao * scatterStrength;
    float depth = max(0.0, p.y - surfaceY);
    color += base * vec3(0.43, 0.61, 0.44) * exp(-depth / 265.0) * (0.2 + 0.8 * max(0.0, dot(n, normalize(vec3(-0.4, -0.7, 1.0))))) * ao;
    color += base * 0.00024 * ao;
    vec3 halfVector = normalize(l + vec3(0.0, 0.0, 1.0));
    color += direct * pow(max(0.0, dot(n, halfVector)), mix(15.0, 35.0, growth)) * 0.035 * diffuse * ao * visible;
    if (inspect > 0.5 && inspect < 1.5) color = vec3(0.24) * (direct * (0.05 + 0.95 * diffuse) * visible + reflected * enabled) * ao;
    color = pow(aces(color), vec3(1.0 / 2.2));
    if (inspect > 1.5 && inspect < 2.5) color = n * 0.5 + 0.5;
    if (inspect > 2.5 && inspect < 3.5) color = detail.color;
    if (inspect > 3.5) color = pow(aces(reflected * 2.4), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, coverage);
}
