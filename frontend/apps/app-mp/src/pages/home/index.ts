import type { HomeQuickEntry, RecipeSummary } from '@cocktail/shared';
import { recipeMetaLine } from '@cocktail/shared';
import { resolveAssetUrl, resolveMediaUrl } from '../../adapters/apiBase';
import { homeService, recipeService } from '../../api';
import { openLoginPrompt } from '../../auth/loginGate';
import { hydrateAuth } from '../../auth/session';
import { store } from '../../store';

const FALLBACK_ENTRIES: HomeQuickEntry[] = [
  {
    key: 'chat',
    title: 'AI 问答',
    sub: '鸡尾酒知识库',
    iconUrl: '/api/cocktail/assets/images/home/chat.png',
    muted: false,
    action: 'chat',
  },
  {
    key: 'workbench',
    title: '调配工作台',
    sub: '材料 → 配方',
    iconUrl: '/api/cocktail/assets/images/home/flask.png',
    muted: false,
    action: 'workbench',
  },
  {
    key: 'cabinet',
    title: '酒柜管理',
    sub: '我的酒柜',
    iconUrl: '/api/cocktail/assets/images/home/wine.png',
    muted: false,
    action: 'cabinet',
  },
  {
    key: 'more',
    title: '更多',
    sub: '敬请期待',
    iconUrl: '/api/cocktail/assets/images/home/grid.png',
    muted: true,
    action: 'none',
  },
];

type EntryUi = HomeQuickEntry & { iconSrc: string };

function mapEntries(items: HomeQuickEntry[]): EntryUi[] {
  return items.map((item) => ({
    ...item,
    iconSrc: resolveAssetUrl(item.iconUrl),
  }));
}

Page({
  data: {
    logoUrl: '/assets/images/jiufang-logo.png',
    recipe: null as RecipeSummary | null,
    recipeName: '暂无推荐',
    recipeMeta: '稍后再试，或点击「换一杯」',
    imageUri: '',
    loadingReco: true,
    entries: mapEntries(FALLBACK_ENTRIES),
  },

  _homeLoginSkipped: false as boolean,
  _prompting: false as boolean,

  async onShow() {
    void this.loadEntries();
    if (!this.data.recipe) {
      void this.loadRecommend();
    }
    void this.maybePromptLogin();
  },

  async loadEntries() {
    try {
      const res = await homeService.quickEntries();
      const items = res?.items?.length ? res.items : FALLBACK_ENTRIES;
      this.setData({ entries: mapEntries(items) });
    } catch {
      this.setData({ entries: mapEntries(FALLBACK_ENTRIES) });
    }
  },

  async maybePromptLogin() {
    if (this._prompting || this._homeLoginSkipped) {
      return;
    }
    if (!store.getState().auth.hydrated) {
      await hydrateAuth(store.dispatch);
    }
    if (store.getState().auth.accessToken) {
      return;
    }
    this._prompting = true;
    try {
      const ok = await openLoginPrompt();
      if (!ok) {
        this._homeLoginSkipped = true;
      }
    } finally {
      this._prompting = false;
    }
  },

  async loadRecommend() {
    this.setData({ loadingReco: true });
    try {
      const next = await recipeService.random(true);
      this.setData({
        recipe: next,
        recipeName: next?.nameEn || next?.name || '暂无推荐',
        recipeMeta: next ? recipeMetaLine(next) : '稍后再试，或点击「换一杯」',
        imageUri: resolveMediaUrl(next?.imageUrl) || '',
      });
    } catch {
      this.setData({
        recipe: null,
        recipeName: '暂无推荐',
        recipeMeta: '稍后再试，或点击「换一杯」',
        imageUri: '',
      });
    } finally {
      this.setData({ loadingReco: false });
    }
  },

  openChat() {
    wx.navigateTo({ url: '/pages/chat/index' });
  },

  onQuick(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    const action = (e.currentTarget.dataset.action as string) || key;
    if (action === 'chat' || key === 'chat') {
      this.openChat();
    } else if (action === 'workbench' || key === 'workbench') {
      wx.switchTab({ url: '/pages/workbench/index' });
    } else if (action === 'cabinet' || key === 'cabinet') {
      wx.switchTab({ url: '/pages/cabinet/index' });
    }
  },

  openRecipe() {
    const recipe = this.data.recipe;
    if (!recipe?.id) {
      return;
    }
    wx.navigateTo({
      url: `/pages/recipe-detail/index?from=home&id=${recipe.id}`,
    });
  },
});
