"use client";
import { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { ArrowRight, Layers3, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { auth, configured } from "@/lib/firebase";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { errorMessage } from "@/lib/utils";
const schema = z.object({
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha"),
});
export default function Login() {
  const { user } = useSession(),
    router = useRouter();
  const [reset, setReset] = useState(false),
    [visible, setVisible] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const {
    register,
    handleSubmit,
    getValues,
    formState: { isSubmitting, errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (user) router.replace("/empresas");
  }, [user, router]);
  async function login(v: z.infer<typeof schema>) {
    try {
      setError("");
      if (!configured)
        throw Error("O ambiente Firebase ainda precisa ser configurado.");
      await signInWithEmailAndPassword(auth, v.email, v.password);
      router.replace("/empresas");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function recover() {
    try {
      setError("");
      const email = z.email().parse(getValues("email"));
      await sendPasswordResetEmail(auth, email);
      setSuccess(
        "Se este e-mail estiver cadastrado, você receberá as instruções de recuperação.",
      );
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? "Informe seu e-mail para recuperar a senha."
          : errorMessage(e),
      );
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand light">
          <Layers3 />
          <span>
            Têxtil<span>Flow</span>
          </span>
        </div>
        <div>
          <span className="story-kicker">GESTÃO QUE ACOMPANHA CADA ETAPA</span>
          <h1>
            Da primeira linha
            <br />à última entrega.
          </h1>
          <p>
            Uma visão clara da produção. Mais controle para quem acompanha, mais
            confiança para quem recebe.
          </p>
          <div className="thread-art" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <i key={n} style={{ left: `${n * 12}%` }} />
            ))}
          </div>
          <div className="story-stages">
            <span>Recebimento</span>
            <span>Produção</span>
            <span>Entrega</span>
          </div>
        </div>
        <div className="story-footer">
          <ShieldCheck size={16} />
          Cada empresa, seu acesso. Cada etapa, seu histórico.
        </div>
      </section>
      <section className="login-form">
        <div className="login-box">
          <span className="eyebrow">BEM-VINDO AO TÊXTILFLOW</span>
          <h2>{reset ? "Recupere seu acesso" : "Sua produção começa aqui."}</h2>
          <p>
            {reset
              ? "Informe seu e-mail para receber as instruções."
              : "Entre para acompanhar seus projetos e sua produção."}
          </p>
          <form
            onSubmit={
              reset
                ? (e) => {
                    e.preventDefault();
                    void recover();
                  }
                : handleSubmit(login)
            }
          >
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              placeholder="seuemail@empresa.com.br"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <small className="field-error">{errors.email.message}</small>
            )}
            {!reset && (
              <>
                <div className="password-label">
                  <label htmlFor="password">Senha</label>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      setReset(true);
                      setError("");
                    }}
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="password-field">
                  <input
                    id="password"
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Sua senha"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </>
            )}
            <Feedback error={error} success={success} />
            <Button className="login-submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Entrando…"
                : reset
                  ? "Enviar instruções"
                  : "Entrar na plataforma"}
              <ArrowRight size={18} />
            </Button>
            {reset && (
              <button
                className="text-link"
                type="button"
                onClick={() => setReset(false)}
              >
                Voltar ao login
              </button>
            )}
          </form>
          <p className="invite-note">
            <ShieldCheck size={16} />O acesso é disponibilizado por convite do
            seu inspetor.
          </p>
        </div>
        <footer>TêxtilFlow · Gestão e acompanhamento de produção têxtil</footer>
      </section>
    </main>
  );
}
