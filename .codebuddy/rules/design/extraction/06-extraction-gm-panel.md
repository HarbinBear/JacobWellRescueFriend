# 06 — 撤离专属 GM 面板

> **本卷优先级：🟢 低（但工程上很有价值）**
> 撤离玩法配置项太多，混进现有 GMConfig 会让面板膨胀失控。
> 本卷设计**独立的 GM 入口**，与现有 GMConfig 物理隔离。

---

## 一、设计原则

### 1.1 与现有 GMConfig 隔离

现有 GMConfig.ts 已经管理着大量调试参数（角色/光照/呼吸/迷宫/性能/后处理...）。
撤离玩法如果继续往里塞，会出现：

- Tab 数量爆炸（原 11 个 Tab → 加 4 个变 15 个）
- 调试时找不到目标参数
- 老 Tab 和新 Tab 混在一起，AI 改东西容易误伤

### 1.2 物理隔离方案

新建独立的 `ExtractionGMConfig.ts` 模块，与 `GMConfig.ts` 平行：

- 独立面板入口
- 独立的 Tabs 结构
- 独立的渲染层
- 独立的状态保存

岸上 HUD 加**两个齿轮按钮**：
- ⚙ GM（原本的）
- 🛒 撤离 GM（新增）

---

## 二、撤离 GM 面板的入口

### 2.1 入口位置

参考现有 GM 按钮在 HUD 左上角的承载方式，撤离 GM 按钮可以：

**方案 A**：直接在 HUDTopLeft 第 6 个槽位加一个新图标（购物袋 / 撤离图标）
- 优点：与现有 GM 入口对称
- 缺点：HUD 槽位变多

**方案 B**：在原 GM 面板里新增一个"撤离"Tab，但内部跳转到独立的撤离面板
- 优点：HUD 不变
- 缺点：跳转感

**方案 C**：在岸上界面 / 出发准备页 / 商店页里**单独**显示撤离 GM 入口
- 优点：与上下文相关
- 缺点：下潜中无法调试经济

> **建议方案 A**：在 HUDTopLeft 末尾加一个"撤离 GM"图标，复用现有 HUD 的入场动画 / 短按弹 tip 范式。

### 2.2 仅在迷宫模式可见

撤离玩法仅在迷宫模式有效，所以撤离 GM 按钮只在 `state.screen === 'mazeRescue'` 时显示。
菜单 / 主线 / 竞技场都不显示。

---

## 三、撤离 GM 面板的 Tab 结构

```
┌────────────────────────────────────┐
│  [💰经济] [🎒背包] [🏪商店] [🎯救援] [📋物品池] [🐛调试] │
└────────────────────────────────────┘
```

### 3.1 经济 Tab

控制金币、名声、收益与失败惩罚的开关：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| coins | number | 100 | 当前金币（可直接改） |
| reputation | number | 0 | 当前名声 |
| coinsAdd | action | - | "+100 金"按钮（一键加钱） |
| coinsAddBig | action | - | "+1000 金"按钮 |
| coinsClear | action | - | "归零金币" |
| reputationAdd | action | - | "+50 名声" |
| halfExtractionLossRate | number | 0.5 | 半成功撤离的丢失概率 |
| deathLossRate | number | 1.0 | 死亡撤离的丢失概率 |
| sellPriceMul | number | 1.0 | 卖价倍率（调经济通胀） |
| valueGlobalMul | number | 1.0 | 物品基础价值全局倍率 |

### 3.2 背包 Tab

控制背包与拾取交互：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| equippedBag | select | bag4 | 装备的背包（4/8/12/16） |
| equippedFins | select | finsBasic | 装备的脚蹼 |
| pickupHoldDuration | number | 0.6 | 拾取按住时长（秒） |
| pickupRadius | number | 80 | 拾取轮盘出现的距离 |
| autoPickupEnabled | bool | false | 调试用：靠近自动捡（跳过轮盘） |
| bagFullBehavior | select | block | 背包满时行为：block 阻止 / replace 替换最便宜的 |
| inventoryFreeAdd | action | - | "送一件随机古物给我"（调试） |
| inventoryClear | action | - | "清空背包" |

### 3.3 商店 Tab

控制商店刷新与价格：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| shopRefreshFree | bool | false | 调试用：所有刷新免费 |
| shopForceShelf | select | none | 强制刷某个货架（调测试） |
| shopAllStock | bool | false | 调试：所有装备全显示在装备架 |
| shopBuyFree | bool | false | 调试：所有购买免费 |
| shopRefreshAll | action | - | 一键刷所有货架 |
| specialShelfAlwaysAppear | bool | false | 特价架强制出现 |

### 3.4 救援 Tab

控制救援触发与奖励：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| rescueTriggerChance | number | 0.2 | 警情通报触发概率 |
| rescueForceTrigger | bool | false | 下次进岸上必触发 |
| rescueRewardMul | number | 1.0 | 救援奖励倍率 |
| schematicDropRate | number | 0.3 | 装备图纸掉落率 |
| nightRescueChance | number | 0.0 | 夜间救援触发概率（默认关） |
| wangMasterEvent | action | - | 立即触发王主任彩蛋 |
| schematicAddAll | action | - | 解锁所有图纸 |

### 3.5 物品池 Tab

直接查看 / 修改物品配置（运行时热加载）：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| items.json 路径 | text | config/extraction/items.json | 配置文件路径 |
| reload | action | - | 重新加载 items.json（不重启游戏） |
| itemValueOverride | json | {} | 临时覆盖某物品价值 |
| spawnWeightOverride | json | {} | 临时覆盖刷新权重 |
| dumpCurrentItems | action | - | 打印当前内存里的物品表 |

### 3.6 调试 Tab

杂项调试开关：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| logEconomyEvents | bool | false | 控制台打印经济事件（卖货/买货/拾取） |
| showInventoryDebug | bool | false | HUD 显示背包内部状态 |
| simulateLoadout | action | - | 一键完整装备（中氧+标电+绳+信标） |
| skipBriefingPage | bool | false | 跳过警情通报页 |
| forceConditionRoll | select | none | 强制下次拾取的品相（debug 用） |
| extractionStateDump | action | - | 把 state.extraction 打印到控制台 |
| extractionStateReset | action | - | 清空所有撤离数据，回归首次玩家 |

---

## 四、面板视觉设计

### 4.1 与原 GM 面板的视觉区分

为避免误用，撤离 GM 面板**用不同的色调**：

- 现有 GM 面板：深石板灰 + 橙色高亮
- 撤离 GM 面板：**深棕底 + 金币黄高亮**

色调暗示"这是经济相关的调试面板"。

### 4.2 面板大小与可拖动

完全沿用原 GM 面板的工程：
- 同样的 PANEL_W / PANEL_H
- 同样的拖动 / 滑动
- 同样的边界放开（可拖到屏外）

代码层面 `ExtractionGMConfig.ts` 引用现有 GM 面板的工具函数（绘制圆角、Tab 切换、控件类型），不重写。

---

## 五、与 GM 面板的协作

### 5.1 互斥显示

同一时刻只能开一个：
- 打开撤离 GM → 自动关闭原 GM
- 打开原 GM → 自动关闭撤离 GM

### 5.2 共享部分调试数据

撤离玩法需要参考一些原有 GM 数据（比如氧气消耗系数），不重复定义：
- 撤离 GM 面板可以**只读显示**部分原 GM 参数（如 `breath.o2PerBreathPeak`）
- 不允许在撤离 GM 里改原 GM 的值，避免混乱

---

## 六、配置 JSON 草案

### 6.1 `ExtractionGMConfig.ts` 的 TABS 结构

类似现有 GMConfig.ts 的 TABS 数组：

```typescript
export const EXTRACTION_TABS: GMTab[] = [
  {
    id: 'economy',
    label: '💰 经济',
    items: [
      { type: 'number', path: 'extraction.coins', label: '金币', min: 0, max: 99999, step: 50 },
      { type: 'action', label: '+100 金', action: 'addCoins:100' },
      { type: 'action', label: '+1000 金', action: 'addCoins:1000' },
      { type: 'number', path: 'extraction.gm.halfLossRate', label: '半成功丢失率', min: 0, max: 1, step: 0.05 },
      // ...
    ]
  },
  {
    id: 'inventory',
    label: '🎒 背包',
    items: [
      { type: 'select', path: 'extraction.equippedBag', options: ['bag4','bag8','bag12','bag16'], label: '装备背包' },
      // ...
    ]
  },
  // ...
];
```

### 6.2 配置项命名空间

所有撤离 GM 控制的运行时参数，全部挂在：
- `state.extraction.*`（业务数据）
- `state.extraction.gm.*`（GM 调试覆盖）
- `state.extraction.flags.*`（一次性事件标志）

不污染现有 `CONFIG.*` 或 `state.*` 顶层。

---

## 七、未来扩展空间

### 7.1 配置导入导出

为方便策划调试，撤离 GM 面板可以提供：

- "导出当前配置到 JSON"按钮 → 复制到剪贴板
- "从剪贴板导入配置"按钮 → 一键恢复
- "保存为预设"功能 → 多套常用调试配置（"超富豪模式" / "破产模式" / "图纸全开"）

### 7.2 实时经济数据可视化

调试 Tab 加一个"经济曲线图"：
- 横轴：累计下潜次数
- 纵轴：金币余额
- 折线 + 标注关键升级点
- 帮助策划真机调优时看数值变化

不是首版必做，但后期会很有用。

### 7.3 物品掉落统计

调试用：
- 显示当次会话每种物品被发现 / 拾取的次数
- 显示每种品相的实际 roll 比例
- 帮助验证概率配置是否符合预期

---

## 八、待确认问题

1. **入口方案 A/B/C 选哪个**？建议 A，但 HUD 槽位多了一个会不会拥挤？
2. **撤离 GM 面板的 Tab 数量是否合适**？6 个会不会过多，需要合并？
3. **是否需要"配置导出"功能**？方便策划交流，但增加复杂度。
4. **是否需要"经济曲线可视化"**？非必需但调优很有用。
5. **撤离 GM 是否要做"密码保护"**？现在 GM 面板是开放的，但撤离 GM 涉及金币直改，是否要加保护避免玩家误用？

---

## 九、与现有 GMConfig 的接口

### 9.1 不要改 GMConfig.ts

撤离 GM 是**新建文件 ExtractionGMConfig.ts**，不修改现有 GMConfig.ts。
原 GMConfig 保持现状，互不影响。

### 9.2 共享的工具函数

如果有共用的绘制 / 交互工具函数，提取到 `src/gm/GMShared.ts`：

- `drawPanel()` 圆角面板
- `drawTabs()` 顶部 Tab 切换
- `drawControl()` 控件渲染（number/bool/select/action）
- `handleControlTouch()` 控件 touch 处理

两边都引用 `GMShared.ts`，避免代码重复。

### 9.3 共享的状态

按钮显示状态等可以共享：

```typescript
// 现有：state.gmOpen
// 新增：state.extractionGmOpen

// 互斥逻辑
function toggleExtractionGM() {
  state.extractionGmOpen = !state.extractionGmOpen;
  if (state.extractionGmOpen) state.gmOpen = false;
}
```

---

## 十、实现优先级

第一阶段（核心闭环跑通时）：
- 必做：经济 Tab + 背包 Tab + 调试 Tab 的基础项

第二阶段（经济深度）：
- 加：商店 Tab + 物品池 Tab

第三阶段（救援穿插）：
- 加：救援 Tab

第四阶段：
- 配置导出 / 经济曲线可视化

不要一上来就做全部 6 个 Tab，按需扩展。
