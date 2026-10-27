/**
 * 微信隐私协议：chooseAvatar / nickname 等能力必须先同意隐私指引。
 * 后台需声明「收集你的昵称、头像」，见 mp.weixin.qq.com → 设置 → 服务内容声明。
 */
export function setupPrivacyAuthorization() {
  if (typeof wx.onNeedPrivacyAuthorization !== 'function') {
    return;
  }
  wx.onNeedPrivacyAuthorization((resolve) => {
    wx.showModal({
      title: '用户隐私保护提示',
      content:
        '登录需使用你的微信头像与昵称，用于展示个人资料。请阅读并同意《用户隐私保护指引》后继续。',
      confirmText: '同意',
      cancelText: '拒绝',
      success: (res) => {
        if (res.confirm) {
          resolve({ event: 'agree', buttonId: 'agree-privacy' });
        } else {
          resolve({ event: 'disagree' });
        }
      },
      fail: () => resolve({ event: 'disagree' }),
    });
  });
}
