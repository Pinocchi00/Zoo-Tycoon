/**
 * Every reason a construction can be refused. ui shows the text `build.error.<code>`;
 * a test of app checks that each code has its text in every language.
 */
export const BUILD_ERRORS = [
  'invalidPosition',
  'outOfBounds',
  'cellOccupied',
  'noCells',
  'noPathThere',
  'unknownPathSurface',
  'outlineInvalid',
  'enclosureSplit',
  'enclosureTooSmall',
  'enclosureTooLarge',
  'unknownEnclosure',
  'speciesNotMet',
  'enclosureOccupied',
  'groupAlreadyThere',
  'unknownBuilding',
  'unknownPlacedBuilding',
  'buildingNotOnPath',
  'notEnoughCoins',
  'currencyOverflow',
  'nothingToUndo',
  'nothingToRedo',
] as const;
export type BuildError = (typeof BUILD_ERRORS)[number];
