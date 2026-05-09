# 撤离玩法设计案 — 子目录索引

> 本目录承载"迷宫模式撤离玩法"的全部设计文档，与现有项目其他设计稿在物理上隔离，便于独立迭代。
>
> 主入口请回到 `../09-extraction-loop-design.md`，那份文档现在只承载**顶层设计原则与导航**。
> 本目录下的子卷承载具体子系统的可执行设计。

## 文档分工

| 子卷 | 内容 | 评审优先级 |
|---|---|---|
| [01-item-attributes-and-config.md](./01-item-attributes-and-config.md) | 物品属性模型（价值 / 重量 / 体积 / 品相全部解耦），配置表草案 | 🔴 最高 |
| [02-shop-randomization.md](./02-shop-randomization.md) | 黄金矿工式有限随机商店设计，刷新机制 | 🔴 最高 |
| [03-economy-and-progression.md](./03-economy-and-progression.md) | 经济节奏、装备分档、失败惩罚分级、收益曲线 | 🟡 中 |
| [04-loadout-and-inventory.md](./04-loadout-and-inventory.md) | 背包系统、出发准备页、拾取交互 | 🟡 中 |
| [05-rescue-integration.md](./05-rescue-integration.md) | 救援任务与经济玩法的穿插策略、名声系统 | 🟡 中 |
| [06-extraction-gm-panel.md](./06-extraction-gm-panel.md) | 撤离玩法专属 GM 面板（与现有 GMConfig 物理隔离） | 🟢 低 |
| [07-engineering-isolation.md](./07-engineering-isolation.md) | 工程隔离方案（独立模块树、独立存档键、独立配置块） | 🟢 低 |

## 阅读顺序建议

### 评审第一轮（先确定方向）

只读两份：
- `../09-extraction-loop-design.md`（顶层原则）
- `01-item-attributes-and-config.md` 的 §2 §3（属性模型 + 配置表草案）

如果这两个方向定了，剩下的全部都是细节填充。

### 评审第二轮（确认核心系统）

加读：
- `02-shop-randomization.md`（商店是经济循环的瓶颈）
- `03-economy-and-progression.md` 的 §4 §5（曲线 + 失败惩罚）

### 评审第三轮（确认承载方式）

加读：
- `07-engineering-isolation.md`（搞清楚不会污染现有代码）
- `06-extraction-gm-panel.md`（调试面板独立化）

剩下两份（背包/救援）是承载现有玩法的衍生物，方向定了之后基本不会有大改。

## 与项目其他设计文档的关系

- 不替代 `01-overview.md` 的项目核心定位
- 不修改 `02-story-and-modes.md` 的主线四关与竞技场
- **只对迷宫模式做扩展**，不破坏 `05-dive-loop-and-production.md` 的多次下潜闭环
- 与 `08-toner-master-narrative.md` 的未来叙事在"名声系统"上预留挂钩

## 文档命名约定

本目录下所有子卷都以 **2 位数字 + 短横线 + 模块名** 命名，与项目根 design 目录的命名风格一致。

未来如需扩展（比如"装备图纸合成系统"独立成卷），按 08、09 顺延即可。
