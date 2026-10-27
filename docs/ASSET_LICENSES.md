# 素材与授权说明

本文件记录 Campaign 1934 第一版使用的视觉、音频、字体和文本素材来源。

## V1.1 Unity WebGL 补充

| 类别 | Unity 路径 | 来源 | 授权/说明 |
| --- | --- | --- | --- |
| PBR 纹理 | `Assets/Resources/Textures/` | 下表 Poly Haven 素材的项目内副本 | CC0 1.0 |
| 远处枪声 | `Assets/StreamingAssets/Audio/guns.mp3` | OpenGameArt，见 1.2 | CC0 1.0 |
| BGM、号角 | `Assets/StreamingAssets/Audio/` | `public/assets/` 中项目方提供素材 | 项目方提供；发布权由项目方确认 |
| 场景投影视频 | `Assets/StreamingAssets/Video/vid_*.mp4` | `public/assets/` 中项目方提供的战役视频剪辑 | 项目方提供；三个阶段使用独立片段 |
| 红军/守军士兵 | `Assets/Resources/Models/soldier_*.fbx` | Ara 3D Gen `0c3473d7d46a2badcdcd1dcfd4aeb0762eb04b20` 本地生成 | 导出模型按 MIT 分发；生成器 MIT；底层 MakeHuman 数据 CC0；参数与许可证随模型保存 |
| 建筑与环境 | Unity Primitive + 项目 C# 代码生成 | 本项目原创几何 + Poly Haven PBR 纹理 | 代码随项目 Apache-2.0；纹理 CC0 1.0 |

士兵并非下载的商业模型包，而是用 MIT 许可的生成器和 CC0 人体数据按项目参考图参数化生成。精确生成参数、生成器提交号和两份许可证位于 `Assets/Resources/Models/Source/`，因此可以复现和审计。

## 1. 自有/程序化素材

| 类别 | 素材 | 来源 | 授权/说明 |
| --- | --- | --- | --- |
| 3D 场景 | 铁索桥、桥头堡、山体、河流、沙袋、机枪阵地、雨雾、火焰、烟雾 | 项目代码程序化生成（Three.js 几何、CanvasTexture、Sprite） | 本项目原创；木桥/岩石/铁索表面使用下方 Poly Haven CC0 纹理 |
| 3D 士兵 | 红军/国民党军低多边形士兵、步枪 | 项目代码程序化生成（合并几何 + 顶点色） | 本项目原创，无外部模型 |
| UI 图形 | 导读页山峦/铁索 SVG、卡片纹理、HUD、按钮、图标 | 项目代码与 CSS 生成 | 本项目原创 |
| 音效 | 近距步枪、跳弹、爆炸、河水、脚步、风雨、远处炮火、UI、胜利和弦 | Web Audio API 分层实时合成 | 本项目原创 |
| 远处枪声采样 | 战场远处/断续枪声 | `public/assets/audio/guns.mp3`，来自 OpenGameArt | 外部 CC0 1.0 采样，见 1.2 |
| 剧情文本 | 4 个阶段的文字剧情、结算结语 | `src/content/narration.ts`，来自 `PRD.md` 附录 A 初稿 | 本项目原创文本，仅以文字字幕呈现；公开发布前需完成历史内容审核 |
| 导读/卡片/结算文本 | 长征介绍、战役卡片、结算文案 | `src/content/`、`PRD.md` 附录 B/C | 本项目原创文本；历史事实参考公开资料 |

### 1.1 外部 CC0 纹理

以下纹理来自 Poly Haven，采用 CC0 1.0 公有领域 dedication，可商用、无需署名（项目仍在此记录来源）：

| 文件 | 原始素材 | 来源 | 授权 |
| --- | --- | --- | --- |
| `wooden_planks_diff_1k.jpg`、`wooden_planks_nor_gl_1k.jpg`、`wooden_planks_rough_1k.jpg` | Wooden Planks | https://polyhaven.com/a/wooden_planks | CC0 1.0 |
| `rusty_metal_diff_1k.jpg`、`rusty_metal_nor_gl_1k.jpg`、`rusty_metal_rough_1k.jpg` | Rusty Metal | https://polyhaven.com/a/rusty_metal | CC0 1.0 |
| `dark_rock_diff_1k.jpg`、`dark_rock_nor_gl_1k.jpg`、`dark_rock_rough_1k.jpg` | Dark Rock | https://polyhaven.com/a/dark_rock | CC0 1.0 |

下载尺寸为 1K JPG，文件位于 `public/assets/textures/`。CC0 不要求署名；如项目方愿意，可在公开页面致谢 Poly Haven 及其贡献者。

### 1.2 外部 CC0 音频

| 文件 | 素材 | 来源 | 授权 |
| --- | --- | --- | --- |
| `public/assets/audio/guns.mp3` | Gunshot Sounds（靶场枪声录音合集，截取随机片段用于远处/断续枪声） | https://opengameart.org/content/gunshot-sounds，作者 Tabasco | CC0 1.0 |

该采样仅用于战场远处的枪声层；近距步枪、炮火、河风等仍由 Web Audio API 实时合成。若替换为其他录音，需在发布前更新本表并确认授权。

## 2. 字体

项目不随包分发字体文件，CSS 使用系统中文字体栈：

- 标题：`Noto Serif SC`、`Source Han Serif SC`、`Songti SC`、`SimSun`、serif
- 正文：`Noto Sans SC`、`Source Han Sans SC`、`Microsoft YaHei`、`PingFang SC`、sans-serif
- 等宽：`SFMono-Regular`、`Consolas`、`Liberation Mono`、monospace

如果未来将 Noto 字体文件打包进项目，需同时附带其 SIL Open Font License（OFL）授权文件。

## 3. 第三方依赖

| 依赖 | 用途 | 许可证（以安装包为准） |
| --- | --- | --- |
| three | WebGL 渲染 | MIT |
| vite | 构建与开发服务器 | MIT |
| typescript | 类型检查 | Apache-2.0 |
| vitest | 单元测试 | MIT |
| @playwright/test | 端到端测试 | Apache-2.0 |
| jsdom | 测试 DOM 环境 | MIT |

依赖的完整许可证文本以 `node_modules/<package>/LICENSE` 为准。

## 4. 未使用的素材

`art/` 下的参考视频和图片由项目方提供，仅在本地用于视觉参考，已加入 `.gitignore`，不随应用或仓库分发；应用内人物与环境由程序化几何和 CC0 纹理重建。

除 1.1 的 Poly Haven 纹理和 1.2 的 OpenGameArt 枪声采样外，第一版未使用：

- 历史照片、影视剧照、纪录片截图；
- 其他第三方 3D 模型、贴图、动作捕捉数据；
- 其他第三方音乐、音效采样；
- 商业中文字体文件。

如果后续替换为历史照片、插画、模型或录音，必须在发布前补充到本文件，记录文件名、作者、来源链接、授权类型和使用位置；无法确认授权的素材不得上线。

## 5. 发布前检查清单

- [ ] 文字剧情与历史文案完成内容审核。
- [ ] 所有新增图片/音频/模型有明确授权记录。
- [ ] 字体授权文件随项目分发（如使用外部字体）。
- [ ] 依赖许可证未被移除或修改。
- [ ] 未使用来源不明的网络图片或音频。
