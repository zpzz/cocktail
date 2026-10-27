import type { MenuRecipe, SavedMenuDetail, SavedMenuSummary } from '@cocktail/shared';
import { formatShortDateTime } from '@cocktail/shared';
import { resolveMediaUrl } from '../../adapters/apiBase';
import { menuService } from '../../api';

type UiSummary = SavedMenuSummary & { dateLabel: string };

type UiRecipe = MenuRecipe & {
  imageUri?: string;
  meta: string;
  missingText?: string;
  ingredients?: Array<MenuRecipe['ingredients'][number] & { amountText?: string }>;
};

type UiDetail = Omit<SavedMenuDetail, 'recipes'> & {
  dateLabel: string;
  recipes: UiRecipe[];
};

function mapRecipe(item: MenuRecipe): UiRecipe {
  return {
    ...item,
    imageUri: resolveMediaUrl(item.imageUrl) || '',
    meta: [item.category, item.baseSpirit, item.glass, item.method]
      .filter(Boolean)
      .join(' · '),
    missingText: item.missing?.length ? item.missing.join('、') : '',
    ingredients: (item.ingredients ?? []).map((ing) => ({
      ...ing,
      amountText:
        ing.amount != null
          ? ` ${ing.amount}${ing.unit || ''}`
          : ing.unit
            ? ` ${ing.unit}`
            : '',
    })),
  };
}

Page({
  data: {
    loading: true,
    items: [] as UiSummary[],
    detail: null as UiDetail | null,
    detailLoading: false,
  },

  onShow() {
    if (!this.data.detail) {
      void this.loadList();
    }
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const list = (await menuService.list()) ?? [];
      this.setData({
        items: list.map((item) => ({
          ...item,
          dateLabel: formatShortDateTime(item.createdAt),
        })),
      });
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '加载失败',
        icon: 'none',
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async openDetail(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;
    this.setData({ detailLoading: true, detail: { title: '酒单详情' } as UiDetail });
    try {
      const data = await menuService.detail(id);
      this.setData({
        detail: {
          ...data,
          dateLabel: formatShortDateTime(data.createdAt),
          recipes: (data.recipes ?? []).map(mapRecipe),
        },
      });
    } catch (err) {
      this.setData({ detail: null });
      wx.showToast({
        title: err instanceof Error ? err.message : '加载失败',
        icon: 'none',
      });
    } finally {
      this.setData({ detailLoading: false });
    }
  },

  closeDetail() {
    this.setData({ detail: null });
  },

  confirmDelete(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;
    const title = e.currentTarget.dataset.title as string;
    wx.showModal({
      title: '删除酒单',
      content: `确定删除「${title}」？`,
      confirmColor: '#F34B2F',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          await menuService.remove(id);
          if (this.data.detail?.id === id) {
            this.setData({ detail: null });
          }
          await this.loadList();
        } catch (err) {
          wx.showToast({
            title: err instanceof Error ? err.message : '删除失败',
            icon: 'none',
          });
        }
      },
    });
  },
});
