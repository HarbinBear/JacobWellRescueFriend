# 分层音乐后续优化交接

更新：2026-10-18，当前Signal Below VI，仅音频；游戏可视化仍暂缓。旧版用户曾确认可手机运行，用户已试听并反馈“这次进步很大”，授权提交。手机性能/输出延迟仍未系统实测。

## 最新反馈（优先于V版方案）

- V版只是换音色/音区，所有方案仍压抑；发现后需要实际温暖的情绪变化。
- 死亡必须有清楚duang，低沉余音不能取代起音。
- 第五层仍太突兀，音乐时机应看小节/乐句段落，不能只等任意正拍。

## VI版实现

1. 发现/返程从原D/E/C小调改写为相对F/G/E-flat大调。和弦进行不同：A F(add9)/C-E/Bbmaj9/F-C；B F(add9)/Am7/Bbmaj9/C6；C F/Bb6-9/Gm9(no3)/F(add9)（B/C整体移调）。低音、信标、琶音、第五层一起采用对应和声；鼓组共用。
2. 开头保留动机节奏/轮廓，按大调重写音级；两小节答句删碎音，第二音延伸至句末/落和弦音；返程末句落大调主音。不是统一移高或仅换乐器，温暖感仍待用户试听。
3. 第五层进入第0/8/16/24拍的新两小节乐句，120BPM最多约4.025s等待。前一小节滚奏过门（无固定音高，避免转调前冲突），最后一拍加密；等待不足一小节只播结尾。整套有音高配器在同一入口300ms交接。第四层仍小节进入。
4. 入镜条件不变：角色身体进入实际视口即可，不看160px/照明/朝向/遮挡；入镜只是音乐请求，乐句时机决定实际第五层。最多半秒预测、逐帧撤销失效预判；已实际入镜后保持发现情绪，出镜撤第五层不退回寻找。新下潜重置，历史npcFound不授权高潮。
5. 绑好确认音，下一拍返程主题650ms交接、暖色节奏层1.5s收束。死亡停止成功尾音，3ms撞击起音+中低频主体提供duang，再接6.4s下坠暗尾；结算保留，静音/后台停止。
6. GM「探知仪 → 音乐方案」切A/B/C；按需生成，准备期间旧版继续，替代版就绪后旧版500ms淡出释放。连续选择只提交最新。

## 试听与对比

listen.html顶部：
- color-v5-v6.wav 32s：0:00旧V版A发现主题，0:16新版A。相同主音量、未强制匹配响度。
- undertow/theme-colors.wav 48s：0s寻找/16s发现/32s返程。
- undertow/rescue-journey.wav 40s：0s寻找二级/8s四级/14s过门/16s新乐句的发现与五级/24s绑好返程。
- undertow/death.wav 6.4s。

A/B/C各有同名试听。archive-v5保留用户实际反馈过的A版theme-found/death/four-to-five快照，archive-v1/v2不改。旧reference-study/four-old-five-new-five.wav不再自动重建，避免失去历史对照。

## 代码入口

- AdaptiveScore.ts：ScoreTrack新增beaconFound/bassFound/arpFound/sparkFound；WARM_LAYER_TRACKS顺序固定，PHRASE_BEATS=8；和声/动机答句/跨配器渲染。
- AdaptiveMusicEngine.ts：构造(ctx,六轨,两个底轨,四个暖色伴奏,过门Buffer)。12源同步；found层映射[6,8,9,3,10,11]，return底轨为7。setLevel(level,settle,mood)一起切配器；过门独立一次性源，等待可撤销。MusicClock含entryWaitSeconds/mood/requestedMood。
- AdaptiveMusic.ts：准备12源+过门，预测入镜、情绪保持、绑绳与死亡。
- AdaptiveCues.ts：renderPhrasePickup()两秒滚奏；death明确duang+暗尾，secured确认。
- NPCPerception.ts、MazeLogic：共同的入镜发现语义。
- buildAdaptiveAudio.js、adaptiveAudioPreview.html：同内核导出/试听，32s新旧对照。
- checkAdaptiveAudio.js：配器和声/动机、完整混音/事件/过门峰值、PCM、乐句排程与撤销、死亡起音等。
- checkAdaptiveGameplay.js：入镜/缩放/预判、情绪保持、死亡停成功尾音、后台/换版。

## 边界

12循环PCM约18.4MB，过门0.2MB，换版暂留两套约37.2MB另加临时/原生/事件；未测真机生成耗时/峰值/输出延迟。WebAudio替身校验不是主观听感验收。

参考「建安一路627号 3.m4a」52.351s、48kHz mono AAC；本地reference-full.wav忽略不入Git，未外传。原VoiceMemos临时路径可能过期。analyzeAdaptiveReference.py/full-analysis.json是客观谱测量，不能识别独立轨或音色。当前无直接听取参考工具；VI改写依据用户反馈，不声称听感已达到参考。

```sh
npm run audio:build
npm run audio:check
npm run platform:check
npm run typecheck
npm run build
```

用户认可VI版并要求提交，接下来希望学习相关音乐概念与作曲设计（有钢琴/小提琴基础）。游戏可视化仍未授权推进；教学交互与游戏视觉分开。
