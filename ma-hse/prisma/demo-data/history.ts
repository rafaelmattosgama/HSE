// Pure, deterministic generator for the demo plants' communication/action history.
// Dates are relative to `now`, so the demo always looks current.
import {
  ActionCategory,
  ActionPriority,
  ActionStatus,
  CommunicationStatus,
  CommunicationType,
} from "@prisma/client";
import { addDays, addMinutes, addMonths, differenceInCalendarDays, startOfDay, subMonths } from "date-fns";
import { createRandom, type DemoRandom } from "./random";
import { DEMO_WORKERS } from "./people";

export type DemoCommunication = {
  key: string;
  type: CommunicationType;
  status: CommunicationStatus;
  eventDatetime: Date;
  reportedAt: Date;
  description: string;
  workerIndex: number;
  validatedDaysAfter: number | null;
  withSewo: boolean;
};

export type DemoAction = {
  key: string;
  communicationKey: string;
  title: string;
  priority: ActionPriority;
  category: ActionCategory;
  dueDate: Date;
  status: ActionStatus;
  closedAt: Date | null;
};

export type DemoHistory = { communications: DemoCommunication[]; actions: DemoAction[] };

const DESCRIPTIONS: Record<"unsafe" | "nearMiss" | "injury", readonly string[]> = {
  unsafe: [
    "Óleo derramado na via de circulação junto à prensa 2",
    "Operador sem óculos de proteção na rebarbagem",
    "Proteção da máquina de corte retirada durante a produção",
    "Paletes empilhadas acima da altura máxima no armazém",
    "Extintor obstruído por contentores na linha 3",
    "Empilhador a circular acima da velocidade permitida",
    "Cabo elétrico solto atravessado na passagem de peões",
    "Escada portátil com degrau danificado em utilização",
    "Saída de emergência bloqueada por material em espera",
    "Trabalho em altura sem arnês na manutenção da cobertura",
    "Iluminação insuficiente no corredor do armazém de moldes",
    "Utilização de telemóvel durante a condução do empilhador",
    "Resíduos metálicos acumulados junto ao posto de soldadura",
    "Luvas de proteção inadequadas no manuseamento de químicos",
    "Pavimento irregular na zona de cargas e descargas",
    "Botão de paragem de emergência sem identificação",
  ],
  nearMiss: [
    "Peça caiu da ponte rolante a poucos metros de um operador",
    "Empilhador quase colidiu com peão na interseção do armazém",
    "Palete deslizou da prateleira superior durante a arrumação",
    "Ferramenta caiu da plataforma elevatória sem atingir ninguém",
    "Operador escorregou no óleo mas conseguiu agarrar-se ao corrimão",
    "Fuga de ar comprimido projetou detritos junto ao posto de trabalho",
  ],
  injury: [
    "Corte superficial no dedo ao manusear chapa sem luvas",
    "Entorse no tornozelo ao descer a escada do mezanino",
    "Projeção de partícula para o olho durante a rebarbagem",
    "Contusão na mão ao fechar a porta da máquina",
    "Queimadura ligeira no antebraço junto ao forno",
    "Dor lombar após levantamento manual de carga",
    "Escoriação no joelho após queda ao mesmo nível",
    "Entalão do dedo na mesa de montagem",
  ],
};

const ACTION_TITLES = [
  "Limpar a zona e reforçar o plano de limpeza",
  "Repor a proteção da máquina e verificar o encravamento",
  "Formação de reciclagem sobre equipamentos de proteção",
  "Rever a sinalização da via de circulação",
  "Substituir o equipamento danificado",
  "Atualizar a instrução de trabalho do posto",
  "Desobstruir e marcar a zona no pavimento",
  "Realizar auditoria 5S à área",
  "Instalar espelho convexo na interseção",
  "Rever a avaliação de riscos do posto",
] as const;

type Volume = { type: CommunicationType | "UNSAFE"; min: number; max: number; probability?: number };

const MONTHLY_VOLUME: readonly Volume[] = [
  { type: "UNSAFE", min: 18, max: 30 },
  { type: CommunicationType.NEAR_MISS, min: 4, max: 8 },
  { type: CommunicationType.FIRST_AID, min: 1, max: 3 },
  { type: CommunicationType.ACCIDENT, min: 1, max: 1, probability: 0.25 },
];

const SEWO_TYPES = new Set<CommunicationType>([
  CommunicationType.NEAR_MISS,
  CommunicationType.FIRST_AID,
  CommunicationType.ACCIDENT,
]);

function descriptionFor(random: DemoRandom, type: CommunicationType) {
  if (type === CommunicationType.NEAR_MISS) return random.pick(DESCRIPTIONS.nearMiss);
  if (type === CommunicationType.FIRST_AID || type === CommunicationType.ACCIDENT) return random.pick(DESCRIPTIONS.injury);
  return random.pick(DESCRIPTIONS.unsafe);
}

function statusFor(random: DemoRandom, ageDays: number): CommunicationStatus {
  if (ageDays > 21) return random.chance(0.8) ? CommunicationStatus.CLOSED : CommunicationStatus.VALID_OPEN;
  if (ageDays >= 7) return random.chance(0.5) ? CommunicationStatus.VALID_OPEN : CommunicationStatus.ONGOING;
  return random.chance(0.5) ? CommunicationStatus.SUBMITTED : CommunicationStatus.VALID_OPEN;
}

function priorityFor(random: DemoRandom, type: CommunicationType): ActionPriority {
  if (type === CommunicationType.ACCIDENT) return ActionPriority.HIGH;
  if (SEWO_TYPES.has(type)) return random.pick([ActionPriority.HIGH, ActionPriority.MEDIUM]);
  return random.pick([ActionPriority.LOW, ActionPriority.MEDIUM, ActionPriority.MEDIUM]);
}

export function buildDemoHistory(input: { plantCode: string; now: Date; months: number }): DemoHistory {
  const { plantCode, now, months } = input;
  const random = createRandom(`history:${plantCode}`);
  const communications: DemoCommunication[] = [];
  const actions: DemoAction[] = [];
  const start = subMonths(startOfDay(now), months);

  for (let month = 0; month < months; month += 1) {
    const windowStart = addMonths(start, month);
    const windowEnd = month === months - 1 ? now : addMonths(start, month + 1);
    const span = windowEnd.getTime() - windowStart.getTime();

    for (const volume of MONTHLY_VOLUME) {
      if (volume.probability !== undefined && !random.chance(volume.probability)) continue;
      const count = random.int(volume.min, volume.max);
      for (let n = 0; n < count; n += 1) {
        const type =
          volume.type === "UNSAFE"
            ? random.pick([CommunicationType.UNSAFE_ACT, CommunicationType.UNSAFE_CONDITION])
            : volume.type;
        const eventDatetime = new Date(windowStart.getTime() + Math.floor(random.next() * span));
        const reported = addMinutes(eventDatetime, random.int(5, 120));
        const reportedAt = reported > now ? now : reported;
        const ageDays = differenceInCalendarDays(now, eventDatetime);

        let status = statusFor(random, ageDays);
        let validatedDaysAfter: number | null = null;
        if (status !== CommunicationStatus.SUBMITTED) {
          validatedDaysAfter = random.int(1, 3);
          // Never validate in the future: too-recent events stay waiting for validation.
          if (addDays(eventDatetime, validatedDaysAfter) > now) {
            status = CommunicationStatus.SUBMITTED;
            validatedDaysAfter = null;
          }
        }

        const key = `${plantCode}:c:${communications.length}`;
        communications.push({
          key,
          type,
          status,
          eventDatetime,
          reportedAt,
          description: descriptionFor(random, type),
          workerIndex: random.int(0, DEMO_WORKERS.length - 1),
          validatedDaysAfter,
          withSewo: validatedDaysAfter !== null && SEWO_TYPES.has(type),
        });

        if (validatedDaysAfter === null) continue;
        const actionCount = random.int(1, 2);
        for (let a = 0; a < actionCount; a += 1) {
          const closed = status === CommunicationStatus.CLOSED;
          let dueDate = addDays(eventDatetime, random.int(15, 45));
          let closedAt: Date | null = null;
          let actionStatus: ActionStatus = ActionStatus.CLOSED;
          if (closed) {
            // CLOSED communications are > 21 days old, so this stays in the past.
            closedAt = addDays(eventDatetime, validatedDaysAfter + random.int(2, 18));
          } else {
            actionStatus =
              status === CommunicationStatus.ONGOING
                ? ActionStatus.ONGOING
                : random.pick([ActionStatus.OPEN, ActionStatus.ONGOING]);
            if (ageDays >= 2 && random.chance(0.15)) {
              // Overdue action, to show the "late actions" indicators.
              dueDate = addDays(eventDatetime, random.int(1, ageDays - 1));
            } else if (dueDate <= now) {
              dueDate = addDays(startOfDay(now), random.int(2, 30));
            }
          }
          actions.push({
            key: `${plantCode}:a:${actions.length}`,
            communicationKey: key,
            title: random.pick(ACTION_TITLES),
            priority: priorityFor(random, type),
            category: random.pick([
              ActionCategory.CORRECTIVE,
              ActionCategory.CORRECTIVE,
              ActionCategory.PREVENTIVE,
              ActionCategory.IMPROVEMENT,
            ]),
            dueDate,
            status: actionStatus,
            closedAt,
          });
        }
      }
    }
  }

  return { communications, actions };
}
