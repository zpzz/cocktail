import { signedIn } from '@cocktail/shared';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDispatch } from 'react-redux';
import { authService } from '../api';
import { savePersistedAuth } from '../auth/storage';
import type { AppDispatch } from '../store';
import { colors } from '../theme';

type Mode = 'login' | 'register';

export function AuthScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const user = username.trim();
    const pass = password;
    if (!user || !pass) {
      setError('请输入用户名和密码');
      return;
    }
    if (mode === 'register' && pass.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        await authService.register({
          username: user,
          password: pass,
          nickname: nickname.trim() || undefined,
        });
      }

      const tokens = await authService.login({ username: user, password: pass });
      const displayName = nickname.trim() || user;
      const session = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        username: user,
        nickname: displayName,
      };
      await savePersistedAuth(session);
      dispatch(signedIn(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>酒方</Text>
        <Text style={styles.brandEn}>JIUFANG</Text>
        <Text style={styles.subtitle}>
          {mode === 'login' ? '登录后开始对话与酒柜管理' : '创建账号，解锁个性化推荐'}
        </Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="用户名"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          {mode === 'register' ? (
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="昵称（可选）"
              placeholderTextColor={colors.muted}
              editable={!busy}
            />
          ) : null}
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="密码"
            placeholderTextColor={colors.muted}
            secureTextEntry
            editable={!busy}
            onSubmitEditing={submit}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            style={[styles.primary, busy && styles.disabled]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.primaryText}>
                {mode === 'login' ? '登录' : '注册并登录'}
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
            disabled={busy}
            style={styles.switch}
          >
            <Text style={styles.switchText}>
              {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  brand: {
    color: colors.primary,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 1,
  },
  brandEn: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 2,
    marginTop: 4,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  form: {
    marginTop: 36,
    gap: 12,
  },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    color: colors.primary,
    fontSize: 14,
  },
  primary: {
    marginTop: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  switch: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchText: {
    color: colors.primary,
    fontSize: 14,
  },
  disabled: {
    opacity: 0.55,
  },
});
