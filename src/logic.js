import { CONFIG } from './config.js';
import { state, player, target, particles, input, resetState } from './state.js';
import { generateMap } from './map.js';

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

export function triggerSilt(x, y, count) {
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

// --- 辅助函数 ---
function checkCollision(x, y) {
    const { tileSize } = CONFIG;
    let r = Math.floor(y/tileSize);
    let c = Math.floor(x/tileSize);
    for(let ry = r-1; ry <= r+1; ry++) {
        for(let rc = c-1; rc <= c+1; rc++) {
            if(state.map[ry] && state.map[ry][rc] && typeof state.map[ry][rc] === 'object') {
                let wall = state.map[ry][rc];
                let dist = Math.hypot(x - wall.x, y - wall.y);
                // 碰撞半径 = 墙半径 + 玩家半径(10)
                if(dist < wall.r + 10) return true;
            }
        }
    }
    return false;
}

function getNearestWallDist(x, y) {
    const { tileSize } = CONFIG;
    let r = Math.floor(y/tileSize);
    let c = Math.floor(x/tileSize);
    let minDist = 999;
    for(let ry = r-2; ry <= r+2; ry++) {
        for(let rc = c-2; rc <= c+2; rc++) {
            if(state.map[ry] && state.map[ry][rc] && typeof state.map[ry][rc] === 'object') {
                let wall = state.map[ry][rc];
                let dist = Math.hypot(x - wall.x, y - wall.y) - wall.r;
                if(dist < minDist) minDist = dist;
            }
        }
    }
    return minDist;
}

export function showAlert(msg, color) {
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

// --- 核心逻辑 ---
export function resetGameLogic() {
    resetState();
    generateMap();
    showAlert("任务开始：寻找 " + target.name, "#0ff");
}

export function update() {
    if(state.screen !== 'play') return;

    // 1. 转向系统
    player.targetAngle = input.targetAngle;

    let angleDiff = player.targetAngle - player.angle;
    while(angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while(angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    
    player.angle += angleDiff * CONFIG.turnSpeed; 

    // 2. 移动系统
    let speed = CONFIG.moveSpeed * 0.3; 
    if(input.speedUp) speed = CONFIG.moveSpeed; 
    
    if(input.move > 0) {
        // 修改：加速度方向直接由摇杆方向(targetAngle)决定，提升操控手感
        // 原逻辑是基于当前朝向(player.angle)加速，会导致转向时移动轨迹画弧过大
        player.vx += Math.cos(player.targetAngle) * speed * CONFIG.acceleration;
        player.vy += Math.sin(player.targetAngle) * speed * CONFIG.acceleration;
    }

    // 水阻力
    player.vx *= CONFIG.waterDrag;
    player.vy *= CONFIG.waterDrag;

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
         player.silt += 0.05 * CONFIG.siltFactor;
         if(Math.random() < 0.15) triggerSilt(player.x, player.y, 1);
    }

    if(vel > 0.25) {
        let isFast = input.speedUp;
        
        if (isFast) {
            if (Math.random() < 0.2) {
                player.silt += 0.1 * CONFIG.siltFactor;
                triggerSilt(player.x - Math.cos(player.angle)*20, player.y - Math.sin(player.angle)*20, 1);
            }
            if (wallDist < 45) {
                player.silt += 0.3 * CONFIG.siltFactor;
                triggerSilt(player.x, player.y, 1); 
            }
        } else {
            if (wallDist < 25) {
                if (Math.random() < 0.1) {
                    player.silt += 0.1 * CONFIG.siltFactor;
                    triggerSilt(player.x, player.y, 1);
                }
            }
        }
    }

    player.silt = Math.max(0, player.silt - 0.15); 

    // 3. 气体逻辑
    player.o2 -= 0.0015; 
    if(vel > 1.5) player.o2 -= 0.001;

    let depthM = Math.floor(player.y / CONFIG.tileSize);
    let depthFactor = Math.max(0, (depthM - 5) / 20); 
    
    player.n2 += depthFactor * 0.005; 
    
    if(depthM < 4 && player.n2 > 0) {
        player.n2 -= 0.03; 
        if(player.n2 < 0) player.n2 = 0;
    }

    if(player.vy < -CONFIG.safeAscentSpeed && depthM > 8) {
        player.n2 += 0.5; 
        showAlert("上升过快！减缓速度！", "#f00");
    }

    // 更新探索地图
    // 探索半径约为光照范围
    let exploreRadius = Math.ceil(CONFIG.lightRange / CONFIG.tileSize);
    let pr = Math.floor(player.y / CONFIG.tileSize);
    let pc = Math.floor(player.x / CONFIG.tileSize);
    
    for(let r = pr - exploreRadius; r <= pr + exploreRadius; r++) {
        for(let c = pc - exploreRadius; c <= pc + exploreRadius; c++) {
            if(r >= 0 && r < CONFIG.rows && c >= 0 && c < CONFIG.cols) {
                // 简单的距离判断
                if(Math.hypot(c-pc, r-pr) <= exploreRadius) {
                    if(state.explored[r]) state.explored[r][c] = true;
                }
            }
        }
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
    }

    // 水面检测 (y < 20 视为浮出水面)
    if(player.y < 20) {
        if(player.hasTarget) {
            endGame(true);
        } else {
            endGame(false, target.name + '，你先等等，我要回家吃饭了。');
        }
    }

    if(player.o2 <= 0) endGame(false, "氧气耗尽");
    if(player.n2 >= 100) endGame(false, "严重减压病");

    // 5. 生态系统更新 (鱼群游动)
    if(state.fishes) {
        for(let fish of state.fishes) {
            // 初始化角度
            if(fish.angle === undefined) fish.angle = Math.atan2(fish.vy, fish.vx);

            fish.x += fish.vx;
            fish.y += fish.vy;
            
            // 边界反弹 (修正为地图宽度)
            if(fish.x < 0 || fish.x > CONFIG.cols * CONFIG.tileSize) fish.vx *= -1;
            
            // 水面限制 (防止飞出水面)
            if(fish.y < 60) {
                fish.y = 60;
                fish.vy = Math.abs(fish.vy) * 0.5; // 反弹并减速
            }
            // 底部限制
            if(fish.y > CONFIG.rows * CONFIG.tileSize) fish.vy *= -1;

            // 随机转向 (降低频率和平滑度)
            if(Math.random() < 0.005) {
                fish.vx += (Math.random() - 0.5) * 0.8;
                fish.vy += (Math.random() - 0.5) * 0.4;
            }
            
            // 限制速度
            let speed = Math.hypot(fish.vx, fish.vy);
            if(speed > 2.0) {
                fish.vx *= 0.9;
                fish.vy *= 0.9;
            } else if (speed < 0.5) {
                fish.vx *= 1.1;
                fish.vy *= 1.1;
            }
            
            // 简单的避障 (如果碰到墙壁就反向)
            if(checkCollision(fish.x + fish.vx*10, fish.y + fish.vy*10)) {
                fish.vx *= -1;
                fish.vy *= -1;
            }

            // 平滑更新角度
            let targetAngle = Math.atan2(fish.vy, fish.vx);
            // 角度插值
            let diff = targetAngle - fish.angle;
            while(diff > Math.PI) diff -= Math.PI*2;
            while(diff < -Math.PI) diff += Math.PI*2;
            fish.angle += diff * 0.1; // 平滑系数
        }
    }

    updateParticles();
}
