import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import {
  openBrowserTextStore,
  readBrowserStorages,
  type BrowserStorages,
  type TextStoreKind,
} from './browser-store';
import { openNativeFilesTextStore, type NativeFiles } from './native-files-store';
import type { TextStore } from './text-store';

export interface OpenedPlatformStore {
  readonly store: TextStore;
  /** `memory` means nothing survives a reload: app should warn the player. */
  readonly kind: TextStoreKind | 'nativeFiles';
  /** Why the app's native files were not used although present, for the development log. */
  readonly nativeFailure: string | null;
  /** Why IndexedDB was not used although present, for the development log. */
  readonly indexedDbFailure: string | null;
}

/** Every storage the game may use, injectable so that tests can pass fakes. */
export interface PlatformStorages {
  /** Present only inside the installed app. */
  readonly nativeFiles: NativeFiles | undefined;
  readonly browser: BrowserStorages;
}

export function readPlatformStorages(): PlatformStorages {
  return {
    nativeFiles: Capacitor.isNativePlatform() ? Filesystem : undefined,
    browser: readBrowserStorages(),
  };
}

async function tryNativeFiles(files: NativeFiles): Promise<TextStore | string> {
  try {
    return await openNativeFilesTextStore(files);
  } catch (error) {
    // The WebView's own storage still keeps the park better than nothing; the reason is kept.
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
}

/** Native files inside the app, else the best browser storage (see openBrowserTextStore). */
export async function openPlatformTextStore(
  storages: PlatformStorages = readPlatformStorages(),
): Promise<OpenedPlatformStore> {
  let nativeFailure: string | null = null;
  if (storages.nativeFiles !== undefined) {
    const opened = await tryNativeFiles(storages.nativeFiles);
    if (typeof opened !== 'string') {
      return { store: opened, kind: 'nativeFiles', nativeFailure, indexedDbFailure: null };
    }
    nativeFailure = opened;
  }
  const browser = await openBrowserTextStore(storages.browser);
  return { ...browser, nativeFailure };
}
