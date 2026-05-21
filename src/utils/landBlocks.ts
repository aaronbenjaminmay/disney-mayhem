import type { Activity, LandBlock, LandBlockActivity, ParkName, ScheduledItem, TripDay, TripItem } from '../types';

type ActivityBlock = TripItem & {
  activities: Activity[];
  area?: string;
};

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

export function getActivityLand(park: ParkName, block: ActivityBlock, activity: Activity): string {
  const text = `${activity.title} ${activity.location} ${activity.notes ?? ''}`.toLowerCase();
  const fallbackText = `${block.area} ${block.location}`.toLowerCase();

  if (park === 'Magic Kingdom') {
    if (text.includes('adventureland') || includesAny(text, ['jungle cruise', 'swiss family', 'alladin', 'aladdin', 'pirates'])) return 'Adventureland';
    if (text.includes('frontierland') || includesAny(text, ['tiana', 'big thunder'])) return 'Frontierland';
    if (text.includes('liberty square') || includesAny(text, ['haunted mansion', 'christmas shoppe'])) return 'Liberty Square';
    if (text.includes('fantasy land') || text.includes('fantasyland') || includesAny(text, ['small world', 'peter pan', 'seven dwarf'])) return 'Fantasyland';
    if (text.includes('tomorrowland') || text.includes('tron')) return 'Tomorrowland';
  }

  if (park === 'EPCOT') {
    if (includesAny(text, ['guardians', 'test track', 'world discovery', 'space 220'])) return 'World Discovery';
    if (includesAny(text, ['creations', 'world celebration'])) return 'World Celebration';
    if (includesAny(text, ['frozen', 'norway'])) return 'World Showcase - Norway';
    if (includesAny(text, ['remi', 'remy', 'ratatouille', 'france'])) return 'World Showcase - France';
    if (text.includes('world showcase')) return 'World Showcase';
  }

  if (park === 'Hollywood Studios') {
    if (includesAny(text, ['hollywood boulevard', 'runaway railway'])) return 'Hollywood Boulevard';
    if (text.includes('toy story')) return 'Toy Story Land';
    if (includesAny(text, ['galaxy', 'rise of the resistance', 'millenium falcon', 'millennium falcon'])) return 'Galaxy’s Edge';
    if (includesAny(text, ['sunset', 'fantasmic'])) return 'Sunset Boulevard';
    if (includesAny(text, ['echo lake', 'star tours'])) return 'Echo Lake';
  }

  if (park === 'Animal Kingdom') {
    if (includesAny(text, ['rafiki', 'bluey'])) return 'Rafiki’s Planet Watch';
    if (includesAny(text, ['africa', 'kilimanjaro', 'gorilla'])) return 'Africa';
    if (includesAny(text, ['pandora', 'avatar', 'na’vi', "na'vi"])) return 'Pandora';
    if (includesAny(text, ['asia', 'everest'])) return 'Asia';
  }

  if (park === 'Magic Kingdom') {
    if (fallbackText.includes('adventureland')) return 'Adventureland';
    if (fallbackText.includes('frontierland')) return 'Frontierland';
    if (fallbackText.includes('liberty square')) return 'Liberty Square';
    if (fallbackText.includes('fantasy land') || fallbackText.includes('fantasyland')) return 'Fantasyland';
    if (fallbackText.includes('tomorrowland')) return 'Tomorrowland';
  }

  if (park === 'EPCOT') {
    if (includesAny(fallbackText, ['world discovery', 'space 220'])) return 'World Discovery';
    if (fallbackText.includes('world celebration')) return 'World Celebration';
    if (fallbackText.includes('norway')) return 'World Showcase - Norway';
    if (fallbackText.includes('france')) return 'World Showcase - France';
    if (fallbackText.includes('world showcase')) return 'World Showcase';
  }

  if (park === 'Hollywood Studios') {
    if (fallbackText.includes('hollywood boulevard')) return 'Hollywood Boulevard';
    if (fallbackText.includes('toy story')) return 'Toy Story Land';
    if (fallbackText.includes('galaxy')) return 'Galaxy’s Edge';
    if (fallbackText.includes('sunset')) return 'Sunset Boulevard';
    if (fallbackText.includes('echo lake')) return 'Echo Lake';
  }

  if (park === 'Animal Kingdom') {
    if (fallbackText.includes('rafiki')) return 'Rafiki’s Planet Watch';
    if (fallbackText.includes('africa')) return 'Africa';
    if (fallbackText.includes('pandora')) return 'Pandora';
    if (fallbackText.includes('asia')) return 'Asia';
  }

  return activity.location || block.area || block.location;
}

function makeLandActivity(block: ActivityBlock, activity: Activity): LandBlockActivity {
  return {
    ...activity,
    sourceItemId: block.id,
    sourceItemTitle: block.title,
    sourceItemTime: block.time,
    sourceItemEndTime: block.endTime,
    sourceItemNotes: block.notes,
    sourceItemNeedsAttention: block.needsAttention,
  };
}

function hasActivityBlock(item: TripItem): item is ActivityBlock {
  return 'activities' in item && Array.isArray(item.activities);
}

export function buildLandBlocks(day: TripDay, items: TripItem[] = day.items): LandBlock[] {
  const blocks = new Map<string, LandBlock>();

  items
    .filter(hasActivityBlock)
    .forEach((block) => {
      if (block.activities.length === 0) {
        const land = block.area || block.location;
        if (!blocks.has(land)) {
          blocks.set(land, {
            id: `${day.id}-${land.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            land,
            activities: [],
            sourceItemIds: [block.id],
            time: block.time,
            endTime: block.endTime,
            notes: block.notes,
            needsAttention: block.needsAttention,
          });
        }
      }

      block.activities.forEach((activity) => {
        const land = getActivityLand(day.park, block, activity);
        const existing =
          blocks.get(land) ??
          ({
            id: `${day.id}-${land.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            land,
            activities: [],
            sourceItemIds: [],
          } satisfies LandBlock);

        existing.activities.push(makeLandActivity(block, activity));
        if (!existing.sourceItemIds.includes(block.id)) existing.sourceItemIds.push(block.id);
        existing.time = existing.time ?? block.time;
        existing.endTime = block.endTime ?? existing.endTime;
        existing.notes = existing.notes ?? block.notes;
        existing.needsAttention = existing.needsAttention || block.needsAttention;
        blocks.set(land, existing);
      });
    });

  return [...blocks.values()];
}

export function withTripDayGroups(day: TripDay): TripDay {
  return {
    ...day,
    scheduledItems: day.items.filter((item): item is ScheduledItem => item.type === 'scheduled'),
    landBlocks: buildLandBlocks(day),
  };
}
