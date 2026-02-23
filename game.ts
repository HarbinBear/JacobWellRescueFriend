import { initTextures, draw } from './src/Render';
import { resetGameLogic, update } from './src/Logic';
import { initInput } from './src/input';

// 初始化纹理
initTextures();

// 初始化输入监听，传入重置回调
initInput(resetGameLogic);

// 启动游戏 (初始化但不开始)
resetGameLogic(false);

// 游戏主循环
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
