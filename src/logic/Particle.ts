import { CONFIG } from '../core/config';
import { state, player, particles } from '../core/state';

// --- 粒子系统 ---
export class Particle {
    x: number; y: number; type: string; life: number;
    vx: number; vy: number; size: number; maxSize: number;
    alpha: number; wobble: number;
    constructor(x: number, y: number, type: string) {
        this.x = x; this.y = y;
        this.type = type; 
        this.life = CONFIG.siltLife;
        this.vx = 0; this.vy = 0; this.size = 0; this.maxSize = 0;
        this.alpha = 0; this.wobble = 0;
        if(type === 'silt') {
            let angle = Math.random() * Math.PI * 2;
            let speed = Math.random() * 0.5;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.size = 1 + Math.random() * 10; 
            this.maxSize = 20 + Math.random() * 20; 
            this.alpha = 0.3 + Math.random() * 0.2;
        } else if (type === 'blood') {
            // blood 已不再使用，保留以兼容
            this.vx = (Math.random()-0.5) * 0.5;
            this.vy = -0.5 - Math.random(); 
            this.size = 2 + Math.random() * 3;
            this.life = CONFIG.bloodLife;
            this.alpha = 0.8;
        } else { // 气泡
            this.vx = (Math.random()-0.5) * 0.5;
            this.vy = -2 - Math.random() * 2;
            this.size = 3 + Math.random()*3;
            this.alpha = 0.6;
            this.wobble = Math.random() * Math.PI * 2;
        }
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        if(this.type === 'silt') {
            this.life -= 0.005; 
            if(this.size < this.maxSize) this.size += 0.1;
            this.vx *= 0.96;
            this.vy *= 0.96;
            this.vx += (Math.random()-0.5)*0.02;
            this.vy += (Math.random()-0.5)*0.02;
        } else if (this.type === 'blood') {
            this.life -= 0.01;
            this.size += 0.05; 
            this.vx *= 0.95;
        } else {
            // 气泡摇摆
            this.wobble += 0.1;
            this.x += Math.sin(this.wobble) * 0.5;
            this.life -= 0.005;
            this.size *= 1.01;
        }
    }
}

export class SplashParticle {
    x: number; y: number; vx: number; vy: number;
    size: number; life: number; gravity: number;
    constructor(x: number, y: number, size: number, speedX: number, speedY: number) {
        this.x = x;
        this.y = y;
        this.vx = speedX;
        this.vy = speedY;
        this.size = size;
        this.life = 1.0;
        this.gravity = 0.2;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.life -= 0.02;
        this.size *= 0.95;
    }
}

export function createSplash(x: number, y: number, intensity: number = 1) {
    let count = 10 * intensity;
    for(let i=0; i<count; i++) {
        let angle = -Math.PI/2 + (Math.random()-0.5) * 1.5;
        let speed = 2 + Math.random() * 5 * intensity;
        let vx = Math.cos(angle) * speed;
        let vy = Math.sin(angle) * speed;
        let size = 2 + Math.random() * 3;
        state.splashes.push(new SplashParticle(x, y, size, vx, vy));
    }
    for(let i=0; i<5*intensity; i++) {
        let p = new Particle(x + (Math.random()-0.5)*20, y, 'bubble');
        p.vy = 0;
        p.vx = (Math.random()-0.5) * 2;
        p.life = 0.5;
        particles.push(p);
    }
}

export function updateSplashes() {
    for(let i=state.splashes.length-1; i>=0; i--) {
        let p = state.splashes[i];
        p.update();
        if(p.y > 0 && p.vy > 0) {
            p.life = 0;
        }
        if(p.life <= 0) state.splashes.splice(i, 1);
    }
}

export function triggerSilt(x: number, y: number, count: number) {
    let maxWallDist = CONFIG.siltSpawnMaxWallDist || 80;
    let wallDist = getNearestWallDist(x, y);
    if (wallDist > maxWallDist) return;
    let distFactor = 1.0 - Math.min(wallDist / maxWallDist, 1.0);
    let actualCount = Math.ceil(count * distFactor);
    for(let i=0; i<actualCount; i++) {
        particles.push(new Particle(x + (Math.random()-0.5)*15, y + (Math.random()-0.5)*15, 'silt'));
    }
}

// 挂载到 GameGlobal 供 StoryManager 使用
GameGlobal.triggerSilt = triggerSilt;
GameGlobal.addBubble = function(x: number, y: number) {
    particles.push(new Particle(x + (Math.random()-0.5)*10, y + (Math.random()-0.5)*10, 'bubble'));
};

export function updateParticles() {
    if(Math.random() < 0.02) particles.push(new Particle(player.x, player.y, 'bubble'));
    for(let i=particles.length-1; i>=0; i--) {
        let p = particles[i];
        p.update();
        if (p.type === 'silt') {
            if (p.alpha * p.life <= 0.005) particles.splice(i, 1);
        } else {
            if(p.life <= 0) particles.splice(i, 1);
        }
    }
}

// 辅助函数：获取最近墙壁距离（由 triggerSilt 使用）
function getNearestWallDist(x: number, y: number): number {
    const { tileSize } = CONFIG;
    let r = Math.floor(y/tileSize);
    let c = Math.floor(x/tileSize);
    let minDist = 999;
    for(let ry = r-2; ry <= r+2; ry++) {
        for(let rc = c-2; rc <= c+2; rc++) {
            if(!state.map[ry]) continue;
            let cell = state.map[ry][rc];
            if(!cell) continue;
            if(typeof cell === 'object') {
                let dist = Math.hypot(x - cell.x, y - cell.y) - cell.r;
                if(dist < minDist) minDist = dist;
            } else if(cell === 2) {
                let cellCx = rc * tileSize + tileSize / 2;
                let cellCy = ry * tileSize + tileSize / 2;
                let dist = Math.hypot(x - cellCx, y - cellCy) - tileSize / 2;
                if(dist < minDist) minDist = dist;
            }
        }
    }
    return minDist;
}
