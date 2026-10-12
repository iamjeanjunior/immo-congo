// Edge Function: /sitemap.xml for Google, made from the listings in Supabase. See netlify/seo-page.js.
import { renderSitemapResponse } from "../seo-page.js";

export default async () => renderSitemapResponse({
  supabaseUrl: Netlify.env.get("VITE_SUPABASE_URL"),
  anonKey: Netlify.env.get("VITE_SUPABASE_ANON_KEY"),
});

export const config = { path: "/sitemap.xml" };
