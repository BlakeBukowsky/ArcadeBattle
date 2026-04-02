import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const TICK_RATE = 1000 / 15;
const NUM_COMMANDS = 10;

const BUTTON_NAMES = [
  'florp','blonk','zaxis','quib','mork','snev','plox','wumbo',
  'grix','torp','vonk','zelp','krad','bink','yolt','drex',
];

const LEVER_NAMES = [
  'alpha','beta','gamma','delta','omega','sigma','theta','zeta',
];

const SLIDER_NAMES = [
  'power','thrust','gain','volume','pressure','flow','charge','heat',
];

const KNOB_NAMES = [
  'frequency','mode','channel','phase','range','output','filter','band',
];

const KNOB_OPTIONS = [
  ['OFF', 'LOW', 'MED', 'HIGH'],
  ['A', 'B', 'C', 'D'],
  ['IDLE', 'RUN', 'FAST', 'MAX'],
];

type ControlType = 'button' | 'lever' | 'slider' | 'knob';

interface Control {
  id: string;
  name: string;
  type: ControlType;
  row: number;
  col: number;
  sliderMax?: number;       // for sliders: max value (1-9)
  knobOptions?: string[];   // for knobs: option labels
}

interface Command {
  text: string;           // display text like "Press florp" or "Set power to 5"
  controlId: string;
  action: 'press' | 'set';
  targetValue?: number;   // for sliders: target number, for knobs: target index
}

function generatePanel(): Control[] {
  const controls: Control[] = [];
  const shuffBtn = [...BUTTON_NAMES].sort(() => Math.random() - 0.5);
  const shuffLev = [...LEVER_NAMES].sort(() => Math.random() - 0.5);
  const shuffSld = [...SLIDER_NAMES].sort(() => Math.random() - 0.5);
  const shuffKnb = [...KNOB_NAMES].sort(() => Math.random() - 0.5);
  let bI = 0, lI = 0, sI = 0, kI = 0;

  // 3 rows x 4 cols = 12 controls, mix of types
  const layout: ControlType[] = [
    'button','slider','knob','button',
    'lever','button','slider','lever',
    'knob','button','lever','slider',
  ];
  // Shuffle layout
  layout.sort(() => Math.random() - 0.5);

  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const type = layout[i];
    let name: string;

    if (type === 'button') name = shuffBtn[bI++] ?? `btn${i}`;
    else if (type === 'lever') name = shuffLev[lI++] ?? `lev${i}`;
    else if (type === 'slider') name = shuffSld[sI++] ?? `sld${i}`;
    else name = shuffKnb[kI++] ?? `knb${i}`;

    const ctrl: Control = { id: `${row}-${col}`, name, type, row, col };
    if (type === 'slider') ctrl.sliderMax = 9;
    if (type === 'knob') ctrl.knobOptions = KNOB_OPTIONS[kI % KNOB_OPTIONS.length];

    controls.push(ctrl);
  }

  return controls;
}

function generateCommands(controls: Control[], count: number): Command[] {
  const commands: Command[] = [];
  const buttonVerbs = ['Press', 'Engage', 'Activate'];
  const leverVerbs = ['Pull', 'Toggle', 'Push'];
  const shuffled = [...controls].sort(() => Math.random() - 0.5);

  for (let i = 0; i < count; i++) {
    const ctrl = shuffled[i % shuffled.length];

    if (ctrl.type === 'button') {
      const verb = buttonVerbs[Math.floor(Math.random() * buttonVerbs.length)];
      commands.push({ text: `${verb} ${ctrl.name}`, controlId: ctrl.id, action: 'press' });
    } else if (ctrl.type === 'lever') {
      const verb = leverVerbs[Math.floor(Math.random() * leverVerbs.length)];
      commands.push({ text: `${verb} ${ctrl.name}`, controlId: ctrl.id, action: 'press' });
    } else if (ctrl.type === 'slider') {
      const target = 1 + Math.floor(Math.random() * (ctrl.sliderMax ?? 9));
      commands.push({ text: `Set ${ctrl.name} to ${target}`, controlId: ctrl.id, action: 'set', targetValue: target });
    } else if (ctrl.type === 'knob') {
      const opts = ctrl.knobOptions ?? ['A', 'B', 'C', 'D'];
      const targetIdx = Math.floor(Math.random() * opts.length);
      commands.push({ text: `Turn ${ctrl.name} to ${opts[targetIdx]}`, controlId: ctrl.id, action: 'set', targetValue: targetIdx });
    }
  }

  return commands;
}

interface PlayerState {
  currentCommand: number;
  completed: boolean;
  lastWrong: boolean;
  controlValues: { [controlId: string]: number }; // current slider/knob values per player
}

interface ControlPanelState {
  players: { [id: string]: PlayerState };
  controls: Control[];
  commands: Command[];
  totalCommands: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const controlPanelGame: ServerGameModule = {
  info: {
    id: 'control-panel',
    name: 'Control Panel',
    description: 'Follow the commands! Press buttons, pull levers, set sliders, turn knobs. First to complete all commands wins!',
    maxDuration: 60,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;

    const controls = generatePanel();
    const commands = generateCommands(controls, NUM_COMMANDS);

    // Init control values to 0
    const initValues: { [id: string]: number } = {};
    for (const c of controls) {
      if (c.type === 'slider' || c.type === 'knob') initValues[c.id] = 0;
    }

    const state: ControlPanelState = {
      players: {
        [p1]: { currentCommand: 0, completed: false, lastWrong: false, controlValues: { ...initValues } },
        [p2]: { currentCommand: 0, completed: false, lastWrong: false, controlValues: { ...initValues } },
      },
      controls,
      commands,
      totalCommands: NUM_COMMANDS,
      canvasWidth: 800, canvasHeight: 500,
      winner: null,
    };

    const interval = setInterval(() => {
      if (!running) return;
      ctx.emit('game:state', state);
    }, TICK_RATE);

    function checkCommand(playerId: string): void {
      const p = state.players[playerId];
      const cmd = state.commands[p.currentCommand];
      if (!cmd) return;

      if (cmd.action === 'set') {
        // Check if the control is now at the target value
        const currentVal = p.controlValues[cmd.controlId] ?? 0;
        if (currentVal === cmd.targetValue) {
          p.lastWrong = false;
          p.currentCommand++;
          if (p.currentCommand >= NUM_COMMANDS) {
            p.completed = true;
            running = false;
            state.winner = playerId;
            clearInterval(interval);
            ctx.emit('game:state', state);
            ctx.endRound(playerId);
          }
        }
      }
    }

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        if (!running) return;
        const input = data as { controlId?: string; sliderValue?: number; knobValue?: number };
        if (!input.controlId) return;

        const p = state.players[playerId];
        if (!p || p.completed) return;

        const currentCmd = state.commands[p.currentCommand];
        const ctrl = controls.find((c) => c.id === input.controlId);
        if (!ctrl) return;

        if (ctrl.type === 'button' || ctrl.type === 'lever') {
          // Press/pull action
          if (currentCmd.action === 'press' && input.controlId === currentCmd.controlId) {
            p.lastWrong = false;
            p.currentCommand++;
            if (p.currentCommand >= NUM_COMMANDS) {
              p.completed = true;
              running = false;
              state.winner = playerId;
              clearInterval(interval);
              ctx.emit('game:state', state);
              ctx.endRound(playerId);
              return;
            }
          } else if (currentCmd.controlId !== input.controlId) {
            p.lastWrong = true;
          }
        } else if (ctrl.type === 'slider' && input.sliderValue !== undefined) {
          p.controlValues[ctrl.id] = Math.max(0, Math.min(ctrl.sliderMax ?? 9, input.sliderValue));
          checkCommand(playerId);
        } else if (ctrl.type === 'knob' && input.knobValue !== undefined) {
          const maxIdx = (ctrl.knobOptions?.length ?? 4) - 1;
          p.controlValues[ctrl.id] = Math.max(0, Math.min(maxIdx, input.knobValue));
          checkCommand(playerId);
        }

        ctx.emit('game:state', state);
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
