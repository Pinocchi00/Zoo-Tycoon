import type { GachaRulesInput } from '../schemas/gacha';

/** Rates and guarantees of the GDD ("Raretés, taux et garanties"). */
export const gachaRules = {
  rarityRatesBp: { common: 5500, uncommon: 2700, rare: 1200, veryRare: 500, iconic: 100 },
  pity: {
    rare: { guaranteedAt: 10 },
    veryRare: { guaranteedAt: 40 },
    iconic: { guaranteedAt: 90, softPityStartArrival: 70 },
  },
  arrivalTicketCost: 1,
  multiArrival: { count: 10, ticketCost: 9 },
  medalsPerArrival: 10,
  medalsPerExtraDuplicate: 50,
  catalogMedalCost: { rare: 150, veryRare: 400, iconic: 1000 },
} satisfies GachaRulesInput;
