import type { CustomSummary } from '@cocktail/shared';
import { formatShortDateTime } from '@cocktail/shared';
import { resolveMediaUrl } from '../../adapters/apiBase';
import { customService } from '../../api';

type UiItem = CustomSummary & {
  imageUri?: string;
  meta: string;
};

Page({
  data: {
    loading: true,
    items: [] as UiItem[],
  },

  onShow() {
    void this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const list = (await customService.list()) ?? [];
      const items: UiItem[] = list.map((item) => ({
        ...item,
        imageUri: resolveMediaUrl(item.imageUrl) || '',
        meta: [item.glass, item.method, formatShortDateTime(item.createdAt)]
          .filter(Boolean)
          .join(' · '),
      }));
      this.setData({ items });
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '加载失败',
        icon: 'none',
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  openDetail(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;
    wx.navigateTo({ url: `/pages/recipe-detail/index?customId=${id}&from=customs` });
  },

  confirmDelete(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;
    const name = e.currentTarget.dataset.name as string;
    wx.showModal({
      title: '删除特调',
      content: `确定删除「${name}」？`,
      confirmColor: '#F34B2F',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          await customService.remove(id);
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
