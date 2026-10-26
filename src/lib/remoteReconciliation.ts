/** Retain references for unchanged rows so background sync leaves editors mounted. */
export const retainUnchangedRows = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
  const byId = new Map(current.map((item) => [item.id, item]));
  const next = incoming.map((item) => {
    const previous = byId.get(item.id);
    return previous && JSON.stringify(previous) === JSON.stringify(item) ? previous : item;
  });
  return next.length === current.length && next.every((item, index) => item === current[index]) ? current : next;
};
