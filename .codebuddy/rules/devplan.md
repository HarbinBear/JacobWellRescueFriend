---
# Please note: Do not modify the header of this document. If modified, CodeBuddy (Internal Edition) will apply the default logic settings.
type: always
---
# 雅各布井开发计划

> **本文档由 AI 自行维护**，记录所有待开发需求、优先级、任务拆分与完成状态。
> 每次迭代开始时，AI 应先阅读本文档，自行决定本次要做什么，做完后更新进度。
> 已完成工作的详细记录归档在 [09-completed-work-archive.md](./code/09-completed-work-archive.md)。

---

## 一、需求总览与优先级

| 编号 | 需求名称 | 优先级 | 状态 | 备注 |
|------|----------|--------|------|------|
| P1 | 角色表现（重绘潜水员） | 🔴 高 | 🟡 进行中 | 身体 roll 滚动、腿部脚蹼造型、手电发光位置 |
| P2 | 手电筒光照改进（VPL连续化） | 🟡 中 | ⬜ 未开始 | 离散虚拟光源 → 连续反射面 |
| P3 | 生命系统增强 | 🟢 低 | ⬜ 未开始 | 氧气与运动关联 + 呼吸气泡 |
| **P4** | **地形序列化系统** | 🔴 高 | 🟡 部分完成 | 第一阶段完成：种子 + PRNG + 地图重建 + v3 存档；好友分享编码待做 |
| P5 | 迷宫模式本地存档 | 🔴 高 | ✅ 已完成 | v3 种子版存档：地图结构靠 seed 重建，单次下潜 ~10~30KB，远低于 Android 上限 |
| **P6** | **氧气瓶拾取系统** | 🔴 高 | ✅ 已完成 | 聚落大概率刷新，贴岩石表面，轮盘按住安装，完整视觉反馈；同 seed 已消耗不再刷；增强：每瓶外观随机（瓶体色/锈蚀/阀门/标签/裂口/倾倒）+ "前人遗物"伴生物件（潜水镜/潜水衣/布条碎片，40/25/20/15 组合），全部确定性派生 |
| **P9** | **生命探知仪** | 🔴 高 | ✅ 第三版已完成 | 迷宫模式 play 阶段，NPC 绑绳前持续以 #D/F 双音节奏提示距离；越近越快；发现 NPC 后继续响，只有绑绳成功才停；**图标改为"同心圆脉冲波纹"仪表盘**：每次"嘀"响从中心向外扩散一圈波纹，波纹队列化管理（最多同时 6 个），信号越强波纹越密；**两音间隔也随距离渐进**（远 150ms → 近 80ms），近处不再黏成一个音；玩家身上 LED 保留作世界同步反馈；Web Audio 合成音；GM 面板"探知仪"Tab 全参数可调（`beepIntervalMaxMs` / `beepIntervalMinMs` 替代原 `beepIntervalMs`） |
| **P10** | **左上角 HUD 管理器** | 🟡 中 | ✅ 已完成 | 新建 `HUDTopLeft.ts` 统一管理迷宫模式左上角四项（氧气环/手动挡/音频/探知仪）；竖向等距布局 + 入场滑入动效；统一交互：**全部只短按=主操作+弹 tip**（2s 自动消失，淡入淡出），不再支持长按；**氧气图标中心改为 O₂ 脚标文字**；所有硬坐标 hit-test 从 `input.ts` 收口到 HUDTopLeft，`drawAudioToggle` 独立绘制已废弃 |

---

## 二、待办任务详情

### P1：角色表现——待修复问题与剩余任务

**当前已知问题**：

1. **缺少 roll 方向身体滚动表现**（高优先）
   - 当前移动时身体完全没有左右微微滚动的表现
   - 真实潜水员在踢水和转向时，身体会沿前进方向轴产生轻微的左右 roll 倾斜
   - 这个 roll 滚动对于用 2D 动画塑造 3D 立体感非常关键
   - 实现思路：根据当前踢水侧（左腿/右腿）和转向方向，给身体整体施加一个小角度的 roll 偏移，通过缩放或错位模拟倾斜效果
   - 踢左腿时身体微微向右倾，踢右腿时微微向左倾；转向时向转弯内侧倾斜

2. **腿部和脚蹼造型与动画错误**（高优先）
   - 当前腿部和脚蹼的形状不正确，需要重新审视造型
   - 踢水动画的运动轨迹和节奏需要修正
   - 脚蹼应该有更明显的柔性弯曲表现

3. **手电筒发光位置错误**（中优先）
   - 当前手电筒光源发射点的位置不正确
   - 需要调整到潜水员手持手电的正确位置（通常在身体前方偏右/偏左手位置）
   - 光源位置应跟随角色朝向和 roll 倾斜同步更新

**剩余开发任务**：

- [ ] T1.1 确保不同朝向下的绘制正确性
- [ ] T1.2 真机表现细调（踢水节奏、拐弯协同、局部轮廓）
- [ ] T1.3 实现移动时的 roll 方向身体滚动表现（2D 模拟 3D 倾斜）
- [x] T1.4 修正腿部和脚蹼的造型与踢水动画（腿改为锥形大腿+小腿+膝盖关节；蛙鞋改为贝塞尔开趾蛙鞋剪影；踢水改为髋→膝→踝相位滞后的鞭状传导+柔性尾端反弹；CONFIG.diver 新增 19 个参数并接入 GM 面板"角色"Tab）
- [ ] T1.5 修正手电筒发光位置（跟随手持位置）

### P2：手电筒光照改进——VPL 连续化

- [ ] T2.1 分析当前 VPL 采样点数据结构
- [ ] T2.2 设计连续反射面的插值/连接算法
- [ ] T2.3 在 shader 中实现连续反射面渲染
- [ ] T2.4 处理岩石边缘的反射面断裂（不同岩石之间不应连续）
- [ ] T2.5 性能测试与优化
- [ ] T2.6 GM 面板参数调整

### P3：生命系统增强

- [ ] T3.1 重构氧气消耗公式（基础 + 运动系数 + 撞墙惩罚）
- [ ] T3.2 实现呼出气泡粒子效果
- [ ] T3.3 气泡频率与氧气消耗率关联
- [ ] T3.4 与音频系统联动（呼吸声接入，需扩展 AudioManager SFX 通道）
- [ ] T3.5 GM 面板参数调整

### P4：地形序列化系统 🔴 高优先

**问题描述**：
当前迷宫地图完全依赖 `Math.random()` 生成，无法重现同一张地图。需要设计一套编解码系统，将地图结构和玩家进度序列化为一串字符串，支持精确还原。

**目标场景**：
1. **存档恢复**（本需求是基建，缓存需求另提单）：退出小游戏或程序崩溃后，下次回来能继续同一张图
2. **好友分享**（本需求是基建，社交需求另提单）：分享链接或二维码，好友可以游玩一模一样的地图

**设计方案：种子 + 增量快照**

#### 核心思路

将序列化数据分为两层：

- **种子层（Seed Layer）**：一个整数种子，通过确定性 PRNG 重建完全一致的地图结构
- **进度层（Progress Layer）**：玩家在这张地图上的所有运行时进度数据

两层组合后编码为一个紧凑字符串。

#### 种子层设计

引入确定性伪随机数生成器（PRNG），替换迷宫生成中所有 `Math.random()` 调用：

- 选用 **xoshiro128** 或 **mulberry32** 算法（轻量、周期长、分布均匀）
- 种子为 32 位无符号整数（约 42 亿种地图）
- 同一种子 + 同一版本的生成算法 = 完全一致的地图结构（包括墙体位置、额外装饰圆、场景主题、NPC 位置等）
- `generateMazeMap()` 新增可选 `seed` 参数；不传时自动生成随机种子
- 场景主题生成（`mazeScene.ts`）同样接入 PRNG

**种子层保证的一致性**：
- `mazeMap`（网格结构）
- `mazeWalls`（所有墙体圆心、半径、额外装饰圆）
- `exitX/Y`、`npcInitX/Y`、`spawnX/Y`
- `sceneThemeKeys`、`sceneThemeMap`、`sceneBlendMap`、`sceneStructureMap`

#### 进度层设计

进度层记录玩家在这张地图上的所有可变状态：

| 数据项 | 编码方式 | 说明 |
|--------|----------|------|
| `mazeExplored` | RLE 位图压缩 | 100×100 = 10000 bit，RLE 后通常 < 500 字节 |
| `rope.ropes[]` | 每条绳索：起点墙索引 + 终点墙索引 + 路径关键点 | 绳索路径可用墙体索引 + 简化路径表示 |
| `markers[]` | 每个标记：类型(2bit) + 附着类型(1bit) + 位置数据 | 岩石标记用墙索引+角度，绳索标记用绳索索引+t值 |
| `diveCount` | varint | 已完成下潜次数 |
| `npcFound` | 1 bit | 是否已发现 NPC |
| `maxDepthReached` | uint16 | 历史最深 |
| `totalRopePlaced` | uint16 | 累计铺绳数 |
| `discoveredThemes[]` | 位掩码 | 已发现主题（最多 8 个主题，1 字节） |
| `diveHistory[]` | 紧凑结构体数组 | 每条记录约 8~12 字节 |
| `player.x/y` | uint16 × 2 | 玩家当前位置 |
| `player.angle` | uint8（角度/256映射） | 玩家朝向 |
| `player.o2` | uint8 | 氧气百分比 |
| `npc.state` 相关 | 几个标志位 | NPC 救援状态 |

#### 编码格式设计

```
[版本号 1B][种子 4B][进度数据长度 2B][进度数据 NB][校验和 2B]
```

- **版本号**（1 字节）：编解码格式版本，支持未来扩展和向后兼容
- **种子**（4 字节）：32 位无符号整数
- **进度数据**：二进制紧凑编码，内部按 TLV（Type-Length-Value）组织，支持未来新增字段
- **校验和**（2 字节）：CRC16，防止传输损坏

最终输出为 **Base64url** 编码的字符串（URL 安全，可直接放在链接参数或二维码中）。

#### TLV 进度数据内部格式

```
[Tag 1B][Length 1~2B][Value NB] [Tag][Length][Value] ...
```

预留 Tag 值：
- `0x01` = explored 位图
- `0x02` = 绳索数据
- `0x03` = 标记数据
- `0x04` = 下潜统计（diveCount, npcFound, maxDepth, totalRope）
- `0x05` = 下潜历史
- `0x06` = 已发现主题
- `0x07` = 玩家位置与状态
- `0x08` = NPC 状态
- `0x09~0xFF` = 未来扩展保留

解码时遇到未知 Tag 直接跳过（Length 告诉跳多远），实现向前兼容。

#### 两种使用场景的编码差异

| 场景 | 包含种子层 | 包含进度层 | 典型长度 |
|------|-----------|-----------|----------|
| 好友分享（空白地图） | ✅ | ❌ | ~10 字节 → Base64 约 16 字符 |
| 存档恢复（带进度） | ✅ | ✅ | ~200~2000 字节 → Base64 约 300~3000 字符 |

好友分享只需要种子，对方拿到种子后本地重建地图即可。
存档恢复需要种子 + 完整进度。

#### 扩展性设计

- **版本号**：格式变更时递增版本号，解码器根据版本号选择对应解析逻辑
- **TLV 结构**：新增数据类型只需分配新 Tag，旧版解码器自动跳过未知 Tag
- **种子兼容性**：如果生成算法变更导致同种子产生不同地图，需要在版本号中体现；同版本号下种子必须产生一致结果
- **压缩**：进度数据较大时可选用 LZ4 或简单 RLE 压缩，压缩标志位放在版本号的高位

**任务拆分**：

- [x] T4.1 实现确定性 PRNG 模块（`src/core/SeededRandom.ts`）
  - mulberry32 算法
  - 提供 `srand()`、`srandInt(min, max)`、`srandRange(min, max)`、`srandPick(arr)` 接口
  - 模块级活跃实例机制：`setActiveSeededRandom(seed)` / `clearActiveSeededRandom()`，无活跃实例时 `srand()` 退化为 `Math.random()`
  - 单元测试：同种子多次调用产生完全一致的序列
- [x] T4.2 改造 `generateMazeMap()` 接入 PRNG
  - 新增可选 `seed` 参数；不传时用 `generateRandomSeed()` 自动生成
  - 替换 `map.ts` 中全部 81 处 `Math.random()` 为 `srand()`
  - 外层函数用 try/finally 保证激活和清理，内层 `buildMazeInternal` 保留原逻辑
  - 返回值新增 `seed` 字段
- [x] T4.3 改造 `createMazeSceneData()` 接入 PRNG
  - `mazeScene.ts` 中 2 处 `Math.random()` 替换为 `srand()`
  - 由 `generateMazeMap` 外层同一个 PRNG 驱动（同 seed 下场景主题也完全一致）
- [ ] T4.4 实现序列化编码器（`src/core/MapCodec.ts`）
  - `encodeSeedOnly(seed): string` — 纯种子编码（好友分享用）
  - `encodeFullState(seed, state): string` — 种子 + 进度编码（二维码/链接场景用）
  - 二进制打包 + CRC16 校验 + Base64url 输出
  - **暂不急**：当前 v3 存档走 wx.storage JSON 已足够；MapCodec 主要用于 URL / 二维码场景
- [ ] T4.5 实现序列化解码器（MapCodec 配套）
- [ ] T4.6 实现 TLV 进度数据编解码（MapCodec 配套）
- [x] T4.7 接入迷宫逻辑层
  - `resetMazeLogic()` 新建地图分支记录 `mazeData.seed` 到 `state.mazeRescue.seed`
  - `loadMazeProgress()` 读档时调 `generateMazeMap(seed)` 重建完整结构，再把 explored / markers / ropes / player 覆盖上去
  - `saveMazeProgress()` 只存 seed + 进度数据，不再存地图结构
- [x] T4.8 `state.mazeRescue` 新增 `seed` 字段（uint32）
- [ ] T4.9 验证与边界测试（建议后续实机验证）
  - 同种子多次生成一致性
  - 编码→解码→重建→再编码 往返一致性
  - 大量绳索/标记下的存档长度测试
- [ ] T4.10 离线验证脚本（可选）
  - 扩展 `scripts/inspectMaze.js` 支持 `--seed <N>` 参数

**第一阶段已交付**（T4.1 / T4.2 / T4.3 / T4.7 / T4.8）：
- 新建 `src/core/SeededRandom.ts`
- `src/world/map.ts` / `src/world/mazeScene.ts` 全部 `Math.random` 迷宫路径已种子化
- `src/logic/MazeSave.ts` 升级为 v3 种子版，key 改为 `maze_save_v3`
- `src/logic/MazeLogic.ts` / `src/core/state.ts` 接入 seed 字段
- 老 v1 / v2 存档 key 在 `clearMazeSave()` 里会被一起删掉（用户已确认不保留老档）
- 单次下潜存档从 v2 的 ~374KB 降到预期 ~10~30KB，地图结构从存档里完全移除
- `npm run typecheck` 通过

**序列化完整性修复**（第一阶段上线后的三处 bug 修复，确保"同 seed 下场景一模一样"）：

1. **绳子端点丢失（用户实测目击）**：原 v3 存档只扁平化了 `ropes[*].path`，丢失了 `start / end / startWall / endWall / slackFactor / mode` 6 个字段，导致 `RenderRope.ts` 的 `drawNail` / `drawKnot` 在读档后全部失效（端点钉子和绳结不绘制）。
   - 修复：新增 `PackedLiveRope` 结构完整打包 `start / end / startWall(x,y,r) / endWall(x,y,r) / path / slackFactor / mode`；wall 不存对象引用、只存坐标特征；读档时用 `findWallByRef()` 在新 `mazeWalls` 里做最近匹配（容差 2px），找不到就挂 null（宁缺毋挂错）。
   - 对应 `diveHistory[*].ropesSnapshot` 也补了 `start / end` 端点，供岸上回放地图绘制端点钉子。

2. **食人鱼聚集点与骷髅未进种子**：`FishEnemy.ts::generateFishDens()` 里还有 11 处原生 `Math.random()`（聚集点数量 / 位置 / 骷髅数量 / 骷髅岩石选择 / 骷髅角度抖动 / 骷髅尺寸 / 骷髅渲染 seed），导致同 seed 下每次读档骷髅布局都不一样，好友分享时对方看到的骷髅布局也与原作者不同。
   - 修复：11 处 `Math.random()` 全部改 `srand()`；`MazeLogic.ts` 在 `resetMazeLogic()` 新建地图分支和读档分支两处，都用**派生种子**（`seed ^ 0xDEADBEEF`）激活 PRNG 包住 `generateFishDens()` 调用。
   - `fishDens` 从存档里剔除（不再靠 JSON 原样恢复），读档时由派生 seed 确定性重建，真正做到"同 seed 下骷髅形状位置完全一致"。

3. **`ropesSnapshot` 历史快照绳子也丢端点**：`diveHistory[*].ropesSnap` 老实现也只存 path，岸上按次回放地图画到端点钉子时同样缺数据。
   - 修复：新增 `PackedHistoryRope` 结构（start / end / path 三项），与活绳子打包分开；历史快照不需要 wall 引用，因此只补两个坐标端点。

**修复后序列化清单**（全部带复原能力的字段）：

| 类别 | 来源 | 一致性来源 |
|---|---|---|
| `mazeMap` / `mazeWalls` / `sceneThemeKeys/Map/BlendMap/StructureMap` / `exit/spawn/npc 坐标` / `mazeTileSize/Cols/Rows` | `generateMazeMap(seed)` | ✅ 种子 |
| `fishDens`（聚集点 + 骷髅数量/位置/角度/尺寸） | `generateFishDens()` 包在派生 seed 里 | ✅ 派生种子 `seed ^ 0xDEADBEEF` |
| `mazeExplored` | 存档位图 base64 | ✅ 位图 |
| `diveHistory[*]`（含 exploredSnapshot / exploredBeforeSnapshot / playerPath / ropesSnapshot 带端点） | 存档 | ✅ 完整 |
| `state.rope.ropes[*]`（含 start / end / startWall / endWall / slackFactor / mode） | 存档 + wall 最近匹配回挂 | ✅ 完整 |
| `state.markers`（`wallX/wallY` 是坐标对位） | 存档原样 | ✅ 重建无影响 |
| `player.x/y/angle/o2` | 存档 `playerPos` | ✅ |
| `diveCount / npcFound / maxDepthReached / totalRopePlaced / discoveredThemes / currentThemeKey / ...` | 存档 `rest` | ✅ |
| `fishEnemies` 鱼个体 | 下潜时重建 | ✅ 运行时 |
| 粒子、鱼群 AI、入水气泡、相机抖动、闪电特效等运行时随机 | 保留 `Math.random` | ✅ 不影响地图结构 |

**修复涉及文件**：
- `src/logic/FishEnemy.ts`：`generateFishDens()` 内 11 处 `Math.random` → `srand`，补 SeededRandom import
- `src/logic/MazeLogic.ts`：新建地图分支与读档分支两处，都用派生 seed 包 `generateFishDens()`；读档分支末尾补 fishDens 重建
- `src/logic/MazeSave.ts`：新增 `PackedLiveRope` / `PackedHistoryRope` / `packWallRef` / `findWallByRef` / `packLiveRope` / `unpackLiveRope` / `packHistoryRope` / `unpackHistoryRope`；rest 黑名单加上 `fishDens`
- `npm run typecheck` 通过

---

## 三、依赖关系

```
P1（角色表现）──→ 相机系统（已完成，roll 倾斜将影响手电光源位置）
P3（生命系统）──→ 音频系统（已完成基础框架，呼吸声可复用 AudioManager SFX 通道）
P4（地形序列化）──→ 存档缓存需求（另提单）
P4（地形序列化）──→ 好友分享需求（另提单）
```

---

## 四、当前迭代状态

**当前迭代**：P1 角色表现修复 + P4 地形序列化

**已完成里程碑**（详见 [09-completed-work-archive.md](./code/09-completed-work-archive.md)）：
- 手动挡模式（V1~V5 迭代完成）
- 角色表现第一版（潜水员重绘 + 三轮细调）
- 岩石生成一致性修复
- 悬浮尘埃系统
- 标记系统（轮盘交互 + 三种语义标记）
- **相机系统完整完成**（弹簧臂 + 摇曳 + 前瞻偏移 + 远近自适应缩放）
- 浅水区渲染完整完成（天空 / 阳光 / 焦散 / 丁达尔 / 环境光遮罩连续化）
- 废弃代码清理、GM 面板可拖动可滑动、迷宫 UI 全面重设计
- 迷宫食人鱼系统 + 食人鱼死亡过场卡死修复
- 手动挡转向渐进动画（反向输入先掉头再移动，大掉头阶段允许惯性滑行）
- NPC 救援反馈（呼救气泡+挥手+闪光圈、救援绳节点绳渲染、柔性跟随+超距拖慢玩家）
- **音频系统基础框架完成**（AudioManager + BGM 云存储接入 + SFX 通道 + 入水气泡音效）
- 岸上全屏手绘认知地图重做 + 按次下潜回放
- **迷宫模式本地存档完成**（v1 简化版 → v2 压缩版 → **v3 种子版**：地图结构不再进存档，由 `generateMazeMap(seed)` 从 uint32 种子确定性重建；`src/core/SeededRandom.ts` 提供 mulberry32 PRNG + 模块级活跃实例机制；`src/world/map.ts` 81 处 + `src/world/mazeScene.ts` 2 处 `Math.random` 全量种子化；`maze_save_v3` key 下单次下潜存档从 v2 的 ~374KB 降到预期 ~10~30KB，彻底解决 Android 端单 key 超限问题；同种子可完全重建同一张地图，为后续好友分享地图打下基础）
- **氧气瓶拾取系统完成**（迷宫模式：氧气瓶贴在岩石表面，食人鱼聚落高概率、全图低概率散落；轮盘按住确认安装；触发后飞瓶 → 气泡爆发 → 全屏绿色辉光 → 氧气条上涨动画 → "+X%" 跳字；新增 `src/logic/OxygenTank.ts` + `src/render/RenderOxygenTank.ts`；生成走派生种子 `seed ^ 0xCAFEBABE`，已消耗瓶子用 `consumedTankIds` 列表随存档持久化，同 seed 内不会重新出现）

**下一步优先**：
1. P1 角色表现修复（T1.3 roll 滚动、T1.4 腿部脚蹼、T1.5 手电位置）
2. P4 地形序列化系统剩余任务（T4.4/T4.5/T4.6 MapCodec 编解码器——仅在需要做好友分享链接/二维码时再做；当前 wx.storage JSON 存档已够用）

---

## 五、注意事项

1. 每次迭代完成后必须运行 `npm run typecheck` 确认无 TypeScript 报错
2. 涉及 GM 面板的改动，新增参数统一在 `GMConfig.ts` 的 `TABS` 中添加
3. 涉及状态新增的改动，必须同步检查 `resetState()` / `resetGameLogic()` / `resetArenaLogic()` / `resetMazeLogic()`
4. 光照相关改动需要注意手机端 WebGL 兼容性（`preserveDrawingBuffer: true`、`gl.flush()`）
5. **修改 `.glsl` 源文件后，必须运行 `node scripts/buildShaders.js` 重新生成 `.glsl.ts`**，否则运行时 shader 仍是旧版本
6. **P4 种子兼容性**：一旦种子系统上线，`generateMazeMap()` 的算法变更必须同步递增编码版本号，否则旧种子会产生不同地图
7. **云存储新上传文件默认权限限制**：向云开发云存储新上传的文件默认是"仅创建者可读写"，小游戏运行时读取会报 `STORAGE_EXCEED_AUTHORITY`。每次上传新音频/图片资源后，必须在云开发控制台把该文件权限改为"所有用户可读"或设置 bucket 级的读公开规则，否则无法通过 getTempFileURL 访问
