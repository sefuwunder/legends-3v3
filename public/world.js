// Legends 3v3 — Dreamcast-style 3D world (three.js r160, vendored).
import * as THREE from './vendor/three.module.js';
import { PLAYERS } from '../src/roster.js';
import { solveLeg } from './body.js';

export const COURT = { W: 15, D: 14, HX: 0, HZ: 1.575, RIM: 3.05 };

const BUILD_W = { huge: 0.62, power: 0.55, solid: 0.50, athletic: 0.46, slight: 0.40 };

// per-player hair: [style, color, extra]
const HAIR = {
  jordan:  ['bald'],
  kobe:    ['afro', 0x0e0c0a],
  lebron:  ['short', 0x0e0c0a],
  curry:   ['short', 0x4a2f1a],
  shaq:    ['bald'],
  duncan:  ['short', 0x0e0c0a],
  magic:   ['short', 0x0e0c0a],
  bird:    ['short', 0xd8b36a, 'mustache'],
  durant:  ['short', 0x0e0c0a],
  hakeem:  ['short', 0x0e0c0a],
  iverson: ['cornrows', 0x0e0c0a],
  dirk:    ['short', 0xc9a35f],
};
const HEAD_SCALE = { shaq: 1.14 };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------- court ----------------
function courtTexture() {
  const W = 1024, H = 956; // 15m x 14m
  const sx = x => (x + 7.5) / 15 * W;
  const sz = z => (z / 14) * H; // canvas top = baseline (z=0), canvas bottom = halfcourt (z=14)
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#c98d4e'; g.fillRect(0, 0, W, H);
    // planks
    for (let x = 0; x < W; x += 34) {
      g.fillStyle = `rgba(120,70,30,${0.05 + (x % 68 === 0 ? 0.06 : 0)})`;
      g.fillRect(x, 0, 2, H);
    }
    for (let i = 0; i < 300; i++) { // grain speckle
      g.fillStyle = `rgba(110,65,25,${Math.random() * 0.08})`;
      g.fillRect(Math.random() * W, Math.random() * H, 20 + Math.random() * 40, 2);
    }
    // painted key
    g.fillStyle = 'rgba(38,74,150,0.88)';
    g.fillRect(sx(-2.45), sz(5.8), sx(2.45) - sx(-2.45), sz(0) - sz(5.8));
    // center court logo text (mirrored on canvas so it reads correctly from the broadcast side)
    g.save(); g.translate(W / 2, sz(11.5)); g.scale(-1, 1); g.fillStyle = 'rgba(20,40,90,0.55)';
    g.font = 'italic 900 64px Arial Black, sans-serif'; g.textAlign = 'center';
    g.fillText('LEGENDS 3V3', 0, 0); g.restore();
    // lines
    g.strokeStyle = '#f5f2ea'; g.lineWidth = 5;
    g.strokeRect(sx(-7.5), sz(14), sx(7.5) - sx(-7.5), sz(0) - sz(14));
    // halfcourt line
    g.beginPath(); g.moveTo(sx(-7.5), sz(14)); g.lineTo(sx(7.5), sz(14)); g.stroke();
    // FT line + circle
    g.beginPath(); g.moveTo(sx(-2.45), sz(5.8)); g.lineTo(sx(2.45), sz(5.8)); g.stroke();
    g.beginPath(); g.arc(sx(0), sz(5.8), 1.8 / 15 * W, 0, Math.PI * 2); g.stroke();
    // 3pt: corner lines + arc (r=6.75 around hoop at z=1.575)
    const hr = 6.75 / 15 * W;
    g.beginPath(); g.moveTo(sx(-6.6), sz(0)); g.lineTo(sx(-6.6), sz(2.95)); g.stroke();
    g.beginPath(); g.moveTo(sx(6.6), sz(0)); g.lineTo(sx(6.6), sz(2.95)); g.stroke();
    const a0 = Math.atan2(2.95 - 1.575, -6.6), a1 = Math.atan2(2.95 - 1.575, 6.6);
    g.beginPath(); g.arc(sx(0), sz(1.575), hr, -a0, -a1, true); g.stroke();
    // restricted arc
    g.beginPath(); g.arc(sx(0), sz(1.575), 1.25 / 15 * W, 0, Math.PI); g.stroke();
  });
}

function jerseyTexture(num, name, pri, sec) {
  return canvasTex(128, 160, (g) => {
    g.fillStyle = pri; g.fillRect(0, 0, 128, 160);
    // mesh holes
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (let y = 8; y < 160; y += 8) for (let x = (y % 16 === 0 ? 4 : 0); x < 128; x += 8) g.fillRect(x, y, 2, 2);
    // side trim
    g.fillStyle = sec; g.fillRect(0, 0, 10, 160); g.fillRect(118, 0, 10, 160);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(10, 0, 3, 160); g.fillRect(115, 0, 3, 160);
    // collar + armhole shading
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, 128, 14); g.fillRect(0, 146, 128, 14);
    // name plate
    g.fillStyle = '#fff'; g.font = '900 17px Arial, sans-serif'; g.textAlign = 'center';
    g.fillText(name.toUpperCase().slice(0, 12), 64, 34);
    // number
    g.font = '900 62px Arial Black, sans-serif';
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 4;
    g.strokeText(String(num), 64, 102); g.fillText(String(num), 64, 102);
  });
}

function shortsTexture(pri, sec) {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = pri; g.fillRect(0, 0, 64, 64);
    g.fillStyle = sec; g.fillRect(0, 0, 8, 64); g.fillRect(56, 0, 8, 64);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    for (let y = 4; y < 64; y += 8) for (let x = 0; x < 64; x += 8) g.fillRect(x, y, 2, 2);
  });
}

// ---------------- player ----------------
export class PlayerMesh {
  constructor(pid, colors) {
    this.pid = pid;
    const P = PLAYERS[pid];
    this.P = P;
    const h = P.h, s = h / 1.98;
    this.h = h;
    this.legLen = h * 0.47;
    this.L1 = this.legLen * 0.52;   // thigh (matches Body)
    this.L2 = this.legLen * 0.48;   // shin  (matches Body)
    const torsoH = h * 0.30;
    const tW = BUILD_W[P.build] * s * (0.94 + 0.06 * h / 1.98), tD = tW * 0.55;
    this.hipJointX = tW * 0.30;
    const skin = new THREE.MeshLambertMaterial({ color: P.skin });
    const lastName = P.name.split(' ').pop();
    const jerTex = jerseyTexture(P.num, lastName, colors.pri, colors.sec);
    const jer = new THREE.MeshLambertMaterial({ map: jerTex });
    const jerPlain = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.pri) });
    const shortsM = new THREE.MeshLambertMaterial({ map: shortsTexture(colors.sec, colors.pri) });
    const shoeM = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const shoeAccent = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.sec) });

    const g = new THREE.Group();
    const j = this.j = {};
    const box = (w, hh, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m);

    // hips root
    const hips = new THREE.Group(); hips.position.y = this.legLen; g.add(hips); j.hips = hips;
    // legs
    for (const sd of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(sd * this.hipJointX, 0, 0); hips.add(thigh);
      const th = box(tW * 0.30, this.L1, tW * 0.32, skin); th.position.y = -this.L1 / 2; thigh.add(th);
      const knee = new THREE.Group(); knee.position.y = -this.L1; thigh.add(knee);
      const sh = box(tW * 0.26, this.L2, tW * 0.28, skin); sh.position.y = -this.L2 / 2; knee.add(sh);
      const shoe = box(tW * 0.32, 0.10 * s, tW * 0.56, shoeM);
      shoe.position.set(0, -this.L2 - 0.02, 0.07 * s); knee.add(shoe);
      const accent = box(tW * 0.33, 0.03 * s, tW * 0.30, shoeAccent);
      accent.position.set(0, -this.L2 + 0.015, 0.02 * s); knee.add(accent);
      j[sd < 0 ? 'hipL' : 'hipR'] = thigh; j[sd < 0 ? 'kneeL' : 'kneeR'] = knee;
    }
    // shorts
    const shorts = box(tW * 1.08, torsoH * 0.44, tD * 1.18, shortsM);
    shorts.position.y = torsoH * 0.16; hips.add(shorts);
    // torso
    const spine = new THREE.Group(); spine.position.y = torsoH * 0.32; hips.add(spine); j.spine = spine;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(tW, torsoH * 0.78, tD),
      [jerPlain, jerPlain, jerPlain, jerPlain, jer, jer]);
    torso.position.y = torsoH * 0.42; spine.add(torso);
    const shY = torsoH * 0.78;
    // arms (wingspan scales mildly with height)
    this.armLen = h * 0.34 * (1 + (h - 1.98) * 0.18);
    const uaLen = this.armLen * 0.52, faLen = this.armLen * 0.48;
    for (const sd of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sd * (tW / 2 + 0.03), shY, 0); spine.add(sh);
      const ua = box(tW * 0.24, uaLen, tW * 0.26, jerPlain); ua.position.y = -uaLen / 2; sh.add(ua);
      const el = new THREE.Group(); el.position.y = -uaLen; sh.add(el);
      const fa = box(tW * 0.20, faLen, tW * 0.22, skin); fa.position.y = -faLen / 2; el.add(fa);
      // hand: palm + fingers with open/close, fingertip anchor for the ball
      const handG = new THREE.Group(); handG.position.y = -faLen - 0.01; el.add(handG);
      const palm = box(0.075 * s, 0.10 * s, 0.045 * s, skin); palm.position.y = -0.05 * s; handG.add(palm);
      const fingers = new THREE.Group(); fingers.position.y = -0.10 * s; handG.add(fingers);
      const fing = box(0.065 * s, 0.085 * s, 0.04 * s, skin); fing.position.y = -0.04 * s; fingers.add(fing);
      const tip = new THREE.Object3D(); tip.position.set(0, -0.055 * s, 0.012 * s); handG.add(tip);
      j[sd < 0 ? 'shoL' : 'shoR'] = sh; j[sd < 0 ? 'elbL' : 'elbR'] = el;
      j[sd < 0 ? 'finL' : 'finR'] = fingers;
      if (sd > 0) this.handTipR = tip;
      if (sd < 0) this.handTipL = tip;
    }
    // head
    const neck = new THREE.Group(); neck.position.y = shY + 0.06 * s; spine.add(neck); j.neck = neck;
    const headR = (0.105 * s + 0.008) * (HEAD_SCALE[pid] || 1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 12, 10), skin);
    head.position.y = headR * 1.25; head.scale.y = 1.15; neck.add(head);
    // hair variations (stylized, no likenesses)
    const [style, hairCol, extra] = HAIR[pid] || ['short', 0x14100c];
    const hairM = new THREE.MeshLambertMaterial({ color: hairCol || 0x14100c });
    if (style === 'short' || style === 'afro') {
      const r = headR * (style === 'afro' ? 1.12 : 1.03);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8, 0, Math.PI * 2, 0, 1.35), hairM);
      cap.position.y = headR * 1.30; neck.add(cap);
    } else if (style === 'cornrows') {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.02, 10, 8, 0, Math.PI * 2, 0, 1.3), hairM);
      cap.position.y = headR * 1.30; neck.add(cap);
      for (let i = -2; i <= 2; i++) { // braids front-to-back
        const braid = box(0.022, 0.02, headR * 1.7, hairM);
        braid.position.set(i * 0.035, headR * 1.30 + headR * 0.55, 0);
        braid.rotation.x = -0.5; neck.add(braid);
      }
    }
    if (extra === 'mustache') {
      const mo = box(0.075 * s, 0.018 * s, 0.02 * s, hairM);
      mo.position.set(0, headR * 1.05, headR * 0.92); neck.add(mo);
    }
    if (P.headband) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(headR * 1.0, 0.018, 6, 14),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.sec) }));
      band.rotation.x = Math.PI / 2 - 0.25; band.position.y = headR * 1.42; neck.add(band);
    }
    // blob shadow
    const shTex = canvasTex(64, 64, (gg) => {
      const gr = gg.createRadialGradient(32, 32, 4, 32, 32, 30);
      gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
    });
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * s, 0.9 * s),
      new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; g.add(blob);
    this.blob = blob;

    this.group = g;
    this.armsBusy = false;
    this.crouchHint = 0;
    this.reset();
  }
  bodyParams() {
    return { legLen: this.legLen, L1: this.L1, L2: this.L2, hipXoff: this.hipJointX };
  }
  reset() {
    for (const k of Object.keys(this.j)) this.j[k].rotation.set(0, 0, 0);
    this.armsBusy = false;
    this.crouchHint = 0;
  }
  setPos(x, z) { this.group.position.x = x; this.group.position.z = z; }
  face(dx, dz) { if (dx || dz) this.group.rotation.y = Math.atan2(dx, dz); }
  handWorld(which) {
    const v = new THREE.Vector3();
    (which === 'L' ? this.handTipL : this.handTipR).getWorldPosition(v);
    return v;
  }
  setGrip(side, close01) {
    const f = this.j[side === 'L' ? 'finL' : 'finR'];
    if (f) f.rotation.x = close01 * 1.15;
  }
  // Apply body-physics state to the rig: position, heading, lean, crouch, IK legs.
  applyBody(b) {
    const g = this.group;
    g.position.set(b.x, b.y, b.z);
    g.rotation.y = b.heading;
    const hipY = b.hipHeight();
    this.j.hips.position.y = hipY;
    // lean adds on top of whatever the arm pose set on the spine
    this.j.spine.rotation.x += b.leanF;
    this.j.spine.rotation.z += b.leanS;
    if (b.airborne) {
      // tucked legs while flying
      this.j.hipL.rotation.x = -0.55; this.j.kneeL.rotation.x = 1.2;
      this.j.hipR.rotation.x = -0.30; this.j.kneeR.rotation.x = 1.35;
    } else {
      const c = Math.cos(b.heading), s = Math.sin(b.heading);
      const legs = [['L', b.footL, -1], ['R', b.footR, 1]];
      for (const [sd, foot, sgn] of legs) {
        const jwx = b.x + sgn * this.hipJointX * c;
        const jwz = b.z - sgn * this.hipJointX * s;
        const jwy = b.y + hipY;
        const dx = foot.x - jwx, dz = foot.z - jwz;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const ly = foot.y - jwy;
        const sol = solveLeg(lx, ly, lz, this.L1, this.L2);
        this.j['hip' + sd].rotation.x = sol.hipX;
        this.j['knee' + sd].rotation.x = sol.knee;
      }
    }
    // arm swing while arms are free (off-ball movement)
    if (!this.armsBusy) {
      const sw = Math.sin(b.stridePhase) * Math.min(1, b.speed / 4) * 0.55;
      this.j.shoL.rotation.x = sw; this.j.shoR.rotation.x = -sw;
      this.j.elbL.rotation.x = -0.35; this.j.elbR.rotation.x = -0.35;
    }
    // blob shadow shrinks/fades with height
    const k = 1 / (1 + b.y * 1.7);
    this.blob.scale.set(k, k, 1);
    this.blob.material.opacity = 0.9 * k;
  }
  idle(t) {
    this.reset();
    this.j.spine.rotation.x = Math.sin(t * 2) * 0.02;
    this.j.shoL.rotation.x = Math.sin(t * 2) * 0.05; this.j.shoR.rotation.x = -Math.sin(t * 2) * 0.05;
  }
  dribble(hand, ph) {
    this.reset();
    this.armsBusy = true;
    this.crouchHint = 0.18;
    const sh = hand === 'L' ? this.j.shoL : this.j.shoR;
    const el = hand === 'L' ? this.j.elbL : this.j.elbR;
    sh.rotation.x = -0.5 - Math.abs(Math.sin(ph)) * 0.55;
    el.rotation.x = -0.25;
    this.j.spine.rotation.x = 0.12;
  }
  // kind: three|mid|fadeaway|onelegger|pullup|layup|dunk|bank|hook|dreamshake|freethrow ; ph 0..1
  shoot(kind, ph) {
    this.reset();
    this.armsBusy = true;
    const crouch = ph < 0.3 ? Math.sin(ph / 0.3 * Math.PI / 2) : 1 - (ph - 0.3) / 0.7;
    const ext = ph < 0.3 ? 0 : Math.min(1, (ph - 0.3) / 0.25);
    this.crouchHint = crouch * 0.5;
    this.j.shoR.rotation.x = -0.3 - ext * 2.4;
    this.j.elbR.rotation.x = -0.9 + ext * 0.75;
    this.j.shoL.rotation.x = -0.2 - ext * 1.2; this.j.elbL.rotation.x = -0.7;
    this.j.spine.rotation.x = 0.08;
    if (kind === 'fadeaway' || kind === 'onelegger') {
      this.j.spine.rotation.x = 0.08 - 0.30 * ext;
    }
    if (kind === 'dunk') {
      this.j.shoL.rotation.x = -2.9 * ext; this.j.shoR.rotation.x = -2.9 * ext;
      this.j.elbL.rotation.x = -0.15; this.j.elbR.rotation.x = -0.15;
      this.j.spine.rotation.x = -0.12;
    }
    if (kind === 'layup') {
      this.j.shoR.rotation.x = -2.5 * ext;
    }
    if (kind === 'hook' || kind === 'dreamshake') {
      this.j.spine.rotation.y = 0.5 * ext;
      this.j.shoR.rotation.x = -2.2 * ext; this.j.shoR.rotation.z = 0.5 * ext;
    }
  }
  pass(nlook, ph) {
    this.reset();
    this.armsBusy = true;
    const e = Math.sin(Math.min(1, ph) * Math.PI);
    this.j.shoR.rotation.x = -1.4 * e; this.j.elbR.rotation.x = -0.2;
    if (nlook) this.j.neck.rotation.y = 0.9 * e;
    this.j.spine.rotation.x = 0.1 * e;
  }
  contest(ph) {
    this.reset();
    this.armsBusy = true;
    const e = Math.sin(Math.min(1, ph) * Math.PI);
    this.j.shoR.rotation.x = -2.9 * e; this.j.elbR.rotation.x = -0.1;
    this.j.shoL.rotation.x = -0.4 * e;
  }
  rebound(ph) {
    this.reset();
    this.armsBusy = true;
    const e = Math.sin(Math.min(1, ph) * Math.PI);
    this.j.shoL.rotation.x = -2.7 * e; this.j.shoR.rotation.x = -2.7 * e;
    this.j.elbL.rotation.x = -0.3; this.j.elbR.rotation.x = -0.3;
  }
  shake(ph) { // dream shake pivots
    this.reset();
    this.armsBusy = true;
    this.crouchHint = 0.25;
    this.j.spine.rotation.y = Math.sin(ph * Math.PI * 2) * 0.45;
    this.j.spine.rotation.x = 0.10;
  }
  cross(ph) { // crossover stutter
    this.reset();
    this.armsBusy = true;
    this.crouchHint = 0.25;
    const s = Math.sin(ph * Math.PI * 3);
    this.j.spine.rotation.z = s * 0.12;
    this.j.shoR.rotation.x = -0.7 - Math.abs(Math.cos(ph * Math.PI * 3)) * 0.4;
  }
  celebrate(t) {
    this.reset();
    this.armsBusy = true;
    this.j.shoL.rotation.x = -2.6; this.j.shoR.rotation.x = -2.6;
  }
}

// ---------------- ball ----------------
export function makeBall() {
  const tex = canvasTex(128, 64, (g) => {
    g.fillStyle = '#d2691e'; g.fillRect(0, 0, 128, 64);
    g.strokeStyle = '#2b1a10'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 32); g.lineTo(128, 32); g.stroke();
    g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 64); g.stroke();
    g.beginPath(); g.arc(20, 32, 26, -1.2, 1.2); g.stroke();
    g.beginPath(); g.arc(108, 32, 26, Math.PI - 1.2, Math.PI + 1.2); g.stroke();
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.121, 14, 12),
    new THREE.MeshLambertMaterial({ map: tex }));
  return m;
}

// dust puff pool
function makePuffs(scene) {
  const tex = canvasTex(64, 64, (gg) => {
    const gr = gg.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(210,190,160,0.55)'); gr.addColorStop(1, 'rgba(210,190,160,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
  });
  const pool = [];
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    sp.scale.set(0.3, 0.3, 1); scene.add(sp);
    pool.push({ sp, t: 1e9 });
  }
  return {
    spawn(x, z, big) {
      const p = pool.find(p => p.t > 0.5) || pool[0];
      p.t = 0; p.big = big ? 1.6 : 1;
      p.sp.position.set(x, 0.12, z);
    },
    update(dt) {
      for (const p of pool) {
        if (p.t > 0.5) { p.sp.material.opacity = 0; continue; }
        p.t += dt;
        const q = Math.min(1, p.t / 0.5);
        const s = (0.3 + q * 1.1) * p.big;
        p.sp.scale.set(s, s, 1);
        p.sp.material.opacity = 0.55 * (1 - q);
      }
    },
  };
}

// ---------------- world ----------------
export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a14);
  scene.fog = new THREE.Fog(0x070a14, 30, 70);

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xbdd0ff, 0x3a2a1a, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(6, 14, -4); scene.add(dir);

  // court
  const court = new THREE.Mesh(new THREE.PlaneGeometry(COURT.W, COURT.D),
    new THREE.MeshLambertMaterial({ map: courtTexture() }));
  court.rotation.x = -Math.PI / 2; court.position.set(0, 0, COURT.D / 2);
  scene.add(court);
  // surrounding floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60),
    new THREE.MeshLambertMaterial({ color: 0x11141f }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.05, 7);
  scene.add(floor);

  // hoop assembly
  const hg = new THREE.Group();
  const darkM = new THREE.MeshLambertMaterial({ color: 0x222630 });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.9, 0.3), darkM);
  pole.position.set(0, 1.95, -1.1); hg.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.6), darkM);
  arm.position.set(0, 3.6, -0.3); hg.add(arm);
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.05),
    new THREE.MeshLambertMaterial({ color: 0xdfe8f5, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  bb.position.set(0, 3.45, 0.45); hg.add(bb);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2286, 0.02, 8, 20),
    new THREE.MeshLambertMaterial({ color: 0xe06a1b }));
  rim.rotation.x = Math.PI / 2; rim.position.set(0, COURT.RIM, COURT.HZ); hg.add(rim);
  // net: 8 cords
  const netG = new THREE.Group(); netG.position.set(0, COURT.RIM, COURT.HZ);
  const netM = new THREE.LineBasicMaterial({ color: 0xf0f0f0 });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const pts = [new THREE.Vector3(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22),
                 new THREE.Vector3(Math.cos(a) * 0.13, -0.32, Math.sin(a) * 0.13)];
    netG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), netM));
  }
  hg.add(netG);
  scene.add(hg);

  // crowd: instanced boxes in a perimeter ring around the court
  const crowdGeo = new THREE.BoxGeometry(0.42, 0.85, 0.3);
  const crowdMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const spots = [];
  for (let tier = 0; tier < 3; tier++) {
    const y = 2.4 + tier * 1.2, d = 3.4 + tier * 1.6;
    for (let z = 0; z <= 14; z += 0.8) { spots.push([7.5 + d, y, z]); spots.push([-7.5 - d, y, z]); }
    for (let x = -7.5; x <= 7.5; x += 0.8) { spots.push([x, y, -d]); spots.push([x, y, 14 + d]); }
  }
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, spots.length);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const palette = [0xc8102e, 0x1d428a, 0xfdb927, 0xeeeeee, 0x552583, 0x222222, 0x0a7a4a, 0xd2691e];
  spots.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z); dummy.lookAt(0, 1, 7); dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
    crowd.setColorAt(i, col.setHex(palette[(Math.random() * palette.length) | 0]));
  });
  scene.add(crowd);

  // ad boards
  const adTex = (txt, bg) => canvasTex(512, 96, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#fff'; g.font = 'italic 900 52px Arial Black, sans-serif'; g.textAlign = 'center';
    g.fillText(txt, 256, 66);
  });
  const ads = [['LEGENDS 3V3', '#c8102e'], ['DREAM HOOPS', '#1d428a'], ['RETRO SPORTS', '#111111'], ['STREET KINGS', '#0a7a4a']];
  const adPos = [[9.6, 3.5], [9.6, 10.5], [-9.6, 3.5], [-9.6, 10.5]];
  ads.forEach(([txt, bg], i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(6, 0.9, 0.25),
      new THREE.MeshLambertMaterial({ map: adTex(txt, bg) }));
    b.position.set(adPos[i][0], 0.45, adPos[i][1]);
    b.lookAt(0, 0.45, 7); // face the court; box +z face shows the ad
    scene.add(b);
  });

  // jumbotron
  const jumboCanvas = document.createElement('canvas'); jumboCanvas.width = 512; jumboCanvas.height = 256;
  const jumboTex = new THREE.CanvasTexture(jumboCanvas); jumboTex.colorSpace = THREE.SRGBColorSpace;
  const jumbo = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 0.4),
    new THREE.MeshBasicMaterial({ map: jumboTex }));
  jumbo.position.set(0, 9.5, 7); scene.add(jumbo);

  const ball = makeBall(); scene.add(ball);
  const puffs = makePuffs(scene);

  const world = {
    scene, camera, renderer, ball, netG, jumboCanvas, jumboTex,
    players: new Map(),
    camOverride: null, // fn() -> {pos:Vector3-like, look:Vector3-like} for debug close-ups
    addPlayer(pid, colors) {
      const pm = new PlayerMesh(pid, colors);
      scene.add(pm.group);
      this.players.set(pid, pm);
      return pm;
    },
    clearPlayers() {
      for (const pm of this.players.values()) { scene.remove(pm.group); }
      this.players.clear();
    },
    puff(x, z, big) { puffs.spawn(x, z, big); },
    setJumbo(aAbbr, bAbbr, aScore, bScore, clockStr) {
      const g = this.jumboCanvas.getContext('2d');
      g.fillStyle = '#05070d'; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#ff9d2e'; g.font = 'italic 900 84px Arial Black, sans-serif'; g.textAlign = 'center';
      g.fillText(`${aAbbr}  ${aScore} : ${bScore}  ${bAbbr}`, 256, 120);
      g.fillStyle = '#9fb3d9'; g.font = '900 54px Arial Black, sans-serif';
      g.fillText(clockStr, 256, 205);
      this.jumboTex.needsUpdate = true;
    },
    swishNet() { this._netT = 0; },
    update(dt, t, ballPos) {
      if (this.camOverride) {
        const o = this.camOverride();
        camera.position.set(o.pos.x, o.pos.y, o.pos.z);
        camera.lookAt(o.look.x, o.look.y, o.look.z);
      } else {
        // broadcast corner camera, follows the ball upcourt
        const bx = ballPos ? ballPos.x * 0.45 : 0;
        camera.position.lerp(new THREE.Vector3(bx + 8.5, 8.6, -8.5), 1 - Math.pow(0.001, dt));
        camera.lookAt(bx, 0.8, 6.8);
      }
      puffs.update(dt);
      if (this._netT !== undefined && this._netT < 1) {
        this._netT += dt * 3;
        const s = 1 + Math.sin(Math.min(1, this._netT) * Math.PI) * 0.35;
        this.netG.scale.set(s, 1, s);
      } else this.netG.scale.set(1, 1, 1);
      renderer.render(scene, camera);
    },
    resize() {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    },
  };
  addEventListener('resize', () => world.resize());
  return world;
}
