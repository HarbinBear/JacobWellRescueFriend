import { CONFIG } from '../core/config';
import { state } from '../core/state';

// 射线-圆相交检测
export function rayCircleIntersect(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, cr: number): number {
    let fx = ox-cx, fy = oy-cy;
    let a = dx*dx + dy*dy;
    let b = 2*(fx*dx + fy*dy);
    let c = fx*fx + fy*fy - cr*cr;
    let discriminant = b*b - 4*a*c;
    if (discriminant < 0) return Infinity;
    let t1 = (-b - Math.sqrt(discriminant)) / (2*a);
    return t1 > 0 ? t1 : Infinity;
}

// 射线-AABB相交检测
export function rayBoxIntersect(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, halfSize: number): number {
    let minX = cx-halfSize, maxX = cx+halfSize, minY = cy-halfSize, maxY = cy+halfSize;
    let tmin = -Infinity, tmax = Infinity;
    if (Math.abs(dx) > 1e-8) {
        let t1=(minX-ox)/dx, t2=(maxX-ox)/dx;
        if(t1>t2){let tmp=t1;t1=t2;t2=tmp;}
        tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2);
    } else { if(ox<minX||ox>maxX) return Infinity; }
    if (Math.abs(dy) > 1e-8) {
        let t1=(minY-oy)/dy, t2=(maxY-oy)/dy;
        if(t1>t2){let tmp=t1;t1=t2;t2=tmp;}
        tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2);
    } else { if(oy<minY||oy>maxY) return Infinity; }
    if(tmin>tmax||tmax<0) return Infinity;
    return tmin > 0 ? tmin : Infinity;
}

// ============ 蓝噪声纹理（生成一次）============
let _blueNoiseTex: Float32Array | null = null;
const BLUE_NOISE_SIZE = 64;

function getBlueNoise(): Float32Array {
    if (_blueNoiseTex) return _blueNoiseTex;
    let size = BLUE_NOISE_SIZE;
    let tex = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let v = 52.9829189 * (0.06711056 * x + 0.00583715 * y);
            tex[y * size + x] = v - Math.floor(v);
        }
    }
    _blueNoiseTex = tex;
    return tex;
}

let _blueNoiseFrame = 0;

export function sampleBlueNoise(u: number, v: number): number {
    let tex = getBlueNoise();
    let size = BLUE_NOISE_SIZE;
    let offset = _blueNoiseFrame * 7;
    let ix = ((Math.floor(u) % size) + size + offset) % size;
    let iy = ((Math.floor(v) % size) + size) % size;
    return tex[iy * size + ix];
}

// ============ 逐射线逐步长泥沙衰减 ============
export function computeSiltAttenuation(sx: number, sy: number, angle: number, maxDist: number, fovDeg: number, particles: any[]): any {
    _blueNoiseFrame++;
    let fovRad = fovDeg * Math.PI / 180;
    let startAngle = angle - fovRad / 2;
    let rays = CONFIG.rayCount;
    let rayStep = fovRad / rays;
    let steps = CONFIG.siltSampleSteps || 12;
    let stepDist = maxDist / steps;
    let absorptionCoeff = CONFIG.siltAbsorptionCoeff || 3.0;
    let influenceRadius = CONFIG.siltInfluenceRadius || 30;
    let maxRangeSq = (maxDist + influenceRadius) * (maxDist + influenceRadius);
    let minOccludeDistSq = (influenceRadius * 2) * (influenceRadius * 2);
    let lightDirX = Math.cos(angle), lightDirY = Math.sin(angle);
    let cosHalfFov = Math.cos(fovRad / 2 + 0.15);
    let siltList: any[] = [];
    for (let p of particles) {
        if (p.type !== 'silt') continue;
        let conc = p.alpha * p.life;
        if (conc <= 0.005) continue;
        let dx = p.x-sx, dy = p.y-sy;
        let distSq = dx*dx + dy*dy;
        if (distSq > maxRangeSq || distSq < minOccludeDistSq) continue;
        let dist = Math.sqrt(distSq);
        if ((dx*lightDirX + dy*lightDirY) / dist < cosHalfFov) continue;
        siltList.push(p);
    }
    if (siltList.length === 0) return null;

    let stride = steps + 1;
    let opticalDepth = new Float32Array((rays + 1) * stride);
    let rayDirs = new Float32Array((rays + 1) * 2);
    let rayStartOffset = new Float32Array(rays + 1);
    for (let i = 0; i <= rays; i++) {
        let bn = sampleBlueNoise(i, 0);
        let a = startAngle + i*rayStep + (bn-0.5)*rayStep*0.4;
        rayDirs[i*2]=Math.cos(a); rayDirs[i*2+1]=Math.sin(a);
        rayStartOffset[i] = (sampleBlueNoise(i, 32) - 0.5) * stepDist * 0.5;
    }
    for (let p of siltList) {
        let relX=p.x-sx, relY=p.y-sy;
        let concentration = p.alpha * p.life;
        let effectiveRadius = p.size*0.5 + influenceRadius*0.3;
        let pDist = Math.sqrt(relX*relX + relY*relY);
        if (pDist < 1) continue;
        let angularExtent = Math.atan2(effectiveRadius, pDist);
        let midAngle = startAngle + fovRad/2;
        let da = p.x===sx&&p.y===sy ? 0 : Math.atan2(relY,relX) - midAngle;
        da = da - Math.round(da/(2*Math.PI))*2*Math.PI;
        let wrappedAngle = midAngle + da;
        let iMin = Math.max(0, Math.floor((wrappedAngle-angularExtent-startAngle)/rayStep)-1);
        let iMax = Math.min(rays, Math.ceil((wrappedAngle+angularExtent-startAngle)/rayStep)+1);
        for (let i = iMin; i <= iMax; i++) {
            let cosA=rayDirs[i*2], sinA=rayDirs[i*2+1];
            let projT = relX*cosA + relY*sinA;
            if (projT<0||projT>maxDist) continue;
            let perpX=relX-projT*cosA, perpY=relY-projT*sinA;
            let perpDistSq = perpX*perpX + perpY*perpY;
            if (perpDistSq >= effectiveRadius*effectiveRadius) continue;
            let lateralFalloff = 1.0 - perpDistSq/(effectiveRadius*effectiveRadius);
            let contribution = concentration * lateralFalloff * (p.size/15.0) * absorptionCoeff;
            let stepIdx = Math.max(1, Math.min(steps, Math.floor((projT-rayStartOffset[i])/stepDist)));
            opticalDepth[i*stride + stepIdx] += contribution;
        }
    }
    let perStep = new Float32Array((rays + 1) * stride);
    for (let i = 0; i <= rays; i++) {
        let base = i*stride;
        let tau = 0;
        perStep[base] = 1.0;
        for (let s = 1; s <= steps; s++) {
            tau += opticalDepth[base+s];
            perStep[base+s] = Math.max(0, 1.0-tau);
        }
    }
    return { perStep, rays, steps, stride, stepDist };
}

export function getLightPolygon(sx: number, sy: number, angle: number, maxDist: number, fovDeg: number = CONFIG.fov): any[] {
    let points: any[] = [];
    let fovRad = fovDeg * Math.PI / 180;
    let startAngle = angle - fovRad/2;
    let rays = CONFIG.rayCount;
    let step = fovRad / rays;
    const { tileSize } = CONFIG;
    const halfTile = tileSize / 2;
    let rMin = Math.max(0, Math.floor((sy-maxDist)/tileSize)-1);
    let rMax = Math.min(CONFIG.rows-1, Math.floor((sy+maxDist)/tileSize)+1);
    let cMin = Math.max(0, Math.floor((sx-maxDist)/tileSize)-1);
    let cMax = Math.min(CONFIG.cols-1, Math.floor((sx+maxDist)/tileSize)+1);
    let obstacles: any[] = [];
    for (let r=rMin; r<=rMax; r++) {
        if (!state.map[r]) continue;
        for (let c=cMin; c<=cMax; c++) {
            let cell = state.map[r][c];
            if (!cell) continue;
            if (typeof cell === 'object') {
                let dx=cell.x-sx, dy=cell.y-sy;
                if (dx*dx+dy*dy < (maxDist+cell.r)*(maxDist+cell.r))
                    obstacles.push({ type:'circle', x:cell.x, y:cell.y, r:cell.r });
            } else if (cell === 2) {
                let cx=c*tileSize+halfTile, cy=r*tileSize+halfTile;
                let dx=cx-sx, dy=cy-sy;
                if (dx*dx+dy*dy < (maxDist+tileSize)*(maxDist+tileSize))
                    obstacles.push({ type:'box', x:cx, y:cy, half:halfTile });
            }
        }
    }
    for (let i=0; i<=rays; i++) {
        let a = startAngle + i*step + (sampleBlueNoise(i,0)-0.5)*step*0.4;
        let dx=Math.cos(a), dy=Math.sin(a);
        let closestDist = maxDist;
        for (let obs of obstacles) {
            let hitDist = obs.type==='circle'
                ? rayCircleIntersect(sx,sy,dx,dy,obs.x,obs.y,obs.r)
                : rayBoxIntersect(sx,sy,dx,dy,obs.x,obs.y,obs.half);
            if (hitDist < closestDist) closestDist = hitDist;
        }
        points.push({ x:sx+dx*closestDist, y:sy+dy*closestDist, dist:closestDist });
    }
    return points;
}

export function isLineOfSight(x1: number, y1: number, x2: number, y2: number, maxDist: number): boolean {
    let dist = Math.hypot(x2-x1, y2-y1);
    if(dist > maxDist) return false;
    const { tileSize } = CONFIG;
    let dx=x2-x1, dy=y2-y1;
    let steps = Math.ceil(dist / (tileSize*0.35));
    for(let i=0; i<=steps; i++) {
        let t=i/steps, cx=x1+dx*t, cy=y1+dy*t;
        let r=Math.floor(cy/tileSize), c=Math.floor(cx/tileSize);
        if(state.map[r] && state.map[r][c]) {
            let cell = state.map[r][c];
            if(cell===2) return false;
            if(typeof cell==='object' && Math.hypot(cx-cell.x,cy-cell.y)<cell.r) return false;
        }
    }
    return true;
}

// 统一的手电筒绘制函数
// siltData: 可选的泥沙衰减数据（来自 computeSiltAttenuation），null 表示无泥沙
export function drawFlashlight(renderCtx: CanvasRenderingContext2D, x: number, y: number, angle: number, rayDist: number, mode: string = 'mask', siltData: any = null) {
    renderCtx.save();

    let poly = getLightPolygon(x, y, angle, rayDist, CONFIG.fov);

    if (mode === 'mask') {
        if (siltData) {
            let { perStep, rays, steps, stride, stepDist } = siltData;

            let calcBrightness = (dr: number) => {
                if (dr < 0.5) return 1.0;
                if (dr < 0.85) return 1.0 - (dr - 0.5) / 0.35 * 0.4;
                return 0.6 * (1 - (dr - 0.85) / 0.15);
            };

            for (let i = 0; i < poly.length - 1; i++) {
                let p0 = poly[i];
                let p1 = poly[i + 1];
                let dx0 = p0.x - x, dy0 = p0.y - y;
                let len0 = Math.hypot(dx0, dy0) || 1;
                let dx1 = p1.x - x, dy1 = p1.y - y;
                let len1 = Math.hypot(dx1, dy1) || 1;
                let maxLen = Math.max(len0, len1);

                for (let s = 0; s < steps; s++) {
                    let nearDist = s * stepDist;
                    let farDist = Math.min((s + 1) * stepDist, maxLen);
                    if (nearDist >= maxLen) break;

                    let nearTrans0 = perStep[i * stride + s];
                    let nearTrans1 = perStep[Math.min(i + 1, rays) * stride + s];
                    let nearTransAvg = (nearTrans0 + nearTrans1) / 2;
                    let farS = Math.min(s + 1, steps);
                    let farTrans0 = perStep[i * stride + farS];
                    let farTrans1 = perStep[Math.min(i + 1, rays) * stride + farS];
                    let farTransAvg = (farTrans0 + farTrans1) / 2;

                    if (nearTransAvg < 0.01 && farTransAvg < 0.01) continue;

                    let nearRatio0 = Math.min(nearDist / len0, 1);
                    let farRatio0 = Math.min(farDist / len0, 1);
                    let nearRatio1 = Math.min(nearDist / len1, 1);
                    let farRatio1 = Math.min(farDist / len1, 1);

                    let nx0 = x + dx0 * nearRatio0, ny0 = y + dy0 * nearRatio0;
                    let fx0 = x + dx0 * farRatio0,  fy0 = y + dy0 * farRatio0;
                    let nx1 = x + dx1 * nearRatio1, ny1 = y + dy1 * nearRatio1;
                    let fx1 = x + dx1 * farRatio1,  fy1 = y + dy1 * farRatio1;

                    let nearAlpha = calcBrightness(nearDist / rayDist) * nearTransAvg;
                    let farAlpha  = calcBrightness(farDist  / rayDist) * farTransAvg;
                    if (nearAlpha < 0.005 && farAlpha < 0.005) continue;

                    let grad = renderCtx.createLinearGradient(
                        (nx0+nx1)/2, (ny0+ny1)/2, (fx0+fx1)/2, (fy0+fy1)/2
                    );
                    grad.addColorStop(0, `rgba(255,255,255,${nearAlpha})`);
                    grad.addColorStop(1, `rgba(255,255,255,${farAlpha})`);
                    renderCtx.fillStyle = grad;
                    renderCtx.beginPath();
                    renderCtx.moveTo(nx0, ny0);
                    renderCtx.lineTo(fx0, fy0);
                    renderCtx.lineTo(fx1, fy1);
                    renderCtx.lineTo(nx1, ny1);
                    renderCtx.closePath();
                    renderCtx.fill();
                }
            }

            // 边缘缺口处理
            let featherDist = CONFIG.lightEdgeFeather || 25;
            for (let i = 0; i < poly.length - 1; i++) {
                let finalTrans = (perStep[i * stride + steps] + perStep[Math.min(i+1,rays) * stride + steps]) / 2;
                if (finalTrans < 0.05) continue;
                let p0 = poly[i], p1 = poly[i+1];
                let dx0 = p0.x-x, dy0 = p0.y-y, len0 = Math.hypot(dx0,dy0)||1;
                let dx1 = p1.x-x, dy1 = p1.y-y, len1 = Math.hypot(dx1,dy1)||1;
                renderCtx.fillStyle = `rgba(255,255,255,${finalTrans*0.3})`;
                renderCtx.beginPath();
                renderCtx.moveTo(p0.x, p0.y);
                renderCtx.lineTo(p0.x+(dx0/len0)*featherDist, p0.y+(dy0/len0)*featherDist);
                renderCtx.lineTo(p1.x+(dx1/len1)*featherDist, p1.y+(dy1/len1)*featherDist);
                renderCtx.lineTo(p1.x, p1.y);
                renderCtx.closePath();
                renderCtx.fill();
            }
        } else {
            // 无泥沙：简单径向渐变
            let mainGradient = renderCtx.createRadialGradient(x, y, 0, x, y, rayDist);
            mainGradient.addColorStop(0,    'rgba(255,255,255,1.0)');
            mainGradient.addColorStop(0.5,  'rgba(255,255,255,0.95)');
            mainGradient.addColorStop(0.85, 'rgba(255,255,255,0.6)');
            mainGradient.addColorStop(1,    'rgba(255,255,255,0)');
            renderCtx.fillStyle = mainGradient;
            renderCtx.beginPath();
            renderCtx.moveTo(x, y);
            for (let p of poly) renderCtx.lineTo(p.x, p.y);
            renderCtx.closePath();
            renderCtx.fill();

            // 边缘缺口
            let featherDist = CONFIG.lightEdgeFeather || 25;
            let featherPoly = poly.map((p: any) => {
                let dx = p.x-x, dy = p.y-y, len = Math.hypot(dx,dy)||1;
                return { x: p.x+(dx/len)*featherDist, y: p.y+(dy/len)*featherDist };
            });
            let featherGrad = renderCtx.createRadialGradient(x, y, 0, x, y, rayDist+featherDist);
            featherGrad.addColorStop(0,   'rgba(255,255,255,0.4)');
            featherGrad.addColorStop(0.7, 'rgba(255,255,255,0.2)');
            featherGrad.addColorStop(1,   'rgba(255,255,255,0)');
            renderCtx.fillStyle = featherGrad;
            renderCtx.beginPath();
            renderCtx.moveTo(x, y);
            for (let p of featherPoly) renderCtx.lineTo(p.x, p.y);
            renderCtx.closePath();
            renderCtx.fill();
        }
    } else if (mode === 'volumetric') {
        renderCtx.globalCompositeOperation = 'screen';
        let grad = renderCtx.createRadialGradient(x, y, 0, x, y, rayDist);
        grad.addColorStop(0, CONFIG.flashlightColor);
        grad.addColorStop(1, 'rgba(255,250,200,0)');
        renderCtx.fillStyle = grad;
        renderCtx.beginPath();
        renderCtx.moveTo(x, y);
        for(let p of poly) renderCtx.lineTo(p.x, p.y);
        renderCtx.closePath();
        renderCtx.fill();

        let centerPoly = getLightPolygon(x, y, angle, rayDist, CONFIG.flashlightCenterFov);
        let centerGrad = renderCtx.createRadialGradient(x, y, 0, x, y, rayDist);
        centerGrad.addColorStop(0, CONFIG.flashlightCenterColor);
        centerGrad.addColorStop(1, 'rgba(255,255,220,0)');
        renderCtx.fillStyle = centerGrad;
        renderCtx.beginPath();
        renderCtx.moveTo(x, y);
        for(let p of centerPoly) renderCtx.lineTo(p.x, p.y);
        renderCtx.closePath();
        renderCtx.fill();
    }
    renderCtx.restore();
}
