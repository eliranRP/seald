import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  API_KEY_SCOPES,
  type ConnectedAppListResponse,
  type OAuthConsentDescription,
  type OAuthConsentResult,
  type RevokeConnectedAppResponse,
} from 'shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Public } from '../../auth/public.decorator';
import { ConnectedAppsService } from './connected-apps.service';
import { OAuthAuthorizationService } from './oauth-authorization.service';
import { MCP_OAUTH_CONFIG, type McpOAuthConfig } from './oauth-config';
import { OAuthTokenService, TokenError } from './oauth-token.service';

/**
 * RFC 9728 protected-resource metadata for `/mcp` and RFC 8414
 * authorization-server metadata. Both paths of the resource document are
 * served: the root form the `WWW-Authenticate` header names, and the
 * path-suffixed form (`/.well-known/oauth-protected-resource/mcp`).
 * There is no `registration_endpoint`: dynamic registration is off;
 * clients are pre-registered or use a client id metadata document.
 */
@Public()
@Controller('.well-known')
export class OAuthMetadataController {
  constructor(@Inject(MCP_OAUTH_CONFIG) private readonly config: McpOAuthConfig) {}

  @Get(['oauth-protected-resource', 'oauth-protected-resource/mcp'])
  @Header('Cache-Control', 'public, max-age=300')
  protectedResource(): Record<string, unknown> {
    return {
      resource: this.config.resource,
      authorization_servers: [this.config.issuer],
      scopes_supported: [...API_KEY_SCOPES],
      bearer_methods_supported: ['header'],
      resource_name: 'Seald',
    };
  }

  @Get('oauth-authorization-server')
  @Header('Cache-Control', 'public, max-age=300')
  authorizationServer(): Record<string, unknown> {
    const issuer = this.config.issuer;
    return {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...API_KEY_SCOPES],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
    };
  }
}

/**
 * The OAuth endpoints the client talks to. `/oauth/authorize` is a
 * browser redirect to the consent page; `/oauth/token` and
 * `/oauth/revoke` take form or JSON bodies and answer RFC 6749 JSON.
 */
@Public()
@Controller('oauth')
export class OAuthController {
  private readonly log = new Logger(OAuthController.name);

  constructor(
    private readonly authorization: OAuthAuthorizationService,
    private readonly tokens: OAuthTokenService,
  ) {}

  @Get('authorize')
  @Throttle({ short: { limit: 10, ttl: 1000 }, medium: { limit: 60, ttl: 60_000 } })
  async authorize(@Query() query: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const location = await this.authorization.authorizeRedirect(query);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(302, location);
  }

  @Post('token')
  @Throttle({ short: { limit: 10, ttl: 1000 }, medium: { limit: 60, ttl: 60_000 } })
  async token(@Body() body: unknown, @Res() res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    try {
      const out = await this.tokens.token(asParams(body));
      res.status(200).json(out);
    } catch (err) {
      this.answerError(res, err);
    }
  }

  @Post('revoke')
  @Throttle({ short: { limit: 10, ttl: 1000 }, medium: { limit: 60, ttl: 60_000 } })
  async revoke(@Body() body: unknown, @Res() res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await this.tokens.revoke(asParams(body));
      res.status(200).json({});
    } catch (err) {
      this.answerError(res, err);
    }
  }

  private answerError(res: Response, err: unknown): void {
    if (err instanceof TokenError) {
      res.status(err.code === 'invalid_client' ? 401 : 400).json({ error: err.code });
      return;
    }
    this.log.error(`oauth endpoint failure type=${err instanceof Error ? err.name : typeof err}`);
    res.status(500).json({ error: 'server_error' });
  }
}

/** The consent page's API. Supabase session only (the global AuthGuard). */
@Controller('oauth/consent')
export class OAuthConsentController {
  constructor(private readonly authorization: OAuthAuthorizationService) {}

  @Post('describe')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  describe(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<OAuthConsentDescription> {
    return this.authorization.describe(user, body);
  }

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } })
  decide(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<OAuthConsentResult> {
    return this.authorization.decide(user, body);
  }
}

/** "Connected apps" on the Developers page. Supabase session only. */
@Controller('me/connected-apps')
export class ConnectedAppsController {
  constructor(private readonly apps: ConnectedAppsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthUser): Promise<ConnectedAppListResponse> {
    return this.apps.list(user);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RevokeConnectedAppResponse> {
    return this.apps.revoke(user, id);
  }
}

function asParams(body: unknown): Readonly<Record<string, unknown>> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}
