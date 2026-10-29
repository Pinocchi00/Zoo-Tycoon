import { Directory, Encoding } from '@capacitor/filesystem';
import type { TextStore } from './text-store';

/**
 * The part of Capacitor's Filesystem plugin the store needs, injectable so that tests can pass
 * a fake: the real plugin only works inside the Android app.
 */
export interface NativeFiles {
  readFile: (options: {
    path: string;
    directory: Directory;
    encoding: Encoding;
  }) => Promise<{ data: string | Blob }>;
  writeFile: (options: {
    path: string;
    data: string;
    directory: Directory;
    encoding: Encoding;
  }) => Promise<unknown>;
  deleteFile: (options: { path: string; directory: Directory }) => Promise<void>;
  readdir: (options: {
    path: string;
    directory: Directory;
  }) => Promise<{ files: readonly { name: string; type: 'directory' | 'file' }[] }>;
  mkdir: (options: { path: string; directory: Directory; recursive: boolean }) => Promise<void>;
}

/** Private to the app, removed with it, never seen by other apps. */
const DIRECTORY = Directory.Data;
const FOLDER = 'zoo-refuge';
/** A key becomes a file name: no separator or leading dot may let it leave the folder. */
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function pathOf(key: string): string {
  if (!KEY_PATTERN.test(key)) {
    throw new TypeError(`Invalid storage key "${key}".`);
  }
  return `${FOLDER}/${key}`;
}

async function ensureFolder(files: NativeFiles): Promise<void> {
  try {
    await files.readdir({ path: FOLDER, directory: DIRECTORY });
  } catch {
    // Missing on first launch. If creating it fails too, that error is the one worth reporting.
    await files.mkdir({ path: FOLDER, directory: DIRECTORY, recursive: true });
  }
}

/**
 * Native app storage: one file per key in the app's private folder. Unlike the WebView's
 * IndexedDB, Android never clears it to free space; only uninstalling the app does.
 */
export async function openNativeFilesTextStore(files: NativeFiles): Promise<TextStore> {
  await ensureFolder(files);

  // The plugin's "file not found" error has no stable code across versions: list instead of guessing.
  const keys = async (): Promise<string[]> => {
    const listed = await files.readdir({ path: FOLDER, directory: DIRECTORY });
    return listed.files
      .filter((file) => file.type === 'file' && KEY_PATTERN.test(file.name))
      .map((file) => file.name);
  };

  return {
    keys,
    get: async (key) => {
      const path = pathOf(key);
      if (!(await keys()).includes(key)) {
        return null;
      }
      const { data } = await files.readFile({
        path,
        directory: DIRECTORY,
        encoding: Encoding.UTF8,
      });
      if (typeof data !== 'string') {
        throw new TypeError(`Storage key "${key}" did not read back as text.`);
      }
      return data;
    },
    set: async (key, value) => {
      const path = pathOf(key);
      await files.writeFile({ path, data: value, directory: DIRECTORY, encoding: Encoding.UTF8 });
    },
    remove: async (key) => {
      const path = pathOf(key);
      if ((await keys()).includes(key)) {
        await files.deleteFile({ path, directory: DIRECTORY });
      }
    },
  };
}
