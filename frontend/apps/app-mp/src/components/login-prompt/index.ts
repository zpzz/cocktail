import { resolveLoginPrompt, subscribeLoginPrompt } from '../../auth/loginGate';
import { loginWithWechat } from '../../auth/wechatLogin';

Component({
  data: {
    visible: false,
    busy: false,
  },

  lifetimes: {
    attached() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any)._unsub = subscribeLoginPrompt((visible: boolean) => {
        this.setData({
          visible,
          ...(visible ? {} : { busy: false }),
        });
      });
    },
    detached() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any)._unsub?.();
    },
  },

  methods: {
    noop() {},

    onSkip() {
      resolveLoginPrompt(false);
    },

    async onLogin() {
      if (this.data.busy) {
        return;
      }
      this.setData({ busy: true });
      try {
        const ok = await loginWithWechat({
          showLoading: false,
          interactive: true,
          force: true,
        });
        if (ok) {
          resolveLoginPrompt(true);
        }
      } finally {
        this.setData({ busy: false });
      }
    },
  },
});
