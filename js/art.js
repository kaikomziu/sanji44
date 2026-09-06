/* 3時44分 — 描画 (canvas, painterly).  仮想解像度 1600x1000 */
(function () {
  'use strict';
  var VW = 1600, VH = 1000;

  var C = {
    inkTop: '#0b131d', inkBot: '#05080d',
    wall: '#16202c', wallHi: '#1e2b39', wallLo: '#0e161f',
    floor: '#141b22', floorHi: '#20303c',
    ceil: '#0a0f16',
    wood: '#4a3728', woodHi: '#6a5038', woodLo: '#281d15',
    moon: '#a9c8e2', moonGlow: 'rgba(150,190,225,',
    lamp: 'rgba(232,168,92,', lampCore: '#f2c987',
    fabric: '#33465a', fabricHi: '#4f6a86', fabricLo: '#1f2c39',
    paper: '#cdba8f', metal: '#7f8a94',
    red: '#7c2222',
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---- noise texture for grain（大きめタイルにしてタイル数を減らす）----
  var NCELL = 3, NSIZE = 600;
  var noiseTiles = [];
  (function () {
    for (var t = 0; t < 4; t++) {
      var nc = document.createElement('canvas');
      nc.width = NSIZE; nc.height = NSIZE;
      var nx = nc.getContext('2d');
      var img = nx.createImageData(NSIZE, NSIZE);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = 90 + ((Math.random() * 76) | 0);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      nx.putImageData(img, 0, 0);
      noiseTiles.push(nc);
    }
  })();

  function quad(ctx, p, fill) {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (var i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function vgrad(ctx, x, y0, y1, c0, c1) {
    var g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    return g;
  }
  function contactShadow(ctx, cx, cy, rx, ry, a) {
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, rx, 0, 7); ctx.fill();
    ctx.restore();
  }

  // ---------- room shell ----------
  function paintShell(ctx, env) {
    var lit = env.lightsOn;
    // base
    quad(ctx, [0, 0, VW, 0, VW, VH, 0, VH],
      vgrad(ctx, 0, 0, VH, lit ? '#1c1a17' : C.inkTop, lit ? '#0d0b09' : C.inkBot));

    var bx0 = 320, bx1 = 1280, by0 = 180, by1 = 760;
    // ceiling
    quad(ctx, [bx0, by0, bx1, by0, VW, 0, 0, 0], lit ? '#141210' : C.ceil);
    // left wall
    quad(ctx, [0, 0, bx0, by0, bx0, by1, 0, VH], C.wallLo);
    // right wall
    quad(ctx, [bx1, by0, VW, 0, VW, VH, bx1, by1], C.wallLo);
    // floor
    var fg = ctx.createLinearGradient(0, by1, 0, VH);
    fg.addColorStop(0, lit ? '#241d16' : C.floorHi);
    fg.addColorStop(1, lit ? '#0c0908' : C.floor);
    quad(ctx, [bx0, by1, bx1, by1, VW, VH, 0, VH], fg);
    // floorboards
    ctx.save();
    ctx.globalAlpha = .5;
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 2;
    for (var i = -6; i <= 6; i++) {
      var fx = 800 + i * 120;
      ctx.beginPath();
      ctx.moveTo(lerp(800, fx, .18), by1);
      ctx.lineTo(fx * 1.9 - 800 * .9, VH);
      ctx.stroke();
    }
    ctx.restore();
    // back wall
    var wg = ctx.createLinearGradient(0, by0, 0, by1);
    wg.addColorStop(0, lit ? '#26221d' : C.wallHi);
    wg.addColorStop(1, lit ? '#14110d' : C.wallLo);
    ctx.fillStyle = wg;
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    // corner ambient occlusion（安価な内側グラデーション。filter:blur は使わない）
    var ao = ctx.createRadialGradient(800, 470, 260, 800, 470, 720);
    ao.addColorStop(0, 'rgba(0,0,0,0)');
    ao.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = ao;
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    return { bx0: bx0, bx1: bx1, by0: by0, by1: by1 };
  }

  function moonFloor(ctx, env) {
    // cool light pool cast onto the floor from the window
    var a = (env.lightsOn ? .09 : .24) * (1 - .55 * env.c);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(320, 760); ctx.lineTo(1280, 760); ctx.lineTo(1600, 1000); ctx.lineTo(0, 1000);
    ctx.closePath(); ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    var g = ctx.createRadialGradient(830, 760, 40, 830, 900, 460);
    g.addColorStop(0, C.moonGlow + a + ')');
    g.addColorStop(1, C.moonGlow + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 700, VW, 300);
    ctx.restore();
  }

  function dust(ctx, env) {
    if (env.lightsOn) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    var n = 24;
    for (var i = 0; i < n; i++) {
      var seed = i * 97.13;
      var px = 620 + ((Math.sin(seed) * 0.5 + 0.5) * 520);
      var drift = (env.t * 8 + seed * 20) % 900;
      var py = 220 + drift;
      var tw = 0.4 + 0.6 * Math.sin(env.t * 1.7 + seed);
      ctx.fillStyle = C.moonGlow + (0.10 * tw * (1 - env.c * .5)) + ')';
      ctx.beginPath();
      ctx.arc(px + Math.sin(env.t * .6 + seed) * 12, py, 1.6 + tw, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  function lampPool(ctx, x, y, R, env) {
    if (!env.lampsOn) return;
    var flick = 1 + Math.sin(env.t * 13) * 0.015 + (Math.random() < 0.03 ? -0.12 : 0);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    var g = ctx.createRadialGradient(x, y, 0, x, y, R * flick);
    g.addColorStop(0, C.lamp + (0.55) + ')');
    g.addColorStop(0.4, C.lamp + (0.22) + ')');
    g.addColorStop(1, C.lamp + '0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R * flick, 0, 7); ctx.fill();
    ctx.restore();
  }

  function corruption(ctx, env) {
    var c = env.c;
    if (c <= 0.001) return;
    ctx.save();
    // 端から迫る闇（1パスの放射グラデ）
    var g = ctx.createRadialGradient(VW / 2, VH * 0.46, VH * (0.55 - 0.4 * c), VW / 2, VH / 2, VH);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,' + (0.4 * c).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,' + (0.82 * c + 0.12).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    // 冷たく色あせた青黒のかぶり（source-over 1パスで近似）
    ctx.fillStyle = 'rgba(24,30,44,' + (0.5 * c).toFixed(3) + ')';
    ctx.fillRect(0, 0, VW, VH);
    // その時間の脈打つ赤
    if (env.hour) {
      var pb = 0.06 + 0.1 * Math.max(0, Math.sin(env.t * 1.9));
      ctx.fillStyle = 'rgba(90,10,10,' + pb.toFixed(3) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
    ctx.restore();
    // たまに走る安価な横帯グリッチ（getImageData は使わない）
    if (c > 0.45 && Math.random() < 0.02) {
      var sy = Math.random() * VH, sh = 6 + Math.random() * 40;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.5)' : 'rgba(150,170,200,.12)';
      ctx.fillRect(0, sy, VW, sh);
    }
  }

  var _grainN = 0;
  function grain(ctx, env) {
    _grainN++;
    ctx.save();
    ctx.globalAlpha = 0.05 + 0.05 * env.c;
    ctx.globalCompositeOperation = 'overlay';
    // 大タイルを 2x2 で敷く（4 drawImage）。タイルとオフセットを回して粒を動かす
    var tile = noiseTiles[_grainN % 4];
    var ox = -((_grainN * 53) % NSIZE), oy = -((_grainN * 97) % NSIZE);
    for (var x = ox; x < VW; x += NSIZE)
      for (var y = oy; y < VH; y += NSIZE)
        ctx.drawImage(tile, x, y);
    ctx.restore();
  }

  // ================= FURNITURE =================
  function drawWindow(ctx, env, cx) {
    cx = cx || 800;
    var w = 360, h = 380, x = cx - w / 2, y = 250;
    // outer glow
    if (!env.lightsOn) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      var gg = ctx.createRadialGradient(cx, y + h / 2, 20, cx, y + h / 2, 420);
      gg.addColorStop(0, C.moonGlow + (0.34 * (1 - env.c * .6)) + ')');
      gg.addColorStop(1, C.moonGlow + '0)');
      ctx.fillStyle = gg; ctx.fillRect(cx - 460, y - 120, 920, h + 320);
      ctx.restore();
    }
    // frame
    ctx.fillStyle = C.woodLo; ctx.fillRect(x - 22, y - 22, w + 44, h + 44);
    ctx.fillStyle = C.wood; ctx.fillRect(x - 14, y - 14, w + 28, h + 28);
    // night sky
    var sg = ctx.createLinearGradient(0, y, 0, y + h);
    sg.addColorStop(0, '#0d1a2a'); sg.addColorStop(0.6, '#122234'); sg.addColorStop(1, '#1c2c3c');
    ctx.fillStyle = sg; ctx.fillRect(x, y, w, h);
    // moon
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    var mg = ctx.createRadialGradient(x + w * 0.72, y + h * 0.26, 4, x + w * 0.72, y + h * 0.26, 90);
    mg.addColorStop(0, 'rgba(220,235,250,.95)'); mg.addColorStop(0.25, 'rgba(190,215,240,.6)'); mg.addColorStop(1, 'rgba(150,190,225,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(x + w * 0.72, y + h * 0.26, 90, 0, 7); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#e7eef6'; ctx.beginPath(); ctx.arc(x + w * 0.72, y + h * 0.26, 16, 0, 7); ctx.fill();
    // distant houses
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(x, y + h - 70, w, 70);
    for (var i = 0; i < 5; i++) {
      var hw = 40 + (i % 2) * 24, hh = 30 + ((i * 7) % 40);
      ctx.fillRect(x + 10 + i * 70, y + h - 70 - hh, hw, hh);
    }
    // a single warm distant window
    ctx.fillStyle = 'rgba(240,200,120,.5)';
    ctx.fillRect(x + 24, y + h - 84, 8, 10);
    // street lamp
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    var lg = ctx.createRadialGradient(x + w * 0.26, y + h - 46, 2, x + w * 0.26, y + h - 46, 66);
    lg.addColorStop(0, 'rgba(240,210,150,.55)'); lg.addColorStop(1, 'rgba(240,210,150,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x + w * 0.26, y + h - 46, 66, 0, 7); ctx.fill();
    ctx.restore();
    // figure (time gated) — drawn above the housetops so it reads clearly
    if (env.figureState === 1) {
      ctx.fillStyle = 'rgba(6,10,16,.94)';
      ctx.beginPath(); ctx.ellipse(x + w * 0.26, y + h - 92, 11, 40, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w * 0.26, y + h - 138, 12, 0, 7); ctx.fill();
    } else if (env.figureState === 2) {
      ctx.fillStyle = 'rgba(3,6,11,.97)';
      ctx.beginPath(); ctx.ellipse(cx, y + h - 118, 26, 74, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, y + h - 196, 22, 0, 7); ctx.fill();
      // faint pale eyes
      ctx.fillStyle = 'rgba(200,214,228,' + (0.25 + 0.25 * Math.sin(env.t * 3)) + ')';
      ctx.beginPath(); ctx.arc(cx - 8, y + h - 200, 2.4, 0, 7); ctx.arc(cx + 8, y + h - 200, 2.4, 0, 7); ctx.fill();
    }
    // muntins
    ctx.strokeStyle = C.woodHi; ctx.lineWidth = 8;
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + h);
    ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
    // glass sheen
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .08;
    ctx.fillStyle = '#cfe0f0';
    quad(ctx, [x + 10, y + 10, x + 120, y + 10, x + 60, y + h - 10, x + 10, y + h - 10]);
    ctx.restore();
    // sheer curtains
    ctx.save(); ctx.globalAlpha = .16; ctx.fillStyle = '#dfe8f0';
    for (var s = 0; s < 2; s++) {
      var sx = s === 0 ? x - 14 : x + w - 70;
      ctx.beginPath();
      ctx.moveTo(sx, y - 30);
      for (var yy = 0; yy <= h + 60; yy += 20)
        ctx.lineTo(sx + 84 + Math.sin(yy * 0.03 + env.t * 0.6 + s) * 12, y - 30 + yy);
      for (var yy2 = h + 60; yy2 >= 0; yy2 -= 20)
        ctx.lineTo(sx + Math.sin(yy2 * 0.04 + s) * 8, y - 30 + yy2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawDesk(ctx, env) {
    var x = 560, y = 560, w = 480, h = 40;
    contactShadow(ctx, x + w / 2, y + 190, 300, 60, .5);
    // legs
    ctx.fillStyle = C.woodLo;
    ctx.fillRect(x + 16, y, 26, 210); ctx.fillRect(x + w - 42, y, 26, 210);
    // top
    var tg = vgrad(ctx, 0, y, y + h, C.woodHi, C.wood);
    ctx.fillStyle = tg; rr(ctx, x, y, w, h, 6); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, y + h, w, 8);
    // drawers
    for (var d = 0; d < 2; d++) {
      var dx = x + 40 + d * 190, dy = y + 56, dw = 170, dh = 90;
      ctx.fillStyle = d === 1 && !env.flags.has('deskR') ? C.woodLo : C.wood;
      rr(ctx, dx, dy, dw, dh, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
      ctx.fillStyle = C.metal;
      ctx.beginPath(); ctx.arc(dx + dw / 2, dy + dh / 2, 7, 0, 7); ctx.fill();
    }
    // lamp
    var lx = x + w - 60, ly = y;
    ctx.strokeStyle = C.metal; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - 90); ctx.lineTo(lx - 60, ly - 130); ctx.stroke();
    ctx.fillStyle = env.lampsOn ? C.lampCore : '#39434d';
    ctx.beginPath(); ctx.moveTo(lx - 88, ly - 118); ctx.lineTo(lx - 30, ly - 150); ctx.lineTo(lx - 20, ly - 120); ctx.closePath(); ctx.fill();
    lampPool(ctx, lx - 80, ly - 40, 240, env);
    // papers + drawing
    ctx.save(); ctx.translate(x + 150, y - 6); ctx.rotate(-0.05);
    ctx.fillStyle = C.paper; ctx.fillRect(-70, -8, 130, 16);
    ctx.restore();
    ctx.save(); ctx.translate(x + 300, y - 4); ctx.rotate(0.04);
    ctx.fillStyle = '#c9be9c'; ctx.fillRect(-60, -6, 120, 12);
    ctx.strokeStyle = C.red; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-20, 0, 5, 0, 7); ctx.arc(20, 0, 5, 0, 7); ctx.stroke();
    ctx.restore();
    // chair
    ctx.fillStyle = C.woodLo;
    ctx.fillRect(x + w / 2 - 60, y + 120, 120, 14);
    ctx.fillRect(x + w / 2 - 54, y + 130, 12, 90);
    ctx.fillRect(x + w / 2 + 42, y + 130, 12, 90);
    ctx.fillRect(x + w / 2 - 60, y - 4, 12, 128);
    ctx.fillStyle = C.wood; ctx.fillRect(x + w / 2 - 62, y + 30, 90, 40);
  }

  function drawBed(ctx, env) {
    var x = 470, y = 470, w = 720, h = 300;
    contactShadow(ctx, x + w / 2, y + h + 20, 420, 70, .5);
    // frame
    ctx.fillStyle = C.woodLo; ctx.fillRect(x - 30, y - 120, 34, h + 200);
    ctx.fillStyle = C.wood; rr(ctx, x - 40, y - 150, 60, 150, 8); ctx.fill();
    // mattress
    var mg = vgrad(ctx, 0, y, y + h, C.fabricHi, C.fabricLo);
    ctx.fillStyle = mg; rr(ctx, x, y, w, h, 22); ctx.fill();
    // duvet folds
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 10;
    for (var i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 20, y + i * 55 + Math.sin(i) * 8);
      ctx.bezierCurveTo(x + w * 0.4, y + i * 55 - 20, x + w * 0.6, y + i * 55 + 24, x + w - 20, y + i * 55);
      ctx.stroke();
    }
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .06;
    ctx.fillStyle = C.moon; rr(ctx, x, y, w, h * 0.5, 22); ctx.fill(); ctx.restore();
    // pillow
    ctx.save(); ctx.translate(x + 120, y + 10); ctx.rotate(-0.04);
    var pg = vgrad(ctx, 0, -40, 60, '#e7ebef', '#b9c3cc');
    ctx.fillStyle = pg; rr(ctx, -90, -40, 220, 100, 30); ctx.fill();
    ctx.restore();
    // photo on pillow (face down)
    if (!env.flags.has('photo')) {
      ctx.save(); ctx.translate(x + 150, y + 30); ctx.rotate(0.14);
      ctx.fillStyle = '#b7ac8c'; ctx.fillRect(-34, -24, 68, 48);
      ctx.restore();
    }
    // shoebox under bed
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(x + w * 0.55, y + h + 6, 150, 46);
    ctx.strokeStyle = '#c9b98f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + w * 0.55 + 75, y + h + 6); ctx.lineTo(x + w * 0.55 + 75, y + h + 52); ctx.stroke();
  }

  function drawNightstand(ctx, env) {
    var x = 1120, y = 560, w = 180, h = 210;
    contactShadow(ctx, x + w / 2, y + h + 12, 140, 34, .5);
    ctx.fillStyle = vgrad(ctx, 0, y, y + h, C.woodHi, C.woodLo);
    rr(ctx, x, y, w, h, 6); ctx.fill();
    ctx.fillStyle = C.woodLo; rr(ctx, x + 16, y + 24, w - 32, 60, 4); ctx.fill();
    ctx.fillStyle = C.metal; ctx.beginPath(); ctx.arc(x + w / 2, y + 54, 6, 0, 7); ctx.fill();
    // lamp
    ctx.fillStyle = C.metal; ctx.fillRect(x + w / 2 - 6, y - 70, 12, 74);
    ctx.fillStyle = env.lampsOn ? C.lampCore : '#3a444e';
    ctx.beginPath(); ctx.moveTo(x + w / 2 - 46, y - 70); ctx.lineTo(x + w / 2 + 46, y - 70); ctx.lineTo(x + w / 2 + 30, y - 118); ctx.lineTo(x + w / 2 - 30, y - 118); ctx.closePath(); ctx.fill();
    lampPool(ctx, x + w / 2, y - 30, 300, env);
    // digital clock
    var cw = 96, ch = 44, clx = x + w / 2 - cw / 2, cly = y - 8 - ch;
    ctx.fillStyle = '#0a0d0a'; rr(ctx, clx, cly, cw, ch, 5); ctx.fill();
    ctx.fillStyle = env.c > 0.6 ? '#c33' : '#59d06a';
    ctx.font = '700 30px "SF Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var hh = String((env.clockH) % 24).padStart(2, '0');
    var mm = String(env.clockM).padStart(2, '0');
    ctx.fillText(hh + ':' + mm, clx + cw / 2, cly + ch / 2 + 2);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .5;
    ctx.fillText(hh + ':' + mm, clx + cw / 2, cly + ch / 2 + 2); ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function drawDoor(ctx, env) {
    var w = 360, h = 620, x = 800 - w / 2, y = 150;
    ctx.fillStyle = C.woodLo; ctx.fillRect(x - 20, y - 16, w + 40, h + 16);
    var dg = vgrad(ctx, 0, y, y + h, env.hour ? '#241a16' : C.wood, C.woodLo);
    ctx.fillStyle = dg; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 6;
    ctx.strokeRect(x + 34, y + 40, w - 68, 220);
    ctx.strokeRect(x + 34, y + 300, w - 68, 280);
    // light bleeding under the door
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    var ug = ctx.createLinearGradient(0, y + h - 40, 0, y + h + 10);
    var uc = env.hour ? 'rgba(200,60,50,' : 'rgba(210,190,150,';
    ug.addColorStop(0, uc + '0)'); ug.addColorStop(1, uc + (env.hour ? .5 : .22) + ')');
    ctx.fillStyle = ug; ctx.fillRect(x, y + h - 40, w, 46);
    ctx.restore();
    // knob
    ctx.fillStyle = env.hour ? '#d7c9a0' : C.metal;
    ctx.beginPath(); ctx.arc(x + w - 46, y + h / 2, 13, 0, 7); ctx.fill();
    // peephole
    ctx.fillStyle = '#1a1712'; ctx.beginPath(); ctx.arc(x + w / 2, y + 120, 10, 0, 7); ctx.fill();
    ctx.fillStyle = env.hour ? 'rgba(220,120,110,.5)' : 'rgba(120,150,180,.25)';
    ctx.beginPath(); ctx.arc(x + w / 2, y + 120, 5, 0, 7); ctx.fill();
    // hooks + jacket
    ctx.strokeStyle = C.metal; ctx.lineWidth = 5;
    for (var k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 120 + k * 34, y + 90); ctx.lineTo(x - 120 + k * 34, y + 104); ctx.stroke(); }
    ctx.fillStyle = '#2b3946';
    ctx.beginPath(); ctx.moveTo(x - 130, y + 96); ctx.lineTo(x - 78, y + 96); ctx.lineTo(x - 64, y + 250); ctx.lineTo(x - 150, y + 250); ctx.closePath(); ctx.fill();
    // light switch
    ctx.fillStyle = '#c7cdd3'; rr(ctx, x + w + 40, y + 200, 34, 56, 5); ctx.fill();
    ctx.fillStyle = '#8b9299'; ctx.fillRect(x + w + 52, y + (env.lightsOn ? 210 : 228), 10, 18);
    // knocking impact shimmer at the hour
    if (env.hour) {
      var kb = Math.max(0, Math.sin(env.t * 2.2));
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = kb * 0.18;
      ctx.fillStyle = '#ff6a5a'; ctx.fillRect(x, y, w, h); ctx.restore();
    }
  }

  function drawMirror(ctx, env) {
    var w = 190, h = 440, x = 372, y = 270;
    contactShadow(ctx, x + w / 2, y + h + 14, 140, 30, .45);
    ctx.fillStyle = C.woodHi; rr(ctx, x - 16, y - 16, w + 32, h + 32, 10); ctx.fill();
    ctx.fillStyle = '#0c1319'; rr(ctx, x, y, w, h, 4); ctx.fill();
    // reflected room (muted)
    ctx.save();
    rr(ctx, x, y, w, h, 4); ctx.clip();
    ctx.fillStyle = vgrad(ctx, 0, y, y + h, '#16202b', '#0b1118');
    ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .3;
    ctx.fillStyle = C.moon; ctx.fillRect(x + 20, y + 40, 60, h - 120); ctx.restore();
    // your reflection — or not
    var refl = env.reflection; // 0 none,1 you,2 him(stays)
    if (refl >= 1) {
      var sway = Math.sin(env.t * 0.8) * 4;
      ctx.fillStyle = refl === 2 ? 'rgba(3,6,10,.95)' : 'rgba(20,26,34,.9)';
      ctx.beginPath();
      ctx.ellipse(x + w / 2 + sway, y + h * 0.66, 46, 120, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w / 2 + sway, y + h * 0.40, 30, 0, 7); ctx.fill();
      if (refl === 2) {
        ctx.fillStyle = 'rgba(190,205,220,.5)';
        ctx.beginPath(); ctx.arc(x + w / 2 + sway - 10, y + h * 0.38, 3, 0, 7); ctx.arc(x + w / 2 + sway + 10, y + h * 0.38, 3, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
    // glass sheen
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .1;
    ctx.fillStyle = '#dfeaf4';
    quad(ctx, [x + 10, y + 10, x + 70, y + 10, x + 30, y + h - 10, x + 10, y + h - 10]);
    ctx.restore();
  }

  function drawCloset(ctx, env) {
    var w = 452, h = 540, x = 812 - w / 2, y = 202;
    contactShadow(ctx, x + w / 2, y + h + 16, 380, 46, .5);
    ctx.fillStyle = C.woodLo; ctx.fillRect(x - 18, y - 18, w + 36, h + 36);
    for (var d = 0; d < 2; d++) {
      var open = d === 1 ? env.flags.has('closetR') : env.flags.has('closetL');
      var dw = w / 2, dx = x + d * dw;
      if (open) {
        // dark interior
        ctx.fillStyle = '#05080c'; ctx.fillRect(dx, y, dw, h);
        if (d === 1) {
          // the fort
          ctx.save(); ctx.globalCompositeOperation = 'screen';
          var fg = ctx.createRadialGradient(dx + dw / 2, y + h * 0.6, 6, dx + dw / 2, y + h * 0.6, 160);
          fg.addColorStop(0, 'rgba(240,220,160,' + (env.flags.has('flashlight') ? .4 : .12) + ')');
          fg.addColorStop(1, 'rgba(240,220,160,0)');
          ctx.fillStyle = fg; ctx.fillRect(dx, y, dw, h); ctx.restore();
          ctx.fillStyle = '#26313d';
          ctx.beginPath(); ctx.moveTo(dx + 20, y + h); ctx.lineTo(dx + dw / 2, y + h * 0.5); ctx.lineTo(dx + dw - 20, y + h); ctx.closePath(); ctx.fill();
          // crayon text hint
          ctx.fillStyle = 'rgba(200,120,60,.8)'; ctx.font = '20px serif';
          ctx.fillText('3:44 に なったら', dx + 22, y + 60);
          ctx.fillText('ドアを あけて', dx + 22, y + 90);
        } else {
          // coats
          for (var cci = 0; cci < 4; cci++) {
            ctx.fillStyle = ['#2c3a48', '#3a2f2a', '#293036', '#333a30'][cci];
            ctx.beginPath();
            ctx.moveTo(dx + 30 + cci * 60, y + 20);
            ctx.lineTo(dx + 70 + cci * 60, y + 20);
            ctx.lineTo(dx + 62 + cci * 60, y + h * 0.7);
            ctx.lineTo(dx + 38 + cci * 60, y + h * 0.7);
            ctx.closePath(); ctx.fill();
          }
        }
      } else {
        ctx.fillStyle = vgrad(ctx, 0, y, y + h, d === 0 ? C.woodHi : C.wood, C.woodLo);
        ctx.fillRect(dx, y, dw, h);
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 4;
        ctx.strokeRect(dx + 26, y + 30, dw - 52, h - 60);
      }
      ctx.fillStyle = C.metal; ctx.fillRect(dx + (d === 0 ? dw - 26 : 18), y + h / 2 - 30, 8, 60);
    }
  }

  function drawShelf(ctx, env) {
    var x = 344, y = 316, w = 198, h = 448;
    contactShadow(ctx, x + w / 2, y + h + 12, 150, 28, .4);
    ctx.fillStyle = C.woodLo; ctx.fillRect(x, y, w, h);
    var cols = ['#5e2e2e', '#2c3f52', '#37503a', '#5e552f', '#463a52', '#5a3a2c'];
    for (var r = 0; r < 3; r++) {
      var sy = y + 16 + r * 150;
      ctx.fillStyle = C.wood; ctx.fillRect(x, sy + 132, w, 12);
      var bx = x + 12;
      for (var b = 0; b < 5; b++) {
        var bw = 20 + ((r * 5 + b) % 3) * 8, bh = 110 + ((b * 7) % 20);
        ctx.fillStyle = cols[(r * 5 + b) % cols.length];
        ctx.fillRect(bx, sy + 132 - bh, bw, bh);
        ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(bx, sy + 132 - bh, bw, 6);
        bx += bw + 4;
      }
    }
    // hollow gap on middle shelf
    if (env.flags.has('shelfGap')) {
      ctx.fillStyle = '#05080c'; ctx.fillRect(x + 60, y + 16 + 150 + 30, 40, 92);
    }
  }

  function drawDresser(ctx, env) {
    var x = 1064, y = 476, w = 268, h = 290;
    contactShadow(ctx, x + w / 2, y + h + 12, 200, 34, .45);
    ctx.fillStyle = vgrad(ctx, 0, y, y + h, C.woodHi, C.woodLo);
    rr(ctx, x, y, w, h, 6); ctx.fill();
    for (var i = 0; i < 3; i++) {
      var dy = y + 16 + i * 88;
      var opened = env.flags.has('dresser' + i);
      ctx.fillStyle = opened ? '#0a0d11' : C.wood;
      rr(ctx, x + 14, dy, w - 28, 72, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
      ctx.fillStyle = C.metal;
      ctx.beginPath(); ctx.arc(x + w * 0.36, dy + 36, 6, 0, 7); ctx.arc(x + w * 0.64, dy + 36, 6, 0, 7); ctx.fill();
    }
  }

  function drawRug(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(70,45,45,.5)';
    quad(ctx, [560, 800, 1040, 800, 1180, 980, 420, 980]);
    ctx.strokeStyle = 'rgba(150,110,90,.25)'; ctx.lineWidth = 6;
    quad(ctx, [600, 820, 1000, 820, 1110, 950, 490, 950]);
    ctx.restore();
  }

  function drawPoster(ctx, env, cx, cy) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.015);
    ctx.fillStyle = '#101820'; ctx.fillRect(-110, -150, 220, 300);
    var g = ctx.createLinearGradient(0, -150, 0, 150);
    g.addColorStop(0, '#243447'); g.addColorStop(1, '#0e1620');
    ctx.fillStyle = g; ctx.fillRect(-104, -144, 208, 288);
    ctx.fillStyle = 'rgba(160,190,220,.5)';
    ctx.beginPath(); ctx.moveTo(-40, 90); ctx.lineTo(0, -60); ctx.lineTo(40, 90); ctx.closePath(); ctx.fill();
    // peeled corner revealing tally
    if (env.flags.has('posterPeel')) {
      ctx.fillStyle = C.wallHi;
      ctx.beginPath(); ctx.moveTo(60, -144); ctx.lineTo(104, -144); ctx.lineTo(104, -90); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C.red; ctx.lineWidth = 2;
      for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(66 + i * 5, -136); ctx.lineTo(66 + i * 5, -118); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(64, -128); ctx.lineTo(90, -126); ctx.stroke();
    }
    ctx.restore();
  }

  function drawCalendar(ctx, env, cx, cy) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = '#c9be9c'; ctx.fillRect(-70, -90, 140, 180);
    ctx.fillStyle = '#8a1f1f'; ctx.fillRect(-70, -90, 140, 34);
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1;
    for (var r = 0; r < 5; r++) for (var c = 0; c < 7; c++) {
      ctx.strokeRect(-66 + c * 19, -50 + r * 26, 19, 26);
    }
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    for (var i = 0; i < 12; i++) {
      var gx = -60 + (i % 7) * 19, gy = -44 + ((i / 7) | 0) * 26;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 12, gy + 16);
      ctx.moveTo(gx + 12, gy); ctx.lineTo(gx, gy + 16); ctx.stroke();
    }
    ctx.strokeStyle = C.red; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(-60 + 5 * 19 + 6, -44 + 2 * 26 + 8, 13, 0, 7); ctx.stroke();
    ctx.restore();
  }

  function drawVent(ctx, cx, cy) {
    ctx.fillStyle = '#20272e'; ctx.fillRect(cx - 60, cy - 34, 120, 68);
    ctx.strokeStyle = '#12171c'; ctx.lineWidth = 4;
    for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(cx - 52, cy - 24 + i * 12); ctx.lineTo(cx + 52, cy - 24 + i * 12); ctx.stroke(); }
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    var g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 60);
    g.addColorStop(0, 'rgba(120,160,200,.10)'); g.addColorStop(1, 'rgba(120,160,200,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - 60, cy - 40, 120, 90); ctx.restore();
  }

  function drawFloorboard(ctx, env) {
    var x = 900, y = 890;
    if (env.flags.has('floorboard')) {
      ctx.fillStyle = '#05080c'; ctx.save();
      ctx.translate(x, y); ctx.transform(1, 0, -0.5, 1, 0, 0);
      ctx.fillRect(-70, -20, 140, 40); ctx.restore();
    } else {
      ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, -0.5, 1, 0, 0);
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
      ctx.strokeRect(-70, -20, 140, 40); ctx.restore();
    }
  }

  // ============ 追加の家具（家のほかの部屋） ============
  function drawInnerDoor(ctx, env, cx, o) {
    o = o || {};
    var w = o.w || 300, h = o.h || 600, x = cx - w / 2, y = o.y || 170;
    ctx.fillStyle = C.woodLo; ctx.fillRect(x - 16, y - 14, w + 32, h + 14);
    ctx.fillStyle = vgrad(ctx, 0, y, y + h, o.dark ? '#241a16' : C.wood, C.woodLo);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 5;
    ctx.strokeRect(x + 28, y + 34, w - 56, 200);
    ctx.strokeRect(x + 28, y + 260, w - 56, h - 300);
    ctx.fillStyle = C.metal;
    ctx.beginPath(); ctx.arc(x + w - 36, y + h / 2, 11, 0, 7); ctx.fill();
    if (o.ajar) { // 隙間から暗い部屋
      ctx.fillStyle = '#04060a'; ctx.fillRect(x, y, 46, h);
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      var g = ctx.createLinearGradient(x, 0, x + 60, 0);
      g.addColorStop(0, 'rgba(150,180,210,.10)'); g.addColorStop(1, 'rgba(150,180,210,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, 60, h); ctx.restore();
    }
    if (o.underGlow) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      var ug = ctx.createLinearGradient(0, y + h - 36, 0, y + h + 8);
      ug.addColorStop(0, o.underGlow + '0)'); ug.addColorStop(1, o.underGlow + '.4)');
      ctx.fillStyle = ug; ctx.fillRect(x, y + h - 36, w, 42); ctx.restore();
    }
    if (o.label) {
      ctx.fillStyle = 'rgba(210,220,228,.5)'; ctx.font = '18px serif'; ctx.textAlign = 'center';
      ctx.fillText(o.label, cx, y - 24); ctx.textAlign = 'left';
    }
  }

  function drawPhotoRow(ctx, env, y) {
    // 家族写真。時間がたつほど弟の顔が黒く塗りつぶされる
    var scratch = env.clock > 150 ? 1 : 0;
    for (var i = 0; i < 3; i++) {
      var cx = 440 + i * 180, w = 128, h = 98;
      ctx.save(); ctx.translate(cx, y); ctx.rotate((i % 2 ? 1 : -1) * 0.02);
      ctx.fillStyle = '#20242b'; ctx.fillRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16);
      ctx.fillStyle = '#ccc3ab'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#2b3a48'; ctx.fillRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
      // 2 figures: 兄(大)・弟(小)
      ctx.fillStyle = '#516072';
      ctx.beginPath(); ctx.ellipse(-16, 18, 14, 30, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(-16, -14, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#5b5a48';
      ctx.beginPath(); ctx.ellipse(18, 24, 10, 20, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(18, 4, 8, 0, 7); ctx.fill();
      if (scratch) {
        ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 3;
        for (var s = 0; s < 9; s++) {
          ctx.beginPath();
          ctx.moveTo(6 + Math.random() * 24, -8 + Math.random() * 26);
          ctx.lineTo(6 + Math.random() * 24, -8 + Math.random() * 26); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawPhoneStand(ctx, env) {
    var x = 360, y = 590, w = 200, h = 150;
    contactShadow(ctx, x + w / 2, y + h + 10, 150, 28, .45);
    ctx.fillStyle = vgrad(ctx, 0, y, y + h, C.woodHi, C.woodLo);
    rr(ctx, x, y, w, h, 5); ctx.fill();
    // old phone
    ctx.fillStyle = '#22262b'; rr(ctx, x + 40, y - 40, 110, 44, 8); ctx.fill();
    ctx.fillStyle = '#15181c'; rr(ctx, x + 48, y - 58, 94, 22, 10); ctx.fill();
    // memo pad
    ctx.save(); ctx.translate(x + 168, y - 8); ctx.rotate(0.1);
    ctx.fillStyle = '#d9cfa8'; ctx.fillRect(-22, -16, 44, 32); ctx.restore();
  }

  function drawHeightMarks(ctx, cx, y) {
    ctx.strokeStyle = 'rgba(30,24,18,.8)'; ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(60,50,40,.9)'; ctx.font = '12px serif';
    var hs = [[0, '兄6'], [-40, '兄8'], [-92, '兄10'], [-150, '兄13'], [-70, '弟7']];
    for (var i = 0; i < hs.length; i++) {
      var yy = y + hs[i][0];
      ctx.beginPath(); ctx.moveTo(cx - 16, yy); ctx.lineTo(cx + 16, yy); ctx.stroke();
      ctx.fillText(hs[i][1], cx + 22, yy + 4);
    }
  }

  function drawButsudan(ctx, env) {
    var x = 600, y = 250, w = 400, h = 470;
    contactShadow(ctx, x + w / 2, y + h + 14, 300, 40, .5);
    ctx.fillStyle = '#1c1510'; rr(ctx, x - 14, y - 14, w + 28, h + 28, 8); ctx.fill();
    // interior gold
    var ig = vgrad(ctx, 0, y, y + h, '#5a4420', '#2a2012');
    ctx.fillStyle = ig; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .3;
    ctx.fillStyle = '#c79a3e'; ctx.fillRect(x + 30, y + 20, w - 60, h - 140); ctx.restore();
    // photo of the boy (blurred → clear with corruption... but it's the boy either way)
    ctx.fillStyle = '#e8e0cf'; ctx.fillRect(x + w / 2 - 60, y + 90, 120, 150);
    ctx.fillStyle = '#3a4654';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 210, 30, 46, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w / 2, y + 150, 26, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x + w / 2 - 60, y + 90, 120, 150);
    // candles + incense glow
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    var cg = ctx.createRadialGradient(x + w / 2, y + h - 90, 4, x + w / 2, y + h - 90, 120);
    cg.addColorStop(0, 'rgba(240,190,110,.5)'); cg.addColorStop(1, 'rgba(240,190,110,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x + w / 2, y + h - 90, 120, 0, 7); ctx.fill();
    ctx.restore();
    // rising incense smoke
    ctx.save(); ctx.globalAlpha = .12; ctx.strokeStyle = '#cbd3da'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + w / 2, y + h - 100);
    for (var k = 0; k < 8; k++) ctx.lineTo(x + w / 2 + Math.sin(env.t * 1.2 + k) * (6 + k * 2), y + h - 100 - k * 22);
    ctx.stroke(); ctx.restore();
    // orin bell
    ctx.fillStyle = '#8a7a3a'; ctx.beginPath(); ctx.arc(x + 60, y + h - 40, 16, Math.PI, 0); ctx.fill();
  }

  function drawKotatsu(ctx, env) {
    var x = 560, y = 640, w = 520, h = 60;
    contactShadow(ctx, x + w / 2, y + 150, 340, 50, .45);
    // blanket
    ctx.fillStyle = vgrad(ctx, 0, y, y + 180, '#6a5747', '#2e251d');
    quad(ctx, [x - 40, y, x + w + 40, y, x + w + 110, y + 200, x - 110, y + 200]);
    // tabletop
    ctx.fillStyle = vgrad(ctx, 0, y - 24, y, C.woodHi, C.wood);
    ctx.fillRect(x - 30, y - 24, w + 60, 26);
    // two zabuton
    ctx.fillStyle = '#4a3b3b'; rr(ctx, x - 130, y + 120, 130, 70, 12); ctx.fill();
    ctx.fillStyle = '#3f3a30'; rr(ctx, x + w, y + 120, 130, 70, 12); ctx.fill();
    // a dent on the far one (someone sat there)
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x + w + 65, y + 150, 44, 20, 0, 0, 7); ctx.fill();
  }

  var _crtStatic = null, _crtN = 0;
  function drawCRT(ctx, env) {
    var x = 1050, y = 470, w = 300, h = 250;
    var sw = w - 60, sh = h - 70;
    contactShadow(ctx, x + w / 2, y + h + 30, 220, 40, .45);
    ctx.fillStyle = '#161a1e'; rr(ctx, x, y, w, h, 14); ctx.fill();
    // 砂嵐はオフスクリーンにためて、数フレームおきに描き替える
    if (!_crtStatic) { _crtStatic = document.createElement('canvas'); _crtStatic.width = sw; _crtStatic.height = sh; }
    if ((_crtN++ % 4) === 0) {
      var sx = _crtStatic.getContext('2d');
      sx.fillStyle = '#0b0e12'; sx.fillRect(0, 0, sw, sh);
      sx.globalAlpha = .5;
      for (var i = 0; i < 140; i++) {
        sx.fillStyle = Math.random() < .5 ? '#3a4048' : '#12161b';
        sx.fillRect(Math.random() * sw, Math.random() * sh, 3, 2);
      }
      sx.globalAlpha = 1;
    }
    ctx.save(); rr(ctx, x + 24, y + 24, sw, sh, 8); ctx.clip();
    ctx.drawImage(_crtStatic, x + 24, y + 24);
    ctx.fillStyle = 'rgba(200,210,220,.28)'; ctx.font = '13px serif';
    var tx = ((-env.t * 40) % 600);
    ctx.fillText('午前3時44分ごろ　市道で　小学生が　軽乗用車に', x + 30 + tx, y + h - 62);
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    var sg = ctx.createRadialGradient(x + w / 2 - 15, y + h / 2 - 15, 10, x + w / 2 - 15, y + h / 2 - 15, 260);
    sg.addColorStop(0, 'rgba(120,150,180,.14)'); sg.addColorStop(1, 'rgba(120,150,180,0)');
    ctx.fillStyle = sg; ctx.fillRect(x - 60, y - 60, w + 120, h + 120); ctx.restore();
    // legs
    ctx.fillStyle = C.woodLo; ctx.fillRect(x + 30, y + h, 20, 40); ctx.fillRect(x + w - 50, y + h, 20, 40);
  }

  function drawWallClock(ctx, env, cx, cy) {
    ctx.fillStyle = '#1a1a1e'; ctx.beginPath(); ctx.arc(cx, cy, 66, 0, 7); ctx.fill();
    ctx.fillStyle = '#d9d3c4'; ctx.beginPath(); ctx.arc(cx, cy, 56, 0, 7); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * 46, cy - Math.cos(a) * 46);
      ctx.lineTo(cx + Math.sin(a) * 52, cy - Math.cos(a) * 52); ctx.stroke();
    }
    // stopped at 3:44
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(2 * Math.PI * (3.73 / 12)) * 30, cy - Math.cos(2 * Math.PI * (3.73 / 12)) * 30); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(2 * Math.PI * (44 / 60)) * 44, cy - Math.cos(2 * Math.PI * (44 / 60)) * 44); ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill();
  }

  function drawTatami(ctx) {
    var fg = ctx.createLinearGradient(0, 760, 0, VH);
    fg.addColorStop(0, '#3a3a2a'); fg.addColorStop(1, '#181811');
    quad(ctx, [320, 760, 1280, 760, VW, VH, 0, VH], fg);
    ctx.save(); ctx.globalAlpha = .35; ctx.strokeStyle = '#0d0d08'; ctx.lineWidth = 3;
    for (var i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(800 + i * 150, 760); ctx.lineTo(800 + i * 300, VH); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, 880); ctx.lineTo(VW, 880); ctx.stroke();
    ctx.restore();
  }

  function drawFuton(ctx, env) {
    var x = 560, y = 640, w = 560, h = 200;
    contactShadow(ctx, x + w / 2, y + h + 10, 360, 40, .4);
    ctx.fillStyle = vgrad(ctx, 0, y, y + h, '#c9c0ac', '#8f887a');
    rr(ctx, x, y, w, h, 16); ctx.fill();
    // 掛け布団 — めくれて、人の形に へこんでいる
    ctx.fillStyle = vgrad(ctx, 0, y - 10, y + h, '#5b6470', '#2c333c');
    ctx.beginPath();
    ctx.moveTo(x + 20, y + h); ctx.lineTo(x + 20, y + 40);
    ctx.bezierCurveTo(x + 160, y - 30, x + 420, y + 10, x + w - 20, y + 60);
    ctx.lineTo(x + w - 20, y + h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x + 60, y + 120);
    ctx.bezierCurveTo(x + 240, y + 80, x + 380, y + 150, x + w - 60, y + 110); ctx.stroke();
    // pillow
    ctx.fillStyle = '#ded7c6'; rr(ctx, x + 40, y + 20, 150, 60, 18); ctx.fill();
  }

  function drawShrineShelf(ctx, env) {
    var x = 480, y = 300, w = 640, h = 300;
    contactShadow(ctx, x + w / 2, y + h + 10, 320, 26, .35);
    ctx.fillStyle = C.woodLo; ctx.fillRect(x, y, w, 16);
    ctx.fillStyle = C.woodLo; ctx.fillRect(x, y + h - 16, w, 16);
    // many small photos of the boy — faces intact
    for (var i = 0; i < 10; i++) {
      var px = x + 40 + (i % 5) * 120, py = y + 30 + ((i / 5) | 0) * 150;
      ctx.save(); ctx.translate(px, py); ctx.rotate((i % 3 - 1) * 0.03);
      ctx.fillStyle = '#241f18'; ctx.fillRect(-42, -34, 84, 68);
      ctx.fillStyle = '#cdb18a'; ctx.fillRect(-36, -28, 72, 56);
      ctx.fillStyle = '#54606e'; ctx.beginPath(); ctx.arc(0, 6, 15, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 34, 18, 16, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    // two candle glows
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    [x + 30, x + w - 30].forEach(function (cx2) {
      var g = ctx.createRadialGradient(cx2, y + h - 30, 3, cx2, y + h - 30, 70);
      g.addColorStop(0, 'rgba(240,200,120,.5)'); g.addColorStop(1, 'rgba(240,200,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx2, y + h - 30, 70, 0, 7); ctx.fill();
    });
    ctx.restore();
  }

  function drawFrontDoor(ctx, env) {
    var w = 420, h = 720, x = 800 - w / 2, y = 90;
    ctx.fillStyle = '#161b20'; ctx.fillRect(x - 26, y - 16, w + 52, h + 16);
    ctx.fillStyle = vgrad(ctx, 0, y, y + h, env.hour ? '#2a1e18' : '#3a3a40', '#181a1e');
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 6;
    ctx.strokeRect(x + 40, y + 60, w - 80, 240);
    // frosted glass panel
    ctx.fillStyle = 'rgba(150,170,190,.14)'; ctx.fillRect(x + 52, y + 72, w - 104, 216);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    var og = ctx.createLinearGradient(0, y, 0, y + 320);
    og.addColorStop(0, 'rgba(150,180,210,' + (0.18 * (1 - env.c * .5)) + ')');
    og.addColorStop(1, 'rgba(150,180,210,0)');
    ctx.fillStyle = og; ctx.fillRect(x + 52, y + 72, w - 104, 216);
    ctx.restore();
    // a silhouette behind the glass as the hour nears
    if (env.figureState === 2 || env.hour) {
      ctx.fillStyle = 'rgba(10,14,20,' + (env.hour ? .8 : .4) + ')';
      ctx.beginPath(); ctx.ellipse(800, y + 210, 30, 78, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(800, y + 120, 24, 0, 7); ctx.fill();
    }
    // mail slot, chain, knob
    ctx.fillStyle = '#0e1013'; ctx.fillRect(x + w / 2 - 50, y + 430, 100, 20);
    ctx.strokeStyle = C.metal; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 30, y + 360); ctx.lineTo(x + 90, y + 380); ctx.stroke();
    ctx.fillStyle = env.hour ? '#d7c9a0' : C.metal;
    ctx.beginPath(); ctx.arc(x + 44, y + h / 2 + 40, 14, 0, 7); ctx.fill();
    // under-door light
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    var ug = ctx.createLinearGradient(0, y + h - 44, 0, y + h + 10);
    var uc = env.hour ? 'rgba(210,70,55,' : 'rgba(150,175,205,';
    ug.addColorStop(0, uc + '0)'); ug.addColorStop(1, uc + (env.hour ? .55 : .2) + ')');
    ctx.fillStyle = ug; ctx.fillRect(x, y + h - 44, w, 50); ctx.restore();
    if (env.hour) {
      var kb = Math.max(0, Math.sin(env.t * 2.2));
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = kb * 0.2;
      ctx.fillStyle = '#ff6a5a'; ctx.fillRect(x, y, w, h); ctx.restore();
    }
    // doormat「おかえり」
    ctx.fillStyle = '#3a3226'; quad(ctx, [x + 40, y + h + 30, x + w - 40, y + h + 30, x + w + 40, y + h + 110, x - 40, y + h + 110]);
    ctx.fillStyle = 'rgba(210,200,170,.55)'; ctx.font = '30px serif'; ctx.textAlign = 'center';
    ctx.fillText('おかえり', 800, y + h + 88); ctx.textAlign = 'left';
    // intercom panel
    ctx.fillStyle = '#c9cdd2'; rr(ctx, x + w + 20, y + 300, 44, 70, 6); ctx.fill();
    ctx.fillStyle = env.hour ? '#e05a4a' : '#2a2f34'; ctx.beginPath(); ctx.arc(x + w + 42, y + 345, 8, 0, 7); ctx.fill();
  }

  function drawGetabako(ctx, env) {
    var x = 470, y = 430, w = 360, h = 320;
    contactShadow(ctx, x + w / 2, y + h + 10, 240, 28, .4);
    ctx.fillStyle = vgrad(ctx, 0, y, y + h, C.woodHi, C.woodLo);
    rr(ctx, x, y, w, h, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 3;
    for (var r = 0; r < 3; r++) for (var c = 0; c < 2; c++) ctx.strokeRect(x + 14 + c * (w / 2 - 4), y + 14 + r * (h / 3 - 4), w / 2 - 24, h / 3 - 22);
    // 弟の靴、外向きに そろえてある
    ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.ellipse(x + w / 2 - 30, y - 6, 26, 12, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w / 2 + 26, y - 6, 26, 12, 0, 0, 7); ctx.fill();
    // umbrella stand
    ctx.fillStyle = '#2a2f34'; rr(ctx, x + w + 30, y + 120, 60, 200, 8); ctx.fill();
    ctx.strokeStyle = '#4a4038'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x + w + 60, y + 130); ctx.lineTo(x + w + 54, y - 30); ctx.stroke();
  }

  function drawGenkanStep(ctx) {
    // 三和土（下がった土間）と上がり框
    ctx.fillStyle = '#0e0f12';
    quad(ctx, [0, 830, VW, 830, VW, VH, 0, VH]);
    ctx.fillStyle = C.woodLo; ctx.fillRect(0, 812, VW, 22);
  }

  function jpWallRim(ctx, env) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = env.lightsOn ? .03 : .09 * (1 - env.c * .6);
    ctx.fillStyle = C.moon; ctx.fillRect(300, 180, 90, 580); ctx.restore();
  }

  // ================= VIEWS =================
  // returns hotspot list [{id,x,y,w,h,name}]  (virtual coords)
  // goto つき hotspot はゲーム側で移動として処理される
  var VIEWS = {
    bd_n: function (ctx, env) {
      var b = paintShell(ctx, env);
      moonFloor(ctx, env);
      drawWindow(ctx, env);
      drawDesk(ctx, env);
      dust(ctx, env);
      return [
        { id: 'window_out', x: 640, y: 270, w: 320, h: 240, name: '窓の外を見る' },
        { id: 'window_latch', x: 640, y: 520, w: 320, h: 40, name: '窓の鍵' },
        { id: 'curtain', x: 560, y: 240, w: 90, h: 380, name: 'カーテン' },
        { id: 'desk_drawerL', x: 600, y: 616, w: 170, h: 90, name: '左の引き出し' },
        { id: 'desk_drawerR', x: 790, y: 616, w: 170, h: 90, name: '右の引き出し' },
        { id: 'desk_papers', x: 640, y: 540, w: 220, h: 30, name: '机の上の紙' },
        { id: 'desk_drawing', x: 840, y: 545, w: 130, h: 30, name: 'らくがき' },
        { id: 'desk_lamp', x: 460, y: 410, w: 90, h: 90, name: 'デスクライト' },
        { id: 'under_desk', x: 590, y: 730, w: 200, h: 60, name: '机の下' },
      ];
    },
    bd_e: function (ctx, env) {
      paintShell(ctx, env);
      // faint moon rim from the left
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = env.lightsOn ? .04 : .12 * (1 - env.c * .6);
      ctx.fillStyle = C.moon; ctx.fillRect(300, 180, 120, 580); ctx.restore();
      drawRug(ctx);
      drawBed(ctx, env);
      drawNightstand(ctx, env);
      drawPoster(ctx, env, 720, 330);
      lampPool(ctx, 1210, 520, 260, env);
      return [
        { id: 'pillow', x: 560, y: 470, w: 220, h: 100, name: 'まくら' },
        { id: 'photo', x: 590, y: 470, w: 90, h: 70, name: '写真' },
        { id: 'under_bed', x: 860, y: 770, w: 170, h: 60, name: 'ベッドの下' },
        { id: 'sheets', x: 700, y: 560, w: 300, h: 180, name: 'シーツ' },
        { id: 'ns_lamp', x: 1160, y: 440, w: 110, h: 110, name: 'ナイトスタンドの明かり' },
        { id: 'ns_drawer', x: 1136, y: 584, w: 148, h: 60, name: 'ナイトスタンドの引き出し' },
        { id: 'digital_clock', x: 1160, y: 508, w: 100, h: 44, name: '目ざまし時計' },
        { id: 'poster', x: 610, y: 180, w: 220, h: 300, name: 'ポスター' },
        { id: 'bed_head', x: 430, y: 320, w: 70, h: 150, name: 'ヘッドボード' },
      ];
    },
    bd_s: function (ctx, env) {
      paintShell(ctx, env);
      drawDoor(ctx, env);
      drawMirror(ctx, env);
      drawCalendar(ctx, env, 1120, 360);
      return [
        { id: 'peephole', x: 782, y: 252, w: 36, h: 36, name: 'のぞき穴' },
        { id: 'jacket', x: 470, y: 220, w: 120, h: 190, name: '上着' },
        { id: 'switch', x: 1006, y: 336, w: 52, h: 74, name: '電気のスイッチ' },
        { id: 'calendar', x: 1050, y: 270, w: 140, h: 180, name: 'カレンダー' },
        { id: 'mirror', x: 356, y: 254, w: 224, h: 480, name: '姿見' },
        { id: 'floor_scuff', x: 700, y: 800, w: 300, h: 120, name: '床のこすれ跡' },
        { id: 'door', x: 620, y: 150, w: 360, h: 620, name: 'ドア', goto: 'hw_doors' },
      ];
    },
    bd_w: function (ctx, env) {
      paintShell(ctx, env);
      drawCloset(ctx, env);
      drawShelf(ctx, env);
      drawDresser(ctx, env);
      drawVent(ctx, 452, 250);
      drawFloorboard(ctx, env);
      return [
        { id: 'shelf_gap', x: 400, y: 500, w: 48, h: 96, name: '本の奥' },
        { id: 'shelf_books', x: 344, y: 316, w: 198, h: 448, name: '本だな' },
        { id: 'vent', x: 392, y: 216, w: 120, h: 68, name: '通気口' },
        { id: 'closetL', x: 586, y: 202, w: 226, h: 540, name: '押し入れ（左）' },
        { id: 'closetR', x: 812, y: 202, w: 226, h: 540, name: '押し入れ（右）' },
        { id: 'dresser0', x: 1064, y: 492, w: 268, h: 74, name: 'たんす・上段' },
        { id: 'dresser1', x: 1064, y: 580, w: 268, h: 74, name: 'たんす・中段' },
        { id: 'dresser2', x: 1064, y: 668, w: 268, h: 74, name: 'たんす・下段' },
        { id: 'floorboard', x: 800, y: 830, w: 200, h: 90, name: 'ゆかいた' },
      ];
    },

    // ---------------- 廊下 ----------------
    hw_doors: function (ctx, env) {
      paintShell(ctx, env);
      drawInnerDoor(ctx, env, 560, { w: 250, h: 570, label: '弟の部屋' });
      drawInnerDoor(ctx, env, 1000, { w: 250, h: 570, label: 'お母さん' });
      drawHeightMarks(ctx, 785, 640);
      drawInnerDoor(ctx, env, 1285, { w: 180, h: 560, label: '洗面所', underGlow: 'rgba(150,175,205,' });
      return [
        { id: 'to_bedroom', x: 445, y: 190, w: 230, h: 560, name: '弟の部屋へ戻る', goto: 'bd_s' },
        { id: 'to_mom', x: 885, y: 190, w: 230, h: 560, name: 'お母さんの部屋へ', goto: 'mo_a' },
        { id: 'washroom', x: 1205, y: 200, w: 195, h: 540, name: '洗面所をのぞく' },
        { id: 'heightmarks', x: 748, y: 450, w: 76, h: 230, name: '柱のきずあと' },
      ];
    },
    hw_living: function (ctx, env) {
      paintShell(ctx, env);
      drawPhotoRow(ctx, env, 340);
      drawInnerDoor(ctx, env, 1090, { w: 320, h: 630, ajar: true, label: '居間', underGlow: 'rgba(150,175,205,' });
      return [
        { id: 'family_photos', x: 350, y: 270, w: 470, h: 150, name: '家族の写真' },
        { id: 'to_living', x: 935, y: 175, w: 320, h: 630, name: '居間へ入る', goto: 'lv_a' },
      ];
    },
    hw_genkan: function (ctx, env) {
      paintShell(ctx, env);
      drawWindow(ctx, env, 560);
      drawPhoneStand(ctx, env);
      drawInnerDoor(ctx, env, 1060, { w: 320, h: 640, ajar: true, label: '玄関', underGlow: env.hour ? 'rgba(210,70,55,' : 'rgba(150,175,205,' });
      return [
        { id: 'hall_window', x: 400, y: 270, w: 320, h: 230, name: '窓の外' },
        { id: 'phone', x: 360, y: 520, w: 150, h: 90, name: '電話' },
        { id: 'phone_memo', x: 520, y: 560, w: 80, h: 60, name: 'メモ帳' },
        { id: 'to_genkan', x: 900, y: 180, w: 320, h: 640, name: '玄関へ行く', goto: 'gk_door' },
      ];
    },

    // ---------------- 居間 ----------------
    lv_a: function (ctx, env) {
      paintShell(ctx, env);
      drawTatami(ctx);
      drawButsudan(ctx, env);
      drawWallClock(ctx, env, 1180, 320);
      return [
        { id: 'butsudan_photo', x: 720, y: 330, w: 160, h: 170, name: '仏壇の写真' },
        { id: 'butsudan', x: 590, y: 240, w: 420, h: 400, name: '仏壇' },
        { id: 'orin', x: 600, y: 630, w: 100, h: 80, name: 'おりん' },
        { id: 'living_clock', x: 1116, y: 256, w: 130, h: 130, name: '掛け時計' },
        { id: 'lv_exit', x: 240, y: 760, w: 320, h: 200, name: '廊下へ出る', goto: 'hw_living' },
      ];
    },
    lv_b: function (ctx, env) {
      paintShell(ctx, env);
      drawTatami(ctx);
      drawKotatsu(ctx, env);
      drawCRT(ctx, env);
      return [
        { id: 'zabuton_far', x: 1050, y: 740, w: 170, h: 100, name: '奥の座布団' },
        { id: 'tv', x: 1050, y: 460, w: 320, h: 280, name: 'テレビ' },
        { id: 'tea', x: 880, y: 680, w: 90, h: 70, name: '湯のみ' },
        { id: 'kotatsu', x: 470, y: 610, w: 560, h: 240, name: 'こたつ' },
        { id: 'lv_exit_b', x: 210, y: 300, w: 240, h: 440, name: '廊下へ出る', goto: 'hw_living' },
      ];
    },

    // ---------------- お母さんの部屋 ----------------
    mo_a: function (ctx, env) {
      paintShell(ctx, env);
      drawTatami(ctx);
      jpWallRim(ctx, env);
      drawFuton(ctx, env);
      drawCalendar(ctx, env, 1180, 360);
      return [
        { id: 'mom_pills', x: 520, y: 650, w: 130, h: 80, name: '枕もとの薬' },
        { id: 'futon', x: 540, y: 620, w: 580, h: 240, name: '布団' },
        { id: 'mom_calendar', x: 1110, y: 270, w: 140, h: 190, name: 'カレンダー' },
        { id: 'mo_exit', x: 220, y: 300, w: 240, h: 440, name: '廊下へ出る', goto: 'hw_doors' },
      ];
    },
    mo_b: function (ctx, env) {
      paintShell(ctx, env);
      drawTatami(ctx);
      drawShrineShelf(ctx, env);
      return [
        { id: 'shrine_drawer', x: 700, y: 605, w: 200, h: 70, name: '小さな引き出し' },
        { id: 'shrine_photos', x: 470, y: 290, w: 660, h: 300, name: '弟の写真' },
        { id: 'mo_exit_b', x: 220, y: 300, w: 240, h: 440, name: '廊下へ出る', goto: 'hw_doors' },
      ];
    },

    // ---------------- 玄関 ----------------
    gk_door: function (ctx, env) {
      paintShell(ctx, env);
      drawGenkanStep(ctx);
      drawFrontDoor(ctx, env);
      return [
        { id: 'front_peephole', x: 772, y: 300, w: 56, h: 56, name: 'のぞき穴' },
        { id: 'intercom', x: 1016, y: 378, w: 66, h: 96, name: 'インターホン' },
        { id: 'doormat', x: 560, y: 800, w: 480, h: 120, name: 'マット' },
        { id: 'front_door', x: 590, y: 90, w: 420, h: 700, name: '玄関の扉' },
      ];
    },
    gk_side: function (ctx, env) {
      paintShell(ctx, env);
      drawGenkanStep(ctx);
      drawGetabako(ctx, env);
      return [
        { id: 'brother_shoes', x: 580, y: 396, w: 180, h: 70, name: 'そろえられた靴' },
        { id: 'getabako', x: 470, y: 430, w: 360, h: 320, name: '下駄箱' },
        { id: 'umbrella', x: 850, y: 400, w: 120, h: 330, name: '傘立て' },
        { id: 'gk_exit', x: 1050, y: 300, w: 300, h: 440, name: '廊下へ戻る', goto: 'hw_genkan' },
      ];
    },
  };

  var LOCS = {
    bedroom: { name: '弟の部屋', views: ['bd_n', 'bd_e', 'bd_s', 'bd_w'] },
    hallway: { name: '廊下', views: ['hw_living', 'hw_doors', 'hw_genkan'] },
    living: { name: '居間', views: ['lv_a', 'lv_b'] },
    mom: { name: 'お母さんの部屋', views: ['mo_a', 'mo_b'] },
    genkan: { name: '玄関', views: ['gk_door', 'gk_side'] },
  };
  function locOf(viewId) {
    for (var k in LOCS) if (LOCS[k].views.indexOf(viewId) >= 0) return k;
    return 'bedroom';
  }

  // シーン（家具まで）はオフスクリーンにキャッシュし、状態が変わった時と
  // 数フレームおきだけ再描画する。毎フレームは 1 回の drawImage で済む。
  var _sc = { cv: null, cx: null, key: null, hs: null, n: 0 };
  function paint(ctx, view, env) {
    if (!_sc.cv) {
      _sc.cv = document.createElement('canvas');
      _sc.cv.width = VW; _sc.cv.height = VH;
      _sc.cx = _sc.cv.getContext('2d');
    }
    var key = view + '|' + env.lightsOn + '|' + env.lampsOn + '|' + env.figureState +
      '|' + env.reflection + '|' + env.hour + '|' + env.flags.size + '|' + Math.floor(env.clock / 5);
    if (key !== _sc.key || (_sc.n++ % 3) === 0) {
      _sc.cx.setTransform(1, 0, 0, 1, 0, 0);
      _sc.cx.clearRect(0, 0, VW, VH);
      _sc.hs = VIEWS[view](_sc.cx, env);
      _sc.key = key;
    }
    ctx.drawImage(_sc.cv, 0, 0);
    corruption(ctx, env);
    grain(ctx, env);
    return _sc.hs;
  }

  // ---- inspect close-up art ----
  function insBG(ctx) {
    var g = ctx.createLinearGradient(0, 0, 0, 350);
    g.addColorStop(0, '#0c1219'); g.addColorStop(1, '#070a0f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 560, 350);
  }
  function note(ctx, lines) {
    insBG(ctx);
    ctx.save(); ctx.translate(280, 175); ctx.rotate(-0.02);
    ctx.fillStyle = '#d3c095'; ctx.fillRect(-190, -140, 380, 280);
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(-190, -140, 380, 12);
    ctx.fillStyle = '#2c2214'; ctx.font = '17px "Hiragino Mincho ProN", serif';
    ctx.textAlign = 'left';
    lines.forEach(function (l, i) { ctx.fillText(l, -168, -104 + i * 30); });
    ctx.restore();
  }
  var INSPECT = {
    photo: function (ctx, env) {
      insBG(ctx);
      ctx.save(); ctx.translate(280, 175); ctx.rotate(0.02);
      ctx.fillStyle = '#efe7d4'; ctx.fillRect(-150, -110, 300, 220);
      ctx.fillStyle = '#1e2a33'; ctx.fillRect(-134, -94, 268, 150);
      // three figures, one scratched
      ['#4a5b47', '#6b5a4a', '#3f5266'].forEach(function (c, i) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(-70 + i * 70, 20, 22, 46, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(-70 + i * 70, -34, 15, 0, 7); ctx.fill();
      });
      ctx.strokeStyle = '#7a1414'; ctx.lineWidth = 3;
      for (var s = 0; s < 12; s++) {
        ctx.beginPath();
        ctx.moveTo(-90 + Math.random() * 40, -60 + Math.random() * 90);
        ctx.lineTo(-90 + Math.random() * 40, -60 + Math.random() * 90);
        ctx.stroke();
      }
      ctx.fillStyle = '#3a2f1c'; ctx.font = '14px serif';
      ctx.fillText('なつやすみ', -40, 92);
      ctx.restore();
    },
    digital_clock: function (ctx, env) {
      insBG(ctx);
      ctx.fillStyle = '#0a0d0a'; rr(ctx, 130, 110, 300, 130, 12); ctx.fill();
      ctx.fillStyle = env.c > 0.6 ? '#d23' : '#59d06a';
      ctx.font = '700 78px "SF Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(env.clockH % 24).padStart(2, '0') + ':' + String(env.clockM).padStart(2, '0'), 280, 176);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    },
    mirror: function (ctx, env) {
      insBG(ctx);
      ctx.fillStyle = '#0c1319'; rr(ctx, 150, 30, 260, 300, 6); ctx.fill();
      ctx.save(); rr(ctx, 150, 30, 260, 300, 6); ctx.clip();
      ctx.fillStyle = '#141d27'; ctx.fillRect(150, 30, 260, 300);
      var r = env.reflection;
      if (r >= 1) {
        ctx.fillStyle = r === 2 ? 'rgba(3,6,10,.96)' : 'rgba(24,30,38,.9)';
        ctx.beginPath(); ctx.ellipse(280, 250, 60, 130, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(280, 120, 40, 0, 7); ctx.fill();
        if (r === 2) {
          ctx.fillStyle = 'rgba(200,214,228,.55)';
          ctx.beginPath(); ctx.arc(266, 116, 4, 0, 7); ctx.arc(294, 116, 4, 0, 7); ctx.fill();
        }
      }
      ctx.restore();
    },
    window_out: function (ctx, env) {
      insBG(ctx);
      var g = ctx.createLinearGradient(0, 0, 0, 350);
      g.addColorStop(0, '#0c1a2b'); g.addColorStop(1, '#1b2c3d');
      ctx.fillStyle = g; ctx.fillRect(40, 30, 480, 290);
      ctx.fillStyle = '#e7eef6'; ctx.beginPath(); ctx.arc(420, 90, 20, 0, 7); ctx.fill();
      ctx.fillStyle = '#0a1420'; ctx.fillRect(40, 230, 480, 90);
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      var lg = ctx.createRadialGradient(180, 250, 4, 180, 250, 80);
      lg.addColorStop(0, 'rgba(240,210,150,.7)'); lg.addColorStop(1, 'rgba(240,210,150,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(180, 250, 80, 0, 7); ctx.fill();
      ctx.restore();
      if (env.figureState === 1) {
        ctx.fillStyle = 'rgba(6,10,16,.95)';
        ctx.beginPath(); ctx.ellipse(180, 262, 14, 44, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(180, 220, 12, 0, 7); ctx.fill();
      } else if (env.figureState === 2) {
        ctx.fillStyle = 'rgba(3,6,10,.98)';
        ctx.beginPath(); ctx.ellipse(280, 250, 34, 92, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(280, 150, 26, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = '#6b503a'; ctx.lineWidth = 12; ctx.strokeRect(40, 30, 480, 290);
      ctx.beginPath(); ctx.moveTo(280, 30); ctx.lineTo(280, 320); ctx.moveTo(40, 175); ctx.lineTo(520, 175); ctx.stroke();
    },
    note: function (ctx, env) { note(ctx, env._noteLines || ['']); },
  };
  function paintInspect(ctx, key, env) {
    if (INSPECT[key]) { INSPECT[key](ctx, env); return true; }
    if (env._noteLines) { note(ctx, env._noteLines); return true; }
    return false;
  }

  // ================= エンド演出 =================
  function childFace(ctx, cx, cy, s, cp) {
    cp = cp || 'rgba(214,208,196,';
    var g = ctx.createRadialGradient(cx, cy - s * 0.1, s * 0.15, cx, cy, s * 1.05);
    g.addColorStop(0, cp + '0.98)');
    g.addColorStop(0.6, cp + '0.68)');
    g.addColorStop(1, cp + '0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.7, s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(3,3,5,0.95)';
    ctx.beginPath(); ctx.ellipse(cx - s * 0.28, cy - s * 0.12, s * 0.15, s * 0.2, 0.12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + s * 0.28, cy - s * 0.12, s * 0.15, s * 0.2, -0.12, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(220,230,240,0.45)';
    ctx.beginPath(); ctx.arc(cx - s * 0.25, cy - s * 0.07, s * 0.028, 0, 7); ctx.arc(cx + s * 0.31, cy - s * 0.07, s * 0.028, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(4,4,6,0.92)';
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.42, s * 0.16, s * 0.26, 0, 0, 7); ctx.fill();
  }
  function handPrint(ctx, cx, cy, p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p));
    ctx.fillStyle = (function () {
      var g = ctx.createRadialGradient(cx, cy, 12, cx, cy, 280);
      g.addColorStop(0, 'rgba(206,201,192,0.9)'); g.addColorStop(1, 'rgba(206,201,192,0)');
      return g;
    })();
    ctx.beginPath(); ctx.ellipse(cx, cy + 44, 92, 116, 0, 0, 7); ctx.fill();
    for (var i = 0; i < 5; i++) {
      var ang = -1.15 + i * 0.57;
      var fx = cx + Math.sin(ang) * 122, fy = cy - 74 + (1 - Math.cos(ang)) * 40;
      ctx.beginPath(); ctx.ellipse(fx, fy, 21, 62, ang * 0.55, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function cinema(ctx, cin, env) {
    var t = cin.t, k = cin.key, dur = cin.dur, base = _sc.cv;
    function drawBase(z, fx, fy) {
      if (!base) { ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, VW, VH); return; }
      if (z && z !== 1) {
        ctx.save(); ctx.translate(fx, fy); ctx.scale(z, z); ctx.translate(-fx, -fy);
        ctx.drawImage(base, 0, 0); ctx.restore();
      } else ctx.drawImage(base, 0, 0);
    }

    if (k === 'bad_peep') {
      drawBase(1 + Math.min(t * 1.7, 2.4), 800, 380);
      var vg = ctx.createRadialGradient(800, 430, 60, 800, 430, 720);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.35 + t * 0.55, 0.95).toFixed(3) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
      if (t > 0.32) {
        var p = Math.min((t - 0.32) / 0.13, 1);
        var s = 90 + p * p * 1500;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
        childFace(ctx, 792, 440, s, 'rgba(255,55,55,');
        childFace(ctx, 808, 440, s, 'rgba(55,110,255,');
        ctx.restore();
        childFace(ctx, 800 + Math.sin(t * 92) * 5, 440, s, 'rgba(216,210,198,');
        // 突入ピークで白フラッシュ1発
        if (t > 0.43 && t < 0.49) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(0, 0, VW, VH); }
        if (t > 0.5 && t < 1.0 && (Math.floor(t * 26) % 2) === 0) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH); }
      }
      if (t > dur - 0.7) { ctx.fillStyle = 'rgba(0,0,0,' + Math.min((t - (dur - 0.7)) / 0.6, 1).toFixed(3) + ')'; ctx.fillRect(0, 0, VW, VH); }

    } else if (k === 'bad_wait') {
      drawBase(1);
      ctx.fillStyle = 'rgba(2,3,6,' + Math.min(t / 2.6, 0.9).toFixed(3) + ')'; ctx.fillRect(0, 0, VW, VH);
      var sp = Math.min(t / 2.0, 1);
      var sg = ctx.createRadialGradient(800, 110, 20, 800, 110, 200 + sp * 1050);
      sg.addColorStop(0, 'rgba(0,0,0,' + (0.62 * sp).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, VW, VH);
      if (t > 2.5) handPrint(ctx, 800, 430, (t - 2.5) / 0.7);
      if (t > dur - 0.5) { ctx.fillStyle = 'rgba(0,0,0,' + Math.min((t - (dur - 0.5)) / 0.45, 1).toFixed(3) + ')'; ctx.fillRect(0, 0, VW, VH); }

    } else if (k === 'normal') {
      drawBase(1);
      var g1 = Math.min(t / 1.6, 1);
      var lg = ctx.createRadialGradient(800, 400, 20, 800, 400, 200 + g1 * 720);
      lg.addColorStop(0, 'rgba(150,165,180,' + (0.5 * g1).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(150,165,180,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, VW, VH);
      if (t > 1.35 && t < 1.95) {
        ctx.fillStyle = 'rgba(18,22,28,' + (0.55 * (1 - Math.abs(t - 1.65) / 0.3)).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(800, 470, 22, 70, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(800, 385, 18, 0, 7); ctx.fill();
      }
      if (t > 2.0) { ctx.fillStyle = 'rgba(196,200,205,' + (0.92 * Math.min((t - 2.0) / 1.3, 1)).toFixed(3) + ')'; ctx.fillRect(0, 0, VW, VH); }

    } else {
      drawBase(1);
      var warm = Math.min(t / 1.8, 1);
      var wg = ctx.createRadialGradient(800, 430, 20, 800, 430, 320 + warm * 720);
      wg.addColorStop(0, 'rgba(240,200,140,' + (0.6 * warm).toFixed(3) + ')');
      wg.addColorStop(1, 'rgba(240,200,140,0)');
      ctx.fillStyle = wg; ctx.fillRect(0, 0, VW, VH);
      if (t > 0.8) {
        var a = Math.min((t - 0.8) / 1.0, 1) * 0.5;
        ctx.fillStyle = 'rgba(38,30,22,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(772, 500, 30, 110, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(772, 360, 26, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(852, 540, 19, 64, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(852, 452, 17, 0, 7); ctx.fill();
      }
      if (t > 2.0) { ctx.fillStyle = 'rgba(248,240,224,' + Math.min((t - 2.0) / 0.9, 1).toFixed(3) + ')'; ctx.fillRect(0, 0, VW, VH); }
    }
    grain(ctx, env);
  }

  window.ART = {
    VW: VW, VH: VH, paint: paint, paintInspect: paintInspect, cinema: cinema,
    LOCS: LOCS, locOf: locOf, viewsOf: function (loc) { return LOCS[loc].views; },
  };
})();
