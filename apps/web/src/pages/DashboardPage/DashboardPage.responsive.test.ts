import { describe, it, expect } from 'vitest';
import { Main, StatGrid, TableHead, TableRow } from './DashboardPage.styles';

/**
 * BUG-1 regression — the dashboard chrome had no media queries at all.
 * At 375px the four StatGrid tiles compressed to ~70px each (unreadable),
 * the 6-column TableHead/TableRow grid (1.3fr 1.5fr 1fr 180px 100px 60px)
 * overflowed by ~140px past `space[12]` (48px) horizontal padding, and
 * the row clipped Status / Date / chevron off the right edge with no
 * scrollbar. These assertions inspect the styled-component generated
 * CSS strings and ensure the mobile breakpoint is wired up so the
 * regression cannot return without breaking a test.
 *
 * styled-components stores the template literal pieces on `.componentStyle.rules`
 * (v6) or as a flattened string after first render. We sniff the easier
 * surface — the function name and the raw style object via the `attrs`
 * fallback — by stringifying the styled component's underlying interpolation
 * function. This is intentionally a brittle CSS-string match: that's the
 * point — if anyone strips the @media block, this test fails loudly.
 */

function getStyles(component: { componentStyle?: { rules: unknown[] } }): string {
  // styled-components v6 keeps the template parts under componentStyle.rules
  const rules = component.componentStyle?.rules ?? [];
  return rules
    .map((r) => (typeof r === 'string' ? r : typeof r === 'function' ? r.toString() : ''))
    .join(' ');
}

describe('DashboardPage responsive styles (BUG-1 regression)', () => {
  it('Main shrinks horizontal padding at the mobile breakpoint', () => {
    const css = getStyles(Main as unknown as { componentStyle: { rules: unknown[] } });
    expect(css).toMatch(/@media \(max-width:\s*768px\s*\)/);
    expect(css).toMatch(/space\]\[6\]|space\[6\]|space\[4\]/);
  });

  it('StatGrid collapses from 4 columns to 2 at the mobile breakpoint', () => {
    const css = getStyles(StatGrid as unknown as { componentStyle: { rules: unknown[] } });
    expect(css).toMatch(/repeat\(4, 1fr\)/);
    expect(css).toMatch(/@media \(max-width:\s*768px\s*\)/);
    expect(css).toMatch(/repeat\(2, 1fr\)/);
  });

  it('TableHead hides the column labels below the mobile breakpoint', () => {
    const css = getStyles(TableHead as unknown as { componentStyle: { rules: unknown[] } });
    expect(css).toMatch(/@media \(max-width:\s*768px\s*\)/);
    expect(css).toMatch(/display: none/);
  });

  it('TableRow stacks into named grid areas below the mobile breakpoint', () => {
    const css = getStyles(TableRow as unknown as { componentStyle: { rules: unknown[] } });
    expect(css).toMatch(/@media \(max-width:\s*768px\s*\)/);
    expect(css).toMatch(/grid-template-areas/);
    // Each of the 6 children must be mapped into an area so nothing
    // falls into the wrong cell once the desktop GRID stops applying.
    for (const area of ['doc', 'signers', 'progress', 'status', 'date', 'chev']) {
      expect(css).toMatch(new RegExp(`grid-area: ${area}`));
    }
  });
});
