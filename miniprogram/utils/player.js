const api = require('./api');

const bg = typeof wx.getBackgroundAudioManager === 'function' ? wx.getBackgroundAudioManager() : null;

function currentBook() { return getApp().globalData.currentBook; }

function trackFor(book, position) {
  const chapter = book.chapters.find((item) => position >= item.start && position < item.start + item.duration) || book.chapters[0];
  const index = chapter ? chapter.trackIndex : 0;
  return { chapter, index, track: book.tracks[index] || book.tracks[0] };
}

function play(book, position, autoplay = true) {
  getApp().globalData.currentBook = book;
  if (!bg) {
    wx.showToast({ title: '当前微信版本不支持后台音频', icon: 'none' });
    return;
  }
  const target = trackFor(book, position || 0);
  getApp().globalData.chapterStart = target.chapter ? target.chapter.start : 0;
  bg.title = book.title;
  bg.singer = book.author || 'SoundShelf';
  bg.coverImgUrl = api.mediaUrl('/assets/cover/' + book.id);
  bg.src = api.mediaUrl('/books/' + book.id + '/stream?track=' + encodeURIComponent(target.track.id));
  bg.currentTime = Math.max(0, (position || 0) - (target.chapter ? target.chapter.start : 0));
  if (autoplay) bg.play();
}

function seek(position) {
  const book = currentBook();
  if (!book || !bg) return;
  const target = trackFor(book, position);
  getApp().globalData.chapterStart = target.chapter ? target.chapter.start : 0;
  const src = api.mediaUrl('/books/' + book.id + '/stream?track=' + encodeURIComponent(target.track.id));
  if (bg.src !== src) {
    getApp().globalData.pendingSeek = Math.max(0, position - (target.chapter ? target.chapter.start : 0));
    bg.src = src;
  } else {
    bg.seek(Math.max(0, position - (target.chapter ? target.chapter.start : 0)));
  }
}

function syncProgress(position) {
  const book = currentBook();
  if (!book) return;
  api.request('/progress/' + book.id, 'PUT', {
    position: Math.round(position), duration: book.duration, playbackSpeed: 1
  }).catch(() => {});
}

module.exports = { bg, play, seek, syncProgress, trackFor, currentBook };
