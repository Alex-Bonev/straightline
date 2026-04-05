# Straightline — Design System & Style Guide

This document is the authoritative reference for visual design, typography, motion, and component patterns across the Straightline application. All agents and contributors building new pages or components must read this first.

The homepage (`app/page.tsx`) is the canonical reference implementation. When in doubt, match it.

---

## 1. Design Philosophy

**Core tension:** Clinical precision meets spatial wonder.

The interface bridges two worlds: the rigorous legibility of ADA compliance data and the immersive, exploratory feeling of 3D space navigation. Every design choice should honor both. Neither should dominate.

**Principles:**
- **Warm cream as the primary surface.** The dominant background is `#EDE8DB` — a warm, off-white parchment tone. It reads as paper: analogue, tactile, humane. This is the ground everything sits on.
- **Paper as depth.** Where the UI represents real-world scanned locations — polaroid cards, detail panels — use a slightly deeper warm cream (`#F0E9D6`). It signals content rather than chrome.
- **Dark ink on warm paper.** All text is dark (`#1A1612`, `rgba(26,22,18,…)`). Never white text on the cream background.
- **Teal and orange as accent punctuation.** Teal (`#009E85`) is the primary action color — CTAs, active states, ADA feature labels. Orange (`#C85A1A`) is the secondary accent for spatial/3D features. Both are muted, earthy tones, not neon.
- **Typography does heavy lifting.** Layout is sparse. Type carries hierarchy. Resist adding decorative elements; instead, let scale, weight, and letter-spacing create differentiation.
- **Motion reveals, never decorates.** Animations communicate state and invite exploration. They are never gratuitous.
- **Accessibility is non-negotiable.** The app serves people with disabilities. Semantic HTML, ARIA labels, keyboard navigation, and sufficient contrast are required everywhere, not aspirational.

---

## 2. Color Palette

All colors are defined as CSS custom properties. Never hard-code hex values in components — reference the variable. Where a variable doesn't exist yet, add it to `globals.css` and document it here.

### Background layers
| Token                     | Value       | Usage                                      |
|---------------------------|-------------|--------------------------------------------|
| `--sl-bg`                 | `#EDE8DB`   | Page background, dominant surface          |
| `--sl-bg-elevated`        | `rgba(26,22,18,0.04)` | Raised card/panel on cream bg  |
| `--sl-bg-paper`           | `#F0E9D6`   | Polaroid cards, real-world location frames |

### Text
| Token                     | Value                    | Usage                              |
|---------------------------|---------------------------|------------------------------------|
| `--sl-text-primary`       | `#1A1612`                 | Headlines, primary readable text   |
| `--sl-text-secondary`     | `rgba(26,22,18,0.75)`     | Taglines, supporting copy          |
| `--sl-text-muted`         | `rgba(26,22,18,0.5)`      | Descriptions, captions             |
| `--sl-text-ghost`         | `rgba(26,22,18,0.3)`      | Labels, metadata, de-emphasised    |
| `--sl-text-on-teal`       | `#EDE8DB`                 | Text placed directly on teal CTAs  |

### Accent colors
| Token                     | Value       | Usage                                                  |
|---------------------------|-------------|--------------------------------------------------------|
| `--sl-teal`               | `#009E85`   | Primary accent: CTAs, active states, ADA feature color |
| `--sl-teal-glow`          | `rgba(0,158,133,0.22)` | CTA hover glow shadow                   |
| `--sl-orange`             | `#C85A1A`   | Secondary accent: 3D/immersive feature color           |
| `--sl-live`               | `#009E85`   | Live status indicator (matches teal)                   |

### ADA score colors (semantic)
Used for grade badges and score circles on polaroid cards. Light-mode values:

| Range   | Value       | Meaning     |
|---------|-------------|-------------|
| ≥ 90    | `#00A870`   | Excellent   |
| 75–89   | `#D4820A`   | Moderate    |
| < 75    | `#C0392B`   | Poor        |

### Borders & overlays
| Token                     | Value                    | Usage                              |
|---------------------------|---------------------------|------------------------------------|
| `--sl-border-subtle`      | `rgba(26,22,18,0.1)`      | Card borders on cream bg           |
| `--sl-separator`          | `rgba(26,22,18,0.14)`     | Horizontal/vertical dividers       |

### Shadows
All shadows use `rgba(26,22,18,…)` — warm dark ink tones, not neutral gray.

```
Polaroid shadow:  0 14px 52px rgba(26,22,18,0.22), 0 4px 12px rgba(26,22,18,0.14)
Panel shadow:     0 8px 40px rgba(26,22,18,0.13), 0 2px 12px rgba(26,22,18,0.07)
```

---

## 3. Typography

Three typefaces form the system. Never introduce a fourth without a compelling reason.

### Display — Cormorant Garamond
Used for: page titles, section headings, large numerals, pull quotes, location names.

```tsx
// Loaded in app/layout.tsx
import { Cormorant_Garamond } from "next/font/google";
const cormorant = Cormorant_Garamond({ weight: ["300", "400", "600"], subsets: ["latin"], variable: "--font-cormorant" });
```

- **Weight 300** — primary display weight. Thin and elegant.
- **Weight 300 italic** — for expressive emphasis (e.g., the italic "line" in "Straight*line*"). Italics are expressive, not decorative.
- **Weight 600** — for small display numerals or short labels in the Cormorant face.
- Letter-spacing: `-0.02em` to `-0.03em` (tighten it; Cormorant looks best compressed).
- Line-height: `0.85–0.9` for hero sizes. Breathe less.
- Color: `#1A1612` (primary dark ink). The italic accent may use `#009E85` (teal).

### Body — Geist Sans
Used for: all body copy, descriptions, UI prose.

```tsx
// CSS variable: var(--font-geist-sans)
```

- Weights: 400 (body), 700 (bold labels).
- Font-size: `0.78rem–1.1rem` depending on hierarchy.
- Line-height: `1.55–1.72` for readability.
- Color: `rgba(26,22,18,0.5)` for descriptions, `rgba(26,22,18,0.75)` for taglines.

### Monospace — Geist Mono
Used for: eyebrow labels, status indicators, data readouts, metadata, captions on cards, score labels, all-caps UI tags, CTA buttons.

```tsx
// CSS variable: var(--font-geist-mono)
```

- Almost always set in `textTransform: "uppercase"`.
- Letter-spacing: `0.08em–0.22em` (wide tracking emphasises the mechanical, data-driven quality).
- Font-size: `0.46rem–0.72rem`. Mono text is decorative infrastructure — small is intentional.
- Eyebrow color: `#009E85` (teal). Label/caption color: `rgba(26,22,18,0.3)` or `#1A1612`.

### Type scale reference

| Role              | Font          | Size (rem)              | Weight | Letter-spacing | Transform    | Color                    |
|-------------------|---------------|-------------------------|--------|----------------|--------------|--------------------------|
| Hero title        | Cormorant     | clamp(4.8, 8.2vw, 9.2) | 300    | -0.02em        | —            | `#1A1612`                |
| Hero title accent | Cormorant     | inherited               | 300    | -0.03em        | italic       | `#009E85`                |
| Section heading   | Cormorant     | 2.5–4rem                | 300    | -0.02em        | —            | `#1A1612`                |
| Stat numeral      | Cormorant     | 1.05–1.4rem             | 600    | 0              | —            | `#1A1612`                |
| Tagline           | Geist Sans    | 1.1                     | 400    | 0              | —            | `rgba(26,22,18,0.75)`    |
| Body              | Geist Sans    | 0.82–0.9                | 400    | 0              | —            | `rgba(26,22,18,0.5)`     |
| Eyebrow           | Geist Mono    | 0.62                    | 400    | 0.22em         | uppercase    | `#009E85`                |
| Feature label     | Geist Mono    | 0.60                    | 400    | 0.16em         | uppercase    | accent color             |
| CTA button        | Geist Mono    | 0.68–0.80               | 700    | 0.14em         | uppercase    | `#EDE8DB` (on teal bg)   |
| Card label        | Geist Mono    | 0.55                    | 400    | 0.09em         | uppercase    | `#1E1812`                |
| Card sub-label    | Geist Mono    | 0.46                    | 400    | 0.06em         | uppercase    | `rgba(30,24,18,0.45)`    |
| Status/eyebrow    | Geist Mono    | 0.55–0.62               | 400    | 0.12–0.22em    | uppercase    | `#009E85`                |

---

## 4. Layout

### Page structure
Pages use a flex row split: **content column (left) + interactive/visual column (right)**. This is the primary pattern established on the homepage.

```
[ LEFT: ~43% wide | content, vertically centered, padding: 0 44px 0 72px ]
[ RIGHT: flex-1   | immersive visuals, overflow hidden                    ]
```

Where a page doesn't need a two-column layout (e.g., a full-screen map), the overall surface still uses the same warm cream background and surface effects.

### Spacing
- **Left column inner padding:** `padding: 0 44px 0 72px` — keeps content clearly left-of-center without hugging the edge.
- **Section gaps:** `2.25–2.5rem` between major left-column blocks (title → tagline → features → CTAs).
- **Component gaps:** `0.65rem` between list items / feature cards.
- **Top chrome (status bar):** `position: absolute; top: 28px; left: 72px` — always pinned to match the column's left inset.
- **Bottom chrome (stat row):** `position: absolute; bottom: 28px; left: 72px`.

### Grid discipline
The app does not use a CSS grid. Layouts are flex-based. This keeps the spatial logic explicit and easy to reason about when the right column is highly dynamic (RAF-driven, 3D, etc.).

---

## 5. Surface Effects

Every page surface should include the following layers:

### 1. Film grain
Adds organic texture, counters the sterility of pure flat color. Implemented via SVG `feTurbulence` filter:

```tsx
<svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
    <feColorMatrix type="saturate" values="0" />
  </filter>
</svg>
<div aria-hidden="true" style={{ position: "absolute", inset: 0, filter: "url(#grain)", opacity: 0.045, pointerEvents: "none", zIndex: 50, background: "black" }} />
```

Opacity: `0.045`. Don't go above `0.06` or it starts to distract.

### 2. Ambient radial gradients
Two or three soft elliptical gradients create depth and warmth without being garish:

```tsx
background: [
  "radial-gradient(ellipse 55% 70% at 22% 42%, rgba(0,158,133,0.07) 0%, transparent 60%)",
  "radial-gradient(ellipse 45% 55% at 78% 68%, rgba(200,90,26,0.05) 0%, transparent 55%)",
  "radial-gradient(ellipse 30% 40% at 55% 12%, rgba(0,130,180,0.04) 0%, transparent 50%)",
].join(", ")
```

Keep individual gradient opacities between `0.04–0.07`. The effect should be subliminal — visible on close inspection, not on first glance.

### 3. Dot-grid texture (right / visual column)
The interactive right column uses `BGPattern` (`components/ui/bg-pattern.tsx`) to add a barely-there dot grid. It provides spatial depth without competing with the content.

```tsx
import { BGPattern } from "@/components/ui/bg-pattern";

<BGPattern
  variant="dots"
  mask="none"
  size={28}
  fill="rgba(26,22,18,0.09)"
/>
```

Rules:
- `variant`: always `"dots"` for the right column.
- `fill`: low-opacity dark warm ink (`rgba(26,22,18,0.09)`). Don't exceed `0.12`.
- `size`: 28px.
- `z-index`: the component self-assigns `z-[-10]`.

### 4. Edge fades
When content scrolls or moves within a bounded container (e.g., falling cards, scroll areas), fade the top and bottom edges using the page background color:

```tsx
// Top
background: "linear-gradient(to bottom, #EDE8DB 0%, rgba(237,232,219,0.55) 65%, transparent 100%)"
// Bottom
background: "linear-gradient(to top, #EDE8DB 0%, rgba(237,232,219,0.55) 65%, transparent 100%)"
```

Height: `80px`.

---

## 6. Component Patterns

### Feature callout card
Used to highlight a key capability. Two-column internal layout: accent bar + content.

```tsx
<div style={{
  display: "flex", gap: "0.9rem", alignItems: "flex-start",
  padding: "0.9rem 1.1rem", borderRadius: "6px",
  border: "1px solid rgba(26,22,18,0.1)",
  background: "rgba(26,22,18,0.04)",
}}>
  {/* Left accent bar */}
  <div style={{ width: 2, minHeight: 36, alignSelf: "stretch", borderRadius: 2, background: accentColor, flexShrink: 0 }} />
  <div>
    <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.6rem", letterSpacing: "0.16em", color: accentColor, textTransform: "uppercase", marginBottom: "0.28rem" }}>
      ◎  Feature Label
    </p>
    <p style={{ fontFamily: "var(--font-geist-sans)", fontSize: "0.78rem", color: "rgba(26,22,18,0.5)", lineHeight: 1.58 }}>
      Short description of the feature.
    </p>
  </div>
</div>
```

Rules:
- ADA Intelligence always uses `--sl-teal` (`#009E85`) as its accent.
- Immersive 3D always uses `--sl-orange` (`#C85A1A`) as its accent.
- Use `◎` for data/analysis features, `◈` for spatial/3D features.

### Polaroid / location frame card
Represents a real-world location that has been scanned. Warm parchment background, image fill, monospace caption on a matching warm strip, colored score badge.

```
bg (entire card): #F0E9D6          ← warm parchment; caption strip inherits this
borderRadius: 2px
boxShadow: 0 14px 52px rgba(26,22,18,0.22), 0 4px 12px rgba(26,22,18,0.14)
Image: saturate(0.85) contrast(1.06) + radial vignette overlay (rgba 0,0,0,0.22)
Caption strip: inherits card bg (#F0E9D6), dark text on warm ground
  - Location name: Geist Mono, 0.55rem, #1E1812, uppercase
  - Sub-label:     Geist Mono, 0.46rem, rgba(30,24,18,0.45), uppercase
  - Score badge:   30×30 circle, fill per ADA scale, text #F0E9D6
```

The caption strip is intentionally the **same warm parchment** as the card body — the polaroid reads as one unified paper object. Do not use dark or neutral-gray backgrounds for the caption strip.

Score badge fill follows the ADA score semantic color scale:

| Range | Value     | Meaning   |
|-------|-----------|-----------|
| ≥ 90  | `#00A870` | Excellent |
| 75–89 | `#D4820A` | Moderate  |
| < 75  | `#C0392B` | Poor      |

### Primary CTA button
```tsx
style={{
  background: "#009E85", color: "#EDE8DB",
  fontFamily: "var(--font-geist-mono)", fontSize: "0.68rem",
  fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
  padding: "0.72rem 1.4rem", borderRadius: "3px",
  transition: "transform 0.18s ease, box-shadow 0.18s ease",
}}
// hover: translateY(-2px) + box-shadow: 0 8px 28px rgba(0,158,133,0.22)
```

### Status / live indicator
Monospace eyebrow text with a pulsing dot. Positioned in the top-left corner of a content column.

```tsx
<span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#009E85", animation: "pulse-dot 2.4s ease-in-out infinite" }} />

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.45; transform: scale(0.7); }
}
```

### Separator line
Thin 1px vertical or horizontal divider using a gradient so it fades at the edges:

```tsx
// Vertical
background: "linear-gradient(to bottom, transparent, rgba(26,22,18,0.14) 30%, rgba(26,22,18,0.14) 70%, transparent)"
// Horizontal
background: "linear-gradient(to right, transparent, rgba(26,22,18,0.14) 20%, rgba(26,22,18,0.14) 80%, transparent)"
```

---

## 7. Motion & Animation

### Entrance animations (Framer Motion)
Content enters on page load with staggered `opacity 0 → 1` + `y 14–28px → 0`. Use the `[0.16, 1, 0.3, 1]` easing curve (spring-like, settles quickly) for primary elements; use `ease` for supporting text.

```tsx
// Stagger reference (delay increases down the hierarchy):
// Eyebrow:        delay 0.15s
// Title:          delay 0.25s, ease [0.16, 1, 0.3, 1]
// Tagline:        delay 0.42s
// Description:    delay 0.52s
// Feature cards:  delay 0.62s
// CTAs:           delay 0.76s
// Bottom chrome:  delay 1.1s, opacity only
```

**Rule:** never animate an element that is `aria-hidden="true"` or decorative. Animate content, not chrome.

### Continuous animations (requestAnimationFrame)
For elements that animate indefinitely (falling cards, scroll parallax, live data updates), use a raw RAF loop with direct DOM mutation — **not** React state or Framer Motion. Re-rendering 60 times per second is unacceptable.

```tsx
const rafId = useRef<number>(0);
const loop = () => {
  // mutate el.style.transform directly
  rafId.current = requestAnimationFrame(loop);
};
rafId.current = requestAnimationFrame(loop);
return () => cancelAnimationFrame(rafId.current);
```

### Falling card stagger (specific rule)
Card `startY` must be computed dynamically in `useEffect` based on `window.innerHeight` — never hard-coded in config:

```tsx
yPos.current = CARD_CONFIGS.map((cfg, i) =>
  -cfg.h + (i / N) * (vh + cfg.h)
);
```

### Mouse parallax
Normalize mouse position to `[-1, 1]` across each axis, then apply per-element `rotateX`/`rotateY`:

```tsx
mouse.x = (e.clientX / window.innerWidth  - 0.5) * 2;
mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
const rx = mouse.y * depth;
const ry = -mouse.x * depth;
el.style.transform = `... perspective(720px) rotateX(${rx}deg) rotateY(${ry}deg)`;
```

Depth values: 6–12 degrees. `perspective(720px)` goes in the `transform` string so each element has its own projection center.

### Micro-interactions
- Hover on buttons: `transform 0.18s ease` for translate, `box-shadow 0.18s ease` for glow.
- Use `onMouseEnter`/`onMouseLeave` with direct style mutation for interactive elements in RAF-driven contexts.

---

## 8. Accessibility Requirements

The app itself must meet WCAG AA standards:

- **All interactive elements** must have clear focus rings (`outline-ring/50` Tailwind base applies this; do not suppress it).
- **Decorative elements** (grain overlay, ambient gradients, falling cards) must have `aria-hidden="true"`.
- **All images** must have meaningful `alt` text. Location frame images use the location name.
- **Color alone** must not convey information. ADA score badges use both color and a numeric value.
- **Motion:** Respect `prefers-reduced-motion` for new continuous animations:
  ```tsx
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  ```
- **Keyboard navigation:** All links and buttons are native `<a>` or `<button>` elements.

---

## 9. Page-level Template

When building a new page, start from this shell:

```tsx
"use client"; // only if interactivity is required

import { motion } from "framer-motion";

export default function PageName() {
  return (
    <main aria-label="Page description" style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#EDE8DB", position: "relative" }}>

      {/* 1. Grain overlay */}
      <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, filter: "url(#grain)", opacity: 0.045, pointerEvents: "none", zIndex: 50, background: "black" }} />

      {/* 2. Ambient gradients */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: [
        "radial-gradient(ellipse 55% 70% at 22% 42%, rgba(0,158,133,0.07) 0%, transparent 60%)",
        "radial-gradient(ellipse 45% 55% at 78% 68%, rgba(200,90,26,0.05) 0%, transparent 55%)",
      ].join(", ") }} />

      {/* Left content column */}
      <section aria-label="..." style={{ width: "43%", flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 44px 0 72px", position: "relative", zIndex: 10 }}>
        {/* Eyebrow (Geist Mono, teal, uppercase) */}
        {/* Heading (Cormorant, weight 300, #1A1612) */}
        {/* Body copy (Geist Sans, rgba(26,22,18,0.5)) */}
        {/* Feature callout cards */}
        {/* CTA button (teal bg, cream text, Geist Mono) */}
      </section>

      {/* Right visual column */}
      <div aria-hidden="true" style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* BGPattern dots */}
        {/* Interactive/visual content */}
        {/* Top + bottom edge fades (cream → transparent) */}
      </div>

    </main>
  );
}
```

---

## 10. What to Avoid

| Don't                                          | Do instead                                              |
|------------------------------------------------|---------------------------------------------------------|
| Dark `#07080F` background                      | Warm cream `#EDE8DB` background                         |
| White or near-white backgrounds                | Warm off-white cream `#EDE8DB`                          |
| Purple gradients or blue-white schemes         | Warm cream bg with teal/orange accent gradients         |
| Neon teal `#5CFFE6` or neon orange             | Muted earthy teal `#009E85` and orange `#C85A1A`        |
| White text on light background                 | Dark ink `#1A1612` on cream                             |
| Inter, Roboto, system-ui                       | Cormorant (display) + Geist Sans (body) + Geist Mono (UI) |
| Rounded pill buttons                           | Sharp-cornered buttons (`borderRadius: 3px`)            |
| React state for continuous animation           | RAF loop with direct DOM mutation                       |
| Hard-coded hex colors in components            | Reference the palette values from this doc              |
| Decorative animations on accessible content    | `aria-hidden="true"` on all decorative motion           |
| Adding a fourth font                           | Work within the three-font system                       |
| Symmetric, centered layouts                    | Left-weighted content, right-side visual tension        |
