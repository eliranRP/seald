import 'styled-components';
import type { SealdTheme } from './theme';

declare module 'styled-components' {
  export interface DefaultTheme extends SealdTheme {}
}
