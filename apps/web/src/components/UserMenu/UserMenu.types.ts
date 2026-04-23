import type { HTMLAttributes } from 'react';

export interface UserMenuUser {
  readonly name: string;
  readonly email: string;
  readonly avatarUrl?: string | undefined;
}

export interface UserMenuProps extends HTMLAttributes<HTMLDivElement> {
  readonly user: UserMenuUser;
  readonly onSignOut: () => void;
}
