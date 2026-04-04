@AGENTS.md

# Straightline

**Goal:** Enable people with disabilities to explore locations asynchronously in a 3D map — helping them determine how to navigate a space, understand accessibility accommodations, and plan their visit before arriving.

## Core User Flow

1. User selects a location on a map
2. AI agent (via browseruse + Claude/Gemini) scores the location's accessibility:
   - Scrapes reviews, ADA/HIPAA compliance records, photos, elevator info, weather
   - Applies gathered text/rules to image analysis (browseruse outputs text; images must be handled separately)
3. Depending on whether 3D mapping exists for the location:

### Path A — No mapping yet (user contributes)
- User records and uploads a walkthrough video
- Video is processed server-side using **COLMAP** on **Vultr GPU instances** to generate a point cloud
- User navigates the point cloud and manually labels features: ramps, doors, elevators, restrooms, etc.

### Path B — Mapping exists
- User navigates the 3D space interactively
- Mesh extraction is used to compute: ramp gradients, door widths, nearest ramp to each entrance, etc.
- Automatic labeling is aspirational; assume **manual labeling** as the primary approach

### Caching
- All computed data for a location is persisted in a cache — scores, point clouds, labels, mesh metrics — so work is never repeated for the same location

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI agents | browseruse (web scraping agent), Claude API, Gemini API |
| 3D processing | COLMAP (photogrammetry → point cloud) |
| GPU compute | Vultr |
| 3D rendering | TBD — likely Three.js / react-three-fiber or Potree for point clouds |

## Architecture Notes

- **AI accessibility scoring** is a background job, not a synchronous request. Treat it as an async pipeline with status polling.
- **Video → point cloud** pipeline runs on Vultr; the app orchestrates job submission and result retrieval, it does not do GPU work locally.
- **Point cloud viewer** must be performant enough for large `.ply`/`.las` files in the browser; consider streaming or LOD rendering.
- **Manual labeling UI** is a first-class feature, not an afterthought — it needs to feel precise and low-friction for users in the field.
- **Cache layer** should be location-keyed and invalidatable; store scores, point cloud refs, labels, mesh metrics, and raw media references.

## Key Domain Concepts

- **Accessibility score** — composite metric derived from ADA compliance data, user reviews, physical measurements (ramp grade, door width), and photos
- **Point cloud** — 3D representation of a space generated from video via COLMAP; stored as `.ply` or similar
- **Mesh extraction** — deriving navigable surfaces from a point cloud to measure gradients and clearances
- **Feature labels** — user-applied tags on point cloud nodes: `ramp`, `elevator`, `accessible_entrance`, `restroom`, `door`, etc.

## Development Guidelines

- Read `node_modules/next/dist/docs/` before writing any Next.js code — this version has breaking changes
- Long-running jobs (AI scoring, COLMAP processing) must be handled asynchronously with visible progress feedback
- Never block the UI on GPU or scraping jobs
- Accessibility of the app itself is non-negotiable — use semantic HTML, ARIA labels, keyboard navigation, and sufficient color contrast throughout
- Images from scraping must go through image analysis separately from the text pipeline
- Keep location data normalized: one canonical record per location, with separate tables/collections for scores, point clouds, and labels
