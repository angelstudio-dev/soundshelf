const api = require('../../utils/api');
const player = require('../../utils/player');
const format = require('../../utils/api');

Page({
  data: { book: null, chapterCount: 0 },
  onLoad(options) {
    api.request('/books/' + options.id).then((book) => {
      this.setData({ book, chapterCount: book.chapters.length });
      wx.setNavigationBarTitle({ title: book.title });
    }).catch((error) => wx.showToast({ title: error.message, icon: 'none' }));
  },
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
  formatTime(value) { return format.formatTime(value); }
});
