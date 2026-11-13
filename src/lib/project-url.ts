export function projectUrl(id: string, tab?: string) {
  const query = new URLSearchParams();
  const spark = process.env.NEXT_PUBLIC_API_MODE === "firestore";
  if (spark) query.set("id", id);
  if (tab) query.set("tab", tab);
  return (
    (spark ? "/projetos/detalhe" : `/projetos/${encodeURIComponent(id)}`) +
    (query.size ? `?${query}` : "")
  );
}
