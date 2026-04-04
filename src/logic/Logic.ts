import { CONFIG } from '../core/config';
import { state, player, particles, input, resetState } from '../core/state';
import { generateMap, generateArenaMap, generateMazeMap } from '../world/map';
import { getMazeMainThemeConfig, getMazeSceneThemeKeyByIndex } from '../world/mazeScene';
import { StoryManager } from '../story/StoryManager';
import { Particle, createSplash, updateSplashes, triggerSilt, updateParticles } from './Particle';
import { updateRopeSystem, findNearestWall } from './Rope';
import { updateAllFishEnemies, createFishEnemy, findSafeSpawnPosition } from './FishEnemy';

const storyManager = new StoryManager();

// 导出 findNearestWall 供渲染层使用
export { findNearestWall };

// --- 剧情 & NPC 逻辑 ---

function updateNPC() {
    if(!state.npc.active) return;
    
    let targetX = player.x;
    let targetY = player.y;
    let speed = 2.8;
    
if(state.debug.fastMove) speed *= CONFIG.debugSpeedMultiplier;
    
    if(state.npc.state === 'to_dead_end') {
        // 第二关NPC救人后，独自游向假烟囱(394,2700)死路
        let deadEnd = state.landmarks.deadEndDeep;
        targetX = deadEnd.x;
        targetY = deadEnd.y;
        speed = 3.5;
if(state.debug.fastMove) speed *= CONFIG.debugSpeedMultiplier;
        
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
    }
    else if(state.npc.state === 'catch_up') {
        // 第二关：小潘发现走错路，快速追上玩家
        targetX = player.x;
        targetY = player.y;
        speed = 4.5;
        if(state.debug.fastMove) speed *= CONFIG.debugSpeedMultiplier;
        
        let dx = targetX - state.npc.x;
        let dy = targetY - state.npc.y;
        let dist = Math.hypot(dx, dy);
        
        if(dist < 60) {
            // 追上玩家后切回 follow 状态
            state.npc.state = 'follow';
        }
        
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
    }
    else if(state.story.flags.rescued) {
        // 获救后NPC跟随玩家上浮
        targetX = player.x;
        targetY = player.y;
        speed = 3.5;
        if(state.debug.fastMove) speed *= CONFIG.debugSpeedMultiplier;
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
        if(state.debug.fastMove) speed *= CONFIG.debugSpeedMultiplier;
        
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
if(state.debug.fastMove) speed *= CONFIG.debugSpeedMultiplier;

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
        if(state.debug.fastMove) speed *= CONFIG.debugSpeedMultiplier;
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

function handleZoneEnter(zoneName) {
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
export function checkCollision(x, y, isPlayer) {
    if(isPlayer === undefined) isPlayer = false;
    const { tileSize, playerRadius } = CONFIG;
    let r = Math.floor(y/tileSize);
    let c = Math.floor(x/tileSize);
    
    for(let ry = r-1; ry <= r+1; ry++) {
        for(let rc = c-1; rc <= c+1; rc++) {
            if(!state.map[ry]) continue;
            let cell = state.map[ry][rc];
            if(!cell) continue;
            if(typeof cell === 'object') {
                let dist = Math.hypot(x - cell.x, y - cell.y);
                if(dist < cell.r + playerRadius) return true;
            } else if(cell === 2) {
                let cellCx = rc * tileSize + tileSize / 2;
                let cellCy = ry * tileSize + tileSize / 2;
                if(Math.abs(x - cellCx) < tileSize / 2 + playerRadius && Math.abs(y - cellCy) < tileSize / 2 + playerRadius) return true;
            }
        }
    }
    
    if(isPlayer && state.invisibleWalls) {
        for(let wall of state.invisibleWalls) {
            let dist = Math.hypot(x - wall.x, y - wall.y);
            if(dist < wall.r + playerRadius) return true;
        }
    }
    
    return false;
}

export function getNearestWallDist(x, y) {
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

function endGame(win, reason) {
    if (win) {
        state.screen = 'ending';
        state.endingTimer = 0;
    } else {
        state.screen = 'lose';
        storyManager.showText(reason, "#f00", 99999);
    }
}

// --- 核心逻辑 ---
export function resetGameLogic(startStage, startPlay) {
    if(startStage === undefined) startStage = 1;
    if(startPlay === undefined) startPlay = true;
    resetState();
    generateMap();
    
    state.story.stage = startStage;
    state.story.timer = 0;
    state.story.shake = 0;
    state.story.redOverlay = 0;
    state.story.flags = {
            seenSuit: false,
            npcEntered: false,
            collapsed: startStage >= 3, // 第二关开始时缝隙已坍塌过
            blackScreen: false,
            narrowVision: false,
            rescued: false,
            approachedTunnel: startStage >= 3,
            tankDamaged: false,
            deathPause: 0,
            npcWrongWay: false,
            flashlightBroken: false,
            flashlightBrokenOsShown: false,
            tryingToSurface: false,
            surfaceOsShown: false,
            reachedChamber23Junction: false,
            chamber23OsShown: false,
        // 第三关：手电筒固定灭（靠近灰色物体后）
            flashlightFixedOff: false,
            flashlightOffStartTime: 0,
            // 第三关：恐怖鱼眼闪现
            fishEyeTriggered: false,
            fishEyeFlashTimer: 0,
            fishEyeFlashStartTime: 0,
            // 第三关：放弃救援按钮
            abandonBtnVisible: false,
            abandonBtnScheduledTime: 0,
            abandonBtnHolding: false,
            abandonBtnHoldStartTime: 0,
            bearDied: false,
            stage2Ending: false
        };
    state.story.visitedZones = [];
    state.currentZone = null;
    state.endingTimer = 0;
    
    state.npc.active = true;
    state.npc.x = player.x - 30;
    state.npc.y = player.y;
    state.npc.state = 'follow';
    
    // 第三关：只有玩家自己下潜，没有NPC
    if(startStage >= 7) {
        state.npc.active = false;
    }
    
    // 第四关：同样没有NPC，出生点在二三洞室连接处另一侧
    if(startStage >= 9) {
        state.npc.active = false;
        // 第四关出生点：二三洞室连接处下方（刚进入第三洞室）
        let j23 = state.landmarks.chamber23Junction;
        player.x = j23.x;
        player.y = j23.y + CONFIG.chapter4SpawnOffsetY;
        // 第四关手电筒已经是坏的状态（从第三关延续）
        state.story.flags.flashlightBroken = true;
    }
    
    // 第二关开始时清除透明墙，玩家可以进入缝隙
    if(startStage >= 3) {
        state.invisibleWalls = [];
    }
    
    state.camera = { zoom: 1, targetZoom: 1 };
    state.antiStuck = { timer: 0, lastPos: {x:player.x, y:player.y} };

    if (startPlay) {
        state.screen = 'play';
        if(startStage >= 9) {
            storyManager.showText("内心：熊子，我来了...", "rgba(200, 100, 0, 1)", 3000);
            setTimeout(() => {
                storyManager.showText("内心：这里比上面更深，更黑...", "#ffd700", 3000);
            }, 3500);
        } else if(startStage >= 7) {
            storyManager.showText("不敢再多想，简单调整后，再次出发！", "rgba(200, 100, 0, 1)", 4000);
        } else if(startStage >= 3) {
            storyManager.showText("找来同伴潘子，立刻一起下潜救熊子！", "rgba(13, 93, 8, 1)", 4000);
        } else {
            storyManager.showText("难得的假期！\n熊子带我们去雅各布井潜水！", "rgba(43, 95, 206, 1)", 4000);
        }
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

    if((state.story.stage === 3 || state.story.stage === 5 || state.story.stage === 6 || state.story.stage === 7) && inTunnel) {
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
    
if(state.debug.fastMove) speed *= CONFIG.debugSpeedMultiplier;

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

    // 第二关：小潘发现走错路检测（玩家到达第一二洞室连接处）
    if(state.story.stage === 3 && state.npc.active && !state.story.flags.npcWrongWay) {
        let junction = state.landmarks.chamber12Junction;
        let distToJunction = Math.hypot(player.x - junction.x, player.y - junction.y);
        if(distToJunction < 200) {
            state.story.flags.npcWrongWay = true;
            // 小潘切换到快速追上状态
            state.npc.state = 'catch_up';
            storyManager.showText("小潘：等等！我走错了！", "#4af", 3000);
        }
    }

    // 第三关：放弃救援按钮长按计时（用时间戳，不依赖帧率）
    if(state.story.flags.abandonBtnHolding && state.story.flags.abandonBtnVisible && state.story.stage === 7) {
        let now = Date.now();
        let elapsed = (now - state.story.flags.abandonBtnHoldStartTime) / 1000;
        if(elapsed >= CONFIG.abandonBtnHoldDuration) {
            state.story.flags.abandonBtnHolding = false;
            state.story.flags.abandonBtnHoldStartTime = 0;
            state.story.flags.abandonBtnVisible = false;
            state.story.flags.bearDied = true;
            state.story.stage = 8;
            state.story.timer = 0;
            state.screen = 'ending';
            state.endingTimer = 0;
        }
    }

    // 第三关：手电筒损坏检测（经过第一二洞室连接处时触发）
    if(state.story.stage === 7 && !state.story.flags.flashlightBroken) {
        let junction = state.landmarks.chamber12Junction;
        let distToJunction = Math.hypot(player.x - junction.x, player.y - junction.y);
        if(distToJunction < 200) {
            state.story.flags.flashlightBroken = true;
            state.story.flags.flashlightBrokenOsShown = false;
            storyManager.showText("怎么回事！！！？", "#ff4444", 2000);
            setTimeout(() => {
                storyManager.showText("呀！手电筒刚刚被石头砖了！！", "#ffd700", 3000);
            }, 2000);
        }
    }

    // 第三关：玩家试图上岸检测
    if(state.story.stage === 7 && state.story.flags.flashlightBroken && !state.story.flags.tryingToSurface) {
        // 玩家向上游一段（y < 600）且还没到二三洞室连接处
        if(player.y < 600 && !state.story.flags.reachedChamber23Junction) {
            state.story.flags.tryingToSurface = true;
            if(!state.story.flags.surfaceOsShown) {
                state.story.flags.surfaceOsShown = true;
                storyManager.showText("内心：对不起了熊子，我真的尽力了。哎呀让你那么冒失，等救援队来救你吧", "#ffd700", 5000);
            }
        }
    }

    // 第三关：玩家上岸后熊子死亡结局
    if(state.story.stage === 7 && state.story.flags.tryingToSurface && player.y < 20) {
        state.story.stage = 8;
        state.story.timer = 0;
        state.screen = 'ending';
        state.endingTimer = 0;
        // 标记为熊子死亡结局
        state.story.flags.bearDied = true;
    }

    // 第三关：靠近灰色物体（氧气罐）时手电筒固定灭
    if(state.story.stage === 7 && state.story.flags.flashlightBroken && !state.story.flags.flashlightFixedOff) {
        let distToGrayThing = Math.hypot(player.x - CONFIG.grayThingX, player.y - CONFIG.grayThingY);
        if(distToGrayThing < CONFIG.flashlightFixedOffTriggerDist) {
            state.story.flags.flashlightFixedOff = true;
            state.story.flags.flashlightOffStartTime = Date.now();
        }
    }

    // 第三关：手电筒固定灭后的计时逻辑（用时间戳）
    if(state.story.stage === 7 && state.story.flags.flashlightFixedOff) {
        let now = Date.now();
        let elapsed = (now - state.story.flags.flashlightOffStartTime) / 1000;

        // 鱼眼触发：玩家靠近灰色物体（氧气罐）时手电筒突然亮一下，闪现鱼眼
        if(!state.story.flags.fishEyeTriggered) {
            let distToGrayThing = Math.hypot(player.x - CONFIG.grayThingX, player.y - CONFIG.grayThingY);
            if(distToGrayThing < CONFIG.fishEyeTriggerDist) {
                state.story.flags.fishEyeTriggered = true;
                state.story.flags.fishEyeFlashStartTime = now; // 记录鱼眼开始时间
                state.story.flags.fishEyeFlashTimer = 1; // 标记鱼眼激活（>0表示激活）
                state.story.flags.flashlightOffStartTime = now; // 鱼眼触发后重置计时
                // 鱼眼触发后2秒显示放弃按钮
                state.story.flags.abandonBtnScheduledTime = now + CONFIG.abandonBtnAppearDelay * 1000;
            }
        }

        // 鱼眼闪现计时（用时间戳控制持续时间）
        if(state.story.flags.fishEyeFlashTimer > 0) {
            let flashElapsed = (now - state.story.flags.fishEyeFlashStartTime) / 1000;
            if(flashElapsed >= CONFIG.fishEyeFlashDuration) {
                state.story.flags.fishEyeFlashTimer = 0; // 鱼眼结束
            } else {
                // 用剩余比例表示进度（1.0 -> 0）
                state.story.flags.fishEyeFlashTimer = 1 - flashElapsed / CONFIG.fishEyeFlashDuration;
            }
        }

        // 鱼眼触发后，到达预定时间显示放弃按钮
        if(state.story.flags.fishEyeTriggered && 
           state.story.flags.abandonBtnScheduledTime > 0 &&
           now >= state.story.flags.abandonBtnScheduledTime &&
           !state.story.flags.abandonBtnVisible) {
            state.story.flags.abandonBtnVisible = true;
            state.story.flags.abandonBtnScheduledTime = 0;
        }

        // 鱼眼触发后，经过配置秒数后手电筒重新亮起（恢复闪烁状态）
        if(state.story.flags.fishEyeTriggered) {
            let resumeElapsed = (now - state.story.flags.flashlightOffStartTime) / 1000;
            if(resumeElapsed >= CONFIG.flashlightResumeDuration) {
                state.story.flags.flashlightFixedOff = false;
            }
        }
    }

    // 第三关：到达二三洞室连接处（大缝隙结尾，进入第三洞室）
    if(state.story.stage === 7 && state.story.flags.flashlightBroken && !state.story.flags.reachedChamber23Junction) {
        let junction23 = state.landmarks.chamber23Junction;
        let distToJunction23 = Math.hypot(player.x - junction23.x, player.y - junction23.y);
        if(distToJunction23 < 200) {
            state.story.flags.reachedChamber23Junction = true;
            // 玩家改变主意，继续深入，清除上岸意图
            state.story.flags.tryingToSurface = false;
            // 通过连接处后，放弃按钮消失，手电筒恢复正常
            state.story.flags.abandonBtnVisible = false;
            state.story.flags.flashlightFixedOff = false;
            state.story.flags.flashlightBroken = false; // 手电筒恢复正常
            if(!state.story.flags.chamber23OsShown) {
                state.story.flags.chamber23OsShown = true;
                storyManager.showText("内心：坚持住熊子，我一定会救你出来！", "#00ff88", 4000);
                setTimeout(() => {
                    storyManager.showText("内心：原来是幻觉，那只是我刚刚掉那儿的氧气罐。。。", "#ffd700", 4000);
                    setTimeout(() => {
                        storyManager.showText("内心：我以为是什么呢吓死了。", "#ffd700", 3500);
                    }, 4500);
                }, 4500);
            }
        }
    }

    // 第三关：通过二三洞室连接处后进入第四关
    if(state.story.stage === 7 && state.story.flags.reachedChamber23Junction) {
        let junction23 = state.landmarks.chamber23Junction;
        // 玩家继续向下走，远离连接处后进入第四关
        if(player.y > junction23.y + CONFIG.chapter4SpawnOffsetY) {
            state.story.stage = 9; // 第四关
            state.story.timer = 0;
            storyManager.showText("什么东西！", "#ff4444", 3000);
        }
    }

    // 首次潜水：玩家固定进不去缝隙入口
    if(state.story.stage === 1 || state.story.stage === 2) {
        if(state.landmarks.tunnelEntry) {
            let dist = Math.hypot(player.x - state.landmarks.tunnelEntry.x, player.y - state.landmarks.tunnelEntry.y);
            if(dist < 80 && input.move > 0) {
                if(!state.story.lastBlockMsgTime || Date.now() - state.story.lastBlockMsgTime > 3000) {
                    if(state.story.flags.collapsed) {
                        storyManager.showText("洞口被巨石堵住了", "#f00", 2000);
                    } else {
                        storyManager.showText("缝隙太窄了，根本挤不进去！", "#f00", 2000);
                    }
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

    // 无限氧气开关
    if (CONFIG.infiniteO2) player.o2 = 100;

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
        // 第二关结局：进入第二三关过渡剧情
        state.story.stage = 6;
        state.screen = 'ending';
        state.endingTimer = 0;
        state.story.flags.stage2Ending = true;
    }
    if(player.o2 <= 0 && state.story.stage !== 4 && state.story.stage !== 5 && state.story.stage !== 7) {
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

    // 更新凶猛鱼敌人（仅在游戏进行中且没有被咬死亡过场时）
    if (!state.fishBite || !state.fishBite.active || state.fishBite.phase !== 'dead') {
        updateAllFishEnemies(1);
    } else {
        // 死亡过场期间只更新被咬状态，不更新鱼的 AI
        updateAllFishEnemies(1);
    }
}

// =============================================
// 食人鱼纯享版：初始化竞技场
// =============================================
export function resetArenaLogic() {
    const arenaCfg = CONFIG.fishArena;

    // 重置基础状态
    resetState();
    generateArenaMap();

    // 竞技场专用：无限氧气、无NPC
    state.npc.active = false;
    state.story.stage = 0;
    state.screen = 'fishArena';

    // 玩家出生在竞技场中心
    const spawnX = arenaCfg.mapSize / 2;
    const spawnY = arenaCfg.mapSize / 2;
    player.x = spawnX;
    player.y = spawnY;
    player.angle = -Math.PI / 2;
    player.targetAngle = -Math.PI / 2;
    input.targetAngle = -Math.PI / 2;
    player.o2 = 100; // 无限氧气（不消耗）

    // 初始化竞技场状态
    state.fishArena = {
        round: 1,
        fishAlive: 0,
        fishTotal: 1,
        totalKills: 0,
        phase: 'prep',
        prepTimer: arenaCfg.prepDuration,
        clearTimer: 0,
        deadTimer: 0,
        startTime: Date.now(),
        surviveTime: 0,
        achievementText: '',
        achievementTimer: 0,
        comboKills: 0,
        comboTimer: 0,
    };
}

// =============================================
// 食人鱼纯享版：每帧更新
// =============================================
export function updateArena() {
    if (state.screen !== 'fishArena') return;
    const arena = state.fishArena;
    if (!arena) return;
    const arenaCfg = CONFIG.fishArena;

    // 死亡结算阶段：只计时，不更新游戏逻辑
    if (arena.phase === 'dead') {
        arena.deadTimer++;
        return;
    }

    // 更新存活时间
    arena.surviveTime = (Date.now() - arena.startTime) / 1000;

    // 成就文字倒计时
    if (arena.achievementTimer > 0) arena.achievementTimer--;

    // 连杀计时
    if (arena.comboTimer > 0) {
        arena.comboTimer--;
        if (arena.comboTimer <= 0) arena.comboKills = 0;
    }

    // --- 准备阶段 ---
    if (arena.phase === 'prep') {
        // 准备阶段：速度衰减（防止上一轮结束时的惯性漂移）
        player.vx *= CONFIG.waterDrag;
        player.vy *= CONFIG.waterDrag;

        arena.prepTimer -= 1 / 60;
        if (arena.prepTimer <= 0) {
            // 生成本轮食人鱼：第1轮1只，第2轮5只，第3轮10只，第4轮15只（每轮+5）
            const fishCount = arena.round === 1 ? 1 : (arena.round - 1) * 5;
            arena.fishTotal = fishCount;
            arena.fishAlive = fishCount;
            for (let i = 0; i < fishCount; i++) {
                const pos = findSafeSpawnPosition(player.x, player.y);
                state.fishEnemies.push(createFishEnemy(pos.x, pos.y));
            }
            arena.phase = 'fight';
        }
        return;
    }

    // --- 战斗阶段 ---
    if (arena.phase === 'fight') {
        // 无限氧气
        player.o2 = 100;

        // 屏幕震动衰减（竞技场模式下StoryManager不运行，需手动衰减）
        if (state.story.shake > 0) {
            state.story.shake *= 0.9;
            if (state.story.shake < 0.5) state.story.shake = 0;
        }

        // 检测玩家死亡（被咬死）
        if (state.fishBite && state.fishBite.phase === 'dead') {
            arena.phase = 'dead';
            arena.deadTimer = 0;
            arena.surviveTime = (Date.now() - arena.startTime) / 1000;
            return;
        }

        // 统计存活鱼数，并同步更新累计击杀数（每条鱼死亡时 +1）
        const aliveCount = state.fishEnemies.filter(f => !f.dead).length;
        const prevAlive = arena.fishAlive;
        arena.fishAlive = aliveCount;
        if (prevAlive > aliveCount) {
            arena.totalKills += (prevAlive - aliveCount);
        }

        // 检测本轮清图
        if (aliveCount === 0 && arena.fishTotal > 0) {
            // 清图！进入庆祝阶段
            arena.phase = 'clear';
            arena.clearTimer = 0;
            triggerArenaAchievement(arena);
        }

        // 更新玩家移动和攻击
        updateArenaPlayer();

        // 更新鱼 AI
        updateAllFishEnemies(1);
        updateParticles();
        updateSplashes();
        return;
    }

    // --- 清图庆祝阶段 ---
    if (arena.phase === 'clear') {
        arena.clearTimer++;
        // 庆祝 2.5 秒后进入下一轮准备
        if (arena.clearTimer >= 150) {
            arena.round++;
            // 下一轮鱼数量：第1轮1只，第2轮5只，第3轮10只，第4轮15只（每轮+5）
            arena.fishTotal = arena.round === 1 ? 1 : (arena.round - 1) * 5;
            arena.fishAlive = 0;
            arena.phase = 'prep';
            arena.prepTimer = arenaCfg.prepDuration;
            // 清空死亡的鱼
            state.fishEnemies = state.fishEnemies.filter(f => !f.dead);
        }
        updateParticles();
        updateSplashes();
    }
}

// 竞技场玩家移动更新（复用主游戏逻辑，但无氧气消耗）
function updateArenaPlayer() {
    // 转向
    player.targetAngle = input.targetAngle;
    let angleDiff = player.targetAngle - player.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    player.angle += angleDiff * CONFIG.turnSpeed;

    // 移动
    let speed = CONFIG.moveSpeed * 0.3;
    if (input.speedUp) speed = CONFIG.moveSpeed;
    if (input.move > 0) {
        player.vx += Math.cos(player.targetAngle) * speed * CONFIG.acceleration;
        player.vy += Math.sin(player.targetAngle) * speed * CONFIG.acceleration;
    }
    player.vx *= CONFIG.waterDrag;
    player.vy *= CONFIG.waterDrag;

    // 碰撞检测
    const nextX = player.x + player.vx;
    const nextY = player.y + player.vy;
    if (!checkCollision(nextX, player.y, true)) player.x = nextX;
    else player.vx *= -0.5;
    if (!checkCollision(player.x, nextY, true)) player.y = nextY;
    else player.vy *= -0.5;

    // 顶部水面限制：不能游出水面
    if (player.y < 10) {
        player.y = 10;
        player.vy = Math.abs(player.vy) * 0.3;
    }

    // 动画时间
    if (!player.animTime) player.animTime = 0;
    player.animTime += 0.05 + Math.hypot(player.vx, player.vy) * 0.05;

    // 攻击冷却
    if (state.playerAttack && state.playerAttack.cooldownTimer > 0) {
        state.playerAttack.cooldownTimer--;
    }
    if (state.playerAttack && state.playerAttack.active) {
        state.playerAttack.timer++;
        if (state.playerAttack.timer >= CONFIG.attack.slashDuration) {
            state.playerAttack.active = false;
        }
    }
}

// 触发竞技场成就反馈
function triggerArenaAchievement(arena: any) {
    const round = arena.round;
    const arenaCfg = CONFIG.fishArena;
    let text = '';

    if (round >= arenaCfg.legendRound) {
        const legends = ['LEGENDARY!!', '无人能敌！', '深海之王！', '传说级猎手！'];
        text = legends[Math.floor(Math.random() * legends.length)];
    } else if (round >= arenaCfg.unbelievableRound) {
        const unbelieves = ['UNBELIEVABLE!', '难以置信！', '你是怪物吗！', '太强了！'];
        text = unbelieves[Math.floor(Math.random() * unbelieves.length)];
    } else if (round >= arenaCfg.shutdownRound) {
        const shutdowns = ['SHUTDOWN!', '关机！', '鱼群已清空！', '势不可挡！'];
        text = shutdowns[Math.floor(Math.random() * shutdowns.length)];
    } else {
        const clears = ['清图！', 'CLEAR!', '干净利落！', '下一波！'];
        text = clears[Math.floor(Math.random() * clears.length)];
    }

    arena.achievementText = text;
    arena.achievementTimer = 120; // 显示 2 秒

    // 连杀统计
    arena.comboKills++;
    arena.comboTimer = 180; // 3 秒内再次清图算连杀
}

// =============================================
// 迷宫引导绳模式：碰撞检测（使用迷宫专属地图数据）
export function checkMazeCollision(x: number, y: number, maze: any): boolean {
    const ts = maze.mazeTileSize;
    const playerRadius = CONFIG.maze.playerRadius;
    const r = Math.floor(y / ts);
    const c = Math.floor(x / ts);
    // 搜索范围 5x5：wall 有随机偏移+大半径，碰撞边缘可能超出 3x3 范围
    for(let ry = r-2; ry <= r+2; ry++) {
        for(let rc = c-2; rc <= c+2; rc++) {            if (!maze.mazeMap[ry]) continue;
            const cell = maze.mazeMap[ry][rc];
            if (!cell) continue;
            if (typeof cell === 'object') {
                const dist = Math.hypot(x - cell.x, y - cell.y);
                if (dist < cell.r + playerRadius) return true;
                // 检查同格子的额外装饰圆（挂在基础 wall 的 extras 上）
                if (cell.extras) {
                    for (const extra of cell.extras) {
                        if (Math.hypot(x - extra.x, y - extra.y) < extra.r + playerRadius) return true;
                    }
                }
            } else if (cell === 2) {
                const cellCx = rc * ts + ts / 2;
                const cellCy = ry * ts + ts / 2;
                if (Math.abs(x - cellCx) < ts / 2 + playerRadius && Math.abs(y - cellCy) < ts / 2 + playerRadius) return true;
            }
        }
    }
    return false;
}
// =============================================
// 迷宫多次下潜闭环：初始化（生成新地图，进入岸上阶段）
// =============================================
export function resetMazeLogic() {
    // 重置基础状态（不调用 resetState，避免污染主线地图）
    player.o2 = 100;
    player.n2 = 0;
    player.silt = 0;
    player.vx = 0;
    player.vy = 0;
    player.hasTarget = false;
    particles.length = 0;
    state.splashes = [];
    state.fishEnemies = [];
    state.fishBite = null;
    state.flashlightOn = true;
    state.story.redOverlay = 0;
    state.story.shake = 0;
    state.playerAttack = {
        active: false,
        timer: 0,
        cooldownTimer: 0,
        angle: 0,
    };
    // 重置绳索
    state.rope = {
        ropes: [],
        active: false,
        current: {
            start: null,
            startWall: null,
            end: null,
            path: [],
            basePoints: [],
            slackFactor: 1,
            mode: 'loose',
            time: 0
        },
        ui: {
            visible: false,
            type: null,
            progress: 0,
            anchor: null
        },
        hold: {
            active: false,
            type: null,
            timer: 0,
            touchId: null,
            anchor: null
        },
        stillTimer: 0
    };

    // 生成迷宫地图
    const mazeData = generateMazeMap();

    // 初始化相机
    state.camera = { zoom: 1, targetZoom: 1 };

    // 初始化空的已探索快照
    const emptyExplored: boolean[][] = [];
    for (let r = 0; r < mazeData.mazeRows; r++) {
        emptyExplored[r] = [];
        for (let c = 0; c < mazeData.mazeCols; c++) {
            emptyExplored[r][c] = false;
        }
    }

    // 初始化迷宫专属状态 —— 直接进入岸上阶段
    state.mazeRescue = {
        phase: 'shore',
        diveType: 'scout',
        resultTimer: 0,
        startTime: 0,
        finishTime: 0,
        npcRescued: false,
        npcRescueHolding: false,
        npcRescueHoldStart: 0,
        npcRescueTouchId: null,
        retreatHolding: false,
        retreatHoldStart: 0,
        retreatTouchId: null,
        minimapExpanded: false,
        shoreMapOpen: false,
        shoreScrollY: 0,
        divingInTimer: 0,
        mazeMap: mazeData.mazeMap,
        mazeWalls: mazeData.mazeWalls,
        mazeExplored: mazeData.mazeExplored,
        mazeCols: mazeData.mazeCols,
        mazeRows: mazeData.mazeRows,
        mazeTileSize: mazeData.mazeTileSize,
        exitX: mazeData.exitX,
        exitY: mazeData.exitY,
        npcInitX: mazeData.npcInitX,
        npcInitY: mazeData.npcInitY,
        diveCount: 0,
        npcFound: false,
        maxDepthReached: 0,
        totalRopePlaced: 0,
        diveHistory: [],
        // 场景辨识度
        sceneThemeKeys: mazeData.mazeSceneThemeKeys,
        sceneThemeMap: mazeData.mazeSceneThemeMap,
        sceneBlendMap: mazeData.mazeSceneBlendMap,
        sceneStructureMap: mazeData.mazeSceneStructureMap,
        discoveredThemes: [],
        thisNewThemes: [],
        currentThemeKey: '',
        playerPath: [],
        thisExploredBefore: emptyExplored,
        thisRopeCountBefore: 0,
        thisMaxDepth: 0,
    };

    // 初始化 NPC（被救者，岸上阶段不激活）
    state.npc.active = false;
    state.npc.x = mazeData.npcInitX;
    state.npc.y = mazeData.npcInitY;
    state.npc.vx = 0;
    state.npc.vy = 0;
    state.npc.angle = -Math.PI / 2;
    state.npc.state = 'wait';

    // 玩家放在出口位置（岸上阶段不显示，但预设好）
    player.x = mazeData.exitX;
    // 使用边缘厚度计算安全出生Y（在洞口内侧）
    const wallThick = CONFIG.maze.wallThickness || 5;
    player.y = (wallThick + 1) * mazeData.mazeTileSize + mazeData.mazeTileSize / 2;
    player.angle = Math.PI / 2;
    player.targetAngle = Math.PI / 2;
    input.targetAngle = Math.PI / 2;

    // 切换到迷宫模式
    state.screen = 'mazeRescue';
}

// =============================================
// 迷宫多次下潜闭环：从岸上开始下潜
// =============================================
export function startMazeDive(diveType: string) {
    const maze = state.mazeRescue;
    if (!maze) return;

    // 设置下潜类型（不区分scout/rescue，统一为scout，发现NPC后自动可绑绳）
    maze.diveType = diveType;
    maze.phase = 'diving_in';
    maze.divingInTimer = 0;
    maze.startTime = Date.now();
    maze.finishTime = 0;
    maze.resultTimer = 0;

    // 重置玩家状态
    player.o2 = 100;
    player.n2 = 0;
    player.silt = 0;
    player.vx = 0;
    player.vy = 0;
    // 玩家从出口（顶部）出发
    player.x = maze.exitX;
    // 使用边缘厚度计算安全出生Y（在洞口内侧）
    const wallThick = CONFIG.maze.wallThickness || 5;
    player.y = (wallThick + 1) * maze.mazeTileSize + maze.mazeTileSize / 2;
    player.angle = Math.PI / 2;
    player.targetAngle = Math.PI / 2;
    input.targetAngle = Math.PI / 2;
    particles.length = 0;
    state.splashes = [];
    state.fishBite = null;
    state.story.redOverlay = 0;
    state.story.shake = 0;

    // 重置撤离状态
    maze.retreatHolding = false;
    maze.retreatHoldStart = 0;
    maze.retreatTouchId = null;

    // 重置NPC救援交互状态
    maze.npcRescueHolding = false;
    maze.npcRescueHoldStart = 0;
    maze.npcRescueTouchId = null;

    // 正式救援时重置NPC跟随状态
    if (diveType === 'rescue') {
        maze.npcRescued = false;
    }

    // 激活NPC
    state.npc.active = true;
    state.npc.x = maze.npcInitX;
    state.npc.y = maze.npcInitY;
    state.npc.vx = 0;
    state.npc.vy = 0;
    state.npc.angle = -Math.PI / 2;
    state.npc.state = 'wait';

    // 记录本次下潜开始时的探索快照（用于计算增量）
    maze.thisExploredBefore = [];
    for (let r = 0; r < maze.mazeRows; r++) {
        maze.thisExploredBefore[r] = [];
        for (let c = 0; c < maze.mazeCols; c++) {
            maze.thisExploredBefore[r][c] = maze.mazeExplored[r] ? maze.mazeExplored[r][c] : false;
        }
    }
    maze.thisRopeCountBefore = state.rope ? state.rope.ropes.length : 0;
    maze.thisMaxDepth = 0;
    maze.thisNewThemes = [];
    maze.currentThemeKey = '';
    maze.playerPath = [{x: player.x, y: player.y}];

    // 绳索系统保留已有绳索，只重置当前铺设状态
    if (state.rope) {
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
        state.rope.ui = {
            visible: false,
            type: null,
            progress: 0,
            anchor: null
        };
        state.rope.hold = {
            active: false,
            type: null,
            timer: 0,
            touchId: null,
            anchor: null
        };
        state.rope.stillTimer = 0;
    }
}

// =============================================
// 迷宫多次下潜闭环：完成本次下潜，返回岸上
// =============================================
function finishMazeDive(returnReason: string) {
    const maze = state.mazeRescue;
    if (!maze) return;

    // 计算本次下潜成果
    const duration = Math.floor((Date.now() - maze.startTime) / 1000);
    let newExploredCount = 0;
    for (let r = 0; r < maze.mazeRows; r++) {
        for (let c = 0; c < maze.mazeCols; c++) {
            if (maze.mazeExplored[r] && maze.mazeExplored[r][c] &&
                maze.thisExploredBefore[r] && !maze.thisExploredBefore[r][c]) {
                newExploredCount++;
            }
        }
    }
    const ropePlaced = (state.rope ? state.rope.ropes.length : 0) - maze.thisRopeCountBefore;

    // 记录下潜历史
    maze.diveHistory.push({
        diveType: maze.diveType,
        duration: duration,
        maxDepth: Math.floor(maze.thisMaxDepth / maze.mazeTileSize),
        newExploredCount: newExploredCount,
        ropePlaced: ropePlaced,
        returnReason: returnReason,
        newThemes: maze.thisNewThemes ? maze.thisNewThemes.slice() : [],
    });

    // 更新跨下潜统计
    maze.diveCount++;
    maze.totalRopePlaced = state.rope ? state.rope.ropes.length : 0;
    if (maze.thisMaxDepth > maze.maxDepthReached) {
        maze.maxDepthReached = maze.thisMaxDepth;
    }

    // 进入结算阶段
    maze.phase = 'debrief';
    maze.resultTimer = 0;
    maze.finishTime = Date.now();
}

// =============================================
// 迷宫多次下潜闭环：从结算回到岸上
// =============================================
export function returnToShore() {
    const maze = state.mazeRescue;
    if (!maze) return;

    maze.phase = 'shore';
    maze.resultTimer = 0;
    // 停用NPC
    state.npc.active = false;
}

// =============================================
// 迷宫多次下潜闭环：重玩（生成新地图，重新开始）
// =============================================
export function replayMazeLogic() {
    // 直接调用完整重置，生成新地图
    resetMazeLogic();
}

// =============================================
// 迷宫多次下潜闭环：每帧更新
// =============================================
export function updateMaze() {
    if (state.screen !== 'mazeRescue') return;
    const maze = state.mazeRescue;
    if (!maze) return;

    // === 岸上阶段：不需要更新游戏逻辑 ===
    if (maze.phase === 'shore') {
        return;
    }

    // === 入水动效阶段 ===
    if (maze.phase === 'diving_in') {
        maze.divingInTimer++;
        // 入水动效持续约1.5秒（90帧）
        if (maze.divingInTimer >= 90) {
            maze.phase = 'play';
            // 开场提示
            if (maze.npcFound) {
                if (maze.diveCount === 0) {
                    storyManager.showText('第一次下潜，先探探路吧', '#aef', 3000);
                    setTimeout(() => {
                        storyManager.showText('靠近墙壁静止可以铺设引导绳', 'rgba(180,220,255,0.9)', 3000);
                    }, 3500);
                } else {
                    storyManager.showText(`第 ${maze.diveCount + 1} 次下潜`, '#aef', 2500);
                }
            } else {
                if (maze.diveCount === 0) {
                    storyManager.showText('第一次下潜，先探探路吧', '#aef', 3000);
                    setTimeout(() => {
                        storyManager.showText('靠近墙壁静止可以铺设引导绳', 'rgba(180,220,255,0.9)', 3000);
                    }, 3500);
                } else {
                    storyManager.showText(`第 ${maze.diveCount + 1} 次下潜，继续深入`, '#aef', 2500);
                }
            }
        }
        return;
    }

    // === 结算阶段：只计时 ===
    if (maze.phase === 'debrief' || maze.phase === 'rescued') {
        maze.resultTimer++;
        return;
    }

    // === 上浮动画阶段 ===
    if (maze.phase === 'surfacing') {
        maze.resultTimer++;
        // 玩家自动向上移动
        player.vy = -3;
        player.y += player.vy;
        player.vx *= 0.9;
        player.x += player.vx;
        // 动画时间
        if (!player.animTime) player.animTime = 0;
        player.animTime += 0.1;
        // 上浮完成后进入结算
        if (maze.resultTimer >= CONFIG.maze.surfacingDuration) {
            finishMazeDive(maze.npcRescued ? 'rescued' : 'retreat');
        }
        updateParticles();
        updateSplashes();
        return;
    }

    // === 游戏进行中 ===

    // 更新剧情文字（复用 storyManager）
    storyManager.update();

    // 绳索长按时冻结玩家
    if (state.rope && state.rope.hold && state.rope.hold.active) {
        input.move = 0;
        input.speedUp = false;
        player.vx = 0;
        player.vy = 0;
    }

    // 撤离长按时也冻结玩家
    if (maze.retreatHolding) {
        input.move = 0;
        input.speedUp = false;
        player.vx = 0;
        player.vy = 0;
    }

    // --- 玩家移动 ---
    player.targetAngle = input.targetAngle;
    let angleDiff = player.targetAngle - player.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    player.angle += angleDiff * CONFIG.turnSpeed;

    let speed = (CONFIG.maze.moveSpeed || CONFIG.moveSpeed) * 0.3;
    if (input.speedUp) speed = CONFIG.maze.moveSpeed || CONFIG.moveSpeed;
    if (state.debug.fastMove) speed *= CONFIG.debugSpeedMultiplier;

    if (input.move > 0) {
        player.vx += Math.cos(player.targetAngle) * speed * CONFIG.acceleration;
        player.vy += Math.sin(player.targetAngle) * speed * CONFIG.acceleration;
    }
    player.vx *= CONFIG.waterDrag;
    player.vy *= CONFIG.waterDrag;

    // 碰撞检测（使用迷宫专属地图）
    const nextX = player.x + player.vx;
    const nextY = player.y + player.vy;
    if (!checkMazeCollision(nextX, player.y, maze)) player.x = nextX;
    else { player.vx *= -0.5; triggerSilt(player.x, player.y, 10); }
    if (!checkMazeCollision(player.x, nextY, maze)) player.y = nextY;
    else { player.vy *= -0.5; triggerSilt(player.x, player.y, 10); }

    // 顶部边界：不能游出迷宫
    if (player.y < maze.mazeTileSize / 2) {
        player.y = maze.mazeTileSize / 2;
        player.vy = Math.abs(player.vy) * 0.3;
    }

    // 动画时间
    if (!player.animTime) player.animTime = 0;
    player.animTime += 0.05 + Math.hypot(player.vx, player.vy) * 0.05;

    // 记录本次最深到达
    if (player.y > maze.thisMaxDepth) {
        maze.thisMaxDepth = player.y;
    }

    // 记录玩家轨迹 (每隔一段距离记录一次，避免数据过大)
    if (maze.playerPath.length === 0) {
        maze.playerPath.push({x: player.x, y: player.y});
    } else {
        const lastPt = maze.playerPath[maze.playerPath.length - 1];
        if (Math.hypot(player.x - lastPt.x, player.y - lastPt.y) > 20) {
            maze.playerPath.push({x: player.x, y: player.y});
        }
    }

    // --- 绳索系统 ---
    updateRopeSystem();

    // --- NPC 更新 ---
    if (state.npc.active) {
        if (maze.npcRescued) {
            // NPC 跟随玩家
            const dx = player.x - state.npc.x;
            const dy = player.y - state.npc.y;
            const dist = Math.hypot(dx, dy);
            const npcSpeed = CONFIG.maze.npcFollowSpeed;
            if (dist > 30) {
                state.npc.vx = (dx / dist) * npcSpeed;
                state.npc.vy = (dy / dist) * npcSpeed;
                state.npc.x += state.npc.vx;
                state.npc.y += state.npc.vy;
            }
            if (Math.abs(state.npc.vx) > 0.1 || Math.abs(state.npc.vy) > 0.1) {
                state.npc.angle = Math.atan2(state.npc.vy, state.npc.vx);
            }
        } else {
            // NPC 静止漂动
            if (Math.random() < 0.05) {
                state.npc.vx += (Math.random() - 0.5) * 0.5;
                state.npc.vy += (Math.random() - 0.5) * 0.5;
            }
            state.npc.vx *= 0.95;
            state.npc.vy *= 0.95;
            state.npc.x += state.npc.vx;
            state.npc.y += state.npc.vy;
            // 朝向玩家
            const dx = player.x - state.npc.x;
            const dy = player.y - state.npc.y;
            const targetAngle = Math.atan2(dy, dx);
            let diff = targetAngle - state.npc.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            state.npc.angle += diff * 0.05;
        }

        // 检测是否发现NPC（靠近一定距离就标记为已发现）
        if (!maze.npcFound) {
            const distToNpc = Math.hypot(player.x - state.npc.x, player.y - state.npc.y);
            if (distToNpc < CONFIG.maze.npcRescueRange * 2) {
                maze.npcFound = true;
                storyManager.showText('发现被困者！', '#ff0', 2500);
            }
        }
    }

    // --- 救援交互：靠近NPC长按（发现NPC后即可绑绳，不区分下潜类型） ---
    if (!maze.npcRescued && state.npc.active) {
        if (maze.npcRescueHolding) {
            const elapsed = (Date.now() - maze.npcRescueHoldStart) / 1000;
            if (elapsed >= CONFIG.maze.npcRescueHoldDuration) {
                // 完成绑绳
                maze.npcRescued = true;
                maze.npcRescueHolding = false;
                state.npc.state = 'follow';
                storyManager.showText('绑好了！带他出去！', '#0f8', 2500);
            }
        }
    }

    // --- 撤离协议：长按完成后开始上浮（未带人时可用） ---
    if (!maze.npcRescued && maze.retreatHolding) {
        const elapsed = (Date.now() - maze.retreatHoldStart) / 1000;
        if (elapsed >= CONFIG.maze.retreatHoldDuration) {
            maze.retreatHolding = false;
            maze.phase = 'surfacing';
            maze.resultTimer = 0;
            storyManager.showText('安全上浮中...', '#aef', 2000);
        }
    }

    // --- 胜利检测：NPC已跟随且玩家到达出口 ---
    if (maze.npcRescued && player.y <= maze.exitY + maze.mazeTileSize * 2) {
        const distToExit = Math.hypot(player.x - maze.exitX, player.y - maze.exitY);
        if (distToExit < maze.mazeTileSize * 2) {
            maze.phase = 'rescued';
            maze.resultTimer = 0;
            maze.finishTime = Date.now();
            // 记录到历史
            finishMazeDive('rescued');
            maze.phase = 'rescued'; // finishMazeDive会设为debrief，这里覆盖为rescued
            storyManager.showText('🎉 成功救出！', '#ff0', 99999);
        }
    }

    // --- 氧气消耗 ---
    const vel = Math.hypot(player.vx, player.vy);
    let o2Consumption = CONFIG.maze.o2ConsumptionBase;
    if (vel > 1.5) o2Consumption += CONFIG.maze.o2ConsumptionMove;
    player.o2 -= o2Consumption;

    // 无限氧气开关
    if (CONFIG.infiniteO2) player.o2 = 100;

    // 氧气耗尽 = 被迫返回岸上（保留成果）
    if (player.o2 <= 0) {
        player.o2 = 0;
        storyManager.showText('氧气不足，紧急上浮...', '#f80', 2500);
        maze.phase = 'surfacing';
        maze.resultTimer = 0;
    }

    // --- 场景辨识度：检测当前区域主题 ---
    if (maze.sceneThemeMap) {
        const themeR = Math.floor(player.y / maze.mazeTileSize);
        const themeC = Math.floor(player.x / maze.mazeTileSize);
        if (themeR >= 0 && themeR < maze.mazeRows && themeC >= 0 && themeC < maze.mazeCols) {
            const themeIdx = maze.sceneThemeMap[themeR][themeC];
            const themeKey = getMazeSceneThemeKeyByIndex(maze.sceneThemeKeys, themeIdx);
            if (themeKey) {
                if (themeKey !== maze.currentThemeKey) {
                    maze.currentThemeKey = themeKey;
                    if (!maze.discoveredThemes.includes(themeKey)) {
                        maze.discoveredThemes.push(themeKey);
                        if (!maze.thisNewThemes.includes(themeKey)) {
                            maze.thisNewThemes.push(themeKey);
                        }
                        const themeCfg = getMazeMainThemeConfig(themeKey);
                        if (themeCfg) {
                            storyManager.showText(`进入 ${themeCfg.name}`, 'rgba(200,220,255,0.9)', 2500);
                        }
                    }
                }
            }
        }
    }

    // --- 更新探索地图 ---
    const exploreRadius = Math.ceil(CONFIG.lightRange / maze.mazeTileSize);
    const pr = Math.floor(player.y / maze.mazeTileSize);
    const pc = Math.floor(player.x / maze.mazeTileSize);
    for (let r = pr - exploreRadius; r <= pr + exploreRadius; r++) {
        for (let c = pc - exploreRadius; c <= pc + exploreRadius; c++) {
            if (r >= 0 && r < maze.mazeRows && c >= 0 && c < maze.mazeCols) {
                if (Math.hypot(c - pc, r - pr) <= exploreRadius) {
                    if (maze.mazeExplored[r]) maze.mazeExplored[r][c] = true;
                }
            }
        }
    }

    // --- 更新粒子 ---
    updateParticles();
    updateSplashes();
}