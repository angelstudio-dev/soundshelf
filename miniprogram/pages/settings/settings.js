const api = require('../../utils/api');

Page({
  data: { baseUrl: '', username: '', password: '', sources: [], loggedIn: false, message: '' },
  onShow() {
    this.setData({ baseUrl: getApp().globalData.baseUrl, loggedIn: !!getApp().globalData.accessToken });
    if (getApp().globalData.accessToken) this.loadSources();
  },
  onBaseUrl(event) { this.setData({ baseUrl: event.detail.value }); },
  onUsername(event) { this.setData({ username: event.detail.value }); },
  onPassword(event) { this.setData({ password: event.detail.value }); },
  saveBase() {
    getApp().globalData.baseUrl = this.data.baseUrl.replace(/\/$/, '');
    wx.setStorageSync('baseUrl', getApp().globalData.baseUrl);
    wx.showToast({ title: '已保存服务器地址' });
  },
  doLogin() {
    api.login(this.data.username, this.data.password).then(() => {
      this.setData({ loggedIn: true, password: '' });
      wx.showToast({ title: '登录成功' });
      this.loadSources();
    }).catch((error) => this.setData({ message: error.message }));
  },
  loadSources() {
    api.request('/libraries').then((data) => this.setData({ sources: data.sources })).catch(() => undefined);
  },
  sync(event) {
    const id = event.currentTarget.dataset.id;
    wx.showLoading({ title: '同步中' });
    api.request('/libraries/' + id + '/sync', 'POST').then(() => {
      wx.hideLoading();
      wx.showToast({ title: '同步完成' });
      this.loadSources();
    }).catch((error) => { wx.hideLoading(); this.setData({ message: error.message }); });
  },
  logout() {
    getApp().clearTokens();
    this.setData({ loggedIn: false, sources: [] });
    wx.showToast({ title: '已退出' });
  }
});
