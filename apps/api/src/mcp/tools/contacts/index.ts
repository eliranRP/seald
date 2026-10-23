import type { McpTool } from '../../tool';
import { contactsCreateTool } from './contacts-create.tool';
import { contactsDeleteTool } from './contacts-delete.tool';
import { contactsGetTool } from './contacts-get.tool';
import { contactsImportTool } from './contacts-import.tool';
import { contactsListTool } from './contacts-list.tool';
import { contactsSearchTool } from './contacts-search.tool';
import { contactsUpdateTool } from './contacts-update.tool';

/** Contacts (WP-25, step 12). */
export const MCP_CONTACTS_TOOLS: readonly McpTool[] = [
  contactsListTool,
  contactsSearchTool,
  contactsGetTool,
  contactsCreateTool,
  contactsUpdateTool,
  contactsDeleteTool,
  contactsImportTool,
];
