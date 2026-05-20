import { CONFIG } from '../core/config';
import { state, player, particles, input, resetState } from '../core/state';
import { generateMap } from '../world/map';
import { StoryManager } from '../story/StoryManager';
import { Particle, createSplash, updateSplashes, triggerSilt, updateParticles } from './Particle';
import { updateBreathSystem, resetBreathSystem, consumeBreathO2, resetBreathO2Consumer, computeBuoyancyOffset } from './BreathSystem';
import { updateRopeSystem, findNearestWall } from './Rope';
import { updateAllFishEnemies, createFishEnemy, findSafeSpawnPosition, findMazeFishSpawnPosition } from './FishEnemy';
import { processManualDrive, updateAutoDriveVisual } from './ManualDrive';
import { checkCollision, getNearestWallDist, checkMazeCollision } from './Collision';

import { updateCameraSpringArm, snapCameraToPlayer, getAdaptiveZoom } from './CameraLogic';
import { updateMarkers, updateWheelButtonVisibility } from './Marker';
import { triggerCollisionImpact, resetCollisionImpact, updateRegulatorAnim } from './CollisionImpact';

// 从拆分模块重新导出，保持外部导入路径不变
export { resetArenaLogic, updateArena } from './ArenaLogic';
export { resetMazeLogic, startMazeDive, returnToShore, replayMazeLogic, updateMaze, abandonCase, acceptNewCase, stayInResolvedCase, markBriefingShown } from './MazeLogic';
export { checkCollision, getNearestWallDist, checkMazeCollision } from './Collision';
export { updateCameraSpringArm, snapCameraToPlayer, getAdaptiveZoom, resetAdaptiveZoom, getOpenness } from './CameraLogic';
export { findNearestWall };

const storyManager = new StoryManager();

// --- NPC（旧主线·已废弃）---
// 旧的 updateNPC（潘子的 follow/wait/enter_tunnel/dead/catch_up/rescue/to_dead_end 状态机）已删除。
// 迷宫救援里的被困者 NPC 由 MazeLogic 自带的 distress* 系统驱动，不走这里。
function updateNPC() {
    // no-op
}

// --- 区域辅助函数 ---
// 旧主线 handleZoneEnter（新区域文字播报）已删除；保留 checkZones 仅维护 currentZone 状态字段。
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
            }
            break;
        }
    }
}

function endGame(_win: boolean, reason: string) {
    // 旧主线的 ending screen 已废弃。失败仍走 lose 屏（toast）；胜利不再有 ending 演出。
    state.screen = 'lose';
    storyManager.showText(reason, "#f00", 99999);
}

// --- 核心逻辑 ---
export function resetGameLogic(startPlay?: boolean) {
    if(startPlay === undefined) startPlay = true;
    resetState();
    resetBreathSystem();
    resetBreathO2Consumer();
    resetCollisionImpact();
    generateMap();

    state.fx.shake = 0;
    state.fx.redOverlay = 0;
    state.currentZone = null;
    state.endingTimer = 0;

    // 旧主线 NPC（潘子）已废弃；迷宫的被困者由 MazeLogic 自己管。
    state.npc.active = false;

    state.camera = {
        zoom: 1, targetZoom: 1,
        x: player.x, y: player.y,
        targetX: player.x, targetY: player.y,
        vx: 0, vy: 0,
        swayX: 0, swayY: 0, swayTime: 0,
    };
    snapCameraToPlayer();
    state.antiStuck = { timer: 0, lastPos: {x:player.x, y:player.y} };

    if (startPlay) {
        // 旧主线"开始游戏"入口已废弃。新主线由迷宫救援营地入口接管，进入路径不再走 resetGameLogic(true)。
        // 此分支保留只是为兼容键盘 Space 键的过渡 UI。
        state.screen = 'play';
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
        // 旧主线 ending 已废弃；保留计数器兼容遗留 UI 路径。
        state.endingTimer++;
        return;
    }
    if(state.screen !== 'play') return;

    let lastPlayerY = player.y;

    storyManager.update();

    checkZones();

    if(state.rope && state.rope.hold && state.rope.hold.active) {
        input.move = 0;
        input.speedUp = false;
        player.vx = 0;
        player.vy = 0;
        // 手动挡：清空脉冲队列，防止松手后突然冲出
        if (state.manualDrive) state.manualDrive.activeTouches = {};
    }

    // 被凶猛鱼咬住或死亡过场期间冻结玩家（动不了，正在被撕咬）
    if (state.fishBite && state.fishBite.active) {
        input.move = 0;
        input.speedUp = false;
        player.vx = 0;
        player.vy = 0;
        if (state.manualDrive) state.manualDrive.activeTouches = {};
    }

    updateNPC();
    updateSplashes();

    // --- 摄像机控制 ---
    if(!state.camera) state.camera = {
        zoom: 1, targetZoom: 1,
        x: player.x, y: player.y,
        targetX: player.x, targetY: player.y,
        vx: 0, vy: 0,
        swayX: 0, swayY: 0, swayTime: 0,
    };
    // 计算剧情驱动的基础zoom
    let storyZoom = 1.0;
    if(state.landmarks.tunnelEntry) {
        let dist = Math.hypot(player.x - state.landmarks.tunnelEntry.x, player.y - state.landmarks.tunnelEntry.y);
        if(dist < 200 || player.y > state.landmarks.tunnelEntry.y) {
            storyZoom = 1.5;
        }
    }
    // 旧主线 stage===4 的 1.3x 拉近已废弃。
    // 自适应缩放与剧情zoom叠加：取两者中更大的（更近的）
    const azZoom = getAdaptiveZoom();
    state.camera.targetZoom = Math.max(storyZoom, azZoom);
    state.camera.zoom += (state.camera.targetZoom - state.camera.zoom) * 0.02;

    // --- 弹簧臂相机跟随 + 水中摇曳 ---
    updateCameraSpringArm();

    // 旧主线"防卡墙机制"和"濒死强制抖动"已废弃。

    // 1. 转向系统 + 2. 移动系统
    let angleDiff = 0; // 声明在外层，泥沙逻辑需要引用
    if (processManualDrive()) {
        // 手动挡模式：脉冲已处理
    } else {
        // 自动挡（摇杆）模式
        player.targetAngle = input.targetAngle;

        angleDiff = player.targetAngle - player.angle;
        while(angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while(angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        player.angle += angleDiff * CONFIG.turnSpeed; 

        let speed = CONFIG.moveSpeed * 0.3;
        if(input.speedUp) speed = CONFIG.moveSpeed; 

        if(input.move > 0) {
            player.vx += Math.cos(player.targetAngle) * speed * CONFIG.acceleration;
            player.vy += Math.sin(player.targetAngle) * speed * CONFIG.acceleration;
        }

        player.vx *= CONFIG.waterDrag;
        player.vy *= CONFIG.waterDrag;

        // 自动挡动作视觉：写入转向/前进信号，让 drawDiver 能呈现转向身体侧倾与手臂动作
        updateAutoDriveVisual(angleDiff * CONFIG.turnSpeed, input.move > 0);
    }

    // 呼吸浮力：吐气阶段轻微下沉、吸气阶段轻微上浮，让玩家能直观感知呼吸节奏
    // 濒死阶段不叠加（旧主线已废弃；新主线无濒死强制冻结）
    player.vy += computeBuoyancyOffset();

    let nextX = player.x + player.vx;
    let nextY = player.y + player.vy;
    
    // 记录撞前速度，用于撞击强度判定
    const preVx = player.vx;
    const preVy = player.vy;

    let hitX = checkCollision(nextX, player.y, true);
    if(!hitX) player.x = nextX;
    else { player.vx *= -0.5; if(Math.abs(player.vx)>1) triggerSilt(player.x, player.y, 20); } 

    let hitY = checkCollision(player.x, nextY, true);
    if(!hitY) player.y = nextY;
    else { player.vy *= -0.5; if(Math.abs(player.vy)>1) triggerSilt(player.x, player.y, 20); }

    // 撞击反馈（音效 + 气泡 + 氧气损失）：主线任一轴命中即触发
    if (hitX || hitY) {
        triggerCollisionImpact(preVx, preVy, player.x, player.y);
    }

    if(player.y < 0) {
        player.y = 0;
        player.vy = Math.abs(player.vy) * 0.5;
    }

    if(lastPlayerY < 0 && player.y >= 0) createSplash(player.x, 0, 2);
    if(lastPlayerY > 5 && player.y <= 5 && player.vy < -1) {
        createSplash(player.x, 0, 2);
    }

    updateRopeSystem();

    // 标记系统更新
    updateMarkers();
    updateWheelButtonVisibility();

    // 轮盘展开动画
    if (state.wheel && state.wheel.open) {
        if (state.wheel.expandProgress < 1) {
            state.wheel.expandProgress = Math.min(1, state.wheel.expandProgress + 1 / (CONFIG.marker.wheelExpandDuration / 1000 * 60));
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

    // 3. 气体逻辑（阶梯式：由 BreathSystem 驱动，只在吐气瞬间扣一大口）
    // 呼吸系统未激活时（过场 / 岸上 / 菜单），consumeBreathO2 会返回 o2IdleDrain 兜底小常量
    let o2Consumption = consumeBreathO2();

    // 旧主线 tankDamaged（氧气瓶损坏 + 队友补气）已废弃。

    player.o2 -= o2Consumption;

    // 无限氧气开关
    if (CONFIG.infiniteO2) player.o2 = 100;

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

    // 旧主线"浮出水面进入第二三关结局"已废弃。
    if(player.o2 <= 0) {
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

    // 呼吸系统：仅在主线 play 阶段有效（内部会自己判断 screen/stage）
    updateBreathSystem();

    // 气嘴脱落动画推进（撞岩石后的"手捞气嘴塞回嘴"动画）
    updateRegulatorAnim();

    // 更新凶猛鱼敌人
    updateAllFishEnemies(1);
}