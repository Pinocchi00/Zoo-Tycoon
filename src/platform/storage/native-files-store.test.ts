import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../../save';
import { createGameState } from '../../sim';
import { openNativeFilesTextStore, type NativeFiles } from './native-files-store';
import { openPlatformTextStore } from './platform-store';
import { createSaveStorage } from './save-storage';
import { checkTextStore } from './text-store.test-helper';

type Operation = keyof NativeFiles;

/**
 * In-memory stand-in for Capacitor's Filesystem plugin, rejecting like the real one does on a
 * missing file or folder. Operations listed in `failing` reject, to simulate a broken disk.
 */
class FakeNativeFiles implements NativeFiles {
  readonly folders = new Set<string>();
  readonly files = new Map<string, string | Blob>();
  readonly failing = new Set<Operation>();
  readonly calls: Operation[] = [];

  private enter(operation: Operation): void {
    this.calls.push(operation);
    if (this.failing.has(operation)) {
      throw new Error(`${operation} failed: disk is broken.`);
    }
  }

  readFile = ({ path }: { path: string }): Promise<{ data: string | Blob }> => {
    return new Promise((resolve) => {
      this.enter('readFile');
      const data = this.files.get(path);
      if (data === undefined) {
        throw new Error('File does not exist.');
      }
      resolve({ data });
    });
  };

  writeFile = ({ path, data }: { path: string; data: string }): Promise<unknown> => {
    return new Promise((resolve) => {
      this.enter('writeFile');
      if (!this.folders.has(path.slice(0, path.lastIndexOf('/')))) {
        throw new Error('Parent folder does not exist.');
      }
      this.files.set(path, data);
      resolve({ uri: `file:///data/${path}` });
    });
  };

  deleteFile = ({ path }: { path: string }): Promise<void> => {
    return new Promise((resolve) => {
      this.enter('deleteFile');
      if (!this.files.delete(path)) {
        throw new Error('File does not exist.');
      }
      resolve();
    });
  };

  readdir = ({
    path,
  }: {
    path: string;
  }): Promise<{ files: { name: string; type: 'directory' | 'file' }[] }> => {
    return new Promise((resolve) => {
      this.enter('readdir');
      if (!this.folders.has(path)) {
        throw new Error('Folder does not exist.');
      }
      const prefix = `${path}/`;
      const children = [...this.folders, ...this.files.keys()]
        .filter((child) => child.startsWith(prefix))
        .map((child) => ({
          name: child.slice(prefix.length),
          type: this.folders.has(child) ? ('directory' as const) : ('file' as const),
        }));
      resolve({ files: children });
    });
  };

  mkdir = ({ path }: { path: string }): Promise<void> => {
    return new Promise((resolve) => {
      this.enter('mkdir');
      if (this.folders.has(path)) {
        throw new Error('Folder already exists.');
      }
      this.folders.add(path);
      resolve();
    });
  };
}

const FOLDER = 'zoo-refuge';
const WRITTEN_AT_MS = 1_793_260_800_000;

describe('native files store', () => {
  it('honours the text store contract', async () => {
    await checkTextStore(await openNativeFilesTextStore(new FakeNativeFiles()));
  });

  it('creates its folder on first launch only', async () => {
    const files = new FakeNativeFiles();
    await openNativeFilesTextStore(files);
    expect(files.folders.has(FOLDER)).toBe(true);
    files.calls.length = 0;
    await openNativeFilesTextStore(files);
    expect(files.calls).toEqual(['readdir']);
  });

  it('keeps data across app launches', async () => {
    const files = new FakeNativeFiles();
    await (await openNativeFilesTextStore(files)).set('save.copy.1', 'park');
    expect(await (await openNativeFilesTextStore(files)).get('save.copy.1')).toBe('park');
    expect(files.files.get(`${FOLDER}/save.copy.1`)).toBe('park');
  });

  it('lists only its own files', async () => {
    const files = new FakeNativeFiles();
    const store = await openNativeFilesTextStore(files);
    await store.set('settings.quality', 'high');
    files.folders.add(`${FOLDER}/subfolder`);
    files.files.set(`${FOLDER}/.hidden`, 'x');
    expect(await store.keys()).toEqual(['settings.quality']);
  });

  it('refuses keys that could leave its folder', async () => {
    const store = await openNativeFilesTextStore(new FakeNativeFiles());
    for (const key of ['../escape', 'a/b', '.hidden', '']) {
      await expect(store.set(key, 'x')).rejects.toThrow(TypeError);
      await expect(store.get(key)).rejects.toThrow(TypeError);
      await expect(store.remove(key)).rejects.toThrow(TypeError);
    }
  });

  it('refuses a file that does not read back as text', async () => {
    const files = new FakeNativeFiles();
    const store = await openNativeFilesTextStore(files);
    files.files.set(`${FOLDER}/save.copy.1`, new Blob(['park']));
    await expect(store.get('save.copy.1')).rejects.toThrow('did not read back as text');
  });

  it('fails to open when its folder cannot be created', async () => {
    const files = new FakeNativeFiles();
    files.failing.add('mkdir');
    await expect(openNativeFilesTextStore(files)).rejects.toThrow('mkdir failed');
  });

  it('rejects every operation the disk refuses', async () => {
    const files = new FakeNativeFiles();
    const store = await openNativeFilesTextStore(files);
    await store.set('a', 'first');
    files.failing.add('writeFile').add('readFile').add('deleteFile');
    await expect(store.set('a', 'second')).rejects.toThrow('writeFile failed');
    await expect(store.get('a')).rejects.toThrow('readFile failed');
    await expect(store.remove('a')).rejects.toThrow('deleteFile failed');
    files.failing.add('readdir');
    await expect(store.keys()).rejects.toThrow('readdir failed');
  });

  it('keeps a park saved through SaveStorage across launches', async () => {
    const files = new FakeNativeFiles();
    const state = createGameState(7);
    state.currencies.coins = 1234;
    const before = createSaveStorage(await openNativeFilesTextStore(files), deserialize);
    expect((await before.write(serialize(state, WRITTEN_AT_MS))).ok).toBe(true);

    const after = createSaveStorage(await openNativeFilesTextStore(files), deserialize);
    const loaded = await after.read();
    expect(loaded.ok && loaded.value.value).toEqual(state);
  });
});

describe('platform store selection', () => {
  const noBrowserStorage = { indexedDB: undefined, localStorage: undefined };

  it('uses native files inside the app', async () => {
    const opened = await openPlatformTextStore({
      nativeFiles: new FakeNativeFiles(),
      browser: noBrowserStorage,
    });
    expect(opened).toMatchObject({ kind: 'nativeFiles', nativeFailure: null });
  });

  it('uses browser storage outside the app', async () => {
    const opened = await openPlatformTextStore({
      nativeFiles: undefined,
      browser: noBrowserStorage,
    });
    expect(opened).toMatchObject({ kind: 'memory', nativeFailure: null });
  });

  it('falls back to browser storage when native files fail, and says why', async () => {
    const files = new FakeNativeFiles();
    files.failing.add('mkdir');
    const opened = await openPlatformTextStore({ nativeFiles: files, browser: noBrowserStorage });
    expect(opened.kind).toBe('memory');
    expect(opened.nativeFailure).toBe('Error: mkdir failed: disk is broken.');
    await checkTextStore(opened.store);
  });
});
