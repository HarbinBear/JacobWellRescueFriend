import { CONFIG } from '../core/config';
import { state, player } from '../core/state';

// =============================================
// 判断当前是否处于迷宫模式
// =============================================
function isMazeMode(): boolean {
    return state.screen === 'mazeRescue' && !!state.mazeRescue;
}

// =============================================
// 内联碰撞检测（避免与 Logic.ts 循环导入）
// 自动适配主线地图和迷宫地图
// =============================================
function checkCollisionLocal(x: number, y: number): boolean {
    if (isMazeMode()) {
        return checkCollisionMazeLocal(x, y);
    }
    const { tileSize, playerRadius } = CONFIG;
    const r = Math.floor(y / tileSize);
    const c = Math.floor(x / tileSize);
    for (let ry = r - 1; ry <= r + 1; ry++) {
        for (let rc = c - 1; rc <= c + 1; rc++) {
            if (!state.map[ry]) continue;
            const cell = state.map[ry][rc];
            if (!cell) continue;
            if (typeof cell === 'object') {
                if (Math.hypot(x - cell.x, y - cell.y) < cell.r + playerRadius) return true;
            } else if (cell === 2) {
                const cx = rc * tileSize + tileSize / 2;
                const cy = ry * tileSize + tileSize / 2;
                if (Math.abs(x - cx) < tileSize / 2 + playerRadius && Math.abs(y - cy) < tileSize / 2 + playerRadius) return true;
            }
        }
    }
    return false;
}

// =============================================
// 迷宫模式碰撞检测（读取 mazeRescue 地图数据）
// =============================================
function checkCollisionMazeLocal(x: number, y: number): boolean {
    const maze = state.mazeRescue;
    if (!maze) return false;
    const ts = maze.mazeTileSize;
    const pr = CONFIG.maze.playerRadius || CONFIG.playerRadius;
    const r = Math.floor(y / ts);
    const c = Math.floor(x / ts);
    for (let ry = r - 1; ry <= r + 1; ry++) {
        for (let rc = c - 1; rc <= c + 1; rc++) {
            if (!maze.mazeMap[ry]) continue;
            const cell = maze.mazeMap[ry][rc];
            if (!cell) continue;
            if (typeof cell === 'object') {
                const w = cell as any;
                if (Math.hypot(x - w.x, y - w.y) < w.r + pr) return true;
                // 检查额外装饰圆
                if (w.extras) {
                    for (const ex of w.extras) {
                        if (Math.hypot(x - ex.x, y - ex.y) < ex.r + pr) return true;
                    }
                }
            } else if (cell === 2) {
                const cx = rc * ts + ts / 2;
                const cy = ry * ts + ts / 2;
                if (Math.abs(x - cx) < ts / 2 + pr && Math.abs(y - cy) < ts / 2 + pr) return true;
            }
        }
    }
    return false;
}

// =============================================
// 凶猛鱼敌人状态枚举
// =============================================
export type FishEnemyState =
    | 'roam'        // 自由游弋
    | 'detect'      // 发现目标（短暂停顿）
    | 'stalk'       // 悄悄靠近
    | 'circle'      // 在目标附近徘徊
    | 'lunge'       // 扑向目标（含蓄力起手）
    | 'bite'        // 撕咬
    | 'devour'      // 吞食
    | 'retreat'     // 慢慢撤退
    | 'flee'        // 迅速撤退（被光驱赶）
    | 'fear'        // 怕光后退（过渡状态）
    | 'hit'         // 被打中后逃跑
    | 'returning'   // 脱离仇恨后返回聚集点
    | 'dying';      // 死亡动画（翻肚皮淘出）
// =============================================
// 凶猛鱼实体数据结构
// =============================================
export interface FishEnemy {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;          // 当前朝向角度
    targetAngle: number;    // 目标朝向角度
    state: FishEnemyState;
    stateTimer: number;     // 当前状态已持续帧数
    animTime: number;       // 动画时间（用于身体摆动）
    // 游弋相关
    roamTargetX: number;
    roamTargetY: number;
    roamTimer: number;
    // 徘徊相关
    circleAngle: number;    // 绕目标的当前角度
    circleRadius: number;   // 徘徊半径
    // 扑击相关
    lungeCharge: number;    // 蓄力进度 0~1
    // 撕咬相关
    biteCount: number;      // 已撕咬次数
    // 怕光相关
    fearTimer: number;      // 怕光持续计时
    fearDir: number;        // 逃跑方向角度
    // 被打相关
    hitFleeTimer: number;   // 被打后逃跑计时
    hitFleeDir: number;     // 被打后逃跑方向
    hitFleePhase: number;   // 逃跑路径阶段（用于多段折线躲避）
    hitFleeNextDirTimer: number; // 下次改变方向的计时
    // 死亡动画相关
    dyingTimer: number;     // 死亡动画计时
    dyingAlpha: number;     // 死亡淡出透明度（1→0）
    dyingRoll: number;      // 翻肚皮旋转角度（0→π）
    // 死亡/移除标记
    dead: boolean;
    // 状态变化提示图标（问号/感叹号）
    alertIcon: string;      // 图标内容：'?' | '!' | ''
    alertIconColor: string; // 图标颜色
    alertTimer: number;     // 图标显示剩余帧数
    // 聚集点归属（迷宫模式下有效；主线/竞技场默认为鱼自己的出生点）
    denX: number;           // 聚集点中心X
    denY: number;           // 聚集点中心Y
    denRadius: number;      // 聚集点活动半径
}

// =============================================
// 前方障碍物预判：检测前方一小段路径是否有墙
// =============================================
function hasWallAhead(fish: FishEnemy, angle: number, lookAhead: number): boolean {
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
        const dist = (i / steps) * lookAhead;
        const nx = fish.x + Math.cos(angle) * dist;
        const ny = fish.y + Math.sin(angle) * dist;
        if (checkCollisionLocal(nx, ny)) return true;
    }
    return false;
}

// =============================================
// 凶猛鱼配置常量（从 CONFIG 读取）
// =============================================
const CFG = () => CONFIG.fishEnemy;

// =============================================
// 工厂函数：创建一条凶猛鱼
// =============================================
export function createFishEnemy(x: number, y: number, denX?: number, denY?: number, denRadius?: number): FishEnemy {
    const angle = Math.random() * Math.PI * 2;
    return {
        x, y,
        vx: Math.cos(angle) * 0.5,
        vy: Math.sin(angle) * 0.5,
        angle,
        targetAngle: angle,
        state: 'roam',
        stateTimer: 0,
        animTime: Math.random() * Math.PI * 2,
        roamTargetX: x,
        roamTargetY: y,
        roamTimer: 0,
        circleAngle: Math.random() * Math.PI * 2,
        circleRadius: CFG().circleRadius,
        lungeCharge: 0,
        biteCount: 0,
        fearTimer: 0,
        fearDir: 0,
        hitFleeTimer: 0,
        hitFleeDir: 0,
        hitFleePhase: 0,
        hitFleeNextDirTimer: 0,
        dyingTimer: 0,
        dyingAlpha: 1,
        dyingRoll: 0,
        dead: false,
        alertIcon: '',
        alertIconColor: '#fff',
        alertTimer: 0,
        denX: denX !== undefined ? denX : x,
        denY: denY !== undefined ? denY : y,
        denRadius: denRadius !== undefined ? denRadius : (CONFIG.maze.denRadius || 600),
    };
}

// =============================================
// 安全生成位置：在玩家周围找一个不在墙里的水中位置
// =============================================
export function findSafeSpawnPosition(centerX: number, centerY: number): { x: number; y: number } {
    const minDist = 200;
    const maxDist = 400;
    // 最多尝试 30 次，找到不碰墙的位置
    for (let attempt = 0; attempt < 30; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = minDist + Math.random() * (maxDist - minDist);
        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;
        // 迷宫模式不需要 y > 60 的限制
        const yOk = isMazeMode() ? true : y > 60;
        if (yOk && !checkCollisionLocal(x, y)) {
            return { x, y };
        }
    }
    // 兜底：直接在玩家正右方 300px
    return { x: centerX + 300, y: centerY };
}

// =============================================
// 迷宫模式专用：在指定聚集点附近找一个安全出生点
// =============================================
export function findMazeFishSpawnPosition(denX?: number, denY?: number, denRadius?: number): { x: number; y: number } {
    const maze = state.mazeRescue;
    if (!maze) return { x: 0, y: 0 };
    const ts = maze.mazeTileSize;
    const wallThick = CONFIG.maze.wallThickness || 5;

    // 指定了聚集点：在聚集点半径内找一个不碰墙的通道格
    if (denX !== undefined && denY !== undefined && denRadius !== undefined) {
        for (let attempt = 0; attempt < 50; attempt++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = Math.random() * denRadius;
            const x = denX + Math.cos(ang) * dist;
            const y = denY + Math.sin(ang) * dist;
            const r = Math.floor(y / ts);
            const c = Math.floor(x / ts);
            if (r < wallThick || r >= maze.mazeRows - wallThick) continue;
            if (c < wallThick || c >= maze.mazeCols - wallThick) continue;
            if (maze.mazeMap[r] && !maze.mazeMap[r][c] && !checkCollisionMazeLocal(x, y)) {
                return { x, y };
            }
        }
        // 兑底：就在聚集点中心
        return { x: denX, y: denY };
    }

    // 未指定聚集点（兼容旧逻辑）：在地图中下部区域随机找位置
    const minRow = Math.floor(maze.mazeRows * 0.3);
    const maxRow = maze.mazeRows - wallThick - 1;
    const minCol = wallThick + 1;
    const maxCol = maze.mazeCols - wallThick - 1;
    for (let attempt = 0; attempt < 50; attempt++) {
        const r = minRow + Math.floor(Math.random() * (maxRow - minRow));
        const c = minCol + Math.floor(Math.random() * (maxCol - minCol));
        if (maze.mazeMap[r] && !maze.mazeMap[r][c]) {
            const x = c * ts + ts / 2;
            const y = r * ts + ts / 2;
            const distToSpawn = Math.hypot(x - maze.exitX, y - (wallThick + 1) * ts);
            if (distToSpawn > ts * 8) {
                return { x, y };
            }
        }
    }
    return { x: maze.npcInitX + 200, y: maze.npcInitY };
}

// =============================================
// 迷宫模式专用：为当前局迷宫生成食人鱼聚集点列表
// 每个聚集点：一个洞室中心 + 活动半径 + 附近的骷髅装饰
// =============================================
export function generateFishDens(): { x: number; y: number; radius: number; skulls: any[] }[] {
    const maze = state.mazeRescue;
    if (!maze) return [];
    const mazeCfg = CONFIG.maze;
    const ts = maze.mazeTileSize;
    const wallThick = mazeCfg.wallThickness || 5;

    const denCountMin = mazeCfg.denCountMin || 2;
    const denCountMax = mazeCfg.denCountMax || 3;
    const denCount = denCountMin + Math.floor(Math.random() * (denCountMax - denCountMin + 1));
    const denRadius = mazeCfg.denRadius || 600;
    const minDistToSpawn = mazeCfg.denMinDistToSpawn || 2000;
    const minDistBetween = mazeCfg.denMinDistBetween || 1800;
    const mustCoverCritical = mazeCfg.denMustCoverCriticalPath !== false;

    // 玩家出生点：迷宫顶部洞口内侧
    const spawnX = maze.exitX;
    const spawnY = (wallThick + 1) * ts + ts / 2;

    const dens: { x: number; y: number; radius: number; skulls: any[] }[] = [];

    // === 策略：先尝试在“关键路径”（出生点→NPC）附近放一个，再随机擒其它 ===
    if (mustCoverCritical && denCount > 0) {
        // 在出生点→NPC的连线上取 0.45~0.75 区间的一个点，偏离一点
        const t = 0.45 + Math.random() * 0.3;
        const mx = spawnX + (maze.npcInitX - spawnX) * t;
        const my = spawnY + (maze.npcInitY - spawnY) * t;
        const pos = findNearbyOpenCell(maze, mx, my, 600);
        if (pos && Math.hypot(pos.x - spawnX, pos.y - spawnY) > minDistToSpawn) {
            dens.push({ x: pos.x, y: pos.y, radius: denRadius, skulls: [] });
        }
    }

    // === 填充剩余聚集点：随机选取，确保离出生点和其它聚集点都有足够距离 ===
    const maxRow = maze.mazeRows - wallThick - 1;
    const minRow = wallThick + 1;
    const maxCol = maze.mazeCols - wallThick - 1;
    const minCol = wallThick + 1;
    let outerAttempts = 0;
    while (dens.length < denCount && outerAttempts < 200) {
        outerAttempts++;
        const r = minRow + Math.floor(Math.random() * (maxRow - minRow));
        const c = minCol + Math.floor(Math.random() * (maxCol - minCol));
        if (!maze.mazeMap[r] || maze.mazeMap[r][c]) continue;
        const x = c * ts + ts / 2;
        const y = r * ts + ts / 2;
        if (Math.hypot(x - spawnX, y - spawnY) < minDistToSpawn) continue;
        let tooClose = false;
        for (const d of dens) {
            if (Math.hypot(x - d.x, y - d.y) < minDistBetween) { tooClose = true; break; }
        }
        if (tooClose) continue;
        dens.push({ x, y, radius: denRadius, skulls: [] });
    }

    // === 为每个聚集点生成骷髅装饰 ===
    const skullMin = mazeCfg.denSkullCountMin || 4;
    const skullMax = mazeCfg.denSkullCountMax || 8;
    const skullSearchRatio = mazeCfg.denSkullSearchRadiusRatio || 0.9;
    for (const den of dens) {
        const skullCount = skullMin + Math.floor(Math.random() * (skullMax - skullMin + 1));
        const searchR = den.radius * skullSearchRatio;
        // 从聚集点附近的 mazeWalls 中随机选 skullCount 块岩石，把骷髅贴在岩石外缘
        const candidates: any[] = [];
        for (const w of maze.mazeWalls) {
            if (!w) continue;
            const d = Math.hypot(w.x - den.x, w.y - den.y);
            if (d <= searchR && d > 40) candidates.push(w);
        }
        // 打乱
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        const pick = candidates.slice(0, Math.min(skullCount, candidates.length));
        for (const w of pick) {
            // 骷髅位置：岩石外缘，沿“从岩石中心指向聚集点外侧”的方向（暴露在聚集点这一侧，以便玩家能看见）
            const dx = den.x - w.x;
            const dy = den.y - w.y;
            const dLen = Math.hypot(dx, dy) || 1;
            // 将骷髅放在岩石边缘、面向聚集点一侧，加一点角度扰动
            const jitter = (Math.random() - 0.5) * 0.6;
            const angleOnRock = Math.atan2(dy, dx) + jitter;
            const offsetR = (w.r || 30) * 0.85;
            const skX = w.x + Math.cos(angleOnRock) * offsetR;
            const skY = w.y + Math.sin(angleOnRock) * offsetR;
            den.skulls.push({
                x: skX,
                y: skY,
                angle: angleOnRock,
                size: 6 + Math.random() * 5,
                seed: Math.random() * 1000,
            });
        }
    }

    return dens;
}

// 辅助：从给定点出发，找最近的一个通道格子
// =============================================
function findNearbyOpenCell(maze: any, cx: number, cy: number, maxDist: number): { x: number; y: number } | null {
    const ts = maze.mazeTileSize;
    const wallThick = CONFIG.maze.wallThickness || 5;
    const startR = Math.floor(cy / ts);
    const startC = Math.floor(cx / ts);
    const maxSteps = Math.ceil(maxDist / ts);
    for (let radius = 0; radius <= maxSteps; radius++) {
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
                const r = startR + dr;
                const c = startC + dc;
                if (r < wallThick || r >= maze.mazeRows - wallThick) continue;
                if (c < wallThick || c >= maze.mazeCols - wallThick) continue;
                if (maze.mazeMap[r] && !maze.mazeMap[r][c]) {
                    return { x: c * ts + ts / 2, y: r * ts + ts / 2 };
                }
            }
        }
    }
    return null;
}
// =============================================
// 平滑角度插值（最短路径）
// =============================================
function lerpAngle(current: number, target: number, factor: number): number {
    let diff = target - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * factor;
}

// =============================================
// 检测玩家手电筒是否照到凶猛鱼（考虑亮度与距离）
// =============================================
function isFlashlightHittingFish(fish: FishEnemy): boolean {
    const cfg = CFG();
    // 迷宫模式和竞技场模式手电始终可用；主线模式在深水才开启
    const alwaysOn = state.screen === 'mazeRescue' || state.screen === 'fishArena';
    if (!alwaysOn && player.y <= 600) return false;

    // 手电筒未开启时无效
    if (!state.flashlightOn) return false;

    // 第三关手电筒固定灭时无效
    if (state.story.flags.flashlightFixedOff) return false;

    // 计算鱼与玩家的距离
    const dx = fish.x - player.x;
    const dy = fish.y - player.y;
    const dist = Math.hypot(dx, dy);

    // 超出手电筒射程
    if (dist > CONFIG.lightRange) return false;

    // 超出怕光有效距离（远距离照到也不怕：迷宫食人鱼更胆大）
    const lightFearMax = cfg.lightFearMaxDistance || 0;
    if (lightFearMax > 0 && dist > lightFearMax) return false;

    // 计算鱼相对玩家的角度
    const angleToFish = Math.atan2(dy, dx);
    let angleDiff = angleToFish - player.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // 是否在手电筒视野角内
    const halfFov = (CONFIG.fov / 2) * (Math.PI / 180);
    if (Math.abs(angleDiff) > halfFov) return false;

    // 计算有效亮度：距离越近越亮，中心光束更亮
    const distFactor = 1 - dist / CONFIG.lightRange;
    const angleFactor = 1 - Math.abs(angleDiff) / halfFov;
    let brightness = distFactor * angleFactor;

    // 手电筒损坏时亮度打折
    if (state.story.flags.flashlightBroken) {
        const t = Date.now() / 1000;
        const flicker = Math.sin(t * 1.3) * Math.sin(t * 1.7) * Math.sin(t * 2.1);
        brightness *= Math.max(0, 0.5 + Math.abs(flicker) * 0.5);
    }

    // 只有亮度超过阈值才能驱赶
    return brightness >= cfg.lightFearThreshold;
}

// =============================================
// 主更新函数：更新单条凶猛鱼的 AI
// =============================================
export function updateFishEnemy(fish: FishEnemy, dt: number) {
    if (fish.dead) return;

    const cfg = CFG();
    fish.stateTimer++;
    fish.animTime += 0.08;

    // --- 检测手电筒照射（任何状态下都优先响应，除非已在逃跑）---
    if (fish.state !== 'flee' && fish.state !== 'fear') {
        if (isFlashlightHittingFish(fish)) {
            // 进入怕光状态
            const dx = fish.x - player.x;
            const dy = fish.y - player.y;
            fish.fearDir = Math.atan2(dy, dx); // 远离玩家方向
            fish.state = 'fear';
            fish.stateTimer = 0;
            fish.fearTimer = cfg.fearDuration;
            // 显示感叹号提示（蓝白色，表示被光惊吓）
            fish.alertIcon = '!';
            fish.alertIconColor = '#aaddff';
            fish.alertTimer = 40;
            return;
        }
    }

    // 衰减状态提示图标
    if (fish.alertTimer > 0) fish.alertTimer--;

    switch (fish.state) {
        case 'roam':      updateRoam(fish, cfg);      break;
        case 'detect':    updateDetect(fish, cfg);    break;
        case 'stalk':     updateStalk(fish, cfg);     break;
        case 'circle':    updateCircle(fish, cfg);    break;
        case 'lunge':     updateLunge(fish, cfg);     break;
        case 'bite':      updateBite(fish, cfg);      break;
        case 'devour':    updateDevour(fish, cfg);    break;
        case 'retreat':   updateRetreat(fish, cfg);   break;
        case 'flee':      updateFlee(fish, cfg);      break;
        case 'fear':      updateFear(fish, cfg);      break;
        case 'hit':       updateHit(fish, cfg);       break;
        case 'returning': updateReturning(fish, cfg); break;
        case 'dying':     updateDying(fish, cfg);     return; // 死亡动画不做碰撞移动
    }

    // 应用速度并做碰撞检测
    applyMovement(fish);
}

// =============================================
// 各状态更新函数
// =============================================

/** 自由游弋：在聚集点附近随机选取目标点缓慢游动 */
function updateRoam(fish: FishEnemy, cfg: any) {
    fish.roamTimer--;
    // 默认以聚集点为中心取新目标；如果当前位置已经离家太远（比如之前被驱过），则直接指向聚集点中心
    const distFromDen = Math.hypot(fish.x - fish.denX, fish.y - fish.denY);
    if (fish.roamTimer <= 0) {
        if (distFromDen > fish.denRadius * 1.1) {
            // 先向家方向缓慢回偏
            const back = Math.atan2(fish.denY - fish.y, fish.denX - fish.x);
            const wobble = (Math.random() - 0.5) * Math.PI * 0.4;
            const step = 120 + Math.random() * 150;
            fish.roamTargetX = fish.x + Math.cos(back + wobble) * step;
            fish.roamTargetY = fish.y + Math.sin(back + wobble) * step;
        } else {
            // 在聚集点活动半径内随机选一点
            const ang = Math.random() * Math.PI * 2;
            const dist = Math.random() * fish.denRadius;
            fish.roamTargetX = fish.denX + Math.cos(ang) * dist;
            fish.roamTargetY = fish.denY + Math.sin(ang) * dist;
        }
        fish.roamTimer = 120 + Math.random() * 180;
    }

    // 向目标缓慢游动
    moveToward(fish, fish.roamTargetX, fish.roamTargetY, cfg.roamSpeed, cfg.turnSpeedRoam);

    // 检测玩家是否进入感知范围
    const distToPlayer = Math.hypot(player.x - fish.x, player.y - fish.y);
    if (distToPlayer < cfg.detectRange) {
        fish.state = 'detect';
        fish.stateTimer = 0;
        return;
    }

    // 玩家过近：立刻逃跑（鱼很灵敏，不会被近身）
    if (distToPlayer < cfg.safeDistance) {
        startHitFlee(fish, cfg);
    }
}

/** 发现目标：短暂停顿，表现出"注意到了"的感觉 */
function updateDetect(fish: FishEnemy, cfg: any) {
    // 停下来，朝向玩家
    const dx = player.x - fish.x;
    const dy = player.y - fish.y;
    fish.targetAngle = Math.atan2(dy, dx);
    fish.angle = lerpAngle(fish.angle, fish.targetAngle, 0.05);
    fish.vx *= 0.85;
    fish.vy *= 0.85;

    if (fish.stateTimer >= cfg.detectPauseDuration) {
        fish.state = 'stalk';
        fish.stateTimer = 0;
        // 发现目标：显示问号提示（黄色）
        fish.alertIcon = '?';
        fish.alertIconColor = '#ffdd44';
        fish.alertTimer = 45;
    }
}

/** 悄悄靠近：缓慢向玩家移动，保持一定距离 */
function updateStalk(fish: FishEnemy, cfg: any) {
    const dx = player.x - fish.x;
    const dy = player.y - fish.y;
    const dist = Math.hypot(dx, dy);

    // 离家太远：脱离仇恨，回家
    const leash = (CONFIG.maze.denLeashDistance || 1400);
    const distFromDen = Math.hypot(fish.x - fish.denX, fish.y - fish.denY);
    if (distFromDen > leash) {
        startReturning(fish);
        return;
    }

    // 玩家跑远了，重新进入游弋
    if (dist > cfg.detectRange * 1.5) {
        fish.state = 'roam';
        fish.stateTimer = 0;
        return;
    }

    // 玩家过近：立刻逃跑（鱼很灵敏，不会被近身）
    if (dist < cfg.safeDistance) {
        startHitFlee(fish, cfg);
        return;
    }

    // 靠近到徘徊距离后，切换到徘徊
    if (dist < cfg.circleRadius + 20) {
        fish.state = 'circle';
        fish.stateTimer = 0;
        fish.circleAngle = Math.atan2(fish.y - player.y, fish.x - player.x);
        return;
    }

    moveToward(fish, player.x, player.y, cfg.stalkSpeed, cfg.turnSpeedStalk);
}

/** 在玩家附近徘徊：绕着玩家转圈，伺机扑击 */
function updateCircle(fish: FishEnemy, cfg: any) {
    const dist = Math.hypot(player.x - fish.x, player.y - fish.y);

    // 离家太远：脱离仇恨，回家
    const leash = (CONFIG.maze.denLeashDistance || 1400);
    const distFromDen = Math.hypot(fish.x - fish.denX, fish.y - fish.denY);
    if (distFromDen > leash) {
        startReturning(fish);
        return;
    }

    // 玩家跑远了
    if (dist > cfg.detectRange * 1.5) {
        fish.state = 'roam';
        fish.stateTimer = 0;
        return;
    }

    // 玩家过近：立刻逃跑（鱼很灵敏，不会被近身）
    if (dist < cfg.safeDistance) {
        startHitFlee(fish, cfg);
        return;
    }

    // 绕圈移动
    fish.circleAngle += cfg.circleSpeed;
    const targetX = player.x + Math.cos(fish.circleAngle) * fish.circleRadius;
    const targetY = player.y + Math.sin(fish.circleAngle) * fish.circleRadius;
    moveToward(fish, targetX, targetY, cfg.circleSpeed * 60, cfg.turnSpeedCircle);

    // 徘徊一段时间后发动扑击
    if (fish.stateTimer >= cfg.circleBeforeLunge) {
        fish.state = 'lunge';
        fish.stateTimer = 0;
        fish.lungeCharge = 0;
        // 即将扑击：显示感叹号提示（红色）
        fish.alertIcon = '!';
        fish.alertIconColor = '#ff3322';
        fish.alertTimer = 35;
    }
}/** 扑向目标：先蓄力（眼睛发光起手），再高速冲刺 */
function updateLunge(fish: FishEnemy, cfg: any) {
    const dx = player.x - fish.x;
    const dy = player.y - fish.y;
    const dist = Math.hypot(dx, dy);

    // 离家太远：立刻放弃扑击，脱离仇恨回家
    const leash = (CONFIG.maze.denLeashDistance || 1400);
    const distFromDen = Math.hypot(fish.x - fish.denX, fish.y - fish.denY);
    if (distFromDen > leash) {
        startReturning(fish);
        return;
    }

    // 蓄力阶段：减速并对准玩家，眼睛发光（通过 lungeCharge < 1 判断）
    if (fish.lungeCharge < 1) {
        fish.lungeCharge += 1 / cfg.lungeChargeDuration;
        fish.targetAngle = Math.atan2(dy, dx);
        fish.angle = lerpAngle(fish.angle, fish.targetAngle, 0.15);
        fish.vx *= 0.7;
        fish.vy *= 0.7;
        return;
    }

    // 冲刺阶段：高速向玩家冲去（此阶段为弹反窗口）
    const speed = cfg.lungeSpeed;
    fish.vx = Math.cos(fish.angle) * speed;
    fish.vy = Math.sin(fish.angle) * speed;

    // 命中检测
    if (dist < cfg.biteRange) {
        fish.state = 'bite';
        fish.stateTimer = 0;
        fish.biteCount = 0;
        // 触发玩家被咬事件
        triggerPlayerBitten(fish);
        return;
    }

    // 冲刺超时未命中，切回徘徊
    if (fish.stateTimer >= cfg.lungeMaxDuration) {
        fish.state = 'circle';
        fish.stateTimer = 0;
    }
}

/** 撕咬：锁定玩家位置，播放撕咬动画 */
function updateBite(fish: FishEnemy, cfg: any) {
    // 锁定在玩家身上
    fish.x += (player.x - fish.x) * 0.3;
    fish.y += (player.y - fish.y) * 0.3;
    fish.vx = 0;
    fish.vy = 0;

    fish.biteCount++;

    // 撕咬完成后进入吞食
    if (fish.stateTimer >= cfg.biteDuration) {
        fish.state = 'devour';
        fish.stateTimer = 0;
    }
}

/** 吞食：停留片刻，触发玩家死亡 */
function updateDevour(fish: FishEnemy, cfg: any) {
    fish.vx *= 0.9;
    fish.vy *= 0.9;

    if (fish.stateTimer >= cfg.devourDuration) {
        // 触发玩家死亡
        triggerPlayerDeath(fish);
        fish.state = 'retreat';
        fish.stateTimer = 0;
    }
}

/** 慢慢撤退：吃完后缓慢游离 */
function updateRetreat(fish: FishEnemy, cfg: any) {
    // 向远离玩家的方向缓慢游动
    const dx = fish.x - player.x;
    const dy = fish.y - player.y;
    const angle = Math.atan2(dy, dx);
    fish.targetAngle = angle;
    fish.angle = lerpAngle(fish.angle, fish.targetAngle, cfg.turnSpeedRoam);

    fish.vx += Math.cos(fish.angle) * 0.05;
    fish.vy += Math.sin(fish.angle) * 0.05;
    fish.vx *= 0.95;
    fish.vy *= 0.95;

    if (fish.stateTimer >= cfg.retreatDuration) {
        fish.state = 'roam';
        fish.stateTimer = 0;
    }
}

/** 迅速撤退（被光驱赶后的持续逃跑，路径多样化） */
function updateFlee(fish: FishEnemy, cfg: any) {
    fish.fearTimer--;
    if (fish.fearTimer <= 0) {
        fish.state = 'roam';
        fish.stateTimer = 0;
        return;
    }

    // 持续检测手电筒，如果还在照射则重置计时并更新逃跑方向
    if (isFlashlightHittingFish(fish)) {
        fish.fearTimer = cfg.fearDuration;
        const dx = fish.x - player.x;
        const dy = fish.y - player.y;
        // 不沿径向逃跑，而是侧向偏转 60°~120°，随机左右
        const radialAngle = Math.atan2(dy, dx);
        const sideOffset = (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.4 + Math.random() * Math.PI * 0.3);
        fish.fearDir = radialAngle + sideOffset;
    }

    // 每隔一段时间随机微调方向，避免直线逃跑卡墙
    fish.hitFleeNextDirTimer--;
    if (fish.hitFleeNextDirTimer <= 0) {
        // 如果前方有墙，大角度转向
        if (hasWallAhead(fish, fish.fearDir, 60)) {
            fish.fearDir += (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.5 + Math.random() * Math.PI * 0.4);
        } else {
            fish.fearDir += (Math.random() - 0.5) * Math.PI * 0.5;
        }
        fish.hitFleeNextDirTimer = 15 + Math.floor(Math.random() * 20);
    }

    fish.targetAngle = fish.fearDir;
    fish.angle = lerpAngle(fish.angle, fish.targetAngle, cfg.turnSpeedFlee);
    fish.vx += Math.cos(fish.angle) * 0.8;
    fish.vy += Math.sin(fish.angle) * 0.8;
    const speed = Math.hypot(fish.vx, fish.vy);
    if (speed > cfg.fleeSpeed) {
        fish.vx = (fish.vx / speed) * cfg.fleeSpeed;
        fish.vy = (fish.vy / speed) * cfg.fleeSpeed;
    }
}

/** 被打中后逃跑（非冲刺阶段被打，灵敏逃跑，离远后回到常态） */
function updateHit(fish: FishEnemy, cfg: any) {
    fish.hitFleeTimer--;

    // 每隔一段时间随机改变逃跑方向（多段折线，不卡墙）
    fish.hitFleeNextDirTimer--;
    if (fish.hitFleeNextDirTimer <= 0) {
        // 如果前方有墙，大角度转向
        if (hasWallAhead(fish, fish.hitFleeDir, 60)) {
            fish.hitFleeDir += (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.5 + Math.random() * Math.PI * 0.4);
        } else {
            // 以当前逃跑方向为基础，随机偏转 ±70°
            fish.hitFleeDir += (Math.random() - 0.5) * Math.PI * 0.8;
        }
        fish.hitFleeNextDirTimer = 15 + Math.floor(Math.random() * 20);
    }

    fish.targetAngle = fish.hitFleeDir;
    fish.angle = lerpAngle(fish.angle, fish.targetAngle, 0.18);
    fish.vx += Math.cos(fish.angle) * 1.2;
    fish.vy += Math.sin(fish.angle) * 1.2;
    const speed = Math.hypot(fish.vx, fish.vy);
    if (speed > cfg.hitFleeSpeed) {
        fish.vx = (fish.vx / speed) * cfg.hitFleeSpeed;
        fish.vy = (fish.vy / speed) * cfg.hitFleeSpeed;
    }

    // 离玩家足够远后回到常态
    const distToPlayer = Math.hypot(player.x - fish.x, player.y - fish.y);
    if (distToPlayer >= cfg.hitFleeDistance || fish.hitFleeTimer <= 0) {
        fish.state = 'roam';
        fish.stateTimer = 0;
    }
}

// =============================================
// 辅助：启动“回家”状态（脱离仇恨，游回聚集点）
// =============================================
function startReturning(fish: FishEnemy) {
    fish.state = 'returning';
    fish.stateTimer = 0;
    // 把游弋目标先放在家方向的远点
    fish.roamTargetX = fish.denX;
    fish.roamTargetY = fish.denY;
    fish.roamTimer = 60;
    // 显示问号提示（灰白色，代表脱离仇恨）
    fish.alertIcon = '?';
    fish.alertIconColor = '#cccccc';
    fish.alertTimer = 35;
}

/** 脱离仇恨后：边漫游边缓慢回聚集点，回到附近后切为 roam */
function updateReturning(fish: FishEnemy, cfg: any) {
    const distFromDen = Math.hypot(fish.x - fish.denX, fish.y - fish.denY);

    // 回到聚集点附近，切回自由游弋
    if (distFromDen < fish.denRadius * 0.9) {
        fish.state = 'roam';
        fish.stateTimer = 0;
        fish.roamTimer = 0;
        return;
    }

    // 漫游式回家：整体方向指向家，但在路径上缓慢摆动
    fish.roamTimer--;
    if (fish.roamTimer <= 0) {
        const toHome = Math.atan2(fish.denY - fish.y, fish.denX - fish.x);
        const wobble = (Math.random() - 0.5) * Math.PI * 0.5;
        const step = 140 + Math.random() * 180;
        fish.roamTargetX = fish.x + Math.cos(toHome + wobble) * step;
        fish.roamTargetY = fish.y + Math.sin(toHome + wobble) * step;
        fish.roamTimer = 60 + Math.floor(Math.random() * 90);
    }

    // 以游弋速度移动（不要太快，看起来像在漫游而不是逃命）
    moveToward(fish, fish.roamTargetX, fish.roamTargetY, cfg.roamSpeed * 1.1, cfg.turnSpeedRoam);

    // 回家路上如果玩家又跟过来且离家很近，重新仇恨
    const distToPlayer = Math.hypot(player.x - fish.x, player.y - fish.y);
    if (distToPlayer < cfg.detectRange * 0.8 && distFromDen < fish.denRadius * 1.3) {
        fish.state = 'detect';
        fish.stateTimer = 0;
    }
}

// =============================================
// 辅助：启动被打逃跑状态（多处复用）
// =============================================
function startHitFlee(fish: FishEnemy, cfg: any) {
    const dx = fish.x - player.x;
    const dy = fish.y - player.y;
    const radialAngle = Math.atan2(dy, dx);
    // 侧向逃跑：垂直于玩家方向 ±90° 随机偏转
    const sideOffset = (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.5 + Math.random() * Math.PI * 0.4);
    fish.hitFleeDir = radialAngle + sideOffset;
    fish.hitFleeTimer = 120 + Math.floor(Math.random() * 60);
    fish.hitFleeNextDirTimer = 15;
    fish.state = 'hit';
    fish.stateTimer = 0;
    fish.vx = Math.cos(fish.hitFleeDir) * cfg.hitFleeSpeed;
    fish.vy = Math.sin(fish.hitFleeDir) * cfg.hitFleeSpeed;
    // 被打中：显示感叹号提示（橙色）
    fish.alertIcon = '!';
    fish.alertIconColor = '#ff8800';
    fish.alertTimer = 40;
}

/** 死亡动画：翻肚皮旋转 + 淡出 */
function updateDying(fish: FishEnemy, cfg: any) {
    fish.dyingTimer++;
    const rollDur = cfg.deathRollDuration;
    const fadeDur = cfg.deathFadeOutDuration;
    const totalDur = rollDur + fadeDur;

    if (fish.dyingTimer <= rollDur) {
        // 翻肚皮阶段：绕 Z 轴旋转 180°
        fish.dyingRoll = (fish.dyingTimer / rollDur) * Math.PI;
        fish.dyingAlpha = 1;
        // 缓慢漂移（翻肚皮时微微上浮）
        fish.vy -= 0.05;
        fish.vx *= 0.92;
        fish.vy *= 0.92;
        fish.x += fish.vx;
        fish.y += fish.vy;
    } else {
        // 淡出阶段
        const fadeProgress = (fish.dyingTimer - rollDur) / fadeDur;
        fish.dyingAlpha = Math.max(0, 1 - fadeProgress);
        fish.dyingRoll = Math.PI; // 保持翻转状态
        fish.vy -= 0.03;
        fish.vx *= 0.95;
        fish.vy *= 0.95;
        fish.x += fish.vx;
        fish.y += fish.vy;
    }

    if (fish.dyingTimer >= totalDur) {
        fish.dead = true;
    }
}

/** 怕光后退（短暂的惊吓反应，然后切换到 flee） */
function updateFear(fish: FishEnemy, cfg: any) {
    fish.fearTimer--;
    // 短暂停顿后切换到迅速撤退
    if (fish.stateTimer >= cfg.fearPauseDuration) {
        fish.state = 'flee';
        fish.stateTimer = 0;
        fish.fearTimer = cfg.fearDuration;
        return;
    }

    // 怕光停顿：身体颤抖（通过 animTime 加速实现）
    fish.animTime += 0.3;
    fish.vx *= 0.7;
    fish.vy *= 0.7;
    fish.targetAngle = fish.fearDir;
    fish.angle = lerpAngle(fish.angle, fish.targetAngle, 0.2);
}

// =============================================
// 辅助：向目标点移动
// =============================================
function moveToward(fish: FishEnemy, tx: number, ty: number, speed: number, turnFactor: number) {
    const dx = tx - fish.x;
    const dy = ty - fish.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    fish.targetAngle = Math.atan2(dy, dx);
    fish.angle = lerpAngle(fish.angle, fish.targetAngle, turnFactor);

    fish.vx += Math.cos(fish.angle) * speed * 0.1;
    fish.vy += Math.sin(fish.angle) * speed * 0.1;

    const currentSpeed = Math.hypot(fish.vx, fish.vy);
    if (currentSpeed > speed) {
        fish.vx = (fish.vx / currentSpeed) * speed;
        fish.vy = (fish.vy / currentSpeed) * speed;
    }
}

// =============================================
// 辅助：应用速度并做简单碰撞
// =============================================
function applyMovement(fish: FishEnemy) {
    const nextX = fish.x + fish.vx;
    const nextY = fish.y + fish.vy;

    if (!checkCollisionLocal(nextX, fish.y)) {
        fish.x = nextX;
    } else {
        fish.vx *= -0.5;
    }

    if (!checkCollisionLocal(fish.x, nextY)) {
        fish.y = nextY;
    } else {
        fish.vy *= -0.5;
    }

    // 防止游出地图边界（适配迷宫模式）
    if (isMazeMode()) {
        const maze = state.mazeRescue!;
        const maxX = maze.mazeCols * maze.mazeTileSize;
        const maxY = maze.mazeRows * maze.mazeTileSize;
        fish.x = Math.max(0, Math.min(maxX, fish.x));
        fish.y = Math.max(0, Math.min(maxY, fish.y));
    } else {
        fish.x = Math.max(0, Math.min(CONFIG.cols * CONFIG.tileSize, fish.x));
        fish.y = Math.max(60, Math.min(CONFIG.rows * CONFIG.tileSize, fish.y));
    }
}

// =============================================
// 触发玩家被咬事件（设置被咬状态）
// =============================================
function triggerPlayerBitten(fish: FishEnemy) {
    // 玩家已进入死亡过场（phase==='dead'），忽略后续咬击，防止多条鱼聚集时反复重置死亡倒计时
    if (state.fishBite && state.fishBite.active && state.fishBite.phase === 'dead') {
        return;
    }
    if (!state.fishBite) {
        state.fishBite = {
            active: true,
            phase: 'bite',     // 'bite' | 'devour' | 'dead'
            timer: 0,
            shakeIntensity: 0,
        };
    }
    state.fishBite.active = true;
    state.fishBite.phase = 'bite';
    state.fishBite.timer = 0;
    state.fishBite.shakeIntensity = 15;
}

// =============================================
// 触发玩家死亡（被吞食后）
// =============================================
function triggerPlayerDeath(fish: FishEnemy) {
    if (!state.fishBite) return;
    state.fishBite.phase = 'dead';
    state.fishBite.timer = 0;
}

// =============================================
// 更新玩家被咬状态（在主逻辑循环中调用）
// =============================================
export function updateFishBiteState() {
    if (!state.fishBite || !state.fishBite.active) return;

    const cfg = CFG();
    state.fishBite.timer++;

    // 屏幕震动衰减
    if (state.fishBite.shakeIntensity > 0) {
        state.fishBite.shakeIntensity *= 0.92;
        state.story.shake = state.fishBite.shakeIntensity;
    }

    if (state.fishBite.phase === 'bite') {
        // 撕咬阶段：震动 + 红屏
        state.story.redOverlay = Math.min(0.6, state.fishBite.timer / cfg.biteDuration * 0.6);
    } else if (state.fishBite.phase === 'dead') {
        // 死亡阶段：红屏加深，然后进入 lose 画面
        state.story.redOverlay = Math.min(1, 0.6 + state.fishBite.timer / cfg.deathFadeDuration * 0.4);
        if (state.fishBite.timer >= cfg.deathFadeDuration) {
            if (isMazeMode()) {
                // 迷宫模式：被鱼咬死视为氧气耗尽，强制上浮返回岸上
                state.fishBite.active = false;
                state.story.redOverlay = 0;
                state.story.shake = 0;
                const maze = state.mazeRescue!;
                maze.phase = 'surfacing';
                maze.surfacingReason = 'fishkill';
                maze.resultTimer = 0;
            } else {
                // 主线/竞技场：进入失败画面
                state.screen = 'lose';
                state.alertMsg = '被凶猛鱼撕碎了...';
                state.alertColor = '#f00';
                state.fishBite.active = false;
                state.story.redOverlay = 0;
                state.story.shake = 0;
            }
        }
    }
}

// =============================================
// 玩家攻击判定：挥氧气瓶
// =============================================
export function triggerPlayerAttack() {
    const cfg = CONFIG.attack;
    const atkCfg = CONFIG.fishEnemy;

    if (!state.playerAttack) {
        state.playerAttack = { active: false, timer: 0, cooldownTimer: 0, angle: 0 };
    }

    // 冷却中不能攻击
    if (state.playerAttack.cooldownTimer > 0) return;

    // 激活攻击
    state.playerAttack.active = true;
    state.playerAttack.timer = 0;
    state.playerAttack.cooldownTimer = cfg.cooldown;
    state.playerAttack.angle = player.angle;

    if (!state.fishEnemies) return;

    const halfAngle = (cfg.angle / 2) * (Math.PI / 180);

    for (const fish of state.fishEnemies) {
        if (fish.dead || fish.state === 'dying') continue;

        const dx = fish.x - player.x;
        const dy = fish.y - player.y;
        const dist = Math.hypot(dx, dy);

        // 距离判定
        if (dist > cfg.range) continue;

        // 方向判定：鱼在攻击扇形内
        const angleToFish = Math.atan2(dy, dx);
        let angleDiff = angleToFish - player.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        if (Math.abs(angleDiff) > halfAngle) continue;

        // 任何状态被打到都会死（鱼很灵敏，常态下根本进不了身，一旦被打到就是真实命中）
        fish.state = 'dying';
        fish.stateTimer = 0;
        fish.dyingTimer = 0;
        fish.dyingAlpha = 1;
        fish.dyingRoll = 0;
        fish.vx *= 0.3;
        fish.vy *= 0.3;

        // 击中反馈：屏幕震动
        state.story.shake = Math.max(state.story.shake || 0, CONFIG.attack.slashImpactShake);
    }
}
// =============================================
// 更新玩家攻击状态（在主逻辑循环中调用）
// =============================================
export function updatePlayerAttack() {
    if (!state.playerAttack) return;

    // 冷却计时
    if (state.playerAttack.cooldownTimer > 0) {
        state.playerAttack.cooldownTimer--;
    }

    // 攻击动画计时（挥动 + 停留消散两个阶段）
    if (state.playerAttack.active) {
        state.playerAttack.timer++;
        const totalDur = CONFIG.attack.slashSwingDuration + CONFIG.attack.slashLingerDuration;
        if (state.playerAttack.timer >= totalDur) {
            state.playerAttack.active = false;
        }
    }
}

// =============================================
// 批量更新所有凶猛鱼
// =============================================
export function updateAllFishEnemies(dt: number) {
    // 无论是否有鱼，都要更新被咬状态（确保死亡过场动画能完成）
    updateFishBiteState();
    // 更新玩家攻击状态
    updatePlayerAttack();

    if (!state.fishEnemies || state.fishEnemies.length === 0) return;

    for (let i = state.fishEnemies.length - 1; i >= 0; i--) {
        const fish = state.fishEnemies[i];
        updateFishEnemy(fish, dt);
        if (fish.dead) {
            state.fishEnemies.splice(i, 1);
        }
    }
}
