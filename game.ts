import { initTextures, draw } from './src/render/Render';
import { resetGameLogic, update, resetArenaLogic, updateArena, resetMazeLogic, replayMazeLogic, updateMaze, startMazeDive, returnToShore } from './src/logic/Logic';
import { initInput } from './src/core/input';
import { initAudio, updateAudio, updateSFXLoops } from './src/audio/AudioManager';
import { perfFrameBegin, perfFrameEnd, profileBegin, profileEnd } from './src/debug/PerfHUD';
import { initQualityManager, onFrame as qualityOnFrame } from './src/render/QualityManager';

// 调试期：解锁到设备上限（iPad 120Hz / 部分 Android 120Hz），便于真机观察各画质档位的真实压力
// 设备不支持 120Hz 时会自动回落 60，不会报错
try {
    if (typeof wx !== 'undefined' && (wx as any).setPreferredFramesPerSecond) {
        (wx as any).setPreferredFramesPerSecond(120);
    }
} catch (e) { /* 忽略：非微信环境或老基础库 */ }

// 初始化纹理
initTextures();

// 初始化音频系统（创建 BGM 上下文）
initAudio();

// 初始化画质档位管理器（WebGL 光照的分辨率/VPL/漫散射会跟着它走）
initQualityManager();

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
let _lastFrameT = 0;
function gameLoop() {
    perfFrameBegin();
    profileBegin('update');        update();         profileEnd('update');
    profileBegin('updateArena');   updateArena();    profileEnd('updateArena');
    profileBegin('updateMaze');    updateMaze();     profileEnd('updateMaze');
    profileBegin('updateAudio');   updateAudio();    profileEnd('updateAudio');
    profileBegin('updateSFXLoops');updateSFXLoops(); profileEnd('updateSFXLoops');
    profileBegin('draw');          draw();           profileEnd('draw');
    perfFrameEnd();
    // 画质自适应：用 wall-clock 帧间隔喂 FPS 采样
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (_lastFrameT > 0) {
        qualityOnFrame(t1 - _lastFrameT);
    }
    _lastFrameT = t1;
    requestAnimationFrame(gameLoop);
}

gameLoop();
