/* Robot arm pick & place: low belt -> arm -> high belt. No libraries.
   Embed: copy <canvas> + this script.  const a = createRobotArm(canvas);  a.speed = 1.5;  a.paused = true; */
function createRobotArm(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const FLOOR = 505, S = { x: 450, y: 400 };
  const L1 = 170, L2 = 150, L3 = 36;
  const BW = 56, BH = 44;                           // box size
  const PICK_X = 250, PLACE_X = 650;
  const LOW_TOP = 450, HIGH_TOP = 375;              // belt surfaces
  const GRIP_BOX = 0.475;                           // gripper value that squeezes a box
  const rad = d => d * Math.PI / 180;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const api = { speed: 1, paused: false };

  // ---------- kinematics (gripper always points straight down) ----------
  function ik(x, y) {
    const dx = x - S.x, dy = S.y - y;
    const d = Math.min(Math.hypot(dx, dy), L1 + L2 - .01);
    const c = Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
    const q2 = (dx >= 0 ? -1 : 1) * Math.acos(c);
    const q1 = Math.atan2(dy, dx) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
    return [q1 * 180 / Math.PI, q2 * 180 / Math.PI];
  }
  function fk(q) {
    const a1 = rad(q[0]), a2 = rad(q[0] + q[1]);
    const e = { x: S.x + L1 * Math.cos(a1), y: S.y - L1 * Math.sin(a1) };
    const w = { x: e.x + L2 * Math.cos(a2), y: e.y - L2 * Math.sin(a2) };
    return { e, w, a1: q[0], a2: q[0] + q[1], a3: -90 };
  }

  // wrist targets: tool is 90px long to the pad start, box top = wrist + 90
  const wy = top => top - BH - 90;
  const P = {
    pickHover:  { x: PICK_X,  y: wy(LOW_TOP) - 75 },
    pick:       { x: PICK_X,  y: wy(LOW_TOP) },
    placeHover: { x: PLACE_X, y: wy(HIGH_TOP) - 75 },
    place:      { x: PLACE_X, y: wy(HIGH_TOP) },
  };
  const steps = [
    { wait: true },
    { d: .6,  to: P.pick,       mode: 'cart',  g: 1 },
    { d: .5,  to: P.pick,       mode: 'cart',  g: GRIP_BOX, end: 'grab' },
    { d: .6,  to: P.pickHover,  mode: 'cart',  g: GRIP_BOX },
    { d: 1.5, to: P.placeHover, mode: 'joint', g: GRIP_BOX },
    { d: .6,  to: P.place,      mode: 'cart',  g: GRIP_BOX },
    { d: .5,  to: P.place,      mode: 'cart',  g: 1, end: 'drop' },
    { d: .55, to: P.placeHover, mode: 'cart',  g: 1 },
    { d: 1.3, to: P.pickHover,  mode: 'joint', g: 1 },
  ];

  const cur = { q: ik(P.pickHover.x, P.pickHover.y), g: 1 };
  let si = 0, el = 0, q0 = cur.q.slice(), p0 = fk(cur.q).w, g0 = 1;
  let boxes = [], held = null, tread = 0, spawnCount = 0;
  const kinds = [['#dcb078', '#b98443'], ['#c9955a', '#9d6b33'], ['#e4c28e', '#c79b5e']];

  function startStep() { el = 0; q0 = cur.q.slice(); p0 = { ...fk(cur.q).w }; g0 = cur.g; }

  function update(dt) {
    tread = (tread + 80 * dt) % 18;
    // spawn + move boxes on the low belt
    const lows = boxes.filter(b => b.belt === 'low').sort((a, b) => b.x - a.x);
    const tail = lows[lows.length - 1];
    if (lows.length < 4 && (!tail || tail.x > 90)) {
      boxes.push({ x: -40, y: LOW_TOP - BH / 2, belt: 'low', k: kinds[spawnCount++ % 3] });
    }
    let limit = PICK_X;
    lows.forEach(b => { b.x = Math.min(b.x + 80 * dt, limit); limit = b.x - BW - 12; });
    boxes.filter(b => b.belt === 'high').forEach(b => b.x += 80 * dt);
    boxes = boxes.filter(b => b.x < W + 60);

    const s = steps[si];
    if (s.wait) {
      if (lows[0] && lows[0].x >= PICK_X - .5) { si = 1; startStep(); }
      return;
    }
    el += dt;
    const u = Math.min(el / s.d, 1), e = ease(u);
    if (s.mode === 'cart') {
      cur.q = ik(p0.x + (s.to.x - p0.x) * e, p0.y + (s.to.y - p0.y) * e);
    } else {
      const q1 = ik(s.to.x, s.to.y);
      cur.q = [q0[0] + (q1[0] - q0[0]) * e, q0[1] + (q1[1] - q0[1]) * e];
    }
    cur.g = g0 + (s.g - g0) * e;
    if (held) { const w = fk(cur.q).w; held.x = w.x; held.y = w.y + 90 + BH / 2; }
    if (u >= 1) {
      if (s.end === 'grab') { held = boxes.filter(b => b.belt === 'low').sort((a, b) => b.x - a.x)[0]; held.belt = 'held'; }
      if (s.end === 'drop' && held) { held.belt = 'high'; held.x = PLACE_X; held.y = HIGH_TOP - BH / 2; held = null; }
      si = (si + 1) % steps.length;
      startStep();
    }
  }

  // ---------- drawing helpers ----------
  function rrect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function vgrad(y0, y1, stops, x0 = 0, x1 = 0) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([p, c]) => g.addColorStop(p, c)); return g;
  }
  const steel = [[0, '#e5e7eb'], [.35, '#9ca3af'], [1, '#374151']];

  function conveyor(x1, x2, top, motor) {
    // legs + braces
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 3;
    for (let x = x1 + 50; x < x2 - 30; x += 120) {
      ctx.fillStyle = vgrad(0, 0, [[0, '#cbd5e1'], [.5, '#64748b'], [1, '#1e293b']], x - 5, x + 5);
      ctx.fillRect(x - 5, top + 20, 10, FLOOR - top - 20);
      ctx.fillStyle = '#1e293b'; rrect(x - 14, FLOOR - 5, 28, 5, 2); ctx.fill();
      if (FLOOR - top > 70) { ctx.beginPath(); ctx.moveTo(x, top + 34); ctx.lineTo(x + 120, FLOOR - 14); ctx.stroke(); }
    }
    if (motor) {                                           // gearmotor
      ctx.fillStyle = vgrad(top + 24, top + 50, [[0, '#60a5fa'], [1, '#1e3a8a']]);
      rrect(x2 - 52, top + 24, 40, 26, 5); ctx.fill();
      ctx.fillStyle = '#0f172a'; for (let i = 0; i < 4; i++) ctx.fillRect(x2 - 46 + i * 8, top + 28, 3, 18);
    }
    // belt (rubber capsule)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
    ctx.fillStyle = vgrad(top, top + 22, [[0, '#374151'], [1, '#0b0f19']]);
    rrect(x1, top, x2 - x1, 22, 11); ctx.fill();
    ctx.restore();
    ctx.save(); rrect(x1 + 6, top, x2 - x1 - 12, 7, 3); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    for (let x = x1 - 18 + tread; x < x2; x += 18) ctx.fillRect(x, top, 3, 7);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x1 + 8, top, x2 - x1 - 16, 1.5);
    // steel side rail
    ctx.fillStyle = vgrad(top + 7, top + 21, steel);
    rrect(x1 + 6, top + 7, x2 - x1 - 12, 14, 3); ctx.fill();
    ctx.fillStyle = '#1f2937';
    for (let x = x1 + 30; x < x2 - 20; x += 44) { ctx.beginPath(); ctx.arc(x, top + 14, 2.3, 0, 7); ctx.fill(); }
    // end rollers
    [x1 + 11, x2 - 11].forEach(x => {
      ctx.fillStyle = vgrad(top + 3, top + 19, steel); ctx.beginPath(); ctx.arc(x, top + 11, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(x, top + 11, 2.5, 0, 7); ctx.fill();
    });
  }
  function stopper() {
    const x = PICK_X + BW / 2 + 4;
    ctx.fillStyle = '#facc15'; rrect(x, LOW_TOP - 20, 10, 20, 2); ctx.fill();
    ctx.fillStyle = '#111827'; ctx.fillRect(x, LOW_TOP - 15, 10, 3); ctx.fillRect(x, LOW_TOP - 7, 10, 3);
  }

  function drawBox(b) {
    const x = b.x - BW / 2, y = b.y - BH / 2;
    ctx.save();
    if (b.belt !== 'held') { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(b.x, y + BH, BW / 2 + 2, 3, 0, 0, 7); ctx.fill(); }
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = b.belt === 'held' ? 12 : 5; ctx.shadowOffsetY = b.belt === 'held' ? 8 : 2;
    ctx.fillStyle = vgrad(y, y + BH, [[0, b.k[0]], [1, b.k[1]]]);
    rrect(x, y, BW, BH, 3); ctx.fill();
    ctx.shadowColor = 'transparent';
    rrect(x, y, BW, BH, 3); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(x, y, BW, 7);                // lid edge
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x, y + 7, BW, 1.5);               // flap seam
    ctx.fillRect(b.x - .5, y, 1, 7);
    ctx.fillStyle = 'rgba(235,215,170,.88)'; ctx.fillRect(b.x - 6, y, 12, 24);         // packing tape
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(b.x - 4, y, 2, 24);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(x + BW - 24, y + BH - 19, 19, 14);        // label
    ctx.fillStyle = '#111827';
    [0, 2, 3, 5, 6, 8, 11, 12, 14].forEach(o => ctx.fillRect(x + BW - 22 + o, y + BH - 11, o % 3 ? 1 : 2, 6));
    ctx.fillStyle = '#b91c1c'; ctx.fillRect(x + BW - 22, y + BH - 17, 8, 2);
    ctx.fillStyle = 'rgba(60,35,10,.55)';                                              // "this side up" arrows
    [x + 9, x + 19].forEach(ax => { ctx.beginPath(); ctx.moveTo(ax, y + BH - 22); ctx.lineTo(ax - 4, y + BH - 15); ctx.lineTo(ax + 4, y + BH - 15); ctx.fill(); ctx.fillRect(ax - 1, y + BH - 15, 2, 9); });
    ctx.restore();
    ctx.strokeStyle = 'rgba(60,35,10,.5)'; ctx.lineWidth = 1.2; rrect(x, y, BW, BH, 3); ctx.stroke();
  }

  function metalGrad(len, hw, theta, stops) {
    const ux = -Math.sin(theta), uy = -Math.cos(theta);
    const g = ctx.createLinearGradient(len / 2 + ux * hw, uy * hw, len / 2 - ux * hw, -uy * hw);
    stops.forEach(([p, c]) => g.addColorStop(p, c)); return g;
  }
  function body(x, y, angDeg, len, w0, w1, stops, detail) {
    const th = -rad(angDeg);
    ctx.save(); ctx.translate(x, y); ctx.rotate(th);
    ctx.beginPath(); ctx.moveTo(0, -w0); ctx.lineTo(len, -w1);
    ctx.arc(len, 0, w1, -Math.PI / 2, Math.PI / 2, false); ctx.lineTo(0, w0);
    ctx.arc(0, 0, w0, Math.PI / 2, Math.PI * 1.5, false); ctx.closePath();
    ctx.fillStyle = metalGrad(len, Math.max(w0, w1), th, stops);
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6; ctx.fill();
    ctx.shadowColor = 'transparent';
    if (detail) {
      ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 2;
      [.18, .82].forEach(p => { ctx.beginPath(); ctx.moveTo(len * p, -w0 - 4); ctx.lineTo(len * p, w0 + 4); ctx.stroke(); });
      ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(len * .22, -w0 * .55); ctx.lineTo(len * .78, -w1 * .55); ctx.stroke();
      ctx.fillStyle = 'rgba(15,23,42,.55)'; ctx.fillRect(len * .36, -w0 * .25, len * .28, w0 * .5);
    }
    ctx.restore();
  }
  function joint(p, r, ang) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
    let g = ctx.createRadialGradient(-r * .3, -r * .3, r * .1, 0, 0, r);
    g.addColorStop(0, '#9ca3af'); g.addColorStop(.5, '#4b5563'); g.addColorStop(1, '#111827');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, 7); ctx.stroke();
    g = ctx.createRadialGradient(-r * .2, -r * .2, 1, 0, 0, r * .62);
    g.addColorStop(0, '#e5e7eb'); g.addColorStop(1, '#6b7280');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * .6, 0, 7); ctx.fill();
    ctx.fillStyle = '#1f2937';
    for (let i = 0; i < 6; i++) { const a = rad(-ang) + i * Math.PI / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * r * .8, Math.sin(a) * r * .8, r * .07, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(0, 0, r * .16, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawBase() {
    let g = vgrad(FLOOR, H, [[0, '#1e293b'], [1, '#0b1220']]);
    ctx.fillStyle = g; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.strokeStyle = 'rgba(148,163,184,.10)'; ctx.lineWidth = 1;
    for (let x = -300; x < W + 300; x += 60) { ctx.beginPath(); ctx.moveTo(450 + (x - 450) * .35, FLOOR); ctx.lineTo(450 + (x - 450) * 1.6, H); ctx.stroke(); }
    ctx.fillStyle = vgrad(FLOOR - 16, FLOOR, [[0, '#9ca3af'], [1, '#374151']]); rrect(S.x - 95, FLOOR - 16, 190, 16, 5); ctx.fill();
    ctx.fillStyle = '#111827'; [-80, -60, 60, 80].forEach(dx => { ctx.beginPath(); ctx.arc(S.x + dx, FLOOR - 8, 4, 0, 7); ctx.fill(); });
    const orange = [[0, '#7c2d12'], [.3, '#fb923c'], [.45, '#fed7aa'], [.7, '#ea580c'], [1, '#7c2d12']];
    ctx.fillStyle = vgrad(0, 0, orange, S.x - 60, S.x + 60);
    ctx.beginPath(); ctx.moveTo(S.x - 70, FLOOR - 16); ctx.lineTo(S.x + 70, FLOOR - 16); ctx.lineTo(S.x + 48, S.y + 38); ctx.lineTo(S.x - 48, S.y + 38); ctx.closePath(); ctx.fill();
    ctx.fillStyle = vgrad(0, 0, [[0, '#111827'], [.4, '#9ca3af'], [1, '#111827']], S.x - 55, S.x + 55); rrect(S.x - 56, S.y + 26, 112, 16, 6); ctx.fill();
    ctx.fillStyle = vgrad(0, 0, [[0, '#7c2d12'], [.35, '#fb923c'], [.5, '#fed7aa'], [.8, '#c2410c'], [1, '#7c2d12']], S.x - 50, S.x + 50); rrect(S.x - 48, S.y - 34, 96, 66, 16); ctx.fill();
  }

  function drawGripper(w, open) {
    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(Math.PI / 2);        // tool points down
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
    const lit = (hw, st) => vgrad(0, 0, st, 0, hw);                      // light from the left in tool space
    const gl = (hw, st) => { const g = ctx.createLinearGradient(-hw, 0, hw, 0); st.forEach(([p, c]) => g.addColorStop(p, c)); return g; };
    ctx.fillStyle = gl(22, [[0, '#e5e7eb'], [.45, '#9ca3af'], [1, '#374151']]); rrect(L3 - 6, -20, 14, 40, 4); ctx.fill();
    ctx.fillStyle = gl(30, [[0, '#6b7280'], [.5, '#374151'], [1, '#0f172a']]); rrect(L3 + 6, -30, 34, 60, 8); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#0b0f19'; ctx.fillRect(L3 + 16, -56, 18, 112);                     // guide rail
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(L3 + 16, -56, 3, 112);
    const gap = 9 + open * 40;
    [-1, 1].forEach(sg => {
      ctx.save(); ctx.scale(1, sg);
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
      ctx.fillStyle = gl(20, [[0, '#e5e7eb'], [.5, '#9ca3af'], [1, '#374151']]);
      ctx.beginPath(); ctx.moveTo(L3 + 34, gap + 14); ctx.lineTo(L3 + 88, gap + 10); ctx.lineTo(L3 + 94, gap + 1); ctx.lineTo(L3 + 34, gap); ctx.closePath(); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#1f2937'; ctx.fillRect(L3 + 54, gap - 1.5, 36, 5);              // rubber pad
      ctx.restore();
    });
    ctx.restore();
  }

  function draw() {
    const bg = ctx.createRadialGradient(W / 2, H * .4, 80, W / 2, H / 2, W * .7);
    bg.addColorStop(0, '#1e293b'); bg.addColorStop(1, '#070b14');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    const f = fk(cur.q);
    drawBase();
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(S.x, FLOOR + 6, 120, 12, 0, 0, 7); ctx.fill();

    conveyor(-20, 340, LOW_TOP, true);
    conveyor(560, W + 20, HIGH_TOP, false);
    stopper();
    boxes.filter(b => b.belt !== 'held').forEach(drawBox);
    if (held) drawBox(held);

    const paint = [[0, '#fed7aa'], [.3, '#fb923c'], [.65, '#ea580c'], [1, '#7c2d12']];
    const grey = [[0, '#d1d5db'], [.4, '#6b7280'], [1, '#111827']];
    body(S.x, S.y, f.a1, L1, 30, 22, paint, true);
    body(f.e.x, f.e.y, f.a2, L2, 24, 16, paint, true);
    body(f.w.x, f.w.y, f.a3, L3 + 4, 17, 14, grey, false);
    drawGripper(f.w, cur.g);
    joint(S, 34, f.a1); joint(f.e, 27, f.a2); joint(f.w, 20, f.a1 + f.a2);
  }

  let last = performance.now();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (!api.paused) update(dt * api.speed);
    draw();
    requestAnimationFrame(loop);
  })(last);
  return api;
}
window.createRobotArm = createRobotArm; window.robotArmDemo = createRobotArm(document.getElementById('arm'));
