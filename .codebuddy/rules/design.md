---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---

# `design.md` 阅读入口

这份文件现在是**设计文档总入口**，不再承载全部细节。

目的是避免单个规则文件过长，导致规则系统提示：

- **The Rule content is too long, part of it may be ignored by the model**

后续新会话中的 AI 应按下面顺序阅读设计文档。

## 必读顺序

1. 先读 [01-overview.md](./design/01-overview.md)
   - 理解项目定位、核心体验目标、设计原则、叙事骨架。
2. 再读 [02-story-and-modes.md](./design/02-story-and-modes.md)
   - 理解章节结构、关键事件、主线与竞技场模式、结局语义。
3. 再读 [03-world-and-systems.md](./design/03-world-and-systems.md)
   - 理解地图、地标、玩家生存系统、绳索、凶猛鱼、NPC。
4. 最后读 [04-interaction-and-engineering.md](./design/04-interaction-and-engineering.md)
   - 理解输入、UI、渲染、状态管理、主循环、工程约束与扩展建议。
5. 按需补读专项分卷：
   - [03b-maze-scene-design.md](./design/03b-maze-scene-design.md)：迷宫场景辨识度专项设计稿
   - [05-dive-loop-and-production.md](./design/05-dive-loop-and-production.md)：多次下潜闭环的程序/美术/UI 拆解稿
   - [06-diver-visual-design.md](./design/06-diver-visual-design.md)：潜水员角色表现与手动挡输入可视化设计稿
   - [07-playdead-methodology-design.md](./design/07-playdead-methodology-design.md)：Playdead 方法论在本项目中的表现落地稿
   - [08-toner-master-narrative.md](./design/08-toner-master-narrative.md)：《唐老师的救援》叙事蓝本（主线未来目标形态，不是当前已实现内容；当前四关是其早期雏形）

## 最短阅读建议

如果上下文预算很紧，至少先读：

- [01-overview.md](./design/01-overview.md)
- [02-story-and-modes.md](./design/02-story-and-modes.md)

如果任务与下面内容强相关，再补读对应分卷：

- **改剧情、分支、章节节奏**：优先读 `02-story-and-modes.md`
- **改地图、地标、空间节奏**：优先读 `03-world-and-systems.md`
- **改氧气、手电、绳索、凶猛鱼**：优先读 `03-world-and-systems.md`
- **改迷宫场景辨识度、空间母题、区域材质与叙事物件**：优先读 `03b-maze-scene-design.md`
- **改输入、UI、表现、状态切换**：优先读 `04-interaction-and-engineering.md`
- **改多次下潜闭环、跨下潜持久化、岸上整理地图、正式救援状态**：优先读 `05-dive-loop-and-production.md`
- **改潜水员角色绘制、手动挡动作联动、角色表现细调**：优先读 `06-diver-visual-design.md`
- **改画面统一性、Playdead 风格方法论、相机体感、表现层优先级**：优先读 `07-playdead-methodology-design.md`
- **讨论主线叙事的未来走向、失忆/女孩/梦境/八音盒/三线合一、完美结局条件**：优先读 `08-toner-master-narrative.md`（注意：这是目标形态，不是当前实现）
- **做“玩家感知被救者”这类和未来叙事绑定的新能力**：先读 `08-toner-master-narrative.md` 的第五节，再回到对应玩法分卷

## 设计文档与技术文档分工

- `design.md` 与 `design/`：回答**这个项目想做成什么样，为什么这样设计**。
- `code.md`：回答**这个项目现在的代码是怎么跑起来的，应该去哪里改**。

## 工程协作认知

- 本项目的版本控制应只保留源码、资源、配置模板与规则文档，不应提交本地依赖、构建缓存、编辑器缓存和微信开发者工具私有配置。
- 其中 `project.private.config.json` 属于个人开发环境信息，应通过 `.gitignore` 排除；`project.config.json` 则继续作为项目级配置保留。
- 迷宫模式属于强结果导向内容；后续只要修改迷宫生成算法，就应先运行离线验图脚本查看真实产出，而不是只凭参数和代码想象结果。

## 最重要的项目认知

- **这是一个洞穴潜水救援叙事游戏，不是普通动作游戏。**
- **主线核心是多次下潜、逐步深入、寻找熊子、在压迫感中做选择。**
- **核心设计支柱是黑暗、氧气压力、地形压迫、地标触发、绳索与手电。**
- **当前手动挡与潜水员动作表现已经形成第一版基线，后续主要在这个基线上做真机验证与细调，而不是推翻重做。**
- **竞技场模式是对敌人与战斗系统的独立玩法化复用，不应反过来主导主线设计。**
