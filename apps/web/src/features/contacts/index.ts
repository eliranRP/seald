export {
  CONTACTS_KEY,
  useContactsQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useDeleteContactMutation,
} from './useContacts';
export type { UpdateContactArgs } from './useContacts';
export { listContacts, createContact, updateContactApi, deleteContact } from './contactsApi';
export type { ApiContact, CreateContactInput, UpdateContactInput } from './contactsApi';
