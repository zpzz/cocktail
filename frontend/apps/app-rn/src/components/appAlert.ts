export type AppAlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type AppAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
};

type Listener = (state: AppAlertState) => void;

const DEFAULT_BUTTON: AppAlertButton = { text: '好的', style: 'default' };

let state: AppAlertState = {
  visible: false,
  title: '',
  buttons: [DEFAULT_BUTTON],
};
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) {
    l(state);
  }
}

export function subscribeAppAlert(listener: Listener) {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function hideAppAlert() {
  if (!state.visible) {
    return;
  }
  state = { ...state, visible: false };
  emit();
}

/** 深色主题弹窗，API 对齐 Alert.alert */
export function appAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
) {
  state = {
    visible: true,
    title,
    message,
    buttons: buttons?.length ? buttons : [DEFAULT_BUTTON],
  };
  emit();
}
