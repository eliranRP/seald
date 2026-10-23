import { Intro, Stack } from './automations.styles';

/** What a direct visit sees when the flag is off or the API says 404. */
export function NotAvailable() {
  return (
    <Stack>
      <Intro role="status">Not available.</Intro>
    </Stack>
  );
}
