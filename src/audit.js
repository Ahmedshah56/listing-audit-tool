/**
 * audit.js — pure Amazon listing audit engine. No dependencies, no DOM.
 *
 * Scores a product listing across four sections:
 *   Title        (30 pts) — length, keyword repetition, banned promo phrases,
 *                           ALL-CAPS words, brand placement
 *   Bullets      (30 pts) — count, length, thin content, benefit language,
 *                           keyword overlap with the title
 *   Description  (20 pts) — length, keyword stuffing
 *   Search terms (20 pts) — 250-byte limit, duplicates, title overlap,
 *                           comma-separated input
 *
 * Overall score is 0–100 with a letter grade. Every check carries a
 * concrete, actionable fix so the results read like an expert audit,
 * not a generic linter.
 */

const STOPWORDS = new Set(
  'a,an,the,and,or,for,with,to,in,of,on,at,by,from,is,are,as,it,its,this,that,these,those,you,your,we,our,they,their,be,been,will,can,all,any,each,per,into,up,out,no,not,so,if,than,then,too,very,just,also,only,over,under,between,through,during,more,most,such,both,either,neither,who,what,when,where,how,why,which,while'.split(
    ','
  )
);

// Phrases Amazon suppresses or that read as spammy promo copy.
const BANNED_PHRASES = ['best seller', 'bestseller', '#1', 'free shipping', 'on sale'];

// Words that signal the copy talks about outcomes, not just specs.
const BENEFIT_WORDS = new Set(
  'enjoy,perfect,easy,easily,comfort,comfortable,durable,save,saves,keeps,keep,stays,stay,designed,ideal,love,hassle,worry,worries,confident,guarantee,premium,effortless,secure,protects,protect,relax,convenient,simple,simply,favorite'.split(
    ','
  )
);

function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || []);
}

/** Lowercased alphanumeric words, stopwords and 1–2 letter tokens removed. */
export function significantWords(text) {
  return tokenize(text).filter((w) => !STOPWORDS.has(w) && w.length > 2);
}

function frequencies(words) {
  const map = new Map();
  for (const w of words) map.set(w, (map.get(w) || 0) + 1);
  return map;
}

function byteLength(text) {
  return new TextEncoder().encode(String(text)).length;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function statusFor(ratio) {
  if (ratio >= 0.8) return 'pass';
  if (ratio >= 0.5) return 'warn';
  return 'fail';
}

/* ------------------------------------------------------------------ */
/* Title                                                               */
/* ------------------------------------------------------------------ */

function analyzeTitle(title, brand) {
  const checks = [];
  let score = 30;
  const len = title.length;

  if (len === 0) {
    checks.push({
      status: 'fail',
      label: 'Title is missing',
      detail: 'A listing without a title cannot rank. Write one before anything else.',
      fix: 'Write a 150–200 character title: Brand + product + 2–3 top keywords + key differentiator (size, count, material).',
    });
    return { score: 0, checks };
  }

  if (len >= 150 && len <= 200) {
    checks.push({
      status: 'pass',
      label: 'Title length is ideal',
      detail: `${len} characters — right in the 150–200 sweet spot where titles rank and stay readable.`,
    });
  } else if (len >= 120 && len <= 220) {
    const missing = 200 - len;
    checks.push({
      status: 'warn',
      label: `Title length is ${len < 150 ? 'short' : 'long'}`,
      detail: `${len} characters. ${len < 150 ? `You have ~${missing} characters of keyword space unused.` : 'Past 200 characters Amazon truncates the title in search results.'}`,
      fix:
        len < 150
          ? `Add ~${missing} characters: work in 1–2 more high-traffic keywords (material, size, use case) without repeating words already used.`
          : 'Trim to 200 characters or fewer. Cut filler words and move secondary keywords into the bullets.',
    });
    score -= 5;
  } else {
    checks.push({
      status: 'fail',
      label: `Title length is ${len < 120 ? 'far too short' : 'over the limit'}`,
      detail:
        len < 120
          ? `Only ${len} characters — Amazon allows 200. Thin titles lose ranking on every keyword you leave out.`
          : `${len} characters exceeds Amazon's 200-character limit and will be truncated or suppressed.`,
      fix:
        len < 120
          ? `Rewrite to 150–200 characters. Front-load your top 3 keywords in the first 80 characters, then add material, size and use case.`
          : 'Cut to 200 characters max. Keep brand first, then your strongest keywords; move the rest to bullets and search terms.',
    });
    score -= 12;
  }

  // Keyword repetition
  const freq = frequencies(significantWords(title));
  const repeated = [...freq.entries()].filter(([, c]) => c >= 3);
  if (repeated.length > 0) {
    const list = repeated.map(([w, c]) => `"${w}" ×${c}`).join(', ');
    checks.push({
      status: 'fail',
      label: 'Keyword repetition in title',
      detail: `${list}. Repeating a keyword adds no ranking weight and reads as spam.`,
      fix: 'Keep each keyword once. Replace repeats with synonyms or move the extra occurrences into bullets and search terms.',
    });
    score -= 8;
  } else {
    checks.push({
      status: 'pass',
      label: 'No keyword repetition',
      detail: 'Each significant keyword appears at most twice — clean and natural.',
    });
  }

  // Banned promo phrases
  const lower = title.toLowerCase();
  const found = BANNED_PHRASES.filter((p) => lower.includes(p));
  if (/^\s*new[\s-]/.test(title)) found.push('"new" as a leading promo word');
  if (found.length > 0) {
    checks.push({
      status: 'fail',
      label: 'Promotional phrasing detected',
      detail: `${found.join(', ')} — Amazon suppresses listings with subjective promo claims.`,
      fix: 'Remove the promo phrasing. Let reviews and badges carry the social proof; keep the title factual.',
    });
    score -= 8;
  }

  // ALL-CAPS words — ignoring the brand's own words, measurement tokens
  // (32OZ, 500ML) and common product acronyms (BPA, USB, LED) that are
  // normal in Amazon titles and are not shouting.
  const ACRONYMS = new Set(['BPA', 'USB', 'LED', 'LCD', 'HD', 'UHD', 'FDA', 'EPA', 'ABS', 'PVC', 'TPU', 'EVA', 'XL', 'XXL']);
  const caps = (title.match(/\b[A-Z0-9]{2,}\b/g) || []).filter((w) => /[A-Z]/.test(w));
  const brandUpper = brand ? brand.toUpperCase() : null;
  const brandWordsUpper = new Set(brand ? brand.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean) : []);
  const capsFlagged = [
    ...new Set(
      caps.filter(
        (w) => w !== brandUpper && !brandWordsUpper.has(w) && !/\d/.test(w) && !ACRONYMS.has(w)
      )
    ),
  ];
  if (capsFlagged.length > 0) {
    checks.push({
      status: 'warn',
      label: 'ALL-CAPS words in title',
      detail: `${capsFlagged.join(', ')} — full caps looks shouty and Amazon's style guide discourages it.`,
      fix: 'Use normal title case. Keep caps only for the brand name if that is its official styling.',
    });
    score -= 4;
  }

  // Brand placement
  if (brand && brand.trim().length > 0) {
    if (lower.startsWith(brand.toLowerCase())) {
      checks.push({
        status: 'pass',
        label: 'Brand name leads the title',
        detail: `"${brand}" is the first word — exactly where Amazon and shoppers expect it.`,
      });
    } else if (lower.includes(brand.toLowerCase())) {
      checks.push({
        status: 'warn',
        label: 'Brand name is buried',
        detail: `"${brand}" appears in the title but not first. Shoppers scan left to right.`,
        fix: `Move "${brand}" to the very start of the title.`,
      });
      score -= 3;
    } else {
      checks.push({
        status: 'warn',
        label: 'Brand name missing from title',
        detail: `"${brand}" does not appear in the title at all.`,
        fix: `Start the title with "${brand}" — it builds brand search equity and is Amazon's recommended format.`,
      });
      score -= 3;
    }
  }

  return { score: clamp(Math.round(score), 0, 30), checks };
}

/* ------------------------------------------------------------------ */
/* Bullets                                                             */
/* ------------------------------------------------------------------ */

function analyzeBullets(bullets, title) {
  const checks = [];
  let score = 30;
  const filled = bullets.map((b) => b.trim()).filter((b) => b.length > 0);

  if (filled.length === 0) {
    checks.push({
      status: 'fail',
      label: 'No bullet points at all',
      detail: 'Bullets are the most-read copy on the page. With none written, this section earns nothing.',
      fix: 'Write all 5 bullets. Cover: headline benefit, key feature + outcome, materials/build, size/fit/compatibility, and guarantee or box contents.',
    });
    return { score: 0, checks };
  }

  if (filled.length === 5) {
    checks.push({
      status: 'pass',
      label: 'All 5 bullet points used',
      detail: 'Full use of the bullet slots — maximum keyword and selling space.',
    });
  } else if (filled.length === 4) {
    checks.push({
      status: 'warn',
      label: 'Only 4 of 5 bullets used',
      detail: 'One bullet slot is empty — that is a full selling point left on the table.',
      fix: 'Add a fifth bullet. Good candidates: warranty/guarantee, what is in the box, care instructions, or a use-case scenario.',
    });
    score -= 5;
  } else {
    checks.push({
      status: 'fail',
      label: `Only ${filled.length} of 5 bullets used`,
      detail: 'Shoppers read bullets before the description. Empty slots cost conversions.',
      fix: 'Fill all 5 bullets. Cover: headline benefit, key feature + outcome, materials/build, size/fit/compatibility, and guarantee or box contents.',
    });
    score -= 10;
  }

  const titleWords = new Set(significantWords(title));

  filled.forEach((bullet, i) => {
    const n = i + 1;
    const len = bullet.length;

    if (len > 500) {
      checks.push({
        status: 'fail',
        label: `Bullet ${n} exceeds 500 characters`,
        detail: `${len} characters — Amazon truncates bullets past 500.`,
        fix: `Cut bullet ${n} to under 500 characters. Split it: keep the headline claim here, move the detail to the description.`,
      });
      score -= 4;
    } else if (len < 100) {
      checks.push({
        status: 'warn',
        label: `Bullet ${n} is thin (${len} chars)`,
        detail: 'Under 100 characters reads as an afterthought and wastes ranking space.',
        fix: `Expand bullet ${n} to 150–250 characters: lead with the benefit, then the feature that delivers it.`,
      });
      score -= 3;
    }

    const words = significantWords(bullet);
    const hasBenefit = words.some((w) => BENEFIT_WORDS.has(w)) || /\byou\b/i.test(bullet);
    if (!hasBenefit && len >= 100) {
      checks.push({
        status: 'warn',
        label: `Bullet ${n} reads like specs, not benefits`,
        detail: 'It lists features but never says why the shopper should care.',
        fix: `Rewrite bullet ${n} as benefit-first: "WHAT it does — WHY that matters to you." Example: "Leakproof lid — toss it in your bag without a second thought."`,
      });
      score -= 2;
    }

    const overlap = words.filter((w) => titleWords.has(w));
    if (overlap.length === 0 && title.trim().length > 0) {
      checks.push({
        status: 'warn',
        label: `Bullet ${n} reinforces no title keywords`,
        detail: 'Bullets should echo 1–2 title keywords each to strengthen relevance.',
        fix: `Work one title keyword naturally into bullet ${n} — e.g. the material, size or primary use case.`,
      });
      score -= 1;
    }
  });

  if (filled.length > 0 && score === 30) {
    checks.push({
      status: 'pass',
      label: 'Bullet copy is strong',
      detail: 'Good length, benefit-led language, and keyword reinforcement across the set.',
    });
  }

  return { score: clamp(Math.round(score), 0, 30), checks };
}

/* ------------------------------------------------------------------ */
/* Description                                                         */
/* ------------------------------------------------------------------ */

function analyzeDescription(description) {
  const checks = [];
  let score = 20;
  const len = description.trim().length;

  if (len === 0) {
    checks.push({
      status: 'fail',
      label: 'Description is empty',
      detail: 'No description means no long-tail keyword coverage and a weaker page.',
      fix: 'Write 500+ characters: open with the core promise, then cover materials, use cases, care, and what is in the box.',
    });
    return { score: 0, checks };
  }

  if (len >= 500) {
    checks.push({
      status: 'pass',
      label: 'Description length is solid',
      detail: `${len} characters — enough room for story, keywords and objection handling.`,
    });
  } else if (len >= 200) {
    checks.push({
      status: 'warn',
      label: `Description is short (${len} chars)`,
      detail: 'Under 500 characters leaves long-tail keywords and persuasion on the table.',
      fix: `Expand to 500+ characters (currently ${len}). Add a use-case paragraph and a "what's in the box" section — both rank and convert.`,
    });
    score -= 7;
  } else {
    checks.push({
      status: 'fail',
      label: `Description is too thin (${len} chars)`,
      detail: 'This short, the description does almost nothing for ranking or conversion.',
      fix: 'Rewrite to 500+ characters: brand story, key features with outcomes, specifications, and package contents.',
    });
    score -= 12;
  }

  const freq = frequencies(significantWords(description));
  const stuffed = [...freq.entries()].filter(([, c]) => c >= 6);
  if (stuffed.length > 0) {
    const list = stuffed.map(([w, c]) => `"${w}" ×${c}`).join(', ');
    checks.push({
      status: 'warn',
      label: 'Possible keyword stuffing',
      detail: `${list}. Heavy repetition reads as spam and can hurt readability.`,
      fix: 'Vary the language: use synonyms and pronouns for repeats past the second or third mention.',
    });
    score -= 5;
  }

  return { score: clamp(Math.round(score), 0, 20), checks };
}

/* ------------------------------------------------------------------ */
/* Search terms                                                        */
/* ------------------------------------------------------------------ */

function analyzeSearchTerms(terms, title) {
  const checks = [];
  let score = 20;
  const bytes = byteLength(terms);

  if (terms.trim().length === 0) {
    checks.push({
      status: 'fail',
      label: 'Search terms are empty',
      detail: 'Backend search terms are free indexing — leaving them blank wastes the full 250 bytes.',
      fix: 'Add up to 250 bytes of terms: synonyms, alternate spellings, and use cases NOT already in your title or bullets.',
    });
    return { score: 0, checks };
  }

  if (bytes <= 250) {
    checks.push({
      status: bytes > 245 ? 'warn' : 'pass',
      label: `Search terms within limit (${bytes}/250 bytes)`,
      detail:
        bytes > 245
          ? `Only ${250 - bytes} bytes of headroom left — one long word from the cutoff.`
          : `${250 - bytes} bytes of headroom remaining. Amazon indexes these invisibly, and using the full allowance is good practice.`,
      ...(bytes > 245
        ? { fix: 'Trim the weakest term to keep a small safety margin — anything past 250 bytes is silently ignored.' }
        : {}),
    });
    if (bytes > 245) score -= 3;
  } else {
    checks.push({
      status: 'fail',
      label: `Search terms exceed 250 bytes (${bytes})`,
      detail: 'Amazon ignores everything past 250 bytes — the overflow terms do nothing.',
      fix: `Cut ${bytes - 250} bytes. Drop the least valuable terms first (anything already covered in the title).`,
    });
    score -= 10;
  }

  if (/,/.test(terms)) {
    checks.push({
      status: 'warn',
      label: 'Comma-separated terms detected',
      detail: 'Amazon parses search terms as space-separated. Commas eat bytes and add nothing.',
      fix: 'Replace commas with single spaces. "steel bottle gym" indexes the same words in fewer bytes.',
    });
    score -= 3;
  }

  const words = significantWords(terms);
  if (words.length === 0) {
    checks.push({
      status: 'warn',
      label: 'No indexable keywords in search terms',
      detail: 'Every word here is a filler word Amazon already understands. These bytes index nothing new.',
      fix: 'Replace filler words with real keywords: synonyms, alternate spellings, materials, and use cases not already in your title.',
    });
    score -= 6;
  }
  const freq = frequencies(words);
  const dupes = [...freq.entries()].filter(([, c]) => c >= 2);
  if (dupes.length > 0) {
    const list = dupes.map(([w, c]) => `"${w}" ×${c}`).join(', ');
    checks.push({
      status: 'warn',
      label: 'Duplicate words in search terms',
      detail: `${list}. Repeats add zero indexing value.`,
      fix: 'List each word once. Replace duplicates with synonyms or related terms you have not used yet.',
    });
    score -= 3;
  }

  const titleWords = new Set(significantWords(title));
  const wasted = [...new Set(words.filter((w) => titleWords.has(w)))];
  if (wasted.length > 0) {
    const shown = wasted.slice(0, 6).join(', ');
    checks.push({
      status: 'warn',
      label: 'Terms already covered in the title',
      detail: `${shown}${wasted.length > 6 ? ` (+${wasted.length - 6} more)` : ''} — words in the title are already indexed; repeating them here wastes bytes.`,
      fix: 'Remove every word that already appears in the title. Backend terms should only add NEW coverage: synonyms, misspellings, and alternate uses.',
    });
    score -= 4;
  }

  if (score === 20) {
    checks.push({
      status: 'pass',
      label: 'Search terms are clean',
      detail: 'Under the byte limit, no duplicates, no commas, no wasted title overlap.',
    });
  }

  return { score: clamp(Math.round(score), 0, 20), checks };
}

/* ------------------------------------------------------------------ */
/* Aggregate                                                           */
/* ------------------------------------------------------------------ */

export function gradeFor(total) {
  if (total >= 90) return 'A';
  if (total >= 80) return 'B';
  if (total >= 70) return 'C';
  if (total >= 60) return 'D';
  return 'F';
}

export function gradeLabel(grade) {
  return {
    A: 'Excellent — listing is dialed in',
    B: 'Good — a few fixes away from excellent',
    C: 'Average — meaningful issues to fix',
    D: 'Weak — needs real work',
    F: 'Failing — rebuild the copy',
  }[grade];
}

/**
 * Run the full audit. `input` = { title, bullets[5], description,
 * searchTerms, brand, price }.
 */
export function analyzeListing(input) {
  const title = (input.title || '').trim();
  const bullets = (input.bullets || []).slice(0, 5);
  while (bullets.length < 5) bullets.push('');
  const description = (input.description || '').trim();
  const searchTerms = (input.searchTerms || '').trim();
  const brand = (input.brand || '').trim();

  const titleR = analyzeTitle(title, brand);
  const bulletsR = analyzeBullets(bullets, title);
  const descR = analyzeDescription(description);
  const termsR = analyzeSearchTerms(searchTerms, title);

  const sections = [
    { id: 'title', name: 'Title', max: 30, ...titleR },
    { id: 'bullets', name: 'Bullet Points', max: 30, ...bulletsR },
    { id: 'description', name: 'Description', max: 20, ...descR },
    { id: 'searchTerms', name: 'Search Terms', max: 20, ...termsR },
  ];
  sections.forEach((s) => {
    s.status = statusFor(s.score / s.max);
  });

  const total = sections.reduce((sum, s) => sum + s.score, 0);
  const grade = gradeFor(total);

  // Prioritized recommendations: fails first, then warnings.
  const recommendations = [];
  sections.forEach((s) => {
    s.checks.forEach((c) => {
      if (c.status !== 'pass' && c.fix) {
        recommendations.push({
          section: s.name,
          severity: c.status === 'fail' ? 'high' : 'medium',
          title: c.label,
          fix: c.fix,
        });
      }
    });
  });
  recommendations.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));

  // Keyword frequency across title + bullets.
  const kwFreq = frequencies(significantWords(title + ' ' + bullets.join(' ')));
  const keywords = [...kwFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));

  return { total, grade, sections, recommendations, keywords };
}

/** Build the plain-text Markdown audit report for clipboard export. */
export function buildReport(input, result) {
  const lines = [];
  const brand = (input.brand || '').trim();
  lines.push('# Amazon Listing Audit Report');
  lines.push('');
  if (brand) lines.push(`**Brand:** ${brand}`);
  if ((input.price || '').trim()) lines.push(`**Price:** $${input.price.trim()}`);
  lines.push(`**Overall score:** ${result.total}/100 (${result.grade} — ${gradeLabel(result.grade)})`);
  lines.push('');
  lines.push('## Section scores');
  lines.push('');
  result.sections.forEach((s) => {
    lines.push(`- **${s.name}:** ${s.score}/${s.max} (${s.status.toUpperCase()})`);
  });
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  result.sections.forEach((s) => {
    lines.push(`### ${s.name} (${s.score}/${s.max})`);
    lines.push('');
    s.checks.forEach((c) => {
      lines.push(`- [${c.status.toUpperCase()}] **${c.label}** — ${c.detail}`);
      if (c.fix) lines.push(`  - Fix: ${c.fix}`);
    });
    lines.push('');
  });
  if (result.recommendations.length > 0) {
    lines.push('## Priority fixes');
    lines.push('');
    result.recommendations.forEach((r, i) => {
      lines.push(`${i + 1}. [${r.severity === 'high' ? 'HIGH' : 'MEDIUM'}] **${r.section} — ${r.title}**`);
      lines.push(`   ${r.fix}`);
    });
    lines.push('');
  }
  if (result.keywords.length > 0) {
    lines.push('## Top keywords (title + bullets)');
    lines.push('');
    lines.push(result.keywords.map((k) => `${k.word} (${k.count})`).join(', '));
    lines.push('');
  }
  lines.push('---');
  lines.push('*Generated by Listing Audit Tool — an independent tool, not affiliated with Amazon.*');
  return lines.join('\n');
}
