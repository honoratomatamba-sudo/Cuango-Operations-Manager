'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { PublicUser, USER_ROLE_LABELS, UserRole } from '@/lib/auth-types';

interface UsersManagementViewProps {
  currentUser: PublicUser;
  authToken: string | null;
}

export function UsersManagementView({
  currentUser,
  authToken,
}: UsersManagementViewProps) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PublicUser | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('operador');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const buildHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/auth/users', {
        headers: buildHeaders(),
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        users?: PublicUser[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.users)) {
        throw new Error(data.error || 'Falha ao carregar lista de utilizadores.');
      }
      setUsers(data.users);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar utilizadores.'
      );
    } finally {
      setLoading(false);
    }
  }, [buildHeaders]);

  useEffect(() => {
    let isCancelled = false;

    const run = async () => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (authToken) headers.Authorization = `Bearer ${authToken}`;

        const res = await fetch('/api/auth/users', {
          headers,
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          users?: PublicUser[];
          error?: string;
        };
        if (isCancelled) return;
        if (!res.ok || !Array.isArray(data.users)) {
          throw new Error(
            data.error || 'Falha ao carregar lista de utilizadores.'
          );
        }
        setUsers(data.users);
      } catch (err) {
        if (!isCancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Erro ao carregar utilizadores.'
          );
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      isCancelled = true;
    };
  }, [authToken]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        USER_ROLE_LABELS[u.role].toLowerCase().includes(q)
    );
  }, [users, search]);

  const stats = useMemo(() => {
    const activeCount = users.filter((u) => u.active).length;
    const adminCount = users.filter((u) => u.role === 'admin' && u.active).length;
    return { total: users.length, activeCount, adminCount };
  }, [users]);

  const openCreateModal = () => {
    setEditingUser(null);
    setUsername('');
    setFullName('');
    setEmail('');
    setRole('operador');
    setPassword('');
    setShowPassword(false);
    setError(null);
    setFormOpen(true);
  };

  const openEditModal = (u: PublicUser) => {
    setEditingUser(u);
    setUsername(u.username);
    setFullName(u.fullName);
    setEmail(u.email);
    setRole(u.role);
    setPassword('');
    setShowPassword(false);
    setError(null);
    setFormOpen(true);
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSaving(true);

    try {
      if (editingUser) {
        const res = await fetch('/api/auth/users', {
          method: 'PATCH',
          headers: buildHeaders(),
          body: JSON.stringify({
            id: editingUser.id,
            fullName,
            email,
            role,
            newPassword: password.trim() ? password : undefined,
          }),
        });
        const data = (await res.json()) as { user?: PublicUser; error?: string };
        if (!res.ok || !data.user) {
          throw new Error(data.error || 'Erro ao atualizar utilizador.');
        }
        setFeedback(`Utilizador "@${data.user.username}" atualizado com sucesso.`);
      } else {
        const res = await fetch('/api/auth/users', {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({
            username,
            fullName,
            email,
            role,
            password,
          }),
        });
        const data = (await res.json()) as { user?: PublicUser; error?: string };
        if (!res.ok || !data.user) {
          throw new Error(data.error || 'Erro ao criar utilizador.');
        }
        setFeedback(`Utilizador "@${data.user.username}" criado com sucesso.`);
      }

      setFormOpen(false);
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao guardar utilizador.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: PublicUser) => {
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'PATCH',
        headers: buildHeaders(),
        body: JSON.stringify({
          id: u.id,
          active: !u.active,
        }),
      });
      const data = (await res.json()) as { user?: PublicUser; error?: string };
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Não foi possível alterar o estado.');
      }
      setFeedback(
        `Conta "@${data.user.username}" ${
          data.user.active ? 'ativada' : 'desativada'
        }.`
      );
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao alterar estado da conta.'
      );
    }
  };

  const handleDeleteUser = async (u: PublicUser) => {
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'DELETE',
        headers: buildHeaders(),
        body: JSON.stringify({ id: u.id }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Não foi possível eliminar o utilizador.');
      }
      setFeedback(`Utilizador "@${u.username}" eliminado.`);
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao eliminar utilizador.'
      );
    }
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return 'Nunca acedeu';
    try {
      return new Date(iso).toLocaleString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-orange-100 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-slate-900">
            Gestão de Usuários e Senhas
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
            <span>{stats.total} utilizadores registados</span>
            <span aria-hidden="true">·</span>
            <span>{stats.activeCount} ativos</span>
            <span aria-hidden="true">·</span>
            <span>{stats.adminCount} administradores</span>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          <span>Novo Usuário</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
        >
          {error}
        </div>
      )}

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
          {feedback}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar usuário, nome ou perfil..."
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            A mostrar {filteredUsers.length} de {users.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold">
              <tr>
                <th className="px-5 py-3">Usuário</th>
                <th className="px-5 py-3">Nome Completo</th>
                <th className="px-5 py-3">Perfil</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Último Acesso</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-slate-500"
                  >
                    A carregar utilizadores...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-slate-500"
                  >
                    Nenhum utilizador encontrado.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-orange-50/30 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-mono font-medium text-slate-900">
                        @{u.username}
                        {isSelf && (
                          <span className="ml-2 text-[11px] font-sans font-semibold text-orange-700">
                            (Sessão atual)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-900">
                          {u.fullName}
                        </div>
                        {u.email && (
                          <div className="text-[11px] text-slate-500">
                            {u.email}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-700">
                        {USER_ROLE_LABELS[u.role]}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`font-semibold ${
                            u.active ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {u.active ? 'Ativo' : 'Desativado'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono tabular-nums text-slate-600">
                        {formatDateTime(u.lastLoginAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            title="Editar dados ou redefinir senha"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-orange-300 hover:text-orange-700"
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                            <span>Editar / Senha</span>
                          </button>

                          {!isSelf && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(u)}
                                title={
                                  u.active
                                    ? 'Desativar conta'
                                    : 'Ativar conta'
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-orange-300 hover:text-orange-700"
                              >
                                {u.active ? (
                                  <>
                                    <UserX
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    <span>Desativar</span>
                                  </>
                                ) : (
                                  <>
                                    <UserCheck
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    <span>Ativar</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                title="Eliminar usuário"
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
                              >
                                <Trash2
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                                <span>Eliminar</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-form-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs no-print"
        >
          <div className="w-full max-w-md rounded-xl border border-orange-100 bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  {editingUser ? (
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <h2
                    id="user-form-title"
                    className="text-base font-bold text-slate-900"
                  >
                    {editingUser
                      ? `Editar @${editingUser.username}`
                      : 'Novo Usuário'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {editingUser
                      ? 'Atualize os dados ou defina uma nova senha.'
                      : 'Crie uma credencial de acesso ao sistema.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="Fechar janela"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-50 hover:text-orange-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="mt-5 space-y-4">
              {!editingUser && (
                <div>
                  <label
                    htmlFor="usr-username"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Nome de usuário
                  </label>
                  <input
                    id="usr-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex.: joao.silva"
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="usr-fullname"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Nome completo
                </label>
                <input
                  id="usr-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nome e apelido"
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="usr-email"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  E-mail (opcional)
                </label>
                <input
                  id="usr-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="utilizador@cuango.ao"
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="usr-role"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Perfil de acesso
                </label>
                <select
                  id="usr-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none"
                >
                  <option value="admin">Administrador (Acesso total e gestão de usuários)</option>
                  <option value="operador">Operador (Importar PDF, Gmail e relatórios)</option>
                  <option value="visualizador">Visualizador (Consulta e exportação)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="usr-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  {editingUser
                    ? 'Nova senha (deixe em branco para manter)'
                    : 'Senha inicial'}
                </label>
                <div className="relative">
                  <input
                    id="usr-password"
                    type={showPassword ? 'text' : 'password'}
                    required={!editingUser}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full rounded-lg border border-slate-200 pl-3.5 pr-10 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? 'Ocultar senha' : 'Mostrar senha'
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  {saving
                    ? 'A guardar...'
                    : editingUser
                    ? 'Guardar Alterações'
                    : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
