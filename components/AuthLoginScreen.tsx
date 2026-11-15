'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, KeyRound, Lock, UserCheck, UserPlus } from 'lucide-react';
import { PublicUser } from '@/lib/auth-types';
import { OFFICIAL_REPORT_FOOTER } from '@/lib/fleet-analytics';

interface AuthLoginScreenProps {
  needsSetup: boolean;
  onAuthenticated: (user: PublicUser, token: string) => void;
}

export function AuthLoginScreen({
  needsSetup,
  onAuthenticated,
}: AuthLoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'setup'>(
    needsSetup ? 'setup' : 'login'
  );
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'setup') {
      if (password.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('As senhas não coincidem.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint =
        mode === 'setup' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        mode === 'setup'
          ? { username, fullName, email, password }
          : { identifier, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        authenticated?: boolean;
        user?: PublicUser;
        token?: string;
        error?: string;
      };

      if (!res.ok || !data.authenticated || !data.user || !data.token) {
        throw new Error(data.error || 'Falha ao autenticar no sistema.');
      }

      onAuthenticated(data.user, data.token);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao validar credenciais.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-between px-6 py-8">
      <div className="mx-auto w-full max-w-[1120px] flex items-center justify-between border-b border-orange-100 pb-5">
        <Image
          src="/assets/aistudio/image_33e20192.png"
          alt="CUANGO — Sociedade Mineira do Cuango Lda"
          width={259}
          height={68}
          priority
          referrerPolicy="no-referrer"
          className="h-11 w-auto object-contain"
        />
        <span className="text-xs font-medium text-slate-500 hidden sm:inline">
          Gestão Operacional de Frota · Acesso Restrito
        </span>
      </div>

      <main className="mx-auto w-full max-w-[1120px] py-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <section className="lg:col-span-6 space-y-5">
          <p className="text-xs font-semibold text-orange-700 tracking-wide">
            Sociedade Mineira do Cuango Lda
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance leading-tight">
            Plataforma de Análise e Relatórios de Frota
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
            Inicie sessão com o seu usuário e senha corporativa para aceder aos
            painéis operacionais, importação de relatórios Novatronica,
            desempenho por turno e exportações executivas.
          </p>

          <div className="border-t border-orange-100 pt-5 grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs text-slate-600">
            <div>
              <p className="font-semibold text-slate-900">Áreas & Lavarias</p>
              <p className="mt-1">Monitorização de permanência e operação.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Turnos & Condutores</p>
              <p className="mt-1">Produtividade por operador e escala 3×8h.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Controlo de Acesso</p>
              <p className="mt-1">Perfis Administrador, Operador e Visualizador.</p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-6 lg:pl-6">
          <div className="mx-auto w-full max-w-md rounded-xl border border-orange-100 bg-white p-7 sm:p-8 shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {mode === 'setup'
                    ? 'Criar Conta Administrador'
                    : 'Iniciar Sessão'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {mode === 'setup'
                    ? 'Configure o primeiro utilizador administrador do sistema.'
                    : 'Introduza o seu nome de usuário ou e-mail e a sua senha.'}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                {mode === 'setup' ? (
                  <UserPlus className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
            </div>

            {needsSetup && (
              <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-orange-50/70 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('setup');
                  }}
                  className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    mode === 'setup'
                      ? 'bg-white text-orange-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Primeiro Acesso
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('login');
                  }}
                  className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-white text-orange-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Já Tenho Conta
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {mode === 'setup' ? (
                <>
                  <div>
                    <label
                      htmlFor="setup-fullname"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Nome completo
                    </label>
                    <input
                      id="setup-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ex.: Honorato Matamba"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="setup-username"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Usuário
                    </label>
                    <input
                      id="setup-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Ex.: honorato.matamba"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="setup-email"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      E-mail corporativo (opcional)
                    </label>
                    <input
                      id="setup-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nome@cuango.ao"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Usuário ou e-mail
                  </label>
                  <input
                    id="login-identifier"
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Ex.: honorato.matamba"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={
                      mode === 'setup' ? 'new-password' : 'current-password'
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full rounded-lg border border-slate-200 bg-white pl-3.5 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
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

              {mode === 'setup' && (
                <div>
                  <label
                    htmlFor="setup-confirm-password"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Confirmar senha
                  </label>
                  <input
                    id="setup-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
              >
                {mode === 'setup' ? (
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                )}
                <span>
                  {submitting
                    ? 'A validar...'
                    : mode === 'setup'
                    ? 'Criar Administrador e Entrar'
                    : 'Entrar no Sistema'}
                </span>
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-[1120px] border-t border-orange-100 pt-5 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <span>{OFFICIAL_REPORT_FOOTER}</span>
        <span>Cuango Fleet BI · Acesso Corporativo</span>
      </footer>
    </div>
  );
}
