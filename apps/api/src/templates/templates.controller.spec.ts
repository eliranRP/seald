import type { Response } from 'express';
import type { Template } from 'shared';
import type { AuthUser } from '../auth/auth-user';
import type { CreateTemplateDto } from './dto/create-template.dto';
import type { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesController } from './templates.controller';
import type { TemplatesService } from './templates.service';

const USER: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a@example.com',
} as AuthUser;
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: ID,
    owner_id: USER.id,
    title: 't',
    description: null,
    cover_color: null,
    field_layout: [],
    tags: [],
    last_signers: [],
    has_example_pdf: false,
    uses_count: 0,
    last_used_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMockSvc(): jest.Mocked<TemplatesService> {
  // Cast through unknown — we only stub the methods the controller uses.
  return {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    use: jest.fn(),
    attachExamplePdf: jest.fn(),
    readExamplePdf: jest.fn(),
  } as unknown as jest.Mocked<TemplatesService>;
}

function makeMockRes(): jest.Mocked<Response> {
  // Only the headers + end the controller actually touches.
  const res = {
    setHeader: jest.fn(),
    end: jest.fn(),
  };
  return res as unknown as jest.Mocked<Response>;
}

describe('TemplatesController', () => {
  let svc: jest.Mocked<TemplatesService>;
  let ctrl: TemplatesController;

  beforeEach(() => {
    svc = makeMockSvc();
    ctrl = new TemplatesController(svc);
  });

  it('list passes the caller user.id through', async () => {
    const rows = [makeTemplate()];
    svc.list.mockResolvedValue(rows);
    await expect(ctrl.list(USER)).resolves.toBe(rows);
    expect(svc.list).toHaveBeenCalledWith(USER.id);
  });

  it('create forwards dto and user.id to service', async () => {
    const dto = { title: 'X' } as unknown as CreateTemplateDto;
    const t = makeTemplate({ title: 'X' });
    svc.create.mockResolvedValue(t);
    const out = await ctrl.create(USER, dto);
    expect(out).toBe(t);
    expect(svc.create).toHaveBeenCalledWith(USER.id, dto);
  });

  it('get forwards user.id + id to service', async () => {
    const t = makeTemplate();
    svc.get.mockResolvedValue(t);
    const out = await ctrl.get(USER, ID);
    expect(out).toBe(t);
    expect(svc.get).toHaveBeenCalledWith(USER.id, ID);
  });

  it('update forwards user.id, id, dto to service', async () => {
    const dto = { title: 'New' } as unknown as UpdateTemplateDto;
    const t = makeTemplate({ title: 'New' });
    svc.update.mockResolvedValue(t);
    const out = await ctrl.update(USER, ID, dto);
    expect(out).toBe(t);
    expect(svc.update).toHaveBeenCalledWith(USER.id, ID, dto);
  });

  it('remove returns void; service receives user.id + id', async () => {
    svc.remove.mockResolvedValue(undefined);
    await expect(ctrl.remove(USER, ID)).resolves.toBeUndefined();
    expect(svc.remove).toHaveBeenCalledWith(USER.id, ID);
  });

  it('use forwards user.id + id and returns the bumped row', async () => {
    const bumped = makeTemplate({ uses_count: 1, last_used_at: '2026-04-30T00:00:00.000Z' });
    svc.use.mockResolvedValue(bumped);
    const out = await ctrl.use(USER, ID);
    expect(out).toBe(bumped);
    expect(svc.use).toHaveBeenCalledWith(USER.id, ID);
  });

  describe('uploadExample', () => {
    it('forwards file buffer + mimetype to service', async () => {
      const buffer = Buffer.from('%PDF-1.4 hi %%EOF', 'utf8');
      const t = makeTemplate({ has_example_pdf: true });
      svc.attachExamplePdf.mockResolvedValue(t);
      const file = { buffer, mimetype: 'application/pdf' } as Express.Multer.File;
      const out = await ctrl.uploadExample(USER, ID, file);
      expect(out).toBe(t);
      expect(svc.attachExamplePdf).toHaveBeenCalledWith(USER.id, ID, buffer, 'application/pdf');
    });

    it('passes undefined buffer + mime when no file uploaded (service decides)', async () => {
      // The controller doesn't gate this — the service throws BadRequest
      // for empty bodies. The point of the test is that the controller
      // forwards rather than swallowing the missing file.
      svc.attachExamplePdf.mockRejectedValue(new Error('example_pdf_empty'));
      await expect(ctrl.uploadExample(USER, ID, undefined)).rejects.toThrow('example_pdf_empty');
      expect(svc.attachExamplePdf).toHaveBeenCalledWith(USER.id, ID, undefined, undefined);
    });
  });

  describe('downloadExample', () => {
    it('streams the bytes via res.end with Content-Length + Cache-Control headers', async () => {
      const buf = Buffer.from('%PDF-1.4 sample %%EOF', 'utf8');
      svc.readExamplePdf.mockResolvedValue(buf);
      const res = makeMockRes();
      await ctrl.downloadExample(USER, ID, res);
      expect(svc.readExamplePdf).toHaveBeenCalledWith(USER.id, ID);
      // Must declare exact length so chunked transfer doesn't kick in.
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', String(buf.length));
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'private, max-age=0, must-revalidate',
      );
      expect(res.end).toHaveBeenCalledWith(buf);
    });

    it('propagates service errors (e.g. 404 on missing PDF)', async () => {
      svc.readExamplePdf.mockRejectedValue(new Error('template_example_not_found'));
      const res = makeMockRes();
      await expect(ctrl.downloadExample(USER, ID, res)).rejects.toThrow(
        'template_example_not_found',
      );
      expect(res.end).not.toHaveBeenCalled();
    });
  });
});
