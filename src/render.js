import { CONFIG } from './config.js';
import { state, player, target, particles, touches } from './state.js';

// 创建画布
export const canvas = tt.createCanvas();
export const ctx = canvas.getContext('2d');

// 设置画布尺寸
canvas.width = CONFIG.screenWidth;
canvas.height = CONFIG.screenHeight;

// 资源缓存
const wallPatternCanvas = tt.createCanvas(); // 岩石纹理
const lightLayer = tt.createCanvas(); // 光照遮罩层
lightLayer.width = canvas.width;
lightLayer.height = canvas.height;
const lightCtx = lightLayer.getContext('2d');

// --- 预生成岩石纹理 ---
export function initTextures() {
    wallPatternCanvas.width = 100;
    wallPatternCanvas.height = 100;
    const pCtx = wallPatternCanvas.getContext('2d');
    pCtx.fillStyle = '#222'; 
    pCtx.fillRect(0,0,100,100);
    // 噪点
    for(let i=0; i<300; i++) {
        pCtx.fillStyle = Math.random() > 0.5 ? '#555' : '#333';
        pCtx.beginPath();
        pCtx.arc(Math.random()*100, Math.random()*100, Math.random()*3, 0, Math.PI*2);
        pCtx.fill();
    }
}

// --- 渲染主函数 ---
export function draw() {
    let camX = -player.x + canvas.width/2;
    let camY = -player.y + canvas.height/2;

    // 1. 绘制底层世界
    ctx.fillStyle = '#252a30'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camX, camY);

    // 绘制墙壁
    const { tileSize, rows, cols } = CONFIG;
    let startC = Math.floor(-camX/tileSize) - 2;
    let endC = startC + (canvas.width/tileSize) + 4;
    let startR = Math.floor(-camY/tileSize) - 2;
    let endR = startR + (canvas.height/tileSize) + 4;

    for(let r=startR; r<endR; r++) {
        for(let c=startC; c<endC; c++) {
            if(r>=0 && r<rows && c>=0 && c<cols && state.map[r][c] === 1) {
                ctx.fillStyle = '#222'; 
                let cx = c*tileSize+tileSize/2;
                let cy = r*tileSize+tileSize/2;
                let rad = tileSize * 0.7; 
                ctx.beginPath();
                ctx.arc(cx, cy, rad, 0, Math.PI*2);
                ctx.fill();
                ctx.strokeStyle = '#444'; 
                ctx.stroke();
            }
        }
    }

    // 绘制环境文本
    if(state.texts) {
        ctx.textAlign = 'center';
        for(let t of state.texts) {
            ctx.fillStyle = t.color || '#888';
            ctx.font = t.font || '12px Consolas';
            ctx.fillText(t.text, t.x, t.y);
        }
    }

    // 绘制目标
    if(target.found || player.hasTarget) {
        ctx.fillStyle = '#0ff';
        ctx.beginPath(); ctx.arc(target.x, target.y, 8, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = '12px Consolas';
        ctx.textAlign = 'center';
        ctx.fillText(target.name, target.x, target.y - 15);

        if(player.hasTarget) {
            ctx.strokeStyle = '#666'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(target.x, target.y); ctx.stroke();
        }
    } else {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.beginPath(); ctx.arc(target.x, target.y, 6, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Consolas';
        ctx.textAlign = 'center';
        ctx.fillText(target.name, target.x, target.y - 12);
    }

    // 绘制粒子
    for(let p of particles) {
        if(p.type === 'silt') {
            ctx.fillStyle = `rgba(120, 100, 80, ${p.alpha})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillStyle = `rgba(200, 255, 255, ${p.life})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        }
    }

    drawDiver(ctx, player.x, player.y, player.angle);

    ctx.restore();

    // 2. 光照遮罩计算
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.shadowBlur = 0; 
    let depthFactor = Math.min(1, Math.max(0, player.y / (rows*tileSize)));
    let currentAmbient = Math.max(0.05, 0.9 * (1 - depthFactor * 0.9));
    
    lightCtx.fillStyle = `rgba(0, 0, 0, ${1 - currentAmbient})`;
    lightCtx.fillRect(0, 0, canvas.width, canvas.height);

    let siltVis = Math.max(0.1, 1 - (player.silt / 80)); 
    let rayDist = CONFIG.lightRange * siltVis;

    let poly = getLightPolygon(player.x, player.y, player.angle, rayDist);

    lightCtx.save();
    lightCtx.translate(camX, camY);
    
    lightCtx.globalCompositeOperation = 'destination-out';
    
    lightCtx.shadowBlur = 30;
    lightCtx.shadowColor = "rgba(255, 255, 255, 1)";
    
    let gradient = lightCtx.createRadialGradient(
        player.x, player.y, 0,
        player.x, player.y, rayDist
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');    
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');  
    gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.5)'); 
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');      
    lightCtx.fillStyle = gradient;
    lightCtx.beginPath();
    lightCtx.moveTo(player.x, player.y);
    for(let p of poly) lightCtx.lineTo(p.x, p.y);
    lightCtx.closePath();
    lightCtx.fill();

    let selfGlow = lightCtx.createRadialGradient(
        player.x, player.y, 0,
        player.x, player.y, 60 * siltVis
    );
    selfGlow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    selfGlow.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)');
    selfGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    lightCtx.fillStyle = selfGlow;
    lightCtx.beginPath();
    lightCtx.arc(player.x, player.y, 60 * siltVis, 0, Math.PI*2);
    lightCtx.fill();

    if(target.found || isLineOfSight(player.x, player.y, target.x, target.y, rayDist)) {
        lightCtx.beginPath();
        lightCtx.arc(target.x, target.y, 25, 0, Math.PI*2);
        lightCtx.fill();
    }

    lightCtx.restore();

    ctx.drawImage(lightLayer, 0, 0);

    // 3. 绘制 UI
    drawUI();
    drawControls();
}

function drawDiver(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = '#333';
    ctx.fillRect(-15, -6, 10, 4);
    ctx.fillRect(-15, 2, 10, 4);

    ctx.fillStyle = '#dd0';
    ctx.fillRect(-8, -4, 14, 8);

    ctx.fillStyle = '#222'; 
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill(); 
    
    ctx.fillStyle = '#fa0'; 
    ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#bef';
    ctx.beginPath(); ctx.fillRect(6, -3, 3, 6);

    ctx.restore();
}

function getLightPolygon(sx, sy, angle, maxDist) {
    let points = [];
    let fovRad = CONFIG.fov * Math.PI / 180;
    let startAngle = angle - fovRad/2;
    let rays = CONFIG.rayCount;
    let step = fovRad / rays;
    const { tileSize } = CONFIG;

    for(let i=0; i<=rays; i++) {
        let a = startAngle + i * step;
        let dx = Math.cos(a);
        let dy = Math.sin(a);
        
        let dist = 0;
        let stepLen = 4; // 优化步长
        for(let d=0; d<maxDist; d+=stepLen) {
            dist = d;
            let tx = sx + dx * d;
            let ty = sy + dy * d;
            let r = Math.floor(ty/tileSize);
            let c = Math.floor(tx/tileSize);
            if(state.map[r] && state.map[r][c] === 1) {
                break;
            }
        }
        points.push({x: sx + dx * dist, y: sy + dy * dist});
    }
    return points;
}

function isLineOfSight(x1, y1, x2, y2, maxDist) {
    let dist = Math.hypot(x2-x1, y2-y1);
    if(dist > maxDist) return false;
    let steps = dist / 20;
    const { tileSize } = CONFIG;
    for(let i=0; i<steps; i++) {
        let t = i/steps;
        let cx = x1 + (x2-x1)*t;
        let cy = y1 + (y2-y1)*t;
        let r = Math.floor(cy/tileSize);
        let c = Math.floor(cx/tileSize);
        if(state.map[r] && state.map[r][c] === 1) return false;
    }
    return true;
}

function drawUI() {
    // 仪表盘背景
    ctx.fillStyle = 'rgba(0, 10, 15, 0.8)';
    ctx.fillRect(10, 10, 160, 100);
    ctx.strokeStyle = '#445';
    ctx.strokeRect(10, 10, 160, 100);

    ctx.fillStyle = '#0ff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('深度: ' + Math.floor(player.y / CONFIG.tileSize) + 'm', 20, 30);

    // 氧气条
    ctx.fillStyle = '#8cf';
    ctx.font = '12px Arial';
    ctx.fillText('O2', 20, 50);
    ctx.fillStyle = '#222';
    ctx.fillRect(50, 40, 100, 10);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(50, 40, Math.max(0, player.o2), 10);

    // 氮气条
    ctx.fillStyle = '#8cf';
    ctx.fillText('N2', 20, 70);
    ctx.fillStyle = '#222';
    ctx.fillRect(50, 60, 100, 10);
    ctx.fillStyle = '#f00';
    ctx.fillRect(50, 60, Math.min(100, player.n2), 10);

    // 扬尘条
    ctx.fillStyle = '#8cf';
    ctx.fillText('Silt', 20, 90);
    ctx.fillStyle = '#222';
    ctx.fillRect(50, 80, 100, 10);
    ctx.fillStyle = '#b85';
    ctx.fillRect(50, 80, Math.min(100, player.silt), 10);

    // 警告信息
    if(state.alertMsg) {
        ctx.fillStyle = state.alertColor;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(state.alertMsg, canvas.width/2, canvas.height/3);
    }

    // 游戏结束画面
    if(state.screen !== 'play') {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = state.screen === 'win' ? '#0f0' : '#f00';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(state.screen === 'win' ? '任务完成!' : '任务失败', canvas.width/2, canvas.height/2 - 20);
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.fillText(state.alertMsg, canvas.width/2, canvas.height/2 + 20);
        ctx.fillText('点击屏幕重新开始', canvas.width/2, canvas.height/2 + 60);
    }
}

function drawControls() {
    if(state.screen !== 'play') return;

    // 左摇杆 (移动)
    if(touches.leftId !== null) {
        ctx.beginPath();
        ctx.arc(touches.leftStart.x, touches.leftStart.y, 40, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(touches.leftCurr.x, touches.leftCurr.y, 20, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fill();
    } else {
        // 提示
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(80, canvas.height - 80, 40, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center';
        ctx.font = '12px Arial';
        ctx.fillText('移动', 80, canvas.height - 80);
    }

    // 右摇杆 (转向)
    if(touches.rightId !== null) {
        ctx.beginPath();
        ctx.arc(touches.rightStart.x, touches.rightStart.y, 40, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(touches.rightCurr.x, touches.rightCurr.y, 20, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fill();
        
        // 指示方向
        ctx.beginPath();
        ctx.moveTo(touches.rightStart.x, touches.rightStart.y);
        ctx.lineTo(touches.rightCurr.x, touches.rightCurr.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.stroke();
    } else {
        // 提示
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(canvas.width - 80, canvas.height - 80, 40, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center';
        ctx.font = '12px Arial';
        ctx.fillText('转向', canvas.width - 80, canvas.height - 80);
    }
}
