// T4 — production tool catalog barrel + registration site.
// buildCatalog wires the three production tools into a ToolRegistry, injecting the send seam
// into send_confirmation. RED-phase STUB registers NOTHING (registration tests fail); GREEN
// registers book_appointment, update_contact, send_confirmation. G1: runtime-agnostic.
import { ToolRegistry } from "../registry";
import type { SendPort } from "./send-confirmation";

export { bookAppointment } from "./book-appointment";
export type {
  ConfirmationMessage,
  SendPort,
  SendResult,
} from "./send-confirmation";
export { makeSendConfirmation } from "./send-confirmation";
export { updateContact } from "./update-contact";

export function buildCatalog(_deps: { send: SendPort }): ToolRegistry {
  // STUB (RED): GREEN registers book_appointment, update_contact, send_confirmation here.
  return new ToolRegistry();
}
