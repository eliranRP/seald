import { Badge } from '@/components/Badge';
import { CodeSnippet } from '@/components/CodeSnippet';
import { claudeCodeCommand, cursorConfig, KEY_PLACEHOLDER, mcpServerUrl } from './model';
import { Section, SectionTitle, Tile, TileGrid } from './DevelopersPanel.styles';

/** "Connect a client": server URL with Copy, and snippets with `<YOUR_KEY>` only. */
export function ConnectClient() {
  const url = mcpServerUrl();
  return (
    <Section aria-labelledby="connect-client-title">
      <SectionTitle id="connect-client-title">Connect a client</SectionTitle>
      <CodeSnippet label="Server URL" code={url} />
      <CodeSnippet label="Claude Code" code={claudeCodeCommand(url, KEY_PLACEHOLDER)} />
      <CodeSnippet label="Cursor" code={cursorConfig(url, KEY_PLACEHOLDER)} />
      <TileGrid aria-label="Other apps">
        <Tile>
          ChatGPT <Badge tone="neutral">Later</Badge>
        </Tile>
        <Tile>
          Claude app <Badge tone="neutral">Later</Badge>
        </Tile>
      </TileGrid>
    </Section>
  );
}
