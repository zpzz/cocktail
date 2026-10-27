import type { RecipeSummary } from '@cocktail/shared';
import { recipeMetaLine } from '@cocktail/shared';
import { resolveMediaUrl } from '../../adapters/apiBase';
import { recipeService } from '../../api';
import { openLoginPrompt } from '../../auth/loginGate';
import { hydrateAuth } from '../../auth/session';
import { store } from '../../store';

const ENTRIES = [
  { key: 'chat', title: 'AI 问答', sub: '鸡尾酒知识库', muted: false },
  { key: 'workbench', title: '调配工作台', sub: '材料 → 配方', muted: false },
  { key: 'cabinet', title: '酒柜管理', sub: '我的酒柜', muted: false },
  { key: 'more', title: '更多', sub: '敬请期待', muted: true },
];

Page({
  data: {
    logoUrl: '/assets/images/jiufang-logo.png',
    recipe: null as RecipeSummary | null,
    recipeName: '暂无推荐',
    recipeMeta: '稍后再试，或点击「换一杯」',
    imageUri: '',
    loadingReco: true,
    entries: ENTRIES,
  },

  // 用页面实例字段，避免热重载后模块变量残留导致不再弹窗
  _homeLoginSkipped: false as boolean,
  _prompting: false as boolean,

  async onShow() {
    if (!this.data.recipe) {
      void this.loadRecommend();
    }
    void this.maybePromptLogin();
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
    if (key === 'chat') {
      this.openChat();
    } else if (key === 'workbench') {
      wx.switchTab({ url: '/pages/workbench/index' });
    } else if (key === 'cabinet') {
      wx.switchTab({ url: '/pages/cabinet/index' });
    }
  },

  openRecipe() {
    const recipe = this.data.recipe;
    if (!recipe) {
      return;
    }
    const app = getApp<{ globalData: { pendingRecipe: unknown } }>();
    app.globalData.pendingRecipe = {
      recipe: {
        name: recipe.name,
        nameEn: recipe.nameEn,
        glass: recipe.glass,
        method: recipe.method,
        flavorSummary: (recipe as { flavorSummary?: string }).flavorSummary,
        imageUrl: recipe.imageUrl,
      },
      imageUrl: recipe.imageUrl,
      from: 'home',
    };
    wx.navigateTo({ url: '/pages/recipe-detail/index?from=home' });
  },
});
