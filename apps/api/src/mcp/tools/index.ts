import type { McpTool } from '../tool';
import { accountDeleteTool } from './account/account-delete.tool';
import { accountExportTool } from './account/account-export.tool';
import { apiKeysCreateTool } from './api-keys/api-keys-create.tool';
import { apiKeysListTool } from './api-keys/api-keys-list.tool';
import { apiKeysRevokeTool } from './api-keys/api-keys-revoke.tool';
import { approvalsSetRequiredTool } from './approvals-settings/approvals-set-required.tool';
import { connectedAppsListTool } from './connected-apps/connected-apps-list.tool';
import { connectedAppsRevokeTool } from './connected-apps/connected-apps-revoke.tool';
import { approvalsGetTool } from './approvals/approvals-get.tool';
import { approvalsListTool } from './approvals/approvals-list.tool';
import { automationsDeleteTool } from './automations/automations-delete.tool';
import { automationsGetRunTool } from './automations/automations-get-run.tool';
import { automationsListRunsTool } from './automations/automations-list-runs.tool';
import { automationsListTool } from './automations/automations-list.tool';
import { automationsRetryRunTool } from './automations/automations-retry-run.tool';
import { automationsRotateSecretTool } from './automations/automations-rotate-secret.tool';
import { automationsSetEnabledTool } from './automations/automations-set-enabled.tool';
import { automationsUpsertRecipeTool } from './automations/automations-upsert-recipe.tool';
import { MCP_CONTACTS_TOOLS } from './contacts';
import { envelopesCancelTool } from './cancel/envelopes-cancel.tool';
import { documentsUploadCompleteTool } from './documents/documents-upload-complete.tool';
import { documentsUploadStartTool } from './documents/documents-upload-start.tool';
import { documentsUploadTool } from './documents/documents-upload.tool';
import { envelopesAddDocumentTool } from './documents/envelopes-add-document.tool';
import { envelopesUploadPdfTool } from './documents/envelopes-upload-pdf.tool';
import { envelopesDownloadUrlTool } from './envelopes-download-url.tool';
import { envelopesGetTool } from './envelopes-get.tool';
import { envelopesListEventsTool } from './envelopes-list-events.tool';
import { envelopesListPendingTool } from './envelopes-list-pending.tool';
import { envelopesSearchTool } from './envelopes-search.tool';
import { envelopesStatusTool } from './envelopes-status.tool';
import { MCP_GDRIVE_WRITE_TOOLS } from './gdrive-write';
import { gdriveConnectUrlTool } from './gdrive/gdrive-connect-url.tool';
import { gdriveConversionCancelTool } from './gdrive/gdrive-conversion-cancel.tool';
import { gdriveConversionStatusTool } from './gdrive/gdrive-conversion-status.tool';
import { gdriveImportTool } from './gdrive/gdrive-import.tool';
import { gdriveListAccountsTool } from './gdrive/gdrive-list-accounts.tool';
import { gdriveListFilesTool } from './gdrive/gdrive-list-files.tool';
import { gdriveSearchFilesTool } from './gdrive/gdrive-search-files.tool';
import { meGetTool } from './me-get.tool';
import { envelopesAddSignerTool } from './prepare/envelopes-add-signer.tool';
import { envelopesCreateTool } from './prepare/envelopes-create.tool';
import { envelopesArchiveTool } from './archive/envelopes-archive.tool';
import { envelopesUnarchiveTool } from './archive/envelopes-unarchive.tool';
import { envelopesDeleteDraftTool } from './prepare/envelopes-delete-draft.tool';
import { envelopesPlaceFieldsTool } from './prepare/envelopes-place-fields.tool';
import { envelopesPrepareTool } from './prepare/envelopes-prepare.tool';
import { envelopesRemoveDocumentTool } from './prepare/envelopes-remove-document.tool';
import { envelopesRemoveSignerTool } from './prepare/envelopes-remove-signer.tool';
import { envelopesReorderDocumentsTool } from './prepare/envelopes-reorder-documents.tool';
import { envelopesSetRecipientOrderTool } from './prepare/envelopes-set-recipient-order.tool';
import { envelopesSuggestFieldsTool } from './prepare/envelopes-suggest-fields.tool';
import { envelopesUpdateTool } from './prepare/envelopes-update.tool';
import { MCP_LATER_TOOLS } from './later';
import { MCP_TEMPLATES_TOOLS } from './templates';
import { envelopesPreviewRemindTool } from './remind/envelopes-preview-remind.tool';
import { envelopesRemindTool } from './remind/envelopes-remind.tool';
import { envelopesPreviewSendTool } from './send/envelopes-preview-send.tool';
import { envelopesSendTool } from './send/envelopes-send.tool';
import { envelopesSignAsSignerTool } from './sign-as-signer/envelopes-sign-as-signer.tool';

/** Read tools (WP-17, steps 4–6). */
export const MCP_READ_TOOLS: readonly McpTool[] = [
  meGetTool,
  envelopesSearchTool,
  envelopesGetTool,
  envelopesStatusTool,
  envelopesDownloadUrlTool,
  envelopesListPendingTool,
  envelopesListEventsTool,
];

/** Suggestion tools (WP-20, step 9). Read-only: nothing is placed. */
export const MCP_SUGGEST_TOOLS: readonly McpTool[] = [envelopesSuggestFieldsTool];

/** Write tools (WP-19, steps 8a–8d). Drafts only: nothing here sends. */
export const MCP_WRITE_TOOLS: readonly McpTool[] = [
  // 8b — uploads
  documentsUploadTool,
  documentsUploadStartTool,
  documentsUploadCompleteTool,
  envelopesUploadPdfTool,
  envelopesAddDocumentTool,
  // 8d — Google Drive
  gdriveListAccountsTool,
  gdriveConnectUrlTool,
  gdriveListFilesTool,
  gdriveSearchFilesTool,
  gdriveImportTool,
  gdriveConversionStatusTool,
  gdriveConversionCancelTool,
  // 8c — prepare a draft
  envelopesCreateTool,
  envelopesUpdateTool,
  envelopesDeleteDraftTool,
  envelopesArchiveTool,
  envelopesUnarchiveTool,
  envelopesAddSignerTool,
  envelopesRemoveSignerTool,
  envelopesPlaceFieldsTool,
  envelopesSetRecipientOrderTool,
  envelopesReorderDocumentsTool,
  envelopesRemoveDocumentTool,
  envelopesPrepareTool,
];

/** Approval reads (WP-21, step 7c). There is no tool that decides. */
export const MCP_APPROVAL_TOOLS: readonly McpTool[] = [approvalsGetTool, approvalsListTool];

/** Contacts, templates and the Drive tools that wait on the owner (WP-25, steps 12–14). */
export { MCP_CONTACTS_TOOLS, MCP_GDRIVE_WRITE_TOOLS, MCP_TEMPLATES_TOOLS };

/**
 * Automation tools (WP-30, automations A3). Reads need `automations:read`;
 * writes need `automations:write`, which no key has by default. Listed only
 * while `mcpServer` and `workflowAutomations` are on.
 */
export const MCP_AUTOMATION_TOOLS: readonly McpTool[] = [
  automationsListTool,
  automationsUpsertRecipeTool,
  automationsSetEnabledTool,
  automationsListRunsTool,
  automationsGetRunTool,
  automationsRetryRunTool,
  // WP-45 (D5): delete is a plain write; a secret rotation waits on the owner.
  automationsDeleteTool,
  automationsRotateSecretTool,
];

/**
 * Send, remind and cancel (WP-24, steps 10 and 11), scope
 * `envelopes:send`. Each asks the owner and returns `approval_pending`;
 * only the unattended same-turn send acts without an Approve.
 */
export const MCP_SEND_TOOLS: readonly McpTool[] = [
  envelopesPreviewSendTool,
  envelopesSendTool,
  envelopesPreviewRemindTool,
  envelopesRemindTool,
  envelopesCancelTool,
];

export { MCP_LATER_TOOLS };

/**
 * The approval-gated account, key and owner-signing tools (WP-45, parity
 * plan D5). Scopes `account:admin`, `keys:admin`, `envelopes:sign`; each
 * asks the owner and returns `approval_pending`, except `api_keys_list`
 * (a read) and turning owner approval back on (applies at once).
 */
export const MCP_ACCOUNT_TOOLS: readonly McpTool[] = [
  accountDeleteTool,
  accountExportTool,
  apiKeysListTool,
  apiKeysCreateTool,
  apiKeysRevokeTool,
  approvalsSetRequiredTool,
  envelopesSignAsSignerTool,
  // WP-27's connected apps, dark behind mcpOauth.
  connectedAppsListTool,
  connectedAppsRevokeTool,
];

/**
 * Every shipped tool. A tool that is not shipped is absent, not stubbed.
 * Order is the `tools/list` order.
 */
export const MCP_TOOLS: readonly McpTool[] = [
  ...MCP_READ_TOOLS,
  ...MCP_WRITE_TOOLS,
  ...MCP_APPROVAL_TOOLS,
  ...MCP_SUGGEST_TOOLS,
  ...MCP_AUTOMATION_TOOLS,
  ...MCP_CONTACTS_TOOLS,
  ...MCP_TEMPLATES_TOOLS,
  ...MCP_GDRIVE_WRITE_TOOLS,
  ...MCP_SEND_TOOLS,
  ...MCP_LATER_TOOLS,
  ...MCP_ACCOUNT_TOOLS,
];
