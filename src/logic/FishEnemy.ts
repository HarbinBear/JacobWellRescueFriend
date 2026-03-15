import { CONFIG } from '../core/config';
import { state, player } from '../core/state';

// =============================================
// 内联碰撞检测（避免与 Logic.ts 循环导入）
// =============================================
function checkCollisionLocal(x: number, y: number): boolean {
    const { tileSize } = CONFIG;
    const r = Math.floor(y / tileSize);
    const c = Math.floor(x / tileSize);
    for (let ry = r - 1; ry <= r + 1; ry++) {
        for (let rc = c - 1; rc <= c + 1; rc++) {
            if (!state.map[ry]) continue;
            const cell = state.map[ry][rc];
            if (!cell) continue;
            if (typeof cell === 'object') {
                if (Math.hypot(x - cell.x, y - cell.y) < cell.r + 10) return true;
            } else if (cell === 2) {
                const cx = rc * tileSize + tileSize / 2;
                const cy = ry * tileSize + tileSize / 2;
                if (Math.abs(x - cx) < tileSize / 2 + 10 && Math.abs(y - cy) < tileSize / 2 + 10) return true;
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
    | 'lunge'       // 扑向目标
    | 'bite'        // 撕咬
    | 'devour'      // 吞食
    | 'retreat'     // 慢慢撤退
    | 'flee'        // 迅速撤退（被光驱赶）
    | 'fear';       // 怕光后退（过渡状态）

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
    // 死亡/移除标记
    dead: boolean;
}

// =============================================
// 凶猛鱼配置常量（从 CONFIG 读取）
// =============================================
const CFG = () => CONFIG.fishEnemy;

// =============================================
// 工厂函数：创建一条凶猛鱼
// =============================================
export function createFishEnemy(x: number, y: number): FishEnemy {
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
        dead: false,
    };
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
// 检测玩家手电筒是否照到凶猛鱼（考虑亮度）
// =============================================
function isFlashlightHittingFish(fish: FishEnemy): boolean {
    const cfg = CFG();
    // 手电筒在深水才开启
    if (player.y <= 600) return false;

    // 第三关手电筒固定灭时无效
    if (state.story.flags.flashlightFixedOff) return false;

    // 计算鱼与玩家的距离
    const dx = fish.x - player.x;
    const dy = fish.y - player.y;
    const dist = Math.hypot(dx, dy);

    // 超出手电筒射程
    if (dist > CONFIG.lightRange) return false;

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
            return;
        }
    }

    switch (fish.state) {
        case 'roam':    updateRoam(fish, cfg);    break;
        case 'detect':  updateDetect(fish, cfg);  break;
        case 'stalk':   updateStalk(fish, cfg);   break;
        case 'circle':  updateCircle(fish, cfg);  break;
        case 'lunge':   updateLunge(fish, cfg);   break;
        case 'bite':    updateBite(fish, cfg);    break;
        case 'devour':  updateDevour(fish, cfg);  break;
        case 'retreat': updateRetreat(fish, cfg); break;
        case 'flee':    updateFlee(fish, cfg);    break;
        case 'fear':    updateFear(fish, cfg);    break;
    }

    // 应用速度并做碰撞检测
    applyMovement(fish);
}

// =============================================
// 各状态更新函数
// =============================================

/** 自由游弋：随机选取目标点缓慢游动 */
function updateRoam(fish: FishEnemy, cfg: any) {
    fish.roamTimer--;
    if (fish.roamTimer <= 0) {
        // 随机选取附近一个游弋目标
        const angle = Math.random() * Math.PI * 2;
        const dist = 100 + Math.random() * 200;
        fish.roamTargetX = fish.x + Math.cos(angle) * dist;
        fish.roamTargetY = fish.y + Math.sin(angle) * dist;
        fish.roamTimer = 120 + Math.random() * 180;
    }

    // 向目标缓慢游动
    moveToward(fish, fish.roamTargetX, fish.roamTargetY, cfg.roamSpeed, cfg.turnSpeedRoam);

    // 检测玩家是否进入感知范围
    const distToPlayer = Math.hypot(player.x - fish.x, player.y - fish.y);
    if (distToPlayer < cfg.detectRange) {
        fish.state = 'detect';
        fish.stateTimer = 0;
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
    }
}

/** 悄悄靠近：缓慢向玩家移动，保持一定距离 */
function updateStalk(fish: FishEnemy, cfg: any) {
    const dx = player.x - fish.x;
    const dy = player.y - fish.y;
    const dist = Math.hypot(dx, dy);

    // 玩家跑远了，重新进入游弋
    if (dist > cfg.detectRange * 1.5) {
        fish.state = 'roam';
        fish.stateTimer = 0;
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

    // 玩家跑远了
    if (dist > cfg.detectRange * 1.5) {
        fish.state = 'roam';
        fish.stateTimer = 0;
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
    }
}

/** 扑向目标：先蓄力，再高速冲刺 */
function updateLunge(fish: FishEnemy, cfg: any) {
    const dx = player.x - fish.x;
    const dy = player.y - fish.y;
    const dist = Math.hypot(dx, dy);

    // 蓄力阶段：减速并对准玩家
    if (fish.lungeCharge < 1) {
        fish.lungeCharge += 1 / cfg.lungeChargeDuration;
        fish.targetAngle = Math.atan2(dy, dx);
        fish.angle = lerpAngle(fish.angle, fish.targetAngle, 0.15);
        fish.vx *= 0.7;
        fish.vy *= 0.7;
        return;
    }

    // 冲刺阶段：高速向玩家冲去
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

/** 迅速撤退（被光驱赶后的持续逃跑） */
function updateFlee(fish: FishEnemy, cfg: any) {
    fish.fearTimer--;
    if (fish.fearTimer <= 0) {
        fish.state = 'roam';
        fish.stateTimer = 0;
        return;
    }

    // 持续检测手电筒，如果还在照射则重置计时
    if (isFlashlightHittingFish(fish)) {
        fish.fearTimer = cfg.fearDuration;
        const dx = fish.x - player.x;
        const dy = fish.y - player.y;
        fish.fearDir = Math.atan2(dy, dx);
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

    // 防止游出地图边界
    fish.x = Math.max(0, Math.min(CONFIG.cols * CONFIG.tileSize, fish.x));
    fish.y = Math.max(60, Math.min(CONFIG.rows * CONFIG.tileSize, fish.y));
}

// =============================================
// 触发玩家被咬事件（设置被咬状态）
// =============================================
function triggerPlayerBitten(fish: FishEnemy) {
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
            // 进入失败画面
            state.screen = 'lose';
            state.alertMsg = '被凶猛鱼撕碎了...';
            state.alertColor = '#f00';
            state.fishBite.active = false;
            state.story.redOverlay = 0;
            state.story.shake = 0;
        }
    }
}

// =============================================
// 批量更新所有凶猛鱼
// =============================================
export function updateAllFishEnemies(dt: number) {
    // 无论是否有鱼，都要更新被咬状态（确保死亡过场动画能完成）
    updateFishBiteState();

    if (!state.fishEnemies || state.fishEnemies.length === 0) return;

    for (let i = state.fishEnemies.length - 1; i >= 0; i--) {
        const fish = state.fishEnemies[i];
        updateFishEnemy(fish, dt);
        if (fish.dead) {
            state.fishEnemies.splice(i, 1);
        }
    }
}
