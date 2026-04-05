"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { BGPattern } from "@/components/ui/bg-pattern";

// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  bg:            "#EDE8DB",
  grainSrc:      "black",
  ambient:       [
    "radial-gradient(ellipse 55% 70% at 22% 42%, rgba(0,158,133,0.07) 0%, transparent 60%)",
    "radial-gradient(ellipse 45% 55% at 78% 68%, rgba(200,90,26,0.05) 0%, transparent 55%)",
    "radial-gradient(ellipse 30% 40% at 55% 12%, rgba(0,130,180,0.04) 0%, transparent 50%)",
  ].join(", "),
  eyebrow:       "#009E85",
  titleBase:     "#1A1612",
  titleAccent:   "#009E85",
  tagline:       "rgba(26,22,18,0.75)",
  desc:          "rgba(26,22,18,0.5)",
  featureBorder: "rgba(26,22,18,0.1)",
  featureBg:     "rgba(26,22,18,0.04)",
  teal:          "#009E85",
  tealGlow:      "rgba(0,158,133,0.22)",
  tealBtnText:   "#EDE8DB",
  orange:        "#C85A1A",
  linkMuted:     "rgba(26,22,18,0.35)",
  linkHover:     "rgba(26,22,18,0.7)",
  statVal:       "#1A1612",
  statLabel:     "rgba(26,22,18,0.3)",
  separator:     "rgba(26,22,18,0.14)",
  cardBg:        "#F0E9D6",
  cardText:      "#1E1812",
  cardSubText:   "rgba(30,24,18,0.45)",
  shadowA:       "rgba(26,22,18,0.22)",
  shadowB:       "rgba(26,22,18,0.14)",
  fadeSolid:     "#EDE8DB",
  fadeMid:       "rgba(237,232,219,0.55)",
};

function scoreColor(s: number) {
  if (s >= 90) return "#00A870";
  if (s >= 75) return "#D4820A";
  return "#C0392B";
}

// ─── Frame data ───────────────────────────────────────────────────────────────

const FRAMES = [
  { src: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=520&q=80", label: "SFO Terminal 3",         score: 91 },
  { src: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=520&q=80", label: "Arts Convention Ctr.",    score: 88 },
  { src: "https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?w=520&q=80", label: "Metro Plaza Hub",         score: 96 },
  { src: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=520&q=80", label: "City Hall",               score: 79 },
  { src: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=520&q=80",   label: "Lincoln Library",         score: 94 },
  { src: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=520&q=80", label: "Riverside Park",          score: 82 },
  { src: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=520&q=80", label: "Westfield Mall",          score: 87 },
  { src: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=520&q=80", label: "Millennium Park",         score: 93 },
  { src: "https://images.unsplash.com/photo-1555636222-cae831e670b3?w=520&q=80",   label: "Union Station",           score: 85 },
  { src: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=520&q=80", label: "The Broad Museum",        score: 97 },
  { src: "https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=520&q=80", label: "Oceanside Medical Ctr.",  score: 90 },
  { src: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=520&q=80", label: "National Aquarium",       score: 78 },
];

type Cfg = { x: number; speed: number; rot: number; w: number; h: number; depth: number };

const CARD_CONFIGS: Cfg[] = [
  { x:  2, speed: 0.52, rot:  -8, w: 192, h: 258, depth:  8 },
  { x: 22, speed: 0.76, rot:   5, w: 168, h: 228, depth: 12 },
  { x: 42, speed: 0.60, rot:  -3, w: 214, h: 288, depth:  6 },
  { x: 62, speed: 0.86, rot:   7, w: 178, h: 242, depth: 10 },
  { x: 80, speed: 0.48, rot:  -6, w: 188, h: 252, depth:  7 },
  { x: 12, speed: 0.68, rot:   3, w: 200, h: 268, depth:  9 },
  { x: 53, speed: 0.81, rot:  -5, w: 160, h: 216, depth: 11 },
  { x: 32, speed: 0.58, rot:   9, w: 196, h: 264, depth:  8 },
  { x: 71, speed: 0.72, rot:  -7, w: 174, h: 236, depth: 10 },
  { x: 85, speed: 0.44, rot:   4, w: 182, h: 246, depth:  7 },
  { x:  7, speed: 0.64, rot:  -2, w: 166, h: 224, depth: 11 },
  { x: 47, speed: 0.90, rot:   6, w: 204, h: 276, depth:  6 },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>(Array(FRAMES.length).fill(null));
  const yPos     = useRef<number[]>([]);
  const mouse    = useRef({ x: 0, y: 0 });
  const rafId    = useRef<number>(0);

  useEffect(() => {
    const N  = CARD_CONFIGS.length;
    const vh = window.innerHeight;
    yPos.current = CARD_CONFIGS.map((cfg, i) => -cfg.h + (i / N) * (vh + cfg.h));

    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMove);

    const loop = () => {
      const currentVh = window.innerHeight;
      const { x: mx, y: my } = mouse.current;
      CARD_CONFIGS.forEach((cfg, i) => {
        const el = cardRefs.current[i];
        if (!el) return;
        let y = yPos.current[i] + cfg.speed;
        if (y > currentVh + cfg.h + 50) y = -(cfg.h + 50);
        yPos.current[i] = y;
        el.style.transform = `translateY(${y}px) rotate(${cfg.rot}deg) perspective(720px) rotateX(${my * cfg.depth}deg) rotateY(${-mx * cfg.depth}deg)`;
      });
      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId.current);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <main
      aria-label="Straightline — Spatial Accessibility"
      className="home-root"
      style={{ display: "flex", height: "100vh", overflow: "hidden", background: T.bg, position: "relative" }}
    >
      {/* ── Grain ── */}
      <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, filter: "url(#grain)", opacity: 0.045, pointerEvents: "none", zIndex: 50, background: T.grainSrc }} />

      {/* ── Ambient ── */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: T.ambient }} />

      {/* ══════════════════════ LEFT COLUMN ══════════════════════ */}
      <section
        aria-label="Hero content"
        className="home-left-col"
        style={{ flexShrink: 0, display: "flex", flexDirection: "column", position: "relative", zIndex: 10 }}
      >
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.15 }}
          style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.62rem", letterSpacing: "0.22em", color: T.eyebrow, textTransform: "uppercase", marginBottom: "1.75rem" }}
        >
          Diamondhacks · Social Impact · Spatial Accessibility · 2026
        </motion.p>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="home-title"
          style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, lineHeight: 0.87, letterSpacing: "-0.02em", color: T.titleBase, marginBottom: "2.25rem" }}
        >
          Straight
          <br />
          <em style={{ fontStyle: "italic", color: T.titleAccent, letterSpacing: "-0.03em" }}>line</em>
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.42 }}
          style={{ fontFamily: "var(--font-geist-sans)", fontSize: "1.1rem", fontWeight: 400, color: T.tagline, lineHeight: 1.5, marginBottom: "0.9rem", maxWidth: "370px" }}
        >
          Know the space.
          <br />
          Before you&rsquo;re there.
        </motion.p>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.52 }}
          style={{ fontFamily: "var(--font-geist-sans)", fontSize: "0.82rem", color: T.desc, lineHeight: 1.72, maxWidth: "355px", marginBottom: "2.4rem" }}
        >
          People with mobility impairments deserve to arrive prepared. AI&#8209;powered
          ADA compliance analysis and immersive 3D navigation let you explore any
          space before your first step.
        </motion.p>

        {/* Feature callouts */}
        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.62 }}
          style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "2.5rem" }}
        >
          {[
            { label: "ADA Intelligence", desc: "Automated compliance scoring from public ADA data, user reviews, and photos.", accent: T.teal, icon: "◎" },
            { label: "Immersive 3D View", desc: "Navigate point-cloud scenes of buildings to plan accessible routes ahead of time.", accent: T.orange, icon: "◈" },
          ].map((f) => (
            <div key={f.label} style={{ display: "flex", gap: "0.9rem", alignItems: "flex-start", padding: "0.9rem 1.1rem", borderRadius: "6px", border: `1px solid ${T.featureBorder}`, background: T.featureBg }}>
              <div style={{ width: 2, minHeight: 36, alignSelf: "stretch", borderRadius: 2, background: f.accent, flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.6rem", letterSpacing: "0.16em", color: f.accent, textTransform: "uppercase", marginBottom: "0.28rem" }}>
                  {f.icon}&nbsp;&nbsp;{f.label}
                </p>
                <p style={{ fontFamily: "var(--font-geist-sans)", fontSize: "0.78rem", color: T.desc, lineHeight: 1.58 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.76 }}
          style={{ display: "flex", alignItems: "center", gap: "1.75rem" }}
        >
          <a
            href="/map"
            aria-label="Open the map to explore a location"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.7rem", padding: "1rem 2rem", background: T.teal, color: T.tealBtnText, fontFamily: "var(--font-geist-mono)", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", textDecoration: "none", borderRadius: "3px", transition: "transform 0.18s ease, box-shadow 0.18s ease" }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.transform = "translateY(-2px)"; el.style.boxShadow = `0 8px 28px ${T.tealGlow}`; }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; }}
          >
            Explore a Location
            <span aria-hidden="true" style={{ fontSize: "1.1rem", lineHeight: 1 }}>→</span>
          </a>
        </motion.div>

        {/* Bottom stat row */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 1.1 }}
          aria-hidden="true"
          className="home-stat-row"
          style={{ display: "flex", gap: "1.8rem" }}
        >
          {[
            { val: "3D",    label: "Point Clouds"  },
            { val: "ADA",   label: "Compliance AI" },
            { val: "Async", label: "Pipeline"      },
          ].map((s) => (
            <div key={s.label}>
              <p style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600, fontSize: "1.05rem", color: T.statVal, lineHeight: 1, marginBottom: "3px" }}>{s.val}</p>
              <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.48rem", letterSpacing: "0.12em", color: T.statLabel, textTransform: "uppercase" }}>{s.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ══════════════════════ RIGHT — FALLING FRAMES ══════════════════════ */}
      <div aria-hidden="true" className="home-right-col" style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Subtle dot grid texture */}
        <BGPattern
          variant="dots"
          mask="none"
          size={28}
          fill="rgba(26,22,18,0.09)"
        />

        <div style={{ position: "absolute", left: 0, top: "15%", width: 1, height: "70%", background: `linear-gradient(to bottom, transparent, ${T.separator} 30%, ${T.separator} 70%, transparent)`, zIndex: 5 }} />

        {FRAMES.map((frame, i) => {
          const cfg  = CARD_CONFIGS[i];
          const sCol = scoreColor(frame.score);
          return (
            <div
              key={i}
              ref={(el) => { cardRefs.current[i] = el; }}
              style={{ position: "absolute", left: `${cfg.x}%`, top: 0, width: cfg.w, willChange: "transform", transformOrigin: "center center", background: T.cardBg, borderRadius: "2px", boxShadow: `0 14px 52px ${T.shadowA}, 0 4px 12px ${T.shadowB}`, overflow: "hidden", userSelect: "none" }}
            >
              <div style={{ width: "100%", height: cfg.h - 54, overflow: "hidden", position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frame.src} alt={frame.label} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "saturate(0.85) contrast(1.06)" }} />
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.22) 100%)", pointerEvents: "none" }} />
              </div>
              <div style={{ padding: "7px 10px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.55rem", letterSpacing: "0.09em", color: T.cardText, textTransform: "uppercase", marginBottom: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {frame.label}
                  </p>
                  <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.46rem", color: T.cardSubText, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    ADA Compliance
                  </p>
                </div>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: sCol, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.48rem", fontWeight: 700, color: "#F0E9D6" }}>{frame.score}</span>
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80, background: `linear-gradient(to bottom, ${T.fadeSolid} 0%, ${T.fadeMid} 65%, transparent 100%)`, pointerEvents: "none", zIndex: 20 }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: `linear-gradient(to top, ${T.fadeSolid} 0%, ${T.fadeMid} 65%, transparent 100%)`, pointerEvents: "none", zIndex: 20 }} />
      </div>
    </main>
  );
}
