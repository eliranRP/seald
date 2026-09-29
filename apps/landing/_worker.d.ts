export const MARKETING_PATHS: readonly string[];

export function isSpaRoute(pathname: string): boolean;

interface PagesEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

declare const worker: {
  fetch(request: Request, env: PagesEnv): Promise<Response>;
};

export default worker;
