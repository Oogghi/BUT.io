import {
  cosmeticCatalog,
  isPersistedCosmeticId,
  type CosmeticSlot,
} from '@but/shared';
import { lang } from './i18n';
export { isCosmeticId, normalizeCosmeticLoadout } from '@but/shared';
export type { CosmeticId, CosmeticSlot, CosmeticLoadout } from '@but/shared';
export const cosmeticSlots: readonly CosmeticSlot[] = [
  'frame',
  'card-back',
  'card-animation',
  'blackjack-celebration',
  'tank-decal',
];

const copy = {
  en: [
    ['Coral frame', 'A warm edge for your profile.'],
    ['Mint frame', 'A bright, clean finish.'],
    ['Sky frame', 'A cool blue highlight.'],
    ['Midnight club', 'An indigo deck with a golden diamond.'],
    ['Sunset shuffle', 'Coral stripes with a little evening glow.'],
    ['Mint condition', 'A fresh green deck, sealed with a club.'],
    ['Velvet glide', 'Cards drift gently into your hand.'],
    ['Spiral deal', 'A full spin before every card lands.'],
    ['Quick draw', 'A crisp pop into place.'],
    ['Thunderbolt', 'A bright bolt painted on your tank.'],
    ['Lucky star', 'A gold star on your armor.'],
    ['Racing stripes', 'Twin stripes for your favorite tank.'],
    ['Royal smile', 'A golden crown for your next win.'],
    ['Orbit buddy', 'A friendly face from another galaxy.'],
    ['Pocket wizard', 'A little magic at every table.'],
    ['Pixel pal', 'Your cheerful mechanical alter ego.'],
    ['Golden 21', 'A burst of gold coins celebrates your natural blackjack.'],
    ['Royal Arrival', 'A crown descends over your natural blackjack.'],
    ['Electric 21', 'Twin lightning bolts charge up your natural blackjack.'],
  ],
  fr: [
    ['Cadre corail', 'Une touche chaleureuse pour ton profil.'],
    ['Cadre menthe', 'Une finition fraîche et lumineuse.'],
    ['Cadre azur', 'Une touche de bleu.'],
    ['Club de minuit', 'Un jeu indigo au losange doré.'],
    ['Coucher de soleil', 'Des rayures corail aux couleurs du soir.'],
    ['Menthe fraîche', 'Un jeu vert orné d’un trèfle.'],
    ['Glissé velours', 'Les cartes glissent doucement dans ta main.'],
    ['Distribution spirale', 'Un tour complet avant de se poser.'],
    ['Pioche éclair', 'Les cartes apparaissent d’un geste vif.'],
    ['Éclair', 'Un éclair lumineux peint sur ton char.'],
    ['Bonne étoile', 'Une étoile dorée sur ton blindage.'],
    ['Bandes de course', 'Deux bandes pour ton char préféré.'],
    ['Sourire royal', 'Une couronne dorée pour ta prochaine victoire.'],
    ['Copain cosmique', 'Un ami venu d’une autre galaxie.'],
    ['Mage de poche', 'Un peu de magie à chaque table.'],
    ['Copain robot', 'Ton alter ego mécanique et souriant.'],
    ['21 en or', 'Une envolée de pièces célèbre ton blackjack naturel.'],
    ['Arrivée royale', 'Une couronne se pose sur ton blackjack naturel.'],
    ['21 électrique', 'Deux éclairs illuminent ton blackjack naturel.'],
  ],
};
export const cosmetics = cosmeticCatalog
  .map((item, index) => ({
    ...item,
    name: copy[lang][index]![0]!,
    description: copy[lang][index]![1]!,
  }))
  .filter((item) => isPersistedCosmeticId(item.id));
export const cosmeticLabels =
  lang === 'fr'
    ? {
        all: 'Tout',
        avatar: 'Avatars',
        freeAvatars: 'Avatars gratuits',
        premiumAvatars: 'Avatars à débloquer',
        free: 'Gratuit',
        avatarGames: 'Tous les jeux',
        freeNames: [
          'Sourire',
          'Grand sourire',
          'Clin d’œil',
          'Surprise',
          'Joie',
          'Cool',
          'Étoiles',
          'Rêveur',
          'Cœurs',
          'Espiègle',
          'Moustache',
          'Masqué',
        ],
        frame: 'Cadres',
        'card-back': 'Dos de cartes',
        'card-animation': 'Animations',
        'blackjack-celebration': 'Célébrations blackjack',
        blackjack: 'Blackjack uniquement',
        'tank-decal': 'Décalcomanies',
        games: 'Blackjack · Poker',
        tanks: 'Tank Arena',
        profile: 'Profil',
        reset: 'Retirer',
        preview: 'Rejouer',
        equipped: 'Ton équipement',
        hint: 'Un objet par emplacement. Tes choix sont visibles par les autres joueurs à ta prochaine entrée dans un salon.',
        empty: 'Classique',
        loading: 'Chargement des cosmétiques…',
        insufficient: 'Pièces insuffisantes',
      }
    : {
        all: 'All',
        avatar: 'Avatars',
        freeAvatars: 'Free avatars',
        premiumAvatars: 'Unlockable avatars',
        free: 'Free',
        avatarGames: 'All games',
        freeNames: [
          'Smile',
          'Grin',
          'Wink',
          'Surprise',
          'Joy',
          'Cool',
          'Starry',
          'Dreamer',
          'Heart eyes',
          'Cheeky',
          'Mustache',
          'Masked',
        ],
        frame: 'Frames',
        'card-back': 'Card backs',
        'card-animation': 'Animations',
        'blackjack-celebration': 'Blackjack celebrations',
        blackjack: 'Blackjack only',
        'tank-decal': 'Tank decals',
        games: 'Blackjack · Poker',
        tanks: 'Tank Arena',
        profile: 'Profile',
        reset: 'Unequip',
        preview: 'Replay',
        equipped: 'Your loadout',
        hint: 'One item per slot. Other players see your choices the next time you join a lobby.',
        empty: 'Classic',
        loading: 'Loading cosmetics…',
        insufficient: 'Not enough coins',
      };
/** Cosmetic motion changes presentation only; dealing order and rules stay intact. */
export function cardDealOrigin(
  id: string | undefined,
  from = { x: 0, y: -80 },
) {
  switch (id) {
    case 'velvet-deal':
      return { x: from.x * 0.35, y: -36, rotate: -8, scale: 0.96, opacity: 0 };
    case 'spiral-deal':
      return { ...from, rotate: -360, scale: 0.55, opacity: 0 };
    case 'snap-deal':
      return { x: 0, y: -8, rotate: 0, scale: 0.45, opacity: 0 };
    default:
      return { ...from, rotate: -160, scale: 0.72, opacity: 0 };
  }
}
