import {
  actionIconFiles,
  actionIconSlots,
  tankIconSlots,
  type ActionId,
  type TankId,
} from '@but/tank-arena';

const ATLAS = '/tank-arena/tank-arena-icon-atlas.png';

/** Signature color of each tank's art, used to tint its hangar showcase. */
export const tankAccents = {
  howler: '#ff6b4a',
  neon: '#3fd8ff',
  viper: '#7ed957',
} as const satisfies Record<TankId, string>;

/** CSS crop for the generated 4×3 atlas. */
export function atlasIconStyle(slot: readonly [number, number]) {
  return {
    backgroundImage: `url(${ATLAS})`,
    backgroundPosition: `${(slot[0] / 3) * 100}% ${(slot[1] / 2) * 100}%`,
    backgroundSize: '400% 300%',
  };
}

export function tankIconStyle(tank: TankId) {
  const slot = tankIconSlots[tank];
  return {
    ...atlasIconStyle(slot),
    // The generated tank crests have a little extra transparent padding on the right.
    backgroundPosition: `calc(${(slot[0] / 3) * 100}% - 8px) ${(slot[1] / 2) * 100}%`,
  };
}

/** An action's icon: its atlas cell, or its own image (`actionIconFiles`). */
export function actionIconStyle(action: ActionId) {
  const slot = actionIconSlots[action];
  return slot
    ? atlasIconStyle(slot)
    : {
        backgroundImage: `url(${actionIconFiles[action]})`,
        backgroundPosition: 'center',
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
      };
}
