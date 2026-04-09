---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---

# `code.md` 阅读入口

这份文件现在是**技术文档总入口**，不再承载全部细节。

目的是避免单个规则文件过长，导致规则系统提示：

- **The Rule content is too long, part of it may be ignored by the model**

后续新会话中的 AI 应按下面顺序阅读技术文档。

## 必读顺序

1. 先读 [01-runtime-overview.md](./code/01-runtime-overview.md)
   - 理解入口文件、目录分层、启动流程、主循环和最外层状态机。
2. 再读 [02-state-and-config.md](./code/02-state-and-config.md)
   - 理解全局状态树、配置系统、输入系统，以及这些基础设施如何协作。
3. 再读 [03-logic-and-story.md](./code/03-logic-and-story.md)
   - 理解地图初始化、剧情管理器、主线更新、竞技场更新、NPC 与碰撞查询。
4. 最后读 [04-render-and-special-systems.md](./code/04-render-and-special-systems.md)
   - 理解粒子、绳索、敌鱼、渲染总入口、常见修改落点和扩展时的坑。

## 最短阅读建议

如果上下文预算很紧，至少先读：

- [01-runtime-overview.md](./code/01-runtime-overview.md)
- [02-state-and-config.md](./code/02-state-and-config.md)
- [03-logic-and-story.md](./code/03-logic-and-story.md)

如果任务与下面内容强相关，再补读对应分卷：

- **改启动流程、模式切换、主循环**：优先读 `01-runtime-overview.md`
- **改状态字段、配置参数、输入接入**：优先读 `02-state-and-config.md`
- **改章节推进、地图初始化、主线逻辑、竞技场逻辑**：优先读 `03-logic-and-story.md`
- **改 UI、光照、绳索、敌鱼、粒子、渲染表现**：优先读 `04-render-and-special-systems.md`
- **改 VPL 连续化、自动曝光稳定性、相机弹簧臂、水中摇曳、浅水区阳光系统**：优先读 `04-render-and-special-systems.md` 中的 Playdead 方法论对应技术落地稿
- **改迷宫场景辨识度、区域主题、洞室标签、岸上认知地图扩展**：优先读 `04-render-and-special-systems.md` 中的迷宫模式场景辨识度扩展落点
- **改多次下潜闭环、跨下潜持久化、岸上整理地图、正式救援状态**：优先串读 `02-state-and-config.md`、`03-logic-and-story.md` 与 `04-render-and-special-systems.md`

## 开发计划

- **每次新会话开始时，必须先读 [devplan.md](./devplan.md)**
  - 了解当前迭代进度、待办任务、已完成工作
  - 自行决定本次会话要推进哪些任务
  - 完成后更新 `devplan.md` 中的进度状态

## 技术文档与设计文档分工

- `code.md` 与 `code/`：回答**这个项目现在的代码是怎么跑起来的，应该去哪里改**。
- `design.md` 与 `design/`：回答**这个项目想做成什么样，为什么这样设计**。
- `devplan.md`：回答**接下来要做什么、做到哪了、还剩什么**。

## 本地检查约定

- 当前项目保留微信开发者工具的 TypeScript 自动处理流程，用于实际运行小游戏。
- 为了让后续接手模型能够在仓库内主动检查 TypeScript 报错，项目额外提供了 `npm run typecheck`。
- `npm run typecheck` 实际执行 `tsc --noEmit`，只做类型检查，不生成 `dist` 输出。
- 如果需要在本地确认是否存在 TypeScript 报错，优先执行 `npm run typecheck`，而不是依赖微信开发者工具内部的报错提示。
- `npm run build` 仍可用于生成 `dist`，但它不是后续模型排查报错的首选入口。
- 如果需要离线查看迷宫生成结果，应执行 `npm run maze:inspect -- 3` 这类命令；它会直接批量打印 ASCII 迷宫图和关键统计指标，便于先验图再改算法。

## 版本控制与忽略文件约定

- 项目根目录提供 `.gitignore`，用于过滤本地依赖、构建产物、系统缓存、编辑器缓存和微信开发者工具私有配置。
- 当前默认忽略的重点包括：`node_modules/`、`dist/`、`*.tsbuildinfo`、`.DS_Store`、`.vscode/`、`.idea/`、`project.private.config.json` 与各类包管理器调试日志。
- `project.config.json` 仍然保留在版本控制中，因为它属于项目级配置；只有 `project.private.config.json` 属于本地私有配置，应忽略。
- 音频、贴图、`src/` 源码、`typings/` 与 `.codebuddy/rules/` 文档都不应被忽略。

## 最重要的代码层认知

- **入口文件是 `game.ts`。**
- **共享状态中枢是 `src/core/state.ts`。**
- **主线与竞技场的运行时调度中心是 `src/logic/Logic.ts`。**
- **统一渲染出口是 `src/render/Render.ts`。**
- **参数调优总入口是 `src/core/config.ts`。**
- **手动挡输入与潜水员动作表现的第一版链路已经接通，当前默认以 `src/core/config.ts` 的 `manualDrive` 与 `diver` 参数作为主要调优入口。**
- **这是一个强状态驱动项目，很多行为依赖 `state.screen`、`state.story.stage`、`state.story.flags`、`state.npc.state` 等字段协同。**
