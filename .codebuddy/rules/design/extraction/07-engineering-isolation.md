# 07 — 工程隔离方案

> **本卷优先级：🟢 低（但工程上至关重要）**
> 撤离玩法过于庞大，必须用独立的代码树、独立的存档、独立的配置。
> 这份文档定义"哪些是新建的、哪些是扩展现有的、哪些绝对不动"的工程边界。

---

## 一、隔离原则

### 1.1 Why 隔离

撤离玩法新增的代码量预估 3000~5000 行，如果混在现有迷宫模式代码里：

- 现有 `MazeLogic.ts` / `MazeSave.ts` 会膨胀到不可维护
- AI 改撤离玩法时容易误伤现有救援/图鉴/呼吸系统
- 测试期需要"撤离玩法关掉只玩救援"的灵活切换
- 撤离玩法本身可能反复迭代，独立代码树便于回滚

### 1.2 隔离的三层

| 层 | 隔离方式 |
|---|---|
| **代码** | 全部撤离相关代码进 `src/extraction/` 子目录 |
| **状态** | `state.extraction.*` 子树，不污染 `state.mazeRescue` |
| **存档** | `extraction_save_v1` 独立 key，与 `maze_save_v3` 隔离 |
| **配置** | `config/extraction/*.json` 独立目录 |
| **GM 面板** | `ExtractionGMConfig.ts` 独立面板（详见 [06-extraction-gm-panel.md](./06-extraction-gm-panel.md)） |

---

## 二、代码树结构

新增的所有代码集中在 `src/extraction/` 下：

```
src/extraction/
├── core/
│   ├── ExtractionState.ts          # state.extraction 的初始化和清理
│   ├── ExtractionConfig.ts         # 加载和访问 config/extraction/*.json
│   ├── ExtractionSave.ts           # 独立存档（extraction_save_v1）
│   └── ExtractionRegistry.ts       # 物品注册表（运行时只读）
│
├── logic/
│   ├── Economy.ts                  # 价格计算 / 卖货 / 收益结算
│   ├── Inventory.ts                # 仓库 + 背包数据操作
│   ├── ItemPickup.ts               # 拾取交互（轮盘按住）
│   ├── Shop.ts                     # 货架刷新 / 购买 / 价格波动
│   ├── Loadout.ts                  # 出发准备页的装备装载
│   ├── ConditionRoll.ts            # 品相 roll
│   ├── Rescue.ts                   # 救援触发概率 / 名声 / 图纸
│   └── ExtractionDive.ts           # 下潜过程的撤离逻辑（连接到 MazeLogic 的钩子）
│
├── render/
│   ├── ShopUI.ts                   # 商店全屏页
│   ├── WarehouseUI.ts              # 仓库全屏页
│   ├── LoadoutUI.ts                # 出发准备页
│   ├── InventoryHUD.ts             # 下潜中右下角背包格子
│   ├── PickupRing.ts               # 拾取轮盘渲染
│   └── DebriefExtension.ts         # 撤离结算（追加到现有 debrief）
│
└── gm/
    └── ExtractionGMConfig.ts       # 撤离专属 GM 面板
```

### 2.1 与现有代码的接口

撤离玩法对现有代码的依赖通过**钩子函数**实现，不直接修改现有文件：

```
现有 MazeLogic.ts::startMazeDive() 末尾追加：
    ExtractionDive.onDiveStart();

现有 MazeLogic.ts::finishMazeDive() 末尾追加：
    ExtractionDive.onDiveEnd(reason);  // reason: 'retreat'|'o2'|'fishkill'|'beacon'
```

每个现有入口加 1~3 行钩子调用，不动核心逻辑。

### 2.2 现有文件中**唯一**的修改清单

如果撤离玩法启用，下面是唯一会被动到的现有文件（每处改动 ≤ 5 行）：

| 文件 | 改动 |
|---|---|
| `src/core/state.ts` | 加 `extraction: getInitialExtractionState()` 子树 |
| `src/logic/MazeLogic.ts` | startMazeDive / finishMazeDive 末尾加钩子调用 |
| `src/logic/Logic.ts` | 转发新增的撤离玩法 export |
| `src/logic/MazeSave.ts` | rest 黑名单加 `extraction`（撤离数据走自己的存档） |
| `src/render/Render.ts` | 迷宫 play 阶段调一次 `InventoryHUD.draw()` |
| `src/render/RenderMazeUI.ts` | shore 分发处加 shop / warehouse / loadout 三个新页面 |
| `src/core/input.ts` | 三个新页面的 hit-test 分发 |
| `game.ts` | 启动时加 `ExtractionConfig.load() + ExtractionSave.load()` |

每处改动都是**插入新代码**，不删除任何现有代码。

---

## 三、独立存档

### 3.1 存档键独立

| 存档 | 存什么 | key |
|---|---|---|
| 现有迷宫存档 | 地图 seed + 探索 + 绳索 + 标记 + 鱼骨架 + 图鉴 | `maze_save_v3` |
| 撤离玩法存档 | 金币 + 名声 + 仓库 + 装备 + 商店货架 | `extraction_save_v1` |

两份存档**互不依赖**：
- 玩家清掉 maze_save_v3（换地图） → 撤离数据**保留**（金币/装备不丢）
- 玩家清掉 extraction_save_v1（重置经济） → 迷宫探索数据保留

### 3.2 存档结构（草案）

```json
{
  "version": 1,
  "coins": 350,
  "reputation": 50,
  "warehouse": [
    { "itemId": "pocketWatch", "condition": "pristine", "id": 12 },
    { "itemId": "coin", "condition": "worn", "id": 13 }
  ],
  "consumables": { "airTankM": 3, "batteryStd": 2, "ropePack5": 1 },
  "emergencies": { "beacon": 1 },
  "ownedEquipment": ["bag4", "bag8", "finsBasic", "finsRacing"],
  "equippedBag": "bag8",
  "equippedFins": "finsRacing",
  "loadout": {
    "airTank": "airTankM",
    "battery": "batteryStd",
    "rope": "ropePack5",
    "emergencies": ["beacon", null]
  },
  "shop": {
    "consumableShelf": [/* slots */],
    "emergencyShelf":  [/* slots */],
    "equipmentShelf":  [/* slots */],
    "specialShelf":    null,
    "refreshCount": { "consumable": 0, "emergency": 0, "equipment": 0, "special": 0 }
  },
  "unlockedSchematics": [],
  "flags": {
    "wangMasterTriggered": false,
    "consecutiveRefuseCount": 0,
    "tutorialShown": false
  },
  "stats": {
    "totalCoinsEarned": 1240,
    "totalDives": 7,
    "totalRescues": 1,
    "deepestDepth": -38
  }
}
```

### 3.3 老存档兼容

第一次启用撤离玩法时，发现 `extraction_save_v1` 不存在 → 用 `getInitialExtractionState()` 兜底：

```typescript
function getInitialExtractionState() {
  return {
    coins: 100,
    reputation: 0,
    warehouse: [],
    consumables: { airTankS: 3, batteryWeak: 2, ropePack5: 1 },
    emergencies: {},
    ownedEquipment: ['bag4', 'finsBasic'],
    equippedBag: 'bag4',
    equippedFins: 'finsBasic',
    loadout: { airTank: 'airTankS', battery: 'batteryWeak', rope: 'ropePack5', emergencies: [null, null] },
    shop: { /* 全空货架，进店时刷新 */ },
    unlockedSchematics: [],
    flags: { /* 全 false */ },
    stats: { /* 全 0 */ }
  };
}
```

老玩家进游戏 → 自动初始化为新手状态 → 不破坏旧存档。

### 3.4 关闭撤离玩法的兜底

如果未来想暂时关闭撤离玩法（比如真机出 bug 紧急下线）：

- 添加 `CONFIG.extraction.enabled = false`
- 关闭后所有撤离 UI 不显示，迷宫模式回退为当前的纯救援模式
- 撤离存档保留，重新打开后数据还在

---

## 四、独立配置

### 4.1 配置目录

新建 `config/extraction/` 子目录（注意：不是 `src/`，是项目根的 `config/`）：

```
config/
└── extraction/
    ├── items.json              # 物品属性表（所有可拾取 / 可购买物品）
    ├── shop-pool.json          # 商店货架池
    ├── equipment.json          # 永久装备效果表
    ├── conditions.json         # 品相分布池
    ├── rescue-rewards.json     # 救援奖励配置（保险金 / 图纸概率）
    ├── shop-banter.json        # 老板话术池
    └── balance.json            # 经济平衡参数（半成功丢失率等）
```

### 4.2 配置加载

游戏启动时（`game.ts`）：

```typescript
import { ExtractionConfig } from './src/extraction/core/ExtractionConfig';

await ExtractionConfig.load([
  'config/extraction/items.json',
  'config/extraction/shop-pool.json',
  'config/extraction/equipment.json',
  'config/extraction/conditions.json',
  'config/extraction/rescue-rewards.json',
  'config/extraction/shop-banter.json',
  'config/extraction/balance.json',
]);
```

### 4.3 配置访问

所有撤离玩法代码通过 `ExtractionConfig.get(key)` 访问：

```typescript
const itemDef = ExtractionConfig.getItem('pocketWatch');
const shelfCfg = ExtractionConfig.getShelf('consumable');
const conditionPool = ExtractionConfig.getConditionPool('metalPool');
```

**绝对不要**在代码里硬编码物品属性或商店配置。

### 4.4 微信小游戏的配置加载方式

微信小游戏不能直接读 `config/` 目录的文件。两种方案：

**方案 A**：构建期 inline
- 在 `scripts/buildConfig.js` 里把 JSON 转成 TS 模块
- 输出到 `src/extraction/generated/configData.ts`
- 运行时 import 这个 TS 模块即可

**方案 B**：云存储
- 把 JSON 上传到云存储
- 运行时 wx.downloadFile 加载
- 优点：可以远程调整数值不发版；缺点：网络依赖

**建议方案 A**：稳定 + 离线可玩。

---

## 五、独立 GM 面板

详见 [06-extraction-gm-panel.md](./06-extraction-gm-panel.md)。

要点：
- 新建 `src/extraction/gm/ExtractionGMConfig.ts`
- 不修改现有 `src/gm/GMConfig.ts`
- 共享工具函数提取到 `src/gm/GMShared.ts`

---

## 六、独立模块的暴露接口

### 6.1 对外只暴露一组高层 API

撤离玩法对现有项目暴露**最小接口**：

```typescript
// src/extraction/index.ts
export {
  // 状态访问
  getCoins,
  getReputation,
  getInventoryItems,
  
  // 钩子
  onDiveStart,
  onDiveEnd,
  onRescueComplete,
  
  // UI 入口
  isShopOpen,
  isWarehouseOpen,
  isLoadoutOpen,
  drawShop,
  drawWarehouse,
  drawLoadout,
  drawInventoryHUD,
  drawDebriefExtension,
  
  // 输入分发
  handleShopTouch,
  handleWarehouseTouch,
  handleLoadoutTouch,
  handlePickupTouch,
  
  // 系统级
  initExtraction,
  saveExtraction,
  loadExtraction,
  resetExtraction,
};
```

外部调用方不应该直接 import `src/extraction/logic/Economy.ts` 等内部模块。

### 6.2 内部模块互相依赖

`src/extraction/` 内部各模块可以自由 import，但 **不允许 import 现有项目代码**（除了 state / config / 渲染基础设施）。

允许的依赖：
```
src/extraction/* → src/core/state, src/core/config, src/render/Canvas
src/extraction/* → src/extraction/* (内部互相)
```

不允许的依赖：
```
src/extraction/* → src/logic/MazeLogic（用钩子，不直 import）
src/extraction/* → src/logic/Relic（图鉴系统是独立的，不耦合）
```

这条规则保证撤离玩法**可以整体抽掉**而不破坏其他系统。

---

## 七、撤离玩法的运行时开关

### 7.1 全局开关

`CONFIG.extraction.enabled`（默认 false 直到第一阶段做完测试通过）：

- false：所有撤离 UI 不显示，迷宫模式表现为现状
- true：撤离玩法生效

### 7.2 分阶段开关

为了便于分阶段上线，每个子系统有独立开关：

```typescript
CONFIG.extraction = {
  enabled: true,
  
  // 子开关
  enableInventoryAndPickup: true,    // 阶段 1：背包+拾取
  enableShopAndEconomy: true,        // 阶段 1：商店+经济
  enableEquipmentSystem: true,       // 阶段 2：永久装备
  enableConditionSystem: false,      // 阶段 2：品相系统
  enableEmergencyItems: false,       // 阶段 2：应急品
  enableReputation: false,           // 阶段 3：名声系统
  enableSchematics: false,           // 阶段 3：装备图纸
  enableNightRescue: false,          // 阶段 4：夜间救援
  enableWangMasterEvent: false,      // 阶段 4：王主任彩蛋
};
```

每开一个开关都要测一轮，避免一次性上线全部内容。

---

## 八、清档 / 重置策略

### 8.1 GM 面板的"清空撤离数据"

调试 Tab 提供 `extractionStateReset` 操作：

1. wx.removeStorage `extraction_save_v1`
2. state.extraction = getInitialExtractionState()
3. 立刻刷新岸上 UI

**不影响**：
- maze_save_v3（地图探索数据）
- 图鉴 codexKinds
- 主线和竞技场数据

### 8.2 玩家主动清档

岸上的"重置"功能（如果有）应当让玩家选择清哪一份：
- 清地图（重新生成新洞穴）→ 现有功能
- 清经济（金币归零，装备归零）→ 新增
- 清全部 → 两个都清

不要做"一键清全部"为默认，避免误操作。

---

## 九、新建文件清单（汇总）

如果决定实现，会新建以下文件：

```
.codebuddy/rules/design/extraction/
├── README.md                              [已建]
├── 01-item-attributes-and-config.md       [已建]
├── 02-shop-randomization.md               [已建]
├── 03-economy-and-progression.md          [已建]
├── 04-loadout-and-inventory.md            [已建]
├── 05-rescue-integration.md               [已建]
├── 06-extraction-gm-panel.md              [已建]
└── 07-engineering-isolation.md            [本文]

src/extraction/
├── index.ts
├── core/
│   ├── ExtractionState.ts
│   ├── ExtractionConfig.ts
│   ├── ExtractionSave.ts
│   └── ExtractionRegistry.ts
├── logic/
│   ├── Economy.ts
│   ├── Inventory.ts
│   ├── ItemPickup.ts
│   ├── Shop.ts
│   ├── Loadout.ts
│   ├── ConditionRoll.ts
│   ├── Rescue.ts
│   └── ExtractionDive.ts
├── render/
│   ├── ShopUI.ts
│   ├── WarehouseUI.ts
│   ├── LoadoutUI.ts
│   ├── InventoryHUD.ts
│   ├── PickupRing.ts
│   └── DebriefExtension.ts
└── gm/
    └── ExtractionGMConfig.ts

config/extraction/
├── items.json
├── shop-pool.json
├── equipment.json
├── conditions.json
├── rescue-rewards.json
├── shop-banter.json
└── balance.json

scripts/
└── buildExtractionConfig.js     # 把 config/extraction/*.json 转成 TS 模块
```

新增 ~20 个 TS 文件 + 7 个 JSON 文件 + 1 个构建脚本。
**修改的现有文件 ≤ 8 个，每处改动 ≤ 5 行**。

---

## 十、风险点

### 10.1 状态分裂

- `state.mazeRescue.codexKinds`（图鉴）
- `state.extraction.warehouse`（仓库）

两个数据来源相同的物品定义，需要严格保持单一数据源。
**约定**：物品定义只来自 `ExtractionConfig.getItem(id)`，Relic.RELIC_TYPES 表后期重构为读 ExtractionConfig。

### 10.2 微信小游戏存档容量

- 现有 maze_save_v3 单 key ~10~30 KB
- 撤离存档预估 ~5~20 KB
- 加在一起仍远低于 wx.storage 单 key 限制

但要避免在仓库里堆几万件物品（容量爆炸）。仓库可设置软上限提示。

### 10.3 配置 JSON 与现有 Relic 表的迁移

第一阶段会出现"两套数据源"（Relic.RELIC_TYPES 和 items.json），需要小心保持一致：
- 第一阶段：读 items.json 时 fallback 到 RELIC_TYPES
- 第二阶段：完全切到 items.json，删除 RELIC_TYPES

---

## 十一、测试策略

### 11.1 隔离测试

撤离玩法开关关闭时，跑一遍现有迷宫模式 → 确认行为完全不变。
撤离玩法开关打开时，跑一遍下潜 → 确认基础功能可用。

### 11.2 老玩家兼容

模拟一个有 maze_save_v3 数据但无 extraction_save_v1 数据的存档：
- 进入岸上 → 应当看到 100 金 + 起步装备
- 老玩家的图鉴进度、地图探索完全保留

### 11.3 GM 工具测试

撤离 GM 面板的所有 action（加钱 / 重置 / 一键装备）都要单独测一遍。
特别是"清空撤离数据"按钮要确保**不**清掉现有的图鉴和地图数据。

---

## 十二、与文档其他部分的对接

| 内容 | 来源 |
|---|---|
| 物品属性 | [01-item-attributes-and-config.md](./01-item-attributes-and-config.md) |
| 商店刷新 | [02-shop-randomization.md](./02-shop-randomization.md) |
| 经济节奏 | [03-economy-and-progression.md](./03-economy-and-progression.md) |
| 背包/拾取 | [04-loadout-and-inventory.md](./04-loadout-and-inventory.md) |
| 救援穿插 | [05-rescue-integration.md](./05-rescue-integration.md) |
| GM 面板 | [06-extraction-gm-panel.md](./06-extraction-gm-panel.md) |
| 顶层导航 | [../09-extraction-loop-design.md](../09-extraction-loop-design.md) |
