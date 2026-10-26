# Java 业务服务（java-service）

鸡尾酒 APP 的**常规业务后端**：账号、酒柜、调配工作台、材料目录，以及把 AI 能力请求代理到 Python。

> 产品总述见 [`../AI鸡尾酒需求文档.md`](../AI鸡尾酒需求文档.md)。  
> 接口路径、请求/响应、与 Python 的调用约定见 [`接口文档.md`](./接口文档.md)。  
> AI 编排、爬虫、RAG、知识库写入见 [`../README.md`](../README.md) 与 [`../ai-service/`](../ai-service/)。

---

## 职责边界

| 负责（Java） | 不负责（Python `ai-service`） |
| --- | --- |
| 注册 / 登录 / JWT | LangGraph 对话编排、追问 interrupt |
| 酒柜库存 CRUD、分类筛选 | 配方爬取、材料清洗、向量化、`kb_*` 写入 |
| 材料目录只读搜索（匹配知识库） | 拍照识图模型推理 |
| 调配工作台会话与选杯/选料/技法等状态 | 成杯可行性分析、特调配方生成 |
| 组装上下文后调用 Python，结果回传 APP | RAG 检索、酒单向量推荐、生图 |
| 社区投稿与审核（P2 预留） | 审核通过后的知识库入库脚本 |

原则：**APP 只请求 Java**；需要智能时由 Java 调 Python。同一套 PostgreSQL：Java 管业务表，Python 管 `kb_*`；Java 可只读 `kb_ingredient`。

---

## MVP 业务范围

### 1. 用户认证（P0）

- 用户名 + 密码注册（BCrypt）。
- 登录发放 Access Token + Refresh Token；Access 过期后用 Refresh 静默续期。
- 未登录不可访问酒柜、工作台保存类、对话代理等接口。

### 2. 材料目录（P0，只读）

- 分类与知识库一致：基酒、利口酒、糖浆、果汁/软饮、新鲜材料、苦精、装饰；基酒等可带二级分类（金酒、伏特加…）。
- **模糊搜索**全库材料（中英文名 / 品牌），供酒柜「新增库存」与工作台「选材料」共用。
- 数据来自 `kb_ingredient`，Java 不改表结构。

### 3. 酒柜（P1）

- **我的库存**：列表、按一级/二级分类筛选、在库存内按品牌/类别/名称搜索。
- **新增库存**：
  - 从材料目录搜索、多选确认添加（仅允许关联库内已有材料）。
  - **拍照批量识别**：上传图片 → Python 识图 → Java 与 `kb_ingredient` 匹配 → 仅匹配成功的可选入柜；未匹配材料提示，不入库。
- **库存维护**：改数量/单位、删除；支持「有货但余量未知」。
- **用库存生成酒单**：根据当前库存调 Python 匹配，**默认推荐 5 个配方**；优先基酒/利口酒/糖浆，装饰可忽略，品类尽量多样；可标注全匹配 / 缺料。
- MVP **不做**：额度、保质期提醒。

### 4. 调配工作台（P0）

- **选杯**：展示杯型目录（容量、图），写入本局草稿。
- **选材料**：分类 / 二级分类 / 模糊搜索；已选数量上限、当前用量与杯容量校验。
- **技法 / 冰 / 装饰** + 可选「想要的感觉」文案。
- **成杯可行性**：当前组合交给 Python 做风味反馈与冲突提示。
- **生成特调**：打包本局状态调 Python 生成结构化配方与操作卡。
- 支持重新选择、恢复未完成草稿。
- MVP **不做**：免费额度计数。

### 5. 首页 AI 问答 / DIY（P0，代理）

- APP 经 Java 发起对话与追问续聊；Java 可附带酒柜快照等上下文，SSE 透传 Python 结果（溯源、interrupt 选项等）。
- 智能逻辑在 Python，Java 负责鉴权、组上下文、透传。

### 6. 社区（P2，不做）

- 架构预留投稿与审核；MVP 不上线。审核通过后由 Python 写入知识库，与官方/社区库分层隔离。

---

## 库表设计

同一 PostgreSQL 实例。Java **建表并读写**下列业务表；`kb_*` 由 Python 维护，Java **只读** `kb_ingredient`（搜索、匹配、展示）。不做额度表。杯型 / 技法 / 冰 / 装饰 MVP 可用配置或种子数据，不必强行建表。

### 总览

| 表 | 归属 | 说明 |
| --- | --- | --- |
| `app_user` | Java | 用户 |
| `refresh_token` | Java | Refresh Token |
| `cabinet_item` | Java | 酒柜库存 |
| `workbench_session` | Java | 调配工作台一局草稿 |
| `workbench_session_item` | Java | 草稿中的已选材料 |
| `community_recipe` | Java（P2） | 社区投稿，MVP 不建也可 |
| `kb_ingredient` | Python | 材料主数据（只读引用） |

酒单生成、对话结果 MVP **不落库**，以接口响应为准；收藏等后续再加。

### `app_user`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGSERIAL PK | 主键 |
| username | VARCHAR(64) UNIQUE NOT NULL | 登录名 |
| password_hash | VARCHAR(255) NOT NULL | BCrypt |
| nickname | VARCHAR(64) | 昵称 |
| created_at | TIMESTAMPTZ NOT NULL | 创建时间 |

### `refresh_token`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGSERIAL PK | 主键 |
| user_id | BIGINT NOT NULL FK → app_user.id | 用户 |
| token | VARCHAR(512) UNIQUE NOT NULL | Refresh Token |
| expires_at | TIMESTAMPTZ NOT NULL | 过期时间 |
| revoked | BOOLEAN NOT NULL DEFAULT false | 是否撤销 |
| created_at | TIMESTAMPTZ NOT NULL | 创建时间 |

索引：`(user_id)`、`(token)`。

### `cabinet_item`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGSERIAL PK | 主键 |
| user_id | BIGINT NOT NULL FK → app_user.id | 用户 |
| ingredient_id | BIGINT NOT NULL | 对应 `kb_ingredient.id`（逻辑外键；不改 kb 表） |
| name | VARCHAR(128) NOT NULL | 展示名冗余（加入时从 kb 拷贝） |
| name_en | VARCHAR(128) | 英文名冗余 |
| category | VARCHAR(32) | 一级分类冗余 |
| sub_category | VARCHAR(32) | 二级分类冗余（如金酒） |
| quantity | DECIMAL(10,2) | 数量；余量未知时可为空或 0 |
| unit | VARCHAR(16) | 单位，优先 kb 的 `primary_unit` |
| quantity_known | BOOLEAN NOT NULL DEFAULT true | false → UI「余量未知」 |
| opened_at | DATE | 开瓶日期（P1，MVP 可空） |
| created_at | TIMESTAMPTZ NOT NULL | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

索引：`(user_id)`、`(user_id, ingredient_id)` UNIQUE（同一用户同一材料一条）。  
`stock_status`（有货/无货）由 `quantity` / `quantity_known` 推导，不单独建列亦可。

### `workbench_session`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGSERIAL PK | 主键 |
| session_id | UUID UNIQUE NOT NULL | 对外暴露的会话 id |
| user_id | BIGINT NOT NULL FK → app_user.id | 用户 |
| status | VARCHAR(16) NOT NULL DEFAULT 'draft' | draft / generated / abandoned |
| glass_code | VARCHAR(32) | 杯型 code |
| capacity_ml | INT | 杯容量快照（选杯时写入） |
| method | VARCHAR(32) | build / stir / shake / layer |
| ice_type | VARCHAR(32) | none / less / standard / crushed / large |
| garnishes | JSONB | 装饰 code 数组，如 `["basil","lemon_twist"]` |
| feeling | VARCHAR(512) | 可选感觉文案 |
| created_at | TIMESTAMPTZ NOT NULL | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

索引：`(user_id)`、`(session_id)`。

### `workbench_session_item`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGSERIAL PK | 主键 |
| session_pk | BIGINT NOT NULL FK → workbench_session.id ON DELETE CASCADE | 所属草稿（主键 id，避免与对外 UUID `session_id` 混淆） |
| ingredient_id | BIGINT NOT NULL | `kb_ingredient.id` |
| name | VARCHAR(128) | 展示名冗余 |
| amount | DECIMAL(10,2) NOT NULL | 用量 |
| unit | VARCHAR(16) NOT NULL | 单位 |
| order_index | INT NOT NULL DEFAULT 1 | 顺序 |

索引：`(session_id)`。  
业务校验（应用层）：单局材料数 ≤ 上限（如 12）；`sum(amount)`（按 ml）≤ 会话 `capacity_ml`。

### `community_recipe`（P2 预留）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGSERIAL PK | 主键 |
| user_id | BIGINT NOT NULL FK → app_user.id | 投稿用户 |
| title | VARCHAR(128) NOT NULL | 标题 |
| content_json | JSONB NOT NULL | 配方内容 |
| status | VARCHAR(16) NOT NULL | pending / approved / rejected |
| reviewed_at | TIMESTAMPTZ | 审核时间 |
| created_at | TIMESTAMPTZ NOT NULL | 创建时间 |

与知识库分层；审核通过后由 Python 脚本写入 `kb_*`，Java 不直接写知识库。

### 只读引用：`kb_ingredient`（Python 建表）

Java 搜索 / 识图匹配 / 入柜展示时读取，**不要改结构、不要用 JPA ddl 动这张表**。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | SERIAL PK | 主键 |
| name | VARCHAR(128) | 展示名 |
| name_en | VARCHAR(128) | 英文 / 品牌 |
| slug | VARCHAR(128) UNIQUE | 归一化键 |
| category | VARCHAR(32) | 一级分类 |
| primary_unit | VARCHAR(16) | 主单位 |
| image_url | TEXT | 图片 |
| created_at / updated_at | TIMESTAMPTZ | 时间 |

二级分类（金酒等）若 kb 暂无独立列：可由 Java 配置映射，或后续 Python 增加 `sub_category` 后再读。

### 建表顺序建议

1. Python / 运维已就绪：`kb_ingredient` 等知识库表  
2. Java：`app_user` → `refresh_token` → `cabinet_item` → `workbench_session` → `workbench_session_item`  
3. P2：`community_recipe`  

MVP 启动时执行 `schema.sql`（`CREATE TABLE IF NOT EXISTS`）；上线可改为 Flyway。

对外字段与 API 见 [`接口文档.md`](./接口文档.md)；全库（含配方向量）见 [`../架构设计.md`](../架构设计.md)。

---

## 与 Python 的协作（业务视角）

| 用户动作 | Java | Python |
| --- | --- | --- |
| 首页提问 / DIY 追问 | 鉴权、组 `thread_id` 与可选酒柜快照、SSE 透传 | 意图、RAG、生成、interrupt |
| 酒柜拍照加料 | 收图、匹配目录、写入库存 | 图片识别材料名 |
| 用库存生成酒单 | 组库存快照、要 N 条且多样 | 刚性材料匹配 + 多样性 |
| 工作台分析 / 生成 | 提交会话快照 | 可行性、特调与操作卡 |

---

## 技术选型（摘要）

| 项 | 选型 |
| --- | --- |
| 语言 / 框架 | Java 17 + Spring Boot 3.4.x（Maven） |
| 安全 | Spring Security + JWT + Refresh Token |
| 持久化 | MyBatis-Plus + PostgreSQL（`schema.sql` 建业务表） |
| 调 AI | WebClient，SSE 透传 |

MVP 不部署 Gateway；本服务直接暴露端口。包结构、配置项、启动方式见 [`接口文档.md`](./接口文档.md)。

### 本地启动

```bash
# 需先有 Postgres（本地 docker 或远程）；与 Python 共用仓库根目录 .env 里的 POSTGRES_*
cd java-service
mvn spring-boot:run
```

启动时会自动加载 `../.env`（若存在），因此 `POSTGRES_HOST` 与 ai-service 一致。  
若未加载到 .env，则会默认连 `127.0.0.1`，容易出现 HikariCP 密码错误。

健康检查：`GET http://127.0.0.1:8080/actuator/health`  
Swagger：`http://127.0.0.1:8080/swagger-ui.html`（先调登录，会写入 Cookie `ACCESS_TOKEN`，后续接口自动带上）  
（对话 / 识图 / 酒单等需另开 `ai-service`。）

---

## MVP 实施顺序（业务）

1. 用户注册登录  
2. 材料分类与模糊搜索  
3. 酒柜 CRUD + 目录选料添加  
4. 酒柜识图匹配添加  
5. 库存生成酒单  
6. 工作台会话（杯 → 料 → 技法/冰/装饰）  
7. 工作台分析 / 生成 + 首页对话代理  
8. P2：社区  

---

## 相关文档

| 文档 | 内容 |
| --- | --- |
| [接口文档.md](./接口文档.md) | Java 对外 API 与 Java→Python 契约 |
| [../AI鸡尾酒需求文档.md](../AI鸡尾酒需求文档.md) | 产品需求 |
| [../架构设计.md](../架构设计.md) | 全栈架构与表设计 |
| [../README.md](../README.md) | 总览、爬虫、RAG、Python 启动 |
| [../ai-service/](../ai-service/) | Python AI / 爬虫 |
| [../frontend/](../frontend/) | RN / shared |
