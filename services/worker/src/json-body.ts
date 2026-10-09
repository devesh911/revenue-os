// How a route reads its JSON request body (docs/security.md S5.1: the schema parse comes before any other logic).
import type { Context } from "hono";

/**
 * The request's JSON body, or undefined when it is missing or is not JSON: the route's schema then refuses it, so the
 * caller gets 400 invalid_request (src/errors.ts), never 500. Only reading the body is caught; an error the route's
 * own code throws still reaches the error handler.
 */
export const jsonBody = (c: Context): Promise<unknown> =>
  c.req.json().catch(() => undefined);
