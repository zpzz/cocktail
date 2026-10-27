import type { RecipeSummary } from '@cocktail/shared';
import { recipeMetaLine } from '@cocktail/shared';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../adapters/apiBase';
import { recipeService } from '../api';
import type { HomeStackParamList } from '../navigation/HomeStack';
import type { RootTabParamList } from '../navigation/RootNavigator';
import { colors } from '../theme';

const LOGO = require('../../assets/images/jiufang-logo.png');

const QUICK_ENTRIES: {
  key: string;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  tab?: keyof RootTabParamList;
  openChat?: boolean;
}[] = [
  { key: 'chat', title: 'AI 问答', sub: '鸡尾酒知识库', icon: 'chatbubble-ellipses-outline', openChat: true },
  {
    key: 'workbench',
    title: '调配工作台',
    sub: '材料 → 配方',
    icon: 'flask-outline',
    tab: 'Workbench',
  },
  {
    key: 'cabinet',
    title: '酒柜管理',
    sub: '我的酒柜',
    icon: 'wine-outline',
    tab: 'Cabinet',
  },
  { key: 'more', title: '更多', sub: '敬请期待', icon: 'grid-outline' },
];

type HomeNav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>,
  BottomTabNavigationProp<RootTabParamList>
>;

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<HomeNav>();
  const [recipe, setRecipe] = useState<RecipeSummary | null>(null);
  const [loadingReco, setLoadingReco] = useState(true);

  const loadRecommend = useCallback(async () => {
    setLoadingReco(true);
    try {
      const next = await recipeService.random(true);
      setRecipe(next);
    } catch {
      setRecipe(null);
    } finally {
      setLoadingReco(false);
    }
  }, []);

  useEffect(() => {
    void loadRecommend();
  }, [loadRecommend]);

  const imageUri = useMemo(() => resolveMediaUrl(recipe?.imageUrl), [recipe?.imageUrl]);

  function openChat() {
    navigation.navigate('Chat');
  }

  function onQuickEntry(entry: (typeof QUICK_ENTRIES)[number]) {
    if (entry.openChat) {
      openChat();
      return;
    }
    if (entry.tab) {
      navigation.navigate(entry.tab);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <HomeHeader />

      <View style={styles.body}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>AI 为你调一杯{'\n'}专属鸡尾酒</Text>
            <Text style={styles.heroSub}>
              告诉我你的口味偏好，让 AI 为你推荐最适合的配方
            </Text>
            <Pressable style={styles.heroCta} onPress={openChat}>
              <Text style={styles.heroCtaText}>开始对话</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.heroArt}>
            <Ionicons name="wine" size={56} color={colors.primary} style={{ opacity: 0.85 }} />
          </View>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>今日推荐</Text>
          <Pressable onPress={() => void loadRecommend()} hitSlop={8}>
            <Text style={styles.sectionMore}>换一杯</Text>
          </Pressable>
        </View>

        <View style={styles.recoCard}>
          {loadingReco ? (
            <View style={styles.recoLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <>
              <View style={styles.recoThumb}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.recoImage} resizeMode="cover" />
                ) : (
                  <Ionicons name="wine-outline" size={28} color={colors.accent} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.recoTitleRow}>
                  <Text style={styles.recoName} numberOfLines={1}>
                    {recipe?.nameEn || recipe?.name || '暂无推荐'}
                  </Text>
                  {recipe ? (
                    <View style={styles.recoTag}>
                      <Text style={styles.recoTagText}>热门</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.recoMeta} numberOfLines={2}>
                  {recipe ? recipeMetaLine(recipe) : '稍后再试，或点击「换一杯」'}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.quickGrid}>
          <View style={styles.quickRow}>
            {QUICK_ENTRIES.slice(0, 2).map((entry) => (
              <Pressable
                key={entry.key}
                style={[styles.quickCard, entry.key === 'more' && styles.quickCardMuted]}
                onPress={() => onQuickEntry(entry)}
                disabled={entry.key === 'more'}
              >
                <Ionicons name={entry.icon} size={22} color={colors.primary} />
                <Text style={styles.quickTitle}>{entry.title}</Text>
                <Text style={styles.quickSub}>{entry.sub}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.quickRow}>
            {QUICK_ENTRIES.slice(2).map((entry) => (
              <Pressable
                key={entry.key}
                style={[styles.quickCard, entry.key === 'more' && styles.quickCardMuted]}
                onPress={() => onQuickEntry(entry)}
                disabled={entry.key === 'more'}
              >
                <Ionicons name={entry.icon} size={22} color={colors.primary} />
                <Text style={styles.quickTitle}>{entry.title}</Text>
                <Text style={styles.quickSub}>{entry.sub}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function HomeHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Image source={LOGO} style={styles.logo} />
        <View>
          <Text style={styles.brandCn}>酒方</Text>
          <Text style={styles.brandEn}>JIUFANG</Text>
        </View>
      </View>
      <View style={styles.headerActions}>
        <Pressable style={styles.headerIconBtn} hitSlop={8}>
          <Ionicons name="search-outline" size={20} color={colors.text} />
        </Pressable>
        <Pressable style={styles.headerIconBtn} hitSlop={8}>
          <Ionicons name="notifications-outline" size={20} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 14,
  },
  brandCn: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  brandEn: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    minHeight: 148,
    flexDirection: 'row',
  },
  heroGlow: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary,
    opacity: 0.12,
  },
  heroBody: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    gap: 8,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  heroSub: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  heroCta: {
    alignSelf: 'flex-start',
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  heroCtaText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  heroArt: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionMore: {
    color: colors.muted,
    fontSize: 13,
  },
  recoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 132,
  },
  recoLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },
  recoThumb: {
    width: 100,
    height: 100,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  recoImage: {
    width: '100%',
    height: '100%',
  },
  recoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recoName: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  recoTag: {
    backgroundColor: `${colors.primary}33`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  recoTagText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  recoMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  quickGrid: {
    flex: 1,
    gap: 10,
    minHeight: 180,
  },
  quickRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  quickCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
    justifyContent: 'center',
  },
  quickCardMuted: {
    opacity: 0.55,
  },
  quickTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  quickSub: {
    color: colors.muted,
    fontSize: 11,
  },
});
