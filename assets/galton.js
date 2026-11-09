/* Home avatar: a Galton board. Each bead takes n left/right steps, so its bin is Binomial(n, 1/2),
   which for large n is close to N(n/2, n/4). The curve is drawn once enough beads have landed. */
(function () {
  var cv = document.querySelector("canvas.galton");
  if (!cv) return;
  var cx = cv.getContext("2d"),
    reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var n = 12, N = 420, PER = 4, // rows, beads per run, beads per layer in a bin
    dx = 0.05, dy = 0.034, y0 = 0.15, // unit-square geometry, circle centred at (.5, .5)
    br = 0.0052, bd = 2 * br + 0.0008,
    binTop = y0 + n * dy + 0.02, binBot = 0.86;
  var C = {}, S = 1, beads = [], bins = [], landed = 0, spawned = 0, acc = 0, last = 0, hold = 0, fade = 1;

  function colors() {
    var s = getComputedStyle(document.documentElement);
    ["accent", "warm", "soft", "panel"].forEach(function (k) {
      C[k] = s.getPropertyValue("--" + k).trim() || "#888";
    });
  }
  function size() {
    var d = window.devicePixelRatio || 1;
    S = cv.clientWidth * d;
    cv.width = cv.height = Math.max(1, Math.round(S));
  }
  function reset() {
    beads = []; bins = []; landed = spawned = 0; hold = 0; fade = 1;
    for (var k = 0; k <= n; k++) bins.push(0);
  }
  function binX(k) { return 0.5 + (k - n / 2) * dx; }
  function pdf(x) { // expected beads per bin at position x (in bin units)
    var v = n / 4;
    return (N * Math.exp(-((x - n / 2) * (x - n / 2)) / (2 * v))) / Math.sqrt(2 * Math.PI * v);
  }
  function dot(x, y, r) { cx.moveTo((x + r) * S, y * S); cx.arc(x * S, y * S, r * S, 0, 6.2832); }

  function drawBoard(a) {
    var k, i, j;
    cx.clearRect(0, 0, S, S);
    cx.globalAlpha = a;
    // pegs
    cx.fillStyle = C.accent;
    cx.beginPath();
    for (i = 0; i < n; i++) for (j = 0; j <= i; j++) dot(0.5 + (j - i / 2) * dx, y0 + i * dy, 0.0045);
    cx.fill();
    // bin walls and floor
    cx.strokeStyle = C.accent;
    cx.lineWidth = Math.max(1, S * 0.0022);
    cx.globalAlpha = a * 0.45;
    cx.beginPath();
    for (k = 0; k <= n + 1; k++) {
      var x = (binX(k) - dx / 2) * S;
      cx.moveTo(x, binTop * S); cx.lineTo(x, binBot * S);
    }
    cx.moveTo((binX(0) - dx / 2) * S, binBot * S); cx.lineTo((binX(n) + dx / 2) * S, binBot * S);
    cx.stroke();
    cx.globalAlpha = a;
    // piles
    cx.fillStyle = C.warm;
    cx.beginPath();
    var cap = Math.floor((binBot - binTop) / bd) * PER;
    for (k = 0; k <= n; k++) {
      for (i = 0; i < Math.min(bins[k], cap); i++) {
        dot(binX(k) + ((i % PER) - (PER - 1) / 2) * bd, binBot - br - 0.001 - Math.floor(i / PER) * bd, br);
      }
    }
    // falling beads
    beads.forEach(function (b) {
      var p = pos(b);
      dot(p[0], p[1], br);
    });
    cx.fill();
    // normal curve N(n/2, n/4), in the same height units as the piles
    if (landed > N * 0.3) {
      cx.globalAlpha = a * Math.min(1, (landed - N * 0.3) / (N * 0.15));
      cx.strokeStyle = C.accent;
      cx.lineWidth = Math.max(1.5, S * 0.005);
      cx.beginPath();
      for (i = 0; i <= 120; i++) {
        var u = -0.5 + (i / 120) * (n + 1),
          h = binBot - (pdf(u) / PER) * bd;
        if (i) cx.lineTo(binX(u) * S, h * S); else cx.moveTo(binX(u) * S, h * S);
      }
      cx.stroke();
    }
    cx.globalAlpha = 1;
  }

  // bead b: path of steps, progress t in rows; after row n it drops into its bin
  function pos(b) {
    var t = b.t, r = Math.min(Math.floor(t), n), f = t - r, k = b.k[r];
    if (r < n) {
      var x0 = 0.5 + (k - r / 2) * dx, x1 = 0.5 + (b.k[r + 1] - (r + 1) / 2) * dx;
      return [x0 + (x1 - x0) * f, y0 - 0.012 + (r + f) * dy - Math.sin(Math.PI * f) * dy * 0.45];
    }
    return [binX(k), y0 - 0.012 + n * dy + f * 0.3];
  }
  function spawn() {
    var k = [0], s = 0;
    for (var i = 0; i < n; i++) { s += Math.random() < 0.5 ? 0 : 1; k.push(s); }
    beads.push({ t: 0, k: k });
    spawned++;
  }
  function step(dt) {
    acc += dt * 34;
    while (acc >= 1 && spawned < N) { spawn(); acc--; }
    beads = beads.filter(function (b) {
      b.t += dt * 11;
      if (b.t < n) return true;
      var k = b.k[n], top = Math.max(binTop, binBot - Math.floor(bins[k] / PER) * bd);
      if (pos(b)[1] < top - br) return true;
      bins[k]++; landed++;
      return false;
    });
  }
  function frame(now) {
    var dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (landed < N) step(dt);
    else if ((hold += dt) > 3) fade -= dt;
    if (fade <= 0) reset();
    drawBoard(Math.max(0, fade));
    requestAnimationFrame(frame);
  }
  function still() { // expected counts: the final filled board
    reset();
    for (var k = 0, c = 1; k <= n; k++) { bins[k] = Math.round((N * c) / 4096); c = (c * (n - k)) / (k + 1); }
    landed = N;
    drawBoard(1);
  }

  colors();
  size();
  reset();
  // first load: start with part of the run already in the bins, so the bell is never an empty board
  for (var i = 0; i < N * 0.45; i++) { spawn(); bins[beads.pop().k[n]]++; landed++; }
  addEventListener("resize", function () { size(); if (reduce) still(); });
  new MutationObserver(function () {
    requestAnimationFrame(function () { colors(); if (reduce) still(); });
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  if (reduce) still(); else requestAnimationFrame(frame);
})();
