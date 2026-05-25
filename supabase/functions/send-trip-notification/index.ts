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
  body: string;
};

type NotificationPayloadMessage = {
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
        body: `The castle will still be there in the morning. ${days} to go.`,
      },
      {
        body: "Sleep now. Never grow up… but definitely rest.",
      },
      {
        body: "Even Jedi need sleep.",
      },
      {
        body: "Dream of fireworks. You’ll see them soon.",
      },
      {
        body: "Rest up. The magic takes energy.",
      },
      {
        body: "Tomorrow gets you closer to the second star.",
      },
    ];
  }

  return [
    {
      body: `Adventure is out there… and it’s getting closer. ${days} to go.`,
    },
    {
      body: `Second star to the right… soon. ${days} to go.`,
    },
    {
      body: "The magic is calling. You’re almost there.",
    },
    {
      body: `To infinity… and Disney. ${days} to go.`,
    },
    {
      body: "Just keep swimming. The countdown is almost done.",
    },
    {
      body: "Ohana vibes are loading. No one gets left behind.",
    },
    {
      body: `The castle is waiting. ${days} to go.`,
    },
  ];
}

function getDepartureDayMessages(kind: NotificationKind): NotificationMessage[] {
  if (kind === "night") {
    return [
      {
        body: "Travel day is done. Tomorrow, the magic gets louder.",
      },
      {
        body: "You made it here. Sleep like royalty.",
      },
      {
        body: "First chapter complete. Big magic tomorrow.",
      },
      {
        body: "Rest up. The parks are waiting.",
      },
    ];
  }

  return [
    {
      body: "Today’s the day. Your carriage awaits.",
    },
    {
      body: "Adventure is out there… and today, so are you.",
    },
    {
      body: "Wheels up. Snacks packed. Magic activated.",
    },
    {
      body: "Punch it. The story starts now.",
    },
  ];
}

function getTripMorningMessages(dayTitle: string): NotificationMessage[] {
  if (dayTitle === "Magic Kingdom") {
    return [
      {
        body: "All it takes is faith, trust, and a little pixie dust.",
      },
      {
        body: "The castle is waiting. Try not to run.",
      },
      {
        body: "Think of the happiest things. You’re already there.",
      },
      {
        body: "Today is for pirates, pixie dust, and fireworks.",
      },
      {
        body: "Main Street is calling. Answer dramatically.",
      },
      {
        body: "Never grow up. Especially today.",
      },
    ];
  }

  if (dayTitle === "Animal Kingdom") {
    return [
      {
        body: "The circle of life starts early.",
      },
      {
        body: "Pandora is calling. Don’t rush it.",
      },
      {
        body: "Look closer. There’s more to see today.",
      },
      {
        body: "The wild is waiting. Eyes up.",
      },
      {
        body: "Today is for banshees, safaris, and slowing down.",
      },
    ];
  }

  if (dayTitle === "Hollywood Studios") {
    return [
      {
        body: "A long time ago… in a park not so far away.",
      },
      {
        body: "The Force will be with you. Always.",
      },
      {
        body: "To infinity… and beyond.",
      },
      {
        body: "You are not watching today. You are in it.",
      },
      {
        body: "Rise, toys, stars, stories. Big day.",
      },
      {
        body: "This is where the adventure gets cinematic.",
      },
    ];
  }

  if (dayTitle === "Chill Day / EPCOT") {
    return [
      {
        body: "Hakuna Matata. It means no worries… for today.",
      },
      {
        body: "Take it slow. The magic is not going anywhere.",
      },
      {
        body: "No plan. Just vibes and maybe snacks.",
      },
      {
        body: "Today is softer. Let it be.",
      },
      {
        body: "Even magic needs a rest day.",
      },
    ];
  }

  if (dayTitle === "Travel Home") {
    return [
      {
        body: "So long, partner.",
      },
      {
        body: "Pack the memories. They’re coming with you.",
      },
      {
        body: "The adventure does not end here.",
      },
      {
        body: "One last look. The magic is still there.",
      },
      {
        body: "Home is part of the story too.",
      },
    ];
  }

  return [
    {
      body: `${dayTitle} today. Follow the plan, leave room for magic.`,
    },
  ];
}

function getTripNightMessages(dayTitle: string): NotificationMessage[] {
  if (dayTitle === "Magic Kingdom") {
    return [
      {
        body: "The fireworks did what fireworks do.",
      },
      {
        body: "Happily ever after can be one day at a time.",
      },
      {
        body: "The castle glowed. You felt it.",
      },
      {
        body: "Pirates, pixie dust, and tired feet. That counts as magic.",
      },
      {
        body: "You didn’t grow up today. Good choice.",
      },
    ];
  }

  if (dayTitle === "Animal Kingdom") {
    return [
      {
        body: "Remember who you are.",
      },
      {
        body: "The wild settled down. You should too.",
      },
      {
        body: "Pandora glowed. You noticed.",
      },
      {
        body: "Safari complete. Feet officially retired.",
      },
      {
        body: "That park leaves a mark. You felt it.",
      },
    ];
  }

  if (dayTitle === "Hollywood Studios") {
    return [
      {
        body: "The story ended. The feeling didn’t.",
      },
      {
        body: "The Force was with you. Your feet, less so.",
      },
      {
        body: "Roll credits. You earned it.",
      },
      {
        body: "Toys, rebels, and big feelings. That was a day.",
      },
      {
        body: "You lived the scene. That counts.",
      },
    ];
  }

  if (dayTitle === "Chill Day / EPCOT") {
    return [
      {
        body: "No worries today. None tomorrow either.",
      },
      {
        body: "Even quiet days become part of the story.",
      },
      {
        body: "You slowed down. That mattered.",
      },
      {
        body: "Rest easy. The magic is still there.",
      },
      {
        body: "Today did not need to be loud to be good.",
      },
    ];
  }

  if (dayTitle === "Travel Home") {
    return [
      {
        body: "You left the park. The magic did not leave you.",
      },
      {
        body: "You’ve got a friend in me, even back home.",
      },
      {
        body: "The story continues.",
      },
      {
        body: "Every good adventure echoes.",
      },
      {
        body: "You made the memories. Now they get to stay.",
      },
    ];
  }

  return [
    {
      body: "Even mayhem needs a bedtime. Dream big.",
    },
  ];
}

function getMessage(kind: NotificationKind, date = getEasternDateString()) {
  if (kind === "test") {
    return {
      message: {
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

function getNotificationPayloadMessage(
  kind: NotificationKind,
  message: NotificationMessage,
): NotificationPayloadMessage {
  const body = message.body.trim();

  return {
    title: kind === "test" ? "Disney Mayhem test" : kind === "morning" ? "Good Morning!" : "Good Night!",
    body,
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

    const message = getNotificationPayloadMessage(kind, notification.message);

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
    const payloadTitle = message.title;
    const payloadBody = message.body;

    const payload = JSON.stringify({
      title: payloadTitle,
      body: payloadBody,
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
