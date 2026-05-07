# ⭐️⭐️⭐️

整理一个美术文档，包括UI、动效、场景、角色、动画、音效音乐。

音频按钮不许关闭音频。

战绩与好友排行榜。

测试微信号。

缺的音频：
手划水，和动画挂钩/
脚踢水，和动画挂钩/
食人鱼，自带bgm、疑惑声、蓄力声、冲刺声、撕咬声/
补充氧气/
岸上营地的环境音，先搞个临时的鸟语花香的循环背景音/
进入结算的各种声音/ （结束潜水瞬间的弹射出水音效 `QuickReturn.mp3` 已接入 retreat/o2/fishkill 三个触发点，配合 0.5s 蓄力→弹射→破水爆裂转场；其余结算音效——救援成功/溺亡/被咬死——待补）
UI按钮点击音效（MainBtn.mp3 / SubBtn.mp3 已接入：主按钮=开始游戏/章节进入/竞技场/迷宫纯享版/下潜/继续/回到岸上/接受任务/接受新任务/长按放弃完成/轮盘松手执行/GM action 执行；次按钮=返回主菜单/章节页返回/下潜记录开关/卡片点击/折叠探索记录/全屏地图返回/调试小地图折叠/留在此处/轮盘取消/左上角 HUD 5 个图标短按/GM 面板 Tab 切换·加减·输入框·布尔·select 箭头）


**已完成（2026-05-06）：**
- **氧气环放大 1.4×**（`CONFIG.breath.oxygenRingSizeMul`），其他 HUD 图标保持 28px 不变
- **肺图标替换 "O₂" 文字**：矢量两瓣肺叶 + 气管 + 肺纹；吸气膨胀到 1.15×、吐气收缩到 0.85×，压强越大幅度再加 30%；颜色按氧气分四档（健康粉/粉紫/灰紫/濒死青）；吐气瞬间气管顶部冒白气泡
- **呼吸压强三分量系统**：baseline + movement（指数平滑，升快降慢，静止后约 3s 才平复一半）+ impact（撞墙注入，每秒线性衰减 0.25，4~6s 平复）
- **氧气阶梯式消耗**：只在 exhale→pause 切换瞬间扣一口气（静止 0.6%、全速 2.5% 线性插值），两口之间完全不扣；扣氧瞬间氧气环红条闪一下，"一口一格"视觉直观
- **呼吸浮力向量**：`sin(phaseAngle) × buoyancyAmp × (1 + pressure × coef)` 叠加到 `player.vy`，吐气下沉、吸气上浮；与肺动画同相位，玩家看到肺膨胀时身体也在漂浮上去，逻辑自解释
- GM 面板「呼吸」Tab 新增 16 项可调参数（压强系数/衰减速率/阶梯耗氧量/浮力幅度/肺缩放/氧气环尺寸）

devplan是用来记录需要做的需求的设计的，已经做完的就不用放里面了。todo这个也是。

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

### 音频资源清单（需新生成 19 条，menuBGM 已有）
| # | key | 文件名 | 类型 | 时长 | 循环 |
|---|---|---|---|---|---|
| 1 | menuBGM | 已有 Echoes_of_the_Sunken_Grotto | Music | - | ✅ |
| 2 | campBGM | ElevenLabs_camp_bgm_loop.mp3 | Music-Loop | 60~90s | ✅ |
| 2b | campBGMRescued | ElevenLabs_camp_bgm_rescued_loop.mp3 | Music-Loop | 70~90s | ✅ |
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

#### 2. campBGM（岸上营地 BGM — 任务未完成，待出发）
EN:
```
An extremely understated, nearly invisible background music loop for a sunlit jungle campsite beside a cave well in Thailand, serving as the staging ground before a diver sets out on a rescue mission. Bright daylight atmosphere, steady and matter-of-fact, hopeful in a plain everyday way — not emotional, not cinematic, not melancholic. Light acoustic guitar with simple repeating open chords, a very soft sustained pad in the background, a gentle steady pulse around 85–90 BPM that feels purposeful (the diver is about to get to work, not relaxing), no build-ups, no swells, no lead melody, no solo instrument calling attention to itself. The listener should barely notice the music — it only fills the silence. No vocals, no percussion hits, no dramatic transitions. Fully instrumental, seamlessly looping, 70 seconds.
```
CN：几乎察觉不到的背景 BGM。阳光明媚的丛林营地、潜水员整装待发的基地氛围，情绪非常平、不煽情不电影化不忧郁。轻柔指弹吉他反复走简单开放和弦 + 极轻持续 pad 铺底 + 85–90 BPM 稳定平实脉动（表达"该去干活了"的笃定而非放松），无起伏无 build-up 无主旋律无独奏抢戏。玩家应该几乎感觉不到音乐存在，只是填补寂静。纯器乐无缝循环 70s。情绪关键词：阳光、日常、笃定、透明、不抢戏。

#### 2b. campBGMRescued（岸上营地 BGM — 救援成功后，留在本关）
EN:
```
A slow, gentle, deeply relaxed ambient music loop for a sunlit grass clearing beside a cave well in Thailand, AFTER a successful rescue. The feeling is lying on warm grass in the afternoon sun, eyes half-closed, everything already resolved — pure quiet comfort and relief, no urgency whatsoever. Soft acoustic guitar with very sparse, slow fingerpicking (notes allowed to ring out and decay fully), a warm analog pad underneath like distant afternoon haze, occasional soft wooden percussion at an extremely slow tempo around 55–60 BPM, perhaps a single gentle wind-chime-like tone every 8–16 bars. Warm, hazy, content, unhurried. No tension, no forward motion, no rising phrases — the music should feel like it is also resting. No vocals, no bright leads, no dramatic changes. Fully instrumental, seamlessly looping, 80 seconds.
```
CN：救援成功后留本关时的营地 BGM。阳光下躺在暖草地上半眯着眼的感觉，一切尘埃落定、纯粹的宽慰与舒服、没有任何紧迫感。软指弹吉他极稀疏慢拨（任音符自然延展消散）+ 温暖模拟 pad 如午后雾气铺底 + 每 8~16 小节偶尔一声风铃式轻响，55–60 BPM 极慢。温暖、朦胧、满足、不着急。无张力无前进感无上扬乐句，音乐本身也在休息。纯器乐无缝循环 80s。情绪关键词：午后阳光、宽慰、慵懒、满足、休息。

#### 4. fishChaseStinger（食人鱼追击紧张层）
EN:
```
A tense underwater stinger loop that layers on top of existing ambient music. Deep sub-bass pulse at 40Hz throbbing slowly (like a heartbeat, 70 BPM), a faint dissonant string drone sliding between two semitones, occasional distant metallic scrapes and low rumbles. No melody, no clear rhythm, purely atmospheric dread. Feels like something is stalking you in the dark water. Very low mid and high frequencies, mostly bass and sub-bass. Seamlessly looping, 24 seconds.
```
CN：叠加在主 BGM 上的紧张层。40Hz 心跳脉冲（70BPM）、半音滑动不协和弦乐、远处金属刮擦和低频隆隆。无旋律无节奏纯氛围压迫感。无缝循环 24s。备选：string drone 可换 choir whisper 或 low brass swell 试听。


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
A fast, purely physical oxygen tank refill — absolutely no musical tones, no chimes, no bells, no synth, no digital sound of any kind. Just real mechanical and gas sounds: a sharp burst of high-pressure gas hissing into a steel tank for about 0.6 seconds (bright airy hiss with a slight whistle from the regulator), then the hiss cuts off abruptly with a short dull blunt "thunk" as the flow stops (the tank is full, pressure equalized — a muted metallic thud, not a bell), followed by the crisp mechanical clicks and squeaks of a brass valve being hand-tightened shut (two or three quick metallic turns, tactile and dry). Short, confident, satisfying in a purely mechanical way — the reward feeling comes entirely from how clean and decisive the physical action sounds, not from any added music. Slightly close-mic'd, dry, real-world field recording feel. Duration 1.5 seconds.
```
CN：补氧成功。**绝对不要任何铃音、和弦、合成器、电子音、旋律反馈**，只有真实的物理机械和气体声。前 0.6s 是高压气体快速灌入钢瓶的锐利嘶声（带调压阀轻微口哨感），接着嘶声戛然而止、伴随一声"嘟"的钝金属闷响（瓶满、压力平衡，低沉金属撞击感、不是铃声），最后是黄铜阀门被手拧紧的两三下清脆机械咔哒+细微吱吱声（干燥、触感强）。短促、干脆、满足感完全来自物理动作本身的利落，不靠音乐奖励。近距离拾音、干声、真实外景录音质感 1.5s。

FileID
cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/GetO2.mp3

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
A purely physical sound of a diver quickly ascending and breaking the water surface — no music, no chimes, no pads, no synth, no melodic reward of any kind. The soundscape is: a rising underwater whoosh of water rushing past the body as the diver shoots upward (muffled, bubble-rich, rapidly brightening as depth decreases, about 0.5 seconds), then the sharp clean burst of breaking through the surface (a splash with real water sheeting off, bubbles popping, a quick gasp of air opening up), followed by the calmer ambient lapping of water against rocks or the shore edge and a few residual drips as the diver settles on the surface. Real, physical, field-recording quality. The feeling of "made it back" should come entirely from the natural transition from muffled underwater acoustics to open-air brightness, not from any musical cue. Duration 1.5 seconds.
```
CN：回岸（非救援成功）。**绝对不要铃音、pad、旋律、合成奖励音**，纯物理声。先 0.5s 水下急速上浮的 whoosh（闷、气泡丰富、随深度变浅高频渐亮），然后一瞬间破水出面的清亮爆裂（真实水花、水膜脱落、气泡爆破、一口空气刚开闸的感觉），接着是水面轻拍岩石/岸边的平静余波和几滴残留滴水。真实物理、外景录音质感。"回到了"的情绪完全靠水下闷音→水面开阔音的自然声学过渡，不靠任何音乐提示 1.5s。

#### 18. uiPrimary（UI 主按钮）
EN:
```
A purely natural physical tap sound for a confirm button — absolutely no bells, no chimes, no synth, no digital tone, no melodic pitch. Just one real-world acoustic event: a single firm fingertip tap on a small taut stretched piece of waterproof canvas or leather over a hollow wooden frame, producing a soft warm dull "tup" with a tiny bit of natural body resonance and a very short air-puff from the surface flexing. Dry, close-mic'd, felt more than heard. Understated, confident, tactile — the kind of sound a real outdoor equipment clasp or a fieldbook cover would make when pressed. Duration 0.2 seconds.
```
CN：UI 主按钮（开始/确认/救援/安装）。**绝对不要铃声、和弦、合成器、数字音、任何带音高的调性**，只有一个真实的物理动作声：指尖坚定地按在绷紧的防水帆布或皮革面（下面是空心木框）上发出的一声温暖柔钝的"哚"，带一点点自然腔体共鸣和表面形变挤出的微弱气声。干声、近距离拾音、听感更像触感。低调、笃定、触感强——像真实户外装备扣具或野外笔记本封面被按下的声音 0.2s。

cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/MainBtn.mp3

#### 19. uiSecondary（UI 次按钮）
EN:
```
A purely natural physical micro-tap — absolutely no bells, no tones, no synth, no digital click, no musical pitch. Just a real-world tiny acoustic event: a single fingernail or fingertip lightly brushing or tapping a small dry wooden surface (like the edge of a pencil tapping a notebook page), producing a very short, soft, dry tick with almost no body and no resonance — just the brief contact and immediate silence. Lighter, shorter and drier than the primary confirm tap. Close-mic'd, field-recording quality, intentionally uneventful. Duration 0.1 seconds.
```
CN：UI 次按钮（取消/关闭/Tab）。**绝对不要铃声、音高、合成器、数字咔嗒**，纯物理微小动作声：指甲或指尖轻拂/轻叩小块干燥木面（类似铅笔头轻点笔记本纸边），一声极短、柔、干的"嗒"，几乎没有腔体、没有余响——只有接触瞬间和立刻的寂静。比主按钮更轻、更短、更干。近距离拾音、外景录音质感、刻意克制不抢戏 0.1s。

cloud://cloud1-d8gh6fpnh6d0928e8.636c-cloud1-d8gh6fpnh6d0928e8-1424920608/audio/SubBtn.mp3

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



