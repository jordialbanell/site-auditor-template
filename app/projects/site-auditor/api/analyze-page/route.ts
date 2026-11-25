import { NextRequest, NextResponse } from 'next/server';
import { isOwner } from '@/lib/owner';

export const maxDuration = 60;

// Costs money per call (Apify / Claude), so running audits is just for the owner; saved audits are public.
export async function POST(req: NextRequest) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Running audits is just for the owner. Open a saved audit instead.' }, { status: 401 });
  const { url, title, h1s, h2s, metaDesc, navLinks, ctaTexts, bodyText } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const prompt = `Analyze this website page for a brand audit. Respond ONLY with a valid JSON object, no markdown, no backticks:
{"pageType":"homepage|about|services|product|blog|contact|pricing|case-study|team|careers|other","tone":["up to 4 tone adjectives"],"topics":["up to 5 topics"],"keyMessages":["up to 3 value props or key messages"],"ctas":["main CTAs found"],"audienceSignals":"1 sentence about the target audience","contentDensity":"sparse|moderate|dense","summary":"2 sentences: what the page is about and what it's trying to achieve"}

URL: ${url}
Title: ${title}
H1: ${(h1s || []).join(' | ')}
H2: ${(h2s || []).slice(0, 6).join(' | ')}
Meta: ${metaDesc || ''}
Nav: ${(navLinks || []).join(', ')}
CTAs: ${(ctaTexts || []).join(', ')}
Body: ${(bodyText || '').slice(0, 1500)}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const d = await r.json();
    if (!r.ok) {
      console.error('[analyze-page] Anthropic error:', JSON.stringify(d));
      return NextResponse.json({ error: 'Anthropic API error', details: JSON.stringify(d) }, { status: 502 });
    }

    const txt = d.content?.[0]?.text || '{}';
    const analysis = readJson(txt);
    return NextResponse.json(analysis);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[analyze-page] Exception:', err);
    return NextResponse.json({
      pageType: 'other', tone: [], topics: [], keyMessages: [], ctas: [],
      audienceSignals: '', contentDensity: 'moderate',
      summary: 'Could not analyze this page.',
      error: message,
    });
  }
}

// The model's JSON, with any fence or stray text around it ignored, and no em or en dashes in the text.
function readJson(txt: string) {
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('No JSON in the reply');
  const undash = (v: unknown): unknown =>
    typeof v === 'string' ? v.replace(/\s*[\u2014\u2013]\s*/g, ', ') : Array.isArray(v) ? v.map(undash)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, undash(x)])) : v;
  return undash(JSON.parse(txt.slice(a, b + 1)));
}
