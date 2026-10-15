import { contactable, contacted, type Lead } from "./model";
import { fixGreeting } from "./greeting";
import { whatsappCheckUrl } from "./utils";

export type Chat = { id: string; name: string; url: string };
/**
 * The chats to prepare in the WhatsApp app one after the other: each opens
 * with its draft typed in, and the app keeps every draft until the user sends
 * it. Only leads with a draft and a mobile that were never written before.
 */
export function chatQueue(leads: Lead[], size: number, now = new Date()) {
  const chats: Chat[] = [];
  for (const lead of leads) {
    if (chats.length >= size) break;
    const text = lead.messages.at(-1)?.text.trim();
    if (!text || lead.is_demo || contacted(lead) || !contactable(lead))
      continue;
    const url = whatsappCheckUrl(lead, fixGreeting(text, now));
    if (url) chats.push({ id: lead.id, name: lead.name, url });
  }
  return chats;
}
