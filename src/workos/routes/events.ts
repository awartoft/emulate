import { type RouteContext, parseListParams } from '../../core/index.js';
import { getWorkOSStore } from '../store.js';
import { formatEvent, formatListResponse } from '../helpers.js';
import type { WorkOSEvent } from '../entities.js';

export function eventRoutes(ctx: RouteContext): void {
  const { app, store } = ctx;
  const ws = getWorkOSStore(store);

  app.get('/events', (c) => {
    const url = new URL(c.req.url);
    const params = parseListParams(url);
    // workos-go encodes the filter as repeated `events=` (no brackets). The
    // documented form is `events[]`. Both name the same parameter.
    const eventTypes = [...url.searchParams.getAll('events'), ...url.searchParams.getAll('events[]')];
    const organizationId = url.searchParams.get('organization_id');
    const rangeStart = url.searchParams.get('range_start');
    const rangeEnd = url.searchParams.get('range_end');

    const result = ws.events.list({
      ...params,
      filter: (event) =>
        (eventTypes.length === 0 || eventTypes.includes(event.event)) &&
        eventInScope(event, organizationId, rangeStart, rangeEnd),
    });

    return c.json(formatListResponse(result, formatEvent));
  });
}

function eventInScope(
  event: WorkOSEvent,
  organizationId: string | null,
  rangeStart: string | null,
  rangeEnd: string | null,
): boolean {
  if (organizationId && event.data.organization_id !== organizationId) return false;

  const createdAt = Date.parse(event.created_at);
  if (rangeStart) {
    const start = Date.parse(rangeStart);
    if (!Number.isNaN(createdAt) && !Number.isNaN(start) && createdAt < start) return false;
  }
  if (rangeEnd) {
    const end = Date.parse(rangeEnd);
    if (!Number.isNaN(createdAt) && !Number.isNaN(end) && createdAt > end) return false;
  }

  return true;
}
