import { DATASETS_BUCKET, supabase } from "./client";

/**
 * The source categories a contributor can file a dataset under. Mirrors the
 * landing page's source list so the vocabulary stays the same end to end.
 */
export const SOURCE_TYPES = [
  { id: "browsing", label: "Browsing & search" },
  { id: "purchases", label: "Purchase history" },
  { id: "health", label: "Health & wearables" },
  { id: "location", label: "Location trails" },
  { id: "media", label: "Streaming & media" },
  { id: "voice", label: "Voice samples" },
  { id: "messaging", label: "Messaging metadata" },
  { id: "dashcam", label: "Dashcam & camera" },
  { id: "other", label: "Something else" },
] as const;

export type SourceTypeId = (typeof SOURCE_TYPES)[number]["id"];

export function sourceLabel(id: string): string {
  return SOURCE_TYPES.find((s) => s.id === id)?.label ?? id;
}

/** One contributed dataset, as stored in the `datasets` table. */
export type Dataset = {
  id: string;
  owner_wallet: string;
  title: string;
  source_type: string;
  description: string | null;
  sha256: string;
  byte_size: number;
  content_type: string | null;
  storage_path: string;
  created_at: string;
};

/**
 * SHA-256 of the file, computed on-device with the Web Crypto API before the
 * bytes ever leave. This hash is what a consent receipt will later commit to,
 * so the protocol can prove what was shared without exposing it.
 */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Datasets owned by a wallet, newest first. */
export async function listDatasets(wallet: string): Promise<Dataset[]> {
  const { data, error } = await supabase
    .from("datasets")
    .select("*")
    .eq("owner_wallet", wallet)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Uploads the file to storage under the wallet's folder, then records its
 * metadata. The storage path is namespaced by wallet so one contributor's
 * files never collide with another's.
 */
export async function createDataset(input: {
  wallet: string;
  title: string;
  sourceType: SourceTypeId;
  description: string;
  file: File;
}): Promise<Dataset> {
  const sha256 = await hashFile(input.file);
  // Content-addressed name keeps identical files from overwriting each other
  // meaningfully while staying stable per (wallet, content).
  const ext = input.file.name.includes(".")
    ? input.file.name.slice(input.file.name.lastIndexOf("."))
    : "";
  const storagePath = `${input.wallet}/${sha256}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(DATASETS_BUCKET)
    .upload(storagePath, input.file, {
      contentType: input.file.type || "application/octet-stream",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("datasets")
    .insert({
      owner_wallet: input.wallet,
      title: input.title.trim(),
      source_type: input.sourceType,
      description: input.description.trim() || null,
      sha256,
      byte_size: input.file.size,
      content_type: input.file.type || null,
      storage_path: storagePath,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Dataset;
}
