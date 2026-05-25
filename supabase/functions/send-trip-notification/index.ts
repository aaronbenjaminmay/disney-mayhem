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
        title: "Dream a little dream",
        body: `The castle will be there in the morning. ${days} to go.`,
      },
      {
        title: "Chosen ones need sleep",
        body: `Even chosen ones need sleep. ${days} until mayhem.`,
      },
      {
        title: "Close your eyes",
        body: `Close your eyes. Tomorrow gets you closer.`,
      },
      {
        title: "Never grow up",
        body: "Sleep now. The adventure gets closer in the morning.",
      },
    ];
  }

  return [
    {
      title: "Adventure is out there",
      body: `Adventure is out there… and it’s getting closer. ${days} to go.`,
    },
    {
      title: "You’ve got a friend",
      body: `You’ve got a friend in the plan. ${days} to Disney Mayhem.`,
    },
    {
      title: "The magic is calling",
      body: "You don’t have to answer yet… but you will.",
    },
    {
      title: "Second star soon",
      body: `Second star to the right… in ${days}.`,
    },
    {
      title: "To infinity",
      body: `To infinity… and Disney. ${days} to go.`,
    },
    {
      title: "Something incredible",
      body: "Somewhere, something incredible is waiting to be known.",
    },
    {
      title: "Almost there",
      body: `You’re almost there. Just keep swimming for ${days}.`,
    },
  ];
}

function getDepartureDayMessages(kind: NotificationKind): NotificationMessage[] {
  if (kind === "night") {
    return [
      {
        title: "First spell cast",
        body: "The first spell is cast. Dream big tonight.",
      },
      {
        title: "Travel / EPCOT wrapped",
        body: "Travel day is in the books. Rest up for the next chapter.",
      },
    ];
  }

  return [
    {
      title: "✨ The journey begins",
      body: "✨ The journey begins. Punch it.",
    },
  ];
}

function getTripMorningMessages(dayTitle: string): NotificationMessage[] {
  if (dayTitle === "Magic Kingdom") {
    return [
      {
        title: "Pixie dust protocol",
        body: "All it takes is faith, trust… and a little pixie dust.",
      },
      {
        title: "Welcome home",
        body: "The castle’s been waiting.",
      },
      {
        title: "Happiest things",
        body: "Think of the happiest things. You’re already there.",
      },
      {
        title: "Dreams department",
        body: "This is where dreams come true. No pressure.",
      },
    ];
  }

  if (dayTitle === "Animal Kingdom") {
    return [
      {
        title: "Circle starts early",
        body: "The great circle of life… starts early.",
      },
      {
        title: "Look closer",
        body: "There’s more to see today.",
      },
      {
        title: "Part of it",
        body: "You’re not just visiting. You’re part of it.",
      },
      {
        title: "Pandora is calling",
        body: "Don’t rush it.",
      },
    ];
  }

  if (dayTitle === "Hollywood Studios") {
    return [
      {
        title: "Not so far away",
        body: "A long time ago… in a park not so far away…",
      },
      {
        title: "The force is with you",
        body: "The force is with you today. Especially near the snacks.",
      },
      {
        title: "Part of the story",
        body: "Today you’re not watching. You’re in it.",
      },
      {
        title: "To infinity",
        body: "To infinity and beyond. Hollywood Studios is ready.",
      },
    ];
  }

  if (dayTitle === "Chill Day / EPCOT") {
    return [
      {
        title: "Hakuna Matata mode",
        body: "Hakuna Matata mode is fully approved today.",
      },
      {
        title: "Take it slow",
        body: "The magic isn’t going anywhere.",
      },
      {
        title: "Wandering day",
        body: "Some days are for wandering.",
      },
    ];
  }

  if (dayTitle === "Travel Home") {
    return [
      {
        title: "So long, partner",
        body: "So long, partner. Pack the memories gently.",
      },
      {
        title: "Not the end",
        body: "The adventure doesn’t end here.",
      },
      {
        title: "Magic packed",
        body: "You’re taking the magic with you.",
      },
    ];
  }

  return [
    {
      title: "Good morning, crew",
      body: `${dayTitle} today. Follow the plan, leave room for magic.`,
    },
  ];
}

function getTripNightMessages(dayTitle: string): NotificationMessage[] {
  if (dayTitle === "Magic Kingdom") {
    return [
      {
        title: "Happily for today",
        body: "Happily ever after counts for today.",
      },
      {
        title: "Fireworks feeling",
        body: "The fireworks hit. You felt it.",
      },
      {
        title: "Never grow up",
        body: "Hold onto today. It earned a little wonder.",
      },
    ];
  }

  if (dayTitle === "Animal Kingdom") {
    return [
      {
        title: "Remember who you are",
        body: "That wild feeling stays with you.",
      },
      {
        title: "Something else",
        body: "That wasn’t just a park. That was something else.",
      },
      {
        title: "Wild at heart",
        body: "You felt the wild today. That stays with you.",
      },
    ];
  }

  if (dayTitle === "Hollywood Studios") {
    return [
      {
        title: "Force and rest",
        body: "May the force be with you… tonight and always.",
      },
      {
        title: "Adventure lived",
        body: "You lived the adventure. That counts.",
      },
      {
        title: "Story glow",
        body: "The story ended. The feeling didn’t.",
      },
    ];
  }

  if (dayTitle === "Chill Day / EPCOT") {
    return [
      {
        title: "Quiet magic",
        body: "Even the quiet days feel like magic.",
      },
      {
        title: "No worries",
        body: "No worries today. None tomorrow either.",
      },
      {
        title: "Just right",
        body: "That was exactly what it needed to be.",
      },
    ];
  }

  if (dayTitle === "Travel Home") {
    return [
      {
        title: "Friendship mode",
        body: "You’ve got a friend in me… even back home.",
      },
      {
        title: "Story continues",
        body: "Somewhere, the story continues.",
      },
      {
        title: "Magic changed",
        body: "The magic doesn’t leave. It just changes.",
      },
    ];
  }

  return [
    {
      title: `${dayTitle} complete`,
      body: "Even mayhem needs a bedtime. Dream big.",
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

function getNotificationPayloadMessage(
  kind: NotificationKind,
  message: NotificationMessage,
): NotificationMessage {
  if (kind === "test") return message;

  const body = message.body.trim();

  return {
    title: kind === "morning" ? "Good Morning!" : "Good Night!",
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
