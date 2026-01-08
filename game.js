import { initTextures, draw } from './src/render.js';
import { resetGameLogic, update } from './src/logic.js';
import { initInput } from './src/input.js';

// 初始化纹理
initTextures();

// 初始化输入监听，传入重置回调
initInput(resetGameLogic);

// 启动游戏
resetGameLogic();

// 游戏主循环
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
