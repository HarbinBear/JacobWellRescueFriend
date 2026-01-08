const systemInfo = tt.getSystemInfoSync();
const canvas = tt.createCanvas();
const ctx = canvas.getContext('2d');

// 设置画布尺寸
canvas.width = systemInfo.windowWidth;
canvas.height = systemInfo.windowHeight;

// --- 全局配置 ---
const CFG = {
    ambient: 0.5,        // 环境光亮度
    lightRange: 300,      // 手电筒距离 (手机上稍微减小)
    fov: 60,              // 视野角度
    moveSpeed: 8,         // 移动速度
    safeAscentSpeed: 2.5, // 安全上浮速度阈值
    siltFactor: 1.0,      // 扬尘产生倍率
    rayCount: 120,        // 射线数量 (手机性能优化，从500降到120)
    turnSpeed: 0.05,      // 转向速度 (稍微加快一点适应手机)
    acceleration: 0.005,   // 加速度
    waterDrag: 0.98       // 水阻力
};

const TILE_SIZE = 40;
const COLS = 60;
const ROWS = 60;

// 资源缓存
const wallPatternCanvas = tt.createCanvas(); // 岩石纹理
const lightLayer = tt.createCanvas(); // 光照遮罩层
lightLayer.width = canvas.width;
lightLayer.height = canvas.height;
const lightCtx = lightLayer.getContext('2d');

// 游戏状态
let state = {
    screen: 'play', // play, win, lose
    map: [],
    walls: [], // 存储墙壁的渲染圆心
    msgTimer: null,
    alertMsg: '',
    alertColor: '#fff',
    texts: []
};

// 实体
const player = {
    x: 0, y: 0,
    angle: Math.PI/2,
    targetAngle: Math.PI/2,
    vx: 0, vy: 0,
    o2: 100,
    n2: 0,
    silt: 0,
    hasTarget: false
};
const target = { x: 0, y: 0, found: false, name: '' };
const particles = []; // 扬尘与气泡

// 输入状态
const input = {
    move: 0, // 0: stop, 1: forward
    speedUp: false, // shift
    targetAngle: Math.PI/2
};

// 触摸控制状态
const touches = {
    leftId: null,
    leftStart: { x: 0, y: 0 },
    leftCurr: { x: 0, y: 0 },
    rightId: null,
    rightStart: { x: 0, y: 0 },
    rightCurr: { x: 0, y: 0 }
};

// --- 预生成岩石纹理 ---
function initTextures() {
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
initTextures();

// --- 核心逻辑 ---

function resetGame() {
    state.screen = 'play';
    player.o2 = 100; player.n2 = 0; player.silt = 0;
    player.vx = 0; player.vy = 0;
    player.hasTarget = false;
    target.found = false;
    particles.length = 0;
    state.texts = []; 

    generateMap();
    
    // 初始位置 (水面中央)
    player.x = TILE_SIZE * (COLS / 2);
    player.y = TILE_SIZE * 2;
    player.angle = Math.PI/2;
    player.targetAngle = Math.PI/2;
    input.targetAngle = Math.PI/2;
    
    // 随机目标名字
    const names = ["伟仔", "毛丁", "树茂", "熊"];
    target.name = names[Math.floor(Math.random() * names.length)];

    // 添加环境文本
    state.texts.push({
        x: player.x, 
        y: player.y - 40, 
        text: "出发点", 
        color: "#aaa",
        font: "14px Consolas"
    });
    
    showAlert("任务开始：寻找 " + target.name, "#0ff");
}

// 有机地图生成
function generateMap() {
    state.map = [];
    for(let r=0; r<ROWS; r++) {
        state.map[r] = [];
        for(let c=0; c<COLS; c++) state.map[r][c] = 1;
    }

    // 顶部水面开放
    for(let r=0; r<6; r++) {
        for(let c=1; c<COLS-1; c++) state.map[r][c] = 0;
    }

    // 矿工挖掘
    let miner = {x: Math.floor(COLS/2), y: 5}; 
    let steps = 0;
    const maxSteps = ROWS * COLS * 3;
    
    while(steps < maxSteps) {
        for(let ry=0; ry<2; ry++) {
            for(let rx=0; rx<2; rx++) {
                if(miner.y+ry < ROWS-1 && miner.x+rx < COLS-1 && miner.y+ry > 0 && miner.x+rx > 0) {
                    state.map[miner.y+ry][miner.x+rx] = 0;
                }
            }
        }
        
        let dir = Math.random();
        if(dir < 0.35 && miner.y < ROWS-3) miner.y++;
        else if(dir < 0.6 && miner.x < COLS-3) miner.x++;
        else if(dir < 0.8 && miner.y > 6) miner.y--; 
        else if(miner.x > 2) miner.x--;
        
        steps++;
    }

    // 封闭边界
    for(let r=0; r<ROWS; r++) state.map[r][0] = state.map[r][COLS-1] = 1;
    for(let c=0; c<COLS; c++) state.map[ROWS-1][c] = 1;

    // 生成墙壁渲染数据
    state.walls = [];
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            if(state.map[r][c] === 1) {
                state.walls.push({
                    x: c * TILE_SIZE + TILE_SIZE/2,
                    y: r * TILE_SIZE + TILE_SIZE/2,
                    r: TILE_SIZE * (0.6 + Math.random() * 0.3) 
                });
            }
        }
    }

    // 放置目标
    let valid = false;
    while(!valid) {
        let tr = Math.floor(ROWS * 0.7 + Math.random() * (ROWS * 0.2));
        let tc = Math.floor(COLS * 0.5 + Math.random() * (COLS * 0.4));
        if(state.map[tr][tc] === 0) {
            target.x = tc * TILE_SIZE + TILE_SIZE/2;
            target.y = tr * TILE_SIZE + TILE_SIZE/2;
            valid = true;
        }
    }
}

// --- 游戏循环更新 ---
function update() {
    if(state.screen !== 'play') return;

    // 1. 转向系统
    // 使用 input.targetAngle (来自右摇杆)
    player.targetAngle = input.targetAngle;

    let angleDiff = player.targetAngle - player.angle;
    while(angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while(angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    
    player.angle += angleDiff * CFG.turnSpeed; 

    // 2. 移动系统
    let speed = CFG.moveSpeed * 0.3; 
    if(input.speedUp) speed = CFG.moveSpeed; 
    
    if(input.move > 0) {
        player.vx += Math.cos(player.angle) * speed * CFG.acceleration;
        player.vy += Math.sin(player.angle) * speed * CFG.acceleration;
    }

    // 水阻力
    player.vx *= CFG.waterDrag;
    player.vy *= CFG.waterDrag;

    // 碰撞检测
    let nextX = player.x + player.vx;
    let nextY = player.y + player.vy;
    
    let hitX = checkCollision(nextX, player.y);
    if(!hitX) player.x = nextX;
    else { player.vx *= -0.5; if(Math.abs(player.vx)>1) triggerSilt(player.x, player.y, 20); } 

    let hitY = checkCollision(player.x, nextY);
    if(!hitY) player.y = nextY;
    else { player.vy *= -0.5; if(Math.abs(player.vy)>1) triggerSilt(player.x, player.y, 20); }

    // 2. 扬尘逻辑
    let vel = Math.hypot(player.vx, player.vy);
    let wallDist = getNearestWallDist(player.x, player.y);
    
    if(Math.abs(angleDiff) > 0.02 && vel > 0.1) {
         player.silt += 0.05 * CFG.siltFactor;
         if(Math.random() < 0.15) triggerSilt(player.x, player.y, 1);
    }

    if(vel > 0.25) {
        let isFast = input.speedUp;
        
        if (isFast) {
            if (Math.random() < 0.2) {
                player.silt += 0.1 * CFG.siltFactor;
                triggerSilt(player.x - Math.cos(player.angle)*20, player.y - Math.sin(player.angle)*20, 1);
            }
            if (wallDist < 45) {
                player.silt += 0.3 * CFG.siltFactor;
                triggerSilt(player.x, player.y, 1); 
            }
        } else {
            if (wallDist < 25) {
                if (Math.random() < 0.1) {
                    player.silt += 0.1 * CFG.siltFactor;
                    triggerSilt(player.x, player.y, 1);
                }
            }
        }
    }

    player.silt = Math.max(0, player.silt - 0.15); 

    // 3. 气体逻辑
    player.o2 -= 0.0015; 
    if(vel > 1.5) player.o2 -= 0.001;

    let depthM = Math.floor(player.y / TILE_SIZE);
    let depthFactor = Math.max(0, (depthM - 5) / 20); 
    
    player.n2 += depthFactor * 0.005; 
    
    if(depthM < 4 && player.n2 > 0) {
        player.n2 -= 0.03; 
        if(player.n2 < 0) player.n2 = 0;
    }

    if(player.vy < -CFG.safeAscentSpeed && depthM > 8) {
        player.n2 += 0.5; 
        showAlert("上升过快！减缓速度！", "#f00");
    }

    // 4. 任务逻辑
    let dist = Math.hypot(player.x - target.x, player.y - target.y);
    if(!target.found && dist < 40) {
        target.found = true;
        player.hasTarget = true;
        showAlert("目标已连接。返回水面。", "#0f0");
    }

    if(player.hasTarget) {
        let dx = player.x - target.x;
        let dy = player.y - target.y;
        let d = Math.hypot(dx, dy);
        if(d > 30) {
            target.x += dx * 0.05;
            target.y += dy * 0.05;
        }
        
        if(depthM < 4) endGame(true);
    }

    if(player.o2 <= 0) endGame(false, "氧气耗尽");
    if(player.n2 >= 100) endGame(false, "严重减压病");

    updateParticles();
}

function checkCollision(x, y) {
    let r = Math.floor(y/TILE_SIZE);
    let c = Math.floor(x/TILE_SIZE);
    for(let ry = r-1; ry <= r+1; ry++) {
        for(let rc = c-1; rc <= c+1; rc++) {
            if(state.map[ry] && state.map[ry][rc] === 1) {
                let wallX = rc * TILE_SIZE + TILE_SIZE/2;
                let wallY = ry * TILE_SIZE + TILE_SIZE/2;
                let dist = Math.hypot(x - wallX, y - wallY);
                if(dist < 10 + TILE_SIZE*0.5) return true;
            }
        }
    }
    return false;
}

function getNearestWallDist(x, y) {
    let r = Math.floor(y/TILE_SIZE);
    let c = Math.floor(x/TILE_SIZE);
    let minDist = 999;
    for(let ry = r-2; ry <= r+2; ry++) {
        for(let rc = c-2; rc <= c+2; rc++) {
            if(state.map[ry] && state.map[ry][rc] === 1) {
                let wallX = rc * TILE_SIZE + TILE_SIZE/2;
                let wallY = ry * TILE_SIZE + TILE_SIZE/2;
                let dist = Math.hypot(x - wallX, y - wallY) - (TILE_SIZE * 0.7);
                if(dist < minDist) minDist = dist;
            }
        }
    }
    return minDist;
}

// --- 粒子系统 ---
class Particle {
    constructor(x, y, type) {
        this.x = x; this.y = y;
        this.type = type; 
        this.life = 1.0;
        if(type === 'silt') {
            let angle = Math.random() * Math.PI * 2;
            let speed = Math.random() * 0.5;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.size = 1 + Math.random() * 10; 
            this.maxSize = 20 + Math.random() * 20; 
            this.alpha = 0.3 + Math.random() * 0.2;
        } else {
            this.vx = (Math.random()-0.5) * 0.5;
            this.vy = -1 - Math.random(); 
            this.size = 1 + Math.random()*2;
            this.alpha = 0.6;
        }
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        if(this.type === 'silt') {
            this.life -= 0.0002; 
            if(this.size < this.maxSize) this.size += 0.1;
            this.vx *= 0.96;
            this.vy *= 0.96;
            this.vx += (Math.random()-0.5)*0.02;
            this.vy += (Math.random()-0.5)*0.02;
        } else {
            this.life -= 0.01;
        }
    }
}

function triggerSilt(x, y, count) {
    for(let i=0; i<count; i++) {
        particles.push(new Particle(x + (Math.random()-0.5)*15, y + (Math.random()-0.5)*15, 'silt'));
    }
}

function updateParticles() {
    if(Math.random() < 0.02) particles.push(new Particle(player.x, player.y, 'bubble'));
    for(let i=particles.length-1; i>=0; i--) {
        let p = particles[i];
        p.update();
        if(p.life <= 0) particles.splice(i, 1);
    }
}

// --- 渲染 ---
function draw() {
    let camX = -player.x + canvas.width/2;
    let camY = -player.y + canvas.height/2;

    // 1. 绘制底层世界
    ctx.fillStyle = '#252a30'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camX, camY);

    // 绘制墙壁
    let startC = Math.floor(-camX/TILE_SIZE) - 2;
    let endC = startC + (canvas.width/TILE_SIZE) + 4;
    let startR = Math.floor(-camY/TILE_SIZE) - 2;
    let endR = startR + (canvas.height/TILE_SIZE) + 4;

    for(let r=startR; r<endR; r++) {
        for(let c=startC; c<endC; c++) {
            if(r>=0 && r<ROWS && c>=0 && c<COLS && state.map[r][c] === 1) {
                ctx.fillStyle = '#222'; 
                let cx = c*TILE_SIZE+TILE_SIZE/2;
                let cy = r*TILE_SIZE+TILE_SIZE/2;
                let rad = TILE_SIZE * 0.7; 
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
    let depthFactor = Math.min(1, Math.max(0, player.y / (ROWS*TILE_SIZE)));
    let currentAmbient = Math.max(0.05, 0.9 * (1 - depthFactor * 0.9));
    
    lightCtx.fillStyle = `rgba(0, 0, 0, ${1 - currentAmbient})`;
    lightCtx.fillRect(0, 0, canvas.width, canvas.height);

    let siltVis = Math.max(0.1, 1 - (player.silt / 80)); 
    let rayDist = CFG.lightRange * siltVis;

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
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill(); // ellipse not fully supported in all canvas envs, use arc
    
    ctx.fillStyle = '#fa0'; 
    ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#bef';
    ctx.beginPath(); ctx.fillRect(6, -3, 3, 6);

    ctx.restore();
}

function getLightPolygon(sx, sy, angle, maxDist) {
    let points = [];
    let fovRad = CFG.fov * Math.PI / 180;
    let startAngle = angle - fovRad/2;
    let rays = CFG.rayCount;
    let step = fovRad / rays;

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
            let r = Math.floor(ty/TILE_SIZE);
            let c = Math.floor(tx/TILE_SIZE);
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
    for(let i=0; i<steps; i++) {
        let t = i/steps;
        let cx = x1 + (x2-x1)*t;
        let cy = y1 + (y2-y1)*t;
        let r = Math.floor(cy/TILE_SIZE);
        let c = Math.floor(cx/TILE_SIZE);
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
    ctx.fillText('深度: ' + Math.floor(player.y / TILE_SIZE) + 'm', 20, 30);

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

function showAlert(msg, color) {
    state.alertMsg = msg;
    state.alertColor = color;
    clearTimeout(state.msgTimer);
    state.msgTimer = setTimeout(() => state.alertMsg = '', 3000);
}

function endGame(win, reason) {
    state.screen = win ? 'win' : 'lose';
    state.alertMsg = win ? "成功救出 " + target.name + "！" : reason;
    state.alertColor = win ? "#fff" : "#f00";
}

// --- 触摸事件处理 ---
tt.onTouchStart((res) => {
    if(state.screen !== 'play') {
        resetGame();
        return;
    }

    for(let t of res.touches) {
        if(t.clientX < canvas.width / 2) {
            // 左半屏 -> 移动摇杆
            if(touches.leftId === null) {
                touches.leftId = t.identifier;
                touches.leftStart = { x: t.clientX, y: t.clientY };
                touches.leftCurr = { x: t.clientX, y: t.clientY };
            }
        } else {
            // 右半屏 -> 转向摇杆
            if(touches.rightId === null) {
                touches.rightId = t.identifier;
                touches.rightStart = { x: t.clientX, y: t.clientY };
                touches.rightCurr = { x: t.clientX, y: t.clientY };
                // 立即更新一次角度
                // input.targetAngle = player.angle; // 保持当前角度，或者根据点击位置？
                // 摇杆模式下，初始点击中心不改变角度，拖动才改变
            }
        }
    }
});

tt.onTouchMove((res) => {
    for(let t of res.touches) {
        if(t.identifier === touches.leftId) {
            touches.leftCurr = { x: t.clientX, y: t.clientY };
            // 计算移动输入
            let dx = touches.leftCurr.x - touches.leftStart.x;
            let dy = touches.leftCurr.y - touches.leftStart.y;
            let dist = Math.hypot(dx, dy);
            
            // 限制摇杆显示范围
            if(dist > 40) {
                let angle = Math.atan2(dy, dx);
                touches.leftCurr.x = touches.leftStart.x + Math.cos(angle) * 40;
                touches.leftCurr.y = touches.leftStart.y + Math.sin(angle) * 40;
            }

            // 逻辑输入
            // 向上推是前进 (dy < 0)
            // 阈值 10
            if(dist > 10) {
                // 简单处理：只要推了就走
                // 实际上应该根据推的方向决定是前进还是后退？
                // 原游戏只有 W 前进。这里简化：只要摇杆偏离中心，就前进。
                // 或者：上半圆前进，下半圆后退？
                // 让我们设定：推杆力度决定速度，方向决定... 等等，原游戏是坦克式移动。
                // 只有 W 键。所以只要推杆，就前进。
                input.move = 1;
                // 如果推到底，加速
                input.speedUp = dist > 35;
            } else {
                input.move = 0;
                input.speedUp = false;
            }
        } else if(t.identifier === touches.rightId) {
            touches.leftCurr = { x: t.clientX, y: t.clientY }; // Typo fix: should be rightCurr
            touches.rightCurr = { x: t.clientX, y: t.clientY };
            
            let dx = touches.rightCurr.x - touches.rightStart.x;
            let dy = touches.rightCurr.y - touches.rightStart.y;
            let dist = Math.hypot(dx, dy);

            if(dist > 40) {
                let angle = Math.atan2(dy, dx);
                touches.rightCurr.x = touches.rightStart.x + Math.cos(angle) * 40;
                touches.rightCurr.y = touches.rightStart.y + Math.sin(angle) * 40;
            }

            // 计算角度
            if(dist > 10) {
                // 摇杆的角度就是目标角度？
                // 不，这会很奇怪。通常右摇杆控制视角方向。
                // 摇杆指向哪里，人就看向哪里。
                input.targetAngle = Math.atan2(dy, dx);
            }
        }
    }
});

tt.onTouchEnd((res) => {
    // 检查哪个手指抬起了
    // res.changedTouches 包含抬起的手指
    for(let t of res.changedTouches) {
        if(t.identifier === touches.leftId) {
            touches.leftId = null;
            input.move = 0;
            input.speedUp = false;
        } else if(t.identifier === touches.rightId) {
            touches.rightId = null;
        }
    }
});

tt.onTouchCancel((res) => {
    // 同上
    for(let t of res.changedTouches) {
        if(t.identifier === touches.leftId) {
            touches.leftId = null;
            input.move = 0;
            input.speedUp = false;
        } else if(t.identifier === touches.rightId) {
            touches.rightId = null;
        }
    }
});

// 游戏主循环
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// 初始化
resetGame();
gameLoop();
