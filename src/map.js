import { CONFIG } from './config.js';
import { state, target } from './state.js';

// 有机地图生成
export function generateMap() {
    state.map = [];
    const { rows, cols, tileSize } = CONFIG;
    
    for(let r=0; r<rows; r++) {
        state.map[r] = [];
        for(let c=0; c<cols; c++) state.map[r][c] = 1;
    }

    // 顶部水面开放
    for(let r=0; r<6; r++) {
        for(let c=1; c<cols-1; c++) state.map[r][c] = 0;
    }

    // 矿工挖掘
    let miner = {x: Math.floor(cols/2), y: 5}; 
    let steps = 0;
    const maxSteps = rows * cols * 3;
    
    while(steps < maxSteps) {
        for(let ry=0; ry<2; ry++) {
            for(let rx=0; rx<2; rx++) {
                if(miner.y+ry < rows-1 && miner.x+rx < cols-1 && miner.y+ry > 0 && miner.x+rx > 0) {
                    state.map[miner.y+ry][miner.x+rx] = 0;
                }
            }
        }
        
        let dir = Math.random();
        if(dir < 0.35 && miner.y < rows-3) miner.y++;
        else if(dir < 0.6 && miner.x < cols-3) miner.x++;
        else if(dir < 0.8 && miner.y > 6) miner.y--; 
        else if(miner.x > 2) miner.x--;
        
        steps++;
    }

    // 封闭边界
    for(let r=0; r<rows; r++) state.map[r][0] = state.map[r][cols-1] = 1;
    for(let c=0; c<cols; c++) state.map[rows-1][c] = 1;

    // 生成墙壁渲染数据
    state.walls = [];
    for(let r=0; r<rows; r++) {
        for(let c=0; c<cols; c++) {
            if(state.map[r][c] === 1) {
                state.walls.push({
                    x: c * tileSize + tileSize/2,
                    y: r * tileSize + tileSize/2,
                    r: tileSize * (0.6 + Math.random() * 0.3) 
                });
            }
        }
    }

    // 放置目标
    let valid = false;
    while(!valid) {
        let tr = Math.floor(rows * 0.7 + Math.random() * (rows * 0.2));
        let tc = Math.floor(cols * 0.5 + Math.random() * (cols * 0.4));
        if(state.map[tr][tc] === 0) {
            target.x = tc * tileSize + tileSize/2;
            target.y = tr * tileSize + tileSize/2;
            valid = true;
        }
    }
}
