import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { performSignOut } from '../auth/session';
import type { AppDispatch, RootState } from '../store';
import { SavedCustomsScreen } from './SavedCustomsScreen';
import { SavedMenusScreen } from './SavedMenusScreen';

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch<AppDispatch>();
  const { username, nickname } = useSelector((s: RootState) => s.auth);
  const [busy, setBusy] = useState(false);
  const [menusVisible, setMenusVisible] = useState(false);
  const [customsVisible, setCustomsVisible] = useState(false);

  const displayName = nickname || username || '酒客';
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  async function onLogout() {
    setBusy(true);
    try {
      await performSignOut(dispatch);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>Profile</Text>
          <Text style={styles.title}>我的</Text>
          <Text style={styles.sub}>酒单、特调与账号</Text>
        </View>

        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.identityName}>{displayName}</Text>
            {username ? (
              <Text style={styles.identityMeta}>@{username}</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.sectionLabel}>收藏</Text>

        <Pressable style={styles.menuEntry} onPress={() => setMenusVisible(true)}>
          <View style={styles.menuIcon}>
            <Ionicons name="book-outline" size={20} color="#F34B2F" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuEntryTitle}>酒单</Text>
            <Text style={styles.menuEntrySub}>用库存生成并保存的配方单</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A0A0AA" />
        </Pressable>

        <Pressable style={styles.menuEntry} onPress={() => setCustomsVisible(true)}>
          <View style={styles.menuIcon}>
            <Ionicons name="sparkles-outline" size={20} color="#F34B2F" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuEntryTitle}>特调</Text>
            <Text style={styles.menuEntrySub}>工作台生成的专属配方卡片</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A0A0AA" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={[styles.logout, busy && styles.disabled]}
          onPress={onLogout}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#F5F5F5" />
          ) : (
            <Text style={styles.logoutText}>退出登录</Text>
          )}
        </Pressable>
      </ScrollView>

      <SavedMenusScreen visible={menusVisible} onClose={() => setMenusVisible(false)} />
      <SavedCustomsScreen
        visible={customsVisible}
        onClose={() => setCustomsVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  kicker: {
    color: '#F34B2F',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#F5F5F5',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  sub: {
    color: '#A0A0AA',
    fontSize: 13,
    marginTop: 4,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#1B1B1F',
    borderWidth: 1,
    borderColor: '#303034',
    marginBottom: 28,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#303034',
    borderWidth: 1,
    borderColor: '#F34B2F55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#F34B2F',
    fontSize: 22,
    fontWeight: '700',
  },
  identityName: {
    color: '#F5F5F5',
    fontSize: 17,
    fontWeight: '600',
  },
  identityMeta: {
    color: '#A0A0AA',
    fontSize: 13,
    marginTop: 3,
  },
  sectionLabel: {
    color: '#A0A0AA',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  menuEntry: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#1B1B1F',
    borderWidth: 1,
    borderColor: '#303034',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuEntryTitle: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '600',
  },
  menuEntrySub: {
    color: '#A0A0AA',
    fontSize: 12,
    marginTop: 2,
  },
  logout: {
    marginTop: 28,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#5A4038',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#E07070',
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
