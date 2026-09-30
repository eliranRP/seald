import { BadRequestException } from '@nestjs/common';
import { resolveSenderIdentity } from '../sender-identity';

describe('resolveSenderIdentity', () => {
  it('uses the JWT email and ignores the body (anti-spoof)', () => {
    expect(
      resolveSenderIdentity(
        { email: 'sender@example.com' },
        { sender_email: 'evil@spoof.example', sender_name: 'Bad Actor' },
      ),
    ).toEqual({ email: 'sender@example.com', name: null });
  });

  it('uses the JWT email when the body is omitted', () => {
    expect(resolveSenderIdentity({ email: 'sender@example.com' })).toEqual({
      email: 'sender@example.com',
      name: null,
    });
  });

  it('falls back to the body email and name for an anonymous session', () => {
    expect(
      resolveSenderIdentity(
        { email: null },
        { sender_email: 'guest@example.com', sender_name: 'Guest User' },
      ),
    ).toEqual({ email: 'guest@example.com', name: 'Guest User' });
  });

  it('leaves the name null when a guest omits sender_name', () => {
    expect(resolveSenderIdentity({ email: null }, { sender_email: 'guest@example.com' })).toEqual({
      email: 'guest@example.com',
      name: null,
    });
  });

  it('throws sender_email_missing when neither the JWT nor the body has an email', () => {
    expect(() => resolveSenderIdentity({ email: null }, {})).toThrow(BadRequestException);
    try {
      resolveSenderIdentity({ email: null });
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toBe('sender_email_missing');
    }
  });
});
