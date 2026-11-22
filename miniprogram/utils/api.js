function config() {
  return getApp().globalData;
}

function refresh() {
  const app = config();
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.baseUrl + '/api/auth/refresh',
      method: 'POST',
      data: { refreshToken: app.refreshToken },
      header: { 'content-type': 'application/json' },
      success(res) {
        if (res.statusCode === 200) {
          getApp().setTokens(res.data.accessToken, res.data.refreshToken);
          resolve(true);
        } else reject(new Error('登录已过期'));
      },
      fail: reject
    });
  });
}

function request(path, method = 'GET', data, retry = true) {
  const app = config();
  if (!app.baseUrl) return Promise.reject(new Error('请先设置服务器地址'));
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.baseUrl + '/api' + path,
      method,
      data,
      header: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + app.accessToken
      },
      success(res) {
        if (res.statusCode === 401 && retry && app.refreshToken) {
          refresh().then(() => request(path, method, data, false)).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error(res.data?.error?.message || ('请求失败 ' + res.statusCode)));
      },
      fail(err) { reject(new Error(err.errMsg || '网络连接失败')); }
    });
  });
}

function login(username, password) {
  const app = config();
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.baseUrl + '/api/auth/login',
      method: 'POST',
      data: { username, password },
      header: { 'content-type': 'application/json' },
      success(res) {
        if (res.statusCode === 200) {
          getApp().setTokens(res.data.accessToken, res.data.refreshToken);
          resolve(res.data.user);
        } else reject(new Error(res.data?.error?.message || '登录失败'));
      },
      fail: reject
    });
  });
}

function mediaUrl(path) {
  const app = config();
  const separator = path.includes('?') ? '&' : '?';
  return app.baseUrl + '/api' + path + separator + 'access_token=' + encodeURIComponent(app.accessToken);
}

function formatTime(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
    : m + ':' + String(s).padStart(2, '0');
}

module.exports = { request, login, mediaUrl, formatTime, refresh };
