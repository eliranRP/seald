import { Intro, Stack } from './DevelopersPanel.styles';

/** What a direct visit sees when the flags are off or the API says 404. */
export function NotAvailable() {
  return (
    <Stack>
      <Intro role="status">Not available.</Intro>
    </Stack>
  );
}
