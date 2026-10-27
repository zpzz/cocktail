import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import {
  hideAppAlert,
  subscribeAppAlert,
  type AppAlertButton,
  type AppAlertState,
} from './appAlert';

export type { AppAlertButton };
export { appAlert } from './appAlert';

function ButtonRow({
  buttons,
  onPress,
}: {
  buttons: AppAlertButton[];
  onPress: (btn: AppAlertButton) => void;
}) {
  const hasCancel = buttons.some((b) => b.style === 'cancel');
  const dual = buttons.length === 2;

  return (
    <View style={[styles.btnRow, dual && styles.btnRowDual]}>
      {buttons.map((btn, i) => {
        const isCancel = btn.style === 'cancel';
        const isDestructive = btn.style === 'destructive';
        const primary = !isCancel && (btn.style === 'default' || isDestructive || !hasCancel);
        return (
          <Pressable
            key={`${btn.text}-${i}`}
            style={[
              styles.btn,
              dual && styles.btnHalf,
              isCancel && styles.btnGhost,
              primary && !isDestructive && styles.btnPrimary,
              isDestructive && styles.btnDestructive,
            ]}
            onPress={() => onPress(btn)}
          >
            <Text
              style={[
                styles.btnText,
                isCancel && styles.btnGhostText,
                (primary || isDestructive) && styles.btnPrimaryText,
              ]}
            >
              {btn.text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 全局深色弹窗宿主：挂在 App 根节点，配合 appAlert() 使用 */
export function AppDialogHost() {
  const [state, setState] = useState<AppAlertState>({
    visible: false,
    title: '',
    buttons: [{ text: '好的' }],
  });

  useEffect(() => subscribeAppAlert(setState), []);

  function handlePress(btn: AppAlertButton) {
    hideAppAlert();
    btn.onPress?.();
  }

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="fade"
      onRequestClose={hideAppAlert}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          <ButtonRow buttons={state.buttons} onPress={handlePress} />
        </View>
      </View>
    </Modal>
  );
}

/** 受控单确认弹窗（局部使用） */
export function AppDialog({
  visible,
  title,
  message,
  confirmText = '好的',
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <ButtonRow
            buttons={[{ text: confirmText, style: 'default' }]}
            onPress={() => onClose()}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
  },
  btnRow: {
    marginTop: 20,
    gap: 10,
  },
  btnRowDual: {
    flexDirection: 'row',
  },
  btn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  btnHalf: {
    flex: 1,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnDestructive: {
    backgroundColor: colors.primary,
  },
  btnGhost: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
  },
  btnGhostText: {
    color: colors.muted,
  },
});
