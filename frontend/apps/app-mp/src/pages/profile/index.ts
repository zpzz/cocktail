import { signedIn } from '@cocktail/shared';
import { resolveAssetUrl } from '../../adapters/apiBase';
import { authService } from '../../api';
import { performSignOut } from '../../auth/session';
import { openLoginPrompt } from '../../auth/loginGate';
import { savePersistedAuth } from '../../auth/storage';
import { store } from '../../store';
import { requireAuth } from '../../utils/nav';

Page({
  data: {
    loggedIn: false,
    displayName: '游客',
    subtitle: '登录后同步酒柜与酒单',
    avatarUrl: '',
    initial: '?',
    busy: false,
    editing: false,
    draftNickname: '',
    draftAvatar: '',
  },

  onShow() {
    this.syncIdentity();
  },

  syncIdentity() {
    const { accessToken, nickname, avatarUrl } = store.getState().auth;
    if (!accessToken) {
      this.setData({
        loggedIn: false,
        displayName: '游客',
        subtitle: '登录后同步酒柜与酒单',
        avatarUrl: '',
        initial: '?',
        editing: false,
      });
      return;
    }
    const displayName = nickname || '微信用户';
    const hasProfile =
      !!avatarUrl && !!nickname && nickname.trim() !== '' && nickname !== '微信用户';
    this.setData({
      loggedIn: true,
      displayName,
      subtitle: hasProfile ? '微信已登录 · 点击可修改资料' : '点击上方完善头像与昵称',
      avatarUrl: resolveAssetUrl(avatarUrl) || '',
      initial: displayName.trim().charAt(0) || '?',
      draftNickname: displayName === '微信用户' ? '' : displayName,
      draftAvatar: avatarUrl || '',
    });
  },

  async goMenus() {
    if (!(await requireAuth())) {
      return;
    }
    this.syncIdentity();
    wx.navigateTo({ url: '/pages/menus/index' });
  },

  async goCustoms() {
    if (!(await requireAuth())) {
      return;
    }
    this.syncIdentity();
    wx.navigateTo({ url: '/pages/customs/index' });
  },

  startEdit() {
    if (!this.data.loggedIn) {
      return;
    }
    this.setData({ editing: true });
  },

  onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    const avatarUrl = e.detail?.avatarUrl || '';
    if (avatarUrl) {
      this.setData({ draftAvatar: avatarUrl, avatarUrl });
    }
  },

  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ draftNickname: e.detail.value || '' });
  },

  async saveProfile() {
    const nickname = this.data.draftNickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }
    this.setData({ busy: true });
    try {
      let avatarUrl = store.getState().auth.avatarUrl || null;
      const draftAvatar = this.data.draftAvatar;
      if (draftAvatar && !/^https?:\/\//i.test(draftAvatar) && !draftAvatar.startsWith('/api/')) {
        const uploaded = await authService.uploadAvatar({
          uri: draftAvatar,
          name: 'avatar.jpg',
          type: 'image/jpeg',
        });
        avatarUrl = uploaded.avatarUrl || avatarUrl;
      }
      const user = await authService.updateProfile({ nickname, avatarUrl: avatarUrl || undefined });
      const auth = store.getState().auth;
      const session = {
        accessToken: auth.accessToken!,
        refreshToken: auth.refreshToken!,
        username: user.username || auth.username || 'wx_user',
        nickname: user.nickname || nickname,
        avatarUrl: user.avatarUrl ?? avatarUrl,
      };
      await savePersistedAuth(session);
      store.dispatch(signedIn(session));
      this.setData({ editing: false });
      this.syncIdentity();
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      wx.showToast({
        title: err instanceof Error ? err.message.slice(0, 40) : '保存失败',
        icon: 'none',
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  async onWechatLogin() {
    this.setData({ busy: true });
    try {
      const ok = await openLoginPrompt();
      this.syncIdentity();
      if (ok) {
        this.setData({ editing: true });
      }
    } finally {
      this.setData({ busy: false });
    }
  },

  async onLogout() {
    this.setData({ busy: true });
    try {
      await performSignOut(store.dispatch);
      this.syncIdentity();
      wx.showToast({ title: '已退出', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },
});
