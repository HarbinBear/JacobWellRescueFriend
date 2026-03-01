import { CONFIG } from '../core/config';
import { state, player, particles, input, resetState } from '../core/state';
import { generateMap } from '../world/map';
import { StoryManager } from '../story/StoryManager';
import { Particle, createSplash, updateSplashes, triggerSilt, updateParticles } from './Particle';
import { updateRopeSystem, findNearestWall } from './Rope';

const storyManager = new StoryManager();

// 导出 findNearestWall 供渲染层使用
export { findNearestWall };

// --- 剧情 & NPC 逻辑 ---

function updateNPC() {
    if(!state.npc.active) return;
    
    let targetX = player.x;
    let targetY = player.y;
    let speed = 2.8;
    
    if(state.debug.fastMove) speed *= 3;
    
    if(state.story.flags.rescued) {
        targetX = player.x;
        targetY = player.y;
        speed = 3.5;

        let junction = state.landmarks.junction;
        let deadEnd = state.landmarks.deadEndDeep;
        let tunnelEntry = state.landmarks.tunnelEntry;

        if (tunnelEntry && player.y > tunnelEntry.y) {
            targetX = tunnelEntry.x;
            targetY = tunnelEntry.y - 50;
            
            if (Math.random() < 0.05) {
                targetX += (Math.random() - 0.5) * 60;
                targetY += (Math.random() - 0.5) * 30;
            }
        }
        else if(junction && deadEnd) {
            if(player.y > junction.y + 5 * CONFIG.tileSize) {
                targetX = player.x;
                targetY = player.y - 60;
            } 
            else {
                targetX = deadEnd.x;
                targetY = deadEnd.y;
                
                let distToDeadEnd = Math.hypot(state.npc.x - deadEnd.x, state.npc.y - deadEnd.y);
                if (distToDeadEnd < 100) {
                    if (Math.random() < 0.1) {
                        state.npc.targetX = (Math.random() - 0.5) * 150;
                        state.npc.targetY = (Math.random() - 0.5) * 100;
                    }
                    targetX = deadEnd.x + (state.npc.targetX || 0);
                    targetY = deadEnd.y + (state.npc.targetY || 0);
                    speed = 4.0;
                }
                
                if(player.y < junction.y && player.x > junction.x + 5 * CONFIG.tileSize) {
                    targetX = junction.x;
                    targetY = junction.y;
                }
            }
        }
    }
    else if(state.npc.state === 'follow') {
        if(!state.npc.offsetTimer) {
            state.npc.offsetTimer = 0;
            state.npc.offsetX = -40;
            state.npc.offsetY = -40;
        }
        state.npc.offsetTimer++;
        
        if(state.npc.offsetTimer > 60) {
            state.npc.offsetTimer = 0;
            let angle = player.angle + Math.PI + (Math.random() - 0.5) * 1.5;
            let dist = 40 + Math.random() * 40;
            state.npc.offsetX = Math.cos(angle) * dist;
            state.npc.offsetY = Math.sin(angle) * dist;
        }

        targetX = player.x + state.npc.offsetX;
        targetY = player.y + state.npc.offsetY;
        
        let distToTarget = Math.hypot(targetX - state.npc.x, targetY - state.npc.y);
        if(distToTarget > 100) speed = 3.5;
        else if(distToTarget < 20) speed = 0.5;
        else speed = 2.0;
        
    } else if (state.npc.state === 'enter_tunnel') {
        if(!state.npc.pathIndex) state.npc.pathIndex = 0;
        let path = state.landmarks.tunnelPath;
        
        if(path && state.npc.pathIndex < path.length) {
            let wp = path[state.npc.pathIndex];
            targetX = wp.x;
            targetY = wp.y;
            
            if(Math.hypot(targetX - state.npc.x, targetY - state.npc.y) < 40) {
                state.npc.pathIndex++;
            }
        } else {
            targetX = state.landmarks.tunnelEnd.x;
            targetY = state.landmarks.tunnelEnd.y;
        }
        speed = 3.5;
        if(state.debug.fastMove) speed *= 3;

        let dx = targetX - state.npc.x;
        let dy = targetY - state.npc.y;
        let dist = Math.hypot(dx, dy);
        
        if(dist > 5) {
            state.npc.vx = (dx / dist) * speed;
            state.npc.vy = (dy / dist) * speed;
            state.npc.x += state.npc.vx;
            state.npc.y += state.npc.vy;
        }
        
        if(Math.abs(state.npc.vx) > 0.1 || Math.abs(state.npc.vy) > 0.1) {
            let targetAngle = Math.atan2(state.npc.vy, state.npc.vx);
            state.npc.angle = targetAngle;
        }
        return;

    } else if (state.npc.state === 'wait') {
        targetX = state.npc.x;
        targetY = state.npc.y;
        speed = 0;
        
        if(Math.random() < 0.1) {
             state.npc.vx += (Math.random() - 0.5) * 1.0;
             state.npc.vy += (Math.random() - 0.5) * 1.0;
        }
        state.npc.vx *= 0.95;
        state.npc.vy *= 0.95;
        state.npc.x += state.npc.vx;
        state.npc.y += state.npc.vy;
        
        if(checkCollision(state.npc.x, state.npc.y, false)) {
             state.npc.x -= state.npc.vx;
             state.npc.y -= state.npc.vy;
             state.npc.vx *= -1;
             state.npc.vy *= -1;
        }
        
        let dx = player.x - state.npc.x;
        let dy = player.y - state.npc.y;
        let targetAngle = Math.atan2(dy, dx);
        let diff = targetAngle - state.npc.angle;
        while(diff > Math.PI) diff -= Math.PI*2;
        while(diff < -Math.PI) diff += Math.PI*2;
        state.npc.angle += diff * 0.05;
        
        return;

    } else if (state.npc.state === 'rescue') {
        targetX = player.x;
        targetY = player.y;
        speed = 3.5;
    }
    
    let dx = targetX - state.npc.x;
    let dy = targetY - state.npc.y;
    let dist = Math.hypot(dx, dy);
    
    if(dist > 5) {
        state.npc.vx = (dx / dist) * speed;
        state.npc.vy = (dy / dist) * speed;
        state.npc.x += state.npc.vx;
        state.npc.y += state.npc.vy;
        
        if (speed > 2.0 && Math.random() < 0.1) {
            triggerSilt(state.npc.x, state.npc.y, 1);
        }
        
        let ignoreCollision = state.npc.state === 'rescue' || (state.npc.state === 'follow' && state.npc.y > 600);
        
        if(!ignoreCollision && checkCollision(state.npc.x + state.npc.vx*10, state.npc.y + state.npc.vy*10, false)) {
             state.npc.x -= state.npc.vx;
             state.npc.y -= state.npc.vy;
        }
    }

    if(state.npc.y < 0) {
        state.npc.y = 0;
        state.npc.vy = Math.abs(state.npc.vy) * 0.5;
    }
    
    if(Math.abs(state.npc.vx) > 0.1 || Math.abs(state.npc.vy) > 0.1) {
        let targetAngle = Math.atan2(state.npc.vy, state.npc.vx);
        let diff = targetAngle - state.npc.angle;
        while(diff > Math.PI) diff -= Math.PI*2;
        while(diff < -Math.PI) diff += Math.PI*2;
        state.npc.angle += diff * 0.1;
    }
}

// --- 区域辅助函数 ---
function checkZones() {
    if (!state.zones) return;
    
    for (let zone of state.zones) {
        let inY = player.y >= zone.yMin && player.y <= zone.yMax;
        let inX = true;
        if (zone.xMin !== undefined) inX = inX && player.x >= zone.xMin;
        if (zone.xMax !== undefined) inX = inX && player.x <= zone.xMax;
        
        if (inY && inX) {
            if (state.currentZone !== zone.name) {
                state.currentZone = zone.name;
                handleZoneEnter(zone.name);
            }
            break; 
        }
    }
}

function handleZoneEnter(zoneName: string) {
    if (!state.story.visitedZones) state.story.visitedZones = [];
    if (state.story.visitedZones.includes(zoneName)) return;
    state.story.visitedZones.push(zoneName);

    switch(zoneName) {
        case 'chamber1':
            console.log("进入第一洞室");
            break;
        case 'suit_tunnel':
            storyManager.showText("通道变窄了...", "#ccc", 3000);
            console.log("进入潜水服处");
            break;
        case 'chamber2':
            console.log("进入第二洞室");
            break;
        case 'junction':
            console.log("进入岔路口");
            break;
        case 'dead_end':
            console.log("进入死路");
            break;
        case 'chamber3':
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

// --- 碰撞检测 ---
export function checkCollision(x: number, y: number, isPlayer: boolean = false): boolean {
    const { tileSize } = CONFIG;
    let r = Math.floor(y/tileSize);
    let c = Math.floor(x/tileSize);
    
    for(let ry = r-1; ry <= r+1; ry++) {
        for(let rc = c-1; rc <= c+1; rc++) {
            if(!state.map[ry]) continue;
            let cell = state.map[ry][rc];
            if(!cell) continue;
            if(typeof cell === 'object') {
                let dist = Math.hypot(x - cell.x, y - cell.y);
                if(dist < cell.r + 10) return true;
            } else if(cell === 2) {
                let cellCx = rc * tileSize + tileSize / 2;
                let cellCy = ry * tileSize + tileSize / 2;
                if(Math.abs(x - cellCx) < tileSize / 2 + 10 && Math.abs(y - cellCy) < tileSize / 2 + 10) return true;
            }
        }
    }
    
    if(isPlayer && state.invisibleWalls) {
        for(let wall of state.invisibleWalls) {
            let dist = Math.hypot(x - wall.x, y - wall.y);
            if(dist < wall.r + 10) return true;
        }
    }
    
    return false;
}

export function getNearestWallDist(x: number, y: number): number {
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

function endGame(win: boolean, reason: string) {
    if (win) {
        state.screen = 'ending';
        state.endingTimer = 0;
    } else {
        state.screen = 'lose';
        storyManager.showText(reason, "#f00", 99999);
    }
}

// --- 核心逻辑 ---
export function resetGameLogic(startPlay: boolean = true) {
    resetState();
    generateMap();
    
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
        tankDamaged: false,
        deathPause: 0
    };
    state.story.visitedZones = [];
    state.currentZone = null;
    state.endingTimer = 0;
    
    state.npc.active = true;
    state.npc.x = player.x - 30;
    state.npc.y = player.y;
    state.npc.state = 'follow';
    
    state.camera = { zoom: 1, targetZoom: 1 };
    state.antiStuck = { timer: 0, lastPos: {x:player.x, y:player.y} };

    if (startPlay) {
        state.screen = 'play';
        storyManager.showText("难得的假期！\n熊子带我们去雅各布井潜水！", "rgba(43, 95, 206, 1)", 4000);
    }
}

export function update() {
    // --- 过渡逻辑 ---
    if(state.transition && state.transition.active) {
        if (!state.transition.bubbles) state.transition.bubbles = [];
        if (state.transition.bubbles.length === 0) {
            const cx = CONFIG.screenWidth / 2;
            const cy = CONFIG.screenHeight / 2;
            for(let i=0; i<200; i++) {
                let x = Math.random() * CONFIG.screenWidth;
                let y = Math.random() * CONFIG.screenHeight;
                let size = 10 + Math.random() * 50;
                
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

        for(let b of state.transition.bubbles) {
            b.x += b.vx;
            b.y += b.vy;
            
            b.wobble += 0.1;
            b.x += Math.sin(b.wobble) * 0.5;

            if (state.transition.mode === 'in') {
                b.vx += (0 - b.vx) * 0.05;
                let targetVy = -2 - (b.size / 10);
                b.vy += (targetVy - b.vy) * 0.05;
            } else {
                b.vx *= 0.98;
                b.vy *= 0.98;
            }

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
                state.transition.mode = 'in';
                createSplash(player.x, 0, 3);
            }
        } else if(state.transition.mode === 'in') {
            state.transition.alpha -= 0.02;
            if(state.transition.alpha <= 0) {
                state.transition.alpha = 0;
                state.transition.active = false;
                state.transition.mode = 'none';
                state.transition.bubbles = [];
            }
        }
        return;
    }

    if(state.screen === 'ending') {
        state.endingTimer++;
        return;
    }
    if(state.screen !== 'play') return;

    let lastPlayerY = player.y;
    let lastNpcY = state.npc.y;

    storyManager.update();
    
    checkZones();

    if(state.story.flags.blackScreen) return;

    if(state.rope && state.rope.hold && state.rope.hold.active) {
        input.move = 0;
        input.speedUp = false;
        player.vx = 0;
        player.vy = 0;
    }

    updateNPC();
    updateSplashes();

    if(state.npc.active) {
        if(lastNpcY < 0 && state.npc.y >= 0) createSplash(state.npc.x, 0, 1.5);
        if(lastNpcY > 0 && state.npc.y <= 0) createSplash(state.npc.x, 0, 1.5);
    }

    // --- 摄像机控制 ---
    if(!state.camera) state.camera = { zoom: 1, targetZoom: 1 };
    let targetZoom = 1.0;
    if(state.landmarks.tunnelEntry) {
        let dist = Math.hypot(player.x - state.landmarks.tunnelEntry.x, player.y - state.landmarks.tunnelEntry.y);
        if(dist < 200 || player.y > state.landmarks.tunnelEntry.y) {
            targetZoom = 1.5;
        }
    }
    if(state.story.stage === 4) targetZoom = 1.3;
    state.camera.targetZoom = targetZoom;
    state.camera.zoom += (state.camera.targetZoom - state.camera.zoom) * 0.02;

    // --- 防卡墙机制（第 3、5、6 阶段）---
    let inTunnel = false;
    if (state.landmarks.tunnelEntry && state.landmarks.tunnelEnd) {
        inTunnel =  player.y >= state.landmarks.tunnelEntry.y - 600 && 
                    player.y <= state.landmarks.tunnelEnd.y;
    }

    if((state.story.stage === 3 || state.story.stage === 5 || state.story.stage === 6) && inTunnel) {
        if(!state.antiStuck) state.antiStuck = { timer: 0, lastPos: {x:player.x, y:player.y} };
        if(input.move > 0) {
            let movedDist = Math.hypot(player.x - state.antiStuck.lastPos.x, player.y - state.antiStuck.lastPos.y);
            
            let isTryingGoDown = Math.sin(player.targetAngle) > 0.3;

            if(movedDist < 0.5) state.antiStuck.timer++;
            else {
                state.antiStuck.timer = 0;
                state.antiStuck.lastPos.x = player.x;
                state.antiStuck.lastPos.y = player.y;
            }
            
            if(state.antiStuck.timer > 20) { 
                let cleared = false;
                const { tileSize } = CONFIG;
                
                let clearX = player.x + Math.cos(player.angle) * 30;
                let clearY = player.y + Math.sin(player.angle) * 30;
                let r = Math.floor(clearY / tileSize);
                let c = Math.floor(clearX / tileSize);
                
                if(state.map[r] && state.map[r][c]) {
                    state.map[r][c] = 0;
                    cleared = true;
                    for(let i=state.walls.length-1; i>=0; i--) {
                        let w = state.walls[i];
                        if(Math.hypot(w.x - (c*tileSize + tileSize/2), w.y - (r*tileSize + tileSize/2)) < tileSize) {
                            state.walls.splice(i, 1);
                        }
                    }
                }

                if(!cleared) {
                    let nearestDist = 999;
                    let nearestWall: any = null;
                    let nr = -1, nc = -1;

                    let pr = Math.floor(player.y / tileSize);
                    let pc = Math.floor(player.x / tileSize);

                    for(let i = pr-1; i <= pr+1; i++) {
                        for(let j = pc-1; j <= pc+1; j++) {
                            if(state.map[i] && state.map[i][j]) {
                                let cell = state.map[i][j];
                                let cx, cy;
                                if(typeof cell === 'object') {
                                    cx = cell.x;
                                    cy = cell.y;
                                } else {
                                    cx = j * tileSize + tileSize / 2;
                                    cy = i * tileSize + tileSize / 2;
                                }
                                let d = Math.hypot(player.x - cx, player.y - cy);
                                if(d < 60 && d < nearestDist) {
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
    if(state.story.stage === 4 || state.story.stage === 5) {
        input.move = 0;
        player.vx = 0;
        player.vy = 0;
        player.x += (Math.random()-0.5) * 1.5;
        player.y += (Math.random()-0.5) * 1.5;
    }

    let speed = CONFIG.moveSpeed * 0.3;
    if(input.speedUp) speed = CONFIG.moveSpeed; 
    
    if(state.debug.fastMove) speed *= 3;

    if(input.move > 0) {
        player.vx += Math.cos(player.targetAngle) * speed * CONFIG.acceleration;
        player.vy += Math.sin(player.targetAngle) * speed * CONFIG.acceleration;
    }

    player.vx *= CONFIG.waterDrag;
    player.vy *= CONFIG.waterDrag;

    let nextX = player.x + player.vx;
    let nextY = player.y + player.vy;
    
    let hitX = checkCollision(nextX, player.y, true);
    if(!hitX) player.x = nextX;
    else { player.vx *= -0.5; if(Math.abs(player.vx)>1) triggerSilt(player.x, player.y, 20); } 

    let hitY = checkCollision(player.x, nextY, true);
    if(!hitY) player.y = nextY;
    else { player.vy *= -0.5; if(Math.abs(player.vy)>1) triggerSilt(player.x, player.y, 20); }

    if(player.y < 0) {
        player.y = 0;
        player.vy = Math.abs(player.vy) * 0.5;
    }

    if(lastPlayerY < 0 && player.y >= 0) createSplash(player.x, 0, 2);
    if(lastPlayerY > 5 && player.y <= 5 && player.vy < -1) {
        createSplash(player.x, 0, 2);
    }

    updateRopeSystem();

    // 首次潜水：封堵的洞口提示
    if(state.story.stage === 1 || state.story.stage === 2) {
        if(state.story.flags.collapsed && state.landmarks.tunnelEntry) {
            let dist = Math.hypot(player.x - state.landmarks.tunnelEntry.x, player.y - state.landmarks.tunnelEntry.y);
            if(dist < 80 && Math.sin(player.targetAngle) > 0.5 && input.move > 0) {
                if(!state.story.lastBlockMsgTime || Date.now() - state.story.lastBlockMsgTime > 3000) {
                    storyManager.showText("洞口被巨石堵住了", "#f00", 2000);
                    state.story.lastBlockMsgTime = Date.now();
                }
            }
        }
    }

    // 2. 泥沙逻辑
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

    if(state.story.flags.tankDamaged) {
        o2Consumption *= CONFIG.o2DamageMultiplier;
        
        if(state.npc.active) {
            let distToNpc = Math.hypot(player.x - state.npc.x, player.y - state.npc.y);
            if(distToNpc < 80) {
                player.o2 += CONFIG.o2RefillRate;
                if(player.o2 > 100) player.o2 = 100;
                o2Consumption = 0;
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
    }

    // 更新探索地图
    let exploreRadius = Math.ceil(CONFIG.lightRange / CONFIG.tileSize);
    let pr = Math.floor(player.y / CONFIG.tileSize);
    let pc = Math.floor(player.x / CONFIG.tileSize);
    
    for(let r = pr - exploreRadius; r <= pr + exploreRadius; r++) {
        for(let c = pc - exploreRadius; c <= pc + exploreRadius; c++) {
            if(r >= 0 && r < CONFIG.rows && c >= 0 && c < CONFIG.cols) {
                if(Math.hypot(c-pc, r-pr) <= exploreRadius) {
                    if(state.explored[r]) state.explored[r][c] = true;
                }
            }
        }
    }

    // 浮出水面检测（y < 20 = 浮出）
    if(player.y < 20 && state.story.stage === 6) {
        endGame(true, "成功生还");
    }

    if(player.o2 <= 0 && state.story.stage !== 4 && state.story.stage !== 5) {
        endGame(false, "氧气耗尽");
    }

    // 更新动画时间（用于脚踼动画）
    if(!player.animTime) player.animTime = 0;
    let swimSpeed = Math.hypot(player.vx, player.vy);
    player.animTime += 0.05 + swimSpeed * 0.05; 

    // 水流扰动（静止漂浮）
    if(input.move === 0 && swimSpeed < 0.5) {
        let time = Date.now() / 1000;
        player.vx += Math.sin(time) * 0.02;
        player.vy += Math.cos(time * 0.8) * 0.02;
    }

    // 5. 生态更新（鱼类移动）
    if(state.fishes) {
        for(let fish of state.fishes) {
            if(fish.angle === undefined) fish.angle = Math.atan2(fish.vy, fish.vx);

            fish.x += fish.vx;
            fish.y += fish.vy;
            
            if(fish.x < 0 || fish.x > CONFIG.cols * CONFIG.tileSize) fish.vx *= -1;
            
            if(fish.y < 60) {
                fish.y = 60;
                fish.vy = Math.abs(fish.vy) * 0.5;
            }
            if(fish.y > CONFIG.rows * CONFIG.tileSize) fish.vy *= -1;

            if(Math.random() < 0.005) {
                fish.vx += (Math.random() - 0.5) * 0.8;
                fish.vy += (Math.random() - 0.5) * 0.4;
            }
            
            let speed = Math.hypot(fish.vx, fish.vy);
            if(speed > 2.0) {
                fish.vx *= 0.9;
                fish.vy *= 0.9;
            } else if (speed < 0.5) {
                fish.vx *= 1.1;
                fish.vy *= 1.1;
            }
            
            if(checkCollision(fish.x + fish.vx*10, fish.y + fish.vy*10, false)) {
                fish.vx *= -1;
                fish.vy *= -1;
            }

            let targetAngle = Math.atan2(fish.vy, fish.vx);
            let diff = targetAngle - fish.angle;
            while(diff > Math.PI) diff -= Math.PI*2;
            while(diff < -Math.PI) diff += Math.PI*2;
            fish.angle += diff * 0.1;
        }
    }

    updateParticles();
}