import type { GameData } from '../../data/load';
import { err, ok, type Result } from '../../shared/result';
import { emit, type EventQueue } from '../events';
import type { GameState } from '../state';

/**
 * Every reason an economy command can be refused. ui shows the text `economy.error.<code>`;
 * a test of app checks that each code has its text in every language.
 */
export const ECONOMY_ERRORS = [
  'invalidEntryPrice',
  'invalidDay',
  'mailAlreadyClaimed',
  'counterSoldOut',
  'notEnoughCoins',
  'currencyOverflow',
] as const;
export type EconomyError = (typeof ECONOMY_ERRORS)[number];

export interface SetEntryPriceCommand {
  readonly type: 'setEntryPrice';
  readonly priceCoins: number;
}

/**
 * `day` is the real day number (days since an epoch, in the player's time zone), given by app:
 * the simulation never reads a clock (D-018, point 6).
 */
export interface ClaimMailCommand {
  readonly type: 'claimMail';
  readonly day: number;
}

/** Buys one ticket at the counter, on the real day `day` (see `ClaimMailCommand`). */
export interface BuyCounterTicketCommand {
  readonly type: 'buyCounterTicket';
  readonly day: number;
}

export type EconomyCommand = SetEntryPriceCommand | ClaimMailCommand | BuyCounterTicketCommand;

function setEntryPrice(
  state: GameState,
  command: SetEntryPriceCommand,
  data: GameData,
  events: EventQueue,
): Result<void, EconomyError> {
  const price = command.priceCoins;
  if (!Number.isSafeInteger(price) || price < 0 || price > data.economyRules.entryPrice.maxCoins) {
    return err('invalidEntryPrice');
  }
  state.economy.entryPriceCoins = price;
  emit(events, { type: 'entryPriceChanged', priceCoins: price });
  return ok(undefined);
}

function isDay(day: number): boolean {
  return Number.isSafeInteger(day) && day >= 0;
}

/** One letter a day, kept up to `maxDays` when the player is away (D-018, point 6). */
function claimMail(
  state: GameState,
  command: ClaimMailCommand,
  data: GameData,
  events: EventQueue,
): Result<void, EconomyError> {
  const last = state.economy.lastMailDay;
  // A day before the last claim means the device clock went back: never pay twice for it.
  if (!isDay(command.day) || (last !== null && command.day < last)) {
    return err('invalidDay');
  }
  if (command.day === last) {
    return err('mailAlreadyClaimed');
  }
  const { ticketsPerDay, maxDays } = data.economyRules.dailyMail;
  const days = last === null ? 1 : Math.min(command.day - last, maxDays);
  const tickets = days * ticketsPerDay;
  const total = state.currencies.arrivalTickets + tickets;
  if (!Number.isSafeInteger(total)) {
    return err('currencyOverflow');
  }
  state.currencies.arrivalTickets = total;
  state.economy.lastMailDay = command.day;
  emit(events, { type: 'mailClaimed', day: command.day, tickets, ticketsTotal: total });
  return ok(undefined);
}

/** A few tickets a day for coins (GDD "Monnaies"). */
function buyCounterTicket(
  state: GameState,
  command: BuyCounterTicketCommand,
  data: GameData,
  events: EventQueue,
): Result<void, EconomyError> {
  const economy = state.economy;
  if (!isDay(command.day) || (economy.counterDay !== null && command.day < economy.counterDay)) {
    return err('invalidDay');
  }
  const { ticketsPerDay, coinsPerTicket } = data.economyRules.ticketCounter;
  const bought = command.day === economy.counterDay ? economy.counterBought : 0;
  if (bought >= ticketsPerDay) {
    return err('counterSoldOut');
  }
  if (state.currencies.coins < coinsPerTicket) {
    return err('notEnoughCoins');
  }
  if (!Number.isSafeInteger(state.currencies.arrivalTickets + 1)) {
    return err('currencyOverflow');
  }
  state.currencies.coins -= coinsPerTicket;
  state.currencies.arrivalTickets += 1;
  economy.counterDay = command.day;
  economy.counterBought = bought + 1;
  emit(events, {
    type: 'counterTicketBought',
    coinsSpent: coinsPerTicket,
    coinsTotal: state.currencies.coins,
    ticketsTotal: state.currencies.arrivalTickets,
    leftToday: ticketsPerDay - economy.counterBought,
  });
  return ok(undefined);
}

export function applyEconomyCommand(
  state: GameState,
  command: EconomyCommand,
  data: GameData,
  events: EventQueue,
): Result<void, EconomyError> {
  switch (command.type) {
    case 'setEntryPrice':
      return setEntryPrice(state, command, data, events);
    case 'claimMail':
      return claimMail(state, command, data, events);
    case 'buyCounterTicket':
      return buyCounterTicket(state, command, data, events);
  }
}
