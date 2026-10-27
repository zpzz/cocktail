import type { CustomDetail, CustomSummary } from '@cocktail/shared';
import { customDetailToRecipe, formatShortDateTime } from '@cocktail/shared';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { customService } from '../api';
import { appAlert } from '../components/AppDialog';
import { RecipeDetailView } from '../components/RecipeDetailView';
import { colors } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SavedCustomsScreen({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<CustomSummary[]>([]);
  const [detail, setDetail] = useState<CustomDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    try {
      setItems((await customService.list()) ?? []);
    } catch (err) {
      appAlert('加载失败', err instanceof Error ? err.message : '请稍后重试');
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
      setDetail(await customService.detail(id));
    } catch (err) {
      appAlert('加载失败', err instanceof Error ? err.message : '请稍后重试');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function doDelete(item: { id: number; name: string }, fromDetail = false) {
    setDeleting(true);
    try {
      if (fromDetail) {
        setDetail(null);
      }
      await customService.remove(item.id);
      if (detail?.id === item.id) {
        setDetail(null);
      }
      await loadList({ silent: true });
    } catch (err) {
      appAlert('删除失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setDeleting(false);
    }
  }

  function confirmDelete(item: { id: number; name: string }, fromDetail = false) {
    if (fromDetail) {
      setDetail(null);
    }
    appAlert('删除特调', `确定删除「${item.name}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => void doDelete(item, false),
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>特调</Text>
            <Text style={styles.sub}>工作台生成的专属配方卡片</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={colors.primary}
                onRefresh={() => {
                  setRefreshing(true);
                  void loadList({ silent: true });
                }}
              />
            }
            ListEmptyComponent={
              <Text style={styles.empty}>还没有特调，去工作台调制一杯吧</Text>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => void openDetail(item.id)}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: resolveMediaUrl(item.imageUrl) }}
                    style={styles.thumb}
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="wine-outline" size={26} color={colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  {item.nameEn ? <Text style={styles.en}>{item.nameEn}</Text> : null}
                  <Text style={styles.meta}>
                    {[item.glass, item.method, formatShortDateTime(item.createdAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {item.flavorSummary ? (
                    <Text style={styles.flavor} numberOfLines={2}>
                      {item.flavorSummary}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    confirmDelete(item);
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#E07070" />
                </Pressable>
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
        {detailLoading && !detail ? (
          <View style={[styles.root, styles.detailLoading]}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>加载配方详情…</Text>
            <Pressable style={styles.closeBtn} onPress={() => setDetail(null)}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
        ) : detail ? (
          <RecipeDetailView
            variant="saved"
            recipe={customDetailToRecipe(detail)}
            imageUrl={detail.imageUrl}
            saving={deleting}
            ingredientThumbs={(detail.ingredients ?? []).map((ing) => ({
              name: ing.name,
              imageUrl: (ing as { imageUrl?: string | null }).imageUrl,
            }))}
            onClose={() => setDetail(null)}
            onDelete={() => confirmDelete({ id: detail.id, name: detail.name }, true)}
          />
        ) : null}
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 4 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 48 },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  en: { color: colors.muted, fontSize: 12, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 6 },
  flavor: { color: colors.muted, fontSize: 12, marginTop: 6, lineHeight: 18 },
  detailLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: colors.muted, fontSize: 13 },
});
