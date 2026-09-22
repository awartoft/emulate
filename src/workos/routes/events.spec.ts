import { describe, it, expect, beforeEach } from 'bun:test';
import { createServer, type ApiKeyMap } from '../../core/index.js';
import { workosPlugin, getWorkOSStore } from '../index.js';

const apiKeys: ApiKeyMap = { sk_test_ev: { environment: 'test' } };
const headers = { Authorization: 'Bearer sk_test_ev', 'Content-Type': 'application/json' };

function createTestApp() {
  return createServer(workosPlugin, { port: 0, baseUrl: 'http://localhost:0', apiKeys });
}

describe('Events routes', () => {
  let app: ReturnType<typeof createTestApp>['app'];
  let store: ReturnType<typeof createTestApp>['store'];

  beforeEach(() => {
    const server = createTestApp();
    app = server.app;
    store = server.store;
  });

  const req = (path: string, init?: RequestInit) => app.request(path, { headers, ...init });
  const json = (res: Response) => res.json() as Promise<any>;

  it('lists events', async () => {
    const ws = getWorkOSStore(store);
    ws.events.insert({ object: 'event', event: 'user.created', data: { id: 'user_1' }, environment_id: null });
    ws.events.insert({ object: 'event', event: 'organization.created', data: { id: 'org_1' }, environment_id: null });

    const res = await req('/events');
    expect(res.status).toBe(200);
    const list = await json(res);
    expect(list.object).toBe('list');
    expect(list.data).toHaveLength(2);
    expect(list.data[0].object).toBe('event');
  });

  it('filters events by type', async () => {
    const ws = getWorkOSStore(store);
    ws.events.insert({ object: 'event', event: 'user.created', data: {}, environment_id: null });
    ws.events.insert({ object: 'event', event: 'user.updated', data: {}, environment_id: null });
    ws.events.insert({ object: 'event', event: 'organization.created', data: {}, environment_id: null });

    const res = await req('/events?events[]=user.created&events[]=user.updated');
    const list = await json(res);
    expect(list.data).toHaveLength(2);
    expect(list.data.every((e: any) => e.event.startsWith('user.'))).toBe(true);
  });

  it('returns empty list when no events', async () => {
    const res = await req('/events');
    const list = await json(res);
    expect(list.data).toHaveLength(0);
  });

  it('filters events by the repeated events parameter', async () => {
    const ws = getWorkOSStore(store);
    ws.events.insert({ object: 'event', event: 'user.created', data: {}, environment_id: null });
    ws.events.insert({ object: 'event', event: 'user.updated', data: {}, environment_id: null });
    ws.events.insert({ object: 'event', event: 'organization.created', data: {}, environment_id: null });

    const res = await req('/events?events=user.created&events=user.updated');
    const list = await json(res);
    expect(list.data).toHaveLength(2);
    expect(list.data.every((e: any) => e.event.startsWith('user.'))).toBe(true);
  });

  it('filters events by organization and range', async () => {
    const ws = getWorkOSStore(store);
    ws.events.insert({
      object: 'event',
      event: 'dsync.user.created',
      data: { organization_id: 'org_1' },
      environment_id: null,
    });
    ws.events.insert({
      object: 'event',
      event: 'dsync.user.created',
      data: { organization_id: 'org_2' },
      environment_id: null,
    });

    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();

    const kept = await json(await req(`/events?organization_id=org_1&range_start=${encodeURIComponent(past)}`));
    expect(kept.data).toHaveLength(1);
    expect(kept.data[0].data.organization_id).toBe('org_1');

    const later = await json(await req(`/events?range_start=${encodeURIComponent(future)}`));
    expect(later.data).toHaveLength(0);

    const ended = await json(await req(`/events?range_end=${encodeURIComponent(past)}`));
    expect(ended.data).toHaveLength(0);
  });

  it('event from user creation appears in events list', async () => {
    // Create a user which should trigger an event via collection hooks
    await req('/user_management/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    });

    const res = await req('/events');
    const list = await json(res);
    const userEvents = list.data.filter((e: any) => e.event === 'user.created');
    expect(userEvents.length).toBeGreaterThanOrEqual(1);
  });
});
