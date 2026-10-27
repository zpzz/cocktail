import { signedIn } from '@cocktail/shared';
import { authService } from '../../api';
import { bumpAuthEpoch } from '../../auth/session';
import { savePersistedAuth } from '../../auth/storage';
import { store } from '../../store';

Page({
  data: {
    mode: 'login' as 'login' | 'register',
    username: '',
    password: '',
    nickname: '',
    busy: false,
    error: '',
  },

  onUsername(e: WechatMiniprogram.Input) {
    this.setData({ username: e.detail.value });
  },

  onPassword(e: WechatMiniprogram.Input) {
    this.setData({ password: e.detail.value });
  },

  onNickname(e: WechatMiniprogram.Input) {
    this.setData({ nickname: e.detail.value });
  },

  toggleMode() {
    if (this.data.busy) {
      return;
    }
    this.setData({
      mode: this.data.mode === 'login' ? 'register' : 'login',
      error: '',
    });
  },

  async submit() {
    const user = this.data.username.trim();
    const pass = this.data.password;
    if (!user || !pass) {
      this.setData({ error: '请输入用户名和密码' });
      return;
    }
    if (this.data.mode === 'register' && pass.length < 6) {
      this.setData({ error: '密码至少 6 位' });
      return;
    }

    this.setData({ busy: true, error: '' });
    try {
      if (this.data.mode === 'register') {
        await authService.register({
          username: user,
          password: pass,
          nickname: this.data.nickname.trim() || undefined,
        });
      }
      const tokens = await authService.login({ username: user, password: pass });
      const displayName = this.data.nickname.trim() || user;
      const session = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        username: user,
        nickname: displayName,
      };
      await savePersistedAuth(session);
      bumpAuthEpoch();
      store.dispatch(signedIn(session));
      wx.reLaunch({ url: '/pages/home/index' });
    } catch (err) {
      this.setData({
        error: err instanceof Error ? err.message : '登录失败',
      });
    } finally {
      this.setData({ busy: false });
    }
  },
});
