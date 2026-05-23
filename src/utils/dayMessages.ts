export type MessagePhase = 'pretrip' | 'trip' | 'any';

export type DayMessage = {
  id: string;
  title: string;
  body: string;
  phase?: MessagePhase;
};

export type ReturnedDayMessage = {
  id: string;
  title: string;
  body: string;
};

type SelectablePhase = MessagePhase | 'after';
type MessageKind = 'morning' | 'night';

const lastMessageStorageKeys: Record<MessageKind, string> = {
  morning: 'disney-mayhem:last-morning-message-id',
  night: 'disney-mayhem:last-night-message-id',
};

export const morningMessages: DayMessage[] = [
  {
    id: 'morning-pretrip-suitcase-spark',
    title: 'Suitcase sparkle check',
    body: 'Tiny chaos, big plans. Today is one step closer to castle mode.',
    phase: 'pretrip',
  },
  {
    id: 'morning-pretrip-snack-rehearsal',
    title: 'Snack strategy meeting',
    body: 'Practice patience, charge the batteries, and pretend packing cubes are exciting.',
    phase: 'pretrip',
  },
  {
    id: 'morning-pretrip-countdown-crew',
    title: 'Countdown crew, assemble',
    body: 'The trip is getting real. Hydrate now so future-you can chase the fun.',
    phase: 'pretrip',
  },
  {
    id: 'morning-pretrip-magic-loading',
    title: 'Magic loading',
    body: 'Shoes, chargers, and a little optimism. That is the pre-trip trifecta.',
    phase: 'pretrip',
  },
  {
    id: 'morning-pretrip-last-lap',
    title: 'Final lap energy',
    body: 'The itinerary has entered its sparkle era. Time to tighten the bolts.',
    phase: 'pretrip',
  },
  {
    id: 'morning-trip-rope-drop-ready',
    title: 'Rope-drop-ish ready',
    body: 'Big smiles, brave feet, and snacks within reach. Let the mayhem begin.',
    phase: 'trip',
  },
  {
    id: 'morning-trip-castle-coffee',
    title: 'Coffee first, wonder second',
    body: 'Today has main-gate energy. Move kindly, snack often, and stay together.',
    phase: 'trip',
  },
  {
    id: 'morning-trip-park-feet',
    title: 'Park feet activated',
    body: 'Stretch the calves and trust the plan. We are here for memories and mobile orders.',
    phase: 'trip',
  },
  {
    id: 'morning-trip-wild-weather',
    title: 'Forecast: delight with a chance of sprinkles',
    body: 'Ponchos count as fashion when the family is having fun.',
    phase: 'trip',
  },
  {
    id: 'morning-trip-gentle-mayhem',
    title: 'Gentle mayhem mode',
    body: 'Adventure today, meltdowns optional, churro diplomacy encouraged.',
    phase: 'trip',
  },
  {
    id: 'morning-trip-reservation-rhythm',
    title: 'Reservation rhythm',
    body: 'Keep an eye on the clock, but leave room for the good surprises.',
    phase: 'trip',
  },
  {
    id: 'morning-any-good-chaos',
    title: 'Good chaos only',
    body: 'Check the plan, pack the patience, and let the day earn its stories.',
    phase: 'any',
  },
  {
    id: 'morning-any-snack-powered',
    title: 'Snack-powered optimism',
    body: 'A balanced day starts with sunscreen, water, and somebody knowing where the stroller is.',
    phase: 'any',
  },
  {
    id: 'morning-any-bright-shoes',
    title: 'Bright shoes, brave hearts',
    body: 'The plan is flexible, the crew is capable, and the fun has range.',
    phase: 'any',
  },
  {
    id: 'morning-any-map-magic',
    title: 'Map magic',
    body: 'Follow the plan until the day offers something better. That counts too.',
    phase: 'any',
  },
];

export const nightMessages: DayMessage[] = [
  {
    id: 'night-pretrip-suitcase-dreams',
    title: 'Suitcases can wait until morning',
    body: 'Rest now. Tomorrow can handle the chargers, socks, and tiny logistics thunderstorm.',
    phase: 'pretrip',
  },
  {
    id: 'night-pretrip-countdown-cozy',
    title: 'Countdown, but cozy',
    body: 'The magic is closer than it was this morning. That is enough for tonight.',
    phase: 'pretrip',
  },
  {
    id: 'night-pretrip-plan-sleep',
    title: 'Let the plan sleep too',
    body: 'No itinerary improves after the third bedtime scroll. Future-you says thanks.',
    phase: 'pretrip',
  },
  {
    id: 'night-pretrip-tomorrow-pack',
    title: 'Tomorrow can pack the pixie dust',
    body: 'Close the suitcase in your mind. The adventure is still on schedule.',
    phase: 'pretrip',
  },
  {
    id: 'night-trip-tired-feet',
    title: 'Tired feet, full hearts',
    body: 'That absolutely counts as a successful day. Sleep like you earned it.',
    phase: 'trip',
  },
  {
    id: 'night-trip-even-mayhem',
    title: 'Even mayhem needs bedtime',
    body: 'Charge the phones, park the stroller, and let tomorrow wait its turn.',
    phase: 'trip',
  },
  {
    id: 'night-trip-kingdom-morning',
    title: 'The gates can wait',
    body: 'Tonight is for quiet socks, soft pillows, and remembering the best laugh of the day.',
    phase: 'trip',
  },
  {
    id: 'night-trip-main-character-tomorrow',
    title: 'Tomorrow has big-scene energy',
    body: 'Rest up. The next chapter needs hydrated heroes.',
    phase: 'trip',
  },
  {
    id: 'night-trip-snack-ledger',
    title: 'Snack ledger closed',
    body: 'The steps were many, the treats were important, and the pillows are calling.',
    phase: 'trip',
  },
  {
    id: 'night-trip-stroller-docked',
    title: 'Stroller docked',
    body: 'Tiny shoes off, big feelings downshifted. That is the evening parade.',
    phase: 'trip',
  },
  {
    id: 'night-any-lights-low',
    title: 'Lights low, dreams big',
    body: 'Let the day settle. The best stories usually need a little sleep.',
    phase: 'any',
  },
  {
    id: 'night-any-soft-landing',
    title: 'Soft landing',
    body: 'Mayhem complete for now. Tomorrow gets a fresh battery and a clean slate.',
    phase: 'any',
  },
  {
    id: 'night-any-pillow-queue',
    title: 'Pillow queue open',
    body: 'No wait time posted, but immediate boarding is strongly recommended.',
    phase: 'any',
  },
  {
    id: 'night-any-memory-save',
    title: 'Memory saved',
    body: 'Today had its own kind of sparkle. Keep the good parts close.',
    phase: 'any',
  },
];

function getAllowedMessages(messages: DayMessage[], phase: SelectablePhase): DayMessage[] {
  if (phase === 'pretrip') return messages.filter((message) => message.phase === 'pretrip' || message.phase === 'any' || !message.phase);
  if (phase === 'trip') return messages.filter((message) => message.phase === 'trip' || message.phase === 'any' || !message.phase);
  if (phase === 'after') return messages.filter((message) => message.phase === 'any' || !message.phase);
  return messages;
}

function readLastMessageId(kind: MessageKind): string | undefined {
  try {
    return window.localStorage.getItem(lastMessageStorageKeys[kind]) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeLastMessageId(kind: MessageKind, id: string) {
  try {
    window.localStorage.setItem(lastMessageStorageKeys[kind], id);
  } catch {
    // localStorage can be unavailable in private or restricted browser contexts.
  }
}

function selectMessage(messages: DayMessage[], kind: MessageKind, phase: SelectablePhase): ReturnedDayMessage {
  const candidates = getAllowedMessages(messages, phase);
  const safeCandidates = candidates.length > 0 ? candidates : messages;
  const lastId = readLastMessageId(kind);
  const freshCandidates = safeCandidates.length > 1 ? safeCandidates.filter((message) => message.id !== lastId) : safeCandidates;
  const selected = freshCandidates[Math.floor(Math.random() * freshCandidates.length)];

  writeLastMessageId(kind, selected.id);

  return {
    id: selected.id,
    title: selected.title,
    body: selected.body,
  };
}

export function getMorningMessage(date: Date | string, phase: SelectablePhase): ReturnedDayMessage {
  void date;
  return selectMessage(morningMessages, 'morning', phase);
}

export function getNightMessage(date: Date | string, phase: SelectablePhase): ReturnedDayMessage {
  void date;
  return selectMessage(nightMessages, 'night', phase);
}
