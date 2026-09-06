/* 3時44分 — game */
(function () {
  'use strict';
  var VW = 1600, VH = 1000;
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var insArt = document.getElementById('ins-art');
  var insAx = insArt.getContext('2d');

  // ---------- state ----------
  var S = null;
  function freshState() {
    return {
      view: 'bd_n',       // viewId（家全体で一意）
      clock: 60,          // 分（22:00 起点）。60 = 23:00
      hour: false,
      ended: false,
      lightsOn: false,
      lampsOn: false,
      flags: new Set(),
      seen: new Set(),    // 調べたことのある hotspot
      idleAcc: 0,
      t: 0,
      milestone: 0,
      panelOpen: false,
      hotspots: [],
      hoverId: null,
      moving: false,
    };
  }
  function curLoc() { return window.ART.locOf(S.view); }

  // ---------- url params ----------
  var Q = location.search.toLowerCase();
  var TESTUI = /(\?|&)test\b/.test(Q);
  var FAST = /(\?|&)fast\b/.test(Q);
  var IDLE_MS = FAST ? 450 : 3000;
  function parseStartClock() {
    var m = Q.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var h = +m[1], mm = +m[2];
    var total = h * 60 + mm;           // 分（0:00 起点）
    var c = total >= 1320 ? total - 1320 : total + 120; // 22:00 起点へ
    return Math.max(0, Math.min(343, c));
  }
  var START_CLOCK = parseStartClock();

  // ---------- audio ----------
  var AU = { ctx: null, master: null, drone: null, on: false };
  function initAudio() {
    if (AU.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    AU.ctx = new AC();
    AU.master = AU.ctx.createGain();
    AU.master.gain.value = 0.0;
    AU.master.connect(AU.ctx.destination);
    // drone
    var g = AU.ctx.createGain(); g.gain.value = 0.0; g.connect(AU.master);
    var lp = AU.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.connect(g);
    [55, 55.35, 82.5].forEach(function (f) {
      var o = AU.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      var og = AU.ctx.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(lp); o.start();
    });
    var lfo = AU.ctx.createOscillator(); lfo.frequency.value = 0.07;
    var lg = AU.ctx.createGain(); lg.gain.value = 60; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    // noise room tone
    var nb = AU.ctx.createBuffer(1, AU.ctx.sampleRate * 2, AU.ctx.sampleRate);
    var d = nb.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    var ns = AU.ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    var nf = AU.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 500; nf.Q.value = 0.6;
    var ng = AU.ctx.createGain(); ng.gain.value = 0.015;
    ns.connect(nf); nf.connect(ng); ng.connect(AU.master); ns.start();
    AU.drone = g;
    AU.on = true;
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!AU.on) return;
    var o = AU.ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    var g = AU.ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(AU.master);
    var n = AU.ctx.currentTime;
    g.gain.linearRampToValueAtTime(vol || 0.2, n + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, n + dur);
    o.start(n); o.stop(n + dur + 0.05);
  }
  function noiseBurst(dur, vol) {
    if (!AU.on) return;
    var b = AU.ctx.createBuffer(1, AU.ctx.sampleRate * dur, AU.ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    var s = AU.ctx.createBufferSource(); s.buffer = b;
    var g = AU.ctx.createGain(); g.gain.value = vol || 0.3;
    var f = AU.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 300;
    s.connect(f); f.connect(g); g.connect(AU.master); s.start();
  }
  function knock() { tone(70, 0.16, 'sine', 0.5, 40); setTimeout(function () { noiseBurst(0.05, 0.12); }, 4); }
  function uiClick() { tone(180, 0.05, 'triangle', 0.12, 120); }
  function footstep() {
    tone(58, 0.1, 'sine', 0.22, 42);
    setTimeout(function () { noiseBurst(0.04, 0.06); }, 6);
    setTimeout(function () { tone(54, 0.09, 'sine', 0.16, 40); }, 150);
  }
  function heartbeat() { tone(46, 0.14, 'sine', 0.42, 30); setTimeout(function () { tone(44, 0.12, 'sine', 0.3, 28); }, 150); }
  function whisper() {
    if (!AU.on) return;
    var b = AU.ctx.createBuffer(1, AU.ctx.sampleRate * 1.4, AU.ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) {
      var env = Math.sin(Math.PI * i / d.length);
      d[i] = (Math.random() * 2 - 1) * env * 0.5;
    }
    var s = AU.ctx.createBufferSource(); s.buffer = b;
    var f = AU.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 4;
    var lfo = AU.ctx.createOscillator(); lfo.frequency.value = 6;
    var lg = AU.ctx.createGain(); lg.gain.value = 400; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    var g = AU.ctx.createGain(); g.gain.value = 0.25;
    s.connect(f); f.connect(g); g.connect(AU.master); s.start(); lfo.stop(AU.ctx.currentTime + 1.4);
  }

  // ---------- time helpers ----------
  function corruption() { return Math.max(0, Math.min(1, (S.clock - 130) / (344 - 130))); }
  function figureState() { return S.clock >= 235 ? 2 : S.clock >= 95 ? 1 : 0; }
  function reflection() {
    if (!S.flags.has('_mirrorInspected')) return 0;
    return S.clock >= 300 ? 2 : S.clock >= 175 ? 1 : 0;
  }
  function clockHM() {
    var total = 1320 + S.clock;
    return { h: Math.floor(total / 60) % 24, m: total % 60 };
  }
  function fmtClock() {
    var x = clockHM();
    return String(x.h).padStart(2, '0') + ':' + String(x.m).padStart(2, '0');
  }
  function understanding() {
    var keys = ['diary1', 'diary2', 'diary3', 'diary4', 'figure', 'mirror', 'closet'];
    return keys.reduce(function (n, k) { return n + (S.flags.has(k) ? 1 : 0); }, 0);
  }

  function advance(mins) {
    if (S.hour || S.ended) return;
    S.clock = Math.min(344, S.clock + mins);
    checkMilestones();
    if (S.clock >= 344) enterHour();
  }
  function checkMilestones() {
    var m = [
      [120, 'この部屋の 空気は、あの夜から 動いていない。'],
      [200, 'ドアの ほうで、木が きしむ 音。まだ、時間じゃない。'],
      [300, 'もうすぐ 3時44分。指先が 冷たい。'],
    ];
    for (var i = 0; i < m.length; i++) {
      if (S.clock >= m[i][0] && S.milestone < m[i][0]) {
        S.milestone = m[i][0];
        say(m[i][1]);
      }
    }
  }
  var _knockTok = 0;
  function enterHour() {
    S.hour = true;
    closePanel();
    say('3時44分。\n——玄関の扉を、たたく音。', 6000);
    var seq = 0, tok = ++_knockTok;
    (function kn() {
      if (!S || S.ended || !S.hour || tok !== _knockTok) return;
      knock(); seq++;
      setTimeout(kn, (seq % 3 === 0) ? 3800 : 620);
    })();
    setTimeout(updateHourPrompt, 1600);
  }

  // ---------- 3:44 の対決（いる場所で分岐） ----------
  var hpEl = document.getElementById('hourprompt');
  var hpChoices = document.getElementById('hp-choices');
  function updateHourPrompt() {
    if (!S || !S.hour || S.ended) { hpEl.classList.remove('show'); return; }
    if (curLoc() === 'genkan') {
      hpEl.classList.remove('show');
      if (!S.panelOpen) openFrontDoor();
    } else {
      hpEl.classList.add('show');
      hpChoices.innerHTML = '';
      [['音のする方へ 行く', function () { hpEl.classList.remove('show'); goTo('gk_door'); }],
       ['その場から 動かない', function () { hpEl.classList.remove('show'); ending('bad_wait'); }]
      ].forEach(function (c) {
        var b = document.createElement('button');
        b.className = 'choice'; b.textContent = c[0];
        b.onclick = function () { uiClick(); c[1](); };
        hpChoices.appendChild(b);
      });
    }
  }
  function openFrontDoor() {
    if (S.ended || S.panelOpen) return;
    S.seen.add('front_door');
    S.panelOpen = true;
    insEl.classList.add('show');
    renderEntry({
      title: '3時44分 — 玄関の扉',
      text: 'ノックが 続いている。すぐ そこに、いる。\nどうする。',
      choices: [
        { label: '扉を 開ける', do: function () { ending(understanding() >= 5 ? 'true' : 'normal'); } },
        { label: 'のぞき穴から 見る', do: function () { ending('bad_peep'); } },
        { label: '開けずに、うずくまる', do: function () { ending('bad_wait'); } },
      ],
    });
  }

  // ---------- narration ----------
  var subEl = document.getElementById('subtitle');
  var sayTimer = null;
  function say(txt, hold) {
    subEl.textContent = txt;
    subEl.classList.add('show');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { subEl.classList.remove('show'); }, hold || 4600);
  }

  // ---------- content ----------
  // entry: {title, text, art?, note?, choices?:[{label, do:fn -> optional new entry}]}
  var C = {};
  function note(id, lines, flag, story) {
    C[id] = function () {
      if (flag) S.flags.add(flag);
      if (story) S.flags.add(story);
      return { title: 'メモ', note: lines };
    };
  }

  C.window_out = function () {
    var f = figureState();
    if (f === 0) return { title: '窓の外', art: 'window_out', text: '街灯の下には 誰もいない。道の むこうを、ときどき 車のライトが よぎるだけ。' };
    if (f === 1) return { title: '窓の外', art: 'window_out', text: '街灯の下に、誰か 立っている。こちらを 見上げている……気がする。ずっと、動かない。' };
    S.flags.add('figure');
    return { title: '窓の外', art: 'window_out', text: 'さっきより 近い。窓の 真下に いる。背は、低い。子どもくらい。\n顔は 見えない。ただ、待っている。' };
  };
  note('window_latch', ['窓の鍵は 開いている。', '弟は いつも ここから、兄の車の', 'ライトを 見張っていた。']);
  C.curtain = function () { return { title: 'カーテン', text: 'レースの カーテンが、かすかに 揺れている。\n窓は、閉まっているのに。' }; };
  C.desk_drawerL = function () {
    S.flags.add('diary1');
    return { title: '日記（一）', note: ['きょうも おにいちゃんは かえってこなかった。', 'おかあさんは もう ねなさいって いうけど、', 'げんかんの おとが したら すぐ おきる。', 'まっててあげるって やくそくしたから。'] };
  };
  C.desk_drawerR = function () {
    if (!S.flags.has('smallKey')) return { title: '引き出し', text: '鍵が かかっている。小さな、丸い 鍵穴。' };
    S.flags.add('deskR');
    return { title: '引き出し', note: ['兄の家の 合鍵。', '弟が ずっと 握りしめていたのか、', '金属が、手の 形に すり減っている。'] };
  };
  C.desk_papers = function () { return { title: '机の上', text: '小学校の 宿題。日付は どれも、途中で 止まっている。' }; };
  C.desk_drawing = function () { return { title: 'らくがき', text: 'クレヨンの 絵。手を つないだ 二人。\n片方に 「にい」。もう片方は、黒く 塗りつぶされている。' }; };
  C.desk_lamp = function () { S.lampsOn = !S.lampsOn; uiClick(); return { title: 'デスクライト', text: S.lampsOn ? '明かりを つけた。手もとだけが、あたたかい。' : '明かりを 消した。' }; };
  C.under_desk = function () {
    S.flags.add('underDesk');
    return { title: '机の下', text: '毛布が 丸めて 押しこんである。\nここで 眠っていたらしい。窓を 見張りながら。' };
  };

  C.pillow = function () {
    if (!S.flags.has('_photoRevealed')) { S.flags.add('_photoRevealed'); return { title: 'まくら', text: 'まくらは 冷たい。長いあいだ、きちんと 使われていない。\n——下に、写真が 一枚 はさまっている。' }; }
    return { title: 'まくら', text: '冷たい まくら。もう、めくるものは ない。' };
  };
  C.photo = function () {
    if (!S.flags.has('_photoRevealed')) return { title: '写真', text: 'まくらの 下を 見ないと、まだ 気づかない。' };
    S.flags.add('photo');
    return { title: '写真', art: 'photo', text: '家族の 写真。夏。三人 写っている。\nいちばん 右——兄の 顔だけが、赤いペンで 消されている。' };
  };
  C.under_bed = function () {
    return {
      title: 'ベッドの下', text: '靴箱が ある。ひもで、固く 結んである。',
      choices: [{ label: 'ひもを ほどく', do: function () {
        S.flags.add('diary2'); S.flags.add('boxOpened');
        return { title: '日記（二）', note: ['よる、へんな おとが する。3時44分。', 'かならず その じかん。', 'ドアの ところで、コン、コン、コンって。', 'あけたけど、だれも いなかった。'] };
      } }]
    };
  };
  C.sheets = function () { advanceIfStuck(); return { title: 'シーツ', text: 'シーツを めくる。しみ ひとつ ない。\n誰も、本当には 眠っていない。' }; };
  C.ns_lamp = function () { S.lampsOn = !S.lampsOn; uiClick(); return { title: 'ナイトスタンド', text: S.lampsOn ? '明かりを つけた。' : '明かりを 消した。' }; };
  C.ns_drawer = function () {
    S.flags.add('diary3'); S.flags.add('watch');
    return { title: '日記（三）', note: ['とけいが とまった。3時44分で とまった。', 'なおしてって おかあさんに いったら、', 'おかあさんが ないた。', 'どうして ぼくの とけいで ないの。'] };
  };
  C.digital_clock = function () {
    var msg = S.clock < 200 ? 'まだ、来ない。' : S.clock < 320 ? '近づいている。' : 'もう、すぐだ。';
    return { title: '目ざまし時計', art: 'digital_clock', text: fmtClock() + '\n\n' + msg };
  };
  C.poster = function () {
    return {
      title: 'ポスター', text: '古い バンドの ポスター。右上の 角が、すこし 剥がれている。',
      choices: [{ label: 'めくる', do: function () {
        S.flags.add('posterPeel');
        return { title: 'ポスターの 裏', text: '壁いっぱいに 「正」の字。数えきれない。\n最後の 一画は 書かれず、ただ 「44」と 走り書き。' };
      } }]
    };
  };
  C.bed_head = function () { return { title: 'ヘッドボード', text: '木の 内側に、小さく 彫ってある。\n——「にいちゃん おそい」' }; };

  C.peephole = function () {
    if (S.hour) { ending('bad_peep'); return null; }
    var c = corruption();
    return { title: 'のぞき穴', text: c < 0.5 ? '廊下は 真っ暗で、何も 見えない。' : '廊下の 奥に、白い ものが ある。\n近づいて くる——いや、気のせいだ。たぶん。' };
  };
  C.jacket = function () { return { title: '上着', text: '玄関に あるはずの 上着が、この部屋の フックに かかっている。\nあの夜、兄が 着ていた もの。' }; };
  C.switch = function () {
    S.lightsOn = !S.lightsOn; uiClick();
    return { title: '電気', text: S.lightsOn ? '部屋の 電気を つけた。明るくなった。\n——けれど、気配は 消えない。' : '電気を 消した。' };
  };
  C.calendar = function () { return { title: 'カレンダー', text: '何ヶ月も バツ印。\nひとつの 日付だけ、赤い丸——「兄 かえってくる？」' }; };
  C.mirror = function () {
    S.flags.add('_mirrorInspected');
    var r = reflection();
    if (r === 0) return { title: '姿見', art: 'mirror', text: '暗くて、自分の 輪郭が ぼんやり 映るだけ。' };
    if (r === 1) return { title: '姿見', art: 'mirror', text: '鏡の中の 自分の 動きが、ほんの 少し 遅れて ついてくる。' };
    S.flags.add('mirror');
    return { title: '姿見', art: 'mirror', text: '鏡の中に いるのは、自分じゃ ない。\n小さな 子どもが、じっと こちらを 見て、動かない。\n振り返っても、後ろには 誰も いない。' };
  };
  C.floor_scuff = function () { return { title: '床の跡', text: 'ドアの前の 床が、丸く すり減っている。\n何百回も、行ったり 来たり した みたいに。' }; };

  C.closetL = function () {
    S.flags.add('closetL');
    return { title: '押し入れ（左）', text: '兄の 上着、兄の 服ばかり。\n弟の ものは、一着も ない。' };
  };
  C.closetR = function () {
    S.flags.add('closetR'); S.flags.add('flashlight');
    if (!S.flags.has('diary4')) {
      S.flags.add('diary4'); S.flags.add('closet');
      return { title: '日記（四）', note: ['おにいちゃんへ。ぼくは ここで まってる。', '3時44分に なったら、ドアを あけて。', 'こんどは ぼくが むかえに いくから。', '——ずっと、まってたよ。'] };
    }
    return { title: '押し入れ（右）', text: '毛布で 作った 小さな 基地。内側の 壁の クレヨンの 字を、もう 一度 読む。' };
  };
  C.shelf_books = function () {
    return {
      title: '本だな', text: '絵本が 一冊、抜きやすい。「おおかみが きた」。\n何度も 読んだ あとが ある。',
      choices: [{ label: '本の 奥を のぞく', do: function () {
        if (!S.flags.has('shelfGap')) { S.flags.add('shelfGap'); S.flags.add('smallKey'); }
        return { title: '本の 奥', text: '奥に、小さな 鍵。\n押し入れの ものでは ない。もっと 小さい。手に 取った。' };
      } }]
    };
  };
  C.shelf_gap = function () {
    return S.flags.has('shelfGap')
      ? { title: '本の 奥', text: '鍵が あった 場所。埃の 形だけ、残っている。' }
      : { title: '本の 奥', text: '本が ぎっしり つまっていて、奥は 見えない。' };
  };
  C.dresser0 = function () { S.flags.add('dresser0'); return { title: 'たんす・上段', text: '小さな 服。畳まれた まま。\nサイズは、七歳くらい。' }; };
  C.dresser1 = function () { S.flags.add('dresser1'); return { title: 'たんす・中段', text: '学校の プリント、折り紙。\nそれから、無くした はずの 家の 鍵。' }; };
  C.dresser2 = function () { S.flags.add('dresser2'); return { title: 'たんす・下段', text: '空っぽ……の 奥に、乳歯の 入った 小さな ケース。\nふたに 「ぬけたよ！」' }; };
  C.vent = function () {
    whisper();
    return { title: '通気口', text: '冷たい 風。耳を 近づける。\n——小さな 声。「……おそいよ」' };
  };
  C.floorboard = function () {
    return {
      title: 'ゆかいた', text: '床板が 一枚、浮いている。',
      choices: [{ label: '剥がす', do: function () {
        S.flags.add('floorboard');
        return { title: 'ノート・最初のページ', note: ['4月。きょうから にっきを つけます。', 'おにいちゃんが かえってくる じかんを', 'きろくする ため。'] };
      } }]
    };
  };

  function advanceIfStuck() {
    // 調べ尽くしたのに時間が余っているとき、待ち時間を進める助け
    if (S.clock < 300 && S.seen.size > 34) advance(14);
  }

  // ================= 家のほかの部屋 =================
  // ---- 廊下 ----
  C.washroom = function () {
    return { title: '洗面所', art: 'mirror', text: '蛇口が わずかに 開いていて、水が 細く 流れ続けている。\n鏡は 曇っている。指で 書いた あとが ある——「まだ？」' };
  };
  C.heightmarks = function () {
    return { title: '柱のきずあと', text: '兄と弟、二人分の 身長の しるし。\n兄の しるしは 大人まで 続いている。\n弟の しるしは、七歳の 高さで、ぷつりと 途切れている。' };
  };
  C.family_photos = function () {
    S.flags.add('_photosSeen');
    var scratched = S.clock > 150;
    if (!scratched) return { title: '家族の写真', text: '廊下に ならんだ 家族写真。\nどの写真にも、大きい 男の子と 小さい 男の子。仲が よさそうだ。' };
    S.flags.add('figure'); // 「消しているのは自分」だと気づく＝理解
    return { title: '家族の写真', text: 'さっきまで 普通だった 写真の、弟の 顔だけが、どれも 黒く 塗りつぶされている。\nボールペンの あと。強く、何度も。\n……この 手は、見おぼえが ある。自分の 筆圧だ。' };
  };
  C.hall_window = function () { return C.window_out(); };
  C.phone = function () {
    return { title: '電話', text: '黒い 固定電話。受話器を 取ると、線は 死んでいる。\nそれでも 毎晩 3時44分に なると、一度だけ 鳴るのだと、メモに ある。' };
  };
  C.phone_memo = function () {
    return { title: 'メモ帳', note: ['3:44　でんわ なった', '出たけど だれも いない', 'でも いきづかいだけ きこえた', 'おにいちゃん？'] };
  };

  // ---- 居間 ----
  C.butsudan = function () {
    S.flags.add('butsudanSeen');
    return { title: '仏壇', text: 'ひらいた ままの 仏壇。線香が 一本、まだ 細く 燃えている。\n誰かが、ついさっき まで ここに いた みたいに。' };
  };
  C.butsudan_photo = function () {
    S.flags.add('mirror'); // 真相フラグ（＝誰が居なくなったのか直視する）
    var c = corruption();
    if (c < 0.4) return { title: '遺影', text: '白い 布で 半分 隠れていて、顔が よく 見えない。\n小さな 制服。ランドセルの 記念写真だ。' };
    return { title: '遺影', text: '布が 落ちている。\n——七歳の 弟の 写真。この家で 顔を 消されずに 残っている、たった 一枚。\n家族写真の 塗りつぶしは、この 顔を 見なくて すむように していた。' };
  };
  C.orin = function () {
    tone(880, 1.6, 'sine', 0.16); setTimeout(function () { tone(1320, 1.4, 'sine', 0.08); }, 40);
    return { title: 'おりん', text: 'りん、と 澄んだ 音。\n家じゅうの 空気が、少しだけ ほどける。' };
  };
  C.living_clock = function () {
    return { title: '掛け時計', text: '止まっている。3時44分。\nこの家の 時計は 全部 そう。電池を 換えても、次の 晩には また 止まる。' };
  };
  C.kotatsu = function () {
    return { title: 'こたつ', text: 'スイッチは 入ったまま。天板は ほんのり あたたかい。\n二人分の 座布団。片方は、ずっと 誰かが 座っている みたいに へこんでいる。' };
  };
  C.zabuton_far = function () {
    return { title: '奥の座布団', text: 'へこみに 手を 当てる。\n——あたたかい。' };
  };
  C.tv = function () {
    S.flags.add('tvSeen');
    return { title: 'テレビ', text: '砂嵐の 中を、古い ニュースの 字幕が 流れ続けている。\n「午前3時44分ごろ　市道で　小学生が　軽乗用車に はねられ」\nそこで いつも 切れる。' };
  };
  C.tea = function () {
    return { title: '湯のみ', text: '出しっぱなしの お茶。\n表面に うっすら 膜。何日 経った ものか わからない。' };
  };

  // ---- お母さんの部屋 ----
  C.futon = function () {
    return { title: '布団', text: '掛け布団が 人の 形に めくれている。\nお母さんは 着替えず、服の まま 横に なって、玄関の 物音を 待っている。\nいまは いない。トイレか、台所か。' };
  };
  C.mom_pills = function () {
    return { title: '枕もとの薬', text: '睡眠薬の シート。半分 空。\nその 横に、飲みかけの 水と、弟の 小さな 靴下 片方。' };
  };
  C.mom_calendar = function () {
    return { title: 'カレンダー', text: '日付に ひとつずつ、正の字。\n「◯◯が いなくなって ▢▢日」。数字は、三桁を 超えている。' };
  };
  C.shrine_photos = function () {
    S.flags.add('shrineSeen'); S.flags.add('closet'); // 真相フラグ補完
    return { title: '弟の写真', text: '棚いっぱいの、弟の 写真。どれも 顔が そのまま。\n笑っている。走っている。兄の 背中に おぶさっている。\nこの家で、弟の 顔を ちゃんと 見ているのは、お母さん だけ。' };
  };
  C.shrine_drawer = function () {
    return {
      title: '小さな引き出し', text: '棚の 下の 引き出し。',
      choices: [{ label: '開ける', do: function () {
        S.flags.add('diary4b');
        return { title: '弟のてがみ', note: ['おかあさんへ', 'ぼくが おむかえに いけば', 'おにいちゃんも まよわず かえれるよね', 'だから ちょっと そこまで いってくる'] };
      } }]
    };
  };

  // ---- 玄関 ----
  C.front_door = function () {
    if (S.hour) { openFrontDoor(); return null; }
    return { title: '玄関の扉', text: '鍵は かかっていない。\nでも、外に 出る 気には なれない。弟を 待つなら、この家に いなきゃ いけない 気がする。' };
  };
  C.front_peephole = function () {
    if (S.hour) { ending('bad_peep'); return null; }
    var c = corruption();
    return { title: 'のぞき穴', text: c < 0.5 ? '外は 暗い。街灯の 光の 輪が ひとつ 見えるだけ。' : '街灯の 下に、小さな 人影。\nこちらを、じっと 見上げている。' };
  };
  C.intercom = function () {
    return { title: 'インターホン', text: '古い 呼び出しボタン。\n3時44分に なると、押されても いないのに 鳴る。毎晩。' };
  };
  C.doormat = function () {
    return { title: 'マット', text: '「おかえり」と 織り込まれた 玄関マット。\n端が ぼろぼろに なるまで、踏まれ続けている。誰の 足で？' };
  };
  C.getabako = function () {
    return { title: '下駄箱', text: '兄の 靴、父の 靴。きちんと しまわれている。\n弟の 靴の 段だけ、空っぽ。履いて 出たまま。' };
  };
  C.brother_shoes = function () {
    S.flags.add('shoesSeen');
    return { title: 'そろえられた靴', text: '上がり框に、小さな スニーカーが 一足。\nつま先を 外に 向けて、いつでも 出られるように そろえてある。\n——帰ってくる 人の ためか。出ていく 人の ためか。' };
  };
  C.umbrella = function () {
    return { title: '傘立て', text: '傘が 四本。持ち手に 名前。\n弟の 傘だけ、無い。あの夜は、雨だった。' };
  };

  // ---------- panel ----------
  var insEl = document.getElementById('inspect');
  var insTitle = document.getElementById('ins-title');
  var insText = document.getElementById('ins-text');
  var insCh = document.getElementById('ins-choices');
  var typeTimer = null;

  function renderEntry(entry) {
    if (!entry) return;
    insTitle.textContent = entry.title || 'しらべる';
    insCh.innerHTML = '';
    // art — バッファを実表示サイズに合わせて 560x350 の座標系を等倍で拡縮
    if (entry.art || entry.note) {
      insArt.classList.remove('hidden');
      var env = envObj();
      if (entry.note) env._noteLines = entry.note;
      var cw = insArt.clientWidth || 520;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      insArt.width = Math.round(cw * dpr);
      insArt.height = Math.round(cw * (350 / 560) * dpr);
      insArt.style.height = Math.round(cw * (350 / 560)) + 'px';
      insAx.setTransform(1, 0, 0, 1, 0, 0);
      insAx.clearRect(0, 0, insArt.width, insArt.height);
      var sc = (cw * dpr) / 560;
      insAx.setTransform(sc, 0, 0, sc, 0, 0);
      window.ART.paintInspect(insAx, entry.art || 'note', env);
    } else {
      insArt.classList.add('hidden');
    }
    // typed text
    var full = entry.text || (entry.note ? entry.note.join('\n') : '');
    clearInterval(typeTimer);
    insText.textContent = '';
    var i = 0;
    typeTimer = setInterval(function () {
      i += 2;
      insText.textContent = full.slice(0, i);
      if (i >= full.length) {
        clearInterval(typeTimer);
        if (entry.choices) entry.choices.forEach(function (ch) {
          var b = document.createElement('button');
          b.className = 'choice'; b.textContent = ch.label;
          b.onclick = function () {
            uiClick();
            var next = ch.do();
            if (next) renderEntry(next); else if (!S.ended) closePanel();
          };
          insCh.appendChild(b);
        });
      }
    }, 14);
  }

  function open(id) {
    if (S.ended) return;
    var fn = C[id];
    if (!fn) return;
    var first = !S.seen.has(id);
    S.seen.add(id);
    // 特殊: hour のドア／のぞき穴は即分岐しうる
    var entry = fn();
    if (S.ended) return;
    advance(first ? (7 + Math.floor(Math.random() * 6)) : (1 + Math.floor(Math.random() * 3)));
    if (!entry) return;
    S.panelOpen = true;
    insEl.classList.add('show');
    uiClick();
    renderEntry(entry);
  }
  function closePanel() {
    S.panelOpen = false;
    insEl.classList.remove('show');
    clearInterval(typeTimer);
    if (S && S.hour && !S.ended) setTimeout(updateHourPrompt, 400);
  }
  document.getElementById('ins-close').onclick = closePanel;
  insEl.onclick = function (e) { if (e.target === insEl) closePanel(); };

  // ---------- endings ----------
  var END = {
    true: { k: 'TRUE END', t: 'おかえり', p: '3時44分。今度は、のぞき穴を 見なかった。ドアを 開けた。\nそこに 立っていたのは、七歳の 弟だった。ずっと、この時間に 迎えに 来ていた。\n「おそいよ」と 弟が 笑う。手を つないで、廊下を 歩く。\n背中で、止まっていた 時計が、また 動きはじめる 音が した。' },
    normal: { k: 'END', t: '朝', p: '3時44分。ドアを 開けた。廊下は 空っぽで、冷たい 風が 通り抜けた。\nそのまま 朝が 来た。何も 分からないまま、あなたは この家を 出た。\n弟の 部屋の ドアは、また ひとりでに、鍵が かかった。' },
    bad_peep: { k: 'BAD END', t: '見てしまった', p: 'のぞき穴に 目を 当てた。廊下いっぱいの 白い 顔が、こちらを のぞき返していた。\n——あの夜も、あなたは そうした。ドアを 開けず、のぞいて、居留守を 使った。\n時計は また、3時44分に 戻る。あなたが ドアを 開けるまで、何度でも。' },
    bad_wait: { k: 'BAD END', t: 'また、開けなかった', p: 'ノックが 鳴りやむまで、ベッドで 息を ひそめていた。\nあの夜と、同じだ。\n朝は 来ない。時計は 3時44分から 進まない。\nドアの 向こうで、小さな 声が する。「……まってるよ」' },
  };
  var CIN_DUR = { bad_peep: 2.0, bad_wait: 3.4, normal: 3.4, true: 3.0 };
  function ending(key) {
    if (S.ended) return;
    S.ended = true;
    _knockTok++;                 // ノックループを止める
    closePanel();
    hpEl.classList.remove('show');
    reticleEl.classList.remove('on'); hotlabelEl.classList.remove('on');
    subEl.classList.remove('show');
    S.cin = { key: key, t: 0, dur: CIN_DUR[key] || 3.0 };
    cinemaAudio(key);
    // rAF が止まっていても（タブ非表示など）必ずエンド画面へ進むフォールバック
    setTimeout(function () {
      if (S && S.ended && S.cin && S.cin.key === key) { S.cin = null; revealEnd(key); }
    }, (CIN_DUR[key] || 3.0) * 1000 + 500);
  }

  function windSweep() {
    if (!AU.on) return;
    var b = AU.ctx.createBuffer(1, AU.ctx.sampleRate * 3.4, AU.ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    var s = AU.ctx.createBufferSource(); s.buffer = b;
    var f = AU.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, AU.ctx.currentTime);
    f.frequency.linearRampToValueAtTime(900, AU.ctx.currentTime + 1.6);
    f.frequency.linearRampToValueAtTime(220, AU.ctx.currentTime + 3.3);
    var g = AU.ctx.createGain(); g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.16, AU.ctx.currentTime + 0.8);
    g.gain.linearRampToValueAtTime(0.0, AU.ctx.currentTime + 3.3);
    s.connect(f); f.connect(g); g.connect(AU.master); s.start();
  }
  function breath(vol) {
    if (!AU.on) return;
    var dur = 1.1;
    var b = AU.ctx.createBuffer(1, AU.ctx.sampleRate * dur, AU.ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) {
      var e = Math.sin(Math.PI * i / d.length);
      d[i] = (Math.random() * 2 - 1) * e * e;
    }
    var s = AU.ctx.createBufferSource(); s.buffer = b;
    var f = AU.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    var g = AU.ctx.createGain(); g.gain.value = vol || 0.3;
    s.connect(f); f.connect(g); g.connect(AU.master); s.start();
  }
  function cinemaAudio(key) {
    if (key === 'bad_peep') {
      setTimeout(function () {
        noiseBurst(0.6, 1.0);
        tone(1950, 0.5, 'sawtooth', 0.55, 170);
        tone(2600, 0.4, 'square', 0.3, 300);
        tone(52, 1.1, 'square', 0.6, 24);
      }, 300);
      for (var k = 0; k < 6; k++) (function (d) { setTimeout(function () { noiseBurst(0.035, 0.5); }, 520 + d * 42); })(k);
      setTimeout(function () { if (AU.on) AU.master.gain.linearRampToValueAtTime(0.0001, AU.ctx.currentTime + 0.25); }, 900);
      setTimeout(function () { if (AU.on) AU.master.gain.value = 0.05; breath(0.34); }, 1300);
      setTimeout(function () { breath(0.3); }, 1900);
    } else if (key === 'bad_wait') {
      knock();
      setTimeout(knock, 900);
      setTimeout(function () { tone(60, 0.24, 'sine', 0.5, 34); }, 2100);   // 最後の一撃、重く
      setTimeout(function () { if (AU.on) AU.master.gain.linearRampToValueAtTime(0.0001, AU.ctx.currentTime + 0.4); }, 2400);
      setTimeout(function () { if (AU.on) AU.master.gain.value = 0.05; noiseBurst(0.14, 0.55); }, 2900); // 息を吸う音
      setTimeout(function () { whisper(); }, 3050);
    } else if (key === 'normal') {
      windSweep();
      setTimeout(function () { if (AU.on) AU.master.gain.linearRampToValueAtTime(0.02, AU.ctx.currentTime + 2.5); }, 400);
    } else {
      tone(330, 2.6, 'sine', 0.16, 494);
      setTimeout(function () { tone(440, 2.6, 'sine', 0.13); }, 320);
      setTimeout(function () { tone(587, 2.2, 'sine', 0.1); }, 720);
      if (AU.on) AU.master.gain.linearRampToValueAtTime(0.03, AU.ctx.currentTime + 2.6);
    }
  }

  function revealEnd(key) {
    var e = END[key];
    var kEl = document.getElementById('end-kicker'),
      tEl = document.getElementById('end-title'),
      pEl = document.getElementById('end-text'),
      endEl = document.getElementById('end');
    kEl.textContent = e.k;
    tEl.textContent = e.t;
    endEl.classList.toggle('bad', key.indexOf('bad') === 0);
    endEl.classList.add('show');
    // 本文を1文字ずつ、たまにフリッカーしながら
    pEl.textContent = '';
    var i = 0, bad = key.indexOf('bad') === 0;
    clearInterval(revealEnd._t);
    revealEnd._t = setInterval(function () {
      i += 1;
      pEl.textContent = e.p.slice(0, i);
      if (bad && Math.random() < 0.06) {
        pEl.style.opacity = '0.15';
        setTimeout(function () { pEl.style.opacity = '1'; }, 45);
      }
      if (i >= e.p.length) clearInterval(revealEnd._t);
    }, bad ? 34 : 26);
  }

  // ---------- env for ART ----------
  function envObj() {
    var hm = clockHM();
    return {
      t: S.t, c: corruption(), clock: S.clock, clockH: hm.h, clockM: hm.m,
      lightsOn: S.lightsOn, lampsOn: S.lampsOn, hour: S.hour, flags: S.flags,
      figureState: figureState(), reflection: reflection(),
    };
  }

  // ---------- render ----------
  var fit = { s: 1, ox: 0, oy: 0, dpr: 1 };
  function resize() {
    var r = cv.parentElement.getBoundingClientRect();
    // 塗り面積を抑えるため上限 1.25（レティナでの過大な解像度を避ける）
    var dpr = Math.min(1.25, window.devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    var s = Math.min(r.width / VW, r.height / VH);
    fit = { s: s, ox: (r.width - VW * s) / 2, oy: (r.height - VH * s) / 2, dpr: dpr };
  }
  window.addEventListener('resize', resize);

  function frame(now) {
    requestAnimationFrame(frame);
    if (!S || document.hidden) return;
    var dt = Math.min(0.05, (now - (frame._l || now)) / 1000);
    frame._l = now;

    // エンド演出（キネマ）
    if (S.cin) {
      S.cin.t += dt; S.t += dt;
      ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.save();
      ctx.translate(fit.ox, fit.oy); ctx.scale(fit.s, fit.s);
      ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
      var bad = S.cin.key.indexOf('bad') === 0;
      if (bad) {
        var sh = Math.max(0, 1 - S.cin.t / S.cin.dur);
        // bad_peep は序盤に激しく、bad_wait は終盤の一瞬だけ
        var amp = S.cin.key === 'bad_peep' ? 30 * sh : (S.cin.t > 2.6 && S.cin.t < 3.1 ? 22 : 3);
        ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
      }
      window.ART.cinema(ctx, S.cin, envObj());
      ctx.restore();
      if (S.cin.t >= S.cin.dur) { revealEnd(S.cin.key); S.cin = null; }
      return;
    }
    // エンド画面は不透明なので背後の描画は止める（負荷対策）
    if (S.ended) return;
    S.t += dt;

    // heartbeat
    var c = corruption();
    if (c > 0.35 && !S.ended) {
      S._hb = (S._hb || 0) + dt;
      var iv = 1.6 - 1.0 * c;
      if (S._hb >= iv) { S._hb = 0; heartbeat(); }
    }
    // audio level
    if (AU.on && !S.ended) {
      AU.master.gain.value += ((0.10 + 0.5 * c) - AU.master.gain.value) * 0.02;
      AU.drone.gain.value += ((0.2 + 0.8 * c) - AU.drone.gain.value) * 0.02;
    }

    // draw
    ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.translate(fit.ox, fit.oy); ctx.scale(fit.s, fit.s);
    ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
    // subtle tremble at high corruption
    if (c > 0.2) ctx.translate((Math.random() - 0.5) * c * 6, (Math.random() - 0.5) * c * 6);
    var env = envObj();
    S.hotspots = window.ART.paint(ctx, S.view, env);
    // hover reticle
    if (S.hoverId) {
      var h = hs(S.hoverId);
      if (h) {
        ctx.strokeStyle = 'rgba(230,238,245,.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(h.x, h.y, h.w, h.h);
      }
    }
    ctx.restore();

    // HUD clock
    var clk = document.getElementById('clock');
    clk.textContent = fmtClock();
    clk.classList.toggle('late', S.clock >= 300 || S.hour);

    if (TESTUI) document.getElementById('dbg-info').textContent =
      ' clock=' + S.clock + ' c=' + c.toFixed(2) + ' 理解=' + understanding() + ' seen=' + S.seen.size;
  }
  requestAnimationFrame(frame);

  // 時間経過は setInterval で駆動（タブ非表示でも rAF に依存しない）
  setInterval(function () {
    if (!S || S.panelOpen || S.ended || S.hour) return;
    S.idleAcc += 1000;
    while (S.idleAcc >= IDLE_MS) { S.idleAcc -= IDLE_MS; advance(1); }
  }, 1000);

  function hs(id) { for (var i = 0; i < S.hotspots.length; i++) if (S.hotspots[i].id === id) return S.hotspots[i]; return null; }

  // ---------- input ----------
  function toVirtual(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left - fit.ox) / fit.s, y: (e.clientY - r.top - fit.oy) / fit.s };
  }
  function pick(p) {
    var best = null, bestA = Infinity;
    for (var i = 0; i < S.hotspots.length; i++) {
      var h = S.hotspots[i];
      if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
        var a = h.w * h.h;
        if (a < bestA) { bestA = a; best = h; }
      }
    }
    return best;
  }
  var reticleEl = document.getElementById('reticle');
  var hotlabelEl = document.getElementById('hotlabel');
  cv.addEventListener('pointermove', function (e) {
    if (S.panelOpen || S.ended) { reticleEl.classList.remove('on'); hotlabelEl.classList.remove('on'); return; }
    var p = toVirtual(e), h = pick(p);
    S.hoverId = h ? h.id : null;
    var r = cv.getBoundingClientRect();
    reticleEl.style.left = (e.clientX - r.left) + 'px';
    reticleEl.style.top = (e.clientY - r.top) + 'px';
    reticleEl.classList.toggle('on', !!h);
    reticleEl.style.transform = h ? 'scale(1.35)' : 'scale(1)';
    if (h) {
      hotlabelEl.textContent = h.name;
      hotlabelEl.style.left = (e.clientX - r.left) + 'px';
      hotlabelEl.style.top = (e.clientY - r.top) + 'px';
      hotlabelEl.classList.add('on');
    } else hotlabelEl.classList.remove('on');
  });
  cv.addEventListener('pointerdown', function (e) {
    if (S.panelOpen || S.ended || S.moving) return;
    var p = toVirtual(e), h = pick(p);
    if (!h) return;
    if (h.goto) goTo(h.goto);
    else open(h.id);
  });
  cv.addEventListener('pointerleave', function () { reticleEl.classList.remove('on'); hotlabelEl.classList.remove('on'); S.hoverId = null; });

  // ---------- 移動 ----------
  var fadeEl = document.getElementById('fade');
  var roomEl = document.getElementById('roomname');
  function showRoom(name) {
    roomEl.textContent = '― ' + name + ' ―';
    roomEl.classList.add('on');
    clearTimeout(showRoom._t);
    showRoom._t = setTimeout(function () { roomEl.classList.remove('on'); }, 2200);
  }
  function goTo(viewId, cb) {
    if (S.ended || S.moving) return;
    S.moving = true;
    reticleEl.classList.remove('on'); hotlabelEl.classList.remove('on');
    var wasLoc = curLoc();
    fadeEl.classList.add('on');
    footstep();
    setTimeout(function () {
      var newLoc = window.ART.locOf(viewId);
      S.view = viewId;
      if (newLoc !== wasLoc) showRoom(window.ART.LOCS[newLoc].name);
      fadeEl.classList.remove('on');
      S.moving = false;
      if (S.hour) updateHourPrompt();
      if (cb) setTimeout(cb, 260);
    }, 240);
  }

  function rotate(dir) {
    if (S.panelOpen || S.ended || S.moving) return;
    var v = window.ART.viewsOf(curLoc());
    var i = (v.indexOf(S.view) + dir + v.length) % v.length;
    S.view = v[i]; uiClick();
  }
  document.getElementById('navL').onclick = function () { rotate(-1); };
  document.getElementById('navR').onclick = function () { rotate(1); };
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') rotate(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd') rotate(1);
    else if (e.key === 'Escape' && S.panelOpen) closePanel();
  });

  // ---------- start / restart ----------
  function begin() {
    S = freshState();
    if (START_CLOCK != null) S.clock = START_CLOCK;
    clearInterval(revealEnd._t);
    document.getElementById('title').classList.remove('show');
    document.getElementById('end').classList.remove('show', 'bad');
    document.getElementById('end-text').style.opacity = '1';
    document.getElementById('hourprompt').classList.remove('show');
    document.getElementById('fade').classList.remove('on');
    document.getElementById('roomname').classList.remove('on');
    resize();
    initAudio();
    if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume();
    if (AU.on) AU.master.gain.value = 0.02;
    if (TESTUI) document.getElementById('debug').classList.add('show');
    setTimeout(function () { say('弟の 部屋。あの夜から、この家の 時計は ぜんぶ、3時44分で 止まったまま。', 6500); }, 500);
    checkMilestones();
  }
  document.getElementById('startBtn').onclick = begin;
  document.getElementById('againBtn').onclick = begin;

  // ---------- debug ----------
  document.querySelectorAll('#debug [data-add]').forEach(function (b) {
    b.onclick = function () { S.clock = Math.max(0, S.clock + (+b.dataset.add)); checkMilestones(); if (S.clock >= 344 && !S.hour) enterHour(); };
  });
  document.getElementById('dbg-344').onclick = function () { S.clock = 343; checkMilestones(); };
  document.getElementById('dbg-flags').onclick = function () {
    ['diary1', 'diary2', 'diary3', 'diary4', 'figure', 'mirror', 'closet', '_mirrorInspected', '_photoRevealed', 'photo', 'smallKey'].forEach(function (f) { S.flags.add(f); });
    say('フラグ全部セット（理解度 ' + understanding() + '）');
  };

  document.getElementById('title').classList.add('show');
  resize();
})();
