import { CONFIG } from './config.js';
import { state, player, target, particles, input, resetState } from './state.js';
import { generateMap } from './map.js';
import { StoryManager } from './StoryManager.js';

const storyManager = new StoryManager();

// --- 粒子系统 ---
class Particle {
    constructor(x, y, type) {
        this.x = x; this.y = y;
        this.type = type; 
        this.life = CONFIG.siltLife;
        if(type === 'silt') {
            let angle = Math.random() * Math.PI * 2;
            let speed = Math.random() * 0.5;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.size = 1 + Math.random() * 10; 
            this.maxSize = 20 + Math.random() * 20; 
            this.alpha = 0.3 + Math.random() * 0.2;
        } else if (type === 'blood') {
            // 实际上不再使用 blood，但保留定义以防万一
            this.vx = (Math.random()-0.5) * 0.5;
            this.vy = -0.5 - Math.random(); 
            this.size = 2 + Math.random() * 3;
            this.life = CONFIG.bloodLife;
            this.alpha = 0.8;
        } else { // bubble
            this.vx = (Math.random()-0.5) * 0.5;
            this.vy = -2 - Math.random() * 2; // 加快上浮速度
            this.size = 3 + Math.random()*3;
            this.alpha = 0.6;
            this.wobble = Math.random() * Math.PI * 2; // 初始摇摆相位
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
            this.life -= 0.005; // 稍微延长寿命
            this.size *= 1.01; // 气泡上升变大
        }
    }
}

class SplashParticle {
    constructor(x, y, size, speedX, speedY) {
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
        this.vy += this.gravity; // 重力
        this.life -= 0.02;
        this.size *= 0.95;
    }
}

export function createSplash(x, y, intensity = 1) {
    // 水花飞溅
    let count = 10 * intensity;
    for(let i=0; i<count; i++) {
        let angle = -Math.PI/2 + (Math.random()-0.5) * 1.5; // 向上扇形
        let speed = 2 + Math.random() * 5 * intensity;
        let vx = Math.cos(angle) * speed;
        let vy = Math.sin(angle) * speed;
        let size = 2 + Math.random() * 3;
        state.splashes.push(new SplashParticle(x, y, size, vx, vy));
    }
    // 水面波纹 (用扁平的气泡模拟)
    for(let i=0; i<5*intensity; i++) {
        let p = new Particle(x + (Math.random()-0.5)*20, y, 'bubble');
        p.vy = 0;
        p.vx = (Math.random()-0.5) * 2;
        p.life = 0.5;
        particles.push(p);
    }
}

function updateSplashes() {
    for(let i=state.splashes.length-1; i>=0; i--) {
        let p = state.splashes[i];
        p.update();
        // 如果落回水面 (y>0)，销毁或产生涟漪
        if(p.y > 0 && p.vy > 0) {
            p.life = 0;
        }
        if(p.life <= 0) state.splashes.splice(i, 1);
    }
}

export function triggerSilt(x, y, count) {
    for(let i=0; i<count; i++) {
        particles.push(new Particle(x + (Math.random()-0.5)*15, y + (Math.random()-0.5)*15, 'silt'));
    }
}

// 挂载到 GameGlobal 供 StoryManager 使用
GameGlobal.triggerSilt = triggerSilt;
GameGlobal.addBubble = function(x, y) {
    particles.push(new Particle(x + (Math.random()-0.5)*10, y + (Math.random()-0.5)*10, 'bubble'));
};

function updateParticles() {
    if(Math.random() < 0.02) particles.push(new Particle(player.x, player.y, 'bubble'));
    for(let i=particles.length-1; i>=0; i--) {
        let p = particles[i];
        p.update();
        if(p.life <= 0) particles.splice(i, 1);
    }
}

// --- 剧情与NPC逻辑 ---

function updateNPC() {
    if(!state.npc.active) return;
    
    let targetX = player.x;
    let targetY = player.y;
    let speed = 2.8;
    
    // Debug 加速
    if(state.debug.fastMove) speed *= 3;
    
    // --- 获救后的特殊行为 (第二次下潜返程) ---
    if(state.story.flags.rescued) {
        // 默认跟随玩家（提供氧气）
        targetX = player.x;
        targetY = player.y;
        speed = 3.5; // 稍微快一点，确保能跟上玩家

        // 获取地标
        let junction = state.landmarks.junction;
        let deadEnd = state.landmarks.deadEndDeep;
        let tunnelEntry = state.landmarks.tunnelEntry;

        // 1. 阻止 NPC 进入隧道 (如果玩家试图向下深潜)
        // 只要玩家深度超过隧道入口，NPC 就停在隧道入口上方
        if (tunnelEntry && player.y > tunnelEntry.y) {
            targetX = tunnelEntry.x;
            targetY = tunnelEntry.y - 50; // 停在入口上方一点
            
            // 如果玩家深入太多，NPC 可能会在入口处徘徊
            if (Math.random() < 0.05) {
                targetX += (Math.random() - 0.5) * 60;
                targetY += (Math.random() - 0.5) * 30;
            }
        }
        else if(junction && deadEnd) {
            // 逻辑分界线：三岔路口附近
            // 如果玩家还在三岔路口下方 (第三洞室)，NPC 紧跟玩家
            if(player.y > junction.y + 5 * CONFIG.tileSize) {
                // 保持在玩家上方一点，引导向上
                targetX = player.x;
                targetY = player.y - 60;
            } 
            else {
                // 到达三岔路口及上方
                // NPC 坚定地前往死路
                targetX = deadEnd.x;
                targetY = deadEnd.y;
                
                // 死路惊慌逻辑
                let distToDeadEnd = Math.hypot(state.npc.x - deadEnd.x, state.npc.y - deadEnd.y);
                if (distToDeadEnd < 100) {
                    // 到达死路附近，开始惊慌游动
                    if (Math.random() < 0.1) {
                        state.npc.targetX = (Math.random() - 0.5) * 150;
                        state.npc.targetY = (Math.random() - 0.5) * 100;
                    }
                    targetX = deadEnd.x + (state.npc.targetX || 0);
                    targetY = deadEnd.y + (state.npc.targetY || 0);
                    speed = 4.0; // 惊慌时速度更快
                }
                
                // 玩家行为检测
                // 如果玩家进入了右侧的第二洞室 (正确路)
                // 判定标准：在三岔路口上方，且 X 坐标明显偏右
                if(player.y < junction.y && player.x > junction.x + 5 * CONFIG.tileSize) {
                    // NPC 停在三岔路口等待
                    targetX = junction.x;
                    targetY = junction.y;
                }
            }
        }
        
        // 移动逻辑复用下方的通用移动代码
    }
    else if(state.npc.state === 'follow') {
        // 初始化随机偏移计时器
        if(!state.npc.offsetTimer) {
            state.npc.offsetTimer = 0;
            state.npc.offsetX = -40;
            state.npc.offsetY = -40;
        }
        state.npc.offsetTimer++;
        
        // 每隔一段时间更新目标偏移，不再每帧随机，减少抖动
        if(state.npc.offsetTimer > 60) {
            state.npc.offsetTimer = 0;
            // 随机在玩家身后或侧后方
            let angle = player.angle + Math.PI + (Math.random() - 0.5) * 1.5; // 身后 90度扇形
            let dist = 40 + Math.random() * 40; // 距离 40-80
            state.npc.offsetX = Math.cos(angle) * dist;
            state.npc.offsetY = Math.sin(angle) * dist;
        }

        targetX = player.x + state.npc.offsetX;
        targetY = player.y + state.npc.offsetY;
        
        // 降低跟随速度，增加松弛感
        // 如果距离太远才加速
        let distToTarget = Math.hypot(targetX - state.npc.x, targetY - state.npc.y);
        if(distToTarget > 100) speed = 3.5; // 落后太多，加速
        else if(distToTarget < 20) speed = 0.5; // 到了，减速
        else speed = 2.0; // 正常漫游速度
        
    } else if (state.npc.state === 'enter_tunnel') {
        // 使用路径点导航
        if(!state.npc.pathIndex) state.npc.pathIndex = 0;
        let path = state.landmarks.tunnelPath;
        
        if(path && state.npc.pathIndex < path.length) {
            let wp = path[state.npc.pathIndex];
            targetX = wp.x;
            targetY = wp.y;
            
            // 如果接近当前路点，切换到下一个
            if(Math.hypot(targetX - state.npc.x, targetY - state.npc.y) < 40) { // 放宽判定范围
                state.npc.pathIndex++;
            }
        } else {
            // 走完了或者没有路径，就去终点
            targetX = state.landmarks.tunnelEnd.x;
            targetY = state.landmarks.tunnelEnd.y;
        }
        speed = 3.5; // 稍微快一点进入
        if(state.debug.fastMove) speed *= 3;

        // 强制移动，忽略碰撞
        let dx = targetX - state.npc.x;
        let dy = targetY - state.npc.y;
        let dist = Math.hypot(dx, dy);
        
        if(dist > 5) {
            state.npc.vx = (dx / dist) * speed;
            state.npc.vy = (dy / dist) * speed;
            state.npc.x += state.npc.vx;
            state.npc.y += state.npc.vy;
        }
        
        // 更新角度
        if(Math.abs(state.npc.vx) > 0.1 || Math.abs(state.npc.vy) > 0.1) {
            let targetAngle = Math.atan2(state.npc.vy, state.npc.vx);
            state.npc.angle = targetAngle; // 直接转向，不平滑，防止抽搐
        }
        return; // 独占逻辑，直接返回

    } else if (state.npc.state === 'wait') {
        targetX = state.npc.x;
        targetY = state.npc.y;
        speed = 0;
        
        // 等待时也要随机动一动 (增强幅度)
        if(Math.random() < 0.1) {
             state.npc.vx += (Math.random() - 0.5) * 1.0;
             state.npc.vy += (Math.random() - 0.5) * 1.0;
        }
        // 阻尼
        state.npc.vx *= 0.95;
        state.npc.vy *= 0.95;
        state.npc.x += state.npc.vx;
        state.npc.y += state.npc.vy;
        
        // 限制范围 (不跑太远)
        // 这里简单处理，不让它穿墙即可
        if(checkCollision(state.npc.x, state.npc.y, false)) {
             state.npc.x -= state.npc.vx;
             state.npc.y -= state.npc.vy;
             state.npc.vx *= -1; // 反弹
             state.npc.vy *= -1;
        }
        
        // 转向玩家
        let dx = player.x - state.npc.x;
        let dy = player.y - state.npc.y;
        let targetAngle = Math.atan2(dy, dx);
        let diff = targetAngle - state.npc.angle;
        while(diff > Math.PI) diff -= Math.PI*2;
        while(diff < -Math.PI) diff += Math.PI*2;
        state.npc.angle += diff * 0.05;
        
        return; // wait 状态下不执行后面的移动逻辑

    } else if (state.npc.state === 'rescue') {
        targetX = player.x;
        targetY = player.y;
        speed = 3.5;
    }
    
    // 移动NPC
    let dx = targetX - state.npc.x;
    let dy = targetY - state.npc.y;
    let dist = Math.hypot(dx, dy);
    
    if(dist > 5) {
        state.npc.vx = (dx / dist) * speed;
        state.npc.vy = (dy / dist) * speed;
        state.npc.x += state.npc.vx;
        state.npc.y += state.npc.vy;
        
        // NPC 搅动泥沙
        if (speed > 2.0 && Math.random() < 0.1) {
            triggerSilt(state.npc.x, state.npc.y, 1);
        }
        
        // 简单的避障 (NPC 不受透明墙影响)
        // 修改：在救援(rescue)或跟随(follow)且在深处时，忽略碰撞，防止NPC卡住
        let ignoreCollision = state.npc.state === 'rescue' || (state.npc.state === 'follow' && state.npc.y > 600);
        
        if(!ignoreCollision && checkCollision(state.npc.x + state.npc.vx*10, state.npc.y + state.npc.vy*10, false)) {
             state.npc.x -= state.npc.vx;
             state.npc.y -= state.npc.vy;
        }
    }

    // NPC 水面边界限制
    if(state.npc.y < 0) {
        state.npc.y = 0;
        state.npc.vy = Math.abs(state.npc.vy) * 0.5;
    }
    
    // 更新角度
    if(Math.abs(state.npc.vx) > 0.1 || Math.abs(state.npc.vy) > 0.1) {
        let targetAngle = Math.atan2(state.npc.vy, state.npc.vx);
        let diff = targetAngle - state.npc.angle;
        while(diff > Math.PI) diff -= Math.PI*2;
        while(diff < -Math.PI) diff += Math.PI*2;
        state.npc.angle += diff * 0.1;
    }
}

// --- 辅助函数 ---
function checkZones() {
    if (!state.zones) return;
    
    for (let zone of state.zones) {
        // 检查玩家是否在区域内
        let inY = player.y >= zone.yMin && player.y <= zone.yMax;
        let inX = true;
        if (zone.xMin !== undefined) inX = inX && player.x >= zone.xMin;
        if (zone.xMax !== undefined) inX = inX && player.x <= zone.xMax;
        
        if (inY && inX) {
            // 如果进入了新区域
            if (state.currentZone !== zone.name) {
                state.currentZone = zone.name;
                handleZoneEnter(zone.name);
            }
            break; 
        }
    }
}

function handleZoneEnter(zoneName) {
    // 防止重复提示 (可选，如果希望每次进入都提示则去掉)
    // 这里我们希望每次进入新区域都提示一下，或者只提示一次
    // 根据需求 "进入各个区域也要有日志哈"，假设是首次进入提示
    if (!state.story.visitedZones) state.story.visitedZones = [];
    if (state.story.visitedZones.includes(zoneName)) return;
    state.story.visitedZones.push(zoneName);

    switch(zoneName) {
        case 'chamber1':
            // storyManager.showText("进入第一洞室", "#fff", 3000);
            console.log("进入第一洞室");
            break;
        case 'suit_tunnel':
            storyManager.showText("通道变窄了...", "#ccc", 3000);
            console.log("进入潜水服处");
            break;
        case 'chamber2':
            // storyManager.showText("进入第二洞室", "#fff", 3000);
            console.log("进入第二洞室");
            break;
        case 'junction':
            // storyManager.showText("前方出现岔路口", "#f00", 4000);
            console.log("进入岔路口");
            break;
        case 'dead_end':
            // storyManager.showText("这条路看起来很宽敞... 是出口吗？", "#fff", 3000);
            console.log("进入死路");
            break;
        case 'chamber3':
            // storyManager.showText("进入第三洞室", "#fff", 3000);
            console.log("进入第三洞室");
            break;
        case 'story_tunnel':
            storyManager.showText("极度狭窄的裂缝...", "#f00", 3000);
            console.log("进入剧情隧道");
            break;
        case 'chamber4':
            storyManager.showText("未知的深渊", "#f00", 3000);
            console.log("进入深渊");
            break;
    }
}

function checkCollision(x, y, isPlayer = false) {
    const { tileSize } = CONFIG;
    let r = Math.floor(y/tileSize);
    let c = Math.floor(x/tileSize);
    
    // 检查普通墙壁（边缘wall对象 + 内部实体）
    for(let ry = r-1; ry <= r+1; ry++) {
        for(let rc = c-1; rc <= c+1; rc++) {
            if(!state.map[ry]) continue;
            let cell = state.map[ry][rc];
            if(!cell) continue;
            if(typeof cell === 'object') {
                // 边缘岩石：精确圆形碰撞
                let dist = Math.hypot(x - cell.x, y - cell.y);
                if(dist < cell.r + 10) return true;
            } else if(cell === 2) {
                // 内部实体：方格碰撞（整个格子都是实体）
                let cellCx = rc * tileSize + tileSize / 2;
                let cellCy = ry * tileSize + tileSize / 2;
                // 用圆vs方格的简化检测：点在格子内或距格子中心小于半格+玩家半径
                if(Math.abs(x - cellCx) < tileSize / 2 + 10 && Math.abs(y - cellCy) < tileSize / 2 + 10) return true;
            }
        }
    }
    
    // 检查透明墙壁 (仅玩家)
    if(isPlayer && state.invisibleWalls) {
        for(let wall of state.invisibleWalls) {
            let dist = Math.hypot(x - wall.x, y - wall.y);
            if(dist < wall.r + 10) return true;
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
            if(!state.map[ry]) continue;
            let cell = state.map[ry][rc];
            if(!cell) continue;
            if(typeof cell === 'object') {
                let dist = Math.hypot(x - cell.x, y - cell.y) - cell.r;
                if(dist < minDist) minDist = dist;
            } else if(cell === 2) {
                // 内部实体：到格子中心的距离减去半格
                let cellCx = rc * tileSize + tileSize / 2;
                let cellCy = ry * tileSize + tileSize / 2;
                let dist = Math.hypot(x - cellCx, y - cellCy) - tileSize / 2;
                if(dist < minDist) minDist = dist;
            }
        }
    }
    return minDist;
}

function findNearestWall(x, y, maxDist) {
    let nearest = null;
    let minDist = maxDist;
    if(!state.walls) return null;
    for(let wall of state.walls) {
        let dist = Math.hypot(x - wall.x, y - wall.y) - wall.r;
        if(dist < minDist) {
            minDist = dist;
            nearest = wall;
        }
    }
    if(!nearest) return null;
    return { wall: nearest, dist: minDist };
}

function getAnchorPoint(wall, fromX, fromY) {
    let angle = Math.atan2(fromY - wall.y, fromX - wall.x);
    return {
        x: wall.x + Math.cos(angle) * wall.r,
        y: wall.y + Math.sin(angle) * wall.r
    };
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
    let abx = bx - ax;
    let aby = by - ay;
    let apx = px - ax;
    let apy = py - ay;
    let abLenSq = abx * abx + aby * aby;
    if(abLenSq === 0) {
        return { dist: Math.hypot(px - ax, py - ay), cx: ax, cy: ay };
    }
    let t = (apx * abx + apy * aby) / abLenSq;
    t = Math.max(0, Math.min(1, t));
    let cx = ax + abx * t;
    let cy = ay + aby * t;
    return { dist: Math.hypot(px - cx, py - cy), cx, cy };
}

// --- 网格级别的线段碰撞检测（光栅化线段检查是否穿过实体格子） ---
// 返回线段是否穿过实体（true=有阻挡）
function lineHitsSolid(x1, y1, x2, y2) {
    const { tileSize } = CONFIG;
    let dx = x2 - x1;
    let dy = y2 - y1;
    let dist = Math.hypot(dx, dy);
    if(dist < 1) return false;
    let steps = Math.ceil(dist / (tileSize * 0.4)); // 步长约半格，确保不跳过格子
    for(let i = 0; i <= steps; i++) {
        let t = i / steps;
        let px = x1 + dx * t;
        let py = y1 + dy * t;
        let r = Math.floor(py / tileSize);
        let c = Math.floor(px / tileSize);
        if(state.map[r] && state.map[r][c]) {
            let cell = state.map[r][c];
            if(cell === 2) return true; // 内部实体
            if(typeof cell === 'object') {
                // 边缘岩石：检测点到圆心距离
                if(Math.hypot(px - cell.x, py - cell.y) < cell.r) return true;
            }
        }
    }
    return false;
}

// --- 基于网格的 A* 寻路，用于绳索绕障 ---
// 在网格空间中找到从 start 到 end 的路径，避开所有实体格子
// 返回像素坐标的路径点数组
function gridAStar(startX, startY, endX, endY, padding) {
    const { tileSize, rows, cols } = CONFIG;
    // 将像素坐标转换为网格坐标
    let sr = Math.floor(startY / tileSize);
    let sc = Math.floor(startX / tileSize);
    let er = Math.floor(endY / tileSize);
    let ec = Math.floor(endX / tileSize);

    // 边界钳位
    sr = Math.max(0, Math.min(rows - 1, sr));
    sc = Math.max(0, Math.min(cols - 1, sc));
    er = Math.max(0, Math.min(rows - 1, er));
    ec = Math.max(0, Math.min(cols - 1, ec));

    // 检查格子是否可通行（当前格子是空水道即可）
    // padding 的间距保证由后续 simplifyPath 中 lineHitsSolid 的精确检测负责
    function isPassable(r, c) {
        if(r < 0 || r >= rows || c < 0 || c >= cols) return false;
        return state.map[r] && state.map[r][c] === 0;
    }

    // 起点/终点可能在岩石边缘，放宽起点终点的通行判定
    function isPassableRelaxed(r, c) {
        if(r < 0 || r >= rows || c < 0 || c >= cols) return false;
        let cell = state.map[r] ? state.map[r][c] : 1;
        return cell === 0; // 只要是空就行
    }

    // A* 算法
    // 使用简单的二维数组追踪
    let openSet = [];
    let gScore = {};
    let fScore = {};
    let cameFrom = {};
    let closedSet = new Set();

    let key = (r, c) => r * cols + c;
    let heuristic = (r, c) => Math.abs(r - er) + Math.abs(c - ec);

    let startKey = key(sr, sc);
    gScore[startKey] = 0;
    fScore[startKey] = heuristic(sr, sc);
    openSet.push({ r: sr, c: sc, f: fScore[startKey] });

    // 8方向移动
    let dirs = [
        [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
        [-1, -1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [1, 1, 1.414]
    ];

    let maxIters = CONFIG.ropeAStarMaxIters || 3000;
    let found = false;
    let finalR = er, finalC = ec;

    for(let iter = 0; iter < maxIters; iter++) {
        if(openSet.length === 0) break;

        // 找最小 f 值
        let bestIdx = 0;
        for(let i = 1; i < openSet.length; i++) {
            if(openSet[i].f < openSet[bestIdx].f) bestIdx = i;
        }
        let current = openSet[bestIdx];
        openSet.splice(bestIdx, 1);

        let ck = key(current.r, current.c);
        if(closedSet.has(ck)) continue;
        closedSet.add(ck);

        // 到达终点
        if(current.r === er && current.c === ec) {
            found = true;
            break;
        }

        for(let [dr, dc, cost] of dirs) {
            let nr = current.r + dr;
            let nc = current.c + dc;
            if(nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

            let nk = key(nr, nc);
            if(closedSet.has(nk)) continue;

            // 通行检测：起点终点格子放宽，其他严格
            let pass = (nr === sr && nc === sc) || (nr === er && nc === ec)
                ? isPassableRelaxed(nr, nc)
                : isPassable(nr, nc);
            if(!pass) continue;

            let ng = gScore[ck] + cost;
            if(gScore[nk] === undefined || ng < gScore[nk]) {
                gScore[nk] = ng;
                fScore[nk] = ng + heuristic(nr, nc);
                cameFrom[nk] = ck;
                openSet.push({ r: nr, c: nc, f: fScore[nk] });
            }
        }
    }

    if(!found) {
        // 没找到路径，直接连线（fallback）
        return [{ x: startX, y: startY }, { x: endX, y: endY }];
    }

    // 回溯路径
    let path = [];
    let ck = key(er, ec);
    while(ck !== undefined) {
        let r = Math.floor(ck / cols);
        let c = ck % cols;
        path.unshift({
            x: c * tileSize + tileSize / 2,
            y: r * tileSize + tileSize / 2
        });
        ck = cameFrom[ck];
    }

    // 替换首尾为精确坐标
    if(path.length > 0) {
        path[0] = { x: startX, y: startY };
        path[path.length - 1] = { x: endX, y: endY };
    }

    // 路径简化：拉直（去掉不必要的中间点）
    path = simplifyPath(path);

    return path;
}

// 路径简化：贪心拉直，去掉不必要的中间拐点
function simplifyPath(path) {
    if(path.length <= 2) return path;
    let result = [path[0]];
    let i = 0;
    while(i < path.length - 1) {
        // 从 i 出发，尽可能跳到最远的 j 使得 i->j 不穿过实体
        let farthest = i + 1;
        for(let j = i + 2; j < path.length; j++) {
            if(!lineHitsSolid(path[i].x, path[i].y, path[j].x, path[j].y)) {
                farthest = j;
            } else {
                break;
            }
        }
        result.push(path[farthest]);
        i = farthest;
    }
    return result;
}

// 构建绕过岩石的路径：使用网格 A* 寻路
function buildAvoidedPath(start, end, padding) {
    // 先检测直线是否畅通
    if(!lineHitsSolid(start.x, start.y, end.x, end.y)) {
        return [{ x: start.x, y: start.y }, { x: end.x, y: end.y }];
    }
    // 有阻挡：使用 A* 寻路
    return gridAStar(start.x, start.y, end.x, end.y, padding);
}

// 计算折线总长度
function pathLength(pts) {
    let len = 0;
    for(let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    }
    return len;
}

// 在折线上按距离 t 采样一个点（t 范围为 0 到总长度）
function samplePolyline(pts, t) {
    let acc = 0;
    for(let i = 1; i < pts.length; i++) {
        let segLen = Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        if(acc + segLen >= t) {
            let frac = segLen > 0 ? (t - acc) / segLen : 0;
            return {
                x: pts[i-1].x + (pts[i].x - pts[i-1].x) * frac,
                y: pts[i-1].y + (pts[i].y - pts[i-1].y) * frac
            };
        }
        acc += segLen;
    }
    return { x: pts[pts.length-1].x, y: pts[pts.length-1].y };
}

// 获取折线某处的法线方向
function polylineNormal(pts, t) {
    let acc = 0;
    for(let i = 1; i < pts.length; i++) {
        let segLen = Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        if(acc + segLen >= t || i === pts.length - 1) {
            let dx = pts[i].x - pts[i-1].x;
            let dy = pts[i].y - pts[i-1].y;
            let len = Math.hypot(dx, dy) || 1;
            return { x: -dy / len, y: dx / len };
        }
        acc += segLen;
    }
    return { x: 0, y: -1 };
}

// 开始铺线：在锚点岩石上打钉，开始拉绳
function startRope(anchorWall) {
    if(!anchorWall) return;
    const anchorPoint = getAnchorPoint(anchorWall, player.x, player.y);
    state.rope.active = true;
    state.rope.current.start = anchorPoint;
    state.rope.current.startWall = anchorWall;
    state.rope.current.end = null;
    state.rope.current.path = buildAvoidedPath(anchorPoint, { x: player.x, y: player.y }, CONFIG.ropeAvoidPadding);
    state.rope.current.basePoints = state.rope.current.path;
    state.rope.current.slackFactor = 1;
    state.rope.current.mode = 'loose';
    state.rope.current.time = 0;
    state.rope.stillTimer = 0;
}

// 结束铺线：在终点岩石打钉，绳子收紧固定
function endRope(anchorWall) {
    if(!state.rope.active || !state.rope.current.start || !anchorWall) return;
    const endPoint = getAnchorPoint(anchorWall, player.x, player.y);
    const path = buildAvoidedPath(state.rope.current.start, endPoint, CONFIG.ropeAvoidPadding);
    state.rope.ropes.push({
        start: state.rope.current.start,
        startWall: state.rope.current.startWall,
        end: endPoint,
        endWall: anchorWall,
        path,
        slackFactor: 0,
        mode: 'tight'
    });
    state.rope.active = false;
    state.rope.current = {
        start: null,
        startWall: null,
        end: null,
        path: [],
        basePoints: [],
        slackFactor: 1,
        mode: 'loose',
        time: 0
    };
    state.rope.stillTimer = 0;
}

// 铺线系统主更新函数
function updateRopeSystem() {
    if(!state.rope) return;
    const dt = 1 / 60;

    // 推进动画时间
    if(state.rope.current) {
        if(!state.rope.current.time) state.rope.current.time = 0;
        state.rope.current.time += dt;
    }

    // 长按中：累计计时，更新UI进度
    if(state.rope.hold.active) {
        state.rope.hold.timer += dt;
        state.rope.ui.visible = true;
        state.rope.ui.type = state.rope.hold.type;
        state.rope.ui.anchor = state.rope.hold.anchor;
        state.rope.ui.progress = Math.min(1, state.rope.hold.timer / CONFIG.ropeHoldDuration);
    }

    // 铺线进行中：实时更新绳子路径（从起点到玩家当前位置）
    if(state.rope.active && state.rope.current.start) {
        let endPoint = { x: player.x, y: player.y };
        if(state.rope.hold.active && state.rope.hold.type === 'end' && state.rope.hold.anchor) {
            // 长按结束布线中：绳子向终点锚点收紧
            endPoint = getAnchorPoint(state.rope.hold.anchor, player.x, player.y);
            state.rope.current.end = endPoint;
            state.rope.current.mode = 'tightening';
            state.rope.current.slackFactor += (0 - state.rope.current.slackFactor) * CONFIG.ropeTightenLerp;
        } else if(state.rope.current.mode === 'tightening') {
            // 玩家中途松手：恢复松弛
            state.rope.current.slackFactor += (1 - state.rope.current.slackFactor) * 0.2;
            if(state.rope.current.slackFactor > 0.95) {
                state.rope.current.slackFactor = 1;
                state.rope.current.mode = 'loose';
            }
        }
        state.rope.current.path = buildAvoidedPath(state.rope.current.start, endPoint, CONFIG.ropeAvoidPadding);
        state.rope.current.basePoints = state.rope.current.path;
    }

    // 长按完成：执行开始/结束铺线
    if(state.rope.hold.active && state.rope.hold.timer >= CONFIG.ropeHoldDuration) {
        if(state.rope.hold.type === 'start') {
            startRope(state.rope.hold.anchor);
        } else if(state.rope.hold.type === 'end') {
            endRope(state.rope.hold.anchor);
        }
        state.rope.hold.active = false;
        state.rope.hold.type = null;
        state.rope.hold.timer = 0;
        state.rope.hold.touchId = null;
        state.rope.hold.anchor = null;
        state.rope.ui.progress = 0;
    }

    // 正在长按中，不检测按钮显示逻辑
    if(state.rope.hold.active) return;

    // 水面以上不显示铺线按钮
    if(player.y <= 0) {
        state.rope.ui.visible = false;
        state.rope.ui.type = null;
        state.rope.ui.anchor = null;
        state.rope.stillTimer = 0;
        return;
    }

    let nearest = findNearestWall(player.x, player.y, CONFIG.ropeAnchorDistance);
    // 判定玩家是否静止：没有主动操作移动 且 速度低于阈值（需要容忍水流扰动导致的微小速度）
    let speedThreshold = CONFIG.ropeStillSpeedThreshold || 1.5;
    let isStill = input.move === 0 && Math.hypot(player.vx, player.vy) < speedThreshold;

    if(nearest && isStill) state.rope.stillTimer += dt;
    else state.rope.stillTimer = 0;

    if(nearest && state.rope.stillTimer >= CONFIG.ropeStillTimeToShow) {
        state.rope.ui.visible = true;
        state.rope.ui.type = state.rope.active ? 'end' : 'start';
        state.rope.ui.anchor = nearest.wall;
    } else {
        state.rope.ui.visible = false;
        state.rope.ui.type = null;
        state.rope.ui.anchor = null;
    }
}

// 导出给渲染层使用的辅助函数
export { pathLength, samplePolyline, polylineNormal, buildAvoidedPath, findNearestWall };

function endGame(win, reason) {
    if (win) {
        state.screen = 'ending';
        state.endingTimer = 0;
    } else {
        state.screen = 'lose';
        // 清空消息队列，显示最终消息
        storyManager.showText(reason, "#f00", 99999, { clearQueue: true, y: CONFIG.screenHeight/2 + 20 });
    }
}

// --- 核心逻辑 ---
export function resetGameLogic(startPlay = true) {
    resetState();
    generateMap();
    
    // 初始化剧情
    state.story.stage = 1;
    state.story.timer = 0;
    state.story.shake = 0;
    state.story.redOverlay = 0;
    state.story.flags = {
        seenSuit: false,
        npcEntered: false,
        collapsed: false,
        blackScreen: false,
        narrowVision: false,
        rescued: false,
        approachedTunnel: false,
        tankDamaged: false
    };
    state.story.visitedZones = []; // 重置已访问区域
    state.currentZone = null;
    state.endingTimer = 0;
    
    // 初始化NPC
    state.npc.active = true;
    state.npc.x = player.x - 30;
    state.npc.y = player.y;
    state.npc.state = 'follow';
    
    // 初始化相机
    state.camera = { zoom: 1, targetZoom: 1 };
    state.antiStuck = { timer: 0, lastPos: {x:player.x, y:player.y} };

    if (startPlay) {
        state.screen = 'play';
        storyManager.showText("难得的假期！\n熊子带我们去雅各布井潜水！", "rgba(43, 95, 206, 1)", 4000);
    }
}

export function update() {
    // --- 转场逻辑 ---
    if(state.transition && state.transition.active) {
        // 1. 初始化气泡 (如果为空)
        if (!state.transition.bubbles) state.transition.bubbles = [];
        if (state.transition.bubbles.length === 0) {
            const cx = CONFIG.screenWidth / 2;
            const cy = CONFIG.screenHeight / 2;
            for(let i=0; i<200; i++) {
                let x = Math.random() * CONFIG.screenWidth;
                let y = Math.random() * CONFIG.screenHeight;
                let size = 10 + Math.random() * 50; // 大气泡
                
                // 初始速度：径向向外 + 随机扰动 (模拟扑面而来)
                let dx = x - cx;
                let dy = y - cy;
                let dist = Math.hypot(dx, dy) || 1;
                let speed = 5 + Math.random() * 10;
                
                let vx = (dx / dist) * speed + (Math.random() - 0.5) * 5;
                let vy = (dy / dist) * speed + (Math.random() - 0.5) * 5;
                
                state.transition.bubbles.push({
                    x, y, size, vx, vy,
                    baseSize: size,
                    wobble: Math.random() * Math.PI * 2
                });
            }
        }

        // 2. 更新气泡位置
        for(let b of state.transition.bubbles) {
            b.x += b.vx;
            b.y += b.vy;
            
            // 摇摆
            b.wobble += 0.1;
            b.x += Math.sin(b.wobble) * 0.5;

            // 速度控制
            if (state.transition.mode === 'in') {
                // 稳定阶段：过渡到向上浮动
                // vx -> 0, vy -> -3 ~ -8
                b.vx += (0 - b.vx) * 0.05;
                let targetVy = -2 - (b.size / 10); // 越大浮得越快
                b.vy += (targetVy - b.vy) * 0.05;
            } else {
                // 扑面阶段：保持一定的扩散，但稍微减速模拟阻力
                b.vx *= 0.98;
                b.vy *= 0.98;
            }

            // 边界循环 (保持屏幕有气泡)
            if (b.y < -100) b.y = CONFIG.screenHeight + 100;
            if (b.y > CONFIG.screenHeight + 100) b.y = -100;
            if (b.x < -100) b.x = CONFIG.screenWidth + 100;
            if (b.x > CONFIG.screenWidth + 100) b.x = -100;
        }

        if(state.transition.mode === 'out') {
            state.transition.alpha += 0.02;
            if(state.transition.alpha >= 1) {
                state.transition.alpha = 1;
                if(state.transition.callback) {
                    state.transition.callback();
                    state.transition.callback = null;
                }
                state.transition.mode = 'in'; // 自动切换到淡入
                
                // 转场结束进入场景时，触发入水水花
                createSplash(player.x, 0, 3);
            }
        } else if(state.transition.mode === 'in') {
            state.transition.alpha -= 0.02;
            if(state.transition.alpha <= 0) {
                state.transition.alpha = 0;
                state.transition.active = false;
                state.transition.mode = 'none';
                state.transition.bubbles = []; // 清理气泡
            }
        }
        // 转场期间不更新游戏逻辑，但允许背景绘制
        return;
    }

    if(state.screen === 'ending') {
        state.endingTimer++;
        return;
    }
    if(state.screen !== 'play') return;

    // 记录上一帧位置用于检测穿越水面
    let lastPlayerY = player.y;
    let lastNpcY = state.npc.y;

    // --- 剧情逻辑 ---
    storyManager.update();
    
    checkZones(); // 检测区域

    // 如果是黑屏状态，跳过物理更新
    if(state.story.flags.blackScreen) return;

    if(state.rope && state.rope.hold && state.rope.hold.active) {
        input.move = 0;
        input.speedUp = false;
        player.vx = 0;
        player.vy = 0;
    }

    updateNPC();
    updateSplashes();

    // 检测 NPC 穿越水面
    if(state.npc.active) {
        // 入水
        if(lastNpcY < 0 && state.npc.y >= 0) createSplash(state.npc.x, 0, 1.5);
        // 出水
        if(lastNpcY > 0 && state.npc.y <= 0) createSplash(state.npc.x, 0, 1.5);
    }

    // --- 镜头控制 ---
    if(!state.camera) state.camera = { zoom: 1, targetZoom: 1 };
    let targetZoom = 1.0;
    if(state.landmarks.tunnelEntry) {
        let dist = Math.hypot(player.x - state.landmarks.tunnelEntry.x, player.y - state.landmarks.tunnelEntry.y);
        // 只要接近入口或者在隧道深处（y坐标大于入口），就保持特写
        if(dist < 200 || player.y > state.landmarks.tunnelEntry.y) {
            targetZoom = 1.5;
        }
    }
    if(state.story.stage === 4) targetZoom = 1.3;
    state.camera.targetZoom = targetZoom;
    state.camera.zoom += (state.camera.targetZoom - state.camera.zoom) * 0.02;

    // --- 防卡死机制 (Stage 3, 5, 6) ---
    // 修改：仅在第二次下潜的隧道阶段生效 (Stage 3 寻找NPC, Stage 5 进入隧道救援, Stage 6 返程出隧道)
    // 且必须在隧道区域内
    let inTunnel = false;
    if (state.landmarks.tunnelEntry && state.landmarks.tunnelEnd) {
        inTunnel =  player.y >= state.landmarks.tunnelEntry.y - 600 && 
                    player.y <= state.landmarks.tunnelEnd.y;
    }

    if((state.story.stage === 3 || state.story.stage === 5 || state.story.stage === 6) && inTunnel) {
        if(!state.antiStuck) state.antiStuck = { timer: 0, lastPos: {x:player.x, y:player.y} };
        if(input.move > 0) {
            let movedDist = Math.hypot(player.x - state.antiStuck.lastPos.x, player.y - state.antiStuck.lastPos.y);
            
            // 判定是否尝试向下移动
            let isTryingGoDown = Math.sin(player.targetAngle) > 0.3;

            if(movedDist < 0.5) state.antiStuck.timer++;
            else {
                state.antiStuck.timer = 0;
                state.antiStuck.lastPos.x = player.x;
                state.antiStuck.lastPos.y = player.y;
            }
            
            // 缩短触发时间到 20 帧 (约0.3秒) - 更容易触发
            if(state.antiStuck.timer > 20) { 
                let cleared = false;
                const { tileSize } = CONFIG;
                
                // 1. 优先清理正前方的一个格子 (无论是否向下)
                let clearX = player.x + Math.cos(player.angle) * 30;
                let clearY = player.y + Math.sin(player.angle) * 30;
                let r = Math.floor(clearY / tileSize);
                let c = Math.floor(clearX / tileSize);
                
                if(state.map[r] && state.map[r][c]) {
                    state.map[r][c] = 0;
                    cleared = true;
                    // 移除墙壁对象
                    for(let i=state.walls.length-1; i>=0; i--) {
                        let w = state.walls[i];
                        if(Math.hypot(w.x - (c*tileSize + tileSize/2), w.y - (r*tileSize + tileSize/2)) < tileSize) {
                            state.walls.splice(i, 1);
                        }
                    }
                }

                // 2. 如果没清理到，尝试清理周围最近的障碍物 (半径 50 像素内)
                if(!cleared) {
                    let nearestDist = 999;
                    let nearestWall = null;
                    let nr = -1, nc = -1;

                    let pr = Math.floor(player.y / tileSize);
                    let pc = Math.floor(player.x / tileSize);

                    for(let i = pr-1; i <= pr+1; i++) {
                        for(let j = pc-1; j <= pc+1; j++) {
                            if(state.map[i] && state.map[i][j]) {
                                let cell = state.map[i][j];
                                // 计算到该格子的距离
                                let cx, cy;
                                if(typeof cell === 'object') {
                                    cx = cell.x;
                                    cy = cell.y;
                                } else {
                                    // 内部实体(值=2)：用格子中心坐标
                                    cx = j * tileSize + tileSize / 2;
                                    cy = i * tileSize + tileSize / 2;
                                }
                                let d = Math.hypot(player.x - cx, player.y - cy);
                                if(d < 60 && d < nearestDist) { // 60像素范围内
                                    nearestDist = d;
                                    nearestWall = cell;
                                    nr = i; nc = j;
                                }
                            }
                        }
                    }

                    if(nearestWall) {
                        state.map[nr][nc] = 0;
                        cleared = true;
                        let idx = state.walls.indexOf(nearestWall);
                        if(idx > -1) state.walls.splice(idx, 1);
                    }
                }
                
                if(cleared) {
                    triggerSilt(player.x, player.y + 20, 5); 
                    // 只有在 Stage 3 且不是濒死时才提示，避免刷屏
                    if(state.story.stage === 3 && Math.random() < 0.3) {
                        storyManager.showText("松动的岩石脱落了...", "#aaa", 1000);
                    }
                    state.antiStuck.timer = 0;
                }
            }
        } else { state.antiStuck.timer = 0; }
    }

    // 1. 转向系统
    player.targetAngle = input.targetAngle;

    let angleDiff = player.targetAngle - player.angle;
    while(angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while(angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    
    player.angle += angleDiff * CONFIG.turnSpeed; 

    // 2. 移动系统
    // 如果被卡住，禁止移动并强制停止速度
    if(state.story.stage === 4 || state.story.stage === 5) {
        input.move = 0;
        player.vx = 0;
        player.vy = 0;
        // 模拟挣扎的微小位移
        player.x += (Math.random()-0.5) * 1.5;
        player.y += (Math.random()-0.5) * 1.5;
    }

    let speed = CONFIG.moveSpeed * 0.3;
    if(input.speedUp) speed = CONFIG.moveSpeed; 
    
    // 调试加速
    if(state.debug.fastMove) speed *= 3;

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
    
    let hitX = checkCollision(nextX, player.y, true);
    if(!hitX) player.x = nextX;
    else { player.vx *= -0.5; if(Math.abs(player.vx)>1) triggerSilt(player.x, player.y, 20); } 

    let hitY = checkCollision(player.x, nextY, true);
    if(!hitY) player.y = nextY;
    else { player.vy *= -0.5; if(Math.abs(player.vy)>1) triggerSilt(player.x, player.y, 20); }

    // 水面边界限制 (防止飞出水面)
    if(player.y < 0) {
        player.y = 0;
        player.vy = Math.abs(player.vy) * 0.5; // 反弹
    }

    // 检测玩家穿越水面
    // 入水
    if(lastPlayerY < 0 && player.y >= 0) createSplash(player.x, 0, 2);
    // 出水 (由于有边界限制，player.y 很难小于0，但如果从深处快速上浮撞击水面，也应该有水花)
    // 这里检测撞击水面边界的情况
    if(lastPlayerY > 5 && player.y <= 5 && player.vy < -1) {
        createSplash(player.x, 0, 2);
    }

    updateRopeSystem();

    // 第一次下潜：洞口被堵提示
    if(state.story.stage === 1 || state.story.stage === 2) {
        if(state.story.flags.collapsed && state.landmarks.tunnelEntry) {
            let dist = Math.hypot(player.x - state.landmarks.tunnelEntry.x, player.y - state.landmarks.tunnelEntry.y);
            // 如果玩家在入口附近且试图向下游
            if(dist < 80 && Math.sin(player.targetAngle) > 0.5 && input.move > 0) {
                // 简单的防抖
                if(!state.story.lastBlockMsgTime || Date.now() - state.story.lastBlockMsgTime > 3000) {
                    storyManager.showText("洞口被巨石堵住了", "#f00", 2000);
                    state.story.lastBlockMsgTime = Date.now();
                }
            }
        }
    }

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
    let o2Consumption = CONFIG.o2ConsumptionBase;
    if(vel > 1.5) o2Consumption += CONFIG.o2ConsumptionMove;

    // 氧气瓶损坏逻辑
    if(state.story.flags.tankDamaged) {
        o2Consumption *= CONFIG.o2DamageMultiplier; // 消耗速度极快
        
        // 接触 NPC 补充氧气
        if(state.npc.active) {
            let distToNpc = Math.hypot(player.x - state.npc.x, player.y - state.npc.y);
            if(distToNpc < 80) { // 接触范围
                player.o2 += CONFIG.o2RefillRate; // 快速回复
                if(player.o2 > 100) player.o2 = 100;
                o2Consumption = 0; // 补充时不消耗
            }
        }
    }

    player.o2 -= o2Consumption; 

    let depthM = Math.floor(player.y / CONFIG.tileSize);
    let depthFactor = Math.max(0, (depthM - 5) / 20); 
    
    player.n2 += depthFactor * 0.005; 
    
    if(depthM < 4 && player.n2 > 0) {
        player.n2 -= 0.03; 
        if(player.n2 < 0) player.n2 = 0;
    }

    if(player.vy < -CONFIG.safeAscentSpeed && depthM > 8) {
        player.n2 += 0.5; 
        // Debug 模式下不死亡
        // if(!state.debug.fastMove) {
        //      storyManager.showText("上升过快！减缓速度！", "#f00", 2000);
        // }
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

    // 水面检测 (y < 20 视为浮出水面)
    // 只有在阶段6才允许结束
    if(player.y < 20 && state.story.stage === 6) {
        endGame(true, "成功生还");
    }

    // 氧气耗尽判定：在濒死体验(Stage 4)和救援中(Stage 5)不触发失败
    if(player.o2 <= 0 && state.story.stage !== 4 && state.story.stage !== 5) {
        endGame(false, "氧气耗尽");
    }
    // 暂时移除减压病致死逻辑，仅保留数值计算
    // if(player.n2 >= 100 && !state.debug.fastMove) endGame(false, "严重减压病");

    // 更新动画时间 (用于脚蹼动画)
    if(!player.animTime) player.animTime = 0;
    // 基础摆动速度 + 移动速度加成
    // 降低速度系数，使其更自然
    let swimSpeed = Math.hypot(player.vx, player.vy);
    // 假设 input.move 是摇杆偏移量 (0-1)，如果能获取到的话。
    // 这里 swimSpeed 已经反映了最终速度。
    player.animTime += 0.05 + swimSpeed * 0.05; 

    // 水流扰动 (Idle 漂浮)
    // 当玩家静止或速度很慢时，施加微小的扰动
    if(input.move === 0 && swimSpeed < 0.5) {
        let time = Date.now() / 1000;
        // 模拟水流推力
        player.vx += Math.sin(time) * 0.02;
        player.vy += Math.cos(time * 0.8) * 0.02;
    }

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
            if(checkCollision(fish.x + fish.vx*10, fish.y + fish.vy*10, false)) {
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