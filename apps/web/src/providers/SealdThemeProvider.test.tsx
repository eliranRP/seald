import { render, screen } from '@testing-library/react';
import styled from 'styled-components';
import { describe, it, expect } from 'vitest';
import { SealdThemeProvider } from './SealdThemeProvider';

const Probe = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.accent.base};
`;

describe('SealdThemeProvider', () => {
  it('injects the Seald theme so styled children can read theme.*', () => {
    render(
      <SealdThemeProvider>
        <Probe data-testid="probe">ok</Probe>
      </SealdThemeProvider>,
    );
    const el = screen.getByTestId('probe');
    expect(el).toBeInTheDocument();
    const style = window.getComputedStyle(el);
    expect(style.fontFamily).toContain('Inter');
  });
});
