import * as startRuntime from "@tanstack/react-start";
import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs CSRF protection automatically when src/start.ts is absent;
// defining this file opts out, so re-add it explicitly. The factory is resolved
// at runtime because it is not present in every @tanstack/react-start release —
// a bare named import crashes the deployed server with
// "createCsrfMiddleware is not a function" when the installed version differs
// from the one used at build time.
type CsrfFactory = (opts: {
  filter?: (ctx: { handlerType?: string }) => boolean;
}) => Parameters<typeof createStart>[0] extends never ? never : unknown;

const createCsrf = (startRuntime as Record<string, unknown>)["createCsrfMiddleware"] as
  | CsrfFactory
  | undefined;

const csrfMiddleware =
  typeof createCsrf === "function"
    ? createCsrf({ filter: (ctx) => ctx.handlerType === "serverFn" })
    : undefined;

const requestMiddleware = [errorMiddleware, csrfMiddleware].filter(Boolean) as never[];

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware,
}));
