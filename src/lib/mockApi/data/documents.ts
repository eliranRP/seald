import type { AppDocument } from '../types';

/**
 * Seed the dashboard with representative documents so the list isn't empty on
 * first load. These have no backing PDF (file=null) — opening one jumps to the
 * prepare view with a placeholder canvas. This mirrors the demo/fixture data
 * used in `Design-Guide/ui_kits/dashboard/Dashboard.jsx`.
 */
export const SEED_DOCUMENTS: ReadonlyArray<AppDocument> = [
  {
    id: 'd1',
    title: 'Master services agreement',
    code: 'DOC-8F3A',
    status: 'awaiting-others',
    fields: [],
    signers: [{ id: 'c3', name: 'Ana Torres', email: 'ana@farrow.law', color: '#10B981' }],
    updatedAt: '2026-04-18T10:00:00.000Z',
    file: null,
    totalPages: 8,
  },
  {
    id: 'd2',
    title: 'NDA — Quill Capital',
    code: 'DOC-02B1',
    status: 'awaiting-you',
    fields: [],
    signers: [{ id: 'c2', name: 'Nitsan Yanovitch', email: 'nitsan@yanov.co', color: '#7DD3FC' }],
    updatedAt: '2026-04-20T14:30:00.000Z',
    file: null,
    totalPages: 3,
  },
  {
    id: 'd3',
    title: 'Offer letter — M. Chen',
    code: 'DOC-771A',
    status: 'completed',
    fields: [],
    signers: [{ id: 'c4', name: 'Meilin Chen', email: 'meilin@chen.co', color: '#F59E0B' }],
    updatedAt: '2026-04-14T09:15:00.000Z',
    file: null,
    totalPages: 2,
  },
  {
    id: 'd4',
    title: 'Consulting agreement',
    code: 'DOC-4C0F',
    status: 'completed',
    fields: [],
    signers: [{ id: 'c5', name: 'Priya Kapoor', email: 'priya@kapoor.com', color: '#818CF8' }],
    updatedAt: '2026-04-11T16:40:00.000Z',
    file: null,
    totalPages: 5,
  },
  {
    id: 'd5',
    title: 'Vendor onboarding — Argus',
    code: 'DOC-5E70',
    status: 'draft',
    fields: [],
    signers: [],
    updatedAt: '2026-04-08T11:00:00.000Z',
    file: null,
    totalPages: 4,
  },
];
