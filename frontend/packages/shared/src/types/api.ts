export type IngredientCategory =
  | '基酒'
  | '利口酒'
  | '糖浆'
  | '果汁/软饮'
  | '新鲜材料'
  | '苦精'
  | '装饰';

export type CabinetItem = {
  id: number;
  ingredientName: string;
  category: IngredientCategory;
  quantity: number;
  unit: string;
};

export type ChatStreamRequest = {
  sessionId: string;
  message: string;
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
  | { type: 'error'; message: string }
  | { type: 'done' };
