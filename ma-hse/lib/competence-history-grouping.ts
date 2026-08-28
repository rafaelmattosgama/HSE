export type CompetenceHistoryGroup<T> = { entryGroupId: string | null; events: T[] };

/** Groups records submitted together, while retaining legacy and lifecycle events individually. */
export function groupCompetenceHistory<T>(events: T[]): Array<CompetenceHistoryGroup<T>> {
  const groups: Array<CompetenceHistoryGroup<T>> = [];
  const byEntryGroupId = new Map<string, CompetenceHistoryGroup<T>>();

  for (const event of events) {
    const entryGroupId = event && typeof event === "object" && "entryGroupId" in event && typeof event.entryGroupId === "string"
      ? event.entryGroupId
      : null;
    if (!entryGroupId) {
      groups.push({ entryGroupId: null, events: [event] });
      continue;
    }

    let group = byEntryGroupId.get(entryGroupId);
    if (!group) {
      group = { entryGroupId, events: [] };
      byEntryGroupId.set(entryGroupId, group);
      groups.push(group);
    }
    group.events.push(event);
  }

  return groups;
}
