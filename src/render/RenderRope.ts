import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { ctx, canvas } from './Canvas';
import { pathLength, samplePolyline, polylineNormal } from '../logic/Pathfinding';

function generateSlackRopePoints(basePath: any[], slackFactor: number, animTime: number): any[] {
    if(!basePath || basePath.length < 2) return basePath || [];
    const totalLen = pathLength(basePath);
    if(totalLen < 1) return basePath;
    const segLen = CONFIG.ropeSegmentLength;
    const steps = Math.max(2, Math.ceil(totalLen / segLen));
    const dt = totalLen / steps;
    const time = animTime || 0;
    const points: any[] = [];
    for(let i=0; i<=steps; i++) {
        const t = i * dt;
        const fraction = totalLen > 0 ? t/totalLen : 0;
        const pos = samplePolyline(basePath, t);
        const norm = polylineNormal(basePath, t);
        const sagEnvelope = Math.sin(fraction * Math.PI);
        const sag = sagEnvelope * CONFIG.ropeSlackAmplitude * slackFactor;
        const gravity = sagEnvelope * CONFIG.ropeSlackGravity * slackFactor;
        const wave = Math.sin(fraction*Math.PI*2*CONFIG.ropeWaveFrequency + time*CONFIG.ropeWaveSpeed) * CONFIG.ropeWaveAmplitude * slackFactor * sagEnvelope;
        const drift = Math.sin(fraction*Math.PI*1.3 + time*CONFIG.ropeDriftSpeed + 0.5) * CONFIG.ropeDriftAmplitude * slackFactor * sagEnvelope;
        points.push({ x: pos.x + norm.x*(sag+wave+drift), y: pos.y + norm.y*(sag+wave+drift) + gravity });
    }
    return points;
}

function strokeRopeLine(points: any[], color: string, width: number) {
    if(!points || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    if(points.length === 2) {
        ctx.lineTo(points[1].x, points[1].y);
    } else {
        for(let i=1; i<points.length-1; i++) {
            let midX=(points[i].x+points[i+1].x)/2, midY=(points[i].y+points[i+1].y)/2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
    }
    ctx.stroke(); ctx.restore();
}

function drawNail(x: number, y: number, wallX: number, wallY: number) {
    ctx.save();
    let angle = Math.atan2(y-wallY, x-wallX);
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = CONFIG.ropeNailColor; ctx.fillRect(-2, -1.5, CONFIG.ropeNailRadius*2, 3);
    ctx.beginPath(); ctx.arc(0, 0, CONFIG.ropeNailRadius*0.6, 0, Math.PI*2);
    ctx.fillStyle = '#aaa'; ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
}

function drawKnot(x: number, y: number) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, CONFIG.ropeKnotRadius, 0, Math.PI*2);
    ctx.fillStyle = CONFIG.ropeKnotColor; ctx.fill();
    ctx.strokeStyle = 'rgba(180,170,120,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(150,140,100,0.6)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x-2,y-1); ctx.lineTo(x+2,y+1); ctx.moveTo(x-2,y+1); ctx.lineTo(x+2,y-1); ctx.stroke();
    ctx.restore();
}

function drawReelIndicator(x: number, y: number, angle: number) {
    ctx.save(); ctx.translate(x, y);
    let reelX = -Math.cos(angle)*12, reelY = -Math.sin(angle)*12;
    ctx.beginPath(); ctx.arc(reelX, reelY, CONFIG.ropeReelRadius, 0, Math.PI*2);
    ctx.fillStyle = CONFIG.ropeReelColor; ctx.fill();
    ctx.strokeStyle = 'rgba(160,150,110,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    let t = Date.now()/500;
    ctx.strokeStyle = 'rgba(230,220,170,0.5)'; ctx.lineWidth = 0.8;
    for(let i=0; i<3; i++) {
        let a = t + i*Math.PI*2/3;
        ctx.beginPath(); ctx.moveTo(reelX, reelY);
        ctx.lineTo(reelX+Math.cos(a)*CONFIG.ropeReelRadius*0.8, reelY+Math.sin(a)*CONFIG.ropeReelRadius*0.8); ctx.stroke();
    }
    ctx.restore();
}

export function drawRopesWorld() {
    if(!state.rope) return;
    const time = Date.now()/1000;
    for(let rope of state.rope.ropes) {
        if(!rope.path || rope.path.length < 2) continue;
        let visualPts = generateSlackRopePoints(rope.path, rope.slackFactor||0, time);
        strokeRopeLine(visualPts, CONFIG.ropeTightColor, CONFIG.ropeTightWidth);
        if(rope.start && rope.startWall) { drawNail(rope.start.x, rope.start.y, rope.startWall.x, rope.startWall.y); drawKnot(rope.start.x, rope.start.y); }
        if(rope.end && rope.endWall) { drawNail(rope.end.x, rope.end.y, rope.endWall.x, rope.endWall.y); drawKnot(rope.end.x, rope.end.y); }
    }
    if(state.rope.active && state.rope.current && state.rope.current.start) {
        let cur = state.rope.current;
        if(!cur.path || cur.path.length < 2) return;
        let visualPts = generateSlackRopePoints(cur.path, cur.slackFactor!==undefined?cur.slackFactor:1, cur.time||time);
        strokeRopeLine(visualPts, CONFIG.ropeColor, CONFIG.ropeWidth);
        if(cur.start && cur.startWall) { drawNail(cur.start.x, cur.start.y, cur.startWall.x, cur.startWall.y); drawKnot(cur.start.x, cur.start.y); }
    }
    if(state.rope.active && player.y > 0) drawReelIndicator(player.x, player.y, player.angle);
}

export function drawRopeButton() {
    if(state.screen !== 'play') return;
    if(!state.rope || !state.rope.ui || !state.rope.ui.visible) return;
    const btnX = CONFIG.screenWidth * CONFIG.ropeButtonXRatio;
    const btnY = CONFIG.screenHeight * CONFIG.ropeButtonYRatio;
    const radius = CONFIG.ropeButtonRadius;
    const progress = state.rope.ui.progress || 0;
    const isEnd = state.rope.ui.type === 'end';
    const time = Date.now()/1000;
    ctx.save();
    if(progress === 0) {
        let glowAlpha = 0.15 + Math.sin(time*3)*0.1;
        ctx.beginPath(); ctx.arc(btnX, btnY, radius+8, 0, Math.PI*2);
        ctx.fillStyle = `rgba(230,220,170,${glowAlpha})`; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(btnX, btnY, radius, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(20,30,40,0.85)'; ctx.fill();
    ctx.strokeStyle = isEnd ? 'rgba(255,180,80,0.7)' : 'rgba(200,220,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    if(progress > 0) {
        ctx.strokeStyle = isEnd ? 'rgba(255,200,100,0.95)' : 'rgba(230,220,170,0.95)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(btnX, btnY, radius-5, -Math.PI/2, -Math.PI/2+progress*Math.PI*2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    if(isEnd) {
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(btnX, btnY-3, 5, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(btnX, btnY+2); ctx.lineTo(btnX, btnY+10); ctx.stroke();
    } else {
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(btnX, btnY, 7, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(btnX, btnY, 3, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '10px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(isEnd ? '结束布线' : '开始布线', btnX, btnY+radius+6);
    ctx.restore();
}
