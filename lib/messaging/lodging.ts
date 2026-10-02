import type { ContactReasonKind } from "./index";
// Same pools-per-line approach as the food copy: neighbouring variants differ on every line.
const pick = <T>(pool: T[], variant: number, offset: number) =>
  pool[(variant + offset) % pool.length];
const newSite = [
  "vi farei un sito su misura con le foto delle camere e degli spazi, la colazione, la posizione con cosa c'è vicino e i contatti diretti",
  "metterei le foto delle camere, la posizione con cosa c'è nei dintorni e un modo semplice per chiedere la disponibilità, tutto con i vostri colori",
  "lo costruiamo come piace a voi, con le foto della struttura e delle camere, i dintorni e i contatti per scrivervi direttamente",
];
const betterSite = [
  "ve lo sistemerei su misura, con le foto delle camere in vista, la posizione e i contatti diretti",
  "vi farei un sito più curato e comodo dal telefono, con le camere, i dintorni e un modo semplice per chiedere disponibilità",
  "si potrebbe rifare come piace a voi, tenendo quello che avete e mettendo bene in vista camere e contatti",
];
/** Lines of a B&B or holiday home draft, or null for a reason that does not apply. */
export function lodgingLines(
  kind: ContactReasonKind,
  contactReason: string,
  variant: number,
) {
  const platform = contactReason.split("c'è ")[1] || "la pagina social";
  const portal = contactReason.match(/la pagina (\S+)$/)?.[1] || "";
  const copy: Partial<
    Record<ContactReasonKind, { observations: string[]; pitches: string[] }>
  > = {
    portal_only: {
      observations: [
        `vi ho trovati su google e come sito c'è solo la pagina ${portal}, un sito vostro non l'ho trovato`,
        `ho cercato su google la vostra struttura e al posto del sito c'è la pagina ${portal}`,
        `su google come sito viene fuori solo ${portal} e un sito tutto vostro non l'ho trovato`,
      ],
      pitches: newSite,
    },
    no_website: {
      observations: [
        "ho cercato su google la vostra struttura ma un sito vostro non l'ho trovato (magari mi è sfuggito)",
        "vi ho trovati su google ma non sono riuscito a trovare un sito ufficiale vostro",
        "stavo cercando su google un vostro sito con le foto delle camere ma non l'ho trovato",
      ],
      pitches: newSite,
    },
    social_only: {
      observations: [
        `vi ho trovati su google e come sito c'è ${platform}, un sito vostro vero e proprio non l'ho trovato`,
        `su google come sito viene fuori ${platform} e basta`,
        `ho cercato su google e al posto del sito c'è ${platform}`,
      ],
      pitches: newSite,
    },
    broken_website: {
      observations: [
        "ho trovato il vostro sito su google ma ho provato ad aprirlo e non si apre",
        "ho provato ad aprire il vostro sito che c'è su google ma sembra non funzionare",
        "stavo guardando il vostro sito trovato su google ma non si apre",
      ],
      pitches: betterSite,
    },
    poor_website: {
      observations: [
        "ho visto su google il vostro sito e secondo me si potrebbe rendere parecchio più moderno",
        "ho aperto il vostro sito da google e la grafica si potrebbe curare molto meglio",
        "ho dato un'occhiata al vostro sito trovato su google e l'aspetto si potrebbe aggiornare",
      ],
      pitches: betterSite,
    },
    sparse_website: {
      observations: [
        "ho aperto il vostro sito da google e ci sono pochissime informazioni sulle camere",
        "ho visto il vostro sito su google e ci sono davvero pochi contenuti sulla struttura",
        "sono andato sul vostro sito da google e al momento è molto scarno",
      ],
      pitches: betterSite,
    },
    good_socials_bad_web: {
      observations: [
        "ho guardato la vostra pagina e le foto sono curate, però il sito che c'è su google non è allo stesso livello",
        "sui social curate bene le foto mentre il sito trovato su google resta molto più scarno",
        "la vostra pagina è curata ma il sito che si trova da google stona un po' col resto",
      ],
      pitches: betterSite,
    },
  };
  const selected = copy[kind];
  if (!selected) return null;
  const hasSite = selected.pitches === betterSite;
  return {
    observation: pick(selected.observations, variant, 0),
    why: pick(
      [
        "chi cerca dove dormire guarda prima il telefono, e con un sito vostro vede subito camere e posizione e vi scrive direttamente",
        "con un sito vostro chi vi trova su google o è già stato da voi può prenotare direttamente, senza passare dalle commissioni dei portali",
        "un sito tutto vostro vi fa trovare da chi cerca su google e vi porta richieste dirette, non solo dai portali",
      ],
      variant,
      1,
    ),
    pitch: pick(selected.pitches, variant, 2),
    cta: pick(
      [
        hasSite
          ? "vi potrebbe interessare?"
          : "vi potrebbe interessare crearne uno apposta?",
        "vi interesserebbe?",
        "che ne pensate?",
        "potrebbe interessarvi?",
      ],
      variant,
      3,
    ),
  };
}
