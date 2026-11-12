# 三维人物尝试撤回与保留的技术基础 · 2026-11-12

> 最新否定：本轮A/B/C生成方向板因欧美动漫/动画片风格被整体否定，三款均不保留。当前停止生成，先校准视觉语言；不能用换亚洲脸、换衣服延续该图，也不擅自转成日漫/国风。下方流程授权须服从这次打断，不能理解为立即再生成一轮。

> 最新授权：用户已明确由制作方安排美术流程并提出原创主角方向；不再等待用户先想好长相或选择制作方式。INSIDE是表现参考，不照抄瘦长男孩；年龄性别未锁定。先做有限方向板，再按评审结果投入模型。以下保留失败记录，冲突处以[最新流程](../art-production.md)为准。

**本轮两版造型都被用户明确否定，已撤下。没有新人物获美术认可。**

## 用户纠正的目标

- 用户明确指向INSIDE的**小男孩主角**，要灵动的少年气、可辨认的个性，不能只借成人NPC的简化形状。
- 第一版全套灰色潜水衣、头套、厚背心和背瓶把人物盖住，用户认为像普通潜水员/工具人。不要再沿此方向微调。
- 第二版改为露头、露手臂、陶红衣服的少年，但用户再次明确否定：形体瘦弱、姿态趴塌、整体很丑，没有学到参考的感觉。换衣服色块和缩窄四肢不等于完成角色设计。
- 实际观察还暴露出软管状四肢、僵硬发块、头身关系和姿态缺乏控制。**停止使用本轮这套程序拼体块的方法继续猜人物。** 不扩骨骼、游泳、转身或装备细节。
- 下次须先与用户重新确定人物制作方式和可审核的设计依据；不要把下面的技术成功当作美术进展，也不要未经选择又批量生成候选。

官方男孩参考：[Playdead水下画面](https://blog.playdead.com/articles/the_weight_of_detail/hero_boy.jpg)、[原文](https://blog.playdead.com/articles/the_weight_of_detail/weight_of_detail.html)。参考中的形体、姿态和视觉完成度没有被本轮草模实现。

## 当前已经撤回什么

两份`.blend`、造型生成脚本、草模fixture和专用预览构建脚本不留在项目当前源码/设计目录，只放在被Git忽略的`node_modules/.cache/diver-volume/rejected-adult/`与`rejected-youth/`供排查。它们不作为设计资产继承。截图与测试输出同属忽略缓存，不提交。

原游戏人物未被正式替换。`scripts/buildContinuousGameplayPreview.js`和`package.json`恢复本轮之前版本；正常评审不再加载模型。缓存中的`diver.html`仅显示撤回通知，并提供返回当前洞室的链接。

## 保留的确定工作

- MacBook Pro M3 Pro / 36GB、Blender 5.3.0已实测可运行。使用独立后台进程，未覆盖用户打开的Blender会话或安装其他软件。
- `scripts/exportDiverVolume.py`：读取指定collection的evaluated mesh，应用世界变换/逆转置法线和负缩放绕序，输出带计数、边界、哈希与来源清单的DVOL v1。校验有限数、法线、索引、退化三角和预算；不修改或保存源`.blend`。
- `VolumeActorPass`：可选的外部角色渲染接口，使用洞室已有的深度与光照通道。默认没有factory、模型、下载器或运行时资产。
- 只有当前帧三维角色绘制并合成成功时，才省略二维主玩家。禁用、离开三维洞形、错误或图形恢复过程中回退原人物；NPC不受影响。
- 静止复用网格，revision变化才重绘；图形恢复后由factory重建。接口支持阴影绘制，但并不等于人物投影已经制作完成。

导出其他已准备好的模型时（把示例路径替换为真实文件，collection默认为`DIVER_EXPORT`）：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b /path/to/character.blend \
  --python scripts/exportDiverVolume.py -- \
  --output node_modules/.cache/diver-volume/asset --collection DIVER_EXPORT
```

DVOL v1：小端40字节header；每顶点24字节（float32位置、SNORM16法线、线性UNORM8 RGB）；Uint16三角索引。坐标保持Blender世界坐标，不隐式转轴。导出采用当前dependency graph的modifier设置，本机测试为VIEWPORT；须把viewport级别设成要导出的级别。本格式暂无蒙皮、动画、透明材质或纹理，不能称完整人物资产管线。

## 验证与未解决项

类型检查、原生启动、包体，以及既有鱼/绳浏览器回归通过。接口的缓存、错误回退、图形恢复、真实洞形切换与取消覆盖通过；可重复运行`node scripts/checkVolumeActorBrowser.js`。导出器用独立临时模型验证了modifier、隐藏对象排除、负缩放、确定性、错误退出和源文件不变。

当前包体估算8,228,868字节，相对基线增加3,652字节；扣128KiB安全量后剩28,668字节。没有把模型或大型依赖放入手机包。上述桌面检查不代表微信真机性能。

**灯具挂点仍待以后单独解决**：现有三维手电原点在玩家中心，实体身体可能挡住自己的光。撤回的草模只接收共享灯光/阴影，默认未向自身手电阴影图投影；不能声称完整角色投影已完成。活动绳和交互挂点、身体动画、人物在洞口的碰撞空间也未接入。
