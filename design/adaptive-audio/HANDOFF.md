# 分层音乐后续优化交接

更新：2026-10-18，当前 Signal Below VII。只改音频与试听工具，游戏视觉仍暂缓。上次 VI 版提交为 99d26b4；本轮 VII 已获用户认可（“太棒了，提交！”）并授权提交。

## 最新用户反馈

- 实际返程像只有旋律，所有底轨和声不明显。
- 发现/返程差异不清楚；用户误以为发现仅是寻找升八度。
- 听不出过门，第五级仍太晚。授权综合音乐短过门与玩法入镜预判，允许略微提前，优先视听一致。

## 问题核对与 VII 修改

1. VI 的发现/返程已是不同 PCM，但共享大部分旋律和和声，和弦弦乐增益仅 .036–.045、起音又慢；返程撤掉全部层后主旋律盖住和声。VII 在三态底轨内加入每小节第1/3拍的中音区和弦与低音，12ms柔软起音；降低旋律相对电平。中低音和弦不再依赖探测器第二层存在。
2. 发现保留 VI 大调改写，并非简单升八度。返程仍与发现同主题，但偶数小节只保留两音动机、奇数小节一音长答句，旋律降低一八度，末两小节和声/低音回到主和弦根音。原各版发现和声保持：A F(add9)/C-E/Bbmaj9/F-C；B F(add9)/Am7/Bbmaj9/C6；C F/Bb6-9/Gm9(no3)/F(add9)，B/C随版本移调。
3. 全部主题和声/旋律 RMS 比约1.2–2.1，非主观可听性保证。四级/五级混音为增强后的和声腾出峰值空间，不逐文件归一化。新增真实声部拆分：theme-{search,found,return}-{harmony,melody}.wav，拆分相加即完整底轨。
4. 不再为五级等两小节（旧上限4.025s）。planDiscoveryEntry 预测到达附近的入口：优先半小节；半小节距离预计入镜超过350ms时用一拍入口。比预计入镜最多提前120ms；已入镜时排程等待最多525ms。第五层140ms展开，整套其他有音高配器300ms交接；第四层仍小节进入。这里是音频时钟排程界限，不含真机输出延迟。
5. 过门重写成完整一拍500ms手势：两下短击→加密滚奏→末端收束，无固定音高，增益.65；提前排程、最多使用最后一拍，不再播2秒弱滚奏。等待不足一拍从末段起播，加12ms消点击；等待不足120ms直接短展开，避免临时硬塞鼓花。
6. rescueTargetEntrySeconds 做角色身体与实际视口的扫掠相交时间，考虑当前缩放/摇曳与角色-相机相对速度，最多1.1s；两轴相交区间避免斜向错过/高速穿屏漏判。每帧复核，预判失效立即撤销；到达估计明显偏移时修正排程，最后80ms锁定入口以免无限推迟。已实际入镜后保持发现情绪，屏幕边缘120ms保持消抖；历史 npcFound 不授权新下潜高潮。游戏发现提示仍只看实际入镜。
7. 绑好确认音保留，音乐短暂降到72%，550ms内恢复，不再压低整段2.2s确认尾音。返程主题650ms交接，暖色伴奏1.5s收束。死亡已认可的duang与6.4s余音不改，死亡时背景60ms收束为强撞击让出余量；静音/后台、死亡停止成功尾音等保持。
8. A/B/C仍在GM探知仪切换，按需合成；准备期间旧版继续，新版就绪旧版500ms淡出，快速选择只提交最新。

## 试听

打开 listen.html（localhost:8765）：
- 顶部 undertow/theme-colors.wav：48s，0s寻找/16s发现/32s返程。
- archive-v6/theme-colors.wav：上次实际版本，供同音量对照。archive-v6/four-to-five.wav 也保留。
- undertow/rescue-journey.wav：40s，0s寻找二级/8s四级/15.5s短过门/16s发现五级/24s绑好返程。
- pickup.wav：单独500ms短过门，实际电平。
- 「拆开听」选择A/B/C与三态，和声/旋律/完整底轨同电平播放。
- 实时「模拟预计0.8秒后入镜」：同一引擎预排、入镜倒计时与音乐等待显示。手动五级代表已入镜请求，自动演示每8s切档。

color-v5-v6.wav 历史对比不再重建，避免把VII错标为VI。archive-v1/v2/v5与旧 reference-study 对照不动。

## 代码与检查

- AdaptiveScore.ts：和弦声部、返程旋律、renderStem可选ThemePart、planDiscoveryEntry、PICKUP_GAIN。
- AdaptiveMusicEngine.ts：12同步循环；setLevel(level,settle,mood,secondsUntilEntry?)，可撤销/修正的短过门。
- AdaptiveMusic.ts / NPCPerception.ts：入镜ETA、实际发现保持、音量让位；MazeLogic继续只看实际入镜。
- AdaptiveCues.ts：500ms过门、musicCueDuck，死亡不改。
- buildAdaptiveAudio.js / adaptiveAudioPreview.html：真实声部导出与试听。
- audio:check：三版PCM/混音/事件/每拍过门峰值、和声旋律能量比与拆分一致、全相位ETA延迟界限、排程/取消/连续帧不饿死、发现/返程/死亡、几何扫掠与快速换版等。

```sh
npm run audio:build
npm run audio:check
npm run platform:check
npm run typecheck
npm run build
```

12循环PCM约18.4MB，过门约48KB；换版暂留两套约37MB，另加临时/原生/事件。恒速模型不能精确预测弹簧镜头加速、突发转向或未来缩放；逐帧修正但不是逐像素/输出延迟同步。未测本版手机生成耗时、峰值内存与设备输出延迟；WebAudio替身与浏览器操作验证不替代用户主观听感验收。

参考「建安一路627号 3.m4a」52.351s、48kHz mono AAC，本地 reference-study/reference-full.wav 忽略不入Git、未外传；原VoiceMemos路径可能失效。full-analysis.json 是信号测量，不标定独立轨或听感。VII为原创合成调整，不声称已达到参考录音。
