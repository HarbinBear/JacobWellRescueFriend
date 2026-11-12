precision highp float;
varying vec3 P;
varying vec3 N;
varying vec3 C;
varying vec4 LP;
uniform vec3 lightPos;
uniform vec3 lightDir;
uniform vec3 cameraPos;
uniform vec3 extinction;
uniform vec4 bounce[10];
uniform vec4 bounceNormal[10];
uniform float enabled;
uniform float shadowOn;
uniform float fov;
uniform float range;
uniform float energy;
uniform float matte;
uniform float guideRope;
uniform float surfaceY;
uniform sampler2D shadowMap;
uniform sampler2D sliceTex;
uniform vec2 gridOrigin;
uniform vec2 gridSize;
uniform float cellSize;
float visibility() {
    if (shadowOn < 0.5 || LP.w <= 0.0) return 1.0;
    vec3 q = LP.xyz / LP.w * 0.5 + 0.5;
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
    float s = 0.0, t = 0.75 / 1024.0;
    s += step(q.z - 0.00015, texture2D(shadowMap, q.xy + vec2(-t,-t)).r);
    s += step(q.z - 0.00015, texture2D(shadowMap, q.xy + vec2(t,-t)).r);
    s += step(q.z - 0.00015, texture2D(shadowMap, q.xy + vec2(-t,t)).r);
    s += step(q.z - 0.00015, texture2D(shadowMap, q.xy + vec2(t,t)).r);
    return s * 0.25;
}
// 鱼的厚度围绕玩法平面展开，仍以原二维切面约束靠墙的前半身。
void main() {
    vec2 uv = ((P.xy - gridOrigin) / cellSize + 0.5) / gridSize;
    if (texture2D(sliceTex,uv).a < 128.0 / 255.0) discard;
    vec3 n = normalize(N), view = normalize(cameraPos - P);
    // 薄鳍双面受光，身体法线仍是真实体积法线。
    if (!gl_FrontFacing) n = -n;
    vec3 col = C * vec3(0.32,0.45,0.38) * exp(-max(P.y - surfaceY,0.0) / 300.0) * (0.3 + 0.7 * max(-n.y,0.0));
    if (enabled > 0.5) {
        vec3 toL = lightPos - P;
        float d = length(toL);
        vec3 l = toL / max(d,0.01);
        float theta = acos(clamp(dot(-l,lightDir),-1.0,1.0));
        float spill = exp(-pow(theta / max(0.01,fov * 0.36),4.0)) * (1.0 - smoothstep(fov * 0.43,fov * 0.5,theta));
        float cone = (spill * 0.63 + exp(-theta * theta / 0.031) * 0.25) / 0.88 * (1.0 - step(fov * 0.5,theta));
        float beam = cone * visibility() * energy * (1.0 - smoothstep(range * 0.85,range * 1.2,d)) / (1.0 + pow(d / 200.0,2.0));
        float diffuse = max(dot(n,l),0.0);
        vec3 transmission = exp(-extinction * d * 0.38);
        if (guideRope > 0.5) {
            // 高可见度黄绳的纤维朝光源回射。保留光锥、岩石阴影及距离衰减。
            col += C * (1.4 + 1.55 * diffuse) * transmission * beam;
        } else {
            vec3 beamColor = mix(vec3(0.30,0.50,0.57),vec3(0.12,0.35,0.61),smoothstep(200.0,720.0,d));
            beamColor = mix(beamColor,mix(vec3(0.68,0.70,0.68),vec3(0.18,0.40,0.59),smoothstep(120.0,720.0,d)),matte);
            // 体色保留银灰；窄而柔的水下高光随转身移动。
            float specular = pow(max(dot(n,normalize(l + view)),0.0),mix(44.0,18.0,matte)) * mix(0.24,0.045,matte);
            col += (C * (diffuse * 0.78 + 0.035) + vec3(specular)) * beamColor * transmission * beam;
        }
        for (int i=0; i<10; i++) {
            vec3 toB = bounce[i].xyz - P;
            float db = length(toB);
            vec3 b = toB / max(db,0.01);
            float returned = bounce[i].w * max(dot(bounceNormal[i].xyz,-b),0.0) * max(dot(n,b),0.0);
            returned *= (1.0 - smoothstep(220.0,650.0,db)) / (1.0 + db * db / 65000.0);
            col += C * vec3(0.028,0.21,0.50) * returned;
        }
    }
    // 关灯时仍与角色共享近身可读性，九十单位之外不增加环境兜底亮度。
    float nearFill = 1.0 - smoothstep(30.0,90.0,length(lightPos - P));
    col += C * vec3(0.025,0.055,0.075) * nearFill * (0.25 + 0.75 * max(dot(n,view),0.0));
    if (guideRope > 0.5) {
        float nearby = 1.0 - smoothstep(45.0,190.0,length(lightPos - P));
        col += C * 0.24 * nearby * (0.4 + 0.6 * max(dot(n,view),0.0));
    }
    gl_FragColor = vec4(pow(col / (1.0 + col),vec3(1.0 / 2.2)),1.0);
}
