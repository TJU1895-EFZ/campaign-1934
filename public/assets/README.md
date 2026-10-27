# Campaign 1934 · 素材清单（ASSET MANIFEST）

> 更新时间：2026-10-24
> 所有素材由项目方提供，用于 V1.1（Unity WebGL 写实路线）开发参考与实现。

---

## 音频（Audio）

| 文件 | 大小 | 用途 | 对应 V1.1 需求 |
|---|---|---|---|
| `audio/sfx_horn.mp3` | 213 KB | 号角声 — 战斗开始时吹响 | 已有 `AudioManager.playHorn()` 使用 |
| `audio/bgm_battle.mp3` | 1.4 MB | 战斗背景音乐 | V1.1 A1 导读页/总览页 BGM（红色主题、旋律激昂纯音乐） |
| `audio/guns.mp3` | — | 远处枪声采样（V1 已有） | 原 V1 远处枪声 CC0 采样 |

**V1.1 还需提供的音频（项目方未提供，开发时用占位）：**
- `sfx_ui_hover_open.mp3` — 可进入卡片悬停音
- `sfx_ui_hover_locked.mp3` — 锁定卡片悬停音
- `sfx_charge_shout.mp3` — 红军冲锋呐喊

---

## 视频（Video）

| 文件 | 大小 | 用途 | 对应 V1.1 需求 |
|---|---|---|---|
| `video/vid_jungle_board.mp4` | — | 丛林段宣传牌 — 场景内视频投影 | V1.1 E2 阶段 1 屏幕 |
| `video/vid_bunker_wall.mp4` | — | 对岸碉堡正面墙 — 场景内视频投影 | V1.1 E2 阶段 2/3 屏幕 |

**V1.1 还需提供的视频（项目方未提供，开发时用占位）：**
- `vid_street_wall.mp4` — 街巷房屋墙面（阶段 4 屏幕）

---

## 视觉参考（Reference Images）

> 以下素材**不参与构建**，仅用于美术风格参考。V1.1 F 组写实化时，3D 模型和纹理应参考这些素材的色调、光影、氛围。

### 3D 模型参考图（AI 建模用）

> 以下图片用于 AI 生成 3D 模型时的参考，确保红军和国民党军的外观符合历史。

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

---

## 飞夺泸定桥全过程影视资料（Battle Reference）

> **`battle.mp4`（141 MB）和 `battle 02.mp4`（97 MB）是飞夺泸定桥的完整影视资料。**
> **游戏的美术风格必须按这两个视频来——色调、光影、氛围、镜头语言。**
> 同时对应剧情可以参考，帮助理解各阶段视觉表现。

| 文件 | 大小 | 用途 |
|---|---|---|
| `reference/ref_battle_videos/battle.mp4` | 141 MB | 飞夺泸定桥全过程（上）— 包含丛林接敌、第一波突击、第二波突击、街巷肃清 |
| `reference/ref_battle_videos/battle 02.mp4` | 97 MB | 飞夺泸定桥全过程（下）— 补充镜头和细节 |
| `reference/ref_battle_videos/video02-*.png` | 各 555 KB | `battle 02.mp4` 的关键帧截图（0.5s / 3s / 6s / 9s / 12s / 15s） |

**开发指引：**
- F 组写实化时，士兵服装色调、环境雾效、河水颜色、天空色调、光照方向——全部参考这两个视频
- 各阶段过渡的镜头语言（如从丛林到桥面的视角变化）也可参考
- 视频中的受挫表现（第一波突击倒下）、冲锋节奏、桥面机枪压制画面是 B/C 组动画和节奏的重要参考

---

## 3D 模型（Models）

> 项目方尚未提供，V1.1 F 组开发时需要。

| 文件名（待提供） | 用途 |
|---|---|
| `models/soldier_red.glb` | 写实红军士兵（PBR + 骨骼动画） |
| `models/soldier_kmt.glb` | 写实国民党军士兵 |
| `models/env_bridge.glb` | 写实铁索桥/桥头堡/碉堡 |
| `models/env_street.glb` | 写实街巷房屋/垃圾桶/废弃车辆 |
| `models/hdri_*.exr` | HDRI 环境贴图（户外自然光照） |

---

## 已有纹理（Textures，V1 沿用）

> 以下 CC0 纹理 V1 已在使用，V1.1 写实化时可作为参考或替换。

| 文件 | 用途 |
|---|---|
| `textures/wooden_planks_*_1k.jpg` | 木纹（铁索桥桥面参考） |
| `textures/dark_rock_*_1k.jpg` | 岩石（河岸/山体参考） |
| `textures/rusty_metal_*_1k.jpg` | 锈蚀金属（铁索/碉堡参考） |

后缀 `_diff` = albedo, `_nor_gl` = normal, `_rough` = roughness。
