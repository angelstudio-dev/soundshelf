const api = require('../../utils/api');
const player = require('../../utils/player');
const fmt = require('../../utils/api');

function longDuration(seconds) {
  const totalMinutes = Math.floor((seconds || 0) / 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

Page({
  data: {
    book: null, chapterCount: 0, tab: 'chapters', length: { hours: 0, minutes: 0 },
    media: { size: 0, bitrate: 0, format: '—', codec: '—', sizeText: '—' }, mediaGroup: 0,
    bookmarks: [], historyByDay: [], menuOpen: false, finishLabel: '标记为已完成'
  },
  onLoad(options) {
    this.bookId = options.id;
    this.load();
  },
  onShow() { if (this.bookId) this.load(); },
  load() {
    api.request('/books/' + this.bookId).then((book) => {
      const length = longDuration(book.duration);
      this.setData({ book, chapterCount: book.chapters.length, length });
      wx.setNavigationBarTitle({ title: book.title });
    }).catch((error) => wx.showToast({ title: error.message, icon: 'none' }));
    api.request('/books/' + this.bookId + '/media').then((media) => {
      media.sizeText = this.formatSize(media.size);
      this.setData({ media });
    }).catch(() => {});
    api.request('/bookmarks?bookId=' + this.bookId).then((d) => this.setData({ bookmarks: d.bookmarks || [] })).catch(() => {});
    api.request('/books/' + this.bookId + '/history').then((d) => {
      const groups = {};
      (d.events || []).forEach((e) => {
        const day = new Date(e.startedAt * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        (groups[day] = groups[day] || []).push(Object.assign({}, e, {
          time: new Date(e.startedAt * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          label: e.kind === 'added' ? '添加到库中' : '收听 ' + Math.round(e.seconds / 60) + ' 分钟'
        }));
      });
      this.setData({ historyByDay: Object.keys(groups).map((day) => ({ day, events: groups[day] })) });
    }).catch(() => {});
  },
  back() { wx.navigateBack(); },
  download() {
    const url = api.mediaUrl ? api.mediaUrl('/books/' + this.bookId + '/stream?download=1') : '';
    if (url) wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '下载链接已复制' }) });
  },
  toggleMedia() { this.setData({ mediaGroup: this.data.mediaGroup === 0 ? 1 : 0 }); },
  setTab(event) { this.setData({ tab: event.currentTarget.dataset.tab, menuOpen: false }); },
  toggleMenu() { this.setData({ menuOpen: !this.data.menuOpen }); },
  play() {
    const book = this.data.book;
    if (!book) return;
    player.play(book, book.progress && !book.progress.finished ? book.progress.position : 0);
    wx.navigateTo({ url: '/pages/player/player' });
  },
  toChapter(event) {
    const book = this.data.book;
    const chapter = book.chapters[event.currentTarget.dataset.index];
    player.play(book, chapter.start);
    wx.navigateTo({ url: '/pages/player/player' });
  },
  toAuthor() {
    const name = this.data.book && this.data.book.author;
    if (name) wx.navigateTo({ url: '/pages/author/author?name=' + encodeURIComponent(name) });
  },
  markFinished() {
    const book = this.data.book;
    api.request('/progress/' + book.id + '/finish', 'POST', { finished: !book.progress?.finished })
      .then(() => { this.setData({ menuOpen: false }); this.load(); })
      .catch((e) => wx.showToast({ title: e.message, icon: 'none' }));
  },
  addToPlaylist() {
    api.request('/playlists', 'POST', { name: '播放清单', bookId: this.bookId })
      .then(() => { this.setData({ menuOpen: false }); wx.showToast({ title: '已添加到播放清单' }); })
      .catch((e) => wx.showToast({ title: e.message, icon: 'none' }));
  },
  formatTime(value) { return fmt.formatTime(value); },
  formatSize(value) {
    if (!value || value <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    const v = value / Math.pow(1024, i);
    return (v >= 10 || i === 0 ? Math.round(v) : v.toFixed(2)) + ' ' + units[i];
  }
});
