// 3時44分 — バージョン / 更新履歴
window.SANJI44_VERSION = 'v0.2.1';
window.SANJI44_CHANGELOG = [
  {
    v: 'v0.2.1',
    date: '2026-09-07',
    notes: [
      'エンドの演出を強化。結末ごとに専用のカットシーン（のぞき穴＝子どもの顔が突進＋ストロボ、うずくまる＝闇が這って沈黙のあと白い手、朝＝冷たい光と一瞬の影、おかえり＝金色の光と手をつなぐ影）。',
      'BADエンドの画面は赤く歪み、本文がフリッカーしながら出る。',
    ],
  },
  {
    v: 'v0.2.0',
    date: '2026-09-07',
    notes: [
      'マップ拡張：部屋の外に出られるように。廊下・居間・お母さんの部屋・玄関を追加（調べもの25箇所以上）。',
      '3時44分の対決は「いる場所」で分岐。玄関以外なら「音のする方へ行く／動かない」を選ぶ。',
      '真相の手がかりが家族写真・仏壇・弟の写真など複数ルートに。',
      '描画を軽量化：シーンをキャッシュして毎フレームの再描画をやめ、重い合成処理・getImageData・filter:blur を廃止。解像度上限も調整。後半でも重くならないように。',
    ],
  },
  {
    v: 'v0.1.1',
    date: '2026-09-07',
    notes: [
      '調べもの画面のレイアウト崩れを修正（全画面canvasのCSSが調べもの画像にも効いて潰れていた）。',
      '調べもの画像を表示サイズに合わせて描画するように変更（にじみ解消）。',
    ],
  },
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
