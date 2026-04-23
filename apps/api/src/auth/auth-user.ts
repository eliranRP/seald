export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly provider: string | null;
}
