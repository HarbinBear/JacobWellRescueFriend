// CONFIG 总入口：把各子模块展开合并成单一对象，保持外部 `import { CONFIG } from '../core/config'` 的访问路径零变更。
//
// 拆分原因：原 config.ts 超过 800 行，整块对象字面量对 AI 编辑不友好。拆后各子模块聚焦自己关心的参数域：
//   - base:       基础运行参数（版本/画布/debug/菜单解锁/基础移动/地图/氧气/光照/泥沙/绳索/第三关关键点/恐怖事件）
//   - gameplay:   玩法相关子系统（标记/氧气瓶/呼吸/撞击反馈/玩家攻击/生命探知仪）
//   - modes:      玩法模式（食人鱼竞技场/凶猛鱼/迷宫纯享版含浅水区与食人鱼聚集点）
//   - rendering:  渲染与性能（悬浮尘埃/手电筒光照/画质分档/性能 HUD/后处理）
//   - character:  角色表现与交互（手动挡输入/潜水员动画/相机/音频）
//
// 子模块只负责定义参数，不做组装；组装只在本文件发生。

import { baseConfig } from './base';
import { gameplayConfig } from './gameplay';
import { modesConfig } from './modes';
import { renderingConfig } from './rendering';
import { characterConfig } from './character';

export const CONFIG = {
    ...baseConfig,
    ...gameplayConfig,
    ...modesConfig,
    ...renderingConfig,
    ...characterConfig,
};
