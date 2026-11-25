# Site Auditor

A website's structure, analysed. Point it at a website and it crawls the pages, has Claude analyse the architecture and content, and exports the findings as a PDF report.

Built by [Jordi Albanell](https://jordialbanell.com/projects). Try it on [jordialbanell.com](https://jordialbanell.com/projects/site-auditor).

## What it does

- Crawls a site page by page and maps its structure.
- Has Claude analyse each page: content, hierarchy and what is missing.
- Writes an overall summary of the site with priorities.
- Exports the audit as a PDF report.
- Saves every audit, so visitors can open past ones while only the owner can run new ones.

## Run your own

1. **Use this template** (green button on GitHub) to make your own copy, then clone it.
2. `npm install`
3. **Database.** Create a free [Supabase](https://supabase.com) project. Open its SQL Editor and run the `supabase/` files in number order (if Supabase warns about Row Level Security, choose "Run without RLS": the files turn it on themselves). Only the app's server, with the service role key, can read or write the data.
4. **Settings.** Copy `.env.example` to `.env.local` and fill it in. `PROJECTS_OWNER_PASSWORD` is the password you'll sign in with; `PROJECTS_OWNER_SECRET` is any long random string (for example `openssl rand -hex 32`).
5. `npm run dev`, open http://localhost:3000 and sign in with "Owner? Sign in".
6. **Deploy.** Import the repo on [Vercel](https://vercel.com/new) and paste the same settings into its Environment Variables.

## Built with

Next.js, React, Supabase, Claude, Apify, jsPDF.

## Licence and credit

MIT licence, copyright (c) 2026 Jordi Albanell. See [LICENSE](LICENSE).

In plain words: you can use this code, change it, share it and build on it, including for paid work. The one legal condition is that **every copy keeps the copyright line and the LICENSE file**, so the code always says where it came from. Removing them breaks the licence.

If you put something live that's built on it, a "Based on Site Auditor by [Jordi Albanell](https://jordialbanell.com)" link is appreciated.
