import type {
  CategoryNode,
  IngredientItem,
  WorkbenchAnalyze,
  WorkbenchGlass,
  WorkbenchOptions,
  WorkbenchRecipe,
  WorkbenchSession,
} from '@cocktail/shared';
import {
  axesFromAnalyze,
  axesToArray,
  FLAVOR_AXIS_LABELS,
  parseWorkbenchGenerateEvent,
  WORKBENCH_STEPS,
} from '@cocktail/shared';
import { resolveMediaUrl } from '../../adapters/apiBase';
import { ingredientService, workbenchService } from '../../api';
import { requireAuth } from '../../utils/nav';

type PickerUiItem = IngredientItem & { imageUri: string };
type IngredientUi = WorkbenchSession['ingredients'][number] & { imageUri: string };

function mapPickerItems(items: IngredientItem[]): PickerUiItem[] {
  return (items ?? []).map((item) => ({
    ...item,
    imageUri: resolveMediaUrl(item.imageUrl) || '',
  }));
}

function mapSessionIngredients(
  items: WorkbenchSession['ingredients'],
): IngredientUi[] {
  return (items ?? []).map((item) => ({
    ...item,
    imageUri: resolveMediaUrl(item.imageUrl) || '',
  }));
}

const GLASS_CODES = [
  'rocks',
  'coupe',
  'wine_goblet',
  'highball',
  'martini',
  'hurricane',
  'flute',
  'margarita',
  'nick_nora',
] as const;

type GlassUi = WorkbenchGlass & { icon: string };

function glassIcon(code: string) {
  return GLASS_CODES.includes(code as (typeof GLASS_CODES)[number])
    ? `/assets/images/glasses/${code}.jpg`
    : '/assets/images/glasses/rocks.jpg';
}

const STORAGE_KEY = 'recipeDetailPayload';

Page({
  data: {
    booting: true,
    busy: false,
    generating: false,
    steps: [...WORKBENCH_STEPS],
    currentStep: 0,
    nextLabel: '下一步：选材料',
    session: null as WorkbenchSession | null,
    ingredients: [] as IngredientUi[],
    selectedGlassCode: '',
    selectedMethod: '',
    selectedIce: '',
    glasses: [] as GlassUi[],
    options: null as WorkbenchOptions | null,
    methods: [] as WorkbenchOptions['methods'],
    iceTypes: [] as WorkbenchOptions['iceTypes'],
    feeling: '',
    analyze: null as WorkbenchAnalyze | null,
    analyzeDescription: '添加材料并完成调配选项后，点击「酒方分析」查看风味画像。',
    analyzeStatus: '',
    analyzeOk: false,
    flavorBars: [] as Array<{ label: string; pct: number }>,
    suggestions: [] as string[],
    pickerVisible: false,
    pickerQ: '',
    pickerSearchActive: false,
    pickerLoading: false,
    pickerItems: [] as PickerUiItem[],
    pickerCategory: '',
    pickerCount: 0,
    categories: [] as CategoryNode[],
    pickerSelected: {} as Record<number, boolean>,
    pickerDraft: {} as Record<
      number,
      { ingredientId: number; name: string; amount: number; unit: string }
    >,
  },

  noop() {},

  async onShow() {
    if (!(await requireAuth())) {
      return;
    }
    if (!this.data.session) {
      void this.boot();
    }
  },

  async boot() {
    this.setData({ booting: true });
    try {
      const [g, o, s] = await Promise.all([
        workbenchService.glasses(),
        workbenchService.options(),
        workbenchService.createSession(),
      ]);
      this.applySession(s, {
        glasses: (g.items ?? []).map((item) => ({
          ...item,
          icon: glassIcon(item.code),
        })),
        options: o,
        methods: o.methods ?? [],
        iceTypes: o.iceTypes ?? [],
        feeling: s.feeling || '',
        booting: false,
      });
      this.refreshAnalyzeUi(null, s);
    } catch (err) {
      this.setData({ booting: false });
      wx.showToast({
        title: err instanceof Error ? err.message : '工作台初始化失败',
        icon: 'none',
      });
    }
  },

  applySession(session: WorkbenchSession, extra: Record<string, unknown> = {}) {
    this.setData({
      session,
      ingredients: mapSessionIngredients(session.ingredients ?? []),
      selectedGlassCode: session.glass?.code || '',
      selectedMethod: session.method || '',
      selectedIce: session.iceType || '',
      ...extra,
    });
  },

  refreshAnalyzeUi(analyze: WorkbenchAnalyze | null, session?: WorkbenchSession | null) {
    const sess = session ?? this.data.session;
    const fromAi = axesFromAnalyze(analyze?.flavorProfile);
    const values = fromAi ? axesToArray(fromAi) : [];
    let analyzeDescription =
      '添加材料并完成调配选项后，点击「酒方分析」查看风味画像。';
    if (analyze?.flavorSummary) {
      analyzeDescription = analyze.flavorSummary;
    } else if (sess?.ingredients?.length) {
      analyzeDescription = '点击「酒方分析」，AI 将根据当前材料与技法给出风味描述。';
    }
    this.setData({
      analyze,
      analyzeDescription,
      analyzeStatus: analyze
        ? analyze.feasible
          ? '可以成杯'
          : '需要调整'
        : '',
      analyzeOk: Boolean(analyze?.feasible),
      flavorBars: values.map((v, i) => ({
        label: FLAVOR_AXIS_LABELS[i],
        pct: Math.round(Math.max(0, Math.min(1, v)) * 100),
      })),
      suggestions: (analyze?.suggestions ?? []).slice(0, 2),
    });
  },

  updateNextLabel(step: number) {
    const nextLabel =
      step === 0 ? '下一步：选材料' : step === 1 ? '下一步：调配' : '生成特调';
    this.setData({ currentStep: step, nextLabel });
  },

  async patch(body: Parameters<typeof workbenchService.patchSession>[1]) {
    const session = this.data.session;
    if (!session) {
      return;
    }
    this.setData({ busy: true });
    try {
      const next = await workbenchService.patchSession(session.sessionId, body);
      this.applySession(next, { analyze: null });
      this.refreshAnalyzeUi(null, next);
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '更新失败',
        icon: 'none',
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  selectGlass(e: WechatMiniprogram.TouchEvent) {
    void this.patch({ glassCode: e.currentTarget.dataset.code as string });
  },

  selectMethod(e: WechatMiniprogram.TouchEvent) {
    void this.patch({ method: e.currentTarget.dataset.code as string });
  },

  selectIce(e: WechatMiniprogram.TouchEvent) {
    void this.patch({ iceType: e.currentTarget.dataset.code as string });
  },

  onFeeling(e: WechatMiniprogram.Input) {
    this.setData({ feeling: e.detail.value });
  },

  goPrev() {
    if (this.data.currentStep > 0) {
      this.updateNextLabel(this.data.currentStep - 1);
    }
  },

  onPrimary() {
    const { currentStep, session } = this.data;
    if (!session) {
      return;
    }
    if (currentStep === 0) {
      if (!session.glass) {
        wx.showToast({ title: '请选择杯型', icon: 'none' });
        return;
      }
      this.updateNextLabel(1);
      return;
    }
    if (currentStep === 1) {
      if (!session.ingredients.length) {
        wx.showToast({ title: '请添加材料', icon: 'none' });
        return;
      }
      this.updateNextLabel(2);
      return;
    }
    void this.onGenerate();
  },

  async onAnalyze() {
    const session = this.data.session;
    if (!session) {
      return;
    }
    this.setData({ busy: true });
    try {
      if (this.data.feeling.trim() !== (session.feeling || '')) {
        await workbenchService.patchSession(session.sessionId, {
          feeling: this.data.feeling.trim(),
        });
      }
      const res = await workbenchService.analyze(session.sessionId);
      this.refreshAnalyzeUi(res);
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '分析失败',
        icon: 'none',
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  async onGenerate() {
    const session = this.data.session;
    if (!session) {
      return;
    }
    this.setData({ generating: true });
    try {
      if (this.data.feeling.trim() !== (session.feeling || '')) {
        await workbenchService.patchSession(session.sessionId, {
          feeling: this.data.feeling.trim(),
        });
      }
      let nextRecipe: WorkbenchRecipe | null = null;
      let nextImage: string | null = null;
      await workbenchService.generate(
        session.sessionId,
        (raw) => {
          const event = parseWorkbenchGenerateEvent(raw);
          if (event.kind === 'recipe') {
            nextRecipe = event.recipe;
          } else if (event.kind === 'image') {
            nextImage = event.url;
          } else if (event.kind === 'error') {
            throw new Error(event.message);
          }
        },
        this.data.feeling.trim() || undefined,
      );
      if (!nextRecipe) {
        wx.showToast({ title: '未收到完整配方', icon: 'none' });
        return;
      }
      const payload = {
        recipe: nextRecipe,
        imageUrl: nextImage,
        from: 'workbench',
        sessionId: session.sessionId,
        feeling: this.data.feeling,
      };
      wx.setStorageSync(STORAGE_KEY, JSON.stringify(payload));
      const app = getApp<{ globalData: { pendingRecipe: unknown } }>();
      app.globalData.pendingRecipe = payload;
      wx.navigateTo({ url: '/pages/recipe-detail/index?from=workbench' });
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '生成失败',
        icon: 'none',
      });
    } finally {
      this.setData({ generating: false });
    }
  },

  async onReset() {
    const session = this.data.session;
    if (!session) {
      return;
    }
    try {
      const next = await workbenchService.resetSession(session.sessionId, true);
      this.applySession(next, { feeling: '', analyze: null });
      this.refreshAnalyzeUi(null, next);
      this.updateNextLabel(0);
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message : '重置失败',
        icon: 'none',
      });
    }
  },

  async openPicker() {
    const draft: Record<
      number,
      { ingredientId: number; name: string; amount: number; unit: string }
    > = {};
    const selected: Record<number, boolean> = {};
    for (const ing of this.data.session?.ingredients ?? []) {
      draft[ing.ingredientId] = {
        ingredientId: ing.ingredientId,
        name: ing.name,
        amount: Number(ing.amount) || 30,
        unit: ing.unit || 'ml',
      };
      selected[ing.ingredientId] = true;
    }
    this.setData({
      pickerVisible: true,
      pickerQ: '',
      pickerSearchActive: false,
      pickerDraft: draft,
      pickerSelected: selected,
      pickerCount: Object.keys(draft).length,
      pickerLoading: true,
    });
    try {
      let cats = this.data.categories;
      if (!cats.length) {
        const res = await ingredientService.categories();
        cats = res.categories ?? [];
        this.setData({ categories: cats });
      }
      const first = cats[0]?.code || '';
      this.setData({ pickerCategory: first });
      await this.searchPicker('', first);
    } catch {
      this.setData({ pickerItems: [], pickerLoading: false });
    }
  },

  closePicker() {
    this.setData({
      pickerVisible: false,
      pickerDraft: {},
      pickerSelected: {},
      pickerCount: 0,
      pickerSearchActive: false,
      pickerQ: '',
    });
  },

  onPickerQ(e: WechatMiniprogram.Input) {
    const value = e.detail.value;
    this.setData({ pickerQ: value });
    if (!value.trim()) {
      this.setData({ pickerSearchActive: false });
      void this.searchPicker('', this.data.pickerCategory);
    }
  },

  searchPickerConfirm() {
    const q = this.data.pickerQ.trim();
    if (q) {
      this.setData({ pickerSearchActive: true, pickerCategory: '' });
      void this.searchPicker(q, undefined);
    } else {
      this.setData({ pickerSearchActive: false });
      void this.searchPicker('', this.data.pickerCategory);
    }
  },

  selectPickerCategory(e: WechatMiniprogram.TouchEvent) {
    const code = e.currentTarget.dataset.code as string;
    this.setData({
      pickerCategory: code,
      pickerQ: '',
      pickerSearchActive: false,
    });
    void this.searchPicker('', code);
  },

  async searchPicker(keyword: string, cat?: string) {
    this.setData({ pickerLoading: true });
    try {
      const res = await ingredientService.search({
        q: keyword.trim() || undefined,
        category: cat || undefined,
        page: 1,
        size: 60,
      });
      this.setData({ pickerItems: mapPickerItems(res.items ?? []) });
    } catch {
      this.setData({ pickerItems: [] });
    } finally {
      this.setData({ pickerLoading: false });
    }
  },

  togglePicker(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    const name = e.currentTarget.dataset.name as string;
    const draft = { ...this.data.pickerDraft };
    const selected = { ...this.data.pickerSelected };
    if (draft[id]) {
      delete draft[id];
      delete selected[id];
    } else {
      const max = this.data.session?.maxIngredients ?? 12;
      if (Object.keys(draft).length >= max) {
        wx.showToast({ title: `最多 ${max} 种材料`, icon: 'none' });
        return;
      }
      draft[id] = { ingredientId: id, name, amount: 30, unit: 'ml' };
      selected[id] = true;
    }
    this.setData({
      pickerDraft: draft,
      pickerSelected: selected,
      pickerCount: Object.keys(draft).length,
    });
  },

  async confirmPicker() {
    const ingredients = Object.values(this.data.pickerDraft).map((x) => ({
      ingredientId: x.ingredientId,
      amount: x.amount,
      unit: x.unit,
    }));
    await this.patch({ ingredients });
    this.closePicker();
  },

  async removeIngredient(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    const session = this.data.session;
    if (!session) {
      return;
    }
    const next = session.ingredients.filter((x) => x.ingredientId !== id);
    await this.patch({
      ingredients: next.map((x) => ({
        ingredientId: x.ingredientId,
        amount: x.amount,
        unit: x.unit,
      })),
    });
  },
});
