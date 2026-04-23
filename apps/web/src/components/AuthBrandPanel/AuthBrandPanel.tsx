import { forwardRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { AuthBrandPanelProps } from './AuthBrandPanel.types';
import {
  AuthorName,
  AuthorRole,
  AuthorRow,
  AuthorText,
  Avatar,
  Content,
  GlowBottomLeft,
  GlowTopRight,
  Heading,
  Quote,
  Root,
  Spacer,
  Subheading,
  Testimonial,
  TrustFooter,
  Wordmark,
  WordmarkMark,
} from './AuthBrandPanel.styles';

/**
 * L2 domain component — editorial left-side panel rendered alongside the
 * auth forms (sign-in / sign-up / reset). Hardcoded brand copy, a testimonial
 * card, and a trust footer. Hides itself on narrow viewports so pages can
 * collapse to a single centered form without any consumer coordination.
 */
export const AuthBrandPanel = forwardRef<HTMLElement, AuthBrandPanelProps>((props, ref) => (
  <Root ref={ref} {...props}>
    <GlowTopRight aria-hidden="true" />
    <GlowBottomLeft aria-hidden="true" />

    <Content>
      <Wordmark>
        <WordmarkMark aria-hidden="true">
          <svg viewBox="0 0 40 40" width="16" height="16" fill="none" aria-hidden="true">
            <g transform="translate(6, 6)">
              <path
                d="M2 22 C 6 20, 10 14, 14 12 L 22 4 L 26 8 L 18 16 C 16 20, 10 24, 4 26 Z"
                fill="currentColor"
              />
              <path
                d="M22 4 L 24 2 C 25 1, 26.5 1, 27.5 2 L 28 2.5 C 29 3.5, 29 5, 28 6 L 26 8 Z"
                fill="currentColor"
                opacity="0.7"
              />
            </g>
          </svg>
        </WordmarkMark>
        <span>Sealed</span>
      </Wordmark>

      <Heading>
        Documents, <em>sealed</em> in minutes.
      </Heading>

      <Subheading>
        The modern way to collect signatures. Upload, place fields, and send — your counterparties
        finish signing before the meeting ends.
      </Subheading>

      <Testimonial>
        <Quote>
          &ldquo;We moved our entire contract workflow onto Sealed in a weekend. Our clients finish
          signing before our sales calls end.&rdquo;
        </Quote>
        <AuthorRow>
          <Avatar aria-hidden="true">MR</Avatar>
          <AuthorText>
            <AuthorName>Maya Raskin</AuthorName>
            <AuthorRole>General Counsel, Northwind</AuthorRole>
          </AuthorText>
        </AuthorRow>
      </Testimonial>

      <Spacer />

      <TrustFooter>
        <ShieldCheck size={14} aria-hidden="true" />
        <span>SOC 2 Type II &middot; eIDAS-qualified &middot; 256-bit AES</span>
      </TrustFooter>
    </Content>
  </Root>
));
AuthBrandPanel.displayName = 'AuthBrandPanel';
