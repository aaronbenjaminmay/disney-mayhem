# Disney Mayhem Product Rules

## Primary Use

Disney Mayhem is a real-time family travel planner for Disney World.

It should answer:

"What do we need to know right now?"

The app must stay:

- fast
- scannable
- calm
- mobile-first

## Core Screens

- Pre-trip dashboard with countdown
- Today
- All Days
- Day timeline
- Reservations
- Attention Needed

There is no global Notes page. Notes belong directly on itinerary items, rides, and reservations.

## Today

Today must prioritize:

- NOW
- NEXT
- LATER

Do not show a full day timeline on Today. Link to the full day instead.

## Reservations

Reservations must appear in both:

- Reservations page
- the correct day timeline

Adding, editing, or deleting a reservation must use the shared edit system so it syncs through Supabase and falls back to localStorage.

## Today Intel

Today Intel should be compact and honest.

- Weather can be fetched automatically.
- Park Activity must be based on live wait-time data, not guessed crowd size.
- Pre-trip and non-park days should show `—`.
- API failures should show `Connection error` or `Unavailable`.
- Ride counts must come from the selected/current trip day only.
- Never pull ride counts from next, upcoming, or fallback timeline logic.
