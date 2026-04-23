import type { EmailPreviewContent, EmailPreviewVariant } from '../types';

const REQUEST_CONTENT: EmailPreviewContent = {
  variant: 'request',
  brand: 'Sealed',
  eyebrow: 'Signature request',
  title: 'Ana Torres requested your signature',
  body:
    'Ana Torres has prepared a document for your review and signature. Please open it and ' +
    'complete the highlighted fields when you have a moment.',
  document: {
    name: 'Master services agreement',
    meta: '8 pages · expires in 7 days',
  },
  ctaLabel: 'Review and sign',
  trust: 'Signed with 256-bit encryption. A full audit trail is recorded.',
  footer: 'Sealed · You received this because Ana Torres added your email to a signature request.',
};

const COMPLETED_CONTENT: EmailPreviewContent = {
  variant: 'completed',
  brand: 'Sealed',
  title: 'This document is sealed.',
  body:
    'Everyone has signed the document. A copy is attached for your records along with a ' +
    'link to the full audit trail.',
  signers: [
    { name: 'Ana Torres', email: 'ana@farrow.law' },
    { name: 'Meilin Chen', email: 'meilin@chen.co' },
    { name: 'Jamie Okonkwo', email: 'jamie@okonkwo.co' },
  ],
  primaryActionLabel: 'Download signed copy',
  secondaryActionLabel: 'View audit trail',
  footer: 'Sealed · Secure electronic signatures.',
};

export function getEmailPreviewSeed(variant: EmailPreviewVariant): EmailPreviewContent {
  return variant === 'request' ? REQUEST_CONTENT : COMPLETED_CONTENT;
}
