import type { WorkbenchRecipe } from '@cocktail/shared';
import {
  axesFromAnalyze,
  axesToArray,
  buildCustomSaveBody,
  customDetailToRecipe,
  FLAVOR_AXIS_LABELS,
  formatIngredientAmount,
  methodDifficultyLabel,
  pickRecipeProfile,
} from '@cocktail/shared';
import { resolveMediaUrl } from '../../adapters/apiBase';
import { customService } from '../../api';

const STORAGE_KEY = 'recipeDetailPayload';

type Payload = {
  recipe?: WorkbenchRecipe | null;
  imageUrl?: string | null;
  from?: string;
  sessionId?: string;
  feeling?: string;
  generating?: boolean;
  statusText?: string;
};

const TABS = [
  { key: 'ingredients', label: '材料' },
  { key: 'steps', label: '步骤' },
  { key: 'flavor', label: '风味' },
];

function mapRecipeUi(recipe: WorkbenchRecipe | null | undefined, imageUrl?: string | null) {
  const title = recipe?.name || '特调详情';
  const summary = recipe?.flavorSummary || recipe?.flavor_summary || '';
  const abv = recipe?.abvRange || recipe?.abv_range || '—';
  const difficulty = recipe?.difficulty || methodDifficultyLabel(recipe?.method) || '—';
  const taste = recipe?.taste || recipe?.feeling || '—';
  const ingredients = (recipe?.ingredients ?? []).map((ing) => ({
    name: ing.name,
    amountText: formatIngredientAmount(ing) || '',
  }));
  const stepList = recipe?.steps ?? [];
  const steps =
    stepList.length > 0
      ? stepList.map((s) => s.text).filter(Boolean)
      : recipe?.instructions
        ? recipe.instructions
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
  const fromAi = axesFromAnalyze(pickRecipeProfile(recipe));
  const values = fromAi ? axesToArray(fromAi) : [];
  const flavorBars = values.map((v, i) => ({
    label: FLAVOR_AXIS_LABELS[i],
    pct: Math.round(Math.max(0, Math.min(1, v)) * 100),
  }));
  return {
    recipe,
    title,
    nameEn: recipe?.nameEn || '',
    summary,
    abv,
    difficulty,
    taste,
    imageUri: resolveMediaUrl(imageUrl) || '',
    ingredients,
    steps,
    flavorBars,
  };
}

Page({
  data: {
    tabs: TABS,
    tab: 'ingredients',
    recipe: null as WorkbenchRecipe | null,
    title: '特调详情',
    nameEn: '',
    summary: '',
    abv: '—',
    difficulty: '—',
    taste: '—',
    imageUri: '',
    ingredients: [] as Array<{ name: string; amountText: string }>,
    steps: [] as string[],
    flavorBars: [] as Array<{ label: string; pct: number }>,
    badge: '酒方特调',
    canSave: false,
    saving: false,
    generating: false,
    statusText: '',
    from: '',
    sessionId: '',
    feeling: '',
  },

  async onLoad(query: Record<string, string | undefined>) {
    const from = query.from || '';
    const customId = query.customId ? Number(query.customId) : 0;

    if (customId) {
      try {
        const detail = await customService.detail(customId);
        const recipe = customDetailToRecipe(detail);
        this.applyPayload({
          recipe,
          imageUrl: detail.imageUrl,
          from: 'customs',
        });
      } catch (err) {
        wx.showToast({
          title: err instanceof Error ? err.message : '加载失败',
          icon: 'none',
        });
      }
      return;
    }

    let payload: Payload | null = null;
    try {
      const raw = wx.getStorageSync(STORAGE_KEY) as string;
      if (raw) {
        payload = typeof raw === 'string' ? (JSON.parse(raw) as Payload) : (raw as Payload);
        wx.removeStorageSync(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    if (!payload) {
      const app = getApp<{ globalData: { pendingRecipe: Payload | null } }>();
      payload = app.globalData.pendingRecipe;
      app.globalData.pendingRecipe = null;
    }
    if (payload) {
      this.applyPayload({ ...payload, from: payload.from || from });
    }
  },

  applyPayload(payload: Payload) {
    const ui = mapRecipeUi(payload.recipe, payload.imageUrl);
    const canSave =
      Boolean(payload.recipe) &&
      (payload.from === 'workbench' || Boolean(payload.sessionId)) &&
      !payload.generating;
    this.setData({
      ...ui,
      from: payload.from || '',
      sessionId: payload.sessionId || '',
      feeling: payload.feeling || '',
      generating: Boolean(payload.generating),
      statusText: payload.statusText || '',
      canSave,
      badge: payload.from === 'customs' ? '我的特调' : '酒方特调',
    });
  },

  setTab(e: WechatMiniprogram.TouchEvent) {
    this.setData({ tab: e.currentTarget.dataset.key as string });
  },

  async onSave() {
    const { recipe, sessionId, feeling, imageUri, canSave } = this.data;
    if (!canSave || !recipe || !sessionId) {
      wx.showToast({ title: '无法收藏', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await customService.save(
        buildCustomSaveBody({
          recipe,
          workbenchSessionId: sessionId,
          feelingFallback: feeling,
          imageUrl: imageUri || null,
        }),
      );
      wx.showToast({ title: '已收藏', icon: 'success' });
      this.setData({ canSave: false });
      setTimeout(() => {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/profile/index' }) });
      }, 500);
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '保存失败',
        icon: 'none',
      });
    } finally {
      this.setData({ saving: false });
    }
  },
});
