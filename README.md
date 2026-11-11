# JacobWellRescueFriend
雅各布井营救好友

## 资源与发布

`npm run release:build` 生成独立纯代码小游戏候选（约2.04MiB），位置是 `node_modules/.cache/wechat-release/`。根目录仍保留制作素材，不直接用于正式上传。20项资源上传文件已备好，但云控制台需要登录，尚未完成真实上传与下载验证；步骤与边界见[资源发布说明](design/assets/README.md)。主包预算已按官方4M纠正。

## 连续章节操作

- BCD 在岸上、水面和水下均可充排气。充满时先按住向下箭头排气，再下潜；排气不耗气瓶，充气按实际用量扣气。
- 水下左下角的“回岸”直接回营地，保留当前地图、探索和固定绳网；解除玩家腰扣牵引，鱼和被救者留在原处。
- 左下角“菜单”可继续探索、快速回岸、保存并回主界面，或换一张地图。菜单打开时暂停游动与耗气；桌面预览也可按 Esc 开关。
- “保存并回主界面”之后，主界面的继续入口原位恢复。同一张图不因上下岸重建。
- “换一张地图”有第二次确认；确认后生成新种子并从营地开始，替换当前洞穴的探索、鱼和绳网。取消不会换图。

## 微信开发者工具黑屏

2026-11-12 排查到一次模拟器及调试器同时黑屏：工具日志反复停在 `LoadApp: waiting for previous app to dispose`，普通重新编译无效。通过工具菜单“项目 → 重新打开此项目”恢复主界面和 WebGL 初始化，未清除用户存档。若再次遇到相同现象，先重新打开项目；这不是手机端性能或兼容性验收结论。

源码同时补上连续章节生命周期对 `window.addEventListener` 的检查，兼容存在 `window` 但没有 DOM 事件接口的小游戏运行环境。

## 本地回归

先安装依赖并生成着色器：`npm install`、`npm run shaders`。运行 `npm run world:preview` 生成真实手机版源码预览；在项目根目录用本地静态服务器监听 60972。预览地址为 `/node_modules/.cache/continuous-gameplay/game.html`。

- `npm run typecheck`：类型检查。
- `npm run bcd:check`：真实岸水物理、BCD 气量与耗气、气泡、旧迷宫行为。
- `npm run bcd:browser`：隔离浏览器中真实触摸充排气、横竖屏和排空后下潜。
- `npm run world:navigation`：真实触摸回岸、暂停、保存续档、换图确认及小屏布局。
- `npm run native:check`：无 DOM 的小游戏接口模拟，检查首画布、WebGL 失败回退、菜单首帧与进入章节；不替代微信真机测试。
- `npm run world:regression`、`npm run world:browser`：岸水边界、休息、遇险回岸、主流程与存档。
- `npm run package:check`：构建纯代码候选并检查4MiB主包预算，官方大小以微信工具编译结果为准。
- `npm run assets:check`、`npm run assets:browser`：资源缓存/失败恢复/暂停保存与真实游戏图像回归。
- `npm run release:check`：纯代码候选与无DOM启动验证。

浏览器回归使用隔离用户目录，不操作日常预览页面或微信存档；报告和截图写入已忽略的 `node_modules/.cache/continuous-gameplay/`。
