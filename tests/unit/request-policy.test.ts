import { describe, expect, it } from 'vitest';
import { isLocalRequest } from '../../apps/server/src/request-policy.js';
const origin = 'http://127.0.0.1:43123';
describe('local request admission', () => {
  it.each([
    { host: 'attacker.example' },
    { host: '127.0.0.1:43123.attacker.example' },
    { host: 'localhost:43123' },
    { host: '127.0.0.1:43124' },
    { host: '127.0.0.1:43123', origin: 'https://attacker.example' },
    { host: '127.0.0.1:43123', origin: 'null' },
    { host: '127.0.0.1:43123', fetchSite: 'cross-site' },
    {},
  ])('rejects rebinding and foreign browser requests: %j', (headers) => {
    expect(isLocalRequest(headers, origin)).toBe(false);
  });
  it('allows the exact local origin and non-browser clients with the exact host', () => {
    expect(isLocalRequest({ host: '127.0.0.1:43123', origin }, origin)).toBe(
      true,
    );
    expect(isLocalRequest({ host: '127.0.0.1:43123' }, origin)).toBe(true);
  });
});
