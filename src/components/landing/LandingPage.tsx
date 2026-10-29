import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { StageBuild } from './StageBuild';
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  MessagesSquare,
} from 'lucide-react';
import { useWaitlistStats } from '@/hooks/useWaitlistStats';

/* ------------------------------------------------------------------ */
/* LandingPage v2 — Diffui direction: option A top half (cinematic     */
/* hero + blueprint build moment) spliced with option B bottom half    */
/* (pain-led photo cards, role cards, company door, founding crew).    */
/* Backstage-industrial: near-black, one amber accent, condensed       */
/* display type + monospace call-sheet details.                        */
/* ------------------------------------------------------------------ */

/* image sources — plain photos use cover, collage panels use sprite crops.
   collage-life: 2048x1024, 3 cols x 2 rows -> each panel exactly 4:3 (pain cards).
   collage-roles: 1280x1600, 3 cols x 3 rows -> each panel exactly 4:5 (role cards). */
interface CardImg { src: string; size?: string; pos?: string }

const COL_LIFE = '/landing/collage-life.webp';
const COL_ROLE = '/landing/collage-roles.webp';

const A = (c: number, r: number): CardImg => ({ src: COL_LIFE, size: '300% 200%', pos: `${c * 50}% ${r * 100}%` });
const B = (c: number, r: number): CardImg => ({ src: COL_ROLE, size: '300% 300%', pos: `${c * 50}% ${r * 50}%` });
const P = (src: string, pos = '50% 50%', size = 'cover'): CardImg => ({ src, pos, size });
/* hero variant — aspect-preserving panel crop (hero is wider than 4:3, so
   fixing both axes would stretch faces; '300% auto' crops top/bottom instead) */
const HA = (c: number, _r: number): CardImg => ({ src: COL_LIFE, size: '300% auto', pos: `${c * 50}% 50%` });

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const f = () => setMatches(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [query]);
  return matches;
}

/** Crossfading stack of card images — collage panels and photos alike. */
const Crossfade: React.FC<{ images: CardImg[]; interval?: number; label: string }> = ({ images, interval = 5200, label }) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (images.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % images.length), interval);
    return () => clearInterval(t);
  }, [images.length, interval]);
  return (
    <div className="absolute inset-0" role="img" aria-label={label}>
      {images.map((im) => (
        <div
          key={`${im.src}-${im.pos ?? ''}-${im.size ?? ''}`}
          aria-hidden="true"
          className={`absolute inset-0 transition-opacity duration-1000 ${images.indexOf(im) === i ? 'opacity-100' : 'opacity-0'}`}
          style={{
            backgroundImage: `url("${im.src}")`,
            backgroundSize: im.size ?? 'cover',
            backgroundPosition: im.pos ?? '50% 50%',
          }}
        />
      ))}
    </div>
  );
};

const painCards: { images: CardImg[]; alt: string; title: string; sub: string; details: string[] }[] = [
  {
    images: [A(0, 0), A(2, 1)],
    alt: 'Phone showing a job feed with load-in, show call and load-out offers',
    title: "Every company's calls land in one feed.",
    sub: 'Tour Co, Festival Prod, Stadium Ops — one sheet, not ten threads.',
    details: [
      'Calls from every company you roll with land in one feed — no digging through ten text threads.',
      'Rate, call time, venue and position are on the post. Tap to claim, confirmation texts itself.',
      'Your crew card decides what you see first — calls matched to your skills, not broadcast spam.',
    ],
  },
  {
    images: [A(1, 0), A(1, 1), P('/landing/pain-car.webp', '50% 42%', 'auto 124%')],
    alt: 'Crew member resting in a van between cities, crew carpool',
    title: 'Stop sleeping in the car alone.',
    sub: 'Split lodging and rides with crew already on the call.',
    details: [
      'Crew on the same call can flag a spare seat or an open hotel bed before anyone books solo.',
      'Call sheets mark crew-safe parking — if you\'re crashing in the car, at least park with the crew around you.',
      'Gas and lodging splits settle inside the call, so nobody chases IOUs at load-out.',
    ],
  },
  {
    images: [A(2, 0), P('/landing/pain-food-v2.webp')],
    alt: 'Mixed crew of stagehands sharing pizza off a road case, hard hats nearby',
    title: 'One food run feeds the whole crew.',
    sub: 'Pool the run instead of $30 a head at the venue window.',
    details: [
      'One runner, one list — drop your order on the call sheet and chip in without the cash scramble.',
      'Totals settle themselves in the app. The venue-window markup dies here.',
    ],
  },
  {
    images: [A(0, 1), A(2, 1)],
    alt: 'Road case with an amber tape strip and steel latches',
    title: 'Pay is locked before you lift a case.',
    sub: 'Escrow-funded calls. Rate, hours and OT written down up front.',
    details: [
      'Rate, hours and OT terms are written on the call before you agree — no surprises at load-out.',
      'Escrow-funded calls mean the money is already there — clock-out triggers payout, not an invoice chase.',
      'GPS clock-in kills the paper timesheet. Your hours get approved, not argued.',
    ],
  },
];

const roleCards: { images: CardImg[]; alt: string; title: string; sub: string }[] = [
  { images: [B(0, 0), P('/landing/role-rigger.webp')], alt: 'Rigger in a harness climbing box truss', title: 'Riggers', sub: 'Heights pay different' },
  { images: [B(1, 0), P('/landing/role-audio.webp')], alt: 'A1 audio engineer at the FOH console', title: 'A1 Audio', sub: 'Make it hit' },
  { images: [B(2, 0), P('/landing/role-lighting.webp')], alt: 'Lighting tech focusing a moving head in haze', title: 'Lighting Tech', sub: 'Shape the moment' },
  { images: [B(0, 1), P('/landing/role-video.webp')], alt: 'Video tech building a massive LED wall', title: 'Video Wall', sub: 'Big picture people' },
  { images: [B(1, 1), P('/landing/role-stagehand.webp')], alt: 'Stagehands pushing road cases up a ramp', title: 'Stagehands', sub: 'The show moves because of you' },
  { images: [B(2, 1), P('/landing/pain-case.webp', '32% 55%', 'auto 142%')], alt: 'Backline tech beside amps and guitar cases', title: 'Backline', sub: 'The boxes wait for you' },
  { images: [B(0, 2), P('/landing/closer-badge.webp')], alt: 'Stage manager with headset and clipboard', title: 'Stage Managers', sub: 'You call it, they move' },
  { images: [B(1, 2)], alt: 'Wardrobe hand sorting jackets on a rack', title: 'Wardrobe', sub: 'Look sharp, stay warm' },
  { images: [B(2, 2), P('/landing/pain-car.webp', '50% 40%', 'auto 118%')], alt: 'Crew driver at the wheel of a production van at night', title: 'Drivers', sub: 'Get the crew there' },
];

const heroPhotos: CardImg[] = [
  P('/landing/hero-crew.webp'),
  P('/landing/pain-food-v2.webp'),
  P('/landing/role-video.webp'),
  P('/landing/pain-car.webp', '50% 40%', 'auto 118%'),
];

const HEADLINES: [string, string][] = [
  ['Same people.', 'Different cities.'],
  ['Same crew.', 'Different rig.'],
  ['Same call.', 'Different stage.'],
  ['Same hands.', 'Different show.'],
];

function RotatingHeadline() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % HEADLINES.length), 3600);
    return () => clearInterval(t);
  }, []);
  return (
    <h2 className="font-display font-bold uppercase leading-[0.95] text-white text-5xl sm:text-6xl h-[1.98em] relative overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.span
          key={i}
          className="block"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {HEADLINES[i][0]}<br />{HEADLINES[i][1]}
        </motion.span>
      </AnimatePresence>
    </h2>
  );
}

const railItems = ['Stagehands', 'Riggers', 'Audio', 'Lighting', 'Video', 'Load In', 'Show Call', 'Load Out'];
/* one copy must be wider than the widest viewport or the loop dead-ends —
   4x the item set keeps the seam off-screen up to ~5K widths */
const railLoop = [...railItems, ...railItems, ...railItems, ...railItems];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { total: waitlistCount } = useWaitlistStats();
  const [openPain, setOpenPain] = useState<number | null>(() => {
    /* ?pain=N — debug: render a card pre-expanded for screenshot checks (dev only) */
    if (!import.meta.env.DEV || typeof window === 'undefined') return null;
    const p = new URLSearchParams(window.location.search).get('pain');
    const n = p === null ? NaN : Number(p);
    return Number.isInteger(n) && n >= 0 && n < painCards.length ? n : null;
  });
  /* ?cards — debug: render only the card sections for screenshot checks (dev only) */
  const cardsOnly = import.meta.env.DEV && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('cards');
  /* collage panels are 4:3 — only safe to sprite-crop into the hero when the
     hero box itself is landscape; portrait falls back to cover-fit photos */
  const wideHero = useMediaQuery('(min-aspect-ratio: 5/4)');

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100 antialiased">
      {!cardsOnly && (
      <>
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-[#0A0A0B]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-amber-400 rounded-md flex items-center justify-center">
                <span className="text-zinc-950 font-black text-lg">F</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-white">FlexZora</span>
              <span className="hidden sm:inline text-[11px] font-medium tracking-[0.2em] uppercase text-zinc-500 mt-1">
                Crew Marketplace
              </span>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/auth')}
                className="hidden sm:inline-flex text-zinc-300 hover:text-white hover:bg-white/5"
              >
                Sign In
              </Button>
              <Button
                onClick={() => navigate('/waitlist')}
                className="bg-amber-400 text-zinc-950 hover:bg-amber-300 font-semibold"
              >
                Join the Crew
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero — option A: full-bleed crew photo, condensed headline, ticker rail */}
      <section className="relative min-h-[82vh] sm:min-h-[92vh] flex items-center overflow-hidden">
        <Crossfade
          images={wideHero
            ? [heroPhotos[0], HA(1, 1), heroPhotos[1], HA(0, 0), heroPhotos[2], HA(2, 0), HA(1, 0)]
            : heroPhotos}
          interval={6500}
          label="Crew member in a harness looking out over a packed arena"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0B] via-[#0A0A0B]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] via-transparent to-[#0A0A0B]/40" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 pt-24 w-full">
          <p className="font-mono text-[10px] sm:text-xs tracking-[0.35em] uppercase text-amber-400/90 mb-4">
            For the crew. By the crew.
          </p>
          <h1 className="font-display font-bold uppercase leading-[0.95] tracking-tight text-white text-5xl sm:text-7xl lg:text-8xl">
            Build<br />the Show.
          </h1>
          <p className="mt-4 sm:mt-5 font-mono text-xs sm:text-sm tracking-[0.3em] uppercase text-amber-300/90">
            Real work. Real people. All in one place.
          </p>
          <div className="mt-7 sm:mt-8 flex flex-wrap items-center gap-4">
            <Button
              size="lg"
              onClick={() => navigate('/waitlist')}
              className="bg-amber-400 text-zinc-950 hover:bg-amber-300 font-semibold text-base px-8 h-12"
            >
              Join the Crew
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <span className="font-mono text-[10px] sm:text-xs tracking-[0.2em] uppercase text-zinc-400 basis-full sm:basis-auto">
              {waitlistCount.toLocaleString()} already on the list
            </span>
          </div>
          <div className="mt-9 sm:mt-12 grid grid-cols-4 max-w-xl gap-3 sm:gap-4 font-mono text-[9px] sm:text-[10px] tracking-[0.18em] uppercase text-zinc-400">
            <div><span className="block text-zinc-200 text-xs sm:text-sm">12:00</span>Load In</div>
            <div><span className="block text-zinc-200 text-xs sm:text-sm">Gate B</span>Call Time</div>
            <div><span className="block text-zinc-200 text-xs sm:text-sm">Stage 1</span>Location</div>
            <div><span className="block text-zinc-200 text-xs sm:text-sm">$320</span>Day Rate</div>
          </div>
        </div>

        {/* horizontal crew ticker across the bottom */}
        <div className="absolute bottom-0 inset-x-0 border-t border-white/10 bg-[#0A0A0B]/60 backdrop-blur-sm overflow-hidden">
          <div className="flex whitespace-nowrap animate-marquee py-3">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0">
                {railLoop.map((item, i) => (
                  <span key={`${copy}-${i}`} className="font-mono text-[11px] tracking-[0.3em] uppercase text-zinc-400 px-6">
                    {item}<span className="text-amber-400/60 pl-6">·</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Blueprint build moment — animated dead-hang roof raise */}
      <section className="relative border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-2 flex flex-wrap items-end justify-between gap-6">
          <div>
            <RotatingHeadline />
            <div className="mt-4 h-0.5 w-16 bg-amber-400" />
          </div>
          <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-zinc-500 space-y-1 pb-1">
            <p>Truss · Towers · Chain Motors</p>
            <p>LED Wall · Audio Hang · Lighting Grid</p>
            <p className="text-amber-400/80">Stage deck — all together</p>
          </div>
        </div>
        {/* mobile spec strip — fills the dead air above the scene */}
        <div className="sm:hidden px-4 pb-3 font-mono text-[9px] tracking-[0.18em] uppercase text-amber-400/70">
          6 towers · 18 hoists · wall 32'×16' · trim 26'
        </div>
      </section>
      <StageBuild />
      </>
      )}

      {/* Real life. Solved. — option B pain cards */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <h2 className="font-display font-bold uppercase text-white text-4xl sm:text-5xl">
              Real life. <span className="text-amber-400">Solved.</span>
            </h2>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-zinc-500">
              Tap a card — here's how it actually works
            </p>
          </div>
          <div id="features" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {painCards.map((c, ci) => (
              <div key={c.title} className="group overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40">
                <button
                  type="button"
                  onClick={() => setOpenPain(openPain === ci ? null : ci)}
                  aria-expanded={openPain === ci}
                  className="block w-full text-left"
                >
                  <div className="aspect-[4/3] overflow-hidden relative">
                    <Crossfade images={c.images} interval={5200 + ci * 800} label={c.alt} />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0A0A0B] via-[#0A0A0B]/85 to-transparent pt-14 pb-4 px-4">
                      <h3 className="font-display font-semibold uppercase text-white text-lg leading-tight">{c.title}</h3>
                      <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">{c.sub}</p>
                      <p className="mt-2.5 font-mono text-[10px] tracking-[0.2em] uppercase text-amber-400/80">
                        {openPain === ci ? 'How it works −' : 'How it works +'}
                      </p>
                    </div>
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {openPain === ci && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <ul className="space-y-2.5 border-t border-white/10 px-4 py-4">
                        {c.details.map((d) => (
                          <li key={d} className="flex gap-2.5 text-xs leading-relaxed text-zinc-300">
                            <span className="shrink-0 text-amber-400">▸</span>
                            {d}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Find your role — option B role photo cards */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <h2 className="font-display font-bold uppercase text-white text-4xl sm:text-5xl">
              Find your <span className="text-amber-400">role.</span>
            </h2>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-zinc-500">
              Different skills. Same crew.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {roleCards.map((r, ri) => (
              <button
                key={r.title}
                onClick={() => navigate('/waitlist')}
                className="group relative overflow-hidden rounded-xl border border-white/10 text-left"
              >
                <div className="aspect-[4/5] overflow-hidden relative">
                  <Crossfade images={r.images} interval={4600 + ri * 550} label={r.alt} />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] via-[#0A0A0B]/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between gap-2">
                  <div>
                    <h3 className="font-display font-semibold uppercase text-white text-base leading-tight">{r.title}</h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{r.sub}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-amber-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Production companies door — option B */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 px-6 py-12 sm:px-12">
            <div className="absolute -right-10 top-1/2 -translate-y-1/2 w-72 h-72 bg-amber-400/10 blur-[100px] rounded-full pointer-events-none" />
            <div className="relative grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-amber-400/90 mb-3">
                  For production companies
                </p>
                <h2 className="font-display font-bold uppercase text-white text-4xl sm:text-5xl leading-[0.95]">
                  Get the right crew.<br />Right now.
                </h2>
              </div>
              <div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-3 text-zinc-300 text-sm">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" /> Verified professionals
                  </li>
                  <li className="flex items-center gap-3 text-zinc-300 text-sm">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0" /> Fill crews fast
                  </li>
                  <li className="flex items-center gap-3 text-zinc-300 text-sm">
                    <MessagesSquare className="w-4 h-4 text-amber-400 shrink-0" /> No more group texts
                  </li>
                </ul>
                <Button
                  size="lg"
                  onClick={() => navigate('/schedule-demo')}
                  className="bg-amber-400 text-zinc-950 hover:bg-amber-300 font-semibold px-8"
                >
                  Book a Demo
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Founding crew closer — option B */}
      <section className="relative py-24 border-t border-white/5 overflow-hidden">
        <img
          src="/landing/closer-badge.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0B] via-[#0A0A0B]/80 to-[#0A0A0B]" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-display font-bold uppercase text-white text-5xl sm:text-6xl leading-[0.95]">
            Join the<br />founding crew.
          </h2>
          <p className="mt-4 font-mono text-xs tracking-[0.3em] uppercase text-zinc-400">
            Real crews. Real opportunity.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 font-mono">
            <span className="text-4xl sm:text-5xl font-semibold text-amber-400 tabular-nums tracking-tight">
              {waitlistCount.toLocaleString()}
            </span>
            <span className="text-left text-[11px] tracking-[0.2em] uppercase text-zinc-400 leading-tight">
              Crew already<br />signed up
            </span>
          </div>
          <div className="mt-8">
            <Button
              size="lg"
              onClick={() => navigate('/waitlist')}
              className="bg-amber-400 text-zinc-950 hover:bg-amber-300 font-semibold text-base px-10 h-12"
            >
              Join the Crew
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <p className="mt-4 font-mono text-[10px] tracking-[0.25em] uppercase text-zinc-500">
              Be first in line.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-zinc-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-amber-400 rounded-md flex items-center justify-center">
                  <span className="text-zinc-950 font-black text-lg">F</span>
                </div>
                <span className="text-xl font-bold text-white">FlexZora</span>
              </div>
              <p className="text-zinc-500 mb-4 max-w-md text-sm">
                Built by crew. For crew. The gig marketplace for concert and corporate event production.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Product</h3>
              <ul className="space-y-2 text-zinc-500 text-sm">
                <li>
                  <a href="#features" className="hover:text-white transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <Link to="/waitlist" className="hover:text-white transition-colors">
                    Join Waitlist
                  </Link>
                </li>
                <li>
                  <Link to="/schedule-demo" className="hover:text-white transition-colors">
                    Schedule a Demo
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Legal</h3>
              <ul className="space-y-2 text-zinc-500 text-sm">
                <li>
                  <Link to="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/schedule-demo" className="hover:text-white transition-colors">
                    Contact Us
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-8 text-center text-zinc-600 text-sm">
            <p>&copy; 2026 FlexZora. All rights reserved. · Built by crew, for crew.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
