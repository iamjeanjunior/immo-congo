// Edge Function: title, description, link preview tags (WhatsApp, Facebook), structured data and a short
// text version for the home page, the listings page and every listing page. See netlify/seo-page.js.
import { renderSeoPage } from "../seo-page.js";

export default async (request, context) => renderSeoPage({
  request,
  next: () => context.next(),
  supabaseUrl: Netlify.env.get("VITE_SUPABASE_URL"),
  anonKey: Netlify.env.get("VITE_SUPABASE_ANON_KEY"),
});

export const config = {
  path: ["/", "/annonces", "/annonce/*"],
  // If this function ever crashes, Netlify serves the normal page instead of an error.
  onError: "bypass",
};
