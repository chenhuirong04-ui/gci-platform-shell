// GCI Executive Desk — Home dashboard's GIA entry point. A real input (not
// just a decorative card) that runs the message through the EXACT SAME
// shared router /business-assistant's own top input uses (lib/giaRouter.ts)
// and renders the reply/confirm card IN PLACE on Home — no page navigation.
// A plain name/company lookup (nothing else matched) is the one case Home
// hands off to /business-assistant?customer=, since Home has no Customer-360
// view of its own to show the result in.
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { runGiaTopRouter, type GiaRouterState } from '../lib/giaRouter';
import { confirmCaptureItem, completeOrCancelTask, rescheduleTask, type ResolvedCaptureItem } from '../lib/businessCapture';
import { BUSINESS_AREA_LABEL, BUSINESS_AREA_LABEL_ZH, ALL_BUSINESS_AREAS, type ExecutiveTask, type TaskBusinessArea } from '../lib/executiveTasks';
import { uploadAndRegisterLocalFile } from '../lib/giaFiles';
import type { CrmCustomer } from '../lib/crmSupabase';

const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';
const GREEN = '#6FBF8E';
const RED = '#E0846A';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(203,168,92,0.18)';
const TEXT = colors.textPrimary;

// "写邮件"/"Write email" removed — email is fully retired from GCI/GIA.
// "上传文件"/"Upload file" takes the same slot, wired to a real local-file
// -> Drive intake flow below (the other shortcuts remain decorative,
// unchanged — they all just navigate to /business-assistant).
const SHORTCUTS_ZH = ['查客户', '查报价', '找文件', '记录沟通', '上传文件'];
const SHORTCUTS_EN = ['Search clients', 'Search quotes', 'Find file', 'Log communication', 'Upload file'];
const UPLOAD_SHORTCUT_ZH = '上传文件';
const UPLOAD_SHORTCUT_EN = 'Upload file';

const UPLOAD_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BusinessAssistantEntry() {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const SHORTCUTS = lang === 'zh' ? SHORTCUTS_ZH : SHORTCUTS_EN;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileSearchReply, setFileSearchReply] = useState<string | null>(null);
  const [pendingCapture, setPendingCapture] = useState<ResolvedCaptureItem[] | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureDone, setCaptureDone] = useState<Set<number>>(new Set());
  const [captureBusy, setCaptureBusy] = useState<number | 'all' | null>(null);
  const [pendingTaskLifecycle, setPendingTaskLifecycle] = useState<{ action: 'completed' | 'cancelled'; matches: ExecutiveTask[] } | null>(null);
  const [pendingTaskReschedule, setPendingTaskReschedule] = useState<{ whenPhrase: string; resolvedDate: string | null; matches: ExecutiveTask[] } | null>(null);
  // Local file -> Drive upload — a direct tool action, kept fully separate
  // from pendingCapture/Planner state. Never sends the file name to Planner
  // V3, never generates a BUSINESS_TODO.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; driveUrl: string } | null>(null);
  // Drag & drop — same pending-file preview as the "上传文件" button, just a
  // second on-ramp into it. dragCounter survives dragenter/dragleave firing
  // on child elements as the pointer moves within the box (a plain boolean
  // would flicker off every time the pointer crosses a child's edge).
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [multiDropNotice, setMultiDropNotice] = useState(false);

  async function go() {
    const v = value.trim();
    if (!v) { navigate('/business-assistant'); return; }
    setBusy(true);
    const state: GiaRouterState = {
      currentCustomer: null, // Home has no loaded customer context
      setFileSearchReply, setPendingCapture, setCaptureLoading: setBusy, setCaptureError,
      setCaptureDone, setPendingTaskLifecycle, setPendingTaskReschedule,
    };
    const consumed = await runGiaTopRouter(v, state);
    setBusy(false);
    if (!consumed) {
      // Plain name/company lookup — Home has no Customer-360 view, hand off
      // to the full page exactly like this used to always do.
      navigate(`/business-assistant?customer=${encodeURIComponent(v)}`);
      return;
    }
    setValue('');
  }

  async function handleConfirmItem(index: number) {
    if (!pendingCapture) return;
    const item = pendingCapture[index];
    setCaptureBusy(index);
    const res = await confirmCaptureItem(item);
    setCaptureBusy(null);
    if (res.ok) setCaptureDone((prev) => new Set(prev).add(index));
    else setCaptureError(res.error);
  }

  async function handleConfirmAll() {
    if (!pendingCapture) return;
    setCaptureBusy('all');
    const newlyDone = new Set(captureDone);
    for (let i = 0; i < pendingCapture.length; i++) {
      if (newlyDone.has(i)) continue;
      if (pendingCapture[i].candidateCustomers) continue;
      if (pendingCapture[i].needsCustomerName) continue;
      if (pendingCapture[i].needsContent) continue;
      if (pendingCapture[i].crmNoMatchBlocked) continue;
      const res = await confirmCaptureItem(pendingCapture[i]);
      if (res.ok) newlyDone.add(i);
      else { setCaptureError(res.error); break; }
    }
    setCaptureDone(newlyDone);
    setCaptureBusy(null);
  }

  function pickCandidateCustomer(index: number, customer: CrmCustomer) {
    if (!pendingCapture) return;
    const next = [...pendingCapture];
    const item = next[index];
    next[index] = {
      ...item,
      type: item.type === 'NEW_CUSTOMER' ? 'CRM_FOLLOWUP' : item.type,
      matchedCustomer: customer,
      candidateCustomers: null,
      isNewCustomer: false,
    };
    setPendingCapture(next);
  }

  // GIA Planner confirm-card business-area editor — pure local state edit,
  // no re-classification/model call. Mutates item.raw.todo_business_area
  // directly, the exact field confirmCaptureItem()'s BUSINESS_TODO branch
  // already reads to build the executive_tasks write — so a manual pick
  // here is what actually gets saved, not Planner's original guess.
  function changeBusinessArea(index: number, area: TaskBusinessArea) {
    if (!pendingCapture) return;
    const next = [...pendingCapture];
    const item = next[index];
    next[index] = { ...item, raw: { ...item.raw, todo_business_area: area } };
    setPendingCapture(next);
  }

  function createAsNewInstead(index: number) {
    if (!pendingCapture) return;
    const next = [...pendingCapture];
    next[index] = { ...next[index], matchedCustomer: null, candidateCustomers: null, isNewCustomer: true, type: 'NEW_CUSTOMER' };
    setPendingCapture(next);
  }

  async function handleConfirmTaskLifecycle(taskId: string) {
    if (!pendingTaskLifecycle) return;
    setCaptureBusy('all');
    const res = await completeOrCancelTask(taskId, pendingTaskLifecycle.action);
    setCaptureBusy(null);
    if (res.ok) setPendingTaskLifecycle(null);
    else setCaptureError(res.error);
  }

  // Shared by both entry points (button-triggered <input type="file"> and
  // drag & drop below) — exactly one place decides what "a file was picked"
  // means, so the two on-ramps can never drift into different behavior.
  function acceptPickedFile(f: File | null) {
    if (!f) return;
    setUploadError(null);
    setUploadedFile(null);
    setSelectedFile(f);
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ''; // allow re-selecting the exact same file later
    acceptPickedFile(f);
  }

  // dragover's preventDefault() is what stops the browser from navigating
  // to/opening the dropped file directly (its default action for a file
  // drag) — required on both dragOver and drop, not just drop.
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    // Single file only, same as the button — never batch-upload for this round.
    setMultiDropNotice(files.length > 1);
    acceptPickedFile(files[0]);
  }

  function cancelFileUpload() {
    setSelectedFile(null);
    setUploadError(null);
    setMultiDropNotice(false);
  }

  async function confirmFileUpload() {
    if (!selectedFile) return;
    setUploadBusy(true);
    setUploadError(null);
    const res = await uploadAndRegisterLocalFile(selectedFile);
    setUploadBusy(false);
    setMultiDropNotice(false);
    if (res.ok) {
      setUploadedFile({ name: selectedFile.name, driveUrl: res.row.drive_url });
      setSelectedFile(null);
    } else {
      setUploadError(res.error);
    }
  }

  async function handleConfirmTaskReschedule(taskId: string) {
    if (!pendingTaskReschedule?.resolvedDate) return;
    setCaptureBusy('all');
    const res = await rescheduleTask(taskId, pendingTaskReschedule.resolvedDate);
    setCaptureBusy(null);
    if (res.ok) setPendingTaskReschedule(null);
    else setCaptureError(res.error);
  }

  return (
    <div style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          GIA · GCI INTELLIGENT ASSISTANT
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
      </div>
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: 'relative', padding: '18px 20px', background: CARD, border: `1px solid ${isDragging ? 'rgba(203,168,92,0.65)' : BORD}`, borderRadius: 14, boxShadow: '0 0 40px rgba(203,168,92,0.04)' }}
      >
        {isDragging && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,13,30,0.82)', border: `2px dashed ${GOLD}`, borderRadius: 14, pointerEvents: 'none' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>
              {lang === 'zh' ? '松开以上传文件' : 'Drop file to upload'}
            </span>
          </div>
        )}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) go(); }}
            placeholder="问我：MAG现在什么情况？上次报价多少？今天先跟谁？"
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '13px 48px 13px 16px', fontSize: 14.5, color: colors.textPrimary, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(203,168,92,0.45)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')}
          />
          <button
            onClick={go}
            disabled={busy}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: 9, background: value.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', fontSize: 16 }}
          >{busy ? '…' : '↵'}</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          onChange={handleFilePicked}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SHORTCUTS.map((s) => (
            <span
              key={s}
              onClick={() => {
                if (s === UPLOAD_SHORTCUT_ZH || s === UPLOAD_SHORTCUT_EN) fileInputRef.current?.click();
                else navigate('/business-assistant');
              }}
              style={{ fontSize: 11.5, color: MUTED, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '5px 12px', cursor: 'pointer' }}
            >
              {s}
            </span>
          ))}
        </div>

        {selectedFile && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
              {lang === 'zh' ? '准备收纳文件' : 'Ready to store file'}
            </div>
            {multiDropNotice && (
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>
                {lang === 'zh' ? '一次请上传一个文件，已选择第一个文件' : 'Please upload one file at a time — the first file was selected'}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.7 }}>
              <div>{lang === 'zh' ? '文件：' : 'File: '}{selectedFile.name}</div>
              <div>{lang === 'zh' ? '大小：' : 'Size: '}{formatFileSize(selectedFile.size)}</div>
              <div>{lang === 'zh' ? '目标：Google Drive' : 'Destination: Google Drive'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                disabled={uploadBusy}
                onClick={confirmFileUpload}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontWeight: 700 }}
              >
                {uploadBusy ? (lang === 'zh' ? '上传中…' : 'Uploading…') : (lang === 'zh' ? '确认上传' : 'Upload')}
              </button>
              <button
                disabled={uploadBusy}
                onClick={cancelFileUpload}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: RED }}>
            {lang === 'zh' ? '上传失败，请重试' : 'Upload failed, please try again'}
            {uploadError ? `（${uploadError}）` : ''}
          </div>
        )}

        {uploadedFile && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(111,191,142,0.06)', border: '1px solid rgba(111,191,142,0.3)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 4 }}>
              {lang === 'zh' ? '✓ 已保存' : '✓ Saved'}
            </div>
            <div style={{ fontSize: 12.5, color: TEXT }}>{lang === 'zh' ? '已上传到 Google Drive' : 'Uploaded to Google Drive'}：{uploadedFile.name}</div>
            <a href={uploadedFile.driveUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: GOLD }}>
              {lang === 'zh' ? '查看文件 →' : 'View file →'}
            </a>
          </div>
        )}

        {fileSearchReply && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 6 }}>GIA 回复</div>
            <div style={{ fontSize: 12.5, color: TEXT, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{fileSearchReply}</div>
            <button onClick={() => setFileSearchReply(null)} style={{ marginTop: 8, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>关闭</button>
          </div>
        )}

        {captureError && <div style={{ marginTop: 12, fontSize: 12.5, color: RED }}>{captureError}</div>}

        {pendingTaskLifecycle && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
              {pendingTaskLifecycle.matches.length > 1 ? '找到多个匹配的待办，请选择：' : `将标记为${pendingTaskLifecycle.action === 'completed' ? '完成' : '取消'}：`}
            </div>
            {pendingTaskLifecycle.matches.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: TEXT }}>{t.title}</span>
                <button disabled={captureBusy === 'all'} onClick={() => handleConfirmTaskLifecycle(t.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>确认</button>
              </div>
            ))}
          </div>
        )}

        {pendingTaskReschedule && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            {!pendingTaskReschedule.resolvedDate ? (
              <div style={{ fontSize: 12, color: RED }}>无法识别日期"{pendingTaskReschedule.whenPhrase}"，请换个说法。</div>
            ) : (
              pendingTaskReschedule.matches.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: TEXT }}>{t.title}</span>
                  <button disabled={captureBusy === 'all'} onClick={() => handleConfirmTaskReschedule(t.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>确认改期至 {pendingTaskReschedule.resolvedDate}</button>
                </div>
              ))
            )}
          </div>
        )}

        {pendingCapture && pendingCapture.length > 0 && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
              商务助理理解为{pendingCapture.length > 1 ? `（共 ${pendingCapture.length} 项）` : ''}：
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {pendingCapture.map((item, i) => {
                const done = captureDone.has(i);
                return (
                  <div key={i} style={{ padding: '8px 12px', background: done ? 'rgba(111,191,142,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${done ? 'rgba(111,191,142,0.3)' : BORD}`, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#8FA6D4', marginBottom: 3 }}>[{i + 1}] {item.type}</div>
                    {item.summaryLines
                      .filter((l) => !(item.type === 'BUSINESS_TODO' && l.startsWith('业务领域：')))
                      .map((l, li) => (
                        <div key={li} style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{l}</div>
                      ))}
                    {item.type === 'BUSINESS_TODO' && (
                      done ? (
                        <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>
                          {lang === 'zh' ? '业务领域：' : 'Business area: '}
                          {lang === 'zh' ? BUSINESS_AREA_LABEL_ZH[item.raw.todo_business_area ?? 'OTHER'] : BUSINESS_AREA_LABEL[item.raw.todo_business_area ?? 'OTHER']}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 12, color: TEXT }}>{lang === 'zh' ? '业务领域：' : 'Business area:'}</span>
                          <select
                            value={item.raw.todo_business_area ?? 'OTHER'}
                            onChange={(e) => changeBusinessArea(i, e.target.value as TaskBusinessArea)}
                            style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORD}`, color: TEXT }}
                          >
                            {ALL_BUSINESS_AREAS.map((a) => (
                              <option key={a} value={a}>{lang === 'zh' ? BUSINESS_AREA_LABEL_ZH[a] : BUSINESS_AREA_LABEL[a]}</option>
                            ))}
                          </select>
                        </div>
                      )
                    )}

                    {item.candidateCustomers && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {item.candidateCustomers.map((c) => (
                          <button key={c.id} onClick={() => pickCandidateCustomer(i, c)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                            使用「{c.customer_name}」
                          </button>
                        ))}
                        <button onClick={() => createAsNewInstead(i)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(203,168,92,0.1)', border: '1px solid rgba(203,168,92,0.3)', color: GOLD }}>
                          创建新客户
                        </button>
                      </div>
                    )}

                    {!item.candidateCustomers && !item.needsCustomerName && !item.needsContent && !item.crmNoMatchBlocked && !done && (
                      <button
                        disabled={captureBusy === i || captureBusy === 'all'}
                        onClick={() => handleConfirmItem(i)}
                        style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}
                      >
                        {captureBusy === i ? '写入中…' : '确认此项'}
                      </button>
                    )}
                    {done && <div style={{ marginTop: 4, fontSize: 11, color: GREEN }}>✓ 已保存</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={captureBusy === 'all'}
                onClick={handleConfirmAll}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontWeight: 700 }}
              >
                {captureBusy === 'all' ? '保存中…' : '全部确认'}
              </button>
              <button onClick={() => { setPendingCapture(null); setCaptureDone(new Set()); }} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
