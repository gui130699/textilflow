"use client";
import { useState } from "react";
import { useForm, FieldValues } from "react-hook-form";
import { sendPasswordResetEmail } from "firebase/auth";
import { useSession } from "@/hooks/use-session";
import { FormField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { call } from "@/services/api";
import { auth } from "@/lib/firebase";
import { errorMessage } from "@/lib/utils";
export default function Settings() {
  const { user } = useSession(),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FieldValues>({
    defaultValues: { name: user?.displayName ?? "", phone: "" },
  });
  async function save(v: FieldValues) {
    try {
      await call("saveProfile", v);
      await user?.reload();
      setSuccess("Perfil atualizado.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function reset() {
    try {
      await sendPasswordResetEmail(auth, user!.email!);
      setSuccess(
        "Enviamos as instruções para alteração da senha ao seu e-mail.",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MINHA CONTA</div>
          <h1>Configurações</h1>
          <p>Atualize seu perfil e mantenha o acesso protegido.</p>
        </div>
      </div>
      <Feedback error={error} success={success} />
      <section className="panel settings-card">
        <h2>Dados pessoais</h2>
        <form onSubmit={handleSubmit(save)}>
          <div className="form-grid">
            <FormField
              field={{ key: "name", label: "Nome", required: true }}
              register={register}
            />
            <FormField
              field={{ key: "phone", label: "Telefone" }}
              register={register}
            />
          </div>
          <p className="muted mt-5">E-mail de acesso: {user?.email}</p>
          <div className="form-actions">
            <Button disabled={isSubmitting}>Salvar perfil</Button>
          </div>
        </form>
      </section>
      <section className="panel settings-card">
        <h2>Senha e preferências</h2>
        <p className="mb-4">
          Idioma: Português do Brasil · Fuso: America/Sao_Paulo · Moeda: BRL
        </p>
        <Button variant="outline" onClick={reset}>
          Alterar minha senha
        </Button>
      </section>
    </>
  );
}
