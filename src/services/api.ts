import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
export const serverApi = process.env.NEXT_PUBLIC_API_MODE === "server";
export async function call<T = unknown>(
  name: string,
  data: unknown = {},
): Promise<T> {
  if (serverApi) {
    const user = auth.currentUser;
    if (!user) throw new Error("Entre na sua conta para continuar.");
    const response = await fetch(
      `/api/operations/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      },
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error ?? "Não foi possível concluir a operação.");
    return payload.result as T;
  }
  const result = await httpsCallable<unknown, T>(functions, name)(data);
  return result.data;
}
