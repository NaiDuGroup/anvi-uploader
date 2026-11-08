import fs from "fs/promises";
import path from "path";

const STORAGE_DIR = path.join(process.cwd(), ".local-uploads");

export async function saveLocalFile(key: string, data: Buffer): Promise<void> {
  const filePath = path.join(STORAGE_DIR, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

export async function readLocalFile(key: string): Promise<Buffer | null> {
  try {
    const filePath = path.join(STORAGE_DIR, key);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export async function deleteLocalFile(key: string): Promise<void> {
  try {
    await fs.unlink(path.join(STORAGE_DIR, key));
  } catch {
    // already gone
  }
}

/** Size of a stored local file, or null when it does not exist. */
export async function statLocalFile(key: string): Promise<{ size: number } | null> {
  try {
    const st = await fs.stat(path.join(STORAGE_DIR, key));
    return st.isFile() ? { size: st.size } : null;
  } catch {
    return null;
  }
}
