// GCI Executive Desk — Task 15: Daily Business Brief.
// Replaces the Task 13 "Top 3 Priorities" slot on Home — same position in
// the layout, but now deduped across CRM/Quotation/Commitments/Decisions/
// MIA/Calendar (see lib/dailyBrief.ts) instead of a raw top-3 slice of the
// Boss Action list, and each item states why it matters, not just a fact.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { getDailyBrief, SOURCE_LABEL, type BriefItem } from '../lib/dailyBrief';
import type { ActionPriority } from '../lib/actionCenter';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const PRIORITY_COLOR: Record<ActionPriority, string> = { P1: RED, P2: AMBER, P3: MUTED };
// Home Daily Brief §一 — P1/P2/P3 stay as the internal sort key (unchanged
// everywhere else in the app) but are never shown as raw codes on Home;
// Chris sees the plain-language meaning instead, in whichever language the
// app toggle is set to.
const PRIORITY_LABEL_ZH: Record<ActionPriority, string> = { P1: '立即处理', P2: '需要关注', P3: '一般事项' };
const PRIORITY_LABEL_EN: Record<ActionPriority, string> = { P1: 'Urgent', P2: 'Needs attention', P3: 'General' };

export function HomeDailyBrief() {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const PRIORITY_LABEL = lang === 'zh' ? PRIORITY_LABEL_ZH : PRIORITY_LABEL_EN;
  const [items, setItems] = useState<BriefItem[] | null>(null);
  const [todaysActions, setTodaysActions] = useState<string[]>([]);
  const [totalDeduped, setTotalDeduped] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState<Set<number>>(new Set());

  useEffect(() => {
    getDailyBrief(lang).then((res) => {
      if (res.ok) {
        setItems(res.brief.items);
        setTodaysActions(res.brief.todaysThreeActions);
        setTotalDeduped(res.brief.allDeduped.length);
      } else {
        setError(res.error);
      }
    });
  }, [lang]);

  function go(link: string) {
    if (link.startsWith('http')) window.open(link, '_blank', 'noopener,noreferrer');
    else navigate(link);
  }

  return (
    <div style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          今日商务简报 · DAILY BUSINESS BRIEF
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
        {totalDeduped > 0 && (
          <span onClick={() => navigate('/actions')} style={{ fontSize: 11, color: GOLD, cursor: 'pointer' }}>
            {lang === 'zh' ? `查看全部 (${totalDeduped}) →` : `View all (${totalDeduped}) →`}
          </span>
        )}
      </div>

      {error ? (
        <div style={{ padding: '18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 12.5, color: RED }}>{lang === 'zh' ? `读取失败:${error}` : `Failed to load: ${error}`}</div>
      ) : !items ? (
        <div style={{ padding: '18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 12.5, color: MUTED }}>{lang === 'zh' ? '加载中…' : 'Loading…'}</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '30px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, textAlign: 'center', fontSize: 12.5, color: MUTED }}>
          {lang === 'zh' ? '今天暂无重点事项' : 'No priority items today'}
        </div>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 14 }}>
            {items.map((it, i) => {
              const color = PRIORITY_COLOR[it.priority];
              return (
                <div key={i} style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 6px' }}>
                      {PRIORITY_LABEL[it.priority]}
                    </span>
                    <span style={{ fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4, padding: '2px 6px' }}>
                      {SOURCE_LABEL[it.source]}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.textPrimary }}>{it.subject}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}><strong style={{ color: colors.textPrimary }}>{lang === 'zh' ? '发生了什么：' : 'What happened: '}</strong>{it.fact}</div>
                  <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}><strong style={{ color: colors.textPrimary }}>{lang === 'zh' ? '为什么重要：' : 'Why it matters: '}</strong>{it.whyItMatters}</div>
                  <div style={{ fontSize: 11.5, color: GOLD }}><strong>{lang === 'zh' ? '建议你做什么：' : 'Recommended action: '}</strong>{it.suggestion}</div>
                  {it.rawFact && (
                    <div>
                      <span
                        onClick={() => setShowRaw((prev) => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; })}
                        style={{ fontSize: 10.5, color: MUTED, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {lang === 'zh' ? (showRaw.has(i) ? '收起原始信息' : '查看原始信息') : (showRaw.has(i) ? 'Hide original' : 'View original')}
                      </span>
                      {showRaw.has(i) && (
                        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4, padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontFamily: 'IBM Plex Mono,monospace' }}>
                          {it.rawFact}
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    onClick={() => go(it.deepLink)}
                    style={{ marginTop: 2, alignSelf: 'flex-start', fontSize: 11, color: colors.textPrimary, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}
                  >
                    {lang === 'zh' ? '查看 →' : 'View →'}
                  </div>
                </div>
              );
            })}
          </div>

          {todaysActions.length > 0 && (
            <div style={{ padding: '12px 16px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.18)', borderRadius: 12 }}>
              <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700, marginBottom: 6 }}>{lang === 'zh' ? '建议今天先做' : 'Suggested priorities today'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {todaysActions.map((a, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: colors.textPrimary }}>{i + 1}. {a}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
