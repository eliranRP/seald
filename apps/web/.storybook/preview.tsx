import type { Preview, Decorator } from '@storybook/react-vite';
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
      options: {
        // --bg-app / --ink-50
        app: { name: 'app', value: '#F8FAFC' },

        // --paper
        paper: { name: 'paper', value: '#FFFFFF' },

        // --bg-sunken / --ink-100
        sunken: { name: 'sunken', value: '#F3F6FA' },
      },
    },
    a11y: { disable: false },
  },

  tags: ['autodocs'],

  initialGlobals: {
    backgrounds: {
      value: 'app',
    },
  },
};
export default preview;
