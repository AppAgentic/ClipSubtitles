import { describe, expect, it } from 'vitest';
import { createLogger, redact } from './logging';

describe('redact', () => {
  it('strips credentials, media content, and long strings', () => {
    const out = redact({
      authorization: 'Bearer abc',
      nested: { apiKey: 'k', token: 't', ok: 'fine' },
      words: [{ text: 'secret speech' }],
      title: 'my clip',
      long: 'x'.repeat(500),
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature-part',
    }) as Record<string, unknown>;
    expect(out.authorization).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).apiKey).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).ok).toBe('fine');
    expect(out.words).toBe('[content:1]');
    expect(out.title).toBe('[content:7]');
    expect(String(out.long)).toHaveLength(200 + '…[+300]'.length);
    expect(out.jwt).toBe('[redacted]');
  });
});

describe('createLogger', () => {
  it('redacts parent and child bindings, not only per-call meta', () => {
    const lines: string[] = [];
    const root = createLogger('info', { authorization: 'Bearer parent-secret', service: 'x' }, (l) => lines.push(l));
    const child = root.child({ token: 'child-secret', taskId: 'task_1' });
    root.info('hello', { password: 'meta-secret' });
    child.warn('world');
    const joined = lines.join('\n');
    expect(joined).not.toContain('parent-secret');
    expect(joined).not.toContain('child-secret');
    expect(joined).not.toContain('meta-secret');
    expect(joined).toContain('"service":"x"');
    expect(joined).toContain('"taskId":"task_1"');
    expect(lines).toHaveLength(2);
  });

  it('honours the level threshold', () => {
    const lines: string[] = [];
    const log = createLogger('warn', {}, (l) => lines.push(l));
    log.info('nope');
    log.error('yes');
    expect(lines).toHaveLength(1);
  });
});
