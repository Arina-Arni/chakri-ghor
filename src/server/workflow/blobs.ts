import "server-only";
import { supabaseAdmin } from "@/server/supabase";

/** Where ingested PDFs live (private bucket in production, memory in tests). */
export interface BlobStore {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<Uint8Array | null>;
}

export const BUCKET = "circular-pdfs";

class SupabaseBlobStore implements BlobStore {
  async put(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await supabaseAdmin().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
  }
  async get(path: string) {
    const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }
}

export class MemoryBlobStore implements BlobStore {
  files = new Map<string, Uint8Array>();
  async put(path: string, bytes: Uint8Array) {
    this.files.set(path, bytes);
  }
  async get(path: string) {
    return this.files.get(path) ?? null;
  }
}

let override: BlobStore | null = null;
export function setBlobStoreForTests(b: BlobStore | null): void {
  override = b;
}
export function blobs(): BlobStore {
  return override ?? new SupabaseBlobStore();
}
