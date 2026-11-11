# 资源外置与代码发布候选 · 2026-11-12

用户要求小游戏本体只放代码，图片、音频和以后制作的模型放服务器。本轮已完成清单、下载缓存、图片恢复及独立发布构建；**云文件还未上传，不能将候选目录当作已可正式发布的版本**。腾讯云控制台当前要求微信扫码登录，尚未获得登录会话。没有新建付费服务、修改云权限或覆盖既有音频。

## 开发与发布

仓库根目录继续是本地开发项目，保留原图片用于制作和离线预览。它仍超过当前主包限制，不能直接上传为正式包。`scripts/assetSources.json` 的模式是 `local`；原菜单BGM等已在云端的MP3仍按原云音频配置播放。

运行 `npm run release:build`：核对类型、生成资源清单与上传文件、构建独立代码目录、检查主包大小。`node_modules/.cache/wechat-release/` 中只有JS和小游戏配置，模式强制为 `cloud`，不会请求已经排除的本地图片。包含洞壁与捕鱼续档修复的当前候选约 **2.04MiB**（2,136,214字节）；以再次构建输出为准。这个数字不包含微信官方编译开销，最终以开发者工具为准。

微信当前官方[分包规则](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.html)为主包不超过4M、主包加全部分包不超过30M。当前项目没有分包。旧文档的8MiB门槛作废；脚本现在按4MiB且预留128KiB检查候选。不要用旧静态估算代替微信工具报告。

## 清单与缓存

显式清单20项、5,849,205字节：家场景4张、营地9张、旧岩体4张、矿物2张、救援敲击音1个。不扫描整个图片目录，以免旧原画和未使用版本进入上传。VII音乐仍由代码生成，不需要上传。既有10个云MP3仍走原临时URL音频通道，没有纳入新持久缓存；补上30秒刷新限流，失败时不再请求不存在的包内MP3。救援敲击音等待解码最多15秒，失败冷却后由新的碰撞触发重试，不补播旧碰撞。

- `npm run assets:build` 生成 `src/assets/AssetCatalog.ts`，以及忽略目录 `node_modules/.cache/asset-release/` 内的上传文件和manifest。
- 对象路径为 `assets/v1/<完整SHA256>.<扩展名>`；只更新发生内容变化的资源，不覆盖旧版本。文件名和清单保存SHA256，原生文件API用字节数及MD5核验传输完整性。
- `AssetStorage` 下载到临时路径，验证后复制、再验证、原子重命名到 `USER_DATA_PATH/jwr-assets-v1/`。跨会话命中先核验，本会话复用；损坏重下。
- 同资源请求去重，最多3个下载并发，每次真正开始下载后限20秒并abort，最多尝试2次。云失败不假装回退到不存在的包内图片。
- 只清理本模块目录中可识别的旧缓存；保留本清单及本会话使用中的文件，不碰存档、其它音频缓存或用户文件。
- 图片解码限15秒；解码错误最多失效重取一次，之后明确失败。释放、换路径后迟到的异步回调不能覆盖新图片。`readAssetBytes` 为未来二进制模型提供相同下载入口，尚未接正式模型。
- 云模式下营地9张必需图片未就绪，暂停模拟/耗氧与移动，提供进度、失败重试及回主界面。不会让玩家在无岸坡图片的状态下继续玩。旧岩体/家场景仍使用现有绘制降级，未新增全局强制联网入口。

微信[文件系统](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/file-system.html)区分临时文件与持久用户文件；临时下载路径不能当作长期缓存。云下载使用当前环境的[cloud.downloadFile](https://developers.weixin.qq.com/minigame/dev/wxcloud/reference-sdk-api/storage/downloadFile/client.downloadFile.html)，不手工保存会过期的HTTPS临时地址。云端读取仍受原[云存储权限](https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/storage/api.html)约束；本轮没有放宽权限。

## 尚缺的上线步骤

1. 登录现有云环境 `cloud1-d8gh6fpnh6d0928e8`，进入云存储的 `assets/v1/` 文件夹。上传 `.cache/asset-release/assets/v1/` 内20个文件，保留完整哈希文件名。不要上传仓库、源码、manifest或用户存档。
2. 运行 `npm run assets:verify-script`；在微信开发者工具控制台执行 `.cache/asset-release/verify-cloud.js` 内容。脚本仅下载并核对20项字节数和MD5，要求结果 `allPassed: true`。生成fileID或上传进度条都不能代替这一步。
3. 将 `.cache/wechat-release/` 作为独立小游戏项目导入微信工具，检查首次联网、再次打开缓存、断网失败/重试、主菜单BGM与敲击音。工具的实际编译主包必须小于4M。
4. 手机检查内存、首次下载时间、断网/恢复与图形恢复后，再进入正常预览/发布流程。当前没有生成手机二维码、上传代码或正式发布。

每次重新生成上传目录会清理旧的临时产物；需要验收脚本时在 `assets:build` 后重新运行 `assets:verify-script`。仓库开发模式不需要手改成cloud，发布构建会自动切换；这样不会因为下一次生成清单把开发环境或发布候选模式混淆。

## 验证边界

`npm run assets:check` 检查源文件漂移、缓存与损坏重下、并发/超时/竞态、图片异步释放/重试和远端敲击音。`npm run assets:browser` 用实际游戏与本地服务器检查加载、故意阻断图片、暂停/输入门控和恢复；这不是已上传云文件的实测。`npm run release:check` 检查代码候选及无DOM启动。类型检查与原岩体资源回归保持通过。

素材外置不会自动解决GPU占用，下载文件大小与解码后内存不同；没有借本轮替换美术、降低分辨率或重写既有鱼/绳玩法。
