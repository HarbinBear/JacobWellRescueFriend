import { CONFIG } from './config';
import { Particle } from '../logic/Particle';
export const state = {
    screen: 'menu', // menu, play, win, lose, ending
    map: [] as any[][],
    walls: [] as any[], // 存储墙壁的渲染圆心
    invisibleWalls: [] as any[], // 仅对玩家生效的空气墙
    plants: [] as any[], // 存储水草
    fishes: [] as any[], // 存储鱼群
    splashes: [] as any[], // 水花粒子
    explored: [] as boolean[][], // 记录已探索区域
    zones: [] as any[], // 地图区域信息 {name, yMin, yMax, xMin, xMax}
    msgTimer: null as number | null,
    alertMsg: '',
    alertColor: '#fff',
    texts: [] as any[],
    // 剧情相关状态
    story: {
        stage: 0, // 0:未开始, 1:第一次下潜, 2:黑屏过渡, 3:第二次下潜, 4:濒死, 5:获救, 6:结束
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
            deathPause: 0 as number | false
        },
        visitedZones: [] as string[], // 已访问的区域列表
        lastBlockMsgTime: 0 // 上次显示阻挡消息的时间
    },
    endingTimer: 0, // 结局动画计时器
    currentZone: null as string | null, // 当前所在区域
    debug: {
        fastMove: true
    },
    npc: {
        active: false,
        x: 0, y: 0,
        vx: 0, vy: 0,
        angle: 0,
        state: 'follow' as string, // follow, wait, enter_tunnel, dead
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
        mode: 'none' as string, // 'in' (fade in from black), 'out' (fade out to black)
        timer: 0,
        callback: null as (() => void) | null,
        bubbles: [] as any[] // 转场气泡状态
    },
    antiStuck: {
        timer: 0,
        lastPos: {x:0, y:0}
    },
    landmarks: {
        suit: {x:0, y:0},
        tunnelEntry: {x:0, y:0},
        tunnelEnd: {x:0, y:0},
        tunnelPath: [] as any[],
        junction: {x:0, y:0},
        deadEndDeep: {x:0, y:0}
    },
    rope: {
        ropes: [] as any[],
        active: false,
        current: {
            start: null as any,
            startWall: null as any,
            end: null as any,
            path: [] as any[],
            basePoints: [] as any[],
            slackFactor: 1,
            mode: 'loose' as string,
            time: 0
        },
        ui: {
            visible: false,
            type: null as string | null,
            progress: 0,
            anchor: null as any
        },
        hold: {
            active: false,
            type: null as string | null,
            timer: 0,
            touchId: null as number | null,
            anchor: null as any
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

export const particles: Particle[] = []; // 扬尘与气泡

export const input = {
    move: 0, // 0: stop, 1: forward
    speedUp: false, // shift
    targetAngle: Math.PI/2
}; 

export const touches = {
    joystickId: null as number | null,
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
    const entrance = (state.landmarks as any).entrance;
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
