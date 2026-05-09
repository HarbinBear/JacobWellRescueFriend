import { CONFIG } from '../core/config';
import { state, player, particles, input } from '../core/state';
import { generateMazeMap } from '../world/map';
import { getMazeMainThemeConfig, getMazeSceneThemeKeyByIndex } from '../world/mazeScene';
import { StoryManager } from '../story/StoryManager';
import { triggerSilt, updateParticles, updateSplashes } from './Particle';
import { updateBreathSystem, resetBreathSystem, consumeBreathO2, resetBreathO2Consumer, computeBuoyancyOffset } from './BreathSystem';
import { updateRopeSystem } from './Rope';
import { processManualDrive, updateAutoDriveVisual } from './ManualDrive';
import { checkMazeCollision } from './Collision';
import { updateCameraSpringArm, snapCameraToPlayer, getAdaptiveZoom } from './CameraLogic';
import { updateMarkers, updateWheelButtonVisibility } from './Marker';
import { createFishEnemy, findMazeFishSpawnPosition, updateAllFishEnemies, generateFishDens } from './FishEnemy';
import { buildOxygenTanksForMaze, updateOxygenTanks, createOxygenFeedback, triggerO2LossFlash } from './OxygenTank';
import { buildRelicsForMaze, updateRelicDiscovery, resetRelicDiscoveryForDive, getThisDiveNewRelicIds, getThisDiveNewCodexCount } from './Relic';
import { updateLifeDetector, resetLifeDetector } from './LifeDetector';
import { playSFX } from '../audio/AudioManager';
import { triggerCollisionImpact, resetCollisionImpact } from './CollisionImpact';
import { loadMazeProgress, saveMazeProgress, clearMazeSave } from './MazeSave';
import { setActiveSeededRandom, clearActiveSeededRandom } from '../core/SeededRandom';
// 撤离玩法钩子：每次下潜开始/结束自动应用装备效果与结算战利品
import { onExtractionDiveStart, onExtractionDiveEnd } from '../extraction';

// 迷宫模式使用独立的 StoryManager 实例
const storyManager = new StoryManager();

// =============================================
// 救援概念包装：从 seed 派生 6 位案件编号
// 形如 'JWR-128473'：J=Jacob's Well（雅各布井）R=Rescue；数字是 seed 的低 24 位
// 取模 1e6 再左侧补零至 6 位，保证同 seed 下编号完全确定
// =============================================
function padLeft(s: string, width: number, ch: string): string {
    let out = s;
    while (out.length < width) out = ch + out;
    return out;
}

function buildCaseNumberFromSeed(seed: number): string {
    const n = padLeft(((seed >>> 0) % 1000000).toString(), 6, '0');
    return 'JWR-' + n;
}

// =============================================
// 迷宫多次下潜闭环：初始化
// 默认行为：优先尝试读取本地存档；读档成功则直接恢复到岸上阶段，不生成新地图。
// 读档失败（无存档/版本不兼容/数据损坏）才走原来的流程生成新地图。
// =============================================
export function resetMazeLogic() {
    // === 优先尝试读取本地存档 ===
    // 注意：loadMazeProgress 成功时会直接把 state.mazeRescue / state.rope.ropes / state.markers
    // 恢复到岸上阶段；这里只需要补上相机、屏幕模式等与 state.mazeRescue 无关的运行态。
    if (loadMazeProgress() && state.mazeRescue) {
        // 运行态杂项清理（这些字段不在存档里，或者每次进场都应该重置）
        player.silt = 0;
        player.vx = 0;
        player.vy = 0;
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

        // NPC 岸上阶段不激活，但预设好位置（读档时 mazeRescue 里有 npcInitX/Y）
        state.npc.active = false;
        state.npc.x = state.mazeRescue.npcInitX;
        state.npc.y = state.mazeRescue.npcInitY;
        state.npc.vx = 0;
        state.npc.vy = 0;
        state.npc.angle = -Math.PI / 2;
        state.npc.state = 'wait';
        state.npc.distressActive = false;
        state.npc.distressTimer = 0;
        state.npc.distressArmPhase = 0;
        state.npc.distressBubbles = [];
        state.npc.distressHalos = [];
        state.npc.distressHaloTimer = 0;

        // 相机初始化（存档不保存相机运行态，直接归位到出口）
        state.camera = {
            zoom: 1, targetZoom: 1,
            x: state.mazeRescue.exitX, y: state.mazeRescue.exitY,
            targetX: state.mazeRescue.exitX, targetY: state.mazeRescue.exitY,
            vx: 0, vy: 0,
            swayX: 0, swayY: 0, swayTime: 0,
        };

        // 读档后重建食人鱼聚集点 + 骷髅（P4：fishDens 不进存档，由派生 seed 确定性重建）
        // 必须在 state.mazeRescue 挂好之后调用，因为 generateFishDens 会读 mazeWalls / mazeMap / mazeRows / mazeCols
        if (state.mazeRescue.seed != null) {
            const fishDensSeed = ((state.mazeRescue.seed >>> 0) ^ 0xDEADBEEF) >>> 0;
            setActiveSeededRandom(fishDensSeed);
            try {
                state.mazeRescue.fishDens = generateFishDens();
            } finally {
                clearActiveSeededRandom();
            }

            // 氧气瓶：fishDens 出来之后再重建（氧气瓶依赖聚落位置）
            // 消耗过的瓶子由 consumedTankIds 控制（已从存档进入 mazeRescue）
            state.mazeRescue.oxygenTanks = buildOxygenTanksForMaze(
                state.mazeRescue.seed,
                state.mazeRescue.consumedTankIds || []
            );
            if (!Array.isArray(state.mazeRescue.consumedTankIds)) state.mazeRescue.consumedTankIds = [];
            state.mazeRescue.oxygenFeedback = createOxygenFeedback();

            // 图鉴物件：从主 seed 派生 ^0x5EED1CE0 确定性重建
            // discoveredRelicIds / codexKinds 从存档读取（若老存档缺失字段则兼底空数组）
            (state.mazeRescue as any).relics = buildRelicsForMaze(state.mazeRescue.seed);
            if (!Array.isArray((state.mazeRescue as any).discoveredRelicIds)) {
                (state.mazeRescue as any).discoveredRelicIds = [];
            }
            if (!Array.isArray((state.mazeRescue as any).codexKinds)) {
                (state.mazeRescue as any).codexKinds = [];
            }
            (state.mazeRescue as any).codexSelectedKind = null;
        }
        // 救援概念包装：老存档缺失字段时兜底（seed 已经有了，caseNumber 随 seed 固定）
        const mr: any = state.mazeRescue as any;
        if (!mr.caseNumber) mr.caseNumber = buildCaseNumberFromSeed(mr.seed || 0);
        if (typeof mr.briefingShown !== 'boolean') mr.briefingShown = false;
        // 放弃长按运行态每次进场都重置
        mr.abandonHolding = false;
        mr.abandonHoldStart = 0;
        mr.abandonTouchId = null;
        if (typeof mr.caseResultTimer !== 'number') mr.caseResultTimer = 0;
        // 入场动效时间戳兜底：读档后把"如果当前 phase 是对应全屏页"的 enterTime 设成 now，
        // 避免玩家读档时遇到一张没有 enterTime 的页导致动效直接跑到终态而跳过
        const nowMs = Date.now();
        if (!mr.briefingShown && (typeof mr.briefingEnterTime !== 'number' || mr.briefingEnterTime <= 0)) {
            mr.briefingEnterTime = nowMs;
        }
        if (typeof mr.resolvedEnterTime !== 'number') mr.resolvedEnterTime = 0;
        if (typeof mr.abandonedEnterTime !== 'number') mr.abandonedEnterTime = 0;
        // phase 在读档时被强制为 'shore'；但如果老档存了 resolved / abandoned / resolved_idle
        // 这些非游戏中的状态，读档也会被 MazeSave.loadMazeProgress 覆写成 'shore'，所以这里不需特判

        // 切换到迷宫模式
        state.screen = 'mazeRescue';
        return;
    }

    // === 没有存档：走原来的逻辑生成一张新地图 ===
    // 重置基础状态（不调用 resetState，避免污染主线地图）
    player.o2 = 100;
    player.silt = 0;
    player.vx = 0;
    player.vy = 0;
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
    state.camera = {
        zoom: 1, targetZoom: 1,
        x: player.x, y: player.y,
        targetX: player.x, targetY: player.y,
        vx: 0, vy: 0,
        swayX: 0, swayY: 0, swayTime: 0,
    };

    // 初始化空的已探索快照
    const emptyExplored: boolean[][] = [];
    for (let r = 0; r < mazeData.mazeRows; r++) {
        emptyExplored[r] = [];
        for (let c = 0; c < mazeData.mazeCols; c++) {
            emptyExplored[r][c] = false;
        }
    }

    // 保留"总图鉴"跨关累计：换新地图时 relics/discoveredRelicIds 清空，但 codexKinds 保留
    // （codexKinds 记录玩家历史上累计见过的 kind 集合，是跨关的"成就进度"）
    const preservedCodexKinds: string[] = Array.isArray((state.mazeRescue as any)?.codexKinds)
        ? (state.mazeRescue as any).codexKinds.slice()
        : [];

    // 初始化迷宫专属状态 —— 直接进入岸上阶段
    state.mazeRescue = {
        phase: 'shore',
        diveType: 'scout',
        resultTimer: 0,
        surfacingReason: '',
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
        shoreMapDiveIndex: -1,
        shoreMapAnimTimer: 0,
        shoreScrollY: 0,
        divingInTimer: 0,
        divingInBubbles: [],
        _hudEntryTimer: 0,
        _hudDetailOpen: 0,
        _hudDetailHolding: false,
        _retreatDetailOpen: 0,
        _retreatDetailHolding: false,
        _shoreRecordOpen: false,
        _shoreRecordAnim: 0,
        codexOpen: false,
        _driveToggleOpen: 0,
        _driveToggleHolding: false,
        _driveSwitchTip: 0,
        // 救援概念包装：案件编号从 seed 派生（取低 24 位再补 6 位十进制，纯叙事用）
        caseNumber: buildCaseNumberFromSeed(mazeData.seed),
        briefingShown: false,          // 新地图首次进岸上时会弹警情通报
        briefingEnterTime: Date.now(), // 新地图生成瞬间就写入，警情通报入场动效会从此开始
        resolvedEnterTime: 0,
        abandonedEnterTime: 0,
        abandonHolding: false,
        abandonHoldStart: 0,
        abandonTouchId: null,
        caseResultTimer: 0,
        seed: mazeData.seed,
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
        // 食人鱼聚集点占位，先放空数组，下面 generateFishDens 需要 state.mazeRescue 已存在才能读取地图数据
        fishDens: [],
        // 氧气瓶系统占位：后面紧跟着用派生 seed 完整生成
        oxygenTanks: [],
        consumedTankIds: [],
        oxygenFeedback: null,
        // 图鉴物件占位：后面紧跟着用派生 seed 生成
        relics: [],
        discoveredRelicIds: [],
        codexKinds: [],             // 总图鉴（跨关累积）：新地图则不清，由读档分支恢复
        codexSelectedKind: null,    // 图鉴详情卡选中的 kind
    };

    // 生成食人鱼聚集点（需要 state.mazeRescue 已挂载；跨下潜保留，换地图时重建）
    // P4 种子化：用一个从主 seed 派生的子种子激活 PRNG，保证同 seed 下聚集点/骷髅完全一致
    // 派生方式选用按位异或常量，避免与主地图生成使用相同序列，不污染主地图的确定性
    const fishDensSeed = (mazeData.seed ^ 0xDEADBEEF) >>> 0;
    setActiveSeededRandom(fishDensSeed);
    try {
        state.mazeRescue.fishDens = generateFishDens();
    } finally {
        clearActiveSeededRandom();
    }

    // 氧气瓶：新地图新 seed，consumedTankIds 清空，全量生成
    state.mazeRescue.consumedTankIds = [];
    state.mazeRescue.oxygenTanks = buildOxygenTanksForMaze(mazeData.seed, []);
    state.mazeRescue.oxygenFeedback = createOxygenFeedback();

    // 图鉴物件：新地图新 seed，discoveredRelicIds 清空，按主 seed 派生生成
    // codexKinds 是"总图鉴"跨关累计，使用前面保存的 preservedCodexKinds 恢复
    (state.mazeRescue as any).relics = buildRelicsForMaze(mazeData.seed);
    (state.mazeRescue as any).discoveredRelicIds = [];
    (state.mazeRescue as any).codexKinds = preservedCodexKinds;
    (state.mazeRescue as any).codexSelectedKind = null;

    // 初始化 NPC（被救者，岸上阶段不激活）
    state.npc.active = false;
    state.npc.x = mazeData.npcInitX;
    state.npc.y = mazeData.npcInitY;
    state.npc.vx = 0;
    state.npc.vy = 0;
    state.npc.angle = -Math.PI / 2;
    state.npc.state = 'wait';
    // 重置呼救表现运行态
    state.npc.distressActive = false;
    state.npc.distressTimer = 0;
    state.npc.distressArmPhase = 0;
    state.npc.distressBubbles = [];
    state.npc.distressHalos = [];
    state.npc.distressHaloTimer = 0;

    // 玩家放在出口位置（岸上阶段不显示，但预设好）
    player.x = mazeData.exitX;
    // 使用边缘厚度计算安全出生Y（在洞口内侧）
    const wallThick = CONFIG.maze.wallThickness || 5;
    player.y = (wallThick + 1) * mazeData.mazeTileSize + mazeData.mazeTileSize / 2;
    player.angle = Math.PI / 2;
    player.targetAngle = Math.PI / 2;
    input.targetAngle = Math.PI / 2;

    // 相机归位到迷宫出生点
    snapCameraToPlayer();

    // 切换到迷宫模式
    state.screen = 'mazeRescue';

    // 新地图刚生成，立即保存一次初始存档，防止进游戏没开过下潜就退出的情况下档丢失
    saveMazeProgress();
}

// =============================================
// 迷宫多次下潜闭环：从岸上开始下潜
// =============================================
export function startMazeDive(diveType: string) {
    const maze = state.mazeRescue;
    if (!maze) return;

    // 入水气泡音效：入水动作本身，声音应盖在 diving_in 动画（约 1.5 秒）上
    playSFX('diveSplash');

    // 重置呼吸系统运行态（清除残留气泡与音频状态）
    resetBreathSystem();
    resetBreathO2Consumer();

    // 重置生命探知仪运行态（每次新下潜重新开始）
    resetLifeDetector();

    // 重置撞击反馈冷却（避免跨场景冷却误挡第一次撞击）
    resetCollisionImpact();

    // 重置本次下潜的图鉴新发现列表（discoveredRelicIds 是跨下潜累计的，这里不动）
    resetRelicDiscoveryForDive();

    // 设置下潜类型（不区分scout/rescue，统一为scout，发现NPC后自动可绑绳）
    maze.diveType = diveType;
    maze.phase = 'diving_in';
    maze.divingInTimer = 0;
    maze._hudEntryTimer = 0;

    // 初始化入水气泡转场：完全照搬剧情模式 state.transition 的气泡公式
    // 剧情模式做法：200 个气泡随机撒在全屏，速度方向为"从屏幕中心指向自己位置"
    // 这样气泡整体呈持续向外飘散的背景流动感，超出屏幕后回绕
    {
        const cw = CONFIG.screenWidth;
        const ch = CONFIG.screenHeight;
        const cx = cw / 2;
        const cy = ch / 2;
        const bubbles: any[] = [];
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * cw;
            const y = Math.random() * ch;
            const size = 10 + Math.random() * 50;
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.hypot(dx, dy) || 1;
            const speed = 5 + Math.random() * 10;
            const vx = (dx / dist) * speed + (Math.random() - 0.5) * 5;
            const vy = (dy / dist) * speed + (Math.random() - 0.5) * 5;
            bubbles.push({
                x, y, size, vx, vy,
                baseSize: size,
                wobble: Math.random() * Math.PI * 2,
            });
        }
        maze.divingInBubbles = bubbles;
    }
    maze.surfacingReason = '';
    maze.startTime = Date.now();
    maze.finishTime = 0;
    maze.resultTimer = 0;

    // 重置玩家状态
    player.o2 = 100;
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

    // 生成迷宫食人鱼（按聚集点分布，每个聚集点 denFishCountMin~denFishCountMax 条）
    state.fishEnemies = [];
    if (CONFIG.maze.fishEnabled && maze.fishDens && maze.fishDens.length > 0) {
        const perMin = (CONFIG.maze as any).denFishCountMin || 2;
        const perMax = (CONFIG.maze as any).denFishCountMax || 6;
        for (const den of maze.fishDens) {
            const fishCount = perMin + Math.floor(Math.random() * (perMax - perMin + 1));
            for (let i = 0; i < fishCount; i++) {
                const pos = findMazeFishSpawnPosition(den.x, den.y, den.radius);
                state.fishEnemies.push(createFishEnemy(pos.x, pos.y, den.x, den.y, den.radius));
            }
        }
    } else if (CONFIG.maze.fishEnabled) {
        // 兜底：如果没有聚集点，退回旧的随机分布（保持兼容）
        const count = CONFIG.maze.fishCountMin + Math.floor(Math.random() * (CONFIG.maze.fishCountMax - CONFIG.maze.fishCountMin + 1));
        for (let i = 0; i < count; i++) {
            const pos = findMazeFishSpawnPosition();
            state.fishEnemies.push(createFishEnemy(pos.x, pos.y));
        }
    }

    // 相机归位到下潜出生点
    snapCameraToPlayer();

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
    // 重置呼救表现运行态（跨下潜清理）
    state.npc.distressActive = false;
    state.npc.distressTimer = 0;
    state.npc.distressArmPhase = 0;
    state.npc.distressBubbles = [];
    state.npc.distressHalos = [];
    state.npc.distressHaloTimer = 0;

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

    // 标记系统保留已有标记（跨下潜持久化）
    // 轮盘状态重置
    if (state.wheel) {
        state.wheel.open = false;
        state.wheel.btnVisible = false;
        state.wheel.btnActive = false;
        state.wheel.sectors = [];
        state.wheel.highlightIndex = -1;
        state.wheel.expandProgress = 0;
        state.wheel.touchId = null;
        state.wheel.stillTimer = 0;
        state.wheel.nearbyInfo = null;
        state.wheel.previewAction = null;
    }

    // 撤离玩法钩子：应用装备效果（背包大小、消耗品起始 O2/电池等）+ 清空本次拾取记录
    onExtractionDiveStart();
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

    // === 深拷贝本次下潜结束时的地图相关快照，供岸上按次回放"手绘地图" ===
    // 1. 玩家轨迹（路径点结构简单，直接逐点拷贝）
    const pathSnap: {x: number, y: number}[] = [];
    if (maze.playerPath) {
        for (let i = 0; i < maze.playerPath.length; i++) {
            const p = maze.playerPath[i];
            pathSnap.push({ x: p.x, y: p.y });
        }
    }
    // 2. 本次结束时的累积已探索矩阵（布尔二维数组，深拷贝）
    const exploredSnap: boolean[][] = [];
    for (let r = 0; r < maze.mazeRows; r++) {
        const row: boolean[] = [];
        const src = maze.mazeExplored[r];
        for (let c = 0; c < maze.mazeCols; c++) {
            row.push(!!(src && src[c]));
        }
        exploredSnap.push(row);
    }
    // 3. 本次开始前的已探索快照（用于区分"本次新探索"高亮色）
    const exploredBeforeSnap: boolean[][] = [];
    for (let r = 0; r < maze.mazeRows; r++) {
        const row: boolean[] = [];
        const src = maze.thisExploredBefore ? maze.thisExploredBefore[r] : null;
        for (let c = 0; c < maze.mazeCols; c++) {
            row.push(!!(src && src[c]));
        }
        exploredBeforeSnap.push(row);
    }
    // 4. 绳索路径深拷贝（后续下潜还会加绳，要把"本次结束当下的样子"冻结下来）
    const ropesSnap: {path: {x: number, y: number}[]}[] = [];
    if (state.rope && state.rope.ropes) {
        for (const rope of state.rope.ropes) {
            if (!rope.path) continue;
            const pathCopy: {x: number, y: number}[] = [];
            for (let i = 0; i < rope.path.length; i++) {
                const pt = rope.path[i];
                pathCopy.push({ x: pt.x, y: pt.y });
            }
            ropesSnap.push({ path: pathCopy });
        }
    }

    // 记录下潜历史（带快照）
    maze.diveHistory.push({
        diveType: maze.diveType,
        duration: duration,
        maxDepth: Math.floor(maze.thisMaxDepth / maze.mazeTileSize),
        newExploredCount: newExploredCount,
        ropePlaced: ropePlaced,
        returnReason: returnReason,
        newThemes: maze.thisNewThemes ? maze.thisNewThemes.slice() : [],
        playerPath: pathSnap,
        exploredSnapshot: exploredSnap,
        exploredBeforeSnapshot: exploredBeforeSnap,
        ropesSnapshot: ropesSnap,
        npcFoundAtEnd: !!maze.npcFound,
        finishAt: Date.now(),
        // 本次下潜新发现的图鉴物件 id 列表（用于 debrief 页展示"本次新发现"）
        newRelicIds: getThisDiveNewRelicIds(),
        // 本次下潜新增总图鉴 kind 数（首次见过的种类数），用于结算页金色高亮"本次新增图鉴 X 种"
        newCodexKindCount: getThisDiveNewCodexCount(),
    } as any);

    // 只保留最近 5 次下潜记录，超过的把最老的挤掉（FIFO）
    const MAX_DIVE_HISTORY = 5;
    while (maze.diveHistory.length > MAX_DIVE_HISTORY) {
        maze.diveHistory.shift();
    }

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

    // 撤离玩法钩子：根据 returnReason 结算背包（成功 100%/半成功 50%/失败全损）+ 还原装备覆盖 + 落盘
    onExtractionDiveEnd(returnReason);

    // 一次下潜结束、本次成果已记录到 diveHistory，此时的 state 已经属于"回到岸上之后的进度"
    // 直接落盘，防止玩家在 debrief 页退出游戏导致本次记录丢失
    saveMazeProgress();
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

    // 强制清理呼吸系统：岸上不该有气泡，也不该继续播放呼吸音
    resetBreathSystem();
    resetBreathO2Consumer();

    // 回到岸上时再保存一次：虽然 finishMazeDive 已经落过盘，但从 debrief 切回 shore 时
    // phase 字段发生变化，再存一次更稳妥。
    saveMazeProgress();
}

// =============================================
// 迷宫多次下潜闭环：重玩（清档 + 生成新地图，重新开始）
// 触发入口：救援成功结算页的"下一局"按钮
// =============================================
export function replayMazeLogic() {
    // 先清掉旧存档，后续 resetMazeLogic 读档会读不到，自然进入新地图生成分支
    clearMazeSave();
    resetMazeLogic();
}

// =============================================
// 救援概念包装：标记警情通报页已展示
// 入口：玩家点击警情通报页的"接受任务"按钮
// =============================================
export function markBriefingShown() {
    const maze = state.mazeRescue;
    if (!maze) return;
    (maze as any).briefingShown = true;
    saveMazeProgress();
}

// =============================================
// 救援概念包装：放弃救援 → 进入"搜寻终止"结案页（全屏）
// 入口：岸上长按"放弃救援"按钮完成后触发
// 动作：切 phase 到 'abandoned'，重置计时器；重置本次放弃长按运行态
//       diveHistory 保留，作为结案页的"行动记录"展示
// 注意：此时不清存档，保证玩家从 abandoned 页退出小游戏再回来还能看到这张失败档案；
//       玩家点"接受新任务"时，由 acceptNewCase() 真正清档 + 生成新地图
// =============================================
export function abandonCase() {
    const maze: any = state.mazeRescue;
    if (!maze) return;
    maze.phase = 'abandoned';
    maze.caseResultTimer = 0;
    maze.abandonedEnterTime = Date.now();
    maze.abandonHolding = false;
    maze.abandonHoldStart = 0;
    maze.abandonTouchId = null;
    saveMazeProgress();
}

// =============================================
// 救援概念包装：接受新任务 → 清档 + 生成全新案件
// 入口：resolved / abandoned 结案页的"接受新任务"按钮
// 等价于 replayMazeLogic，但语义上是叙事动作而非重玩按钮
// =============================================
export function acceptNewCase() {
    clearMazeSave();
    resetMazeLogic();
}

// =============================================
// 救援概念包装：留在此处（成功结案后）→ 切 phase 到 resolved_idle
// 入口：resolved 结案页的"留在此处"按钮
// 等价于岸上阶段，但水面入口置灰、不可再下潜；仍可查看下潜记录
// =============================================
export function stayInResolvedCase() {
    const maze: any = state.mazeRescue;
    if (!maze) return;
    maze.phase = 'resolved_idle';
    maze.resultTimer = 0;
    maze.caseResultTimer = 0;
    state.npc.active = false;
    resetBreathSystem();
    resetBreathO2Consumer();
    saveMazeProgress();
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

    // === 结案后"留在此处"状态：等同岸上，不需要游戏逻辑 ===
    if (maze.phase === 'resolved_idle') {
        return;
    }

    // === 救援成功结案页 / 搜寻终止结案页：只推进叙事计时器 ===
    if (maze.phase === 'resolved' || maze.phase === 'abandoned') {
        if (typeof (maze as any).caseResultTimer !== 'number') (maze as any).caseResultTimer = 0;
        (maze as any).caseResultTimer++;
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

    // === 上浮动画阶段（0.5秒蓄力→弹射→破水）===
    // 节奏（30帧）：
    //   帧 0   → 设置 surfacingReason 时已播音效 + 初始震屏
    //   帧 0..8  蓄力阶段（~0.15s）：玩家速度归零原地压缩，轻微下沉一点做"蹲下预备"
    //   帧 8..22 爆发阶段（~0.23s）：vy 给一个很大负值，easeOut 快速衰减；屏幕持续震动
    //   帧 22..30 破水阶段（~0.13s）：水花爆裂全屏特效（由渲染层读 resultTimer 绘制）
    if (maze.phase === 'surfacing') {
        maze.resultTimer++;
        const t = maze.resultTimer;

        if (!player.animTime) player.animTime = 0;

        if (t <= 8) {
            // 蓄力：原地压缩，微微下沉
            player.vx *= 0.6;
            player.vy = 0.4; // 轻微下坠做"蹲"
            player.x += player.vx;
            player.y += player.vy;
            // 轻微预震
            state.story.shake = Math.max(state.story.shake || 0, 3);
            player.animTime += 0.05;
        } else if (t <= 22) {
            // 爆发：一拍之内给一个大的向上初速度，然后快速自然衰减
            if (t === 9) {
                // 弹射启动瞬间：初速度 + 强烈震屏
                player.vy = -60;
                player.vx *= 0.3;
                state.story.shake = 18;
            } else {
                // easeOut 衰减（保持方向向上，数值逐步减小）
                player.vy *= 0.82;
                player.vx *= 0.9;
                // 震屏线性回落
                state.story.shake = Math.max(0, (state.story.shake || 0) - 1.3);
            }
            player.x += player.vx;
            player.y += player.vy;
            player.animTime += 0.25;
        } else {
            // 破水出面：玩家已"出水"，速度快速归零，屏幕转场由渲染层绘制
            player.vx *= 0.7;
            player.vy *= 0.6;
            player.x += player.vx;
            player.y += player.vy;
            if (t === 23) {
                // 破水瞬间再震一下
                state.story.shake = Math.max(state.story.shake || 0, 10);
            } else {
                state.story.shake = Math.max(0, (state.story.shake || 0) - 1.8);
            }
            player.animTime += 0.15;
        }

        // 上浮完成后进入结算
        if (maze.resultTimer >= CONFIG.maze.surfacingDuration) {
            state.story.shake = 0;
            finishMazeDive(maze.surfacingReason || 'retreat');
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
        // 手动挡：清空脉冲队列，防止松手后突然冲出
        if (state.manualDrive) state.manualDrive.activeTouches = {};
    }

    // 撤离长按时也冻结玩家
    if (maze.retreatHolding) {
        input.move = 0;
        input.speedUp = false;
        player.vx = 0;
        player.vy = 0;
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

    // --- 玩家移动 ---
    if (processManualDrive()) {
        // 手动挡模式：脉冲已处理
    } else {
        // 自动挡（摇杆）模式
        player.targetAngle = input.targetAngle;
        let angleDiff = player.targetAngle - player.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        player.angle += angleDiff * CONFIG.turnSpeed;

        let speed = (CONFIG.maze.moveSpeed || CONFIG.moveSpeed) * 0.3;
        if (input.speedUp) speed = CONFIG.maze.moveSpeed || CONFIG.moveSpeed;

        if (input.move > 0) {
            player.vx += Math.cos(player.targetAngle) * speed * CONFIG.acceleration;
            player.vy += Math.sin(player.targetAngle) * speed * CONFIG.acceleration;
        }
        player.vx *= CONFIG.waterDrag;
        player.vy *= CONFIG.waterDrag;

        // 自动档动作视觉：写入转向/前进信号，让 drawDiver 能呈现转向身体侧倾与手臂动作
        updateAutoDriveVisual(angleDiff * CONFIG.turnSpeed, input.move > 0);
    }

    // 呼吸浮力：吐气阶段轻微下沉、吸气阶段轻微上浮，给玩家直观的呼吸押频感
    player.vy += computeBuoyancyOffset();

    // 碰撞检测（使用迷宫专属地图）
    const nextX = player.x + player.vx;
    const nextY = player.y + player.vy;    // 记录撞前速度，用于撞击强度判定（必须在 vx/vy 反弹衰减前采样）
    const preVx = player.vx;
    const preVy = player.vy;
    let hitX = false;
    let hitY = false;
    if (!checkMazeCollision(nextX, player.y, maze)) player.x = nextX;
    else { player.vx *= -0.5; triggerSilt(player.x, player.y, 10); hitX = true; }
    if (!checkMazeCollision(player.x, nextY, maze)) player.y = nextY;
    else { player.vy *= -0.5; triggerSilt(player.x, player.y, 10); hitY = true; }

    // 撞击反馈（音效 + 气泡 + 氧气损失 + 氧气环红条）：只要任一轴命中即触发
    if (hitX || hitY) {
        triggerCollisionImpact(preVx, preVy, player.x, player.y);
    }

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

    // --- 相机弹簧臂跟随 + 水中摇曳 + 自适应缩放 ---
    updateCameraSpringArm();
    // 迷宫模式zoom：自适应缩放直接驱动
    const azZoom = getAdaptiveZoom();
    state.camera.targetZoom = azZoom;
    state.camera.zoom += (state.camera.targetZoom - state.camera.zoom) * 0.02;

    // --- 绳索系统 ---
    updateRopeSystem();

    // --- 标记系统 ---
    updateMarkers();
    updateWheelButtonVisibility();

    // --- 氧气瓶系统（进度/飞瓶/气泡爆发/屏幕辉光动画） ---
    updateOxygenTanks();

    // --- 生命探知仪（未发现NPC时以节拍提示距离）---
    updateLifeDetector();

    // --- 图鉴物件发现判定（手电照到 + 靠近即记入图鉴） ---
    updateRelicDiscovery();

    // --- 轮盘展开动画 ---
    if (state.wheel && state.wheel.open) {
        if (state.wheel.expandProgress < 1) {
            state.wheel.expandProgress = Math.min(1, state.wheel.expandProgress + 1 / (CONFIG.marker.wheelExpandDuration / 1000 * 60));
        }
    }

    // --- NPC 更新 ---
    if (state.npc.active) {
        if (maze.npcRescued) {
            // ===== 救援中：柔性跟随 + 绳索最大距离约束（D方案） =====
            const dx = player.x - state.npc.x;
            const dy = player.y - state.npc.y;
            const dist = Math.hypot(dx, dy);
            const ideal = CONFIG.maze.npcTetherIdealDist;
            const maxD = CONFIG.maze.npcTetherMaxDist;
            const vMin = CONFIG.maze.npcFollowSpeedMin;
            const vMax = CONFIG.maze.npcFollowSpeedMax;

            if (dist > ideal * 0.6) {
                // 距离越远追得越快：在 ideal ~ maxD 间用平滑系数映射到 vMin ~ vMax
                const tRaw = (dist - ideal) / Math.max(1, (maxD - ideal));
                const tClamp = Math.max(0, Math.min(1, tRaw));
                // smoothstep
                const tSmooth = tClamp * tClamp * (3 - 2 * tClamp);
                const npcSpeed = vMin + (vMax - vMin) * tSmooth;
                state.npc.vx = (dx / dist) * npcSpeed;
                state.npc.vy = (dy / dist) * npcSpeed;
                state.npc.x += state.npc.vx;
                state.npc.y += state.npc.vy;
            } else {
                // 近距离轻微漂浮，避免贴脸抖动
                state.npc.vx *= 0.85;
                state.npc.vy *= 0.85;
                state.npc.x += state.npc.vx;
                state.npc.y += state.npc.vy;
            }

            // 距离超过最大值 → 玩家被绳索拖慢（回拉玩家位置）
            if (dist > maxD) {
                const over = dist - maxD;
                const pull = CONFIG.maze.npcTetherPullFactor;
                // 将玩家朝 NPC 方向拉回 over*pull 像素
                const pullLen = over * pull;
                player.x -= (dx / dist) * pullLen;
                player.y -= (dy / dist) * pullLen;
                // 同时轻微衰减玩家速度的远离分量，表现为"绳索崩紧"
                const vDot = player.vx * (dx / dist) + player.vy * (dy / dist);
                if (vDot > 0) {
                    // vDot>0 表示玩家正远离 NPC
                    const damp = 1 - pull * 0.8;
                    player.vx -= (dx / dist) * vDot * (1 - damp);
                    player.vy -= (dy / dist) * vDot * (1 - damp);
                }
            }

            if (Math.abs(state.npc.vx) > 0.1 || Math.abs(state.npc.vy) > 0.1) {
                state.npc.angle = Math.atan2(state.npc.vy, state.npc.vx);
            }
        } else {
            // ===== 未被救：静止漂动 + 朝向玩家 + 呼救表现 =====
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
            const distToPlayer = Math.hypot(dx, dy);
            const targetAngle = Math.atan2(dy, dx);
            let diff = targetAngle - state.npc.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            state.npc.angle += diff * 0.05;

            // --- 呼救表现：玩家进入感知半径才激活 ---
            const distressRange = CONFIG.maze.npcRescueRange * CONFIG.maze.npcDistressActivateRatio;
            const nowActive = distToPlayer < distressRange;
            state.npc.distressActive = nowActive;

            if (nowActive) {
                const dt = 1 / 60; // 按主循环 60fps 估算
                state.npc.distressTimer += dt;
                // 挥手相位持续推进（sin 用于驱动手臂摆动）
                state.npc.distressArmPhase = (state.npc.distressArmPhase + dt * 3.5) % (Math.PI * 2);

                // 生成呼救气泡（头顶冒出，向上漂）
                if (Math.random() < CONFIG.maze.npcDistressBubbleRate) {
                    const offAng = state.npc.angle - Math.PI / 2 + (Math.random() - 0.5) * 0.6;
                    const r = 10 + Math.random() * 4;
                    state.npc.distressBubbles.push({
                        x: state.npc.x + Math.cos(offAng) * r,
                        y: state.npc.y + Math.sin(offAng) * r,
                        vx: (Math.random() - 0.5) * 0.4,
                        vy: -0.6 - Math.random() * 0.5,
                        life: 1,
                        size: 1.5 + Math.random() * 2,
                    });
                }

                // 生成呼救闪光圈（周期性，用于远距离方向提示）
                state.npc.distressHaloTimer -= dt;
                if (state.npc.distressHaloTimer <= 0) {
                    state.npc.distressHalos.push({ t: 0 });
                    state.npc.distressHaloTimer = CONFIG.maze.npcDistressHaloInterval;
                }
            } else {
                // 离开感知半径：停止产生新呼救，已有粒子继续消散
                state.npc.distressTimer = 0;
            }

            // 更新呼救气泡
            for (let i = state.npc.distressBubbles.length - 1; i >= 0; i--) {
                const b = state.npc.distressBubbles[i];
                b.x += b.vx;
                b.y += b.vy;
                b.vx *= 0.97;
                b.life -= 0.015;
                if (b.life <= 0) state.npc.distressBubbles.splice(i, 1);
            }
            // 更新呼救闪光圈
            for (let i = state.npc.distressHalos.length - 1; i >= 0; i--) {
                const h = state.npc.distressHalos[i];
                h.t += 1 / 60 / CONFIG.maze.npcDistressHaloInterval;
                if (h.t >= 1) state.npc.distressHalos.splice(i, 1);
            }
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
            maze.surfacingReason = 'retreat';
            maze.resultTimer = 0;
            // 弹射出水：音效和初始预震一开始就拉起，萤幕竟为蓄力营造节奏
            playSFX('quickReturn', { volume: 0.5 });
            state.story.shake = Math.max(state.story.shake || 0, 4);
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

    // --- 氧气消耗（阶梯式：只在吐气瞬间扣一大口；未激活时走 o2IdleDrain 兜底） ---
    // 阶梯扣氧后，用 triggerO2LossFlash 让氧气环红条闪一下，直观展示“这一口扣了多少”
    const o2Consumption = consumeBreathO2();
    if (o2Consumption > 0 && player.o2 > 0 && !CONFIG.infiniteO2) {
        const fromO2 = player.o2;
        const toO2 = Math.max(0, fromO2 - o2Consumption);
        player.o2 = toO2;
        // 只有“一口”的扣减才触发视觉红条（兜底小恒量不触发，否则红条一直亮）
        // 用脉冲计数比较：看本帧扣的量是否超过兜底基础扣减量（静止一口至少 0.6%，远大于 o2IdleDrain 0.005）
        if (o2Consumption > 0.1) {
            triggerO2LossFlash(fromO2, toO2);
        }
    } else if (o2Consumption > 0 && !CONFIG.infiniteO2) {
        // 氧气已经 0 的兜底
        player.o2 = Math.max(0, player.o2 - o2Consumption);
    }

    // 无限氧气开关
    if (CONFIG.infiniteO2) player.o2 = 100;

    // 氧气耗尽 = 被迫返回岸上（保留成果）
    if (player.o2 <= 0) {
        player.o2 = 0;
        storyManager.showText('氧气不足，紧急上浮...', '#f80', 2500);
        maze.phase = 'surfacing';
        maze.surfacingReason = 'o2';
        maze.resultTimer = 0;
        // 弹射出水音效 + 预震
        playSFX('quickReturn');
        state.story.shake = Math.max(state.story.shake || 0, 4);
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

    // --- 呼吸系统：气泡 + 音效，根据运动量调节节奏 ---
    updateBreathSystem();

    // --- 更新凶猛鱼 ---
    updateAllFishEnemies(1);

    // --- 检测被咬死亡（凶猛鱼咬住后强制上浮） ---
    if (state.fishBite && state.fishBite.active && state.fishBite.phase === 'dead') {
        // updateFishBiteState 内部会处理迷宫模式的死亡逻辑（设置 surfacing）
    }
}
