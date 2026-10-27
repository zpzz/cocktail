import type { MenuIngredient, WorkbenchFlavorProfile, WorkbenchRecipe } from '@cocktail/shared';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../adapters/apiBase';
import { colors } from '../theme';
import { axesFromAnalyze, axesToArray } from '../utils/flavorProfile';
import { FlavorRadarChart } from './FlavorRadarChart';

type IngredientThumb = {
  name: string;
  imageUrl?: string | null;
};

type Props = {
  recipe: WorkbenchRecipe | null;
  imageUrl?: string | null;
  generating?: boolean;
  statusText?: string;
  saving?: boolean;
  /** 会话已选材料，用于匹配缩略图 */
  ingredientThumbs?: IngredientThumb[];
  badge?: string;
  /**
   * create：工作台生成后收藏
   * saved：我的特调详情（已收藏，底栏改为删除）
   */
  variant?: 'create' | 'saved';
  onClose: () => void;
  onSave?: () => void;
  onDelete?: () => void;
};

type TabKey = 'ingredients' | 'steps' | 'flavor';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ingredients', label: '配方材料' },
  { key: 'steps', label: '操作步骤' },
  { key: 'flavor', label: '风味解析' },
];

function pickProfile(recipe: WorkbenchRecipe | null): WorkbenchFlavorProfile | null {
  if (!recipe) {
    return null;
  }
  return recipe.flavorProfile ?? recipe.flavor_profile ?? null;
}

function formatAmount(ing: MenuIngredient): string {
  if (ing.amount != null && ing.amount !== undefined) {
    return `${ing.amount}${ing.unit || ''}`;
  }
  return ing.unit || '';
}

function methodDifficulty(method?: string): string {
  switch (method) {
    case 'layer':
      return '进阶';
    case 'shake':
      return '中等';
    case 'stir':
    case 'build':
      return '简单';
    default:
      return '中等';
  }
}

export function RecipeDetailView({
  recipe,
  imageUrl,
  generating = false,
  statusText,
  saving = false,
  ingredientThumbs = [],
  badge = '酒方特调',
  variant = 'create',
  onClose,
  onSave,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('ingredients');
  const isSaved = variant === 'saved';

  const thumbMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of ingredientThumbs) {
      const key = (row.name || '').trim().toLowerCase();
      const uri = resolveMediaUrl(row.imageUrl);
      if (key && uri) {
        map.set(key, uri);
      }
    }
    return map;
  }, [ingredientThumbs]);

  const title = recipe?.name || (generating ? '生成中…' : '特调详情');
  const summary = recipe?.flavorSummary || recipe?.flavor_summary || '';
  const abv = recipe?.abvRange || recipe?.abv_range || '—';
  const difficulty = recipe?.difficulty || methodDifficulty(recipe?.method);
  const taste = recipe?.taste || recipe?.feeling || '—';

  const profileAxes = useMemo(() => {
    const fromAi = axesFromAnalyze(pickProfile(recipe));
    return fromAi ? axesToArray(fromAi) : [];
  }, [recipe]);

  async function onShare() {
    if (!recipe) {
      return;
    }
    const lines = [
      recipe.name,
      recipe.nameEn,
      summary,
      `酒精度 ${abv} · 难度 ${difficulty} · 口感 ${taste}`,
    ].filter(Boolean);
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // ignore cancel
    }
  }

  const heroUri = resolveMediaUrl(imageUrl);
  const canSave = !isSaved && Boolean(recipe) && !generating && !saving;
  const canDelete = isSaved && Boolean(recipe) && Boolean(onDelete) && !saving;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={onClose} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>配方详情</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerBtn}
            onPress={isSaved ? undefined : onSave}
            disabled={isSaved ? true : !canSave}
            hitSlop={8}
          >
            <Ionicons
              name={isSaved ? 'heart' : 'heart-outline'}
              size={20}
              color={isSaved || canSave ? colors.primary : colors.muted}
            />
          </Pressable>
          <Pressable
            style={styles.headerBtn}
            onPress={() => void onShare()}
            disabled={!recipe}
            hitSlop={8}
          >
            <Ionicons
              name="share-outline"
              size={20}
              color={recipe ? colors.text : colors.muted}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {heroUri ? (
            <Image source={{ uri: heroUri }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              {generating ? (
                <ActivityIndicator color={colors.primary} size="large" />
              ) : (
                <Ionicons name="wine-outline" size={48} color={colors.muted} />
              )}
              <Text style={styles.heroHint}>
                {generating ? statusText || '配图生成中…' : '暂无配图'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={2}>
              {title}
            </Text>
            {recipe ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {recipe?.nameEn ? <Text style={styles.nameEn}>{recipe.nameEn}</Text> : null}
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
          {generating && !recipe ? (
            <Text style={styles.summary}>{statusText || '正在创作特调…'}</Text>
          ) : null}

          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>酒精度</Text>
              <Text style={styles.statValue} numberOfLines={1}>
                {abv}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>难度</Text>
              <Text style={styles.statValue} numberOfLines={1}>
                {difficulty}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>口感</Text>
              <Text style={styles.statValue} numberOfLines={1}>
                {taste}
              </Text>
            </View>
          </View>

          <View style={styles.tabBar}>
            {TABS.map((item) => {
              const on = tab === item.key;
              return (
                <Pressable
                  key={item.key}
                  style={styles.tabItem}
                  onPress={() => setTab(item.key)}
                >
                  <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{item.label}</Text>
                  {on ? <View style={styles.tabUnderline} /> : <View style={styles.tabUnderlineGap} />}
                </Pressable>
              );
            })}
          </View>

          {tab === 'ingredients' ? (
            <View style={styles.tabPanel}>
              {(recipe?.ingredients ?? []).length === 0 ? (
                <Text style={styles.emptyHint}>
                  {generating ? '材料整理中…' : '暂无材料'}
                </Text>
              ) : (
                recipe!.ingredients.map((ing, idx) => {
                  const thumb = thumbMap.get((ing.name || '').trim().toLowerCase());
                  return (
                    <View
                      key={`ing-${idx}`}
                      style={[
                        styles.ingRow,
                        idx < recipe!.ingredients.length - 1 && styles.ingRowBorder,
                      ]}
                    >
                      <View style={styles.ingThumb}>
                        {thumb ? (
                          <Image source={{ uri: thumb }} style={styles.ingThumbImg} />
                        ) : (
                          <Ionicons name="wine-outline" size={20} color={colors.muted} />
                        )}
                      </View>
                      <Text style={styles.ingName} numberOfLines={1}>
                        {ing.name}
                      </Text>
                      <Text style={styles.ingAmount}>{formatAmount(ing)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          {tab === 'steps' ? (
            <View style={styles.tabPanel}>
              {(recipe?.steps ?? []).length > 0 ? (
                recipe!.steps.map((step, idx) => (
                  <View key={`step-${idx}`} style={styles.stepRow}>
                    <View style={styles.stepIndex}>
                      <Text style={styles.stepIndexText}>{step.order || idx + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step.text}</Text>
                  </View>
                ))
              ) : recipe?.instructions ? (
                <Text style={styles.stepText}>{recipe.instructions}</Text>
              ) : (
                <Text style={styles.emptyHint}>
                  {generating ? '步骤生成中…' : '暂无步骤'}
                </Text>
              )}
            </View>
          ) : null}

          {tab === 'flavor' ? (
            <View style={styles.tabPanel}>
              {profileAxes.length ? (
                <View style={styles.radarWrap}>
                  <FlavorRadarChart values={profileAxes} size={160} />
                </View>
              ) : null}
              {summary ? (
                <Text style={styles.flavorDesc}>{summary}</Text>
              ) : (
                <Text style={styles.emptyHint}>
                  {generating ? '风味解析生成中…' : '暂无风味解析'}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {isSaved ? (
          <Pressable
            style={[styles.deleteBtn, !canDelete && styles.saveBtnDisabled]}
            disabled={!canDelete}
            onPress={onDelete}
          >
            {saving ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color={colors.text} />
                <Text style={styles.saveBtnText}>删除特调</Text>
              </>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            disabled={!canSave}
            onPress={onSave}
          >
            {saving ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="bookmark-outline" size={18} color={colors.text} />
                <Text style={styles.saveBtnText}>收藏配方</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  hero: {
    width: '100%',
  },
  heroImage: {
    width: '100%',
    height: 260,
    backgroundColor: colors.card,
  },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  heroHint: {
    color: colors.muted,
    fontSize: 13,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  name: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    flexShrink: 1,
  },
  badge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  nameEn: {
    color: colors.muted,
    fontSize: 14,
    marginTop: -4,
  },
  summary: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  statValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  tabLabelOn: {
    color: colors.primary,
  },
  tabUnderline: {
    marginTop: 8,
    height: 3,
    width: 36,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  tabUnderlineGap: {
    marginTop: 8,
    height: 3,
  },
  tabPanel: {
    paddingTop: 8,
    minHeight: 120,
  },
  emptyHint: {
    color: colors.muted,
    fontSize: 13,
    paddingVertical: 16,
    textAlign: 'center',
  },
  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  ingRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ingThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ingThumbImg: {
    width: '100%',
    height: '100%',
  },
  ingName: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  ingAmount: {
    color: colors.muted,
    fontSize: 13,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  stepIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: `${colors.primary}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  radarWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  flavorDesc: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  saveBtn: {
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteBtn: {
    height: 50,
    borderRadius: 999,
    backgroundColor: '#8B3A3A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
