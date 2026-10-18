// Legends 3v3 — pure player-styling helpers (no DOM, no three.js).
// Shared by the browser model builder (public/world.js) and bun tests.

export function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h + s.charCodeAt(i)) >>> 0);
  return h;
}

// Arched jersey wordmark layout: characters ride an upward arc (like a
// classic basketball jersey). Returns [{ch, x, y, rot}] where (x,y) is the
// canvas anchor for the char and rot is the canvas rotation in radians.
// (cx, topY) = center x and the y of the arc's crown; radius = arc radius;
// step = radians per character.
export function archLayout(text, cx, topY, radius, step) {
  const n = text.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const th = (i - (n - 1) / 2) * step;
    out.push({
      ch: text[i],
      x: cx + radius * Math.sin(th),
      y: topY + radius - radius * Math.cos(th),
      rot: th,
    });
  }
  return out;
}

// Deterministic per-player accessories, seeded by player id.
// Reference look: shooting sleeve on one forearm, wristband on the opposite
// wrist, black knee sleeves under the shorts.
export function accessoriesFor(pid) {
  const h = hashStr(String(pid));
  const sleeve = (h % 2 === 0) ? ((h % 4 === 0) ? 'L' : 'R') : null;
  const wristband = (h % 10 < 8) ? (sleeve === 'L' ? 'R' : 'L') : null;
  const kneeSleeves = (h % 3 === 0);
  return { sleeve, wristband, kneeSleeves };
}

const BUILD_W = { huge: 0.62, power: 0.55, solid: 0.50, athletic: 0.46, slight: 0.40 };

// Proportion params from build class + height. The mesh (public/world.js) and
// the physics body (public/body.js, via PlayerMesh.bodyParams()) both derive
// from these, so the IK rig always matches the visible model.
// Reference direction: broader shoulders, tapered torso, slightly longer limbs.
export function buildParams(build, h) {
  const s = h / 1.98;
  const wBase = (BUILD_W[build] || 0.46) * s;
  const legLen = h * 0.49;              // slightly longer limbs (was 0.47)
  const L1 = legLen * 0.52;             // thigh (matches Body)
  const L2 = legLen * 0.48;             // shin  (matches Body)
  const torsoH = h * 0.285;             // a touch shorter; total height ~h preserved
  const shoulderW = wBase * 1.14;       // broad shoulders
  const waistW = wBase * 0.90;          // tapered waist
  const hipW = wBase * 0.98;
  const armLen = h * 0.35 * (1 + (h - 1.98) * 0.18);
  return {
    s, legLen, L1, L2, torsoH,
    shoulderW, waistW, hipW,
    tD: shoulderW * 0.55,
    armLen,
    hipJointX: hipW * 0.30,
  };
}
