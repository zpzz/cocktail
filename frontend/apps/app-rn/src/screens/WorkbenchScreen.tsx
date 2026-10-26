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
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../adapters/apiBase';
import { customService, ingredientService, workbenchService } from '../api';

const GRID_GAP = 10;
const GRID_PAD = 16;
const GRID_COLS = 3;
const GRID_ITEM_W =
  (Dimensions.get('window').width - GRID_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) /
  GRID_COLS;

export function WorkbenchScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
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
  const abortRef = useRef<AbortController | null>(null);

  const pickerCategoryNode = useMemo(
    () => categories.find((c) => c.code === pickerCategory),
    [categories, pickerCategory],
  );

  const selectedIds = useMemo(
    () => new Set((session?.ingredients ?? []).map((x) => x.ingredientId)),
    [session?.ingredients],
  );

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
      Alert.alert('工作台初始化失败', err instanceof Error ? err.message : '请稍后重试');
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
      Alert.alert('更新失败', err instanceof Error ? err.message : '请稍后重试');
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
      Alert.alert('分析失败', err instanceof Error ? err.message : '请确认 AI 服务已启动');
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
          const event = raw as Record<string, unknown>;
          const type = String(event.type || '');
          if (type === 'token' && typeof event.text === 'string') {
            setStatusText(event.text.trim() || '生成中…');
          } else if (type === 'recipe' && event.recipe && typeof event.recipe === 'object') {
            nextRecipe = event.recipe as WorkbenchRecipe;
            setRecipe(nextRecipe);
            setStatusText('配方已生成，等待配图…');
          } else if (type === 'image_loading') {
            setStatusText(String(event.text || '正在生成配图…'));
          } else if (type === 'image' && typeof event.url === 'string') {
            nextImage = event.url;
            setImageUrl(event.url);
            setStatusText('特调卡片已完成');
          } else if (type === 'image_error') {
            setStatusText(String(event.message || '配图失败，仍可查看配方'));
          } else if (type === 'error') {
            throw new Error(String(event.message || '生成失败'));
          }
        },
        feeling.trim() || undefined,
        ac.signal,
      );
      if (!nextRecipe) {
        Alert.alert('生成失败', '未收到完整配方');
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
      Alert.alert('生成失败', err instanceof Error ? err.message : '请确认 AI 服务已启动');
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
      await customService.save({
        workbenchSessionId: session.sessionId,
        name: recipe.name,
        nameEn: recipe.nameEn,
        glass: recipe.glass,
        method: recipe.method,
        iceType: recipe.iceType || recipe.ice_type,
        garnishes: recipe.garnishes,
        feeling: recipe.feeling || feeling,
        flavorSummary: recipe.flavorSummary || recipe.flavor_summary,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        instructions: recipe.instructions,
        imageUrl: imageUrl || undefined,
      });
      Alert.alert('已保存', '可在「我的 → 特调」查看');
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : '请稍后重试');
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

  async function addIngredient(item: IngredientItem) {
    if (!session) {
      return;
    }
    const exists = session.ingredients.some((x) => x.ingredientId === item.id);
    if (exists) {
      await removeIngredient(item.id);
      return;
    }
    if (session.ingredients.length >= session.maxIngredients) {
      Alert.alert('已达上限', `最多 ${session.maxIngredients} 种材料`);
      return;
    }
    const next: WorkbenchIngredientLine[] = [
      ...session.ingredients,
      {
        ingredientId: item.id,
        name: item.name,
        amount: 30,
        unit: 'ml',
      },
    ];
    await patch({
      ingredients: next.map((x) => ({
        ingredientId: x.ingredientId,
        amount: x.amount,
        unit: x.unit,
      })),
    });
    // 保持弹层，方便连续多选
  }

  async function updateAmount(ingredientId: number, amount: number) {
    if (!session) {
      return;
    }
    const next = session.ingredients.map((x) =>
      x.ingredientId === ingredientId ? { ...x, amount } : x,
    );
    await patch({
      ingredients: next.map((x) => ({
        ingredientId: x.ingredientId,
        amount: x.amount,
        unit: x.unit,
      })),
    });
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

  const fillRatio = useMemo(() => {
    if (!session?.capacityMl || session.capacityMl <= 0) {
      return 0;
    }
    return Math.min(1, Number(session.volumeMl || 0) / session.capacityMl);
  }, [session]);

  if (booting || !session || !options) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#C9A227" size="large" />
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
          <Text style={styles.sub}>选杯 → 选料 → 技法 → 生成特调卡片</Text>
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
              } catch (err) {
                Alert.alert('重置失败', err instanceof Error ? err.message : '请稍后重试');
              }
            })();
          }}
        >
          <Ionicons name="refresh" size={18} color="#C4B8AC" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarHeight + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.section}>杯型</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {glasses.map((g) => {
            const on = session.glass?.code === g.code;
            return (
              <Pressable
                key={g.code}
                style={[styles.glassChip, on && styles.chipOn]}
                onPress={() => void patch({ glassCode: g.code })}
              >
                <Text style={[styles.chipTitle, on && styles.chipTitleOn]}>{g.name}</Text>
                <Text style={styles.chipMeta}>{g.capacityMl}ml</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {session.capacityMl ? (
          <View style={styles.capacityCard}>
            <View style={styles.capacityTop}>
              <Text style={styles.capacityLabel}>杯容量占用</Text>
              <Text style={styles.capacityValue}>
                {Math.round(Number(session.volumeMl || 0))}/{session.capacityMl} ml
              </Text>
            </View>
            <View style={styles.capacityTrack}>
              <View
                style={[
                  styles.capacityFill,
                  {
                    width: `${fillRatio * 100}%`,
                    backgroundColor: fillRatio > 1 ? '#E07070' : '#C9A227',
                  },
                ]}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.sectionRow}>
          <Text style={styles.section}>材料</Text>
          <Pressable style={styles.addChip} onPress={() => void openPicker()}>
            <Ionicons name="add" size={16} color="#1C1816" />
            <Text style={styles.addChipText}>添加</Text>
          </Pressable>
        </View>
        {session.ingredients.length === 0 ? (
          <Text style={styles.emptyHint}>还没有材料，点右上角添加基酒/利口酒等</Text>
        ) : (
          session.ingredients.map((ing) => {
            const thumb = resolveMediaUrl(ing.imageUrl);
            return (
              <View key={ing.ingredientId} style={styles.ingRow}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.ingThumb} />
                ) : (
                  <View style={[styles.ingThumb, styles.ingThumbEmpty]}>
                    <Ionicons name="wine-outline" size={22} color="#6F675F" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.ingName}>{ing.name}</Text>
                  <Text style={styles.ingUnit}>{ing.unit}</Text>
                </View>
                <View style={styles.amountCtrl}>
                  <Pressable
                    style={styles.amountBtn}
                    onPress={() =>
                      void updateAmount(ing.ingredientId, Math.max(5, Number(ing.amount) - 5))
                    }
                  >
                    <Text style={styles.amountBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.amountValue}>{ing.amount}</Text>
                  <Pressable
                    style={styles.amountBtn}
                    onPress={() => void updateAmount(ing.ingredientId, Number(ing.amount) + 5)}
                  >
                    <Text style={styles.amountBtnText}>+</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => void removeIngredient(ing.ingredientId)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color="#E07070" />
                </Pressable>
              </View>
            );
          })
        )}

        <Text style={styles.section}>技法</Text>
        <View style={styles.wrapChips}>
          {options.methods.map((m) => {
            const on = session.method === m.code;
            return (
              <Pressable
                key={m.code}
                style={[styles.optionChip, on && styles.chipOn]}
                onPress={() => void patch({ method: m.code })}
              >
                <Text style={[styles.optionText, on && styles.chipTitleOn]}>{m.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>冰块</Text>
        <View style={styles.wrapChips}>
          {options.iceTypes.map((m) => {
            const on = session.iceType === m.code;
            return (
              <Pressable
                key={m.code}
                style={[styles.optionChip, on && styles.chipOn]}
                onPress={() => void patch({ iceType: m.code })}
              >
                <Text style={[styles.optionText, on && styles.chipTitleOn]}>{m.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>装饰</Text>
        <View style={styles.wrapChips}>
          {options.garnishes.map((m) => {
            const selected = new Set(session.garnishes || []);
            const on = selected.has(m.code);
            return (
              <Pressable
                key={m.code}
                style={[styles.optionChip, on && styles.chipOn]}
                onPress={() => {
                  const next = new Set(selected);
                  if (on) {
                    next.delete(m.code);
                  } else {
                    next.add(m.code);
                  }
                  void patch({ garnishes: [...next] });
                }}
              >
                <Text style={[styles.optionText, on && styles.chipTitleOn]}>{m.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>想要的感觉</Text>
        <TextInput
          style={styles.feelingInput}
          value={feeling}
          onChangeText={setFeeling}
          placeholder="例如：清爽、微苦、适合晚餐"
          placeholderTextColor="#6F675F"
        />

        {analyze ? (
          <View style={styles.analyzeCard}>
            <Text style={styles.analyzeTitle}>
              {analyze.feasible ? '可以成杯' : '需要调整'}
            </Text>
            {analyze.flavorSummary ? (
              <Text style={styles.analyzeFlavor}>{analyze.flavorSummary}</Text>
            ) : null}
            {(analyze.conflicts || []).map((c, i) => (
              <Text
                key={`c-${i}`}
                style={[
                  styles.analyzeLine,
                  c.level === 'error' ? styles.analyzeError : styles.analyzeWarn,
                ]}
              >
                · {c.message}
              </Text>
            ))}
            {(analyze.suggestions || []).map((s, i) => (
              <Text key={`s-${i}`} style={styles.analyzeSuggest}>
                建议：{s}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 4 }]}>
        <Pressable
          style={[styles.secondaryBtn, busy && styles.disabled]}
          disabled={busy || generating}
          onPress={() => void onAnalyze()}
        >
          <Text style={styles.secondaryText}>酒方分析</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryBtn, (busy || generating) && styles.disabled]}
          disabled={busy || generating}
          onPress={() => void onGenerate()}
        >
          {generating ? (
            <ActivityIndicator color="#1C1816" />
          ) : (
            <Text style={styles.primaryText}>生成特调卡片</Text>
          )}
        </Pressable>
      </View>

      {/* 材料选择：图片网格 + 分类 Tab（对齐酒柜） */}
      <Modal visible={pickerVisible} animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 8 }]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>添加材料</Text>
              <Text style={styles.sub}>点选卡片加入调配台</Text>
            </View>
            <Pressable onPress={() => setPickerVisible(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#C4B8AC" />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="sparkles-outline" size={16} color="#8B8178" />
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
              placeholderTextColor="#6F675F"
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
            <ActivityIndicator color="#C9A227" style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={pickerItems}
              keyExtractor={(item) => String(item.id)}
              numColumns={GRID_COLS}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={[
                styles.gridList,
                { paddingBottom: Math.max(insets.bottom, 24) + 16 },
              ]}
              ListEmptyComponent={<Text style={styles.emptyHint}>没有匹配材料</Text>}
              renderItem={({ item }) => {
                const on = selectedIds.has(item.id);
                return (
                  <Pressable
                    style={[styles.gridCard, on && styles.gridCardOn]}
                    onPress={() => void addIngredient(item)}
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
                        <Ionicons name="checkmark" size={14} color="#1C1816" />
                      </View>
                    ) : (
                      <View style={styles.gridAdd}>
                        <Ionicons name="add" size={14} color="#C9A227" />
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>

      {/* 特调卡片 */}
      <Modal visible={cardVisible} animationType="slide" onRequestClose={() => setCardVisible(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 8 }]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{recipe?.name || '特调卡片'}</Text>
              <Text style={styles.sub}>{statusText || '生成中…'}</Text>
            </View>
            <Pressable onPress={() => setCardVisible(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#C4B8AC" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <View style={styles.recipeCard}>
              {imageUrl ? (
                <Image source={{ uri: resolveMediaUrl(imageUrl) }} style={styles.heroImage} />
              ) : (
                <View style={[styles.heroImage, styles.heroPlaceholder]}>
                  {generating ? (
                    <ActivityIndicator color="#C9A227" size="large" />
                  ) : (
                    <Ionicons name="wine-outline" size={42} color="#6F675F" />
                  )}
                  <Text style={styles.heroHint}>
                    {generating ? '配图生成中' : '暂无配图'}
                  </Text>
                </View>
              )}
              <View style={styles.recipeBody}>
                {recipe?.nameEn ? <Text style={styles.en}>{recipe.nameEn}</Text> : null}
                <Text style={styles.meta}>
                  {[recipe?.glass, recipe?.method, recipe?.iceType || recipe?.ice_type]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {(recipe?.flavorSummary || recipe?.flavor_summary) ? (
                  <Text style={styles.flavor}>
                    {recipe?.flavorSummary || recipe?.flavor_summary}
                  </Text>
                ) : null}

                {recipe?.ingredients?.length ? (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>材料</Text>
                    {recipe.ingredients.map((ing, idx) => (
                      <Text key={`ing-${idx}`} style={styles.blockText}>
                        · {ing.name}
                        {ing.amount != null
                          ? ` ${ing.amount}${ing.unit || ''}`
                          : ing.unit
                            ? ` ${ing.unit}`
                            : ''}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {recipe?.steps?.length ? (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>制作步骤</Text>
                    {recipe.steps.map((step, idx) => (
                      <Text key={`step-${idx}`} style={styles.blockText}>
                        {step.order || idx + 1}. {step.text}
                      </Text>
                    ))}
                  </View>
                ) : recipe?.instructions ? (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>制作步骤</Text>
                    <Text style={styles.blockText}>{recipe.instructions}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              style={[styles.primaryBtn, (!recipe || busy || generating) && styles.disabled]}
              disabled={!recipe || busy || generating}
              onPress={() => void onSaveCustom()}
            >
              <Text style={styles.primaryText}>保存到特调</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14110F' },
  center: { alignItems: 'center', justifyContent: 'center' },
  bootText: { color: '#8B8178', marginTop: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  kicker: {
    color: '#C9A227',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { color: '#F4EDE4', fontSize: 28, fontWeight: '700', marginTop: 2 },
  sub: { color: '#8B8178', fontSize: 13, marginTop: 4 },
  resetBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1816',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    color: '#C9A227',
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
    marginRight: 20,
  },
  chipRow: { paddingHorizontal: 16, gap: 10 },
  glassChip: {
    width: 108,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
  },
  chipOn: {
    borderColor: '#C9A227',
    backgroundColor: '#2A2218',
  },
  chipTitle: { color: '#F4EDE4', fontSize: 15, fontWeight: '600' },
  chipTitleOn: { color: '#C9A227' },
  chipMeta: { color: '#8B8178', fontSize: 12, marginTop: 4 },
  capacityCard: {
    marginHorizontal: 20,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
  },
  capacityTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  capacityLabel: { color: '#8B8178', fontSize: 12 },
  capacityValue: { color: '#F4EDE4', fontSize: 13, fontWeight: '600' },
  capacityTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2A2420',
    overflow: 'hidden',
  },
  capacityFill: { height: '100%', borderRadius: 4 },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#C9A227',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addChipText: { color: '#1C1816', fontWeight: '700', fontSize: 13 },
  emptyHint: { color: '#8B8178', marginHorizontal: 20, fontSize: 13 },
  ingRow: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ingThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#0A0908',
  },
  ingThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingName: { color: '#F4EDE4', fontSize: 15, fontWeight: '600' },
  ingUnit: { color: '#8B8178', fontSize: 12, marginTop: 2 },
  amountCtrl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2A2420',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBtnText: { color: '#F4EDE4', fontSize: 16, fontWeight: '700' },
  amountValue: { color: '#C9A227', width: 36, textAlign: 'center', fontWeight: '700' },
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
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
  },
  optionText: { color: '#C4B8AC', fontSize: 13 },
  feelingInput: {
    marginHorizontal: 20,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: '#F4EDE4',
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
  },
  analyzeCard: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#1A1612',
    borderWidth: 1,
    borderColor: '#3A2F24',
  },
  analyzeTitle: { color: '#C9A227', fontSize: 16, fontWeight: '700' },
  analyzeFlavor: { color: '#F4EDE4', marginTop: 8, lineHeight: 20 },
  analyzeLine: { marginTop: 6, fontSize: 13 },
  analyzeError: { color: '#E07070' },
  analyzeWarn: { color: '#D4A84B' },
  analyzeSuggest: { color: '#8B8178', marginTop: 6, fontSize: 12 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2420',
    backgroundColor: '#14110F',
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
  secondaryText: { color: '#F4EDE4', fontWeight: '700' },
  primaryBtn: {
    flex: 1.4,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#C9A227',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#1C1816', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.5 },
  modal: { flex: 1, backgroundColor: '#0E0C0B' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalTitle: { color: '#F4EDE4', fontSize: 22, fontWeight: '700' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1816',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    marginHorizontal: 16,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, color: '#F4EDE4' },
  tabsBlock: { marginTop: 10, marginBottom: 4 },
  primaryTabs: { paddingHorizontal: 16, gap: 18 },
  primaryTab: { paddingBottom: 8 },
  primaryTabText: { color: '#8B8178', fontSize: 15, fontWeight: '600' },
  primaryTabTextActive: { color: '#C9A227' },
  underline: { marginTop: 6, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  underlineActive: { backgroundColor: '#C9A227' },
  secondaryTabs: { paddingHorizontal: 16, gap: 14, paddingTop: 4, paddingBottom: 6 },
  secondaryTab: { paddingBottom: 6 },
  secondaryTabText: { color: '#6F675F', fontSize: 13 },
  secondaryTabTextActive: { color: '#F4EDE4', fontWeight: '600' },
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
    borderColor: '#2A2420',
    padding: 8,
    gap: 4,
  },
  gridCardOn: {
    borderColor: '#C9A227',
    backgroundColor: '#2A2218',
  },
  gridThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#0A0908',
  },
  gridThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridEn: {
    color: '#F4EDE4',
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
    color: '#6F675F',
    fontSize: 10,
  },
  gridCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C9A227',
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
    borderColor: '#C9A227',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
  },
  heroImage: { width: '100%', height: 220, backgroundColor: '#161210' },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroHint: { color: '#8B8178', fontSize: 13 },
  recipeBody: { padding: 16 },
  en: { color: '#8B8178', fontSize: 13 },
  meta: { color: '#A89B90', marginTop: 6, fontSize: 13 },
  flavor: { color: '#F4EDE4', marginTop: 10, lineHeight: 20 },
  block: { marginTop: 16 },
  blockTitle: { color: '#C9A227', fontWeight: '700', marginBottom: 8 },
  blockText: { color: '#C4B8AC', lineHeight: 22, fontSize: 14 },
});

function PickerThumb({ uri }: { uri?: string | null }) {
  const resolved = resolveMediaUrl(uri);
  if (!resolved) {
    return (
      <View style={[styles.gridThumb, styles.gridThumbEmpty]}>
        <Ionicons name="wine-outline" size={28} color="#6F675F" />
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
