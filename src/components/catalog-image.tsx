"use client";
import { useEffect, useState } from "react";
import { ref, uploadBytes, getBlob } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { call } from "@/services/api";
import { errorMessage } from "@/lib/utils";
import { Feedback } from "@/components/feedback";
export function CatalogImage({
  companyId,
  kind,
  recordId,
  path,
  writable,
  onSaved,
}: {
  companyId: string;
  kind: "companies" | "models";
  recordId: string;
  path: string;
  writable: boolean;
  onSaved: (path: string) => void;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!path) return;
    let objectUrl = "",
      active = true;
    getBlob(ref(storage, path))
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch((e) => setError(errorMessage(e)));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      setBusy(true);
      setError("");
      if (
        file.size > 10 * 1024 * 1024 ||
        !["image/jpeg", "image/png"].includes(file.type)
      )
        throw Error("Selecione uma imagem JPG ou PNG de até 10 MB.");
      const assetId = crypto.randomUUID(),
        assetPath = `companies/${companyId}/assets/${assetId}`;
      await uploadBytes(ref(storage, assetPath), file, {
        contentType: file.type,
      });
      await call("saveCatalogImage", {
        companyId,
        kind,
        recordId,
        assetId,
        name: file.name,
      });
      onSaved(assetPath);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wide mt-5">
      <label>
        {kind === "companies" ? "Logo da empresa" : "Imagem do modelo"}
      </label>
      {url && (
        <picture>
          <img
            className="catalog-image"
            src={url}
            alt={kind === "companies" ? "Logo da empresa" : "Imagem do modelo"}
          />
        </picture>
      )}
      {writable && (
        <input
          aria-label="Enviar imagem"
          type="file"
          accept="image/jpeg,image/png"
          disabled={busy}
          onChange={(e) => upload(e.target.files?.[0])}
        />
      )}
      <Feedback error={error} />
    </div>
  );
}
