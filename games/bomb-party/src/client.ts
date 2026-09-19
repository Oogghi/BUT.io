import { CANVAS, Game, Scale, Scene } from 'phaser';

/** Presentation only: no word validation, turn changes, or expiration callbacks in the client. */
export function mountGame(parent: HTMLElement, onReady: () => void) {
  class BombScene extends Scene {
    constructor() {
      super('bomb-party');
    }
    preload() {
      this.load.image('bomb', '/images/bomb.png');
    }
    create() {
      if (!this.textures.exists('bomb')) return;
      this.add.image(110, 105, 'bomb').setDisplaySize(168, 154);
      onReady();
    }
  }
  const game = new Game({
    // This small 2D scene needs no WebGL context (which can fail on some GPUs/browsers).
    type: CANVAS,
    parent,
    width: 220,
    height: 220,
    transparent: true,
    scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
    scene: new BombScene(),
    audio: { noAudio: true },
    fps: { target: 30 },
  });
  return {
    destroy: () => game.destroy(true),
  };
}
