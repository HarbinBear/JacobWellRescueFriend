import { CONFIG } from './config';
export const state = {
    screen: 'menu', // menu, play, win, lose, ending
    menuScreen: 'main', // main, chapter
    chapterScrollY: 0, // chapter select page scroll offset
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
    // 剧情相关状态
    story: {
        stage: 0, // 0:未开始, 1:第一次下潜, 2:黑屏过渡, 3:第二次下潜, 4:濒死, 5:获救, 6:结束(第二关结局过渡), 7:第三关下潜, 8:第三关结局
        timer: 0,
        shake: 0, // 屏幕晃动强度
        redOverlay: 0, // 红色遮罩透明度
        flags: {
            seenSuit: false,
            npcEntered: false,
            collapsed: false,
            blackScreen: false,
            narrowVision: false,
            rescued: false,
            approachedTunnel: false,
            tankDamaged: false,
            deathPause: 0,
            // 第二关：小潘发现走错路
            npcWrongWay: false,
            // 第三关：手电筒损坏
            flashlightBroken: false,
            flashlightBrokenOsShown: false,
            // 第三关：玩家试图上岸
            tryingToSurface: false,
            surfaceOsShown: false,
            // 第三关：到达二三洞室连接处
            reachedChamber23Junction: false,
            chamber23OsShown: false,
            // 第三关：手电筒固定灭（靠近灰色物体后）
            flashlightFixedOff: false,
            flashlightOffStartTime: 0, // 手电筒固定灭的开始时间戳
            // 第三关：恐怖鱼眼闪现
            fishEyeTriggered: false,
            fishEyeFlashTimer: 0,       // 鱼眼闪现进度（1.0->0）
            fishEyeFlashStartTime: 0,   // 鱼眼开始闪现的时间戳
            // 第三关：放弃救援按钮
            abandonBtnVisible: false,
            abandonBtnScheduledTime: 0, // 预定显示放弃按钮的时间戳
            abandonBtnHolding: false,
            abandonBtnHoldStartTime: 0, // 开始长按的时间戳
            // 结局标记
            bearDied: false,
            stage2Ending: false
        },
        visitedZones: [], // 已访问的区域列表
        lastBlockMsgTime: 0 // 上次显示阻挡消息的时间
    },
    endingTimer: 0, // 结局动画计时器
    currentZone: null, // 当前所在区域
    debug: {
        fastMove: true
    },
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
    },
    camera: {
        zoom: 1,
        targetZoom: 1
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
    }
};

export const player = {
    x: 0, y: 0,
    angle: Math.PI/2,
    targetAngle: Math.PI/2,
    vx: 0, vy: 0,
    o2: 100,
    n2: 0,
    silt: 0,
    hasTarget: false,
    animTime: 0 // 动画时间（用于脚蹼动画）
};

export const target = { x: 0, y: 0, found: false, name: '' };

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
    player.n2 = 0; 
    player.silt = 0;
    player.vx = 0; 
    player.vy = 0;
    player.hasTarget = false;
    
    target.found = false;
    particles.length = 0;
    state.splashes = [];

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
    
    // 随机目标名字
    target.name = CONFIG.targetNames[Math.floor(Math.random() * CONFIG.targetNames.length)];

    // 添加环境文本
    state.texts.push({
        x: player.x, 
        y: player.y - 40, 
        text: "出发点", 
        color: "#aaa",
        font: "14px Consolas"
    });
}
