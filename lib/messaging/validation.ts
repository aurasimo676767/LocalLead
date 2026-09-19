import type { Lead, Preferences } from "../model";
import {
  buildOutreachContext,
  messageFacts,
  messageProblems,
  similarity,
} from "./index";

export function buildMessagePayload(
  lead: Lead,
  prefs: Preferences,
  recent: string[],
  previousMessage: string,
) {
  const context = buildOutreachContext(lead, prefs);
  const facts = messageFacts(lead, prefs);
  const evidence = lead.analysis.evidence.filter(
    (e) => e.confidence >= 0.7 && !!e.url,
  );
  const menuRelevant = lead.category !== "Panificio";
  const recommendedFeatures = [
    menuRelevant ? "menu" : "foto",
    ...(facts.qr ? ["QR code"] : []),
    ...(facts.events ? ["eventi"] : ["foto"]),
  ];
  return {
    lead: {
      name: lead.name,
      category: lead.category,
      city: lead.city,
      websiteStatus: lead.website_status,
      websiteQuality: lead.website_quality,
      websiteUrl: lead.website_url,
      menuStatus: lead.menu_status,
      menuUrl: lead.menu_url,
      facebookUrl: lead.facebook_url,
      instagramUrl: lead.instagram_url,
      mainProblem: lead.main_problem,
      opportunity: lead.opportunity,
      aiSummary: lead.ai_summary,
      ...context,
      menuIssues: evidence.filter((e) => /menu/.test(e.kind)),
      verifiedObservations: evidence,
      photosQuality:
        evidence.find((e) => e.kind === "curated_social")?.text || "unknown",
      eventsRelevant: facts.events,
      menuRelevant,
      qrRelevant: facts.qr,
      recommendedFeatures: [...new Set(recommendedFeatures)].slice(0, 3),
      websiteFeatures: lead.analysis.features,
      savedReasoning: lead.analysis.reasons,
    },
    preferences: prefs,
    previousMessage,
    recentGeneratedMessages: recent.slice(-10),
  };
}

export function validateOutreachMessage(
  text: string,
  lead: Lead,
  prefs: Preferences,
  comparisons: string[] = [],
) {
  const payload = buildMessagePayload(lead, prefs, [], "").lead;
  const errors: string[] = [];
  errors.push(...messageProblems(text, lead, prefs));
  if (payload.menuRelevant && !/men[uù]/i.test(text))
    errors.push("Manca il menu");
  if (payload.qrRelevant && !/\bqr\b/i.test(text))
    errors.push("Includi naturalmente il QR diretto al menu");
  const features = [
    /men[uù]|drink list/i,
    /\bqr\b/i,
    /foto/i,
    /contatti/i,
    /event|serat/i,
    /mappa/i,
    /gallery/i,
  ];
  if (features.filter((pattern) => pattern.test(text)).length > 5)
    errors.push("Troppi elementi: scegli menu, foto e al massimo un altro");
  if (
    /\bservizio\b|incrementare|potenziare|proposta commerciale|vi mando due idee|se volete possiamo fissare|se vi va ne discutiamo|;/i.test(
      text,
    )
  )
    errors.push("Frase o punteggiatura vietata");
  if (
    !/potrei|potreste|posso|si potrebbe|propon|rifar|sistemar|creare|costruiamo|costruire|averne|avere|farvi|farvene/i.test(
      text,
    )
  )
    errors.push("Manca una proposta concreta");
  // Also compare without the CTA: changing only the final question is never a new draft.
  const body = (value: string) => value.replace(/[^\n.!?]*\?\s*$/, "").trim();
  if (
    comparisons.some(
      (other) =>
        similarity(text, other) > 0.68 ||
        similarity(body(text), body(other)) > 0.68,
    )
  )
    errors.push(
      "Troppo simile: cambia apertura, costruzione e ordine delle informazioni mantenendo gli stessi fatti",
    );
  return { valid: errors.length === 0, errors };
}
