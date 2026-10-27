import type {
  CategoryNode,
  IngredientItem,
  WorkbenchAnalyze,
  WorkbenchGlass,
  WorkbenchIngredientLine,
  WorkbenchOptions,
  WorkbenchRecipe,
  WorkbenchSession,
} from '@cocktail/shared';
import {
  axesFromAnalyze,
  axesToArray,
  buildCustomSaveBody,
  parseWorkbenchGenerateEvent,
  WORKBENCH_STEPS,
} from '@cocktail/shared';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../adapters/apiBase';
import { customService, ingredientService, workbenchService } from '../api';
import { appAlert } from '../components/AppDialog';
import { FlavorRadarChart } from '../components/FlavorRadarChart';
import { RecipeDetailView } from '../components/RecipeDetailView';
import { WorkbenchStepIndicator } from '../components/WorkbenchStepIndicator';
import { colors } from '../theme';
import { GLASS_ICONS } from '../constants/glassIcons';
import { ICE_ICONS, METHOD_ICONS } from '../constants/workbenchOptionIcons';

const GLASS_COLS = 2;
const GLASS_GAP = 10;
const GLASS_PAD = 20;

const STEPS = WORKBENCH_STEPS;

const GRID_GAP = 10;
const GRID_PAD = 16;
const GRID_COLS = 3;
const GRID_ITEM_W =
  (Dimensions.get('window').width - GRID_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) /
  GRID_COLS;

export function WorkbenchScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const glassCardWidth = useMemo(
    () =>
      (windowWidth - GLASS_PAD * 2 - GLASS_GAP * (GLASS_COLS - 1)) / GLASS_COLS,
    [windowWidth],
  );
  const [session, setSession] = useState<WorkbenchSession | null>(null);
  const [glasses, setGlasses] = useState<WorkbenchGlass[]>([]);
  const [options, setOptions] = useState<WorkbenchOptions | null>(null);
  const [feeling, setFeeling] = useState('');
  const [analyze, setAnalyze] = useState<WorkbenchAnalyze | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [recipe, setRecipe] = useState<WorkbenchRecipe | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [cardVisible, setCardVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [pickerSearchActive, setPickerSearchActive] = useState(false);
  const [pickerItems, setPickerItems] = useState<IngredientItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [pickerCategory, setPickerCategory] = useState<string | undefined>();
  const [pickerSubCategory, setPickerSubCategory] = useState<string | undefined>();
  /** 弹窗内暂存勾选，点「确认添加」才一次写入会话 */
  const [pickerDraft, setPickerDraft] = useState<
    Map<number, { ingredientId: number; name: string; amount: number; unit: string }>
  >(new Map());
  const [currentStep, setCurrentStep] = useState(0);
  const [radarSize, setRadarSize] = useState(112);
  const abortRef = useRef<AbortController | null>(null);

  const pickerCategoryNode = useMemo(
    () => categories.find((c) => c.code === pickerCategory),
    [categories, pickerCategory],
  );

  const selectedIds = useMemo(() => new Set(pickerDraft.keys()), [pickerDraft]);

  const boot = useCallback(async () => {
    setBooting(true);
    try {
      const [g, o, s] = await Promise.all([
        workbenchService.glasses(),
        workbenchService.options(),
        workbenchService.createSession(),
      ]);
      setGlasses(g.items ?? []);
      setOptions(o);
      setSession(s);
      setFeeling(s.feeling || '');
    } catch (err) {
      appAlert('工作台初始化失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void boot();
    return () => abortRef.current?.abort();
  }, [boot]);

  async function patch(body: Parameters<typeof workbenchService.patchSession>[1]) {
    if (!session) {
      return;
    }
    setBusy(true);
    try {
      const next = await workbenchService.patchSession(session.sessionId, body);
      setSession(next);
      setAnalyze(null);
    } catch (err) {
      appAlert('更新失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function onAnalyze() {
    if (!session) {
      return;
    }
    setBusy(true);
    try {
      if (feeling.trim() !== (session.feeling || '')) {
        await workbenchService.patchSession(session.sessionId, { feeling: feeling.trim() });
      }
      const res = await workbenchService.analyze(session.sessionId);
      setAnalyze(res);
    } catch (err) {
      appAlert('分析失败', err instanceof Error ? err.message : '请确认 AI 服务已启动');
    } finally {
      setBusy(false);
    }
  }

  async function onGenerate() {
    if (!session) {
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setGenerating(true);
    setStatusText('开始生成…');
    setRecipe(null);
    setImageUrl(null);
    setCardVisible(true);
    try {
      if (feeling.trim() !== (session.feeling || '')) {
        await workbenchService.patchSession(session.sessionId, {
          feeling: feeling.trim(),
        });
      }
      let nextRecipe: WorkbenchRecipe | null = null;
      let nextImage: string | null = null;
      await workbenchService.generate(
        session.sessionId,
        (raw) => {
          const event = parseWorkbenchGenerateEvent(raw);
          switch (event.kind) {
            case 'token':
              setStatusText(event.text);
              break;
            case 'recipe':
              nextRecipe = event.recipe;
              setRecipe(event.recipe);
              setStatusText('配方已生成，等待配图…');
              break;
            case 'image_loading':
              setStatusText(event.text);
              break;
            case 'image':
              nextImage = event.url;
              setImageUrl(event.url);
              setStatusText('特调卡片已完成');
              break;
            case 'image_error':
              setStatusText(event.message);
              break;
            case 'error':
              throw new Error(event.message);
            default:
              break;
          }
        },
        feeling.trim() || undefined,
        ac.signal,
      );
      if (!nextRecipe) {
        appAlert('生成失败', '未收到完整配方');
      } else {
        setRecipe(nextRecipe);
        if (nextImage) {
          setImageUrl(nextImage);
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        return;
      }
      appAlert('生成失败', err instanceof Error ? err.message : '请确认 AI 服务已启动');
      setCardVisible(false);
    } finally {
      setGenerating(false);
    }
  }

  async function onSaveCustom() {
    if (!recipe || !session) {
      return;
    }
    setBusy(true);
    try {
      await customService.save(
        buildCustomSaveBody({
          recipe,
          workbenchSessionId: session.sessionId,
          feelingFallback: feeling,
          imageUrl,
        }),
      );
      // 收藏成功：清空会话选择，回到工作台第一步
      const next = await workbenchService.resetSession(session.sessionId, false);
      setSession(next);
      setCardVisible(false);
      setRecipe(null);
      setImageUrl(null);
      setAnalyze(null);
      setStatusText('');
      setFeeling('');
      setCurrentStep(0);
      appAlert('已收藏', '可在「我的 → 特调」查看');
    } catch (err) {
      appAlert('保存失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function searchPicker(
    keyword: string,
    cat?: string,
    sub?: string,
  ) {
    setPickerLoading(true);
    try {
      const res = await ingredientService.search({
        q: keyword.trim() || undefined,
        category: cat,
        subCategory: sub,
        page: 1,
        size: 60,
      });
      setPickerItems(res.items ?? []);
    } catch {
      setPickerItems([]);
    } finally {
      setPickerLoading(false);
    }
  }

  async function openPicker() {
    setPickerVisible(true);
    setPickerQ('');
    setPickerSearchActive(false);
    setPickerLoading(true);
    // 用当前会话材料初始化草稿，关闭不点确认则丢弃
    const draft = new Map<
      number,
      { ingredientId: number; name: string; amount: number; unit: string }
    >();
    for (const ing of session?.ingredients ?? []) {
      draft.set(ing.ingredientId, {
        ingredientId: ing.ingredientId,
        name: ing.name,
        amount: Number(ing.amount) || 30,
        unit: ing.unit || 'ml',
      });
    }
    setPickerDraft(draft);
    try {
      let cats = categories;
      if (cats.length === 0) {
        const res = await ingredientService.categories();
        cats = res.categories ?? [];
        setCategories(cats);
      }
      const first = cats[0]?.code;
      setPickerCategory(first);
      setPickerSubCategory(undefined);
      await searchPicker('', first, undefined);
    } catch {
      setPickerItems([]);
      setPickerLoading(false);
    }
  }

  function togglePickerDraft(item: IngredientItem) {
    setPickerDraft((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
        return next;
      }
      const max = session?.maxIngredients ?? 12;
      if (next.size >= max) {
        appAlert('已达上限', `最多 ${max} 种材料`);
        return prev;
      }
      next.set(item.id, {
        ingredientId: item.id,
        name: item.name,
        amount: 30,
        unit: 'ml',
      });
      return next;
    });
  }

  async function confirmPickerAdd() {
    if (!session) {
      return;
    }
    const ingredients = [...pickerDraft.values()].map((x) => ({
      ingredientId: x.ingredientId,
      amount: x.amount,
      unit: x.unit,
    }));
    await patch({ ingredients });
    setPickerVisible(false);
  }

  function closePicker() {
    setPickerVisible(false);
    setPickerDraft(new Map());
  }

  async function removeIngredient(ingredientId: number) {
    if (!session) {
      return;
    }
    const next = session.ingredients.filter((x) => x.ingredientId !== ingredientId);
    await patch({
      ingredients: next.map((x) => ({
        ingredientId: x.ingredientId,
        amount: x.amount,
        unit: x.unit,
      })),
    });
  }

  const flavorAxes = useMemo(() => {
    const fromAi = axesFromAnalyze(analyze?.flavorProfile);
    return fromAi ? axesToArray(fromAi) : [];
  }, [analyze?.flavorProfile]);

  const analyzeDescription = useMemo(() => {
    if (analyze?.flavorSummary) {
      return analyze.flavorSummary;
    }
    if (!session?.ingredients.length) {
      return '添加材料并完成调配选项后，点击「酒方分析」查看风味画像。';
    }
    return '点击「酒方分析」，AI 将根据当前材料与技法给出风味描述。';
  }, [analyze, session?.ingredients.length]);

  const isLastStep = currentStep >= STEPS.length - 1;

  function goNextStep() {
    if (!session) {
      return;
    }
    if (currentStep === 0 && !session.glass) {
      appAlert('请选择杯型', '先选定酒杯容量，再继续选材料。');
      return;
    }
    if (currentStep === 1 && session.ingredients.length === 0) {
      appAlert('请添加材料', '至少选择一种基酒或利口酒。');
      return;
    }
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  }

  function onPrimaryAction() {
    if (isLastStep) {
      void onGenerate();
    } else {
      goNextStep();
    }
  }

  const nextLabel =
    currentStep === 0 ? '下一步：选材料' : currentStep === 1 ? '下一步：调配' : '生成特调';

  if (booting || !session || !options) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#F34B2F" size="large" />
        <Text style={styles.bootText}>正在打开调配台…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Workbench</Text>
          <Text style={styles.title}>调配工作台</Text>
        </View>
        <Pressable
          style={styles.resetBtn}
          onPress={() => {
            void (async () => {
              try {
                const next = await workbenchService.resetSession(session.sessionId, true);
                setSession(next);
                setFeeling('');
                setAnalyze(null);
                setRecipe(null);
                setImageUrl(null);
                setCurrentStep(0);
              } catch (err) {
                appAlert('重置失败', err instanceof Error ? err.message : '请稍后重试');
              }
            })();
          }}
        >
          <Ionicons name="refresh" size={22} color={colors.muted} />
        </Pressable>
      </View>

      <WorkbenchStepIndicator current={currentStep} />

      <View style={styles.body}>
        {currentStep === 2 ? (
          <View style={styles.mixStepBody}>
            <View style={styles.mixTop}>
              <View style={styles.mixPanel}>
                <Text style={styles.mixPanelLabel}>调配技法</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.methodRow}
                >
                  {options.methods.map((m) => {
                    const on = session.method === m.code;
                    const iconName = METHOD_ICONS[m.code] ?? 'glass-cocktail';
                    const iconColor = on ? colors.primary : colors.muted;
                    return (
                      <Pressable
                        key={m.code}
                        style={[styles.methodCard, on && styles.methodCardOn]}
                        onPress={() => void patch({ method: m.code })}
                      >
                        <MaterialCommunityIcons
                          name={iconName}
                          size={28}
                          color={iconColor}
                          style={styles.optionIcon}
                        />
                        <Text style={[styles.optionCn, on && styles.optionCnOn]} numberOfLines={1}>
                          {m.name}
                        </Text>
                        {m.nameEn ? (
                          <Text style={[styles.optionEn, on && styles.optionEnOn]} numberOfLines={1}>
                            ({m.nameEn})
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={[styles.mixPanel, styles.mixPanelTight]}>
                <Text style={styles.mixPanelLabel}>选择冰型</Text>
                <View style={styles.iceGrid}>
                  {options.iceTypes.map((m) => {
                    const on = session.iceType === m.code;
                    const iconName = ICE_ICONS[m.code] ?? 'snowflake';
                    const iconColor = on ? colors.primary : colors.muted;
                    return (
                      <Pressable
                        key={m.code}
                        style={[styles.iceCard, on && styles.iceCardOn]}
                        onPress={() => void patch({ iceType: m.code })}
                      >
                        <MaterialCommunityIcons name={iconName} size={22} color={iconColor} />
                        <Text style={[styles.iceName, on && styles.optionCnOn]} numberOfLines={1}>
                          {m.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <TextInput
                style={styles.feelingInput}
                value={feeling}
                onChangeText={setFeeling}
                placeholder="例如：清爽、微苦、适合晚餐"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.analyzePanel}>
              <Text style={styles.analyzePanelTitle}>AI 风味分析</Text>
              <View
                style={styles.analyzeRow}
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height;
                  const next = Math.max(96, Math.min(168, Math.floor(h * 0.78)));
                  setRadarSize((prev) => (Math.abs(prev - next) >= 4 ? next : prev));
                }}
              >
                <FlavorRadarChart values={flavorAxes} size={radarSize} />
                <View style={styles.analyzeDesc}>
                  {analyze ? (
                    <Text
                      style={[
                        styles.analyzeStatus,
                        analyze.feasible ? styles.analyzeOk : styles.analyzeWarnTitle,
                      ]}
                    >
                      {analyze.feasible ? '可以成杯' : '需要调整'}
                    </Text>
                  ) : null}
                  <Text style={styles.analyzeDescText}>{analyzeDescription}</Text>
                  {(analyze?.suggestions ?? []).slice(0, 2).map((s, i) => (
                    <Text key={`sg-${i}`} style={styles.analyzeSuggestInline}>
                      · {s}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          </View>
        ) : (
          <ScrollView
            style={styles.stepScroll}
            contentContainerStyle={styles.stepScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.stepHeading}>
              {currentStep === 0 ? '选择杯型' : '选择材料'}
            </Text>

            {currentStep === 0 ? (
              <FlatList
                data={glasses}
                keyExtractor={(g) => g.code}
                numColumns={GLASS_COLS}
                scrollEnabled={false}
                nestedScrollEnabled
                style={styles.glassGridList}
                columnWrapperStyle={GLASS_COLS > 1 ? styles.glassRow : undefined}
                contentContainerStyle={styles.glassList}
                renderItem={({ item: g }) => {
                  const on = session.glass?.code === g.code;
                  const icon = GLASS_ICONS[g.code];
                  return (
                    <Pressable
                      style={[
                        styles.glassCard,
                        { width: glassCardWidth, maxWidth: glassCardWidth },
                        on && styles.glassCardOn,
                      ]}
                      onPress={() => void patch({ glassCode: g.code })}
                    >
                      {icon ? (
                        <Image source={icon} style={styles.glassIcon} resizeMode="contain" />
                      ) : (
                        <View style={[styles.glassIcon, styles.glassIconFallback]}>
                          <Ionicons name="wine-outline" size={36} color={colors.muted} />
                        </View>
                      )}
                      <Text style={[styles.glassName, on && styles.glassNameOn]} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={styles.glassMeta}>{g.capacityMl} ml</Text>
                    </Pressable>
                  );
                }}
              />
            ) : null}

            {currentStep === 1 ? (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionInline}>已选 {session.ingredients.length} 项</Text>
                  <Pressable style={styles.addChip} onPress={() => void openPicker()}>
                    <Ionicons name="add" size={16} color={colors.text} />
                    <Text style={styles.addChipText}>添加</Text>
                  </Pressable>
                </View>
                {session.ingredients.length === 0 ? (
                  <Text style={styles.emptyHint}>还没有材料，点「添加」从知识库选择</Text>
                ) : (
                  session.ingredients.map((ing) => {
                    const thumb = resolveMediaUrl(ing.imageUrl);
                    return (
                      <View key={ing.ingredientId} style={styles.ingRow}>
                        {thumb ? (
                          <Image source={{ uri: thumb }} style={styles.ingThumb} />
                        ) : (
                          <View style={[styles.ingThumb, styles.ingThumbEmpty]}>
                            <Ionicons name="wine-outline" size={22} color={colors.muted} />
                          </View>
                        )}
                        <Text style={[styles.ingName, { flex: 1 }]}>{ing.name}</Text>
                        <Pressable
                          onPress={() => void removeIngredient(ing.ingredientId)}
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={18} color="#E07070" />
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </>
            ) : null}
          </ScrollView>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: 10 }]}>
        <Pressable
          style={[
            styles.secondaryBtn,
            (busy || generating || !isLastStep) && styles.disabled,
          ]}
          disabled={busy || generating || !isLastStep}
          onPress={() => void onAnalyze()}
        >
          <Text style={styles.secondaryText}>酒方分析</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryBtn, (busy || generating) && styles.disabled]}
          disabled={busy || generating}
          onPress={() => void onPrimaryAction()}
        >
          {generating ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Text style={styles.primaryText}>{isLastStep ? '生成特调' : nextLabel}</Text>
              {!isLastStep ? (
                <Ionicons name="arrow-forward" size={16} color={colors.text} />
              ) : null}
            </>
          )}
        </Pressable>
      </View>

      {/* 材料选择：图片网格 + 分类 Tab；勾选暂存，确认后一次保存 */}
      <Modal visible={pickerVisible} animationType="slide" onRequestClose={closePicker}>
        <View style={[styles.modal, { paddingTop: insets.top + 8 }]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>添加材料</Text>
              <Text style={styles.sub}>可多选，点下方确认后加入调配台</Text>
            </View>
            <Pressable onPress={closePicker} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#A0A0AA" />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="sparkles-outline" size={16} color="#A0A0AA" />
            <TextInput
              style={styles.searchInput}
              value={pickerQ}
              onChangeText={(text) => {
                setPickerQ(text);
                if (!text.trim()) {
                  setPickerSearchActive(false);
                  void searchPicker('', pickerCategory, pickerSubCategory);
                }
              }}
              placeholder="输入品牌、酒款或类型"
              placeholderTextColor="#A0A0AA"
              returnKeyType="search"
              onSubmitEditing={() => {
                const kw = pickerQ.trim();
                if (kw) {
                  setPickerSearchActive(true);
                  void searchPicker(kw, undefined, undefined);
                } else {
                  setPickerSearchActive(false);
                  void searchPicker('', pickerCategory, pickerSubCategory);
                }
              }}
            />
          </View>

          {!pickerSearchActive ? (
            <PickerCategoryTabs
              categories={categories}
              category={pickerCategory}
              subCategory={pickerSubCategory}
              childrenOf={pickerCategoryNode?.children}
              onCategoryChange={(code) => {
                setPickerCategory(code);
                setPickerSubCategory(undefined);
                void searchPicker('', code, undefined);
              }}
              onSubCategoryChange={(sub) => {
                setPickerSubCategory(sub);
                void searchPicker('', pickerCategory, sub);
              }}
            />
          ) : null}

          {pickerLoading ? (
            <ActivityIndicator color="#F34B2F" style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={pickerItems}
              keyExtractor={(item) => String(item.id)}
              numColumns={GRID_COLS}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={[
                styles.gridList,
                { paddingBottom: 16 },
              ]}
              ListEmptyComponent={<Text style={styles.emptyHint}>没有匹配材料</Text>}
              renderItem={({ item }) => {
                const on = selectedIds.has(item.id);
                return (
                  <Pressable
                    style={[styles.gridCard, on && styles.gridCardOn]}
                    onPress={() => togglePickerDraft(item)}
                  >
                    <PickerThumb uri={item.imageUrl} />
                    <Text style={styles.gridEn} numberOfLines={1}>
                      {item.nameEn || item.name}
                    </Text>
                    <Text style={styles.gridName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.gridMeta} numberOfLines={1}>
                      {item.subCategory
                        ? `属于${item.subCategory}`
                        : item.category
                          ? `属于${item.category}`
                          : ''}
                    </Text>
                    {on ? (
                      <View style={styles.gridCheck}>
                        <Ionicons name="checkmark" size={14} color="#1B1B1F" />
                      </View>
                    ) : (
                      <View style={styles.gridAdd}>
                        <Ionicons name="add" size={14} color="#F34B2F" />
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          <View style={[styles.pickerFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              style={[styles.pickerConfirmBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void confirmPickerAdd()}
            >
              <Text style={styles.pickerConfirmText}>
                确认添加 ({pickerDraft.size})
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 特调配方详情（对齐设计稿 04） */}
      <Modal visible={cardVisible} animationType="slide" onRequestClose={() => setCardVisible(false)}>
        <RecipeDetailView
          recipe={recipe}
          imageUrl={imageUrl}
          generating={generating}
          statusText={statusText}
          saving={busy}
          ingredientThumbs={(session?.ingredients ?? []).map((ing) => ({
            name: ing.name,
            imageUrl: ing.imageUrl,
          }))}
          onClose={() => setCardVisible(false)}
          onSave={() => void onSaveCustom()}
        />
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  center: { alignItems: 'center', justifyContent: 'center' },
  bootText: { color: '#A0A0AA', marginTop: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  kicker: {
    color: '#F34B2F',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { color: '#F5F5F5', fontSize: 28, fontWeight: '700', marginTop: 2 },
  body: {
    flex: 1,
    minHeight: 0,
  },
  stepScroll: {
    flex: 1,
  },
  stepScrollContent: {
    paddingBottom: 12,
  },
  stepHeading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginHorizontal: 20,
    marginBottom: 12,
  },
  mixStepBody: {
    flex: 1,
    minHeight: 0,
  },
  mixTop: {
    flexShrink: 0,
  },
  mixPanel: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mixPanelTight: {
    marginBottom: 8,
  },
  mixPanelLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  methodRow: {
    gap: 10,
    paddingRight: 4,
  },
  methodCard: {
    width: 80,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  methodCardOn: {
    borderColor: colors.primary,
    backgroundColor: '#2A1814',
  },
  optionIcon: {
    marginBottom: 8,
  },
  optionCn: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  optionCnOn: {
    color: colors.primary,
  },
  optionEn: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  optionEnOn: {
    color: colors.primary,
  },
  iceGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
  },
  iceCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  iceCardOn: {
    borderColor: colors.primary,
    backgroundColor: '#2A1814',
  },
  iceName: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionInline: {
    color: colors.muted,
    fontSize: 13,
  },
  resetBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1B1B1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    color: '#F34B2F',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
    marginHorizontal: 20,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  glassList: {
    paddingHorizontal: GLASS_PAD,
    paddingBottom: 8,
  },
  glassGridList: {
    flexGrow: 0,
  },
  glassRow: {
    gap: GLASS_GAP,
    marginBottom: GLASS_GAP,
    justifyContent: 'flex-start',
  },
  glassCard: {
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  glassCardOn: {
    borderColor: colors.primary,
    backgroundColor: '#2A1814',
  },
  glassIcon: {
    width: 72,
    height: 72,
    marginBottom: 8,
  },
  glassIconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  glassName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  glassNameOn: {
    color: colors.primary,
  },
  glassMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  chipOn: {
    borderColor: colors.primary,
    backgroundColor: '#2A1814',
  },
  chipTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  chipTitleOn: { color: colors.primary },
  chipMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F34B2F',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addChipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  emptyHint: { color: '#A0A0AA', marginHorizontal: 20, fontSize: 13 },
  ingRow: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#1B1B1F',
    borderWidth: 1,
    borderColor: '#303034',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ingThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#111111',
  },
  ingThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingName: { color: '#F5F5F5', fontSize: 15, fontWeight: '600' },
  wrapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1B1B1F',
    borderWidth: 1,
    borderColor: '#303034',
  },
  optionText: { color: '#A0A0AA', fontSize: 13 },
  feelingInput: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 10,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  analyzePanel: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  analyzePanelTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  analyzeRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  analyzeDesc: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    gap: 6,
  },
  analyzeStatus: {
    fontSize: 13,
    fontWeight: '700',
  },
  analyzeOk: { color: colors.primary },
  analyzeWarnTitle: { color: colors.accent },
  analyzeDescText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  analyzeSuggestInline: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#303034',
    backgroundColor: '#111111',
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#5A4578',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#241C2E',
  },
  secondaryText: { color: '#F5F5F5', fontWeight: '700' },
  primaryBtn: {
    flex: 1.4,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.5 },
  modal: { flex: 1, backgroundColor: '#111111' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalTitle: { color: '#F5F5F5', fontSize: 22, fontWeight: '700' },
  sub: { color: '#A0A0AA', fontSize: 13, marginTop: 4 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1B1B1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  pickerConfirmBtn: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  pickerConfirmText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  searchWrap: {
    marginHorizontal: 16,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1B1B1F',
    borderWidth: 1,
    borderColor: '#303034',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, color: '#F5F5F5' },
  tabsBlock: { marginTop: 10, marginBottom: 4 },
  primaryTabs: { paddingHorizontal: 16, gap: 18 },
  primaryTab: { paddingBottom: 8 },
  primaryTabText: { color: '#A0A0AA', fontSize: 15, fontWeight: '600' },
  primaryTabTextActive: { color: '#F34B2F' },
  underline: { marginTop: 6, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  underlineActive: { backgroundColor: '#F34B2F' },
  secondaryTabs: { paddingHorizontal: 16, gap: 14, paddingTop: 4, paddingBottom: 6 },
  secondaryTab: { paddingBottom: 6 },
  secondaryTabText: { color: '#A0A0AA', fontSize: 13 },
  secondaryTabTextActive: { color: '#F5F5F5', fontWeight: '600' },
  gridList: {
    paddingHorizontal: GRID_PAD,
    paddingTop: 10,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridCard: {
    width: GRID_ITEM_W,
    borderRadius: 12,
    backgroundColor: '#161210',
    borderWidth: 1,
    borderColor: '#303034',
    padding: 8,
    gap: 4,
  },
  gridCardOn: {
    borderColor: '#F34B2F',
    backgroundColor: '#2A2218',
  },
  gridThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#111111',
  },
  gridThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridEn: {
    color: '#F5F5F5',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  gridName: {
    color: '#A89B90',
    fontSize: 11,
    lineHeight: 15,
    minHeight: 30,
  },
  gridMeta: {
    color: '#A0A0AA',
    fontSize: 10,
  },
  gridCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F34B2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridAdd: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(20,17,15,0.72)',
    borderWidth: 1,
    borderColor: '#F34B2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function PickerThumb({ uri }: { uri?: string | null }) {
  const resolved = resolveMediaUrl(uri);
  if (!resolved) {
    return (
      <View style={[styles.gridThumb, styles.gridThumbEmpty]}>
        <Ionicons name="wine-outline" size={28} color="#A0A0AA" />
      </View>
    );
  }
  return <Image source={{ uri: resolved }} style={styles.gridThumb} resizeMode="cover" />;
}

function PickerCategoryTabs({
  categories,
  category,
  subCategory,
  onCategoryChange,
  onSubCategoryChange,
  childrenOf,
}: {
  categories: CategoryNode[];
  category?: string;
  subCategory?: string;
  onCategoryChange: (code: string | undefined) => void;
  onSubCategoryChange: (code: string | undefined) => void;
  childrenOf?: { code: string; name: string }[];
}) {
  const showSecondary = Boolean(childrenOf && childrenOf.length > 0);
  const secondary = showSecondary
    ? [{ code: '', name: '全部' }, ...(childrenOf ?? [])]
    : [];

  return (
    <View style={styles.tabsBlock}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.primaryTabs}
      >
        {categories.map((tab) => {
          const active = tab.code === category;
          return (
            <Pressable
              key={tab.code}
              style={styles.primaryTab}
              onPress={() => onCategoryChange(tab.code)}
            >
              <Text style={[styles.primaryTabText, active && styles.primaryTabTextActive]}>
                {tab.name}
              </Text>
              <View style={[styles.underline, active && styles.underlineActive]} />
            </Pressable>
          );
        })}
      </ScrollView>

      {showSecondary ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.secondaryTabs}
        >
          {secondary.map((tab) => {
            const code = tab.code || undefined;
            const active = code === subCategory;
            return (
              <Pressable
                key={`sub-${tab.code || 'all'}`}
                style={styles.secondaryTab}
                onPress={() => onSubCategoryChange(code)}
              >
                <Text
                  style={[
                    styles.secondaryTabText,
                    active && styles.secondaryTabTextActive,
                  ]}
                >
                  {tab.name}
                </Text>
                <View style={[styles.underline, active && styles.underlineActive]} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
