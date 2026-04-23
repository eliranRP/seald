import type { Preview, Decorator } from '@storybook/react';
import type { ReactNode } from 'react';
import { withThemeFromJSXProvider } from '@storybook/addon-themes';
import { SealdThemeProvider } from '../src/providers/SealdThemeProvider';
import { seald } from '../src/styles/theme';
import '../src/styles/tokens.css';

// Adapter so the addon's `theme` prop is explicitly ignored.
// SealdThemeProvider owns the theme internally; the addon toolbar is informational only.
function ThemedProvider({ children }: { readonly children: ReactNode }) {
  return <SealdThemeProvider>{children}</SealdThemeProvider>;
}

const withSealdTheme: Decorator = withThemeFromJSXProvider({
  Provider: ThemedProvider,
  themes: { seald },
  defaultTheme: 'seald',
});

const preview: Preview = {
  decorators: [withSealdTheme],
  parameters: {
    controls: { expanded: true },
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: '#F8FAFC' }, // --bg-app / --ink-50
        { name: 'paper', value: '#FFFFFF' }, // --paper
        { name: 'sunken', value: '#F3F6FA' }, // --bg-sunken / --ink-100
      ],
    },
    a11y: { disable: false },
  },
  tags: ['autodocs'],
};
export default preview;
