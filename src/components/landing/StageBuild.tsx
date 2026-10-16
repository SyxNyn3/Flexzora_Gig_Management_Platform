import React, { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, motionValue, type MotionValue } from 'framer-motion';

/* ------------------------------------------------------------------ */
/* StageBuild — scroll-scrubbed blueprint of a ground-support roof     */
/* rig, matched to the Diffui rigging-plot illustration: all-amber     */
/* linework, dense X-braced truss, side trusses carrying arrays and    */
/* IMAG walls, a wide rear-hung LED wall, tractor-trailers, crew.      */
/*                                                                   */
/* Real sequence: trucks + deck + bases, towers all the way up (front  */
/* + rear pairs — depth goes up-right), roof frame assembled at grade, */
/* roof climbs the towers, chain falls drop, LX trusses arrive         */
/* airborne on two motors each, halfway pull, second pick — side       */
/* trusses take the arrays + side screens, LED support flies in at     */
/* worker height, rows clip bottom-up, everything to trim, safeties,   */
/* go live.                                                          */
/* ------------------------------------------------------------------ */

const BP = '#fbbf24';                        // amber — the illustration's linework
const DIM = 'rgba(251,191,36,0.5)';          // secondary amber
const REAR = 'rgba(251,191,36,0.62)';        // rear plane — visible but behind
const GHOST = 'rgba(251,191,36,0.30)';       // far structure
const TXT = 'rgba(228,228,231,0.85)';        // label text
const WIRE = 'rgba(228,228,231,0.5)';        // neutral ground/deck lines

/* ------- scene geometry ------- */
const GROUND = 645;
const DECK_TOP = 614;
const GRID_Y = 150;
const ROOF_GRADE = 560;
const TOWER_TOP = 124;
const LX_T = 350, RX_T = 850;               // front main towers
const SL_T = 235, SR_T = 965;               // side-hang towers — ~9' outboard
const ISO_X = 30, ISO_Y = -28;              // depth offset — vanishing point goes right
const GRID_L = 336, GRID_R = 864;
const LX_TRIM = 206;
const MID_TRIM = 225;                       // full-width mid truss — just over the wall top
const SIDE_TRIM = 295;                      // side trusses' flown height
const WALL_TRIM = 246;                      // rear LED wall flown height
const ARR_TOP = 332;                        // array trim — flanking the wall, under mid truss
const WALL_X = 494, WALL_W = 272;           // rear plane (shifted right by ISO_X)
const WALL_COLS = 8, WALL_ROWS = 4;

/* every fixture gets its own beam + deck pool — [origin x, origin y, drift] */
const BEAMS: [number, number, number][] = [
  [414, 218, -46], [444, 218, -18], [474, 218, 10], [502, 218, 42],
  [694, 218, -42], [724, 218, -10], [754, 218, 18], [782, 218, 46],
  [390, 250, -70], [450, 250, -40], [510, 250, -22], [570, 250, -8],
  [630, 250, 8], [690, 250, 22], [750, 250, 44], [810, 250, 72],
  [262, 322, -52], [318, 322, -20], [880, 322, 20], [936, 322, 52],
];

/** Dense box truss: X-braced bays, mid chord, end plates. */
function Truss({ x, y, w, h, stroke = BP, sw = 1.4, opacity = 1 }: {
  x: number; y: number; w: number; h: number;
  stroke?: string; sw?: number; opacity?: number;
}) {
  const horizontal = w >= h;
  const bays = Math.max(2, Math.round(Math.max(w, h) / 18));
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < bays; i++) {
    const t0 = i / bays, t1 = (i + 1) / bays;
    if (horizontal) {
      const x0 = x + t0 * w, x1 = x + t1 * w;
      cells.push(
        <g key={i}>
          <line x1={x0} y1={y} x2={x1} y2={y + h} strokeWidth={sw * 0.55} />
          <line x1={x0} y1={y + h} x2={x1} y2={y} strokeWidth={sw * 0.55} />
          <line x1={x0} y1={y} x2={x0} y2={y + h} strokeWidth={sw * 0.7} />
        </g>
      );
    } else {
      const y0 = y + t0 * h, y1 = y + t1 * h;
      cells.push(
        <g key={i}>
          <line x1={x} y1={y0} x2={x + w} y2={y1} strokeWidth={sw * 0.55} />
          <line x1={x + w} y1={y0} x2={x} y2={y1} strokeWidth={sw * 0.55} />
          <line x1={x} y1={y0} x2={x + w} y2={y0} strokeWidth={sw * 0.7} />
        </g>
      );
    }
  }
  return (
    <g stroke={stroke} strokeWidth={sw} fill="none" opacity={opacity}>
      <rect x={x} y={y} width={w} height={h} />
      {horizontal
        ? <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} strokeWidth={sw * 0.5} />
        : <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} strokeWidth={sw * 0.5} />}
      {cells}
      {horizontal ? (
        <>
          <rect x={x - 2} y={y - 2} width="4" height={h + 4} />
          <rect x={x + w - 2} y={y - 2} width="4" height={h + 4} />
        </>
      ) : (
        <>
          <rect x={x - 2} y={y - 2} width={w + 4} height="4" />
          <rect x={x - 2} y={y + h - 2} width={w + 4} height="4" />
        </>
      )}
    </g>
  );
}

/** Filled crew figure, ~28px tall. */
function Crew({ x, y, pose = 'stand', flip = false, s = 1.35 }: {
  x: number; y: number; pose?: 'stand' | 'guide' | 'push' | 'climb' | 'sit'; flip?: boolean; s?: number;
}) {
  const body = {
    stand: 'M0,-17 a3,3 0 1 0 0.1,0 M-2.4,-13 L2.4,-13 L3.4,-2 L1.4,0 L0.6,-6 L-0.6,-6 L-1.4,0 L-3.4,-2 Z',
    guide: 'M0,-17 a3,3 0 1 0 0.1,0 M-2.4,-13 L2,-13 L6,-20 L7,-19 L3.6,-11 L3.4,-2 L1.4,0 L0.6,-6 L-0.6,-6 L-1.4,0 L-3.4,-2 Z',
    push: 'M0,-17 a3,3 0 1 0 0.1,0 M-2,-13 L3,-11 L9,-9 L9.4,-7 L3,-8.6 L2.4,-2 L1,0 L-0.4,-6 L-1.8,-5 L-2.4,1 L-4.6,-1 Z',
    climb: 'M0,-17 a3,3 0 1 0 0.1,0 M-2,-13 L2.4,-13.4 L7,-9 L6,-7.4 L2.6,-10 L2,-2 L0.4,-1 L-0.6,-7 L-2,-4 L-4,-9 L-2.6,-9.6 Z',
    sit: 'M0,-17 a3,3 0 1 0 0.1,0 M-2.4,-13 L2.4,-13 L2.8,-5 L5.5,-5 L5.2,-1.5 L3.2,-2 L2.8,2.5 L1.4,2.5 L0.8,-2.5 L-0.8,-2.5 L-1.4,2.5 L-2.8,2.5 L-3.2,-2 L-4,-5 Z',
  }[pose];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})${flip ? ' scale(-1 1)' : ''}`}>
      <path d={body} fill={BP} opacity="0.92" />
      <path d="M-4,-18.5 h8 M-3,-18.5 a3,3 0 0 1 6,0" stroke={BP} strokeWidth="1.1" fill={BP} fillOpacity="0.5" />
    </g>
  );
}

/** Tractor + box trailer, side profile. */
function Truck({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g stroke={BP} strokeWidth="1.2" fill="none" opacity="0.85"
       transform={`translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`}>
      <rect x="0" y="-62" width="118" height="48" />
      <line x1="0" y1="-58" x2="118" y2="-58" strokeWidth="0.7" />
      <line x1="0" y1="-18" x2="118" y2="-18" strokeWidth="0.7" />
      {[14, 28, 42, 56, 70, 84, 98].map((rx) => (
        <line key={rx} x1={rx} y1="-58" x2={rx} y2="-18" stroke={DIM} strokeWidth="0.6" />
      ))}
      <rect x="104" y="-56" width="12" height="20" strokeWidth="0.7" />
      <line x1="0" y1="-14" x2="118" y2="-14" strokeWidth="1" />
      <line x1="14" y1="-14" x2="14" y2="-2" strokeWidth="0.9" />
      <line x1="10" y1="-2" x2="18" y2="-2" strokeWidth="0.9" />
      {[22, 40].map((cx) => (
        <g key={cx}><circle cx={cx} cy="-5" r="7" /><circle cx={cx} cy="-5" r="2.4" strokeWidth="0.8" /></g>
      ))}
      <line x1="118" y1="-14" x2="182" y2="-14" strokeWidth="1" />
      <rect x="124" y="-22" width="18" height="8" strokeWidth="0.8" />
      <line x1="140" y1="-56" x2="140" y2="-14" strokeWidth="1.4" />
      <path d="M144,-14 L144,-50 L160,-50 L168,-38 L168,-14 Z" strokeWidth="1.2" />
      <path d="M160,-50 L168,-38 L160,-38 Z" fill={BP} fillOpacity="0.18" strokeWidth="0.8" />
      <rect x="168" y="-26" width="12" height="12" strokeWidth="0.9" />
      <line x1="172" y1="-26" x2="172" y2="-14" strokeWidth="0.7" />
      <circle cx="180" cy="-8" r="1.6" fill={BP} stroke="none" opacity="0.8" />
      {[148, 176].map((cx) => (
        <g key={cx}><circle cx={cx} cy="-5" r="7" /><circle cx={cx} cy="-5" r="2.4" strokeWidth="0.8" /></g>
      ))}
      <line x1="-16" y1="0" x2="196" y2="0" stroke={WIRE} strokeWidth="0.8" strokeDasharray="6 5" />
    </g>
  );
}

/** Road case stack with tape label. */
function Cases({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={BP} strokeWidth="1" fill="none" opacity="0.8">
      <rect x={x} y={y - 26} width="34" height="22" />
      <line x1={x} y1={y - 15} x2={x + 34} y2={y - 15} stroke={DIM} strokeWidth="0.7" />
      <rect x={x + 3} y={y - 48} width="30" height="20" />
      <rect x={x + 40} y={y - 22} width="30" height="18" />
      <line x1={x + 8} y1={y - 38} x2={x + 26} y2={y - 38} stroke={BP} strokeWidth="2.4" />
      <line x1={x + 45} y1={y - 13} x2={x + 62} y2={y - 13} stroke={BP} strokeWidth="2" opacity="0.7" />
      {[x + 6, x + 28, x + 46, x + 64].map((cx) => (
        <circle key={cx} cx={cx} cy={y - 2} r="2" />
      ))}
    </g>
  );
}

/** Tower base: wide foot + screw jacks + outrigger arms. */
function TowerBase({ x, spread = 58 }: { x: number; spread?: number }) {
  return (
    <g stroke={BP} strokeWidth="1.3" fill="none">
      <rect x={x - 30} y={GROUND - 6} width="60" height="6" />
      <line x1={x - spread} y1={GROUND} x2={x - 20} y2={GROUND - 52} />
      <line x1={x + spread} y1={GROUND} x2={x + 20} y2={GROUND - 52} />
      <line x1={x - spread} y1={GROUND} x2={x - spread} y2={GROUND - 14} strokeWidth="1" />
      <line x1={x - spread - 5} y1={GROUND - 14} x2={x - spread + 5} y2={GROUND - 14} strokeWidth="1" />
      <line x1={x + spread} y1={GROUND} x2={x + spread} y2={GROUND - 14} strokeWidth="1" />
      <line x1={x + spread - 5} y1={GROUND - 14} x2={x + spread + 5} y2={GROUND - 14} strokeWidth="1" />
    </g>
  );
}

/** Hoist block with chain bag — solid (front chord) or ghosted (rear). */
function Hoist({ x, y = GRID_Y, ghost = false }: { x: number; y?: number; ghost?: boolean }) {
  return (
    <g fill="none" stroke={ghost ? REAR : BP} strokeWidth="1.2">
      <rect x={x - 6} y={y - 4} width="12" height="10" rx="1.5" />
      <path d={`M${x - 4},${y + 6} q-5,7 0,11 q5,4 8,0 q3,-5 0,-11 Z`} strokeWidth="0.9" />
      <line x1={x} y1={y - 4} x2={x} y2={y - 10} strokeWidth="0.9" />
    </g>
  );
}

/** Yoked moving-head fixture. */
function MovingHead({ x, y, tilt = 0 }: { x: number; y: number; tilt?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke={BP} strokeWidth="1">
      <line x1="0" y1="0" x2="0" y2="4" stroke={DIM} strokeWidth="0.8" />
      <path d="M-5,4 v4 h10 v-4" strokeWidth="0.9" />
      <g transform={`rotate(${tilt} 0 11)`}>
        <rect x="-4" y="8" width="8" height="7" rx="1.5" />
        <circle cx="0" cy="14.5" r="2" strokeWidth="0.9" />
      </g>
    </g>
  );
}

/** Line array — tight column, rigging links, gentle splay on bottom boxes. */
function LineArray({ x, boxes = 10, ghost = false }: { x: number; boxes?: number; ghost?: boolean }) {
  const st = ghost ? REAR : BP;
  const pitch = 9, bw = 26, bh = 7;
  return (
    <g>
      <rect x={x - 3} y={-8} width={bw + 6} height={8} fill="none" stroke={st} strokeWidth="1" />
      <line x1={x + bw / 2} y1={-8} x2={x + bw / 2} y2={-13} stroke={st} strokeWidth="1" />
      {Array.from({ length: boxes }).map((_, i) => {
        const ang = Math.max(0, i - (boxes - 5)) * 4.5;
        return (
          <g key={i} transform={`rotate(${ang} ${x + bw} ${i * pitch})`}>
            <rect x={x} y={i * pitch} width={bw} height={bh} rx="1" fill="none" stroke={st} strokeWidth="0.9" />
            <line x1={x + 2} y1={i * pitch + bh / 2} x2={x + bw - 2} y2={i * pitch + bh / 2}
                  stroke={st} strokeWidth="0.5" opacity="0.65" />
            <line x1={x + 3} y1={i * pitch + bh} x2={x + 6} y2={(i + 1) * pitch}
                  stroke={st} strokeWidth="0.6" opacity="0.7" />
            <line x1={x + bw - 3} y1={i * pitch + bh} x2={x + bw - 6} y2={(i + 1) * pitch}
                  stroke={st} strokeWidth="0.6" opacity="0.7" />
          </g>
        );
      })}
    </g>
  );
}

/** Ground/deck speaker stack — subs below, tops above. */
function SpkStack({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g stroke={BP} fill="none" strokeWidth="1" transform={`translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`}>
      {[0, 1, 2].map((r) => (
        <g key={r}>
          <rect x="0" y={-18 - r * 17} width="40" height="15" rx="1" />
          <circle cx="11" cy={-10.5 - r * 17} r={r === 0 ? 5 : 3.4} strokeWidth="0.7" />
          <circle cx="27" cy={-10.5 - r * 17} r={r === 0 ? 5 : 3.4} strokeWidth="0.7" />
        </g>
      ))}
      <line x1="-5" y1="0" x2="45" y2="0" stroke={DIM} strokeWidth="0.7" />
    </g>
  );
}

/** Floor wedge monitor. */
function Wedge({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g stroke={BP} fill="none" strokeWidth="0.9" transform={`translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`}>
      <path d="M0,0 L26,0 L26,-8 L8,-16 L0,-10 Z" />
      <line x1="8" y1="-14.6" x2="25" y2="-7.6" stroke={DIM} strokeWidth="0.6" />
    </g>
  );
}

/** Forklift — mast, forks up with a case on, chunky tires. */
function Forklift({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g stroke={BP} fill="none" strokeWidth="1.1" opacity="0.85"
       transform={`translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`}>
      <rect x="0" y="-20" width="30" height="14" />
      <path d="M4,-20 L4,-40 L26,-40 L26,-20" strokeWidth="0.9" />
      <line x1="10" y1="-40" x2="10" y2="-20" strokeWidth="0.6" />
      <line x1="34" y1="0" x2="34" y2="-54" strokeWidth="1.4" />
      <line x1="38" y1="0" x2="38" y2="-54" strokeWidth="1.4" />
      <line x1="36" y1="-46" x2="56" y2="-46" strokeWidth="1.2" />
      <rect x="40" y="-64" width="22" height="18" />
      <line x1="44" y1="-55" x2="58" y2="-55" stroke={DIM} strokeWidth="0.7" />
      <circle cx="8" cy="-3" r="6" /><circle cx="8" cy="-3" r="2" strokeWidth="0.7" />
      <circle cx="28" cy="-3" r="5" /><circle cx="28" cy="-3" r="1.8" strokeWidth="0.7" />
      <circle cx="52" cy="-2" r="2.4" />
    </g>
  );
}

/** Side IMAG screen — small video wall off the side truss. */
function ImagWall({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={REAR} fill="none" strokeWidth="1">
      <rect x={x} y={y} width="46" height="64" />
      {[1, 2, 3].map((r) => <line key={r} x1={x} y1={y + r * 16} x2={x + 46} y2={y + r * 16} strokeWidth="0.6" />)}
      <line x1={x + 23} y1={y} x2={x + 23} y2={y + 64} strokeWidth="0.6" />
      <line x1={x + 10} y1={y} x2={x + 10} y2={y - 9} strokeWidth="0.8" />
      <line x1={x + 36} y1={y} x2={x + 36} y2={y - 9} strokeWidth="0.8" />
    </g>
  );
}

/** Call-out label with leader line. */
function Callout({ x, y, tx, ty, text, anchor = 'start', p, win }: {
  x: number; y: number; tx: number; ty: number; text: string;
  anchor?: 'start' | 'middle' | 'end'; p: MotionValue<number>; win: [number, number];
}) {
  const o = useTransform(p, win, [0, 0.9]);
  return (
    <motion.g style={{ opacity: o }}>
      <line x1={x} y1={y} x2={tx} y2={ty} stroke={DIM} strokeWidth="0.8" />
      <circle cx={x} cy={y} r="1.6" fill={DIM} />
      <text x={tx} y={ty - 4} fill={TXT} fontSize="11" fontFamily="monospace"
            letterSpacing="0.12em" textAnchor={anchor}>{text}</text>
    </motion.g>
  );
}

/** Right-rail elevation ruler. */
function Elevations() {
  const marks: [number, string][] = [
    [GROUND, "GRADE  0'-0\""],
    [DECK_TOP, "STAGE  4'-0\""],
    [ARR_TOP + 120, "AUDIO 20'-0\""],
    [WALL_TRIM + 110, "LED   18'-0\""],
    [SIDE_TRIM - 40, "SIDE  26'-0\""],
    [GRID_Y + 30, "TRUSS 32'-0\""],
    [GRID_Y - 30, "ROOF  42'-0\""],
  ];
  return (
    <g>
      {marks.map(([y, t]) => (
        <g key={t}>
          <line x1="1115" y1={y} x2="1145" y2={y} stroke={DIM} strokeWidth="0.8" />
          <text x="1108" y={y + 4} fill={DIM} fontSize="10.5" fontFamily="monospace" letterSpacing="0.08em" textAnchor="end">{t}</text>
        </g>
      ))}
      <line x1="1115" y1={GRID_Y - 46} x2="1115" y2={GROUND} stroke={DIM} strokeWidth="0.7" strokeDasharray="2 6" />
    </g>
  );
}

const BEATS = [
  { tag: '01 — LOAD-IN',        line: 'Trucks spotted. Deck down. Forks running cases in. Bases leveled.' },
  { tag: '02 — TOWERS',         line: 'Six towers stack — riggers top out and stay on the caps, watching every pick.' },
  { tag: '03 — ROOF AT GRADE',  line: 'The roof frame builds on the deck. Nobody works at height.' },
  { tag: '04 — ROOF CLIMBS',    line: 'The finished frame rides the towers to the top.' },
  { tag: '05 — DROP THE LINES', line: 'Chain falls come down — motors everywhere in the grid.' },
  { tag: '06 — FIRST PICK',     line: 'LX trusses and the full-span mid truss fly in at working height.' },
  { tag: '07 — SECOND PICK',    line: 'Side hangs take the screens. Arrays ride up flanking the wall.' },
  { tag: '08 — BUILD THE WALL', line: 'Panels clip row by row at arm reach.' },
  { tag: '09 — TRIM & SAFETIES',line: 'Trim set. Eighteen picks swap to safeties. The rig is in.' },
  { tag: '10 — SHOWTIME',       line: 'Every fixture burning. This is what the calls build.' },
];

export function StageBuild() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const spring = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.4 });
  /* ?frame=<0-1> debug freeze — dev builds only */
  const dbg = import.meta.env.DEV && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('frame')
    : null;
  const p = dbg !== null ? motionValue(parseFloat(dbg)) : spring;

  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const f = () => setMobile(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);

  /* --- phase timing --- */
  const towersH  = useTransform(p, [0.06, 0.16], [0, 1]);
  const roofOp   = useTransform(p, [0.16, 0.22], [0, 1]);
  const roofY    = useTransform(p, [0.24, 0.34], [ROOF_GRADE, GRID_Y]);
  const roofDy   = useTransform(roofY, (v) => v - ROOF_GRADE);
  const lines1Op = useTransform(p, [0.34, 0.42], [0, 1]);
  const lxOp     = useTransform(p, [0.42, 0.47], [0, 1]);
  const lxY      = useTransform(p, [0.42, 0.48, 0.56, 0.62, 0.70],
    [-(626 - 520), -(626 - 520), -(626 - 400), -(626 - 400), -(626 - LX_TRIM)]);
  /* full-width mid truss — flies with the first pick, trims just under LX */
  const midY     = useTransform(p, [0.42, 0.48, 0.62, 0.70], [-24, -24, -24, -(569 - MID_TRIM)]);
  const midHook  = useTransform(midY, (v) => 569 + v);
  /* line arrays — staged on deck between the towers, fly to flank the wall */
  const arrOp    = useTransform(p, [0.40, 0.46], [0, 1]);
  const arrDrop  = useTransform(p, [0.60, 0.70], [195, 0]);
  const arrHook  = useTransform(arrDrop, (v) => ARR_TOP + v);
  const lines2Op = useTransform(p, [0.54, 0.60], [0, 1]);
  const pick2Op  = useTransform(p, [0.57, 0.62], [0, 1]);
  /* side rigs (truss + IMAG + side fixtures) rise together from pick height */
  const sideY    = useTransform(p, [0.62, 0.74], [0, -(560 - SIDE_TRIM)]);
  /* rear LED wall: arrives airborne at worker reach, inches up as 4 rows
     clip underneath, finished wall flies to trim */
  const ledY     = useTransform(p,
    [0.57, 0.60, 0.63, 0.66, 0.69, 0.72, 0.75, 0.78, 0.86],
    [GROUND - 70, GROUND - 70, GROUND - 106, GROUND - 106, GROUND - 142, GROUND - 142, GROUND - 178, GROUND - 178, WALL_TRIM]);
  const wallRow1 = useTransform(p, [0.60, 0.63], [0, 1]);
  const wallRow2 = useTransform(p, [0.63, 0.66], [0, 1]);
  const wallRow3 = useTransform(p, [0.66, 0.69], [0, 1]);
  const wallRow4 = useTransform(p, [0.72, 0.75], [0, 1]);
  const wallRows = [wallRow1, wallRow2, wallRow3, wallRow4];
  const safeties   = useTransform(p, [0.82, 0.87], [0, 1]);
  const live       = useTransform(p, [0.88, 0.98], [0, 1]);
  const crewOut    = useTransform(p, [0.86, 0.94], [1, 0]);
  /* riggers climb every tower once they're erect, SIT on the caps watching
     each hoist through every pick, and only come down when it's all at trim */
  const rigT     = [0.15, 0.24, 0.88, 0.95];
  const rigYMain = useTransform(p, rigT, [0, -533, -533, 0]);
  const rigYSide = useTransform(p, rigT, [0, -509, -509, 0]);
  const rigYRear = useTransform(p, rigT, [0, -550, -550, 0]);
  const rigSit   = useTransform(p, [0.235, 0.26, 0.865, 0.895], [0, 1, 1, 0]);
  const rigClimb = useTransform(p, [0.14, 0.16, 0.245, 0.27, 0.87, 0.89, 0.95, 0.98],
    [0, 1, 1, 0, 0, 1, 1, 0]);
  /* deck hands actually move — forklift run, case walker, wall builders,
     truss spotters tracking the picks */
  const fkX      = useTransform(p, [0.05, 0.14], [0, 58]);
  const walkX    = useTransform(p, [0.26, 0.52, 0.70, 0.90], [0, 230, 230, -40]);
  const wallAX   = useTransform(p, [0.60, 0.75], [0, 55]);
  const wallBX   = useTransform(p, [0.62, 0.77], [0, -58]);
  const spotX    = useTransform(p, [0.46, 0.64], [0, 26]);
  const spotXB   = useTransform(p, [0.46, 0.64], [0, -26]);
  const feederOp = useTransform(p, [0.72, 0.78], [0, 1]);
  const buildPct = useTransform(p, (v) => `BUILD ${String(Math.round(v * 100)).padStart(2, '0')}%`);

  const hookL    = useTransform(lxY, (v) => 612 + v);
  const sideHook = useTransform(sideY, (v) => 560 + v);
  const ledHook  = ledY;
  const lineTop  = GRID_Y + 16;

  return (
    <div ref={ref} className={dbg !== null ? 'fixed inset-0 z-[100]' : 'relative h-[300vh] md:h-[460vh]'}>
      <div className={`${dbg !== null ? '' : 'sticky top-0 '}h-screen overflow-hidden bg-[#0A0A0B]`}>
        <div className="absolute inset-0 opacity-[0.05]"
             style={{ backgroundImage: 'linear-gradient(rgba(251,191,36,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.5) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="absolute top-16 sm:top-20 left-6 sm:left-10 z-10 font-mono w-[230px] sm:w-[340px]">
          {BEATS.map((b, i) => (
            <BeatCaption key={b.tag} p={p} i={i} n={BEATS.length} tag={b.tag} line={b.line} />
          ))}
        </div>

        {/* HUD — fills the upper-right void, sells the blueprint HUD feel */}
        <div className="absolute top-16 sm:top-20 right-6 sm:right-10 z-10 font-mono text-right">
          <motion.div className="text-amber-400 text-sm sm:text-base tracking-[0.25em] tabular-nums">
            {buildPct}
          </motion.div>
          <div className="mt-1 text-[9px] sm:text-[10px] tracking-[0.2em] uppercase text-zinc-500 space-y-0.5">
            <p>6 towers · 18 picks</p>
            <p>wall 32'×16' · trim 26'</p>
            <p className="text-amber-400/60">dead-hang sequence</p>
          </div>
        </div>

        <svg viewBox={mobile ? '235 55 740 660' : '-140 60 1500 660'} className="absolute inset-0 w-full h-full"
             preserveAspectRatio="xMidYMax meet">
          {/* ground */}
          <line x1="-140" y1={GROUND} x2="1340" y2={GROUND} stroke={WIRE} strokeWidth="1.5" opacity="0.7" />
          <line x1="-140" y1={GROUND + 3} x2="1340" y2={GROUND + 3} stroke={WIRE} strokeWidth="0.8" strokeDasharray="10 8" opacity="0.5" />
          <Elevations />

          {/* guy wires — tension lines off every tower; drawn early so they
              vanish behind trucks/cases like real anchor runs */}
          <PhaseIn p={p} win={[0.16, 0.24]}>
            <g stroke={DIM} strokeWidth="0.8" strokeDasharray="6 4" fill="none">
              <line x1={SL_T + 4} y1={TOWER_TOP + 18} x2="150" y2={GROUND} />
              <line x1={SL_T + 2} y1={TOWER_TOP + 18} x2="118" y2={GROUND} />
              <line x1={SL_T - 4} y1={TOWER_TOP + 18} x2="310" y2={GROUND} />
              <line x1={SR_T - 4} y1={TOWER_TOP + 18} x2="1055" y2={GROUND} />
              <line x1={SR_T - 2} y1={TOWER_TOP + 18} x2="1100" y2={GROUND} />
              <line x1={SR_T + 4} y1={TOWER_TOP + 18} x2="885" y2={GROUND} />
              <line x1={LX_T - 15} y1={TOWER_TOP + 8} x2="175" y2={GROUND} />
              <line x1={RX_T + 15} y1={TOWER_TOP + 8} x2="1035" y2={GROUND} />
            </g>
            <g stroke={BP} strokeWidth="1" fill="none" opacity="0.7">
              <rect x="304" y={GROUND - 7} width="12" height="7" />
              <rect x="879" y={GROUND - 7} width="12" height="7" />
            </g>
          </PhaseIn>

          {/* 01 — trucks, deck, bases, cases, ballast */}
          <PhaseIn p={p} win={[0.00, 0.06]}>
            <Truck x={14} y={GROUND} />
            <Truck x={1162} y={GROUND} flip />
            {/* wing scenery — keeps ultrawide edges dressed */}
            <Cases x={-62} y={GROUND} />
            <Cases x={1242} y={GROUND} />
            <Truss x={-118} y={GROUND - 26} w={80} h={12} stroke={DIM} sw={1} />
            <Truss x={-108} y={GROUND - 12} w={80} h={12} stroke={DIM} sw={1} />
            <Truss x={1270} y={GROUND - 26} w={80} h={12} stroke={DIM} sw={1} />
            <Truss x={1260} y={GROUND - 12} w={80} h={12} stroke={DIM} sw={1} />
            {[0, 1, 2].map((i) => (
              <circle key={i} cx="-95" cy={GROUND - 6 - i * 4} r={10 - i * 2.4}
                      fill="none" stroke={DIM} strokeWidth="0.9" />
            ))}
            {[0, 1, 2].map((i) => (
              <circle key={i} cx="1225" cy={GROUND - 6 - i * 4} r={10 - i * 2.4}
                      fill="none" stroke={DIM} strokeWidth="0.9" />
            ))}
            <rect x="280" y={DECK_TOP} width="640" height={GROUND - DECK_TOP} fill="none" stroke={WIRE} strokeWidth="1.4" />
            <path d={`M280,${DECK_TOP} L${280 + ISO_X},${DECK_TOP + ISO_Y} L${920 + ISO_X},${DECK_TOP + ISO_Y} L920,${DECK_TOP}`}
                  fill="none" stroke={WIRE} strokeWidth="1" opacity="0.6" />
            {[320, 460, 600, 740, 880].map((x) => (
              <line key={x} x1={x} y1={DECK_TOP + 20} x2={x} y2={GROUND - 2} stroke={WIRE} strokeWidth="0.5" opacity="0.5" />
            ))}
            <Cases x={228} y={GROUND} />
            <Cases x={896} y={GROUND} />
            <Cases x={560} y={GROUND} />
            <motion.g style={{ x: fkX }}>
              <Forklift x={300} y={GROUND} />
            </motion.g>
            {/* spare truss staged on deck — the stock the picks come out of */}
            <Truss x={435} y={594} w={130} h={12} stroke={DIM} sw={1} />
            <Truss x={655} y={598} w={150} h={12} stroke={DIM} sw={1} />
            <Truss x={548} y={580} w={110} h={10} stroke={DIM} sw={0.9} />
            {[LX_T, RX_T].map((x) => <TowerBase key={x} x={x} />)}
            {[SL_T, SR_T].map((x) => (
              <g key={x} stroke={REAR} fill="none" strokeWidth="1.1">
                <rect x={x - 20} y={GROUND - 6} width="40" height="6" />
                <line x1={x - 34} y1={GROUND} x2={x - 12} y2={GROUND - 34} strokeWidth="0.9" />
                <line x1={x + 34} y1={GROUND} x2={x + 12} y2={GROUND - 34} strokeWidth="0.9" />
              </g>
            ))}
            {[LX_T, RX_T].map((x) => {
              const out = x < 600 ? -1 : 1;
              return (
                <g key={x} stroke={BP} fill="none">
                  <rect x={x + out * 118 - 10} y={GROUND - 12} width="20" height="12" strokeWidth="1.1" />
                  <line x1={x} y1={TOWER_TOP + 40} x2={x + out * 118} y2={GROUND - 12} strokeWidth="0.8" strokeDasharray="5 4" stroke={DIM} />
                </g>
              );
            })}
          </PhaseIn>

          {/* 02 — towers grow: rear mains ghosted + side-hang towers outboard */}
          <motion.g style={{ scaleY: towersH, transformOrigin: `0px ${GROUND + ISO_Y}px` }}>
            {[LX_T + ISO_X, RX_T + ISO_X].map((x) => (
              <Truss key={x} x={x - 14} y={TOWER_TOP + ISO_Y - 8} w={28} h={GROUND - TOWER_TOP + 8}
                     stroke={GHOST} sw={1.1} />
            ))}
            {[LX_T, RX_T].map((x) => (
              <g key={x}>
                <Truss x={x - 17} y={TOWER_TOP} w={34} h={GROUND - TOWER_TOP} />
                <rect x={x - 22} y={TOWER_TOP - 11} width="44" height="11" fill="none" stroke={BP} strokeWidth="1.4" />
                <line x1={x - 22} y1={TOWER_TOP - 11} x2={x + 22} y2={TOWER_TOP} stroke={DIM} strokeWidth="0.8" />
              </g>
            ))}
            {[SL_T, SR_T].map((x) => (
              <g key={x}>
                <Truss x={x - 15} y={TOWER_TOP + 16} w={30} h={GROUND - TOWER_TOP - 16} stroke={REAR} sw={1.2} />
                <rect x={x - 19} y={TOWER_TOP + 6} width="38" height="10" fill="none" stroke={REAR} strokeWidth="1.2" />
              </g>
            ))}
          </motion.g>

          {/* 03/04 — roof frame at grade → climbs the towers */}
          <motion.g style={{ opacity: roofOp, y: roofDy }}>
            <Truss x={GRID_L} y={ROOF_GRADE - 22} w={GRID_R - GRID_L} h={22} />
            <Truss x={GRID_L + ISO_X} y={ROOF_GRADE - 22 + ISO_Y} w={GRID_R - GRID_L} h={16}
                   stroke={GHOST} sw={1.1} />
            {[0, 0.33, 0.66, 1].map((f) => {
              const fx = GRID_L + f * (GRID_R - GRID_L);
              return (
                <line key={f} x1={fx} y1={ROOF_GRADE - 22} x2={fx + ISO_X} y2={ROOF_GRADE - 22 + ISO_Y}
                      stroke={DIM} strokeWidth="0.9" />
              );
            })}
            <path d={`M${GRID_L},${ROOF_GRADE - 22} L${(GRID_L + GRID_R) / 2},${ROOF_GRADE - 60} L${GRID_R},${ROOF_GRADE - 22}`}
                  fill="none" stroke={BP} strokeWidth="1.2" />
            {[0.2, 0.4, 0.6, 0.8].map((f) => (
              <line key={f} x1={GRID_L + f * (GRID_R - GRID_L)} y1={ROOF_GRADE - 22}
                    x2={(GRID_L + GRID_R) / 2} y2={ROOF_GRADE - 60} stroke={DIM} strokeWidth="0.8" />
            ))}
            <path d={`M${GRID_L + ISO_X},${ROOF_GRADE - 22 + ISO_Y} L${(GRID_L + GRID_R) / 2 + ISO_X},${ROOF_GRADE - 52 + ISO_Y} L${GRID_R + ISO_X},${ROOF_GRADE - 22 + ISO_Y}`}
                  fill="none" stroke={GHOST} strokeWidth="1" />
            {/* pennant rides the roof up */}
            <line x1="600" y1={ROOF_GRADE - 60} x2="600" y2={ROOF_GRADE - 90} stroke={BP} strokeWidth="1" />
            <path d={`M600,${ROOF_GRADE - 90} L624,${ROOF_GRADE - 84} L600,${ROOF_GRADE - 78} Z`}
                  fill={BP} fillOpacity="0.35" stroke={BP} strokeWidth="0.8" />
          </motion.g>

          {/* hoists — motors everywhere: LX, mid, array bridles, dead spares */}
          <motion.g style={{ opacity: lines1Op }}>
            {[365, 400, 415, 452, 476, 505, 560, 600, 660, 695, 778, 785, 800, 802, 838]
              .map((x) => <Hoist key={x} x={x} />)}
            {[540, 620, 700].map((x) => <Hoist key={x} x={x} y={GRID_Y + ISO_Y} ghost />)}
          </motion.g>
          <motion.g style={{ opacity: lines2Op }}>
            {[258, 326, 874, 941].map((x) => <Hoist key={x} x={x} y={TOWER_TOP + 16} ghost />)}
          </motion.g>

          {/* crew */}
          <motion.g style={{ opacity: crewOut }}>
            <PhaseIn p={p} win={[0.04, 0.10]}>
              <Crew x={LX_T - 72} y={GROUND} pose="push" />
              <Crew x={LX_T + 60} y={GROUND} pose="stand" flip />
              <Crew x={RX_T - 60} y={GROUND} pose="stand" />
              <Crew x={RX_T + 76} y={GROUND} pose="push" flip />
              <Crew x={600} y={GROUND} pose="guide" />
            </PhaseIn>
            <PhaseIn p={p} win={[0.16, 0.22]}>
              <Crew x={430} y={GROUND} pose="push" />
              <Crew x={500} y={GROUND} pose="stand" />
              <Crew x={700} y={GROUND} pose="guide" flip />
              <Crew x={770} y={GROUND} pose="push" />
            </PhaseIn>
          </motion.g>

          {/* riggers top out on all six towers and stay — hoist watch */}
          {[
            { xs: [LX_T + 24, RX_T - 24], y: rigYMain, dim: 1 },
            { xs: [LX_T + ISO_X + 16, RX_T + ISO_X - 16], y: rigYRear, dim: 0.5 },
            { xs: [SL_T + 20, SR_T - 20], y: rigYSide, dim: 1 },
          ].map(({ xs, y, dim }, gi) => (
            <g key={gi} opacity={dim}>
              <motion.g style={{ y }}>
                {xs.map((x) => (
                  <g key={x}>
                    <motion.g style={{ opacity: rigClimb }}><Crew x={x} y={GROUND} pose="climb" /></motion.g>
                    <motion.g style={{ opacity: rigSit }}><Crew x={x} y={GROUND} pose="sit" /></motion.g>
                  </g>
                ))}
              </motion.g>
            </g>
          ))}

          {/* PA in — deck side fills, wedges across the stage, subs at grade.
              stays for the show — doesn't walk off with the crew */}
          <PhaseIn p={p} win={[0.30, 0.38]}>
            <SpkStack x={375} y={DECK_TOP} />
            <SpkStack x={828} y={DECK_TOP} flip />
            <Wedge x={500} y={DECK_TOP} />
            <Wedge x={560} y={DECK_TOP} flip />
            <Wedge x={620} y={DECK_TOP} />
            <Wedge x={685} y={DECK_TOP} flip />
            <Wedge x={745} y={DECK_TOP} />
            <SpkStack x={258} y={GROUND} />
            <SpkStack x={858} y={GROUND} flip />
          </PhaseIn>

          <motion.g style={{ opacity: crewOut }}>
            <PhaseIn p={p} win={[0.42, 0.48]}>
              <Crew x={452} y={GROUND} pose="guide" flip />
              <Crew x={748} y={GROUND} pose="guide" />
            </PhaseIn>
            <PhaseIn p={p} win={[0.57, 0.63]}>
              <Crew x={560} y={GROUND} pose="push" />
              <Crew x={640} y={GROUND} pose="stand" flip />
              <Crew x={700} y={GROUND} pose="guide" />
            </PhaseIn>
            {/* hands that move — case walker, truss spotters tracking the
                picks, wall builders working across the wall's face */}
            <PhaseIn p={p} win={[0.26, 0.32]}>
              <motion.g style={{ x: walkX }}>
                <Crew x={380} y={GROUND} pose="push" />
              </motion.g>
            </PhaseIn>
            <PhaseIn p={p} win={[0.40, 0.46]}>
              <motion.g style={{ x: spotX }}>
                <Crew x={438} y={DECK_TOP} pose="guide" />
              </motion.g>
              <motion.g style={{ x: spotXB }}>
                <Crew x={748} y={DECK_TOP} pose="guide" flip />
              </motion.g>
            </PhaseIn>
            <PhaseIn p={p} win={[0.57, 0.62]}>
              <motion.g style={{ x: wallAX }}>
                <Crew x={505} y={DECK_TOP} pose="guide" />
              </motion.g>
              <motion.g style={{ x: wallBX }}>
                <Crew x={765} y={DECK_TOP} pose="guide" flip />
              </motion.g>
            </PhaseIn>
            <PhaseIn p={p} win={[0.34, 0.40]}>
              <Crew x={405} y={DECK_TOP} pose="stand" flip />
              <Crew x={800} y={DECK_TOP} pose="stand" />
            </PhaseIn>
          </motion.g>

          {/* 05 — first falls: LX points, mid points, array bridles, dead spares */}
          <motion.g stroke={BP} strokeWidth="1.3" strokeDasharray="4 3" fill="none" style={{ opacity: lines1Op }}>
            {[415, 505, 695, 785].map((x) => (
              <motion.line key={x} x1={x} y1={lineTop} x2={x} y2={hookL} />
            ))}
            {[400, 600, 800].map((x) => (
              <motion.line key={x} x1={x} y1={lineTop} x2={x} y2={midHook} />
            ))}
            {[[452, 464], [476, 464], [778, 790], [802, 790]].map(([x1, x2]) => (
              <motion.line key={x1} x1={x1} y1={lineTop} x2={x2} y2={arrHook} />
            ))}
            {[[365, 306], [560, 396], [660, 336], [838, 271]].map(([x, ey]) => (
              <line key={x} x1={x} y1={lineTop} x2={x} y2={ey} strokeWidth="1" />
            ))}
          </motion.g>

          {/* 06 — LX trusses airborne, halfway pull, trim */}
          <motion.g style={{ opacity: lxOp, y: lxY }}>
            <Truss x={400} y={626 - 14} w={120} h={11} />
            <Truss x={680} y={626 - 14} w={120} h={11} />
            {[414, 444, 474, 502, 694, 724, 754, 782].map((x, i) => (
              <MovingHead key={x} x={x} y={623} tilt={i % 2 ? 18 : -14} />
            ))}
          </motion.g>

          {/* full-span mid truss — flies with the first pick, parks under LX */}
          <motion.g style={{ opacity: lxOp, y: midY }}>
            <Truss x={360} y={569} w={480} h={11} />
            {[390, 450, 510, 570, 630, 690, 750, 810].map((x, i) => (
              <MovingHead key={x} x={x} y={580} tilt={i % 2 ? 16 : -16} />
            ))}
          </motion.g>

          {/* arrays — staged on deck, bridled in, flown to flank the wall */}
          <motion.g style={{ opacity: arrOp, y: arrDrop }}>
            <g transform={`translate(453 ${ARR_TOP})`}><LineArray x={0} /></g>
            <g transform={`translate(778 ${ARR_TOP})`}><LineArray x={0} /></g>
          </motion.g>

          {/* 07 — second falls: side-truss points (tower tops) + wall points (rear) */}
          <motion.g stroke={REAR} strokeWidth="1.3" strokeDasharray="4 3" fill="none" style={{ opacity: lines2Op }}>
            {[258, 326, 874, 941].map((x) => (
              <motion.line key={x} x1={x} y1={TOWER_TOP + 16} x2={x} y2={sideHook} />
            ))}
            {[540, 620, 700].map((x) => (
              <motion.line key={x} x1={x} y1={lineTop + ISO_Y} x2={x} y2={ledHook} />
            ))}
          </motion.g>

          {/* side rigs — truss spans tower-to-tower, IMAG + fixtures hang */}
          <motion.g style={{ opacity: pick2Op, y: sideY }}>
            <Truss x={253} y={560} w={78} h={10} stroke={REAR} sw={1.2} />
            <Truss x={869} y={560} w={77} h={10} stroke={REAR} sw={1.2} />
            <ImagWall x={269} y={576} />
            <ImagWall x={884} y={576} />
            <g opacity="0.7">
              {[266, 312, 878, 934].map((x, i) => (
                <MovingHead key={x} x={x} y={572} tilt={i % 2 ? 15 : -15} />
              ))}
            </g>
          </motion.g>

          {/* rear LED wall — airborne at reach, rows clip bottom-up, flies */}
          <motion.g style={{ opacity: pick2Op }}>
            <motion.g style={{ y: ledY }}>
              <Truss x={WALL_X} y={0} w={WALL_W} h={11} stroke={BP} sw={1.3} />
              <line x1={WALL_X} y1={0} x2={WALL_X + ISO_X} y2={ISO_Y} stroke={GHOST} strokeWidth="0.8" />
              <line x1={WALL_X + WALL_W} y1={0} x2={WALL_X + WALL_W + ISO_X} y2={ISO_Y} stroke={GHOST} strokeWidth="0.8" />
              {wallRows.map((o, r) => (
                <motion.g key={r} style={{ opacity: o }}>
                  {Array.from({ length: WALL_COLS }).map((_, c) => (
                    <rect key={c} x={WALL_X + c * (WALL_W / WALL_COLS) + 1} y={13 + r * 34}
                          width={WALL_W / WALL_COLS - 2} height={32}
                          fill="none" stroke={REAR} strokeWidth="1" />
                  ))}
                </motion.g>
              ))}
            </motion.g>
          </motion.g>

          {/* feeder drops — soca runs sag off the flown trusses to deck */}
          <motion.g style={{ opacity: feederOp }} stroke={WIRE} strokeWidth="0.9" fill="none">
            <path d={`M640,${MID_TRIM + 11} Q664,420 655,${DECK_TOP}`} />
            <path d={`M790,${LX_TRIM + 11} Q818,410 832,${DECK_TOP}`} />
            <circle cx="655" cy={DECK_TOP - 2} r="2.2" />
            <circle cx="832" cy={DECK_TOP - 2} r="2.2" />
          </motion.g>

          {/* 09 — safeties swap in on every point + FOH */}
          <motion.g style={{ opacity: safeties }}>
            {[415, 505, 695, 785].map((x) => (
              <g key={x}>
                <rect x={x - 4} y={lineTop} width="8" height={LX_TRIM - lineTop}
                      fill="none" stroke={WIRE} strokeWidth="1.7" />
                <circle cx={x} cy={LX_TRIM} r="3" fill="none" stroke={WIRE} strokeWidth="1.3" />
              </g>
            ))}
            {[400, 600, 800].map((x) => (
              <g key={x}>
                <rect x={x - 4} y={lineTop} width="8" height={MID_TRIM - lineTop}
                      fill="none" stroke={WIRE} strokeWidth="1.7" />
                <circle cx={x} cy={MID_TRIM} r="3" fill="none" stroke={WIRE} strokeWidth="1.3" />
              </g>
            ))}
            {[540, 620, 700].map((x) => (
              <g key={x}>
                <rect x={x - 4} y={lineTop + ISO_Y} width="8" height={WALL_TRIM - lineTop - ISO_Y}
                      fill="none" stroke={WIRE} strokeWidth="1.7" />
                <circle cx={x} cy={WALL_TRIM} r="3" fill="none" stroke={WIRE} strokeWidth="1.3" />
              </g>
            ))}
            <rect x="120" y={GROUND - 34} width="70" height="34" fill="none" stroke={WIRE} strokeWidth="1.3" />
            <line x1="120" y1={GROUND - 34} x2="120" y2={GROUND - 60} stroke={WIRE} strokeWidth="0.8" />
            <circle cx="155" cy={GROUND - 66} r="6" fill="none" stroke={WIRE} strokeWidth="1.2" />
            <path d={`M280,${GROUND - 4} C360,${GROUND + 14} 160,${GROUND - 20} 190,${GROUND - 34}`} stroke={WIRE} fill="none" strokeDasharray="5 4" opacity="0.6" />
            <text x="120" y={GROUND - 44} fill={WIRE} fontSize="10" fontFamily="monospace">FOH</text>
          </motion.g>

          {/* callouts */}
          <Callout p={p} win={[0.17, 0.24]} x={SL_T - 15} y={320} tx={176} ty={300} text="TOWERS ×6" anchor="end" />
          <Callout p={p} win={[0.20, 0.28]} x={GRID_R - 60} y={ROOF_GRADE - 40} tx={940} ty={GRID_Y - 70} text="ROOF SYSTEM" />
          <Callout p={p} win={[0.34, 0.42]} x={600} y={lineTop + 40} tx={330} ty={lineTop + 70} text="CHAIN HOIST 1T ×18" anchor="end" />
          <Callout p={p} win={[0.62, 0.69]} x={465} y={420} tx={292} ty={470} text="LINE ARRAY ×2" anchor="end" />
          <Callout p={p} win={[0.66, 0.73]} x={291} y={330} tx={200} ty={290} text="IMAG ×2" anchor="end" />
          <Callout p={p} win={[0.70, 0.77]} x={600} y={MID_TRIM + 12} tx={600} ty={478} text="MID TRUSS — FULL SPAN" anchor="middle" />
          <Callout p={p} win={[0.74, 0.81]} x={WALL_X + WALL_W} y={WALL_TRIM + 90} tx={880} ty={WALL_TRIM + 140} text="LED WALL 32'×16'" />

          {/* 10 — go live */}
          <motion.g style={{ opacity: live }}>
            <defs>
              <linearGradient id="beamL" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BP} stopOpacity="0.55" />
                <stop offset="100%" stopColor={BP} stopOpacity="0" />
              </linearGradient>
              <linearGradient id="ledGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="55%" stopColor="#ef4444" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
            </defs>
            {BEAMS.map(([bx, by, dx]) => (
              <g key={`${bx}-${by}`}>
                <polygon points={`${bx - 3},${by} ${bx + 3},${by} ${bx + dx + 15},615 ${bx + dx - 15},615`}
                         fill="url(#beamL)" opacity="0.6" />
                <ellipse cx={bx + dx} cy={617} rx="16" ry="4" fill={BP} opacity="0.22" />
              </g>
            ))}
            <rect x={WALL_X} y={WALL_TRIM + 13} width={WALL_W} height={WALL_ROWS * 34 + 6} fill="url(#ledGrad)" opacity="0.9" rx="2" />
            <rect x={269} y={SIDE_TRIM + 16} width="46" height="64" fill="url(#ledGrad)" opacity="0.55" rx="1" />
            <rect x={884} y={SIDE_TRIM + 16} width="46" height="64" fill="url(#ledGrad)" opacity="0.55" rx="1" />
            <polygon points="158,578 640,470 700,580" fill="url(#beamL)" opacity="0.3" />
            <line x1={GRID_L} y1={GRID_Y - 34} x2={GRID_R} y2={GRID_Y - 34} stroke={BP} strokeWidth="3" opacity="0.8" />
            {/* barricade + front-row heads */}
            <line x1="340" y1="632" x2="860" y2="632" stroke={WIRE} strokeWidth="1.6" />
            {[340, 426, 512, 598, 684, 770, 856].map((bx) => (
              <line key={bx} x1={bx} y1={632} x2={bx} y2={GROUND} stroke={WIRE} strokeWidth="1" />
            ))}
            {[352, 392, 430, 468, 505, 545, 588, 628, 668, 706, 745, 788, 828].map((cx, i) => (
              <circle key={cx} cx={cx} cy={656 + (i % 3) * 7} r="4.5" fill={BP} opacity="0.4" />
            ))}
            <ellipse cx="600" cy="670" rx="500" ry="26" fill={BP} opacity="0.10" />
          </motion.g>
        </svg>

        <div className="absolute right-6 sm:right-10 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1.5">
          {BEATS.map((_, i) => (
            <ProgressDot key={i} p={p} i={i} n={BEATS.length} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function PhaseIn({ p, win, children }: { p: MotionValue<number>; win: [number, number]; children: React.ReactNode }) {
  const o = useTransform(p, [win[0], win[1]], [0, 1]);
  return <motion.g style={{ opacity: o }}>{children}</motion.g>;
}

function BeatCaption({ p, i, n, tag, line }: { p: MotionValue<number>; i: number; n: number; tag: string; line: string }) {
  const start = i / n;
  const o = useTransform(p, [start + 0.008, start + 0.04, start + 0.09, start + 0.1], [0, 1, 1, 0]);
  const y = useTransform(p, [start + 0.008, start + 0.05], [14, 0]);
  return (
    <motion.div style={{ opacity: o, y }} className="absolute top-0">
      <div className="text-[10px] sm:text-xs tracking-[0.3em] text-amber-400/90 uppercase">{tag}</div>
      <div className="mt-2 text-base sm:text-lg text-zinc-200 max-w-[300px] leading-snug font-sans">{line}</div>
    </motion.div>
  );
}

function ProgressDot({ p, i, n }: { p: MotionValue<number>; i: number; n: number }) {
  const o = useTransform(p, [i / n, i / n + 0.04], [0.25, 1]);
  return <motion.span style={{ opacity: o }} className="block w-1.5 h-1.5 rounded-full bg-amber-400" />;
}

export default StageBuild;
