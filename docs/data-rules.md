# Disney Mayhem Data Rules

## Source Itinerary

The real itinerary lives at:

`docs/source-itinerary.md`

Use it as the source of truth when creating or updating:

`src/data/tripData.ts`

Do not invent generic sample itinerary data.

## Trip Dates

- Start: Friday, May 29, 2026
- Departure time: 4:00 AM
- End: Thursday, June 4, 2026

Before departure, show the countdown dashboard. During the trip, default to the current trip day. After the trip, show the completed trip state.

## Persistence

- Base itinerary data lives in `src/data/tripData.ts`.
- User edits live in Supabase `trip_edits`.
- Supabase edits override base data at runtime.
- `localStorage` is fallback/cache only.
- Never clear Supabase or `localStorage` unless explicitly requested.
- Do not run reset or migration behavior unless explicitly requested.
- If an edit references an unknown old item ID, log a warning instead of crashing.

## Edit Merge Rules

Saved edits must continue to apply after deploys whenever IDs still match.

- Existing item IDs must remain stable.
- Ride/activity IDs must remain stable.
- Reservation IDs must remain stable.
- Added records must merge into the itinerary.
- Edited records must override base fields.
- Deleted/hidden records must stay hidden.
- Status records must still apply after deploy.
- New itinerary/data changes should be additive where possible.

## Itinerary Structure

- Timeline order is the source of truth.
- Land cards render inline inside their parent timeline block.
- Land cards must never be appended to the bottom of a day page.
- A block can be scheduled and still contain flexible land activities.

## Land Card Identity

- Land cards must use stable unique group IDs.
- Never key land cards by land name alone.
- Recommended `groupId`: `dayId + parentTimelineItemId + landName`.
- Edit/add/delete actions must target `groupId`, not display label.

## Classification

- Rides and attractions should live inside land cards.
- Reservations should appear on the Reservations page and the correct day timeline.
- Notes belong directly on itinerary items, rides, and reservations.
- There is no global Notes page.
