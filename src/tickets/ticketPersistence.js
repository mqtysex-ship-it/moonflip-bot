function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

// Apply only fields changed since this handler's read, preserving tickets added
// by another handler/dashboard while Discord requests were in flight.
export function mergeTicketChanges(before, desired, current) {
  const previous = before.activeTickets || {};
  const next = desired.activeTickets || {};
  current.activeTickets ??= {};
  const changes = [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter(key => !same(previous[key], next[key]));
  for (const key of changes) {
    if (!same(current.activeTickets[key], previous[key])) throw new Error('Ticket changed concurrently; retry the action');
  }
  for (const key of changes) {
    if (next[key] === undefined) delete current.activeTickets[key];
    else current.activeTickets[key] = structuredClone(next[key]);
  }
  current.counter = Math.max(current.counter || 0, desired.counter || 0);
  return current;
}
