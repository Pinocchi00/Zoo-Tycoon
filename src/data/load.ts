import type { z } from 'zod';
import { err, ok, type Result } from '../shared/result';
import type { ArchetypeId, BannerId, BiomeId, ItemId, SpeciesId } from '../shared/brand';
import { gachaRulesSchema, bannerSchema, type Banner, type GachaRules } from './schemas/gacha';
import {
  buildingSchema,
  decorSchema,
  visitorArchetypeSchema,
  type Building,
  type Decor,
  type VisitorArchetype,
} from './schemas/park';
import {
  biomeSchema,
  enclosureSizesSchema,
  habitatElementSchema,
  speciesSchema,
  type Biome,
  type EnclosureSizes,
  type HabitatElement,
  type HabitatElementCategory,
  type Species,
} from './schemas/species';

/** Game content as written in the data files, before validation. */
export interface RawGameData {
  readonly gachaRules: unknown;
  readonly enclosureSizes: unknown;
  readonly banners: readonly unknown[];
  readonly biomes: readonly unknown[];
  readonly habitatElements: readonly unknown[];
  readonly species: readonly unknown[];
  readonly buildings: readonly unknown[];
  readonly decor: readonly unknown[];
  readonly visitorArchetypes: readonly unknown[];
}

/** Validated game content. Maps keep the order of the data files, so draws stay deterministic. */
export interface GameData {
  readonly gachaRules: GachaRules;
  readonly enclosureSizes: EnclosureSizes;
  readonly banners: ReadonlyMap<BannerId, Banner>;
  readonly biomes: ReadonlyMap<BiomeId, Biome>;
  readonly habitatElements: ReadonlyMap<ItemId, HabitatElement>;
  readonly species: ReadonlyMap<SpeciesId, Species>;
  readonly buildings: ReadonlyMap<ItemId, Building>;
  readonly decor: ReadonlyMap<ItemId, Decor>;
  readonly visitorArchetypes: ReadonlyMap<ArchetypeId, VisitorArchetype>;
}

/** One problem in one data entry, e.g. `species[0] (capybara)`, `group.maxSize`. */
export interface DataError {
  readonly source: string;
  readonly path: string;
  readonly message: string;
}

/** One line per error, for the startup failure message. */
export function formatDataErrors(errors: readonly DataError[]): string {
  return errors
    .map(
      (error) => `${error.source} › ${error.path === '' ? '(root)' : error.path}: ${error.message}`,
    )
    .join('\n');
}

/**
 * Validates every data file, then the references between them. Reports all the errors at once
 * so that a broken content change is fixed in one go.
 */
export function loadGameData(raw: RawGameData): Result<GameData, readonly DataError[]> {
  const errors: DataError[] = [];
  const gachaRules = parseOne(gachaRulesSchema, raw.gachaRules, 'gachaRules', errors);
  const enclosureSizes = parseOne(
    enclosureSizesSchema,
    raw.enclosureSizes,
    'enclosureSizes',
    errors,
  );
  const banners = parseCollection(bannerSchema, raw.banners, 'banners', errors);
  const biomes = parseCollection(biomeSchema, raw.biomes, 'biomes', errors);
  const habitatElements = parseCollection(
    habitatElementSchema,
    raw.habitatElements,
    'habitatElements',
    errors,
  );
  const species = parseCollection(speciesSchema, raw.species, 'species', errors);
  const buildings = parseCollection(buildingSchema, raw.buildings, 'buildings', errors);
  const decor = parseCollection(decorSchema, raw.decor, 'decor', errors);
  const visitorArchetypes = parseCollection(
    visitorArchetypeSchema,
    raw.visitorArchetypes,
    'visitorArchetypes',
    errors,
  );

  checkBanners(banners, errors);
  checkSharedItemIds({ habitatElements, buildings, decor }, errors);
  species.forEach((entry, id) => {
    checkSpeciesReferences(entry, `species (${id})`, biomes, habitatElements, errors);
  });

  if (gachaRules === null || enclosureSizes === null || errors.length > 0) {
    return err(errors);
  }
  return ok({
    gachaRules,
    enclosureSizes,
    banners,
    biomes,
    habitatElements,
    species,
    buildings,
    decor,
    visitorArchetypes,
  });
}

function parseOne<T>(
  schema: z.ZodType<T>,
  value: unknown,
  source: string,
  errors: DataError[],
): T | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  for (const issue of parsed.error.issues) {
    errors.push({ source, path: issue.path.map(String).join('.'), message: issue.message });
  }
  return null;
}

function parseCollection<T extends { readonly id: string }>(
  schema: z.ZodType<T>,
  values: readonly unknown[],
  collection: string,
  errors: DataError[],
): Map<T['id'], T> {
  const byId = new Map<T['id'], T>();
  values.forEach((value, index) => {
    const source = entrySource(collection, index, value);
    const parsed = parseOne(schema, value, source, errors);
    if (parsed === null) {
      return;
    }
    if (byId.has(parsed.id)) {
      errors.push({ source, path: 'id', message: `duplicate id "${parsed.id}"` });
      return;
    }
    byId.set(parsed.id, parsed);
  });
  return byId;
}

/** `species[0] (capybara)` when the entry has a readable id, `species[0]` otherwise. */
function entrySource(collection: string, index: number, value: unknown): string {
  const base = `${collection}[${String(index)}]`;
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return `${base} (${value.id})`;
  }
  return base;
}

function checkBanners(banners: ReadonlyMap<BannerId, Banner>, errors: DataError[]): void {
  const kinds = [...banners.values()].map((banner) => banner.kind);
  if (!kinds.includes('permanent')) {
    errors.push({ source: 'banners', path: '', message: 'a permanent banner is required' });
  }
  // The welcome arrivals are a single run of first arrivals: two of them would overlap.
  if (kinds.filter((kind) => kind === 'welcome').length > 1) {
    errors.push({ source: 'banners', path: '', message: 'at most one welcome banner' });
  }
}

/** Habitat elements, buildings and decor share the `ItemId` space: one id, one thing. */
function checkSharedItemIds(
  collections: Readonly<Record<string, ReadonlyMap<ItemId, unknown>>>,
  errors: DataError[],
): void {
  const owners = new Map<ItemId, string>();
  for (const [name, collection] of Object.entries(collections)) {
    for (const id of collection.keys()) {
      const owner = owners.get(id);
      if (owner !== undefined) {
        const message = `id "${id}" used by both ${owner} and ${name}`;
        errors.push({ source: name, path: 'id', message });
      }
      owners.set(id, name);
    }
  }
}

function checkSpeciesReferences(
  species: Species,
  source: string,
  biomes: ReadonlyMap<BiomeId, Biome>,
  elements: ReadonlyMap<ItemId, HabitatElement>,
  errors: DataError[],
): void {
  if (!biomes.has(species.biome)) {
    errors.push({ source, path: 'biome', message: `unknown biome "${species.biome}"` });
  }
  const checkElement = (
    id: ItemId,
    path: string,
    category: HabitatElementCategory | null,
  ): void => {
    const element = elements.get(id);
    if (element === undefined) {
      errors.push({ source, path, message: `unknown habitat element "${id}"` });
    } else if (category !== null && element.category !== category) {
      errors.push({ source, path, message: `"${id}" is a ${element.category}, not a ${category}` });
    }
  };
  const kit = species.habitatKit;
  checkElement(kit.ground, 'habitatKit.ground', 'ground');
  if (kit.water !== null) {
    checkElement(kit.water, 'habitatKit.water', 'water');
  }
  checkElement(kit.shelter, 'habitatKit.shelter', 'shelter');
  kit.vegetation.forEach((id, index) => {
    checkElement(id, `habitatKit.vegetation.${String(index)}`, 'vegetation');
  });
  for (const [star, reward] of Object.entries(species.starRewards)) {
    reward.elements.forEach((id, index) => {
      // Star rewards may be of any category: toy, water, shelter, viewpoint...
      checkElement(id, `starRewards.${star}.elements.${String(index)}`, null);
    });
  }
}
