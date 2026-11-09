precision highp float;
varying vec2 uv;
uniform sampler2D geometry;
uniform sampler2D mineral;
uniform sampler2D relief;
uniform sampler2D beam;
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
uniform float elapsed;
uniform float pixelWorld;
uniform float inspect;
uniform float normalStrength;
uniform float occlusionStrength;
uniform float lightEnergy;
uniform float scatterStrength;
uniform vec3 bounce0;
uniform vec3 bounce1;
uniform vec3 bounce2;

vec2 terrainUV(vec2 p) {
    vec2 local = (p - terrainBounds.xy) / terrainBounds.zw;
    return (local * (terrainPixels - 1.0) + 0.5) / terrainPixels;
}
float density(vec4 g) { return (g.r * 65280.0 + g.g * 255.0) / 65535.0 * 384.0 - 192.0; }
float elevation(vec2 p) { return texture2D(geometry, terrainUV(p)).b * 144.0; }
float beamDistance(float theta) {
    float index = clamp(theta / fov + 0.5, 0.0, 1.0) * 511.0;
    float i = floor(index);
    vec2 a = texture2D(beam, vec2((i + 0.5) / 512.0, 0.5)).rg;
    vec2 b = texture2D(beam, vec2((min(i + 1.0, 511.0) + 0.5) / 512.0, 0.5)).rg;
    return mix(a.r * 65280.0 + a.g * 255.0, b.r * 65280.0 + b.g * 255.0, fract(index)) / 65535.0 * range;
}
vec2 atlasUV(vec2 p, float tile) {
    vec2 offset = vec2(mod(tile, 2.0), floor(tile / 2.0));
    return (offset * 512.0 + 8.0 + fract(p) * 496.0) / 1024.0;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 bounceLight(vec3 source, vec2 p, float height, float cameraPath) {
    vec2 delta = p - source.xy;
    float d = length(delta);
    float primaryPath = length(source.xy - light);
    float fall = pow(1.0 - smoothstep(0.0, 210.0, d), 2.0);
    vec4 blocker = texture2D(geometry, terrainUV((source.xy + p) * 0.5));
    float visible = 1.0 - smoothstep(max(26.0, height) + 8.0, max(26.0, height) + 26.0, blocker.b * 144.0);
    visible = mix(visible, 1.0, smoothstep(-2.0, 2.0, density(blocker)));
    vec3 transmission = exp(-extinction * (primaryPath * 1.48 + d * 1.1 + cameraPath));
    return vec3(1.24, 1.04, 0.88) * transmission * source.z * fall * visible * 0.085;
}

void main() {
    vec2 p = vec2(view.x + uv.x * view.z, view.y + (1.0 - uv.y) * view.w);
    vec2 local = (p - terrainBounds.xy) / terrainBounds.zw;
    if (local.x < 0.0 || local.y < 0.0 || local.x > 1.0 || local.y > 1.0) { gl_FragColor = vec4(0.0); return; }
    vec2 st = terrainUV(p), texel = 1.0 / terrainPixels;
    vec4 g = texture2D(geometry, st);
    float d = density(g);
    float coverage = 1.0 - smoothstep(-pixelWorld * 0.9, pixelWorld * 0.9, d);
    if (coverage < 0.003) { gl_FragColor = vec4(0.0); return; }
    float h = g.b * 144.0;
    vec4 gx0 = texture2D(geometry, st - vec2(texel.x, 0.0));
    vec4 gx1 = texture2D(geometry, st + vec2(texel.x, 0.0));
    vec4 gy0 = texture2D(geometry, st - vec2(0.0, texel.y));
    vec4 gy1 = texture2D(geometry, st + vec2(0.0, texel.y));
    vec2 slope = vec2(gx1.b - gx0.b, gy1.b - gy0.b) * 144.0 / 24.0;
    // Continuous deposition chooses the rock type, not an atlas checkerboard.
    float wax = smoothstep(0.18, 0.88, g.a);
    vec2 rockUV = vec2(p.x / 347.0 + sin(p.y * 0.002) * 0.08, p.y / 347.0 + sin(p.x * 0.0031) * 0.045);
    vec2 flowUV = vec2(p.x / 287.0 + sin(p.y * 0.007) * 0.038, p.y / 405.0);
    vec2 uv0 = atlasUV(rockUV, 0.0), uv1 = atlasUV(flowUV, 1.0), uv2 = atlasUV(rockUV * 0.81 + vec2(0.23, 0.17), 2.0);
    vec4 r0 = texture2D(relief, uv0), r1 = texture2D(relief, uv1), r2 = texture2D(relief, uv2);
    vec3 b0 = texture2D(mineral, uv0).rgb, b1 = texture2D(mineral, uv1).rgb, b2 = texture2D(mineral, uv2).rgb;
    float bedding = (1.0 - wax) * (0.25 + 0.20 * sin(p.x * 0.0012 + p.y * 0.0016));
    vec4 fine = mix(mix(r0, r2, bedding), r1, wax);
    vec3 base = mix(mix(b0, b2, bedding), b1, wax);
    float veins = sin(p.y * 0.018 + sin(p.x * 0.0027) * 2.7 + g.a * 3.0);
    float iron = smoothstep(0.3, 0.83, sin(p.x * 0.0018 + p.y * 0.0007) * sin(p.y * 0.0025 - p.x * 0.0008));
    base = mix(base, base * vec3(0.87, 0.68, 0.44), iron * 0.48);
    base *= 0.98 + veins * 0.017;
    base = pow(max(base, vec3(0.0)), vec3(2.2));
    vec2 fineXY = fine.rg * 2.0 - 1.0;
    float fineZ = sqrt(max(0.12, 1.0 - dot(fineXY, fineXY)));
    vec3 n = normalize(vec3(-slope + fineXY / fineZ * normalStrength, 1.0));
    vec2 delta = p - light;
    float distance = length(delta), theta = atan(delta.y, delta.x) - angle;
    theta = atan(sin(theta), cos(theta));
    float spill = exp(-pow(abs(theta) / max(0.01, fov * 0.36), 4.0));
    spill *= 1.0 - smoothstep(fov * 0.43, fov * 0.5, abs(theta));
    float hotspot = exp(-theta * theta / 0.031);
    float cone = (spill * 0.65 + hotspot * 0.55) * enabled;
    float hit = beamDistance(theta);
    // Visible thick front faces extend behind the canonical 2D edge. Water
    // illumination still terminates at that edge; this is a 2.5D height surface.
    float reach = 1.0 - smoothstep(hit + 12.0, hit + 150.0, distance);
    float fall = (1.0 - smoothstep(range * 0.72, range, distance)) / (1.0 + pow(distance / 188.0, 2.0));
    float lightHeight = 140.0;
    vec3 l = normalize(vec3(-delta, lightHeight - h));
    float lambert = max(0.0, dot(n, l));
    float ao = fine.a;
    float visibility = 1.0;
    vec2 toward = -delta / max(distance, 0.001);
    for (int i = 0; i < 4; i++) {
        float stepLength = min(8.0 * pow(2.0, float(i)), max(0.0, distance - 0.5));
        vec2 q = p + toward * stepLength;
        vec4 other = texture2D(geometry, terrainUV(q));
        float rayHeight = h + (lightHeight - h) * stepLength / max(distance, 1.0);
        float solid = 1.0 - smoothstep(-2.0, 2.0, density(other));
        float obstruction = smoothstep(rayHeight + 2.0, rayHeight + 10.0, other.b * 144.0) * solid;
        visibility = min(visibility, 1.0 - obstruction * occlusionStrength);
    }
    float cameraPath = 34.0 + max(0.0, 84.0 - h) * 0.55;
    vec3 transmission = exp(-extinction * (distance * 1.48 + cameraPath));
    vec3 direct = vec3(1.24, 1.04, 0.88) * transmission * cone * reach * fall * lightEnergy;
    vec3 color = base * direct * (0.07 + 0.93 * lambert) * ao * visibility;
    // Low-frequency indirect illumination is local, not an emissive blue wall.
    float nearby = exp(-distance / 185.0) * enabled;
    float wrap = (0.5 + 0.5 * max(0.0, dot(n, normalize(vec3(-delta, 250.0))))) * nearby;
    vec3 reflected = bounceLight(bounce0, p, h, cameraPath) + bounceLight(bounce1, p, h, cameraPath) + bounceLight(bounce2, p, h, cameraPath);
    color += base * reflected * ao * enabled * scatterStrength;
    color += base * vec3(0.007, 0.022, 0.028) * wrap * ao * scatterStrength;
    float depth = max(0.0, p.y - surfaceY);
    vec3 daylight = vec3(0.43, 0.61, 0.44) * exp(-depth / 265.0);
    color += base * daylight * (0.28 + 0.72 * max(0.0, dot(n, normalize(vec3(-0.4, -0.7, 1.0))))) * ao;
    color += base * 0.00024 * ao;
    vec3 halfVector = normalize(l + vec3(0.0, 0.0, 1.0));
    float specular = pow(max(0.0, dot(n, halfVector)), mix(18.0, 44.0, wax));
    color += direct * specular * 0.025 * lambert * ao * visibility;
    if (inspect > 0.5 && inspect < 1.5) {
        color = vec3(0.24) * direct * (0.07 + 0.93 * lambert) * ao * visibility + vec3(0.004) * wrap;
    }
    color = pow(aces(color), vec3(1.0 / 2.2));
    if (inspect > 1.5) color = n * 0.5 + 0.5;
    // Keep source alpha unpremultiplied, no discard, no second darkening pass.
    gl_FragColor = vec4(color, coverage);
}
