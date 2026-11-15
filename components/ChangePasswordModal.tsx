'use client';

import { FormEvent, useState } from 'react';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';

interface ChangePasswordModalProps {
  open: boolean;
  username: string;
  authToken: string | null;
  onClose: () => void;
}

export function ChangePasswordModal({
  open,
  username,
  authToken,
  onClose,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!open) return null;

  const resetAndClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação da nova senha não coincide.');
      return;
    }

    setSaving(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Não foi possível alterar a senha.');
      }

      setSuccess('Senha atualizada com sucesso.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao atualizar a senha.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs no-print"
    >
      <div className="w-full max-w-md rounded-xl border border-orange-100 bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="change-password-title"
                className="text-base font-bold text-slate-900"
              >
                Alterar Minha Senha
              </h2>
              <p className="text-xs text-slate-500">Conta: @{username}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Fechar janela"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-50 hover:text-orange-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="cp-current"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Senha atual
            </label>
            <input
              id="cp-current"
              type={showPasswords ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="cp-new"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Nova senha
            </label>
            <input
              id="cp-new"
              type={showPasswords ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="cp-confirm"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Confirmar nova senha
            </label>
            <input
              id="cp-confirm"
              type={showPasswords ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPasswords((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-orange-700"
          >
            {showPasswords ? (
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}</span>
          </button>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700"
            >
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-700">
              {success}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {saving ? 'A guardar...' : 'Guardar Nova Senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
