import type { SpeciesInput } from '../../schemas/species';
import { capybara } from './capybara';
import { collaredPeccary } from './collared-peccary';
import { giantOtter } from './giant-otter';
import { jaguar } from './jaguar';
import { lowlandTapir } from './lowland-tapir';

/** Every species of the game: adding one means adding its file and one line here. */
export const species = [
  capybara,
  collaredPeccary,
  lowlandTapir,
  giantOtter,
  jaguar,
] satisfies readonly SpeciesInput[];
