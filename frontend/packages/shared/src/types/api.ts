export type IngredientCategory =
  | '基酒'
  | '利口酒'
  | '糖浆'
  | '果汁/软饮'
  | '新鲜材料'
  | '苦精'
  | '装饰';

/** Java 统一响应外壳 */
export type ApiEnvelope<T> = {
  success: boolean;
  status: number;
  code: string;
  message: string | null;
  data: T;
};

export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  /** 后端登录/刷新会带回，便于客户端展示 */
  username?: string;
  nickname?: string;
  avatarUrl?: string | null;
};

export type WechatLoginRequest = {
  code: string;
  nickname?: string;
  avatarUrl?: string;
};

export type UpdateProfileRequest = {
  nickname?: string;
  avatarUrl?: string;
};

export type UserResponse = {
  userId: number;
  username: string;
  nickname: string;
  avatarUrl?: string | null;
};

export type RegisterRequest = {
  username: string;
  password: string;
  nickname?: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type RefreshRequest = {
  refreshToken: string;
};

export type ChatStreamRequest = {
  threadId: string;
  message: string;
  attachCabinet?: boolean;
  resume?: boolean;
};

export type ChatSourceItem = {
  id: number;
  name: string;
  nameEn?: string;
  source: string;
  score: number;
  imageUrl?: string;
  glass?: string;
  method?: string;
};

export type ChatImageItem = {
  url: string;
  alt?: string;
  recipeId?: number;
};

export type ChatEvent =
  | { type: 'intent'; value: string; mode: string }
  | { type: 'mode'; value: string }
  | { type: 'sources'; role: 'library' | 'reference' | string; items: ChatSourceItem[] }
  | { type: 'images'; items: ChatImageItem[] }
  | { type: 'status'; text: string }
  | { type: 'image_loading'; text?: string }
  | { type: 'image'; url: string; alt?: string; kind?: string }
  | { type: 'image_error'; message: string }
  | { type: 'token'; text: string }
  | { type: 'interrupt'; question: string; options: string[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

/* —— 材料目录 —— */

export type CategoryChild = {
  code: string;
  name: string;
};

export type CategoryNode = {
  code: string;
  name: string;
  children: CategoryChild[];
};

export type CategoriesResponse = {
  categories: CategoryNode[];
};

export type IngredientItem = {
  id: number;
  name: string;
  nameEn?: string;
  category: string;
  subCategory?: string;
  primaryUnit?: string;
  imageUrl?: string;
};

export type IngredientSearchResponse = {
  items: IngredientItem[];
  total: number;
  page: number;
  size: number;
};

/* —— 酒柜 —— */

export type CabinetItem = {
  id: number;
  ingredientId: number;
  name: string;
  nameEn?: string;
  category: string;
  subCategory?: string;
  quantity?: number | null;
  unit?: string;
  quantityKnown: boolean;
  stockStatus: string;
  imageUrl?: string;
  createdAt?: string;
};

export type CabinetListResponse = {
  summary: { itemCount: number };
  items: CabinetItem[];
  total: number;
};

export type CabinetAddItem = {
  ingredientId: number;
  quantity?: number | null;
  unit?: string;
  quantityKnown?: boolean;
};

export type CabinetAddRequest = {
  merge?: boolean;
  items: CabinetAddItem[];
};

export type CabinetUpdateRequest = {
  quantity?: number | null;
  unit?: string;
  quantityKnown?: boolean;
};

export type RecognizeMatched = {
  ingredientId: number;
  name: string;
  nameEn?: string;
  category: string;
  subCategory?: string;
  imageUrl?: string;
  confidence?: number;
  alreadyInCabinet: boolean;
};

export type RecognizeUnmatched = {
  rawLabel: string;
  reason: string;
};

export type RecognizeResponse = {
  matched: RecognizeMatched[];
  unmatched: RecognizeUnmatched[];
  /** 识别出的关键词/标签，多材料时为多项 */
  keywords?: string[];
};

/** 知识库配方摘要（首页今日推荐等） */
export type RecipeSummary = {
  id: number;
  name: string;
  nameEn?: string | null;
  category?: string | null;
  baseSpirit?: string | null;
  glass?: string | null;
  method?: string | null;
  flavorTags?: string[] | null;
  imageUrl?: string | null;
};

export type MenuIngredient = {
  name: string;
  nameEn?: string;
  amount?: number | null;
  unit?: string;
};

export type MenuRecipe = {
  recipeId: number;
  name: string;
  nameEn?: string;
  category?: string;
  baseSpirit?: string;
  glass?: string;
  method?: string;
  imageUrl?: string;
  matchType?: string;
  missing?: string[];
  substitutes?: string[];
  /** 做法步骤 */
  instructions?: string;
  /** 材料用量 */
  ingredients?: MenuIngredient[];
};

export type MenuResponse = {
  recipes: MenuRecipe[];
  meta: {
    requested: number;
    returned: number;
    cabinetIngredientCount: number;
  };
  savedMenuId?: number | null;
};

export type SavedMenuSummary = {
  id: number;
  title: string;
  source: string;
  recipeCount: number;
  createdAt: string;
};

export type SavedMenuDetail = {
  id: number;
  title: string;
  source: string;
  recipeCount: number;
  createdAt: string;
  recipes: MenuRecipe[];
};

export type WorkbenchGlass = {
  code: string;
  name: string;
  nameEn?: string;
  capacityMl: number;
  imageUrl?: string | null;
};

export type WorkbenchMethod = {
  code: string;
  name: string;
  nameEn?: string;
};

export type WorkbenchIce = {
  code: string;
  name: string;
};

export type WorkbenchGarnish = {
  code: string;
  name: string;
  imageUrl?: string | null;
};

export type WorkbenchOptions = {
  methods: WorkbenchMethod[];
  iceTypes: WorkbenchIce[];
  garnishes: WorkbenchGarnish[];
  limits: { maxIngredients: number };
};

export type WorkbenchIngredientLine = {
  ingredientId: number;
  name: string;
  amount: number;
  unit: string;
  imageUrl?: string | null;
};

export type WorkbenchSession = {
  sessionId: string;
  status: string;
  glass: WorkbenchGlass | null;
  ingredients: WorkbenchIngredientLine[];
  method?: string | null;
  iceType?: string | null;
  garnishes: string[];
  feeling?: string | null;
  volumeMl: number;
  capacityMl?: number | null;
  remainingMl?: number | null;
  ingredientCount: number;
  maxIngredients: number;
};

export type WorkbenchSessionPatch = {
  glassCode?: string;
  ingredients?: { ingredientId: number; amount: number; unit?: string }[];
  method?: string;
  iceType?: string;
  garnishes?: string[];
  feeling?: string;
};

/** 风味雷达六维，取值 0~1 */
export type WorkbenchFlavorProfile = {
  sweetness?: number | null;
  alcohol?: number | null;
  sourness?: number | null;
  aroma?: number | null;
  energy?: number | null;
  difficulty?: number | null;
};

export type WorkbenchAnalyze = {
  feasible: boolean | null;
  flavorSummary?: string | null;
  flavorProfile?: WorkbenchFlavorProfile | null;
  conflicts: { level?: string; message?: string }[];
  suggestions: string[];
};

export type WorkbenchRecipeStep = {
  order: number;
  text: string;
  duration_sec?: number | null;
  durationSec?: number | null;
};

export type WorkbenchRecipe = {
  name: string;
  nameEn?: string;
  glass?: string;
  method?: string;
  iceType?: string;
  ice_type?: string;
  garnishes?: string[];
  feeling?: string;
  flavorSummary?: string;
  flavor_summary?: string;
  /** 酒精度展示，如「约 12%」 */
  abvRange?: string;
  abv_range?: string;
  /** 难度文案：简单 / 中等 / 进阶 */
  difficulty?: string;
  /** 口感标签，如「清爽酸甜」 */
  taste?: string;
  flavorProfile?: WorkbenchFlavorProfile | null;
  flavor_profile?: WorkbenchFlavorProfile | null;
  ingredients: MenuIngredient[];
  steps: WorkbenchRecipeStep[];
  instructions?: string;
};

export type CustomSummary = {
  id: number;
  name: string;
  nameEn?: string;
  glass?: string;
  method?: string;
  imageUrl?: string;
  flavorSummary?: string;
  createdAt: string;
};

export type CustomDetail = {
  id: number;
  name: string;
  nameEn?: string;
  glass?: string;
  method?: string;
  iceType?: string;
  garnishes?: string[];
  feeling?: string;
  flavorSummary?: string;
  abvRange?: string | null;
  difficulty?: string | null;
  taste?: string | null;
  flavorProfile?: WorkbenchFlavorProfile | null;
  ingredients: MenuIngredient[];
  steps: WorkbenchRecipeStep[];
  instructions?: string;
  imageUrl?: string;
  workbenchSessionId?: string;
  createdAt: string;
};
