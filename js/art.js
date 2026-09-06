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

  // ---- noise texture for grain ----
  var noiseCv = document.createElement('canvas');
  noiseCv.width = 220; noiseCv.height = 220;
  (function () {
    var nx = noiseCv.getContext('2d');
    var img = nx.createImageData(220, 220);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    nx.putImageData(img, 0, 0);
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
    // corner ambient occlusion
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 40; ctx.filter = 'blur(24px)';
    ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
    ctx.filter = 'none';
    ctx.restore();
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
    var n = 46;
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
    // creeping dark from edges
    var g = ctx.createRadialGradient(VW / 2, VH * 0.46, VH * (0.55 - 0.4 * c), VW / 2, VH / 2, VH * 1.0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,' + (0.4 * c) + ')');
    g.addColorStop(1, 'rgba(0,0,0,' + (0.82 * c + 0.12) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    // desaturate-ish wash
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'rgba(120,120,120,' + (0.85 * c) + ')';
    ctx.fillRect(0, 0, VW, VH);
    // cold blue-black multiply (no effect at c=0, deep blue-grey at c=1)
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgb(' + Math.round(lerp(255, 120, c)) + ',' + Math.round(lerp(255, 140, c)) + ',' + Math.round(lerp(255, 175, c)) + ')';
    ctx.globalAlpha = 0.7 * c;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // breathing red at the hour
    if (env.hour) {
      var pb = 0.06 + 0.10 * Math.max(0, Math.sin(env.t * 1.9));
      ctx.fillStyle = 'rgba(90,10,10,' + pb + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
    ctx.restore();
    // occasional slice glitch
    if (c > 0.4 && Math.random() < 0.04 * c) {
      var sy = Math.random() * VH, sh = 8 + Math.random() * 60;
      var off = (Math.random() - 0.5) * 60 * c;
      try {
        var slice = ctx.getImageData(0, sy, VW, sh);
        ctx.putImageData(slice, off, sy);
      } catch (e) {}
    }
  }

  function grain(ctx, env) {
    ctx.save();
    ctx.globalAlpha = 0.05 + 0.06 * env.c;
    ctx.globalCompositeOperation = 'overlay';
    var ox = (Math.random() * 120) | 0, oy = (Math.random() * 120) | 0;
    for (var x = -ox; x < VW; x += 220)
      for (var y = -oy; y < VH; y += 220)
        ctx.drawImage(noiseCv, x, y);
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

  // ================= VIEWS =================
  // returns hotspot list [{id,x,y,w,h,name}]  (virtual coords)
  var VIEWS = {
    north: function (ctx, env) {
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
    east: function (ctx, env) {
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
    south: function (ctx, env) {
      paintShell(ctx, env);
      drawDoor(ctx, env);
      drawMirror(ctx, env);
      drawCalendar(ctx, env, 1120, 360);
      return [
        { id: 'peephole', x: 782, y: 252, w: 36, h: 36, name: 'のぞき穴' },
        { id: 'knob', x: 908, y: 432, w: 56, h: 56, name: 'ドアノブ' },
        { id: 'jacket', x: 470, y: 220, w: 120, h: 190, name: '上着' },
        { id: 'switch', x: 1006, y: 336, w: 52, h: 74, name: '電気のスイッチ' },
        { id: 'calendar', x: 1050, y: 270, w: 140, h: 180, name: 'カレンダー' },
        { id: 'mirror', x: 356, y: 254, w: 224, h: 480, name: '姿見' },
        { id: 'floor_scuff', x: 700, y: 800, w: 300, h: 120, name: '床のこすれ跡' },
        { id: 'door', x: 620, y: 150, w: 360, h: 620, name: env.hour ? 'ドア' : 'ドア（鍵がかかっている）' },
      ];
    },
    west: function (ctx, env) {
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
  };

  function paint(ctx, view, env) {
    var hs = VIEWS[view](ctx, env);
    lampPool(ctx, env._lampX || -999, env._lampY || -999, 1, env);
    corruption(ctx, env);
    grain(ctx, env);
    return hs;
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

  window.ART = { VW: VW, VH: VH, paint: paint, paintInspect: paintInspect, views: Object.keys(VIEWS) };
})();
