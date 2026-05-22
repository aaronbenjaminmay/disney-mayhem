# Disney Mayhem — Codex Rules

Disney Mayhem is a private family trip dashboard for a Disney World vacation.

Do not overbuild. Prioritize clarity, speed, mobile usability, reliability, and edit safety.

## Product Goal

Disney Mayhem should answer one question at any moment:

"What do we need to know right now?"

## Build Approach

- React + TypeScript + Vite
- Static site on GitHub Pages
- Base itinerary in `src/data/tripData.ts`
- User edits in Supabase `trip_edits`
- `localStorage` as fallback/cache only
- Mobile-first

## Persistence Safety

- Supabase edits override base itinerary data.
- Never clear Supabase or `localStorage` unless explicitly requested.
- Never add automatic reset or migration behavior unless explicitly requested.
- Preserve stable IDs for itinerary items, rides/activities, and reservations.
- Unknown old edit IDs should warn in the console, not crash the app.

## Itinerary Rules

- Timeline order is the source of truth.
- Land cards render inline inside their parent timeline block.
- Land cards must never be appended to the bottom of a day page.
- A scheduled block may still contain flexible land activities.
- Rides/attractions belong inside land cards.
- Reservations belong on both Reservations and the correct day timeline.
- Notes belong directly on itinerary items, rides, and reservations.
- There is no global Notes page.

## Deployment

- GitHub Pages uses Vite `BASE_URL`.
- Public assets should use `import.meta.env.BASE_URL` when a root-relative path would fail under `/disney-mayhem/`.
- Production requires GitHub Actions variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_TRIP_ID`

## Naming

The app name is Disney Mayhem.
