# Grok2API

基于 FastAPI 的 Grok API / Web 工作台项目，面向个人部署、二开和 API 接入场景。
> [!NOTE]
> 本项目仅供学习与研究，请在遵守 Grok 使用条款和当地法律法规的前提下使用。


## 部署推荐

- 优先推荐 `Render`：适合直接在线部署，配置简单，长期使用比 Vercel 更稳
- 优先推荐 `Docker / Docker Compose`：适合本地、NAS、云主机、自托管环境
- `Vercel` 更适合作为轻量无状态部署，如需长期使用请务必配置远程存储

## 快速开始

### 1. 本地运行

要求：

- Python `3.13+`
- 建议使用 `uv`

启动：

```bash
git clone https://github.com/XianYuDaXian/grok2api
cd grok2api

uv sync
uv run main.py
```

> [!IMPORTANT]
> 当前仓库锁定 `curl_cffi 0.15.0b4`，用于兼容较新的 Chrome 浏览器指纹（例如 `chrome145`）。
> 直接使用仓库自带的 `uv.lock` 执行 `uv sync` 即可；如果你需要手动刷新锁文件或重解依赖，请允许预发布版本，例如 `uv lock --prerelease=allow`。

默认访问：

- Web 首页：`http://127.0.0.1:8000`
- 管理后台：`http://127.0.0.1:8000/admin`

### 2. 初始化配置

项目默认配置在 [config.defaults.toml](config.defaults.toml)。

推荐优先配置这些环境变量：

| 变量名 | 说明 | 默认值 |
| :-- | :-- | :-- |
| `APP_KEY` / `app.app_key` | 管理后台密码 | `grok2api` |
| `API_KEY` / `app.api_key` | OpenAI 兼容 API Key（支持单个或逗号分隔多个 Key） | 空 |
| `PUBLIC_ENABLED` / `app.public_enabled` | 是否开启前端 Public 页面 | `false` |
| `PUBLIC_KEY` / `app.public_key` | Public 页面调用密钥 | 空 |
| `DATA_DIR` | 数据目录 | `./data` |
| `LOG_LEVEL` | 日志级别 | `INFO` |
| `LOG_FILE_ENABLED` | 是否启用文件日志 | `true` |
| `SERVER_STORAGE_TYPE` | 存储类型：`local` / `redis` / `mysql` / `pgsql` | `local` |
| `SERVER_STORAGE_URL` | 外部存储连接串 | 空 |

常见存储连接串示例：

- Redis：`redis://:password@host:6379/0`
- MySQL：`mysql+aiomysql://user:password@host:3306/db`
- PostgreSQL：`postgresql+asyncpg://user:password@host:5432/db`

## Docker Compose 部署

项目自带 [docker-compose.yml](docker-compose.yml) 和 [Dockerfile](Dockerfile)。

### 方式零：直接 `docker run`

如果你只想快速拉镜像启动，可以直接运行：

```bash
docker run --rm -p 8000:8000 \
  -e LOG_LEVEL=INFO \
  -e SERVER_STORAGE_TYPE=local \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  ghcr.io/xianyudaxian/grok2api:latest
```

Windows PowerShell 示例：

```powershell
docker run --rm -p 8000:8000 `
  -e LOG_LEVEL=INFO `
  -e SERVER_STORAGE_TYPE=local `
  -v ${PWD}\data:/app/data `
  -v ${PWD}\logs:/app/logs `
  ghcr.io/xianyudaxian/grok2api:latest
```

如果你要长期使用，建议把 `SERVER_STORAGE_TYPE` 改成 `redis/mysql/pgsql`，不要依赖容器内本地状态。

### 方式一：直接使用当前仓库

```bash
git clone https://github.com/XianYuDaXian/grok2api
cd grok2api
docker compose up -d
```

当前 `docker-compose.yml` 默认使用现成镜像，并挂载：

- `ghcr.io/xianyudaxian/grok2api:latest`
- `./data:/app/data`
- `./logs:/app/logs`

### 方式二：使用你自己的代码构建镜像

如果你希望 Compose 始终跑当前仓库代码，建议把 `docker-compose.yml` 中的 `image:` 改成 `build:`：

```yaml
services:
  grok2api:
    build:
      context: .
      dockerfile: Dockerfile
```

然后执行：

```bash
docker compose up -d --build
```

### 可选：Cloudflare 自动刷新

如果你的环境需要处理 Cloudflare，可在 Compose 里启用：

- `FLARESOLVERR_URL`
- `CF_REFRESH_INTERVAL`
- `CF_TIMEOUT`

并同时启用 `flaresolverr` 服务。

> [!TIP]
> 启用 Cloudflare 自动刷新后，程序会根据 FlareSolverr 返回的 User-Agent 更新 `proxy.browser`。如果你的环境里仍使用旧版 `curl_cffi`，可能会在较新的 Chrome 指纹上报出 `Impersonating chromeXXX is not supported`。请优先使用仓库当前锁定版本，或在手动安装时带上 `--pre`。

## Vercel 部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/XianYuDaXian/grok2api&env=LOG_LEVEL,LOG_FILE_ENABLED,DATA_DIR,SERVER_STORAGE_TYPE,SERVER_STORAGE_URL,PUBLIC_ENABLED,PUBLIC_KEY&envDefaults=%7B%22DATA_DIR%22%3A%22%2Ftmp%2Fdata%22%2C%22LOG_FILE_ENABLED%22%3A%22false%22%2C%22LOG_LEVEL%22%3A%22INFO%22%2C%22SERVER_STORAGE_TYPE%22%3A%22local%22%2C%22SERVER_STORAGE_URL%22%3A%22%22%2C%22PUBLIC_ENABLED%22%3A%22true%22%2C%22PUBLIC_KEY%22%3A%22%22%7D)

项目已包含 [vercel.json](vercel.json)。

Vercel 部署建议：

- 必设 `DATA_DIR=/tmp/data`
- 建议设 `LOG_FILE_ENABLED=false`
- 不建议使用 `local` 保存长期状态
- 推荐直接使用外部 `redis/mysql/pgsql` 保存配置、Token 和运行状态
- 如需前端工作台，建议同时设置 `PUBLIC_ENABLED=true` 和 `PUBLIC_KEY`

推荐环境变量：

```env
LOG_LEVEL=INFO
LOG_FILE_ENABLED=false
DATA_DIR=/tmp/data
SERVER_STORAGE_TYPE=redis
SERVER_STORAGE_URL=redis://:password@host:6379/0
PUBLIC_ENABLED=true
PUBLIC_KEY=your-own-long-random-key
```

如果你使用 PostgreSQL，也可以改成：

```env
SERVER_STORAGE_TYPE=pgsql
SERVER_STORAGE_URL=postgresql+asyncpg://user:password@host:5432/db
```

适用场景：

- 轻量 API 转发
- 临时演示
- 无需本地持久化日志/缓存

注意：

- Vercel 的本地磁盘是临时的
- 后台保存的配置如果依赖 `local`，在冷启动或实例切换后可能恢复默认值
- 大量视频/图片缓存不适合长期放在 `local`
- 如果你要长期使用管理后台、Public 页面和工作台，建议从一开始就配置远程存储

## Render 部署

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/XianYuDaXian/grok2api)

项目已包含 [render.yaml](render.yaml)。

默认是 Docker 部署，推荐配置：

- `TZ=Asia/Shanghai`
- `SERVER_HOST=0.0.0.0`
- `SERVER_PORT=8000`
- `PUBLIC_ENABLED=true`
- `PUBLIC_KEY=<你自己的 public key>`

如果你要长期使用，建议：

- 把 `SERVER_STORAGE_TYPE` 改成 `redis/mysql/pgsql`
- 配置持久化数据库或缓存
- 不要依赖本地磁盘保存长期状态

Render 免费实例注意：

- 长时间无访问会休眠
- 重建实例后本地文件可能丢失

这个仓库是我维护的分支版本，重点做了这些方向的增强：

## 主要增强

### 1. WS 瀑布流增强

![Imagine 瀑布流演示](asset/imagine瀑布流演示.webp)

功能总结：

- WS 瀑布流图片可点击进入预览编辑模式，方便快速迭代图片元素
- 可复制 `parentPostId`
- 可把 `parentPostId` 写入全局记忆，供后续视频生成和图片编辑复用

### 2. 图片编辑工作台

![图片工作台演示](asset/图片工作台演示.webp)

功能总结：

- 支持首次上传图片：文件选择 / 拖拽 / 粘贴
- 支持后续循环编辑，不重复上传图片
- 右侧显示编辑历史，可“设为当前”和“复制ID”
- 支持粘贴 `parentPostId` 直接拉取并继续编辑
- 支持最多三图参考编辑
- 提示词区域支持 `@Image 1`、`@Image 2` 这类标签块引用

### 3. 视频生成页加强 / 视频延长拼接

![视频工作台演示](asset/视频工作台演示.webp)

![视频延长演示](asset/视频延长演示.webp)

功能总结：

- 支持文生视频
- 支持参考图生视频
- 支持基于 `parentPostId` 生视频
- 支持直接粘贴 `parentPostId`，自动回填参考图预览
- 支持文件选择 / 拖拽 / 粘贴图片
- 支持并发视频数量可选
- 支持多图参考生成视频，可在提示词区域精准 `@图片`
- 视频拼接 / 延长改用官网逻辑，效果比本地拼接更好
- 支持循环延长，最长 30 秒

### 4. NSFW 全流程

![NSFW 全流程](asset/nsfw全流程.webp)

功能总结：

- 流程为：先生候选图，再选图并行生成视频
- 这样做的原因是，先生图再生视频的 NSFW 强度通常比一句话直出视频更强
- 候选图支持继续编辑，复用与图片工作台一致的编辑交互和历史能力
- 并行视频数支持 `1~4`
- 任务可随时中断

### 5. 跨页面共用能力

功能总结：

- 全局 `parentPostId` 记忆
- 来源：WS 瀑布流、图片编辑工作台、NSFW 候选图 / 编辑结果
- 去向：视频生成页、图片编辑工作台可直接粘贴使用
- 目标是让用户从“生图 → 选图 → 编辑 → 生视频”全程不需要反复上传

### 6. 交互与移动端优化

<p align="left">
  <img src="asset/移动端演示1.webp" alt="移动端演示1" width="19%">
  <img src="asset/移动端演示2.webp" alt="移动端演示2" width="19%">
  <img src="asset/移动端演示3.webp" alt="移动端演示3" width="19%">
  <img src="asset/移动端演示4.png" alt="移动端演示4" width="19%">
  <img src="asset/移动端演示5.webp" alt="移动端演示5" width="19%">
</p>

补充能力：

- 内置提示词增强
- 移动端优化
- 支持注册成 PWA，方便桌面进入
- 支持夜间模式
- 修复移动端 LiveKit 使用问题

## 更新记录

- `2026-02-27`：并入上游 `02d4f91` 等 Chat 服务更新
- `2026-02-28`：图片编辑支持最多三图参考
- `2026-03-03`：改用官网延长拼接逻辑，效果比本地拼接更佳
- `2026-03-13`：支持多图参考生成视频、图片，提示词区域可精准 `@图片`

## 目录说明

```text
app/
  api/                路由与页面入口
  services/           Grok / Token / Upload / Reverse 等核心逻辑
  static/             前端页面、脚本、样式
asset/                README 演示截图
data/                 本地数据目录
logs/                 日志目录
docker-compose.yml    Docker Compose 部署
Dockerfile            Docker 镜像构建
vercel.json           Vercel 部署配置
render.yaml           Render 部署配置
config.defaults.toml  默认配置
main.py               应用入口
```

## 前端页面

开启 `public_enabled=true` 后，可以直接使用这些页面：

- `/chat`
- `/imagine`
- `/imagine-workbench`
- `/video`
- `/nsfw`
- `/login`

建议至少设置：

- `app.public_enabled = true`
- `app.public_key = "<自定义密钥>"`

## 管理后台

地址：

- `http://<host>:8000/admin`

默认密码：

- `grok2api`

建议部署后立刻修改：

- `app.app_key`

后台能力包括：

- Token 导入 / 删除 / 状态查看
- 配置在线修改
- 缓存查看与清理
- NSFW 相关辅助操作

## API 用法

### 对话接口

`POST /v1/chat/completions`

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "grok-4.1-fast",
    "messages": [
      {
        "role": "user",
        "content": "你好，介绍一下你自己"
      }
    ],
    "stream": false
  }'
```

### 多图参考视频

`@Image n` 是对外写法，`[[IMAGE_TAG_n]]` 只是提示词增强链路内部占位符。

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "grok-imagine-1.0-video",
    "stream": false,
    "video_config": {
      "aspect_ratio": "9:16",
      "video_length": 6,
      "resolution_name": "480p",
      "preset": "custom"
    },
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "镜头固定在@Image 1，然后下拉，@Image 2 从左边进入镜头，@Image 3 从右边进入镜头"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,AAA..."
            }
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,BBB..."
            }
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,CCC..."
            }
          }
        ]
      }
    ]
  }'
```

### 单图模式视频

`POST /v1/public/video/start`

单图时可通过 `single_image_mode` 指定这张图的用途：

- `frame`：作为首帧
- `reference`：作为参考图

单图作为首帧：

```bash
curl http://127.0.0.1:8000/v1/public/video/start \
  -H "Content-Type: application/json" \
  -H "x-public-key: YOUR_PUBLIC_KEY" \
  -d '{
    "prompt": "两人合唱",
    "reference_items": [
      {
        "image_url": "data:image/png;base64,AAA...",
        "source_image_url": "data:image/png;base64,AAA...",
        "mention_alias": "Image 1"
      }
    ],
    "single_image_mode": "frame",
    "aspect_ratio": "3:2",
    "video_length": 6,
    "resolution_name": "480p",
    "preset": "normal",
    "concurrent": 1
  }'
```

单图作为参考图：

```bash
curl http://127.0.0.1:8000/v1/public/video/start \
  -H "Content-Type: application/json" \
  -H "x-public-key: YOUR_PUBLIC_KEY" \
  -d '{
    "prompt": "两人合唱",
    "reference_items": [
      {
        "image_url": "data:image/png;base64,AAA...",
        "source_image_url": "data:image/png;base64,AAA...",
        "mention_alias": "Image 1"
      }
    ],
    "single_image_mode": "reference",
    "aspect_ratio": "3:2",
    "video_length": 6,
    "resolution_name": "480p",
    "preset": "normal",
    "concurrent": 1
  }'
```

### 图片编辑

`POST /v1/images/edits`

```bash
curl http://127.0.0.1:8000/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "model=grok-imagine-1.0-edit" \
  -F "prompt=@Image 1 在左边，@Image 2 在右边，两人合照" \
  -F "image=@/path/to/image1.png" \
  -F "image=@/path/to/image2.png"
```

## 兼容性说明

- 对外调用建议使用 `@Image 1`、`@Image 2`
- 提示词增强时内部会临时转成 `[[IMAGE_TAG_n]]`，增强完成后再恢复
- 视频 API 已支持多图参考输入
- 图片编辑工作台与 Video 工作台已支持标签块引用

## 常见问题

### 1. 页面打不开

先检查：

- `app.public_enabled` 是否已开启
- `app.public_key` 是否已设置
- 反向代理是否正确转发 `/static` 与 API 路径

### 2. Vercel / Render 数据丢失

这是平台本地磁盘临时性的正常表现。请改用：

- Redis
- MySQL
- PostgreSQL

### 3. 视频 / 图片任务失败

优先排查：

- Token 是否有效
- 代理 / Cloudflare 环境是否正常
- 提示词是否触发上游审核

## 鸣谢

本项目基于上游项目持续演化，并结合我自己的使用场景做了前端工作台、视频多图参考、图片编辑链路、部署文档等方面的调整。

如果你是从我的分支使用或继续二开，欢迎保留来源信息并按自己的需求继续扩展。
