import type { SpeciesInput } from '../../schemas/species';
import { capybara } from './capybara';

/** Every species of the game: adding one means adding its file and one line here. */
export const species = [capybara] satisfies readonly SpeciesInput[];
