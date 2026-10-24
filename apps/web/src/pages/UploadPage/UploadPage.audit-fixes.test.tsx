import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { UploadPage } from './UploadPage';
import { seald } from '../../styles/theme';

/**
 * Header regression coverage. The v2 redesign drops the centered sentence
 * subtitle (PR-7 H-1 covered its alignment): the page is a left-aligned
 * title with no explanatory text unless the host passes one.
 */

function renderPage(props: { subtitle?: string } = {}) {
  return render(
    <ThemeProvider theme={seald}>
      <UploadPage onFileSelected={vi.fn()} {...props} />
    </ThemeProvider>,
  );
}

describe('UploadPage header', () => {
  it('renders the title and no subtitle by default', () => {
    renderPage();
    const heading = screen.getByRole('heading', { level: 1, name: /new document/i });
    expect(heading.parentElement?.querySelector('p')).toBeNull();
  });

  it('still renders a subtitle when the host passes one', () => {
    renderPage({ subtitle: 'Pick a file' });
    expect(screen.getByText('Pick a file')).toBeInTheDocument();
  });
});
