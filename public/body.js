// Legends 3v3 — body physics model. Pure JS: no DOM, no three.js.
// Per-player rigid-body-ish state (position/velocity/accel), gait with planted
// feet, analytic two-bone leg IK, ballistic jumps, capsule collisions.

export const GRAV = 9.81;
export const FOOT_Y = 0.07; // ankle target height: shoe sole touches the floor

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function turnToward(cur, want, maxStep) {
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + clamp(d, -maxStep, maxStep);
}

// ---------- analytic two-bone leg IK (sagittal plane) ----------
// Target (tx,ty,tz) is relative to the hip JOINT, y up, +z forward (player local).
// The rig has no hip roll joint, so the solve is planar (y-z); lateral tx only
// limits reach. Returns {hipX, knee}.
// Rig convention: thigh.rotation.x = hipX (negative = leg swings forward),
// knee.rotation.x = knee (positive = heel kicks back). Returns {hipX, knee}.
export function solveLeg(tx, ty, tz, L1, L2) {
  // planar target (sagittal plane); lateral offset is rendered at the hip joint
  let dy = ty, dz = tz;
  let d = Math.hypot(dy, dz);
  const maxD = (L1 + L2) * 0.999;
  const minD = Math.abs(L1 - L2) * 1.1 + 0.02;
  if (d > maxD) { const s = maxD / d; dy *= s; dz *= s; d = maxD; }
  else if (d < minD) { const s = minD / Math.max(d, 1e-6); dy *= s; dz *= s; d = minD; }
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const A = Math.acos(cosA);                    // hip angle between thigh and hip->foot line
  const gamma = Math.atan2(dz, -dy);             // hip->foot direction from straight-down (+forward)
  const hipX = -(gamma + A);                    // thigh rotates toward the knee side (forward)
  const cosB = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const knee = Math.PI - Math.acos(cosB);       // 0 = straight leg
  return { hipX, knee };
}

// Forward kinematics mirroring the three.js rig (Euler XYZ, single-axis joints):
// foot = hipJoint + Ry(heading) * [ Rx(hipX)*(0,-L1,0) + Rx(hipX+knee)*(0,-L2,0) ]
// hip = {x,y,z} world position of the HIP JOINT (already includes lateral offset).
export function fkLeg(hip, heading, hipX, knee, L1, L2) {
  const c = Math.cos(heading), s = Math.sin(heading);
  const tdx = 0, tdy = -Math.cos(hipX), tdz = -Math.sin(hipX);
  const kx = hip.x + (tdx * c + tdz * s) * L1;
  const ky = hip.y + tdy * L1;
  const kz = hip.z + (-tdx * s + tdz * c) * L1;
  const a2 = hipX + knee;
  const sdx = 0, sdy = -Math.cos(a2), sdz = -Math.sin(a2);
  return {
    x: kx + (sdx * c + sdz * s) * L2,
    y: ky + sdy * L2,
    z: kz + (-sdx * s + sdz * c) * L2,
  };
}

// world delta -> player-local (inverse of Ry(heading)); y passes through
export function worldToLocal(dx, dz, heading) {
  const c = Math.cos(heading), s = Math.sin(heading);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

const BUILD_RADIUS = { huge: 0.42, power: 0.38, solid: 0.35, athletic: 0.32, slight: 0.29 };

export class Body {
  constructor(o) {
    this.h = o.h || 1.98;
    this.legLen = o.legLen || this.h * 0.47;
    this.L1 = o.L1 || this.legLen * 0.52;   // thigh
    this.L2 = o.L2 || this.legLen * 0.48;   // shin (+foot handled by target height)
    this.hipXoff = o.hipXoff || 0.11;
    this.maxSpeed = o.maxSpeed || 5.5;
    this.accel = o.accel || 18;
    this.turnRate = o.turnRate || 7;
    this.radius = o.radius || BUILD_RADIUS[o.build] || 0.33;
    this.x = o.x || 0; this.z = o.z || 10;
    this.y = 0; this.vy = 0;
    this.vx = 0; this.vz = 0;
    this.speed = 0;
    this.heading = o.heading !== undefined ? o.heading : Math.PI;
    this.faceHeading = null;
    this.tx = this.x; this.tz = this.z; this.cruise = 0;
    this.stridePhase = 0;
    this.leanF = 0; this.leanS = 0;
    this.crouch = 0; this.crouchTarget = 0;
    this.airborne = false; this.landed = false;
    this.justPlanted = null; // 'L' | 'R' set for one frame when a foot plants
    const nL = this.neutralFoot(-1), nR = this.neutralFoot(1);
    this.footL = { side: 'L', mode: 'plant', x: nL.x, z: nL.z, y: FOOT_Y, t: 0, dur: 0, sx: nL.x, sz: nL.z, tx: nL.x, tz: nL.z, plantT: 0 };
    this.footR = { side: 'R', mode: 'plant', x: nR.x, z: nR.z, y: FOOT_Y, t: 0, dur: 0, sx: nR.x, sz: nR.z, tx: nR.x, tz: nR.z, plantT: 0 };
  }
  neutralFoot(side) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const off = side * this.hipXoff * 1.2;
    return {
      x: this.x + off * c,
      z: this.z - off * s + (side < 0 ? 0.07 : -0.07),
    };
  }
  snap(x, z, heading) {
    this.x = x; this.z = z; this.tx = x; this.tz = z;
    this.vx = 0; this.vz = 0; this.speed = 0; this.cruise = 0;
    this.y = 0; this.vy = 0; this.airborne = false;
    if (heading !== undefined) this.heading = heading;
    this.faceHeading = null;
    const nL = this.neutralFoot(-1), nR = this.neutralFoot(1);
    for (const [f, n] of [[this.footL, nL], [this.footR, nR]]) {
      f.mode = 'plant'; f.x = n.x; f.z = n.z; f.y = FOOT_Y; f.plantT = 0;
    }
  }
  setTarget(x, z, dur) {
    this.tx = x; this.tz = z;
    const dist = Math.hypot(x - this.x, z - this.z);
    this.cruise = clamp(dist / Math.max(dur * 0.92, 0.05), 0, this.maxSpeed * 1.25);
  }
  stop() { this.tx = this.x; this.tz = this.z; this.cruise = 0; }
  jump(apex) {
    if (this.airborne || this.y > 0.01) return;
    this.vy = Math.sqrt(2 * GRAV * apex);
    this.airborne = true;
    this.footL.mode = 'air'; this.footR.mode = 'air';
  }
  hipHeight() { return this.legLen - this.crouch * 0.12; }

  update(dt) {
    dt = Math.max(dt, 1e-4);
    // --- desired velocity toward target ---
    let dx = this.tx - this.x, dz = this.tz - this.z;
    const dist = Math.hypot(dx, dz);
    let des = 0;
    if (dist > 0.03) { des = Math.min(this.cruise, dist * 3.2); dx /= dist; dz /= dist; }
    else { dx = 0; dz = 0; if (dist <= 0.02) { this.vx = 0; this.vz = 0; } } // full stop: no asymptotic creep
    // --- accelerate (capped) ---
    const k = 1 - Math.exp(-dt * 7);
    let nvx = this.vx + (dx * des - this.vx) * k;
    let nvz = this.vz + (dz * des - this.vz) * k;
    const dvx = nvx - this.vx, dvz = nvz - this.vz;
    const dv = Math.hypot(dvx, dvz), maxDv = this.accel * dt;
    if (dv > maxDv) { nvx = this.vx + dvx / dv * maxDv; nvz = this.vz + dvz / dv * maxDv; }
    const ax = (nvx - this.vx) / dt, az = (nvz - this.vz) / dt;
    this.x += nvx * dt; this.z += nvz * dt;
    this.vx = nvx; this.vz = nvz;
    this.speed = Math.hypot(nvx, nvz);
    // --- heading: turn toward motion, or toward faceHeading when still ---
    if (this.speed > 0.35) {
      this.heading = turnToward(this.heading, Math.atan2(nvx, nvz), this.turnRate * dt);
    } else if (this.faceHeading !== null && this.faceHeading !== undefined) {
      this.heading = turnToward(this.heading, this.faceHeading, this.turnRate * dt * 0.7);
    }
    // --- vertical (ballistic) ---
    if (this.airborne) {
      this.vy -= GRAV * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0; this.airborne = false;
        this.crouch = 1; this.landed = true;
        const nL = this.neutralFoot(-1), nR = this.neutralFoot(1);
        this.footL.mode = 'plant'; this.footL.x = nL.x; this.footL.z = nL.z; this.footL.y = FOOT_Y;
        this.footR.mode = 'plant'; this.footR.x = nR.x; this.footR.z = nR.z; this.footR.y = FOOT_Y;
      }
    } else {
      this.crouch += ((this.crouchTarget || 0) - this.crouch) * Math.min(1, dt * 5);
    }
    // --- lean from acceleration ---
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const tF = clamp((ax * fx + az * fz) * 0.020, -0.18, 0.36);
    const tS = clamp((ax * fz - az * fx) * 0.020, -0.28, 0.28);
    const lk = 1 - Math.exp(-8 * dt);
    this.leanF += (tF - this.leanF) * lk;
    this.leanS += (tS - this.leanS) * lk;
    // --- gait ---
    this.updateGait(dt);
  }

  updateGait(dt) {
    this.justPlanted = null;
    if (this.airborne) return; // feet tuck; targets unused
    const moving = this.speed > 0.45;
    if (!moving) {
      // ease both feet back to neutral stance; 'settle' may move, 'plant' never does
      for (const [f, side] of [[this.footL, -1], [this.footR, 1]]) {
        const n = this.neutralFoot(side);
        const dd = Math.hypot(f.x - n.x, f.z - n.z);
        if (dd < 0.004) { f.x = n.x; f.z = n.z; f.y = FOOT_Y; f.mode = 'plant'; }
        else {
          const kk = Math.min(1, dt * 10);
          f.x = lerp(f.x, n.x, kk); f.z = lerp(f.z, n.z, kk); f.y = FOOT_Y;
          f.mode = 'settle';
        }
      }
      return;
    }
    const stepLen = (0.5 + 0.6 * (this.speed / this.maxSpeed)) * (this.legLen / 0.93);
    const stepDur = stepLen / Math.max(this.speed, 0.6);
    this.stridePhase += dt * Math.PI / stepDur; // half cycle per step
    const feet = [this.footL, this.footR];
    for (const f of feet) {
      const other = f === this.footL ? this.footR : this.footL;
      if (f.mode === 'swing') {
        f.t += dt;
        const q = Math.min(1, f.t / f.dur);
        f.x = lerp(f.sx, f.tx, q); f.z = lerp(f.sz, f.tz, q);
        f.y = FOOT_Y + Math.sin(q * Math.PI) * 0.07;
        if (q >= 1) { f.mode = 'plant'; f.y = FOOT_Y; f.plantT = 0; this.justPlanted = f.side; }
      } else {
        f.plantT += dt;
        // swing only when the other foot is down -> alternating gait
        if (f.plantT > stepDur * 0.55 && other.mode === 'plant') {
          const sp = Math.max(this.speed, 0.6);
          const mx = this.vx / sp, mz = this.vz / sp;
          const side = f.side === 'L' ? -1 : 1;
          const c = Math.cos(this.heading), s = Math.sin(this.heading);
          f.sx = f.x; f.sz = f.z;
          f.tx = this.x + mx * stepLen * 0.62 + side * this.hipXoff * 1.1 * c;
          f.tz = this.z + mz * stepLen * 0.62 - side * this.hipXoff * 1.1 * s;
          f.t = 0; f.dur = Math.max(0.05, stepDur * 0.42); f.mode = 'swing';
        }
      }
    }
  }
}

// Soft capsule-vs-capsule push in XZ + stanchion + court bounds. Mutates bodies.
export function resolveCollisions(bodies) {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const minD = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD && d2 > 1e-8) {
        const d = Math.sqrt(d2), push = (minD - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        // bleed off inward velocity a touch
        const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
        const vn = rvx * nx + rvz * nz;
        if (vn < 0) {
          a.vx += nx * vn * 0.25; a.vz += nz * vn * 0.25;
          b.vx -= nx * vn * 0.25; b.vz -= nz * vn * 0.25;
        }
      }
    }
  }
  for (const b of bodies) {
    // stanchion pole at (0, -1.1)
    const sx = b.x - 0, sz = b.z - (-1.1);
    const sd = Math.hypot(sx, sz), minS = b.radius + 0.30;
    if (sd < minS && sd > 1e-6) { b.x = (sx / sd) * minS; b.z = -1.1 + (sz / sd) * minS; }
    b.x = clamp(b.x, -8.6, 8.6);
    b.z = clamp(b.z, -1.4, 15.4);
  }
}
