# 分层音乐后续优化交接

更新：2026-10-18。当前阶段是可运行的原创程序化音乐试听与游戏接入，用户已确认手机可以运行。本文件供同一项目的新对话继续工作。

## 已确认的方向

- 微信小游戏中的生命信号探测器，用离散的五档音乐层替代连续变频探测声。基础旋律持续循环，接近目标时叠加节奏层。
- 用户需要电子音乐与类似弦乐的旋律：幽暗、有张力，可带微光；接近被营救者时必须激昂、带劲，避免轻松欢快的色彩。
- 当前第三版已获用户反馈“感觉对很多了”。第五轨已强化为明显的前景疾奏，后续保留这一兴奋感。
- 下一轮用户会提供参考视频的完整录音。目前只有约 13.7 秒的最终五层混音参考，没有独立轨，不能据此声称听出了每一条音轨。

## 当前实现

游戏默认 A「深流」D 小调；试听还有 B「微光奔涌」E 小调、C「最后航线」C 小调。统一时钟 120 BPM、4/4、8 小节，循环 16 秒。主要音型密度依次为 30、60、120、240、1200 次/分钟；最高档每拍十个起音、每秒二十次，并不是整体速度改成 1200 BPM。

六轨为 bed / beacon / bass / drums / arp / spark。六个循环音源同时开始，按下一拍切换增益，预留 25ms、渐变 90ms。五级混音为 `[0.72, 0.78, 0.9, 1, 0.55, 1]`，让第五轨突出，退出五级恢复原混音。

运行时是 TypeScript 编译的 JavaScript，通过 `wx.createWebAudioContext()` 在内存合成 PCM，首次用户交互后分块计算，写入音频缓冲；每批约 5ms 预算，六轨 Float32 缓冲约 9.2MB，另有临时和原生内存开销。游戏不运行 Python/Node，不读取导出的 WAV，也不需要上传这些 WAV。浏览器兼容标准 AudioContext。尚未实测手机首次合成耗时和峰值内存。

`design/adaptive-audio/` 的 WAV 是开发试听和复现资产，已在微信打包配置中排除；原有云端 BGM/音效系统仍按项目既有方式运行。Python 仅用于本地参考录音的信号分析。

## 代码入口

- `src/audio/AdaptiveScore.ts`：三版乐谱、合成器、离线/分块渲染、各级混音。
- `src/audio/AdaptiveMusicEngine.ts`：同步循环、按拍切层、静音、音频时钟。
- `src/audio/AdaptiveMusic.ts`：微信上下文、预热、游戏状态及距离接入。
- `src/logic/LifeDetector.ts`：距离分档、旧探测音回退、现有指示灯脉冲。
- `src/core/config/gameplay.ts`、`src/gm/GMConfig.ts`：开关、音量、滞回；默认启用 A 版。
- `game.ts`、`src/core/input.ts`：逐帧更新与首次交互预热。
- `src/core/WindowMetrics.ts`：共享窗口尺寸缓存、现代/旧微信接口和兜底；`src/core/config/base.ts`、`src/render/Canvas.ts` 使用它。
- `scripts/buildAdaptiveAudio.js`、`scripts/adaptiveAudioModules.js`：从同一份 TS 合成导出 WAV 与试听页。
- `scripts/checkAdaptiveAudio.js`、`scripts/checkWindowMetrics.js`：音乐与窗口兼容校验。

## 试听与验证

打开 `design/adaptive-audio/listen.html`。每版提供纯底轨、最高档、逐级叠加、第四到第五档以及第五轨独奏。逐级示例每 8 秒升一档，40 秒进入第五档。`reference-study/four-old-five-new-five.wav` 依次播放四级、旧五级、新五级，每段 8 秒；是原创合成稿对比，没有采样用户录音。

`archive-v1/` 和 `archive-v2/` 保存历史试听与源代码，供回听比较。`reference-study/reference-analysis.wav` 是用户录音的本地解码副本，已忽略，不入 Git；信号分析数据保留。当前环境未直接主观听取录音，已有判断来自用户反馈、信号分析及乐谱；不要把频谱测量当成听感结论。

```sh
npm run audio:check
npm run platform:check
npm run typecheck
npm run build
```

需要重新导出试听时运行 `npm run audio:build`。检查覆盖 PCM/WAV 一致性、峰值/接缝、最高层起音密度、音乐控制与窗口兜底；Web Audio 使用替身测试，不代表真机播放验收。

此前手机远程调试的 `getSystemNanoTime` 异常出在微信基础库远程性能记录链路。建议普通预览扫码后，用户确认手机可运行；不能据此说远程调试自身已修复。未修改微信安装目录或基础库。

## 下一阶段用户意图（尚未实施）

1. 收到完整参考录音后，分析各层进入方式、音色与情绪递进，继续优化原创音乐。
2. 改善四到五级的过渡，同时保留第五级明显的激动感。目前主要音型密度突然增加五倍、音区上移且混音让位，只有 90ms 渐变；尚未决定是加强第四轨、加入过门还是调整切换编排。
3. 探索类似鲸鱼钟声的声音，用于入水、死亡等事件。用户提出的是创意，具体声音与触发方案待结合完整参考确定；目前仍是原有事件音效。
4. 设计配套节拍可视化。已有 `getAdaptiveMusicClock()`，可读 `playing / level / requestedLevel / beat / bar / beatPhase / subdivisionPhase / pulse / bpm`。`beat` 是累计拍号，`bar` 循环 0–7；未校准设备输出延迟，主网格脉冲不等于所有乐谱事件。尚未新增可视化样式。

注意情绪触发的游戏语义：当前第五档由距离决定，默认最大范围 4000px、滞回 0.03，接近到约 746px 时可以进入；实际 `npcFound` 在 160px 内触发。因此第五档目前代表“接近”，未必等于“发现被营救者”。下一轮应结合用户希望的高潮时机讨论。

建议新对话起始请求：

> 先读 design/adaptive-audio/HANDOFF.md 和 README.md，继续优化分层音乐、钟声事件、第四到第五档过渡及节拍可视化。我会提供完整参考录音；保留当前第五轨的兴奋感。
