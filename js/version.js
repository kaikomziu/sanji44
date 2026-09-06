// 3時44分 — バージョン / 更新履歴
window.SANJI44_VERSION = 'v0.1.0';
window.SANJI44_CHANGELOG = [
  {
    v: 'v0.1.0',
    date: '2026-09-07',
    notes: [
      '初版。1晩で完結する一人称の部屋探索ホラー。',
      '4方向の壁・24箇所以上の調べもの・日記4枚・窓の人影・鏡・押し入れ。',
      '行動するたび時計が進み、3時44分に「その時間」が訪れる。',
      'エンド3種（正常 / 真実 / 逃げ）。',
      'テスト用URLパラメータ: ?3:40 で開始時刻を指定、?test でデバッグ操作、?unlock で即解錠。',
    ],
  },
];

(function () {
  function render() {
    var el = document.getElementById('version-badge');
    if (el) el.textContent = window.SANJI44_VERSION;
    var log = document.getElementById('changelog-body');
    if (log) {
      log.innerHTML = window.SANJI44_CHANGELOG.map(function (e) {
        return (
          '<div class="cl-entry"><h4>' + e.v + ' <span>' + e.date + '</span></h4><ul>' +
          e.notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') +
          '</ul></div>'
        );
      }).join('');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
