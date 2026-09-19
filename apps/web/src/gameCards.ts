import { bombParty } from '@but/bomb-party';
import { tankArena } from '@but/tank-arena';

// Bomb Party and Tank Arena have server rooms; other entries open informational placeholders.
export const gameCards = [
  {
    id: bombParty.id,
    name: bombParty.name,
    min: bombParty.minPlayers,
    max: bombParty.maxPlayers,
    color: 'coral',
    image: '/images/bomb.png',
  },
  {
    id: tankArena.id,
    name: tankArena.name,
    min: tankArena.minPlayers,
    max: tankArena.maxPlayers,
    color: 'mint',
    image: '/images/tank-arena.png',
  },
  {
    id: 'poker-party',
    name: 'Poker Party',
    min: 2,
    max: 6,
    color: 'lilac',
    image: '/images/poker-party.png',
  },
] as const;
