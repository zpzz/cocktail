import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import {
  createChatMessage,
  createThreadId,
  reduceAssistantMessage,
  type ChatMessage,
} from '@cocktail/shared';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../adapters/apiBase';
import { chatService } from '../api';
import { colors } from '../theme';

const LOGO = require('../../assets/images/jiufang-logo.png');

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: '告诉我你的口味偏好，我可以帮你查经典配方、推荐特调，或结合你的酒柜给建议。',
};

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation();
  const threadId = useMemo(() => createThreadId(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function send() {
    const message = draft.trim();
    if (!message || sending) {
      return;
    }
    const userMessage = createChatMessage('user', message);
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage = createChatMessage('assistant', '', assistantId);
    assistantMessage.status = '正在检索配方…';
    setDraft('');
    setSending(true);
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await chatService.stream(
        {
          threadId,
          message,
          attachCabinet: true,
        },
        (event) => {
          if (event.type === 'error') {
            throw new Error(event.message);
          }
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantId ? reduceAssistantMessage(item, event) : item,
            ),
          );
        },
        controller.signal,
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : '对话失败';
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantId
            ? { ...item, error: text, status: undefined, imageLoading: false }
            : item,
        ),
      );
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>AI 问答</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        ref={listRef}
        style={styles.chatArea}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => <Bubble message={item} />}
      />

      <KeyboardStickyView offset={{ closed: 0, opened: tabBarHeight }}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="请输入你的问题…"
            placeholderTextColor={colors.muted}
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={send}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="发送"
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendDisabled]}
            onPress={send}
            disabled={!draft.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Ionicons name="send" size={18} color={colors.text} />
            )}
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userBody}>{message.text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.botRow}>
      <Image source={LOGO} style={styles.botAvatar} />
      <View style={styles.botBubble}>
        {message.sources && message.sources.length > 0 ? (
          <View style={styles.sources}>
            <Text style={styles.sourceLabel}>
              {message.sourceRole === 'reference' ? '参考配方' : '库内配方'}
            </Text>
            {message.sources.map((source) => (
              <Text key={source.id} style={styles.sourceChip}>
                {source.name}
              </Text>
            ))}
          </View>
        ) : null}
        {(message.images ?? []).map((image) =>
          image.url ? (
            <Image
              key={image.url}
              source={{ uri: resolveMediaUrl(image.url) }}
              style={styles.photo}
              resizeMode="cover"
            />
          ) : null,
        )}
        {message.generatedImageUrl ? (
          <Image
            source={{ uri: resolveMediaUrl(message.generatedImageUrl) }}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : null}
        {message.imageLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.status}>正在生成特调配图…</Text>
          </View>
        ) : null}
        {message.status && !message.text ? (
          <Text style={styles.status}>{message.status}</Text>
        ) : null}
        {message.text ? <Text style={styles.botBody}>{message.text}</Text> : null}
        {message.imageError ? <Text style={styles.meta}>{message.imageError}</Text> : null}
        {message.error ? <Text style={styles.error}>{message.error}</Text> : null}
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 36,
  },
  chatArea: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  userBubble: {
    maxWidth: '88%',
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 12,
    backgroundColor: colors.primary,
  },
  userBody: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  botRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: '96%',
  },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginTop: 2,
  },
  botBubble: {
    flex: 1,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 12,
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  botBody: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  status: {
    color: colors.muted,
    fontSize: 14,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
  error: {
    color: colors.primary,
    fontSize: 14,
  },
  sources: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  sourceLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  sourceChip: {
    color: colors.accent,
    fontSize: 12,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photo: {
    width: '100%',
    maxWidth: 220,
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.45,
  },
});
