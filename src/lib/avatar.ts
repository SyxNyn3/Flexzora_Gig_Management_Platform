// AvatarService — profile photo upload.
// Photos go to the public `avatars` bucket under {profile_id}/{uuid}.webp.
// Bucket policies restrict writes to the owner's folder; the client
// downscales to 512px webp first so phone photos (5-10 MB) fit the 2 MB
// bucket cap and load fast everywhere avatars render.
import { supabase } from '@/lib/supabase';

type Result<T> = { data: T | null; error: string | null };
const ok = <T,>(data: T): Result<T> => ({ data, error: null });
const fail = <T,>(e: unknown): Result<T> => ({ data: null, error: e instanceof Error ? e.message : String(e) });

const BUCKET = 'avatars';
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_EDGE = 512;

/** Decode → center-crop square → resize to MAX_EDGE → webp blob. */
async function prepareAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    // Square crop: avatars render in circles, so fill the frame instead of
    // letterboxing a wide photo into a tiny centered strip.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const scale = Math.min(1, MAX_EDGE / side);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.round(side * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob) throw new Error('Could not encode image');
    return blob;
  } finally {
    bitmap.close();
  }
}

export class AvatarService {
  /**
   * Upload a new profile photo and return the public URL to store on
   * profiles.avatar_url. Old objects are left in place — avatar_url is the
   * pointer, storage orphans are cheap and a delete policy exists if we
   * ever want cleanup.
   */
  static async upload(profileId: string, file: File): Promise<Result<string>> {
    try {
      if (!ACCEPTED.includes(file.type)) throw new Error('JPEG, PNG, WebP or GIF only');
      const blob = await prepareAvatar(file);
      const path = `${profileId}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'image/webp',
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return ok(data.publicUrl);
    } catch (e) {
      return fail(e);
    }
  }
}
