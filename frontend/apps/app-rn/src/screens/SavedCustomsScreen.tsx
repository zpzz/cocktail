import type { CustomDetail, CustomSummary } from '@cocktail/shared';
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
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../adapters/apiBase';
import { customService } from '../api';

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
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SavedCustomsScreen({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<CustomSummary[]>([]);
  const [detail, setDetail] = useState<CustomDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    try {
      setItems((await customService.list()) ?? []);
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
      setDetail(await customService.detail(id));
    } catch (err) {
      Alert.alert('加载失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setDetailLoading(false);
    }
  }

  function confirmDelete(item: CustomSummary) {
    Alert.alert('删除特调', `确定删除「${item.name}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await customService.remove(item.id);
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
            <Text style={styles.title}>特调</Text>
            <Text style={styles.sub}>工作台生成的专属配方卡片</Text>
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
                    <Ionicons name="wine-outline" size={26} color="#6F675F" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  {item.nameEn ? <Text style={styles.en}>{item.nameEn}</Text> : null}
                  <Text style={styles.meta}>
                    {[item.glass, item.method, formatTime(item.createdAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {item.flavorSummary ? (
                    <Text style={styles.flavor} numberOfLines={2}>
                      {item.flavorSummary}
                    </Text>
                  ) : null}
                </View>
                <Pressable hitSlop={10} onPress={() => confirmDelete(item)}>
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
        <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{detail?.name || '特调详情'}</Text>
              {detail ? (
                <Text style={styles.sub}>{formatTime(detail.createdAt)}</Text>
              ) : null}
            </View>
            <Pressable style={styles.closeBtn} onPress={() => setDetail(null)}>
              <Ionicons name="close" size={22} color="#C4B8AC" />
            </Pressable>
          </View>

          {detailLoading || !detail ? (
            <ActivityIndicator color="#C9A227" style={{ marginTop: 40 }} />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              <View style={styles.detailCard}>
                {detail.imageUrl ? (
                  <Image
                    source={{ uri: resolveMediaUrl(detail.imageUrl) }}
                    style={styles.hero}
                  />
                ) : (
                  <View style={[styles.hero, styles.thumbEmpty]}>
                    <Ionicons name="wine-outline" size={40} color="#6F675F" />
                  </View>
                )}
                <View style={{ padding: 16 }}>
                  {detail.nameEn ? <Text style={styles.en}>{detail.nameEn}</Text> : null}
                  <Text style={styles.meta}>
                    {[detail.glass, detail.method, detail.iceType]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {detail.flavorSummary ? (
                    <Text style={styles.flavor}>{detail.flavorSummary}</Text>
                  ) : null}

                  {detail.ingredients?.length ? (
                    <View style={styles.block}>
                      <Text style={styles.blockTitle}>材料</Text>
                      {detail.ingredients.map((ing, idx) => (
                        <Text key={`ing-${idx}`} style={styles.blockText}>
                          · {ing.name}
                          {ing.amount != null
                            ? ` ${ing.amount}${ing.unit || ''}`
                            : ''}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  {detail.steps?.length ? (
                    <View style={styles.block}>
                      <Text style={styles.blockTitle}>制作步骤</Text>
                      {detail.steps.map((step, idx) => (
                        <Text key={`step-${idx}`} style={styles.blockText}>
                          {step.order || idx + 1}. {step.text}
                        </Text>
                      ))}
                    </View>
                  ) : detail.instructions ? (
                    <View style={styles.block}>
                      <Text style={styles.blockTitle}>制作步骤</Text>
                      <Text style={styles.blockText}>{detail.instructions}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E0C0B' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { color: '#F4EDE4', fontSize: 22, fontWeight: '700' },
  sub: { color: '#8B8178', fontSize: 13, marginTop: 4 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1816',
  },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { color: '#8B8178', textAlign: 'center', marginTop: 48 },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
    alignItems: 'center',
  },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#161210' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#F4EDE4', fontSize: 16, fontWeight: '700' },
  en: { color: '#8B8178', fontSize: 12, marginTop: 2 },
  meta: { color: '#A89B90', fontSize: 12, marginTop: 6 },
  flavor: { color: '#C4B8AC', fontSize: 12, marginTop: 6, lineHeight: 18 },
  detailCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
  },
  hero: { width: '100%', height: 220, backgroundColor: '#161210' },
  block: { marginTop: 16 },
  blockTitle: { color: '#C9A227', fontWeight: '700', marginBottom: 8 },
  blockText: { color: '#C4B8AC', lineHeight: 22, fontSize: 14 },
});
