"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { call } from "@/services/api";
import { errorMessage } from "@/lib/utils";

export default function InspectorSignup() {
  const session = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        setPassword("");
        await sendEmailVerification(credential.user);
        setSuccess(
          "Confirme seu e-mail pelo link enviado e volte para concluir o cadastro.",
        );
        return;
      }
      await user.reload();
      if (!user.emailVerified)
        throw Error("Confirme seu e-mail para continuar.");
      await user.getIdToken(true);
      await call("registerInspector", { name });
      await session.refresh();
      router.push(
        new URLSearchParams(window.location.search).get("empresa") === "1"
          ? "/cadastros/companies?novo=1"
          : "/empresas",
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const user = auth.currentUser;
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await sendEmailVerification(user);
      setSuccess("E-mail de confirmação enviado.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="invite-page">
      <section className="panel">
        <h1>Cadastro de inspetor</h1>
        <p>
          {session.user?.emailVerified
            ? "Seu e-mail já está confirmado. Informe seu nome e conclua o cadastro para cadastrar uma empresa ou solicitar acesso pelo CNPJ."
            : "Confirme seu e-mail e conclua o perfil para cadastrar uma empresa ou solicitar acesso pelo CNPJ."}
        </p>
        <Feedback error={error} success={success} />
        <form onSubmit={submit}>
          <label htmlFor="inspector-name">Nome completo</label>
          <input
            id="inspector-name"
            autoComplete="name"
            minLength={2}
            maxLength={120}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {session.user ? (
            <p>{session.user.email}</p>
          ) : (
            <>
              <label htmlFor="inspector-email">E-mail</label>
              <input
                id="inspector-email"
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label htmlFor="inspector-password">Senha</label>
              <input
                id="inspector-password"
                autoComplete="new-password"
                type="password"
                minLength={12}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </>
          )}
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy || session.loading}>
              {session.user ? "Concluir cadastro" : "Criar conta de inspetor"}
            </Button>
            {session.user && !session.user.emailVerified && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={resend}
              >
                Reenviar confirmação
              </Button>
            )}
          </div>
          <Link
            className="text-link block"
            href={session.user ? "/empresas" : "/login"}
          >
            {session.user ? "Voltar às empresas" : "Já tenho conta"}
          </Link>
        </form>
      </section>
    </main>
  );
}
