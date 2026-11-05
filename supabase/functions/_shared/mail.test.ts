import { describe, expect, it, vi } from 'vitest';
import { sendMail, type MailEnv, type MailMessage } from './mail';

const MSG: MailMessage = {
  to: ['user@example.com'],
  subject: 'Verify',
  html: '<p>hi</p>',
  text: 'hi',
};

const BOTH: MailEnv = {
  RESEND_API_KEY: 're_test',
  AGENTMAIL_API_KEY: 'am_test',
  AGENTMAIL_INBOX: 'inbox@agentmail.to',
};

const okRes = () => new Response('{}', { status: 200 });
const badRes = () => new Response('bad', { status: 500 });

const callsOf = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => String(c[0]));

describe('sendMail provider chain', () => {
  it('sends via Resend when it succeeds and never touches AgentMail', async () => {
    const f = vi.fn().mockResolvedValue(okRes());
    const r = await sendMail(MSG, BOTH, f);
    expect(r).toEqual({ sent: true, provider: 'resend' });
    expect(callsOf(f)).toEqual(['https://api.resend.com/emails']);
  });

  it('falls back to AgentMail when Resend returns an error status', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(badRes())
      .mockResolvedValueOnce(okRes());
    const r = await sendMail(MSG, BOTH, f);
    expect(r).toEqual({ sent: true, provider: 'agentmail' });
    expect(callsOf(f)[1]).toContain('api.agentmail.to');
  });

  it('falls back to AgentMail when Resend throws (network failure)', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new Error('socket hangup'))
      .mockResolvedValueOnce(okRes());
    const r = await sendMail(MSG, BOTH, f);
    expect(r).toEqual({ sent: true, provider: 'agentmail' });
    expect(callsOf(f)).toHaveLength(2);
  });

  it('falls back to AgentMail when Resend is not configured', async () => {
    const f = vi.fn().mockResolvedValue(okRes());
    const r = await sendMail(MSG, { AGENTMAIL_API_KEY: 'am_test' }, f);
    expect(r).toEqual({ sent: true, provider: 'agentmail' });
    expect(callsOf(f)[0]).toContain('api.agentmail.to');
  });

  it('reports failure when every configured provider fails', async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(badRes()));
    const r = await sendMail(MSG, BOTH, f);
    expect(r.sent).toBe(false);
    expect(r.provider).toBeNull();
  });

  it('reports failure without calling fetch when nothing is configured', async () => {
    const f = vi.fn();
    const r = await sendMail(MSG, {}, f);
    expect(r).toEqual({ sent: false, provider: null });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('sendMail Resend sender identity', () => {
  it('uses the branded flexzora.pro default when RESEND_FROM_EMAIL is unset', async () => {
    const f = vi.fn().mockResolvedValue(okRes());
    await sendMail(MSG, { RESEND_API_KEY: 're_test' }, f);
    const body = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(body.from).toBe('Flexzora Crew <crew@flexzora.pro>');
  });

  it('honors RESEND_FROM_EMAIL when set', async () => {
    const f = vi.fn().mockResolvedValue(okRes());
    await sendMail(MSG, { RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: 'X <x@flexzora.pro>' }, f);
    const body = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(body.from).toBe('X <x@flexzora.pro>');
  });
});
