import type { Preview, Decorator } from '@storybook/react';
import { withThemeFromJSXProvider } from '@storybook/addon-themes';
import { SealdThemeProvider } from '../src/providers/SealdThemeProvider';
import '../src/styles/tokens.css';

const withSealdTheme: Decorator = withThemeFromJSXProvider({
  Provider: SealdThemeProvider,
  themes: { seald: {} },
  defaultTheme: 'seald',
});

const preview: Preview = {
  decorators: [withSealdTheme],
  parameters: {
    controls: { expanded: true },
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: '#F8FAFC' },
        { name: 'paper', value: '#FFFFFF' },
        { name: 'sunken', value: '#F3F6FA' },
      ],
    },
    a11y: { disable: false },
  },
  tags: ['autodocs'],
};
export default preview;
