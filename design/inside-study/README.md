# INSIDE 学习基线与项目映射 · 2026-11-12

用户已明确把 Playdead《INSIDE》作为本项目的主要学习标杆：简洁、留白、空间与人物统一，以及动画、声音、性能、场景叙事的整体完成度。此前潜水员 V01 已否定；五款游戏的横向比较也没有帮助确定更好的方向。接下来围绕 INSIDE 深入学习，不继续靠相近游戏列表或生成侧面贴片猜风格。

本轮完成公开资料的第一轮原文核对与项目映射，未改运行代码、未制作新人物。下面明确区分原作者方法、本项目现状与我们的适配方案。已读资料不等于已掌握全部制作经验；静态幻灯片也不等于观看了演示或听到了最终声音。

## 资料目录与本轮阅读深度

总入口：[Playdead 官方 INSIDE 分享索引](https://blog.playdead.com/articles/inside_presentations/inside_publications.html)。页码均从文件第一页或 HTML 幻灯片第一页开始计数。

| 分享 | 阅读状态 | 重点 |
| --- | --- | --- |
| [Low Complexity, High Fidelity](https://github.com/playdeadgames/publications/blob/master/INSIDE/rendering_inside_gdc2016.pdf) | 原始 PDF 218页，重点核读6–72页，后部检索，关键图页核对 | 雾、体积光、精度、光照工具 |
| [Stutter Free 60 FPS](https://docs.google.com/presentation/d/1dew0TynVmtQf8OMLEz_YtRxK32a_0SAZU9-vgyMRPlA/htmlpresent) | HTML原稿127页，重点读1–76页；未完整研究后部Unity脚本微优化 | 分区加载、分帧初始化、自动回放与分析 |
| [A Game That Listens](https://www.gdcvault.com/play/1023731/A-Game-That-Listens-The) | 核对官方介绍；未观看完整演讲 | 游戏与声音双向反馈 |
| [Temporal Reprojection AA](https://github.com/playdeadgames/publications/blob/master/INSIDE/GDC2016_Temporal_Reprojection_AA_INSIDE.pdf) | 沿用此前已核对原稿，详见渲染研究记录；本轮未重复全文审读 | 历史重投影、失效与抗锯齿 |
| Huddle Up! | 官方索引与主题已核对，PDF已缓存，未深入解析 | 特殊生物；不能替代男孩或鱼的动画资料 |
| [Subtleties of INSIDE](https://konsoll.org/talks/subtleties-of-inside/) | 核对官方条目；视频未取得可读字幕，不编时间点 | 后续补看实际细节演示 |
| [Banding in Games](https://github.com/playdeadgames/publications/blob/master/INSIDE/banding_in_games.pdf) | 原始PDF69页正文/备注，关键图页核对 | 量化与抖动噪声 |
| Custom Pixels | 官方索引已登记；原始PPT待深入 | 定制Unity渲染 |
| [INSIDE Shipping on iOS](https://github.com/playdeadgames/publications/blob/master/INSIDE/inside_shipping_on_ios.pdf) | 原始PDF101页正文/备注，关键图页核对 | 持续性能、预热、移动带宽与图像回归 |
| [The Boy From INSIDE](https://github.com/playdeadgames/publications/blob/master/INSIDE/schmid-AES_2016-The_Boy_from_INSIDE.pdf) | 原始PDF86页文字审读，关键图页核对 | 人物动作声音、状态分析、呼吸 |
| [The Playdead Approach to Audio](https://github.com/playdeadgames/publications/blob/master/INSIDE/schmid-ITU_2016-INSIDE_Audio.pdf) | 原始PDF62页文字审读，关键图页核对 | 音频架构与动作/环境输入 |
| [Unbreaking Immersion](https://github.com/playdeadgames/publications/blob/master/INSIDE/schmid-Wwise_2016-INSIDE_Audio.pdf) | 原始PDF73页文字审读，关键图页核对 | 呼吸反馈、相位协调、切场连续性 |
| [Turn it Down 90%](https://github.com/playdeadgames/publications/blob/master/INSIDE/turn_it_down_90pct.pptx) | 原始PPTX57页正文及讲者备注，核对slide/notes对应 | 特效的信息密度、注意力与环境一致性 |
| [Animation & Computerspil](https://docs.google.com/presentation/d/1QN99FZUQl3KE4c7eg9-GLLEl3Og0FqreJbiTrCc8ZAk/htmlpresent) | HTML原稿34页，含丹麦语讲者备注 | 短动作、可打断转向、关注点、接触 |

另读了4篇官方美术文章：[The Bits and Pieces](https://blog.playdead.com/articles/the_bits_and_pieces/bits_and_pieces.html)、[The Lighting of INSIDE](https://blog.playdead.com/articles/the_lighting_of_inside/lighting_of_inside.html)、[The Weight of Detail](https://blog.playdead.com/articles/the_weight_of_detail/weight_of_detail.html)、[The Starfish Rig](https://blog.playdead.com/articles/StarfishRig/StarfishRig.html)。这4篇已读正文；网页中的全部动态示例未逐一实测。

原始文件、文字提取与检查截图只放 Git 忽略的 `node_modules/.cache/inside-study/`，不复制进手机包或提交资料压缩包。

## 最重要的制作认识

### 形状和光照都经过美术取舍

《The Bits and Pieces》说明作者不断删减环境与物件，保留构图及玩法/叙事重点，后加细节也保持低对比；文中的多数道具使用很简单的材质。《The Lighting of INSIDE》则说明其大量局部反弹光、高光、轮廓光和AO效果由美术手工布置，并利用受控侧视镜头细调。这不是一套自动全局光照系统替美术完成了构图。

**对我们的适配判断**：程序生成负责产出可通行且可信的洞形，美术约束仍要决定哪里留空、哪里形成主体、哪些轮廓可见。可以把这些约束做进洞室模板和生成规则，不能指望增加噪声、岩纹、粒子或统一亮度自然产生这种完成度。现有幽蓝、窄束手电、近身补光及局部钟乳石方向继续保留。

手绘人物与三维场景在技术上可以混合，但本项目当前选择原生三维人物来统一体积、灯光与遮挡。INSIDE自身同样依赖原画和美术判断；使用三维资产不代表可以省掉造型设计。

### 特效服务画面中的观察重点

VFX分享4–7页调整水面效果，使其取自当前场景；12–13页降低雨的显眼度，14–15页让烟的明暗色融入环境；20–26页逐步删掉粒子的高频和彩色细节；46、51、55页说明效果强弱由当时的视觉重点决定。不能把标题理解为所有效果机械乘以0.1。

**项目方案**：人物先看头、躯干、气瓶、脚蹼的大轮廓和转面。气泡、反光、绳上提示等再逐项检查是否遮住主体。这个标准需要实际游戏镜头验收，不能只凭单张棚拍式人物图判断。

### 动作是可打断的状态表达

动画原稿9–15页讨论直接输入响应、短片段/循环/混合、专门的180°转身和可打断性；22–28页讨论呼吸叠层、头/上脊柱关注点、预测接触与IK、情境反应。它们为角色在空间里的意图提供细节。

**重要纠正**：19–20页确有鱼的高层例子：游动/逃跑两类动画，以及代码控制反应、跟随、避让、寻路。此前只找到Huddle而没找到这份正文；现在能引用这项结构，但仍没有完整鱼群算法或源码，不能称本项目鱼为复现。

《The Starfish Rig》的六骨方案着重极简人群，原文也指出膝肘压扁、脚部和脊柱限制。不能据此断言 INSIDE 主角只有六骨，也不适合直接作为需要手掌/绳索交互的潜水员规格。

### 声音可以驱动身体的微动作

音频ITU原稿24–35页与AES原稿9–26页把动作转换、环境和身体关系用于选声；AES29–45页分开分析状态与音频输出，并保留前一帧信息。Wwise原稿21页以呼吸声音事件驱动身体叠层，27–37页渐进协调节奏/相位，48–51页处理重载时的音频连续性。这里的收获是信号与时序的组织方式，安装同一个中间件并不会自动获得相同结果。

本项目已有音频时间驱动磁带/救援动作、入镜预测与可取消音乐排程，不能说还停留在纯单向播放。已获认可的VII版音乐继续保留。明确缺口在 `BreathSystem` / `RenderDiver`：模拟呼吸与人物自身闲置动画未统一，呼吸声还使用另一套播放时间源。

以后可单独验证“呼气声音—胸腔微动作—气泡”这一个事件链。耗氧、浮力保持模拟权威；静音或音频解锁失败不能改变生存规则。潜水动作也不能机械套用INSIDE跑步时的步频/呼吸比例。这些是我们的玩法适配要求。

### 性能要看整段体验与持续负荷

60FPS原稿19–24页把加载初始化分摊到多帧，53–68页用录制输入回放，关联帧时间、内存、子场景和声音事件。其Unity改动和托管堆策略不是JavaScript实现模板。

iOS原稿6、23页说明手机方案采用降低分辨率和30fps，Apple TV 4K另保留60fps，并讨论手机持续60fps的发热；36–38页用实际绘制状态预热；40–56页做沿路线的图像回归；59–70页检查移动GPU的渲染目标切换与带宽。不能把“性能好”当成所有设备都必须锁60或120，也不能把JS执行耗时当成GPU和实际呈现时间。

我们已有分块预加载、分帧网格生成、统计及浏览器回归。连续世界 `Runtime.ts` 已有60Hz固定逻辑步和真实时间累加器，不能误报为未解耦。顶层120Hz请求、逐RAF视觉、旧模式与画质阈值仍要在具体帧率课题里检查；本轮不改它们。

### 场景叙事依赖可感知的因果

《The Weight of Detail》给出同一曲线协调灯光/材质/声音，以及事件引起缓慢环境光变化的例子。动画原稿又提供注视点和情境动作。这些是可核实的“空间和身体响应事件”的制作手段。尚未读完 Subtleties 视频，也没有获得作者完整的叙事脚本系统，不能编造一套INSIDE通用叙事算法。

**项目推论**：程序洞穴若要承载场景叙事，需要受控的线索关系与视线顺序，而不仅是随机撒道具。未来可选一个房间，让灯光发现线索、人物关注和声音变化构成一个短片段；它是另一个独立课题，本轮不扩写剧情。

## 渲染研究的两个纠偏

- Rendering原稿28/31页的3次射线采样是对照示例；41页最终示例为半分辨率6次、1080p约0.75ms，并依赖深度感知上采样和时间累积。现有记录正确；不可换算成微信手机预算。
- Banding原稿32、35–37页说明噪声应参与正确位置/颜色空间的量化过程，末端加颗粒不能修复已有色带。iOS原稿99–101页还纠正了早期噪声分布映射。项目里名为 `getBlueNoise` 的程序序列未做频谱核验，不能因命名就称已经具备相同蓝噪声。

当前人物/二维前景没有统一相机深度与运动历史；WebGL1也不能直接搬Metal/compute实现。原有多画布合成涉及此前iOS正确性修复，不因一次性能研究直接合并或关闭缓冲保留。

## 后续制作建议（已发生纠偏）

**后续状态**：两次程序体块小样均被用户否定。用户明确强调INSIDE小男孩主角的少年感与个性；原生三维技术目标保留，但不能继续沿失败造型方法推进。先与用户重新确定制作方式，详见[撤回记录](../diver-volume/README.md)。下面仅保留原计划，不能直接当下一步授权。

**原生三维潜水员的造型与受光小样。** 先产出可编辑的模型资产，在正常游戏尺寸下看体块、装备轮廓、侧/背面以及现有手电下的转面。转台观察要明确标成造型检查，不冒称完成了角色转身动画。造型通过后，再在同一人物课题中扩悬停、短游、停腿滑行和可打断转向；每步都提前给实际游戏结果。

验收重点：小尺寸轮廓能辨认；人物与洞室共享光照/遮挡；低细节保留可信形体；动作意图清楚；气瓶、面镜、手掌与绳索有可制作的空间关系。主角具体长相没有定案，不从此前否定推断性别或族裔。既有二维移动与交互状态可以继续驱动三维表现。

初始三角面/骨骼数量只是预算假设，由变形质量和手机结果确定；不把六骨、二十骨或某个固定面数当作风格秘诀。当前包体估算8,225,216字节，保留128KiB安全量后只有32,320字节空间。下一人物资产先放外置评审目录，确认方向后再做资源预算，不能直接加一套大型运行时。

## 游戏与工具需求

- **当前研究无需提供整个游戏包体。** 第一轮公开PDF、PPT、文章和动画原稿足够。研究缺口已按条目留下，不假装所有视频均已观看。
- 后续最有用的是可运行的正版INSIDE和可重复到达的场景：起停/急转、游泳/出水、靠墙接触、死亡重生及一个完整环境叙事段。先测动作与视听时序；仅当具体问题需要时再定向检查包体内的网格、骨骼、材质或片段组织。
- 研究当时尚未发现Blender；用户随后安装了Blender 5.3.0，M3 Pro / 36GB Mac已完成后台导出验证。最新工具状态见根目录HANDOFF。Steam应用存在；未见默认RenderDoc或PATH中的ffmpeg。
- 下一阶段确实需要建模/骨骼/权重工具，建议使用[官方Blender](https://www.blender.org/download/)，安装时按[当时的系统要求](https://www.blender.org/download/requirements/)选择稳定版本；保留`.blend`母版并离线转紧凑资产。无需为本轮安装Unity、Wwise或整套反编译工具。工具具备不代表造型已经完成。
- 后续手机性能课题需要目标设备型号及微信真机测试条件；本轮没有据桌面测试承诺手机表现。
