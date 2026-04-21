import 'styled-components';
import type { SealdTheme } from './theme';

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends SealdTheme {}
}
