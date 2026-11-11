import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
export async function call<T = unknown>(
  name: string,
  data: unknown = {},
): Promise<T> {
  const result = await httpsCallable<unknown, T>(functions, name)(data);
  return result.data;
}
