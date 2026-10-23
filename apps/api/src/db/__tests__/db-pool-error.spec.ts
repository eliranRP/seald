import { EventEmitter } from 'node:events';
import { Pool } from 'pg';
import { attachPoolErrorListener } from '../db.provider';

describe('attachPoolErrorListener (WP-46)', () => {
  it('an idle-client error on a bare emitter would throw; with the listener it is logged', () => {
    const bare = new EventEmitter();
    expect(() => bare.emit('error', new Error('boom'))).toThrow('boom');

    const pool = new EventEmitter();
    const logger = { error: jest.fn() };
    attachPoolErrorListener(pool as unknown as Pool, logger);
    const err = Object.assign(new Error('terminating connection due to administrator command'), {
      code: '57P01',
    });
    expect(() => pool.emit('error', err, {})).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      'idle postgres client error (code=57P01): terminating connection due to administrator command',
    );
  });

  it('redacts credentials a driver message might echo', () => {
    const pool = new EventEmitter();
    const logger = { error: jest.fn() };
    attachPoolErrorListener(pool as unknown as Pool, logger);
    pool.emit('error', new Error('connect failed for postgres://user:xxxxxxxx@db.internal:5432/x'));
    const line = String(logger.error.mock.calls[0]?.[0]);
    expect(line).toContain('code=unknown');
    expect(line).toContain('postgres://***@db.internal:5432/x');
    expect(line).not.toContain('xxxxxxxx');
  });

  it('keeps a real pg Pool alive when an idle client errors', async () => {
    const pool = new Pool({ connectionString: 'postgres://u:p@127.0.0.1:1/db' });
    const logger = { error: jest.fn() };
    attachPoolErrorListener(pool, logger);
    expect(pool.listenerCount('error')).toBe(1);
    expect(() => pool.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
    expect(logger.error).toHaveBeenCalledTimes(1);
    await pool.end();
  });
});
