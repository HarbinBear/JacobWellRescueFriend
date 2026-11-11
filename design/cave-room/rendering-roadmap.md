# 渲染与角色制作研究 · 2026-11-12

本文最初随编网退回二维、真实受力显示与黄色绳材质修复建立。以下是查证和后续方案，不代表已经实现。用户现已明确以INSIDE为主要学习标杆；完整资料阅读状态和跨渲染/美术/动画/音频的项目映射见[INSIDE学习基线](../inside-study/README.md)。入口见根目录 `HANDOFF.md`、`ToDo.md`。

## 当前事实

- 洞壁、两种鱼、固定引导绳/编网使用三维网格，共享深度和手电阴影；玩法位置、碰撞、绳结仍以二维平面为准。
- 目前申请平台MSAA，桌面浏览器实测4样本。没有TAA或FXAA；手机支持、显存和帧率待实测。
- `volumetricFrag.glsl` 用二维世界坐标与扇形遮挡距离构造水中散射近似，没有沿三维相机射线积分，也没有时间历史缓冲。三维表面照明不等于已有三维体积雾。
- 人物、绳结、墙锚、活动绳仍是二维。渲染立体化不要求立刻把移动/碰撞全部改成自由三维，但不能随机赋予视觉z后仍让不同深度的物体相撞。

## Playdead 原始资料

[官方演讲索引](https://blog.playdead.com/articles/inside_presentations/inside_publications.html)收录以下原始资料；已核对PDF页面，临时下载/截图放在被忽略的缓存目录。

- Mikkel Gjøl、Mikkel Svendsen：[Low Complexity, High Fidelity: The Rendering of INSIDE](https://github.com/playdeadgames/publications/blob/master/INSIDE/rendering_inside_gdc2016.pdf)，[GDC原演讲](https://www.gdcvault.com/play/1023002/Low-Complexity-High-Fidelity-INSIDE)。PDF第28页白噪声、第31页蓝噪声示例是每条射线3次采样；第38页半分辨率体积光及深度感知上采样，第40页TAA积累。**第41页最终性能展示是半分辨率6次采样、1080p下0.75ms**，不是我们设备的性能承诺。另一个防色带dithering章节用途不同，不能把它混成“最后叠一层噪点”。
- Lasse Jon Fuglsang Pedersen：[Temporal Reprojection Anti-Aliasing in INSIDE](https://github.com/playdeadgames/publications/blob/master/INSIDE/GDC2016_Temporal_Reprojection_AA_INSIDE.pdf)，[官方开源实现](https://github.com/playdeadgames/temporal)。第18—19页包含深度重建与动态速度，第23—27页讨论历史失效、拖影与邻域裁剪，第41页列出相机抖动、重投影等组成。源码面向Unity 5，不能直接放入当前WebGL1。
- 补充纠正：已找到[官方动画原稿](https://docs.google.com/presentation/d/1QN99FZUQl3KE4c7eg9-GLLEl3Og0FqreJbiTrCc8ZAk/htmlpresent)，第19–20页含鱼的高层例子：游动/逃跑动画，以及代码控制反应、跟随、避让、寻路。仍未得到完整算法或源码；末尾生物的Huddle也不等于鱼群算法。以下鱼动作设计是本项目方案，不冒称复现INSIDE。

TAA的优势在于跨帧累积，对细节闪烁、低采样噪声和运动稳定性更有帮助；代价是历史缓冲、重投影、动态物体处理，失配会拖影或变糊。MSAA主要处理几何边缘，不能解决全部着色闪烁。不能仅按名字断言TAA在当前游戏一定更好。

## 建议的制作顺序

后续纠正：两个程序造型小样均被否定，人物美术不可按下面的旧计划自动扩充。先与用户重新确定制作方式；可选角色pass和Blender静态导出已验证，暂无获认可的模型。详见[撤回记录](../diver-volume/README.md)。

1. **人物美术小样**：以INSIDE的体块、留白和环境统一为主要参考，先做可编辑的三维潜水员，在实际洞穴镜头下展示比例、装备轮廓、侧/背面与手电转面。转台只用于造型检查，通过后再做可打断转身和短游动；程序拼接人体只用于技术验证，不沿已否定的V01制作。
2. **补角色资产管线**：用Blender制作/修整网格、骨骼、权重与动作，保留`.blend`母版，导出GLB，再离线转为项目必要的紧凑数据。初始可试2–4千三角形、20–24根变形骨骼、1–2材质，预算以真机结果调整。悬停、慢游、快游、转身先少量制作；运行时负责动作混合、手电瞄准、受力反应。须接入蒙皮、阴影、加载和释放。当前已安装Blender并验证静态网格导出，但没有获认可的模型或glTF/蒙皮运行时；工具不能代替造型和动画审核。[Blender导出说明](https://docs.blender.org/manual/en/5.2/addons/scene_gltf2.html) · [Khronos蒙皮说明](https://github.com/KhronosGroup/glTF-Tutorials/blob/main/gltfTutorial/gltfTutorial_020_Skins.md)
3. **鱼的状态与动作配合**：以已有一条实体鱼做短录像。速度决定摆尾幅度与频率，急转有身体弯曲和预备动作，滑行有停尾段，入网挣扎跟随真实接触。保留既有碰撞，不用随机漂移掩盖动作问题。
4. **三维体积光小场景**：先提供相机深度，复用手电阴影做低分辨率介质积分、蓝噪声采样、深度感知合成；正确后再接时间重投影。当前混合Canvas/多WebGL画布，二维前景没有完整深度和运动矢量，先做全画面TAA会扩大工程范围。

上述每项独立验收，不能一次全开。始终保留幽蓝、暗处留白、角色近身可见度与窄束手电；不用全室照亮或削平洞壁换取容易照明。当前包体已接近上限，引擎依赖、纹理和模型都先算预算。

## 减少下一轮上下文

完成当前提交后，在同一项目新建对话，读 `HANDOFF.md`、`AGENTS.md` 和本轮相关ToDo即可；不复制整个旧聊天。Mac默认新对话快捷键为⌘N，分叉则会继承旧历史，不适合只想带最小交接的情况。[命令说明](https://learn.chatgpt.com/docs/reference/commands) · [上下文/分叉说明](https://developers.openai.com/blog/mastering-codex-remote-for-engineering)

长对话支持压缩，不能把界面显示的全部历史直接当作每轮实际计费上下文；新对话也不能承诺固定节省比例。这里推荐短交接是为减少无关历史与反复检索，不是计费测量。
