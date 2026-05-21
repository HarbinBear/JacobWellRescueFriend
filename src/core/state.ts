import { CONFIG } from './config';
export const state = {
    screen: 'menu', // menu, progressSelect, mazeRescue, home_evening, dream（旧 play/win/lose/ending/fishArena 已废弃；fishArena 仍可由 GM 强制进入）
    // 主菜单"开始新游戏"确认框开关（运行时，不进存档）
    _menuConfirmNewGame: false,
    // 剧情进度页：当前是否为沙盒重玩模式（运行时）
    _isProgressSandbox: false,
    map: [],
    walls: [], // 存储墙壁的渲染圆心
    invisibleWalls: [], // 仅对玩家生效的空气墙
    plants: [], // 存储水草
    fishes: [], // 存储鱼群
    splashes: [], // 水花粒子
    explored: [], // 记录已探索区域
    zones: [], // 地图区域信息 {name, yMin, yMax, xMin, xMax}
    msgTimer: null,
    alertMsg: '',
    alertColor: '#fff',
    texts: [],
    // 全局视觉特效通道（曾经挂在 state.story 下，现独立出来供迷宫/竞技场/食人鱼等共用）
    fx: {
        shake: 0,         // 全局屏震强度（自然衰减；由各系统按需写入）
        redOverlay: 0,    // 全局红屏遮罩透明度（自然衰减）
    },
    // 新主线（《唐老师的救援》）的剧情进度状态。旧的 state.story 已废弃。
    // 详见 .codebuddy/rules/design/tang/改造方案.md
    story2: {
        nightIndex: 0,                              // 0=新游戏未开始，1+=已经历晚序号
        flags: {} as { [key: string]: boolean },    // 剧情 flag
        knownNights: [] as string[],                // 已经历过的对话 sceneId 列表
        girlVisitCount: 0,                          // 累计她来过几晚
        girlMissedCount: 0,                         // 决裂后她没来的晚数
        dayHadAnyDive: false,                       // 当日是否下过水（控制"回家"按钮启用）
    },
    // 家场景运行态（screen='home_evening' 时使用）；运行时构造，存档不持久化
    home: null as null | {
        phase: 'arriving' | 'waiting_knock' | 'dialogue' | 'free' | 'sleeping';
        timeInPhase: number;             // 帧
        sceneId: string;                 // 当夜对话脚本 id
        girlWillCome: boolean;
        dialogue: {
            nodeIndex: number;            // 当前节点索引
            textProgress: number;         // 当前节点文字打字机进度（字符数）
            autoAdvanceTimer: number;     // 自动推进剩余帧
            waitingForTap: boolean;       // 是否在等点击下一句
            ended: boolean;               // 全部节点跑完
        };
        actors: {
            man:  { x: number; y: number; targetX: number; targetY: number; pose: string };
            girl: { x: number; y: number; targetX: number; targetY: number; visible: boolean; pose: string };
        };
        hotspotsClicked: string[];        // 本晚已点过哪些屋内热点
        sleepBtnVisible: boolean;         // free 阶段是否展示"睡觉"按钮
        knockPlayed: boolean;             // arriving→waiting_knock 时敲门音是否已播
        fadeAlpha: number;                // 黑场遮罩 0~1
        fadeMode: 'none' | 'in' | 'out';  // none=无；in=由黑入景；out=入睡到黑
        // 横屏背景图横向平移相关：
        //   cameraX: 当前镜头横向位置，单位为"屋内逻辑坐标"（与男主/女孩 x 同坐标系）。
        //   cameraTargetX: 目标位置，每帧朝它插值靠拢。
        //   cameraInited: 是否已根据 phase 设置过初始位置（避免每次进 phase 都重置）。
        cameraX: number;
        cameraTargetX: number;
        cameraInited: boolean;
    },
    endingTimer: 0, // 结局动画计时器
    currentZone: null, // 当前所在区域
    npc: {
        active: false,
        x: 0, y: 0,
        vx: 0, vy: 0,
        angle: 0,
        state: 'follow', // follow, wait, enter_tunnel, dead
        targetX: 0, targetY: 0,
        pathIndex: 0,
        offsetTimer: 0, // 随机偏移计时器
        offsetX: -40,   // 随机偏移X
        offsetY: -40    // 随机偏移Y
        ,
        // === 呼救表现运行态（仅迷宫模式未被救时使用） ===
        distressActive: false,      // 是否处于呼救激活范围内
        distressTimer: 0,           // 呼救时间累积（秒）
        distressArmPhase: 0,        // 挥手动作相位（0~1，基于 sin 周期）
        distressBubbles: [] as {    // 呼救气泡粒子
            x: number; y: number;
            vx: number; vy: number;
            life: number;           // 剩余寿命（0~1）
            size: number;
        }[],
        distressHalos: [] as {      // 呼救闪光圈（方向指示）
            t: number;              // 生命周期 0~1
        }[],
        distressHaloTimer: 0,       // 下一个闪光圈生成倒计时（秒）
    },
    camera: {
        zoom: 1,
        targetZoom: 1,
        // 弹簧臂相机位置
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        vx: 0,
        vy: 0,
        // 水中摇曳偏移
        swayX: 0,
        swayY: 0,
        swayTime: 0,
    },
    transition: {
        active: false,
        alpha: 0,
        mode: 'none', // 'in' (fade in from black), 'out' (fade out to black)
        timer: 0,
        callback: null,
        bubbles: [] // 转场气泡状态
    },
    antiStuck: {
        timer: 0,
        lastPos: {x:0, y:0}
    },
    landmarks: {
        suit: {x:0, y:0},
        tunnelEntry: {x:0, y:0},
        tunnelEnd: {x:0, y:0},
        tunnelPath: [],
        junction: {x:0, y:0},
        deadEndDeep: {x:0, y:0},
        entrance: {x:0, y:0},
        // 第一二洞室连接处（row20, col63）
        chamber12Junction: {x: CONFIG.chamber12JunctionX, y: CONFIG.chamber12JunctionY},
        // 二三洞室连接处（大缝隙）
        chamber23Junction: {x: CONFIG.chamber23JunctionX, y: CONFIG.chamber23JunctionY}
    },
    flashlightOn: true, // 手电筒开关（玩家手动控制）
    fishEnemies: [],  // 凶猛鱼敌人列表
    fishBite: null,    // 玩家被咬状态 { active, phase, timer, shakeIntensity }
    // 玩家攻击状态
    playerAttack: null as null | {
        active: boolean;        // 是否正在攻击
        timer: number;          // 攻击动画计时
        cooldownTimer: number;  // 冷却计时（>0 表示冷却中）
        angle: number;          // 攻击方向（玩家朝向）
    },
    // 手动挡（搓屏移动）运行态
    manualDrive: {
        // 当前正在进行的滑动触点（最多支持2个），实时更新位置
        activeTouches: {} as Record<number, {
            startX: number; startY: number;  // 触点起始位置
            prevX: number; prevY: number;    // 上一帧位置（用于计算输入速度）
            currX: number; currY: number;    // 当前位置
            strokeSide: number;              // 本次输入分配到的腿侧：左(-1)/右(1)
            consumedDistance: number;        // 当前这次输入已消费的有效行程（像素）
            finished: boolean;               // 单次输入的有效行程是否已完成，松手前不再继续驱动
        }>,
        nextStrokeSide: -1,                 // 下一次新输入应分配到哪条腿（左右轮流）
        // 调试辅助线用：上一次输入方向
        lastInputAngle: 0,
        // 调试辅助线用：本帧是否有输入
        hasInput: false,
        // 角色表现运行态：左右脚前进踢水进度/强度
        leftKickProgress: 0,
        rightKickProgress: 0,
        leftKickStrength: 0,
        rightKickStrength: 0,
        // 角色表现运行态：左右侧拐弯修正进度/强度
        leftTurnProgress: 0,
        rightTurnProgress: 0,
        leftTurnStrength: 0,
        rightTurnStrength: 0,
        // 角色表现运行态：整体前进/转向可视化混合量
        forwardVisual: 0,
        turnVisual: 0,
        // 鞭腿加速 boost：累积输入带来的加速度（0~1），仅在加速瘦间增强腿部鞘打强度与频率
        // （腿部动画主驱动源是 player 速度，由渲染侧直接读 vx/vy 计算）
        kickDrive: 0,
    },    // 食人鱼纯享版竞技场状态
    fishArena: null as null | {
        round: number;          // 当前轮次（从1开始）
        fishAlive: number;      // 本轮存活鱼数
        fishTotal: number;      // 本轮总鱼数
        totalKills: number;     // 累计击杀数
        phase: string;          // 'prep'（准备阶段）| 'fight'（战斗阶段）| 'clear'（清图庆祝）| 'dead'（死亡结算）
        prepTimer: number;      // 准备倒计时（秒，浮点）
        clearTimer: number;     // 清图庆祝计时（帧）
        deadTimer: number;      // 死亡结算计时（帧）
        startTime: number;      // 本局开始时间戳（ms）
        surviveTime: number;    // 存活时间（秒）
        achievementText: string; // 当前成就文字
        achievementTimer: number; // 成就文字显示计时（帧）
        comboKills: number;     // 连杀计数
        comboTimer: number;     // 连杀计时（帧，归零则重置连杀）
    },
    // 迷宫纯享版模式状态（多次下潜闭环）
    mazeRescue: null as null | {
        // === 阶段控制 ===
        phase: string;          // 'shore'（岸上）| 'play'（水下游戏中）| 'surfacing'（成功撤离上浮中）| 'failed'（撤离失败转场）| 'debrief'（返岸结算）| 'rescued'（救援成功）
        diveType: string;       // 'scout'（侦察）| 'rescue'（正式救援）
        resultTimer: number;    // 结算页计时（帧）
        surfacingReason: string; // 上浮原因：'retreat'（主动撤离）| 'o2'（氧气耗尽）| 'rescued'（救援成功）
        startTime: number;      // 本次下潜开始时间戳（ms）
        finishTime: number;     // 完成时间戳（ms，0表示未完成）

        // === NPC 救援交互 ===
        npcRescued: boolean;    // NPC是否已被绑绳（跟随中）
        npcRescueHolding: boolean;  // 是否正在长按救援
        npcRescueHoldStart: number; // 长按开始时间戳
        npcRescueTouchId: number | null; // 救援长按触点ID

        // === 探路撤离协议 ===
        retreatHolding: boolean;    // 是否正在长按撤离
        retreatHoldStart: number;   // 撤离长按开始时间戳
        retreatTouchId: number | null; // 撤离长按触点ID

        // === UI 状态 ===
        minimapExpanded: boolean;   // 小地图是否展开
        shoreMapOpen: boolean;      // 岸上全屏地图是否打开（当值为true时配合shoreMapDiveIndex决定看哪一次）
        shoreMapDiveIndex: number;  // 岸上正在回放的下潜索引（-1=未打开，>=0=diveHistory下标）
        shoreMapAnimTimer: number;  // 岸上回放地图的轨迹动画计时（帧，每次打开重置）
        shoreScrollY: number;       // 岸上页面滚动偏移
        divingInTimer: number;      // 入水动效计时（帧）
        divingInBubbles: any[];     // 入水气泡转场列表（每次 startMazeDive 重建）
        _hudEntryTimer: number;     // HUD入场动效计时（帧）
        _hudDetailOpen: number;     // HUD详情展开进度（0~1，0=收起，1=展开）
        _hudDetailHolding: boolean; // HUD详情是否正在按住
        _retreatDetailOpen: number; // 撤离按钮详情展开进度（0~1）
        _retreatDetailHolding: boolean; // 撤离按钮详情是否正在按住（非长按撤离）
        _shoreRecordOpen: boolean;  // 岸上探索记录是否展开
        _shoreRecordAnim: number;   // 岸上探索记录展开动画进度（0~1）
        codexOpen: boolean;         // 岸上图鉴全屏页是否打开（不跨 session 持久化，但和其它 shore UI 字段一起随 rest 自动保留；不影响结构重建）
        _driveToggleOpen: number;   // 手动/自动挡详情展开进度（0~1）
        _driveToggleHolding: boolean; // 手动/自动挡详情是否正在按住
        _driveSwitchTip: number;    // 手动/自动挡切换tip倒计时（帧）

        // === 救援概念包装（警情通报 / 放弃救援 / 救援结案） ===
        // 案件编号：由 seed 派生出来的 6 位伪随机数，只做叙事展示用
        // 坐标 / 接警时间等其它叙事字段都在渲染层从 seed + 常量派生，不再单独存状态
        caseNumber: string;          // 形如 'JWR-128473'（J=Jacob's Well R=Rescue）
        briefingShown: boolean;      // 本张地图的警情通报页是否已展示过（首次进入显示，之后不再弹）
        // 三个全屏页的"进入时间戳"，用于驱动各自的入场动效（相对时钟）
        // 约定：页切换时写 Date.now()；渲染层取 (Date.now() - enterTime)/1000 当相对 t 使用
        // 不进存档（运行时即可，退出小游戏后重开自然从 0 开始动效）
        briefingEnterTime: number;
        resolvedEnterTime: number;
        abandonedEnterTime: number;
        // 岸上"放弃救援"长按运行态（不跨 session，每次进岸上都会重置）
        abandonHolding: boolean;     // 是否正在长按放弃
        abandonHoldStart: number;    // 放弃长按开始时间戳（ms）
        abandonTouchId: number | null; // 放弃长按触点ID
        // 结案页计时器：phase === 'resolved' 或 'abandoned' 时推进，用于渐显动画
        // 注：phase 取值扩展为 'shore' | 'play' | 'surfacing' | 'failed' | 'diving_in' | 'debrief'
        //     | 'rescued'（救援成功瞬间，旧状态保留兼容）
        //     | 'resolved'（全屏"成功营救"结案页；玩家在此页选择下一关或留在本关）
        //     | 'abandoned'（全屏"搜寻终止"结案页；玩家点击后进入下一关）
        //     | 'resolved_idle'（留在本关的状态；岸上复用 shore 画面，但水面入口置灰、不可再下潜）
        // caseResultTimer 独立于 resultTimer，避免和下潜结算的 resultTimer 相互干扰
        caseResultTimer: number;

        // === 迷宫种子（P4 地形序列化） ===
        // uint32 范围的种子，用于通过确定性 PRNG 完全重建 mazeMap / mazeWalls / 场景数据
        // 生成地图时记录，存档读档时恢复
        seed: number;

        // === 迷宫专属地图数据（跨下潜保留） ===
        mazeMap: any[][];
        mazeWalls: any[];
        mazeExplored: boolean[][];  // 已探索区域（跨下潜累积）
        mazeCols: number;
        mazeRows: number;
        mazeTileSize: number;
        // 出口位置（顶部）
        exitX: number;
        exitY: number;
        // NPC初始位置（底部深处）
        npcInitX: number;
        npcInitY: number;

        // === 跨下潜持久化数据 ===
        diveCount: number;          // 已完成下潜次数
        npcFound: boolean;          // 是否已发现NPC位置
        maxDepthReached: number;    // 历史最深到达（像素y坐标）
        totalRopePlaced: number;    // 累计铺设绳索段数
        // 每次下潜的摘要记录（只保留最近 5 次，超过自动挤掉最老的）
        diveHistory: {
            diveType: string;
            duration: number;       // 用时（秒）
            maxDepth: number;       // 本次最深
            newExploredCount: number; // 本次新探索格子数
            ropePlaced: number;     // 本次铺绳数
            returnReason: string;   // 'retreat'（主动撤离）| 'o2'（氧气耗尽）| 'rescued'（救援成功）
            newThemes?: string[];   // 本次新发现的区域主题
            // === 地图快照（用于岸上按次回放"手绘地图"） ===
            playerPath?: {x: number, y: number}[]; // 本次轨迹完整拷贝
            exploredSnapshot?: boolean[][];  // 本次下潜结束时的累积已探索（深拷贝）
            exploredBeforeSnapshot?: boolean[][]; // 本次下潜开始时的已探索快照（用于判定本次新探索高亮）
            ropesSnapshot?: {path: {x: number, y: number}[]}[]; // 本次下潜结束时全部绳索路径（深拷贝）
            npcFoundAtEnd?: boolean; // 这次结束时是否已发现NPC
            finishAt?: number;       // 结束时间戳（用于列表排序）
        }[];

        // === 场景辨识度：区域主题与局部构造 ===
        sceneThemeKeys: string[];       // 本局迷宫启用的主岩性键名列表
        sceneThemeMap: number[][];      // 与迷宫网格对齐的主题索引图（0~N）
        sceneBlendMap: {theme2: number, blend: number}[][]; // 渐变过渡混合权重
        sceneStructureMap: string[][];  // 与迷宫网格对齐的局部构造图
        discoveredThemes: string[];     // 跨下潜已发现的主题键名列表
        thisNewThemes: string[];        // 本次下潜新发现的主题键名列表
        currentThemeKey: string;        // 当前所在区域的主题键名

        // === 食人鱼聚集点（每局迷宫2~3个，跨下潜保留，鱼下潜时按聚集点生成） ===
        fishDens: {
            x: number;                  // 聚集点中心X
            y: number;                  // 聚集点中心Y
            radius: number;             // 聚集点活动半径
            skulls: {                   // 聚集点附近的骷髅装饰（贴在岩石上，纯视觉）
                x: number;              // 骷髅绘制位置X（岩石外缘）
                y: number;              // 骷髅绘制位置Y
                angle: number;          // 骷髅朝向角度（从岩石中心往外的法线角度）
                size: number;           // 骷髅尺寸
                seed: number;           // 伪随机种子（用于造型微变化）
            }[];
        }[];

        // === 氧气瓶（由主 seed 派生子 seed 确定性生成，贴在岩石表面） ===
        // oxygenTanks：当前活跃（未消耗）与已消耗混合的完整列表；consumed 字段标记单瓶
        // consumedTankIds：已消耗瓶的 id 列表，进存档；换 seed 时清空
        // oxygenFeedback：拾取视觉反馈运行态（飞瓶、气泡爆发、屏幕辉光、跳字），不进存档
        oxygenTanks: any[];
        consumedTankIds: number[];
        oxygenFeedback: any;

        // === 场景图鉴物件（由派生 seed 确定性生成，跨下潜保留） ===
        // relics：本地图所有物件（运行时，不进存档；靠 seed 重建）
        // discoveredRelicIds：已发现本关物件 ID 列表（本关作用域，换关清空）
        // codexKinds：总图鉴 kind 集合（跨关累计，进存档）；32 种中哪些已被玩家发现
        // codexSelectedKind：当前图鉴详情卡选中的 kind；null=未选中；不跨 session 持久化
        relics: any[];
        discoveredRelicIds: number[];
        codexKinds: string[];
        codexSelectedKind: string | null;

        // === 本次下潜运行态数据 ===
        playerPath: {x: number, y: number}[]; // 记录玩家移动轨迹
        thisExploredBefore: boolean[][]; // 本次下潜开始时的已探索快照（用于计算增量）
        thisRopeCountBefore: number;    // 本次下潜开始时的绳索数量
        thisMaxDepth: number;           // 本次下潜最深到达
    },
    // 标记系统
    markers: [] as any[],
    // 轮盘交互状态
    wheel: {
        btnVisible: false,       // 交互按钮是否可见（靠近可交互对象即显示）
        btnActive: false,        // 交互按钮是否可点击（额外要求：无移动输入；否则为灰态不可交互）
        open: false,             // 轮盘是否打开
        sectors: [] as any[],    // 当前扇区列表
        highlightIndex: -1,      // 当前高亮扇区索引（-1=无）
        expandProgress: 0,       // 展开动画进度（0~1）
        touchId: null as number | null, // 轮盘触点ID
        centerX: 0,              // 轮盘中心屏幕X
        centerY: 0,              // 轮盘中心屏幕Y
        stillTimer: 0,           // 静止计时器
        nearbyInfo: null as any, // 当前附近可交互对象信息
        previewAction: null as string | null, // 当前预览的操作类型（用于场景中预览标记）
    },
    rope: {
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
    },
    // 全局音频状态（持久态，跨模式保留）
    // muted=true 时仅把音量淡到 0，不真正暂停音频，保留时间轴
    audio: {
        muted: false,         // 是否静音（true=关闭声音，false=开启声音）
        animPhase: 0,         // 按钮循环音波动画相位（弧度）
        iconProgress: 1,      // 按钮图标切换进度：0=静音视觉，1=开启视觉
    }
};

export const player = {
    x: 0, y: 0,
    angle: Math.PI/2,
    targetAngle: Math.PI/2,
    vx: 0, vy: 0,
    o2: 100,
    /**
     * 氧气最大值（动态）。
     *
     * 主线/竞技场默认 100；撤离玩法在 applyLoadoutForDive 时按携带的氧气瓶设置：
     *   小瓶=60 / 中瓶=100 / 大瓶=150；双瓶=两者之和（最高 300）。
     *
     * 所有"氧气百分比"相关显示都统一用 o2/o2Max 而不是 o2/100，
     * 这样双瓶时 HUD 上能看到"满"的状态。
     */
    o2Max: 100,
    silt: 0,
    animTime: 0, // 动画时间（用于脚蹼动画）
    /**
     * 气嘴脱落动画（撞岩石时触发）：
     *   active  - 是否正在播放
     *   timer   - 已播放帧数（0 起）
     *   duration- 总帧数（60fps）
     *   strength- 触发时的撞击强度（0~1），用于缩放气嘴飞出的距离
     * 动画阶段（以 t = timer/duration 为进度 0~1）：
     *   A  0.00~0.20  气嘴被撞飞：从嘴部向前外侧弹出，气泡爆发
     *   B  0.20~0.55  右手伸出去"捞"气嘴（手臂目标角度指向气嘴位置）
     *   C  0.55~0.90  手抓到气嘴后把它拖回嘴部
     *   D  0.90~1.00  气嘴到位，手臂缓缓归位
     * 不播放时 active=false，drawDiver 按原样渲染。
     */
    regulatorAnim: {
        active: false,
        timer: 0,
        duration: 60,
        strength: 0,
    },
    /**
     * 双手拾取动画（拾取战利品 / 丢弃物时触发）：
     *   active   - 是否正在播放
     *   timer    - 已播放帧数（0 起）
     *   duration - 总帧数（60fps）
     *   itemKind - 物品视觉 kind（与 RelicKind / DroppedItem.itemId 同字符串）；
     *              用于决定双手中央绘制的 2D 矢量图形
     *   fromX/fromY - 物品在世界中的起点（用于"从地面飘到双手"的过渡）
     *
     * 动画阶段（t = timer/duration 0~1）：
     *   A 0.00~0.25  双手伸向地面物品（手臂渐入接管）
     *   B 0.25~0.55  抓住后从起点飞到双手中心
     *   C 0.55~0.85  双手抱住物品贴回胸前
     *   D 0.85~1.00  手臂归位，物品淡出
     *
     * 不播放时 active=false，drawDiver 按原样渲染。
     * 氧气罐拾取由 OxygenTank 的 flying 瓶 + 屏幕辉光特效负责，故不复用此字段。
     */
    carryItemAnim: {
        active: false,
        timer: 0,
        duration: 75,
        itemKind: '' as string,
        fromX: 0,
        fromY: 0,
    },
    /**
     * 双臂张开"迎接氧气"动画（氧气罐安装完成时触发）：
     *   active   - 是否正在播放
     *   timer    - 已播放帧数
     *   duration - 总帧数（60fps）
     *
     * 阶段（t = timer/duration 0~1）：
     *   A 0.00~0.30  双臂从原姿态向身侧/后方张开（迎接姿态渐入）
     *   B 0.30~0.70  保持张开（飞瓶到达 + 屏幕辉光 + 气泡爆发同步发生）
     *   C 0.70~1.00  双臂归位
     *
     * 与 regulatorAnim / carryItemAnim 互斥（碰撞反应优先 > 抱物品 > 迎接）。
     */
    welcomeArmsAnim: {
        active: false,
        timer: 0,
        duration: 60,
    }
};

export const particles = []; // 扬尘与气泡

export const input = {
    move: 0, // 0: stop, 1: forward
    speedUp: false, // shift
    targetAngle: Math.PI/2
}; 

export const touches = {
    joystickId: null,
    start: { x: 0, y: 0 },
    curr: { x: 0, y: 0 }
};

export function resetState() {
    state.texts = [];
    
    // 重置探索地图
    state.explored = [];
    for(let r=0; r<CONFIG.rows; r++) {
        state.explored[r] = [];
        for(let c=0; c<CONFIG.cols; c++) {
            state.explored[r][c] = false;
        }
    }
    
    player.o2 = 100; 
    player.o2Max = 100;
    player.silt = 0;
    player.vx = 0; 
    player.vy = 0;
    particles.length = 0;
    state.splashes = [];
    state.fishEnemies = [];
    state.fishBite = null;
    state.flashlightOn = true; // 重置手电筒为开启状态
    // 重置屏幕特效，防止重新开始后残留红屏和震动
    state.fx.redOverlay = 0;
    state.fx.shake = 0;
    state.playerAttack = {
        active: false,
        timer: 0,
        cooldownTimer: 0,
        angle: 0,
    };

    // 重置手动挡状态
    state.manualDrive = {
        activeTouches: {},
        nextStrokeSide: -1,
        lastInputAngle: 0,
        hasInput: false,
        leftKickProgress: 0,
        rightKickProgress: 0,
        leftKickStrength: 0,
        rightKickStrength: 0,
        leftTurnProgress: 0,
        rightTurnProgress: 0,
        leftTurnStrength: 0,
        rightTurnStrength: 0,
        forwardVisual: 0,
        turnVisual: 0,
        kickDrive: 0,
    };

    // 重置标记系统
    state.markers = [];
    // 重置轮盘状态
    state.wheel = {
        btnVisible: false,
        btnActive: false,
        open: false,
        sectors: [],
        highlightIndex: -1,
        expandProgress: 0,
        touchId: null,
        centerX: 0,
        centerY: 0,
        stillTimer: 0,
        nearbyInfo: null,
        previewAction: null,
    };
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

    // 初始位置：使用地图入口水道坐标，找不到时 fallback 到中央
    const entrance = state.landmarks.entrance;
    player.x = entrance ? entrance.x : CONFIG.tileSize * (CONFIG.cols / 2);
    player.y = entrance ? entrance.y : CONFIG.tileSize * 2;
    player.angle = Math.PI/2;
    player.targetAngle = Math.PI/2;
    input.targetAngle = Math.PI/2;

    // 同步归位相机到玩家位置（避免模式切换时相机残留旧坐标）
    state.camera.x = player.x;
    state.camera.y = player.y;
    state.camera.targetX = player.x;
    state.camera.targetY = player.y;
    state.camera.vx = 0;
    state.camera.vy = 0;
    state.camera.swayX = 0;
    state.camera.swayY = 0;
    state.camera.swayTime = 0;

    // 添加环境文本
    state.texts.push({
        x: player.x, 
        y: player.y - 40, 
        text: "出发点", 
        color: "#aaa",
        font: "14px Consolas"
    });
}
