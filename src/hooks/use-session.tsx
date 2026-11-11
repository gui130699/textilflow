"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { call } from "@/services/api";
import { Company } from "@/types";
type Session = {
  user: User | null;
  loading: boolean;
  companies: Company[];
  company: Company | null;
  canCreate: boolean;
  error: string;
  select: (id: string) => void;
  refresh: () => Promise<void>;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [companies, setCompanies] = useState<Company[]>([]),
    [selected, setSelected] = useState(""),
    [canCreate, setCanCreate] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const r = await call<{ companies: Company[]; canCreate: boolean }>(
        "companiesForUser",
      );
      setCompanies(r.companies);
      setCanCreate(r.canCreate);
      setError("");
    } catch {
      setError(
        "Não foi possível carregar as empresas. Confira a conexão e tente novamente.",
      );
    }
  }, []);
  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setLoading(true);
        setUser(u);
        setCompanies([]);
        setCanCreate(false);
        setSelected(
          u
            ? (sessionStorage.getItem(`textilflow-company-${u.uid}`) ?? "")
            : "",
        );
        if (u) await refresh();
        setLoading(false);
      }),
    [refresh],
  );
  return (
    <Context.Provider
      value={{
        user,
        loading,
        companies,
        company: companies.find((c) => c.id === selected) ?? null,
        canCreate,
        error,
        select: (id) => {
          setSelected(id);
          if (user)
            sessionStorage.setItem(`textilflow-company-${user.uid}`, id);
        },
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw Error("Sessão indisponível");
  return value;
}
