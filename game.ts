import { initTextures, draw } from './src/render/Render';
import { resetGameLogic, update, resetArenaLogic, updateArena, resetMazeLogic, replayMazeLogic, updateMaze, startMazeDive, returnToShore } from './src/logic/Logic';
import { initInput } from './src/core/input';
import { initAudio, updateAudio, updateSFXLoops } from './src/audio/AudioManager';

// 初始化纹理
initTextures();

// 初始化音频系统（创建 BGM 上下文）
initAudio();

// 初始化输入监听，传入重置回调（支持从指定关卡开始）
initInput(
    (startStage: number = 1) => resetGameLogic(startStage, true),
    () => resetArenaLogic(),
    () => resetMazeLogic(),
    () => replayMazeLogic(),
    (diveType: string) => startMazeDive(diveType),
    () => returnToShore()
);

// 启动游戏 (初始化但不开始)
resetGameLogic(1, false);

// 游戏主循环
function gameLoop() {
    update();
    updateArena();
    updateMaze();
    updateAudio();
    updateSFXLoops();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
