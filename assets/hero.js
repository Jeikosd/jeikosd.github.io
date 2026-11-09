/* Home page hero: an AR(1) ensemble drawn with WebGL2 (canvas 2D as a still fallback). */
(function () {
  /* AR(1) ensemble: x[t] = phi x[t-1] + sigma e[t], sigma^2 = 1 - phi^2, so the stationary law is N(0,1).
   Given x[0] = x0: x[t] ~ N(phi^t x0, 1 - phi^(2t)). A shock d at time s adds d phi^(t-s) for t >= s. */
  function ar1Hero(root, o) {
    var q = function (s) {
        return root.querySelector(s);
      },
      art = q("[data-gl]"),
      ov = q("[data-ov]"),
      oc = ov.getContext("2d");
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches,
      small = root.clientWidth < 760;
    var N = (small ? o.nSmall : o.n) & ~1,
      T = o.T,
      X0 = o.x0,
      phi = o.phi,
      sig = Math.sqrt(1 - phi * phi);
    /* seeded generator and normal draws */
    var seed = o.seed | 0;
    function u() {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function g() {
      return Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
    }
    var Z = new Float32Array(N * T),
      Y = new Float32Array(N * (T + 1)),
      off = new Float32Array(T + 1),
      pw = new Float64Array(T + 1),
      i,
      t;
    for (i = 0; i < Z.length; i++) Z[i] = g();
    function row(i) {
      var s = i & 1 ? -1 : 1,
        x = s * X0,
        a = i * (T + 1),
        b = i * T,
        t;
      Y[a] = x + off[0];
      for (t = 1; t <= T; t++) {
        x = phi * x + sig * Z[b + t - 1];
        Y[a + t] = x + off[t];
      }
    }
    var shocks = [];
    function env(a) {
      return a < 0.25 ? (a / 0.25) * (2 - a / 0.25) : a < 1.5 ? 1 : Math.exp(-(a - 1.5) / 1.5);
    }
    function resim() {
      var t, k;
      sig = Math.sqrt(1 - phi * phi);
      pw[0] = 1;
      for (t = 1; t <= T; t++) pw[t] = pw[t - 1] * phi;
      off.fill(0);
      for (k = 0; k < shocks.length; k++) {
        var s = shocks[k];
        for (t = s.t; t <= T; t++) off[t] += s.now * pw[t - s.t];
      }
      for (t = 0; t < N; t++) row(t);
      yDirty = true;
    }
    function law(t) {
      var v = Math.max(1 - pw[t] * pw[t], 1e-4);
      return { hi: off[t] + pw[t] * X0, lo: off[t] - pw[t] * X0, v: v };
    }
    function dens(y, l) {
      var s = Math.sqrt(l.v),
        a = (y - l.hi) / s,
        b = (y - l.lo) / s;
      return (0.5 * Math.exp(-0.5 * a * a) + 0.5 * Math.exp(-0.5 * b * b)) / (s * 2.50662827);
    }
    /* layout and palette */
    var W = 0,
      H = 0,
      dpr = 1,
      L = null,
      col = {},
      dark = false;
    function parse(c) {
      oc.fillStyle = "#000";
      oc.fillStyle = c;
      var v = oc.fillStyle;
      if (v[0] === "#")
        return [
          parseInt(v.slice(1, 3), 16) / 255,
          parseInt(v.slice(3, 5), 16) / 255,
          parseInt(v.slice(5, 7), 16) / 255,
        ];
      var m = v.match(/[\d.]+/g);
      return [m[0] / 255, m[1] / 255, m[2] / 255];
    }
    function colors() {
      var c = getComputedStyle(root);
      ["--paper", "--hc-ink", "--hc-soft", "--hc-accent", "--hc-warm"].forEach(function (k) {
        col[k] = c.getPropertyValue(k).trim();
      });
      dark = c.getPropertyValue("--dark").trim() === "1";
      col.bg = parse(col["--paper"]);
      col.a = parse(col["--hc-accent"]);
      col.w = parse(col["--hc-warm"]);
    }
    function P(t, y) {
      return [L.ox + L.tx * t + L.yx * y, L.oy + L.ty * t + L.yy * y];
    }
    function size() {
      var r0 = root.getBoundingClientRect(),
        w = Math.round(r0.width),
        h = Math.round(r0.height);
      if (!w || !h) return;
      W = w;
      H = h;
      dpr = Math.max(1.5, Math.min(small ? 2 : 1.75, devicePixelRatio || 1));
      art.width = ov.width = Math.round(W * dpr);
      art.height = ov.height = Math.round(H * dpr);
      L = o.layout(W, H, root, r0);
      root.style.setProperty("--hc-base", Math.round(L.ty * T) + "px");
      if (gl) sizeGL();
      yDirty = glDirty = ovDirty = true;
    }
    /* WebGL2 renderer */
    var gl = null,
      pr,
      U = {},
      UB = {},
      UC = {},
      vao,
      yBuf,
      fH,
      fA,
      fB,
      pb,
      pc,
      tri,
      lw,
      lh,
      gx,
      hdr = false;
    var VS =
      "#version 300 es\nprecision highp float;layout(location=0) in float aT;layout(location=1) in float aS;layout(location=2) in float aY;uniform vec2 uO,uTv,uYv,uRes;out float vT,vS;void main(){vec2 p=uO+uTv*aT+uYv*aY;vT=aT;vS=aS;vec2 c=p/uRes*2.-1.;gl_Position=vec4(c.x,-c.y,0.,1.);}";
    var FS =
      "#version 300 es\nprecision highp float;in float vT,vS;uniform float uF,uHead,uA;uniform vec3 uC0,uC1;uniform vec3 uG;out vec4 oc;void main(){if(vT>uF)discard;if((vT>uG.x-1.&&vT<uG.x)||(vT>uG.y-1.&&vT<uG.y)||(vT>uG.z-1.&&vT<uG.z))discard;float h=1.+uHead*exp(-(uF-vT)/5.);vec3 c=vS>0.?uC0:uC1;oc=vec4(c*uA*abs(vS)*h,1.);}";
    var QV =
      "#version 300 es\nout vec2 v;void main(){vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
    var BF =
      "#version 300 es\nprecision mediump float;in vec2 v;uniform sampler2D t;uniform vec2 d;out vec4 c;void main(){vec3 s=texture(t,v).rgb*.227;s+=(texture(t,v+d*1.385).rgb+texture(t,v-d*1.385).rgb)*.316;s+=(texture(t,v+d*3.23).rgb+texture(t,v-d*3.23).rgb)*.07;c=vec4(s,1.);}";
    var CF =
      "#version 300 es\nprecision highp float;in vec2 v;uniform sampler2D h,b;uniform float g,m;uniform vec3 p;out vec4 c;float n(vec2 q){return fract(52.9829189*fract(dot(q,vec2(.06711056,.00583715))));}void main(){vec3 d=texture(h,v).rgb+g*texture(b,v).rgb;vec3 r=m>.5?p+(1.-exp(-d))*(1.-p):p*exp(-d);c=vec4(r+(n(gl_FragCoord.xy)-.5)/255.,1.);}";
    function sh(ty, s) {
      var x = gl.createShader(ty);
      gl.shaderSource(x, s);
      gl.compileShader(x);
      return x;
    }
    function prog(v, f) {
      var p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, v));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f));
      gl.linkProgram(p);
      return p;
    }
    function initGL() {
      pr = prog(VS, FS);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
        gl = null;
        return;
      }
      ["uO", "uTv", "uYv", "uRes", "uF", "uHead", "uA", "uC0", "uC1", "uG"].forEach(function (n) {
        U[n] = gl.getUniformLocation(pr, n);
      });
      var st = new Float32Array(N * (T + 1) * 2),
        idx = new Uint32Array(N * T * 2),
        i,
        t,
        a = 0,
        b = 0;
      for (i = 0; i < N; i++) {
        var s = (i & 1 ? -1 : 1) * (i >> 1 < o.heroes ? o.heroW : 1);
        for (t = 0; t <= T; t++) {
          st[a++] = t;
          st[a++] = s;
          if (t < T) {
            idx[b++] = i * (T + 1) + t;
            idx[b++] = i * (T + 1) + t + 1;
          }
        }
      }
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      var bb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bb);
      gl.bufferData(gl.ARRAY_BUFFER, st, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 8, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 8, 4);
      yBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
      gl.bufferData(gl.ARRAY_BUFFER, Y, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      hdr = !!(
        gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")
      );
      tri = gl.createVertexArray();
      pc = prog(QV, CF);
      ["h", "b", "g", "m", "p"].forEach(function (n) {
        UC[n] = gl.getUniformLocation(pc, n);
      });
      if (o.bloom) {
        pb = prog(QV, BF);
        UB.t = gl.getUniformLocation(pb, "t");
        UB.d = gl.getUniformLocation(pb, "d");
      }
      gx = true;
      yDirty = glDirty = true;
      if (W) sizeGL();
    }
    function tgt(w, h, old) {
      if (old) {
        gl.deleteTexture(old.t);
        gl.deleteFramebuffer(old.f);
      }
      var tx = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tx);
      if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { t: tx, f: f };
    }
    function sizeGL() {
      fH = tgt(art.width, art.height, fH);
      if (!o.bloom) return;
      lw = Math.max(2, art.width >> 2);
      lh = Math.max(2, art.height >> 2);
      fA = tgt(lw, lh, fA);
      fB = tgt(lw, lh, fB);
    }
    function lines(a, head) {
      gl.useProgram(pr);
      gl.uniform2f(U.uO, L.ox, L.oy);
      gl.uniform2f(U.uTv, L.tx, L.ty);
      gl.uniform2f(U.uYv, L.yx, L.yy);
      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uF, front);
      gl.uniform1f(U.uHead, head);
      gl.uniform1f(U.uA, a);
      var ink = function (c) {
        return dark
          ? c
          : c.map(function (v) {
              return -Math.log(Math.max(v, 0.02));
            });
      };
      gl.uniform3fv(U.uC0, ink(col.a));
      gl.uniform3fv(U.uC1, ink(col.w));
      gl.uniform3f(
        U.uG,
        shocks[0] ? shocks[0].t : -9,
        shocks[1] ? shocks[1].t : -9,
        shocks[2] ? shocks[2].t : -9,
      );
      gl.bindVertexArray(vao);
      gl.drawElements(gl.LINES, N * T * 2, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
    }
    function alpha() {
      return (
        ((dark ? o.inkD : o.inkL) * ((small && o.smallK) || 1) * Math.hypot(L.yx, L.yy) * dpr) / N
      );
    }
    function renderGL() {
      if (yDirty) {
        gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, Y);
        yDirty = false;
        pending.length = 0;
      } else if (pending.length) {
        gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
        pending.forEach(function (i) {
          gl.bufferSubData(gl.ARRAY_BUFFER, i * (T + 1) * 4, Y, i * (T + 1), T + 1);
        });
        pending.length = 0;
      }
      var a = alpha(),
        head = reduce || front >= T ? 0 : o.head,
        bg = col.bg,
        i;
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.clearColor(0, 0, 0, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fH.f);
      gl.viewport(0, 0, art.width, art.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      lines(a, head);
      if (o.bloom) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fA.f);
        gl.viewport(0, 0, lw, lh);
        gl.clear(gl.COLOR_BUFFER_BIT);
        lines(a * 4, head);
        gl.disable(gl.BLEND);
        gl.useProgram(pb);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(UB.t, 0);
        gl.bindVertexArray(tri);
        for (i = 0; i < 2; i++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, fB.f);
          gl.bindTexture(gl.TEXTURE_2D, fA.t);
          gl.uniform2f(UB.d, (1 + i) / lw, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fA.f);
          gl.bindTexture(gl.TEXTURE_2D, fB.t);
          gl.uniform2f(UB.d, 0, (1 + i) / lh);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, art.width, art.height);
      gl.useProgram(pc);
      gl.bindVertexArray(tri);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fH.t);
      gl.uniform1i(UC.h, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, o.bloom ? fA.t : fH.t);
      gl.uniform1i(UC.b, 1);
      gl.uniform1f(UC.g, o.bloom ? (dark ? o.bloomD : o.bloomL) : 0);
      gl.uniform1f(UC.m, dark ? 1 : 0);
      gl.uniform3f(UC.p, bg[0], bg[1], bg[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
    }
    /* canvas 2D fallback: one still frame with fewer paths */
    function render2D() {
      var c = art.getContext("2d");
      if (!c) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalCompositeOperation = "source-over";
      c.fillStyle = col["--paper"];
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = dark ? "lighter" : "multiply";
      c.lineWidth = 0.8;
      var n = Math.min(N, 320);
      for (var b = 0; b < 16; b++)
        for (var s = 0; s < 2; s++) {
          c.beginPath();
          for (var i = s + 2 * b; i < n; i += 32) {
            var a = i * (T + 1),
              p = P(0, Y[a]);
            c.moveTo(p[0], p[1]);
            for (var t = 1; t <= Math.floor(front); t += 2) {
              p = P(t, Y[a + t]);
              c.lineTo(p[0], p[1]);
            }
          }
          c.strokeStyle = s ? col["--hc-warm"] : col["--hc-accent"];
          c.globalAlpha = dark ? 0.3 : 0.28;
          c.stroke();
        }
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
    }
    /* margin: stacked histogram of the slice plus its exact density */
    var bins = small ? 34 : 64,
      cA = new Float32Array(bins),
      cB = new Float32Array(bins),
      read = q("[data-read]");
    function sliceT() {
      return Math.round(Math.min(hoverT == null ? front : hoverT, front));
    }
    function margin(t) {
      var R = L.range,
        bw = (2 * R) / bins,
        b = L.bell,
        i,
        k;
      cA.fill(0);
      cB.fill(0);
      for (i = 0; i < N; i++) {
        k = Math.floor((Y[i * (T + 1) + t] + R) / bw);
        if (k >= 0 && k < bins) (i & 1 ? cB : cA)[k]++;
      }
      var sc = 1 / (N * bw),
        mx = b.max,
        hx = b.hx,
        hy = b.hy,
        gap = b.gap;
      function q4(y1, y2, d1, d2) {
        var p = P(T, y1),
          r = P(T, y2);
        oc.beginPath();
        oc.moveTo(p[0] + hx * d1, p[1] + hy * d1);
        oc.lineTo(r[0] + hx * d1, r[1] + hy * d1);
        oc.lineTo(r[0] + hx * d2, r[1] + hy * d2);
        oc.lineTo(p[0] + hx * d2, p[1] + hy * d2);
        oc.closePath();
        oc.fill();
      }
      var l = law(t);
      if (b.solid) {
        oc.fillStyle = col["--paper"];
        oc.beginPath();
        var p0 = P(T, -R);
        oc.moveTo(p0[0], p0[1]);
        for (i = 0; i <= 120; i++) {
          var y0 = -R + (2 * R * i) / 120,
            dd = Math.min(
              mx,
              Math.max(
                dens(y0, l),
                (cA[Math.min(bins - 1, ((i / 120) * bins) | 0)] +
                  cB[Math.min(bins - 1, ((i / 120) * bins) | 0)]) *
                  sc,
              ),
            ),
            pp = P(T, y0);
          oc.lineTo(pp[0] + hx * dd, pp[1] + hy * dd);
        }
        var p9 = P(T, R);
        oc.lineTo(p9[0], p9[1]);
        oc.closePath();
        oc.fill();
      }
      oc.globalAlpha = b.fill;
      for (k = 0; k < bins; k++) {
        var y1 = -R + k * bw + (bw * gap) / 2,
          y2 = y1 + bw * (1 - gap),
          da = cA[k] * sc,
          db = cB[k] * sc;
        if (da + db <= 0) continue;
        da = Math.min(da, mx);
        db = Math.min(db, mx - da);
        oc.fillStyle = col["--hc-accent"];
        if (da > 0) q4(y1, y2, 0, da);
        oc.fillStyle = col["--hc-warm"];
        if (db > 0) q4(y1, y2, da, da + db);
      }
      oc.globalAlpha = 1;
      oc.strokeStyle = col["--hc-ink"];
      oc.lineWidth = b.line;
      oc.lineJoin = "round";
      if (b.glow && dark) {
        oc.shadowColor = col["--hc-ink"];
        oc.shadowBlur = b.glow;
      }
      oc.beginPath();
      var pen = false;
      for (i = 0; i <= 240; i++) {
        var y = -R + (2 * R * i) / 240,
          d0 = dens(y, l),
          d = Math.min(mx, d0),
          pt = P(T, y);
        if (d0 < 0.006 && b.axis < 1) {
          pen = false;
          continue;
        }
        if (pen) oc.lineTo(pt[0] + hx * d, pt[1] + hy * d);
        else oc.moveTo(pt[0] + hx * d, pt[1] + hy * d);
        pen = true;
      }
      oc.stroke();
      oc.shadowBlur = 0;
      if (b.axis) {
        oc.strokeStyle = col["--hc-ink"];
        oc.globalAlpha = b.axis;
        oc.lineWidth = 1;
        oc.beginPath();
        var e1 = P(T, -R),
          e2 = P(T, R);
        oc.moveTo(e1[0], e1[1]);
        oc.lineTo(e2[0], e2[1]);
        oc.stroke();
        oc.globalAlpha = 1;
      }
    }
    function fx(v, d) {
      return (v < 0 ? "−" : "") + Math.abs(v).toFixed(d == null ? 2 : d);
    }
    function drawOv() {
      oc.setTransform(dpr, 0, 0, dpr, 0, 0);
      oc.clearRect(0, 0, W, H);
      var t = sliceT(),
        i,
        R = L.range;
      if (hoverT != null && front >= 1) {
        var a = P(t, -R),
          b = P(t, R);
        oc.strokeStyle = col["--hc-ink"];
        oc.globalAlpha = 0.6;
        oc.lineWidth = 1;
        oc.beginPath();
        oc.moveTo(a[0], a[1]);
        oc.lineTo(b[0], b[1]);
        oc.stroke();
        oc.globalAlpha = 1;
      }
      if (shocks.length) {
        [1, -1].forEach(function (s) {
          oc.strokeStyle = col["--hc-ink"];
          oc.lineWidth = 1.4;
          oc.beginPath();
          for (i = 0; i <= T; i++) {
            var m = off[i] + s * pw[i] * X0,
              p = P(i, m),
              cut =
                !i ||
                shocks.some(function (k) {
                  return k.t === i;
                });
            if (cut) oc.moveTo(p[0], p[1]);
            else oc.lineTo(p[0], p[1]);
          }
          oc.stroke();
        });
        /* The jump at a shock is real (the shock adds to x[s]), so mark it instead of hiding it. */
        oc.font = "11px Figtree, system-ui, sans-serif";
        oc.textBaseline = "bottom";
        shocks.forEach(function (k) {
          if (Math.abs(k.now) < 0.05) return;
          var a = P(k.t, -R),
            b = P(k.t, R);
          oc.strokeStyle = col["--hc-soft"];
          oc.fillStyle = col["--hc-soft"];
          oc.lineWidth = 1;
          oc.setLineDash([3, 4]);
          oc.beginPath();
          oc.moveTo(a[0], a[1]);
          oc.lineTo(b[0], b[1]);
          oc.stroke();
          oc.setLineDash([]);
          oc.textAlign = "left";
          oc.fillText("shock " + (k.now < 0 ? "−" : "+") + Math.abs(k.now).toFixed(1), a[0] + 6, a[1] - 2);
        });
      }
      margin(t);
      if (read) {
        var l = law(t),
          c = (l.hi + l.lo) / 2,
          h = (l.hi - l.lo) / 2,
          mid = Math.abs(c) < 0.005 ? "±" + h.toFixed(2) : fx(c) + " ± " + h.toFixed(2);
        read.textContent = "t = " + t + "   N(" + mid + ", " + Math.sqrt(l.v).toFixed(2) + "²)";
      }
      ovDirty = false;
    }
    /* loop */
    var frozen = false,
      front = reduce ? T : 0,
      start = 0,
      yDirty = true,
      glDirty = true,
      ovDirty = true,
      pending = [],
      hoverT = null,
      raf = 0,
      vis = true,
      last = 0,
      idleUntil = 0,
      lastShim = 0,
      shimRow = 2 * o.heroes;
    function now() {
      return performance.now();
    }
    function want() {
      return !reduce && gx && ((front < T && !frozen) || shocks.length > 0 || now() < idleUntil);
    }
    function kick() {
      if (!raf && vis && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function paint() {
      if (gl) {
        if (glDirty) {
          renderGL();
          glDirty = false;
        }
      } else if (glDirty) {
        render2D();
        glDirty = false;
      }
      if (ovDirty) drawOv();
    }
    function frame(ts) {
      raf = 0;
      if (!vis || document.hidden) return;
      var dt = last ? Math.min(ts - last, 64) / 1000 : 0.016;
      last = ts;
      if (front < T && !frozen) {
        if (!start) start = ts;
        var p = Math.min(1, (ts - start) / o.reveal);
        var f = T * (0.05 + 0.95 * (1 - Math.pow(1 - p, 2.4)));
        front = p >= 1 ? T : f;
        glDirty = ovDirty = true;
        if (front >= T) idleUntil = now() + o.idle;
      }
      if (shocks.length) {
        for (var k = shocks.length - 1; k >= 0; k--) {
          var s = shocks[k];
          s.age += dt;
          s.now = s.d * env(s.age);
          if (s.age > 1.5 && Math.abs(s.now) < 0.015) shocks.splice(k, 1);
        }
        resim();
        glDirty = ovDirty = true;
        if (!shocks.length) idleUntil = now() + o.idle;
      } else if (front >= T && now() < idleUntil && ts - lastShim > 30) {
        lastShim = ts;
        for (var m = 0; m < o.shim; m++) {
          var r = shimRow;
          shimRow += 1;
          if (shimRow >= N) shimRow = 2 * o.heroes;
          for (var j = 0; j < T; j++) Z[r * T + j] = g();
          row(r);
          pending.push(r);
        }
        glDirty = ovDirty = true;
      }
      paint();
      if (want()) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    function wake() {
      if (reduce) {
        paint();
        return;
      }
      idleUntil = now() + o.idle;
      kick();
    }
    /* controls */
    var slider = q("[data-phi]"),
      pv = q("[data-phi-val]"),
      hl = q("[data-hl]");
    function phiOut() {
      if (pv) pv.textContent = phi.toFixed(3);
      if (hl) hl.textContent = Math.round(Math.log(0.5) / Math.log(phi));
      if (slider)
        slider.setAttribute(
          "aria-valuetext",
          "phi " +
            phi.toFixed(3) +
            ", half-life " +
            Math.round(Math.log(0.5) / Math.log(phi)) +
            " steps",
        );
    }
    function setPhi(v) {
      phi = v;
      resim();
      phiOut();
      glDirty = ovDirty = true;
      paint();
      wake();
    }
    if (slider) {
      slider.value = phi;
      slider.addEventListener("input", function () {
        setPhi(+slider.value);
      });
    }
    function shock(tt, d) {
      tt = Math.max(1, Math.min(T - 1, Math.round(tt)));
      d = Math.max(-2.2, Math.min(2.2, d));
      if (shocks.length >= 3) shocks.shift();
      if (reduce) {
        shocks = [{ t: tt, d: d, now: d, age: 0 }];
        resim();
        glDirty = ovDirty = true;
        paint();
        return;
      }
      shocks.push({ t: tt, d: d, now: 0, age: 0 });
      idleUntil = now() + o.idle;
      kick();
    }
    function inv(e) {
      var r = root.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top,
        dx = x - L.ox,
        dy = y - L.oy,
        dt = L.tx * L.tx + L.ty * L.ty,
        dv = L.yx * L.yx + L.yy * L.yy;
      return { t: (dx * L.tx + dy * L.ty) / dt, y: (dx * L.yx + dy * L.yy) / dv };
    }
    root.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse" || !L) return;
      var v = inv(e);
      hoverT = Math.max(0, Math.min(T, v.t));
      ovDirty = true;
      if (!raf && !reduce) {
        if (now() > idleUntil) idleUntil = now() + o.idle;
        kick();
      } else if (reduce) paint();
    });
    root.addEventListener("pointerleave", function () {
      hoverT = null;
      ovDirty = true;
      if (reduce) paint();
      else kick();
    });
    root.addEventListener("click", function (e) {
      if (e.target.closest("a,button,input,label,.hc-console") || !L) return;
      var sel = window.getSelection && getSelection();
      if (sel && String(sel)) return;
      var v = inv(e);
      if (v.t < 0 || v.t > T) return;
      var d = v.y;
      if (Math.abs(d) < 1) d = d < 0 ? -1.5 : 1.5;
      shock(v.t, d);
    });
    var bs = q("[data-shock]"),
      bsign = 1;
    if (bs)
      bs.addEventListener("click", function () {
        bsign = -bsign;
        shock(Math.round(T * 0.3), 2.2 * bsign);
      });
    var br = q("[data-replay]");
    if (br) {
      if (reduce) br.hidden = true;
      br.addEventListener("click", function () {
        shocks.length = 0;
        resim();
        front = 0;
        start = 0;
        glDirty = ovDirty = true;
        kick();
      });
    }
    /* start */
    var nav = document.getElementById("quarto-header");
    if (nav)
      root.style.setProperty("--hc-nav", Math.round(nav.getBoundingClientRect().height) + "px");
    colors();
    var tried = null;
    try {
      tried = art.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      });
    } catch (e) {}
    gl = tried;
    resim();
    phiOut();
    if (gl) {
      initGL();
      art.addEventListener("webglcontextlost", function (e) {
        e.preventDefault();
        gx = false;
      });
      art.addEventListener("webglcontextrestored", function () {
        fH = fA = fB = null;
        initGL();
        glDirty = true;
        paint();
        kick();
      });
    }
    if (!gl) {
      gx = false;
      front = T;
    }
    size();
    ovDirty = glDirty = true;
    paint();
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(function () {
        size();
        paint();
      });
    new ResizeObserver(function () {
      var r = root.getBoundingClientRect();
      if (Math.round(r.width) !== W || Math.round(r.height) !== H) {
        size();
        paint();
        kick();
      }
    }).observe(root);
    function resume() {
      last = 0;
      if (front < T && start)
        start =
          now() - o.reveal * (1 - Math.pow(Math.max(1e-3, 1 - (front / T - 0.05) / 0.95), 1 / 2.4));
      kick();
    }
    new IntersectionObserver(
      function (en) {
        vis = en[0].isIntersecting;
        if (vis) resume();
      },
      { threshold: 0.05 },
    ).observe(root);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) resume();
    });
    function themed() {
      colors();
      glDirty = ovDirty = true;
      paint();
    }
    var mo = new MutationObserver(themed);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-bs-theme"],
    });
    if (document.body)
      mo.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "data-bs-theme"],
      });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themed);
    if (!reduce && gx) kick();
    root.ar1 = {
      N: N,
      T: T,
      get Y() {
        return Y;
      },
      get front() {
        return front;
      },
      law: function (t) {
        return law(t);
      },
      dens: function (y, t) {
        return dens(y, law(t));
      },
      phi: function (v) {
        front = T;
        setPhi(v);
      },
      seek: function (f) {
        frozen = true;
        front = f;
        glDirty = ovDirty = true;
        idleUntil = 0;
        paint();
      },
      shock: shock,
      hold: function () {
        idleUntil = 0;
      },
      x0: X0,
      gl: function () {
        return !!gl;
      },
    };
  }

  var el = document.getElementById("hc");
  if (!el) return;
  ar1Hero(el, {
    n: 1000,
    nSmall: 360,
    T: 170,
    x0: 4.7,
    phi: 0.985,
    seed: 7,
    heroes: 3,
    heroW: 6,
    smallK: 1.6,
    bloom: false,
    inkD: 0.55,
    inkL: 0.3,
    head: 6,
    reveal: 4200,
    idle: 40000,
    shim: 2,
    /* Time runs down the art area; the bell stands on the top edge of the name. */
    layout: function (W, H, root, r0) {
      var small = W < 760,
        nameBox = root.querySelector(".hc-name").getBoundingClientRect(),
        fs = parseFloat(getComputedStyle(root.querySelector(".hc-name")).fontSize),
        base = nameBox.top - r0.top - fs * 0.1,
        R = 5.3,
        sx = W / 2 / R,
        bh = small ? Math.min(120, base * 0.34) : Math.min(base * 0.34, 210),
        s = bh / 0.399;
      return {
        ox: W / 2,
        oy: 0,
        tx: 0,
        ty: base / 170,
        yx: sx,
        yy: 0,
        range: R,
        bell: {
          hx: 0,
          hy: -s,
          max: (bh * 1.18) / s,
          fill: 0.95,
          line: 1.5,
          solid: true,
          gap: 0.14,
          axis: 1,
        },
      };
    },
  });
})();
