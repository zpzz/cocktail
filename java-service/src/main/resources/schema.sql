-- Java 业务表（kb_* 由 Python 维护，此处不建）

CREATE TABLE IF NOT EXISTS app_user (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(64)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    nickname        VARCHAR(64),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_token (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES app_user (id),
    token           VARCHAR(512) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ  NOT NULL,
    revoked         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_token_user_id ON refresh_token (user_id);

CREATE TABLE IF NOT EXISTS cabinet_item (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT         NOT NULL REFERENCES app_user (id),
    ingredient_id   BIGINT         NOT NULL,
    name            VARCHAR(128)   NOT NULL,
    name_en         VARCHAR(128),
    category        VARCHAR(32),
    sub_category    VARCHAR(32),
    quantity        NUMERIC(10, 2),
    unit            VARCHAR(16),
    quantity_known  BOOLEAN        NOT NULL DEFAULT TRUE,
    opened_at       DATE,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_cabinet_user_ingredient ON cabinet_item (user_id, ingredient_id);
CREATE INDEX IF NOT EXISTS idx_cabinet_item_user_id ON cabinet_item (user_id);

CREATE TABLE IF NOT EXISTS workbench_session (
    id              BIGSERIAL PRIMARY KEY,
    session_id      VARCHAR(36)  NOT NULL UNIQUE,
    user_id         BIGINT       NOT NULL REFERENCES app_user (id),
    status          VARCHAR(16)  NOT NULL DEFAULT 'draft',
    glass_code      VARCHAR(32),
    capacity_ml     INT,
    method          VARCHAR(32),
    ice_type        VARCHAR(32),
    garnishes       TEXT,
    feeling         VARCHAR(512),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workbench_session_user_id ON workbench_session (user_id);

CREATE TABLE IF NOT EXISTS workbench_session_item (
    id              BIGSERIAL PRIMARY KEY,
    session_pk      BIGINT         NOT NULL REFERENCES workbench_session (id) ON DELETE CASCADE,
    ingredient_id   BIGINT         NOT NULL,
    name            VARCHAR(128),
    amount          NUMERIC(10, 2) NOT NULL,
    unit            VARCHAR(16)    NOT NULL,
    order_index     INT            NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_workbench_session_item_session ON workbench_session_item (session_pk);

-- 用库存生成的酒单（用户级快照，配方明细冗余便于展示）
CREATE TABLE IF NOT EXISTS saved_menu (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES app_user (id),
    title           VARCHAR(128) NOT NULL,
    source          VARCHAR(32)  NOT NULL DEFAULT 'cabinet',
    recipe_count    INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_saved_menu_user_id ON saved_menu (user_id);

CREATE TABLE IF NOT EXISTS saved_menu_item (
    id                  BIGSERIAL PRIMARY KEY,
    menu_id             BIGINT       NOT NULL REFERENCES saved_menu (id) ON DELETE CASCADE,
    recipe_id           BIGINT       NOT NULL,
    name                VARCHAR(128) NOT NULL,
    name_en             VARCHAR(128),
    category            VARCHAR(64),
    base_spirit         VARCHAR(64),
    glass               VARCHAR(64),
    method              VARCHAR(64),
    image_url           VARCHAR(512),
    match_type          VARCHAR(16),
    missing_json        TEXT,
    substitutes_json    TEXT,
    instructions        TEXT,
    ingredients_json    TEXT,
    order_index         INT          NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_saved_menu_item_menu ON saved_menu_item (menu_id);

-- 已有库补列（新建表时上面已含，重复执行安全）
ALTER TABLE saved_menu_item ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE saved_menu_item ADD COLUMN IF NOT EXISTS ingredients_json TEXT;

-- 工作台生成的「我的特调」
CREATE TABLE IF NOT EXISTS saved_custom (
    id                   BIGSERIAL PRIMARY KEY,
    user_id              BIGINT       NOT NULL REFERENCES app_user (id),
    workbench_session_id VARCHAR(36),
    name                 VARCHAR(128) NOT NULL,
    name_en              VARCHAR(128),
    glass                VARCHAR(64),
    method               VARCHAR(64),
    ice_type             VARCHAR(32),
    garnishes_json       TEXT,
    feeling              VARCHAR(512),
    flavor_summary       TEXT,
    ingredients_json     TEXT         NOT NULL DEFAULT '[]',
    steps_json           TEXT,
    instructions         TEXT,
    image_url            VARCHAR(512),
    source               VARCHAR(32)  NOT NULL DEFAULT 'workbench',
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_saved_custom_user_id ON saved_custom (user_id);
