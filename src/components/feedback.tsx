import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
export function Feedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {success && (
        <div className="notice success" role="status">
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}
    </>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="animate-spin" size={20} />
      Carregando informações…
    </div>
  );
}
