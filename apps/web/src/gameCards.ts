import { bombParty } from '@but/bomb-party';
import { tankArena } from '@but/tank-arena';
import { blackjackParty } from '@but/blackjack-party';
import { pokerParty } from '@but/poker-party';
import { miniGolf } from '@but/mini-golf';

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
    id: blackjackParty.id,
    name: blackjackParty.name,
    min: blackjackParty.minPlayers,
    max: blackjackParty.maxPlayers,
    color: 'sun',
    image: '/images/blackjack-party.png',
  },
  {
    id: pokerParty.id,
    name: pokerParty.name,
    min: pokerParty.minPlayers,
    max: pokerParty.maxPlayers,
    color: 'violet',
    image: '/images/poker-party.png',
  },
  {
    id: miniGolf.id,
    name: miniGolf.name,
    min: miniGolf.minPlayers,
    max: miniGolf.maxPlayers,
    color: 'lime',
    image: '/images/mini-golf.svg',
  },
] as const;
