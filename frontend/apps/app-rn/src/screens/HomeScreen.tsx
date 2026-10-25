import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  createChatMessage,
  createThreadId,
  reduceAssistantMessage,
  type ChatMessage,
} from '@cocktail/shared';
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
import { resolveMediaUrl } from '../adapters/apiBase';
import { chatService } from '../api';

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: '可以说「莫吉托怎么做」查库，「推荐两杯利口酒」，或「帮我定制一杯朗姆特调」。闲聊也可以，比如「你是谁」。',
};

export function HomeScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const sessionId = useMemo(() => createThreadId(), []);
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
        { sessionId, message },
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
    <View style={styles.root}>
      <FlatList
        ref={listRef}
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
            placeholder="输入问题，回车发送"
            placeholderTextColor="#8B8178"
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={send}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="发送"
            style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
            onPress={send}
            disabled={!draft.trim() || sending}
          >
            <Text style={styles.sendText}>{sending ? '…' : '发送'}</Text>
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
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
          <ActivityIndicator color="#C9A227" />
          <Text style={styles.status}>正在生成特调配图…</Text>
        </View>
      ) : null}
      {message.status && !message.text ? (
        <Text style={styles.status}>{message.status}</Text>
      ) : null}
      {message.text ? (
        <Text style={[styles.body, isUser && styles.userBody]}>{message.text}</Text>
      ) : null}
      {message.imageError ? <Text style={styles.meta}>{message.imageError}</Text> : null}
      {message.error ? <Text style={styles.error}>{message.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#14110F',
  },
  list: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#C9A227',
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#1C1816',
    borderWidth: 1,
    borderColor: '#2A2420',
  },
  body: {
    color: '#F4EDE4',
    fontSize: 16,
    lineHeight: 24,
  },
  userBody: {
    color: '#1C1816',
  },
  status: {
    color: '#C4B8AC',
    fontSize: 14,
  },
  meta: {
    color: '#8B8178',
    fontSize: 13,
  },
  error: {
    color: '#E07070',
    fontSize: 14,
  },
  sources: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  sourceLabel: {
    color: '#8B8178',
    fontSize: 12,
  },
  sourceChip: {
    color: '#C9A227',
    fontSize: 12,
    backgroundColor: '#2A2420',
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photo: {
    width: 220,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#2A2420',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2420',
    backgroundColor: '#1C1816',
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#F4EDE4',
    backgroundColor: '#14110F',
  },
  send: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#C9A227',
  },
  sendDisabled: {
    opacity: 0.45,
  },
  sendText: {
    color: '#1C1816',
    fontWeight: '600',
  },
});
