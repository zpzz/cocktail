import type {
  CabinetItem,
  CategoryNode,
  IngredientItem,
  MenuRecipe,
} from '@cocktail/shared';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../adapters/apiBase';
import { cabinetService, ingredientService } from '../api';
import { appAlert } from '../components/AppDialog';
import { colors } from '../theme';

type Panel = 'none' | 'add' | 'edit' | 'menu';

const GRID_GAP = 10;
const GRID_PAD = 16;
const GRID_COLS = 3;
const GRID_ITEM_W =
  (Dimensions.get('window').width - GRID_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) /
  GRID_COLS;

export function CabinetScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CabinetItem[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('none');

  const [editing, setEditing] = useState<CabinetItem | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('ml');
  const [editKnown, setEditKnown] = useState(true);

  const [catalogQ, setCatalogQ] = useState('');
  /** 点搜索确认且有关键词后才为 true，用于屏蔽分类 Tab */
  const [catalogSearchActive, setCatalogSearchActive] = useState(false);
  const [catalogCategory, setCatalogCategory] = useState<string | undefined>();
  const [catalogSubCategory, setCatalogSubCategory] = useState<string | undefined>();
  const [catalogItems, setCatalogItems] = useState<IngredientItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [menuRecipes, setMenuRecipes] = useState<MenuRecipe[]>([]);
  const [menuSavedHint, setMenuSavedHint] = useState(false);
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const listReqIdRef = useRef(0);

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    const reqId = ++listReqIdRef.current;
    if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await cabinetService.list({
        q: q.trim() || undefined,
        category,
        page: 1,
        size: 100,
      });
      // 快速切 Tab 时丢掉过期响应，避免「全部」盖住当前分类
      if (reqId !== listReqIdRef.current) {
        return;
      }
      setItems(data.items ?? []);
      setItemCount(data.summary?.itemCount ?? data.total ?? 0);
    } catch (err) {
      if (reqId !== listReqIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : '加载酒柜失败');
    } finally {
      if (reqId === listReqIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [q, category]);

  useEffect(() => {
    void ingredientService
      .categories()
      .then((res) => {
        const list = res.categories ?? [];
        setCategories(list);
        // 默认落在第一个分类（基酒），不要先查「全部」
        setCategory((prev) => prev ?? list[0]?.code);
      })
      .catch(() => setCategories([]))
      .finally(() => setCategoriesReady(true));
  }, []);

  useEffect(() => {
    // 等分类就绪后再拉列表，避免首屏 category 为空打出全部数据
    if (!categoriesReady) {
      return;
    }
    void loadList();
  }, [loadList, categoriesReady]);

  const catalogCategoryNode = useMemo(
    () => categories.find((c) => c.code === catalogCategory),
    [categories, catalogCategory],
  );

  async function openAdd() {
    const first = categories[0]?.code;
    setPanel('add');
    setCatalogQ('');
    setCatalogSearchActive(false);
    setCatalogCategory(first);
    setCatalogSubCategory(undefined);
    setSelectedIds(new Set());
    await searchCatalog('', first, undefined);
  }

  async function searchCatalog(
    keyword: string,
    cat?: string,
    sub?: string,
  ) {
    setCatalogLoading(true);
    try {
      const res = await ingredientService.search({
        q: keyword.trim() || undefined,
        category: cat,
        subCategory: sub,
        page: 1,
        size: 60,
      });
      setCatalogItems(res.items ?? []);
    } catch (err) {
      appAlert('搜索失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setCatalogLoading(false);
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function confirmAdd() {
    if (selectedIds.size === 0) {
      return;
    }
    setBusy(true);
    try {
      const selected = catalogItems.filter((item) => selectedIds.has(item.id));
      await cabinetService.add({
        merge: true,
        items: selected.map((item) => ({
          ingredientId: item.id,
          unit: item.primaryUnit || 'ml',
          quantityKnown: false,
        })),
      });
      setPanel('none');
      await loadList({ silent: true });
    } catch (err) {
      appAlert('添加失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  function openEdit(item: CabinetItem) {
    setEditing(item);
    setEditQty(
      item.quantityKnown && item.quantity != null ? String(item.quantity) : '',
    );
    setEditUnit(item.unit || 'ml');
    setEditKnown(item.quantityKnown);
    setPanel('edit');
  }

  async function saveEdit() {
    if (!editing) {
      return;
    }
    setBusy(true);
    try {
      await cabinetService.update(editing.id, {
        quantity: editKnown && editQty.trim() ? Number(editQty) : null,
        unit: editUnit.trim() || 'ml',
        quantityKnown: editKnown,
      });
      setPanel('none');
      setEditing(null);
      await loadList({ silent: true });
    } catch (err) {
      appAlert('更新失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(item: CabinetItem) {
    appAlert('删除库存', `确定删除「${item.name}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await cabinetService.remove(item.id);
              await loadList({ silent: true });
            } catch (err) {
              appAlert('删除失败', err instanceof Error ? err.message : '请稍后重试');
            }
          })();
        },
      },
    ]);
  }

  async function generateMenu() {
    setBusy(true);
    setError(null);
    try {
      const res = await cabinetService.menu({ limit: 5, diversity: true });
      setMenuRecipes(res.recipes ?? []);
      setMenuSavedHint(Boolean(res.savedMenuId));
      setPanel('menu');
    } catch (err) {
      appAlert('生成酒单失败', err instanceof Error ? err.message : '请确认 AI 服务已启动');
    } finally {
      setBusy(false);
    }
  }

  async function pickAndRecognize(fromCamera: boolean) {
    setPhotoSheetVisible(false);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      appAlert('需要权限', fromCamera ? '请允许使用相机' : '请允许访问相册');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    setBusy(true);
    try {
      const res = await cabinetService.recognize({
        uri: asset.uri,
        name: asset.fileName || 'bottle.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      const hits = res.matched ?? [];
      const keywords = (res.keywords ?? [])
        .map((k) => k.trim())
        .filter(Boolean);
      const unmatched = (res.unmatched ?? []).map((u) => u.rawLabel).filter(Boolean);

      // 识别结果只做筛选：展示模糊匹配候选，不自动勾选，由用户确认
      const candidates: IngredientItem[] = hits.map((h) => ({
        id: h.ingredientId,
        name: h.name,
        nameEn: h.nameEn,
        category: h.category,
        subCategory: h.subCategory,
        imageUrl: h.imageUrl,
      }));
      const kwText = keywords.length > 0 ? keywords.join('、') : '';
      setCatalogQ(kwText);
      setCatalogSearchActive(keywords.length > 0 || candidates.length > 0);
      setCatalogCategory(undefined);
      setCatalogSubCategory(undefined);
      setSelectedIds(new Set());
      setCatalogItems(candidates);
      setPanel('add');

      if (hits.length === 0) {
        appAlert(
          '识别完成',
          unmatched.length > 0
            ? `识别到：${unmatched.join('、')}，但目录中没有匹配材料，可手动搜索添加`
            : '没有识别出可用品牌，请换一张更清晰的酒瓶正面照，或手动搜索添加',
        );
      } else {
        const parts = [
          keywords.length > 0
            ? `识别到「${keywords.join('、')}」`
            : '识别完成',
          `已筛出 ${hits.length} 项候选，请勾选要加入酒柜的材料`,
        ];
        if (unmatched.length > 0) {
          parts.push(`未匹配：${unmatched.join('、')}`);
        }
        appAlert('识别完成', parts.join('\n'));
      }
    } catch (err) {
      appAlert('识别失败', err instanceof Error ? err.message : '请确认 AI 服务已启动并配置千问 VL');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Cabinet</Text>
          <Text style={styles.title}>酒柜</Text>
          <Text style={styles.subtitle}>{itemCount} 款藏酒 · 今晚喝点什么</Text>
        </View>
        <Pressable
          style={styles.addBtn}
          onPress={() => void openAdd()}
          accessibilityLabel="新增库存"
        >
          <Ionicons name="add" size={26} color="#F34B2F" />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="sparkles-outline" size={16} color="#A0A0AA" />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="搜索品牌 / 类别 / 名称"
          placeholderTextColor="#A0A0AA"
          returnKeyType="search"
          onSubmitEditing={() => void loadList()}
        />
      </View>

      <PrimaryTabs
        categories={categories}
        category={category}
        onCategoryChange={setCategory}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.listFlex}>
          <ActivityIndicator style={styles.loader} color="#F34B2F" />
        </View>
      ) : (
        <FlatList
          style={styles.listFlex}
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor="#F34B2F"
              onRefresh={() => {
                setRefreshing(true);
                void loadList({ silent: true });
              }}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>酒柜还是空的，点右上角 + 添加藏酒吧。</Text>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openEdit(item)} onLongPress={() => confirmDelete(item)}>
              <Thumb uri={item.imageUrl} />
              <View style={styles.cardBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.nameEn ? (
                  <Text style={styles.en} numberOfLines={1}>
                    {item.nameEn}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {item.subCategory ? `属于${item.subCategory}` : item.category}
                  {item.quantityKnown && item.quantity != null
                    ? `  ${item.quantity}${item.unit || ''}`
                    : ''}
                </Text>
                <Text style={styles.stock}>
                  {item.stockStatus === 'empty' ? '无货' : '有货'}
                  {item.quantityKnown ? '' : '  余量未知'}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <View style={styles.ctaBar}>
        <Pressable
          style={[styles.ctaBtn, (busy || itemCount === 0) && styles.disabled]}
          disabled={busy || itemCount === 0}
          onPress={() => void generateMenu()}
        >
          <Ionicons name="sparkles" size={18} color={colors.text} />
          <Text style={styles.ctaText}>用库存生成酒单</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      {/* 新增库存 */}
      <Modal visible={panel === 'add'} animationType="slide" onRequestClose={() => setPanel('none')}>
        <View style={[styles.modal, { paddingTop: insets.top + 8 }]}>
          <View style={styles.addHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.addTitle}>新增库存</Text>
              <Text style={styles.addSubtitle}>
                {catalogSearchActive
                  ? '已按识别/搜索结果筛选，请勾选要添加的材料'
                  : '选择要加入家中酒柜的真实品牌'}
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={() => setPanel('none')}>
              <Ionicons name="close" size={22} color="#A0A0AA" />
            </Pressable>
          </View>

          <Pressable style={styles.photoEntry} onPress={() => setPhotoSheetVisible(true)}>
            <Ionicons name="camera-outline" size={22} color="#F34B2F" />
            <View style={{ flex: 1 }}>
              <Text style={styles.photoEntryTitle}>拍照批量添加</Text>
              <Text style={styles.photoEntrySub}>相机或相册，一次识别多种材料</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#A0A0AA" />
          </Pressable>

          <View style={styles.searchWrap}>
            <Ionicons name="sparkles-outline" size={16} color="#A0A0AA" />
            <TextInput
              style={styles.searchInput}
              value={catalogQ}
              onChangeText={(text) => {
                setCatalogQ(text);
                // 清空后恢复 Tab + 按分类浏览
                if (!text.trim()) {
                  setCatalogSearchActive(false);
                  void searchCatalog('', catalogCategory, catalogSubCategory);
                }
              }}
              placeholder="输入品牌、酒款或类型，例如金宾、波本"
              placeholderTextColor="#A0A0AA"
              returnKeyType="search"
              onSubmitEditing={() => {
                const kw = catalogQ.trim();
                if (kw) {
                  setCatalogSearchActive(true);
                  void searchCatalog(kw, undefined, undefined);
                } else {
                  setCatalogSearchActive(false);
                  void searchCatalog('', catalogCategory, catalogSubCategory);
                }
              }}
            />
          </View>

          {!catalogSearchActive ? (
            <CategoryTabs
              categories={categories}
              category={catalogCategory}
              subCategory={catalogSubCategory}
              childrenOf={catalogCategoryNode?.children}
              onCategoryChange={(code) => {
                setCatalogCategory(code);
                setCatalogSubCategory(undefined);
                void searchCatalog('', code, undefined);
              }}
              onSubCategoryChange={(sub) => {
                setCatalogSubCategory(sub);
                void searchCatalog('', catalogCategory, sub);
              }}
            />
          ) : null}

          {catalogLoading ? (
            <ActivityIndicator color="#F34B2F" style={styles.loader} />
          ) : (
            <FlatList
              data={catalogItems}
              keyExtractor={(item) => String(item.id)}
              numColumns={GRID_COLS}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridList}
              ListEmptyComponent={<Text style={styles.empty}>没有匹配材料</Text>}
              renderItem={({ item }) => {
                const on = selectedIds.has(item.id);
                return (
                  <Pressable
                    style={[styles.gridCard, on && styles.cardSelected]}
                    onPress={() => toggleSelect(item.id)}
                  >
                    <Thumb uri={item.imageUrl} grid />
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
                    ) : null}
                  </Pressable>
                );
              }}
            />
          )}

          <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              style={[styles.confirmBtn, selectedIds.size === 0 && styles.disabled]}
              disabled={selectedIds.size === 0 || busy}
              onPress={() => void confirmAdd()}
            >
              <Text style={styles.confirmText}>确认添加 ({selectedIds.size})</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 编辑 */}
      <Modal visible={panel === 'edit'} animationType="fade" transparent onRequestClose={() => setPanel('none')}>
        <View style={styles.sheetMask}>
          <View style={styles.sheet}>
            <Text style={styles.modalTitle}>{editing?.name}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>已知余量</Text>
              <Switch
                value={editKnown}
                onValueChange={setEditKnown}
                trackColor={{ true: '#F34B2F', false: '#303034' }}
              />
            </View>
            {editKnown ? (
              <>
                <Text style={styles.label}>数量</Text>
                <TextInput
                  style={styles.field}
                  value={editQty}
                  onChangeText={setEditQty}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#A0A0AA"
                  placeholder="例如 750"
                />
                <Text style={styles.label}>单位</Text>
                <TextInput
                  style={styles.field}
                  value={editUnit}
                  onChangeText={setEditUnit}
                  placeholderTextColor="#A0A0AA"
                  placeholder="ml"
                />
              </>
            ) : (
              <Text style={styles.meta}>将标记为「余量未知」</Text>
            )}
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  if (editing) {
                    confirmDelete(editing);
                  }
                }}
              >
                <Text style={[styles.secondaryText, styles.danger]}>删除</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => void saveEdit()}>
                <Text style={styles.primaryText}>保存</Text>
              </Pressable>
            </View>
            <Pressable style={styles.closeLink} onPress={() => setPanel('none')}>
              <Text style={styles.secondaryText}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 酒单 */}
      <Modal visible={panel === 'menu'} animationType="slide" onRequestClose={() => setPanel('none')}>
        <View style={[styles.modal, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.modalTitle}>今晚能做什么</Text>
          {menuSavedHint ? (
            <Text style={styles.menuSavedHint}>已保存到「我的 → 酒单」</Text>
          ) : null}
          <FlatList
            data={menuRecipes}
            keyExtractor={(item) => String(item.recipeId)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>暂无推荐，先多加一些库存吧</Text>}
            renderItem={({ item }) => (
              <View style={styles.menuCard}>
                <View style={styles.menuCardTop}>
                  <Thumb uri={item.imageUrl} large />
                  <View style={styles.cardBody}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.nameEn ? <Text style={styles.en}>{item.nameEn}</Text> : null}
                    <Text style={styles.meta}>
                      {[item.category, item.baseSpirit, item.glass, item.method]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Text
                      style={[
                        styles.badge,
                        item.matchType === 'full' ? styles.badgeFull : styles.badgePartial,
                      ]}
                    >
                      {item.matchType === 'full' ? '全匹配' : '有缺料'}
                    </Text>
                    {item.missing && item.missing.length > 0 ? (
                      <Text style={styles.meta}>缺：{item.missing.join('、')}</Text>
                    ) : null}
                  </View>
                </View>
                {item.ingredients && item.ingredients.length > 0 ? (
                  <View style={styles.recipeBlock}>
                    <Text style={styles.recipeBlockTitle}>材料</Text>
                    {item.ingredients.map((ing, idx) => (
                      <Text key={`${item.recipeId}-ing-${idx}`} style={styles.recipeBlockText}>
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
                {item.instructions ? (
                  <View style={styles.recipeBlock}>
                    <Text style={styles.recipeBlockTitle}>做法</Text>
                    <Text style={styles.recipeBlockText}>{item.instructions}</Text>
                  </View>
                ) : null}
              </View>
            )}
          />
          <View style={styles.modalFooter}>
            <Pressable style={styles.primaryBtn} onPress={() => setPanel('none')}>
              <Text style={styles.primaryText}>完成</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 拍照来源：拍摄 / 相册 / 取消 */}
      <Modal
        visible={photoSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoSheetVisible(false)}
      >
        <Pressable style={styles.sheetMask} onPress={() => setPhotoSheetVisible(false)}>
          <View style={[styles.photoSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              style={styles.photoSheetBtn}
              onPress={() => void pickAndRecognize(true)}
            >
              <Text style={styles.photoSheetBtnText}>拍摄</Text>
            </Pressable>
            <View style={styles.photoSheetDivider} />
            <Pressable
              style={styles.photoSheetBtn}
              onPress={() => void pickAndRecognize(false)}
            >
              <Text style={styles.photoSheetBtnText}>从手机相册选择</Text>
            </Pressable>
            <Pressable
              style={[styles.photoSheetBtn, styles.photoSheetCancel]}
              onPress={() => setPhotoSheetVisible(false)}
            >
              <Text style={styles.photoSheetCancelText}>取消</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* 全局 loading：独立 Modal，盖在其它弹层之上 */}
      <Modal
        visible={busy}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.busyOverlay}>
          <ActivityIndicator color="#F34B2F" size="large" />
        </View>
      </Modal>
    </View>
  );
}

/** 酒柜主列表：仅一级分类，无二级 Tab */
function PrimaryTabs({
  categories,
  category,
  onCategoryChange,
}: {
  categories: CategoryNode[];
  category?: string;
  onCategoryChange: (code: string | undefined) => void;
}) {
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
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** 新增库存：一级 + 有子类时显示二级（下划线选中） */
function CategoryTabs({
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

function Thumb({
  uri,
  large,
  grid,
}: {
  uri?: string | null;
  large?: boolean;
  grid?: boolean;
}) {
  const resolved = resolveMediaUrl(uri);
  const style = [
    styles.thumb,
    large && styles.thumbLarge,
    grid && styles.thumbGrid,
    !resolved && styles.thumbEmpty,
  ];
  if (!resolved) {
    return <View style={style} />;
  }
  return <Image source={{ uri: resolved }} style={style} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  kicker: {
    color: '#F34B2F',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#F5F5F5',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 2,
  },
  subtitle: {
    color: '#A0A0AA',
    fontSize: 13,
    marginTop: 4,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1B1B1F',
    borderWidth: 1,
    borderColor: '#303034',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  searchWrap: {
    marginHorizontal: 20,
    marginTop: 14,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#1B1B1F',
    borderWidth: 1,
    borderColor: '#303034',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#F5F5F5',
    fontSize: 15,
    paddingVertical: 0,
  },
  tabsBlock: {
    marginTop: 14,
    gap: 4,
  },
  primaryTabs: {
    paddingHorizontal: 16,
    gap: 18,
    alignItems: 'center',
  },
  primaryTab: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  primaryTabText: {
    color: '#A0A0AA',
    fontSize: 15,
    fontWeight: '500',
  },
  primaryTabTextActive: {
    color: '#F34B2F',
    fontWeight: '700',
  },
  secondaryTabs: {
    paddingHorizontal: 16,
    gap: 18,
    paddingBottom: 4,
  },
  secondaryTab: {
    alignItems: 'center',
    paddingTop: 4,
    minWidth: 36,
  },
  secondaryTabText: {
    color: '#A0A0AA',
    fontSize: 14,
  },
  secondaryTabTextActive: {
    color: '#F34B2F',
    fontWeight: '600',
  },
  underline: {
    marginTop: 6,
    height: 2,
    alignSelf: 'stretch',
    minWidth: 28,
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  underlineActive: {
    backgroundColor: '#F34B2F',
  },
  addHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 12,
  },
  addTitle: {
    color: '#F34B2F',
    fontSize: 28,
    fontWeight: '700',
  },
  addSubtitle: {
    color: '#A0A0AA',
    fontSize: 13,
    marginTop: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#303034',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEntry: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303034',
    backgroundColor: '#161210',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  photoEntryTitle: {
    color: '#F5F5F5',
    fontSize: 15,
    fontWeight: '600',
  },
  photoEntrySub: {
    color: '#A0A0AA',
    fontSize: 12,
    marginTop: 2,
  },
  gridList: {
    paddingHorizontal: GRID_PAD,
    paddingTop: 8,
    paddingBottom: 16,
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
  confirmBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B1B1F',
    borderWidth: 1,
    borderColor: '#5A4578',
  },
  confirmText: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '700',
  },
  listFlex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#161210',
    borderWidth: 1,
    borderColor: '#303034',
  },
  cardSelected: {
    borderColor: '#F34B2F',
  },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: '#111111',
  },
  thumbLarge: {
    width: 96,
    height: 96,
  },
  thumbGrid: {
    width: '100%',
    height: GRID_ITEM_W - 16,
    borderRadius: 8,
  },
  thumbEmpty: {
    borderWidth: 1,
    borderColor: '#303034',
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: '#F5F5F5',
    fontSize: 17,
    fontWeight: '600',
  },
  en: {
    color: '#A0A0AA',
    fontSize: 13,
  },
  meta: {
    color: '#A89B90',
    fontSize: 13,
    marginTop: 2,
  },
  stock: {
    color: '#F34B2F',
    fontSize: 13,
    marginTop: 2,
  },
  link: {
    color: '#F34B2F',
    fontSize: 14,
    fontWeight: '600',
  },
  danger: {
    color: '#E07070',
  },
  empty: {
    color: '#A0A0AA',
    textAlign: 'center',
    marginTop: 48,
    lineHeight: 22,
    paddingHorizontal: 24,
  },
  error: {
    color: '#E07070',
    marginHorizontal: 20,
    marginTop: 8,
  },
  warn: {
    color: '#F34B2F',
    marginHorizontal: 16,
    marginBottom: 8,
    lineHeight: 20,
  },
  loader: {
    marginTop: 40,
  },
  ctaBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  ctaBtn: {
    height: 54,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  ctaText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  busyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,17,15,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    flex: 1,
    backgroundColor: '#111111',
  },
  modalTitle: {
    color: '#F34B2F',
    fontSize: 24,
    fontWeight: '700',
    marginHorizontal: 20,
    marginBottom: 8,
  },
  menuSavedHint: {
    color: '#A0A0AA',
    fontSize: 13,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#303034',
  },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F34B2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#1B1B1F',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#303034',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#A0A0AA',
    fontWeight: '600',
    fontSize: 16,
  },
  closeLink: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  disabled: {
    opacity: 0.45,
  },
  sheetMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#161210',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 8,
  },
  photoSheet: {
    marginHorizontal: 10,
    gap: 8,
  },
  photoSheetBtn: {
    backgroundColor: '#303034',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  photoSheetBtnText: {
    color: '#F34B2F',
    fontSize: 17,
    fontWeight: '600',
  },
  photoSheetDivider: {
    height: 0,
  },
  photoSheetCancel: {
    marginTop: 4,
    backgroundColor: '#1B1B1F',
  },
  photoSheetCancelText: {
    color: '#F5F5F5',
    fontSize: 17,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  label: {
    color: '#A0A0AA',
    fontSize: 13,
    marginTop: 8,
  },
  field: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#F5F5F5',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#303034',
  },
  menuCard: {
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: '#161210',
    borderWidth: 1,
    borderColor: '#303034',
    overflow: 'hidden',
  },
  menuCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
  },
  recipeBlock: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  recipeBlockTitle: {
    color: '#F34B2F',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  recipeBlockText: {
    color: '#A0A0AA',
    fontSize: 13,
    lineHeight: 20,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: '600',
  },
  badgeFull: {
    color: '#1B1B1F',
    backgroundColor: '#F34B2F',
  },
  badgePartial: {
    color: '#F34B2F',
    backgroundColor: '#2A2418',
  },
});
