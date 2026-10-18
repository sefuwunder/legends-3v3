// Legends 3v3 — ball possession anchoring. Pure JS: no DOM, no three.js.
// While possessed (held/dribble) the ball position is DERIVED from the hand
// world position every frame — never from an independent trajectory.

export const BALL_R = 0.121;

// out = {x,y,z} written in place. hand = {x,y,z} world position of the
// dribbling/holding hand (fingertip/palm anchor from the rig).
// mode 'held': ball sits in the palm.
// mode 'dribble': ball bounces between the floor point under the hand and the
// hand itself; phase advances PI per bounce (synced to the stride cycle).
export function anchorBall(out, mode, hand, phase) {
  if (mode === 'dribble') {
    const s = Math.abs(Math.sin(phase));
    const apex = hand.y - 0.04;
    out.x = hand.x;
    out.z = hand.z;
    out.y = BALL_R + Math.max(0.02, apex - BALL_R) * Math.pow(s, 0.75);
  } else { // held
    out.x = hand.x;
    out.y = hand.y - 0.03;
    out.z = hand.z;
  }
  return out;
}
