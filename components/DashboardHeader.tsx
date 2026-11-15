'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  DatabaseZap,
  FileBarChart2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Table2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { PublicUser, USER_ROLE_LABELS } from '@/lib/auth-types';
import { OFFICIAL_REPORT_FOOTER } from '@/lib/fleet-analytics';

export type ActiveTab =
  | 'overview'
  | 'reports'
  | 'shifts_drivers'
  | 'cycles'
  | 'powerbi'
  | 'users';

interface DashboardSidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenUpload: () => void;
  totalRecords: number;
  currentUser: PublicUser;
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

const TAB_TITLES: Record<ActiveTab, string> = {
  overview: 'Visão Geral Operacional',
  reports: 'Área de Relatórios',
  shifts_drivers: 'Turnos e Condutores',
  cycles: 'Registos e Ciclos',
  powerbi: 'Automação Gmail & Power BI',
  users: 'Gestão de Usuários e Senhas',
};

export function DashboardSidebar({
  activeTab,
  onTabChange,
  onOpenUpload,
  totalRecords,
  currentUser,
  onOpenChangePassword,
  onLogout,
}: DashboardSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const canUpload = currentUser.role !== 'visualizador';

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof LayoutDashboard;
  }> = [
    { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'reports', label: 'Relatórios', icon: FileBarChart2 },
    { id: 'shifts_drivers', label: 'Turnos e Condutores', icon: Users },
    { id: 'cycles', label: `Registos (${totalRecords})`, icon: Table2 },
    { id: 'powerbi', label: 'Automação Power BI', icon: DatabaseZap },
    ...(currentUser.role === 'admin'
      ? [{ id: 'users' as const, label: 'Usuários', icon: ShieldCheck }]
      : []),
  ];

  const handleSelect = (tab: ActiveTab) => {
    onTabChange(tab);
    setMobileOpen(false);
  };

  const renderSidebarBody = () => (
    <div className="flex h-full flex-col justify-between bg-white">
      <div>
        {/* CUANGO Corporate Logo Header */}
        <div className="border-b border-orange-100 px-5 py-4 bg-white">
          <button
            type="button"
            onClick={() => handleSelect('overview')}
            className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
          >
            <Image
              src="/assets/aistudio/image_33e20192.png"
              alt="CUANGO — Sociedade Mineira do Cuango Lda"
              width={259}
              height={68}
              priority
              referrerPolicy="no-referrer"
              className="h-10 w-auto object-contain"
            />
          </button>
        </div>

        {/* Navigation Links */}
        <nav aria-label="Menu lateral principal" className="px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-orange-600 ${
                  isActive
                    ? 'bg-orange-50 text-orange-700 font-semibold border border-orange-200'
                    : 'text-slate-600 border border-transparent hover:bg-orange-50/50 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-orange-600' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Bottom User Session & Footer */}
      <div className="border-t border-orange-100 bg-white px-5 py-4 space-y-3">
        {canUpload && (
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onOpenUpload();
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-orange-700 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Importar PDF</span>
          </button>
        )}

        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">
              {currentUser.fullName}
            </p>
            <p className="truncate text-[11px] text-slate-500">
              @{currentUser.username} · {USER_ROLE_LABELS[currentUser.role]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenChangePassword();
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-orange-300 hover:text-orange-700 whitespace-nowrap"
            >
              <KeyRound className="h-3 w-3" aria-hidden="true" />
              <span>Senha</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onLogout();
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-red-300 hover:text-red-700 whitespace-nowrap"
            >
              <LogOut className="h-3 w-3" aria-hidden="true" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500 border-t border-slate-100 pt-3">
          {OFFICIAL_REPORT_FOOTER}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed/Sticky Left Sidebar */}
      <aside className="hidden lg:flex lg:w-[264px] lg:shrink-0 lg:flex-col lg:sticky lg:top-0 lg:h-screen border-r border-orange-100 bg-white no-print">
        {renderSidebarBody()}
      </aside>

      {/* Mobile Compact Header Bar (<= 15% mobile viewport cap) */}
      <header className="sticky top-0 z-30 flex lg:hidden items-center justify-between gap-4 border-b border-orange-100 bg-white px-4 py-2.5 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu lateral"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-orange-200 bg-white text-slate-700 hover:bg-orange-50 shrink-0"
          >
            <Menu className="h-5 w-5 text-orange-600" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => handleSelect('overview')}
            className="shrink-0"
          >
            <Image
              src="/assets/aistudio/image_33e20192.png"
              alt="Sociedade Mineira do Cuango"
              width={259}
              height={68}
              priority
              referrerPolicy="no-referrer"
              className="h-8 w-auto object-contain"
            />
          </button>
        </div>

        {canUpload && (
          <button
            type="button"
            onClick={onOpenUpload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Importar PDF</span>
          </button>
        )}
      </header>

      {/* Mobile Slide-Out Sidebar Drawer */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          className="fixed inset-0 z-50 flex lg:hidden no-print"
        >
          <div
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-xs"
          />
          <div className="relative z-10 flex w-[272px] max-w-[82vw] flex-col bg-white shadow-xl border-r border-orange-100">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-3.5 rounded-md p-1.5 text-slate-400 hover:bg-orange-50 hover:text-orange-700"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {renderSidebarBody()}
          </div>
        </div>
      )}
    </>
  );
}

interface WorkspaceTopBarProps {
  activeTab: ActiveTab;
  onOpenUpload: () => void;
  canUpload?: boolean;
}

export function WorkspaceTopBar({
  activeTab,
  onOpenUpload,
  canUpload = true,
}: WorkspaceTopBarProps) {
  return (
    <div className="hidden lg:flex items-center justify-between gap-8 border-b border-orange-100 bg-white px-8 py-3.5 no-print">
      <div className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap shrink-0">
        <span className="font-medium text-slate-600">Sociedade Mineira do Cuango</span>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-slate-900">{TAB_TITLES[activeTab]}</span>
      </div>

      {canUpload && (
        <button
          type="button"
          onClick={onOpenUpload}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-700 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Importar PDF</span>
        </button>
      )}
    </div>
  );
}
