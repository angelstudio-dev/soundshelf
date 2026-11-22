App({
  globalData: {
    baseUrl: wx.getStorageSync('baseUrl') || '',
    accessToken: wx.getStorageSync('accessToken') || '',
    refreshToken: wx.getStorageSync('refreshToken') || '',
    currentBook: null,
    currentChapterIndex: 0
  },
  onLaunch() {
    if (!this.globalData.baseUrl) {
      wx.showModal({
        title: '首次使用',
        content: '请先在「设置」中填写 SoundShelf 服务器地址（HTTPS）',
        showCancel: false
      });
    }
  },
  setTokens(accessToken, refreshToken) {
    this.globalData.accessToken = accessToken;
    this.globalData.refreshToken = refreshToken;
    wx.setStorageSync('accessToken', accessToken);
    wx.setStorageSync('refreshToken', refreshToken);
  },
  clearTokens() {
    this.globalData.accessToken = '';
    this.globalData.refreshToken = '';
    wx.removeStorageSync('accessToken');
    wx.removeStorageSync('refreshToken');
  }
});
