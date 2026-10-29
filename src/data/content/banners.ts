import type { BannerInput } from '../schemas/gacha';

export const banners = [
  { kind: 'permanent', id: 'refuge', nameKey: 'banner.refuge.name' },
  {
    kind: 'welcome',
    id: 'welcome',
    nameKey: 'banner.welcome.name',
    arrivalLimit: 20,
    guaranteedRarity: 'veryRare',
    choiceCount: 3,
  },
] satisfies readonly BannerInput[];
