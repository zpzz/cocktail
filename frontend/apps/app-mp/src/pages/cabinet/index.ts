import type {
  CabinetItem,
  CategoryNode,
  IngredientItem,
  MenuRecipe,
} from '@cocktail/shared';
import { summarizeRecognizeResult } from '@cocktail/shared';
import { resolveMediaUrl } from '../../adapters/apiBase';
import { cabinetService, ingredientService } from '../../api';
import { requireAuth } from '../../utils/nav';

type UiItem = CabinetItem & {
  imageUri?: string;
  meta: string;
  stockLabel: string;
};

type CatalogUiItem = IngredientItem & { imageUri: string };

type UiMenuRecipe = MenuRecipe & { missingText?: string };

type Panel = 'none' | 'add' | 'edit' | 'menu';

function mapCatalogItems(items: IngredientItem[]): CatalogUiItem[] {
  return (items ?? []).map((item) => ({
    ...item,
    imageUri: resolveMediaUrl(item.imageUrl) || '',
  }));
}

Page({
  data: {
    items: [] as UiItem[],
    itemCount: 0,
    categories: [] as CategoryNode[],
    category: '',
    q: '',
    loading: true,
    busy: false,
    error: '',
    panel: 'none' as Panel,
    editing: null as CabinetItem | null,
    editQty: '',
    editUnit: 'ml',
    editKnown: true,
    catalogQ: '',
    catalogSearchActive: false,
    catalogCategory: '',
    catalogItems: [] as CatalogUiItem[],
    catalogLoading: false,
    selectedIds: {} as Record<number, boolean>,
    menuRecipes: [] as UiMenuRecipe[],
    menuSavedHint: false,
  },

  listReqId: 0,
  categoriesReady: false,

  async onShow() {
    if (!(await requireAuth())) {
      return;
    }
    if (!this.categoriesReady) {
      void this.bootCategories();
    } else {
      void this.loadList();
    }
  },

  async bootCategories() {
    try {
      const res = await ingredientService.categories();
      const list = res.categories ?? [];
      this.setData({
        categories: list,
        category: this.data.category || list[0]?.code || '',
      });
    } catch {
      this.setData({ categories: [] });
    } finally {
      this.categoriesReady = true;
      void this.loadList();
    }
  },

  mapItems(items: CabinetItem[]): UiItem[] {
    return items.map((item) => ({
      ...item,
      imageUri: resolveMediaUrl(item.imageUrl) || '',
      meta: `${item.subCategory ? `属于${item.subCategory}` : item.category || ''}${
        item.quantityKnown && item.quantity != null
          ? `  ${item.quantity}${item.unit || ''}`
          : ''
      }`,
      stockLabel: `${item.stockStatus === 'empty' ? '无货' : '有货'}${
        item.quantityKnown ? '' : '  余量未知'
      }`,
    }));
  },

  async loadList(opts?: { silent?: boolean }) {
    const reqId = ++this.listReqId;
    if (!opts?.silent) {
      this.setData({ loading: true, error: '' });
    }
    try {
      const data = await cabinetService.list({
        q: this.data.q.trim() || undefined,
        category: this.data.category || undefined,
        page: 1,
        size: 100,
      });
      if (reqId !== this.listReqId) {
        return;
      }
      this.setData({
        items: this.mapItems(data.items ?? []),
        itemCount: data.summary?.itemCount ?? data.total ?? 0,
      });
    } catch (err) {
      if (reqId !== this.listReqId) {
        return;
      }
      this.setData({
        error: err instanceof Error ? err.message : '加载酒柜失败',
      });
    } finally {
      if (reqId === this.listReqId) {
        this.setData({ loading: false });
      }
    }
  },

  onQ(e: WechatMiniprogram.Input) {
    this.setData({ q: e.detail.value });
  },

  selectCategory(e: WechatMiniprogram.TouchEvent) {
    this.setData({ category: e.currentTarget.dataset.code as string });
    void this.loadList();
  },

  closePanel() {
    this.setData({ panel: 'none', editing: null });
  },

  async openAdd() {
    const first = this.data.categories[0]?.code || '';
    this.setData({
      panel: 'add',
      catalogQ: '',
      catalogSearchActive: false,
      catalogCategory: first,
      selectedIds: {},
    });
    await this.searchCatalog('', first);
  },

  onCatalogQ(e: WechatMiniprogram.Input) {
    this.setData({ catalogQ: e.detail.value });
  },

  searchCatalogConfirm() {
    const q = this.data.catalogQ.trim();
    this.setData({
      catalogSearchActive: Boolean(q),
      catalogCategory: q ? '' : this.data.catalogCategory,
    });
    void this.searchCatalog(q, q ? undefined : this.data.catalogCategory);
  },

  selectCatalogCategory(e: WechatMiniprogram.TouchEvent) {
    const code = e.currentTarget.dataset.code as string;
    this.setData({
      catalogCategory: code,
      catalogQ: '',
      catalogSearchActive: false,
    });
    void this.searchCatalog('', code);
  },

  async searchCatalog(keyword: string, cat?: string) {
    this.setData({ catalogLoading: true });
    try {
      const res = await ingredientService.search({
        q: keyword.trim() || undefined,
        category: cat || undefined,
        page: 1,
        size: 60,
      });
      this.setData({ catalogItems: mapCatalogItems(res.items ?? []) });
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '搜索失败',
        icon: 'none',
      });
    } finally {
      this.setData({ catalogLoading: false });
    }
  },

  toggleSelect(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    const selectedIds = { ...this.data.selectedIds };
    if (selectedIds[id]) {
      delete selectedIds[id];
    } else {
      selectedIds[id] = true;
    }
    this.setData({ selectedIds });
  },

  async confirmAdd() {
    const ids = Object.keys(this.data.selectedIds).map(Number);
    if (!ids.length) {
      wx.showToast({ title: '请先勾选材料', icon: 'none' });
      return;
    }
    this.setData({ busy: true });
    try {
      const selected = this.data.catalogItems.filter((item) => ids.includes(item.id));
      await cabinetService.add({
        merge: true,
        items: selected.map((item) => ({
          ingredientId: item.id,
          unit: item.primaryUnit || 'ml',
          quantityKnown: false,
        })),
      });
      this.setData({ panel: 'none' });
      await this.loadList({ silent: true });
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '添加失败',
        icon: 'none',
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  openEdit(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    const item = this.data.items.find((x) => x.id === id);
    if (!item) {
      return;
    }
    this.setData({
      editing: item,
      editQty:
        item.quantityKnown && item.quantity != null ? String(item.quantity) : '',
      editUnit: item.unit || 'ml',
      editKnown: item.quantityKnown,
      panel: 'edit',
    });
  },

  onEditKnown(e: WechatMiniprogram.SwitchChange) {
    this.setData({ editKnown: Boolean(e.detail.value) });
  },

  onEditQty(e: WechatMiniprogram.Input) {
    this.setData({ editQty: e.detail.value });
  },

  onEditUnit(e: WechatMiniprogram.Input) {
    this.setData({ editUnit: e.detail.value });
  },

  async saveEdit() {
    const editing = this.data.editing;
    if (!editing) {
      return;
    }
    this.setData({ busy: true });
    try {
      await cabinetService.update(editing.id, {
        quantity:
          this.data.editKnown && this.data.editQty.trim()
            ? Number(this.data.editQty)
            : null,
        unit: this.data.editUnit.trim() || 'ml',
        quantityKnown: this.data.editKnown,
      });
      this.setData({ panel: 'none', editing: null });
      await this.loadList({ silent: true });
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '更新失败',
        icon: 'none',
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  confirmDelete(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    const name =
      (e.currentTarget.dataset.name as string) ||
      this.data.items.find((x) => x.id === id)?.name ||
      '';
    wx.showModal({
      title: '删除库存',
      content: `确定删除「${name}」？`,
      confirmColor: '#F34B2F',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          await cabinetService.remove(id);
          if (this.data.editing?.id === id) {
            this.setData({ panel: 'none', editing: null });
          }
          await this.loadList({ silent: true });
        } catch (err) {
          wx.showToast({
            title: err instanceof Error ? err.message : '删除失败',
            icon: 'none',
          });
        }
      },
    });
  },

  async generateMenu() {
    this.setData({ busy: true, error: '' });
    try {
      const res = await cabinetService.menu({ limit: 5, diversity: true });
      this.setData({
        menuRecipes: (res.recipes ?? []).map((item) => ({
          ...item,
          missingText: item.missing?.length ? item.missing.join('、') : '',
        })),
        menuSavedHint: Boolean(res.savedMenuId),
        panel: 'menu',
      });
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '生成酒单失败',
        icon: 'none',
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  chooseRecognize() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        void this.pickAndRecognize(res.tapIndex === 0);
      },
    });
  },

  async pickAndRecognize(fromCamera: boolean) {
    try {
      const media = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: fromCamera ? ['camera'] : ['album'],
        sizeType: ['compressed'],
      });
      const file = media.tempFiles[0];
      if (!file) {
        return;
      }
      this.setData({ busy: true });
      const result = await cabinetService.recognize({
        uri: file.tempFilePath,
        name: 'bottle.jpg',
        type: file.fileType === 'image' ? 'image/jpeg' : 'image/jpeg',
      });
      const summary = summarizeRecognizeResult(result);
      this.setData({
        catalogQ: summary.keywordText,
        catalogSearchActive:
          summary.keywords.length > 0 || summary.candidates.length > 0,
        catalogCategory: '',
        selectedIds: {},
        catalogItems: mapCatalogItems(summary.candidates),
        panel: 'add',
      });
      wx.showModal({
        title: summary.alertTitle,
        content: summary.alertMessage,
        showCancel: false,
      });
    } catch (err) {
      if ((err as { errMsg?: string })?.errMsg?.includes('cancel')) {
        return;
      }
      wx.showToast({
        title: err instanceof Error ? err.message : '识别失败',
        icon: 'none',
      });
    } finally {
      this.setData({ busy: false });
    }
  },
});
