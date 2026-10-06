// What a caller sees when a route throws: clean statuses, never internals; detail goes to the log (docs/security.md
// S5.8).
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { logger } from "./logger";

export const onError: ErrorHandler = (err, c) => {
  // A refusal Hono's own middleware throws keeps its status: bearerAuth's missing or wrong token is a 401, never a 500.
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof ZodError) return c.json({ error: "invalid_request" }, 400);
  if (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  ) {
    return c.json({ error: "conflict" }, 409);
  }
  logger.error({ err }, "unhandled route error");
  return c.json({ error: "internal" }, 500);
};
