import { defineMiddleware } from "astro:middleware";
import { withSecurityHeaders } from "./lib/http-policy";

export const onRequest = defineMiddleware(async (_, next) => {
  const response = await next();
  return withSecurityHeaders(response);
});
