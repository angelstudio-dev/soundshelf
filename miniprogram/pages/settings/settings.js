const api = require('../../utils/api');

Page({
  data: {
    baseUrl: '', username: '', password: '', sources: [], loggedIn: false, message: '',
    plexStep: 'idle', plexSession: null, plexServers: [], plexBaseUrl: '',
    plexToken: '', plexLibraries: []
  },
  pollTimer: null,

  onShow() {
    this.setData({ baseUrl: getApp().globalData.baseUrl, loggedIn: !!getApp().globalData.accessToken });
    if (getApp().globalData.accessToken) this.loadSources();
  },
  onHide() { this.clearPoll(); },
  onUnload() { this.clearPoll(); },
  clearPoll() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
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
    this.clearPoll();
    this.setData({ loggedIn: false, sources: [], plexStep: 'idle' });
    wx.showToast({ title: '已退出' });
  },

  startPlexLogin() {
    this.setData({ plexStep: 'pin', plexSession: null, message: '正在获取 Plex 登录码…' });
    api.request('/plex/oauth/start', 'POST').then((data) => {
      this.setData({ plexSession: data, message: '' });
      this.clearPoll();
      this.pollTimer = setInterval(() => this.checkPlexPin(), 3000);
    }).catch((error) => {
      this.setData({ plexStep: 'idle', message: error.message });
    });
  },
  checkPlexPin() {
    const session = this.data.plexSession;
    if (!session) return;
    api.request('/plex/oauth/check?pinId=' + encodeURIComponent(session.pinId)).then((status) => {
      if (status.status === 'complete') {
        this.clearPoll();
        const first = status.servers.find((item) => item.reachable && item.baseUrl) || status.servers[0];
        this.setData({
          plexStep: 'servers', plexToken: status.token, plexServers: status.servers,
          plexBaseUrl: first ? first.baseUrl : '', message: ''
        });
        wx.showToast({ title: '授权成功' });
      } else if (status.status === 'expired') {
        this.clearPoll();
        this.setData({ plexStep: 'idle', message: '登录码已过期，请重新发起' });
      }
    }).catch(() => undefined);
  },
  copyAuthUrl() {
    const session = this.data.plexSession;
    if (!session) return;
    wx.setClipboardData({ data: session.authUrl });
  },
  cancelPlexLogin() {
    this.clearPoll();
    this.setData({ plexStep: 'idle', plexSession: null });
  },
  selectPlexServer(event) {
    this.setData({ plexBaseUrl: event.currentTarget.dataset.url || '' });
  },
  onPlexBaseUrl(event) { this.setData({ plexBaseUrl: event.detail.value }); },
  probePlexLibraries() {
    const baseUrl = this.data.plexBaseUrl.replace(/\/$/, '');
    if (!baseUrl) { this.setData({ message: '请选择或填写服务器地址' }); return; }
    wx.showLoading({ title: '读取资料库' });
    api.request('/libraries/probe', 'POST', {
      type: 'plex', baseUrl, token: this.data.plexToken
    }).then((data) => {
      wx.hideLoading();
      const libraries = (data.libraries || []).map((lib) => ({ ...lib, selected: true }));
      this.setData({ plexBaseUrl: baseUrl, plexLibraries: libraries, plexStep: 'libraries', message: '' });
    }).catch((error) => {
      wx.hideLoading();
      this.setData({ message: error.message });
    });
  },
  togglePlexLibrary(event) {
    const key = event.currentTarget.dataset.key;
    const libraries = this.data.plexLibraries.map((lib) =>
      lib.key === key ? { ...lib, selected: !lib.selected } : lib
    );
    this.setData({ plexLibraries: libraries });
  },
  savePlexServer() {
    const libraryIds = this.data.plexLibraries.filter((lib) => lib.selected).map((lib) => lib.key);
    wx.showLoading({ title: '保存中' });
    api.request('/libraries', 'POST', {
      type: 'plex', name: 'Plex', baseUrl: this.data.plexBaseUrl,
      token: this.data.plexToken, libraryIds
    }).then(() => {
      wx.hideLoading();
      this.setData({
        plexStep: 'idle', plexSession: null, plexServers: [], plexBaseUrl: '',
        plexToken: '', plexLibraries: [], message: ''
      });
      wx.showToast({ title: '服务器已添加' });
      this.loadSources();
    }).catch((error) => {
      wx.hideLoading();
      this.setData({ message: error.message });
    });
  }
});
