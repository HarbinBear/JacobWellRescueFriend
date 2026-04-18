import { CONFIG } from '../core/config';
import { state, player, input, resetState } from '../core/state';
import { generateArenaMap } from '../world/map';
import { updateParticles, updateSplashes } from './Particle';
import { updateAllFishEnemies, createFishEnemy, findSafeSpawnPosition } from './FishEnemy';
import { processManualDrive } from './ManualDrive';
import { checkCollision } from './Collision';
import { triggerSilt } from './Particle';
import { updateCameraSpringArm, snapCameraToPlayer, getAdaptiveZoom } from './CameraLogic';

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

    // 相机归位到竞技场出生点
    snapCameraToPlayer();

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

        // 相机弹簧臂跟随 + 水中摇曳 + 自适应缩放
        updateCameraSpringArm();
        const azZoom = getAdaptiveZoom();
        state.camera.targetZoom = azZoom;
        state.camera.zoom += (state.camera.targetZoom - state.camera.zoom) * 0.02;

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
    // 被凶猛鱼咬住或死亡过场期间冻结玩家（动不了，正在被撕咬）
    if (state.fishBite && state.fishBite.active) {
        input.move = 0;
        input.speedUp = false;
        player.vx = 0;
        player.vy = 0;
        if (state.manualDrive) state.manualDrive.activeTouches = {};
        return;
    }
    if (processManualDrive()) {
        // 手动挡模式：脉冲已处理
    } else {
        // 自动挡（摇杆）模式
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
    }

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
