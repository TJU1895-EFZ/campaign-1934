# Campaign 1934 · 素材清单（ASSET MANIFEST）

> 更新时间：2026-10-27
> 当前版本：V1（Three.js WebGL）
> 所有素材由项目方提供或为项目自定义素材；运行时只加载 `AudioManager` / `SceneFactory` 实际引用的文件，其余素材随仓库保留但不会主动加载。

---

## 音频（Audio）

| 文件 | 大小 | 用途 | 使用情况 |
|---|---|---|---|
| `audio/battle_bgm.mp3` | 2.4 MB | 战斗背景音乐（项目方 2026-10-27 提供） | `AudioManager.startBattleBgm()`：战斗开始循环播放，夺桥成功后停止 |
| `audio/battle background noise.mp3` | 1.5 MB | 战场环境底噪循环 | `AudioManager.startBattleBg()`：加载后作为环境声铺底 |
| `audio/guns.mp3` | 591 KB | 远处/断续枪声采样（OpenGameArt，CC0 1.0） | `AudioManager.playDistantShot()` 随机截取片段 |
| `audio/sfx_horn.mp3` | 213 KB | 号角素材 | 当前未接入；开场号角由 Web Audio API 实时合成 |
| `audio/bgm_battle.mp3` | 1.4 MB | 备用背景音乐 | 当前未接入；导读/总览使用程序化环境音 |

近距步枪、跳弹、爆炸、脚步、河风、火炮、UI 与胜利和弦均由 Web Audio API 分层实时合成，不依赖音频文件。

---

## 视频（Video）

| 文件 | 大小 | 说明 |
|---|---|---|
| `video/vid_jungle_board.mp4` | 11 MB | 丛林段参考视频；当前版本未在场景中播放 |
| `video/vid_bunker_wall.mp4` | 18 MB | 碉堡段参考视频；当前版本未在场景中播放 |

> 这两个文件与 `reference/ref_battle_videos/` 中的影视资料内容相同，保留用于后续场景投影或过场扩展，不参与当前构建产物中的加载。

---

## 视觉参考（Reference）

> 以下素材**不参与构建**，仅用于美术风格与模型设计参考。

### 3D 模型参考图

| 文件 | 大小 | 用途 |
|---|---|---|
| `reference/ref_model_soldier_red.jpeg` | 60 KB | 红军士兵外观参考（灰蓝军装、红袖标、军帽、绑腿、步枪） |
| `reference/ref_model_soldier_kmt.jpeg` | 89 KB | 国民党军士兵外观参考（土黄军装、头盔、步枪） |

### 场景与 UI 参考图

| 文件 | 大小 | 用途 | 对应场景 |
|---|---|---|---|
| `reference/ref_bunker.png` | 959 KB | 碉堡外观 | 阶段 2/3 碉堡防线 |
| `reference/ref_jungle_01.png` | 686 KB | 丛林场景 | 阶段 1 丛林接敌 |
| `reference/ref_jungle_02.png` | 436 KB | 丛林场景 | 阶段 1 丛林接敌 |
| `reference/ref_street_01.png` | 594 KB | 街巷场景 | 阶段 4 街巷肃清 |
| `reference/ref_street_02.png` | 636 KB | 街巷场景 | 阶段 4 街巷肃清 |
| `reference/ref_street_03.png` | 114 KB | 街巷场景 | 阶段 4 街巷肃清 |
| `reference/ref_ui_01.png` | 38 KB | UI 参考 | 导读页/总览页 |
| `reference/ref_ui_02.png` | 42 KB | UI 参考 | 导读页/总览页 |

### 飞夺泸定桥影视资料

| 文件 | 大小 | 用途 |
|---|---|---|
| `reference/ref_battle_videos/video 01.mp4` | 11 MB | 飞夺泸定桥影视资料（上） |
| `reference/ref_battle_videos/video 02.mp4` | 18 MB | 飞夺泸定桥影视资料（下） |
| `reference/ref_battle_videos/video02-0.5.png` | 555 KB | 关键帧截图 |

**参考要点：** 士兵服装色调、环境雾效、河水颜色、天空色调、光照方向与镜头语言。视频中的受挫表现、冲锋节奏和桥面机枪压制画面是战斗表现的重要参考。

> 影视资料由项目方提供，仅用于制作参考；如需在公开页面中播放，须由项目方确认发布权。

---

## 3D 模型（Models）

当前版本没有外部 3D 模型文件。士兵、铁索桥、碉堡、街巷建筑等全部由项目代码程序化生成（合并几何 + 顶点色）。

---

## 纹理（Textures，CC0）

| 文件 | 用途 |
|---|---|
| `textures/wooden_planks_*_1k.jpg` | 木纹（铁索桥桥面） |
| `textures/dark_rock_*_1k.jpg` | 岩石（河岸/山体） |
| `textures/rusty_metal_*_1k.jpg` | 锈蚀金属（铁索/碉堡） |

后缀 `_diff` = albedo，`_nor_gl` = normal，`_rough` = roughness。来源与授权见 `docs/ASSET_LICENSES.md`。

---

## 发布前检查

- [ ] 战斗背景音乐与参考影视资料的发布权由项目方确认。
- [ ] 替换任何素材后同步更新本清单与 `docs/ASSET_LICENSES.md`。
- [ ] 不引入来源不明或授权不清的图片、音频、视频和字体。
