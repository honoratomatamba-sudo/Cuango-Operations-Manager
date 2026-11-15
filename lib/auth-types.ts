export type UserRole = 'admin' | 'operador' | 'visualizador';

export interface PublicUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: PublicUser | null;
  needsSetup: boolean;
  schemaReady: boolean;
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  visualizador: 'Visualizador',
};
