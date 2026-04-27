# ⭐️⭐️⭐️

整理一个美术文档，包括UI、动效、场景、角色、动画、音效音乐。

统一顶部UI按钮的Tip交互规范与位置

音频按钮不许关闭音频。

自动挡动画。

战绩与好友排行榜。

测试微信号。

画质自适应帧率。根据帧率高低自动调整画质。

岸上要有放弃的选项，避免玩家卡关。或者实在过不去，就允许开着地图玩。

缺的音频：
撞岩石，关键在于区分撞击速度角度/
呼吸，关键在于如何和运动量、耗氧量、吐出的气泡的表现挂钩/
手划水，和动画挂钩/
脚踢水，和动画挂钩/
食人鱼，自带bgm、疑惑声、蓄力声、冲刺声、撕咬声/
补充氧气/
岸上营地的环境音，先搞个临时的鸟语花香的循环背景音/
进入结算的各种声音/
UI按钮点击音效

## 音频系统设计方案（待实现）

### 通道分层
- L1 Music（BGM 互斥，淡入淡出）：menuBGM / campBGM
- L2 Stinger（叠加在 L1 之上）：fishChaseStinger（食人鱼追击紧张层）
- L3 Ambience（常驻低音量循环）：campAmbience（远景鸟语花香）
- L4 SFX-Loop（可调 volume / playbackRate）：breathLoop（吐气泡循环）
- L5 SFX-Oneshot（多实例池，支持叠加）：撞岩石、划水、踢水、食人鱼、UI 等

### AudioManager 升级项
- SFXEntry 从单实例改为多实例池（n=3 轮转），避免同音效打断
- playSFX(key, { volume, playbackRate }) 支持动态参数（撞击按速度映射）
- 新增 playSFXLoop / stopSFXLoop / setSFXLoopParams（呼吸专用）
- 新增 playStinger / stopStinger（食人鱼紧张层，独立淡入淡出）
- 新增 playAmbience / stopAmbience（营地环境音）
- BGM 字典扩展为 { menuBGM, campBGM }，按 state.screen / state.mazeRescue.phase 自动切换

### 事件 → 音频触发点
| 事件 | 资源 | 代码位置 | 参数 |
|---|---|---|---|
| 进入主菜单 | menuBGM | state.screen==='menu' | loop |
| 进入岸上营地 | campBGM + campAmbience | state.mazeRescue.phase==='shore' | loop + loop |
| 撞岩石 | collisionRock | Collision.ts | vol=f(速度), rate=0.9+0.2×强度 |
| 呼吸气泡 | breathLoop | updateMaze() | vol/rate 按氧耗调制 |
| 划水（手） | strokeArm | ManualDrive.ts 前向 kick | 多实例叠加 |
| 踢水（腿） | kickLeg | ManualDrive.ts 腿 kick | 多实例叠加 |
| 食人鱼警戒 | fishIdle + fishChaseStinger 淡入 | FishEnemy.ts alert | stinger 淡入 |
| 食人鱼蓄力 | fishCharge | FishEnemy.ts charge | oneshot |
| 食人鱼冲刺 | fishDash | FishEnemy.ts dash | oneshot |
| 食人鱼撕咬 | fishBite | fishBite.active | oneshot |
| 食人鱼脱战 | stinger 淡出 | 全部回 patrol | - |
| 补氧成功 | oxygenRefill | OxygenTank.completeInstall | oneshot |
| 救援成功 | endingSuccess | npc.state==='rescued' | 主 |
| 氧气耗尽死 | endingFailDrown | screen==='lose'(O2) | 主 |
| 被咬死 | endingFailBite | screen==='lose'(bite) | 主 |
| 回岸（非救援） | endingReturn | returnToShore() | 次 |
| UI 主按钮 | uiPrimary | 开始/确认/救援/安装 | oneshot |
| UI 次按钮 | uiSecondary | 取消/关闭/Tab | oneshot |

### 音频资源清单（需新生成 18 条，menuBGM 已有）
| # | key | 文件名 | 类型 | 时长 | 循环 |
|---|---|---|---|---|---|
| 1 | menuBGM | 已有 Echoes_of_the_Sunken_Grotto | Music | - | ✅ |
| 2 | campBGM | ElevenLabs_camp_bgm_loop.mp3 | Music-Loop | 60~90s | ✅ |
| 3 | campAmbience | ElevenLabs_camp_ambience_loop.mp3 | Ambience-Loop | 30~45s | ✅ |
| 4 | fishChaseStinger | ElevenLabs_fish_chase_stinger_loop.mp3 | Stinger-Loop | 20~30s | ✅ |
| 5 | breathLoop | ElevenLabs_breath_bubbles_loop.mp3 | SFX-Loop | 3~4s | ✅ |
| 6 | collisionRock | ElevenLabs_collision_rock.mp3 | SFX-Oneshot | 0.3~0.5s | ❌ |
| 7 | strokeArm | ElevenLabs_stroke_arm.mp3 | SFX-Oneshot | 0.4~0.6s | ❌ |
| 8 | kickLeg | ElevenLabs_kick_leg.mp3 | SFX-Oneshot | 0.35~0.55s | ❌ |
| 9 | fishIdle | ElevenLabs_fish_idle.mp3 | SFX-Oneshot | 0.5~0.8s | ❌ |
| 10 | fishCharge | ElevenLabs_fish_charge.mp3 | SFX-Oneshot | 0.6~1.0s | ❌ |
| 11 | fishDash | ElevenLabs_fish_dash.mp3 | SFX-Oneshot | 0.4~0.7s | ❌ |
| 12 | fishBite | ElevenLabs_fish_bite.mp3 | SFX-Oneshot | 0.5~0.8s | ❌ |
| 13 | oxygenRefill | ElevenLabs_oxygen_refill.mp3 | SFX-Oneshot | 1.2~1.8s | ❌ |
| 14 | endingSuccess | ElevenLabs_ending_success.mp3 | SFX-Oneshot | 2.5~4s | ❌ |
| 15 | endingFailDrown | ElevenLabs_ending_fail_drown.mp3 | SFX-Oneshot | 2~3s | ❌ |
| 16 | endingFailBite | ElevenLabs_ending_fail_bite.mp3 | SFX-Oneshot | 2~3s | ❌ |
| 17 | endingReturn | ElevenLabs_ending_return.mp3 | SFX-Oneshot | 1~1.5s | ❌ |
| 18 | uiPrimary | ElevenLabs_ui_primary.mp3 | SFX-Oneshot | 0.15~0.25s | ❌ |
| 19 | uiSecondary | ElevenLabs_ui_secondary.mp3 | SFX-Oneshot | 0.1~0.2s | ❌ |

### ElevenLabs Prompts（中英对照）

通用参数：循环类在 prompt 末尾加 `seamlessly looping`；Prompt Influence 默认 0.3，风格强则 0.5~0.7；拼循环如有缝用 Audacity 做 50ms crossfade。

#### 2. campBGM（岸上营地 BGM）
EN:
```
A warm, peaceful ambient music loop for a jungle campsite beside a cave well in Thailand. Soft acoustic guitar fingerpicking, gentle bamboo flute melody, subtle low-frequency drone underneath, light hand percussion (shaker, frame drum) at very slow tempo around 60 BPM. Hopeful but contemplative mood, not too bright, hint of melancholy because this is a rescue mission staging ground. No vocals, no sharp transients. Fully instrumental, seamlessly looping, 70 seconds.
```
CN：丛林营地 BGM，温暖凝重希望感，软指弹吉他+竹笛+低频底座+轻手鼓，60BPM，纯器乐无缝循环 70s。情绪基调：救援基地非度假。

#### 3. campAmbience（营地环境音）
EN:
```
A distant, layered jungle ambience for a tropical rainforest at dawn. Faraway bird calls (hornbills, bulbuls, distant parakeets), very distant water dripping, soft wind through dense leaves, extremely faint insect chirps. All sounds feel FAR AWAY, as if standing in a clearing with the jungle 50 meters away. No close-up birds, no rustling near the microphone, no human activity, no music. Keep it subtle and atmospheric, not a nature documentary. Seamlessly looping, 40 seconds.
```
CN：远景丛林环境。远鸟鸣（犀鸟、鹎、鹦鹉）、极远滴水、软风穿密叶、极轻虫鸣。所有声音要远、不贴脸、无音乐无人声无近景沙沙。无缝循环 40s。

#### 4. fishChaseStinger（食人鱼追击紧张层）
EN:
```
A tense underwater stinger loop that layers on top of existing ambient music. Deep sub-bass pulse at 40Hz throbbing slowly (like a heartbeat, 70 BPM), a faint dissonant string drone sliding between two semitones, occasional distant metallic scrapes and low rumbles. No melody, no clear rhythm, purely atmospheric dread. Feels like something is stalking you in the dark water. Very low mid and high frequencies, mostly bass and sub-bass. Seamlessly looping, 24 seconds.
```
CN：叠加在主 BGM 上的紧张层。40Hz 心跳脉冲（70BPM）、半音滑动不协和弦乐、远处金属刮擦和低频隆隆。无旋律无节奏纯氛围压迫感。无缝循环 24s。备选：string drone 可换 choir whisper 或 low brass swell 试听。

#### 5. breathLoop（吐气泡循环）
EN:
```
A continuous loop of underwater exhaled air bubbles from a scuba diver's regulator. Medium-sized bubbles rising through water, soft gurgling and popping, no mechanical regulator clicks, no inhale sounds — only the exhale bubble stream. Consistent and steady throughout, no dramatic peaks. Recorded as if from a first-person perspective. Seamlessly looping, 3.5 seconds.
```
CN：潜水员吐气泡循环。只要吐气、不要吸气、无调节器机械声。中气泡上浮+咕噜破裂。稳定均匀第一人称无缝循环 3.5s。代码侧用 playbackRate 0.7~1.3 控呼吸节奏，volume 0.3~0.8 控强度。

fileid：
cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/BreathBubble.mp3

**已接入（2026-04-28）：**
- AudioManager 新增 SFX-Loop 通道（`playSFXLoop / stopSFXLoop / setSFXLoopParams / updateSFXLoops`），支持运行时音量与播放速率调整
- 新建 `src/logic/BreathSystem.ts`：呼吸相位机（exhale / pause 间歇交替）、运动量映射、嘴部位置气泡粒子生成、音频参数联动
- 新建 `src/render/RenderBreath.ts`：世界空间气泡绘制（半透明主体 + 高光 + 薄边，随生命淡出）
- 气泡从潜水员嘴部（头部前端 +22px）涌出，真实向上漂浮（-Y）+ 侧向正弦摆动 + 半径缓慢变大 + 末尾淡出
- 运动量映射：静止 → 吐气 1.0s / 停顿 3.0s / 气泡率 5/s / 音量 0.35；全速 → 吐气 1.5s / 停顿 0.2s / 气泡率 14/s / 音量 0.8
- 仅在迷宫 play / 主线 play 阶段激活；岸上、菜单、过场、入水、上浮、死亡过场均静默
- GM 面板新增"呼吸"Tab 共 27 个参数可调

#### 6. collisionRock（撞岩石）
EN:
```
A single underwater impact of a diver's tank or body hitting a rough rock wall. Muffled low-frequency thud with a short high-frequency scrape, slightly reverberant as if inside a flooded cave. Dry, punchy, no musical tone. Duration 0.4 seconds.
```
CN：气瓶/身体撞洞壁闷响。低频闷击+短暂高频刮擦+洞穴混响。干净无音调 0.4s。代码按撞速映射 volume 和 rate（轻擦 rate=1.1 vol=0.3，重撞 rate=0.85 vol=0.9）。

fileid：
cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/HitRock.mp3

#### 7. strokeArm（手划水）
EN:
```
A single underwater arm stroke — a diver pulling water with their hand. Soft whoosh of water displacement, very subtle bubble trail, muffled and close-up, no splash (fully submerged). Smooth, short, no sharp attack. Duration 0.5 seconds.
```
CN：单次手划水。水流 whoosh+轻微气泡拖尾、闷贴近完全水下无溅水。平滑短促 0.5s。

#### 8. kickLeg（脚踢水）
EN:
```
A single underwater fin kick — a diver's flipper pushing water. A low whoomp of water thrust, slightly stronger and lower-frequency than an arm stroke, with a faint flutter tail. Fully submerged, muffled, no splash. Duration 0.45 seconds.
```
CN：单次蛙鞋踢水。低频推水 whoomp、比手划水重且低、尾端蛙鞋弹性颤动。完全水下闷无溅水 0.45s。

#### 9. fishIdle（食人鱼警戒）
EN:
```
A short, curious underwater creature sound — like a large predatory fish noticing something. A low guttural hum followed by a quick throaty click, muffled through water, slightly unsettling but not aggressive yet. Duration 0.7 seconds.
```
CN：食人鱼发现玩家的警戒声。低沉咕噜+喉部短促咔哒、水下闷、不安但未攻击。0.7s。

#### 10. fishCharge（食人鱼蓄力）
EN:
```
A menacing underwater predator building up to attack — a rising low-frequency growl, increasing in volume and pitch, with a gritty aggressive texture, ending on a held note right before the strike. Muffled through water, very intimidating. Duration 0.8 seconds.
```
CN：食人鱼蓄力。低频咆哮渐强音高上扬、粗砺攻击性、结尾停在即将爆发的音。水下闷威慑强 0.8s。

#### 11. fishDash（食人鱼冲刺）
EN:
```
A sudden underwater rush — a large fish lunging forward fast. A sharp whoosh of displaced water with a high-velocity streak, a low body-mass rumble underneath, and a brief tail flick at the end. Duration 0.55 seconds.
```
CN：食人鱼突进。急速 whoosh+重质感低频+末尾尾鳍一甩。0.55s。

#### 12. fishBite（食人鱼撕咬）
EN:
```
A vicious underwater bite — sharp teeth snapping shut hard, followed by a brief gnashing and tearing sound, muffled through water with a wet muffled impact. Brutal, violent, visceral. Duration 0.65 seconds.
```
CN：食人鱼撕咬。利齿咬合锐响+磨咬撕扯+水下闷湿冲击。暴力内脏感 0.65s。

#### 13. oxygenRefill（补氧）
EN:
```
A positive underwater pickup sound — pressurized gas hissing into a tank valve, followed by a soft ascending chime or two-note bell tone to indicate success, with a gentle bubble flourish at the end. Satisfying, rewarding, not too loud. Duration 1.5 seconds.
```
CN：补氧成功。加压气体嘶声+柔和上行铃音（成功反馈）+尾端气泡。满足奖励感、别太响 1.5s。

#### 14. endingSuccess（救援成功）
EN:
```
A triumphant but emotional cinematic stinger for a successful cave rescue. Starts with a rising warm string swell, joined by a soft choir pad, resolving on a major chord with a deep uplifting bass, ending with a slow fade of gentle bells. Emotional, hopeful, not overly heroic — more like quiet relief after a long ordeal. Duration 3.5 seconds.
```
CN：救援成功电影化 stinger。温暖弦乐渐强+柔和人声 pad+大和弦解决+低频上扬+钟声淡出。情感化希望、非英雄主义、长煎熬后的释然 3.5s。

#### 15. endingFailDrown（溺亡）
EN:
```
A somber underwater death — muffled heartbeat slowing down, a fading low drone, distant garbled vocal whisper, water pressure closing in, ending in silence with one final bubble. Tragic and quiet, not loud or dramatic. Duration 2.5 seconds.
```
CN：溺亡。闷心跳渐慢+低频嗡鸣淡出+远处模糊人声低语+水压逼近+最后一个气泡归于寂静。悲剧安静非爆裂 2.5s。

#### 16. endingFailBite（被咬死）
EN:
```
A violent underwater death by predator — a sudden sharp impact with a wet crunch, muffled scream cut short, thrashing water, trailing off into a low ominous drone with distant bubbles. Brutal and shocking, then quiet. Duration 2.5 seconds.
```
CN：被咬死。锐利冲击+湿润咔嚓+被掐断闷惨叫+水花翻腾+低频不祥嗡鸣+远气泡。残暴惊悚后归寂 2.5s。

#### 17. endingReturn（回岸）
EN:
```
A short bittersweet transition — a soft ascending bell chime with a warm pad underneath, a subtle water drip at the end. Gentle closure, not celebratory, slightly melancholic. Duration 1.2 seconds.
```
CN：回岸（非救援成功）。柔和上行铃+温暖 pad+尾滴水。温柔收束非庆祝、微惆怅 1.2s。

#### 18. uiPrimary（UI 主按钮）
EN:
```
A clean minimal UI confirm sound — a short soft bell chime with a subtle water droplet quality, warm and organic, not digital or beepy. Duration 0.2 seconds.
```
CN：UI 主按钮（开始/确认/救援/安装）。简约确认音、软铃声+水滴质感、温暖有机不要数字 beep。0.2s。

#### 19. uiSecondary（UI 次按钮）
EN:
```
A minimal UI tap sound — a very short, subtle wooden tick or soft tap, quieter and shorter than a confirm bell, understated and unobtrusive. Duration 0.12 seconds.
```
CN：UI 次按钮（取消/关闭/Tab）。比主按钮更轻更短、木质轻叩或柔软拍击、低调不抢戏 0.12s。

### 生成批次建议
1. 第一批（氛围基调）：campBGM / campAmbience / breathLoop
2. 第二批（核心动作）：collisionRock / strokeArm / kickLeg / oxygenRefill
3. 第三批（食人鱼套装）：fishIdle / fishCharge / fishDash / fishBite / fishChaseStinger（一起试听配套）
4. 第四批（结算+UI）：4 个 ending + 2 个 UI

### 上线注意
- 云存储新上传文件默认权限"仅创建者可读写"，必须在云开发控制台改为"所有用户可读"，否则 getTempFileURL 报 STORAGE_EXCEED_AUTHORITY
- 音频文件拿到后再动手改 AudioManager 接入新通道架构

# ⭐️⭐️

# ⭐️



