import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeListing, buildReport, gradeLabel } from './audit.js';
import { SAMPLE_LISTING, EMPTY_LISTING } from './sample.js';
import './styles.css';

/* ---------------- helpers (logic unchanged) ---------------- */

function hasInput(input) {
  return (
    input.title.trim() !== '' ||
    input.description.trim() !== '' ||
    input.searchTerms.trim() !== '' ||
    input.brand.trim() !== '' ||
    input.bullets.some((b) => b.trim() !== '')
  );
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function counterClass(len, kind) {
  if (len === 0) return '';
  if (kind === 'title') {
    if (len >= 150 && len <= 200) return 'ok';
    if ((len >= 120 && len < 150) || (len > 200 && len <= 220)) return 'warn';
    return 'over';
  }
  if (kind === 'bullet') {
    if (len > 500) return 'over';
    if (len < 100) return 'warn';
    return 'ok';
  }
  if (kind === 'description') {
    if (len >= 500) return 'ok';
    return 'warn';
  }
  if (kind === 'terms') {
    if (len > 250) return 'over';
    if (len > 200) return 'warn';
    return 'ok';
  }
  return '';
}

const STATUS_WORD = { pass: 'Pass', warn: 'Warning', fail: 'Fail' };

/* ---------------- small components (presentational) ---------------- */

function LogoMark() {
  return (
    <div className="logo-mark" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="4" width="14" height="17" rx="2" stroke="#1c1917" strokeWidth="2.2" />
        <path d="M9 4.5V3h6v1.5" stroke="#1c1917" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M9 13l2.2 2.2L15.5 11" stroke="#1c1917" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ScoreGauge({ score, grade }) {
  const R = 84;
  const C = 2 * Math.PI * R;
  const [shown, setShown] = useState(0);
  const prevRef = useRef(0);

  /* count-up is display-only; the scored value never changes */
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = prevRef.current;
    if (reduce || from === score) {
      setShown(score);
      prevRef.current = score;
      return;
    }
    let raf;
    const start = performance.now();
    const dur = 950;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (score - from) * eased);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = score;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const offset = C - (Math.max(0, Math.min(100, shown)) / 100) * C;
  const color =
    grade === 'A'
      ? 'var(--gA)'
      : grade === 'B'
        ? 'var(--gB)'
        : grade === 'C'
          ? 'var(--gC)'
          : 'var(--gF)';

  return (
    <div className="gauge-wrap">
      <svg className="gauge" width="200" height="200" viewBox="0 0 200 200" role="img" aria-label={`Score ${score} out of 100, grade ${grade}`}>
        <circle className="gauge-track" cx="100" cy="100" r={R} fill="none" strokeWidth="14" />
        <circle
          className={`gauge-fill g-${grade}`}
          cx="100"
          cy="100"
          r={R}
          fill="none"
          strokeWidth="14"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ stroke: color }}
          transform="rotate(-90 100 100)"
        />
        <text x="100" y="102" textAnchor="middle" className="gauge-score">
          {Math.round(shown)}
        </text>
        <text x="100" y="126" textAnchor="middle" className="gauge-max">
          / 100
        </text>
      </svg>
      <span className={`grade-stamp g-${grade}`}>
        Grade {grade}
      </span>
    </div>
  );
}

function SectionBlock({ section, index }) {
  const pct = Math.round((section.score / section.max) * 100);
  return (
    <div className="section-block reveal" style={{ '--d': `${index * 90}ms` }}>
      <div className="section-top">
        <h3 className="section-name">{section.name}</h3>
        <span className="section-points">
          {section.score}/{section.max} pts
        </span>
        <span className={`badge ${section.status}`}>{STATUS_WORD[section.status]}</span>
      </div>
      <div className="bar" role="img" aria-label={`${section.name}: ${pct} percent`}>
        <div className={`bar-fill ${section.status}`} style={{ width: `${pct}%` }} />
      </div>
      <ul className="check-list">
        {section.checks.map((c, i) => (
          <li className="check-item" key={i}>
            <span className={`check-dot ${c.status}`} aria-hidden="true" />
            <div>
              <div className="check-label">{c.label}</div>
              <div className="check-detail">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyArt() {
  return (
    <div className="empty-art" aria-hidden="true">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="4" width="14" height="17" rx="2" stroke="#b45309" strokeWidth="1.8" />
        <path d="M9 4.5V3h6v1.5" stroke="#b45309" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16.5" cy="16.5" r="4.2" stroke="#b45309" strokeWidth="1.8" />
        <path d="M19.5 19.5L21.5 21.5" stroke="#b45309" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/* ---------------- main app (data flow unchanged) ---------------- */

export default function App() {
  const [input, setInput] = useState(EMPTY_LISTING);
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => analyzeListing(input), [input]);
  const active = hasInput(input);

  const set = (key, value) => setInput((prev) => ({ ...prev, [key]: value }));
  const setBullet = (i, value) =>
    setInput((prev) => ({
      ...prev,
      bullets: prev.bullets.map((b, j) => (j === i ? value : b)),
    }));

  const loadSample = () =>
    setInput({ ...SAMPLE_LISTING, bullets: [...SAMPLE_LISTING.bullets] });
  const clearAll = () =>
    setInput({ ...EMPTY_LISTING, bullets: [...EMPTY_LISTING.bullets] });

  async function copyReport() {
    const text = buildReport(input, result);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  function downloadReport() {
    const text = buildReport(input, result);
    const slug =
      (input.brand || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
      'listing';
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-audit-report.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-top">
            <LogoMark />
            <span className="hero-eyebrow">Amazon listing SEO auditor</span>
          </div>
          <h1 className="hero-title">
            Listing <em>Audit</em> Tool
          </h1>
          <p className="hero-sub">
            Expert Amazon listing SEO audits, in seconds. <strong>Paste your copy, get a score</strong> — and the exact fixes that move it.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#audit-form">
              Start your audit
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14m0 0l-6-6m6 6l6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <button className="btn btn-ghostdark" onClick={loadSample}>
              Load sample listing
            </button>
          </div>
          <div className="hero-chips" aria-label="Scored sections">
            <span className="hero-chip">Title · <b>30 pts</b></span>
            <span className="hero-chip">Bullets · <b>30 pts</b></span>
            <span className="hero-chip">Description · <b>20 pts</b></span>
            <span className="hero-chip">Search terms · <b>20 pts</b></span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {/* ------- input panel ------- */}
        <section className="panel" aria-label="Listing input" id="audit-form">
          <div className="panel-head">
            <h2 className="panel-title">Your listing</h2>
            <p className="panel-sub">Everything stays in your browser — nothing is uploaded.</p>
          </div>
          <div className="panel-body">
            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="brand">
                  Brand name
                </label>
                <input
                  id="brand"
                  type="text"
                  value={input.brand}
                  onChange={(e) => set('brand', e.target.value)}
                  placeholder="e.g. HydraPeak"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="price">
                  Price <span style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id="price"
                  type="text"
                  value={input.price}
                  onChange={(e) => set('price', e.target.value)}
                  placeholder="34.95"
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="title">
                Product title
                <span className={`counter ${counterClass(input.title.length, 'title')}`}>
                  {input.title.length} / 200
                </span>
              </label>
              <textarea
                id="title"
                value={input.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Brand + product + top keywords + differentiator…"
                style={{ minHeight: 88 }}
              />
              <div className="field-hint">Sweet spot: 150–200 characters. Brand name first.</div>
            </div>

            {input.bullets.map((b, i) => (
              <div className="field" key={i}>
                <label className="field-label" htmlFor={`bullet-${i}`}>
                  Bullet point {i + 1}
                  <span className={`counter ${counterClass(b.length, 'bullet')}`}>
                    {b.length} / 500
                  </span>
                </label>
                <textarea
                  id={`bullet-${i}`}
                  value={b}
                  onChange={(e) => setBullet(i, e.target.value)}
                  placeholder={`Benefit-led bullet ${i + 1}…`}
                />
              </div>
            ))}

            <div className="field">
              <label className="field-label" htmlFor="description">
                Product description
                <span className={`counter ${counterClass(input.description.trim().length, 'description')}`}>
                  {input.description.trim().length} chars
                </span>
              </label>
              <textarea
                id="description"
                value={input.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Brand story, key features with outcomes, specs, box contents…"
                style={{ minHeight: 130 }}
              />
              <div className="field-hint">Aim for 500+ characters for full long-tail coverage.</div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="terms">
                Backend search terms
                <span className={`counter ${counterClass(byteLength(input.searchTerms), 'terms')}`}>
                  {byteLength(input.searchTerms)} / 250 bytes
                </span>
              </label>
              <textarea
                id="terms"
                value={input.searchTerms}
                onChange={(e) => set('searchTerms', e.target.value)}
                placeholder="synonyms alternate spellings use cases — space separated, no commas"
              />
              <div className="field-hint">
                Space-separated, no commas, no repeats, nothing already in the title.
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" onClick={loadSample}>
                Load sample listing
              </button>
              <button className="btn btn-ghost" onClick={clearAll}>
                Clear
              </button>
            </div>
          </div>
        </section>

        {/* ------- results panel ------- */}
        <section className="panel" aria-label="Audit results" id="audit-results">
          {!active ? (
            <div className="results-empty">
              <EmptyArt />
              <h2>Your audit will appear here</h2>
              <p>
                Fill in the form — or load the sample listing to see a full audit of a demo product instantly.
              </p>
              <button className="btn btn-primary" onClick={loadSample}>
                Load sample listing
              </button>
            </div>
          ) : (
            <>
              <div className="score-board reveal">
                <ScoreGauge score={result.total} grade={result.grade} />
                <div className="score-summary">
                  <span className="score-kicker">Audit result</span>
                  <h2>{gradeLabel(result.grade)}</h2>
                  <p>
                    {result.recommendations.length === 0 ? (
                      'No issues found. This listing follows the core Amazon copy rules.'
                    ) : (
                      <>
                        <strong>{result.recommendations.length} issue{result.recommendations.length > 1 ? 's' : ''} found</strong>, ordered by impact. Work the list top-down for the fastest gains.
                      </>
                    )}
                  </p>
                </div>
                <div className="score-actions">
                  {copied && <span className="copy-feedback">Report copied</span>}
                  <button className="btn btn-primary" onClick={copyReport}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Copy audit report
                  </button>
                  <button className="btn btn-ghost" onClick={downloadReport}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Download report
                  </button>
                </div>
              </div>

              {result.sections.map((s, si) => (
                <SectionBlock key={s.id} section={s} index={si} />
              ))}

              {result.recommendations.length > 0 && (
                <div className="section-block reveal" style={{ '--d': `${result.sections.length * 90}ms` }}>
                  <div className="section-top">
                    <h3 className="section-name">Priority fixes</h3>
                    <span className="section-points">{result.recommendations.length} items</span>
                  </div>
                  <ol className="reco-list">
                    {result.recommendations.map((r, i) => (
                      <li
                        className={`reco-item reveal ${r.severity}${i === 0 ? ' featured' : ''}`}
                        style={{ '--d': `${i * 70}ms` }}
                        key={i}
                      >
                        <span className="reco-num">{i + 1}</span>
                        <div>
                          {i === 0 && <span className="reco-flag">Start here</span>}
                          <div className="reco-meta">
                            {r.severity === 'high' ? 'High impact' : 'Medium impact'} · {r.section}
                          </div>
                          <div className="reco-title">{r.title}</div>
                          <div className="reco-fix">{r.fix}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {result.keywords.length > 0 && (
                <div className="section-block reveal">
                  <div className="section-top">
                    <h3 className="section-name">Top keywords</h3>
                    <span className="section-points">title + bullets</span>
                  </div>
                  <table className="kw-table">
                    <thead>
                      <tr>
                        <th aria-label="Rank">#</th>
                        <th>Keyword</th>
                        <th>Uses</th>
                        <th>Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.keywords.map((k, ki) => (
                        <tr key={k.word}>
                          <td className="kw-rank">{ki + 1}</td>
                          <td className="kw-word">{k.word}</td>
                          <td className={`kw-count${k.count >= 4 ? ' hot' : ''}`}>{k.count}</td>
                          <td className="kw-bar-cell">
                            <div className="kw-bar">
                              <div
                                className="kw-bar-fill"
                                style={{
                                  width: `${Math.round((k.count / result.keywords[0].count) * 100)}%`,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <p className="footer-brand">
            Listing Audit Tool <span>·</span> by Ahmed Shah
          </p>
          <p>Independent tool. Not affiliated with or endorsed by Amazon.</p>
        </div>
      </footer>
    </>
  );
}
