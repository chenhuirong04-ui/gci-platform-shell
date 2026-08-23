// GCI Executive Desk — GIA File / Business Document pending-workflow state,
// lifted OUT of BusinessAssistantEntry.tsx and into a context provided by
// Shell (see App.tsx) so it survives internal SPA navigation.
//
// Why this exists: BusinessAssistantEntry only renders on Home, and Home is
// one of react-router's <Routes> children — navigating to any other page
// (e.g. /crm-customers) unmounts Home, so every plain useState in
// BusinessAssistantEntry was destroyed and recreated from scratch on
// return. That silently discarded an in-progress Business Document
// confirm card (parsed entity/type/version/status, a resolved Drive
// folder, a just-created CRM link) the moment the user checked something
// on another page — a real regression a human assistant would never make.
//
// Fix: move exactly the "one pending file's workflow" state up to Shell
// (which persists for the whole authenticated session — it sits above
// <Routes>, never inside it) via this context, so the actual File object
// stays alive in memory and BusinessAssistantEntry just reads/writes it
// through a hook instead of owning it. Nothing else on Home (chat replies,
// task lifecycle, Planner capture, Daily Brief, etc.) moves here — this is
// scoped to the file-pending workflow only, not a general Home-state store.
//
// Explicitly NOT solved here: a browser refresh/hard reload still loses
// everything (a File object cannot be serialized into sessionStorage/
// localStorage/IndexedDB without re-reading the file from disk, and no
// "keep re-picking this file" UX was asked for) — this only survives
// in-app SPA navigation, per the round's own stated scope.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { DEFAULT_TARGET_FOLDER_ID, DEFAULT_TARGET_FOLDER_NAME, type DriveFolderOption } from '../lib/giaFiles';
import type { CrmCustomer } from '../lib/crmSupabase';
import type { BusinessDocumentType, BusinessDocumentStatus } from '../lib/businessDocumentHistory';

export type UploadPhase = 'describe' | 'suggested' | 'candidates' | 'no_match';

export interface PendingBusinessDocument {
  entityName: string; documentType: BusinessDocumentType; title: string;
  versionNo: number | null; versionLabel: string | null; status: BusinessDocumentStatus;
  amount: number | null; currency: string | null; notes: string | null; documentDate: string;
  customerId: string | null; customerName: string | null; candidateCustomers: CrmCustomer[] | null;
  folderIsDefaultFallback: boolean;
}

export interface UploadedFileInfo { name: string; driveUrl: string; folderName: string }
export interface BusinessDocSavedInfo { title: string; driveUrl: string; folderName: string }

interface GiaFileWorkflowValue {
  selectedFile: File | null; setSelectedFile: (v: File | null) => void;
  uploadBusy: boolean; setUploadBusy: (v: boolean) => void;
  uploadError: string | null; setUploadError: (v: string | null) => void;
  uploadedFile: UploadedFileInfo | null; setUploadedFile: (v: UploadedFileInfo | null) => void;
  uploadPhase: UploadPhase; setUploadPhase: (v: UploadPhase) => void;
  fileDescription: string; setFileDescription: (v: string) => void;
  describeBusy: boolean; setDescribeBusy: (v: boolean) => void;
  selectedFolder: { id: string; name: string }; setSelectedFolder: (v: { id: string; name: string }) => void;
  describeCandidates: DriveFolderOption[] | null; setDescribeCandidates: (v: DriveFolderOption[] | null) => void;
  pendingBusinessDocument: PendingBusinessDocument | null; setPendingBusinessDocument: (v: PendingBusinessDocument | null) => void;
  businessDocBusy: boolean; setBusinessDocBusy: (v: boolean) => void;
  businessDocError: string | null; setBusinessDocError: (v: string | null) => void;
  businessDocSaved: BusinessDocSavedInfo | null; setBusinessDocSaved: (v: BusinessDocSavedInfo | null) => void;
  crmActionMode: 'idle' | 'create' | 'link'; setCrmActionMode: (v: 'idle' | 'create' | 'link') => void;
  crmCreateName: string; setCrmCreateName: (v: string) => void;
  crmCreateBusy: boolean; setCrmCreateBusy: (v: boolean) => void;
  crmCreateError: string | null; setCrmCreateError: (v: string | null) => void;
  crmLinkQuery: string; setCrmLinkQuery: (v: string) => void;
  crmLinkResults: CrmCustomer[] | null; setCrmLinkResults: (v: CrmCustomer[] | null) => void;
  crmLinkBusy: boolean; setCrmLinkBusy: (v: boolean) => void;
  crmLinkNotice: string | null; setCrmLinkNotice: (v: string | null) => void;
}

const GiaFileWorkflowContext = createContext<GiaFileWorkflowValue | null>(null);

export function GiaFileWorkflowProvider({ children }: { children: ReactNode }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | null>(null);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('describe');
  const [fileDescription, setFileDescription] = useState('');
  const [describeBusy, setDescribeBusy] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string }>({ id: DEFAULT_TARGET_FOLDER_ID, name: DEFAULT_TARGET_FOLDER_NAME });
  const [describeCandidates, setDescribeCandidates] = useState<DriveFolderOption[] | null>(null);
  const [pendingBusinessDocument, setPendingBusinessDocument] = useState<PendingBusinessDocument | null>(null);
  const [businessDocBusy, setBusinessDocBusy] = useState(false);
  const [businessDocError, setBusinessDocError] = useState<string | null>(null);
  const [businessDocSaved, setBusinessDocSaved] = useState<BusinessDocSavedInfo | null>(null);
  const [crmActionMode, setCrmActionMode] = useState<'idle' | 'create' | 'link'>('idle');
  const [crmCreateName, setCrmCreateName] = useState('');
  const [crmCreateBusy, setCrmCreateBusy] = useState(false);
  const [crmCreateError, setCrmCreateError] = useState<string | null>(null);
  const [crmLinkQuery, setCrmLinkQuery] = useState('');
  const [crmLinkResults, setCrmLinkResults] = useState<CrmCustomer[] | null>(null);
  const [crmLinkBusy, setCrmLinkBusy] = useState(false);
  const [crmLinkNotice, setCrmLinkNotice] = useState<string | null>(null);

  const value: GiaFileWorkflowValue = {
    selectedFile, setSelectedFile,
    uploadBusy, setUploadBusy,
    uploadError, setUploadError,
    uploadedFile, setUploadedFile,
    uploadPhase, setUploadPhase,
    fileDescription, setFileDescription,
    describeBusy, setDescribeBusy,
    selectedFolder, setSelectedFolder,
    describeCandidates, setDescribeCandidates,
    pendingBusinessDocument, setPendingBusinessDocument,
    businessDocBusy, setBusinessDocBusy,
    businessDocError, setBusinessDocError,
    businessDocSaved, setBusinessDocSaved,
    crmActionMode, setCrmActionMode,
    crmCreateName, setCrmCreateName,
    crmCreateBusy, setCrmCreateBusy,
    crmCreateError, setCrmCreateError,
    crmLinkQuery, setCrmLinkQuery,
    crmLinkResults, setCrmLinkResults,
    crmLinkBusy, setCrmLinkBusy,
    crmLinkNotice, setCrmLinkNotice,
  };

  return <GiaFileWorkflowContext.Provider value={value}>{children}</GiaFileWorkflowContext.Provider>;
}

export function useGiaFileWorkflow(): GiaFileWorkflowValue {
  const ctx = useContext(GiaFileWorkflowContext);
  if (!ctx) throw new Error('useGiaFileWorkflow must be used within GiaFileWorkflowProvider');
  return ctx;
}
