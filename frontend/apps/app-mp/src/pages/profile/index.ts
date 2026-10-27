import { performSignOut } from '../../auth/session';
import { store } from '../../store';
import { requireAuth } from '../../utils/nav';

Page({
  data: {
    displayName: '酒客',
    username: '',
    initial: '?',
    busy: false,
  },

  async onShow() {
    if (!(await requireAuth())) {
      return;
    }
    const { username, nickname } = store.getState().auth;
    const displayName = nickname || username || '酒客';
    this.setData({
      displayName,
      username: username || '',
      initial: displayName.trim().charAt(0).toUpperCase() || '?',
    });
  },

  goMenus() {
    wx.navigateTo({ url: '/pages/menus/index' });
  },

  goCustoms() {
    wx.navigateTo({ url: '/pages/customs/index' });
  },

  async onLogout() {
    this.setData({ busy: true });
    try {
      await performSignOut(store.dispatch);
    } finally {
      this.setData({ busy: false });
    }
  },
});
