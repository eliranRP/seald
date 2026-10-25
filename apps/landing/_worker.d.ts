export const MARKETING_PATHS: readonly string[];

export function isSpaRoute(pathname: string): boolean;

interface PagesEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  /** API hostname proxy (docs/supabase-native-architecture.md); all three or none. */
  API_HOSTNAME?: string;
  API_PROXY_ORIGIN?: string;
  EDGE_PROXY_SECRET?: string;
}

export function apiProxyUrl(
  request: Request,
  env: Pick<PagesEnv, 'API_HOSTNAME' | 'API_PROXY_ORIGIN'>,
): string | null;

declare const worker: {
  fetch(request: Request, env: PagesEnv): Promise<Response>;
};

export default worker;
