// Le plan de travail de la session, rejoué depuis les appels d'outils.
//
// `TaskCreate` et `TaskUpdate` sont des mutations : le transcript garde les
// gestes, jamais l'état. Lu dans le flux, un `TaskUpdate` ne dit que
// « tâche 2 → in_progress » — pour savoir où en est la session il faut remonter
// le fil et recoller les morceaux à la main. On rejoue donc la suite ici, une
// fois, pour en tirer la liste telle qu'elle est maintenant.

import type { InjectionKey, Ref } from 'vue';
import type { Block, TranscriptEvent } from 'app/shared/transcript';

/**
 * Le sujet de chaque tâche, par identifiant.
 *
 * Un `TaskUpdate` ne porte qu'un numéro : « #3 → in_progress ». Dans le flux,
 * ce numéro ne dit rien — il faut remonter au `TaskCreate`, des dizaines de
 * tours plus haut, pour savoir de quoi on parle. Les pages, qui rejouent déjà
 * la liste pour la colonne de droite, la fournissent ici ; le jalon la lit.
 *
 * Injecter `null` reste valide : le jalon retombe alors sur le numéro seul.
 */
export const TASK_INDEX: InjectionKey<Ref<Map<string, string>>> = Symbol('task-index');

/**
 * L'index sujet-par-identifiant d'un plan rejoué.
 *
 * Construit sur `all`, et non sur `tasks` : une tâche supprimée sort du plan
 * mais son geste de suppression reste dans le fil, et ce jalon-là a besoin de
 * son sujet comme les autres.
 */
export function taskIndex(progress: TaskProgress): Map<string, string> {
  return new Map(progress.all.map((t) => [t.id, t.subject]));
}

/** Les états que le harness écrit ; tout autre libellé est gardé tel quel. */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | (string & {});

export interface TrackedTask {
  /** L'identifiant attribué par le harness (`"1"`, `"2"`, …). */
  id: string;
  subject: string;
  description: string;
  /** La forme active du sujet — « Extraction du navigateur ». */
  activeForm: string;
  status: TaskStatus;
  /**
   * Le tour où le travail sur cette tâche a commencé — son passage à
   * `in_progress`, ou sa naissance si elle n'a jamais démarré.
   *
   * C'est là qu'on veut atterrir en cliquant une tâche : le dernier mouvement
   * n'est qu'un accusé de fin, alors que le début ouvre sur ce qui a été fait.
   * Un redémarrage écrase la valeur : c'est la reprise en cours qui intéresse,
   * pas une tentative abandonnée.
   */
  startUuid: string;
  /** Le tour où la tâche a bougé pour la dernière fois. */
  uuid: string;
  /** Horodatage de ce dernier mouvement. */
  at: number;
}

/**
 * Un plan, et un seul.
 *
 * Une session en pose souvent plusieurs : un premier plan est mené à son terme,
 * puis la suite du travail en appelle un second. Le harness ne recommence pas sa
 * numérotation pour autant — la deuxième liste continue en #7, #8 — si bien que
 * rien, dans le fil des appels, ne marque la couture. Elle se lit à la reprise
 * des créations après que le travail a commencé.
 */
export interface TaskWave {
  /** Le rang du plan dans la session, à partir de 1. */
  index: number;
  tasks: TrackedTask[];
  done: number;
}

export interface TaskProgress {
  /** Le plan tel qu'il est maintenant : sans les tâches supprimées. */
  tasks: TrackedTask[];
  /**
   * Tout ce qui a été créé, suppressions comprises, dans l'ordre de création.
   *
   * Seul l'index s'en sert : le fil garde le jalon d'une suppression, et ce
   * jalon doit pouvoir nommer la tâche qu'il retire.
   */
  all: TrackedTask[];
  /** Les plans successifs, du plus ancien au plus récent. */
  waves: TaskWave[];
  /** Le dernier plan posé — celui qu'on regarde en direct. */
  currentWave: TaskWave | null;
  done: number;
  /** La tâche en cours, quand il y en a une — c'est ce qu'on cherche en direct. */
  current: TrackedTask | null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Ce bloc mérite-t-il un jalon plutôt qu'une carte d'outil ?
 *
 * Seulement `TaskCreate` et `TaskUpdate` : ils ne portent que deux champs et un
 * accusé de réception, donc leur repli n'a rien à ouvrir. Les autres outils de
 * tâche — `TaskOutput`, `TaskList` — rendent du texte qu'on veut lire, et
 * gardent leur carte. Un appel en échec aussi : c'est précisément là qu'on a
 * besoin de déplier.
 */
export function isTaskMarker(block: Block): boolean {
  if (block.kind !== 'tool_use') return false;
  if (block.name !== 'TaskCreate' && block.name !== 'TaskUpdate') return false;
  return block.result?.isError !== true;
}

/** Ce bloc pose une tâche de plus au plan. */
export function isTaskCreate(block: Block): boolean {
  return isTaskMarker(block) && block.name === 'TaskCreate';
}

/**
 * Une tâche telle que le plan la pose, avant qu'elle ait bougé.
 *
 * Sans sa description : le plan se lit d'un trait, et une infobulle par ligne en
 * faisait un champ de mines à survoler. Le détail est dans la carte d'outil que
 * le rejeu garde par ailleurs.
 */
export interface PlanItem {
  /** `uuid` du tour où la tâche est née — l'ancre du panneau de contexte. */
  uuid: string;
  id: string;
  subject: string;
}

/** Le regroupement des séries de créations, tel que le tour doit le rendre. */
export interface PlanGroups {
  /** Clé du bloc qui ouvre une série → la série entière. */
  starts: Map<string, PlanItem[]>;
  /** Clés des blocs qu'une série rend à la place du jalon individuel. */
  absorbed: Set<string>;
  /** `uuid` des jalons de tour qu'une série enjambe. */
  marks: Set<string>;
}

/** La clé d'un bloc dans un tour — la même que celle du `v-for` du gabarit. */
export function blockKey(ei: number, bi: number): string {
  return `${ei}-${bi}`;
}

/**
 * Repérer les séries de `TaskCreate` qui ne font qu'un geste.
 *
 * Une série court tant que rien d'autre ne s'intercale : ni prose, ni autre
 * outil, ni raisonnement. Elle enjambe en revanche les jalons de tour, car le
 * harness pose chaque tâche dans son propre tour — c'est justement ce qui
 * faisait cinq lignes là où il n'y a qu'une décision. `breaks` dit les
 * événements qui rendent quelque chose avant leurs blocs (une injection
 * silencieuse à déplier, une ligne système) : ceux-là coupent, sinon on les
 * ferait disparaître.
 *
 * Une série d'un seul élément n'est pas un groupe : une liste d'une ligne pèse
 * plus que la ligne qu'elle remplace.
 */
export function groupTaskPlans(
  events: readonly TranscriptEvent[],
  breaks: (ev: TranscriptEvent) => boolean,
): PlanGroups {
  const out: PlanGroups = { starts: new Map(), absorbed: new Set(), marks: new Set() };

  let key = '';
  let items: PlanItem[] = [];
  let keys: string[] = [];
  let marks: string[] = [];
  /** Le jalon de l'événement en cours, absorbable seulement s'il porte une création. */
  let pending = '';

  function flush(): void {
    if (items.length > 1) {
      out.starts.set(key, items);
      for (const k of keys.slice(1)) out.absorbed.add(k);
      for (const m of marks) out.marks.add(m);
    }
    key = '';
    items = [];
    keys = [];
    marks = [];
  }

  events.forEach((ev, ei) => {
    if (breaks(ev)) flush();
    pending = ev.uuid;

    ev.blocks.forEach((b, bi) => {
      if (!isTaskCreate(b)) {
        flush();
        pending = '';
        return;
      }
      const k = blockKey(ei, bi);
      if (!items.length) {
        // Le jalon qui ouvre la série reste : il dit où le plan a été posé.
        key = k;
      } else if (pending) {
        marks.push(pending);
      }
      pending = '';
      const call = readTaskCall(b);
      items.push({ uuid: ev.uuid, id: call.id, subject: call.subject });
      keys.push(k);
    });
  });
  flush();

  return out;
}

/** Ce qu'un appel `TaskCreate` / `TaskUpdate` dit de sa tâche. */
export interface TaskCall {
  create: boolean;
  /** Vide quand l'appel n'a pas reçu de réponse — le numéro n'existe qu'après. */
  id: string;
  subject: string;
  description: string;
  /** Vide sur une création : la tâche naît « à faire ». */
  status: string;
}

export function readTaskCall(block: Block): TaskCall {
  const input = (block.input ?? {}) as Record<string, unknown>;
  const create = block.name === 'TaskCreate';
  // À la création, le numéro est dans la réponse ; à la mise à jour, dans l'appel.
  const task = (block.result?.meta?.task ?? {}) as Record<string, unknown>;
  return {
    create,
    id: create ? str(task.id) : str(input.taskId) || str(input.task_id),
    subject: str(input.subject) || str(task.subject),
    description: str(input.description),
    status: create ? '' : str(input.status),
  };
}

/**
 * L'état courant du plan de travail.
 *
 * Seul le fil principal compte : un sous-agent tient sa propre liste, qui n'a
 * rien à voir avec celle de la session et la polluerait de tâches dont les
 * identifiants se télescopent.
 *
 * L'identifiant vient du résultat de `TaskCreate` (`{ task: { id } }`). Quand il
 * manque — vieux transcript, appel resté sans réponse — on retombe sur le rang
 * de création, qui est ce que le harness numérote de toute façon : c'est faux
 * seulement si un appel a échoué en cours de route, et mieux vaut une liste
 * décalée qu'une liste vide.
 *
 * Le résultat est découpé en plans successifs : une création n'ouvre un plan
 * neuf que si le précédent est entièrement terminé. Tant qu'il reste du travail
 * en cours, une tâche de plus est un ajout au plan courant — c'est le geste
 * ordinaire d'une session qui découvre une étape en chemin, et le couper ferait
 * un « plan » d'une ligne à chaque fois. Une prose intercalée ne coupe rien non
 * plus : le harness pose parfois un même plan en deux temps.
 */
export function trackTasks(events: readonly TranscriptEvent[]): TaskProgress {
  const byId = new Map<string, TrackedTask>();
  const waves: TrackedTask[][] = [];

  for (const ev of events) {
    if (ev.isSidechain) continue;
    for (const b of ev.blocks) {
      if (b.kind !== 'tool_use') continue;
      if (b.name !== 'TaskCreate' && b.name !== 'TaskUpdate') continue;

      const input = (b.input ?? {}) as Record<string, unknown>;

      if (b.name === 'TaskCreate') {
        const task = (b.result?.meta?.task ?? {}) as Record<string, unknown>;
        const id = str(task.id) || String(byId.size + 1);
        const tracked: TrackedTask = {
          id,
          subject: str(input.subject) || str(task.subject),
          description: str(input.description),
          activeForm: str(input.activeForm),
          status: 'pending',
          startUuid: ev.uuid,
          uuid: ev.uuid,
          at: ev.timestamp,
        };
        byId.set(id, tracked);
        const open = waves[waves.length - 1];
        // Une tâche supprimée ne retient pas le plan ouvert : elle n'est plus du
        // travail en cours, et la laisser bloquer collerait le plan suivant au
        // précédent.
        if (!open || open.every((t) => t.status === 'completed' || t.status === 'deleted'))
          waves.push([]);
        waves[waves.length - 1]!.push(tracked);
        continue;
      }

      const id = str(input.taskId) || str(input.task_id);
      const task = byId.get(id);
      // Un `TaskUpdate` sur une tâche qu'on n'a pas vue naître ne s'invente pas :
      // il n'aurait ni sujet ni description, donc rien à afficher.
      if (!task) continue;
      const status = str(input.status);
      if (status) task.status = status;
      // Le passage à « en cours » est le début du travail : c'est là que le
      // panneau renvoie. Une reprise déplace le repère sur la reprise.
      if (status === 'in_progress') task.startUuid = ev.uuid;
      if (str(input.subject)) task.subject = str(input.subject);
      if (str(input.description)) task.description = str(input.description);
      if (str(input.activeForm)) task.activeForm = str(input.activeForm);
      task.uuid = ev.uuid;
      task.at = ev.timestamp;
    }
  }

  /*
    Une tâche supprimée quitte le plan.

    `deleted` n'est pas un état d'avancement — le harnais dit « permanently
    removes the task » — mais il arrivait ici comme n'importe quel autre libellé
    inconnu : cercle vide, ni barré ni grisé, indistinguable d'une tâche jamais
    commencée. Et il comptait au dénominateur, si bien qu'un plan intégralement
    mené affichait « 4 / 5 » et laissait chercher la cinquième.

    Le geste, lui, ne se perd pas : son jalon reste dans le fil, à l'endroit et
    au tour où la décision a été prise. C'est la colonne de droite qui dit le
    plan tel qu'il est maintenant, et il n'y est plus.
  */
  const kept = (t: TrackedTask): boolean => t.status !== 'deleted';
  const grouped: TaskWave[] = waves
    .map((all, i) => {
      const tasks = all.filter(kept);
      return { index: i + 1, tasks, done: tasks.filter((t) => t.status === 'completed').length };
    })
    // Un plan entièrement supprimé n'a plus rien à montrer, et sa ligne vide se
    // lirait comme un affichage cassé.
    .filter((w) => w.tasks.length > 0);
  const tasks = grouped.flatMap((w) => w.tasks);

  // Le plus récent des « en cours », et non le premier : un plan abandonné en
  // cours de route laisse derrière lui une tâche qui ne s'est jamais close, et
  // c'est le travail d'aujourd'hui qu'on cherche, pas celui d'hier.
  const live = tasks.filter((t) => t.status === 'in_progress');
  const current = live.reduce<TrackedTask | null>((a, t) => (a && a.at >= t.at ? a : t), null);

  return {
    tasks,
    all: waves.flat(),
    waves: grouped,
    currentWave: grouped[grouped.length - 1] ?? null,
    done: tasks.filter((t) => t.status === 'completed').length,
    current,
  };
}
