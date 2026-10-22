import { canonicalIp, checkIpText, parseIp } from '../ip-policy';
import {
  effectiveAllowance,
  resolveWebhookTarget,
  sealdOwnHosts,
  type ResolvedAddress,
  type WebhookResolver,
} from '../webhook-target';

const OWN = sealdOwnHosts([
  'https://app.seald.test',
  'https://abcdefgh.supabase.co',
  'postgres://postgres:pw@db.abcdefgh.supabase.co:5432/postgres',
  'https://seald.nromomentum.com,https://www.seald.nromomentum.com',
]);

function stubResolver(map: Record<string, readonly ResolvedAddress[]>): jest.Mock {
  return jest.fn<Promise<readonly ResolvedAddress[]>, [string]>(async (host) => {
    const hit = map[host];
    if (!hit) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    return hit;
  });
}

const PUBLIC_V4: ResolvedAddress = { address: '93.184.216.34', family: 4 };

async function target(url: string, resolver: WebhookResolver = stubResolver({})) {
  return resolveWebhookTarget(url, { ownHosts: OWN, resolver });
}

describe('SSRF address policy', () => {
  // Every CIDR the design doc names, plus edge addresses inside each.
  it.each([
    ['0.0.0.0', 'unspecified'],
    ['0.1.2.3', 'unspecified'],
    ['10.0.0.1', 'private'],
    ['10.255.255.255', 'private'],
    ['100.64.0.1', 'carrier_nat'],
    ['100.127.255.254', 'carrier_nat'],
    ['127.0.0.1', 'loopback'],
    ['127.255.0.9', 'loopback'],
    ['169.254.169.254', 'link_local'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.0.0.8', 'ietf_protocol'],
    ['192.168.0.5', 'private'],
    ['198.18.0.1', 'benchmarking'],
    ['198.19.255.255', 'benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'reserved'],
    ['192.0.2.1', 'documentation'],
    ['::', 'unspecified'],
    ['::1', 'loopback'],
    ['0:0:0:0:0:0:0:1', 'loopback'],
    ['fe80::1', 'link_local'],
    ['febf:ffff::1', 'link_local'],
    ['fc00::1', 'unique_local'],
    ['fd00:ec2::254', 'unique_local'],
    ['2001:db8::1', 'documentation'],
    ['64:ff9b::a00:1', 'nat64'],
    ['64:ff9b::808:808', 'nat64'],
    ['2001::1', 'ietf_protocol'],
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'ietf_protocol'],
    ['ff02::1', 'multicast'],
    ['::a00:1', 'ipv4_compatible'],
    ['::ffff:127.0.0.1', 'ipv4_mapped:loopback'],
    ['::ffff:7f00:1', 'ipv4_mapped:loopback'],
    ['::FFFF:A9FE:A9FE', 'ipv4_mapped:link_local'],
    ['0:0:0:0:0:ffff:10.0.0.1', 'ipv4_mapped:private'],
    ['::ffff:93.184.216.34', 'ipv4_mapped'],
    ['2002:0a00:0001::', '6to4:private'],
    ['2002:7f00:1::1', '6to4:loopback'],
    ['2002:a9fe:a9fe::', '6to4:link_local'],
    ['100::1', 'discard'],
    ['3fff::1', 'documentation'],
    ['fec0::1', 'site_local'],
    ['4000::1', 'not_global_unicast'],
  ])('blocks %s (%s)', (address, reason) => {
    expect(checkIpText(address)).toEqual({ allowed: false, reason });
  });

  it.each(['93.184.216.34', '1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '2002:5db8:d822::1'])(
    'allows public %s',
    (address) => {
      expect(checkIpText(address)).toEqual({ allowed: true });
    },
  );

  it.each(['', 'nope', '1.2.3', '1.2.3.4.5', '01.2.3.4', '256.1.1.1', 'fe80::1%eth0', '1::2::3'])(
    'fails closed on unparseable %p',
    (address) => {
      expect(checkIpText(address)).toEqual({ allowed: false, reason: 'unparseable' });
    },
  );

  it('treats every textual form of one IPv6 address the same', () => {
    const forms = [
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '0:0:0:0:0:ffff:7f00:0001',
      '::FFFF:7F00:1',
    ];
    const canon = forms.map((f) => canonicalIp(parseIp(f)!));
    expect(new Set(canon).size).toBe(1);
  });
});

describe('SSRF URL pre-flight (stub resolver, no sockets)', () => {
  // Blocked before any DNS lookup or connection.
  it.each([
    ['http://hooks.example.com/x', 'scheme'],
    ['ftp://hooks.example.com/x', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['https://user:pass@hooks.example.com/x', 'userinfo'],
    ['https://user@hooks.example.com/x', 'userinfo'],
    ['https://hooks.example.com:8443/x', 'port'],
    ['https://hooks.example.com:80/x', 'port'],
    ['https://localhost/x', 'internal_hostname'],
    ['https://api.localhost/x', 'internal_hostname'],
    ['https://metadata.google.internal/x', 'internal_hostname'],
    ['https://instance-data/x', 'internal_hostname'],
    ['https://printer.local/x', 'internal_hostname'],
    ['https://intranet/x', 'single_label_hostname'],
    ['https://seald.nromomentum.com/x', 'seald_host'],
    ['https://api.seald.nromomentum.com/x', 'seald_host'],
    ['https://www.seald.nromomentum.com/x', 'seald_host'],
    ['https://app.seald.test/x', 'seald_host'],
    ['https://abcdefgh.supabase.co/rest/v1', 'seald_host'],
    ['https://db.abcdefgh.supabase.co/x', 'seald_host'],
    ['https://SEALD.NROMOMENTUM.COM./x', 'seald_host'],
    ['https://hooks.example.com/a b', 'bad_characters'],
    ['https://hooks.example.com/\tx', 'bad_characters'],
    [`https://hooks.example.com/${'a'.repeat(2100)}`, 'too_long'],
    ['not a url', 'bad_characters'],
    ['https://', 'unparseable'],
  ])('%s → blocked (%s)', async (url, reason) => {
    const resolver = stubResolver({ 'hooks.example.com': [PUBLIC_V4] });
    expect(await target(url, resolver)).toEqual({ ok: false, kind: 'blocked', reason });
    expect(resolver).not.toHaveBeenCalled();
  });

  // IP literals, including decimal / octal / hex / short IPv4 forms that the
  // WHATWG parser normalizes, and bracketed IPv6. Never resolved.
  it.each([
    ['https://127.0.0.1/x', 'loopback'],
    ['https://169.254.169.254/latest/meta-data/', 'link_local'],
    ['https://10.0.0.1/x', 'private'],
    ['https://100.64.0.1/x', 'carrier_nat'],
    ['https://0.0.0.0/x', 'unspecified'],
    ['https://255.255.255.255/x', 'reserved'],
    ['https://2130706433/x', 'loopback'], // decimal 127.0.0.1
    ['https://0177.0.0.1/x', 'loopback'], // octal
    ['https://017700000001/x', 'loopback'], // octal, single number
    ['https://0x7f.0.0.1/x', 'loopback'], // hex
    ['https://0x7f000001/x', 'loopback'], // hex, single number
    ['https://127.1/x', 'loopback'], // short form
    ['https://0xa9.0xfe.0xa9.0xfe/x', 'link_local'], // metadata in hex
    ['https://2852039166/x', 'link_local'], // metadata in decimal
    ['https://[::1]/x', 'loopback'],
    ['https://[::ffff:127.0.0.1]/x', 'ipv4_mapped:loopback'],
    ['https://[::ffff:a9fe:a9fe]/x', 'ipv4_mapped:link_local'],
    ['https://[64:ff9b::a00:1]/x', 'nat64'],
    ['https://[2002:0a00:0001::]/x', '6to4:private'],
    ['https://[fd00:ec2::254]/x', 'unique_local'],
    ['https://[fe80::1]/x', 'link_local'],
    ['https://[2001:db8::1]/x', 'documentation'],
  ])('%s → blocked (%s), no lookup', async (url, reason) => {
    const resolver = stubResolver({});
    expect(await target(url, resolver)).toEqual({ ok: false, kind: 'blocked', reason });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('blocks a hostname that resolves to 192.168.0.5', async () => {
    const resolver = stubResolver({
      'internal.example.com': [{ address: '192.168.0.5', family: 4 }],
    });
    expect(await target('https://internal.example.com/x', resolver)).toEqual({
      ok: false,
      kind: 'blocked',
      reason: 'private',
    });
  });

  it.each([
    ['::ffff:10.0.0.1', 6, 'ipv4_mapped:private'],
    ['fd12:3456::1', 6, 'unique_local'],
    ['169.254.169.254', 4, 'link_local'],
  ] as const)('blocks a hostname whose answer is %s', async (address, family, reason) => {
    const resolver = stubResolver({ 'h.example.com': [{ address, family }] });
    expect(await target('https://h.example.com/x', resolver)).toEqual({
      ok: false,
      kind: 'blocked',
      reason,
    });
  });

  it('blocks when any answer is private (mixed answers are a rebinding attempt)', async () => {
    const resolver = stubResolver({
      'mixed.example.com': [PUBLIC_V4, { address: '127.0.0.1', family: 4 }],
    });
    const out = await target('https://mixed.example.com/x', resolver);
    expect(out).toEqual({ ok: false, kind: 'blocked', reason: 'loopback' });
  });

  it('DNS rebinding: resolves exactly once and pins the checked address', async () => {
    let calls = 0;
    const rebinding: WebhookResolver = async () => {
      calls += 1;
      return calls === 1 ? [PUBLIC_V4] : [{ address: '127.0.0.1', family: 4 }];
    };
    const out = await target('https://rebind.example.com/hook?x=1#frag', rebinding);
    expect(calls).toBe(1);
    expect(out).toEqual({
      ok: true,
      target: {
        protocol: 'https:',
        hostname: 'rebind.example.com',
        hostIsIp: false,
        port: 443,
        path: '/hook?x=1',
        hostHeader: 'rebind.example.com',
        address: '93.184.216.34',
        family: 4,
      },
    });
    // The next attempt resolves again and is checked again: the rebound
    // private answer is blocked, it is never connected to.
    expect(await target('https://rebind.example.com/hook', rebinding)).toEqual({
      ok: false,
      kind: 'blocked',
      reason: 'loopback',
    });
    expect(calls).toBe(2);
  });

  it('allows a public hostname and a public literal, keeping the hostname for SNI/Host', async () => {
    const resolver = stubResolver({
      'hooks.example.com': [{ address: '2606:4700:4700::1111', family: 6 }],
    });
    const out = await target('https://Hooks.Example.com:443/in', resolver);
    expect(out.ok && out.target).toMatchObject({
      hostname: 'hooks.example.com',
      hostHeader: 'hooks.example.com',
      address: '2606:4700:4700:0:0:0:0:1111',
      family: 6,
      port: 443,
    });
    const literal = await target('https://93.184.216.34/in');
    expect(literal.ok && literal.target).toMatchObject({
      hostIsIp: true,
      address: '93.184.216.34',
    });
  });

  it('DNS failure and timeout are transient, not blocks', async () => {
    expect(await target('https://missing.example.com/x', stubResolver({}))).toEqual({
      ok: false,
      kind: 'dns',
      reason: 'ENOTFOUND',
    });
    const hanging: WebhookResolver = () => new Promise(() => undefined);
    expect(
      await resolveWebhookTarget('https://slow.example.com/x', {
        ownHosts: OWN,
        resolver: hanging,
        dnsTimeoutMs: 20,
      }),
    ).toEqual({ ok: false, kind: 'dns', reason: 'ETIMEOUT' });
    expect(
      await target('https://empty.example.com/x', stubResolver({ 'empty.example.com': [] })),
    ).toEqual({ ok: false, kind: 'dns', reason: 'no_answer' });
  });

  describe('test-only allowance', () => {
    const allowance = { allowHttp: true, allowAnyPort: true, allowAddresses: ['127.0.0.1'] };

    it('is honoured only when NODE_ENV=test', () => {
      expect(effectiveAllowance('test', allowance)).toBe(allowance);
      expect(effectiveAllowance('production', allowance)).toEqual({});
      expect(effectiveAllowance('development', allowance)).toEqual({});
      expect(effectiveAllowance(undefined, allowance)).toEqual({});
    });

    it('lets a test receiver through, and nothing else', async () => {
      const resolver = stubResolver({
        'receiver.example.com': [{ address: '127.0.0.1', family: 4 }],
        'other.example.com': [{ address: '10.0.0.1', family: 4 }],
      });
      const ok = await resolveWebhookTarget('http://receiver.example.com:4567/in', {
        ownHosts: OWN,
        resolver,
        allowance,
      });
      expect(ok.ok && ok.target).toMatchObject({
        protocol: 'http:',
        address: '127.0.0.1',
        hostHeader: 'receiver.example.com:4567',
      });
      expect(
        await resolveWebhookTarget('http://other.example.com:4567/in', {
          ownHosts: OWN,
          resolver,
          allowance,
        }),
      ).toEqual({ ok: false, kind: 'blocked', reason: 'private' });
      // Seald's own hosts stay blocked even under the allowance.
      expect(
        await resolveWebhookTarget('http://api.seald.nromomentum.com/in', {
          ownHosts: OWN,
          resolver,
          allowance,
        }),
      ).toEqual({ ok: false, kind: 'blocked', reason: 'seald_host' });
    });
  });
});
