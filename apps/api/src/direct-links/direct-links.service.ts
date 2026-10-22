import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import {
  DIRECT_LINK_DAILY_CAP_DEFAULT,
  PUBLIC_SENDER_FALLBACK,
  expandTemplateFields,
  isFeatureEnabled,
  type ClaimDirectLinkResult,
  type DirectLink,
  type DirectLinkWithToken,
  type PublicDirectLink,
  type Template,
} from 'shared';
import { EnvelopesService } from '../envelopes/envelopes.service';
import { AccessAuthService } from '../signing/access-auth/access-auth.service';
import { SigningOrderService } from '../signing/signing-order.service';
import { TemplateApplyService } from '../templates/template-apply.service';
import { TemplatesRepository } from '../templates/templates.repository';
import { TemplatesService } from '../templates/templates.service';
import {
  generateDirectLinkToken,
  hashClaimEmail,
  hashDirectLinkToken,
  isWellFormedDirectLinkToken,
} from './direct-link-token';
import {
  DIRECT_LINK_LIMITS,
  DirectLinkRateLimiter,
  type RateLimitDecision,
} from './direct-link-rate-limiter';
import { placementsFromTemplate, slotHasSignatureField } from './direct-link-layout';
import {
  DirectLinkExistsError,
  DirectLinksRepository,
  type DirectLinkRecord,
} from './direct-links.repository';

export interface Audit {
  readonly ip: string | null;
  readonly user_agent: string | null;
}

/** The visitor, as typed into the public form. */
export interface Visitor {
  readonly name: string;
  readonly email: string;
}

/** 429 carrying `Retry-After`. */
export class DirectLinkThrottledException extends HttpException {
  constructor(
    readonly retryAfterSeconds: number,
    slug: 'rate_limited' | 'direct_link_daily_cap',
  ) {
    super(slug, HttpStatus.TOO_MANY_REQUESTS);
  }
}

const NOT_FOUND = 'not_found';

/** Names go into emails and the audit trail: no control characters or angle brackets. */
export function cleanVisitorName(raw: string): string {
  return Array.from(raw)
    .map((ch) => (ch === '\t' || ch === '\n' || ch === '\r' ? ' ' : ch))
    .filter((ch) => {
      // Control characters, DEL and the angle brackets are dropped.
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f && ch !== '<' && ch !== '>';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Template direct links (WP-37, flag `directLinks`).
 *
 * Owner side: create, configure, rotate and revoke the one link a template
 * may have. Public side: show the template title and sender name, and turn a
 * name + email into a new envelope. The envelope is built by the same
 * services the owner's own send uses (`EnvelopesService`,
 * `TemplateApplyService`, `SigningOrderService`, `AccessAuthService`), and
 * the visitor gets the normal invite email, so they prove control of the
 * address by opening it. Nothing about a visitor is shown back to anyone.
 */
@Injectable()
export class DirectLinksService {
  private readonly logger = new Logger(DirectLinksService.name);

  constructor(
    private readonly repo: DirectLinksRepository,
    private readonly templatesRepo: TemplatesRepository,
    private readonly templates: TemplatesService,
    private readonly apply: TemplateApplyService,
    private readonly envelopes: EnvelopesService,
    private readonly signingOrder: SigningOrderService,
    private readonly accessAuth: AccessAuthService,
    private readonly limiter: DirectLinkRateLimiter,
  ) {}

  // ---- owner side ---------------------------------------------------------

  async get(owner_id: string, template_id: string): Promise<DirectLink | null> {
    await this.templates.get(owner_id, template_id);
    const link = await this.repo.findLiveByTemplate(owner_id, template_id);
    return link ? this.view(link) : null;
  }

  async create(
    owner: { readonly id: string; readonly email: string | null },
    template_id: string,
    input: { signer_slot: string; daily_cap?: number; sender_name?: string | null },
  ): Promise<DirectLinkWithToken> {
    if (!owner.email) throw new BadRequestException('sender_email_missing');
    const template = await this.templates.get(owner.id, template_id);
    await this.assertEligible(template, input.signer_slot);
    const gen = generateDirectLinkToken();
    let link: DirectLinkRecord;
    try {
      link = await this.repo.create({
        template_id,
        owner_id: owner.id,
        token_hash: gen.tokenHash,
        prefix: gen.prefix,
        signer_slot: input.signer_slot,
        daily_cap: input.daily_cap ?? DIRECT_LINK_DAILY_CAP_DEFAULT,
        sender_name: input.sender_name?.trim() ? input.sender_name.trim() : null,
        sender_email: owner.email,
      });
    } catch (err) {
      if (err instanceof DirectLinkExistsError) throw new ConflictException('direct_link_exists');
      throw err;
    }
    return { link: await this.view(link), token: gen.token, path: `/d/${gen.token}` };
  }

  async update(
    owner: { readonly id: string; readonly email: string | null },
    template_id: string,
    patch: {
      enabled?: boolean;
      signer_slot?: string;
      daily_cap?: number;
      sender_name?: string | null;
    },
  ): Promise<DirectLink> {
    const template = await this.templates.get(owner.id, template_id);
    const current = await this.repo.findLiveByTemplate(owner.id, template_id);
    if (!current) throw new NotFoundException('direct_link_not_found');
    // Re-check whenever the link would be live or point somewhere new, so a
    // template edited since the link was made cannot be switched back on broken.
    const slot = patch.signer_slot ?? current.signer_slot;
    if (patch.enabled === true || patch.signer_slot !== undefined) {
      await this.assertEligible(template, slot);
    }
    const updated = await this.repo.update(owner.id, template_id, {
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.signer_slot !== undefined ? { signer_slot: patch.signer_slot } : {}),
      ...(patch.daily_cap !== undefined ? { daily_cap: patch.daily_cap } : {}),
      ...(patch.sender_name !== undefined
        ? { sender_name: patch.sender_name?.trim() ? patch.sender_name.trim() : null }
        : {}),
      ...(owner.email ? { sender_email: owner.email } : {}),
    });
    if (!updated) throw new NotFoundException('direct_link_not_found');
    return this.view(updated);
  }

  /** New URL, same settings. The old URL stops working at once. */
  async rotate(
    owner: { readonly id: string; readonly email: string | null },
    template_id: string,
  ): Promise<DirectLinkWithToken> {
    await this.templates.get(owner.id, template_id);
    const gen = generateDirectLinkToken();
    const link = await this.repo.rotate(owner.id, template_id, {
      token_hash: gen.tokenHash,
      prefix: gen.prefix,
      sender_email: owner.email,
    });
    if (!link) throw new NotFoundException('direct_link_not_found');
    return { link: await this.view(link), token: gen.token, path: `/d/${gen.token}` };
  }

  async revoke(owner_id: string, template_id: string): Promise<void> {
    await this.templates.get(owner_id, template_id);
    const ok = await this.repo.revoke(owner_id, template_id);
    if (!ok) throw new NotFoundException('direct_link_not_found');
  }

  // ---- public side --------------------------------------------------------

  /** The template title and sender name, nothing else. 404 for anything unusable. */
  async publicView(token: string, ip: string | null): Promise<PublicDirectLink> {
    this.throttle(
      `ip-view:${ip ?? 'unknown'}`,
      DIRECT_LINK_LIMITS.ipView.limit,
      DIRECT_LINK_LIMITS.ipView.windowMs,
      'rate_limited',
    );
    const { link, template } = await this.resolveUsable(token);
    return {
      template_title: template.title,
      sender_name: link.sender_name ?? PUBLIC_SENDER_FALLBACK,
    };
  }

  async claim(
    token: string,
    visitor: Visitor,
    audit: Audit,
    now: Date = new Date(),
  ): Promise<ClaimDirectLinkResult> {
    this.throttle(
      `ip-claim:${audit.ip ?? 'unknown'}`,
      DIRECT_LINK_LIMITS.ipClaim.limit,
      DIRECT_LINK_LIMITS.ipClaim.windowMs,
      'rate_limited',
    );
    const { link, template } = await this.resolveUsable(token);
    this.throttle(
      `link-claim:${link.id}`,
      DIRECT_LINK_LIMITS.linkClaim.limit,
      DIRECT_LINK_LIMITS.linkClaim.windowMs,
      'rate_limited',
    );

    const name = cleanVisitorName(visitor.name);
    const email = visitor.email.trim().toLowerCase();
    if (name.length === 0) throw new BadRequestException('validation_error');

    const reserved = await this.repo.reserveClaim({
      link_id: link.id,
      email_hash: hashClaimEmail(email),
      daily_cap: link.daily_cap,
      now,
    });
    if (reserved.kind === 'cap_reached') {
      throw new DirectLinkThrottledException(60 * 60, 'direct_link_daily_cap');
    }
    // The same address already got an envelope from this link today. Answer
    // like a success: the page cannot be used to probe who signed up.
    if (reserved.kind === 'duplicate') return { status: 'check_your_email' };

    try {
      await this.createAndSend(link, template, { name, email }, audit, reserved.claim_id);
    } catch (err) {
      await this.repo.releaseClaim(reserved.claim_id).catch(() => undefined);
      throw err;
    }
    return { status: 'check_your_email' };
  }

  // ---- internals ----------------------------------------------------------

  private async view(link: DirectLinkRecord): Promise<DirectLink> {
    return {
      id: link.id,
      template_id: link.template_id,
      signer_slot: link.signer_slot,
      enabled: link.enabled,
      prefix: link.prefix,
      daily_cap: link.daily_cap,
      sender_name: link.sender_name,
      created_last_24h: await this.repo.countRecentClaims(link.id, new Date()),
      created_at: link.created_at.toISOString(),
      updated_at: link.updated_at.toISOString(),
    };
  }

  private throttle(
    key: string,
    limit: number,
    windowMs: number,
    slug: 'rate_limited' | 'direct_link_daily_cap',
  ): void {
    const d: RateLimitDecision = this.limiter.hit(key, limit, windowMs);
    if (!d.allowed) throw new DirectLinkThrottledException(d.retryAfterSeconds, slug);
  }

  /**
   * Token to enabled link plus a template that can still be sent. Every
   * miss is the same 404, so a disabled link, a rotated-away link, a
   * deleted template and a guessed token cannot be told apart.
   */
  private async resolveUsable(
    token: string,
  ): Promise<{ link: DirectLinkRecord; template: Template }> {
    if (!isWellFormedDirectLinkToken(token)) throw new NotFoundException(NOT_FOUND);
    const link = await this.repo.findLiveByTokenHash(hashDirectLinkToken(token));
    if (!link || !link.enabled) throw new NotFoundException(NOT_FOUND);
    const template = await this.templatesRepo.findOneByOwner(link.owner_id, link.template_id);
    if (!template) throw new NotFoundException(NOT_FOUND);
    try {
      await this.assertEligible(template, link.signer_slot);
    } catch {
      throw new NotFoundException(NOT_FOUND);
    }
    return { link, template };
  }

  /**
   * A template can back a direct link only when the PDF is saved with it,
   * the bound slot exists, and every slot owns a signature or initials field
   * (the send rule; otherwise every visitor would hit a 400 on send).
   */
  private async assertEligible(template: Template, slot: string): Promise<void> {
    if (!template.has_example_pdf) {
      throw new UnprocessableEntityException('template_needs_example_pdf');
    }
    if (!template.last_signers.some((s) => s.id === slot)) {
      throw new BadRequestException('signer_slot_invalid');
    }
    const fields = expandTemplateFields(template.field_layout, 1, template.last_signers);
    for (const s of template.last_signers) {
      if (!slotHasSignatureField(fields, s.id)) {
        throw new UnprocessableEntityException('signer_without_signature_field');
      }
    }
  }

  private async createAndSend(
    link: DirectLinkRecord,
    template: Template,
    visitor: Visitor,
    audit: Audit,
    claim_id: string,
  ): Promise<void> {
    const owner_id = link.owner_id;
    if (!link.sender_email) throw new BadRequestException('sender_email_missing');
    const draft = await this.envelopes.createDraft(owner_id, { title: template.title }, audit);
    try {
      const pdf = await this.templates.readExamplePdf(owner_id, template.id);
      const withFile = await this.envelopes.uploadOriginal(owner_id, draft.id, pdf);
      const pages = withFile.original_pages ?? 1;
      const size = await firstPageSize(pdf);

      // Slots keep the template's order, so arrival order is the signing
      // order a parallel envelope would have had.
      const signerIdBySlot = new Map<string, string>();
      for (const slot of template.last_signers) {
        const isVisitor = slot.id === link.signer_slot;
        try {
          const signer = await this.envelopes.addSigner(owner_id, draft.id, {
            email: isVisitor ? visitor.email : slot.email,
            name: isVisitor ? visitor.name : slot.name,
            color: slot.color,
          });
          signerIdBySlot.set(slot.id, signer.id);
        } catch (err) {
          if (err instanceof ConflictException) throw new BadRequestException('email_unavailable');
          throw err;
        }
      }

      const applied = await this.apply.apply(owner_id, template.id, pages);
      const placements = placementsFromTemplate(applied.fields, size, signerIdBySlot, {
        keepMeta: isFeatureEnabled('fieldMetaV2'),
      });
      await this.envelopes.replaceFields(owner_id, draft.id, placements);

      if (isFeatureEnabled('signingOrder') && template.delivery_mode === 'sequential') {
        await this.signingOrder.setOrder(owner_id, draft.id, {
          delivery_mode: 'sequential',
          signers: template.last_signers.flatMap((slot, i) => {
            const signer_id = signerIdBySlot.get(slot.id);
            return signer_id ? [{ signer_id, signing_order: slot.signing_order ?? i + 1 }] : [];
          }),
        });
      }

      // The emailed code is the second proof of control when it is available.
      const visitorSigner = signerIdBySlot.get(link.signer_slot);
      if (isFeatureEnabled('signerAccessAuth') && visitorSigner) {
        await this.accessAuth.patchSettings(owner_id, draft.id, {
          signers: [{ signer_id: visitorSigner, access_auth: 'email_otp' }],
        });
      }

      await this.repo.attachEnvelope(claim_id, {
        envelope_id: draft.id,
        template_id: template.id,
        direct_link_id: link.id,
      });
      await this.envelopes.send(
        owner_id,
        draft.id,
        { email: link.sender_email, name: link.sender_name },
        audit,
      );
      await this.templates.use(owner_id, template.id).catch(() => undefined);
    } catch (err) {
      await this.envelopes.deleteDraft(owner_id, draft.id).catch(() => undefined);
      if (!(err instanceof HttpException)) {
        this.logger.error(`direct link ${link.id}: envelope creation failed`, err as Error);
      }
      throw err;
    }
  }
}

async function firstPageSize(pdf: Buffer): Promise<{ width: number; height: number }> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const { width, height } = doc.getPage(0).getSize();
  return { width, height };
}
