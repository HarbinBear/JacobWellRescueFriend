import { initTextures, draw } from './src/render/Render';
import { resetGameLogic, update, resetArenaLogic, updateArena } from './src/logic/Logic';
import { initInput } from './src/core/input';

// 初始化纹理
initTextures();

// 初始化输入监听，传入重置回调（支持从指定关卡开始）
initInput(
    (startStage: number = 1) => resetGameLogic(startStage, true),
    () => resetArenaLogic()
);

// 启动游戏 (初始化但不开始)
resetGameLogic(1, false);

// 游戏主循环
function gameLoop() {
    update();
    updateArena();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
