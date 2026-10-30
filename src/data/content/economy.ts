import type { EconomyRulesInput } from '../schemas/economy';

/**
 * Starting values of task 1.6, balanced with `npm run sim` (D-023). The welcome banner's very rare
 * comes at its 20th arrival, i.e. after two batches of 10 for 9 tickets: the starting gift pays for
 * the first batch, park levels 2 and 3 and the counter for the second, so that a regular player
 * meets the five species of the slice in about 15 minutes.
 */
export const economyRules = {
  startingGift: { coins: 500, arrivalTickets: 10 },
  entryPrice: {
    defaultCoins: 2,
    maxCoins: 20,
    fairCoins: 2,
    lossPerCoinAboveBp: 1500,
    gainPerCoinBelowBp: 1000,
    minAttendanceBp: 2000,
  },
  satisfactionAttendanceFloorBp: 9000,
  upkeepMaxShareOfRevenueBp: 3000,
  dailyMail: { ticketsPerDay: 1, maxDays: 3 },
  ticketCounter: { ticketsPerDay: 3, coinsPerTicket: 90 },
  parkLevels: [
    { stars: 0, rewardTickets: 0, unlocksBuildings: ['bench', 'litter-bin', 'water-fountain'] },
    { stars: 25, rewardTickets: 2, unlocksBuildings: ['ice-cream-kiosk'] },
    { stars: 80, rewardTickets: 2, unlocksBuildings: ['toilets'] },
    { stars: 160, rewardTickets: 3, unlocksBuildings: [] },
    { stars: 300, rewardTickets: 3, unlocksBuildings: [] },
  ],
} satisfies EconomyRulesInput;
