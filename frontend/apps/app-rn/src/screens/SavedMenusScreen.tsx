import type { MenuRecipe, SavedMenuDetail, SavedMenuSummary } from '@cocktail/shared';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../adapters/apiBase';
import { menuService } from '../api';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function formatTime(iso?: string) {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}月${day}日 ${hh}:${mm}`;
}

export function SavedMenusScreen({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<SavedMenuSummary[]>([]);
  const [detail, setDetail] = useState<SavedMenuDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    try {
      const list = await menuService.list();
      setItems(list ?? []);
    } catch (err) {
      Alert.alert('加载失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      void loadList();
    } else {
      setDetail(null);
    }
  }, [visible, loadList]);

  async function openDetail(id: number) {
    setDetailLoading(true);
    try {
      const data = await menuService.detail(id);
      setDetail(data);
    } catch (err) {
      Alert.alert('加载失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setDetailLoading(false);
    }
  }

  function confirmDelete(item: SavedMenuSummary) {
    Alert.alert('删除酒单', `确定删除「${item.title}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await menuService.remove(item.id);
              if (detail?.id === item.id) {
                setDetail(null);
              }
              await loadList({ silent: true });
            } catch (err) {
              Alert.alert('删除失败', err instanceof Error ? err.message : '请稍后重试');
            }
          })();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>酒单</Text>
            <Text style={styles.sub}>用库存生成的酒单会自动保存在这里</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="#C4B8AC" />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#C9A227" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor="#C9A227"
                onRefresh={() => {
                  setRefreshing(true);
                  void loadList({ silent: true });
                }}
              />
            }
            ListEmptyComponent={<Text style={styles.empty}>还没有酒单，去酒柜点「用库存生成酒单」吧</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => void openDetail(item.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowMeta}>
                    {item.recipeCount} 款配方 · {formatTime(item.createdAt)}
                  </Text>
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={() => confirmDelete(item)}
                  style={styles.deleteIcon}
                >
                  <Ionicons name="trash-outline" size={18} color="#E07070" />
                </Pressable>
                <Ionicons name="chevron-forward" size={18} color="#6F675F" />
              </Pressable>
            )}
          />
        )}
      </View>

      <Modal
        visible={detail != null || detailLoading}
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{detail?.title || '酒单详情'}</Text>
              {detail ? (
                <Text style={styles.sub}>
                  {detail.recipeCount} 款 · {formatTime(detail.createdAt)}
                </Text>
              ) : null}
            </View>
            <Pressable style={styles.closeBtn} onPress={() => setDetail(null)}>
              <Ionicons name="close" size={22} color="#C4B8AC" />
            </Pressable>
          </View>

          {detailLoading || !detail ? (
            <ActivityIndicator color="#C9A227" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={detail.recipes}
              keyExtractor={(item, index) => `${item.recipeId}-${index}`}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => <RecipeCard item={item} />}
            />
          )}
        </View>
      </Modal>
    </Modal>
  );
}

function RecipeCard({ item }: { item: MenuRecipe }) {
  const uri = resolveMediaUrl(item.imageUrl);
  return (
    <View style={styles.menuCard}>
      <View style={styles.card}>
        {uri ? (
          <Image source={{ uri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="wine-outline" size={28} color="#6F675F" />
          </View>
        )}
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
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E0C0B',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: {
    color: '#F4EDE4',
    fontSize: 22,
    fontWeight: '700',
  },
  sub: {
    color: '#8B8178',
    fontSize: 13,
    marginTop: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1816',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  empty: {
    color: '#8B8178',
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1816',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2420',
  },
  rowTitle: {
    color: '#F4EDE4',
    fontSize: 16,
    fontWeight: '600',
  },
  rowMeta: {
    color: '#8B8178',
    fontSize: 12,
    marginTop: 4,
  },
  deleteIcon: {
    marginRight: 8,
    padding: 4,
  },
  menuCard: {
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    padding: 12,
  },
  recipeBlock: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  recipeBlockTitle: {
    color: '#C9A227',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  recipeBlockText: {
    color: '#C4B8AC',
    fontSize: 13,
    lineHeight: 20,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#2A2420',
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    color: '#F4EDE4',
    fontSize: 16,
    fontWeight: '600',
  },
  en: {
    color: '#8B8178',
    fontSize: 12,
    marginTop: 2,
  },
  meta: {
    color: '#A89B90',
    fontSize: 12,
    marginTop: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '600',
  },
  badgeFull: {
    color: '#1C1816',
    backgroundColor: '#C9A227',
  },
  badgePartial: {
    color: '#F4EDE4',
    backgroundColor: '#5A4038',
  },
});
