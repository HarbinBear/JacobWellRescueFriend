// CONFIG 已按子域拆分到 src/core/config/ 目录下，本文件仅做转导出以保持原有导入路径不变。
// 外部仍可继续使用 `import { CONFIG } from '../core/config'`。
// 要修改具体参数，请到对应子模块：
//   - src/core/config/base.ts       基础运行参数 / 地图 / 绳索 / 第三关
//   - src/core/config/gameplay.ts   标记 / 氧气瓶 / 呼吸 / 撞击反馈 / 攻击 / 探知仪
//   - src/core/config/modes.ts      fishArena / fishEnemy / maze（含浅水区）
//   - src/core/config/rendering.ts  dust / flashlight / quality / perfHUD / postProcess
//   - src/core/config/character.ts  manualDrive / diver / camera / audio

export { CONFIG } from './config/index';
