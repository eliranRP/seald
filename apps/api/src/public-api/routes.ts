/**
 * The `/api/v1` route table (parity plan WP-35, decision D1): one entry
 * per route, each naming the MCP tool whose service call it makes. The
 * controller, the OpenAPI document and the tests all read this table, so a
 * route cannot exist without a tool, a summary and a documented schema.
 *
 * Path parameters are named after the tool input they fill
 * (`:envelope_id`, `:signer_id`). A route runs through `McpToolRunner`, so
 * scopes, the strict input schema, the dry run, idempotency (`atomic` for
 * send, remind and cancel) and the approval path are exactly the ones MCP
 * has. Nothing here reaches a service or a repository directly.
 *
 * Left out on purpose: the Google Drive tools (Drive is connected in the
 * app), automations, and `envelopes_suggest_fields`. Also not yet routed
 * (WP-26, MCP step 15; each is one table entry plus a summary when v1 wants
 * it): fix a signer, change an expiry, bulk send and `batches_get`, signer
 * access codes and template authoring. Session-only routes
 * (`/me/*`, keys, approvals decisions, signing) are not here and stay
 * unavailable to a key.
 */
export type PublicApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface PublicApiRoute {
  readonly method: PublicApiMethod;
  /** Express path, relative to `/api/v1`. */
  readonly path: string;
  /** The MCP tool this route calls. */
  readonly tool: string;
  readonly tag: string;
  readonly summary: string;
  /** 201 for a create; every other route is 200 (or 202 for `approval_pending`). */
  readonly success?: 200 | 201;
  /** Return only this top-level key of the tool output. */
  readonly pick?: string;
}

const E = '/envelopes/:envelope_id';

export const PUBLIC_API_ROUTES: readonly PublicApiRoute[] = [
  // Account
  {
    method: 'GET',
    path: '/me',
    tool: 'me_get',
    tag: 'Account',
    summary: 'The account this key acts for',
  },

  // Envelopes
  {
    method: 'GET',
    path: '/envelopes',
    tool: 'envelopes_search',
    tag: 'Envelopes',
    summary: 'List and search envelopes',
  },
  {
    method: 'GET',
    path: '/envelopes/pending',
    tool: 'envelopes_list_pending',
    tag: 'Envelopes',
    summary: 'Envelopes waiting on other people',
  },
  {
    method: 'POST',
    path: '/envelopes',
    tool: 'envelopes_create',
    tag: 'Envelopes',
    summary: 'Create an empty draft envelope',
    success: 201,
  },
  {
    method: 'POST',
    path: '/envelopes/prepare',
    tool: 'envelopes_prepare',
    tag: 'Envelopes',
    summary: 'Create a draft with documents, signers and fields in one call',
    success: 201,
  },
  {
    method: 'GET',
    path: E,
    tool: 'envelopes_get',
    tag: 'Envelopes',
    summary: 'Get an envelope with its documents, signers and fields',
  },
  {
    method: 'PATCH',
    path: E,
    tool: 'envelopes_update',
    tag: 'Envelopes',
    summary: 'Change the title, expiry, tags or reminders of a draft',
  },
  {
    method: 'DELETE',
    path: E,
    tool: 'envelopes_delete_draft',
    tag: 'Envelopes',
    summary: 'Delete a draft envelope',
  },
  {
    method: 'GET',
    path: `${E}/status`,
    tool: 'envelopes_status',
    tag: 'Envelopes',
    summary: 'Where each signer is',
  },
  {
    method: 'GET',
    path: `${E}/events`,
    tool: 'envelopes_list_events',
    tag: 'Envelopes',
    summary: 'The audit events of an envelope',
  },
  {
    method: 'GET',
    path: `${E}/download`,
    tool: 'envelopes_download_url',
    tag: 'Envelopes',
    summary: 'A short-lived URL for the sealed PDF, an original or the audit certificate',
  },

  // Documents
  {
    method: 'POST',
    path: '/documents',
    tool: 'documents_upload',
    tag: 'Documents',
    summary: 'Stage a small file (base64, up to 700 KB)',
    success: 201,
  },
  {
    method: 'POST',
    path: '/documents/uploads',
    tool: 'documents_upload_start',
    tag: 'Documents',
    summary: 'Start a large upload (up to 25 MB) and get a PUT URL',
    success: 201,
  },
  {
    method: 'POST',
    path: '/documents/uploads/:upload_id/complete',
    tool: 'documents_upload_complete',
    tag: 'Documents',
    summary: 'Finish a large upload after the bytes were PUT',
  },
  {
    method: 'GET',
    path: `${E}/documents`,
    tool: 'envelopes_get',
    tag: 'Documents',
    summary: 'List the documents of an envelope',
    pick: 'documents',
  },
  {
    method: 'PUT',
    path: `${E}/document`,
    tool: 'envelopes_upload_pdf',
    tag: 'Documents',
    summary: "Attach a staged document as the draft's file",
  },
  {
    method: 'POST',
    path: `${E}/documents`,
    tool: 'envelopes_add_document',
    tag: 'Documents',
    summary: 'Add a staged document to a draft',
    success: 201,
  },
  {
    method: 'PUT',
    path: `${E}/documents/order`,
    tool: 'envelopes_reorder_documents',
    tag: 'Documents',
    summary: 'Put the documents of a draft in a new order',
  },
  {
    method: 'DELETE',
    path: `${E}/documents/:document_id`,
    tool: 'envelopes_remove_document',
    tag: 'Documents',
    summary: 'Remove a document from a draft',
  },

  // Signers and fields
  {
    method: 'POST',
    path: `${E}/signers`,
    tool: 'envelopes_add_signer',
    tag: 'Signers',
    summary: 'Add a signer to a draft',
    success: 201,
  },
  {
    method: 'DELETE',
    path: `${E}/signers/:signer_id`,
    tool: 'envelopes_remove_signer',
    tag: 'Signers',
    summary: 'Remove a signer from a draft',
  },
  {
    method: 'PUT',
    path: `${E}/signing-order`,
    tool: 'envelopes_set_recipient_order',
    tag: 'Signers',
    summary: 'Set parallel or sequential signing and the order',
  },
  {
    method: 'PUT',
    path: `${E}/fields`,
    tool: 'envelopes_place_fields',
    tag: 'Fields',
    summary: 'Place fields on a draft',
  },

  // Send, remind, cancel (owner approval: 202 approval_pending)
  {
    method: 'POST',
    path: `${E}/send/preview`,
    tool: 'envelopes_preview_send',
    tag: 'Sending',
    summary: 'Check a draft is ready and get what the owner will be asked to approve',
  },
  {
    method: 'POST',
    path: `${E}/send`,
    tool: 'envelopes_send',
    tag: 'Sending',
    summary: 'Send for signature (202 approval_pending until the owner approves)',
  },
  {
    method: 'POST',
    path: `${E}/signers/:signer_id/remind/preview`,
    tool: 'envelopes_preview_remind',
    tag: 'Sending',
    summary: 'Check a reminder would go out',
  },
  {
    method: 'POST',
    path: `${E}/signers/:signer_id/remind`,
    tool: 'envelopes_remind',
    tag: 'Sending',
    summary: 'Remind a signer (202 approval_pending until the owner approves)',
  },
  {
    method: 'POST',
    path: `${E}/cancel`,
    tool: 'envelopes_cancel',
    tag: 'Sending',
    summary: 'Cancel an envelope out for signature (202 approval_pending until the owner approves)',
  },

  // Approvals (reads only; the owner decides in Seald)
  {
    method: 'GET',
    path: '/approvals',
    tool: 'approvals_list',
    tag: 'Approvals',
    summary: 'List approvals this account has open or decided',
  },
  {
    method: 'GET',
    path: '/approvals/:approval_id',
    tool: 'approvals_get',
    tag: 'Approvals',
    summary: 'Poll one approval',
  },

  // Templates
  {
    method: 'GET',
    path: '/templates',
    tool: 'templates_list',
    tag: 'Templates',
    summary: 'List templates',
  },
  {
    method: 'GET',
    path: '/templates/:template_id',
    tool: 'templates_get_schema',
    tag: 'Templates',
    summary: 'The signer slots and fields a template needs',
  },
  {
    method: 'POST',
    path: '/templates/:template_id/envelopes',
    tool: 'envelopes_create_from_template',
    tag: 'Templates',
    summary: 'Create a draft envelope from a template',
    success: 201,
  },

  // Contacts
  {
    method: 'GET',
    path: '/contacts',
    tool: 'contacts_list',
    tag: 'Contacts',
    summary: 'List saved contacts',
  },
  {
    method: 'GET',
    path: '/contacts/search',
    tool: 'contacts_search',
    tag: 'Contacts',
    summary: 'Find contacts by name or email',
  },
  {
    method: 'POST',
    path: '/contacts/import',
    tool: 'contacts_import',
    tag: 'Contacts',
    summary: 'Save several contacts at once',
  },
  {
    method: 'POST',
    path: '/contacts',
    tool: 'contacts_create',
    tag: 'Contacts',
    summary: 'Save a contact',
    success: 201,
  },
  {
    method: 'GET',
    path: '/contacts/:contact_id',
    tool: 'contacts_get',
    tag: 'Contacts',
    summary: 'Get a contact',
  },
  {
    method: 'PATCH',
    path: '/contacts/:contact_id',
    tool: 'contacts_update',
    tag: 'Contacts',
    summary: 'Change a contact',
  },
  {
    method: 'DELETE',
    path: '/contacts/:contact_id',
    tool: 'contacts_delete',
    tag: 'Contacts',
    summary: 'Delete a contact',
  },
];

/** Path parameter names of an Express path. */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1] as string);
}

/** `/envelopes/:envelope_id` → `/envelopes/{envelope_id}` */
export function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');
}
