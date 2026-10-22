import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTemplateSource, resolveTemplateDir } from '../template-loader';
import { TemplateService } from '../template.service';

function writeSet(dir: string, tag: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'body.html'), `<p>${tag}</p>`);
  writeFileSync(join(dir, 'body.txt'), `${tag} text`);
  writeFileSync(join(dir, 'subject.txt'), `${tag} subject\n`);
}

describe('template-loader', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'seald-tpl-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('prefers templates/<kind>/<locale>/ when present', () => {
    writeSet(join(root, 'invite'), 'flat');
    writeSet(join(root, 'invite', 'en'), 'en');
    writeSet(join(root, 'invite', 'fr'), 'fr');
    expect(loadTemplateSource(root, 'invite', 'fr').html).toBe('<p>fr</p>');
  });

  it('falls back to <kind>/en/ when the locale dir is missing', () => {
    writeSet(join(root, 'invite'), 'flat');
    writeSet(join(root, 'invite', 'en'), 'en');
    expect(loadTemplateSource(root, 'invite', 'fr').html).toBe('<p>en</p>');
  });

  it('falls back to the flat <kind>/ layout when no locale dirs exist', () => {
    writeSet(join(root, 'invite'), 'flat');
    const src = loadTemplateSource(root, 'invite', 'en');
    expect(src.html).toBe('<p>flat</p>');
    expect(src.subject).toBe('flat subject');
    expect(resolveTemplateDir(root, 'invite', 'fr')).toBe(join(root, 'invite'));
  });

  it('skips an incomplete locale dir', () => {
    writeSet(join(root, 'invite'), 'flat');
    mkdirSync(join(root, 'invite', 'fr'), { recursive: true });
    writeFileSync(join(root, 'invite', 'fr', 'body.html'), '<p>partial</p>');
    expect(loadTemplateSource(root, 'invite', 'fr').html).toBe('<p>flat</p>');
  });

  it('ignores locale values that would escape the kind directory', () => {
    writeSet(join(root, 'invite'), 'flat');
    writeSet(join(root, 'evil'), 'evil');
    expect(loadTemplateSource(root, 'invite', '../evil').html).toBe('<p>flat</p>');
  });

  it('throws when no layout is complete', () => {
    mkdirSync(join(root, 'invite'), { recursive: true });
    expect(() => loadTemplateSource(root, 'invite', 'en')).toThrow(/incomplete template set/);
  });
});

describe('TemplateService locale rendering', () => {
  it('renders the same output for en and an unsupported locale (flat fallback)', () => {
    const svc = new TemplateService();
    svc.onModuleInit();
    const vars = {
      signer_name: 'A',
      sender_name: 'B',
      sender_email: 'b@example.com',
      document_title: 'Doc',
    };
    expect(svc.render('invite', vars, 'fr')).toEqual(svc.render('invite', vars));
    expect(svc.render('invite', vars, 'en').subject).toBe(svc.render('invite', vars).subject);
  });
});
