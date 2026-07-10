// pino JSON logs; context convention: {org_id, run_id, conversation_id} on every relevant line.
import pino from "pino";

export const logger = pino({
  redact: ["req.headers.authorization", "*.token", "*.password"], // S9.4
});
