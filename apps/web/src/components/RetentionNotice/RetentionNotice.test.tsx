import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { RetentionNotice } from './RetentionNotice';

describe('RetentionNotice', () => {
  it('does not promise a 7-year purge', () => {
    renderWithTheme(<RetentionNotice verifyPath="/verify/abc" />);
    expect(screen.getByRole('link', { name: '/verify/abc' })).toHaveAttribute(
      'href',
      '/verify/abc',
    );
    expect(screen.queryByText(/7 years/i)).not.toBeInTheDocument();
  });

  it('omits the verify link when no path is known', () => {
    renderWithTheme(<RetentionNotice />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/do not delete sealed files on a timer/i)).toBeInTheDocument();
  });
});
