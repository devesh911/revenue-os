// T4 — production tool catalog barrel + registration site. buildCatalog wires the three
// production tools into a ToolRegistry, injecting the send seam into send_confirmation.
// runTurn consumes them via registry.specs(allowed) / get(name, allowed). G1: runtime-agnostic.
import { ToolRegistry } from "../registry";
import { bookAppointment } from "./book-appointment";
import { makeSendConfirmation, type SendPort } from "./send-confirmation";
import { updateContact } from "./update-contact";

export { bookAppointment } from "./book-appointment";
export type {
  ConfirmationMessage,
  SendPort,
  SendResult,
} from "./send-confirmation";
export { makeSendConfirmation } from "./send-confirmation";
export { updateContact } from "./update-contact";

export function buildCatalog(deps: { send: SendPort }): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(bookAppointment);
  registry.register(updateContact);
  registry.register(makeSendConfirmation({ send: deps.send }));
  return registry;
}
