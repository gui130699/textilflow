"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  Layers3,
  LayoutDashboard,
  FolderKanban,
  LibraryBig,
  Factory,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Building2,
} from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { auth } from "@/lib/firebase";

import { Loading, Feedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
const mainLinks = [
  { href: "/painel", label: "Visão geral", icon: LayoutDashboard },
  { href: "/pedidos", label: "Pedidos", icon: FolderKanban },
  { href: "/producao", label: "Produção", icon: Factory },
  { href: "/relatorios", label: "Relatórios", icon: ChartNoAxesCombined },
  { href: "/cadastros", label: "Cadastros", icon: LibraryBig },
];
export default function Workspace({ children }: { children: React.ReactNode }) {
  const s = useSession(),
    path = usePathname(),
    router = useRouter(),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (!s.loading && !s.user) router.replace("/login");
    else if (
      !s.loading &&
      s.user &&
      !s.company &&
      !path.startsWith("/empresas") &&
      !["/cadastros", "/cadastros/companies", "/configuracoes"].includes(path)
    )
      router.replace("/empresas");
  }, [s.loading, s.user, s.company, path, router]);
  if (s.loading || !s.user) return <Loading />;
  if (
    !s.company &&
    !path.startsWith("/empresas") &&
    !["/cadastros", "/cadastros/companies", "/configuracoes"].includes(path)
  )
    return <Loading />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir ao conteúdo
      </a>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link href="/painel" className="brand">
          <Layers3 />
          <span>
            Têxtil<span>Flow</span>
          </span>
        </Link>
        <button
          className="company-switch"
          onClick={() => {
            router.push("/empresas");
            setOpen(false);
          }}
        >
          <span className="company-avatar">
            <Building2 size={18} />
          </span>
          <span>
            <small>EMPRESA ATUAL</small>
            <strong>
              {s.company?.tradeName || s.company?.name || "Selecionar empresa"}
            </strong>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav aria-label="Menu principal">
          <div className="nav-caption">ACOMPANHAMENTO</div>
          {mainLinks.map((item) => (
            <Link
              onClick={() => setOpen(false)}
              className={`nav-item ${path.startsWith(item.href) ? "selected" : ""}`}
              key={item.href}
              href={item.href}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Link
            className="nav-item"
            href="/configuracoes"
            onClick={() => setOpen(false)}
          >
            <Settings size={18} />
            Configurações
          </Link>
        </div>
      </aside>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div>
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </Button>
            <span className="breadcrumb">
              Workspace <span>/</span>{" "}
              <strong>
                {mainLinks.find((l) => path.startsWith(l.href))?.label ||
                  "Gestão"}
              </strong>
            </span>
          </div>
          <div className="topbar-user">
            <span className="role-pill">
              {s.company?.role === "owner"
                ? "Proprietário · leitura"
                : s.company?.role === "inspector" || s.canCreate
                  ? "Inspetor"
                  : "Sem empresa selecionada"}
            </span>
            <span className="user-avatar">
              {(s.user.displayName || s.user.email || "U")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div className="user-name">
              <strong>{s.user.displayName || "Minha conta"}</strong>
              <small>{s.user.email}</small>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sair da conta"
              onClick={() => signOut(auth)}
            >
              <LogOut size={18} />
            </Button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <Feedback error={s.error} />
          <div key={s.company?.id}>{children}</div>
        </main>
        <footer className="app-footer">
          TêxtilFlow <span>Gestão e acompanhamento de produção têxtil</span>
        </footer>
      </div>
    </div>
  );
}
