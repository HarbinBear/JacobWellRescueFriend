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

## 技术文档与设计文档分工

- `code.md` 与 `code/`：回答**这个项目现在的代码是怎么跑起来的，应该去哪里改**。
- `design.md` 与 `design/`：回答**这个项目想做成什么样，为什么这样设计**。

## 最重要的代码层认知

- **入口文件是 `game.ts`。**
- **共享状态中枢是 `src/core/state.ts`。**
- **主线与竞技场的运行时调度中心是 `src/logic/Logic.ts`。**
- **统一渲染出口是 `src/render/Render.ts`。**
- **参数调优总入口是 `src/core/config.ts`。**
- **这是一个强状态驱动项目，很多行为依赖 `state.screen`、`state.story.stage`、`state.story.flags`、`state.npc.state` 等字段协同。**
