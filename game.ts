import { initTextures, draw } from './src/render/Render';
import { resetGameLogic, update, resetArenaLogic, updateArena, resetMazeLogic, replayMazeLogic, updateMaze, startMazeDive, returnToShore, abandonCase, acceptNewCase, stayInResolvedCase, markBriefingShown } from './src/logic/Logic';
import { updateHome } from './src/story/HomeScene';
import { state } from './src/core/state';
import { initInput } from './src/core/input';
import { initAudio, updateAudio, updateSFXLoops, updateAmbience, playAmbience, stopAmbience } from './src/audio/AudioManager';
import { perfFrameBegin, perfFrameEnd, profileBegin, profileEnd } from './src/debug/PerfHUD';
import { initQualityManager, onFrame as qualityOnFrame } from './src/render/QualityManager';
// 撤离玩法：启动时加载经济存档（若无存档则初始化为新手起步状态）
import { loadExtractionProgress } from './src/extraction';

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

// 撤离玩法：加载经济存档（若无存档则初始化为新手起步状态：100 金 + 4 格背包）
loadExtractionProgress();

// 初始化输入监听，传入重置回调
initInput(
    () => resetGameLogic(true),
    () => resetArenaLogic(),
    () => resetMazeLogic(),
    () => replayMazeLogic(),
    (diveType: string) => startMazeDive(diveType),
    () => returnToShore(),
    // 救援概念包装回调：放弃救援 / 接受新任务 / 留在本案 / 确认警情通报 / 进入救援结案叙事页
    () => abandonCase(),
    () => acceptNewCase(),
    () => stayInResolvedCase(),
    () => markBriefingShown(),
    () => {
        // 进入 resolved 叙事页：切 phase + 归零 caseResultTimer + 写入入场动效时间戳
        const maze: any = state.mazeRescue;
        if (maze && maze.phase === 'rescued') {
            maze.phase = 'resolved';
            maze.caseResultTimer = 0;
            maze.resolvedEnterTime = Date.now();
        }
    }
);

// 启动游戏 (初始化但不开始)
resetGameLogic(false);

// 游戏主循环
let _lastFrameT = 0;
function gameLoop() {
    perfFrameBegin();
    profileBegin('update');        update();         profileEnd('update');
    profileBegin('updateArena');   updateArena();    profileEnd('updateArena');
    profileBegin('updateMaze');    updateMaze();     profileEnd('updateMaze');
    profileBegin('updateHome');    updateHome();     profileEnd('updateHome');
    profileBegin('updateAudio');   updateAudio();    profileEnd('updateAudio');
    profileBegin('updateSFXLoops');updateSFXLoops(); profileEnd('updateSFXLoops');
    // 岸上营地环境音（鸟鸣）由 phase 驱动：只在 mazeRescue 的 shore / resolved_idle 两个真正暴露在营地的 phase 激活
    // briefing / resolved / abandoned 三个叙事弹窗以及下潜中、菜单全部停（弹窗自带声音由叙事层另做）
    {
        const maze: any = state.mazeRescue;
        const inCamp = state.screen === 'mazeRescue' && maze && (maze.phase === 'shore' || maze.phase === 'resolved_idle');
        if (inCamp) {
            playAmbience('campAmbience');
        } else {
            stopAmbience('campAmbience');
        }
    }
    profileBegin('updateAmbience');updateAmbience(); profileEnd('updateAmbience');
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
