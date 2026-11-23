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
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(normalizePayload(res.data));
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

/** 服务端返回的封面是 `/api/assets/cover/...` 相对地址，小程序需要补全域名 */
function assetUrl(path) {
  const app = config();
  if (!path) return '';
  if (/^(https?:|data:)/.test(path)) return path;
  return app.baseUrl + path;
}

/** 递归把响应里的相对封面地址补成绝对地址 */
function normalizePayload(node) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) normalizePayload(node[i]);
    return node;
  }
  if (node && typeof node === 'object') {
    if (typeof node.coverUrl === 'string' && node.coverUrl) node.coverUrl = assetUrl(node.coverUrl);
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i += 1) {
      const value = node[keys[i]];
      if (value && typeof value === 'object') normalizePayload(value);
    }
  }
  return node;
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

module.exports = { request, login, mediaUrl, assetUrl, formatTime, refresh };
