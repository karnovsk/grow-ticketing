// web/src/beerPour.ts
// Easter egg: the beer icon in the header turns the whole screen into a glass
// of beer slowly filling up — rising level, carbonation, a foam head,
// condensation — then fades it away. Tilt the phone and the beer stays level
// with the world (up to MAX_TILT), sloshing as it settles. One full-screen
// canvas, backed at devicePixelRatio so it stays sharp on phones; everything
// static (foam texture, glass shading, bubble/droplet sprites) is rendered
// once up front, so a frame is mostly drawImage calls. Tapping the overlay or
// pressing Escape skips to the fade.

const FILL_START = 200;
const FILL_END = 7200;
const FADE_START = 10200;
const FADE_MS = 1000;
const SKIP_FADE_MS = 450;
// Fraction of the screen height below the beer/foam line once full.
const FILL_LEVEL = 0.8;
const MAX_BUBBLES = 520;
const RAD = Math.PI / 180;
const MAX_TILT = 30 * RAD;

// Beer palette, top of the glass to the bottom.
const BEER_LIGHT = '#f9c74a';
const BEER_MID = '#e89a1c';
const BEER_DEEP = '#a3520a';
const BEER_DARKEST = '#6e3305';

type Bubble = {
  x: number;
  y: number;
  r: number;
  // 0 = far side of the glass (small, dim, soft), 1 = right behind the glass.
  depth: number;
  phase: number;
  age: number;
};

type Droplet = {
  x: number;
  y: number;
  r: number;
  wetAt: number;
};

let running = false;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const smoothstep = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeInOutSine = (x: number) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return [canvas, canvas.getContext('2d')!];
}

// A carbonation bubble near the glass: almost entirely see-through, a thin
// rim lit from the top-left and shaded bottom-right, and a pinpoint glint.
function bubbleSprite(size: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size, size);
  const r = size / 2;
  const body = ctx.createRadialGradient(r, r, 0, r, r, r);
  body.addColorStop(0, 'rgba(255, 246, 215, 0.08)');
  body.addColorStop(0.78, 'rgba(255, 240, 200, 0.2)');
  body.addColorStop(0.92, 'rgba(255, 250, 230, 0.7)');
  body.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(110, 52, 0, 0.3)';
  ctx.lineWidth = r * 0.09;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.86, Math.PI * 0.05, Math.PI * 0.6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.84, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
  const glint = ctx.createRadialGradient(r * 0.66, r * 0.62, 0, r * 0.66, r * 0.62, r * 0.2);
  glint.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glint;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

// A bubble deeper in the glass: out of focus, so just a soft warm speck.
function farBubbleSprite(size: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size, size);
  const r = size / 2;
  const body = ctx.createRadialGradient(r, r, 0, r, r, r);
  body.addColorStop(0, 'rgba(255, 244, 205, 0.55)');
  body.addColorStop(0.5, 'rgba(255, 236, 180, 0.28)');
  body.addColorStop(1, 'rgba(255, 230, 160, 0)');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

// A foam cell: opaque cream, with a faint shadowed edge so packed cells read
// as a bubbly head rather than a flat blob.
function foamCellSprite(size: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size, size);
  const r = size / 2;
  const body = ctx.createRadialGradient(r * 0.85, r * 0.8, 0, r, r, r);
  body.addColorStop(0, 'rgba(255, 255, 252, 1)');
  body.addColorStop(0.7, 'rgba(252, 246, 230, 1)');
  body.addColorStop(0.9, 'rgba(226, 208, 170, 0.95)');
  body.addColorStop(1, 'rgba(210, 186, 140, 0)');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);
  const glint = ctx.createRadialGradient(r * 0.7, r * 0.65, 0, r * 0.7, r * 0.65, r * 0.28);
  glint.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glint;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

// Condensation on the outside of the glass: a tiny lens — lighter body,
// darker lower rim, a sharp glint top-left and a refracted crescent below.
function dropletSprite(size: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size, size);
  const r = size / 2;
  const edge = r * 0.94;
  const body = ctx.createRadialGradient(r * 0.9, r * 0.8, 0, r, r, edge);
  body.addColorStop(0, 'rgba(255, 244, 210, 0.42)');
  body.addColorStop(0.75, 'rgba(255, 220, 150, 0.16)');
  body.addColorStop(1, 'rgba(70, 30, 0, 0.45)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(r, r, edge, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 250, 230, 0.55)';
  ctx.lineWidth = r * 0.12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(r, r, edge * 0.72, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.ellipse(r * 0.66, r * 0.6, r * 0.2, r * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

// The head's texture, anchored to the top of the foam: fine cells near the
// crown, coarser ones further down, warming toward beer at the bottom.
function foamTexture(w: number, h: number, dpr: number, cell: HTMLCanvasElement): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(w * dpr, h * dpr);
  ctx.scale(dpr, dpr);
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#fffdf6');
  base.addColorStop(0.55, '#f8eed6');
  base.addColorStop(0.85, '#f1d9a0');
  base.addColorStop(1, '#e8b860');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const count = Math.round((w * h) / 26);
  for (let i = 0; i < count; i++) {
    const depth = Math.pow(Math.random(), 0.8);
    const y = depth * h;
    const r = (1.2 + depth * 4.5) * rand(0.6, 1.4);
    ctx.globalAlpha = 0.55 + (1 - depth) * 0.45;
    ctx.drawImage(cell, rand(-r, w + r) - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  // Re-warm the lower part after the cells, so the head blends into the beer.
  const warm = ctx.createLinearGradient(0, h * 0.6, 0, h);
  warm.addColorStop(0, 'rgba(240, 190, 90, 0)');
  warm.addColorStop(1, 'rgba(232, 160, 50, 0.55)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
  return canvas;
}

// The glass itself, laid over everything: darker toward the left/right edges
// (a cylinder seen head-on) and a few vertical reflections.
function glassLayer(w: number, h: number, dpr: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(w * dpr, h * dpr);
  ctx.scale(dpr, dpr);
  const streak = (x0: number, x1: number, peak: number) => {
    const g = ctx.createLinearGradient(w * x0, 0, w * x1, 0);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.45, `rgba(255, 255, 255, ${peak})`);
    g.addColorStop(0.6, `rgba(255, 255, 255, ${peak * 0.8})`);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(w * x0, 0, w * (x1 - x0), h);
  };
  streak(0.05, 0.17, 0.26);
  streak(0.185, 0.205, 0.4);
  streak(0.8, 0.9, 0.12);
  streak(0.915, 0.925, 0.22);
  // Reflections fade out toward the top and bottom of the glass.
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
  fade.addColorStop(0.25, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(0.8, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  const edges = ctx.createLinearGradient(0, 0, w, 0);
  edges.addColorStop(0, 'rgba(20, 8, 0, 0.24)');
  edges.addColorStop(0.06, 'rgba(20, 8, 0, 0)');
  edges.addColorStop(0.94, 'rgba(20, 8, 0, 0)');
  edges.addColorStop(1, 'rgba(20, 8, 0, 0.24)');
  ctx.fillStyle = edges;
  ctx.fillRect(0, 0, w, h);
  // The thick glass base.
  const base = ctx.createLinearGradient(0, h * 0.94, 0, h);
  base.addColorStop(0, 'rgba(255, 255, 255, 0)');
  base.addColorStop(0.5, 'rgba(255, 240, 210, 0.16)');
  base.addColorStop(1, 'rgba(40, 15, 0, 0.3)');
  ctx.fillStyle = base;
  ctx.fillRect(0, h * 0.94, w, h * 0.06);
  return canvas;
}

export function pourBeer(): void {
  if (running) return;
  running = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const unit = Math.min(W, H) / 400;

  const [canvas, ctx] = makeCanvas(W * dpr, H * dpr);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'beer-pour';
  document.body.appendChild(canvas);

  const bubble = bubbleSprite(96);
  const farBubble = farBubbleSprite(32);
  const foamCell = foamCellSprite(64);
  const droplet = dropletSprite(64);
  const foamMax = H * 0.1;
  // Wider than the screen: the head is drawn rotated when the beer tilts.
  const foamTexWidth = W * 1.2;
  const foamTexHeight = foamMax * 1.6 + 40 * unit;
  const foamTex = foamTexture(foamTexWidth, foamTexHeight, dpr, foamCell);
  const glass = glassLayer(W, H, dpr);

  // Fixed per pour: wave phases, foam crown shape, bubble trails, droplets.
  const phases = Array.from({ length: 6 }, () => rand(0, Math.PI * 2));
  // Nucleation points on the glass floor. Each sheds bubbles at its own
  // steady beat and size, which is what makes real beer rise in strings.
  const sites = Array.from({ length: Math.round(8 + W / 45) }, () => ({
    x: rand(0.04, 0.96) * W,
    next: rand(0, 1500),
    every: rand(60, 220),
    r: rand(0.7, 1.4) * unit,
    depth: Math.pow(Math.random(), 0.5),
  }));
  const droplets: Droplet[] = [];
  const dropletCount = Math.round((W * H) / 5500);
  for (let i = 0; i < dropletCount; i++) {
    const small = Math.random() < 0.8;
    droplets.push({
      x: rand(0, W),
      y: rand(H * 0.24, H),
      r: (small ? rand(1.2, 2.4) : rand(2.8, 5)) * unit,
      wetAt: Infinity,
    });
  }
  const bubbles: Bubble[] = [];

  let fadeStart = FADE_START;
  let fadeMs = FADE_MS;
  let startTime = -1;
  let last = 0;
  let frame = 0;

  // Tilt: where the phone says "level" is, and the beer's own angle, which
  // chases it on a slightly underdamped spring so it sloshes before settling.
  // Positive = the screen's right edge is the lower one.
  let tiltTarget = 0;
  let tilt = 0;
  let tiltVel = 0;

  const onOrientation = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return;
    const beta = event.beta * RAD;
    const gamma = event.gamma * RAD;
    // Gravity in device axes (x right, y toward the top edge, z out of the screen).
    const gx = Math.cos(beta) * Math.sin(gamma);
    const gy = -Math.sin(beta);
    const gz = -Math.cos(beta) * Math.cos(gamma);
    // Device axes → screen axes, for when the page itself is rotated.
    const turn = (window.screen.orientation?.angle ?? 0) * RAD;
    const sx = gx * Math.cos(turn) - gy * Math.sin(turn);
    const sy = gx * Math.sin(turn) + gy * Math.cos(turn);
    // Sideways lean against everything else, so it stays well-behaved
    // whether the phone is held upright or lying nearly flat.
    tiltTarget = clamp(Math.atan2(sx, Math.hypot(sy, gz)), -MAX_TILT, MAX_TILT);
  };
  const listenForTilt = () => window.addEventListener('deviceorientation', onOrientation);
  // iOS only hands out motion data after a permission prompt, which has to be
  // requested from a user gesture — we're inside the icon's click here.
  const orientationApi = window.DeviceOrientationEvent as
    | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
    | undefined;
  if (orientationApi && !reduceMotion) {
    if (typeof orientationApi.requestPermission === 'function') {
      orientationApi
        .requestPermission()
        .then((state) => {
          if (state === 'granted' && running) listenForTilt();
        })
        .catch(() => {});
    } else {
      listenForTilt();
    }
  }

  const fillAt = (t: number) => FILL_LEVEL * easeInOutSine((t - FILL_START) / (FILL_END - FILL_START));
  const levelY = (t: number) => H * (1 - fillAt(t));
  // Livelier while filling and while sloshing, a gentle sway otherwise.
  const waveAmp = (t: number) =>
    unit * (1.1 + 2.4 * (1 - smoothstep(FILL_END - 900, FILL_END + 900, t)) + Math.min(5, Math.abs(tiltVel) * 9));

  const surfaceY = (x: number, t: number) => {
    const s = t * 0.001;
    const wave =
      Math.sin(x * 0.018 + s * 2.1 + phases[0]) * 0.55 +
      Math.sin(x * 0.041 - s * 3.1 + phases[1]) * 0.3 +
      Math.sin(x * 0.093 + s * 4.7 + phases[2]) * 0.15;
    return Math.min(H + 20, levelY(t) - Math.tan(tilt) * (x - W / 2) + wave * waveAmp(t));
  };

  const foamThickness = (t: number) => foamMax * smoothstep(FILL_START + 700, FILL_END + 300, t);

  const foamTopY = (x: number, t: number, surface: number) => {
    const thick = foamThickness(t);
    if (thick <= 0) return surface;
    const s = t * 0.001;
    const crown =
      1 +
      0.07 * Math.sin(x * 0.011 + phases[3] + s * 0.4) +
      0.05 * Math.sin(x * 0.029 + phases[4] - s * 0.6) +
      0.03 * Math.sin(x * 0.07 + phases[5]);
    // Small bubbly scallops along the crown.
    const scallop = Math.sqrt(Math.abs(Math.sin(x * 0.16 + phases[4]))) * 2.2 * unit;
    // Foam climbs the glass a little at both edges (meniscus).
    const edge = W * 0.05;
    const meniscus = (Math.exp(-x / edge) + Math.exp(-(W - x) / edge)) * thick * 0.18;
    return surface - thick * crown - scallop * smoothstep(0, foamMax * 0.3, thick) - meniscus;
  };

  const step = Math.max(2, W / 260);

  function spawn(t: number, dt: number) {
    const level = levelY(t);
    if (H - level < 4 * unit) return;
    for (const site of sites) {
      site.next -= dt;
      if (site.next <= 0 && bubbles.length < MAX_BUBBLES) {
        site.next += site.every * rand(0.85, 1.15);
        bubbles.push({
          x: site.x + rand(-0.4, 0.4) * unit,
          y: H + site.r,
          r: site.r * rand(0.9, 1.1),
          depth: site.depth,
          phase: rand(0, Math.PI * 2),
          age: 0,
        });
      }
    }
    // Strays that let go of the glass wall anywhere in the beer — more of
    // them while it's still filling and churned up.
    const filling = 1 - smoothstep(FILL_END - 600, FILL_END + 1200, t);
    const expected = dt * (0.006 + 0.03 * filling) * (W / 400);
    const strays = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    for (let i = 0; i < strays && bubbles.length < MAX_BUBBLES; i++) {
      bubbles.push({
        x: rand(0, W),
        y: rand(level + (H - level) * 0.2, H),
        r: rand(0.6, 1.7) * unit * (Math.random() < 0.08 ? 1.6 : 1),
        depth: Math.random(),
        phase: rand(0, Math.PI * 2),
        age: 0,
      });
    }
  }

  function update(t: number, dt: number) {
    const sec = dt / 1000;
    tiltVel += ((tiltTarget - tilt) * 70 - tiltVel * 7) * sec;
    tilt = clamp(tilt + tiltVel * sec, -MAX_TILT, MAX_TILT);

    spawn(t, dt);
    // Bubbles rise against gravity, wherever the phone says that is.
    const upX = -Math.sin(tilt);
    const upY = -Math.cos(tilt);
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.age += sec;
      // They swell as the pressure drops on the way up, and bigger bubbles
      // rise faster — so a string of them spreads out toward the top.
      b.r *= 1 + sec * 0.22;
      const size = b.r / unit;
      const speed = (30 + 85 * Math.sqrt(size)) * unit * (0.65 + 0.35 * b.depth);
      // Tiny ones climb dead straight; larger ones start to spiral.
      const sway = Math.max(0, size - 1.6) * 6 * unit * Math.cos(b.phase + b.age * (5.5 - size));
      // A slow shared drift, as if the beer were gently turning over.
      const drift = Math.sin(b.y * 0.007 + t * 0.0005 + phases[0]) * 3 * unit;
      b.x = clamp(b.x + (upX * speed - (sway + drift) * upY) * sec, b.r, W - b.r);
      b.y += upY * speed * sec;
      if (b.y - b.r < surfaceY(b.x, t) || b.y > H + 20) bubbles.splice(i, 1);
    }
    for (const d of droplets) {
      if (d.wetAt === Infinity && surfaceY(d.x, t) < d.y) d.wetAt = t;
    }
  }

  function draw(t: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const xs: number[] = [];
    for (let x = 0; x <= W + step; x += step) xs.push(Math.min(x, W));
    const surf = xs.map((x) => surfaceY(x, t));
    const level = levelY(t);
    const highest = Math.min(...surf);
    // Runs `paint` in a frame whose x axis lies along the (tilted) surface
    // line and whose origin is the middle of it.
    const alongSurface = (paint: () => void) => {
      ctx.save();
      ctx.translate(W / 2, level);
      ctx.rotate(-tilt);
      paint();
      ctx.restore();
    };

    // Beer body.
    if (highest < H + 10 * unit) {
      ctx.beginPath();
      ctx.moveTo(0, H);
      xs.forEach((x, i) => ctx.lineTo(x, surf[i]));
      ctx.lineTo(W, H);
      ctx.closePath();
      const top = Math.min(highest, H - 1);
      const body = ctx.createLinearGradient(0, Math.min(level, H - 1), 0, H);
      body.addColorStop(0, BEER_LIGHT);
      body.addColorStop(0.35, BEER_MID);
      body.addColorStop(0.8, BEER_DEEP);
      body.addColorStop(1, BEER_DARKEST);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // Light passing through the glass: a warm glow left of centre…
      const glow = ctx.createRadialGradient(W * 0.4, H * 0.58, 0, W * 0.4, H * 0.58, Math.max(W, H) * 0.55);
      glow.addColorStop(0, 'rgba(255, 215, 110, 0.4)');
      glow.addColorStop(0.5, 'rgba(255, 190, 70, 0.12)');
      glow.addColorStop(1, 'rgba(255, 190, 70, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, top, W, H - top);
      // …and less of it through the thicker beer at the sides.
      const sides = ctx.createLinearGradient(0, 0, W, 0);
      sides.addColorStop(0, 'rgba(90, 35, 0, 0.42)');
      sides.addColorStop(0.2, 'rgba(90, 35, 0, 0)');
      sides.addColorStop(0.8, 'rgba(90, 35, 0, 0)');
      sides.addColorStop(1, 'rgba(90, 35, 0, 0.42)');
      ctx.fillStyle = sides;
      ctx.fillRect(0, top, W, H - top);
      // Bubbles: fade in as they form, and out as they merge into the head.
      for (const b of bubbles) {
        const below = b.y - surfaceY(b.x, t);
        const alpha = Math.min(1, b.age * 3) * clamp01(below / (10 * unit)) * (0.55 + 0.45 * b.depth);
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        const r = b.r * (0.75 + 0.25 * b.depth);
        ctx.drawImage(b.depth < 0.25 ? farBubble : bubble, b.x - r, b.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      // Lighter band just under the surface where the foam meets the beer.
      alongSurface(() => {
        const band = ctx.createLinearGradient(0, 0, 0, 18 * unit);
        band.addColorStop(0, 'rgba(255, 236, 170, 0.75)');
        band.addColorStop(1, 'rgba(255, 220, 130, 0)');
        ctx.fillStyle = band;
        ctx.fillRect(-W, -10 * unit, W * 2, 30 * unit);
      });
      ctx.restore();
    }

    // Foam head.
    const thick = foamThickness(t);
    if (thick > 0.5) {
      const foamTop = xs.map((x, i) => foamTopY(x, t, surf[i]));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xs[0], surf[0] + 1.5 * unit);
      xs.forEach((x, i) => ctx.lineTo(x, foamTop[i]));
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], surf[i] + 1.5 * unit);
      ctx.closePath();
      ctx.clip();
      alongSurface(() => {
        ctx.drawImage(foamTex, -foamTexWidth / 2, -thick * 1.3 - 6 * unit, foamTexWidth, foamTexHeight);
        // Soft shade under the crown, so the head reads as rounded.
        const shade = ctx.createLinearGradient(0, -thick, 0, 0);
        shade.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        shade.addColorStop(0.3, 'rgba(255, 255, 255, 0)');
        shade.addColorStop(1, 'rgba(160, 100, 20, 0.12)');
        ctx.fillStyle = shade;
        ctx.fillRect(-W, -thick * 1.6, W * 2, thick * 1.6 + 4 * unit);
      });
      ctx.restore();
      // Bright edge along the crown.
      ctx.beginPath();
      xs.forEach((x, i) => (i === 0 ? ctx.moveTo(x, foamTop[i]) : ctx.lineTo(x, foamTop[i])));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.4 * unit;
      ctx.lineJoin = 'round';
      ctx.stroke();
      // Melt the line where the head meets the beer.
      alongSurface(() => {
        const seam = ctx.createLinearGradient(0, -10 * unit, 0, 16 * unit);
        seam.addColorStop(0, 'rgba(245, 200, 110, 0)');
        seam.addColorStop(0.4, 'rgba(248, 210, 120, 0.55)');
        seam.addColorStop(0.6, 'rgba(252, 222, 150, 0.45)');
        seam.addColorStop(1, 'rgba(250, 205, 100, 0)');
        ctx.fillStyle = seam;
        ctx.fillRect(-W, -10 * unit, W * 2, 26 * unit);
      });
    }

    // Condensation forms on the glass a moment after the cold beer reaches it.
    for (const d of droplets) {
      if (d.wetAt === Infinity) continue;
      const a = smoothstep(d.wetAt + 300, d.wetAt + 1600, t);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      const r = d.r * (0.6 + 0.4 * a);
      ctx.drawImage(droplet, d.x - r, d.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = smoothstep(0, 350, t);
    ctx.drawImage(glass, 0, 0);
    ctx.globalAlpha = 1;
  }

  const finish = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('deviceorientation', onOrientation);
    canvas.remove();
    running = false;
  };

  const skip = () => {
    const t = startTime < 0 ? 0 : performance.now() - startTime;
    if (t < fadeStart) {
      fadeStart = t;
      fadeMs = SKIP_FADE_MS;
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') skip();
  };
  canvas.addEventListener('pointerdown', skip);
  window.addEventListener('keydown', onKey);

  if (reduceMotion) {
    // No fill: show the finished glass, still, then let it go.
    const still = FILL_END + 800;
    for (let t = 0; t < still; t += 32) update(t, 32);
    draw(still);
    canvas.style.opacity = '0';
    canvas.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], {
      duration: 2200,
      easing: 'ease-in-out',
    }).onfinish = finish;
    return;
  }

  const tick = (now: number) => {
    if (startTime < 0) {
      startTime = now;
      last = now;
    }
    const t = now - startTime;
    const dt = Math.min(50, now - last);
    last = now;
    update(t, dt);
    draw(t);
    const fade = smoothstep(fadeStart, fadeStart + fadeMs, t);
    canvas.style.opacity = String(1 - fade);
    if (fade >= 1) {
      finish();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}
