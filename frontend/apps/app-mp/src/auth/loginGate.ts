/**
 * 登录弹窗闸门。
 * 小程序多入口打包后模块级变量不会跨页面/组件共享，状态挂到 globalThis。
 */

type Listener = (visible: boolean) => void;

type LoginGateState = {
  visible: boolean;
  listeners: Set<Listener>;
  inFlight: Promise<boolean> | null;
  pendingResolve: ((ok: boolean) => void) | null;
};

type GateGlobal = typeof globalThis & {
  __cocktailLoginGate?: LoginGateState;
};

function getGate(): LoginGateState {
  const g = globalThis as GateGlobal;
  if (!g.__cocktailLoginGate) {
    g.__cocktailLoginGate = {
      visible: false,
      listeners: new Set(),
      inFlight: null,
      pendingResolve: null,
    };
  }
  return g.__cocktailLoginGate;
}

function emit(gate: LoginGateState) {
  for (const listener of gate.listeners) {
    try {
      listener(gate.visible);
    } catch {
      // ignore
    }
  }
}

export function subscribeLoginPrompt(listener: Listener): () => void {
  const gate = getGate();
  gate.listeners.add(listener);
  listener(gate.visible);
  return () => {
    gate.listeners.delete(listener);
  };
}

/**
 * 弹出全局「先登录」对话框；多次并发调用合并为一次。
 * 登录成功 → true；暂不登录 → false。
 */
export function openLoginPrompt(): Promise<boolean> {
  const gate = getGate();
  if (gate.inFlight) {
    return gate.inFlight;
  }
  gate.visible = true;
  emit(gate);
  gate.inFlight = new Promise<boolean>((resolve) => {
    gate.pendingResolve = resolve;
  }).finally(() => {
    const g = getGate();
    g.inFlight = null;
    g.pendingResolve = null;
  });
  return gate.inFlight;
}

export function resolveLoginPrompt(ok: boolean) {
  const gate = getGate();
  const resolve = gate.pendingResolve;
  gate.visible = false;
  gate.pendingResolve = null;
  gate.inFlight = null;
  emit(gate);
  resolve?.(ok);
}
