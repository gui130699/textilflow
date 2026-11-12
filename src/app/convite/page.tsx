"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
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
const validToken = /^[a-f0-9]{64}$/;
export default function Invite() {
  const session = useSession(),
    router = useRouter(),
    [token, setToken] = useState(""),
    [inviteLink, setInviteLink] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [existing, setExisting] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    // The fragment is intentionally read only in the browser, never sent to SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(
      validToken.test(location.hash.slice(1)) ? location.hash.slice(1) : "",
    );
  }, []);
  function openInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const link = new URL(inviteLink.trim());
      const code = link.hash.slice(1);
      if (
        link.origin !== location.origin ||
        link.pathname.replace(/\/$/, "") !== "/convite" ||
        !validToken.test(code)
      ) {
        throw Error();
      }
      history.replaceState(history.state, "", "/convite#" + code);
      setToken(code);
    } catch {
      setError("Cole o link completo do convite enviado pelo seu inspetor.");
    }
  }
  async function enter(e: React.FormEvent) {
    e.preventDefault();
    try {
      setBusy(true);
      setError("");
      if (!validToken.test(token)) throw Error("Link de convite inválido.");
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
        <h1>{token ? "Você recebeu um convite." : "Criar conta"}</h1>
        <p>
          {token
            ? "Use o e-mail indicado pelo inspetor. O acesso só será liberado após a confirmação do seu e-mail e do convite."
            : "Cole o link que seu inspetor enviou para iniciar o cadastro. Se ainda não recebeu um convite, solicite um ao seu inspetor."}
        </p>
        <Feedback error={error} success={success} />
        {!token ? (
          <form onSubmit={openInvite}>
            <label htmlFor="invite-link">Link do convite</label>
            <input
              id="invite-link"
              type="url"
              autoComplete="off"
              required
              value={inviteLink}
              onChange={(e) => setInviteLink(e.target.value)}
            />
            <Button>Continuar com convite</Button>
            <Link className="text-link block" href="/login">
              Voltar ao login
            </Link>
          </form>
        ) : session.user ? (
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
