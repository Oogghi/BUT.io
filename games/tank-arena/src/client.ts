import {
  AUTO,
  Game,
  Scale,
  Scene,
  type GameObjects,
  type Input,
  type Textures,
} from 'phaser';
import {
  BUBBLE_SPRITE,
  PLANNING_SECONDS,
  actionIconFiles,
  actionIconSlots,
  actions,
  maps,
  pickupIconSlots,
  sampleAngle,
  samplePath,
  tanks,
  type ActionId,
  type ArenaMap,
  type Hazard,
  type Pickup,
  type PickupKind,
  type Replay,
  type ReplayEvent,
  type ReplayTrack,
  type TankId,
} from './index.js';
import {
  BUBBLE_RADIUS,
  BUBBLE_SPEED,
  SHELL_SPEED,
  TANK_H,
  TANK_W,
  TICK_RATE,
  Terrain,
  bubblePreview,
  centerOf,
  clampJumpAngle,
  insideTank,
  jumpPreview,
  jumpSpeed,
  launchVelocity,
  muzzle,
  shellPreview,
} from './physics.js';

export interface ArenaTank {
  id: string;
  name: string;
  tank: TankId;
  x: number;
  y: number;
  angle: number;
  facing: number;
  health: number;
  maxHealth: number;
  shield: number;
  alive: boolean;
  confirmed: boolean;
  you: boolean;
  poisonTurns: number;
  frozenTurns: number;
  boost: string;
}

/** Authoritative state to draw; the renderer never decides outcomes. */
export interface ArenaView {
  stage: 'planning' | 'resolving' | '';
  turn: number;
  players: ArenaTank[];
  craters: [number, number, number][];
  pickups: Pickup[];
  hazard: Hazard | null;
  replay: Replay | null;
}

export interface ArenaAim {
  action: ActionId;
  angle: number;
  power: number;
}

export interface ArenaLabels {
  turn: (turn: number) => string;
  airstrike: string;
  pickups: Record<PickupKind, string>;
  poisoned: string;
  frozen: string;
}

/** On-screen controls. Labels come from the app so the canvas stays localized. */
export interface ArenaHud {
  actions: {
    id: ActionId;
    key: string;
    name: string;
    cooldown: number;
    disabled: boolean;
  }[];
  selected: ActionId;
  showPower: boolean;
  confirm: 'hidden' | 'ready' | 'locked' | 'disabled';
  /** `performance.now()` time the planning phase ends; 0 hides the timer. */
  endsAt: number;
  hint: string;
  error: boolean;
  /** Shown in the control bar when there are no actions (replays, spectating). */
  stageLabel: string;
  /** Text of the lock-in button ("Ready" / "Prêt"). */
  readyLabel: string;
}

export interface ArenaCallbacks {
  onReady: () => void;
  onAction: (action: ActionId) => void;
  onAim: (angle: number, power: number) => void;
  onConfirm: () => void;
}

const SPRITE_SCALE = 180 / 384;
/** Half the visible hull width: how far from an edge a whole tank's center must be drawn. */
const EDGE_REACH = 80;
/** Drag distance (world px) that maps to full power. */
const AIM_REACH = 380;
/** Control bar across the water at the bottom of the arena. */
/** Compact control bar, centered over the water at the bottom of the arena. */
const BAR_Y = 896;
const BAR_TOP = 856;
const SQUARE = 64;
const GAP = 10;
const READY_W = 170;
/** Turn timer, centered at the top. */
const TIMER_Y = 52;
/** `Phaser.TintModes` values (tint color and mode are separate in Phaser 4). */
const TINT_MULTIPLY = 0;
const TINT_FILL = 1;
const FONT = '"Bricolage Grotesque", system-ui, sans-serif';
const TRAIL: Partial<Record<ReplayTrack['kind'], string>> = {
  shell: 'smoke',
  bomblet: 'smoke',
  strike: 'fire',
  toxic: 'toxic',
  pulse: 'smoke',
};

interface TankSprite {
  root: GameObjects.Container;
  body: GameObjects.Image;
  shadow: GameObjects.Ellipse;
  /** Spike Bubble art, shown instead of the hull while the bubble is active. */
  bubble: GameObjects.Image;
  bar: GameObjects.Graphics;
  label: GameObjects.Text;
  status: GameObjects.Text;
  badge: GameObjects.Text;
  health: number;
  /** Lags behind `health` so damage visibly drains. */
  shownHealth: number;
  maxHealth: number;
  shield: number;
  alive: boolean;
  airborne: boolean;
  sinking: boolean;
  phase: number;
  facing: number;
  nextPuff: number;
}

interface Playback {
  replay: Replay;
  startedAt: number;
  next: number;
  tankTracks: Map<string, ReplayTrack[]>;
  shells: ReplayTrack[];
}

/**
 * Presentation only: draws the synced state, animates each server replay identically,
 * and reports aim input. It never resolves shots, damage or movement.
 */
export function mountArena(
  parent: HTMLElement,
  mapId: string,
  labels: ArenaLabels,
  callbacks: ArenaCallbacks,
) {
  const map: ArenaMap = maps[mapId] ?? Object.values(maps)[0]!;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Render at the displayed pixel density (not the map's 1672px) so text and edges stay
  // sharp; the camera zoom keeps every coordinate in map pixels.
  const resolution = Math.min(
    2.5,
    Math.max(
      1,
      (window.devicePixelRatio || 1) *
        Math.max(1, parent.clientWidth / map.width),
    ),
  );
  let pendingView: ArenaView | null = null;
  let pendingAim: ArenaAim | null = null;
  let pendingHud: ArenaHud | null = null;

  class ArenaScene extends Scene {
    private ready = false;
    private terrain = new Terrain(map);
    private terrainTexture!: Textures.CanvasTexture;
    private applied = 0;
    private view: ArenaView | null = null;
    private aim: ArenaAim | null = null;
    private shownAim: ArenaAim | null = null;
    private tanks = new Map<string, TankSprite>();
    private pickupViews = new Map<number, GameObjects.Container>();
    private hazardView: GameObjects.Container | null = null;
    private hazardKey = '';
    private preview!: GameObjects.Graphics;
    private previewPoints: number[][] = [];
    private previewKey = '';
    private shells!: GameObjects.Graphics;
    private water!: GameObjects.Graphics;
    private emitters = new Map<string, GameObjects.Particles.ParticleEmitter>();
    private playback: Playback | null = null;
    private playedTurn = 0;
    private bannerTurn = 0;
    /** Pointer and aim point when the drag began; the drag offsets the aim from there. */
    private drag: { x: number; y: number; aimX: number; aimY: number } | null =
      null;
    private hud: ArenaHud | null = null;
    private hudKey = '';
    private hudControls: GameObjects.Container[] = [];
    private hudGraphics!: GameObjects.Graphics;
    private hint!: GameObjects.Text;
    private stageText!: GameObjects.Text;
    private timerText!: GameObjects.Text;
    private hudPanel!: GameObjects.Graphics;
    private actionTextures = new Map<ActionId, string>();
    private pickupTextures = new Map<PickupKind, string>();

    constructor() {
      super('tank-arena');
    }

    preload() {
      this.load.image('background', map.background);
      this.load.image('terrain', map.terrain);
      this.load.image('action-atlas', '/tank-arena/tank-arena-icon-atlas.png');
      this.load.image(
        'pickup-atlas',
        '/tank-arena/tank-arena-pickup-atlas.png',
      );
      for (const [action, file] of Object.entries(actionIconFiles))
        this.load.image(`action-file-${action}`, file);
      this.load.image('spike-bubble', BUBBLE_SPRITE);
      for (const [id, info] of Object.entries(tanks))
        this.load.image(`tank-${id}`, info.sprite);
    }

    create() {
      this.cameras.main
        .setZoom(resolution)
        .centerOn(map.width / 2, map.height / 2);
      this.makeTextures();
      this.makeActionIconTextures();
      this.makePickupIconTextures();
      this.add.image(0, 0, 'background').setOrigin(0).setDepth(0);
      this.water = this.add.graphics().setDepth(1);
      this.terrainTexture = this.textures.createCanvas(
        'terrain-live',
        map.width,
        map.height,
      )!;
      this.terrainTexture.context.drawImage(
        this.textures.get('terrain').getSourceImage() as HTMLImageElement,
        0,
        0,
      );
      this.terrainTexture.refresh();
      this.add.image(0, 0, 'terrain-live').setOrigin(0).setDepth(2);
      this.shells = this.add.graphics().setDepth(6);
      this.preview = this.add.graphics().setDepth(8);

      this.emitter('fire', {
        speed: { min: 60, max: 340 },
        lifespan: { min: 250, max: 600 },
        scale: { start: 1.3, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: 'ADD',
      });
      this.emitter('smoke', {
        speed: { min: 10, max: 90 },
        lifespan: { min: 500, max: 1200 },
        scale: { start: 0.7, end: 2.2 },
        alpha: { start: 0.55, end: 0 },
        gravityY: -40,
      });
      this.emitter('spark', {
        speed: { min: 200, max: 520 },
        lifespan: { min: 200, max: 450 },
        scale: { start: 0.6, end: 0 },
        gravityY: 600,
        blendMode: 'ADD',
      });
      this.emitter('chunk', {
        speed: { min: 140, max: 420 },
        angle: { min: 200, max: 340 },
        lifespan: { min: 600, max: 1100 },
        scale: { start: 1, end: 0.6 },
        rotate: { min: 0, max: 360 },
        gravityY: 1100,
      });
      this.emitter('drop', {
        speed: { min: 120, max: 380 },
        angle: { min: 235, max: 305 },
        lifespan: { min: 500, max: 900 },
        scale: { start: 1, end: 0.3 },
        gravityY: 1200,
      });
      this.emitter('dust', {
        speed: { min: 20, max: 110 },
        angle: { min: 180, max: 360 },
        lifespan: { min: 300, max: 700 },
        scale: { start: 0.6, end: 1.6 },
        alpha: { start: 0.6, end: 0 },
      });
      this.emitter('toxic', {
        speed: { min: 5, max: 40 },
        lifespan: { min: 400, max: 900 },
        scale: { start: 0.6, end: 1.6 },
        alpha: { start: 0.7, end: 0 },
        blendMode: 'ADD',
      });
      if (!calm) {
        // Leaves drifting down through the canopy keep the arena alive between turns.
        this.add
          .particles(0, -20, 'leaf', {
            x: { min: 0, max: map.width },
            speedY: { min: 25, max: 55 },
            speedX: { min: -25, max: 25 },
            lifespan: 16000,
            frequency: 1100,
            rotate: { start: 0, end: 540 },
            scale: { min: 0.6, max: 1.1 },
            alpha: 0.85,
          })
          .setDepth(3);
      }

      // Drag to aim: the aim only follows the pointer while it is held down.
      this.input.on(
        'pointerdown',
        (pointer: Input.Pointer, over: GameObjects.GameObject[]) => {
          if (over.length || pointer.worldY > BAR_TOP || !this.canAim()) return;
          const aim = this.aim!;
          const radians = (aim.angle * Math.PI) / 180;
          this.drag = {
            x: pointer.worldX,
            y: pointer.worldY,
            aimX: Math.cos(radians) * aim.power * AIM_REACH,
            aimY: Math.sin(radians) * aim.power * AIM_REACH,
          };
        },
      );
      this.input.on('pointermove', (pointer: Input.Pointer) => {
        if (this.drag && pointer.isDown)
          this.aimTowards(
            this.drag.aimX + pointer.worldX - this.drag.x,
            this.drag.aimY + pointer.worldY - this.drag.y,
          );
      });
      const release = () => (this.drag = null);
      this.input.on('pointerup', release);
      this.input.on('pointerupoutside', release);
      this.createHud();

      this.ready = true;
      if (pendingView) this.setView(pendingView);
      this.setAim(pendingAim);
      if (pendingHud) this.setHud(pendingHud);
      callbacks.onReady();
    }

    setView(view: ArenaView) {
      if (!this.ready) return;
      this.view = view;
      // The server moved on while this client was still replaying: catch up at once.
      if (this.playback && view.stage === 'planning') this.finishPlayback();
      const replay = view.replay;
      if (
        view.stage === 'resolving' &&
        replay &&
        replay.turn > this.playedTurn &&
        !this.playback
      ) {
        this.playedTurn = replay.turn;
        this.startPlayback(replay);
      } else if (!this.playback) {
        // Mounted mid-match or between replays: adopt the current state directly.
        if (replay && view.stage !== 'resolving') this.playedTurn = replay.turn;
        this.applyView();
      }
      if (view.stage === 'planning' && view.turn !== this.bannerTurn) {
        this.bannerTurn = view.turn;
        if (!this.playback) this.banner(labels.turn(view.turn));
      }
    }

    setAim(aim: ArenaAim | null) {
      pendingAim = aim;
      if (!this.ready) return;
      // Mid-drag the scene owns angle and power; React's echo may be a frame behind.
      this.aim =
        this.drag && this.aim && aim
          ? { ...aim, angle: this.aim.angle, power: this.aim.power }
          : aim;
    }

    update(time: number, delta: number) {
      this.drawWater(time);
      if (this.playback) this.stepPlayback();
      for (const sprite of this.tanks.values()) {
        this.animateTank(sprite, time, delta);
        this.keepWhole(sprite);
      }
      this.drawPreview(time);
      this.drawHud(time);
    }

    // ---- HUD ----

    setHud(hud: ArenaHud) {
      pendingHud = hud;
      if (!this.ready) return;
      this.hud = hud;
      this.hint.setText(hud.hint).setColor(hud.error ? '#ffb4a6' : '#ffffff');
      this.stageText.setText(hud.actions.length ? '' : hud.stageLabel);
      const key = JSON.stringify([
        hud.actions,
        hud.selected,
        hud.confirm,
        hud.readyLabel,
        hud.stageLabel,
      ]);
      if (key !== this.hudKey) {
        const locked =
          hud.confirm === 'locked' && !this.hudKey.includes('"locked"');
        this.hudKey = key;
        this.buildControls(locked);
      }
    }

    private createHud() {
      this.hudPanel = this.add.graphics().setDepth(11);
      this.hudGraphics = this.add.graphics().setDepth(12);
      const text = (x: number, y: number, size: number) =>
        this.add
          .text(x, y, '', {
            fontFamily: FONT,
            resolution,
            fontSize: `${size}px`,
            fontStyle: '800',
            color: '#ffffff',
            stroke: '#16111f',
            strokeThickness: 6,
          })
          .setDepth(13);
      this.hint = text(map.width / 2, BAR_TOP - 10, 22).setOrigin(0.5, 1);
      this.stageText = text(map.width / 2, BAR_Y, 26).setOrigin(0.5);
      this.timerText = text(map.width / 2, TIMER_Y, 26).setOrigin(0.5);
    }

    /** Chunky toy buttons: a solid face on a darker offset edge. */
    private button(
      x: number,
      width: number,
      face: number,
      edge: number,
      disabled: boolean,
      onPress: () => void,
    ) {
      const g = this.add.graphics();
      g.fillStyle(edge, 1);
      g.fillRoundedRect(-width / 2, -SQUARE / 2 + 5, width, SQUARE, 16);
      g.fillStyle(face, 1);
      g.fillRoundedRect(-width / 2, -SQUARE / 2, width, SQUARE, 16);
      const root = this.add
        .container(x, BAR_Y, [g])
        .setDepth(13)
        .setAlpha(disabled ? 0.4 : 1)
        .setSize(width, SQUARE);
      if (disabled) return root;
      root.setInteractive({ useHandCursor: true });
      root.on('pointerover', () => (root.y = BAR_Y - 3));
      root.on('pointerout', () => (root.y = BAR_Y));
      root.on('pointerdown', () => (root.y = BAR_Y + 3));
      root.on('pointerup', () => {
        root.y = BAR_Y - 3;
        onPress();
      });
      return root;
    }

    private makeActionIconTextures() {
      const source = this.textures
        .get('action-atlas')
        .getSourceImage() as HTMLImageElement;
      const cellWidth = Math.floor(source.width / 4);
      const cellHeight = Math.floor(source.height / 3);

      for (const [action, slot] of Object.entries(actionIconSlots) as Array<
        [ActionId, readonly [number, number]]
      >) {
        const key = `action-icon-${action}`;
        const texture = this.textures.createCanvas(key, cellWidth, cellHeight)!;
        texture.context.drawImage(
          source,
          slot[0] * cellWidth,
          slot[1] * cellHeight,
          cellWidth,
          cellHeight,
          0,
          0,
          cellWidth,
          cellHeight,
        );
        texture.refresh();
        this.actionTextures.set(action, key);
      }
    }

    private actionIcon(action: ActionId) {
      const texture =
        this.actionTextures.get(action) ?? `action-file-${action}`;
      return this.add.image(0, 0, texture).setDisplaySize(50, 50);
    }

    private makePickupIconTextures() {
      const source = this.textures
        .get('pickup-atlas')
        .getSourceImage() as HTMLImageElement;
      const cellWidth = Math.floor(source.width / 3);
      const cellHeight = Math.floor(source.height / 2);

      for (const [kind, slot] of Object.entries(pickupIconSlots) as Array<
        [PickupKind, readonly [number, number]]
      >) {
        const key = `pickup-icon-${kind}`;
        const texture = this.textures.createCanvas(key, cellWidth, cellHeight)!;
        texture.context.drawImage(
          source,
          slot[0] * cellWidth,
          slot[1] * cellHeight,
          cellWidth,
          cellHeight,
          0,
          0,
          cellWidth,
          cellHeight,
        );
        texture.refresh();
        this.pickupTextures.set(kind, key);
      }
    }

    private pickupIcon(kind: PickupKind) {
      const texture = this.pickupTextures.get(kind) ?? 'pickup-atlas';
      return this.add.image(0, 0, texture).setDisplaySize(56, 56);
    }

    /**
     * The bar is sized to its contents and centered: square action buttons (key, icon,
     * cooldown) and a Ready text button. Once ready, the plan is final: everything is
     * shown disabled until the turn resolves.
     */
    private buildControls(justLocked: boolean) {
      for (const control of this.hudControls) control.destroy();
      this.hudControls = [];
      this.hudPanel.clear();
      const hud = this.hud!;
      const count = hud.actions.length;
      const ready = hud.confirm !== 'hidden';
      const width = count
        ? count * SQUARE + (count - 1) * GAP + (ready ? GAP * 2 + READY_W : 0)
        : hud.stageLabel
          ? this.stageText.width + 20
          : 0;
      if (!width) return;
      const left = (map.width - width) / 2;
      this.hudPanel.fillStyle(0x13111f, 0.82);
      this.hudPanel.fillRoundedRect(left - 14, BAR_TOP, width + 28, 84, 22);

      const locked = hud.confirm === 'locked';
      hud.actions.forEach((action, index) => {
        const selected = action.id === hud.selected;
        const root = this.button(
          left + SQUARE / 2 + index * (SQUARE + GAP),
          SQUARE,
          selected ? 0xffc43d : 0x29253f,
          selected ? 0xa8760b : 0x08060e,
          action.disabled || locked,
          () => callbacks.onAction(action.id),
        );
        // A locked plan keeps its chosen action bright.
        if (locked && selected) root.setAlpha(1);
        const icon = this.actionIcon(action.id).setDisplaySize(42, 42);
        const key = this.add
          .text(-SQUARE / 2 + 9, -SQUARE / 2 + 7, action.key, {
            fontFamily: FONT,
            resolution,
            fontSize: '13px',
            fontStyle: '800',
            color: selected ? '#16111f' : '#ffffffaa',
          })
          .setOrigin(0.5);
        root.setName(action.name);
        root.add([icon, key]);
        if (action.cooldown > 0) {
          const badge = this.add.circle(
            SQUARE / 2 - 4,
            -SQUARE / 2 + 4,
            12,
            0xff6b4a,
          );
          const turns = this.add
            .text(SQUARE / 2 - 4, -SQUARE / 2 + 4, String(action.cooldown), {
              fontFamily: FONT,
              resolution,
              fontSize: '14px',
              fontStyle: '800',
              color: '#16111f',
            })
            .setOrigin(0.5);
          root.add([badge, turns]);
        }
        this.hudControls.push(root);
      });

      if (!ready) return;
      const disabled = hud.confirm === 'disabled';
      const [face, edge] = locked
        ? [0x45dcae, 0x1c7c5f]
        : disabled
          ? [0x29253f, 0x08060e]
          : [0xff6b4a, 0x9e2f1d];
      const root = this.button(
        left + width - READY_W / 2,
        READY_W,
        face,
        edge,
        disabled || locked,
        () => callbacks.onConfirm(),
      );
      if (locked) root.setAlpha(1);
      const label = this.add
        .text(0, 0, `${locked ? '✓ ' : ''}${hud.readyLabel}`, {
          fontFamily: FONT,
          resolution,
          fontSize: '24px',
          fontStyle: '800',
          color: disabled ? '#ffffff' : '#16111f',
        })
        .setOrigin(0.5);
      root.add(label);
      this.hudControls.push(root);
      if (justLocked && !calm)
        this.tweens.add({
          targets: label,
          scale: { from: 1.3, to: 1 },
          duration: 300,
          ease: 'Back.easeOut',
        });
    }

    private drawHud(time: number) {
      const g = this.hudGraphics;
      g.clear();
      const hud = this.hud;
      const planning = this.view?.stage === 'planning' && !this.playback;

      // Timer at the top center: a ring that empties, urgent coral in the last five seconds.
      if (hud && hud.endsAt && planning) {
        const seconds = Math.max(0, (hud.endsAt - performance.now()) / 1000);
        const urgent = seconds <= 5;
        const x = map.width / 2;
        g.fillStyle(0x13111f, 0.82);
        g.fillCircle(x, TIMER_Y, 34);
        g.lineStyle(7, urgent ? 0xff6b4a : 0x45dcae, 1);
        g.beginPath();
        g.arc(
          x,
          TIMER_Y,
          27,
          -Math.PI / 2,
          -Math.PI / 2 + (seconds / PLANNING_SECONDS) * Math.PI * 2,
        );
        g.strokePath();
        this.timerText
          .setVisible(true)
          .setText(String(Math.ceil(seconds)))
          .setScale(
            urgent && !calm ? 1 + Math.abs(Math.sin(time / 160)) * 0.15 : 1,
          );
      } else this.timerText.setVisible(false);
    }

    // ---- state ----

    private applyView() {
      const view = this.view;
      if (!view) return;
      this.previewKey = '';
      this.carveTo(view.craters);
      for (const player of view.players) {
        const sprite = this.tankSprite(player);
        const wasConfirmed = sprite.badge.visible;
        Object.assign(sprite, {
          health: player.health,
          maxHealth: player.maxHealth,
          shield: player.shield,
          facing: player.facing,
        });
        if (!sprite.alive) continue;
        if (!player.alive) {
          sprite.alive = false;
          sprite.root.setVisible(false);
          continue;
        }
        sprite.root.setPosition(player.x, player.y);
        sprite.body.setRotation(player.angle);
        sprite.body.setFlipX(player.facing < 0);
        sprite.label.setColor(player.you ? '#ffc43d' : '#ffffff');
        const confirmed = view.stage === 'planning' && player.confirmed;
        sprite.badge.setVisible(confirmed);
        if (confirmed && !wasConfirmed && !calm)
          this.tweens.add({
            targets: sprite.badge,
            scale: { from: 0.2, to: 1 },
            duration: 320,
            ease: 'Back.easeOut',
          });
        sprite.status.setText(
          [
            player.shield > 0 ? '⛨' : '',
            player.poisonTurns > 0 ? '☠' : '',
            player.frozenTurns > 0 ? '❄' : '',
            player.boost === 'damage'
              ? '⚡'
              : player.boost === 'poison'
                ? '☣'
                : player.boost === 'freeze'
                  ? '✱'
                  : '',
          ].join(''),
        );
        if (player.frozenTurns > 0) sprite.body.setTint(0xbfe4ff);
        else sprite.body.clearTint();
      }
      this.syncPickups(view.pickups);
      this.syncHazard(view.stage === 'planning' ? view.hazard : null);
    }

    private tankSprite(player: ArenaTank): TankSprite {
      const existing = this.tanks.get(player.id);
      if (existing) return existing;
      const shadow = this.add.ellipse(0, 1, TANK_W, 10, 0x08060e, 0.3);
      const body = this.add
        .image(0, 0, `tank-${player.tank}`)
        .setOrigin(0.5, 0.87)
        .setScale(SPRITE_SCALE);
      const bar = this.add.graphics();
      const text = (y: number, size: number) =>
        this.add
          .text(0, y, '', {
            fontFamily: FONT,
            resolution,
            fontSize: `${size}px`,
            fontStyle: '800',
            color: '#ffffff',
            stroke: '#16111f',
            strokeThickness: 5,
          })
          .setOrigin(0.5);
      const label = text(-162, 22).setText(player.name);
      const status = text(-190, 22);
      const badge = this.add
        .text(label.width / 2 + 18, -162, '✔', {
          fontFamily: FONT,
          resolution,
          fontSize: '16px',
          fontStyle: '800',
          color: '#16111f',
          backgroundColor: '#45dcae',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5)
        .setVisible(false);
      // The art's sphere spans ~77% of the image; size it to the physical bubble.
      const bubble = this.add
        .image(0, 0, 'spike-bubble')
        .setDisplaySize((BUBBLE_RADIUS * 2) / 0.77, (BUBBLE_RADIUS * 2) / 0.77)
        .setVisible(false);
      const root = this.add
        .container(player.x, player.y, [
          shadow,
          body,
          bubble,
          bar,
          label,
          status,
          badge,
        ])
        .setDepth(5);
      const sprite: TankSprite = {
        root,
        bubble,
        body,
        shadow,
        bar,
        label,
        status,
        badge,
        health: player.health,
        shownHealth: player.health,
        maxHealth: player.maxHealth,
        shield: player.shield,
        alive: true,
        airborne: false,
        sinking: false,
        phase: Math.random() * Math.PI * 2,
        facing: player.facing,
        nextPuff: 0,
      };
      this.tanks.set(player.id, sprite);
      return sprite;
    }

    private carveTo(craters: [number, number, number][]) {
      for (; this.applied < craters.length; this.applied++) {
        const [x, y, r] = craters[this.applied]!;
        this.carve(x, y, r);
      }
    }

    /** Scorches the rim, then erases the crater from the art and the preview terrain. */
    private carve(x: number, y: number, r: number) {
      this.terrain.carve(x, y, r);
      const context = this.terrainTexture.context;
      context.save();
      // Craters at an edge continue on the other side of the wrapped arena.
      for (const cx of [x - map.width, x, x + map.width]) {
        if (cx + r + 7 < 0 || cx - r - 7 > map.width) continue;
        context.globalCompositeOperation = 'source-atop';
        context.fillStyle = 'rgba(38, 22, 12, 0.75)';
        context.beginPath();
        context.arc(cx, y, r + 7, 0, Math.PI * 2);
        context.fill();
        context.globalCompositeOperation = 'destination-out';
        context.beginPath();
        context.arc(cx, y, r, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
      this.terrainTexture.refresh();
      this.previewKey = '';
    }

    private syncPickups(pickups: Pickup[]) {
      const ids = new Set(pickups.map((pickup) => pickup.id));
      for (const [id, view] of this.pickupViews)
        if (!ids.has(id)) {
          this.pickupViews.delete(id);
          view.destroy();
        }
      for (const pickup of pickups) {
        const existing = this.pickupViews.get(pickup.id);
        if (existing) {
          existing.setPosition(pickup.x, pickup.y - 20);
          continue;
        }
        const icon = this.pickupIcon(pickup.kind);
        const view = this.add
          .container(pickup.x, pickup.y - 20, [icon])
          .setDepth(3);
        this.pickupViews.set(pickup.id, view);
        if (calm) continue;
        // Drops in from the sky, then floats and spins while it waits.
        this.tweens.add({
          targets: view,
          y: { from: pickup.y - 320, to: pickup.y - 20 },
          duration: 700,
          ease: 'Bounce.easeOut',
          onComplete: () =>
            this.tweens.add({
              targets: view,
              y: pickup.y - 26,
              duration: 900,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            }),
        });
        this.tweens.add({
          targets: icon,
          scaleX: 0.55,
          duration: 1100,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    private syncHazard(hazard: Hazard | null) {
      const key = hazard ? `${hazard.x}:${hazard.spread}` : '';
      if (key === this.hazardKey) return;
      this.hazardKey = key;
      this.hazardView?.destroy();
      this.hazardView = null;
      if (!hazard) return;
      const width = hazard.spread * 2 + 80;
      const zone = this.add
        .rectangle(0, map.height / 2, width, map.height, 0xff3b30, 0.12)
        .setStrokeStyle(3, 0xff6b4a, 0.8);
      const surface = this.terrain.surfaceBelow(hazard.x, 0) ?? map.waterY;
      const cross = this.add
        .circle(0, surface - 4, 26)
        .setStrokeStyle(4, 0xff6b4a);
      const dot = this.add.circle(0, surface - 4, 5, 0xff6b4a);
      const title = this.add
        .text(0, 70, `⚠ ${labels.airstrike}`, {
          fontFamily: FONT,
          resolution,
          fontSize: '26px',
          fontStyle: '800',
          color: '#ffffff',
          backgroundColor: '#c0392bcc',
          padding: { x: 12, y: 6 },
        })
        .setOrigin(0.5);
      const arrows = [-1, 0, 1].map((offset) =>
        this.add
          .text(offset * hazard.spread * 0.8, 140, '▼', {
            fontFamily: FONT,
            resolution,
            fontSize: '30px',
            color: '#ff6b4a',
          })
          .setOrigin(0.5),
      );
      this.hazardView = this.add
        .container(hazard.x, 0, [zone, cross, dot, title, ...arrows])
        .setDepth(4);
      if (calm) return;
      this.tweens.add({
        targets: zone,
        fillAlpha: 0.22,
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
      this.tweens.add({
        targets: cross,
        scale: 1.4,
        alpha: 0.4,
        duration: 600,
        yoyo: true,
        repeat: -1,
      });
      this.tweens.add({
        targets: arrows,
        y: 170,
        duration: 450,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // ---- aiming ----

    private own() {
      return this.view?.players.find((player) => player.you && player.alive);
    }

    private canAim() {
      return (
        Boolean(this.aim && this.own()) &&
        this.view?.stage === 'planning' &&
        !this.playback
      );
    }

    /** Sets the aim from an offset (dx, dy) relative to the barrel. */
    private aimTowards(dx: number, dy: number) {
      if (!this.canAim() || actions[this.aim!.action].aim === 'none') return;
      // Fine precision: whole degrees make long shots jump by ~25px per step.
      const angle = Math.round((Math.atan2(dy, dx) * 1800) / Math.PI) / 10;
      const power =
        Math.round(
          Math.min(1, Math.max(0.1, Math.hypot(dx, dy) / AIM_REACH)) * 1000,
        ) / 1000;
      // Redraw from the local aim right away; React only records it for the plan.
      this.aim = { ...this.aim!, angle, power };
      callbacks.onAim(angle, power);
    }

    private drawPreview(time: number) {
      this.preview.clear();
      const own = this.own();
      const target = this.aim;
      if (!own || !target || !this.canAim()) {
        this.shownAim = null;
        return;
      }
      // The drawn arc eases toward the chosen aim, so it glides while dragging.
      const shown =
        this.shownAim?.action === target.action ? this.shownAim : { ...target };
      const turn = ((target.angle - shown.angle + 540) % 360) - 180;
      const ease = calm ? 1 : 0.35;
      shown.angle += turn * ease;
      shown.power += (target.power - shown.power) * ease;
      if (Math.abs(turn) < 0.05 && Math.abs(target.power - shown.power) < 5e-4)
        Object.assign(shown, { angle: target.angle, power: target.power });
      this.shownAim = shown;
      const aim = shown;
      const info = actions[aim.action];
      if (info.aim === 'none') return;
      const key = `${aim.action}|${aim.angle}|${aim.power}|${own.x}|${own.y}`;
      if (key !== this.previewKey) {
        this.previewKey = key;
        // Dots end where the aim first touches terrain or another tank.
        const others = (this.view?.players ?? []).filter(
          (player) => player.alive && player.id !== own.id,
        );
        const solid = (x: number, y: number) =>
          this.terrain.solid(x, y) ||
          others.some((other) => insideTank(other, x, y, map.width));
        if (info.aim === 'bubble') {
          this.previewPoints = [
            bubblePreview(
              this.terrain,
              centerOf(own),
              launchVelocity(aim.angle, aim.power, BUBBLE_SPEED * info.speed),
              solid,
            ),
          ];
        } else if (info.aim === 'jump') {
          const velocity = launchVelocity(
            clampJumpAngle(aim.angle),
            aim.power,
            jumpSpeed(tanks[own.tank].weight) * info.speed,
          );
          this.previewPoints = [
            jumpPreview(this.terrain, own, velocity, solid),
          ];
        } else {
          const fan = aim.action === 'triple-shot' ? [-6, 0, 6] : [0];
          this.previewPoints = fan.map((offset) =>
            shellPreview(
              this.terrain,
              muzzle(own, aim.angle + offset),
              launchVelocity(
                aim.angle + offset,
                aim.power,
                SHELL_SPEED * info.speed,
              ),
              solid,
            ),
          );
        }
      }
      // Only small marching dots along each predicted path: no arrow, no end marker.
      // Dots glide continuously along the path (one spacing every 240ms).
      const spacing = 4;
      const phase = calm ? 0 : ((time / 240) % 1) * spacing;
      for (const points of this.previewPoints) {
        const last = points.length / 2 - 1;
        for (let at = phase; at <= last; at += spacing) {
          const from = Math.floor(at);
          const to = Math.min(last, from + 1);
          const f = at - from;
          const x =
            points[from * 2]! + (points[to * 2]! - points[from * 2]!) * f;
          const y =
            points[from * 2 + 1]! +
            (points[to * 2 + 1]! - points[from * 2 + 1]!) * f;
          // A wrap across the edge is a jump between samples: skip that dot.
          if (Math.abs(points[to * 2]! - points[from * 2]!) > 400) continue;
          const alpha = 0.95 - (at / Math.max(1, last)) * 0.55;
          this.preview.fillStyle(0x16111f, alpha * 0.5);
          this.preview.fillCircle(x, y + 2, 6);
          this.preview.fillStyle(0xffffff, alpha);
          this.preview.fillCircle(x, y, 4.5);
        }
      }
    }

    // ---- replay ----

    private startPlayback(replay: Replay) {
      const tankTracks = new Map<string, ReplayTrack[]>();
      const shells: ReplayTrack[] = [];
      for (const track of replay.tracks)
        if (track.kind === 'tank')
          tankTracks.set(track.id, [
            ...(tankTracks.get(track.id) ?? []),
            track,
          ]);
        else shells.push(track);
      this.playback = {
        replay,
        startedAt: performance.now(),
        next: 0,
        tankTracks,
        shells,
      };
      this.syncHazard(null);
      this.preview.clear();
      // Craters from earlier turns first; this turn's are carved as its blasts play.
      const fresh = replay.events.filter(
        (event) => event.type === 'explode' && event.crater > 0,
      ).length;
      this.carveTo((this.view?.craters ?? []).slice(0, -fresh || undefined));
      for (const player of this.view?.players ?? []) this.tankSprite(player);
      for (const start of replay.start) {
        const sprite = this.tanks.get(start.id);
        if (!sprite) continue;
        sprite.root.setPosition(start.x, start.y);
        sprite.body.setRotation(start.angle);
        sprite.health = start.health;
        sprite.shield = start.shield;
        sprite.badge.setVisible(false);
        const player = this.view?.players.find((p) => p.id === start.id);
        if (player) {
          sprite.facing = player.facing;
          sprite.body.setFlipX(player.facing < 0);
        }
      }
    }

    private stepPlayback() {
      const playback = this.playback!;
      // Wall clock, not the frame clock: a throttled tab catches up instead of lagging.
      const tick =
        ((performance.now() - playback.startedAt) * TICK_RATE) / 1000;
      const events = playback.replay.events;
      while (playback.next < events.length && events[playback.next]!.t <= tick)
        this.handle(events[playback.next++]!);

      for (const [id, tracks] of playback.tankTracks) {
        const sprite = this.tanks.get(id);
        if (!sprite || !sprite.alive || sprite.sinking) continue;
        let flying = false;
        for (const track of tracks) {
          if (tick < track.t0) break;
          const [x, y] = samplePath(track, tick);
          sprite.root.setPosition(x, y);
          // The simulated rotation: tumbles, tips and slopes play back as they happened.
          sprite.body.setRotation(sampleAngle(track, tick));
          if (tick < track.t1) flying = true;
        }
        if (sprite.airborne && !flying) this.land(sprite);
        if (!sprite.airborne && flying) this.takeOff(sprite);
        sprite.airborne = flying;
      }

      this.shells.clear();
      for (const track of playback.shells) {
        if (tick < track.t0 || tick >= track.t1) continue;
        const [x, y] = samplePath(track, tick);
        const [px, py] = samplePath(track, Math.max(track.t0, tick - 3));
        const trail = TRAIL[track.kind];
        if (trail && !calm && Math.random() < 0.7)
          this.emitters.get(trail)?.emitParticleAt(x, y, 1);
        const size = track.kind === 'bomblet' ? 6 : 9;
        const core =
          track.kind === 'toxic'
            ? 0x7ed957
            : track.kind === 'strike'
              ? 0xff3b30
              : track.kind === 'pulse'
                ? 0x6cc4ff
                : 0xffc43d;
        this.shells.lineStyle(size, core, 0.35);
        if (Math.abs(x - px) < 400) this.shells.lineBetween(px, py, x, y);
        this.shells.fillStyle(0x16111f, 1);
        this.shells.fillCircle(x, y, size);
        this.shells.fillStyle(core, 1);
        this.shells.fillCircle(x, y, size * 0.45);
      }

      if (tick >= playback.replay.ticks) this.finishPlayback();
    }

    /** Applies any remaining events and hands the arena back to the synced state. */
    private finishPlayback() {
      const playback = this.playback!;
      const events = playback.replay.events;
      while (playback.next < events.length)
        this.handle(events[playback.next++]!);
      this.playback = null;
      this.shells.clear();
      for (const sprite of this.tanks.values()) {
        sprite.airborne = false;
        this.setBubble(sprite, false);
      }
      this.applyView();
    }

    /** Swaps the hull for the Spike Bubble art (or back). */
    private setBubble(sprite: TankSprite, active: boolean) {
      sprite.bubble.setVisible(active);
      sprite.body.setVisible(!active);
      sprite.shadow.setVisible(!active);
    }

    private handle(event: ReplayEvent) {
      switch (event.type) {
        case 'fire': {
          const sprite = this.tanks.get(event.id);
          if (!sprite) return;
          const info = actions[event.action];
          if (info.aim !== 'shell') return;
          const shot = this.playback?.shells.find(
            (track) => track.id === event.id && track.t0 === event.t,
          );
          if (!shot) return;
          const [mx, my] = [shot.pts[0]!, shot.pts[1]!];
          this.emitters.get('fire')?.explode(8, mx, my);
          this.emitters.get('smoke')?.explode(6, mx, my);
          if (calm) return;
          // Recoil: the hull kicks back away from the shot.
          const away = Math.sign(sprite.root.x - mx) || -sprite.facing;
          this.tweens.add({
            targets: sprite.body,
            x: away * 7,
            duration: 70,
            yoyo: true,
            ease: 'Quad.easeOut',
          });
          this.cameras.main.shake(90, 0.002);
          return;
        }
        case 'explode': {
          if (event.crater > 0) {
            this.carve(event.x, event.y, event.crater);
            this.applied += 1;
            this.emitters
              .get('chunk')
              ?.explode(Math.round(event.crater / 2), event.x, event.y);
          }
          this.boom(event.x, event.y, event.r);
          return;
        }
        case 'damage': {
          const sprite = this.tanks.get(event.id);
          if (!sprite) return;
          sprite.health = event.health;
          sprite.shield = event.shield;
          const { x, y } = sprite.root;
          this.float(
            x,
            y - 132,
            `-${event.amount}`,
            '#ff6b4a',
            22 + Math.min(20, event.amount / 2),
          );
          // Hit flash: bright for an instant, then back to normal.
          sprite.body.setTint(0xffffff).setTintMode(TINT_FILL);
          this.time.delayedCall(90, () =>
            sprite.body.clearTint().setTintMode(TINT_MULTIPLY),
          );
          if (!calm)
            this.tweens.add({
              targets: sprite.body,
              scaleX: SPRITE_SCALE * 1.15,
              scaleY: SPRITE_SCALE * 0.85,
              duration: 80,
              yoyo: true,
            });
          return;
        }
        case 'status': {
          const sprite = this.tanks.get(event.id);
          if (!sprite) return;
          const frozen = event.status === 'frozen';
          this.float(
            sprite.root.x,
            sprite.root.y - 176,
            frozen ? labels.frozen : labels.poisoned,
            frozen ? '#bfeaff' : '#7ed957',
            18,
          );
          if (frozen) sprite.body.setTint(0xbfe4ff);
          return;
        }
        case 'eliminated': {
          const sprite = this.tanks.get(event.id);
          if (!sprite || !sprite.alive) return;
          sprite.alive = false;
          if (event.cause === 'water') {
            sprite.sinking = true;
            this.tweens.add({
              targets: sprite.root,
              y: sprite.root.y + 60,
              alpha: 0,
              angle: sprite.facing * 25,
              duration: 900,
              ease: 'Quad.easeIn',
              onComplete: () => sprite.root.setVisible(false),
            });
            return;
          }
          this.boom(sprite.root.x, sprite.root.y - TANK_H / 2, 70);
          this.emitters
            .get('chunk')
            ?.explode(14, sprite.root.x, sprite.root.y - 20);
          sprite.body.setTint(0x333333);
          this.tweens.add({
            targets: sprite.root,
            alpha: 0,
            y: sprite.root.y - 30,
            duration: 800,
            delay: 250,
            onComplete: () => sprite.root.setVisible(false),
          });
          return;
        }
        case 'splash': {
          this.emitters.get('drop')?.explode(24, event.x, map.waterY - 20);
          const ring = this.add
            .ellipse(event.x, map.waterY - 12, 40, 12)
            .setStrokeStyle(3, 0xffffff, 0.8)
            .setDepth(6);
          this.tweens.add({
            targets: ring,
            scaleX: 4,
            scaleY: 2.5,
            alpha: 0,
            duration: 900,
            onComplete: () => ring.destroy(),
          });
          return;
        }
        case 'pickup': {
          const view = this.pickupViews.get(event.pickup);
          const sprite = this.tanks.get(event.id);
          if (view) {
            this.pickupViews.delete(event.pickup);
            this.emitters.get('spark')?.explode(18, view.x, view.y);
            this.tweens.killTweensOf(view);
            this.tweens.add({
              targets: view,
              scale: 1.8,
              alpha: 0,
              duration: 300,
              onComplete: () => view.destroy(),
            });
          }
          if (sprite)
            this.float(
              sprite.root.x,
              sprite.root.y - 186,
              labels.pickups[event.kind],
              '#ffc43d',
              20,
            );
          return;
        }
        case 'bubble': {
          const sprite = this.tanks.get(event.id);
          if (!sprite) return;
          this.setBubble(sprite, event.active);
          const center = centerOf({
            x: sprite.root.x,
            y: sprite.root.y,
            angle: sprite.body.rotation,
          });
          this.emitters
            .get('spark')
            ?.explode(event.active ? 16 : 26, center.x, center.y);
          if (!calm)
            this.tweens.add({
              targets: event.active ? sprite.bubble : sprite.body,
              scale: {
                from: (event.active ? sprite.bubble : sprite.body).scale * 0.6,
                to: (event.active ? sprite.bubble : sprite.body).scale,
              },
              duration: 260,
              ease: 'Back.easeOut',
            });
          return;
        }
        case 'airstrike': {
          const flash = this.add
            .rectangle(0, 0, map.width, map.height, 0xff3b30, 0.18)
            .setOrigin(0)
            .setDepth(10);
          this.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 300,
            yoyo: !calm,
            repeat: calm ? 0 : 1,
            onComplete: () => flash.destroy(),
          });
          this.banner(`⚠ ${labels.airstrike}`, '#ff6b4a');
          return;
        }
      }
    }

    // ---- effects ----

    private boom(x: number, y: number, r: number) {
      this.emitters.get('fire')?.explode(Math.round(r * 0.45), x, y);
      this.emitters.get('smoke')?.explode(Math.round(r * 0.25), x, y);
      this.emitters.get('spark')?.explode(Math.round(r * 0.3), x, y);
      const flash = this.add.circle(x, y, r, 0xfff3c4, 0.9).setDepth(7);
      this.tweens.add({
        targets: flash,
        scale: { from: 0.3, to: 1.1 },
        alpha: 0,
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => flash.destroy(),
      });
      const ring = this.add
        .circle(x, y, r)
        .setStrokeStyle(5, 0xffffff, 0.85)
        .setDepth(7);
      this.tweens.add({
        targets: ring,
        scale: { from: 0.2, to: 1.35 },
        alpha: 0,
        duration: 420,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
      if (calm) return;
      this.cameras.main.shake(160 + r * 2, Math.min(0.014, r / 6000));
    }

    private takeOff(sprite: TankSprite) {
      const { x, y } = sprite.root;
      this.emitters.get('dust')?.explode(10, x, y);
      sprite.shadow.setVisible(false);
      if (calm) return;
      this.tweens.add({
        targets: sprite.body,
        scaleX: SPRITE_SCALE * 0.85,
        scaleY: SPRITE_SCALE * 1.2,
        duration: 120,
        yoyo: true,
      });
    }

    private land(sprite: TankSprite) {
      const { x, y } = sprite.root;
      this.emitters.get('dust')?.explode(14, x, y);
      sprite.shadow.setVisible(true);
      if (calm) return;
      this.tweens.add({
        targets: sprite.body,
        scaleX: SPRITE_SCALE * 1.2,
        scaleY: SPRITE_SCALE * 0.78,
        duration: 90,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    private animateTank(sprite: TankSprite, time: number, delta: number) {
      if (!sprite.root.visible) return;
      // Health drains visibly instead of snapping.
      sprite.shownHealth +=
        (sprite.health - sprite.shownHealth) * Math.min(1, delta / 250);
      if (Math.abs(sprite.shownHealth - sprite.health) < 0.3)
        sprite.shownHealth = sprite.health;
      this.drawBar(sprite);
      if (calm || !sprite.alive || sprite.airborne) return;
      // Idle engine rumble and the occasional exhaust puff.
      sprite.body.y = Math.sin(time / 170 + sprite.phase) * 1.1;
      if (time > sprite.nextPuff) {
        sprite.nextPuff = time + 900 + Math.random() * 1400;
        this.emitters
          .get('smoke')
          ?.emitParticleAt(
            sprite.root.x - sprite.facing * (TANK_W / 2 + 4),
            sprite.root.y - 18,
            1,
          );
      }
    }

    /**
     * The arena wraps, but a tank is drawn as one object: across an edge it shows whole on
     * the side holding most of it (its center's side) and jumps over once the center
     * crosses, instead of being split across both edges. Near an edge the drawing can sit
     * up to `EDGE_REACH` px inward of the physical position.
     */
    private keepWhole(sprite: TankSprite) {
      sprite.root.x = Math.max(
        EDGE_REACH,
        Math.min(map.width - EDGE_REACH, sprite.root.x),
      );
      if (sprite.bubble.visible) {
        const angle = sprite.body.rotation;
        sprite.bubble
          .setPosition(
            (TANK_H / 2) * Math.sin(angle),
            (-TANK_H / 2) * Math.cos(angle),
          )
          .setRotation(angle);
      }
      // Long names still slide inward to stay readable.
      const x = sprite.root.x;
      const shift = Math.max(70 - x, Math.min(0, map.width - 70 - x));
      sprite.bar.x = shift;
      sprite.label.x = shift;
      sprite.status.x = shift;
      sprite.badge.x = sprite.label.width / 2 + 18 + shift;
    }

    private drawBar(sprite: TankSprite) {
      const bar = sprite.bar;
      const width = 104;
      const y = -138;
      const ratio = Math.max(0, sprite.health / sprite.maxHealth);
      const shown = Math.max(0, sprite.shownHealth / sprite.maxHealth);
      bar.clear();
      bar.fillStyle(0x16111f, 0.85);
      bar.fillRoundedRect(-width / 2 - 3, y - 3, width + 6, 14, 6);
      bar.fillStyle(0xff9f8f, 1);
      bar.fillRect(-width / 2, y, width * shown, 8);
      bar.fillStyle(
        ratio > 0.5 ? 0x45dcae : ratio > 0.25 ? 0xffc43d : 0xff6b4a,
        1,
      );
      bar.fillRect(-width / 2, y, width * ratio, 8);
      if (sprite.shield > 0) {
        bar.fillStyle(0x6cc4ff, 1);
        bar.fillRect(
          -width / 2,
          y + 8,
          Math.min(width, (width * sprite.shield) / sprite.maxHealth),
          2,
        );
      }
    }

    private float(
      x: number,
      y: number,
      text: string,
      color: string,
      size: number,
    ) {
      const label = this.add
        .text(x, y, text, {
          fontFamily: FONT,
          resolution,
          fontSize: `${Math.round(size)}px`,
          fontStyle: '800',
          color,
          stroke: '#16111f',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(9)
        .setScale(0.4);
      this.tweens.add({
        targets: label,
        scale: 1,
        duration: 180,
        ease: 'Back.easeOut',
      });
      this.tweens.add({
        targets: label,
        y: y - 50,
        alpha: 0,
        delay: 450,
        duration: 800,
        ease: 'Quad.easeIn',
        onComplete: () => label.destroy(),
      });
    }

    private banner(text: string, color = '#ffffff') {
      const label = this.add
        .text(map.width / 2, 150, text, {
          fontFamily: FONT,
          resolution,
          fontSize: '54px',
          fontStyle: '800',
          color,
          stroke: '#16111f',
          strokeThickness: 10,
        })
        .setOrigin(0.5)
        .setDepth(10)
        .setAlpha(0)
        .setScale(0.6);
      this.tweens.add({
        targets: label,
        alpha: 1,
        scale: 1,
        duration: 260,
        ease: 'Back.easeOut',
      });
      this.tweens.add({
        targets: label,
        alpha: 0,
        y: 120,
        delay: 900,
        duration: 400,
        onComplete: () => label.destroy(),
      });
    }

    private drawWater(time: number) {
      this.water.clear();
      if (calm) return;
      for (let row = 0; row < 3; row++) {
        this.water.lineStyle(3 - row, 0xffffff, 0.22 - row * 0.05);
        this.water.beginPath();
        for (let x = 0; x <= map.width; x += 24) {
          const y =
            map.waterY -
            14 +
            row * 26 +
            Math.sin(x / 55 + (time / 700) * (row + 1)) * 3;
          if (x === 0) this.water.moveTo(x, y);
          else this.water.lineTo(x, y);
        }
        this.water.strokePath();
      }
    }

    private emitter(key: string, config: Record<string, unknown>) {
      this.emitters.set(
        key,
        this.add
          .particles(0, 0, key, { ...config, emitting: false })
          .setDepth(7),
      );
    }

    /** Colored particle textures, so effects look the same in WebGL and canvas. */
    private makeTextures() {
      const g = this.add.graphics();
      const soft = (key: string, color: number, size: number) => {
        g.clear();
        for (let ring = size; ring > 0; ring -= 2) {
          g.fillStyle(color, 0.12 + (1 - ring / size) * 0.5);
          g.fillCircle(size, size, ring);
        }
        g.generateTexture(key, size * 2, size * 2);
      };
      soft('fire', 0xff8a3d, 12);
      soft('smoke', 0x6b6470, 14);
      soft('dust', 0xc9a877, 10);
      soft('toxic', 0x7ed957, 10);
      g.clear();
      g.fillStyle(0xfff3c4, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('spark', 8, 8);
      g.clear();
      g.fillStyle(0x6b4a2b, 1);
      g.fillRect(0, 0, 8, 6);
      g.fillStyle(0x7ccf3a, 1);
      g.fillRect(0, 0, 8, 2);
      g.generateTexture('chunk', 8, 6);
      g.clear();
      g.fillStyle(0xd8f6ff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('drop', 8, 8);
      g.clear();
      g.fillStyle(0x5fae3a, 1);
      g.fillEllipse(7, 4, 14, 7);
      g.fillStyle(0x3d7d28, 1);
      g.fillRect(2, 3, 10, 1);
      g.generateTexture('leaf', 14, 8);
      g.destroy();
    }
  }

  const scene = new ArenaScene();
  const game = new Game({
    // WebGL when available; the canvas fallback keeps the arena playable on picky GPUs.
    type: AUTO,
    parent,
    width: Math.round(map.width * resolution),
    height: Math.round(map.height * resolution),
    backgroundColor: '#1d1a2e',
    // The page sizes the stage; Phaser must not stretch its parent to fill the page.
    scale: {
      mode: Scale.FIT,
      autoCenter: Scale.CENTER_BOTH,
      expandParent: false,
    },
    scene,
    audio: { noAudio: true },
  });

  return {
    update(view: ArenaView) {
      pendingView = view;
      scene.setView(view);
    },
    setAim(aim: ArenaAim | null) {
      scene.setAim(aim);
    },
    setHud(hud: ArenaHud) {
      scene.setHud(hud);
    },
    destroy: () => game.destroy(true),
  };
}
