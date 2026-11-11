"use client";
import { useRouter } from "next/navigation";
import { Building2, ArrowUpRight, Plus, RefreshCw } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
export default function Companies() {
  const s = useSession(),
    router = useRouter();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SEU ESPAÇO DE TRABALHO</div>
          <h1>Qual empresa vamos acompanhar?</h1>
          <p>Selecione uma empresa para acessar projetos e produção.</p>
        </div>
        <Button variant="outline" onClick={s.refresh}>
          <RefreshCw size={16} />
          Atualizar
        </Button>
      </div>
      <div className="company-grid">
        {s.companies.map((c) => (
          <button
            className="company-card panel"
            key={c.id}
            disabled={!c.active}
            onClick={() => {
              s.select(c.id);
              router.push("/painel");
            }}
          >
            <span className="company-card-icon">
              <Building2 />
            </span>
            <ArrowUpRight className="company-arrow" />
            <h2>{c.tradeName || c.name}</h2>
            <p>{c.name}</p>
            <span className={`badge ${c.active ? "blue" : "gray"}`}>
              {!c.active
                ? "Inativa"
                : c.role === "inspector"
                  ? "Inspetor · acesso operacional"
                  : "Proprietário · visualização"}
            </span>
          </button>
        ))}
        {s.canCreate && (
          <button
            className="company-card add-company"
            onClick={() => router.push("/cadastros/companies")}
          >
            <Plus />
            <h2>Cadastrar empresa</h2>
            <p>Comece um novo acompanhamento.</p>
          </button>
        )}
      </div>
      {!s.companies.length && !s.canCreate && (
        <div className="panel empty">
          <Building2 />
          <h2>Nenhuma empresa vinculada</h2>
          <p>
            Aceite o convite enviado pelo inspetor para acessar a sua empresa.
          </p>
        </div>
      )}
    </>
  );
}
