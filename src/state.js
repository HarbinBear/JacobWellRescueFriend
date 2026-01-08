import { CONFIG } from './config.js';

export const state = {
    screen: 'play', // play, win, lose
    map: [],
    walls: [], // 存储墙壁的渲染圆心
    explored: [], // 记录已探索区域
    msgTimer: null,
    alertMsg: '',
    alertColor: '#fff',
    texts: []
};

export const player = {
    x: 0, y: 0,
    angle: Math.PI/2,
    targetAngle: Math.PI/2,
    vx: 0, vy: 0,
    o2: 100,
    n2: 0,
    silt: 0,
    hasTarget: false
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
    state.screen = 'play';
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
    
    // 初始位置 (水面中央)
    player.x = CONFIG.tileSize * (CONFIG.cols / 2);
    player.y = CONFIG.tileSize * 2;
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
