# 洞穴美术与运行版本档案

用户于2026-10-26明确要求继续推进，同时把不同版本留住，保留回退机会。规则是每轮重要版本独立提交并加命名标签；后续不移动旧标签，也不强制重写历史。

| 回退点 | 保存内容 | 状态 |
| --- | --- | --- |
| `cave/art-approved-01` | 首次让用户稍微满意的断冠双岔洞美术、原图与制作管线 | 美术方向基线，非定稿 |
| `cave/mobile-v1.0.20` | 手机已跑通版本、真实玩法、无performance兼容修复 | 手机运行基线 |
| `cave/sculpt-e01` | 上一轮厚岩雕刻、投影侧面与不规则轮廓 | 独立实验，偏光滑 |
| `cave/sculpt-e02-rough` | 第二轮地质雕刻第一遍、未量化全精度资源 | 独立初稿，细碎凹凸太多 |
| `cave/sculpt-e02` | 第二轮收敛版：主裂缝、有限凹槽、局部轮廓破口与受控资源导出 | 独立实验，未替换手机版 |
| `cave/art-progress-e02` | 用户认可E02正在进步的检查点，含历史版本试跑验收 | 认可进步，非最终验收 |
| `cave/sculpt-e03-contact` | 多段磨损侧面、法线相对接触遮挡及水域边界采样修正 | E03首遍独立留档 |
| `cave/sculpt-e03-masses` | 宽断面、局部破肩与小范围侵蚀，不统一中心鼓起 | E03第二遍独立留档 |
| `cave/sculpt-e03` | 宽断面和接触收敛版，增加凹口顶面完整裁剪 | 本轮当前独立实验，未替换手机版 |

普通手机版仍为v1.0.20，不因开发实验增加资源包或变更存档。用户的私有开发者工具配置不在本轮提交或快照导出范围内。所有提交和标签均为本地保存，未自动推送远端；这不是异地备份。

2026-10-26，用户确认E02收敛版「感觉是在进步」，要求先提交一次再继续。E02美术提交60482ab与已通过回退运行测试的fa03bc1均已保存，额外用 `cave/art-progress-e02` 标记这一认可进步的检查点；这不是最终美术验收。后续E03独立推进，不移动E02及手机基线标签。

## 同时打开不同历史版本

```sh
npm run cave:versions -- --all
```

从每个固定Git标签导出相关源码、四张岩体图、运行资源及浏览器适配器到各自缓存目录，生成 `node_modules/.cache/cave-versions/index.html`。入口同时存在，不切换当前分支、不覆盖当前贴图，不让多个版本暗中共用新图。

也可只重建一个版本：

```sh
npm run cave:versions -- --build mobile-v120
npm run cave:versions -- --build sculpt-e01
npm run cave:versions -- --build sculpt-e02-rough
npm run cave:versions -- --build sculpt-e02
npm run cave:versions -- --build sculpt-e03-contact
npm run cave:versions -- --build sculpt-e03-masses
npm run cave:versions -- --build sculpt-e03
```

版本库是Git提交与标签，不是node_modules缓存。缓存可以删除后重新生成；若本地没有对应标签，先恢复仓库/标签再重建，不改目录ID去冒充旧版本。

在本地静态服务60972上验收历史版本：

```sh
npm run cave:versions:check
```

检查每版四张岩体资产的内容来自各自提交、无私有配置拷入、无performance时游戏继续绘制与扣氧，退出释放资源，并确认当前工作区未被历史构建修改。手机帧率与最终美术验收仍单独进行。

## 真正回退代码时

仅查看和试跑旧版，用上面的独立档案，不必回退工作区。

如果需要继续在旧版本上开发，先检查并保存当前未提交改动，再从指定标签新建分支，而不是强制覆盖当前分支：

```sh
git status --short
git switch -c cave/return-mobile-v120 cave/mobile-v1.0.20
```

这是手动回退说明，不是本轮已执行操作。存在未提交改动时先按内容处理，尤其保留用户私人配置；不得使用 `git reset --hard` 或覆盖现有旧标签来图省事。

原历史提交60fed3e、1d1c7c5、ac0e5e0、21966ab、9457817也仍在Git历史中；重要基线额外使用命名标签，方便后续精确回看。
