// Boundary truth (T11): every boundary parses with these — never re-declare shapes locally.
import { z } from "zod";

export const OrgIdSchema = z.string().uuid();
