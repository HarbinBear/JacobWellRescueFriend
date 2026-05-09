# 01 — 物品属性模型与配置表

> **本卷优先级：🔴 最高**
> 这是整个撤离玩法的"原子层"。后续商店、背包、撤离结算、经济曲线全部依赖于这里定义的物品属性。
> 设计原则与上层目标请回到 [../09-extraction-loop-design.md](../09-extraction-loop-design.md)。

---

## 一、设计原则

### 原则 1：物品的所有属性彼此独立

**这是本卷最重要的设计修正**。物品的"价值 / 重量 / 体积 / 稀有度 / 出现概率 / 品相分布"全部解耦，**不互相推导**。

- 以前的草案是"weight 高 → 普通 → 便宜 → 占 1 格"——这是错的
- 真实物品里：一颗鲨鱼牙稀有但又轻又小；一具人骨架价值高但又重又占地方
- 反例：**水晶**（小、轻、贵）vs **铁锚**（大、重、便宜）vs **怀表**（小、轻、贵）

### 原则 2：所有数值由策划配置表驱动，不写死在代码里

- 物品属性表 → 单一 JSON 文件（`config/extraction/items.json`）
- 商店刷新池 → 单一 JSON 文件（`config/extraction/shop-pool.json`）
- 装备效果表 → 单一 JSON 文件（`config/extraction/equipment.json`）
- 品相分布表 → 单一 JSON 文件（`config/extraction/conditions.json`）

**好处**：
- 数值平衡可以改 JSON 不改代码
- 后续接策划 Excel / Google Sheets → 转 JSON 的工作流自然
- AI 不要自己拍脑袋调数值，应当先看配置表再发问

### 原则 3：本文档给出**初版示例数值**，但**最终数值由人工配表决定**

下方所有数值表都是"示例"。AI 在第一阶段实现时按此配置即可，但**不要在代码里硬编码这些数值，必须读 JSON**。

---

## 二、物品属性模型

### 2.1 单个物品的属性字段

每件可拾取物品由如下字段定义：

| 字段 | 类型 | 含义 | 谁决定 |
|---|---|---|---|
| `id` | string | 唯一标识，如 `"pocketWatch"` | 配表（与 `Relic.RelicKind` 复用现有 32 个 id） |
| `name` | string | 中文名 | 配表（沿用 `RELIC_TYPES.name`） |
| `desc` | string | 简短描述 | 配表（沿用 `RELIC_TYPES.desc`） |
| `category` | string | 大类，见 §2.2 | 配表 |
| `baseValue` | number | 基础售价（金币） | 配表，**与稀有度无关，独立** |
| `weight` | number | 重量（虚拟单位 g） | 配表，**与价值无关，独立** |
| `slots` | number | 占用背包格子数（1~4） | 配表，**与价值无关，独立** |
| `rarity` | enum | 稀有度，见 §2.3 | 配表 |
| `spawnWeight` | number | 场景刷新概率权重，见 §2.4 | 配表 |
| `conditionPool` | string | 品相池 id，引用 §3 | 配表 |
| `tags` | string[] | 检索标签，如 `["metal","heavy"]`，影响某些事件 | 配表 |

### 2.2 物品大类（category）

仅用于 UI 分类与商店补货逻辑参考，不直接影响数值：

- `treasure` 古物 / 遗落物（图鉴里的 32 种全部归这一类）
- `consumable` 消耗品（氧气瓶、电池、绳索等）
- `equipment` 永久装备（背包、脚蹼、电池盒）
- `emergency` 应急品（救生信标、防鲨喷雾）
- `material` 杂项材料（合成系统预留，初版不用）

### 2.3 稀有度（rarity）

仅作为 UI 标签和"事件触发条件"使用，**不直接影响价值或体积**：

- `common` 普通（外观无装饰）
- `uncommon` 不寻常（绿色描边）
- `rare` 稀有（蓝色描边）
- `epic` 史诗（紫色描边 + 发现时金色 hint）
- `legendary` 传说（彩色描边 + 全屏短暂提示，仅特殊配置）

> 稀有度只影响"被发现时的玩家心情"，不应该用来推算价格。一个史诗物品可能很便宜，一个普通物品也可能很贵。**这一点反直觉但很重要**。

### 2.4 刷新概率（spawnWeight）

- 数值越高，在场景里越容易出现
- 不与稀有度绑定（你完全可以做"史诗但常出现的物品"，比如某些专属探索的高品相纪念物）
- 复用现有 `Relic.pickUniqueKinds()` 的权重逻辑，把当前 `RELIC_TYPES.weight` 字段迁移过来

---

## 三、品相系统（condition）

### 3.1 设计目标

让"同一种物品"有自然的价值波动，制造"哎我这次赌中了"的小爽感。
品相**不影响**重量、体积、稀有度，**只影响价值与外观渲染**。

### 3.2 品相档位

| 品相 | 价值倍率 | 默认占比 | 描述 |
|---|---|---|---|
| `broken` 残缺 | ×0.4 | 25% | "残缺的XX" |
| `worn` 磨损 | ×0.8 | 35% | "磨损的XX" |
| `normal` 普通 | ×1.0 | 25% | "XX" |
| `fine` 完好 | ×1.5 | 12% | "完好的XX" |
| `pristine` 完美 | ×3.0 | 3% | "完美的XX"（带金色高亮） |

### 3.3 不同物品可以有不同的品相分布

通过 `conditionPool` 字段引用：

- `defaultPool` 上面表里的 25/35/25/12/3
- `metalPool` 金属物（不易完美）：30/40/22/7/1
- `gemPool` 宝石类（极易完美）：10/20/30/25/15
- `boneSkullPool` 骸骨类（要么残要么完）：50/20/15/10/5（缺失中间档）

### 3.4 品相决定瞬间

**拾取的瞬间** roll 品相，而不是生成场景物时 roll。理由：
- 同一颗物品，玩家如果"看到却没捡"，下次下潜可能是不同品相
- 给玩家"反复回来碰运气"的动机
- 实现简单：拾取时根据 `conditionPool` 抽签

---

## 四、初版物品属性表（示例配置）

> ⚠️ **以下所有数值都是 AI 起的草案，待策划人工调整**。
> 实际项目中应放在 `config/extraction/items.json`，代码读 JSON 不写死。

### 4.1 古物 / 遗落物（32 种 Relic 全量）

| id | 名称 | baseValue | weight | slots | rarity | spawnW | conditionPool |
|---|---|---|---|---|---|---|---|
| skeleton | 古老骸骨 | 350 | 800 | 4 | rare | 3 | boneSkullPool |
| coin | 锈蚀硬币 | 8 | 5 | 1 | common | 10 | metalPool |
| potshard | 陶罐碎片 | 12 | 80 | 1 | common | 8 | defaultPool |
| anchor | 小铁锚 | 60 | 1500 | 3 | uncommon | 5 | metalPool |
| ring | 银色指环 | 80 | 8 | 1 | uncommon | 4 | metalPool |
| stoneTablet | 刻字石板 | 220 | 600 | 3 | rare | 3 | defaultPool |
| fishhook | 锈蚀鱼钩 | 6 | 15 | 1 | common | 7 | metalPool |
| bell | 小铜铃 | 45 | 60 | 1 | uncommon | 5 | metalPool |
| rustyKey | 锈蚀钥匙 | 15 | 25 | 1 | common | 6 | metalPool |
| shell | 螺旋海螺 | 18 | 35 | 1 | common | 9 | defaultPool |
| silverCoin | 银币 | 120 | 8 | 1 | rare | 4 | metalPool |
| humanSkull | 人类头骨 | 600 | 1200 | 3 | epic | 2 | boneSkullPool |
| pocketWatch | 破碎怀表 | 280 | 60 | 1 | rare | 3 | metalPool |
| oilLamp | 旧油灯 | 70 | 350 | 2 | uncommon | 4 | metalPool |
| smallKnife | 小刀 | 35 | 90 | 1 | uncommon | 5 | metalPool |
| maskShard | 潜水镜碎片 | 25 | 30 | 1 | common | 4 | defaultPool |
| waterFlask | 铝制水壶 | 30 | 200 | 2 | uncommon | 5 | metalPool |
| ironNail | 锈铁钉 | 4 | 50 | 1 | common | 8 | metalPool |
| brassCompass | 黄铜指南针 | 240 | 80 | 1 | rare | 3 | metalPool |
| leatherBoot | 半只皮靴 | 18 | 250 | 2 | common | 4 | defaultPool |
| cross | 小十字架 | 180 | 40 | 1 | rare | 3 | metalPool |
| amulet | 古老护身符 | 320 | 30 | 1 | rare | 3 | defaultPool |
| idolFigure | 无名小神像 | 750 | 400 | 2 | epic | 2 | defaultPool |
| crystal | 水晶簇 | 420 | 50 | 1 | rare | 4 | gemPool |
| ceramicBowl | 陶碗 | 40 | 280 | 2 | uncommon | 6 | defaultPool |
| glassBottle | 旧玻璃瓶 | 14 | 180 | 2 | common | 7 | defaultPool |
| coralChunk | 珊瑚块 | 90 | 120 | 1 | rare | 3 | defaultPool |
| sharkTooth | 鲨鱼牙 | 380 | 8 | 1 | epic | 2 | defaultPool |
| fishSkeleton | 鱼骨架 | 28 | 200 | 2 | uncommon | 6 | boneSkullPool |
| fossil | 螺旋化石 | 260 | 350 | 2 | rare | 4 | defaultPool |
| obsidian | 黑曜石块 | 55 | 180 | 1 | uncommon | 5 | defaultPool |
| cameraHousing | 相机外壳 | 900 | 320 | 2 | epic | 2 | metalPool |

**审阅时关注**：
- 价值与体积彻底解耦了（鲨鱼牙轻小贵 vs 骸骨重大贵 vs 玻璃瓶重大便宜 vs 铁钉重小便宜）
- spawnWeight 与价值也解耦（玻璃瓶常见但便宜，相机外壳少见且贵）
- 品相池给了 4 种（默认/金属/宝石/骨骸），骨骸类品相分布两极化最有意思

### 4.2 消耗品（购买后下潜消耗）

| id | 名称 | baseValue | weight | slots | category | 效果 |
|---|---|---|---|---|---|---|
| airTankS | 小氧气瓶 | 0 | 600 | 1 | consumable | 起始氧气 60 |
| airTankM | 中氧气瓶 | 40 | 800 | 2 | consumable | 起始氧气 100 |
| airTankL | 大氧气瓶 | 120 | 1200 | 3 | consumable | 起始氧气 150 |
| batteryWeak | 弱电池 | 0 | 100 | 1 | consumable | 手电距离 ×0.7 |
| batteryStd | 标准电池 | 30 | 100 | 1 | consumable | 手电距离 ×1.0 |
| batteryHigh | 高功率电池 | 80 | 150 | 1 | consumable | 手电距离 ×1.3 |
| ropePack5 | 绳索 5 段 | 20 | 200 | 1 | consumable | 铺路 5 段 |
| ropePack15 | 绳索 15 段 | 50 | 500 | 2 | consumable | 铺路 15 段 |

> 消耗品也有重量和体积，但它们**不进背包**——通过"出发准备页"提前装载，不挤占战利品空间。重量和体积留作未来"装备过重影响速度"等扩展用，不是首版必需。

### 4.3 应急用品（携带在专属应急槽）

| id | 名称 | baseValue | weight | slots | 效果 |
|---|---|---|---|---|---|
| beacon | 救生信标 | 150 | 80 | 1 | 触发后立刻完整撤离 |
| sharkSpray | 防鲨喷雾 | 80 | 50 | 1 | 食人鱼退散 30 秒 |
| airTablet | 应急氧气片 | 100 | 30 | 1 | 立即回 30 氧气 |

### 4.4 永久装备

| id | 名称 | baseValue | category | 效果 |
|---|---|---|---|---|
| bag4 | 4 格背包 | 0 | equipment | 容量 4 格（起始） |
| bag8 | 8 格背包 | 300 | equipment | 容量 8 格 |
| bag12 | 12 格背包 | 800 | equipment | 容量 12 格 |
| bag16 | 16 格背包 | 1800 | equipment | 容量 16 格 |
| finsBasic | 普通脚蹼 | 0 | equipment | 速度 1.0× |
| finsRacing | 竞速脚蹼 | 400 | equipment | 速度 1.2× |
| finsEndurance | 长续航脚蹼 | 350 | equipment | 速度 0.95×，氧耗 ×0.85 |

永久装备没有 weight 和 slots 字段（背包不装背包）。

---

## 五、配置 JSON 文件结构草案

### 5.1 `config/extraction/items.json`

```json
{
  "version": 1,
  "conditions": {
    "defaultPool":  [["broken",0.25],["worn",0.35],["normal",0.25],["fine",0.12],["pristine",0.03]],
    "metalPool":    [["broken",0.30],["worn",0.40],["normal",0.22],["fine",0.07],["pristine",0.01]],
    "gemPool":      [["broken",0.10],["worn",0.20],["normal",0.30],["fine",0.25],["pristine",0.15]],
    "boneSkullPool":[["broken",0.50],["worn",0.20],["normal",0.15],["fine",0.10],["pristine",0.05]]
  },
  "conditionMultipliers": {
    "broken": 0.4, "worn": 0.8, "normal": 1.0, "fine": 1.5, "pristine": 3.0
  },
  "items": {
    "skeleton": {
      "name": "古老骸骨",
      "desc": "一具早年遇难者的遗骸，无法辨识身份。",
      "category": "treasure",
      "baseValue": 350,
      "weight": 800,
      "slots": 4,
      "rarity": "rare",
      "spawnWeight": 3,
      "conditionPool": "boneSkullPool",
      "tags": ["bone","heavy","fragile"]
    },
    "coin": {
      "name": "锈蚀硬币",
      "desc": "一枚年代久远的硬币，图案已几乎磨平。",
      "category": "treasure",
      "baseValue": 8,
      "weight": 5,
      "slots": 1,
      "rarity": "common",
      "spawnWeight": 10,
      "conditionPool": "metalPool",
      "tags": ["metal","small"]
    }
    /* ... 其余 30 个古物 + 全部消耗品 / 应急 / 装备 ... */
  }
}
```

### 5.2 `config/extraction/shop-pool.json`

商店相关单独成卷，详见 [02-shop-randomization.md](./02-shop-randomization.md) §4。

### 5.3 `config/extraction/equipment.json`

```json
{
  "version": 1,
  "equipment": {
    "bag8": {
      "name": "8 格背包",
      "category": "equipment",
      "baseValue": 300,
      "effects": { "inventorySlots": 8 }
    },
    "finsRacing": {
      "name": "竞速脚蹼",
      "category": "equipment",
      "baseValue": 400,
      "effects": { "moveSpeedMul": 1.2 }
    },
    "finsEndurance": {
      "name": "长续航脚蹼",
      "category": "equipment",
      "baseValue": 350,
      "effects": { "moveSpeedMul": 0.95, "o2DrainMul": 0.85 }
    }
  }
}
```

`effects` 字段是一个 key-value 表，键名对应运行时覆盖到 `CONFIG.maze.*` 或玩家状态字段的具体路径。这样未来加新效果只用扩 effects 不用改代码结构。

---

## 六、加载流程

```
游戏启动
  ↓
加载 config/extraction/items.json + equipment.json + shop-pool.json + conditions.json
  ↓
合并到内存 ExtractionRegistry（不进 state，是只读静态表）
  ↓
所有玩法层（拾取、商店、结算）通过 ExtractionRegistry.getItem(id) 查表
```

### 加载失败兜底

JSON 缺失 / 解析失败时，**不让游戏崩溃**：
- 退化为"撤离玩法不可用"，迷宫模式回退到当前的纯救援模式
- 在岸上 UI 显示一条小字提示："经济系统未加载，本次仅救援模式"

---

## 七、开放问题（待人工配表）

1. **价值数值整体倍率**？
   - 当前草案"最贵的相机外壳 = 900 金"，匹配"8 格背包 300 金"——大约一次完美撤离 = 一次大升级
   - 如果觉得节奏太快，全表 ×0.5；太慢，×2.0
2. **重量单位**？
   - 当前草案是虚拟"克"，铁锚 1500g，硬币 5g——纯标尺
   - 如果未来要做"超重影响速度"，再约定阈值；首版不用重量
3. **slots 范围**？
   - 当前 1~4，背包最大 16 格→ 单件最大占 4 格 = 25%。是否合理？
4. **tags 系统**？
   - 当前给了 `metal`、`heavy`、`fragile` 等标签，目的是给"潜在的事件触发"留接口
   - 例：未来可能做"携带超过 3 件 fragile 物品时撞墙概率破损"——但不是首版必需
   - 是否保留这个字段？

---

## 八、与现有 Relic 系统的兼容

- `Relic.RELIC_TYPES` 表中的 `name` / `desc` / `weight` 字段保留兼容性
- 加载 `items.json` 时，对存在的 32 个 relic id，**优先用 JSON 数值覆盖** Relic 表里的字段（保持单一数据源）
- 旧 `Relic.weight` 字段语义复用为 `spawnWeight`，但建议在迁移时同步重命名

**迁移策略**（见 `07-engineering-isolation.md`）：
- 第一阶段：JSON 加载 + Relic 表保留兼容
- 第二阶段：Relic.ts 内部 weight 字段重命名为 spawnWeight，去掉硬编码
- 第三阶段：Relic.ts 完全从 JSON 加载，删除内置常量表
