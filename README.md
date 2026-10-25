# 鸡尾酒知识库 MVP

本地鸡尾酒知识库：爬取 MixMyth / TheCocktailDB 配方，图片进 MinIO，结构化数据进 PostgreSQL，BGE-M3 + pgvector 做检索，LangGraph 编排 DeepSeek 流式问答（库内配方或定制特调）。

管理页：<http://127.0.0.1:8000/>

---

## 技术栈

| 层 | 技术 | 用途 |
| --- | --- | --- |
| Web | FastAPI + Jinja2 + 原生 JS | 管理页、爬取/向量化/对话接口 |
| 编排 | LangGraph + LangChain | 意图识别、反问、检索、流式生成 |
| LLM | DeepSeek `deepseek-chat` | 问答 / 特调文案（OpenAI 兼容接口） |
| 生图 | 通义 `qwen-image-2.1-pro` | 仅定制特调配图（阿里云百炼） |
| 向量 | 本地 BGE-M3 + SentenceTransformers | 1024 维稠密向量，L2 归一化 |
| 数据库 | PostgreSQL 16 + pgvector | 配方表、chunk、HNSW 余弦检索 |
| 对象存储 | MinIO | 配方图、定制生图；库里只存 URL |
| 爬虫 | httpx 后台线程 | MixMyth JSON、CocktailDB 官方 API |

---

## 整体数据流

```mermaid
flowchart LR
  sites[MixMyth_CocktailDB] --> crawler[爬虫清洗]
  crawler --> pg[(Postgres kb_recipe)]
  crawler --> minio[(MinIO 图片)]
  pg --> chunker[拼 recipe_full 文本]
  chunker --> bge[BGE-M3]
  bge --> vec[(kb_chunk + pgvector)]
  user[管理页对话] --> graph[LangGraph]
  graph --> vec
  graph --> ds[DeepSeek]
  graph --> qwen[qwen-image-2.1-pro]
  qwen --> minio
  graph --> user
```

---

## 爬虫技术方案

页面点「开始爬取」后，`crawler/scheduler.py` 在后台线程串行执行，同一时间只允许一个任务。

```text
spiders/          拉原始配方
    ↓
pipeline.py       清洗成统一字段（杯型、技法、材料、用量、步骤）
    ↓
images.py         下载原图 → 上传 MinIO → image_url 换成桶内地址
    ↓
ingest.py         按 (source, source_id) upsert 到 kb_recipe
    ↓
（可选）rag ingest  拼 chunk → 向量化 → kb_chunk
```

### MixMyth

- 没有公开开发者文档，走站点前端同一套 JSON：`GET https://mixmyth.com/api/recipes?page=`
- 每页 20 条，响应里已含材料、步骤、杯型、基酒、酒精度
- 默认间隔 `MIXMYTH_DELAY_SECONDS=0.8`，带自定义 UA

### TheCocktailDB

- 官方 V1 测试 key 默认 `1`：`/api/json/v1/1/search.php?f=a`
- 按字母 / 数字列出配方，单次响应即完整详情
- 默认间隔 `COCKTAILDB_DELAY_SECONDS=0.35`

### 去重与存储

- 唯一键：`(source, source_id)`，重复爬取更新字段，不插第二行
- 图片对象名：`{source}/{source_id}.jpg`；桶里已有则跳过下载
- 表：`kb_recipe`、`kb_recipe_ingredient`、`crawl_run`（每次任务一条进度）

---

## RAG 知识库与问答流程

### 入库（向量化）

一条配方对应一段 `recipe_full` chunk（不调 LLM 切分）：

1. `chunker` 把名称、来源、基酒、杯型、技法、材料、做法拼成稳定中文文本
2. SHA-256 `content_hash`；内容没变则跳过
3. 本地 `ai-service/models/bge-m3` 编码为 **1024 维**，`normalize_embeddings=True`
4. 写入 `kb_chunk`，HNSW 索引 `vector_cosine_ops`

页面「向量化入库」走 `POST /api/rag/embed`；也可对单条语义检索 `GET /api/rag/search`。

### 意图识别

实现在 `app/rag/intent.py`，LangGraph 入口节点是 `classify`。每一轮用户话先判定 **意图** 和 **槽位**，再决定走反问、查库还是定制。

**三种意图**

| 意图 | 判定 | 行为 |
| --- | --- | --- |
| `library` | 点名酒款（如莫吉托），或问怎么做 / 用什么酒 / 材料，且没说要定制 | 检索知识库；名称对得上或相关度 ≥ 0.55 则直接返回该配方 + MinIO 现成图，不新创、不生图 |
| `customize` | 出现「定制 / 特调 / 原创 / 专属 / 新配方」等；或上一轮已是定制、本轮只是在补槽 | 向量检索只当参考；DeepSeek 写新酒名与配方；再调 `qwen-image-2.1-pro` 生图 |
| `clarify` | 查询过泛（「推荐一杯」「好喝」），或定制但基酒 / 口味 / 调制方式里凑不够 2 项 | 只反问 1～2 个短问题，不给完整配方、不生图 |

**怎么分类（规则优先，模型补全）**

1. 关键词规则抽出槽位：`base_spirit`（朗姆/金酒/…）、`flavor`（清爽/偏甜/…）、`method`（摇荡/搅拌/兑和）、`named_drink`（莫吉托等）。
2. DeepSeek 再输出一份 JSON（`intent` + 上述槽位）。规则命中「定制」时强制 `customize`，避免模型把特调判成查库。
3. 模型失败则完全回退到规则结果。
4. **粘性意图**：会话里记下上一轮 `intent`。用户在回答反问（「朗姆，清爽」）时继承定制/查库，不再当成新的含糊问题。
5. 定制槽位：未回答过反问时，基酒/口味/做法填满不足 2 项 → 继续 `clarify`；刚反问过则只要不是全空就进入检索+生成。

**判定优先级（从上到下，命中即停）**

1. 本句含定制类词 → `customize`（再看槽位够不够，不够则 `clarify`）
2. 上一轮是定制，且本句不是「查库/现成/怎么做」→ 继续 `customize`
3. 点名酒款或问材料/做法，且没说定制 → `library`
4. 上一轮助手刚反问，用户在补槽 → 继承上一轮意图，不再当新的含糊问题
5. 「推荐一杯 / 好喝 / 来一杯」且没有酒名、基酒 → `clarify`
6. 其余默认 `library`，用向量检索看库里有没有

```mermaid
flowchart TD
  msg[用户本轮话] --> slots[规则抽槽位]
  slots --> llm[DeepSeek输出JSON意图]
  llm --> merge[合并_定制词强制customize]
  sticky[上一轮intent粘性] --> merge
  merge --> branch{当前意图}

  branch -->|clarify或定制槽位不足| ask[generate只反问]
  ask --> wait[等待下一轮]

  branch -->|library| retrLib[BGE-M3检索Top6]
  retrLib --> hit{名称命中或分数不低于0.55}
  hit -->|是| ansLib[按库内原文作答]
  ansLib --> imgLib[SSE带回现成配方图]
  hit -->|否| miss[告知库中没有并可改走定制]

  branch -->|customize且槽位够| retrCus[BGE-M3检索仅作参考]
  retrCus --> ansCus[DeepSeek生成新特调]
  ansCus --> imgCus[通义生图写入MinIO]
```

**多轮示例**

```mermaid
sequenceDiagram
  participant U as 用户
  participant C as classify
  participant G as generate
  participant R as retrieve
  participant I as render_image

  U->>C: 帮我定制一杯
  Note over C: customize但槽位不足
  C->>G: clarify反问基酒和口味
  G-->>U: 想喝哪种基酒口味清爽还是偏甜

  U->>C: 朗姆清爽摇荡
  Note over C: 粘性customize槽位已够
  C->>R: 检索朗姆清爽作参考
  R->>G: 写新特调不照抄库
  G->>I: qwen-image-2.1-pro
  I-->>U: 文案加配图SSE
```

### 对话编排（LangGraph）

`POST /api/chat/stream`（SSE）。节点：`classify` →（`clarify` | `retrieve`）→ `generate` →（定制才走）`render_image`。

```mermaid
flowchart LR
  start[START] --> classify
  classify -->|need_clarify| clarify
  classify -->|need_clarify为假| retrieve
  clarify --> generate
  retrieve --> generate
  generate -->|mode_customize| render_image
  generate -->|library或clarify| endNode[END]
  render_image --> endNode
```

会话：浏览器 `session_id` + 进程内存最近 8 轮，重启即清空。

SSE：`intent` / `mode` / `sources` / `images` / `token` / `image_loading` / `image` / `image_error` / `done`。

示例：「莫吉托用什么酒」→ `library` + 库内图；「帮我定制一杯」→ `customize` + `clarify`；补「朗姆，清爽，摇荡」→ `customize` + 参考检索 + 生图。

---

## 目录

```text
cocktails/
├── docker-compose.yml          Postgres(pgvector) + MinIO
├── docker/postgres/init.sql    CREATE EXTENSION vector
├── .env.example
├── ai-service/
│   ├── app/
│   │   ├── main.py             FastAPI 入口
│   │   ├── config.py
│   │   ├── api/                爬取、配方、Excel、RAG、对话
│   │   ├── core/               库表、MinIO
│   │   └── rag/                chunk / embed / ingest / 意图 / LangGraph / 生图
│   ├── crawler/                spiders、pipeline、图片、upsert
│   ├── models/bge-m3/          本地 embedding（不入库）
│   ├── templates/index.html
│   └── requirements.txt
└── README.md
```

---

## 启动流程

需要：Docker、Python 3.12、约 3GB 磁盘给 BGE-M3。密钥只写 `.env`，不要提交。

### 1. 基础设施

```bash
cd /path/to/cocktails
cp .env.example .env
# 填入 DEEPSEEK_API_KEY、IMAGE_API_KEY（百炼，用于定制生图）
docker compose up -d
```

Postgres `5432`，MinIO API `9000`，控制台 <http://127.0.0.1:9001/>（默认 minioadmin / minioadmin）。

### 2. Python 环境

```bash
cd ai-service
python3.12 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 本地 BGE-M3

权重放到 `ai-service/models/bge-m3/`（需有 `config.json` 和约 2.1GB 的 `pytorch_model.bin`）。国内可用镜像，**不要用 huggingface 默认 Xet**（会绕过镜像）：

```bash
cd /path/to/cocktails
export HF_ENDPOINT=https://hf-mirror.com
export HF_HUB_DISABLE_XET=1
./ai-service/.venv/bin/hf download BAAI/bge-m3 \
  --local-dir ai-service/models/bge-m3 \
  --exclude "onnx/*" \
  --max-workers 1
```

若 `hf download` 因镜像元数据失败，可对 `pytorch_model.bin` 用 `curl -L -C -` 从 `https://hf-mirror.com/BAAI/bge-m3/resolve/main/` 续传。`.env` 中：

```text
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=models/bge-m3
EMBEDDING_DIM=1024
```

### 4. 启动 API

```bash
cd ai-service
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HUB_DISABLE_XET=1 \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

打开 <http://127.0.0.1:8000/>。进程启动时会建表并确保 MinIO bucket `cocktail-images` 存在。

### 5. 页面上跑通数据

1. 选 MixMyth / CocktailDB / 两个都爬 → **开始爬取**
2. **向量化入库**（首次会加载本地 BGE-M3）
3. 对话区提问：查库如「莫吉托用什么酒」；定制如「帮我定制一杯朗姆清爽特调」

导出 Excel：`GET /api/recipes/export.xlsx`（含缩略图）。

---

## 常用环境变量

见 [`.env.example`](.env.example)。必填对话相关：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://cocktail:cocktail@127.0.0.1:5432/cocktail` |
| `DEEPSEEK_API_KEY` | DeepSeek 对话 |
| `IMAGE_API_KEY` | 百炼，模型 `qwen-image-2.1-pro` |
| `IMAGE_BASE_URL` | 默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`（北京；免费额度仅该地域） |
| `EMBEDDING_MODEL` | 相对 `ai-service/` 的本地目录，如 `models/bge-m3` |

定制生图依赖百炼账号可用（欠费时即使还有免费额度也会被拒绝）。免费额度只对华北 2（北京）生效。

---

## 相关文档

- [架构设计.md](架构设计.md) — 完整产品架构规划（含后续 APP / Java）
- [AI鸡尾酒需求文档.md](AI鸡尾酒需求文档.md) — 需求原文
