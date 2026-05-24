# Disney Mayhem 🎆

A shared Disney trip planner, live park companion, and magical notification layer built for a family trip.

This project started as a simple itinerary tool and evolved into a full experience — one that begins before the trip and continues through every park day.

---

## ✨ What it does

### 🗓️ Trip Planning
- Day-by-day itinerary builder
- Land-based grouping (rides, reservations, travel)
- Add, edit, reorder, and manage activities
- Shared syncing via Supabase

### 📱 Park Day Companion
- “Today” view with Now / Next / Later structure
- Park activity insights powered by live wait data
- Completion tracking and status indicators

### 🔔 Notifications
- Scheduled morning and goodnight messages
- Context-aware messaging (pre-trip → park days → return)
- Disney / Pixar / Star Wars inspired tone
- Native iOS-style notification experience

### 🎆 Delight
- Hidden fireworks easter egg (tap the wordmark 👀)
- Subtle, intentional moments designed to feel like Disney

---

## 🛠️ Tech Stack

- React + Vite
- TypeScript
- Supabase (database + edge functions)
- Web Push (VAPID)
- GitHub Pages (deployment)

---

## 🚀 Running locally

```bash
npm install
npm run dev
```

## 🔧 Environment Setup
Create a .env file:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VAPID_PUBLIC_KEY=
VITE_TRIP_ID=
```

## 🔔 Push Notifications Setup

This project uses:
- Supabase Edge Functions
- Web Push (VAPID keys)
- Scheduled jobs via `pg_cron`

To enable notifications:

1. Generate your own VAPID keys  
2. Add them to Supabase secrets  
3. Deploy the Edge Function  
4. Configure scheduled jobs  

## ⚠️ Notes for Forking

If you fork this project:
- You must use your own Supabase project
- You must generate your own VAPID keys
- Update environment variables accordingly
- Scheduled notifications will not work without setup
This project is designed to be adaptable to any trip or event.

## 🧭 Versioning

- v1.0.0 — Core planner + notifications
- v1.0.1 — Fireworks easter egg
- v1.0.2 — Stability and consistency fixes

## 💬 Why this exists

This wasn’t built to be a generic planner.
It was built to make the trip feel like it started before arrival — and to add small moments of magic along the way.
