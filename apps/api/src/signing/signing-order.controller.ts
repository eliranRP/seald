import {
  Body,
  type CanActivate,
  Controller,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { isFeatureEnabled, type Envelope } from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireFlag } from '../common/feature-flag.guard';
import { EnvelopeDocumentsService } from '../envelopes/documents/envelope-documents.service';
import { SetSigningOrderDto } from './dto/set-signing-order.dto';
import { SigningOrderService } from './signing-order.service';

/** Runs before the body pipe, so a dark route is a plain 404, never a 400. */
class SigningOrderFlagGuard implements CanActivate {
  canActivate(): boolean {
    requireFlag('signingOrder');
    return true;
  }
}

/**
 * WP-05 — the sender sets a draft's delivery mode and signing order.
 * 404 while the `signingOrder` flag is off, like a route that does not
 * exist; with it off every send stays parallel. Thin adapter over
 * SigningOrderService (MCP-first rule 2).
 */
@Controller('envelopes')
@UseGuards(SigningOrderFlagGuard)
export class SigningOrderController {
  constructor(
    private readonly svc: SigningOrderService,
    private readonly documents: EnvelopeDocumentsService,
  ) {}

  @Put(':id/signing-order')
  async set(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSigningOrderDto,
  ): Promise<Envelope> {
    const envelope = await this.svc.setOrder(user.id, id, {
      delivery_mode: dto.delivery_mode,
      ...(dto.signers !== undefined
        ? {
            signers: dto.signers.map((s) => ({
              signer_id: s.signer_id,
              signing_order: s.signing_order,
            })),
          }
        : {}),
    });
    // Same response shape as the other envelope routes (WP-03 decoration).
    return isFeatureEnabled('multiDocumentEnvelopes')
      ? this.documents.decorateEnvelope(envelope)
      : envelope;
  }
}
