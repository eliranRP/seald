import { describe, it, expect } from 'vitest';
import { Main, StatGrid, TableHead, TableRow, TableScroll } from './DashboardPage.styles';

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

  it('TableScroll scrolls horizontally on desktop and unwinds on mobile', () => {
    // The prod report from 2026-05-30 was the trigger: 7 fixed-px columns
    // (320+220+180+180+110+110+60 ≈ 1180 px before gaps/padding) overflowed
    // the 1280 px Inner container and silently clipped the Created date.
    // The fix wraps the table in a horizontally-scrollable strip so a row
    // that doesn't fit becomes scrollable instead of clipped — and the
    // mobile layout (stacked cards) explicitly unwinds back to `visible`
    // so the document/signer/progress cards never gain a scrollbar.
    const css = getStyles(TableScroll as unknown as { componentStyle: { rules: unknown[] } });
    expect(css).toMatch(/overflow-x: auto/);
    expect(css).toMatch(/@media \(max-width:\s*768px\s*\)/);
    expect(css).toMatch(/overflow-x: visible/);
  });

  it('TableRow stacks into named grid areas below the mobile breakpoint', () => {
    const css = getStyles(TableRow as unknown as { componentStyle: { rules: unknown[] } });
    expect(css).toMatch(/@media \(max-width:\s*768px\s*\)/);
    expect(css).toMatch(/grid-template-areas/);
    // Each of the 7 children must be mapped into an area so nothing
    // falls into the wrong cell once the desktop GRID stops applying.
    // The single `date` area was split into `updated` + `created` when
    // the dashboard added a second date column (see DashboardPage.tsx).
    for (const area of ['doc', 'signers', 'progress', 'status', 'updated', 'created', 'chevron']) {
      expect(css).toMatch(new RegExp(`grid-area: ${area}`));
    }
  });
});
