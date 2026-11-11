"use client";
import { useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { Layers3 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useSession } from "@/hooks/use-session";
import { call } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { errorMessage } from "@/lib/utils";
export default function Invite() {
  const session = useSession(),
    router = useRouter(),
    [token, setToken] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [existing, setExisting] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    // The fragment is intentionally read only in the browser, never sent to SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(location.hash.slice(1));
  }, []);
  async function enter(e: React.FormEvent) {
    e.preventDefault();
    try {
      setBusy(true);
      setError("");
      if (!/^[a-f0-9]{64}$/.test(token))
        throw Error("Link de convite inválido.");
      if (existing) await signInWithEmailAndPassword(auth, email, password);
      else {
        await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(auth.currentUser!);
        setSuccess(
          "Confirme seu e-mail pelo link recebido. Depois, clique em Aceitar convite.",
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function accept() {
    try {
      setBusy(true);
      setError("");
      await auth.currentUser?.reload();
      await auth.currentUser?.getIdToken(true);
      await call("acceptInvite", { token });
      await session.refresh();
      router.push("/empresas");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="invite-page">
      <section className="panel">
        <div className="brand">
          <Layers3 />
          <span>
            Têxtil<span>Flow</span>
          </span>
        </div>
        <h1>Você recebeu um convite.</h1>
        <p>
          Use o e-mail indicado pelo inspetor. O acesso só será liberado após a
          confirmação do seu e-mail e do convite.
        </p>
        <Feedback error={error} success={success} />
        {session.user ? (
          <>
            <p className="mt-5">Conectado como {session.user.email}</p>
            <Button disabled={busy} onClick={accept}>
              Aceitar convite
            </Button>
            {!session.user.emailVerified && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  sendEmailVerification(session.user!)
                    .then(() => setSuccess("E-mail de confirmação enviado."))
                    .catch((e) => setError(errorMessage(e)))
                }
              >
                Reenviar confirmação
              </Button>
            )}
          </>
        ) : (
          <form onSubmit={enter}>
            <label htmlFor="invite-email">E-mail</label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label htmlFor="invite-password">Senha</label>
            <input
              id="invite-password"
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button disabled={busy}>
              {existing ? "Entrar" : "Criar minha conta"}
            </Button>
            <button
              type="button"
              className="text-link block"
              onClick={() => setExisting(!existing)}
            >
              {existing ? "Ainda não tenho conta" : "Já tenho uma conta"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
