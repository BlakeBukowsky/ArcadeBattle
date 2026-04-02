import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const TICK_RATE = 1000 / 15;
const WORD_LENGTH = 5;

const WORDS = [
  'about','above','abuse','actor','acute','admit','adopt','adult','after','again',
  'agent','agree','ahead','alarm','album','alert','alike','alive','allow','alone',
  'along','alter','among','anger','angle','angry','apart','apple','apply','arena',
  'argue','arise','armor','array','aside','asset','audio','avoid','award','aware',
  'awful','basic','basis','beach','begun','being','below','bench','bible','birth',
  'black','blade','blame','bland','blank','blast','blaze','bleed','blend','bless',
  'blind','block','blood','bloom','blown','board','bonus','boost','booth','bound',
  'brain','brand','brave','bread','break','breed','brick','bride','brief','bring',
  'broad','broke','brown','brush','buddy','build','bunch','burst','buyer','cable',
  'camel','candy','cargo','carry','catch','cause','cedar','chain','chair','charm',
  'chart','chase','cheap','check','cheek','cheer','chess','chest','chief','child',
  'china','chunk','chunk','civil','claim','clash','class','clean','clear','clerk',
  'click','cliff','climb','cling','clock','clone','close','cloud','coach','coast',
  'color','comic','coral','could','count','court','cover','crack','craft','crane',
  'crash','crazy','cream','creek','crest','crime','crisp','cross','crowd','crown',
  'crude','crush','cubic','curve','cycle','daily','dance','dealt','death','debug',
  'decay','delay','demon','dense','depot','depth','derby','devil','diary','dirty',
  'disco','ditch','doing','doubt','dough','draft','drain','drake','drama','drank',
  'drawn','dream','dress','dried','drift','drill','drink','drive','drone','drove',
  'drugs','drunk','dryer','dummy','dusty','dwarf','dying','eager','eagle','early',
  'earth','eight','elder','elect','elite','email','empty','enemy','enjoy','enter',
  'entry','equal','error','essay','event','every','exact','exams','excel','exile',
  'exist','extra','faint','fairy','faith','false','fancy','fatal','fault','feast',
  'fence','ferry','fever','fewer','fiber','field','fifth','fifty','fight','final',
  'first','fixed','flame','flash','flask','fleet','flesh','float','flood','floor',
  'flour','fluid','flush','flute','focus','force','forge','forth','forum','found',
  'frame','frank','fraud','fresh','front','froze','fruit','fully','funny','gains',
  'giant','given','glass','globe','gloom','glory','glove','going','grace','grade',
  'grain','grand','grant','graph','grasp','grass','grave','great','green','greet',
  'grief','grill','grind','groan','gross','group','grove','grown','guard','guess',
  'guest','guide','guild','guilt','given','ghost','globe','grain','grape','grasp',
  'habit','hands','happy','harsh','haste','haven','heart','heavy','hedge','hello',
  'hence','herbs','hobby','honey','honor','horse','hotel','house','human','humor',
  'hurry','hyper','ideal','image','imply','index','indie','infra','inner','input',
  'intel','inter','intro','issue','ivory','jewel','joint','joker','jolly','juice',
  'juicy','jumbo','knack','kneel','knelt','knife','knock','known','label','labor',
  'laser','latch','later','laugh','layer','learn','lease','legal','lemon','level',
  'light','limit','linen','liner','lodge','logic','loose','lover','lower','loyal',
  'lucky','lunar','lunch','lying','magic','major','maker','manor','maple','march',
  'marsh','match','mayor','media','mercy','merit','metal','meter','midst','might',
  'minor','minus','model','money','month','moral','mount','mouse','mouth','movie',
  'muddy','music','naive','naked','nerve','never','newly','noble','noise','north',
  'noted','novel','nurse','nylon','ocean','occur','offer','often','olive','onion',
  'onset','opera','orbit','order','organ','other','ought','outer','owner','oxide',
  'ozone','paint','panel','panic','paper','party','pasta','paste','patch','pause',
  'peace','peach','pearl','penny','phase','phone','photo','piano','piece','pilot',
  'pinch','pitch','pixel','pizza','place','plain','plane','plant','plate','plaza',
  'plead','pluck','plumb','plump','plunge','point','poker','polar','polio','polyp',
  'pound','power','press','price','pride','prime','print','prior','prize','probe',
  'prone','proof','proud','prove','proxy','psalm','pulse','punch','pupil','purse',
  'queen','query','quest','queue','quick','quiet','quota','quote','radar','radio',
  'raise','rally','range','rapid','ratio','reach','react','ready','realm','rebel',
  'reign','relax','reply','rider','ridge','rifle','right','rigid','risky','rival',
  'river','robot','rocky','rouge','rough','round','route','royal','rural','sadly',
  'salad','sauce','saved','scale','scare','scene','scope','score','sense','serve',
  'setup','seven','shade','shake','shall','shame','shape','share','shark','sharp',
  'sheep','sheer','sheet','shelf','shell','shift','shine','shirt','shock','shoot',
  'shore','short','shout','shown','sided','sight','sigma','since','sixth','sixty',
  'sized','skill','skull','slang','slash','sleep','slice','slide','slope','small',
  'smart','smell','smile','smoke','snake','solar','solid','solve','sorry','sound',
  'south','space','spare','spark','speak','speed','spend','spent','spice','spine',
  'spite','split','spoke','spoon','sport','spray','squad','stack','staff','stage',
  'stain','stair','stake','stall','stamp','stand','stare','start','state','stays',
  'steal','steam','steel','steep','steer','stern','stick','stiff','still','stock',
  'stone','stood','store','storm','story','stove','strip','stuck','study','stuff',
  'style','sugar','suite','sunny','super','surge','swamp','swear','sweep','sweet',
  'swept','swift','swing','sword','swore','sworn','syrup','table','taken','taste',
  'taxes','teach','teeth','tenor','terms','thank','theme','thick','thing','think',
  'third','thorn','those','three','threw','throw','thumb','tiger','tight','timer',
  'title','today','token','topic','total','touch','tough','towel','tower','toxic',
  'trace','track','trade','trail','train','trait','trash','treat','trend','trial',
  'tribe','trick','tried','troop','truly','trump','trunk','trust','truth','tumor',
  'twice','twist','ultra','uncle','under','unify','union','unite','unity','until',
  'upper','upset','urban','usage','usual','utter','valid','value','valve','vault',
  'venus','verse','vigor','vinyl','viral','virus','visit','vista','vital','vivid',
  'vocal','voice','voter','wage','waist','waste','watch','water','weary','weave',
  'wedge','weigh','weird','whale','wheat','wheel','where','which','while','white',
  'whole','whose','widow','width','woman','world','worry','worse','worst','worth',
  'would','wound','wrath','wrist','wrote','yacht','yearn','yield','young','yours',
  'youth','zebra','zonal',
];

type LetterResult = 'correct' | 'present' | 'absent';

interface Guess {
  word: string;
  results: LetterResult[];
}

interface PlayerState {
  guesses: Guess[];
  currentInput: string;
  solved: boolean;
}

interface WordGuessState {
  players: { [id: string]: PlayerState };
  wordLength: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const wordGuessGame: ServerGameModule = {
  info: {
    id: 'word-guess',
    name: 'Word Guess',
    description: 'Speed Wordle',
    controls: 'Type letters, Enter to submit, Backspace to delete. Green = right spot, Yellow = wrong spot.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;

    const answer = WORDS[Math.floor(Math.random() * WORDS.length)].toUpperCase();

    const state: WordGuessState = {
      players: {
        [p1]: { guesses: [], currentInput: '', solved: false },
        [p2]: { guesses: [], currentInput: '', solved: false },
      },
      wordLength: WORD_LENGTH,
      canvasWidth: 800, canvasHeight: 500,
      winner: null,
    };

    function checkGuess(guess: string): LetterResult[] {
      const results: LetterResult[] = new Array(WORD_LENGTH).fill('absent');
      const answerChars = answer.split('');
      const guessChars = guess.split('');

      // First pass: mark correct
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (guessChars[i] === answerChars[i]) {
          results[i] = 'correct';
          answerChars[i] = '#'; // mark used
          guessChars[i] = '*';
        }
      }

      // Second pass: mark present
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (guessChars[i] === '*') continue;
        const idx = answerChars.indexOf(guessChars[i]);
        if (idx !== -1) {
          results[i] = 'present';
          answerChars[idx] = '#';
        }
      }

      return results;
    }

    const interval = setInterval(() => {
      if (!running) return;
      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        if (!running) return;
        const input = data as { char?: string; submit?: boolean; backspace?: boolean };
        const p = state.players[playerId];
        if (!p || p.solved) return;

        if (input.backspace && p.currentInput.length > 0) {
          p.currentInput = p.currentInput.slice(0, -1);
        } else if (input.char && p.currentInput.length < WORD_LENGTH) {
          const ch = input.char.toUpperCase();
          if (ch >= 'A' && ch <= 'Z') {
            p.currentInput += ch;
          }
        } else if (input.submit && p.currentInput.length === WORD_LENGTH) {
          const results = checkGuess(p.currentInput);
          p.guesses.push({ word: p.currentInput, results });

          if (results.every((r) => r === 'correct')) {
            p.solved = true;
            running = false;
            state.winner = playerId;
            clearInterval(interval);
            ctx.emit('game:state', state);
            ctx.endRound(playerId);
            return;
          }

          p.currentInput = '';
        }

        ctx.emit('game:state', state);
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
