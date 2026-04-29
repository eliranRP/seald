import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],

  addons: ['@storybook/addon-a11y', '@storybook/addon-themes', '@storybook/addon-docs'],

  framework: { name: '@storybook/react-vite', options: {} },
  typescript: { reactDocgen: 'react-docgen-typescript' },

  // Storybook spawns its own Vite build that ignores apps/web/vite.config.ts.
  // Mirror the `target: 'esnext'` workaround for vite 5.4.21's esbuild bug
  // (CJS-wrapped destructuring incorrectly flagged for the default target).
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    build: { ...(viteConfig.build ?? {}), target: 'esnext' },
  }),
};
export default config;
