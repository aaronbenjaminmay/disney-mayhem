import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type PushSubscriptionRow = {
  id: string;
  trip_id: string;
  endpoint: string;
  subscription: unknown;
  enabled: boolean;
};

type NotificationKind = "morning" | "night" | "test";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type NotificationMessage = {
  title: string;
  body: string;
};

const departureDate = "2026-05-29";
const tripEndDate = "2026-06-05";

const tripDayTitles: Record<string, string> = {
  "2026-05-29": "Travel / EPCOT",
  "2026-05-30": "Magic Kingdom",
  "2026-05-31": "Animal Kingdom",
  "2026-06-01": "Chill Day / EPCOT",
  "2026-06-02": "Hollywood Studios",
  "2026-06-03": "Animal Kingdom",
  "2026-06-04": "Magic Kingdom",
  "2026-06-05": "Travel Home",
};

function getEasternDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function dateToUtcNoon(date: string): number {
  return new Date(`${date}T12:00:00Z`).getTime();
}

function daysBetween(start: string, end: string): number {
  const millisecondsInDay = 86_400_000;
  return Math.round((dateToUtcNoon(end) - dateToUtcNoon(start)) / millisecondsInDay);
}

function hashText(text: string): number {
  return [...text].reduce((hash, character) => {
    return (hash * 31 + character.charCodeAt(0)) >>> 0;
  }, 7);
}

function pickMessage(date: string, kind: NotificationKind, messages: NotificationMessage[]): NotificationMessage {
  return messages[hashText(`${date}:${kind}`) % messages.length];
}

function pluralizeDays(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function getPretripMessages(kind: NotificationKind, daysToGo: number): NotificationMessage[] {
  const days = pluralizeDays(daysToGo);

  if (kind === "night") {
    return [
      {
        title: "Countdown cozy mode",
        body: `Rest up. The countdown gets smaller tomorrow: ${days} to go.`,
      },
      {
        title: "Sleep now, mayhem later",
        body: `${days} until Disney Mayhem. The adventure can wait one more night.`,
      },
      {
        title: "Dream team recharge",
        body: `Lights out for now. ${days} until the snacks, smiles, and spectacular logistics begin.`,
      },
    ];
  }

  return [
    {
      title: "Disney Mayhem countdown",
      body: `Only ${days} until Disney Mayhem. Adventure is warming up.`,
    },
    {
      title: "Snack strategy day",
      body: `${days} to go — snack strategy is absolutely part of the plan.`,
    },
    {
      title: "Magic loading",
      body: `${days} until departure. Shoes, chargers, and patience are entering final form.`,
    },
  ];
}

function getDepartureDayMessages(kind: NotificationKind): NotificationMessage[] {
  if (kind === "night") {
    return [
      {
        title: "Departure day complete",
        body: "Wheels rolled, snacks handled, mayhem officially underway. Sleep well.",
      },
      {
        title: "First day in the books",
        body: "Travel / EPCOT day is wrapped. Feet tired, hearts full.",
      },
    ];
  }

  return [
    {
      title: "Today is the day",
      body: "Wheels up, snacks packed, mayhem activated.",
    },
    {
      title: "Departure day energy",
      body: "Travel / EPCOT is calling. Hydrate early and trust the snack bag.",
    },
  ];
}

function getTripMorningMessages(dayTitle: string): NotificationMessage[] {
  if (dayTitle === "Magic Kingdom") {
    return [
      {
        title: "Good morning",
        body: "Magic Kingdom is calling. Comfortable shoes are highly encouraged.",
      },
      {
        title: "Castle day",
        body: "Magic Kingdom today. Big smiles, brave feet, snack diplomacy.",
      },
    ];
  }

  if (dayTitle === "Animal Kingdom") {
    return [
      {
        title: "Animal Kingdom day",
        body: "Hydrate, roam, repeat. The wild side has a schedule.",
      },
      {
        title: "Roaming mode",
        body: "Animal Kingdom today. Shade breaks are part of the adventure.",
      },
    ];
  }

  if (dayTitle === "Hollywood Studios") {
    return [
      {
        title: "Hollywood Studios today",
        body: "Main character energy required. Backup snacks also recommended.",
      },
      {
        title: "Studio day",
        body: "Hollywood Studios is up. Walk in like the soundtrack already started.",
      },
    ];
  }

  if (dayTitle === "Chill Day / EPCOT") {
    return [
      {
        title: "Chill day with sparkle",
        body: "EPCOT later, easy mode first. That still counts as planning.",
      },
      {
        title: "Slow roll morning",
        body: "Chill Day / EPCOT. The best itinerary has room to breathe.",
      },
    ];
  }

  if (dayTitle === "Travel Home") {
    return [
      {
        title: "Travel day",
        body: "One last round of mayhem. Home is part of the story too.",
      },
      {
        title: "Homeward sparkle",
        body: "Pack the memories, find the chargers, and roll gently toward home.",
      },
    ];
  }

  return [
    {
      title: "Good morning",
      body: `${dayTitle} today. Let the plan lead, but leave room for magic.`,
    },
  ];
}

function getTripNightMessages(dayTitle: string): NotificationMessage[] {
  if (dayTitle === "Magic Kingdom") {
    return [
      {
        title: "Magic Kingdom wrapped",
        body: "Feet tired, hearts full. That counts as a very good kind of magic.",
      },
      {
        title: "Castle lights out",
        body: "Magic Kingdom day is in the books. Tomorrow gets its own adventure.",
      },
    ];
  }

  if (dayTitle === "Animal Kingdom") {
    return [
      {
        title: "Animal Kingdom survived",
        body: "Rest like a legend. The wild miles have been earned.",
      },
      {
        title: "Wild day complete",
        body: "Animal Kingdom wrapped. Let the feet forgive everyone overnight.",
      },
    ];
  }

  if (dayTitle === "Hollywood Studios") {
    return [
      {
        title: "Hollywood Studios wrapped",
        body: "The credits can roll. Tomorrow gets its own adventure.",
      },
      {
        title: "Studio lights down",
        body: "Hollywood Studios is complete. Recharge like the sequel depends on it.",
      },
    ];
  }

  if (dayTitle === "Chill Day / EPCOT") {
    return [
      {
        title: "Chill day complete",
        body: "Easy mode still makes memories. Rest up for the next round.",
      },
      {
        title: "EPCOT evening saved",
        body: "A slower day is still a story. Sleep like tomorrow has plans.",
      },
    ];
  }

  if (dayTitle === "Travel Home") {
    return [
      {
        title: "Travel day done",
        body: "Home is part of the story too. Let the memories settle in.",
      },
      {
        title: "Mayhem landed",
        body: "Bags down, hearts full. The trip gets to become stories now.",
      },
    ];
  }

  return [
    {
      title: `${dayTitle} complete`,
      body: "Rest up. Today earned a quiet ending.",
    },
  ];
}

function getMessage(kind: NotificationKind, date = getEasternDateString()) {
  if (kind === "test") {
    return {
      message: {
        title: "Disney Mayhem test",
        body: "If this showed up, the magic pipeline works.",
      },
      skipped: false,
    };
  }

  if (date > tripEndDate) {
    return {
      message: undefined,
      skipped: true,
      reason: "outside_trip_window",
    };
  }

  if (date < departureDate) {
    const daysToGo = Math.max(daysBetween(date, departureDate), 1);
    return {
      message: pickMessage(date, kind, getPretripMessages(kind, daysToGo)),
      skipped: false,
    };
  }

  if (date === departureDate) {
    return {
      message: pickMessage(date, kind, getDepartureDayMessages(kind)),
      skipped: false,
    };
  }

  const dayTitle = tripDayTitles[date] ?? "Disney Mayhem";
  const messages = kind === "night"
    ? getTripNightMessages(dayTitle)
    : getTripMorningMessages(dayTitle);

  return {
    message: pickMessage(date, kind, messages),
    skipped: false,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const kind = (body.kind ?? "test") as NotificationKind;
    const notificationDate = typeof body.date === "string"
      ? body.date
      : undefined;
    const notification = getMessage(kind, notificationDate);

    if (notification.skipped) {
      return Response.json(
        {
          ok: true,
          kind,
          attempted: 0,
          sent: 0,
          failed: 0,
          skipped: true,
          reason: notification.reason,
          message: null,
        },
        { headers: corsHeaders }
      );
    }

    if (!notification.message) {
      return Response.json(
        {
          ok: false,
          error: "No notification message available",
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const APP_SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL")?.trim();
    const APP_SUPABASE_SERVICE_ROLE_KEY = Deno.env
      .get("APP_SUPABASE_SERVICE_ROLE_KEY")
      ?.trim();

    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
    const VAPID_SUBJECT =
      Deno.env.get("VAPID_SUBJECT")?.trim() ??
      "mailto:aaron.b.may@gmail.com";

    const TRIP_ID = Deno.env.get("TRIP_ID")?.trim() ?? "disney-mayhem-2026";

    if (
      !APP_SUPABASE_URL ||
      !APP_SUPABASE_SERVICE_ROLE_KEY ||
      !VAPID_PUBLIC_KEY ||
      !VAPID_PRIVATE_KEY
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Missing required environment variables",
        },
        { status: 500, headers: corsHeaders }
      );
    }

    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const message = notification.message;

    const supabase = createClient(
      APP_SUPABASE_URL,
      APP_SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("trip_id", TRIP_ID)
      .eq("enabled", true);

    if (error) {
      return Response.json(
        { ok: false, error: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    const subscriptions = (data ?? []) as PushSubscriptionRow[];

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: "https://aaronbenjaminmay.github.io/disney-mayhem/",
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (row) => {
        await webpush.sendNotification(row.subscription as any, payload);
        return row.id;
      })
    );

    const sent = results.filter(
      (result) => result.status === "fulfilled"
    ).length;

    const failed = results.filter(
      (result) => result.status === "rejected"
    ).length;

    return Response.json(
      {
        ok: true,
        kind,
        attempted: subscriptions.length,
        sent,
        failed,
        message,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: corsHeaders }
    );
  }
});
