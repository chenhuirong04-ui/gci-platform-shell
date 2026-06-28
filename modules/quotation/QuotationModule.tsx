import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  ChevronRight, 
  ChevronLeft, 
  Package, 
  Ruler, 
  Layers, 
  Square, 
  Palette, 
  PlusCircle, 
  FileText,
  Printer,
  Download,
  Settings,
  X,
  CreditCard,
  Building2,
  Home,
  Building,
  Briefcase,
  Tv,
  Utensils,
  Armchair,
  Columns,
  Archive,
  Trello,
  MousePointer2,
  Layout,
  Bed,
  ArrowLeft,
  Zap,
  Maximize,
  Anchor,
  Languages,
  Plus,
  Trash2,
  Edit2,
  Copy,
  History,
  Menu,
  FileSpreadsheet,
  RefreshCw,
  Split,
  Info,
  AlertCircle,
  MoreVertical,
  CheckCircle2,
  ExternalLink,
  Cpu,
  Upload,
  Clipboard,
  Image as ImageIcon,
  ShoppingCart,
  FileSearch
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

/** Single Gemini model used for ALL AI analysis (text / image / PDF / classification). */
const GEMINI_MODEL = "gemini-2.5-flash";

/** Wrap any promise with a timeout. Rejects with readable message on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label = 'Request'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(
        `${label} timed out after ${ms / 1000}s. ` +
        `AI parsing timed out. Please try again or add items manually.`
      )), ms)
    ),
  ]);
}
import * as XLSX from 'xlsx';
import { translations, Language } from './translations';
import { StepIndicator } from './components/StepIndicator';
import { TypeSelection, QuoteType } from './components/TypeSelection';
import { saveQuotation, updateQuotation, loadByQuoteNo, listQuotations, markSentToTrade, deleteQuotation, QuotationItem, QuotationRecord } from './lib/quotationCloud';
import {
  saveSupplierQuote, listSupplierQuotes, loadSupplierQuote, markSupplierQuoteConverted,
  deleteSupplierQuote, generateSupplierQuoteNo, SupplierQuote, SupplierQuoteItem,
} from './lib/supplierQuoteCloud';
import {
  listServiceCategories, listServiceCatalogItems, addServiceCategory, addServiceCatalogItem,
  deleteServiceCatalogItem, seedDefaultCatalogIfEmpty, saveServiceQuote, listServiceQuotes,
  loadServiceQuote, deleteServiceQuote, generateServiceQuoteNo, BILLING_TYPE_LABELS, PAYMENT_TERM_OPTIONS,
  ServiceCategory, ServiceCatalogItem, ServiceQuote, ServiceQuoteItem, ServiceBillingType,
} from './lib/serviceQuoteCloud';
import { 
  BedSize, 
  SIZE_DIMENSIONS,
  Material, 
  Thickness, 
  THICKNESS_FACTORS,
  FrameType, 
  FRAME_TYPE_COSTS,
  HeadboardType, 
  FinishType, 
  Color, 
  AddOn, 
  ADDON_COSTS_BASE,
  BedConfiguration,
  BOMItem,
  MaterialPrices,
  DEFAULT_PRICES,
  FIXED_COST_CONFIG,
  Scenario,
  FurnitureCategory,
  GenericConfiguration,
  SofaFrameType,
  SofaCushionType,
  SofaUpholsteryType,
  SofaConfiguration,
  QuoteRecord,
  PackageItem,
  SCENARIO_RECOMMENDATIONS,
  SOFA_FRAME_COSTS,
  SOFA_CUSHION_COSTS,
  SOFA_UPHOLSTERY_COSTS,
  ChairType,
  LegType,
  BackrestType,
  SeatType,
  ArmrestType,
  TableShape,
  TableBaseType,
  EdgeTreatment,
  DoorType,
  InternalLayout,
  HandleType,
  CabinetType,
  MountingType,
  WardrobeType,
  TVUnitType,
  ChairConfiguration,
  DiningTableConfiguration,
  WardrobeConfiguration,
  CabinetConfiguration,
  TVUnitConfiguration,
  HingeType,
  RunnerType,
  CabinetModuleType,
  CabinetModule,
  ModularCabinetConfiguration
} from './constants';

const CHAIR_STEPS = [
  { id: 'dimensions', title: 'Size', icon: Ruler },
  { id: 'type', title: 'Chair Type', icon: Layout },
  { id: 'frame', title: 'Frame Material', icon: Square },
  { id: 'legs', title: 'Leg Type', icon: Columns },
  { id: 'backrest', title: 'Backrest', icon: Layers },
  { id: 'seat', title: 'Seat', icon: Archive },
  { id: 'upholstery', title: 'Upholstery', icon: Palette },
  { id: 'armrest', title: 'Armrest', icon: Trello },
  { id: 'finish', title: 'Finish', icon: Palette },
  { id: 'color', title: 'Color', icon: Palette },
  { id: 'addons', title: 'Add-ons', icon: PlusCircle },
  { id: 'summary', title: 'BOM & Quote', icon: FileText },
];

const DINING_TABLE_STEPS = [
  { id: 'dimensions', title: 'Size', icon: Ruler },
  { id: 'shape', title: 'Shape', icon: Layout },
  { id: 'material', title: 'Top Material', icon: Layers },
  { id: 'legs', title: 'Base/Legs', icon: Columns },
  { id: 'edge', title: 'Edge', icon: Ruler },
  { id: 'finish', title: 'Finish', icon: Palette },
  { id: 'color', title: 'Color', icon: Palette },
  { id: 'summary', title: 'BOM & Quote', icon: FileText },
];

const SOFA_STEPS = [
  { id: 'dimensions', title: 'Size', icon: Ruler },
  { id: 'material', title: 'Foam', icon: Layers },
  { id: 'frame', title: 'Frame', icon: Square },
  { id: 'finish', title: 'Upholstery', icon: Palette },
  { id: 'color', title: 'Color', icon: Palette },
  { id: 'addons', title: 'Add-ons', icon: PlusCircle },
  { id: 'summary', title: 'BOM & Quote', icon: FileText },
];

const MODULAR_STORAGE_STEPS = [
  { id: 'modules', title: 'Modules', icon: Layout },
  { id: 'summary', title: 'BOM & Quote', icon: FileText },
];

const BED_STEPS = [
  { id: 'size', title: 'Size', icon: Ruler },
  { id: 'material', title: 'Raw Materials', icon: Layers },
  { id: 'frame', title: 'Structure', icon: Square },
  { id: 'finish', title: 'Aesthetics', icon: Palette },
  { id: 'color', title: 'Color', icon: Palette },
  { id: 'addons', title: 'Add-ons', icon: PlusCircle },
  { id: 'summary', title: 'BOM & Quote', icon: FileText },
];

interface DraftItem {
  id: string;
  originalName: string;
  originalSpec: string;
  suggestedCategory: FurnitureCategory | 'unknown';
  quantity: number;
  unit: string;
  targetUnitPrice: number;
  targetTotal: number;
  confidence: number;
  status: 'Confirmed' | 'Need Review' | 'Need Split' | 'Need Configuration';
  isSplittable?: boolean;
  specOverride?: string;
  notes?: string;
  includeInGCI?: boolean;
  // Supplier original cost — preserved across currency conversion
  originalUnitCost?: number;
  originalCurrency?: string;
  originalTotal?: number;
  // ── Module 2 V2: rich supplier detail fields ──────────────────────────
  model?: string;
  material?: string;
  color?: string;
  moq?: string;
  packaging?: string;
  deliveryTime?: string;
  paymentTerms?: string;
  remarks?: string;
  englishDescription?: string; // editable EN translation, shown in customer quote
  marginPercent?: number;      // per-item margin override (defaults to global margin)
  imageDataUrl?: string;       // photo extracted from Excel (DISPIMG/floating) or supplied PDF/image
  // ── Module 2 V3: read-everything + image OCR provenance ──────────────
  sourceType?: 'excel' | 'excel-image-ocr' | 'pdf' | 'image' | 'docx' | 'text' | 'manual';
  dataConfidence?: 'high' | 'low'; // AI-OCR confidence in the extracted fields (separate from category confidence)
  sizeDimension?: string;          // explicit Size/Dimension, distinct from free-text Specification
}

// ── Package Quote (Project → Package → Items) ────────────────────────────────
interface PkgQuoteItem {
  id: string;
  seq: string;       // FU-01
  area: string;      // 客厅 / 卧室
  name: string;
  material: string;
  spec: string;
  qty: number;
  unit: string;
  unitCost: number;
  subtotal: number;
  currency: string;
  imageFormula?: string; // DISPIMG ID
  imageDataUrl?: string; // base64 data URL extracted from xlsx zip
}
interface PkgQuoteGroup {
  id: string;
  packageName: string; // Sheet name e.g. "One-Bedroom Basic"
  items: PkgQuoteItem[];
  totalCost: number;
  currency: string;
}
interface PkgQuoteProject {
  projectName: string;
  supplierName: string;
  sourceFileName: string;
  currency: string;
  packages: PkgQuoteGroup[];
}

const SOFA_TYPES = [
  '1-seater',
  '2-seater',
  '3-seater',
  'L-shape',
  'Custom size',
  'Other'
];

type QuoteAppMode = 'landing' | 'customer-quote' | 'supplier-quote' | 'package-quote' | 'service-quote';
const _validModes = ['landing', 'customer-quote', 'supplier-quote', 'package-quote', 'service-quote'];

interface QuotationModuleProps {
  /** Sidebar deep-link target (?mode=). Optional — falls back to reading the
   * URL once on mount, same as before, when rendered without a host shell. */
  initialMode?: QuoteAppMode;
  /** Sidebar deep-link target (?view=history). */
  initialView?: 'configurator' | 'history';
}

export default function QuotationModule({ initialMode, initialView }: QuotationModuleProps = {}) {
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FurnitureCategory | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [prices, setPrices] = useState<MaterialPrices>(DEFAULT_PRICES);
  const [showSettings, setShowSettings] = useState(false);
  // Sidebar deep-links into a specific card/view via ?mode=/?view=, same
  // pattern TradeModule's ?tab= already uses — initial render only, doesn't
  // change any business logic.
  const _sidebarParams = new URLSearchParams(window.location.search);
  const _modeParam = (initialMode || _sidebarParams.get('mode')) as QuoteAppMode | null;
  const _startMode = _modeParam && _validModes.includes(_modeParam) ? _modeParam : 'landing';
  const _startView = initialView || (_sidebarParams.get('view') === 'history' ? 'history' : 'configurator');
  const [view, setView] = useState<'configurator' | 'history'>(_startView);
  // Top-level app mode — controls homepage entry point
  const [appMode, setAppMode] = useState<QuoteAppMode>(_startMode);

  // Sidebar can navigate to a different ?mode=/?view= without unmounting
  // this module (avoids losing in-progress configurator state on every
  // click) — sync when the host shell passes new props. No-op standalone.
  useEffect(() => {
    if (initialMode && _validModes.includes(initialMode)) setAppMode(initialMode);
  }, [initialMode]);
  useEffect(() => {
    if (initialView) setView(initialView);
  }, [initialView]);
  // Supplier Quote metadata form
  const [supplierMeta, setSupplierMeta] = useState({
    supplierName: '', supplierContact: '', category: '', currency: 'AED',
    quoteDate: new Date().toISOString().split('T')[0], validUntil: '',
  });
  // Read URL params injected by DEAL (client, project, salesperson, businessId, returnUrl, quoteType, phone)
  const _urlParams = new URLSearchParams(window.location.search);
  const _clientParam = _urlParams.get('client') || '';
  const _projectParam = _urlParams.get('project') || '';
  const _salespersonParam = _urlParams.get('salesperson') || '';
  const _businessIdParam = _urlParams.get('businessId') || '';
  const _returnUrlParam = _urlParams.get('returnUrl') || '';
  const _phoneParam = _urlParams.get('phone') || '';
  const _quoteTypeParam = (_urlParams.get('quoteType') || '').toUpperCase(); // 'TRADE' | 'BOQ' | ''
  const _prefillName = _clientParam && _projectParam
    ? `${_clientParam} - ${_projectParam}`
    : _clientParam || _projectParam;
  // If DEAL passes quoteType=TRADE, auto-enter Trade & Sourcing without TypeSelection
  const _autoTrade = _quoteTypeParam === 'TRADE';

  const [projectInfoSubmitted, setProjectInfoSubmitted] = useState(!!_prefillName || _autoTrade);
  const [quoteMode, setQuoteMode] = useState<'single' | 'package' | null>(_autoTrade ? 'package' : null);
  const [quoteType, setQuoteType] = useState<QuoteType | null>(_autoTrade ? 'trade' : null);
  const [tradePhase, setTradePhase] = useState<'upload' | 'pricing' | null>(_autoTrade ? 'upload' : null);
  const [sellingPrices, setSellingPrices] = useState<Record<string, number>>({});
  const [markupPercents, setMarkupPercents] = useState<Record<string, number>>({});
  const [tradeItemNotes, setTradeItemNotes] = useState<Record<string, string>>({});
  const [tradeItemCurrencies, setTradeItemCurrencies] = useState<Record<string, string>>({});
  const [quoteGenerated, setQuoteGenerated] = useState(false);
  const [tradeTerms, setTradeTerms] = useState<string>(''); // extracted terms / notes from supplier quote
  const [sentToTrade, setSentToTrade] = useState(false);    // flow completion flag
  // Currency & exchange rate modal
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [pendingConversionItems, setPendingConversionItems] = useState<DraftItem[]>([]);
  const [rateConfig, setRateConfig] = useState<{ quoteCurrency: string; rate: number }>({ quoteCurrency: 'AED', rate: 1 });
  // Module 2 V2: live currency/margin preview shown directly in Supplier Cost Items table
  const [sqCustomerCurrency, setSqCustomerCurrency] = useState<'AED' | 'USD'>('AED');
  const [sqExchangeRate, setSqExchangeRate] = useState<number>(0.505); // Supplier currency → Customer currency
  const [sqGlobalMargin, setSqGlobalMargin] = useState<number>(30);    // default margin %, per-item overridable
  // Module 2 V3: field-level visibility for the customer-facing GCI Quote (internal vs customer view separation)
  const [sqIncludeFields, setSqIncludeFields] = useState({
    deliveryTime: false, packaging: false, remarks: false, moq: false, paymentTerms: false,
  });
  const [pdfDownloaded, setPdfDownloaded] = useState(false); // PDF download indicator

  // ── Module 4: Service Quote — fully standalone, no link to inventory/SKU/supplier cost ──
  const [svcView, setSvcView] = useState<'list' | 'category' | 'items' | 'editor' | 'catalog'>('list');
  const [svcActiveCategoryId, setSvcActiveCategoryId] = useState<string | null>(null);
  const [svcCategories, setSvcCategories] = useState<ServiceCategory[]>([]);
  const [svcCatalog, setSvcCatalog] = useState<ServiceCatalogItem[]>([]);
  const [svcCatalogLoaded, setSvcCatalogLoaded] = useState(false);
  const [svcCatalogLoading, setSvcCatalogLoading] = useState(false);
  const [svcCatalogError, setSvcCatalogError] = useState('');
  const [svcQuotes, setSvcQuotes] = useState<ServiceQuote[]>([]);
  const [svcSavedId, setSvcSavedId] = useState<string | null>(null);
  const [svcSaveStatus, setSvcSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [svcMeta, setSvcMeta] = useState({
    quoteNo: generateServiceQuoteNo(),
    customerName: '', contactPerson: '',
    quoteDate: new Date().toISOString().split('T')[0],
    currency: 'AED', projectDuration: '', paymentTerms: PAYMENT_TERM_OPTIONS[0], notes: '',
  });
  type SvcLineItem = {
    id: string; categoryName: string; serviceName: string; description: string;
    unit: string; quantity: number; unitPrice: number; billingType: ServiceBillingType;
    billingLabel: string; lineTotal: number; totalOverridden: boolean;
  };
  const [svcItems, setSvcItems] = useState<SvcLineItem[]>([]);
  const [svcPickerSearch, setSvcPickerSearch] = useState('');
  const [svcNewCatName, setSvcNewCatName] = useState({ cn: '', en: '' });
  const [svcNewItem, setSvcNewItem] = useState({ categoryId: '', cn: '', en: '', unit: '项', billing: 'fixed' as ServiceBillingType });

  // Cloud save state
  const [cloudId, setCloudId] = useState<string | null>(null);
  const [cloudSaveStatus, setCloudSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loadQuoteNo, setLoadQuoteNo] = useState<string>('');
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  // Cloud history
  const [cloudHistory, setCloudHistory] = useState<QuotationRecord[]>([]);
  const [cloudHistoryLoading, setCloudHistoryLoading] = useState(false);
  // Supplier Quote Archive
  const [historyTab, setHistoryTab] = useState<'supplier' | 'gci'>('gci');
  const [supplierQuotes, setSupplierQuotes] = useState<SupplierQuote[]>([]);
  const [supplierQuotesLoading, setSupplierQuotesLoading] = useState(false);
  const [sqSaveStatus, setSqSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedSQId, setSavedSQId] = useState<string | null>(null); // id of the just-saved supplier quote
  const [sqSelectedFile, setSqSelectedFile] = useState<File | null>(null);   // track selected file for display
  const [sqParseStatus, setSqParseStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [sqParseError, setSqParseError] = useState<string>('');
  // Package Quote state (Phase 1 — local only, no Supabase)
  const [pqProject, setPqProject] = useState<PkgQuoteProject | null>(null);
  const [pqParseStatus, setPqParseStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [pqParseError, setPqParseError] = useState<string>('');
  const [pqExpanded, setPqExpanded] = useState<Set<string>>(new Set());
  const [pqMeta, setPqMeta] = useState({ projectName: '', supplierName: '', currency: 'CNY' });
  // Phase 2: GCI Package Quote Preview
  const [pqPhase, setPqPhase] = useState<'upload' | 'preview'>('upload');
  const [pqQuoteCurrency, setPqQuoteCurrency] = useState<'AED' | 'USD'>('AED');
  const [pqExchangeRate, setPqExchangeRate] = useState<number>(0.505); // default CNY→AED
  const [pqMarkups, setPqMarkups] = useState<Record<string, number>>({}); // pkg.id → markup %
  const [pqPreviewExpanded, setPqPreviewExpanded] = useState<Set<string>>(new Set());
  // EN fields per item — editable in Customer Preview, used by PDF
  type PqItemEN = { nameEN: string; areaEN: string; materialEN: string; specEN: string; };
  const [pqItemsEN, setPqItemsEN] = useState<Record<string, PqItemEN>>({});
  const updateItemEN = (id: string, field: keyof PqItemEN, val: string) =>
    setPqItemsEN(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  const [pqSelectedPkgs, setPqSelectedPkgs] = useState<Set<string>>(new Set());
  const [pqCustomer, setPqCustomer] = useState('');
  const [pqProjectName, setPqProjectName] = useState('');
  const [pqQuoteNo, setPqQuoteNo] = useState(() => {
    const d = new Date();
    return `GCI-PQ-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(100+Math.random()*900)}`;
  });
  const [pqQuoteDate, setPqQuoteDate] = useState(() => new Date().toISOString().slice(0,10));
  const [pqValidUntil, setPqValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10);
  });
  const [pqPaymentTerms, setPqPaymentTerms] = useState('30% Deposit, 70% Before Shipment');
  const [pqDeliveryTerms, setPqDeliveryTerms] = useState('45-60 Working Days After Deposit');
  // Navigation source — tracks where user came from when entering Pricing Review
  const [quoteSource, setQuoteSource] = useState<'customer' | 'supplier-archive' | 'gci-history' | null>(null);
  const [sqSourceId, setSqSourceId] = useState<string | null>(null); // supplier quote id for back nav
  const [packageItems, setPackageItems] = useState<PackageItem[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'draft'>(_autoTrade ? 'draft' : 'items');
  const [importText, setImportText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [rawExcelData, setRawExcelData] = useState<any[][] | null>(null);
  const [excelMappings, setExcelMappings] = useState<Record<string, number>>({});
  const [showMapping, setShowMapping] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [itemToSplit, setItemToSplit] = useState<DraftItem | null>(null);
  const [splitResult, setSplitResult] = useState<DraftItem[]>([]);
  const [validationError, setValidationError] = useState('');
  
  // Cost Overrides
  const [costOverrides, setCostOverrides] = useState({
    labor: DEFAULT_PRICES.labor,
    packaging: DEFAULT_PRICES.packaging,
    transport: DEFAULT_PRICES.transport,
    installation: DEFAULT_PRICES.installation,
    marginPercent: DEFAULT_PRICES.marginPercent,
    vatPercent: DEFAULT_PRICES.vatPercent,
  });

  const language: Language = 'bilingual'; // Fixed UI language

  const generateQuoteNumber = (history: QuoteRecord[]) => {
    const today = new Date();
    const dateStr = today.getFullYear().toString() + 
                    (today.getMonth() + 1).toString().padStart(2, '0') + 
                    (today.getDate()).toString().padStart(2, '0');
    
    const todayQuotes = history.filter(q => q.quoteNumber.startsWith(`GCI-${dateStr}`));
    const nextNum = (todayQuotes.length + 1).toString().padStart(3, '0');
    
    return `GCI-${dateStr}-${nextNum}`;
  };

  const [quoteInfo, setQuoteInfo] = useState({
    customerProjectName: _prefillName,
    phoneWhatsApp: _phoneParam,        // pre-filled from DEAL ?phone= param
    salesperson: _salespersonParam,
    quoteNumber: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [quoteHistory, setQuoteHistory] = useState<QuoteRecord[]>([]);
  
  const STEPS = useMemo(() => {
    switch (selectedCategory) {
      case FurnitureCategory.BED: return BED_STEPS;
      case FurnitureCategory.SOFA: return SOFA_STEPS;
      case FurnitureCategory.CHAIR: return CHAIR_STEPS;
      case FurnitureCategory.DINING_TABLE: return DINING_TABLE_STEPS;
      case FurnitureCategory.WARDROBE:
      case FurnitureCategory.CABINET:
      case FurnitureCategory.TV_UNIT:
        return MODULAR_STORAGE_STEPS;
      case FurnitureCategory.TABLE_DESK:
        return MODULAR_STORAGE_STEPS;
      default: return BED_STEPS;
    }
  }, [selectedCategory]);

  const [config, setConfig] = useState<BedConfiguration>({
    size: BedSize.QUEEN,
    width: 1600,
    length: 2000,
    height: 350,
    headboardHeight: 1100,
    material: Material.MDF,
    thickness: Thickness.T18,
    frame: FrameType.SLATS,
    headboard: HeadboardType.WOODEN,
    finish: FinishType.MELAMINE,
    color: Color.WHITE,
    addOns: [],
  });

  const [genericConfig, setGenericConfig] = useState<GenericConfiguration>({
    width: 1200,
    length: 600,
    height: 750,
    material: Material.MDF,
    thickness: Thickness.T18,
    finish: FinishType.MELAMINE,
    color: Color.WHITE,
    frameType: FrameType.SLATS,
    addOns: [],
  });

  const [sofaConfig, setSofaConfig] = useState<SofaConfiguration>({
    sofaType: '3-Seater',
    length: 2200,    // Overall length
    depth: 900,
    seatHeight: 450,
    backHeight: 850,
    frameType: SofaFrameType.SOLID_WOOD,
    cushionType: SofaCushionType.HIGH_DENSITY,
    upholsteryType: SofaUpholsteryType.FABRIC,
    legs: 'Wooden legs',
    armrest: 'Wide upholstered armrest',
    color: Color.BEIGE,
    addOns: [],
  });

  const [chairConfig, setChairConfig] = useState<ChairConfiguration>({
    type: ChairType.DINING,
    width: 550,
    depth: 580,
    seatHeight: 450,
    backHeight: 850,
    frameMaterial: Material.SOLID_WOOD,
    legType: LegType.WOODEN,
    backrest: BackrestType.UPHOLSTERED,
    seat: SeatType.HIGH_DENSITY,
    upholstery: SofaUpholsteryType.FABRIC,
    armrest: ArmrestType.NONE,
    finish: FinishType.VENEER,
    color: Color.BEIGE,
    addOns: [],
  });

  const [diningTableConfig, setDiningTableConfig] = useState<DiningTableConfiguration>({
    shape: TableShape.RECTANGULAR,
    topMaterial: Material.SOLID_WOOD,
    thickness: Thickness.T25,
    baseType: TableBaseType.WOODEN,
    edge: EdgeTreatment.ROUNDED,
    length: 2000,
    width: 1000,
    height: 750,
    finish: FinishType.VENEER,
    color: Color.WALNUT,
  });

  const [wardrobeConfig, setWardrobeConfig] = useState<WardrobeConfiguration>({
    doorType: DoorType.SWING,
    material: Material.PLYWOOD,
    thickness: Thickness.T18,
    layout: InternalLayout.STANDARD,
    handle: HandleType.EXTERNAL,
    width: 1800,
    height: 2400,
    depth: 600,
    doorCount: 4,
    finish: FinishType.MELAMINE,
    color: Color.WHITE,
    addOns: [],
  });

  const [cabinetConfig, setCabinetConfig] = useState<CabinetConfiguration>({
    type: CabinetType.STORAGE,
    material: Material.MDF,
    doorType: DoorType.SWING,
    hasDrawers: true,
    drawerDoorCount: 4,
    handle: HandleType.HIDDEN,
    width: 1200,
    height: 900,
    depth: 450,
    finish: FinishType.MELAMINE,
    color: Color.GREY,
    addOns: [],
  });

  const [tvUnitConfig, setTVUnitConfig] = useState<TVUnitConfiguration>({
    mounting: MountingType.FLOOR,
    material: Material.MDF,
    width: 2000,
    height: 450,
    depth: 400,
    hasDrawers: true,
    finish: FinishType.PAINTED,
    color: Color.WALNUT,
    addOns: [],
  });

  const [modularConfig, setModularConfig] = useState<ModularCabinetConfiguration>({
    modules: []
  });

  const [editingModule, setEditingModule] = useState<CabinetModule | null>(null);
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);

  // Sync dimensions when size changes
  useEffect(() => {
    if (config.size !== BedSize.CUSTOM) {
      const dims = SIZE_DIMENSIONS[config.size];
      setConfig(prev => ({ ...prev, width: dims.w, length: dims.l }));
    }
  }, [config.size]);

  useEffect(() => {
    const saved = localStorage.getItem('gci_quote_history');
    if (saved) {
      try {
        const history = JSON.parse(saved);
        setQuoteHistory(history);
        // Initialize quote number based on loaded history
        setQuoteInfo(prev => ({
          ...prev,
          quoteNumber: generateQuoteNumber(history)
        }));
      } catch (e) {
        console.error('Failed to load history', e);
      }
    } else {
      setQuoteInfo(prev => ({
        ...prev,
        quoteNumber: generateQuoteNumber([])
      }));
    }
  }, []);

  // Load cloud history when switching to History view
  useEffect(() => {
    if (view !== 'history') return;
    // Load GCI Quotes
    setCloudHistoryLoading(true);
    listQuotations(60)
      .then(records => setCloudHistory(records))
      .catch(e => console.error('[Cloud History] Load failed:', e))
      .finally(() => setCloudHistoryLoading(false));
    // Load Supplier Quotes
    setSupplierQuotesLoading(true);
    listSupplierQuotes(60)
      .then(records => setSupplierQuotes(records))
      .catch(e => console.error('[Supplier Quotes] Load failed:', e))
      .finally(() => setSupplierQuotesLoading(false));
  }, [view]);

  const resetProject = () => {
    setSelectedScenario(null);
    setSelectedCategory(null);
    setProjectInfoSubmitted(false);
    setQuoteMode(null);
    setQuoteType(null);
    setTradePhase(null);
    setSellingPrices({});
    setMarkupPercents({});
    setTradeItemNotes({});
    setTradeItemCurrencies({});
    setQuoteGenerated(false);
    setTradeTerms('');
    setSentToTrade(false);
    setPdfDownloaded(false);
    setCloudId(null);
    setSqSaveStatus('idle');
    setSavedSQId(null);
    setSqSelectedFile(null);
    setSqParseStatus('idle');
    setSqParseError('');
    setQuoteSource(null);
    setSqSourceId(null);
    setCloudSaveStatus('idle');
    setAppMode('landing');
    setPackageItems([]);
    setCurrentStep(0);
    setCostOverrides({
      labor: DEFAULT_PRICES.labor,
      packaging: DEFAULT_PRICES.packaging,
      transport: DEFAULT_PRICES.transport,
      installation: DEFAULT_PRICES.installation,
      marginPercent: DEFAULT_PRICES.marginPercent,
      vatPercent: DEFAULT_PRICES.vatPercent,
    });
    setQuoteInfo(prev => ({
      customerProjectName: '',
      phoneWhatsApp: '',
      salesperson: prev.salesperson, // Keep salesperson
      quoteNumber: generateQuoteNumber(quoteHistory),
      date: new Date().toISOString().split('T')[0]
    }));
  };

  const addToPackage = () => {
    const currentConfig = 
      selectedCategory === FurnitureCategory.BED ? { ...config } :
      selectedCategory === FurnitureCategory.SOFA ? { ...sofaConfig } :
      selectedCategory === FurnitureCategory.CHAIR ? { ...chairConfig } :
      selectedCategory === FurnitureCategory.DINING_TABLE ? { ...diningTableConfig } :
      selectedCategory === FurnitureCategory.WARDROBE ? { ...wardrobeConfig } :
      selectedCategory === FurnitureCategory.CABINET ? { ...cabinetConfig } :
      selectedCategory === FurnitureCategory.TV_UNIT ? { ...tvUnitConfig } :
      { ...genericConfig };

    const newItem: PackageItem = {
      id: Math.random().toString(36).substring(2, 9),
      category: selectedCategory!,
      config: currentConfig,
      quantity: 1,
      bom: [...bom],
      totalAmount: costs.total
    };
    setPackageItems(prev => [...prev, newItem]);
    setSelectedCategory(null);
    setCurrentStep(0);
  };

  const restoreQuote = (quote: QuoteRecord) => {
    setSelectedCategory(quote.category);
    setSelectedScenario(quote.scenario || null);
    setQuoteInfo({
      customerProjectName: quote.customerProjectName,
      phoneWhatsApp: quote.phoneWhatsApp || '',
      quoteNumber: quote.quoteNumber,
      salesperson: quote.salesperson,
      date: quote.date
    });
    setProjectInfoSubmitted(true);
    
    if (quote.category === FurnitureCategory.BED) setConfig(quote.config as BedConfiguration);
    else if (quote.category === FurnitureCategory.SOFA) setSofaConfig(quote.config as SofaConfiguration);
    else if (quote.category === FurnitureCategory.CHAIR) setChairConfig(quote.config as ChairConfiguration);
    else if (quote.category === FurnitureCategory.DINING_TABLE) setDiningTableConfig(quote.config as DiningTableConfiguration);
    else if (quote.category === FurnitureCategory.WARDROBE) setWardrobeConfig(quote.config as WardrobeConfiguration);
    else if (quote.category === FurnitureCategory.CABINET) setCabinetConfig(quote.config as CabinetConfiguration);
    else if (quote.category === FurnitureCategory.TV_UNIT) setTVUnitConfig(quote.config as TVUnitConfiguration);
    else setGenericConfig(quote.config as GenericConfiguration);

    if (quote.costOverrides) {
      setCostOverrides(quote.costOverrides);
    }
    setCurrentStep(STEPS.length - 1);
    setView('configurator');
  };

  const saveToHistory = () => {
    if (!selectedCategory) return;
    if (!quoteInfo.customerProjectName) {
      alert('请输入客户/项目名称 Please enter Customer / Project Name');
      return;
    }
    
    const currentConfig = 
      selectedCategory === FurnitureCategory.BED ? config :
      selectedCategory === FurnitureCategory.SOFA ? sofaConfig :
      selectedCategory === FurnitureCategory.CHAIR ? chairConfig :
      selectedCategory === FurnitureCategory.DINING_TABLE ? diningTableConfig :
      selectedCategory === FurnitureCategory.WARDROBE ? wardrobeConfig :
      selectedCategory === FurnitureCategory.CABINET ? cabinetConfig :
      selectedCategory === FurnitureCategory.TV_UNIT ? tvUnitConfig :
      genericConfig;

    const newRecord: QuoteRecord = {
      id: Date.now().toString(),
      ...quoteInfo,
      category: selectedCategory,
      scenario: selectedScenario || undefined,
      totalAmount: costs.total,
      config: currentConfig,
      bom: bom,
      costOverrides: costOverrides
    };
    const updated = [newRecord, ...quoteHistory];
    setQuoteHistory(updated);
    localStorage.setItem('gci_quote_history', JSON.stringify(updated));
    alert('报价已保存至历史记录 Saved to history');
  };

  // ── Cloud Save / Load ────────────────────────────────────────────────────

  /** Build the Supabase payload from current quote state (trade/BOQ path). */
  const buildCloudPayload = (confirmed: typeof draftItems, totals: {
    totalSupplierCost: number; totalSelling: number; totalProfit: number;
    overallMargin: number; totalVAT: number; grandTotal: number;
  }) => {
    const quoteNo = quoteInfo.quoteNumber || `GCI-${Date.now()}`;
    const record = {
      quote_no: quoteNo,
      customer_name: quoteInfo.customerProjectName || '',
      project_name: quoteInfo.customerProjectName || '',
      deal_id: _businessIdParam || undefined,
      salesperson: quoteInfo.salesperson || '',
      phone_wa: quoteInfo.phoneWhatsApp || '',
      quote_type: (quoteType === 'boq' ? 'BOQ' : 'TRADE') as 'TRADE' | 'BOQ',
      status: quoteGenerated ? 'GENERATED' : 'DRAFT' as 'DRAFT' | 'GENERATED',
      source: _businessIdParam ? 'DEAL' : 'Manual',
      supplier_cost_total: Number(totals.totalSupplierCost.toFixed(2)),
      selling_total: Number(totals.totalSelling.toFixed(2)),
      profit_total: Number(totals.totalProfit.toFixed(2)),
      margin_percent: Number(totals.overallMargin.toFixed(2)),
      vat_amount: Number(totals.totalVAT.toFixed(2)),
      grand_total: Number(totals.grandTotal.toFixed(2)),
      terms_notes: tradeTerms || undefined,
      created_by: 'Admin',
      quote_date: quoteInfo.date || new Date().toISOString().split('T')[0],
    };
    const items: QuotationItem[] = confirmed.map((item, i) => {
      const sp = sellingPrices[item.id] || 0;  // line total
      const sub = sp;                            // already line total, no * qty
      const supp = item.targetUnitPrice * item.quantity;
      const profit = sub - supp;
      const margin = supp > 0 ? (profit / supp) * 100 : 0;
      const vat = sub * 0.05;
      return {
        item_name: item.originalName,
        description: item.originalSpec || '',
        qty: item.quantity,
        unit: item.unit,
        supplier_cost: Number(item.targetUnitPrice.toFixed(2)),
        selling_price: Number(sp.toFixed(2)),
        profit_amount: Number(profit.toFixed(2)),
        margin_percent: Number(margin.toFixed(2)),
        vat_amount: Number(vat.toFixed(2)),
        line_total: Number((sub + vat).toFixed(2)),
        currency: tradeItemCurrencies[item.id] || 'AED',
        item_notes: tradeItemNotes[item.id] || '',
        sort_order: i,
      };
    });
    return { record, items };
  };

  /** Save or update quotation to cloud. */
  const handleSaveToCloud = async (confirmed: typeof draftItems, totals: {
    totalSupplierCost: number; totalSelling: number; totalProfit: number;
    overallMargin: number; totalVAT: number; grandTotal: number;
  }) => {
    setCloudSaveStatus('saving');
    try {
      const payload = buildCloudPayload(confirmed, totals);
      let id: string | null = null;
      if (cloudId) {
        const ok = await updateQuotation(cloudId, payload);
        id = ok ? cloudId : null;
      } else {
        id = await saveQuotation(payload);
      }
      if (id) {
        setCloudId(id);
        setCloudSaveStatus('saved');
        // Update quoteNumber in quoteInfo if not set
        if (!quoteInfo.quoteNumber) {
          setQuoteInfo(prev => ({ ...prev, quoteNumber: payload.record.quote_no }));
        }
      } else {
        setCloudSaveStatus('error');
      }
    } catch (e) {
      console.error('[Cloud Save] Error:', e);
      setCloudSaveStatus('error');
    }
  };

  /** Load a quotation from cloud by quote_no and restore all state. */
  const handleLoadDraft = async (overrideQuoteNo?: string) => {
    const qNo = (overrideQuoteNo || loadQuoteNo).trim();
    if (!qNo) return;
    setLoadStatus('loading');
    try {
      const result = await loadByQuoteNo(qNo);
      if (!result) { setLoadStatus('error'); return; }

      const { record, items } = result;

      // Restore quoteInfo
      setQuoteInfo({
        customerProjectName: record.customer_name || '',
        phoneWhatsApp: record.phone_wa || '',
        salesperson: record.salesperson || '',
        quoteNumber: record.quote_no,
        date: record.quote_date || new Date().toISOString().split('T')[0],
      });

      // Restore draftItems from saved items
      const restoredDraftItems = items.map(it => ({
        id: `cloud-${it.id || Date.now()}-${Math.random().toString(36).slice(2)}`,
        originalName: it.item_name,
        originalSpec: it.description || '',
        quantity: it.qty,
        unit: it.unit,
        targetUnitPrice: it.supplier_cost,
        targetTotal: it.supplier_cost * it.qty,
        confidence: 1,
        status: 'Confirmed' as const,
        suggestedCategory: FurnitureCategory.OTHER,
      }));

      // Restore selling prices & extras keyed by NEW draft ids
      const newSelling: Record<string, number> = {};
      const newMarkup: Record<string, number> = {};
      const newCurrency: Record<string, string> = {};
      const newNotes: Record<string, string> = {};
      restoredDraftItems.forEach((draft, i) => {
        const src = items[i];
        if (!src) return;
        newSelling[draft.id] = src.selling_price;
        newMarkup[draft.id] = (src.selling_price > 0 && src.supplier_cost > 0)
          ? Number(((src.selling_price / src.supplier_cost - 1) * 100).toFixed(1)) : 0;
        newCurrency[draft.id] = src.currency || 'AED';
        newNotes[draft.id] = src.item_notes || '';
      });

      setDraftItems(restoredDraftItems);
      setSellingPrices(newSelling);
      setMarkupPercents(newMarkup);
      setTradeItemCurrencies(newCurrency);
      setTradeItemNotes(newNotes);
      setTradeTerms(record.terms_notes || '');
      setCloudId(record.id || null);
      setCloudSaveStatus('saved');

      // Navigate into the trade flow
      const qt: QuoteType = record.quote_type === 'BOQ' ? 'boq' : 'trade';
      setQuoteType(qt);
      setQuoteMode('package');
      setActiveTab('draft');
      setTradePhase('upload');
      setProjectInfoSubmitted(true);

      // If already generated, go to pricing
      if (record.status === 'GENERATED' || record.status === 'SENT_TO_TRADE') {
        setQuoteGenerated(true);
        setTradePhase('pricing');
      }

      setLoadStatus('idle');
      setLoadQuoteNo('');
      setQuoteSource('gci-history');
      setView('configurator'); // switch from history to the loaded quote
    } catch (e) {
      console.error('[Cloud Load] Error:', e);
      setLoadStatus('error');
    }
  };

  // ── Package Quote: parse multi-sheet Excel ──────────────────────────────
  // ── Shared XLSX image extraction (DISPIMG cell images + floating/anchored drawings) ──
  // Used by both Package Quote (Module 3) and Supplier Quote (Module 2) — single source of truth.
  // Returns: { dispimgId → dataUrl, sheetName → { 0-based row index → dataUrl } }
  const extractXlsxImages = async (arrayBuffer: ArrayBuffer): Promise<{
    imgDataUrls: Record<string, string>;
    floatingBySheet: Record<string, Record<number, string>>;
  }> => {
    const imgDataUrls: Record<string, string> = {};
    const floatingBySheet: Record<string, Record<number, string>> = {};
    try {
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Parse cellimages.xml.rels → rId → media filename
      const relsFile = zip.files['xl/_rels/cellimages.xml.rels'];
      const cellImgFile = zip.files['xl/cellimages.xml'];

      if (relsFile && cellImgFile) {
        const relsText = await relsFile.async('text');
        const cellText = await cellImgFile.async('text');

        const ridToMedia: Record<string, string> = {};
        for (const m of relsText.matchAll(/Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
          if (!m[2].toLowerCase().includes('null')) ridToMedia[m[1]] = m[2];
        }

        const idToRid: Record<string, string> = {};
        for (const m of cellText.matchAll(/name="(ID_[A-F0-9]+)"[\s\S]*?r:embed="([^"]+)"/gi)) {
          idToRid[m[1]] = m[2];
        }

        for (const [dispId, rid] of Object.entries(idToRid)) {
          const mediaPath = ridToMedia[rid];
          if (!mediaPath) continue;
          const fullPath = `xl/${mediaPath}`;
          const mediaFile = zip.files[fullPath];
          if (!mediaFile) continue;
          const b64 = await mediaFile.async('base64');
          const ext = fullPath.split('.').pop()?.toLowerCase() || 'png';
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
          imgDataUrls[dispId] = `data:${mime};base64,${b64}`;
        }
        console.log(`[extractXlsxImages] Extracted ${Object.keys(imgDataUrls).length} DISPIMG images`);
      } else {
        console.log('[extractXlsxImages] No cellimages.xml found — skipping DISPIMG extraction');
      }

      // ── Floating/anchored drawing images ─────────────────────────────
      try {
        const wbXml = zip.files['xl/workbook.xml'] ? await zip.files['xl/workbook.xml'].async('text') : '';
        const wbRels = zip.files['xl/_rels/workbook.xml.rels'] ? await zip.files['xl/_rels/workbook.xml.rels'].async('text') : '';
        const sheetNameToRid: Record<string, string> = {};
        for (const m of wbXml.matchAll(/sheet name="([^"]+)"[^r]*r:id="([^"]+)"/g)) {
          sheetNameToRid[m[1]] = m[2];
        }
        const ridToSheetPath: Record<string, string> = {};
        for (const m of wbRels.matchAll(/Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
          ridToSheetPath[m[1]] = m[2];
        }
        for (const [sheetName, sheetRid] of Object.entries(sheetNameToRid)) {
          const sheetPath = ridToSheetPath[sheetRid];
          if (!sheetPath) continue;
          const sheetFileName = sheetPath.split('/').pop()!;
          const sheetRelsPath = `xl/worksheets/_rels/${sheetFileName}.rels`;
          const sheetRelsFile = zip.files[sheetRelsPath];
          if (!sheetRelsFile) continue;
          const sheetRelsXml = await sheetRelsFile.async('text');
          const drawingMatch = sheetRelsXml.match(/Id="([^"]+)"[^>]+Type="[^"]*drawing[^"]*"[^>]+Target="([^"]+)"/);
          if (!drawingMatch) continue;
          const drawingRelPath = drawingMatch[2];
          const drawingPath = `xl/drawings/${drawingRelPath.replace('../drawings/', '')}`;
          const drawingFile = zip.files[drawingPath];
          if (!drawingFile) continue;
          const drawingXml = await drawingFile.async('text');
          const drawingFileName = drawingPath.split('/').pop()!;
          const drawingRelsPath = `xl/drawings/_rels/${drawingFileName}.rels`;
          const drawingRelsFile = zip.files[drawingRelsPath];
          if (!drawingRelsFile) continue;
          const drawingRelsXml = await drawingRelsFile.async('text');
          const dRidToMedia: Record<string, string> = {};
          for (const m of drawingRelsXml.matchAll(/Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
            if (!m[2].toLowerCase().includes('null')) dRidToMedia[m[1]] = m[2];
          }
          const rowMap: Record<number, string> = {};
          for (const anchor of drawingXml.matchAll(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
            const a = anchor[0];
            const fromRowStr = a.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)?.[1];
            const embed = a.match(/r:embed="([^"]+)"/)?.[1];
            if (fromRowStr == null || !embed) continue;
            const fromRow = parseInt(fromRowStr);
            const mediaRel = dRidToMedia[embed];
            if (!mediaRel) continue;
            const mediaPath = `xl/media/${mediaRel.replace('../media/', '')}`;
            const mediaFile = zip.files[mediaPath];
            if (!mediaFile) continue;
            const b64 = await mediaFile.async('base64');
            const ext = mediaPath.split('.').pop()?.toLowerCase() || 'png';
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
            rowMap[fromRow] = `data:${mime};base64,${b64}`;
          }
          if (Object.keys(rowMap).length > 0) {
            floatingBySheet[sheetName] = rowMap;
            console.log(`[extractXlsxImages] Floating images for "${sheetName}":`, Object.keys(rowMap));
          }
        }
      } catch (fErr) {
        console.warn('[extractXlsxImages] Floating image extraction failed (non-fatal):', fErr);
      }
    } catch (imgErr) {
      console.warn('[extractXlsxImages] Image extraction failed (non-fatal):', imgErr);
    }
    return { imgDataUrls, floatingBySheet };
  };

  const parsePackageExcel = async (file: File) => {
    setPqParseStatus('parsing');
    setPqParseError('');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      console.log('[parsePackageExcel] SheetNames:', workbook.SheetNames);

      // ── Step 1: extract images via shared helper ─────────────────────────
      const { imgDataUrls, floatingBySheet } = await extractXlsxImages(arrayBuffer);

      // ── Step 2: parse sheets → packages ─────────────────────────────────
      const SKIP_WORDS = ['summary','total','totals','总表','汇总','合计','总计','overview','汇总表'];
      const productSheets = workbook.SheetNames.filter(n =>
        !SKIP_WORDS.some(k => n.toLowerCase().trim().includes(k))
      );
      if (productSheets.length === 0) {
        throw new Error('No product sheets found. All sheets appear to be summary sheets.');
      }

      const SKIP_ROW_WORDS = ['subtotal','grand total','合计','总计','小计','总价','grand'];
      const NOTE_PREFIXES = ['注：','注:','备注','note:','*','（注','(注'];
      const packages: PkgQuoteGroup[] = [];

      productSheets.forEach((sheetName, si) => {
        const ws = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
        // Preserve original row index (= 0-based Excel row) for floating image lookup
        const rowsWithOrig = (jsonData as any[][]).map((r, origIdx) => ({ r, origIdx }))
          .filter(({ r }) => Array.isArray(r) && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
        const rows = rowsWithOrig.map(({ r }) => r);

        const HDR_ITEM = ['名称','name'];
        const HDR_PRICE = ['单价','price','单价 '];
        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 8); i++) {
          const row = rows[i].map((c: any) => String(c || '').toLowerCase().trim());
          const hasItem = row.some((c: string) => HDR_ITEM.some(k => c.includes(k)));
          const hasPrice = row.some((c: string) => HDR_PRICE.some(k => c.includes(k)));
          if (hasItem && hasPrice) { headerIdx = i; break; }
        }
        if (headerIdx === -1) {
          console.warn(`[parsePackageExcel] No header in sheet "${sheetName}", skipping`);
          return;
        }

        const headers = rows[headerIdx].map((h: any) => String(h || '').toLowerCase().replace(/\s+/g, ' ').trim());
        const findCol = (keys: string[]) => headers.findIndex((h: string) => keys.some(k => h.includes(k)));
        const colSeq   = findCol(['序号','no.','no ']);
        const colArea  = findCol(['区域','area']);
        const colName  = findCol(['名称','name']);
        const colImg   = findCol(['图片','description','图']);
        const colMat   = findCol(['材质','material']);
        const colSpec  = findCol(['规格','size','spec']);
        const colQty   = findCol(['数量','quantity','qty']);
        const colUnit  = findCol(['单位','unit']);
        const colPrice = findCol(['单价','price']);
        const colSub   = findCol(['小计','sub total','subtotal','合计']);

        let colImgMut = colImg;
        let colNameMut = colName;

        let packageTotal = 0;
        const dataRowsWithOrig = rowsWithOrig.slice(headerIdx + 1);
        const dataRows = dataRowsWithOrig.map(({ r }) => r);

        // Auto-detect image column from cell values if header didn't match
        if (colImgMut === -1 && dataRows.length > 0) {
          const firstRow = dataRows[0] as any[];
          for (let ci = 0; ci < firstRow.length; ci++) {
            const sample = dataRows.slice(0, 5).map((r: any[]) => String(r[ci] || ''));
            if (sample.some(v => v.includes('DISPIMG'))) { colImgMut = ci; break; }
          }
        }
        // If colName points to the image column (header confusion), re-detect
        if (colNameMut !== -1 && colNameMut === colImgMut) {
          colNameMut = headers.findIndex((h: string, i: number) =>
            i !== colImgMut && ['名称','name','品名','产品','描述'].some(k => h.includes(k))
          );
        }
        // Also check: even if indices differ, does the detected name column contain DISPIMG?
        if (colNameMut !== -1) {
          const sample = dataRows.slice(0, 5).map((r: any[]) => String(r[colNameMut] || ''));
          if (sample.filter(v => v.includes('DISPIMG')).length >= 2) {
            if (colImgMut === -1) colImgMut = colNameMut;
            colNameMut = headers.findIndex((h: string, i: number) =>
              i !== colImgMut && ['名称','name','品名','产品','描述'].some(k => h.includes(k))
            );
          }
        }

        const totalRow = dataRows.find((r: any[]) => {
          const vals = r.map((c: any) => String(c || '').trim());
          return vals.some(v => v === '总计' || v === '合计' || v === 'Grand Total');
        });
        if (totalRow && colSub !== -1) {
          packageTotal = parseFloat(String(totalRow[colSub] || '0').replace(/[^0-9.-]/g, '')) || 0;
        }

        const items: PkgQuoteItem[] = [];
        dataRowsWithOrig.forEach(({ r: row, origIdx }, idx: number) => {
          const rawName = colNameMut !== -1 ? String(row[colNameMut] || '').trim() : '';
          if (!rawName) return;
          const nameLower = rawName.toLowerCase();
          if (SKIP_ROW_WORDS.some(k => nameLower === k || nameLower.startsWith(k + ' '))) return;
          if (NOTE_PREFIXES.some(p => rawName.startsWith(p))) return;
          if (/^[1-9一二三四五六七八九][、。．,.]/.test(rawName)) return;
          if (HDR_ITEM.some(k => nameLower.includes(k)) && HDR_PRICE.some(k => nameLower.includes(k))) return;
          if (rawName.length > 0 && colArea !== -1 && !row[colArea] && colQty !== -1 && !row[colQty]) return;

          const rawImg = colImgMut !== -1 ? String(row[colImgMut] || '') : '';
          const imgIdMatch = rawImg.match(/ID_([A-F0-9]+)/i);
          const dispimgId = imgIdMatch ? `ID_${imgIdMatch[1].toUpperCase()}` : undefined;
          const imageFormula = rawImg.includes('DISPIMG') ? rawImg : undefined;
          // DISPIMG takes priority; fall back to floating/anchored drawing image
          const imageDataUrl = (dispimgId ? imgDataUrls[dispimgId] : undefined)
            ?? floatingBySheet[sheetName]?.[origIdx];

          const qty = parseFloat(String(row[colQty] ?? '1').replace(/[^0-9.-]/g, '')) || 1;
          const unitCost = parseFloat(String(row[colPrice] ?? '0').replace(/[^0-9.-]/g, '')) || 0;
          const sub = parseFloat(String(row[colSub] ?? '0').replace(/[^0-9.-]/g, '')) || unitCost * qty;

          items.push({
            id: `pq-${si}-${idx}`,
            seq:      colSeq  !== -1 ? String(row[colSeq] || '').trim()  : String(idx + 1),
            area:     colArea !== -1 ? String(row[colArea] || '').trim() : '',
            name:     rawName,
            material: colMat  !== -1 ? String(row[colMat] || '').trim()  : '',
            spec:     colSpec !== -1 ? String(row[colSpec] || '').trim()  : '',
            qty,
            unit:     colUnit !== -1 ? String(row[colUnit] || '').trim()  : '件',
            unitCost,
            subtotal: sub,
            currency: pqMeta.currency || 'CNY',
            imageFormula,
            imageDataUrl,
          });
        });

        if (items.length > 0 || packageTotal > 0) {
          packages.push({
            id: `pkg-${si}`,
            packageName: sheetName,
            items,
            totalCost: packageTotal || items.reduce((s, it) => s + it.subtotal, 0),
            currency: pqMeta.currency || 'CNY',
          });
        }
      });

      if (packages.length === 0) throw new Error('No packages could be parsed from this Excel file.');
      console.log(`[parsePackageExcel] Parsed ${packages.length} packages`);

      setPqProject({
        projectName: pqMeta.projectName || file.name.replace(/\.[^.]+$/, ''),
        supplierName: pqMeta.supplierName,
        sourceFileName: file.name,
        currency: pqMeta.currency || 'CNY',
        packages,
      });
      setPqParseStatus('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[parsePackageExcel]', err);
      setPqParseError(msg);
      setPqParseStatus('error');
    }
  };

  // ── Package Quote: CN → EN translation (only for Customer Quote + PDF) ───
  // Original data is NEVER modified. These functions run only at display/PDF time.

  const PQ_EN: Record<string, string> = {
    // Areas
    '客厅':'Living Room','起居室':'Living Room','餐厅':'Dining Room','卧室':'Bedroom',
    '主卧':'Master Bedroom','主卧室':'Master Bedroom','次卧':'Bedroom 2','次卧室':'Bedroom 2',
    '儿童房':"Children's Room",'书房':'Study','休闲椅':'Lounge Chair','躺椅':'Lounge Chair','单椅':'Accent Chair','厨房':'Kitchen','卫生间':'Bathroom',
    '主卫':'Master Bathroom','阳台':'Balcony','过道':'Hallway','门厅':'Foyer',
    '衣帽间':'Walk-in Closet','储藏室':'Storage','公区':'Common Area',
    // Item names
    '沙发':'Sofa','单人沙发':'Armchair','双人沙发':'Loveseat','三人沙发':'3-Seat Sofa',
    'L型沙发':'L-Shape Sofa','茶几':'Coffee Table','边几':'Side Table','角几':'Corner Table',
    '电视柜':'TV Unit','电视架':'TV Stand','餐桌':'Dining Table','餐椅':'Dining Chair',
    '吧台':'Bar Counter','吧椅':'Bar Stool','床':'Bed','双人床':'Double Bed',
    '单人床':'Single Bed','儿童床':'Kids Bed','床头柜':'Bedside Table','床头灯':'Bedside Lamp',
    '床垫':'Mattress','床尾凳':'Bed Bench','衣柜':'Wardrobe','书柜':'Bookcase',
    '展示柜':'Display Cabinet','酒柜':'Wine Cabinet','边柜':'Sideboard','斗柜':'Chest of Drawers',
    '梳妆台':'Dressing Table','书桌':'Desk','办公椅':'Office Chair','椅子':'Chair',
    '凳子':'Stool','台灯':'Table Lamp','落地灯':'Floor Lamp','吊灯':'Pendant Light',
    '地毯':'Rug','窗帘':'Curtain','镜子':'Mirror','装饰画':'Wall Art','花盆':'Planter',
    '换鞋凳':'Entry Bench','鞋柜':'Shoe Cabinet','浴室柜':'Vanity Cabinet',
    '洗手台':'Vanity','马桶':'Toilet','浴缸':'Bathtub','淋浴房':'Shower Enclosure',
    // Units
    '件':'Pcs','套':'Set','张':'Pcs','把':'Pcs','个':'Pcs','条':'Pcs','块':'Pcs',
    '组':'Set','副':'Pair','双':'Pair','米':'m','平方米':'m²','㎡':'m²',
  };

  // Material keyword → English category (longest match wins)
  const MAT_KW: [string, string][] = [
    // Specific materials (check these first — more specific before generic)
    ['不锈钢','Stainless Steel'],['碳素钢','Carbon Steel'],['镀金','Gold-plated'],
    ['镀铬','Chrome-plated'],['镀铜','Copper-plated'],['铜','Brass'],['铁艺','Iron'],
    ['铝合金','Aluminum Alloy'],['合金','Alloy'],['钢','Steel'],['金属','Metal'],
    ['大理石','Marble'],['花岗岩','Granite'],['石英石','Quartz Stone'],['岩板','Sintered Stone'],
    ['天然石','Natural Stone'],['人造石','Engineered Stone'],['石','Stone'],
    ['玻璃','Glass'],['钢化玻璃','Tempered Glass'],
    ['实木','Solid Wood'],['橡木','Oak'],['胡桃木','Walnut'],['松木','Pine'],
    ['桦木','Birch'],['榉木','Beech'],['柚木','Teak'],['白蜡木','Ash Wood'],
    ['多层板','Plywood'],['密度板','MDF'],['刨花板','Particle Board'],
    ['环保板','Eco-Board'],['板材','Board'],['木','Wood'],
    ['真皮','Genuine Leather'],['头层牛皮','Full-grain Leather'],['牛皮','Cowhide Leather'],
    ['皮革','Leather'],['西皮','PU Leather'],['人造皮','Faux Leather'],['皮','Leather'],
    ['高分子纺织布','Technical Fabric'],['纺织布','Woven Fabric'],['布艺','Fabric'],
    ['绒布','Velvet'],['亚麻','Linen'],['棉麻','Cotton-Linen'],['棉','Cotton'],
    ['面料','Upholstery Fabric'],['布','Fabric'],
    ['海绵','Foam'],['记忆棉','Memory Foam'],['大忆棉','High-density Foam'],['乳胶','Latex'],
    ['烤漆','Lacquer Finish'],['喷漆','Spray Paint'],['油漆','Paint'],
    ['电镀','Electroplated'],['镀','Plated'],
    ['大理石纹','Marble Pattern'],['仿石纹','Stone Pattern'],
    ['环保','Eco-friendly'],
  ];

  const hasChinese = (s: string) => /[一-鿿]/.test(s);

  // Translate simple/short terms using the PQ_EN dict (for area/name/unit)
  const pqTranslate = (text: string): string => {
    if (!text) return text;
    if (PQ_EN[text]) return PQ_EN[text];
    let out = text;
    for (const [cn, en] of Object.entries(PQ_EN)) {
      out = out.replace(cn, en);
    }
    return out;
  };

  // Translate material descriptions — handles complex compound Chinese strings
  const materialToEn = (text: string): string => {
    if (!text) return '';
    if (!hasChinese(text)) return text; // already Latin — return as-is

    // Step 1: apply PQ_EN substring replacements
    let out = text;
    for (const [cn, en] of Object.entries(PQ_EN)) {
      out = out.replace(new RegExp(cn, 'g'), en);
    }

    // Step 2: apply material keyword replacements (longest first, already sorted)
    for (const [kw, en] of MAT_KW) {
      out = out.replace(new RegExp(kw, 'g'), en);
    }

    // Step 3: still has Chinese? Extract English parts + collect material categories
    if (hasChinese(out)) {
      // Pull out English-compatible segments (Latin, digits, symbols, spaces)
      const enParts = out.match(/[A-Za-z0-9\-\/\+\*\. %&()]+/g) ?? [];
      // Collect what material keywords were detected in ORIGINAL text
      const detected: string[] = [];
      for (const [kw, en] of MAT_KW) {
        if (text.includes(kw) && !detected.includes(en)) detected.push(en);
      }
      const combined = [...new Set([...enParts.map(s => s.trim()).filter(s => s.length > 1), ...detected])];
      out = combined.length > 0 ? combined.join(' + ') : 'Composite Material';
    }

    // Step 4: strip any remaining Chinese characters as final safety net
    out = out.replace(/[一-鿿㐀-䶿]+/g, '').replace(/\s{2,}/g, ' ').trim();
    // Clean up stray separators
    out = out.replace(/^[+·\-\s]+|[+·\-\s]+$/g, '').replace(/[+·]{2,}/g, '+');

    return out || 'Mixed Material';
  };

  // ── Spec cleaner: PDF-safe dimension string (no Chinese, no wide chars) ────
  const cleanSpec = (raw: string): string => {
    if (!raw) return '';
    let s = raw;
    // Normalise dimension separators
    s = s.replace(/[×✕✖]/g, '*');       // ×  → *
    s = s.replace(/[＊·•]/g, '*');       // ＊ → *
    s = s.replace(/（/g, '(').replace(/）/g, ')'); // 全角括号
    s = s.replace(/[，,、]/g, ' ');       // Chinese commas → space
    // Extract all dimension-like segments: optional Ø, then digits/*x./- chains
    const dimRe = /Ø?[\d]+(?:[*xX.\-\/][\d]+)+(?:\*[\d]+)?|Ø[\d]+/g;
    const dims = s.match(dimRe) ?? [];
    // Also keep plain numbers that look like a single dimension value (≥3 digits)
    if (dims.length > 0) {
      return dims.join(' / ');
    }
    // Fallback: strip all non-safe characters
    s = s.replace(/[^0-9xX*./\-Ø ]/g, ' ');
    s = s.replace(/\s{2,}/g, ' ').trim();
    return s;
  };

  // ── Package Quote Customer PDF ────────────────────────────────────────────
  const generatePkgCustomerPdf = (
    project: PkgQuoteProject,
    markups: Record<string, number>,
    rate: number,
    currency: 'AED' | 'USD',
    meta: { customer: string; quoteNo: string; quoteDate: string; validUntil: string; paymentTerms: string; deliveryTerms: string }
  ) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const PW = 297;
    const PH = 210;
    const MARGIN = 14;
    const CONTENT_BOTTOM = PH - 12; // footer occupies bottom 10mm
    const NAVY = [12, 27, 58] as [number, number, number];
    const GOLD = [201, 168, 76] as [number, number, number];
    const LGRAY = [245, 246, 248] as [number, number, number];
    // Column x positions
    const COL = { img: MARGIN, seq: 34, area: 43, name: 66, mat: 118, spec: 178, qty: 222, unit: 234, price: 283 };

    const totalGCI = project.packages.reduce((s, p) => {
      const m = markups[p.id] ?? 0;
      return s + p.totalCost * rate * (1 + m / 100);
    }, 0);

    let y = 0;

    // ── Reusable helpers ──────────────────────────────────────────────────────
    const drawPageHeader = () => {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, PW, 20, 'F');
      doc.setFillColor(...GOLD);
      doc.rect(0, 20, PW, 1.2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('GCI', MARGIN, 13);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GOLD);
      doc.text('GLOBAL CARE INFO', 26, 13);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text('PACKAGE QUOTATION', PW - MARGIN, 13, { align: 'right' });
    };

    const drawPageFooter = (pageNum: number, totalPages: number) => {
      doc.setFillColor(...NAVY);
      doc.rect(0, PH - 10, PW, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6); doc.setFont('helvetica', 'normal');
      doc.text(`GCI Package Quotation  ·  ${meta.quoteNo}`, MARGIN, PH - 4.5);
      doc.text(`Page ${pageNum} / ${totalPages}`, PW - MARGIN, PH - 4.5, { align: 'right' });
    };

    const drawColHeaders = () => {
      doc.setFillColor(228, 232, 242);
      doc.rect(MARGIN, y, PW - MARGIN * 2, 6, 'F');
      doc.setFontSize(6); doc.setFont('helvetica', 'bold');
      doc.setTextColor(75, 90, 115);
      doc.text('#', COL.seq, y + 4);
      doc.text('AREA', COL.area, y + 4);
      doc.text('ITEM NAME', COL.name, y + 4);
      doc.text('MATERIAL', COL.mat, y + 4);
      doc.text('SIZE / SPEC', COL.spec, y + 4);
      doc.text('QTY', COL.qty, y + 4, { align: 'right' });
      doc.text('UNIT', COL.unit, y + 4);
      doc.text(`PRICE (${currency})`, COL.price, y + 4, { align: 'right' });
      y += 7;
    };

    const drawPkgTitleBand = (pkgName: string, gciTotal: number) => {
      doc.setFillColor(...NAVY);
      doc.rect(MARGIN, y, PW - MARGIN * 2, 9, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text(pqTranslate(pkgName).toUpperCase(), MARGIN + 4, y + 6);
      doc.setTextColor(...GOLD);
      doc.setFontSize(9);
      doc.text(`${currency} ${gciTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, PW - MARGIN, y + 6, { align: 'right' });
      y += 10;
    };

    // ── Page 1: Cover / Quote Meta ────────────────────────────────────────────
    drawPageHeader();
    doc.setFillColor(...LGRAY);
    doc.roundedRect(MARGIN, 24, PW - MARGIN * 2, 30, 2, 2, 'F');
    doc.setTextColor(...NAVY);
    doc.setFontSize(7.5);
    const lx = MARGIN + 4, rx = PW / 2 + 4, ly = 30;
    doc.setFont('helvetica', 'bold'); doc.text('PROJECT', lx, ly);
    doc.setFont('helvetica', 'normal'); doc.text(project.projectName.slice(0, 50), lx + 24, ly);
    doc.setFont('helvetica', 'bold'); doc.text('CUSTOMER', lx, ly + 7);
    doc.setFont('helvetica', 'normal'); doc.text(meta.customer || '—', lx + 24, ly + 7);
    doc.setFont('helvetica', 'bold'); doc.text('CURRENCY', lx, ly + 14);
    doc.setFont('helvetica', 'normal'); doc.text(currency, lx + 24, ly + 14);
    doc.setFont('helvetica', 'bold'); doc.text('PACKAGES', lx, ly + 21);
    doc.setFont('helvetica', 'normal'); doc.text(String(project.packages.length), lx + 24, ly + 21);
    doc.setFont('helvetica', 'bold'); doc.text('QUOTE NO', rx, ly);
    doc.setFont('helvetica', 'normal'); doc.text(meta.quoteNo, rx + 26, ly);
    doc.setFont('helvetica', 'bold'); doc.text('DATE', rx, ly + 7);
    doc.setFont('helvetica', 'normal'); doc.text(meta.quoteDate, rx + 26, ly + 7);
    doc.setFont('helvetica', 'bold'); doc.text('VALID UNTIL', rx, ly + 14);
    doc.setFont('helvetica', 'normal'); doc.text(meta.validUntil, rx + 26, ly + 14);
    doc.setFont('helvetica', 'bold'); doc.text('TOTAL', rx, ly + 21);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...GOLD);
    doc.setFontSize(9);
    doc.text(`${currency} ${totalGCI.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, rx + 26, ly + 21);

    // Package summary list on page 1
    y = 60;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text('PACKAGE SUMMARY', lx, y); y += 5;
    doc.setFillColor(228, 232, 242);
    doc.rect(MARGIN, y, PW - MARGIN * 2, 5, 'F');
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(75, 90, 115);
    doc.text('PACKAGE', lx, y + 3.5);
    doc.text('ITEMS', 180, y + 3.5, { align: 'right' });
    doc.text(`PRICE (${currency})`, PW - MARGIN, y + 3.5, { align: 'right' });
    y += 6;
    project.packages.forEach((pkg, idx) => {
      const m = markups[pkg.id] ?? 0;
      const gci = pkg.totalCost * rate * (1 + m / 100);
      if (idx % 2 === 0) { doc.setFillColor(250, 251, 253); doc.rect(MARGIN, y, PW - MARGIN * 2, 6, 'F'); }
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...NAVY);
      doc.text(pqTranslate(pkg.packageName), lx, y + 4.2);
      doc.text(String(pkg.items.length), 180, y + 4.2, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
      doc.text(`${currency} ${gci.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, PW - MARGIN, y + 4.2, { align: 'right' });
      y += 6;
    });
    // Grand total on summary list
    y += 2;
    doc.setFillColor(...NAVY);
    doc.roundedRect(MARGIN, y, PW - MARGIN * 2, 8, 1, 1, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('GRAND TOTAL', lx, y + 5.5);
    doc.setTextColor(...GOLD); doc.setFontSize(10);
    doc.text(`${currency} ${totalGCI.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, PW - MARGIN, y + 5.5, { align: 'right' });

    // ── Package sections — each starts on a new page ──────────────────────────
    for (const pkg of project.packages) {
      const markup = markups[pkg.id] ?? 0;
      const gciTotal = pkg.totalCost * rate * (1 + markup / 100);

      // Always start new page for each package
      doc.addPage();
      drawPageHeader();
      y = 24;
      drawPkgTitleBand(pkg.packageName, gciTotal);
      drawColHeaders();

      for (const it of pkg.items) {
        const rowH = it.imageDataUrl ? 20 : (it.material || it.spec ? 13 : 8);

        // Mid-package page break: repeat title + headers
        if (y + rowH > CONTENT_BOTTOM) {
          doc.addPage();
          drawPageHeader();
          y = 24;
          drawPkgTitleBand(pkg.packageName, gciTotal);
          drawColHeaders();
        }

        const itemGCI = it.unitCost * rate * (1 + markup / 100) * it.qty;
        const rowIdx = pkg.items.indexOf(it);
        if (rowIdx % 2 === 0) {
          doc.setFillColor(250, 251, 253);
          doc.rect(MARGIN, y, PW - MARGIN * 2, rowH, 'F');
        }

        // Photo
        if (it.imageDataUrl) {
          try { doc.addImage(it.imageDataUrl, 'PNG', COL.img, y + 1.5, 16, 16); }
          catch { /* skip */ }
        }

        const en = pqItemsEN[it.id] ?? { nameEN: pqTranslate(it.name), areaEN: pqTranslate(it.area || ''), materialEN: materialToEn(it.material), specEN: cleanSpec(it.spec) };
        const matEn = en.materialEN || '';
        const specSafe = en.specEN || '';
        const baseY = (matEn || specSafe) ? y + 5 : y + 5.5;

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(150, 160, 175);
        doc.text(it.seq, COL.seq, baseY);

        doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 115, 140);
        doc.text(en.areaEN.slice(0, 16), COL.area, baseY);

        doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
        doc.text(en.nameEN.slice(0, 26), COL.name, baseY);

        doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 95, 120);
        if (matEn) doc.text(matEn.slice(0, 32), COL.mat, baseY);

        doc.setTextColor(100, 115, 140);
        if (specSafe) doc.text(specSafe.slice(0, 24), COL.spec, baseY);

        doc.setTextColor(...NAVY);
        doc.text(String(it.qty), COL.qty, baseY, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.text(pqTranslate(it.unit), COL.unit, baseY);

        doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
        doc.text(`${currency} ${itemGCI.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, COL.price, baseY, { align: 'right' });

        doc.setDrawColor(220, 225, 235); doc.setLineWidth(0.2);
        doc.line(MARGIN, y + rowH, PW - MARGIN, y + rowH);
        y += rowH;
      }

      // Package total — always at bottom of section, with gap
      if (y + 10 > CONTENT_BOTTOM) { doc.addPage(); drawPageHeader(); y = 24; }
      y += 4;
      doc.setFillColor(225, 230, 245);
      doc.rect(MARGIN, y, PW - MARGIN * 2, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(`${pqTranslate(pkg.packageName)} — Package Total`, MARGIN + 4, y + 5.5);
      doc.setTextColor(...GOLD);
      doc.text(`${currency} ${gciTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, PW - MARGIN, y + 5.5, { align: 'right' });
      y += 12;
    }

    // ── Final page: Terms ─────────────────────────────────────────────────────
    doc.addPage();
    drawPageHeader();
    y = 30;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text('TERMS & CONDITIONS', MARGIN + 4, y); y += 8;
    doc.setFillColor(...LGRAY);
    doc.roundedRect(MARGIN, y, PW - MARGIN * 2, 22, 2, 2, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text('PAYMENT TERMS', MARGIN + 4, y + 7);
    doc.setFont('helvetica', 'normal'); doc.text(meta.paymentTerms, MARGIN + 40, y + 7);
    doc.setFont('helvetica', 'bold'); doc.text('DELIVERY TERMS', MARGIN + 4, y + 15);
    doc.setFont('helvetica', 'normal'); doc.text(meta.deliveryTerms, MARGIN + 40, y + 15);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...GOLD);
    doc.text('Global Care Info', PW - MARGIN, y + 7, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 115, 140);
    doc.text('chris@globalcareinfo.com', PW - MARGIN, y + 13, { align: 'right' });
    doc.text('www.globalcareinfo.com', PW - MARGIN, y + 18, { align: 'right' });

    // ── Footer on every page ──────────────────────────────────────────────────
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawPageFooter(i, totalPages);
    }

    doc.save(`GCI-Package-Quote-${meta.quoteNo}.pdf`);
  };

  // ── Module 4: Service Quote — render ──────────────────────────────────────────
  const SVC_CATEGORY_ICONS: Record<string, any> = {
    '企业服务': Building2,
    '市场进入与商务拓展': Briefcase,
    '项目服务': Layers,
    '海外仓与物流服务': Anchor,
    '供应链服务': Package,
    'AI数字化解决方案': Cpu,
  };

  const renderServiceQuoteModule = () => {
    const startNewQuote = () => {
      svcLoadCatalog();
      setSvcMeta({ quoteNo: generateServiceQuoteNo(), customerName: '', contactPerson: '', quoteDate: new Date().toISOString().split('T')[0], currency: 'AED', projectDuration: '', paymentTerms: PAYMENT_TERM_OPTIONS[0], notes: '' });
      setSvcItems([]); setSvcSavedId(null); setSvcSaveStatus('idle');
      setSvcActiveCategoryId(null); setSvcPickerSearch('');
      setSvcView('category');
    };

    // Breadcrumb — same structure/style as Package Quote's "Workflow Home › Package Quote › ..."
    const SvcBreadcrumb = ({ trail }: { trail?: string }) => (
      <>
      {/* SUPPLY CHAIN 分区页面标题 */}
      <h1 className="text-2xl font-semibold mb-2" style={{ fontFamily: "'Space Grotesk',sans-serif", color: '#0C1B3A' }}>服务报价</h1>
      <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-widest flex-wrap">
        <button onClick={() => setAppMode('landing')} className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">
          Workflow Home
        </button>
        <span className="text-[#0C1B3A]/20">›</span>
        {svcView === 'list' ? (
          <span className="text-[#C9A84C]">Service Quote</span>
        ) : (
          <button onClick={() => setSvcView('list')} className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">Service Quote</button>
        )}
        {trail && (
          <>
            <span className="text-[#0C1B3A]/20">›</span>
            <span className="text-[#C9A84C]">{trail}</span>
          </>
        )}
      </div>
      </>
    );

    // ── List view: saved Service Quotes ───────────────────────────────────────
    if (svcView === 'list') {
      return (
        <div className="space-y-8 animate-in fade-in duration-500">
          <SvcBreadcrumb />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-serif italic text-[#0C1B3A]">Service Quotes 服务报价</h2>
              <p className="text-[11px] text-[#0C1B3A]/50 mt-1">企业服务 · 出海服务 · 项目服务 · 海外仓 · 供应链 · AI数字化（与库存/SKU/成本无关）</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { svcLoadCatalog(); setSvcView('catalog'); }}
                className="px-5 py-3 rounded-[16px] text-[11px] font-black uppercase tracking-widest border border-[#0C1B3A]/15 text-[#0C1B3A]/60 hover:border-[#C9A84C] hover:text-[#0C1B3A] transition-all">
                Manage Catalog
              </button>
              <button
                onClick={startNewQuote}
                className="px-6 py-3 rounded-[16px] text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg"
                style={{ backgroundColor: '#0C1B3A', color: '#C9A84C' }}
              >
                <Plus className="w-4 h-4" /> New Service Quote
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[24px] border border-[#0C1B3A]/8 overflow-hidden shadow-sm">
            {svcQuotes.length === 0 ? (
              <div className="p-16 text-center text-[#0C1B3A]/30 text-[12px]">
                No service quotes yet. Click "New Service Quote" to start. 暂无服务报价，点击上方按钮新建。
              </div>
            ) : (
              <div className="divide-y divide-[#0C1B3A]/6">
                {svcQuotes.map(sq => (
                  <div key={sq.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#0C1B3A]/2 transition-colors">
                    <div>
                      <p className="text-[13px] font-black text-[#0C1B3A]">{sq.quote_no} · {sq.customer_name}</p>
                      <p className="text-[11px] text-[#0C1B3A]/40 mt-0.5">{sq.quote_date} · {sq.currency} {sq.total_amount.toFixed(2)} · <span className="uppercase font-bold">{sq.status}</span></p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleOpenServiceQuote(sq, false)} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-[#0C1B3A]/15 text-[#0C1B3A]/60 hover:border-[#C9A84C] hover:text-[#0C1B3A] transition-all">Open</button>
                      <button onClick={() => handleOpenServiceQuote(sq, true)} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-[#0C1B3A]/15 text-[#0C1B3A]/60 hover:border-[#C9A84C] hover:text-[#0C1B3A] transition-all">Duplicate</button>
                      <button onClick={() => sq.id && handleDeleteServiceQuote(sq.id)} className="px-3 py-2 rounded-xl text-[#0C1B3A]/20 hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    // ── Category picker: step 1 of building a new quote ───────────────────────
    if (svcView === 'category') {
      return (
        <div className="space-y-8 animate-in fade-in duration-500">
          <SvcBreadcrumb trail="New Service Quote" />
          <div className="text-center space-y-2">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#C9A84C] bg-[#C9A84C]/10 px-3 py-1 rounded-full">Step 1 of 3</span>
            <h2 className="text-2xl font-serif italic text-[#0C1B3A]">Choose a Service Category</h2>
            <p className="text-[11px] text-[#0C1B3A]/45">请选择服务分类</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {svcCategories.map(cat => {
              const Icon = SVC_CATEGORY_ICONS[cat.name_cn] || Package;
              const count = svcCatalog.filter(it => it.category_id === cat.id).length;
              return (
                <button key={cat.id}
                  onClick={() => { setSvcActiveCategoryId(cat.id || null); setSvcPickerSearch(''); setSvcView('items'); }}
                  className="group text-left p-7 bg-white border-2 border-[#0C1B3A]/8 rounded-[28px] hover:border-[#C9A84C] hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-3"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#0C1B3A]/4 group-hover:bg-[#C9A84C]/12 flex items-center justify-center transition-colors">
                    <Icon className="w-6 h-6 text-[#0C1B3A]/40 group-hover:text-[#C9A84C] transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-black text-[#0C1B3A] group-hover:text-[#C9A84C] transition-colors">{cat.name_cn}</h3>
                    <p className="text-[11px] text-[#0C1B3A]/40 font-bold mt-0.5">{cat.name_en}</p>
                  </div>
                  <p className="text-[10px] text-[#0C1B3A]/30 mt-auto">{count} service{count === 1 ? '' : 's'}</p>
                </button>
              );
            })}
            {svcCategories.length === 0 && svcCatalogLoading && (
              <p className="col-span-3 text-center text-[#0C1B3A]/30 text-[12px] py-10">Loading catalog... 正在加载服务目录</p>
            )}
            {svcCategories.length === 0 && !svcCatalogLoading && svcCatalogError && (
              <div className="col-span-3 text-center py-10 space-y-4">
                <p className="text-[12px] text-red-500/80 max-w-md mx-auto leading-relaxed">{svcCatalogError}</p>
                <button onClick={() => svcLoadCatalog(true)}
                  className="px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider border border-[#0C1B3A]/15 text-[#0C1B3A]/60 hover:border-[#C9A84C] hover:text-[#0C1B3A] transition-all">
                  Retry 重试
                </button>
              </div>
            )}
          </div>
          {svcItems.length > 0 && (
            <div className="flex justify-center">
              <button onClick={() => setSvcView('editor')} className="px-8 py-3.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest flex items-center gap-2" style={{ backgroundColor: '#C9A84C', color: '#0C1B3A' }}>
                {svcItems.length} service{svcItems.length === 1 ? '' : 's'} selected · Continue to Quote <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      );
    }

    // ── Items picker: step 2 — browse/select services within a category ───────
    if (svcView === 'items') {
      const activeCat = svcCategories.find(c => c.id === svcActiveCategoryId);
      const visibleItems = svcCatalog.filter(it => it.category_id === svcActiveCategoryId &&
        (!svcPickerSearch.trim() || it.name_cn.includes(svcPickerSearch) || it.name_en.toLowerCase().includes(svcPickerSearch.toLowerCase())));
      return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-24">
          <SvcBreadcrumb trail="New Service Quote" />
          <button onClick={() => setSvcView('category')} className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#0C1B3A]/40 hover:text-[#C9A84C] transition-colors">
            <ChevronLeft className="w-4 h-4" /> All Categories
          </button>

          {/* Category tabs — switch without losing selected items */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {svcCategories.map(cat => (
              <button key={cat.id} onClick={() => { setSvcActiveCategoryId(cat.id || null); setSvcPickerSearch(''); }}
                className="px-4 py-2 rounded-full text-[11px] font-bold whitespace-nowrap transition-all"
                style={cat.id === svcActiveCategoryId ? { backgroundColor: '#0C1B3A', color: '#C9A84C' } : { backgroundColor: '#0C1B3A0A', color: '#0C1B3A80' }}
              >
                {cat.name_cn}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-serif italic text-[#0C1B3A]">{activeCat?.name_cn} <span className="text-[#0C1B3A]/30 text-[14px]">{activeCat?.name_en}</span></h2>
            <div className="flex items-center gap-3">
              <input value={svcPickerSearch} onChange={e => setSvcPickerSearch(e.target.value)} placeholder="Search services... 搜索服务" className="flex-1 max-w-md bg-white border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[12px] outline-none focus:border-[#C9A84C]" />
              <button onClick={svcAddCustomItem} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider border border-dashed border-[#0C1B3A]/20 text-[#0C1B3A]/50 hover:border-[#C9A84C] hover:text-[#0C1B3A] whitespace-nowrap transition-colors">+ Custom Service</button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleItems.map(it => {
              const added = svcItems.some(si => si.serviceName === `${it.name_cn} / ${it.name_en}`);
              return (
                <button key={it.id} onClick={() => svcAddItemFromCatalog(it)}
                  disabled={added}
                  className={`text-left p-5 rounded-[20px] border-2 transition-all ${added ? 'bg-[#C9A84C]/8 border-[#C9A84C]/30 cursor-default' : 'bg-white border-[#0C1B3A]/8 hover:border-[#C9A84C] hover:shadow-md'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-black text-[#0C1B3A]">{it.name_cn}</p>
                      <p className="text-[11px] text-[#0C1B3A]/40 font-bold mt-0.5">{it.name_en}</p>
                    </div>
                    {added ? <CheckCircle2 className="w-4 h-4 text-[#C9A84C] shrink-0" /> : <Plus className="w-4 h-4 text-[#0C1B3A]/20 shrink-0" />}
                  </div>
                  <p className="text-[9px] text-[#0C1B3A]/30 mt-3 uppercase font-bold tracking-wider">{it.default_unit} · {BILLING_TYPE_LABELS[it.default_billing_type]}</p>
                </button>
              );
            })}
            {visibleItems.length === 0 && (
              <p className="col-span-3 text-center text-[#0C1B3A]/30 text-[12px] py-10">No services match "{svcPickerSearch}". Try "+ Custom Service" instead.</p>
            )}
          </div>

          {/* Sticky cart bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#0C1B3A]/10 shadow-2xl px-6 py-4 flex items-center justify-between z-20">
            <p className="text-[12px] font-bold text-[#0C1B3A]/60">{svcItems.length} service{svcItems.length === 1 ? '' : 's'} selected 已选择</p>
            <button onClick={() => setSvcView('editor')} disabled={svcItems.length === 0}
              className="px-8 py-3 rounded-[14px] text-[11px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-30 transition-all"
              style={{ backgroundColor: '#C9A84C', color: '#0C1B3A' }}
            >
              Continue to Quote 进入报价单 <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    // ── Catalog Manager view — add categories/services without touching code ───
    if (svcView === 'catalog') {
      return (
        <div className="space-y-8 animate-in fade-in duration-500">
          <SvcBreadcrumb trail="Catalog Manager" />
          <div>
            <h2 className="text-2xl font-serif italic text-[#0C1B3A]">Service Catalog Manager</h2>
            <p className="text-[11px] text-[#0C1B3A]/50 mt-1">新增服务分类/项目，无需修改代码 — Add categories/services here, no developer needed for future additions.</p>
          </div>

          {/* Add category */}
          <div className="bg-white rounded-[20px] border border-[#0C1B3A]/8 p-6 space-y-3">
            <h4 className="text-[12px] font-black text-[#0C1B3A]">Add Category 新增分类</h4>
            <div className="flex gap-3">
              <input value={svcNewCatName.cn} onChange={e => setSvcNewCatName(p => ({ ...p, cn: e.target.value }))} placeholder="中文名称" className="flex-1 bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-[#C9A84C]" />
              <input value={svcNewCatName.en} onChange={e => setSvcNewCatName(p => ({ ...p, en: e.target.value }))} placeholder="English Name" className="flex-1 bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-[#C9A84C]" />
              <button
                onClick={async () => {
                  if (!svcNewCatName.cn.trim() || !svcNewCatName.en.trim()) return;
                  await addServiceCategory({ name_cn: svcNewCatName.cn, name_en: svcNewCatName.en, sort_order: svcCategories.length });
                  setSvcNewCatName({ cn: '', en: '' });
                  const cats = await listServiceCategories(); setSvcCategories(cats);
                }}
                className="px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider shrink-0"
                style={{ backgroundColor: '#0C1B3A', color: '#C9A84C' }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Add catalog item */}
          <div className="bg-white rounded-[20px] border border-[#0C1B3A]/8 p-6 space-y-3">
            <h4 className="text-[12px] font-black text-[#0C1B3A]">Add Service 新增服务项目</h4>
            <div className="grid grid-cols-5 gap-3">
              <select value={svcNewItem.categoryId} onChange={e => setSvcNewItem(p => ({ ...p, categoryId: e.target.value }))} className="bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-3 py-2.5 text-[12px] outline-none focus:border-[#C9A84C]">
                <option value="">Category 分类</option>
                {svcCategories.map(c => <option key={c.id} value={c.id}>{c.name_cn}</option>)}
              </select>
              <input value={svcNewItem.cn} onChange={e => setSvcNewItem(p => ({ ...p, cn: e.target.value }))} placeholder="中文名称" className="bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-3 py-2.5 text-[12px] outline-none focus:border-[#C9A84C]" />
              <input value={svcNewItem.en} onChange={e => setSvcNewItem(p => ({ ...p, en: e.target.value }))} placeholder="English Name" className="bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-3 py-2.5 text-[12px] outline-none focus:border-[#C9A84C]" />
              <input value={svcNewItem.unit} onChange={e => setSvcNewItem(p => ({ ...p, unit: e.target.value }))} placeholder="Unit 单位" className="bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-3 py-2.5 text-[12px] outline-none focus:border-[#C9A84C]" />
              <select value={svcNewItem.billing} onChange={e => setSvcNewItem(p => ({ ...p, billing: e.target.value as ServiceBillingType }))} className="bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-3 py-2.5 text-[11px] outline-none focus:border-[#C9A84C]">
                {Object.entries(BILLING_TYPE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <button
              onClick={async () => {
                if (!svcNewItem.categoryId || !svcNewItem.cn.trim() || !svcNewItem.en.trim()) { alert('请填写分类、中文名称、英文名称'); return; }
                await addServiceCatalogItem({ category_id: svcNewItem.categoryId, name_cn: svcNewItem.cn, name_en: svcNewItem.en, default_unit: svcNewItem.unit || '项', default_billing_type: svcNewItem.billing, sort_order: svcCatalog.length, active: true });
                setSvcNewItem({ categoryId: svcNewItem.categoryId, cn: '', en: '', unit: '项', billing: 'fixed' });
                const items = await listServiceCatalogItems(); setSvcCatalog(items);
              }}
              className="px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider"
              style={{ backgroundColor: '#C9A84C', color: '#0C1B3A' }}
            >
              Add Service
            </button>
          </div>

          {/* Existing catalog */}
          <div className="bg-white rounded-[20px] border border-[#0C1B3A]/8 overflow-hidden">
            {svcCategories.map(cat => (
              <div key={cat.id} className="border-b border-[#0C1B3A]/6 last:border-b-0">
                <div className="px-6 py-3 bg-[#0C1B3A]/3">
                  <p className="text-[11px] font-black text-[#0C1B3A]">{cat.name_cn} / {cat.name_en}</p>
                </div>
                {svcCatalog.filter(it => it.category_id === cat.id).map(it => (
                  <div key={it.id} className="flex items-center justify-between px-6 py-2.5 hover:bg-[#0C1B3A]/2">
                    <p className="text-[12px] text-[#0C1B3A]/80">{it.name_cn} / {it.name_en} <span className="text-[#0C1B3A]/30">· {it.default_unit} · {BILLING_TYPE_LABELS[it.default_billing_type]}</span></p>
                    <button
                      onClick={async () => { if (it.id) { await deleteServiceCatalogItem(it.id); const items = await listServiceCatalogItems(); setSvcCatalog(items); } }}
                      className="text-[#0C1B3A]/20 hover:text-red-400 transition-colors"
                    ><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ── Editor view: formatted quote document + live preview ──────────────────
    const billingLabelOf = (it: SvcLineItem) => it.billingType === 'custom' && it.billingLabel ? it.billingLabel : BILLING_TYPE_LABELS[it.billingType];

    const QuotePreview = () => (
      <div className="bg-white rounded-[24px] border border-[#0C1B3A]/8 shadow-sm overflow-hidden">
        <div className="px-6 py-4" style={{ backgroundColor: '#0C1B3A' }}>
          <p className="text-[12px] font-black text-white">GLOBALCARE INFO GENERAL TRADING FZCO</p>
          <p className="text-[9px] mt-0.5" style={{ color: '#C9A84C' }}>SERVICE QUOTATION · 服务报价单</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-[10.5px]">
            <div><p className="text-[#0C1B3A]/35 uppercase font-bold text-[8px]">Quote No</p><p className="font-bold text-[#0C1B3A]">{svcMeta.quoteNo}</p></div>
            <div><p className="text-[#0C1B3A]/35 uppercase font-bold text-[8px]">Date</p><p className="font-bold text-[#0C1B3A]">{svcMeta.quoteDate}</p></div>
            <div><p className="text-[#0C1B3A]/35 uppercase font-bold text-[8px]">Customer</p><p className="font-bold text-[#0C1B3A]">{svcMeta.customerName || '—'}</p></div>
            <div><p className="text-[#0C1B3A]/35 uppercase font-bold text-[8px]">Contact</p><p className="font-bold text-[#0C1B3A]">{svcMeta.contactPerson || '—'}</p></div>
          </div>
          <div className="border-t border-[#0C1B3A]/8 pt-4 space-y-3">
            {svcItems.length === 0 ? (
              <p className="text-[11px] text-[#0C1B3A]/30 text-center py-6">No services added yet</p>
            ) : svcItems.map(it => (
              <div key={it.id} className="flex items-start justify-between gap-3 text-[11px]">
                <div className="flex-1">
                  <p className="font-bold text-[#0C1B3A]">{it.serviceName}</p>
                  {it.description && <p className="text-[#0C1B3A]/40 text-[10px] mt-0.5">{it.description}</p>}
                  <p className="text-[#0C1B3A]/30 text-[9px] mt-0.5">{it.quantity} {it.unit} × {it.unitPrice.toFixed(2)} · {billingLabelOf(it)}</p>
                </div>
                <p className="font-black font-mono text-[#0C1B3A] shrink-0">{it.lineTotal.toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-[#0C1B3A]/8 pt-4 flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wider text-[#0C1B3A]">Total</p>
            <p className="text-xl font-black font-mono" style={{ color: '#0C1B3A' }}>{svcMeta.currency} {svcGrandTotal().toFixed(2)}</p>
          </div>
          {(svcMeta.projectDuration || svcMeta.paymentTerms) && (
            <div className="border-t border-[#0C1B3A]/8 pt-4 space-y-1.5 text-[10.5px]">
              {svcMeta.projectDuration && <p><span className="text-[#0C1B3A]/40 font-bold">Project Duration: </span><span className="text-[#0C1B3A]">{svcMeta.projectDuration}</span></p>}
              {svcMeta.paymentTerms && <p><span className="text-[#0C1B3A]/40 font-bold">Payment Terms: </span><span className="text-[#0C1B3A]">{svcMeta.paymentTerms}</span></p>}
            </div>
          )}
          {svcMeta.notes && (
            <div className="border-t border-[#0C1B3A]/8 pt-4">
              <p className="text-[9px] font-bold uppercase text-[#0C1B3A]/35 mb-1">Notes</p>
              <p className="text-[10.5px] text-[#0C1B3A]/70 whitespace-pre-line">{svcMeta.notes}</p>
            </div>
          )}
        </div>
      </div>
    );

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <SvcBreadcrumb trail={svcMeta.quoteNo} />

        <div className="flex items-center gap-3">
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#C9A84C] bg-[#C9A84C]/10 px-3 py-1 rounded-full">Step 3 of 3</span>
          <h2 className="text-2xl font-serif italic text-[#0C1B3A]">{svcMeta.quoteNo}</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
          {/* ── Left: editable quote form ───────────────────────────────────── */}
          <div className="space-y-6">
            {/* Customer info */}
            <div className="bg-white rounded-[24px] border border-[#0C1B3A]/8 p-7 space-y-5">
              <h4 className="text-[12px] font-black uppercase tracking-widest text-[#0C1B3A]/50">客户信息 Customer Information</h4>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Customer Name 客户名称</label>
                  <input value={svcMeta.customerName} onChange={e => setSvcMeta(p => ({ ...p, customerName: e.target.value }))} className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[13px] font-bold outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Contact Person 联系人</label>
                  <input value={svcMeta.contactPerson} onChange={e => setSvcMeta(p => ({ ...p, contactPerson: e.target.value }))} className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Quote Date 日期</label>
                  <input type="date" value={svcMeta.quoteDate} onChange={e => setSvcMeta(p => ({ ...p, quoteDate: e.target.value }))} className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Currency 币种</label>
                  <select value={svcMeta.currency} onChange={e => setSvcMeta(p => ({ ...p, currency: e.target.value }))} className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[13px] font-bold outline-none focus:border-[#C9A84C]">
                    {['AED','USD','CNY'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Service items — card style */}
            <div className="bg-white rounded-[24px] border border-[#0C1B3A]/8 p-7 space-y-5">
              <div className="flex items-center justify-between">
                <h4 className="text-[12px] font-black uppercase tracking-widest text-[#0C1B3A]/50">服务项目 Service Items</h4>
                <button onClick={() => setSvcView('items')} className="text-[11px] font-black uppercase tracking-widest text-[#C9A84C] hover:text-[#0C1B3A] transition-colors flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Add More Services
                </button>
              </div>

              {svcItems.length === 0 ? (
                <div className="py-12 text-center text-[#0C1B3A]/30 text-[12px] border-2 border-dashed border-[#0C1B3A]/10 rounded-2xl">
                  No services added yet. 还没有添加服务项目。
                </div>
              ) : (
                <div className="space-y-4">
                  {svcItems.map(item => (
                    <div key={item.id} className="rounded-[20px] border border-[#0C1B3A]/8 p-5 space-y-3 bg-[#0C1B3A]/[0.015] hover:border-[#C9A84C]/40 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <input value={item.serviceName} onChange={e => svcUpdateItem(item.id, { serviceName: e.target.value })}
                            className="w-full text-[14px] font-black text-[#0C1B3A] bg-transparent outline-none" />
                          {item.categoryName && <p className="text-[9px] text-[#0C1B3A]/30 mt-0.5">{item.categoryName}</p>}
                        </div>
                        <button onClick={() => setSvcItems(prev => prev.filter(it => it.id !== item.id))} className="text-[#0C1B3A]/20 hover:text-red-400 transition-colors shrink-0 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea value={item.description} onChange={e => svcUpdateItem(item.id, { description: e.target.value })} rows={2} placeholder="Service description / 服务描述" className="w-full text-[11.5px] text-[#0C1B3A]/60 bg-white border border-[#0C1B3A]/8 rounded-xl px-3 py-2 outline-none focus:border-[#C9A84C] resize-none placeholder:text-[#0C1B3A]/25" />
                      <div className="grid grid-cols-5 gap-2.5 items-end">
                        <div className={item.billingType === 'custom' ? '' : 'col-span-2'}>
                          <label className="text-[8px] font-black uppercase tracking-widest text-[#0C1B3A]/30 block mb-1">计费方式 Billing</label>
                          <select value={item.billingType} onChange={e => svcUpdateItem(item.id, { billingType: e.target.value as ServiceBillingType })} className="w-full text-[10.5px] bg-white border border-[#0C1B3A]/10 rounded-lg px-2 py-2 outline-none focus:border-[#C9A84C]">
                            {Object.entries(BILLING_TYPE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                          </select>
                        </div>
                        {item.billingType === 'custom' && (
                          <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-[#0C1B3A]/30 block mb-1">Label</label>
                            <input value={item.billingLabel} onChange={e => svcUpdateItem(item.id, { billingLabel: e.target.value })} className="w-full text-[10.5px] bg-white border border-[#0C1B3A]/10 rounded-lg px-2 py-2 outline-none focus:border-[#C9A84C]" />
                          </div>
                        )}
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-[#0C1B3A]/30 block mb-1">单位 Unit</label>
                          <input value={item.unit} onChange={e => svcUpdateItem(item.id, { unit: e.target.value })} className="w-full text-[10.5px] text-center bg-white border border-[#0C1B3A]/10 rounded-lg px-2 py-2 outline-none focus:border-[#C9A84C]" />
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-[#0C1B3A]/30 block mb-1">数量 Qty</label>
                          <input type="number" min="0" value={item.quantity} onChange={e => svcUpdateItem(item.id, { quantity: Number(e.target.value) || 0 })} className="w-full text-[10.5px] font-mono text-center bg-white border border-[#0C1B3A]/10 rounded-lg px-2 py-2 outline-none focus:border-[#C9A84C]" />
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-[#0C1B3A]/30 block mb-1">单价 Unit Price</label>
                          <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => svcUpdateItem(item.id, { unitPrice: Number(e.target.value) || 0 })} className="w-full text-[10.5px] font-mono text-right bg-white border border-[#0C1B3A]/10 rounded-lg px-2 py-2 outline-none focus:border-[#C9A84C]" />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#0C1B3A]/6">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40">小计 Subtotal {item.totalOverridden && <span className="text-[#C9A84C]">✎ manual</span>}</label>
                        <input type="number" step="0.01" value={item.lineTotal} onChange={e => svcUpdateItem(item.id, { lineTotal: Number(e.target.value) || 0, totalOverridden: true })} className="w-32 text-[13px] font-mono font-black text-right bg-[#C9A84C]/8 border border-[#C9A84C]/30 rounded-lg px-3 py-1.5 outline-none focus:border-[#C9A84C]" />
                        <span className="text-[11px] font-bold text-[#0C1B3A]/40">{svcMeta.currency}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Duration / Payment / Notes */}
            <div className="bg-white rounded-[24px] border border-[#0C1B3A]/8 p-7 space-y-5">
              <h4 className="text-[12px] font-black uppercase tracking-widest text-[#0C1B3A]/50">条款 Terms</h4>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Project Duration 项目周期</label>
                  <input value={svcMeta.projectDuration} onChange={e => setSvcMeta(p => ({ ...p, projectDuration: e.target.value }))} placeholder="e.g. 3 months / 长期" className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-[#C9A84C] placeholder:text-[#0C1B3A]/20" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Payment Terms 付款方式</label>
                  <select value={svcMeta.paymentTerms} onChange={e => setSvcMeta(p => ({ ...p, paymentTerms: e.target.value }))} className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-[#C9A84C]">
                    {PAYMENT_TERM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Notes 备注</label>
                  <textarea value={svcMeta.notes} onChange={e => setSvcMeta(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-[#C9A84C] resize-none" />
                </div>
              </div>
            </div>

            {/* Total + Actions */}
            <div className="bg-white rounded-[24px] border border-[#0C1B3A]/8 p-7 space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase text-[#0C1B3A]/30 tracking-wider">总金额 Total</p>
                <p className="text-3xl font-black font-mono text-[#0C1B3A]">{svcMeta.currency} {svcGrandTotal().toFixed(2)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => handleSaveServiceQuote('Draft')} disabled={svcSaveStatus === 'saving'}
                  className="py-4 rounded-[18px] text-[12px] font-black uppercase tracking-widest border border-[#0C1B3A]/15 text-[#0C1B3A]/60 hover:border-[#C9A84C] hover:text-[#0C1B3A] transition-all">
                  {svcSaveStatus === 'saving' ? 'Saving...' : 'Save Draft 保存草稿'}
                </button>
                <button onClick={() => handleSaveServiceQuote('Final')} disabled={svcSaveStatus === 'saving'}
                  className="py-4 rounded-[18px] text-[12px] font-black uppercase tracking-widest shadow-lg"
                  style={{ backgroundColor: '#0C1B3A', color: '#C9A84C' }}>
                  {svcSaveStatus === 'saving' ? 'Saving...' : 'Save Final 保存正式报价'}
                </button>
              </div>
              {svcSaveStatus === 'saved' && (
                <div className="grid grid-cols-3 gap-3 animate-in fade-in duration-300">
                  <button onClick={generateServiceQuotePdf} className="py-3.5 rounded-[16px] text-[10.5px] font-black uppercase tracking-widest border border-[#0C1B3A]/15 text-[#0C1B3A]/60 hover:border-[#C9A84C] hover:text-[#0C1B3A] transition-all flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                  <button onClick={handleSendServiceQuoteToDeal} className="py-3.5 rounded-[16px] text-[10.5px] font-black uppercase tracking-widest border border-[#0C1B3A]/15 text-[#0C1B3A]/60 hover:border-[#C9A84C] hover:text-[#0C1B3A] transition-all">
                    Send to DEAL
                  </button>
                  <button onClick={handleSendServiceQuoteToTrade} className="py-3.5 rounded-[16px] text-[10.5px] font-black uppercase tracking-widest" style={{ backgroundColor: '#C9A84C', color: '#0C1B3A' }}>
                    Send to TRADE
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: live quote preview, sticky on desktop ────────────────── */}
          <div className="lg:sticky lg:top-6 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/35 px-1">报价预览 Quote Preview — what the customer will see</p>
            <QuotePreview />
          </div>
        </div>
      </div>
    );
  };

  const renderPackageQuote = () => {
    // ── Phase 2: GCI Package Quote Preview ───────────────────────────────
    if (pqPhase === 'preview' && pqProject) {
      const baseCur = pqProject.currency;
      const rate = pqExchangeRate;

      return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
          {/* SUPPLY CHAIN 分区页面标题 */}
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Space Grotesk',sans-serif", color: '#0C1B3A' }}>套餐报价</h1>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-widest flex-wrap">
            <button onClick={() => { setAppMode('landing'); setPqProject(null); setPqParseStatus('idle'); setPqPhase('upload'); }}
              className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">Workflow Home</button>
            <span className="text-[#0C1B3A]/20">›</span>
            <button onClick={() => setPqPhase('upload')} className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">Package Quote</button>
            <span className="text-[#0C1B3A]/20">›</span>
            <span className="text-[#0C1B3A]/50">{pqProject.projectName}</span>
            <span className="text-[#0C1B3A]/20">›</span>
            <span className="text-[#C9A84C]">GCI Package Quote</span>
          </div>

          {/* Quote Settings: internal pricing + customer info */}
          <div className="bg-[#0C1B3A]/3 rounded-[24px] p-6 space-y-6">
            <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-[#0C1B3A]/50">Quote Settings</h3>

            {/* Row 1: Project info + Currency + Exchange Rate (internal) */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Project</label>
                <input
                  type="text"
                  value={pqProjectName}
                  onChange={e => setPqProjectName(e.target.value)}
                  placeholder="Enter project name (English)"
                  className="w-full px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm font-bold text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors placeholder:text-[#0C1B3A]/20"
                />
                <p className="text-[11px] text-[#0C1B3A]/40 mt-1">{pqProject.supplierName}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Quote Currency</label>
                <div className="flex gap-2">
                  {(['AED','USD'] as const).map(c => (
                    <button key={c} onClick={() => {
                      setPqQuoteCurrency(c);
                      const r = baseCur === 'CNY' ? (c === 'AED' ? 0.505 : 0.1375)
                               : baseCur === 'USD' ? (c === 'AED' ? 3.6725 : 1)
                               : baseCur === 'EUR' ? (c === 'AED' ? 4.0 : 1.09)
                               : baseCur === 'GBP' ? (c === 'AED' ? 4.67 : 1.27)
                               : 1;
                      setPqExchangeRate(r);
                    }}
                      className={`px-4 py-2 rounded-xl text-[12px] font-black uppercase tracking-wider transition-all ${pqQuoteCurrency === c ? 'bg-[#0C1B3A] text-[#C9A84C]' : 'bg-white border border-[#0C1B3A]/10 text-[#0C1B3A]/50 hover:border-[#C9A84C]'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">
                  Exchange Rate&nbsp;<span className="normal-case font-medium text-[#0C1B3A]/30">1 {baseCur} =</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} step={0.0001} value={pqExchangeRate}
                    onChange={e => setPqExchangeRate(parseFloat(e.target.value) || 0)}
                    className="w-32 px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm font-mono font-bold text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors" />
                  <span className="text-sm font-bold text-[#0C1B3A]/50">{pqQuoteCurrency}</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Reference / Quote No</label>
                <input type="text" value={pqQuoteNo} onChange={e => setPqQuoteNo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm font-mono font-bold text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors" />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[#0C1B3A]/6" />

            {/* Row 2: Customer info */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C9A84C]/70 mb-3">Customer Information <span className="text-[#0C1B3A]/30 normal-case font-medium tracking-normal">(for PDF only — not shown in cost view)</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Customer Name</label>
                  <input type="text" value={pqCustomer} onChange={e => setPqCustomer(e.target.value)}
                    placeholder="e.g. Al Futtaim Group"
                    className="w-full px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm font-bold text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors placeholder:text-[#0C1B3A]/20" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Quote Date</label>
                  <input type="date" value={pqQuoteDate} onChange={e => setPqQuoteDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm font-bold text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Valid Until</label>
                  <input type="date" value={pqValidUntil} onChange={e => setPqValidUntil(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm font-bold text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Payment Terms</label>
                  <input type="text" value={pqPaymentTerms} onChange={e => setPqPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Delivery Terms</label>
                  <input type="text" value={pqDeliveryTerms} onChange={e => setPqDeliveryTerms(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors" />
                </div>
              </div>
            </div>
          </div>

          {/* Package cards */}
          <div className="space-y-4">
            {pqProject.packages.map(pkg => {
              const markup = pqMarkups[pkg.id] ?? 0;
              const convertedCost = pkg.totalCost * rate;
              const gciPrice = convertedCost * (1 + markup / 100);
              const isOpen = pqPreviewExpanded.has(pkg.id);
              const isSelected = pqSelectedPkgs.has(pkg.id);
              const toggle = () => setPqPreviewExpanded(prev => {
                const next = new Set(prev);
                isOpen ? next.delete(pkg.id) : next.add(pkg.id);
                return next;
              });
              const toggleSelect = () => setPqSelectedPkgs(prev => {
                const next = new Set(prev);
                isSelected ? next.delete(pkg.id) : next.add(pkg.id);
                return next;
              });

              return (
                <div key={pkg.id} className={`border rounded-[24px] overflow-hidden transition-opacity ${isSelected ? 'border-[#0C1B3A]/8' : 'border-[#0C1B3A]/4 opacity-40'}`}>
                  {/* Package summary row */}
                  <div className="px-6 py-4 bg-[#0C1B3A]/2 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Checkbox */}
                      <button onClick={toggleSelect}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-[#0C1B3A] border-[#0C1B3A]' : 'border-[#0C1B3A]/20 bg-white'}`}>
                        {isSelected && <svg className="w-3 h-3 text-[#C9A84C]" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                      <span className={`font-black truncate ${isSelected ? 'text-[#0C1B3A]' : 'text-[#0C1B3A]/50'}`}>{pqTranslate(pkg.packageName)}</span>
                      <span className="text-[11px] text-[#0C1B3A]/30 shrink-0">{pkg.items.length} items</span>
                    </div>
                    {/* Cost columns */}
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-[#0C1B3A]/30">Original</p>
                        <p className="text-[13px] font-mono font-bold text-[#0C1B3A]/60">{baseCur} {pkg.totalCost.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-[#0C1B3A]/30">Converted</p>
                        <p className="text-[13px] font-mono font-bold text-[#0C1B3A]">{pqQuoteCurrency} {convertedCost.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
                      </div>
                      {/* Markup input */}
                      <div className="flex items-center gap-1.5">
                        <p className="text-[9px] font-black uppercase tracking-wider text-[#0C1B3A]/30 w-12">Markup</p>
                        <input
                          type="number" min={0} max={999} step={1}
                          value={markup}
                          onChange={e => setPqMarkups(prev => ({ ...prev, [pkg.id]: parseFloat(e.target.value) || 0 }))}
                          className="w-16 px-2 py-1 rounded-lg border border-[#0C1B3A]/10 text-sm font-bold text-center text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors"
                        />
                        <span className="text-sm text-[#0C1B3A]/40">%</span>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-[#C9A84C]">GCI Price</p>
                        <p className="text-[15px] font-mono font-black text-[#0C1B3A]">{pqQuoteCurrency} {gciPrice.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
                      </div>
                      <button onClick={toggle} className="text-[#0C1B3A]/25 hover:text-[#C9A84C] transition-colors text-lg ml-2">
                        {isOpen ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>

                  {/* Item detail — EN editable fields + pricing */}
                  {isOpen && (
                    <div className="px-6 pb-5 pt-3 space-y-2">
                      {/* Column labels */}
                      <div className="grid grid-cols-[48px_1fr_1fr_1fr_80px_60px_90px] gap-2 px-3 py-1">
                        {['Photo','Item Name (EN)','Material (EN)','Size / Spec (EN)','Qty / Unit',`GCI ${pqQuoteCurrency}`,''].map(h => (
                          <p key={h} className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/30">{h}</p>
                        ))}
                      </div>
                      {pkg.items.map((it, i) => {
                        const en = pqItemsEN[it.id] ?? { nameEN: '', areaEN: '', materialEN: '', specEN: '' };
                        const itemGCI = it.unitCost * rate * (1 + markup / 100) * it.qty;
                        return (
                          <div key={it.id} className={`rounded-[14px] border border-[#0C1B3A]/6 ${i % 2 === 0 ? 'bg-white' : 'bg-[#0C1B3A]/2'}`}>
                            <div className="grid grid-cols-[48px_1fr_1fr_1fr_80px_60px_90px] gap-2 items-start p-3">
                              {/* Photo */}
                              <div className="pt-1">
                                {it.imageDataUrl
                                  ? <img src={it.imageDataUrl} alt={it.name} className="w-10 h-10 object-cover rounded-lg border border-[#0C1B3A]/10" />
                                  : <div className="w-10 h-10 rounded-lg bg-[#0C1B3A]/5 flex items-center justify-center text-[#0C1B3A]/20 text-[9px]">—</div>
                                }
                              </div>
                              {/* Item Name */}
                              <div className="space-y-1">
                                <p className="text-[9px] text-[#0C1B3A]/25 font-mono leading-tight">{it.seq} · {it.name}</p>
                                <p className="text-[9px] text-[#0C1B3A]/20 leading-tight">{it.area}</p>
                                <input
                                  value={en.nameEN}
                                  onChange={e => updateItemEN(it.id, 'nameEN', e.target.value)}
                                  placeholder="Item name in English"
                                  className="w-full text-[11px] font-bold text-[#0C1B3A] bg-transparent border-b border-[#0C1B3A]/10 focus:border-[#C9A84C] outline-none py-0.5 transition-colors placeholder:text-[#0C1B3A]/15"
                                />
                                <input
                                  value={en.areaEN}
                                  onChange={e => updateItemEN(it.id, 'areaEN', e.target.value)}
                                  placeholder="Area"
                                  className="w-full text-[10px] text-[#0C1B3A]/50 bg-transparent border-b border-[#0C1B3A]/6 focus:border-[#C9A84C] outline-none py-0.5 transition-colors placeholder:text-[#0C1B3A]/15"
                                />
                              </div>
                              {/* Material */}
                              <div className="space-y-1">
                                <p className="text-[9px] text-[#0C1B3A]/20 leading-tight line-clamp-2">{it.material}</p>
                                <textarea
                                  value={en.materialEN}
                                  onChange={e => updateItemEN(it.id, 'materialEN', e.target.value)}
                                  placeholder="Material in English"
                                  rows={2}
                                  className="w-full text-[11px] text-[#0C1B3A]/80 bg-transparent border border-[#0C1B3A]/10 focus:border-[#C9A84C] outline-none rounded-lg p-1.5 resize-none transition-colors placeholder:text-[#0C1B3A]/15"
                                />
                              </div>
                              {/* Spec */}
                              <div className="space-y-1">
                                <p className="text-[9px] text-[#0C1B3A]/20 leading-tight font-mono">{it.spec}</p>
                                <input
                                  value={en.specEN}
                                  onChange={e => updateItemEN(it.id, 'specEN', e.target.value)}
                                  placeholder="Size / spec"
                                  className="w-full text-[11px] font-mono text-[#0C1B3A]/70 bg-transparent border-b border-[#0C1B3A]/10 focus:border-[#C9A84C] outline-none py-0.5 transition-colors placeholder:text-[#0C1B3A]/15"
                                />
                              </div>
                              {/* Qty / Unit */}
                              <div className="text-center pt-4">
                                <p className="text-[13px] font-bold text-[#0C1B3A]">{it.qty}</p>
                                <p className="text-[10px] text-[#0C1B3A]/40">{pqTranslate(it.unit)}</p>
                              </div>
                              {/* GCI Price */}
                              <div className="text-right pt-4">
                                <p className="text-[12px] font-mono font-black text-[#0C1B3A]">
                                  {itemGCI.toLocaleString(undefined,{maximumFractionDigits:0})}
                                </p>
                              </div>
                              {/* Internal cost (small) */}
                              <div className="text-right pt-4">
                                <p className="text-[9px] font-mono text-[#0C1B3A]/25">{baseCur} {it.unitCost.toLocaleString()}</p>
                                <p className="text-[9px] text-[#0C1B3A]/20">× {it.qty}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Grand total */}
          {(() => {
            const selectedPkgs = pqProject.packages.filter(p => pqSelectedPkgs.has(p.id));
            const totalConverted = selectedPkgs.reduce((s, p) => s + p.totalCost * rate, 0);
            const totalGCI = selectedPkgs.reduce((s, p) => {
              const m = pqMarkups[p.id] ?? 0;
              return s + p.totalCost * rate * (1 + m / 100);
            }, 0);
            return (
              <div className="flex justify-end pt-2">
                <div className="bg-[#0C1B3A] text-white rounded-[24px] px-8 py-5 space-y-2 text-right min-w-[280px]">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Total Cost ({baseCur} → {pqQuoteCurrency})</p>
                  <p className="text-sm font-mono text-white/60">{pqQuoteCurrency} {totalConverted.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
                  <div className="border-t border-white/10 pt-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#C9A84C]">GCI Total Selling Price</p>
                    <p className="text-2xl font-black text-[#C9A84C]">{pqQuoteCurrency} {totalGCI.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
                  </div>
                  <p className="text-[10px] opacity-30">{selectedPkgs.length} / {pqProject.packages.length} packages selected · {selectedPkgs.reduce((s,p)=>s+p.items.length,0)} items</p>
                </div>
              </div>
            );
          })()}

          {/* Download Customer PDF */}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => {
                const selectedPkgs = pqProject.packages.filter(p => pqSelectedPkgs.has(p.id));
                const safeProjectName = pqProjectName && !hasChinese(pqProjectName) ? pqProjectName : (pqProjectName ? 'Package Project' : 'Package Project');
                generatePkgCustomerPdf({ ...pqProject, projectName: safeProjectName, packages: selectedPkgs }, pqMarkups, pqExchangeRate, pqQuoteCurrency, { customer: pqCustomer, quoteNo: pqQuoteNo, quoteDate: pqQuoteDate, validUntil: pqValidUntil, paymentTerms: pqPaymentTerms, deliveryTerms: pqDeliveryTerms });
              }}
              className="flex items-center gap-2 bg-[#0C1B3A] hover:bg-[#162a52] text-[#C9A84C] font-black text-[12px] uppercase tracking-widest px-6 py-3 rounded-2xl transition-all shadow-lg hover:shadow-xl active:scale-95"
            >
              <Download className="w-4 h-4" />
              Download Customer PDF
            </button>
          </div>
        </div>
      );
    }

    // ── Phase 1: Upload + Package Review ─────────────────────────────────
    return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
      {/* SUPPLY CHAIN 分区页面标题 */}
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Space Grotesk',sans-serif", color: '#0C1B3A' }}>套餐报价</h1>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-widest">
        <button onClick={() => { setAppMode('landing'); setPqProject(null); setPqParseStatus('idle'); setPqParseError(''); setPqPhase('upload'); }}
          className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">
          Workflow Home
        </button>
        <span className="text-[#0C1B3A]/20">›</span>
        <span className="text-[#C9A84C]">Package Quote</span>
        {pqProject && (
          <>
            <span className="text-[#0C1B3A]/20">›</span>
            <span className="text-[#0C1B3A]/50">{pqProject.projectName}</span>
          </>
        )}
      </div>

      {/* Project Info form — only shown before parse */}
      {pqParseStatus !== 'done' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-serif italic text-[#0C1B3A]">Package Quote</h2>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#C9A84C]">Project · Package · Items</p>
          </div>

          {/* Meta fields */}
          <div className="bg-[#0C1B3A]/3 rounded-[24px] p-6 space-y-4">
            <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-[#0C1B3A]/50">Project Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Project Name</label>
                <input value={pqMeta.projectName} onChange={e => setPqMeta(p => ({ ...p, projectName: e.target.value }))}
                  placeholder="e.g. Morocco Apartment"
                  className="w-full px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm font-medium text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Supplier Name</label>
                <input value={pqMeta.supplierName} onChange={e => setPqMeta(p => ({ ...p, supplierName: e.target.value }))}
                  placeholder="e.g. COOL HOME"
                  className="w-full px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm font-medium text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Base Currency</label>
                <select value={pqMeta.currency} onChange={e => setPqMeta(p => ({ ...p, currency: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#0C1B3A]/10 text-sm font-medium text-[#0C1B3A] bg-white outline-none focus:border-[#C9A84C] transition-colors">
                  {['CNY','AED','USD','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Upload area */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-[#0C1B3A]/50">Upload Multi-Sheet Excel</h3>
            {(() => {
              const pqFileInputRef = { current: null as HTMLInputElement | null };
              const handlePqDrop = (e: React.DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                parsePackageExcel(file);
              };
              return (
                <div
                  onClick={() => pqFileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={handlePqDrop}
                  className="border-2 border-dashed border-[#C9A84C]/30 rounded-[24px] p-10 text-center hover:border-[#C9A84C] hover:bg-[#C9A84C]/3 transition-all cursor-pointer select-none"
                >
                  <input
                    ref={el => { pqFileInputRef.current = el; }}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = '';
                      parsePackageExcel(file);
                    }}
                  />
                  <div className="space-y-2 pointer-events-none">
                    <div className="w-10 h-10 rounded-2xl bg-[#C9A84C]/10 flex items-center justify-center mx-auto">
                      <Upload className="w-5 h-5 text-[#C9A84C]" />
                    </div>
                    <p className="text-sm font-bold text-[#0C1B3A]/60">Drag & drop or click to select</p>
                    <p className="text-[11px] text-[#0C1B3A]/30">Excel with multiple sheets. Each sheet = one Package.</p>
                    <p className="text-[10px] text-[#0C1B3A]/25">Sheets named 总表 / Summary / Total will be skipped automatically.</p>
                  </div>
                </div>
              );
            })()}
            {pqParseStatus === 'parsing' && (
              <p className="text-center text-[12px] font-bold text-[#C9A84C] animate-pulse">Parsing Excel...</p>
            )}
            {pqParseStatus === 'error' && (
              <p className="text-center text-[12px] font-bold text-red-500">❌ {pqParseError}</p>
            )}
          </div>
        </div>
      )}

      {/* Package results */}
      {pqParseStatus === 'done' && pqProject && (
        <div className="space-y-6">
          {/* Project header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-[#0C1B3A]">{pqProject.projectName}</h2>
              <p className="text-[11px] text-[#0C1B3A]/40 font-bold mt-0.5">
                {pqProject.supplierName && `${pqProject.supplierName} · `}
                {pqProject.packages.length} packages · {pqProject.sourceFileName}
              </p>
            </div>
            <button onClick={() => { setPqProject(null); setPqParseStatus('idle'); setPqParseError(''); }}
              className="text-[11px] font-black uppercase tracking-widest text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">
              ↑ Upload New File
            </button>
          </div>

          {/* Package cards */}
          {pqProject.packages.map(pkg => {
            const isOpen = pqExpanded.has(pkg.id);
            const toggle = () => setPqExpanded(prev => {
              const next = new Set(prev);
              isOpen ? next.delete(pkg.id) : next.add(pkg.id);
              return next;
            });
            // Group items by area
            const areas = Array.from(new Set(pkg.items.map(it => it.area).filter(Boolean)));
            const itemsByArea = areas.length > 0
              ? areas.map(area => ({ area, items: pkg.items.filter(it => it.area === area) }))
              : [{ area: '', items: pkg.items }];

            return (
              <div key={pkg.id} className="border border-[#0C1B3A]/8 rounded-[24px] overflow-hidden">
                {/* Package header */}
                <button onClick={toggle}
                  className="w-full flex items-center justify-between px-6 py-4 bg-[#0C1B3A]/2 hover:bg-[#0C1B3A]/4 transition-colors text-left">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#C9A84C]" />
                    <div>
                      <span className="text-base font-black text-[#0C1B3A]">{pkg.packageName}</span>
                      <span className="ml-3 text-[11px] text-[#0C1B3A]/40 font-bold">{pkg.items.length} items</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-base font-black text-[#0C1B3A]">
                      {pkg.currency} {pkg.totalCost.toLocaleString()}
                    </span>
                    <span className="text-[#0C1B3A]/30 text-lg">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Items table */}
                {isOpen && (
                  <div className="px-6 pb-6 pt-2 space-y-4">
                    {itemsByArea.map(({ area, items: areaItems }) => (
                      <div key={area || 'default'}>
                        {area && (
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C9A84C] mb-2 mt-3">{area}</p>
                        )}
                        <div className="overflow-x-auto rounded-[16px] border border-[#0C1B3A]/6">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="bg-[#0C1B3A] text-white">
                                {['#','Photo','Name','Material / Spec','Qty','Unit','Unit Cost','Subtotal'].map(h => (
                                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider first:rounded-tl-[16px] last:rounded-tr-[16px]">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {areaItems.map((it, i) => (
                                <tr key={it.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#0C1B3A]/2'}>
                                  <td className="px-3 py-2 text-[#0C1B3A]/40 font-mono">{it.seq}</td>
                                  <td className="px-3 py-2">
                                    {it.imageDataUrl
                                      ? <img src={it.imageDataUrl} alt={it.name} className="w-12 h-12 object-cover rounded-lg border border-[#0C1B3A]/10" />
                                      : <div className="w-12 h-12 rounded-lg bg-[#0C1B3A]/5 flex items-center justify-center text-[#0C1B3A]/20 text-[10px]">—</div>
                                    }
                                  </td>
                                  <td className="px-3 py-2 font-bold text-[#0C1B3A]">{it.name}</td>
                                  <td className="px-3 py-2 text-[#0C1B3A]/55 max-w-[200px]">
                                    <div>{it.material}</div>
                                    {it.spec && <div className="text-[10px] text-[#0C1B3A]/30 mt-0.5">{it.spec}</div>}
                                  </td>
                                  <td className="px-3 py-2 text-right text-[#0C1B3A]">{it.qty}</td>
                                  <td className="px-3 py-2 text-[#0C1B3A]/50">{it.unit}</td>
                                  <td className="px-3 py-2 text-right font-mono text-[#0C1B3A]">{it.unitCost.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-[#0C1B3A]">{it.subtotal.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-[#0C1B3A]/5 border-t border-[#0C1B3A]/8">
                                <td colSpan={7} className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#0C1B3A]/40 text-right">Area Total</td>
                                <td className="px-3 py-2 text-right font-mono font-black text-[#0C1B3A]">
                                  {areaItems.reduce((s, it) => s + it.subtotal, 0).toLocaleString()}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    ))}
                    {/* Package total */}
                    <div className="flex justify-end">
                      <div className="bg-[#0C1B3A] text-white rounded-[16px] px-6 py-3 flex items-center gap-4">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Package Total</span>
                        <span className="text-lg font-black">{pkg.currency} {pkg.totalCost.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Grand summary */}
          <div className="flex justify-end pt-2">
            <div className="border border-[#C9A84C]/30 rounded-[20px] px-8 py-4 space-y-1 text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40">All Packages Combined</p>
              <p className="text-2xl font-black text-[#0C1B3A]">
                {pqProject.currency} {pqProject.packages.reduce((s, p) => s + p.totalCost, 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-[#0C1B3A]/30">{pqProject.packages.length} packages · {pqProject.packages.reduce((s, p) => s + p.items.length, 0)} items total</p>
            </div>
          </div>

          {/* Generate GCI Package Quote */}
          <div className="text-center pt-4">
            <button
              onClick={() => {
                // Set default exchange rate based on base currency
                const base = pqProject?.currency || 'CNY';
                const defaultRate = base === 'CNY' ? 0.505 : base === 'USD' ? 3.6725 : base === 'EUR' ? 4.0 : base === 'GBP' ? 4.67 : 1;
                setPqExchangeRate(defaultRate);
                // Init markups to 0 for each package
                const initMarkups: Record<string, number> = {};
                pqProject?.packages.forEach(p => { initMarkups[p.id] = 0; });
                setPqMarkups(initMarkups);
                setPqPreviewExpanded(new Set());
                // Default: all packages selected
                setPqSelectedPkgs(new Set(pqProject?.packages.map(p => p.id) ?? []));
                setPqProjectName(pqProject?.projectName ?? '');
                // Auto-populate EN fields as initial suggestions (user can override)
                const initEN: Record<string, PqItemEN> = {};
                pqProject?.packages.forEach(pkg => {
                  pkg.items.forEach(it => {
                    initEN[it.id] = {
                      nameEN: pqTranslate(it.name),
                      areaEN: pqTranslate(it.area),
                      materialEN: materialToEn(it.material),
                      specEN: cleanSpec(it.spec),
                    };
                  });
                });
                setPqItemsEN(initEN);
                setPqPhase('preview');
              }}
              className="px-10 py-4 rounded-[20px] bg-[#0C1B3A] text-white text-[13px] font-black uppercase tracking-widest hover:bg-[#C9A84C] transition-colors shadow-lg"
            >
              Generate GCI Package Quote →
            </button>
          </div>
        </div>
      )}
    </div>
    );
  };

  // ── Supplier Quote Upload flow ───────────────────────────────────────────
  const renderSupplierQuoteUpload = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
      {/* SUPPLY CHAIN 分区页面标题 */}
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Space Grotesk',sans-serif", color: '#0C1B3A' }}>供应商报价</h1>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-widest flex-wrap">
        <button onClick={() => { setAppMode('landing'); setDraftItems([]); setTradeTerms(''); }} className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">
          Home
        </button>
        <span className="text-[#0C1B3A]/15">›</span>
        <span className="text-[#C9A84C]">Save Supplier Quote</span>
      </div>

      {/* Supplier Metadata Form */}
      <div className="bg-white rounded-[28px] border border-[#0C1B3A]/8 p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0C1B3A' }}>
            <Archive className="w-4 h-4 text-[#C9A84C]" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#0C1B3A]">Supplier Information</h3>
            <p className="text-[11px] text-[#0C1B3A]/40">供应商信息 · 可选填，保存后可在 Archive 编辑</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { key: 'supplierName', label: 'Supplier Name 供应商名称', placeholder: 'e.g. ABC Trading Co.' },
            { key: 'supplierContact', label: 'Contact 联系人', placeholder: 'Name / WhatsApp / Email' },
            { key: 'category', label: 'Category 品类', placeholder: 'Furniture / Tissue / Building...' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">{f.label}</label>
              <input
                type="text"
                value={(supplierMeta as any)[f.key]}
                placeholder={f.placeholder}
                onChange={e => setSupplierMeta(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[14px] font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>
          ))}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Currency 币种</label>
            <select
              value={supplierMeta.currency}
              onChange={e => setSupplierMeta(prev => ({ ...prev, currency: e.target.value }))}
              className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[14px] font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C] transition-colors"
            >
              {['AED','USD','CNY','EUR','GBP'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Quote Date 报价日期</label>
            <input
              type="date"
              value={supplierMeta.quoteDate}
              onChange={e => setSupplierMeta(prev => ({ ...prev, quoteDate: e.target.value }))}
              className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[14px] font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C] transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Valid Until 有效期</label>
            <input
              type="date"
              value={supplierMeta.validUntil}
              onChange={e => setSupplierMeta(prev => ({ ...prev, validUntil: e.target.value }))}
              className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[14px] font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* GCI Quote Info */}
      <div className="bg-white rounded-[28px] border border-[#0C1B3A]/8 p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0C1B3A' }}>
            <FileText className="w-4 h-4 text-[#C9A84C]" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#0C1B3A]">GCI Quote Info</h3>
            <p className="text-[11px] text-[#0C1B3A]/40">客户信息 · Convert to GCI Quote 后自动带入</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            { key: 'customerProjectName', label: 'Customer / Project', placeholder: 'e.g. Al Nahyan Villa FF&E' },
            { key: 'salesperson', label: 'Salesperson', placeholder: 'e.g. Chris' },
            { key: 'phoneWhatsApp', label: 'Phone / WA', placeholder: '+971 50 000 0000' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">{f.label}</label>
              <input
                type="text"
                value={(quoteInfo as any)[f.key] || ''}
                placeholder={f.placeholder}
                onChange={e => setQuoteInfo(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-4 py-2.5 text-[14px] font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Upload + AI Parse section (reuse renderPackageWorkspace upload zone via shared state) */}
      <div className="bg-white rounded-[28px] border border-[#0C1B3A]/8 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-[#0C1B3A]/6 flex items-center gap-3">
          <Cpu className="w-5 h-5 text-[#C9A84C]" />
          <div>
            <h3 className="text-[13px] font-black uppercase tracking-widest text-[#0C1B3A]">Supplier Quote Import</h3>
            <p className="text-[11px] text-[#0C1B3A]/40 mt-0.5">Upload PDF/Excel/Image or paste text — AI extracts cost items</p>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Text paste */}
            <div className="space-y-3">
              <label className="text-[11px] font-black uppercase tracking-widest text-[#0C1B3A]/40 flex items-center gap-2">
                <Clipboard className="w-3.5 h-3.5" /> Paste supplier quote text
              </label>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="Paste supplier quote content here..."
                className="w-full h-44 p-5 bg-[#0C1B3A]/3 border border-[#0C1B3A]/8 rounded-[20px] text-[13px] text-[#0C1B3A] placeholder:text-[#0C1B3A]/25 resize-none outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>
            {/* File upload */}
            <div className="space-y-3">
              <label className="text-[11px] font-black uppercase tracking-widest text-[#0C1B3A]/40 flex items-center gap-2">
                <Upload className="w-3.5 h-3.5" /> Upload file
              </label>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); handleFileUpload({ target: { files: e.dataTransfer.files } } as any); }}
                onClick={() => !isProcessingAI && document.getElementById('sq-file-upload')?.click()}
                style={{ cursor: isProcessingAI ? 'not-allowed' : 'pointer' }}
                className={`h-40 rounded-[20px] border-4 border-dashed flex flex-col items-center justify-center transition-all select-none
                  ${sqSelectedFile ? 'border-[#C9A84C] bg-[#C9A84C]/5' : isDragging ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-[#0C1B3A]/10 hover:border-[#C9A84C]/40'}`}
              >
                <input
                  id="sq-file-upload"
                  type="file"
                  style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                  accept=".xlsx,.csv,.pdf,.docx,image/*"
                  onChange={handleFileUpload}
                />
                {sqSelectedFile ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-[#C9A84C]" />
                    <p className="text-[13px] font-black text-[#0C1B3A] mt-2 px-4 text-center truncate max-w-full">{sqSelectedFile.name}</p>
                    <p className="text-[11px] text-[#0C1B3A]/40 mt-1">{(sqSelectedFile.size / 1024).toFixed(1)} KB · Click to replace</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-[#0C1B3A]/20" />
                    <p className="text-[12px] font-bold text-[#0C1B3A]/40 mt-3">Drag & drop or click to select</p>
                    <p className="text-[11px] text-[#0C1B3A]/25 mt-1">Excel, CSV, PDF, DOCX, PNG, JPG</p>
                  </>
                )}
              </div>

              {/* Parse error display */}
              {sqParseStatus === 'error' && sqParseError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-[16px]">
                  <p className="text-[11px] font-black text-red-600 uppercase tracking-widest mb-1">❌ Parse Failed</p>
                  <p className="text-[12px] text-red-700">{sqParseError}</p>
                  <p className="text-[11px] text-red-500 mt-2">
                    In China: Google AI may be blocked. Try VPN, or use text paste, or add items manually below.
                  </p>
                </div>
              )}

              {/* Parse with AI button (explicit, not auto-triggered) */}
              {sqSelectedFile && (
                <button
                  onClick={() => {
                    if (!sqSelectedFile || isProcessingAI) return;
                    setSqParseStatus('parsing');
                    setSqParseError('');
                    const isPDF = sqSelectedFile.type === 'application/pdf' || sqSelectedFile.name.toLowerCase().endsWith('.pdf');
                    const isImage = sqSelectedFile.type.startsWith('image/');
                    const isDocx = sqSelectedFile.name.toLowerCase().endsWith('.docx');
                    if (isPDF) parsePDF(sqSelectedFile);
                    else if (isImage) analyzeImage(sqSelectedFile);
                    else if (isDocx) parseDocx(sqSelectedFile);
                    else parseExcel(sqSelectedFile);
                  }}
                  disabled={isProcessingAI}
                  className="w-full py-3.5 rounded-[16px] text-[13px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                  style={isProcessingAI
                    ? { backgroundColor: '#0C1B3A20', color: '#0C1B3A40', cursor: 'not-allowed' }
                    : { backgroundColor: '#0C1B3A', color: '#C9A84C' }
                  }
                >
                  {isProcessingAI
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Parsing… (up to 25s)</>
                    : <><Cpu className="w-4 h-4" /> Parse with AI</>
                  }
                </button>
              )}
            </div>
          </div>

          {/* Text analyze button */}
          {importText.trim() && (
          <button
            onClick={handleAnalyze}
            disabled={isProcessingAI}
            className="w-full py-4 rounded-[20px] text-[13px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all"
            style={!isProcessingAI
              ? { backgroundColor: '#0C1B3A', color: '#C9A84C' }
              : { backgroundColor: '#0C1B3A10', color: '#0C1B3A30', cursor: 'not-allowed' }
            }
          >
            <Cpu className="w-4 h-4" />
            {isProcessingAI ? 'Analyzing… (up to 25s, may be slow in China)' : 'Analyze Text with AI'}
          </button>
          )}
        </div>
      </div>

      {/* Manual fallback: add items without AI */}
      {draftItems.length === 0 && (sqParseStatus === 'error' || sqParseStatus === 'idle') && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setDraftItems([{ id: `sq-manual-${Date.now()}`, originalName: 'Item 1', originalSpec: '', quantity: 1, unit: 'pcs', targetUnitPrice: 0, targetTotal: 0, confidence: 1, status: 'Confirmed' as const, suggestedCategory: FurnitureCategory.OTHER, sourceType: 'manual' }])}
            className="flex items-center gap-2 px-6 py-3 rounded-[16px] border-2 border-dashed border-[#0C1B3A]/15 text-[#0C1B3A]/50 text-[12px] font-black uppercase tracking-widest hover:border-[#C9A84C] hover:text-[#0C1B3A] transition-all"
          >
            <Plus className="w-4 h-4" /> Add Items Manually (no AI needed)
          </button>
        </div>
      )}

      {/* Supplier Cost Items (parsed result) */}
      {draftItems.length > 0 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-1 rounded-full">AI Parsed</span>
              </div>
              <h3 className="text-xl font-black text-[#0C1B3A]">Supplier Cost Items</h3>
              <p className="text-[11px] text-[#0C1B3A]/50 mt-0.5">Review and correct before saving · {draftItems.length} items</p>
            </div>
          </div>
          {/* Currency / Exchange Rate / Margin controls — live preview, applies to every row below */}
          <div className="bg-[#0C1B3A]/3 border border-[#0C1B3A]/8 rounded-[20px] px-6 py-4 flex flex-wrap items-end gap-5">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Supplier Currency</label>
              <select value={supplierMeta.currency} onChange={e => setSupplierMeta(prev => ({ ...prev, currency: e.target.value }))}
                className="bg-white border border-[#0C1B3A]/10 rounded-lg px-3 py-2 text-[13px] font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C]">
                {['CNY','USD','AED'].map(c => <option key={c} value={c}>{c === 'CNY' ? 'RMB (CNY)' : c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Exchange Rate →</label>
              <input type="number" step="0.0001" min="0" value={sqExchangeRate}
                onChange={e => setSqExchangeRate(Number(e.target.value) || 0)}
                className="w-28 bg-white border border-[#0C1B3A]/10 rounded-lg px-3 py-2 text-[13px] font-mono font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Customer Currency</label>
              <select value={sqCustomerCurrency} onChange={e => setSqCustomerCurrency(e.target.value as 'AED' | 'USD')}
                className="bg-white border border-[#0C1B3A]/10 rounded-lg px-3 py-2 text-[13px] font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C]">
                {['AED','USD'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1.5">Default Margin %</label>
              <input type="number" step="1" min="0" value={sqGlobalMargin}
                onChange={e => setSqGlobalMargin(Number(e.target.value) || 0)}
                className="w-24 bg-white border border-[#0C1B3A]/10 rounded-lg px-3 py-2 text-[13px] font-mono font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C]" />
            </div>
            <p className="text-[10px] text-[#0C1B3A]/35 leading-snug max-w-[220px]">Converted = Supplier Cost × Rate. Customer Price = Converted × (1 + Margin%). Margin can be overridden per item below.</p>
          </div>

          {/* Editable table — rich detail + EN translation + currency conversion */}
          <div className="bg-white rounded-[24px] border border-[#0C1B3A]/8 overflow-hidden shadow-sm">
            <div className="grid grid-cols-12 gap-3 px-6 py-3 bg-[#0C1B3A] text-white text-[10px] font-black uppercase tracking-wider">
              <div className="col-span-1 text-center">GCI</div>
              <div className="col-span-3">Item</div>
              <div className="col-span-2">Spec</div>
              <div className="col-span-1 text-center">Qty</div>
              <div className="col-span-1 text-center">Unit</div>
              <div className="col-span-2 text-right">Supplier Cost</div>
              <div className="col-span-2 text-right">Customer Total</div>
            </div>
            <div className="divide-y divide-[#0C1B3A]/6">
              {draftItems.map((item, idx) => {
                const included = item.includeInGCI !== false;
                const marginPct = item.marginPercent ?? sqGlobalMargin;
                const convertedUnitCost = item.targetUnitPrice * sqExchangeRate;
                const customerUnitPrice = convertedUnitCost * (1 + marginPct / 100);
                const customerLineTotal = customerUnitPrice * item.quantity;
                const update = (patch: Partial<DraftItem>) =>
                  setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
                return (
                <div key={item.id} className={`px-6 py-4 group transition-opacity space-y-3 ${included ? '' : 'opacity-40'}`}>
                  {/* Row 1: core fields */}
                  <div className="grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-1 flex flex-col items-center gap-1.5">
                      <input type="checkbox" checked={included}
                        onChange={e => update({ includeInGCI: e.target.checked })}
                        className="w-4 h-4 accent-[#C9A84C] cursor-pointer" />
                      {item.imageDataUrl
                        ? <img src={item.imageDataUrl} alt="" className="w-9 h-9 object-cover rounded-md border border-[#0C1B3A]/10" />
                        : <div className="w-9 h-9 rounded-md bg-[#0C1B3A]/4 flex items-center justify-center text-[#0C1B3A]/15 text-[8px]">—</div>
                      }
                    </div>
                    <div className="col-span-3">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {item.sourceType === 'excel-image-ocr' && (
                          <span className="text-[7px] font-black uppercase tracking-wider text-[#C9A84C] bg-[#C9A84C]/10 px-1.5 py-0.5 rounded">Image OCR</span>
                        )}
                        {item.dataConfidence === 'low' && (
                          <span className="text-[7px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Low confidence — verify</span>
                        )}
                      </div>
                      <input value={item.originalName}
                        onChange={e => update({ originalName: e.target.value })}
                        placeholder="Original Description"
                        className="w-full text-[14px] font-bold text-[#0C1B3A] bg-transparent border-b-2 border-[#0C1B3A]/10 focus:border-[#C9A84C] outline-none pb-1 transition-colors" />
                    </div>
                    <div className="col-span-2">
                      <input value={item.originalSpec || ''} placeholder="Spec / size"
                        onChange={e => update({ originalSpec: e.target.value })}
                        className="w-full text-[13px] text-[#0C1B3A]/55 bg-transparent border-b border-[#0C1B3A]/8 focus:border-[#C9A84C] outline-none pb-1 transition-colors placeholder:text-[#0C1B3A]/20" />
                    </div>
                    <div className="col-span-1">
                      <input type="number" min="0" value={item.quantity}
                        onChange={e => update({ quantity: Number(e.target.value) || 1, targetTotal: (Number(e.target.value) || 1) * item.targetUnitPrice })}
                        className="w-full text-[14px] font-mono font-bold text-[#0C1B3A] text-center bg-transparent border-b-2 border-[#0C1B3A]/10 focus:border-[#C9A84C] outline-none pb-1" />
                    </div>
                    <div className="col-span-1">
                      <input value={item.unit}
                        onChange={e => update({ unit: e.target.value })}
                        className="w-full text-[13px] text-[#0C1B3A]/60 text-center bg-transparent border-b border-[#0C1B3A]/8 focus:border-[#C9A84C] outline-none pb-1" />
                    </div>
                    <div className="col-span-2 text-right">
                      <input type="number" min="0" step="0.01" value={item.targetUnitPrice ? Number(item.targetUnitPrice.toFixed(2)) : ''} placeholder="0.00"
                        onChange={e => update({ targetUnitPrice: Number(e.target.value) || 0, targetTotal: (Number(e.target.value) || 0) * item.quantity })}
                        className="w-full text-right text-[14px] font-mono font-black text-[#0C1B3A] bg-transparent border-b-2 border-[#0C1B3A]/10 focus:border-[#C9A84C] outline-none pb-1" />
                      <p className="text-[9px] text-[#0C1B3A]/30 text-right mt-0.5">{supplierMeta.currency}/{item.unit}</p>
                    </div>
                    <div className="col-span-2 text-right flex items-start justify-end gap-2">
                      <div>
                        <p className="text-[14px] font-black font-mono text-[#0C1B3A]">{sqCustomerCurrency} {customerLineTotal.toFixed(2)}</p>
                        <p className="text-[9px] text-[#0C1B3A]/30">@ {customerUnitPrice.toFixed(2)} / {item.unit}</p>
                      </div>
                      <button onClick={() => setDraftItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-[#0C1B3A]/15 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Row 2: English Description (editable, used on customer quote) */}
                  <div className="pl-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[#C9A84C] block mb-1">English Description</label>
                    <textarea value={item.englishDescription || ''} rows={2} placeholder="Professional English description for customer quote"
                      onChange={e => update({ englishDescription: e.target.value })}
                      className="w-full text-[12.5px] text-[#0C1B3A]/85 bg-[#0C1B3A]/3 border border-[#0C1B3A]/8 rounded-lg p-2 resize-none outline-none focus:border-[#C9A84C] transition-colors" />
                  </div>

                  {/* Row 3: extra supplier detail fields */}
                  <div className="grid grid-cols-7 gap-2 pl-1">
                    {([
                      ['model','Model'],['material','Material'],['color','Color'],['sizeDimension','Size / Dimension'],
                      ['moq','MOQ'],['packaging','Packaging'],['deliveryTime','Delivery'],
                    ] as [keyof DraftItem, string][]).map(([key, label]) => (
                      <div key={key}>
                        <label className="text-[8px] font-black uppercase tracking-widest text-[#0C1B3A]/30 block mb-1">{label}</label>
                        <input value={(item[key] as string) || ''} placeholder="—"
                          onChange={e => update({ [key]: e.target.value } as Partial<DraftItem>)}
                          className="w-full text-[11px] text-[#0C1B3A]/70 bg-transparent border-b border-[#0C1B3A]/8 focus:border-[#C9A84C] outline-none pb-0.5 placeholder:text-[#0C1B3A]/15" />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pl-1">
                    <div>
                      <label className="text-[8px] font-black uppercase tracking-widest text-[#0C1B3A]/30 block mb-1">Payment Terms</label>
                      <input value={item.paymentTerms || ''} placeholder="—"
                        onChange={e => update({ paymentTerms: e.target.value })}
                        className="w-full text-[11px] text-[#0C1B3A]/70 bg-transparent border-b border-[#0C1B3A]/8 focus:border-[#C9A84C] outline-none pb-0.5 placeholder:text-[#0C1B3A]/15" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[8px] font-black uppercase tracking-widest text-[#0C1B3A]/30 block mb-1">Remarks</label>
                      <input value={item.remarks || ''} placeholder="—"
                        onChange={e => update({ remarks: e.target.value })}
                        className="w-full text-[11px] text-[#0C1B3A]/70 bg-transparent border-b border-[#0C1B3A]/8 focus:border-[#C9A84C] outline-none pb-0.5 placeholder:text-[#0C1B3A]/15" />
                    </div>
                    <div>
                      <label className="text-[8px] font-black uppercase tracking-widest text-[#0C1B3A]/30 block mb-1">Margin % (override)</label>
                      <input type="number" step="1" value={item.marginPercent ?? ''} placeholder={`${sqGlobalMargin} (default)`}
                        onChange={e => update({ marginPercent: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className="w-full text-[11px] font-mono text-[#0C1B3A]/70 bg-transparent border-b border-[#0C1B3A]/8 focus:border-[#C9A84C] outline-none pb-0.5 placeholder:text-[#0C1B3A]/20" />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="px-6 py-4 bg-[#0C1B3A]/3 border-t border-[#0C1B3A]/8 flex items-center justify-between">
              <button onClick={() => setDraftItems(prev => [...prev, { id: `sq-new-${Date.now()}`, originalName: 'New Item', originalSpec: '', quantity: 1, unit: 'pcs', targetUnitPrice: 0, targetTotal: 0, confidence: 1, status: 'Confirmed' as const, suggestedCategory: FurnitureCategory.OTHER, sourceType: 'manual' }])}
                className="text-[12px] font-black uppercase tracking-widest text-[#C9A84C] hover:text-[#0C1B3A] transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Item
              </button>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase text-[#0C1B3A]/30 tracking-wider">Supplier Total / Customer Total</p>
                <p className="text-[13px] font-mono text-[#0C1B3A]/50">
                  {supplierMeta.currency} {draftItems.reduce((s, it) => s + it.targetUnitPrice * it.quantity, 0).toFixed(2)}
                </p>
                <p className="text-2xl font-black font-mono text-[#0C1B3A]">
                  {sqCustomerCurrency} {draftItems.reduce((s, it) => {
                    const margin = it.marginPercent ?? sqGlobalMargin;
                    return s + it.targetUnitPrice * sqExchangeRate * (1 + margin / 100) * it.quantity;
                  }, 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Terms */}
          {tradeTerms && (
            <div className="bg-[#0C1B3A]/3 border border-[#0C1B3A]/8 rounded-[16px] px-6 py-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#0C1B3A]/40 mb-2">Terms &amp; Notes (from AI)</p>
              <p className="text-[13px] text-[#0C1B3A]/70 whitespace-pre-line">{tradeTerms}</p>
            </div>
          )}

          {/* Save / Post-save action buttons */}
          {sqSaveStatus !== 'saved' ? (
            /* Before save: show Save button */
            <div className="flex justify-end">
              <button
                onClick={handleSaveSupplierQuote}
                disabled={draftItems.length === 0 || sqSaveStatus === 'saving'}
                className="px-12 py-5 rounded-[24px] font-black uppercase tracking-widest text-[13px] transition-all active:scale-95 flex items-center gap-3 shadow-xl disabled:opacity-40"
                style={{ backgroundColor: '#0C1B3A', color: '#C9A84C' }}
              >
                <Archive className="w-5 h-5" />
                {sqSaveStatus === 'saving' ? 'Saving...' : 'Save Supplier Quote'}
              </button>
            </div>
          ) : (
            /* After save: show Convert + View Archive buttons */
            <div className="space-y-3 animate-in fade-in duration-500">
              {/* Success message */}
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-[16px]">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-[13px] font-black text-green-800">Supplier Quote Saved</p>
                  <p className="text-[11px] text-green-600">What would you like to do next?</p>
                </div>
              </div>

              {/* Include Fields — field-level control over what reaches the customer view */}
              {(() => {
                const included = draftItems.filter(it => it.includeInGCI !== false);
                const OPTIONAL_FIELDS: [keyof typeof sqIncludeFields, string][] = [
                  ['deliveryTime', 'Delivery Time'], ['packaging', 'Packaging'], ['remarks', 'Remarks'],
                  ['moq', 'MOQ'], ['paymentTerms', 'Payment Terms'],
                ];
                return (
                  <div className="bg-white border border-[#0C1B3A]/8 rounded-[20px] p-6 space-y-4">
                    <div>
                      <h4 className="text-[13px] font-black text-[#0C1B3A]">Include Fields — what the customer sees</h4>
                      <p className="text-[11px] text-[#0C1B3A]/45 mt-0.5">Supplier Cost Items is your internal view. Choose what carries over into the GCI Quote.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-[11px]">
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                        <p className="font-black uppercase tracking-wider text-green-700 text-[9px] mb-1.5">Always shown to customer</p>
                        <p className="text-green-800/80 leading-relaxed">English Description, Specification, Size/Dimension, Material, Color, Unit, Qty, Customer Unit Price, Customer Line Total</p>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                        <p className="font-black uppercase tracking-wider text-red-700 text-[9px] mb-1.5">Never shown to customer</p>
                        <p className="text-red-800/80 leading-relaxed">Supplier Name/Contact, Supplier Unit Cost, Supplier Currency, Exchange Rate, Margin %, Internal Notes</p>
                      </div>
                    </div>
                    <div>
                      <p className="font-black uppercase tracking-wider text-[#0C1B3A]/40 text-[9px] mb-2">Optional — include if checked</p>
                      <div className="flex flex-wrap gap-4">
                        {OPTIONAL_FIELDS.map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2 text-[12px] font-bold text-[#0C1B3A]/70 cursor-pointer">
                            <input type="checkbox" checked={sqIncludeFields[key]}
                              onChange={e => setSqIncludeFields(prev => ({ ...prev, [key]: e.target.checked }))}
                              className="w-3.5 h-3.5 accent-[#C9A84C] cursor-pointer" />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-[#0C1B3A]/35">{included.length} of {draftItems.length} items selected for the GCI Quote (toggle "Include in GCI Quote" per row above).</p>
                  </div>
                );
              })()}

              {/* PRIMARY: Convert to GCI Quote */}
              <button
                onClick={() => {
                  const included = draftItems.filter(it => it.includeInGCI !== false);
                  if (included.length === 0) { alert('Please select at least one item to create GCI Quote.'); return; }
                  // Gate: show currency & exchange rate confirmation before entering Pricing Review
                  // Pre-fill from the live preview controls set above (Supplier Currency / Exchange Rate / Customer Currency)
                  setPendingConversionItems(included);
                  setRateConfig({ quoteCurrency: sqCustomerCurrency, rate: sqExchangeRate });
                  setShowCurrencyModal(true);
                }}
                disabled={!savedSQId}
                className="w-full py-5 rounded-[24px] font-black uppercase tracking-widest text-[14px] transition-all active:scale-95 flex items-center justify-center gap-3 shadow-xl"
                style={{ backgroundColor: '#C9A84C', color: '#0C1B3A' }}
              >
                <ExternalLink className="w-5 h-5" />
                Convert to GCI Quote →
              </button>

              {/* SECONDARY: View in Archive */}
              <button
                onClick={() => {
                  setView('history');
                  setHistoryTab('supplier');
                  setDraftItems([]);
                  setTradeTerms('');
                  setSqSaveStatus('idle');
                  setSavedSQId(null);
                  setAppMode('landing');
                }}
                className="w-full py-4 rounded-[24px] font-black uppercase tracking-widest text-[12px] transition-all border border-[#0C1B3A]/12 text-[#0C1B3A]/60 hover:border-[#0C1B3A]/30 hover:text-[#0C1B3A] flex items-center justify-center gap-2"
              >
                <History className="w-4 h-4" /> View in Supplier Quote Archive
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Supplier Quote Archive ────────────────────────────────────────────────

  /** Save current draftItems as a Supplier Quote (no GCI pricing required). */
  const handleSaveSupplierQuote = async () => {
    if (draftItems.length === 0) return;
    setSqSaveStatus('saving');
    try {
      const totalCost = draftItems.reduce((s, it) => s + it.targetUnitPrice * it.quantity, 0);
      const header: SupplierQuote = {
        supplier_quote_no: generateSupplierQuoteNo(),
        supplier_name: supplierMeta.supplierName || '',
        supplier_contact: supplierMeta.supplierContact || '',
        category: supplierMeta.category || '',
        currency: supplierMeta.currency || 'AED',
        quote_date: supplierMeta.quoteDate || quoteInfo.date || new Date().toISOString().split('T')[0],
        valid_until: supplierMeta.validUntil || undefined,
        terms_notes: tradeTerms || undefined,
        uploaded_by: 'Admin',
        status: 'Active',
        total_cost: Number(totalCost.toFixed(2)),
      };
      // Pack Module 2 V2 rich fields into `notes` as JSON (no Supabase schema change needed) —
      // prefixed so handleCreateGCIQuoteFromSupplier can detect and parse it back on reload.
      const items: SupplierQuoteItem[] = draftItems.map((it, i) => ({
        item_name: it.originalName,
        description: it.originalSpec || '',
        qty: it.quantity,
        unit: it.unit,
        supplier_cost: it.originalUnitCost ?? it.targetUnitPrice,
        currency: it.originalCurrency || supplierMeta.currency || 'AED',
        notes: 'GCI_V2::' + JSON.stringify({
          en: it.englishDescription || '', model: it.model || '', material: it.material || '',
          color: it.color || '', moq: it.moq || '', packaging: it.packaging || '',
          delivery: it.deliveryTime || '', payment: it.paymentTerms || '',
          remarks: it.remarks || '', margin: it.marginPercent ?? null,
          size: it.sizeDimension || '', inc: it.includeInGCI !== false,
          note: tradeItemNotes[it.id] || '',
        }),
        sort_order: i,
      }));
      const id = await saveSupplierQuote(header, items);
      if (id) {
        setSavedSQId(id);
        setSqSaveStatus('saved');
        // Refresh supplier quotes list if history is open
        if (view === 'history') {
          listSupplierQuotes(60).then(setSupplierQuotes).catch(() => {});
        }
      } else {
        setSqSaveStatus('error');
        alert('❌ Save failed. Make sure supplier_quotes table exists in Supabase (run the SQL provided in setup).');
      }
    } catch (e: any) {
      console.error('[Supplier Quote Save] Error:', e);
      setSqSaveStatus('error');
      alert(`❌ Save failed: ${e?.message || 'Unknown error'}`);
    }
  };

  /** Load a supplier quote and enter GCI pricing flow to create a GCI Quote. */
  const handleCreateGCIQuoteFromSupplier = async (sq: SupplierQuote) => {
    if (!sq.id) return;
    const result = await loadSupplierQuote(sq.id);
    if (!result) { alert('Failed to load supplier quote'); return; }

    const { items } = result;
    // Restore draftItems from supplier quote items — unpack Module 2 V2 rich fields from `notes` if present
    const restoredDraft = items.map(it => {
      let v2: any = {};
      if (it.notes?.startsWith('GCI_V2::')) {
        try { v2 = JSON.parse(it.notes.slice('GCI_V2::'.length)); } catch { /* ignore malformed */ }
      }
      return {
        id: `sq-${it.id || Date.now()}-${Math.random().toString(36).slice(2)}`,
        originalName: it.item_name,
        originalSpec: it.description || '',
        quantity: it.qty,
        unit: it.unit,
        targetUnitPrice: it.supplier_cost,
        targetTotal: it.supplier_cost * it.qty,
        confidence: 1,
        status: 'Confirmed' as const,
        suggestedCategory: FurnitureCategory.OTHER,
        englishDescription: v2.en || '', model: v2.model || '', material: v2.material || '',
        color: v2.color || '', moq: v2.moq || '', packaging: v2.packaging || '',
        deliveryTime: v2.delivery || '', paymentTerms: v2.payment || '',
        remarks: v2.remarks || '', marginPercent: v2.margin ?? undefined,
        sizeDimension: v2.size || '',
        // Old saves (pre-V3) have no `inc` key — default to included so nothing pre-existing disappears
        includeInGCI: v2.inc !== undefined ? v2.inc !== false : true,
      };
    });

    const newCurrencies: Record<string, string> = {};
    const newNotes: Record<string, string> = {};
    restoredDraft.forEach((d, i) => {
      newCurrencies[d.id] = items[i]?.currency || 'AED';
      const raw = items[i]?.notes || '';
      if (raw.startsWith('GCI_V2::')) {
        try { newNotes[d.id] = JSON.parse(raw.slice(8)).note || ''; } catch { newNotes[d.id] = ''; }
      } else {
        newNotes[d.id] = raw;
      }
    });

    setDraftItems(restoredDraft);
    setTradeItemCurrencies(newCurrencies);
    setTradeItemNotes(newNotes);
    setTradeTerms(result.quote.terms_notes || '');
    setSellingPrices({});
    setMarkupPercents({});
    setQuoteGenerated(false);
    setSentToTrade(false);

    // Track navigation source for breadcrumb/back nav
    setQuoteSource('supplier-archive');
    setSqSourceId(sq.id || null);

    // Navigate to pricing flow
    setQuoteType('trade');
    setQuoteMode('package');
    setTradePhase('pricing');
    setProjectInfoSubmitted(true);
    setAppMode('customer-quote'); // exit supplier-quote render trap so renderTradeQuoteReview() is reached
    setView('configurator');
  };

  // Handle 3-path type selection (Step 2)
  const handleTypeSelect = (type: QuoteType) => {
    setQuoteType(type);
    if (type === 'trade') {
      // Trade & Sourcing: go directly to upload/AI parsing tab
      setQuoteMode('package');
      setActiveTab('draft');
      setTradePhase('upload');
    } else if (type === 'boq') {
      // BOQ & AI Analysis: same upload tab, different context label
      setQuoteMode('package');
      setActiveTab('draft');
      setTradePhase('upload');
    } else {
      setQuoteMode(null); // 'custom' — let category selection drive quoteMode
      setTradePhase(null);
    }
  };

  const sendToTrade = () => {
    if (!quoteInfo.customerProjectName) {
      alert('请先填写客户/项目名称 Please enter Customer / Project Name');
      return;
    }
    const isPackage = quoteMode === 'package';

    // Build pre-VAT item list for TRADE (TRADE auto-adds 5% VAT)
    const tradeItems = isPackage
      ? packageItems.map(pkg => ({
          desc: `${pkg.category} × ${pkg.quantity}`,
          qty: pkg.quantity,
          // totalAmount includes VAT, so divide by 1+vatPercent to get pre-VAT unit price
          unitPrice: Number((pkg.totalAmount / (1 + costOverrides.vatPercent / 100)).toFixed(2)),
          lineTotal: Number(((pkg.totalAmount / (1 + costOverrides.vatPercent / 100)) * pkg.quantity).toFixed(2)),
        }))
      : [{
          desc: `${selectedCategory} Project | ${quoteInfo.quoteNumber || 'Draft'}`,
          qty: 1,
          unitPrice: Number((costs.total - costs.vat).toFixed(2)),
          lineTotal: Number((costs.total - costs.vat).toFixed(2)),
        }];

    const totalBeforeVat = isPackage
      ? packageItems.reduce((acc, pkg) => acc + pkg.totalAmount / (1 + costOverrides.vatPercent / 100) * pkg.quantity, 0)
      : costs.total - costs.vat;
    const vatAmt = isPackage
      ? packageItems.reduce((acc, pkg) => acc + pkg.totalAmount, 0) - totalBeforeVat
      : costs.vat;
    const totalAmt = isPackage
      ? packageItems.reduce((acc, pkg) => acc + pkg.totalAmount * pkg.quantity, 0)
      : costs.total;
    const costAmt = isPackage ? 0 : Number((costs.material + costs.labor + costs.packaging + costs.transport + costs.installation).toFixed(2));
    const profitAmt = isPackage ? 0 : Number(costs.margin.toFixed(2));

    const payload = {
      customerName: quoteInfo.customerProjectName,
      projectName: quoteInfo.customerProjectName,
      quoteNo: quoteInfo.quoteNumber || `GCI-DRAFT-${Date.now()}`,
      quoteDate: quoteInfo.date,
      currency: 'AED',
      subtotal: Number(totalBeforeVat.toFixed(2)),
      vatAmount: Number(vatAmt.toFixed(2)),
      totalAmount: Number(totalAmt.toFixed(2)),
      marginRate: costOverrides.marginPercent,
      costAmount: costAmt,
      profitAmount: profitAmt,
      items: tradeItems,
      sourceApp: 'gci-living-engineering-studio',
      piType: 'PROJECT',
    };

    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    window.open(`https://trade.globalcareinfo.com/?inbound=${encoded}&tab=quote`, '_blank');
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const brandGold: [number, number, number] = [212, 175, 55]; // #D4AF37
    const brandBrown: [number, number, number] = [62, 39, 35]; // #3E2723
    
    const margin = 15;
    let yPos = 20;

    // Header
    doc.setFillColor(brandBrown[0], brandBrown[1], brandBrown[2]);
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text('GCI LIVING', margin, 25);
    
    doc.setFontSize(10);
    const quoteTitle = tPDF('QUOTATION');
    const quoteTitleWidth = doc.getTextWidth(quoteTitle);
    doc.text(quoteTitle, 210 - margin - quoteTitleWidth, 25);

    yPos = 50;

    // Quotation Info
    doc.setTextColor(brandBrown[0], brandBrown[1], brandBrown[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`${tPDF('Quotation No.')}: ${quoteInfo.quoteNumber}`, margin, yPos);
    
    const dateStr = `${tPDF('Date')}: ${new Date(quoteInfo.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    const dateWidth = doc.getTextWidth(dateStr);
    doc.text(dateStr, 210 - margin - dateWidth, yPos);

    yPos += 15;

    // Client Info
    doc.setDrawColor(brandGold[0], brandGold[1], brandGold[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, 210 - margin, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.text(tPDF('CLIENT INFORMATION'), margin, yPos);
    yPos += 7;
    doc.setFont('helvetica', 'normal');
    doc.text(`${tPDF('Customer / Project Name')}: ${quoteInfo.customerProjectName}`, margin, yPos);
    yPos += 5;
    doc.text(`${tPDF('Phone / WhatsApp')}: ${quoteInfo.phoneWhatsApp || 'N/A'}`, margin, yPos);
    yPos += 5;
    doc.text(`${tPDF('Salesperson')}: ${quoteInfo.salesperson || 'N/A'}`, margin, yPos);

    yPos += 15;

    // Specifications
    const currentConfig = selectedCategory === FurnitureCategory.BED 
      ? config 
      : (selectedCategory === FurnitureCategory.SOFA ? sofaConfig : 
         ([FurnitureCategory.WARDROBE, FurnitureCategory.CABINET, FurnitureCategory.TV_UNIT, FurnitureCategory.TABLE_DESK].includes(selectedCategory!) ? modularConfig : genericConfig));

    doc.setFont('helvetica', 'bold');
    doc.text(tPDF('PRODUCT SPECIFICATION'), margin, yPos);
    yPos += 7;
    doc.setFont('helvetica', 'normal');
    doc.text(`${tPDF('Category')}: ${tPDF(selectedCategory!)}`, margin, yPos);
    yPos += 5;
    
    const finishKey = (currentConfig as any).finish;
    const finishLabel = finishKey ? tPDF(finishKey) : 'N/A';
    doc.text(`${tPDF('Finish')}: ${finishLabel}`, margin, yPos);
    yPos += 5;

    const colorLabel = currentConfig.color === Color.CUSTOM ? `Custom (${currentConfig.customColor || 'Pending'})` : tPDF(currentConfig.color);
    doc.text(`${tPDF('Color')}: ${colorLabel}`, margin, yPos);
    
    if (currentConfig.color === Color.CUSTOM && currentConfig.customColor) {
      yPos += 5;
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(brandGold[0], brandGold[1], brandGold[2]);
      doc.text(`Note: ${currentConfig.customColor}`, margin, yPos);
      doc.setTextColor(brandBrown[0], brandBrown[1], brandBrown[2]);
      doc.setFont('helvetica', 'normal');
    }

    yPos += 15;

    // BOM Table
    autoTable(doc, {
      startY: yPos,
      head: [[tPDF('Component'), tPDF('Specification'), tPDF('Qty'), tPDF('Rate'), tPDF('Subtotal')]],
      body: bom.map(item => {
        const compParts = item.component.includes(':') 
          ? item.component.split(':') 
          : [item.component];
          
        return [
          tPDF(compParts[0]),
          compParts[1] ? tPDF(compParts[1].trim()) : 'Standard',
          `${item.quantity} ${tPDF(item.unit)}`,
          item.unitPrice.toLocaleString(),
          item.total.toLocaleString()
        ];
      }),
      headStyles: { fillColor: brandBrown, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 245] },
      margin: { left: margin, right: margin },
      theme: 'striped',
      didDrawPage: (data) => {
        yPos = data.cursor?.y || yPos;
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Cost summary
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    const summaryX = 130;
    doc.setFont('helvetica', 'bold');
    doc.text(tPDF('COST SUMMARY'), summaryX, yPos);
    yPos += 7;
    doc.setFont('helvetica', 'normal');

    const summaryItems = [
      { label: tPDF('Material'), value: costs.material },
      { label: tPDF('Labor'), value: costs.labor },
      { label: tPDF('Packaging'), value: costs.packaging },
      { label: tPDF('Transport'), value: costs.transport },
      { label: tPDF('Installation'), value: costs.installation },
      { label: tPDF('Margin Amt'), value: costs.margin },
      { label: tPDF('Net (Excl. VAT)'), value: (costs.material + costs.labor + costs.packaging + costs.transport + costs.installation + costs.margin) },
      { label: tPDF('VAT Amt'), value: costs.vat },
    ];

    summaryItems.forEach(item => {
      doc.text(item.label, summaryX, yPos);
      const val = item.value.toLocaleString();
      doc.text(val, 210 - margin - doc.getTextWidth(val), yPos);
      yPos += 5;
    });

    yPos += 5;
    doc.setFillColor(brandBrown[0], brandBrown[1], brandBrown[2]);
    doc.rect(summaryX - 5, yPos - 4, 210 - summaryX - margin + 10, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(tPDF('Gross Quote'), summaryX, yPos + 5);
    const totalStr = `${costs.total.toLocaleString(undefined, {maximumFractionDigits:0})} AED`;
    doc.text(totalStr, 210 - margin - doc.getTextWidth(totalStr), yPos + 5);

    // Footer
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const footerY = 285;
    doc.text(`Note: ${tPDF('Terms Factory')} | ${tPDF('Commercial Grade')} | ${tPDF('Verified Status')}`, margin, footerY - 5);
    doc.text(tPDF('Date') + ': ' + new Date().toLocaleDateString('en-GB'), margin, footerY);
    
    const footerBrandName = 'GCI LIVING - LUXURY INTERIORS';
    doc.text(footerBrandName, 210 - margin - doc.getTextWidth(footerBrandName), footerY);

    doc.save(`GCI-Quotation-${quoteInfo.quoteNumber || 'Draft'}.pdf`);
  };

  // ── Module 2 (Supplier Quote → GCI Quote) customer-view field filter ──────────
  // Gated strictly by quoteSource === 'supplier-archive' wherever it's called — the only
  // entry into Trade Pricing Review that originates from Module 2. Direct Trade & Sourcing /
  // BOQ uploads (quoteSource === null) and GCI history reload ('gci-history') are untouched.
  // Always-customer-visible fields are combined here; Supplier Name/Contact, Supplier Unit
  // Cost, Supplier Currency, Exchange Rate, Margin %, and Internal Notes are NEVER read by
  // this function — they simply aren't referenced, so they cannot leak into its output.
  const buildModule2CustomerDescription = (item: DraftItem): string => {
    const desc = item.englishDescription?.trim() || item.originalName;
    const specParts = [item.originalSpec, item.sizeDimension, item.material, item.color].filter(Boolean);
    let out = specParts.length ? `${desc}\n${specParts.join(' | ')}` : desc;
    if (sqIncludeFields.moq && item.moq) out += `\nMOQ: ${item.moq}`;
    if (sqIncludeFields.packaging && item.packaging) out += `\nPackaging: ${item.packaging}`;
    if (sqIncludeFields.deliveryTime && item.deliveryTime) out += `\nDelivery: ${item.deliveryTime}`;
    if (sqIncludeFields.paymentTerms && item.paymentTerms) out += `\nPayment Terms: ${item.paymentTerms}`;
    if (sqIncludeFields.remarks && item.remarks) out += `\nRemarks: ${item.remarks}`;
    return out;
  };

  // ── Trade & Sourcing PDF — customer-facing quote with selling prices + terms ──
  const generateTradePDF = (
    items: typeof draftItems,
    grandTotal: number,
    totalSelling: number,
    totalVAT: number,
    totalSupplierCost: number,
    totalProfit: number,
    overallMargin: number
  ) => {
    const doc = new jsPDF();
    const navy: [number, number, number] = [12, 27, 58];
    const gold: [number, number, number] = [201, 168, 76];
    const w = 210;
    const margin = 15;
    let y = 20;

    // Header bar
    doc.setFillColor(...navy);
    doc.rect(0, 0, w, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('GLOBALCARE INFO GENERAL TRADING FZCO', margin, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(201, 168, 76);
    doc.text('TEL: +971585566809  |  EMAIL: CHRIS@GLOBALCAREINFO.COM  |  DUBAI, UAE', margin, 20);
    y = 38;

    // Doc title
    doc.setFillColor(...gold);
    doc.rect(margin, y, w - margin * 2, 8, 'F');
    doc.setTextColor(12, 27, 58);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('PROFORMA INVOICE / TRADE QUOTATION', w / 2, y + 5.5, { align: 'center' });
    y += 14;

    // Quote info table
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 50, 50);
    const leftCol = [
      ['Customer / Project:', quoteInfo.customerProjectName || '—'],
      ['Quote No:', quoteInfo.quoteNumber || 'Draft'],
      ['Salesperson:', quoteInfo.salesperson || '—'],
    ];
    const rightCol = [
      ['Date:', quoteInfo.date || new Date().toISOString().split('T')[0]],
      ['Currency:', 'AED'],
      ['Source:', _businessIdParam ? `DEAL · ${_businessIdParam}` : 'Manual'],
    ];
    leftCol.forEach(([label, val], i) => {
      doc.setFont('helvetica', 'bold'); doc.text(label, margin, y + i * 6);
      doc.setFont('helvetica', 'normal'); doc.text(String(val), margin + 40, y + i * 6);
    });
    rightCol.forEach(([label, val], i) => {
      doc.setFont('helvetica', 'bold'); doc.text(label, 120, y + i * 6);
      doc.setFont('helvetica', 'normal'); doc.text(String(val), 145, y + i * 6);
    });
    y += 24;

    // Items table
    const colWidths = [75, 20, 18, 28, 28];
    const colX = [margin, margin+75, margin+95, margin+113, margin+141];
    const headers = ['Description', 'Qty', 'Unit', 'Unit Price', 'Total (AED)'];

    doc.setFillColor(...navy);
    doc.rect(margin, y, w - margin * 2, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    headers.forEach((h, i) => doc.text(h, colX[i] + (i >= 3 ? colWidths[i] - 2 : 1), y + 5, { align: i >= 3 ? 'right' : 'left' }));
    y += 9;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const isModule2Quote = quoteSource === 'supplier-archive';
    items.forEach((item) => {
      if (y > 260) { doc.addPage(); y = 20; }
      const sp = sellingPrices[item.id] || 0;  // line total
      const lineTot = sp;                        // already line total
      const unitSellPrice = item.quantity > 0 ? sp / item.quantity : 0;
      doc.setFontSize(8.5);
      const descText = isModule2Quote
        ? buildModule2CustomerDescription(item)
        : item.originalName + (item.originalSpec ? `\n${item.originalSpec}` : '');
      const nameLines = doc.splitTextToSize(descText, colWidths[0] - 2);
      doc.text(nameLines, colX[0] + 1, y + 4);
      doc.text(String(item.quantity), colX[1] + colWidths[1] - 2, y + 4, { align: 'right' });
      doc.text(item.unit, colX[2] + 1, y + 4);
      doc.text(unitSellPrice.toFixed(2), colX[3] + colWidths[3] - 2, y + 4, { align: 'right' });
      doc.text(lineTot.toFixed(2), colX[4] + colWidths[4] - 2, y + 4, { align: 'right' });
      const rowH = Math.max(7, nameLines.length * 4.5 + 3);
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y + rowH, w - margin, y + rowH);
      y += rowH;
    });
    y += 4;

    // Totals
    const totals = [
      ['Subtotal (excl. VAT):', `AED ${totalSelling.toFixed(2)}`],
      ['VAT (5%):', `AED ${totalVAT.toFixed(2)}`],
    ];
    totals.forEach(([label, val]) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text(label, 130, y); doc.text(val, w - margin, y, { align: 'right' });
      y += 6;
    });
    doc.setFillColor(...navy);
    doc.rect(125, y, w - margin - 125, 8, 'F');
    doc.setTextColor(201, 168, 76);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('GRAND TOTAL:', 127, y + 5.5);
    doc.text(`AED ${grandTotal.toFixed(2)}`, w - margin, y + 5.5, { align: 'right' });
    y += 14;

    // Internal summary (light grey box) — Supplier Cost/Profit/Margin must NEVER appear on a
    // Module 2-sourced customer PDF (Supplier Unit Cost / Margin % are always-internal fields).
    if (!isModule2Quote) {
      doc.setFillColor(245, 245, 248);
      doc.rect(margin, y, w - margin * 2, 10, 'F');
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text(`Supplier Cost: AED ${totalSupplierCost.toFixed(2)}  |  Profit: AED ${totalProfit.toFixed(2)}  |  Margin: ${overallMargin.toFixed(1)}%`, w / 2, y + 6.5, { align: 'center' });
      y += 16;
    }

    // Terms & Notes
    if (tradeTerms) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFillColor(...navy);
      doc.rect(margin, y, w - margin * 2, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('TERMS & NOTES', margin + 2, y + 5);
      y += 10;
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
      const termLines = doc.splitTextToSize(tradeTerms, w - margin * 2 - 4);
      termLines.forEach((line: string) => {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.text(line, margin + 2, y);
        y += 5;
      });
      y += 4;
    }

    // Footer
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('This is a system-generated document from GCI Quotation Center.', w / 2, 287, { align: 'center' });

    doc.save(`GCI-Trade-Quote-${quoteInfo.quoteNumber || quoteInfo.customerProjectName || 'Draft'}.pdf`);
  };

  // ════════════════════════════════════════════════════════════════════════════
  // Module 4: Service Quote — standalone service-quotation engine.
  // No link to inventory/SKU/supplier cost/BOQ/margin calculation/stock deduction.
  // ════════════════════════════════════════════════════════════════════════════

  const svcComputeLineTotal = (qty: number, unitPrice: number, billing: ServiceBillingType, overridden: boolean, current: number) => {
    if (overridden) return current; // percentage/commission/custom often need a manual total
    return Number((qty * unitPrice).toFixed(2));
  };

  const svcUpdateItem = (id: string, patch: Partial<SvcLineItem>) => {
    setSvcItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const next = { ...it, ...patch };
      if (!('lineTotal' in patch)) {
        next.lineTotal = svcComputeLineTotal(next.quantity, next.unitPrice, next.billingType, next.totalOverridden, next.lineTotal);
      }
      return next;
    }));
  };

  const svcAddItemFromCatalog = (cat: ServiceCatalogItem) => {
    const category = svcCategories.find(c => c.id === cat.category_id);
    setSvcItems(prev => [...prev, {
      id: `svc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      categoryName: category ? `${category.name_cn} / ${category.name_en}` : '',
      serviceName: `${cat.name_cn} / ${cat.name_en}`,
      description: '', unit: cat.default_unit, quantity: 1, unitPrice: 0,
      billingType: cat.default_billing_type, billingLabel: '', lineTotal: 0, totalOverridden: false,
    }]);
  };

  const svcAddCustomItem = () => {
    setSvcItems(prev => [...prev, {
      id: `svc-custom-${Date.now()}`,
      categoryName: '自定义 Custom', serviceName: 'New Service / 新服务项目',
      description: '', unit: '项', quantity: 1, unitPrice: 0,
      billingType: 'fixed', billingLabel: '', lineTotal: 0, totalOverridden: false,
    }]);
  };

  const svcGrandTotal = () => svcItems.reduce((s, it) => s + it.lineTotal, 0);

  const svcLoadCatalog = async (force = false) => {
    if (svcCatalogLoaded && !force) return;
    setSvcCatalogLoading(true);
    setSvcCatalogError('');
    try {
      await seedDefaultCatalogIfEmpty();
      const [cats, items] = await Promise.all([listServiceCategories(), listServiceCatalogItems()]);
      setSvcCategories(cats);
      setSvcCatalog(items);
      if (cats.length === 0) {
        setSvcCatalogError('无法加载服务目录，请检查 Supabase 是否已建表（运行 SERVICE_QUOTE_SETUP_SQL）以及网络连接。Could not load the service catalog — check that the Supabase tables exist (run SERVICE_QUOTE_SETUP_SQL) and that the network connection is working.');
      }
    } catch (e: any) {
      setSvcCatalogError(`加载失败 Failed to load: ${e?.message || 'Unknown error'}`);
    } finally {
      setSvcCatalogLoading(false);
      setSvcCatalogLoaded(true);
    }
  };

  const svcLoadQuoteList = async () => {
    const qs = await listServiceQuotes(60);
    setSvcQuotes(qs);
  };

  const handleSaveServiceQuote = async (status: 'Draft' | 'Final') => {
    if (!svcMeta.customerName.trim()) { alert('请填写客户名称 Please enter customer name'); return; }
    setSvcSaveStatus('saving');
    try {
      const quote: ServiceQuote = {
        quote_no: svcMeta.quoteNo, customer_name: svcMeta.customerName, contact_person: svcMeta.contactPerson,
        quote_date: svcMeta.quoteDate, currency: svcMeta.currency, project_duration: svcMeta.projectDuration,
        payment_terms: svcMeta.paymentTerms, notes: svcMeta.notes, status,
        total_amount: Number(svcGrandTotal().toFixed(2)),
      };
      const items: ServiceQuoteItem[] = svcItems.map((it, i) => ({
        category_name: it.categoryName, service_name: it.serviceName, description: it.description,
        unit: it.unit, quantity: it.quantity, unit_price: it.unitPrice, billing_type: it.billingType,
        billing_label: it.billingLabel, line_total: it.lineTotal, sort_order: i,
      }));
      const id = await saveServiceQuote(quote, items);
      if (id) { setSvcSavedId(id); setSvcSaveStatus('saved'); svcLoadQuoteList(); }
      else { setSvcSaveStatus('error'); alert('❌ 保存失败 Save failed. Run SERVICE_QUOTE_SETUP_SQL in Supabase first if tables don\'t exist yet.'); }
    } catch (e: any) {
      setSvcSaveStatus('error');
      alert(`❌ Save failed: ${e?.message || 'Unknown error'}`);
    }
  };

  const handleOpenServiceQuote = async (sq: ServiceQuote, duplicate: boolean) => {
    if (!sq.id) return;
    const result = await loadServiceQuote(sq.id);
    if (!result) { alert('Failed to load service quote'); return; }
    const { quote, items } = result;
    setSvcMeta({
      quoteNo: duplicate ? generateServiceQuoteNo() : quote.quote_no,
      customerName: quote.customer_name, contactPerson: quote.contact_person || '',
      quoteDate: duplicate ? new Date().toISOString().split('T')[0] : (quote.quote_date || ''),
      currency: quote.currency, projectDuration: quote.project_duration || '',
      paymentTerms: quote.payment_terms || PAYMENT_TERM_OPTIONS[0], notes: quote.notes || '',
    });
    setSvcItems(items.map((it, i) => ({
      id: `svc-${duplicate ? 'dup' : 'load'}-${Date.now()}-${i}`,
      categoryName: it.category_name || '', serviceName: it.service_name, description: it.description || '',
      unit: it.unit, quantity: it.quantity, unitPrice: it.unit_price, billingType: it.billing_type,
      billingLabel: it.billing_label || '', lineTotal: it.line_total, totalOverridden: true,
    })));
    setSvcSavedId(duplicate ? null : (sq.id || null));
    setSvcSaveStatus(duplicate ? 'idle' : 'saved');
    setSvcView('editor');
  };

  const handleDeleteServiceQuote = async (id: string) => {
    if (!confirm('删除此服务报价？ Delete this service quote?')) return;
    await deleteServiceQuote(id);
    svcLoadQuoteList();
  };

  /** Service Quote PDF — fully independent generator, GCI Living navy+gold style. */
  const generateServiceQuotePdf = () => {
    const doc = new jsPDF();
    const navy: [number, number, number] = [12, 27, 58];
    const gold: [number, number, number] = [201, 168, 76];
    const w = 210, margin = 15;
    let y = 20;

    doc.setFillColor(...navy);
    doc.rect(0, 0, w, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('GLOBALCARE INFO GENERAL TRADING FZCO', margin, 12);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gold);
    doc.text('TEL: +971585566809  |  EMAIL: CHRIS@GLOBALCAREINFO.COM  |  DUBAI, UAE', margin, 20);
    y = 38;

    doc.setFillColor(...gold);
    doc.rect(margin, y, w - margin * 2, 8, 'F');
    doc.setTextColor(...navy);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('SERVICE QUOTATION / 服务报价单', w / 2, y + 5.5, { align: 'center' });
    y += 14;

    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50);
    const leftCol = [
      ['Quote No:', svcMeta.quoteNo],
      ['Customer:', svcMeta.customerName || '—'],
      ['Contact:', svcMeta.contactPerson || '—'],
    ];
    const rightCol = [
      ['Date:', svcMeta.quoteDate],
      ['Currency:', svcMeta.currency],
      ['Project Duration:', svcMeta.projectDuration || '—'],
    ];
    leftCol.forEach(([label, val], i) => {
      doc.setFont('helvetica', 'bold'); doc.text(label, margin, y + i * 6);
      doc.setFont('helvetica', 'normal'); doc.text(String(val), margin + 30, y + i * 6);
    });
    rightCol.forEach(([label, val], i) => {
      doc.setFont('helvetica', 'bold'); doc.text(label, 120, y + i * 6);
      doc.setFont('helvetica', 'normal'); doc.text(String(val), 155, y + i * 6);
    });
    y += 24;

    const colWidths = [70, 30, 16, 12, 24, 28];
    const colX = [margin, margin + 70, margin + 100, margin + 116, margin + 128, margin + 152];
    const headers = ['Service / 服务项目', 'Billing / 计费方式', 'Unit', 'Qty', 'Unit Price', 'Total'];
    doc.setFillColor(...navy);
    doc.rect(margin, y, w - margin * 2, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    headers.forEach((h, i) => doc.text(h, colX[i] + (i >= 3 ? colWidths[i] - 2 : 1), y + 5, { align: i >= 3 ? 'right' : 'left' }));
    y += 9;

    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    svcItems.forEach(item => {
      if (y > 255) { doc.addPage(); y = 20; }
      doc.setFontSize(8);
      const descText = item.serviceName + (item.description ? `\n${item.description}` : '');
      const nameLines = doc.splitTextToSize(descText, colWidths[0] - 2);
      doc.text(nameLines, colX[0] + 1, y + 4);
      const billingText = item.billingType === 'custom' && item.billingLabel ? item.billingLabel : BILLING_TYPE_LABELS[item.billingType];
      doc.text(doc.splitTextToSize(billingText, colWidths[1] - 2), colX[1] + 1, y + 4);
      doc.text(item.unit, colX[2] + colWidths[2] - 2, y + 4, { align: 'right' });
      doc.text(String(item.quantity), colX[3] + colWidths[3] - 2, y + 4, { align: 'right' });
      doc.text(item.unitPrice.toFixed(2), colX[4] + colWidths[4] - 2, y + 4, { align: 'right' });
      doc.text(item.lineTotal.toFixed(2), colX[5] + colWidths[5] - 2, y + 4, { align: 'right' });
      const rowH = Math.max(8, nameLines.length * 4 + 3);
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y + rowH, w - margin, y + rowH);
      y += rowH;
    });
    y += 6;

    doc.setFillColor(...navy);
    doc.rect(125, y, w - margin - 125, 8, 'F');
    doc.setTextColor(...gold);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 127, y + 5.5);
    doc.text(`${svcMeta.currency} ${svcGrandTotal().toFixed(2)}`, w - margin, y + 5.5, { align: 'right' });
    y += 16;

    if (svcMeta.paymentTerms) {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
      doc.text('Payment Terms / 付款方式:', margin, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50);
      doc.text(svcMeta.paymentTerms, margin + 55, y);
      y += 10;
    }

    if (svcMeta.notes) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFillColor(...navy);
      doc.rect(margin, y, w - margin * 2, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('NOTES / 备注', margin + 2, y + 5);
      y += 10;
      doc.setTextColor(40, 40, 40); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
      doc.splitTextToSize(svcMeta.notes, w - margin * 2 - 4).forEach((line: string) => {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.text(line, margin + 2, y); y += 5;
      });
    }

    doc.setTextColor(160, 160, 160);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('This is a system-generated document from GCI Quotation Center.', w / 2, 287, { align: 'center' });

    doc.save(`GCI-Service-Quote-${svcMeta.quoteNo}.pdf`);
  };

  /** Send to TRADE — same inbound payload pattern already used by Trade & Sourcing. */
  const handleSendServiceQuoteToTrade = () => {
    if (!svcMeta.customerName.trim()) { alert('请填写客户名称 Please enter customer name'); return; }
    const payload = {
      customerName: svcMeta.customerName,
      projectName: svcMeta.customerName,
      quoteNo: svcMeta.quoteNo,
      quoteDate: svcMeta.quoteDate,
      currency: svcMeta.currency,
      subtotal: Number(svcGrandTotal().toFixed(2)),
      vatAmount: 0,
      totalAmount: Number(svcGrandTotal().toFixed(2)),
      items: svcItems.map(it => ({
        desc: it.serviceName + (it.description ? ` (${it.description})` : ''),
        qty: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
      })),
      sourceApp: 'gci-living-engineering-studio',
      piType: 'SERVICE',
      notes: svcMeta.notes || undefined,
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    window.open(`https://trade.globalcareinfo.com/?inbound=${encoded}&tab=quote`, '_blank');
  };

  /**
   * Send to DEAL — best-effort only. Unlike TRADE, this app does not have a documented
   * "push data into DEAL" endpoint; DEAL only pushes INTO this app (client/project/businessId
   * params) and exposes a `returnUrl` for navigating back. If DEAL opened this tab with a
   * returnUrl, we forward there with a quote summary attached as a query param; otherwise we
   * copy a summary to the clipboard so the user can paste it into DEAL manually. This is a
   * stopgap until a real DEAL inbound contract is confirmed — flagged in the chat summary.
   */
  const handleSendServiceQuoteToDeal = async () => {
    const summary = {
      quoteNo: svcMeta.quoteNo, customerName: svcMeta.customerName, currency: svcMeta.currency,
      totalAmount: Number(svcGrandTotal().toFixed(2)), itemCount: svcItems.length,
    };
    if (_returnUrlParam) {
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(summary))));
      const sep = _returnUrlParam.includes('?') ? '&' : '?';
      window.location.href = `${_returnUrlParam}${sep}serviceQuote=${encoded}`;
    } else {
      try {
        await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
        alert('未检测到 DEAL 回传地址，报价摘要已复制到剪贴板，请手动粘贴到 DEAL。\nNo DEAL returnUrl detected — quote summary copied to clipboard, please paste into DEAL manually.');
      } catch {
        alert(`请手动复制以下内容到 DEAL:\n${JSON.stringify(summary)}`);
      }
    }
  };

  const t = (key: string) => {
    return translations.bilingual[key] || translations.en[key] || key;
  };

  const tPDF = (key: string) => {
    if (!key) return '';
    
    // Multi-pass translation for composite strings
    let result = key;
    
    // Check direct translation first
    if (translations.en[key]) return translations.en[key];

    // Strip common bilingual patterns "Chinese / English" -> "English"
    if (result.includes(' / ')) {
      const parts = result.split(' / ');
      if (parts.length > 1) return parts[1].trim();
    }

    // Identify and replace known BOM prefixes and technical terms
    const bomMappings: Record<string, string> = {
      '主体板材': 'Primary Board',
      '饰面工艺': 'Finish',
      '软包工艺': 'Upholstery',
      '框架结构': 'Frame',
      '附加配件': 'Add-ons',
      '五金配套': 'Hardware',
      '安装及硬件': 'Installation & Hardware',
      '模块小计': 'Module Subtotal',
      '多层板': 'Plywood',
      '中纤板': 'MDF',
      '实木': 'Solid Wood',
      '三聚氰胺': 'Melamine',
      '实木贴皮': 'Veneer',
      '烤漆': 'Painted',
      '防火板': 'Laminate',
      '海绵': 'Foam',
      '布艺': 'Fabric',
      '皮革': 'Leather',
      '合页': 'Hinge',
      '滑轨': 'Runner',
      '拉手': 'Handle',
      '抽屉组件': 'Drawer Module',
      '椅子框架': 'Chair Frame',
      '椅腿': 'Legs',
      '椅背': 'Backrest',
      '坐垫': 'Seat',
      '扶手': 'Armrest',
      '台面': 'Top',
      '桌腿': 'Base',
      '柜体': 'Cabinet Body',
      '抽屉': 'Drawer',
      '层板': 'Shelf'
    };

    for (const [cn, en] of Object.entries(bomMappings)) {
      if (result.includes(cn)) {
        result = result.split(cn).join(en);
      }
    }

    // Final cleanup: remove any remaining Chinese characters
    result = result.replace(/[\u4e00-\u9fa5]/g, '').trim();
    // Clean up empty parentheses or double spaces left after stripping
    result = result.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();

    return result || key;
  };

  const bom = useMemo(() => {
    const items: BOMItem[] = [];
    
    if (selectedCategory === FurnitureCategory.BED) {
      const { width, length, height, headboardHeight, material, thickness } = config;
      const wM = width / 1000;
      const lM = length / 1000;
      const hM = height / 1000;
      const hbM = headboardHeight / 1000;
      const tF = THICKNESS_FACTORS[thickness];
      const woodPrice = prices[material];

      const baseArea = wM * lM;
      const sideArea = 2 * lM * hM;
      const footArea = wM * hM;
      const headArea = wM * hbM;
      const totalBoardArea = (baseArea + sideArea + footArea + headArea) * tF;

      const groupName = 'Standard Configuration';

      items.push({
        component: `主体板材 ${material} Boards (${thickness})`,
        quantity: Number(totalBoardArea.toFixed(2)),
        unit: 'm²',
        unitPrice: woodPrice,
        total: totalBoardArea * woodPrice,
        group: groupName
      });

      let finishRate = 0;
      if (config.finish === FinishType.MELAMINE) finishRate = prices.finishMelamine;
      if (config.finish === FinishType.VENEER) finishRate = prices.finishVeneer;
      if (config.finish === FinishType.PAINTED) finishRate = prices.finishPainted;
      if (config.finish === FinishType.LAMINATE) finishRate = prices.finishLaminate;

      items.push({
        component: `饰面工艺 Finish: ${t(config.finish)}`,
        quantity: Number(totalBoardArea.toFixed(2)),
        unit: 'm²',
        unitPrice: finishRate,
        total: totalBoardArea * finishRate,
        group: groupName
      });

      if (config.headboard !== HeadboardType.WOODEN) {
        let uphPrice = 0;
        if (config.headboard === HeadboardType.FABRIC) uphPrice = prices.upholsteryFabric;
        if (config.headboard === HeadboardType.PU_LEATHER) uphPrice = prices.upholsteryPU;
        if (config.headboard === HeadboardType.GENUINE_LEATHER) uphPrice = prices.upholsteryLeather;

        items.push({
          component: `软包工艺 Upholstery: ${t(config.headboard)}`,
          quantity: Number(headArea.toFixed(2)),
          unit: 'm²',
          unitPrice: uphPrice,
          total: headArea * uphPrice,
          group: groupName
        });
      }

      items.push({
        component: `床架结构 Frame: ${config.frame}`,
        quantity: 1,
        unit: 'pc',
        unitPrice: FRAME_TYPE_COSTS[config.frame],
        total: FRAME_TYPE_COSTS[config.frame],
        group: groupName
      });

      config.addOns.forEach(addon => {
        items.push({
          component: `附加配件 Add-on: ${t(addon)}`,
          quantity: 1,
          unit: 'pc',
          unitPrice: ADDON_COSTS_BASE[addon],
          total: ADDON_COSTS_BASE[addon],
          group: groupName
        });
      });
    } else if (selectedCategory === FurnitureCategory.CHAIR) {
      const { width, depth, seatHeight, backHeight, type, frameMaterial, legType, backrest, seat, upholstery, armrest, finish, addOns } = chairConfig;
      
      const wM = width / 1000;
      const dM = depth / 1000;
      const hM = backHeight / 1000;
      
      // Approximation of material area for a chair
      const boardArea = (wM * dM) + (wM * hM) + (dM * hM * 0.2); // Seat + Back + tiny bit of frame
      const woodPrice = prices[frameMaterial];

      // Frame
      items.push({
        component: `椅子框架 Frame: ${t(type)} (${t(frameMaterial)})`,
        quantity: Number(boardArea.toFixed(2)),
        unit: 'm²',
        unitPrice: woodPrice,
        total: boardArea * woodPrice
      });

      // Legs
      items.push({
        component: `椅腿 Legs: ${t(legType)}`,
        quantity: 1,
        unit: 'set',
        unitPrice: legType === LegType.SWIVEL ? 250 : legType === LegType.METAL ? 150 : 100,
        total: legType === LegType.SWIVEL ? 250 : legType === LegType.METAL ? 150 : 100
      });

      // Backrest
      items.push({
        component: `椅背 Backrest: ${t(backrest)}`,
        quantity: 1,
        unit: 'pc',
        unitPrice: backrest === BackrestType.UPHOLSTERED ? 120 : 60,
        total: backrest === BackrestType.UPHOLSTERED ? 120 : 60
      });

      // Seat
      items.push({
        component: `坐垫 Seat: ${t(seat)}`,
        quantity: 1,
        unit: 'pc',
        unitPrice: seat === SeatType.HARD ? 50 : 100,
        total: seat === SeatType.HARD ? 50 : 100
      });

      // Upholstery
      if (backrest === BackrestType.UPHOLSTERED || seat !== SeatType.HARD) {
        let uphPrice = 0;
        if (upholstery === SofaUpholsteryType.FABRIC) uphPrice = prices.upholsteryFabric;
        if (upholstery === SofaUpholsteryType.PU) uphPrice = prices.upholsteryPU;
        if (upholstery === SofaUpholsteryType.MICROFIBER) uphPrice = prices.upholsteryPU * 1.5;
        if (upholstery === SofaUpholsteryType.GENUINE_LEATHER) uphPrice = prices.upholsteryLeather;

        // Upholstery area based on dimensions
        const uphArea = (wM * dM) + (wM * (backrest === BackrestType.UPHOLSTERED ? hM : 0));
        items.push({
          component: `面料 Upholstery: ${t(upholstery)}`,
          quantity: Number(uphArea.toFixed(2)),
          unit: 'm²',
          unitPrice: uphPrice,
          total: uphArea * uphPrice
        });
      }

      // Armrest
      if (armrest !== ArmrestType.NONE) {
        items.push({
          component: `扶手 Armrest: ${t(armrest)}`,
          quantity: 1,
          unit: 'set',
          unitPrice: 120,
          total: 120
        });
      }

      // Finish
      items.push({
        component: `表面处理 Finish: ${t(finish)}`,
        quantity: Number(boardArea.toFixed(2)),
        unit: 'm²',
        unitPrice: prices.finishMelamine,
        total: boardArea * prices.finishMelamine
      });

      // Hardware
      items.push({
        component: '五金配件 Hardware',
        quantity: 1,
        unit: 'set',
        unitPrice: 40,
        total: 40
      });

      addOns.forEach(addon => {
        items.push({
          component: `附加项 Add-on: ${t(addon)}`,
          quantity: 1,
          unit: 'pc',
          unitPrice: 100,
          total: 100
        });
      });
    } else if (selectedCategory === FurnitureCategory.DINING_TABLE) {
      const { shape, topMaterial, thickness, baseType, edge, width, length, height, finish } = diningTableConfig;
      const wM = width / 1000;
      const lM = length / 1000;
      const hM = height / 1000;
      const tF = THICKNESS_FACTORS[thickness];
      const woodPrice = prices[topMaterial];
      const area = wM * lM;

      // Top
      items.push({
        component: `台面 Top: ${t(topMaterial)} (${t(shape)})`,
        quantity: Number(area.toFixed(2)),
        unit: 'm²',
        unitPrice: woodPrice * tF,
        total: area * woodPrice * tF
      });

      // Base/Legs
      items.push({
        component: `桌脚 Base: ${t(baseType)} (H:${height}mm)`,
        quantity: 1,
        unit: 'set',
        unitPrice: (baseType === TableBaseType.METAL ? 650 : baseType === TableBaseType.PEDESTAL ? 850 : 450) * (hM / 0.75),
        total: (baseType === TableBaseType.METAL ? 650 : baseType === TableBaseType.PEDESTAL ? 850 : 450) * (hM / 0.75)
      });

      // Finish
      items.push({
        component: `饰面 Finish: ${t(finish)}`,
        quantity: Number(area.toFixed(2)),
        unit: 'm²',
        unitPrice: prices.finishVeneer,
        total: area * prices.finishVeneer
      });

      // Edge
      items.push({
        component: `边缘处理 Edge: ${t(edge)}`,
        quantity: 1,
        unit: 'set',
        unitPrice: 150,
        total: 150
      });
    } else if (selectedCategory === FurnitureCategory.SOFA) {
      const { length, depth, seatHeight, backHeight, frameType, cushionType, upholsteryType, addOns } = sofaConfig;
      const lM = length / 1000;
      const dM = depth / 1000;
      const shM = seatHeight / 1000;
      const bhM = backHeight / 1000;

      items.push({
        component: `沙发框架 Frame: ${t(frameType)}`,
        quantity: 1,
        unit: 'pc',
        unitPrice: SOFA_FRAME_COSTS[frameType] * (lM / 2),
        total: SOFA_FRAME_COSTS[frameType] * (lM / 2)
      });

      items.push({
        component: `座包海绵 Cushion: ${t(cushionType)}`,
        quantity: 1,
        unit: 'pc',
        unitPrice: SOFA_CUSHION_COSTS[cushionType] * (lM / 2),
        total: SOFA_CUSHION_COSTS[cushionType] * (lM / 2)
      });

      // Surface area for upholstery
      const surfaceArea = (lM * dM) + (lM * bhM) + (2 * dM * bhM);
      const uphPrice = SOFA_UPHOLSTERY_COSTS[upholsteryType];
      items.push({
        component: `软包面料 Upholstery: ${t(upholsteryType)}`,
        quantity: Number(surfaceArea.toFixed(2)),
        unit: 'm²',
        unitPrice: uphPrice,
        total: surfaceArea * uphPrice
      });

      items.push({
        component: '沙发脚与配件 Legs & Add-ons',
        quantity: 1,
        unit: 'set',
        unitPrice: 250,
        total: 250
      });

      addOns.forEach(addon => {
        items.push({
          component: `附加项 Add-on: ${t(addon)}`,
          quantity: 1,
          unit: 'pc',
          unitPrice: ADDON_COSTS_BASE[addon] || 150,
          total: ADDON_COSTS_BASE[addon] || 150
        });
      });
    } else if (selectedCategory === FurnitureCategory.WARDROBE || selectedCategory === FurnitureCategory.CABINET || selectedCategory === FurnitureCategory.TV_UNIT) {
      modularConfig.modules.forEach((module, idx) => {
        const wM = module.width / 1000;
        const hM = module.height / 1000;
        const dM = module.depth / 1000;
        const tF = THICKNESS_FACTORS[module.thickness];
        const woodPrice = prices[module.material];
        
        const groupName = `Module ${idx + 1}: ${t(module.type)}`;

        // Calculate board area: front, back, two sides, top, bottom
        const boardArea = ((wM * hM * 2) + (wM * dM * 2) + (hM * dM * 2)) * tF;
        const totalBoardArea = boardArea * module.quantity;

        items.push({
          component: `板材 Board: ${t(module.material)} (${t(module.thickness)})`,
          quantity: Number(totalBoardArea.toFixed(2)),
          unit: 'm²',
          unitPrice: woodPrice,
          total: totalBoardArea * woodPrice,
          group: groupName
        });

        // Finish
        let finishRate = 0;
        if (module.finish === FinishType.MELAMINE) finishRate = prices.finishMelamine;
        if (module.finish === FinishType.VENEER) finishRate = prices.finishVeneer;
        if (module.finish === FinishType.PAINTED) finishRate = prices.finishPainted;
        if (module.finish === FinishType.LAMINATE) finishRate = prices.finishLaminate;

        items.push({
          component: `饰面 Finish: ${t(module.finish)}`,
          quantity: Number(totalBoardArea.toFixed(2)),
          unit: 'm²',
          unitPrice: finishRate,
          total: totalBoardArea * finishRate,
          group: groupName
        });

        // Door area
        if (module.doorType !== DoorType.OPEN) {
          const doorArea = wM * hM * module.quantity;
          items.push({
            component: `门板 Door: ${t(module.doorType)} (${module.doorCount} doors)`,
            quantity: Number(doorArea.toFixed(2)),
            unit: 'm²',
            unitPrice: finishRate * 0.5, // Buffer for door specific work
            total: doorArea * finishRate * 0.5,
            group: groupName
          });

          // Hinges
          const hingePrice = module.hingeType === HingeType.SOFT_CLOSE ? 45 : 20;
          const hingeQty = module.doorCount * 2 * module.quantity;
          items.push({
            component: `合页 Hinge: ${t(module.hingeType)}`,
            quantity: hingeQty,
            unit: 'pc',
            unitPrice: hingePrice,
            total: hingeQty * hingePrice,
            group: groupName
          });
        }

        // Drawers
        if (module.hasDrawers) {
          const drawerCost = 150 * module.drawerCount * module.quantity;
          items.push({
            component: `抽屉构建 Drawer Module x ${module.drawerCount}`,
            quantity: module.drawerCount * module.quantity,
            unit: 'set',
            unitPrice: 150,
            total: drawerCost,
            group: groupName
          });

          // Runners
          const runnerPrice = module.runnerType === RunnerType.SOFT_CLOSE ? 95 : 45;
          const runnerQty = module.drawerCount * module.quantity;
          items.push({
            component: `滑轨 Runner: ${t(module.runnerType)}`,
            quantity: runnerQty,
            unit: 'set',
            unitPrice: runnerPrice,
            total: runnerQty * runnerPrice,
            group: groupName
          });
        }

        // Shelves
        if (module.shelfCount > 0) {
          const shelfArea = wM * dM * module.shelfCount * module.quantity;
          items.push({
            component: `内部层板 Internal Shelves x ${module.shelfCount}`,
            quantity: Number(shelfArea.toFixed(2)),
            unit: 'm²',
            unitPrice: woodPrice * 0.8,
            total: shelfArea * woodPrice * 0.8,
            group: groupName
          });
        }

        // Hanging Rail
        if (module.hasHangingRail) {
          items.push({
            component: `挂衣杆 Hanging Rail`,
            quantity: module.quantity,
            unit: 'pc',
            unitPrice: 85,
            total: 85 * module.quantity,
            group: groupName
          });
        }

        // Handles
        if (module.handle !== HandleType.NONE) {
          const handlePrice = module.handle === HandleType.HIDDEN ? 120 : 45;
          const handleQty = (module.doorCount + (module.hasDrawers ? module.drawerCount : 0)) * module.quantity;
          items.push({
            component: `拉手 Handle: ${t(module.handle)}`,
            quantity: handleQty,
            unit: 'pc',
            unitPrice: handlePrice,
            total: handleQty * handlePrice,
            group: groupName
          });
        }

        // General Hardware (Assembly items)
        const hardwareCost = 50 * module.quantity;
        items.push({
          component: `组装配件及辅料 Hardware & Misc`,
          quantity: module.quantity,
          unit: 'set',
          unitPrice: 50,
          total: hardwareCost,
          group: groupName
        });
      });
    } else {
      // Fallback for Generic
      const { width, length, height, material, thickness, finish, addOns } = genericConfig;
      const wM = width / 1000;
      const lM = length / 1000;
      const hM = height / 1000;
      const area = (wM * lM) + (2 * wM * hM) + (2 * lM * hM);
      const woodPrice = prices[material];

      items.push({
        component: `${t(selectedCategory || FurnitureCategory.TABLE_DESK)} 主材 Board`,
        quantity: Number(area.toFixed(2)),
        unit: 'm²',
        unitPrice: woodPrice,
        total: area * woodPrice
      });

      items.push({
        component: '五金与结构配件 Hardware',
        quantity: 1,
        unit: 'set',
        unitPrice: 200,
        total: 200
      });

      addOns.forEach(addon => {
        items.push({
          component: `附加配件 Add-on: ${t(addon)}`,
          quantity: 1,
          unit: 'pc',
          unitPrice: 150,
          total: 150
        });
      });
    }

    // Common Footer items for all BOMs: Color (Price 0)
    const currentConfig = 
      selectedCategory === FurnitureCategory.BED ? config :
      selectedCategory === FurnitureCategory.SOFA ? sofaConfig :
      selectedCategory === FurnitureCategory.CHAIR ? chairConfig :
      selectedCategory === FurnitureCategory.DINING_TABLE ? diningTableConfig :
      selectedCategory === FurnitureCategory.WARDROBE ? wardrobeConfig :
      selectedCategory === FurnitureCategory.CABINET ? cabinetConfig :
      selectedCategory === FurnitureCategory.TV_UNIT ? tvUnitConfig :
      genericConfig;

    items.push({
      component: currentConfig.color === Color.CUSTOM 
        ? `颜色方案 Color: Custom (${currentConfig.customColor || 'Pending Spec'})` 
        : `颜色方案 Color: ${t(currentConfig.color)}`,
      quantity: 1,
      unit: 'set',
      unitPrice: 0,
      total: 0
    });

    return items;
  }, [config, sofaConfig, chairConfig, diningTableConfig, wardrobeConfig, cabinetConfig, tvUnitConfig, modularConfig, genericConfig, prices, selectedCategory]);

  const costs = useMemo(() => {
    const rawMaterialTotal = bom.reduce((sum, item) => sum + item.total, 0);
    
    const { labor, packaging, transport, installation, marginPercent, vatPercent } = costOverrides;
    const subtotal = rawMaterialTotal + labor + packaging + transport + installation;
    const margin = subtotal * (marginPercent / 100);
    const totalBeforeVat = subtotal + margin;
    const vat = totalBeforeVat * (vatPercent / 100);

    return {
      material: rawMaterialTotal,
      labor,
      packaging,
      transport,
      installation,
      margin,
      vat,
      total: totalBeforeVat + vat
    };
  }, [bom, costOverrides]);

  const handleNext = () => currentStep < STEPS.length - 1 && setCurrentStep(c => c + 1);
  const handleBack = () => currentStep > 0 && setCurrentStep(c => c - 1);
  const updateConfig = (u: Partial<BedConfiguration>) => setConfig(p => ({ ...p, ...u }));
  const toggleAddOn = (a: AddOn) => setConfig(p => ({
    ...p,
    addOns: p.addOns.includes(a) ? p.addOns.filter(x => x !== a) : [...p.addOns, a]
  }));

  const updateGenericConfig = (u: Partial<GenericConfiguration>) => setGenericConfig(p => ({ ...p, ...u }));
  const toggleGenericAddOn = (a: AddOn) => setGenericConfig(p => ({
    ...p,
    addOns: p.addOns.includes(a) ? p.addOns.filter(x => x !== a) : [...p.addOns, a]
  }));

  const updateSofaConfig = (u: Partial<SofaConfiguration>) => setSofaConfig(p => ({ ...p, ...u }));
  const toggleSofaAddOn = (a: AddOn) => setSofaConfig(p => ({
    ...p,
    addOns: p.addOns.includes(a) ? p.addOns.filter(x => x !== a) : [...p.addOns, a]
  }));

  const updateChairConfig = (u: Partial<ChairConfiguration>) => setChairConfig(p => ({ ...p, ...u }));
  const toggleChairAddOn = (a: AddOn) => setChairConfig(p => ({
    ...p,
    addOns: p.addOns.includes(a) ? p.addOns.filter(x => x !== a) : [...p.addOns, a]
  }));

  const updateDiningTableConfig = (u: Partial<DiningTableConfiguration>) => setDiningTableConfig(p => ({ ...p, ...u }));

  const updateWardrobeConfig = (u: Partial<WardrobeConfiguration>) => setWardrobeConfig(p => ({ ...p, ...u }));
  const toggleWardrobeAddOn = (a: AddOn) => setWardrobeConfig(p => ({
    ...p,
    addOns: p.addOns.includes(a) ? p.addOns.filter(x => x !== a) : [...p.addOns, a]
  }));

  const updateCabinetConfig = (u: Partial<CabinetConfiguration>) => setCabinetConfig(p => ({ ...p, ...u }));
  const toggleCabinetAddOn = (a: AddOn) => setCabinetConfig(p => ({
    ...p,
    addOns: p.addOns.includes(a) ? p.addOns.filter(x => x !== a) : [...p.addOns, a]
  }));

  const updateTVUnitConfig = (u: Partial<TVUnitConfiguration>) => setTVUnitConfig(p => ({ ...p, ...u }));
  const toggleTVUnitAddOn = (a: AddOn) => setTVUnitConfig(p => ({
    ...p,
    addOns: p.addOns.includes(a) ? p.addOns.filter(x => x !== a) : [...p.addOns, a]
  }));

  const handleAddModule = () => {
    const newModule: CabinetModule = {
      id: Math.random().toString(36).substr(2, 9),
      type: CabinetModuleType.STORAGE,
      quantity: 1,
      width: 600,
      depth: 600,
      height: 2400,
      material: Material.PLYWOOD,
      thickness: Thickness.T18,
      doorType: DoorType.SWING,
      doorCount: 2,
      shelfCount: 4,
      hasHangingRail: false,
      hasDrawers: false,
      drawerCount: 0,
      hingeType: HingeType.SOFT_CLOSE,
      runnerType: RunnerType.SOFT_CLOSE,
      handle: HandleType.EXTERNAL,
      finish: FinishType.MELAMINE,
      color: Color.WHITE,
      mounting: MountingType.FLOOR
    };
    setEditingModule(newModule);
    setIsModuleModalOpen(true);
  };

  const handleEditModule = (module: CabinetModule) => {
    setEditingModule({ ...module });
    setIsModuleModalOpen(true);
  };

  const handleDuplicateModule = (module: CabinetModule) => {
    const duplicated: CabinetModule = {
      ...module,
      id: Math.random().toString(36).substr(2, 9)
    };
    setModularConfig(prev => ({
      ...prev,
      modules: [...prev.modules, duplicated]
    }));
  };

  const handleDeleteModule = (id: string) => {
    if (confirm(t('Confirm Delete Module'))) {
      setModularConfig(prev => ({
        ...prev,
        modules: prev.modules.filter(m => m.id !== id)
      }));
    }
  };

  const handleSaveModule = () => {
    if (!editingModule) return;
    setModularConfig(prev => {
      const exists = prev.modules.find(m => m.id === editingModule.id);
      if (exists) {
        return {
          ...prev,
          modules: prev.modules.map(m => m.id === editingModule.id ? editingModule : m)
        };
      } else {
        return {
          ...prev,
          modules: [...prev.modules, editingModule]
        };
      }
    });
    setIsModuleModalOpen(false);
    setEditingModule(null);
  };

  const handleScenarioSelect = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    const recs = SCENARIO_RECOMMENDATIONS[scenario];
    
    // Pre-fill Bed
    setConfig(prev => ({
      ...prev,
      material: (recs.material as Material) || prev.material,
      thickness: (recs.thickness as Thickness) || prev.thickness,
      finish: (recs.finish as FinishType) || prev.finish,
      frame: (recs.frame as FrameType) || prev.frame,
    }));

    // Pre-fill Sofa
    setSofaConfig(prev => ({
      ...prev,
      frameType: (recs.frameType as SofaFrameType) || prev.frameType,
      cushionType: (recs.cushionType as SofaCushionType) || prev.cushionType,
      upholsteryType: (recs.upholsteryType as SofaUpholsteryType) || prev.upholsteryType,
    }));

    // Pre-fill Generic
    setGenericConfig(prev => ({
      ...prev,
      material: (recs.material as Material) || prev.material,
      thickness: (recs.thickness as Thickness) || prev.thickness,
      finish: (recs.finish as FinishType) || prev.finish,
    }));
  };

  const SCENARIO_ICONS: Record<Scenario, any> = {
    [Scenario.LABOUR_CAMP]: Building2,
    [Scenario.VILLA]: Home,
    [Scenario.APARTMENT]: Building,
    [Scenario.HOTEL]: Bed,
    [Scenario.OFFICE]: Briefcase,
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result?.toString().split(',')[1];
        resolve(base64String || '');
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let files: File[] = [];
    if ('target' in event && (event.target as HTMLInputElement).files) {
      files = Array.from((event.target as HTMLInputElement).files || []);
    } else if ('dataTransfer' in event) {
      files = Array.from(event.dataTransfer.files);
    }
    
    if (files.length === 0) return;

    const file = files[0];
    const isExcelOrCsv = file.name.endsWith('.xlsx') || file.name.endsWith('.csv');
    const isImage = file.type.startsWith('image/');
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isDocx = file.name.toLowerCase().endsWith('.docx');

    // In Supplier Quote mode: store file first, let user click "Parse" explicitly.
    // Excel/CSV never needs AI so auto-parse those regardless.
    if (appMode === 'supplier-quote' && !isExcelOrCsv) {
      setSqSelectedFile(file);
      setSqParseStatus('idle');
      setSqParseError('');
      return; // user must click Parse button explicitly
    }

    if (isExcelOrCsv) {
      // Excel/CSV: always auto-parse, never show Parse with AI button
      parseExcel(file);
    } else if (isPDF) {
      parsePDF(file);
    } else if (isImage) {
      analyzeImage(file);
    } else if (isDocx) {
      parseDocx(file);
    } else {
      alert("Unsupported file format. Please upload Excel, CSV, PDF, DOCX, PNG, or JPG.");
    }
  };

  const parsePDF = async (file: File) => {
    setIsProcessingAI(true);
    setSqParseStatus('parsing');
    setSqParseError('');
    try {
      // ── Step 1: file type ──────────────────────────────────────────────
      console.log('[PDF] Step 1 file.type:', file.type, '| file.name:', file.name, '| size:', file.size);

      // ── Step 2: base64 ────────────────────────────────────────────────
      const base64 = await fileToBase64(file);
      console.log('[PDF] Step 2 base64 length:', base64.length, '| first 40 chars:', base64.slice(0, 40));

      // ── Step 3: API key ───────────────────────────────────────────────
      const apiKey = process.env.GEMINI_API_KEY || '';
      console.log('[PDF] Step 3 API key present:', apiKey.length > 0, '| key prefix:', apiKey.slice(0, 8));

      const ai = new GoogleGenAI({ apiKey });

      const prompt = `Analyze this supplier quote PDF (it may be in Chinese or English). Separate into:
1. PRODUCT ITEMS — read every detail available for each item, including any text visible in embedded images (model numbers, dimensions, material callouts).
2. TERMS such as payment, lead time, validity, remarks (return in "terms" string).

For each item, also produce a professional English description (do not translate word-for-word — write it the way it would appear on a formal quotation), while keeping the original supplier text untouched.

Also look for the supplier's own name and contact info (phone/email/WeChat) printed on the document, if any.

Return ONLY valid JSON:
{"items":[{
  "originalName":"name as written by supplier (keep Chinese if Chinese)",
  "englishDescription":"professional English description of the item",
  "originalSpec":"full spec/description text",
  "sizeDimension":"explicit size or dimensions only, e.g. 2000*850*670mm, if distinguishable from general spec",
  "model":"model or SKU number if any",
  "material":"material description",
  "color":"color if mentioned",
  "quantity":1,"unit":"pc","targetUnitPrice":0,"targetTotal":0,
  "originalCurrency":"currency code if visible e.g. RMB/USD/AED",
  "moq":"minimum order quantity if mentioned",
  "packaging":"packaging method if mentioned",
  "deliveryTime":"lead/delivery time if mentioned",
  "paymentTerms":"payment terms if mentioned",
  "remarks":"any other notes for this item"
}],"terms":"...","supplierInfo":{"name":"supplier name if visible","contact":"phone/email/contact if visible"}}
Leave a field as empty string if not present. Never fabricate values.`;

      // ── Step 4: Gemini call (25s timeout for China network) ──────────
      console.log('[PDF] Step 4 calling Gemini...');
      let response: any;
      try {
        response = await withTimeout(
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'application/pdf', data: base64 } }] }],
          }),
          25000, 'PDF AI Analysis'
        );
        console.log('[PDF] Step 4 Gemini responded OK');
      } catch (geminiErr: any) {
        const msg = geminiErr?.message || geminiErr?.toString() || 'Unknown Gemini error';
        console.error('[PDF] Step 4 Gemini FAILED:', msg, geminiErr);
        setSqParseError(msg); setSqParseStatus('error');
        alert(`❌ PDF AI failed:\n${msg}`);
        return;
      }

      // ── Step 5: response.text ──────────────────────────────────────────
      const rawText = response.text || '';
      console.log('[PDF] Step 5 rawText length:', rawText.length, '| first 200:', rawText.slice(0, 200));

      if (!rawText) {
        alert('PDF: Gemini returned empty response. Check console for details.');
        return;
      }

      // ── Step 6: JSON extract ───────────────────────────────────────────
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      console.log('[PDF] Step 6 JSON match found:', !!jsonMatch);

      let parsed: any = {};
      try {
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch (jsonErr: any) {
        console.error('[PDF] Step 6 JSON parse failed:', jsonErr, '| rawText:', rawText);
        alert(`PDF: JSON parse failed.\nRaw response:\n${rawText.slice(0, 300)}`);
        return;
      }

      const extractedItems: any[] = Array.isArray(parsed) ? parsed : (parsed.items || []);
      const extractedTerms: string = parsed.terms || '';
      console.log('[PDF] Step 6 items:', extractedItems.length, '| terms:', extractedTerms.slice(0, 80));

      if (extractedTerms) setTradeTerms(prev => prev ? `${prev}\n${extractedTerms}` : extractedTerms);
      applyDetectedSupplierInfo(parsed.supplierInfo);

      const rows = extractedItems.map((it: any, idx: number) => ({
        ...it,
        id: `draft-pdf-${Date.now()}-${idx}`,
        status: 'Need Review' as const,
        sourceType: 'pdf' as const,
      }));

      if (rows.length === 0) {
        alert(`PDF: AI returned 0 items.\nRaw response:\n${rawText.slice(0, 400)}\n\nIf scanned PDF, export page as PNG/JPG and re-upload.`);
        return;
      }

      await processWithAI(rows);
      setSqParseStatus('done');
    } catch (err: any) {
      const msg = err?.message || err?.toString() || 'unknown error';
      console.error('[PDF] Unexpected error:', err);
      setSqParseError(msg);
      setSqParseStatus('error');
      alert(`❌ PDF analysis error:\n${msg}`);
    } finally {
      setIsProcessingAI(false);
    }
  };

  // Default conservative exchange rates: supplierCurrency → quoteCurrency
  const DEFAULT_RATES: Record<string, Record<string, number>> = {
    AED: { AED: 1.0,    USD: 0.2723 },
    USD: { AED: 3.6725, USD: 1.0    },
    CNY: { AED: 0.505,  USD: 0.1375 },
    EUR: { AED: 4.00,   USD: 1.09   },
    GBP: { AED: 4.67,   USD: 1.27   },
  };

  // Called when user confirms Currency & Exchange Rate modal
  const handleConfirmRate = () => {
    const { quoteCurrency, rate } = rateConfig;
    const converted = pendingConversionItems.map(it => {
      const origCost = it.originalUnitCost ?? it.targetUnitPrice;
      const convertedUnit = Number((origCost * rate).toFixed(4));
      return {
        ...it,
        targetUnitPrice: convertedUnit,
        targetTotal: Number((convertedUnit * it.quantity).toFixed(4)),
      };
    });
    const newCurrencies: Record<string, string> = {};
    const newNotes: Record<string, string> = {};
    const newMarkups: Record<string, number> = {};
    converted.forEach(it => {
      newCurrencies[it.id] = quoteCurrency;
      newNotes[it.id] = it.notes || '';
      // Carry over per-item margin set in Module 2's table (falls back to global default)
      newMarkups[it.id] = it.marginPercent ?? sqGlobalMargin;
    });
    setDraftItems(converted);
    setTradeItemCurrencies(newCurrencies);
    setTradeItemNotes(newNotes);
    setSellingPrices({});
    setMarkupPercents(newMarkups);
    setQuoteGenerated(false);
    setSentToTrade(false);
    setQuoteSource('supplier-archive');
    setSqSourceId(savedSQId);
    setQuoteType('trade');
    setQuoteMode('package');
    setTradePhase('pricing');
    setProjectInfoSubmitted(true);
    setAppMode('customer-quote');
    setView('configurator');
    setShowCurrencyModal(false);
  };

  /** Auto-fills Supplier Name/Contact from AI-detected info — only if the user hasn't typed one in already. */
  const applyDetectedSupplierInfo = (info?: { name?: string; contact?: string }) => {
    if (!info) return;
    setSupplierMeta(prev => ({
      ...prev,
      supplierName: prev.supplierName || info.name || prev.supplierName,
      supplierContact: prev.supplierContact || info.contact || prev.supplierContact,
    }));
  };

  const MAX_OCR_IMAGES = 12; // cap Gemini Vision payload size/cost per Excel upload

  /**
   * Reads text/specs OUT of Excel embedded images (DISPIMG + floating), not just displays them.
   * - Images whose Excel row matches a parsed item: fill that item's EMPTY fields only (never
   *   overwrites existing data), append OCR notes to remarks, flag dataConfidence='low' if unsure.
   * - Images with no matching row: pushed onto `rows` as new independent items,
   *   sourceType='excel-image-ocr', includeInGCI defaulted to false pending user review.
   * Mutates `rows` in place. Never throws — caller treats failure as non-fatal.
   */
  const ocrAndMergeExcelImages = async (args: {
    imgDataUrls: Record<string, string>;
    floatingBySheet: Record<string, Record<number, string>>;
    sheetName: string;
    colImg: number;
    dataRows: any[];
    headerRowOffset: number;
    rows: any[];
    rowIdxToItemIndex: Record<number, number>;
    supplierCurrency: string;
  }) => {
    const { imgDataUrls, floatingBySheet, sheetName, colImg, dataRows, headerRowOffset, rows, rowIdxToItemIndex, supplierCurrency } = args;

    // Collect every embedded image with its Excel row index (dedup by row, DISPIMG wins over floating)
    const byRow: Record<number, string> = {};
    const floatMap = floatingBySheet[sheetName] || {};
    for (const [rowIdxStr, dataUrl] of Object.entries(floatMap)) byRow[Number(rowIdxStr)] = dataUrl;
    if (colImg !== -1) {
      dataRows.forEach((row: any, idx: number) => {
        const cell = String(row[colImg] || '');
        const m = cell.match(/ID_([A-F0-9]+)/i);
        if (m) {
          const url = imgDataUrls[`ID_${m[1].toUpperCase()}`];
          if (url) byRow[headerRowOffset + idx] = url;
        }
      });
    }
    const entries = Object.entries(byRow).map(([rowIdxStr, dataUrl]) => ({ rowIdx: Number(rowIdxStr), dataUrl }));
    if (entries.length === 0) return;

    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) { console.warn('[ocrAndMergeExcelImages] No Gemini API key — skipping OCR, images still shown as thumbnails.'); return; }

    const capped = entries.slice(0, MAX_OCR_IMAGES);
    if (entries.length > MAX_OCR_IMAGES) {
      console.warn(`[ocrAndMergeExcelImages] ${entries.length} embedded images found, OCR-ing first ${MAX_OCR_IMAGES} only.`);
    }

    const ai = new GoogleGenAI({ apiKey });
    const imageParts = capped.map(e => {
      const m = e.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      return { inlineData: { mimeType: m?.[1] || 'image/png', data: m?.[2] || '' } };
    });
    const prompt = `You are reading ${capped.length} photo(s) extracted from inside a supplier's Excel quote (usually one per product row, occasionally a logo or unrelated image). They are attached in order, index 0 to ${capped.length - 1}.
For EACH photo, read any visible text (model number, dimensions/size, material, color, labels) and the product shown.
Return ONLY a JSON array, same length and order, of:
{"index":0,"productDetected":true,"model":"","material":"","color":"","sizeDimension":"","remarks":"","confidenceLevel":"high"}
Set "productDetected":false if the photo is a logo, blank, or has no identifiable product — leave other fields empty in that case. Leave any field empty string if not visible. Set "confidenceLevel":"low" if you are guessing. Never fabricate values.`;

    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }],
          config: { responseMimeType: 'application/json' },
        }),
        25000, 'Excel Embedded Image OCR'
      );
      const results: any[] = JSON.parse(response.text || '[]');
      if (!Array.isArray(results)) return;

      results.forEach((res, i) => {
        const entry = capped[i];
        if (!entry || !res) return;
        const conf: 'high' | 'low' = res.confidenceLevel === 'low' ? 'low' : 'high';
        const itemIdx = rowIdxToItemIndex[entry.rowIdx];

        if (itemIdx !== undefined) {
          // Matched to an existing parsed row — supplement only, never overwrite
          const item = rows[itemIdx];
          if (!item.model && res.model) item.model = res.model;
          if (!item.material && res.material) item.material = res.material;
          if (!item.color && res.color) item.color = res.color;
          if (!item.sizeDimension && res.sizeDimension) item.sizeDimension = res.sizeDimension;
          const noteBits: string[] = [];
          if (res.remarks) noteBits.push(`[Image OCR] ${res.remarks}`);
          if (conf === 'low') { item.dataConfidence = 'low'; noteBits.push('[Low confidence — verify against photo]'); }
          if (noteBits.length) item.remarks = item.remarks ? `${item.remarks} | ${noteBits.join(' | ')}` : noteBits.join(' | ');
        } else if (res.productDetected) {
          // No matching parsed row — independent item, defaults unchecked pending review
          rows.push({
            id: `sq-imgocr-${Date.now()}-${entry.rowIdx}`,
            originalName: res.model || 'Unidentified item (from embedded Excel image)',
            englishDescription: [res.model, res.material].filter(Boolean).join(' — ') || 'Identified from an embedded Excel image — please review',
            originalSpec: res.sizeDimension || '',
            sizeDimension: res.sizeDimension || '',
            imageDataUrl: entry.dataUrl,
            model: res.model || '', material: res.material || '', color: res.color || '',
            remarks: res.remarks || '',
            quantity: 1, unit: 'pc', targetUnitPrice: 0, targetTotal: 0,
            originalCurrency: supplierCurrency,
            status: 'Need Review' as const,
            suggestedCategory: FurnitureCategory.OTHER,
            confidence: 0.4,
            sourceType: 'excel-image-ocr' as const,
            dataConfidence: conf,
            includeInGCI: false,
          });
        }
      });
    } catch (err) {
      console.warn('[ocrAndMergeExcelImages] Gemini OCR call failed (non-fatal, images remain as thumbnails only):', err);
    }
  };

  const parseExcel = async (file: File) => {
    setIsProcessingAI(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        console.log('[REAL_EXCEL_PARSER] SheetNames:', workbook.SheetNames);

        // Embedded image extraction (DISPIMG cell images + floating/anchored drawings) —
        // reuses Module 3 (Package Quote)'s extractXlsxImages helper; never blocks parsing on failure.
        const { imgDataUrls: sqImgDataUrls, floatingBySheet: sqFloatingBySheet } =
          await extractXlsxImages(arrayBuffer).catch(() => ({ imgDataUrls: {}, floatingBySheet: {} }));
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('No sheets found in Excel file.');
        }

        // Multi-sheet: skip summary sheets, pick product detail sheet with most rows
        const SKIP_SHEET_WORDS = ['summary', 'total', 'totals', '总表', '汇总', '合计', '总计', 'overview', '汇总表'];
        console.log('[parseExcel] All sheets:', workbook.SheetNames);
        const skippedSheets = workbook.SheetNames.filter(n =>
          SKIP_SHEET_WORDS.some(k => n.toLowerCase().trim().includes(k))
        );
        const sheetCandidates = workbook.SheetNames.filter(n =>
          !SKIP_SHEET_WORDS.some(k => n.toLowerCase().trim().includes(k))
        );
        console.log('[parseExcel] Skipped sheets:', skippedSheets);
        console.log('[parseExcel] Candidate sheets:', sheetCandidates);
        // If all sheets are skipped keywords, fall back to all sheets
        const sheetsToTry = sheetCandidates.length > 0 ? sheetCandidates : workbook.SheetNames;
        let firstSheetName = sheetsToTry[0];
        let maxRows = 0;
        for (const sn of sheetsToTry) {
          const rows = (XLSX.utils.sheet_to_json(workbook.Sheets[sn], { header: 1 }) as any[][])
            .filter(r => r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
          console.log(`[parseExcel] Sheet "${sn}" has ${rows.length} data rows`);
          if (rows.length > maxRows) { maxRows = rows.length; firstSheetName = sn; }
        }
        console.log('[parseExcel] Selected sheet:', firstSheetName);
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

        if (!jsonData || jsonData.length < 1) {
          throw new Error('Excel file appears to be empty.');
        }

        // 1. Find Header Row (row with most keywords)
        const keywords = {
          item: ['furniture item', 'item', 'product', 'description', '分项', '产品名称', '品名', '项目名称'],
          spec: ['specification', 'size', 'dimension', 'specs', '规格', '尺寸', '描述'],
          qty: ['qty', 'quantity', '数量'],
          price: ['unit price', 'price', 'target price', '单价', '目标价'],
          total: ['total', 'amount', 'subtotal', '小计', '合计'],
          no: ['no.', 's.no', '序号', '编号', 'sn'] // To skip them as items
        };

        let bestHeaderRowIndex = -1;
        let maxMatchCount = 0;

        for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
          const row = (jsonData[i] || []).map((c: any) => String(c || '').toLowerCase().trim());
          let matchCount = 0;
          if (row.some((c: any) => keywords.item.some(k => c.includes(k)))) matchCount++;
          if (row.some((c: any) => keywords.qty.some(k => c.includes(k)))) matchCount++;
          if (row.some((c: any) => keywords.price.some(k => c.includes(k)))) matchCount++;
          
          if (matchCount > maxMatchCount) {
            maxMatchCount = matchCount;
            bestHeaderRowIndex = i;
          }
        }

        const headers = bestHeaderRowIndex !== -1 
          ? jsonData[bestHeaderRowIndex].map((h: any) => String(h || '').toLowerCase().trim())
          : jsonData[0].map((h: any) => String(h || '').toLowerCase().trim());

        const findCol = (kList: string[]) => headers.findIndex((h: string) => kList.some(k => h === k || (h.length > 1 && h.includes(k))));

        const mappings = {
          item: findCol(keywords.item),
          spec: findCol(keywords.spec),
          qty: findCol(keywords.qty),
          price: findCol(keywords.price),
          total: findCol(keywords.total),
          no: findCol(keywords.no)
        };

        // If Item Column detection is ambiguous (e.g. found No. as item), try to refine
        if (mappings.item === mappings.no && mappings.item !== -1) {
           mappings.item = headers.findIndex((h, idx) => idx !== mappings.no && keywords.item.some(k => h.includes(k)));
        }

        // AED-priority price column selection: prefer AED column, reject RMB/CNY/SAR columns
        const IGNORED_CURRENCIES = ['rmb', 'cny', 'sar', 'saudi riyal'];
        const aedPriceIdx = headers.findIndex((h: string) =>
          h === 'aed' ||
          (h.includes('aed') && keywords.price.some((k: string) => h.includes(k)))
        );
        if (aedPriceIdx !== -1) {
          mappings.price = aedPriceIdx;
        } else if (mappings.price !== -1 && IGNORED_CURRENCIES.some(c => headers[mappings.price].includes(c))) {
          // Current best match is an ignored currency — look for a clean price column
          mappings.price = headers.findIndex((h: string) =>
            keywords.price.some((k: string) => h === k || (h.length > 1 && h.includes(k))) &&
            !IGNORED_CURRENCIES.some(c => h.includes(c))
          );
        }

        const autoMappings = {
          item:  mappings.item  !== -1 ? mappings.item  : 0,
          spec:  mappings.spec  !== -1 ? mappings.spec  : 1,
          qty:   mappings.qty   !== -1 ? mappings.qty   : 2,
          price: mappings.price !== -1 ? mappings.price : 4,
          total: mappings.total !== -1 ? mappings.total : 5,
        };

        if (appMode === 'supplier-quote') {
          // ── Supplier Quote mode: auto-process without mapping dialog ──────
          // No Gemini involved. Parse immediately and show items.
          // Allow any price column (AED, CNY, USD, etc.) — do not require AED column name
          // mappings.price === -1 just means no keyword match; autoMappings falls back to col 4 which is fine
          if (mappings.price === -1) {
            console.warn('[parseExcel] No named price column found, using fallback column', autoMappings.price);
          }
          const dataRows = jsonData.slice(bestHeaderRowIndex !== -1 ? bestHeaderRowIndex + 1 : 1);
          console.log('[parseExcel] mappings:', mappings, '| autoMappings:', autoMappings, '| bestHeaderRowIndex:', bestHeaderRowIndex);

          // Guard: if item column contains DISPIMG formulas, it's an image column — re-detect
          {
            const sample = dataRows.slice(0, 5).map((r: any) => String(r[autoMappings.item] || ''));
            if (sample.some(v => v.includes('DISPIMG'))) {
              const altItem = headers.findIndex((h: string, i: number) =>
                i !== autoMappings.item && keywords.item.some(k => h === k || (h.length > 1 && h.includes(k)))
              );
              if (altItem !== -1) {
                autoMappings.item = altItem;
              } else {
                // Fallback: scan all columns for one that has no DISPIMG
                for (let ci = 0; ci < (dataRows[0] || []).length; ci++) {
                  if (ci === autoMappings.item) continue;
                  const colSample = dataRows.slice(0, 5).map((r: any) => String(r[ci] || ''));
                  const hasText = colSample.some(v => v.trim() && !v.includes('DISPIMG') && !/^\d+$/.test(v.trim()));
                  if (hasText) { autoMappings.item = ci; break; }
                }
              }
            }
          }

          // Detect which column (if any) holds embedded cell images — same two-step approach as
          // Module 3 (Package Quote): try header keyword match first, then fall back to scanning
          // data rows for DISPIMG formula text (handles headers that don't say "图片"/"description").
          const findColLocal = (kList: string[]) => headers.findIndex((h: string) => kList.some(k => h === k || (h.length > 1 && h.includes(k))));
          let colImg = findColLocal(['图片', 'description', '图']);
          if (colImg === -1) {
            for (let ci = 0; ci < (dataRows[0] || []).length; ci++) {
              const colSample = dataRows.slice(0, 5).map((r: any) => String(r[ci] || ''));
              if (colSample.some(v => v.includes('DISPIMG'))) { colImg = ci; break; }
            }
          } else {
            // Header matched, but verify it actually contains DISPIMG data — if not, it's probably
            // a real "description" text column, not the image column.
            const colSample = dataRows.slice(0, 5).map((r: any) => String(r[colImg] || ''));
            if (!colSample.some(v => v.includes('DISPIMG'))) {
              colImg = -1;
              for (let ci = 0; ci < (dataRows[0] || []).length; ci++) {
                const sample = dataRows.slice(0, 5).map((r: any) => String(r[ci] || ''));
                if (sample.some(v => v.includes('DISPIMG'))) { colImg = ci; break; }
              }
            }
          }

          // Extra detail columns — best-effort, missing column just means empty field
          const colModel   = findColLocal(['model','sku','型号','货号']);
          const colMaterial= findColLocal(['material','材质','材料']);
          const colColor   = findColLocal(['color','colour','颜色']);
          const colMoq     = findColLocal(['moq','minimum order','起订量']);
          const colPackaging = findColLocal(['packaging','package','包装']);
          const colDelivery = findColLocal(['delivery','lead time','交期','交货']);
          const colPayment  = findColLocal(['payment','付款']);
          const colRemarks  = findColLocal(['remark','note','备注']);
          const colSize     = findColLocal(['size','dimension','尺寸']);

          const TERM_KEYWORDS = ['payment','lead time','delivery time','validity','warranty','guarantee','remark','note','notes','condition','terms','incoterm'];
          const SKIP_ROW_WORDS = ['subtotal','grand total','合计','总计','小计','总价','合价','grand'];
          const NOTE_PREFIXES = ['注：','注:','备注','note:','note：','*','（注','(注'];
          const headerRowOffset = bestHeaderRowIndex !== -1 ? bestHeaderRowIndex + 1 : 1;
          const rows: any[] = [];
          const rowIdxToItemIndex: Record<number, number> = {}; // origRowIdx → index in `rows`, used to merge image OCR results
          dataRows.forEach((row: any, idx: number) => {
            const origRowIdx = headerRowOffset + idx; // 0-based Excel row, matches floating-image anchors
            const name = String(row[autoMappings.item] || '').trim();
            const nameLower = name.toLowerCase();
            if (!name || name === '0') return;
            const isHeader = nameLower.includes('item') || nameLower.includes('品名') || nameLower.includes('产品名称') || nameLower.includes('furniture item');
            const isSerial = /^\d+$/.test(name) || ['no','no.','s.no','序号','编号','sn'].includes(nameLower) || (name.length < 2 && /^\d$/.test(name));
            if (isHeader || isSerial) return;
            // Skip summary/total rows
            if (SKIP_ROW_WORDS.some(k => nameLower.trim() === k.toLowerCase() || nameLower.trim().startsWith(k.toLowerCase() + ' ') || nameLower.trim().startsWith(k.toLowerCase() + '：') || nameLower.trim().startsWith(k.toLowerCase() + ':'))) return;
            // Skip Chinese note/remark rows
            if (NOTE_PREFIXES.some(p => name.startsWith(p))) return;
            // Skip rows that look like numbered continuation notes (e.g. "2、以上价为出厂价")
            if (/^[1-9一二三四五六七八九][、。．,.]\s*/.test(name)) return;
            const isTerm = TERM_KEYWORDS.some(k => nameLower.includes(k));
            if (isTerm) {
              const termVal = String(row[autoMappings.spec] || row[autoMappings.price] || '').trim();
              setTradeTerms(prev => prev ? `${prev}\n${name}${termVal ? ': ' + termVal : ''}` : `${name}${termVal ? ': ' + termVal : ''}`);
              return;
            }
            const unitPrice = parseFloat(String(row[autoMappings.price] || '0').replace(/[^0-9.-]/g, '')) || 0;
            const qty = parseFloat(String(row[autoMappings.qty] || '1').replace(/[^0-9.-]/g, '')) || 1;
            const supplierCurrencyAtParse = supplierMeta.currency || 'AED';
            const rawSpec = String(row[autoMappings.spec] || '').trim();
            const rawMaterial = colMaterial !== -1 ? String(row[colMaterial] || '').trim() : '';
            // Best-effort EN description: translate name + material via Package Quote's CN→EN helpers as a starting point (user can edit)
            const enName = pqTranslate(name);
            const enMaterial = rawMaterial ? materialToEn(rawMaterial) : '';
            const englishDescription = [enName, enMaterial].filter(Boolean).join(' — ');
            // Embedded image for this row: DISPIMG cell image takes priority, else floating/anchored image at this row
            const rawImgCell = colImg !== -1 ? String(row[colImg] || '') : '';
            const imgIdMatch = rawImgCell.match(/ID_([A-F0-9]+)/i);
            const dispimgId = imgIdMatch ? `ID_${imgIdMatch[1].toUpperCase()}` : undefined;
            const imageDataUrl = (dispimgId ? sqImgDataUrls[dispimgId] : undefined)
              ?? sqFloatingBySheet[firstSheetName]?.[origRowIdx];
            rows.push({
              id: `sq-xl-${Date.now()}-${idx}`,
              originalName: name,
              englishDescription,
              originalSpec: rawSpec,
              sizeDimension: colSize !== -1 ? String(row[colSize] || '').trim() : '',
              imageDataUrl,
              model:    colModel    !== -1 ? String(row[colModel] || '').trim()    : '',
              material: rawMaterial,
              color:    colColor    !== -1 ? String(row[colColor] || '').trim()    : '',
              moq:        colMoq        !== -1 ? String(row[colMoq] || '').trim()        : '',
              packaging:  colPackaging  !== -1 ? String(row[colPackaging] || '').trim()  : '',
              deliveryTime: colDelivery !== -1 ? String(row[colDelivery] || '').trim()   : '',
              paymentTerms: colPayment  !== -1 ? String(row[colPayment] || '').trim()    : '',
              remarks:    colRemarks    !== -1 ? String(row[colRemarks] || '').trim()    : '',
              quantity: qty,
              unit: 'pc',
              targetUnitPrice: unitPrice,
              targetTotal: unitPrice * qty,
              originalUnitCost: unitPrice,
              originalCurrency: supplierCurrencyAtParse,
              originalTotal: unitPrice * qty,
              status: 'Confirmed' as const,
              suggestedCategory: FurnitureCategory.OTHER,
              confidence: 1,
              sourceType: 'excel' as const,
            });
            rowIdxToItemIndex[origRowIdx] = rows.length - 1;
          });

          // ── Embedded image OCR / Vision: read text & specs out of Excel DISPIMG/floating
          // images, not just display them. Matched images enrich their row (only empty fields,
          // never overwrites user/AI data already present); unmatched images become independent
          // "Need Review" items tagged sourceType='excel-image-ocr'. Never blocks parsing on failure.
          try {
            await ocrAndMergeExcelImages({
              imgDataUrls: sqImgDataUrls,
              floatingBySheet: sqFloatingBySheet,
              sheetName: firstSheetName,
              colImg,
              dataRows,
              headerRowOffset,
              rows,
              rowIdxToItemIndex,
              supplierCurrency: supplierMeta.currency || 'AED',
            });
          } catch (ocrErr) {
            console.warn('[parseExcel] Embedded image OCR failed (non-fatal, rows kept as-is):', ocrErr);
          }

          console.log('[parseExcel] Final parsed rows:', rows.length, rows.map(r => r.originalName));
          if (rows.length === 0) {
            const msg = 'No items found in Excel. Check that item names and prices are in the correct columns.';
            setSqParseError(msg);
            setSqParseStatus('error');
            alert(`❌ ${msg}`);
          } else {
            setDraftItems(rows);
            setSqParseStatus('done');
          }
        } else {
          // ── Normal mode: show column mapping dialog ───────────────────────
          setRawExcelData(jsonData.slice(bestHeaderRowIndex !== -1 ? bestHeaderRowIndex : 0));
          setExcelMappings(autoMappings);
          setShowMapping(true);
        }

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error parsing Excel:', err);
        setSqParseError(errMsg);
        setSqParseStatus('error');
        alert(`❌ Excel parse failed: ${errMsg}`);
      } finally {
        setIsProcessingAI(false);
      }
    };

    reader.onerror = () => {
      alert(t('Failed to read file.'));
      setIsProcessingAI(false);
    };

    try {
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error('readAsArrayBuffer error:', err);
      setIsProcessingAI(false);
    }
  };

  const processMappedData = async () => {
    if (!rawExcelData) return;

    setIsProcessingAI(true);
    setShowMapping(false);

    try {
      const dataRows = rawExcelData.slice(1); // Skip header
      const rows = dataRows.map((row: any, idx: number) => {
        const name = String(row[excelMappings.item] || '').trim();
        
        // Skip conditions
        const nameLower = name.toLowerCase();
        const isHeader = nameLower.includes('item') || nameLower.includes('品名');
        const isSerialOnly = /^\d+$/.test(name) ||
                            ['no', 'no.', 's.no', 's.no.', '序号', '编号', 'sn', '序号.', '品名', '分项'].includes(nameLower) ||
                            (name.length < 2 && /^\d$/.test(name));
        const isEmpty = !name || name === '0';
        // Terms / conditions rows — route to tradeTerms, not product items
        const TERM_KEYWORDS = ['payment', 'lead time', 'delivery time', 'validity', 'warranty', 'guarantee', 'remark', 'note', 'notes', 'condition', 'terms', 'incoterm', 'port of loading', 'port of discharge'];
        const isTerm = TERM_KEYWORDS.some(k => nameLower.includes(k));
        if (isTerm) {
          // collect into tradeTerms
          const termValue = String(row[excelMappings.spec] || row[excelMappings.price] || '').trim();
          setTradeTerms(prev => prev ? `${prev}\n${name}${termValue ? ': ' + termValue : ''}` : `${name}${termValue ? ': ' + termValue : ''}`);
          return null;
        }

        if (isHeader || isSerialOnly || isEmpty) return null;

        return {
          id: `draft-xl-${Date.now()}-${idx}`,
          originalName: name,
          originalSpec: String(row[excelMappings.spec] || '').trim(),
          quantity: parseFloat(String(row[excelMappings.qty] || '0').replace(/[^0-9.-]/g, '')) || 1,
          unit: 'pc',
          targetUnitPrice: parseFloat(String(row[excelMappings.price] || '0').replace(/[^0-9.-]/g, '')) || 0,
          targetTotal: parseFloat(String(row[excelMappings.total] || '0').replace(/[^0-9.-]/g, '')) || 0,
          status: 'Need Review' as const
        };
      }).filter(r => r !== null);

      if (rows.length === 0) {
        throw new Error('No valid furniture items found in the selected columns.');
      }

      await processWithAI(rows);
    } catch (err) {
      console.error('Processing mapped data failed:', err);
      alert(t('Processing failed') + ': ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsProcessingAI(false);
    }
  };

  const analyzeImage = async (file: File) => {
    setIsProcessingAI(true);
    try {
      const base64 = await fileToBase64(file);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const prompt = `
        Analyze this supplier quote / requirement image. It may be a WeChat screenshot, phone photo, Excel screenshot, or scanned PDF page, in Chinese or English.
        Read every detail visible, including small print, model numbers, and text inside photos of the products themselves.
        Separate the content into TWO categories:

        1. PRODUCT ITEMS: Real products or services with quantities and prices.
        2. TERMS: Any non-product content such as payment terms, lead time, delivery time, validity, warranty, remarks, notes, conditions, supplier name/contact.

        Do NOT include the following as product items (put them in terms instead):
        - Payment / Payment terms
        - Lead time / Delivery time
        - Validity / Offer validity
        - Warranty / Guarantee
        - Remarks / Notes / Comments
        - Supplier name / contact info
        - Any row that has no quantity or no price and is clearly a condition or remark

        For each item, also write a professional English description (not a literal translation — phrase it the way it would read on a formal quotation) while keeping the supplier's original text untouched.

        Return ONLY valid JSON in this exact format:
        {
          "items": [
            {
              "originalName": "Item name as written by supplier (keep Chinese if Chinese)",
              "englishDescription": "Professional English description",
              "originalSpec": "Size/Spec/Description/dimensions",
              "sizeDimension": "Explicit size or dimensions only, e.g. 2000*850*670mm, if distinguishable from general spec",
              "model": "Model or SKU number if any",
              "material": "Material description if mentioned",
              "color": "Color if mentioned",
              "quantity": 1,
              "unit": "pc",
              "targetUnitPrice": 0,
              "targetTotal": 0,
              "originalCurrency": "Currency code if visible e.g. RMB/USD/AED",
              "moq": "Minimum order quantity if mentioned",
              "packaging": "Packaging method if mentioned",
              "deliveryTime": "Lead/delivery time if mentioned",
              "paymentTerms": "Payment terms if mentioned",
              "remarks": "Any other notes for this item"
            }
          ],
          "terms": "Payment: ... | Lead time: ... | Notes: ...",
          "supplierInfo": { "name": "supplier name if visible", "contact": "phone/email/contact if visible" }
        }
        Leave a field as empty string if not present — never fabricate values. If no terms found, set terms to "". If no items found, set items to [].
      `;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { role: 'user', parts: [
            { text: prompt },
            { inlineData: { mimeType: file.type, data: base64 } }
          ]}
        ],
        config: { responseMimeType: "application/json" }
      });

      const parsed = JSON.parse(response.text || '{}');
      const extractedItems: any[] = Array.isArray(parsed) ? parsed : (parsed.items || []);
      const extractedTerms: string = parsed.terms || '';
      if (extractedTerms) setTradeTerms(prev => prev ? `${prev}\n${extractedTerms}` : extractedTerms);
      applyDetectedSupplierInfo(parsed.supplierInfo);
      const rows = extractedItems.map((it: any, idx: number) => ({
        ...it,
        id: `draft-img-${Date.now()}-${idx}`,
        status: 'Need Review' as const,
        sourceType: 'image' as const,
      }));

      await processWithAI(rows);
    } catch (err) {
      console.error('Vision Analysis Error:', err);
      alert('AI Vision Analysis failed.');
    } finally {
      setIsProcessingAI(false);
    }
  };

  // ── DOCX (Word) supplier quotes — text + any embedded photos, read together ───
  const parseDocx = async (file: File) => {
    setIsProcessingAI(true);
    setSqParseStatus('parsing');
    setSqParseError('');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docFile = zip.files['word/document.xml'];
      if (!docFile) throw new Error('Not a valid .docx file (word/document.xml not found).');
      const xml = await docFile.async('text');

      // Flatten Word XML into readable text: table cells → " | ", paragraphs/rows → newline
      const text = xml
        .replace(/<\/w:tc>/g, ' | ')
        .replace(/<\/w:tr>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .split('\n').map(l => l.replace(/\s*\|\s*\|+/g, ' | ').trim()).filter(Boolean).join('\n');

      if (!text.trim()) throw new Error('No readable text found in this .docx file.');

      // Embedded photos (word/media/*) — can't be anchored to a specific row reliably in Word,
      // so they're sent alongside the text and the AI is asked to cross-reference by context.
      const mediaPaths = Object.keys(zip.files).filter(f => f.startsWith('word/media/'));
      const imageParts: any[] = [];
      for (const path of mediaPaths.slice(0, 10)) { // cap to keep payload reasonable
        try {
          const b64 = await zip.files[path].async('base64');
          const ext = path.split('.').pop()?.toLowerCase() || 'png';
          if (!['png','jpg','jpeg'].includes(ext)) continue;
          const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          imageParts.push({ inlineData: { mimeType: mime, data: b64 } });
        } catch { /* skip unreadable media */ }
      }

      const apiKey = process.env.GEMINI_API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `Analyze this supplier quote extracted from a Word document (Chinese or English). The text below was flattened from a Word table/paragraphs — " | " separates cells in the same row.
${imageParts.length > 0 ? `${imageParts.length} photo(s) embedded in the document are attached after this text — use them for extra detail (model numbers, appearance, labels) where relevant, cross-referencing by context.` : ''}

Separate into PRODUCT ITEMS and TERMS (payment/lead time/validity/remarks/supplier info) exactly like a supplier quote PDF would be read.
For each item, also write a professional English description (not a literal translation) while keeping the supplier's original text untouched.

Document text:
"""
${text.slice(0, 12000)}
"""

Return ONLY valid JSON:
{"items":[{
  "originalName":"name as written by supplier (keep Chinese if Chinese)",
  "englishDescription":"professional English description",
  "originalSpec":"size/spec/dimensions",
  "sizeDimension":"explicit size or dimensions only, e.g. 2000*850*670mm, if distinguishable from general spec",
  "model":"model or SKU if any","material":"material","color":"color if mentioned",
  "quantity":1,"unit":"pc","targetUnitPrice":0,"targetTotal":0,
  "originalCurrency":"currency code if visible e.g. RMB/USD/AED",
  "moq":"minimum order quantity if mentioned","packaging":"packaging method if mentioned",
  "deliveryTime":"lead/delivery time if mentioned","paymentTerms":"payment terms if mentioned",
  "remarks":"any other notes for this item"
}],"terms":"...","supplierInfo":{"name":"supplier name if visible","contact":"phone/email/contact if visible"}}
Leave a field as empty string if not present. Never fabricate values.`;

      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }],
        }),
        25000, 'DOCX AI Analysis'
      );

      const rawText = response.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      const extractedItems: any[] = Array.isArray(parsed) ? parsed : (parsed.items || []);
      const extractedTerms: string = parsed.terms || '';
      if (extractedTerms) setTradeTerms(prev => prev ? `${prev}\n${extractedTerms}` : extractedTerms);
      applyDetectedSupplierInfo(parsed.supplierInfo);

      const rows = extractedItems.map((it: any, idx: number) => ({
        ...it,
        id: `draft-docx-${Date.now()}-${idx}`,
        status: 'Need Review' as const,
        sourceType: 'docx' as const,
      }));

      if (rows.length === 0) {
        alert(`DOCX: AI returned 0 items.\nExtracted text preview:\n${text.slice(0, 300)}`);
        return;
      }

      await processWithAI(rows);
      setSqParseStatus('done');
    } catch (err: any) {
      const msg = err?.message || err?.toString() || 'unknown error';
      console.error('[DOCX] Error:', err);
      setSqParseError(msg);
      setSqParseStatus('error');
      alert(`❌ DOCX parse failed:\n${msg}`);
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleAnalyze = async () => {
    if (!importText.trim()) return;
    
    setIsProcessingAI(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const prompt = `
        Analyze this supplier quote / requirement text.
        Separate the content into TWO categories:

        1. PRODUCT ITEMS: Real products or services with quantities and prices.
        2. TERMS: Any non-product content such as payment terms, lead time, delivery time, validity, warranty, remarks, notes, conditions.

        Do NOT include the following as product items (put them in terms instead):
        - Payment / Payment terms
        - Lead time / Delivery time
        - Validity / Offer validity
        - Warranty / Guarantee
        - Remarks / Notes / Comments
        - Any line that has no quantity or no price and is clearly a condition or remark

        For each item, also write a professional English description (not a literal translation) while keeping the original supplier text untouched.

        Input Text:
        ${importText}

        Return ONLY valid JSON in this exact format:
        {
          "items": [
            {
              "originalName": "Item name as written by supplier (keep Chinese if Chinese)",
              "englishDescription": "Professional English description",
              "originalSpec": "Size/Spec/Description",
              "sizeDimension": "Explicit size or dimensions only, e.g. 2000*850*670mm, if distinguishable from general spec",
              "model": "Model or SKU number if any",
              "material": "Material description if mentioned",
              "color": "Color if mentioned",
              "quantity": 1,
              "unit": "pc",
              "targetUnitPrice": 0,
              "targetTotal": 0,
              "originalCurrency": "Currency code if visible e.g. RMB/USD/AED",
              "moq": "Minimum order quantity if mentioned",
              "packaging": "Packaging method if mentioned",
              "deliveryTime": "Lead/delivery time if mentioned",
              "paymentTerms": "Payment terms if mentioned",
              "remarks": "Any other notes for this item"
            }
          ],
          "terms": "Payment: ... | Lead time: ... | Notes: ...",
          "supplierInfo": { "name": "supplier name if visible", "contact": "phone/email/contact if visible" }
        }
        Leave a field as empty string if not present. If no terms found, set terms to "". If no items found, set items to [].
      `;

      const response = await withTimeout(
        ai.models.generateContent({ model: GEMINI_MODEL, contents: prompt, config: { responseMimeType: "application/json" } }),
        25000, 'AI Text Analysis'
      );

      const parsed = JSON.parse(response.text || '{}');
      const extractedItems: any[] = Array.isArray(parsed) ? parsed : (parsed.items || []);
      const extractedTerms: string = parsed.terms || '';
      if (extractedTerms) setTradeTerms(prev => prev ? `${prev}\n${extractedTerms}` : extractedTerms);
      applyDetectedSupplierInfo(parsed.supplierInfo);
      const rows = extractedItems.map((it: any, idx: number) => ({
        ...it,
        id: `draft-text-${Date.now()}-${idx}`,
        status: 'Need Review' as const,
        sourceType: 'text' as const,
      }));

      await processWithAI(rows);
      setImportText('');
    } catch (err: any) {
      const msg = err?.message || 'AI Text Analysis failed.';
      console.error('Text Analysis Error:', err);
      setSqParseError(msg);
      setSqParseStatus('error');
      alert(`❌ ${msg}`);
    } finally {
      setIsProcessingAI(false);
    }
  };

  const processWithAI = async (items: any[]) => {
    if (!items || items.length === 0) {
      setActiveTab('draft');
      return;
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        throw new Error('Gemini API Key is not configured. Please check your environment.');
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const itemDescriptions = items.map(it => `[Item: ${it.originalName}, Spec: ${it.originalSpec}]`).join('\n');
      
      const prompt = `
        You are a high-precision furniture classification engine for GCI Living. 
        Analyze the following list of items and map each to exactly one of these CATEGORIES:
        - Bed
        - Sofa
        - Wardrobe
        - Cabinet
        - Table / Desk
        - Chair
        - TV Unit
        - Dining Table
        - Other / Non-furniture (For appliances, accessories, electronics, or items that aren't wooden/upholstered furniture)

        Rules:
        1. If an item name contains multiple items (e.g., "Desk with Chair", "Table & 4 Chairs"), mark isSplittable as true.
        2. Assign a confidence score (0.0 to 1.0).
        3. Determine status: "Confirmed" if clear mapping, "Need Review" if ambiguous, "Need Split" if multiple items found.
        4. Return ONLY valid JSON as an array of objects matching this schema:
        { "category": "one of the category names above or 'unknown'", "confidence": 0.95, "isSplittable": false, "status": "Confirmed" }
        
        List to analyze:
        ${itemDescriptions}
      `;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                isSplittable: { type: Type.BOOLEAN },
                status: { type: Type.STRING }
              }
            }
          }
        }
      });

      const aiResults = JSON.parse(response.text || '[]');
      
      const categoryMap: Record<string, FurnitureCategory> = {
        'Bed': FurnitureCategory.BED,
        'Sofa': FurnitureCategory.SOFA,
        'Wardrobe': FurnitureCategory.WARDROBE,
        'Cabinet': FurnitureCategory.CABINET,
        'Table / Desk': FurnitureCategory.TABLE_DESK,
        'Chair': FurnitureCategory.CHAIR,
        'TV Unit': FurnitureCategory.TV_UNIT,
        'Dining Table': FurnitureCategory.DINING_TABLE,
        'Other / Non-furniture': FurnitureCategory.OTHER
      };

      const mappedItems: DraftItem[] = items.map((it, idx) => {
        const res = aiResults[idx] || {};
        const englishDescription = it.englishDescription?.trim()
          || [pqTranslate(it.originalName || ''), it.material ? materialToEn(it.material) : ''].filter(Boolean).join(' — ');
        return {
          ...it,
          englishDescription,
          suggestedCategory: categoryMap[res.category as string] || 'unknown',
          confidence: res.confidence || 0.5,
          isSplittable: res.isSplittable || false,
          status: res.status || 'Need Review'
        };
      });

      setDraftItems(mappedItems);
      setActiveTab('draft');
    } catch (err) {
      console.error('AI Processing Error:', err);
      // Fallback: load items without AI mapping
      setDraftItems(items.map(it => ({
        ...it,
        englishDescription: it.englishDescription?.trim() || pqTranslate(it.originalName || ''),
        suggestedCategory: 'unknown',
        confidence: 0,
        status: 'Need Review'
      })));
      setActiveTab('draft');
    }
  };

  const handlePushToConfigurator = (item: DraftItem) => {
    if (item.suggestedCategory === 'unknown') {
      alert(t('Please confirm category before configuring.'));
      return;
    }

    if (item.suggestedCategory === FurnitureCategory.OTHER) {
      const newItem: PackageItem = {
        id: `pkg-${Date.now()}`,
        category: FurnitureCategory.OTHER,
        config: { ...genericConfig },
        quantity: item.quantity,
        bom: [{
          component: item.originalName,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.targetUnitPrice,
          total: item.targetTotal
        }],
        totalAmount: item.targetUnitPrice
      };
      setPackageItems([...packageItems, newItem]);
      setDraftItems(draftItems.filter(it => it.id !== item.id));
      setActiveTab('items');
      alert(t('Added to package successfully'));
      return;
    }

    // Set global states to navigate to specific configurator
    setSelectedCategory(item.suggestedCategory as FurnitureCategory);
    setQuoteMode('package'); // Ensure we return to package mode if coming from here
    setCurrentStep(0);
    setDraftItems(draftItems.filter(it => it.id !== item.id));

    // Inject specifications from split item if available
    const updatePayload = {
      notes: item.notes || '',
      sofaType: item.suggestedCategory === FurnitureCategory.SOFA ? (item.specOverride || '') : undefined,
    };
    
    // Helper to find the right set function
    if (item.suggestedCategory === FurnitureCategory.BED) setConfig(p => ({ ...p, notes: item.notes || '' }));
    else if (item.suggestedCategory === FurnitureCategory.SOFA) setSofaConfig(p => ({ ...p, sofaType: item.specOverride || '', notes: item.notes || '' }));
    else if (item.suggestedCategory === FurnitureCategory.WARDROBE) setWardrobeConfig(p => ({ ...p, notes: item.notes || '' }));
    else if (item.suggestedCategory === FurnitureCategory.CABINET) setCabinetConfig(p => ({ ...p, notes: item.notes || '' }));
    else if (item.suggestedCategory === FurnitureCategory.TABLE_DESK) setGenericConfig(p => ({ ...p, notes: item.notes || '' }));
    else if (item.suggestedCategory === FurnitureCategory.CHAIR) setChairConfig(p => ({ ...p, notes: item.notes || '' }));
    else if (item.suggestedCategory === FurnitureCategory.TV_UNIT) setTVUnitConfig(p => ({ ...p, notes: item.notes || '' }));
    else if (item.suggestedCategory === FurnitureCategory.DINING_TABLE) setDiningTableConfig(p => ({ ...p, notes: item.notes || '' }));
  };

  const CATEGORY_ICONS: Record<FurnitureCategory, any> = {
    [FurnitureCategory.BED]: Bed,
    [FurnitureCategory.SOFA]: Armchair,
    [FurnitureCategory.WARDROBE]: Columns,
    [FurnitureCategory.CABINET]: Archive,
    [FurnitureCategory.TABLE_DESK]: Trello,
    [FurnitureCategory.CHAIR]: Layout, // Using Layout for Chair for now
    [FurnitureCategory.TV_UNIT]: Tv,
    [FurnitureCategory.DINING_TABLE]: Utensils,
    [FurnitureCategory.OTHER]: Package
  };

  const renderProjectInfo = () => (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 ease-out">
      {/* Back to Workflow Home */}
      <button onClick={() => setAppMode('landing')} className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">
        <ChevronLeft className="w-4 h-4" /> Workflow Home
      </button>
      <StepIndicator current={1} />
      <div className="text-center space-y-6">
        <div className="inline-block px-4 py-1.5 bg-brand-gold/10 rounded-full mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gold">Project Engineering Workspace</p>
        </div>
        <h2 className="text-5xl font-serif italic text-brand-brown tracking-tight">{t('Project Information')}</h2>
        <p className="text-xs font-medium text-brand-brown-muted max-w-xl mx-auto leading-relaxed">
          {t('Initialization phase')}
        </p>
      </div>
      
      <div className="max-w-4xl mx-auto w-full">
        <div className="bg-white p-12 sm:p-20 rounded-[64px] border border-brand-beige shadow-[0_30px_100px_-20px_rgba(62,39,35,0.05)] relative overflow-hidden group">
          {/* Decorative accents */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-beige/20 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-1000" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-brand-gold/5 rounded-full -ml-12 -mb-12" />

          <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-12">
            {[
              { key: 'customerProjectName', label: t('Customer / Project Name'), required: true, placeholder: t('Customer / Project Name') },
              { key: 'phoneWhatsApp', label: t('Phone / WhatsApp'), placeholder: '+971 ...' },
              { key: 'salesperson', label: t('Salesperson'), placeholder: t('Salesperson') },
              { key: 'quoteNumber', label: t('Quotation No.'), placeholder: 'Auto-generated' },
              { key: 'date', label: t('Date'), type: 'date' },
            ].map(field => (
              <div key={field.key} className="space-y-4 group/input">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-[0.2em] flex items-center gap-1.5 transition-colors group-focus-within/input:text-brand-gold">
                    {field.label}
                    {field.required && <span className="text-brand-gold font-serif italic text-lg leading-none">*</span>}
                  </label>
                </div>
                <input
                  type={field.type || 'text'}
                  value={quoteInfo[field.key as keyof typeof quoteInfo]}
                  placeholder={field.placeholder}
                  onChange={e => {
                    setQuoteInfo({...quoteInfo, [field.key]: e.target.value});
                    if (field.required && validationError) setValidationError('');
                  }}
                  className="w-full bg-transparent border-b-2 border-brand-beige text-2xl font-serif italic text-brand-brown focus:border-brand-gold outline-none pb-4 transition-all duration-300 placeholder:text-brand-brown/10 selection:bg-brand-gold/20"
                />
              </div>
            ))}
          </div>

          <AnimatePresence>
            {validationError && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-12 p-4 bg-brand-gold/10 border border-brand-gold/20 rounded-[24px] flex items-center justify-center gap-3 animate-pulse"
              >
                <div className="w-1.5 h-1.5 bg-brand-gold rounded-full" />
                <p className="text-[10px] font-bold text-brand-brown uppercase tracking-[0.2em]">
                  {validationError}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-20 flex justify-center">
            <button
              onClick={() => {
                if (!quoteInfo.customerProjectName) {
                  setValidationError(t('Project name required'));
                  return;
                }
                setValidationError('');
                // Reset path selection so user picks quote type fresh
                setQuoteType(null);
                setQuoteMode(null);
                setTradePhase(null);
                setProjectInfoSubmitted(true);
              }}
              className="px-16 py-8 bg-brand-brown text-brand-ivory rounded-[36px] font-bold uppercase tracking-[0.3em] text-[11px] shadow-[0_25px_60px_-15px_rgba(62,39,35,0.3)] hover:bg-brand-brown/95 hover:-translate-y-1 active:scale-95 transition-all duration-500 flex items-center gap-6"
            >
              {t('Next: Select Category')} 
              <div className="w-8 h-8 rounded-full bg-brand-gold/20 flex items-center justify-center group-hover:bg-brand-gold/30 transition-colors">
                <ChevronRight className="w-4 h-4 text-brand-gold" />
              </div>
            </button>
          </div>

          {/* Load from History — done via History tab, not here */}
        </div>
      </div>
    </div>
  );

  // ── Trade & Sourcing: Manual Pricing Review ─────────────────────────────
  const renderTradeQuoteReview = () => {
    // includeInGCI !== false is a no-op for direct Trade & Sourcing/BOQ uploads (that checkbox only
    // exists in Module 2's Supplier Cost Items screen, so those items never have it set to false).
    // For Module 2-sourced quotes it enforces row-level exclusion all the way through this screen,
    // the "Send to TRADE" payload, and the generated PDF (all three read from this same `confirmed`).
    const confirmed = draftItems.filter(it => it.status === 'Confirmed' && it.includeInGCI !== false);
    const totalSupplierCost = confirmed.reduce((s, it) => s + it.targetUnitPrice * it.quantity, 0);
    console.log('[Pricing View] Confirmed items:', confirmed.length, '| Supplier Total:', totalSupplierCost.toFixed(2));
    // sellingPrices[id] = LINE TOTAL (not unit price). No * quantity needed.
    const totalSelling = confirmed.reduce((s, it) => s + (sellingPrices[it.id] || 0), 0);
    const totalProfit = totalSelling - totalSupplierCost;
    const overallMargin = totalSupplierCost > 0 ? (totalProfit / totalSupplierCost) * 100 : 0;
    const totalVAT = totalSelling * 0.05;
    const grandTotal = totalSelling + totalVAT;

    const handleSendTradeToTrade = () => {
      if (!quoteInfo.customerProjectName) { alert('请填写客户/项目名称'); return; }
      if (totalSelling <= 0) { alert('请先输入销售价格'); return; }
      const payload = {
        customerName: quoteInfo.customerProjectName,
        projectName: quoteInfo.customerProjectName,
        quoteNo: quoteInfo.quoteNumber || `GCI-TRADE-${Date.now()}`,
        quoteDate: quoteInfo.date,
        currency: 'AED',
        subtotal: Number(totalSelling.toFixed(2)),
        vatAmount: Number(totalVAT.toFixed(2)),
        totalAmount: Number(grandTotal.toFixed(2)),
        marginRate: Number(overallMargin.toFixed(1)),
        costAmount: Number(totalSupplierCost.toFixed(2)),
        profitAmount: Number(totalProfit.toFixed(2)),
        items: confirmed.map(it => ({
          desc: `${it.originalName}${it.originalSpec ? ` (${it.originalSpec})` : ''}`,
          qty: it.quantity,
          // sellingPrices[id] is line total; TRADE expects unit price
          unitPrice: it.quantity > 0 ? Number(((sellingPrices[it.id] || 0) / it.quantity).toFixed(2)) : 0,
          lineTotal: Number((sellingPrices[it.id] || 0).toFixed(2)),
        })),
        sourceApp: 'gci-living-engineering-studio',
        piType: 'PROJECT',
        notes: tradeTerms || undefined,
      };
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      window.open(`https://trade.globalcareinfo.com/?inbound=${encoded}&tab=quote`, '_blank');
      // Mark cloud record as sent (fire-and-forget, best effort)
      if (cloudId) markSentToTrade(cloudId);
      // Mark flow as complete
      setSentToTrade(true);
    };

    // Determine back destination based on navigation source
    const handleBackFromPricing = () => {
      if (quoteSource === 'supplier-archive') {
        // Back to History > Supplier Quotes
        setView('history');
        setHistoryTab('supplier');
        setQuoteSource(null);
        setSqSourceId(null);
        setTradePhase(null);
        setQuoteType(null);
        setQuoteMode(null);
        setAppMode('landing');
      } else if (quoteSource === 'gci-history') {
        // Back to History > GCI Quotes
        setView('history');
        setHistoryTab('gci');
        setQuoteSource(null);
        setTradePhase(null);
        setQuoteType(null);
        setQuoteMode(null);
        setAppMode('landing');
      } else {
        setTradePhase('upload');
      }
    };

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
        {/* Breadcrumb — source-aware */}
        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest flex-wrap">
          {quoteSource === 'supplier-archive' ? (
            <>
              <button onClick={() => { setAppMode('landing'); setView('configurator'); setQuoteSource(null); setQuoteType(null); setQuoteMode(null); setTradePhase(null); }} className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">Workflow Home</button>
              <span className="text-[#0C1B3A]/15">›</span>
              <button onClick={() => { setView('history'); setHistoryTab('supplier'); setQuoteSource(null); setQuoteType(null); setQuoteMode(null); setTradePhase(null); setAppMode('landing'); }} className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">Supplier Quote Archive</button>
              <span className="text-[#0C1B3A]/15">›</span>
              <span className="text-[#C9A84C]">GCI Quote Pricing Review</span>
            </>
          ) : (
            <>
              <button onClick={() => { setAppMode('landing'); setView('configurator'); setProjectInfoSubmitted(false); setQuoteType(null); }} className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">Workflow Home</button>
              <span className="text-[#0C1B3A]/15">›</span>
              <button onClick={() => { setQuoteMode(null); setSelectedScenario(null); setQuoteType(null); setTradePhase(null); setActiveTab('items'); }} className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">Quote Type</button>
              <span className="text-[#0C1B3A]/15">›</span>
              <button onClick={handleBackFromPricing} className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors">
                {quoteType === 'boq' ? 'BOQ & AI Analysis' : 'Trade & Sourcing'}
              </button>
              <span className="text-[#0C1B3A]/15">›</span>
              <span className="text-[#C9A84C]">Pricing Review</span>
            </>
          )}
        </div>

        {/* Back button — always visible */}
        <button
          onClick={handleBackFromPricing}
          className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#0C1B3A]/40 hover:text-[#C9A84C] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {quoteSource === 'supplier-archive' ? 'Back to Supplier Quote Archive' : quoteSource === 'gci-history' ? 'Back to GCI Quotes' : 'Back to Cost Items'}
        </button>

        {/* Page title — source-aware */}
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#C9A84C] bg-[#C9A84C]/10 px-3 py-1 rounded-full">
            {quoteSource === 'supplier-archive' ? 'Supplier Quote → GCI Quote' : 'Trade & Sourcing'}
          </span>
        </div>

        <StepIndicator current={sentToTrade ? 6 : quoteGenerated ? 5 : 4} />

        {/* Quote Context */}
        <div className="bg-[#0C1B3A]/3 border border-[#0C1B3A]/8 rounded-[20px] px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Customer / Project', value: quoteInfo.customerProjectName || '—' },
            { label: 'Quote No', value: quoteInfo.quoteNumber || 'Auto' },
            { label: 'Date', value: quoteInfo.date || '—' },
            { label: 'Salesperson', value: quoteInfo.salesperson || '—' },
            { label: 'Phone / WA', value: quoteInfo.phoneWhatsApp || '—' },
            { label: 'Source', value: _businessIdParam ? `DEAL · ${_businessIdParam}` : 'Manual' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[8px] font-black uppercase tracking-wider text-[#0C1B3A]/30 mb-0.5">{f.label}</p>
              <p className="text-[11px] font-bold text-[#0C1B3A] truncate" title={f.value}>{f.value}</p>
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-1 rounded-full">
                {quoteType === 'boq' ? 'BOQ → Trade Pricing' : 'Trade & Sourcing'}
              </span>
            </div>
            <h2 className="text-2xl font-serif italic text-[#0C1B3A]">Review Cost & Set Selling Price</h2>
            <p className="text-[10px] text-[#0C1B3A]/50 mt-1">输入销售价格 · 系统自动计算利润和VAT</p>
          </div>
          <button
            onClick={() => setTradePhase('upload')}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#0C1B3A]/40 hover:text-[#0C1B3A] transition-colors"
          >
            ← Back to Draft Items
          </button>
        </div>

        {/* Pricing Table */}
        <div className="bg-white rounded-[32px] border border-[#0C1B3A]/8 overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-[#0C1B3A] text-white text-[9px] font-black uppercase tracking-wider">
            <div className="col-span-3">Item</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-2 text-right">Supplier Cost</div>
            <div className="col-span-2 text-right">Selling Total ✎</div>
            <div className="col-span-1 text-right">Markup%</div>
            <div className="col-span-1 text-right">Profit</div>
            <div className="col-span-1 text-right">Margin%</div>
            <div className="col-span-1 text-right">Total+VAT</div>
          </div>

          {/* Items */}
          <div className="divide-y divide-[#0C1B3A]/5">
            {confirmed.map(item => {
              const supplierUnit = item.targetUnitPrice;
              const supplierTotal = supplierUnit * item.quantity;
              // sellingPrices[id] = LINE TOTAL selling price (e.g. 43450 for 50×790 bed)
              const sellPrice = sellingPrices[item.id] || 0;          // line total
              const markupPct = markupPercents[item.id] || 0;
              const lineSellingTotal = sellPrice;                       // already line total
              const lineProfit = lineSellingTotal - supplierTotal;
              const lineMargin = supplierTotal > 0 ? (lineProfit / supplierTotal) * 100 : 0;
              const lineVAT = lineSellingTotal * 0.05;
              const lineTotal = lineSellingTotal + lineVAT;
              const isProfit = lineProfit > 0;
              // Rule A: user enters Selling Total → calc Markup%
              const handleSellChange = (val: number) => {
                setSellingPrices(prev => ({ ...prev, [item.id]: val }));
                if (supplierTotal > 0 && val > 0)
                  setMarkupPercents(prev => ({ ...prev, [item.id]: Number(((val / supplierTotal - 1) * 100).toFixed(1)) }));
                else
                  setMarkupPercents(prev => ({ ...prev, [item.id]: 0 }));
              };
              // Rule B: user enters Markup% → calc Selling Total
              const handleMarkupChange = (pct: number) => {
                setMarkupPercents(prev => ({ ...prev, [item.id]: pct }));
                if (supplierTotal > 0)
                  setSellingPrices(prev => ({ ...prev, [item.id]: Number((supplierTotal * (1 + pct / 100)).toFixed(2)) }));
              };
              return (
                <div key={item.id} className="grid grid-cols-12 gap-2 px-6 py-4 items-center hover:bg-[#0C1B3A]/2 transition-colors">
                  <div className="col-span-3">
                    <p className="text-[11px] font-bold text-[#0C1B3A] truncate">{item.originalName}</p>
                    {item.originalSpec && <p className="text-[9px] text-[#0C1B3A]/40 truncate">{item.originalSpec}</p>}
                    <span className="text-[8px] font-bold text-[#0C1B3A]/30 uppercase">{tradeItemCurrencies[item.id] || 'AED'} · {item.unit}</span>
                  </div>
                  <div className="col-span-1 text-right text-[11px] font-bold text-[#0C1B3A]">{item.quantity}</div>
                  <div className="col-span-2 text-right">
                    <p className="text-[11px] font-mono text-[#0C1B3A]/60">{supplierTotal.toFixed(2)}</p>
                    <p className="text-[9px] text-[#0C1B3A]/30">@{supplierUnit.toFixed(2)}</p>
                  </div>
                  {/* Selling Price */}
                  <div className="col-span-2">
                    <input
                      type="number" min="0" step="0.01"
                      value={sellPrice || ''}
                      placeholder="0.00"
                      onChange={e => handleSellChange(Number(e.target.value) || 0)}
                      className="w-full text-right bg-[#C9A84C]/8 border border-[#C9A84C]/30 rounded-lg px-2 py-1.5 text-[11px] font-black font-mono text-[#0C1B3A] outline-none focus:border-[#C9A84C] focus:bg-[#C9A84C]/12 transition-all"
                    />
                  </div>
                  {/* Markup% */}
                  <div className="col-span-1">
                    <input
                      type="number" step="0.1"
                      value={sellPrice > 0 ? (markupPct || '') : ''}
                      placeholder="0%"
                      onChange={e => handleMarkupChange(Number(e.target.value) || 0)}
                      className="w-full text-right bg-[#0C1B3A]/4 border border-[#0C1B3A]/15 rounded-lg px-2 py-1.5 text-[10px] font-black font-mono text-[#0C1B3A] outline-none focus:border-[#C9A84C] transition-all"
                    />
                  </div>
                  {/* Profit */}
                  <div className={`col-span-1 text-right text-[10px] font-black font-mono ${isProfit ? 'text-green-600' : sellPrice > 0 ? 'text-red-500' : 'text-[#0C1B3A]/20'}`}>
                    {sellPrice > 0 ? (lineProfit >= 0 ? '+' : '') + lineProfit.toFixed(0) : '—'}
                  </div>
                  {/* Margin% */}
                  <div className={`col-span-1 text-right text-[10px] font-black ${isProfit ? 'text-green-600' : sellPrice > 0 ? 'text-red-500' : 'text-[#0C1B3A]/20'}`}>
                    {sellPrice > 0 ? lineMargin.toFixed(1) + '%' : '—'}
                  </div>
                  {/* Line Total */}
                  <div className="col-span-1 text-right">
                    <p className={`text-[10px] font-black font-mono ${sellPrice > 0 ? 'text-[#0C1B3A]' : 'text-[#0C1B3A]/20'}`}>
                      {sellPrice > 0 ? lineTotal.toFixed(2) : '—'}
                    </p>
                    {sellPrice > 0 && <p className="text-[8px] text-[#0C1B3A]/25">+{lineVAT.toFixed(1)} VAT</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grand Total Footer */}
          <div className="px-6 py-5 bg-[#0C1B3A]/3 border-t border-[#0C1B3A]/10">
            <div className="grid grid-cols-3 gap-8 text-center">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Total Supplier Cost</p>
                <p className="text-xl font-black font-mono text-[#0C1B3A] mt-1">AED {totalSupplierCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Total Profit · Margin</p>
                <p className={`text-xl font-black font-mono mt-1 ${totalProfit > 0 ? 'text-green-600' : totalSelling > 0 ? 'text-red-500' : 'text-[#0C1B3A]/30'}`}>
                  {totalSelling > 0 ? `AED ${totalProfit.toFixed(2)} · ${overallMargin.toFixed(1)}%` : '—'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Grand Total (incl 5% VAT)</p>
                <p className="text-xl font-black font-mono text-[#C9A84C] mt-1">
                  {totalSelling > 0 ? `AED ${grandTotal.toFixed(2)}` : '—'}
                </p>
                {totalSelling > 0 && <p className="text-[8px] text-[#0C1B3A]/30 mt-0.5">VAT {totalVAT.toFixed(2)}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Note */}
        <p className="text-center text-[9px] text-[#0C1B3A]/30 font-bold uppercase tracking-widest">
          ⚠ Selling prices are manual · Enter Selling Price or Markup% · System calculates profit &amp; VAT · 定价由人决定，系统只做计算
        </p>

        {/* Step 5: Generate GCI Quote */}
        <div className="flex items-center gap-2 justify-center">
          <div className="h-px flex-1 bg-[#0C1B3A]/8" />
          <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#C9A84C] px-3">Step 5 · Generate GCI Quote</span>
          <div className="h-px flex-1 bg-[#0C1B3A]/8" />
        </div>
        <div className="flex justify-center">
          <button
            onClick={() => {
              if (totalSelling <= 0) { alert('请先为所有品项输入销售价格 Please enter selling prices first'); return; }
              setQuoteGenerated(true);
              // Auto-save to cloud on generate
              handleSaveToCloud(confirmed, { totalSupplierCost, totalSelling, totalProfit, overallMargin, totalVAT, grandTotal });
            }}
            disabled={totalSelling <= 0}
            className="px-12 py-5 rounded-[24px] bg-[#C9A84C] text-[#0C1B3A] font-black uppercase tracking-widest text-xs shadow-xl hover:bg-[#E8C96A] transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-3"
          >
            <FileText className="w-4 h-4" /> Generate GCI Quote
          </button>
        </div>

        {/* GCI Quotation Draft — shown after Generate */}
        {quoteGenerated && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 border-t-2 border-[#C9A84C]/20 pt-8">
            {/* Draft header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white bg-[#C9A84C] px-3 py-1 rounded-full">GCI Quotation Draft</span>
                </div>
                <h3 className="text-xl font-black text-[#0C1B3A]">GCI Customer Quote</h3>
              </div>
              <div className="flex items-center gap-3">
                {/* Cloud save status indicator */}
                {cloudSaveStatus === 'saved' && cloudId && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 rounded-full">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">Saved · {quoteInfo.quoteNumber}</span>
                  </div>
                )}
                {cloudSaveStatus === 'saving' && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-[#0C1B3A]/5 rounded-full">
                    <RefreshCw className="w-3 h-3 text-[#C9A84C] animate-spin" />
                    <span className="text-[9px] font-black text-[#0C1B3A]/50 uppercase tracking-widest">Saving…</span>
                  </div>
                )}
                {cloudSaveStatus === 'error' && (
                  <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Save failed</span>
                )}
                <button
                  onClick={() => handleSaveToCloud(confirmed, { totalSupplierCost, totalSelling, totalProfit, overallMargin, totalVAT, grandTotal })}
                  disabled={cloudSaveStatus === 'saving'}
                  className="px-4 py-2 bg-[#0C1B3A] text-[#C9A84C] rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#0F2551] transition-all disabled:opacity-40 flex items-center gap-1.5 border border-[#C9A84C]/30"
                >
                  {cloudId ? '↑ Update Draft' : '💾 Save Draft'}
                </button>
                <button onClick={() => setQuoteGenerated(false)} className="text-[9px] text-[#0C1B3A]/30 hover:text-[#0C1B3A] uppercase tracking-widest font-bold transition-colors">← Edit Prices</button>
              </div>
            </div>

            {/* Editable Customer Info */}
            <div className="bg-white rounded-[20px] border border-[#0C1B3A]/8 p-5 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 mb-4">Customer Info · 可修改后再 Update Draft</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { key: 'customerProjectName', label: 'Customer / Project', placeholder: 'e.g. Al Nahyan Villa FF&E' },
                  { key: 'salesperson', label: 'Salesperson', placeholder: 'e.g. Chris' },
                  { key: 'phoneWhatsApp', label: 'Phone / WA', placeholder: '+971 50 000 0000' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block mb-1">{f.label}</label>
                    <input
                      type="text"
                      value={(quoteInfo as any)[f.key] || ''}
                      placeholder={f.placeholder}
                      onChange={e => setQuoteInfo(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 rounded-xl px-3 py-2 text-[13px] font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C] transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Quote info card */}
            <div className="bg-[#0C1B3A] rounded-[24px] p-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Customer / Project', value: quoteInfo.customerProjectName || '—' },
                { label: 'Quote No', value: quoteInfo.quoteNumber || 'Auto' },
                { label: 'Date', value: quoteInfo.date || '—' },
                { label: 'Salesperson', value: quoteInfo.salesperson || '—' },
                { label: 'Source', value: _businessIdParam ? `DEAL · ${_businessIdParam}` : 'Manual' },
                { label: 'Items', value: `${confirmed.length} line items` },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-[8px] font-black uppercase tracking-wider text-white/30 mb-0.5">{f.label}</p>
                  <p className="text-[11px] font-bold text-white truncate">{f.value}</p>
                </div>
              ))}
            </div>

            {/* Financials summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Supplier Cost', value: `AED ${totalSupplierCost.toFixed(2)}`, color: 'text-[#0C1B3A]/60' },
                { label: 'Selling (excl VAT)', value: `AED ${totalSelling.toFixed(2)}`, color: 'text-[#0C1B3A]' },
                { label: `Profit · ${overallMargin.toFixed(1)}%`, value: `AED ${totalProfit.toFixed(2)}`, color: totalProfit > 0 ? 'text-green-600' : 'text-red-500' },
                { label: 'VAT 5%', value: `AED ${totalVAT.toFixed(2)}`, color: 'text-[#0C1B3A]/60' },
                { label: 'Grand Total', value: `AED ${grandTotal.toFixed(2)}`, color: 'text-[#C9A84C] text-lg' },
              ].map(f => (
                <div key={f.label} className="bg-white rounded-[16px] border border-[#0C1B3A]/8 p-4 text-center">
                  <p className="text-[8px] font-black uppercase tracking-wider text-[#0C1B3A]/30 mb-1">{f.label}</p>
                  <p className={`font-black font-mono text-base ${f.color}`}>{f.value}</p>
                </div>
              ))}
            </div>

            {/* Items table (read-only) */}
            <div className="bg-white rounded-[20px] border border-[#0C1B3A]/8 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-[#0C1B3A]/5 text-[8px] font-black uppercase tracking-wider text-[#0C1B3A]/50">
                <div className="col-span-5">Item</div>
                <div className="col-span-1 text-center">Qty</div>
                <div className="col-span-2 text-right">Unit Price (AED)</div>
                <div className="col-span-2 text-right">Subtotal</div>
                <div className="col-span-1 text-right">VAT</div>
                <div className="col-span-1 text-right">Total</div>
              </div>
              <div className="divide-y divide-[#0C1B3A]/5">
                {confirmed.map(item => {
                  const sp = sellingPrices[item.id] || 0;  // line total
                  const sub = sp;                            // already line total
                  const unitSell = item.quantity > 0 ? sp / item.quantity : 0;
                  const vat = sub * 0.05;
                  return (
                    <div key={item.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center">
                      <div className="col-span-5">
                        <p className="text-[11px] font-bold text-[#0C1B3A]">{item.originalName}</p>
                        {item.originalSpec && <p className="text-[9px] text-[#0C1B3A]/40">{item.originalSpec}</p>}
                      </div>
                      <div className="col-span-1 text-center text-[10px] font-mono text-[#0C1B3A]">{item.quantity}</div>
                      <div className="col-span-2 text-right text-[10px] font-mono text-[#0C1B3A]">{unitSell.toFixed(2)}</div>
                      <div className="col-span-2 text-right text-[10px] font-mono text-[#0C1B3A]">{sub.toFixed(2)}</div>
                      <div className="col-span-1 text-right text-[9px] font-mono text-[#0C1B3A]/40">{vat.toFixed(2)}</div>
                      <div className="col-span-1 text-right text-[10px] font-black font-mono text-[#0C1B3A]">{(sub + vat).toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 bg-[#0C1B3A] flex justify-end items-center gap-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Grand Total (incl 5% VAT)</p>
                <p className="text-xl font-black font-mono text-[#C9A84C]">AED {grandTotal.toFixed(2)}</p>
              </div>
            </div>

            {/* Terms & Notes in GCI Draft */}
            {tradeTerms && (
              <div className="bg-[#0C1B3A]/3 border border-[#0C1B3A]/8 rounded-[16px] px-6 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40 mb-2">Terms &amp; Notes</p>
                <p className="text-[13px] text-[#0C1B3A]/70 whitespace-pre-line leading-relaxed">{tradeTerms}</p>
              </div>
            )}

            {sentToTrade ? (
              /* ── Completion Panel ── */
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* All steps complete */}
                <StepIndicator current={6} />

                {/* Success message */}
                <div className="bg-green-50 border border-green-200 rounded-[20px] p-6 text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="text-base font-black text-green-800">Sent to TRADE successfully</h3>
                  <p className="text-[13px] text-green-600 mt-1">已发送到 TRADE · Project PI 草稿已创建</p>
                  {quoteInfo.quoteNumber && (
                    <p className="text-[12px] text-green-500/70 mt-2 font-mono">{quoteInfo.quoteNumber}</p>
                  )}
                </div>

                {/* Download PDF reminder */}
                <div className="flex justify-center">
                  <button
                    onClick={() => {
                      generateTradePDF(confirmed, grandTotal, totalSelling, totalVAT, totalSupplierCost, totalProfit, overallMargin);
                      setPdfDownloaded(true);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-[#0C1B3A]/15 text-[#0C1B3A] text-[13px] font-bold hover:border-[#C9A84C] transition-all"
                  >
                    {pdfDownloaded
                      ? <><CheckCircle2 className="w-4 h-4 text-green-500" /> PDF Downloaded</>
                      : <><Download className="w-4 h-4" /> Download PDF</>
                    }
                  </button>
                </div>

                {/* 3 action buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => window.open('https://trade.globalcareinfo.com/?tab=quote', '_blank')}
                    className="p-5 rounded-[20px] bg-[#0C1B3A] text-[#C9A84C] flex flex-col items-center gap-2 font-black text-[13px] uppercase tracking-wide hover:bg-[#0F2551] transition-all active:scale-95 border border-[#C9A84C]/30"
                  >
                    <ExternalLink className="w-5 h-5" />
                    View in TRADE
                    <span className="text-[11px] text-[#C9A84C]/60 normal-case font-bold tracking-normal">Open TRADE OS PI tab</span>
                  </button>
                  <button
                    onClick={() => { setSentToTrade(false); setView('history'); }}
                    className="p-5 rounded-[20px] bg-white border-2 border-[#0C1B3A]/12 text-[#0C1B3A] flex flex-col items-center gap-2 font-black text-[13px] uppercase tracking-wide hover:border-[#C9A84C] transition-all active:scale-95"
                  >
                    <History className="w-5 h-5" />
                    Back to History
                    <span className="text-[11px] text-[#0C1B3A]/40 normal-case font-bold tracking-normal">查看所有报价记录</span>
                  </button>
                  <button
                    onClick={() => { resetProject(); }}
                    className="p-5 rounded-[20px] bg-white border-2 border-[#0C1B3A]/12 text-[#0C1B3A] flex flex-col items-center gap-2 font-black text-[13px] uppercase tracking-wide hover:border-[#C9A84C] transition-all active:scale-95"
                  >
                    <PlusCircle className="w-5 h-5" />
                    New Quote
                    <span className="text-[11px] text-[#0C1B3A]/40 normal-case font-bold tracking-normal">新建报价</span>
                  </button>
                </div>
              </div>
            ) : (
              /* ── Pre-send action buttons ── */
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <button
                  onClick={() => {
                    generateTradePDF(confirmed, grandTotal, totalSelling, totalVAT, totalSupplierCost, totalProfit, overallMargin);
                    setPdfDownloaded(true);
                  }}
                  className="flex-1 p-5 rounded-[24px] bg-white border-2 border-[#0C1B3A]/15 text-[#0C1B3A] flex justify-center items-center gap-3 font-black uppercase tracking-widest text-xs hover:border-[#C9A84C] transition-all active:scale-95"
                >
                  {pdfDownloaded
                    ? <><CheckCircle2 className="w-4 h-4 text-green-500" /> PDF Downloaded</>
                    : <><Download className="w-4 h-4" /> Download PDF</>
                  }
                </button>
                <button
                  onClick={handleSendTradeToTrade}
                  className="flex-1 p-5 rounded-[24px] bg-[#0C1B3A] text-[#C9A84C] flex justify-center items-center gap-3 font-black uppercase tracking-widest text-xs shadow-xl hover:bg-[#0F2551] transition-all active:scale-95 border border-[#C9A84C]/30"
                >
                  <ExternalLink className="w-4 h-4" /> Send to TRADE
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderPackageWorkspace = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">

      {/* ── Breadcrumb nav ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest flex-wrap">
        <button
          onClick={() => setProjectInfoSubmitted(false)}
          className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors"
        >
          Project Info
        </button>
        <span className="text-[#0C1B3A]/15">›</span>
        <button
          onClick={() => { setQuoteMode(null); setSelectedScenario(null); setQuoteType(null); setTradePhase(null); setActiveTab('items'); }}
          className="text-[#0C1B3A]/30 hover:text-[#C9A84C] transition-colors"
        >
          Quote Type
        </button>
        <span className="text-[#0C1B3A]/15">›</span>
        <span className="text-[#C9A84C]">
          {quoteType === 'trade' ? 'Trade & Sourcing' : quoteType === 'boq' ? 'BOQ & AI Analysis' : 'Project Package'}
        </span>
        <span className="text-[#0C1B3A]/15">›</span>
        <span className="text-[#0C1B3A]/50">{activeTab === 'draft' ? (quoteType === 'trade' || quoteType === 'boq' ? 'GCI Quotation Draft' : 'Draft') : (quoteType === 'trade' || quoteType === 'boq' ? 'Supplier Cost Items' : 'Items')}</span>
      </div>

      {/* ── Quote Context (trade/boq paths only) ───────────────────────── */}
      {(quoteType === 'trade' || quoteType === 'boq') && (
        <div className="bg-[#0C1B3A]/3 border border-[#0C1B3A]/8 rounded-[20px] px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Customer / Project', value: quoteInfo.customerProjectName || '—' },
            { label: 'Quote No', value: quoteInfo.quoteNumber || 'Auto' },
            { label: 'Date', value: quoteInfo.date || '—' },
            { label: 'Salesperson', value: quoteInfo.salesperson || '—' },
            { label: 'Phone / WA', value: quoteInfo.phoneWhatsApp || '—' },
            { label: 'Source', value: _businessIdParam ? `DEAL · ${_businessIdParam}` : 'Manual' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[8px] font-black uppercase tracking-wider text-[#0C1B3A]/30 mb-0.5">{f.label}</p>
              <p className="text-[11px] font-bold text-[#0C1B3A] truncate" title={f.value}>{f.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center">
        <button
          onClick={() => { setQuoteMode(null); setSelectedScenario(null); setQuoteType(null); setTradePhase(null); setActiveTab('items'); }}
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#C9A84C] hover:text-[#0C1B3A] transition-all group"
        >
          <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> ← Quote Type Selection
        </button>
        <div className="flex items-center gap-4">
          {/* Context badge — changes based on quote path */}
          {quoteType === 'trade' ? (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0C1B3A]/8 rounded-full border border-[#0C1B3A]/12">
              <ShoppingCart className="w-4 h-4 text-[#C9A84C]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]">Trade &amp; Sourcing Quote</span>
            </div>
          ) : quoteType === 'boq' ? (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0C1B3A]/8 rounded-full border border-[#0C1B3A]/12">
              <FileSearch className="w-4 h-4 text-[#C9A84C]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]">BOQ &amp; AI Analysis</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-brand-gold/10 rounded-full">
              <Package className="w-4 h-4 text-brand-gold" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-brown">{selectedScenario ? t(selectedScenario) : 'Project'} Package Mode</span>
            </div>
          )}
        </div>
      </div>

      {/* Split Modal */}
      {showSplitModal && itemToSplit && (
        <div className="fixed inset-0 z-[110] bg-brand-brown/40 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-6xl rounded-[48px] shadow-2xl border border-brand-beige overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 border-b border-brand-beige bg-brand-beige/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Split className="w-6 h-6 text-brand-gold" />
                  <h3 className="text-xl font-serif italic text-brand-brown">{t('Split Combined Item')}</h3>
                </div>
                <button onClick={() => setShowSplitModal(false)} className="text-brand-brown/40 hover:text-brand-gold transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="mt-4 p-4 bg-brand-beige/20 rounded-2xl text-brand-brown-muted text-xs italic">
                {t('Original')}: <span className="font-bold">{itemToSplit.originalName}</span> {itemToSplit.originalSpec && `(${itemToSplit.originalSpec})`}
              </p>
            </div>
            
            <div className="p-8 space-y-8 overflow-y-auto max-h-[60vh]">
              <div className="space-y-4">
                {splitResult.map((res, idx) => (
                  <div key={res.id} className="grid grid-cols-12 gap-4 items-start p-6 bg-brand-beige/5 rounded-3xl border border-brand-beige/50">
                    <div className="col-span-2">
                      <label className="text-[8px] font-bold text-brand-brown-muted uppercase tracking-widest mb-2 block">{t('Item Name')}</label>
                      <input 
                        value={res.originalName}
                        onChange={(e) => {
                          const updated = [...splitResult];
                          updated[idx].originalName = e.target.value;
                          setSplitResult(updated);
                        }}
                        className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2 text-[10px] font-bold text-brand-brown"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[8px] font-bold text-brand-brown-muted uppercase tracking-widest mb-2 block">{t('Category')}</label>
                      <select 
                        value={res.suggestedCategory}
                        onChange={(e) => {
                          const updated = [...splitResult];
                          updated[idx].suggestedCategory = e.target.value as FurnitureCategory;
                          setSplitResult(updated);
                        }}
                        className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2 text-[10px] font-bold text-brand-brown"
                      >
                        <option value="unknown">Select...</option>
                        {Object.values(FurnitureCategory).map(cat => (
                          <option key={cat} value={cat}>{t(cat)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="text-[8px] font-bold text-brand-brown-muted uppercase tracking-widest mb-2 block">{t('Type / Specification')}</label>
                      {res.suggestedCategory === FurnitureCategory.SOFA ? (
                        <div className="space-y-2">
                          <select 
                            value={SOFA_TYPES.includes(res.specOverride || '') ? res.specOverride : (res.specOverride ? 'Other' : '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = [...splitResult];
                              if (val === 'Other') {
                                if (SOFA_TYPES.includes(updated[idx].specOverride || '')) {
                                  updated[idx].specOverride = '';
                                }
                              } else {
                                updated[idx].specOverride = val;
                              }
                              setSplitResult(updated);
                            }}
                            className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2 text-[10px] font-bold text-brand-brown"
                          >
                            <option value="">{t('Select type...')}</option>
                            {SOFA_TYPES.filter(type => type !== 'Other').map(type => (
                              <option key={type} value={type}>{t(type)}</option>
                            ))}
                            <option value="Other">{t('Manual Entry...')}</option>
                          </select>
                          {((res.specOverride !== undefined && !SOFA_TYPES.filter(t => t !== 'Other').includes(res.specOverride) && res.specOverride !== '') || (res.specOverride === '' && res.suggestedCategory === FurnitureCategory.SOFA)) && (
                            <input 
                              placeholder={t('Type specification...')}
                              value={res.specOverride || ''}
                              onChange={(e) => {
                                const updated = [...splitResult];
                                updated[idx].specOverride = e.target.value;
                                setSplitResult(updated);
                              }}
                              className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2 text-[10px] font-bold text-brand-brown mt-1"
                            />
                          )}
                        </div>
                      ) : (
                        <input 
                          placeholder={t('Type specification...')}
                          value={res.specOverride || ''}
                          onChange={(e) => {
                            const updated = [...splitResult];
                            updated[idx].specOverride = e.target.value;
                            setSplitResult(updated);
                          }}
                          className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2 text-[10px] font-bold text-brand-brown"
                        />
                      )}
                    </div>
                    <div className="col-span-1">
                       <label className="text-[8px] font-bold text-brand-brown-muted uppercase tracking-widest mb-2 block">{t('Qty')}</label>
                       <input 
                        type="number"
                        value={res.quantity}
                        onChange={(e) => {
                          const updated = [...splitResult];
                          updated[idx].quantity = parseInt(e.target.value) || 0;
                          setSplitResult(updated);
                        }}
                        className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2 text-[10px] font-bold text-brand-brown text-center"
                       />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[8px] font-bold text-brand-brown-muted uppercase tracking-widest mb-2 block">{t('Notes')}</label>
                      <textarea 
                        placeholder={t('Add notes...')}
                        value={res.notes || ''}
                        onChange={(e) => {
                          const updated = [...splitResult];
                          updated[idx].notes = e.target.value;
                          setSplitResult(updated);
                        }}
                        rows={1}
                        className="w-full bg-white border border-brand-beige rounded-xl px-4 py-2 text-[10px] font-bold text-brand-brown resize-none min-h-[40px]"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end pt-6">
                      <button 
                        onClick={() => setSplitResult(splitResult.filter((_, i) => i !== idx))}
                        className="p-2 text-red-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}

                <button 
                  onClick={() => setSplitResult([...splitResult, { ...itemToSplit, id: `split-${Date.now()}`, isSplittable: false, status: 'Confirmed', specOverride: '', notes: '' }])}
                  className="w-full py-4 border-2 border-dashed border-brand-beige rounded-3xl text-[10px] font-bold text-brand-brown-muted uppercase tracking-widest hover:border-brand-gold hover:text-brand-gold transition-all"
                >
                  + {t('Add Item')}
                </button>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setShowSplitModal(false)}
                  className="flex-1 px-8 py-5 rounded-3xl border border-brand-beige text-brand-brown-muted text-[10px] font-bold uppercase tracking-widest hover:bg-brand-beige/20 transition-all"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={() => {
                    const idx = draftItems.findIndex(it => it.id === itemToSplit.id);
                    if (idx !== -1) {
                      const updated = [...draftItems];
                      updated.splice(idx, 1, ...splitResult.map(r => ({ ...r, status: 'Confirmed' as const })));
                      setDraftItems(updated);
                      setShowSplitModal(false);
                      alert(t('Successfully split item'));
                    }
                  }}
                  className="flex-[2] px-8 py-5 rounded-3xl bg-brand-brown text-brand-ivory text-[10px] font-bold uppercase tracking-widest hover:bg-brand-brown/90 shadow-xl shadow-brand-brown/20"
                >
                  {t('Apply Split / 应用拆分')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showMapping && rawExcelData && (
        <div className="fixed inset-0 z-[100] bg-brand-brown/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-2xl rounded-[48px] shadow-2xl border border-brand-beige overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 border-b border-brand-beige bg-brand-beige/5">
              <div className="flex items-center gap-4 mb-2">
                <FileSpreadsheet className="w-6 h-6 text-brand-gold" />
                <h3 className="text-xl font-serif italic text-brand-brown">{t('Column Mapping')}</h3>
              </div>
              <p className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-widest">{t('Please map the columns correctly')}</p>
            </div>
            
            <div className="p-10 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                {[
                  { label: t('Item Name Column'), key: 'item' },
                  { label: t('Specification Column'), key: 'spec' },
                  { label: t('Qty Column'), key: 'qty' },
                  { label: t('Unit Price Column'), key: 'price' },
                  { label: t('Total Price Column'), key: 'total' }
                ].map(m => (
                  <div key={m.key} className="flex items-center justify-between gap-8">
                    <label className="text-[10px] font-bold text-brand-brown uppercase tracking-widest min-w-[150px]">{m.label}</label>
                    <select 
                      value={excelMappings[m.key]}
                      onChange={(e) => setExcelMappings({...excelMappings, [m.key]: parseInt(e.target.value)})}
                      className="flex-1 bg-brand-beige/5 border border-brand-beige rounded-2xl px-6 py-3 text-xs font-bold text-brand-brown outline-none focus:ring-1 focus:ring-brand-gold transition-all"
                    >
                      {rawExcelData[0].map((h: any, i: number) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex gap-4 pt-8">
                <button 
                  onClick={() => setShowMapping(false)}
                  className="flex-1 px-8 py-5 rounded-3xl border border-brand-beige text-brand-brown-muted text-[10px] font-bold uppercase tracking-widest hover:bg-brand-beige/20 transition-all"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={processMappedData}
                  className="flex-2 px-8 py-5 rounded-3xl bg-brand-brown text-brand-ivory text-[10px] font-bold uppercase tracking-widest hover:bg-brand-brown/90 transition-all flex items-center justify-center gap-3 shadow-xl shadow-brand-brown/20"
                >
                  <Cpu className="w-4 h-4 text-brand-gold" /> {t('Start Analysis')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Import Zone */}
      <div className="max-w-4xl mx-auto mb-16">
        <div className="bg-white rounded-[48px] border border-brand-beige overflow-hidden shadow-2xl shadow-brand-brown/5">
          <div className="p-8 border-b border-brand-beige bg-brand-beige/5">
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5 text-brand-gold" />
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-brown">
                {(quoteType === 'trade' || quoteType === 'boq') ? 'Supplier Quote Import' : t('Import Zone')}
              </h3>
            </div>
          </div>
          
          <div className="p-10 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* Left: Text Input */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-widest flex items-center gap-2">
                    <Clipboard className="w-3 h-3" /> {t('Text Analysis')}
                  </label>
                  <span className="text-[8px] text-brand-brown-muted opacity-50 uppercase font-bold tracking-widest">Paste requirement text</span>
                </div>
                <textarea 
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={t('Paste client text here')}
                  className="w-full h-48 p-6 bg-brand-beige/5 border border-brand-beige rounded-[32px] text-xs text-brand-brown placeholder:text-brand-brown/30 resize-none focus:ring-1 focus:ring-brand-gold outline-none transition-all"
                />
              </div>

              {/* Right: File Drop Zone */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-widest flex items-center gap-2">
                    <Upload className="w-3 h-3" /> {t('Upload File')}
                  </label>
                  <span className="text-[8px] text-brand-brown-muted opacity-50 uppercase font-bold tracking-widest">{t('Supported formats')}</span>
                </div>
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e); }}
                  onClick={() => document.getElementById('advanced-file-upload')?.click()}
                  className={`h-48 border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-500 group ${
                    isDragging ? 'border-brand-gold bg-brand-gold/5 scale-[0.98]' : 'border-brand-beige hover:border-brand-gold/50 hover:bg-brand-beige/5'
                  }`}
                >
                  <input id="advanced-file-upload" type="file" className="hidden" accept=".xlsx,.csv,.pdf,image/*" onChange={handleFileUpload} />
                  <div className="w-16 h-16 bg-brand-beige/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    {isProcessingAI ? (
                       <RefreshCw className="w-8 h-8 text-brand-gold animate-spin" />
                    ) : (
                       <div className="relative">
                          <FileSpreadsheet className="w-8 h-8 text-brand-gold" />
                          <ImageIcon className="w-4 h-4 text-brand-gold absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-brand-gold/20" />
                       </div>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-brand-brown uppercase tracking-widest text-center px-10">
                    {isDragging ? t('Drop files to upload') : t('Drag and drop files here')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              <button 
                onClick={handleAnalyze}
                disabled={isProcessingAI || !importText.trim()}
                className={`px-12 py-6 rounded-full font-bold uppercase tracking-[0.2em] text-[10px] shadow-xl transition-all active:scale-95 flex items-center gap-4 ${
                  isProcessingAI || !importText.trim() 
                  ? 'bg-brand-beige/50 text-brand-brown-muted cursor-not-allowed' 
                  : 'bg-brand-brown text-brand-ivory hover:bg-brand-brown/90 shadow-brand-brown/20'
                }`}
              >
                {isProcessingAI ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-brand-gold" />
                    {t('Importing and Analyzing')}
                  </>
                ) : (
                  <>
                    <Cpu className="w-4 h-4 text-brand-gold" />
                    {(quoteType === 'trade' || quoteType === 'boq') ? 'Analyze Supplier Quote' : t('Analyze Client List')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab switcher — package path only. Trade/BOQ shows linear sections below. */}
      {!(quoteType === 'trade' || quoteType === 'boq') && (
        <div className="flex justify-center">
          <div className="flex bg-brand-beige/20 p-1 rounded-2xl border border-brand-beige">
            <button
              onClick={() => setActiveTab('items')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'items' ? 'bg-white text-brand-brown shadow-sm' : 'text-brand-brown-muted hover:text-brand-brown'}`}
            >
              {t('Project Package Items')}
            </button>
            <button
              onClick={() => setActiveTab('draft')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all relative ${activeTab === 'draft' ? 'bg-white text-brand-brown shadow-sm' : 'text-brand-brown-muted hover:text-brand-brown'}`}
            >
              {t('Project Package Draft')}
              {draftItems.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand-gold text-[10px] text-white flex items-center justify-center rounded-full border-2 border-brand-beige shadow-sm">
                  {draftItems.length}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Trade/BOQ: Supplier Cost Items editable table ─────────────── */}
      {(quoteType === 'trade' || quoteType === 'boq') && draftItems.length > 0 && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Section header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-1 rounded-full">Step 1</span>
              </div>
              <h3 className="text-xl font-black text-[#0C1B3A]">Supplier Cost Items</h3>
              <p className="text-[10px] text-[#0C1B3A]/50 mt-0.5">Review and correct AI-parsed supplier costs · 核对供应商成本数据</p>
            </div>
            <span className="text-[9px] font-bold text-[#0C1B3A]/30 uppercase tracking-widest">{draftItems.length} items</span>
          </div>

          {/* Editable cost table */}
          <div className="bg-white rounded-[24px] border border-[#0C1B3A]/8 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-12 gap-3 px-6 py-3 bg-[#0C1B3A] text-white text-[10px] font-black uppercase tracking-wider">
              <div className="col-span-3">Item Name</div>
              <div className="col-span-3">Description / Spec</div>
              <div className="col-span-1 text-center">Qty</div>
              <div className="col-span-1 text-center">Unit</div>
              <div className="col-span-2 text-right">Unit Cost</div>
              <div className="col-span-1 text-center">CCY</div>
              <div className="col-span-1 text-right">Line Total</div>
            </div>
            {/* Rows */}
            <div className="divide-y divide-[#0C1B3A]/6">
              {draftItems.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-12 gap-3 px-6 py-4 items-center hover:bg-[#0C1B3A]/2 transition-colors group">
                  {/* Item Name */}
                  <div className="col-span-3">
                    <input
                      value={item.originalName}
                      onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, originalName: e.target.value } : it))}
                      className="w-full text-[15px] font-bold text-[#0C1B3A] bg-transparent border-b-2 border-[#0C1B3A]/10 focus:border-[#C9A84C] outline-none pb-1 transition-colors"
                    />
                  </div>
                  {/* Spec */}
                  <div className="col-span-3">
                    <input
                      value={item.originalSpec || ''}
                      onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, originalSpec: e.target.value } : it))}
                      placeholder="—"
                      className="w-full text-[14px] text-[#0C1B3A]/55 bg-transparent border-b border-[#0C1B3A]/8 focus:border-[#C9A84C] outline-none pb-1 transition-colors placeholder:text-[#0C1B3A]/20"
                    />
                  </div>
                  {/* Qty */}
                  <div className="col-span-1">
                    <input
                      type="number" min="0" step="1"
                      value={item.quantity}
                      onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) || 0, targetTotal: (Number(e.target.value) || 0) * it.targetUnitPrice } : it))}
                      className="w-full text-[15px] font-mono font-bold text-[#0C1B3A] text-center bg-transparent border-b-2 border-[#0C1B3A]/10 focus:border-[#C9A84C] outline-none pb-1"
                    />
                  </div>
                  {/* Unit */}
                  <div className="col-span-1">
                    <input
                      value={item.unit}
                      onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                      className="w-full text-[14px] text-[#0C1B3A]/60 text-center bg-transparent border-b border-[#0C1B3A]/8 focus:border-[#C9A84C] outline-none pb-1"
                    />
                  </div>
                  {/* Supplier Unit Cost */}
                  <div className="col-span-2 text-right">
                    <input
                      type="number" min="0" step="0.01"
                      value={item.targetUnitPrice || ''}
                      placeholder="0.00"
                      onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, targetUnitPrice: Number(e.target.value) || 0, targetTotal: (Number(e.target.value) || 0) * it.quantity } : it))}
                      className="w-full text-right text-[15px] font-mono font-black text-[#0C1B3A] bg-transparent border-b-2 border-[#0C1B3A]/10 focus:border-[#C9A84C] outline-none pb-1"
                    />
                    <p className="text-[11px] text-[#0C1B3A]/30 text-right mt-1 font-mono">unit price</p>
                  </div>
                  {/* Currency */}
                  <div className="col-span-1 text-center">
                    <select
                      value={tradeItemCurrencies[item.id] || 'AED'}
                      onChange={e => setTradeItemCurrencies(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className="text-[12px] font-bold text-[#0C1B3A]/60 bg-transparent border-b border-[#0C1B3A]/8 outline-none w-full text-center pb-1"
                    >
                      {['AED','USD','CNY','EUR','GBP'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {/* Line Total + Delete */}
                  <div className="col-span-1 text-right flex items-center justify-end gap-2">
                    <div>
                      <p className="text-[15px] font-black font-mono text-[#0C1B3A]">
                        {(item.targetUnitPrice * item.quantity).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-[#0C1B3A]/30 font-mono">total</p>
                    </div>
                    <button
                      onClick={() => setDraftItems(prev => prev.filter((_, i) => i !== idx))}
                      className="text-[#0C1B3A]/15 hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                      title="Remove item"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Footer */}
            <div className="px-6 py-4 bg-[#0C1B3A]/3 border-t border-[#0C1B3A]/8 flex items-center justify-between">
              <button
                onClick={() => setDraftItems(prev => [...prev, { id: `manual-${Date.now()}`, originalName: 'New Item', originalSpec: '', quantity: 1, unit: 'pcs', targetUnitPrice: 0, targetTotal: 0, confidence: 1, status: 'Confirmed', suggestedCategory: FurnitureCategory.OTHER }])}
                className="text-[11px] font-black uppercase tracking-widest text-[#C9A84C] hover:text-[#0C1B3A] transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Item
              </button>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase text-[#0C1B3A]/30 tracking-wider">Total Supplier Cost</p>
                <p className="text-xl font-black font-mono text-[#0C1B3A]">
                  AED {draftItems.reduce((s, it) => s + it.targetUnitPrice * it.quantity, 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* ── Terms & Notes ─────────────────────────────────────────── */}
          <div className="bg-white rounded-[20px] border border-[#0C1B3A]/8 overflow-hidden shadow-sm">
            <div className="px-6 py-3 bg-[#0C1B3A]/5 border-b border-[#0C1B3A]/6 flex items-center justify-between">
              <div>
                <h4 className="text-[11px] font-black uppercase tracking-widest text-[#0C1B3A]">Terms &amp; Notes</h4>
                <p className="text-[10px] text-[#0C1B3A]/40 mt-0.5">Payment terms · Lead time · Validity · Remarks from supplier quote</p>
              </div>
              {tradeTerms && (
                <button onClick={() => setTradeTerms('')} className="text-[9px] text-[#0C1B3A]/25 hover:text-red-400 transition-colors uppercase tracking-widest font-bold">Clear</button>
              )}
            </div>
            <div className="p-5">
              <textarea
                value={tradeTerms}
                onChange={e => setTradeTerms(e.target.value)}
                rows={tradeTerms ? Math.max(3, tradeTerms.split('\n').length + 1) : 3}
                placeholder="AI-extracted payment terms, lead time, validity, warranty, notes will appear here automatically.&#10;You can also type or paste manually.&#10;&#10;Example:&#10;Payment: 30% TT advance, 70% before shipment&#10;Lead time: 45 days after deposit&#10;Validity: 30 days"
                className="w-full text-[13px] text-[#0C1B3A]/70 bg-transparent outline-none resize-none leading-relaxed placeholder:text-[#0C1B3A]/20 placeholder:text-[12px]"
              />
            </div>
          </div>

          {/* Action buttons: Save to Archive OR Proceed to Pricing */}
          <div className="flex flex-col sm:flex-row gap-3 justify-end items-center">
            {/* Save to Supplier Archive */}
            <button
              onClick={handleSaveSupplierQuote}
              disabled={draftItems.length === 0 || sqSaveStatus === 'saving'}
              className="px-6 py-4 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all active:scale-95 disabled:opacity-40 flex items-center gap-2"
              style={sqSaveStatus === 'saved'
                ? { borderColor: '#10B981', color: '#10B981', backgroundColor: '#10B98110' }
                : { borderColor: '#0C1B3A30', color: '#0C1B3A60', backgroundColor: 'white' }
              }
            >
              <Archive className="w-4 h-4" />
              {sqSaveStatus === 'saving' ? 'Saving…' : sqSaveStatus === 'saved' ? '✓ Saved to Archive' : 'Save to Supplier Archive'}
            </button>
          </div>

          {/* Proceed to Pricing button */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                // Mark ALL items as Confirmed so none are dropped in Pricing
                const before = draftItems;
                const allConfirmed = before.map(it => ({ ...it, status: 'Confirmed' as const }));
                const supplierTotal = allConfirmed.reduce((s, it) => s + it.targetUnitPrice * it.quantity, 0);
                console.log('[Pricing] Before items count:', before.length);
                console.log('[Pricing] After items count (all confirmed):', allConfirmed.length);
                console.log('[Pricing] Supplier Cost Items Total:', supplierTotal.toFixed(2), 'AED');
                allConfirmed.forEach((it, i) =>
                  console.log(`  [${i+1}] ${it.originalName} | qty:${it.quantity} | cost:${it.targetUnitPrice} | line:${(it.targetUnitPrice*it.quantity).toFixed(2)}`)
                );
                setDraftItems(allConfirmed);
                setTradePhase('pricing');
              }}
              className="px-10 py-5 bg-[#0C1B3A] text-[#C9A84C] rounded-full text-[11px] font-black uppercase tracking-widest shadow-xl hover:bg-[#0F2551] active:scale-95 transition-all border border-[#C9A84C]/30 flex items-center gap-3"
            >
              Next: Set Selling Prices →
            </button>
          </div>
        </div>
      )}

      {/* Trade/BOQ: no package items needed. Package path continues below. */}
      {activeTab === 'items' && !(quoteType === 'trade' || quoteType === 'boq') ? (
        <>
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-serif italic text-brand-brown">
              {(quoteType === 'trade' || quoteType === 'boq') ? 'Supplier Cost Items' : '项目整套清单 Project Package Items'}
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold">
              {(quoteType === 'trade' || quoteType === 'boq') ? 'Items extracted from supplier quote · pending price review' : 'Consolidate multiple items into one engineering specification'}
            </p>
          </div>

          <div className="space-y-8">
            {packageItems.length === 0 ? (
              <div className="text-center py-32 bg-brand-beige/5 border-2 border-dashed border-brand-beige rounded-[48px]">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                    <PlusCircle className="w-8 h-8 text-brand-gold/30" />
                </div>
                <h3 className="text-xl font-serif italic text-brand-brown mb-2">您的清单还是空的 Your package is empty</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-brown/40">Add items below to start building your quote</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {packageItems.map((item, idx) => (
                  <div key={item.id} className="p-8 bg-white border border-brand-beige rounded-[32px] flex items-center justify-between group hover:shadow-xl transition-all duration-500">
                    <div className="flex items-center gap-8">
                      <div className="w-16 h-16 bg-brand-beige/20 rounded-2xl flex items-center justify-center group-hover:bg-brand-gold/10 transition-colors">
                        {(() => {
                          const Icon = CATEGORY_ICONS[item.category];
                          return <Icon className="w-8 h-8 text-brand-gold" />;
                        })()}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Item {idx + 1}</span>
                          <span className="w-1 h-1 rounded-full bg-brand-beige" />
                          <span className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-widest">{t(item.category)}</span>
                        </div>
                        <h4 className="text-xl font-serif italic text-brand-brown">
                          {item.category === FurnitureCategory.BED ? `${(item.config as any).size} Bed` : `${t(item.category)} Unit`}
                        </h4>
                      </div>
                    </div>
                    <div className="flex items-center gap-12">
                       <div className="flex items-center gap-4 bg-brand-beige/10 p-2 rounded-2xl border border-brand-beige">
                          <button 
                            onClick={() => {
                              const updated = [...packageItems];
                              if (updated[idx].quantity > 1) {
                                updated[idx].quantity -= 1;
                                setPackageItems(updated);
                              }
                            }}
                            className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-brand-brown hover:bg-brand-brown hover:text-brand-ivory transition-all"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-bold font-mono text-brand-brown">{item.quantity}</span>
                          <button 
                            onClick={() => {
                              const updated = [...packageItems];
                              updated[idx].quantity += 1;
                              setPackageItems(updated);
                            }}
                            className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-brand-brown hover:bg-brand-brown hover:text-brand-ivory transition-all"
                          >
                            +
                          </button>
                       </div>
                       <div className="text-right">
                         <span className="text-[10px] font-bold text-brand-brown-muted uppercase block">Total Value</span>
                         <span className="text-2xl font-serif italic text-brand-brown">
                            {(item.totalAmount * item.quantity).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xs not-italic">AED</span>
                         </span>
                       </div>
                       <button 
                        onClick={() => setPackageItems(packageItems.filter((_, i) => i !== idx))}
                        className="p-4 rounded-full text-red-300 hover:text-red-500 hover:bg-red-50 transition-all"
                       >
                        <X className="w-5 h-5" />
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-12 border-t border-brand-beige/50">
              <div className="text-center mb-8">
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-brand-brown mb-4">{t('Add to Project Package')}</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                {Object.values(FurnitureCategory).map(cat => {
                  const Icon = CATEGORY_ICONS[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setCurrentStep(0);
                      }}
                      className="p-6 bg-white border border-brand-beige rounded-[32px] flex flex-col items-center gap-3 hover:border-brand-gold hover:shadow-lg transition-all group"
                    >
                      <Icon className="w-5 h-5 text-brand-gold group-hover:scale-110 transition-transform" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-brand-brown text-center">{t(cat)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {packageItems.length > 0 && (
              <div className="mt-20 p-12 bg-brand-brown rounded-[48px] shadow-2xl flex flex-col sm:flex-row justify-between items-center gap-8">
                <div className="text-center sm:text-left">
                  <span className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.3em]">Consolidated Package Total</span>
                  <h2 className="text-5xl font-serif italic text-brand-ivory mt-2">
                    {packageItems.reduce((acc, item) => acc + (item.totalAmount * item.quantity), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xs not-italic">AED</span>
                  </h2>
                </div>
                <button 
                  onClick={() => {
                    alert(t('Generating package quote message'));
                  }}
                  className="px-12 py-6 bg-brand-gold text-brand-ivory rounded-[32px] font-bold uppercase tracking-[0.2em] text-xs shadow-xl hover:bg-brand-gold/90 transition-all flex items-center gap-4 group"
                >
                  {t('Generate Package Quote')} <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}
          </div>
        </>
      ) : !(quoteType === 'trade' || quoteType === 'boq') ? (
        /* Package path: show existing AI configure/confirm draft table */
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-7xl mx-auto px-6 w-full">
           <div className="text-center space-y-4 mb-20">
            <div className="flex items-center justify-center gap-4">
              <div className="h-px w-12 bg-brand-gold/30" />
              <div className="flex items-center gap-2 text-brand-gold">
                <Cpu className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-[0.4em]">AI Mapping Engine Activated</span>
              </div>
              <div className="h-px w-12 bg-brand-gold/30" />
            </div>
            <h2 className="text-4xl font-serif italic text-brand-brown">
              {(quoteType === 'trade' || quoteType === 'boq') ? 'GCI Quotation Draft' : '项目草稿清单 Project Package Draft'}
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold opacity-80">
              {(quoteType === 'trade' || quoteType === 'boq') ? '⚠ AI-generated draft — confirm supplier costs before pricing' : 'Classified items waiting for configuration push'}
            </p>
          </div>

          {draftItems.length === 0 ? (
            <div className="text-center py-40 bg-brand-beige/10 rounded-[64px] border border-brand-beige/50">
              <div className="w-24 h-24 bg-white/50 rounded-full flex items-center justify-center mx-auto mb-8">
                <FileSpreadsheet className="w-10 h-10 text-brand-gold/40" />
              </div>
              <p className="text-brand-brown font-serif italic text-xl mb-4 italic opacity-60">Upload a client Excel to populate this workspace</p>
              <button 
                onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
                className="px-10 py-5 bg-brand-brown text-brand-ivory rounded-full text-[10px] font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
              >
                {t('Select a file')}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-[48px] border border-brand-beige shadow-2xl shadow-brand-brown/5 overflow-hidden">
              <div className="w-full overflow-x-hidden">
                <table className="w-full text-left text-xs border-collapse table-fixed">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-brand-beige text-brand-brown-muted font-bold uppercase tracking-widest text-[9px] border-b border-brand-beige shadow-sm">
                      <th className="p-8 py-6 w-[60px]">ID</th>
                      <th className="p-8 py-6 w-[220px]">{t('Original Item Name')}</th>
                      <th className="p-8 py-6 w-[200px]">{t('Original Specification')}</th>
                      <th className="p-8 py-6 w-[240px]">{t('AI Suggested Category')}</th>
                      <th className="p-8 py-6 w-[100px]">{t('Qty')}</th>
                      <th className="p-8 py-6 w-[120px]">{t('Status')}</th>
                      <th className="p-8 py-6 text-right w-[340px] whitespace-nowrap">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-beige/30">
                    {draftItems.map((item, idx) => (
                      <tr key={item.id} className="group hover:bg-brand-gold/5 transition-colors">
                        <td className="p-8 text-[10px] font-mono text-brand-brown-muted opacity-50">#{idx + 1}</td>
                        <td className="p-8">
                          <p className="font-bold text-brand-brown text-sm truncate" title={item.originalName}>{item.originalName}</p>
                        </td>
                        <td className="p-8 text-brand-brown-muted">
                          <p className="line-clamp-2 text-[10px]" title={item.originalSpec}>{item.originalSpec}</p>
                        </td>
                        <td className="p-8">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-brand-beige/20 flex items-center justify-center shrink-0">
                              {item.suggestedCategory !== 'unknown' ? (
                                (() => {
                                  const Icon = CATEGORY_ICONS[item.suggestedCategory as FurnitureCategory];
                                  return <Icon className="w-4 h-4 text-brand-gold" />;
                                })()
                              ) : (
                                <AlertCircle className="w-4 h-4 text-red-300" />
                              )}
                            </div>
                            <select 
                              value={item.suggestedCategory}
                              onChange={(e) => {
                                const updated = [...draftItems];
                                updated[idx].suggestedCategory = e.target.value as FurnitureCategory;
                                if (updated[idx].status === 'Need Review') updated[idx].status = 'Confirmed';
                                setDraftItems(updated);
                              }}
                              className="bg-transparent border-none font-bold text-brand-brown text-[10px] uppercase tracking-widest outline-none focus:ring-0 cursor-pointer hover:text-brand-gold transition-colors truncate max-w-[150px]"
                            >
                              <option value="unknown">Select...</option>
                              {Object.values(FurnitureCategory).map(cat => (
                                <option key={cat} value={cat}>{t(cat)}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="p-8 font-mono font-bold text-brand-brown whitespace-nowrap">{item.quantity} {item.unit}</td>
                        <td className="p-8">
                          <span className={`px-4 py-2 rounded-full text-[8px] font-bold uppercase tracking-widest flex items-center gap-2 w-fit whitespace-nowrap ${
                            item.status === 'Confirmed' ? 'bg-green-100 text-green-700' :
                            item.status === 'Need Split' ? 'bg-orange-100 text-orange-700' :
                            'bg-brand-gold/10 text-brand-gold'
                          }`}>
                            <div className={`w-1 h-1 rounded-full ${
                              item.status === 'Confirmed' ? 'bg-green-700' :
                              item.status === 'Need Split' ? 'bg-orange-700' :
                              'bg-brand-gold'
                            }`} />
                            {t(item.status)}
                          </span>
                        </td>
                        <td className="p-8">
                           <div className="flex items-center justify-end gap-3">
                             <button 
                               onClick={() => {
                                 setItemToSplit(item);
                                 setSplitResult([{ ...item, id: `${item.id}-1` }, { ...item, id: `${item.id}-2` }]);
                                 setShowSplitModal(true);
                               }}
                               disabled={item.status !== 'Need Split'}
                               className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${
                                 item.status === 'Need Split' 
                                 ? 'bg-blue-50 text-blue-500 hover:bg-blue-500 hover:text-white' 
                                 : 'bg-gray-50 text-gray-300 cursor-not-allowed opacity-50'
                               }`}
                               title={item.status !== 'Need Split' ? t('Item does not need splitting') : ''}
                             >
                               {t('Split / 拆分')}
                             </button>

                             <button 
                               onClick={() => {
                                 const updated = [...draftItems];
                                 updated[idx].status = 'Confirmed';
                                 setDraftItems(updated);
                                 alert(t('Successfully confirmed category'));
                               }}
                               disabled={item.status === 'Confirmed'}
                               className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${
                                 item.status !== 'Confirmed' 
                                 ? 'bg-green-50 text-green-600 hover:bg-green-600 hover:text-white' 
                                 : 'bg-gray-50 text-gray-300 cursor-not-allowed opacity-50'
                               }`}
                             >
                               {t('Confirm / 确认')}
                             </button>

                             {item.suggestedCategory === FurnitureCategory.OTHER ? (
                               <button 
                                 onClick={() => handlePushToConfigurator(item)}
                                 disabled={item.status !== 'Confirmed'}
                                 className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${
                                   item.status === 'Confirmed' 
                                   ? 'bg-brand-gold/10 text-brand-gold hover:bg-brand-gold hover:text-white' 
                                   : 'bg-gray-50 text-gray-300 cursor-not-allowed opacity-50'
                                 }`}
                               >
                                 {t('Add / 加入')}
                               </button>
                             ) : (
                               <button 
                                 onClick={() => handlePushToConfigurator(item)}
                                 disabled={item.status !== 'Confirmed' || item.suggestedCategory === 'unknown'}
                                 className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${
                                    item.status === 'Confirmed' && item.suggestedCategory !== 'unknown'
                                    ? 'bg-brand-brown text-brand-ivory hover:bg-brand-brown/90 shadow-md' 
                                    : 'bg-gray-50 text-gray-300 cursor-not-allowed opacity-50'
                                 }`}
                               >
                                 {t('Configure / 配置')}
                               </button>
                             )}

                             <button 
                               onClick={() => setDraftItems(draftItems.filter((_, i) => i !== idx))}
                               className="px-4 py-2 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all text-[9px] font-bold uppercase tracking-widest"
                             >
                               {t('Ignore / 忽略')}
                             </button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-12 bg-brand-beige/5 border-t border-brand-beige flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                    <FileSpreadsheet className="w-6 h-6 text-brand-gold" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-brand-brown uppercase tracking-widest">Client Draft Summary</h4>
                    <p className="text-[10px] text-brand-brown-muted uppercase font-bold opacity-60">
                      Total Items: {draftItems.length}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Trade & Sourcing / BOQ path: Proceed to manual pricing */}
                  {(quoteType === 'trade' || quoteType === 'boq') && (
                    <button
                      onClick={() => {
                        const confirmed = draftItems.filter(it => it.status === 'Confirmed');
                        if (confirmed.length === 0) {
                          alert('请先确认至少一个品项 Please confirm at least one item first');
                          return;
                        }
                        setTradePhase('pricing');
                      }}
                      className="px-10 py-5 bg-[#0C1B3A] text-[#C9A84C] rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-[#0F2551] active:scale-95 transition-all border border-[#C9A84C]/30 flex items-center gap-3"
                    >
                      Proceed to Pricing → 进入定价
                    </button>
                  )}

                   <button
                    onClick={() => {
                        const confirmed = draftItems.filter(it => it.status === 'Confirmed');
                        if (confirmed.length === 0) {
                          alert(t('Please confirm items before batch adding.'));
                          return;
                        }

                        const newItems: PackageItem[] = confirmed.map(item => {
                          const isOther = item.suggestedCategory === FurnitureCategory.OTHER;
                          return {
                            id: `batch-${item.id}-${Date.now()}`,
                            category: item.suggestedCategory as FurnitureCategory,
                            config: { ...genericConfig },
                            quantity: item.quantity,
                            bom: isOther ? [{
                              component: item.originalName,
                              quantity: item.quantity,
                              unit: item.unit,
                              unitPrice: item.targetUnitPrice,
                              total: item.targetTotal
                            }] : [],
                            totalAmount: isOther ? item.targetUnitPrice : 0 // Non-other items need config to get price
                          };
                        });

                        setPackageItems([...packageItems, ...newItems]);
                        setDraftItems(draftItems.filter(it => it.status !== 'Confirmed'));
                        setActiveTab('items');
                        alert(t('Added confirmed items to Project Package. Please configure non-furniture items individually.'));
                    }}
                    className="px-10 py-5 bg-brand-brown text-brand-ivory rounded-full text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-brand-brown/20 hover:scale-105 active:scale-95 transition-all"
                   >
                     {t('Batch Add to Package')}
                   </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null /* trade/boq: draft handled by editable table above */}
    </div>
  );

  const renderCategorySelection = () => (
    <div className="space-y-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="flex justify-start">
        <button 
          onClick={() => setProjectInfoSubmitted(false)}
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-gold hover:text-brand-brown transition-all group"
        >
          <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> {t('Back to Project Info')}
        </button>
      </div>

      <div className="space-y-16">
        {/* Section 1: Individual Items — only shown for 'custom' path */}
        {quoteType !== 'trade' && quoteType !== 'boq' && (
        <section className="space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-serif italic text-brand-brown">{t('Individual Item Quote')}</h2>
            <div className="w-24 h-px bg-brand-gold/30 mx-auto" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold">Custom-made furniture &amp; engineering items</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {Object.values(FurnitureCategory).map(cat => {
              const Icon = CATEGORY_ICONS[cat];
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setQuoteMode('single');
                    setSelectedCategory(cat);
                    setCurrentStep(0);
                  }}
                  className="group p-10 bg-white border border-brand-beige rounded-[48px] flex flex-col items-center gap-6 hover:border-brand-gold shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500"
                >
                  <div className="p-6 bg-brand-beige/20 rounded-[32px] group-hover:bg-brand-gold/10 group-hover:-rotate-6 transition-all duration-500">
                    <Icon className="w-8 h-8 text-brand-gold" />
                  </div>
                  <span className="text-lg font-serif italic text-brand-brown group-hover:text-brand-gold transition-colors">{t(cat)}</span>
                </button>
              );
            })}
          </div>
        </section>
        )} {/* end quoteType !== 'package' */}

        {/* Section 2: Scenarios — hidden, trade/boq go direct to workspace */}
        {false && (
        <section className="space-y-8 pt-12 border-t border-brand-beige/50">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-serif italic text-brand-brown">{t('Project Package Quote')}</h2>
            <div className="w-24 h-px bg-brand-gold/30 mx-auto" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold">Consolidated furniture bundles by environment</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {Object.values(Scenario).map(s => {
              const Icon = SCENARIO_ICONS[s];
              return (
                <button
                  key={s}
                  onClick={() => {
                    setQuoteMode('package');
                    handleScenarioSelect(s);
                  }}
                  className="group p-8 bg-brand-beige/5 border border-brand-beige/60 rounded-[40px] flex flex-col items-center text-center gap-5 hover:bg-white hover:border-brand-gold hover:shadow-xl transition-all duration-500"
                >
                  <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                    <Icon className="w-8 h-8 text-brand-gold" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-serif italic text-brand-brown">{t(s)} {t('Bundle')}</h4>
                    <p className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">{t('Full Set Quote')}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
        )} {/* end quoteType !== 'custom' */}
      </div>
    </div>
  );

  const renderRequirementInfo = () => {
    const currentConfig = 
      selectedCategory === FurnitureCategory.BED ? config :
      selectedCategory === FurnitureCategory.SOFA ? sofaConfig :
      selectedCategory === FurnitureCategory.CHAIR ? chairConfig :
      selectedCategory === FurnitureCategory.DINING_TABLE ? diningTableConfig :
      selectedCategory === FurnitureCategory.WARDROBE || selectedCategory === FurnitureCategory.CABINET || selectedCategory === FurnitureCategory.TV_UNIT ? modularConfig :
      genericConfig;

    const notes = (currentConfig as any).notes;
    const specOverride = selectedCategory === FurnitureCategory.SOFA ? (currentConfig as any).sofaType : '';

    if (!notes && !specOverride) return null;
    if (STEPS[currentStep].id === 'summary') return null;

    return (
      <div className="mb-8 p-6 bg-brand-gold/5 border border-brand-gold/20 rounded-3xl space-y-4">
        <h4 className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.25em] flex items-center gap-2">
           <Info className="w-3 h-3" /> {t('Split Requirement Info')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
           {specOverride && (
             <div className="space-y-1">
               <span className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-widest">{t('Type / Specification')}</span>
               <p className="text-sm font-serif italic text-brand-brown">{specOverride}</p>
             </div>
           )}
           {notes && (
             <div className="space-y-1">
               <span className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-widest">{t('Notes')}</span>
               <p className="text-sm text-brand-brown-muted">{notes}</p>
             </div>
           )}
        </div>
      </div>
    );
  };

  const renderStep = () => {
    const stepId = STEPS[currentStep].id;

    if (stepId === 'summary') {
      const currentConfig = 
        selectedCategory === FurnitureCategory.BED ? config :
        selectedCategory === FurnitureCategory.SOFA ? sofaConfig :
        selectedCategory === FurnitureCategory.CHAIR ? chairConfig :
        selectedCategory === FurnitureCategory.DINING_TABLE ? diningTableConfig :
        selectedCategory === FurnitureCategory.WARDROBE || selectedCategory === FurnitureCategory.CABINET || selectedCategory === FurnitureCategory.TV_UNIT ? modularConfig :
        genericConfig;

      return (
        <div className="space-y-12 text-sans">
           <div className="bg-brand-beige/10 p-10 rounded-[40px] border border-brand-beige">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown mb-8 flex items-center gap-2 italic">
               <FileText className="w-3 h-3 text-brand-gold" /> {t('Quotation Details')}
             </h3>
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                {[
                  { key: 'customerProjectName', label: t('Customer / Project') },
                  { key: 'phoneWhatsApp', label: t('Phone / WA Phone') },
                  { key: 'salesperson', label: t('Staff') },
                  { key: 'quoteNumber', label: t('Ref No') },
                  { key: 'date', label: t('Date'), type: 'date' }
                ].map(field => (
                  <div key={field.key} className="space-y-2">
                    <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-[0.1em]">{field.label}</label>
                    <input 
                      type={field.type || 'text'}
                      value={quoteInfo[field.key as keyof typeof quoteInfo]} 
                      onChange={e => setQuoteInfo({...quoteInfo, [field.key]: e.target.value})}
                      className="w-full bg-transparent border-b border-brand-brown/10 py-1 text-sm font-medium focus:border-brand-gold outline-none"
                    />
                  </div>
                ))}
             </div>
           </div>

           <div className="bg-white p-6 sm:p-12 rounded-[48px] border border-brand-beige">
               <div className="space-y-12">
                <section className="bg-brand-beige/5 p-8 rounded-[32px] border border-brand-beige/30">
                  <h4 className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-[0.25em] mb-6 flex items-center gap-3">
                     <Settings className="w-3 h-3 text-brand-gold" /> {t('Project Overview')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-4 text-xs">
                     <div className="flex justify-between border-b border-brand-beige/50 pb-2">
                       <span className="text-brand-brown-muted">{t('Category')}</span>
                       <span className="font-bold">{t(selectedCategory!)}</span>
                     </div>
                     <div className="flex justify-between border-b border-brand-beige/50 pb-2">
                       <span className="text-brand-brown-muted">{t('Scenario')}</span>
                       <span className="font-bold">{selectedScenario ? t(selectedScenario) : 'Generic'}</span>
                     </div>
                     <div className="flex justify-between border-b border-brand-beige/50 pb-2">
                       <span className="text-brand-brown-muted">{t('Finish')}</span>
                       <span className="font-bold">{(currentConfig as any).finish ? t((currentConfig as any).finish) : 'N/A'}</span>
                     </div>
                     <div className="flex justify-between border-b border-brand-beige/50 pb-2">
                       <span className="text-brand-brown-muted">{t('Color Way')}</span>
                       <span className="font-bold">{currentConfig.color === Color.CUSTOM ? `Custom` : t(currentConfig.color)}</span>
                     </div>
                  </div>
                </section>

                <section className="bg-brand-brown p-8 rounded-[32px] text-brand-ivory">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.25em] mb-6 flex items-center gap-3">
                     <Square className="w-3 h-3 text-brand-gold" /> {t('Product Summary')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {selectedCategory === FurnitureCategory.WARDROBE || selectedCategory === FurnitureCategory.CABINET || selectedCategory === FurnitureCategory.TV_UNIT ? (
                      modularConfig.modules.map((m, idx) => (
                        <div key={idx} className="bg-white/5 p-4 rounded-2xl border border-white/10">
                          <p className="text-[9px] uppercase tracking-widest text-brand-gold/60 font-bold mb-1">Module {idx + 1}</p>
                          <p className="font-serif italic text-lg">{t(m.type)}</p>
                          <p className="text-xs opacity-60 mt-2">{m.width}x{m.height}x{m.depth}mm</p>
                          <p className="text-xs font-bold mt-1 text-brand-gold">QTY: {m.quantity}</p>
                        </div>
                      ))
                    ) : (
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                        <p className="text-[9px] uppercase tracking-widest text-brand-gold/60 font-bold mb-1">Primary Unit</p>
                        <p className="font-serif italic text-lg">{t(selectedCategory!)}</p>
                        <p className="text-xs font-bold mt-1 text-brand-gold">QTY: 1</p>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <h4 className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-[0.25em] flex items-center gap-3">
                       <Package className="w-3 h-3 text-brand-gold" /> {t('BOM Breakdown')}
                    </h4>
                  </div>
                  
                  <div className="space-y-12">
                    {Object.entries(
                      bom.reduce((acc, item) => {
                        const group = item.group || 'Standard Items';
                        if (!acc[group]) acc[group] = [];
                        acc[group].push(item);
                        return acc;
                      }, {} as Record<string, typeof bom>)
                    ).map(([groupName, items], gIdx) => (
                      <div key={gIdx} className="space-y-4">
                        <h5 className="text-[9px] font-bold text-brand-gold uppercase tracking-[0.3em] border-l-2 border-brand-gold pl-3">{groupName}</h5>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] text-left">
                            <thead>
                              <tr className="border-b border-brand-beige text-brand-brown/40 font-bold uppercase tracking-widest">
                                <th className="pb-3 px-2">{t('Component')}</th>
                                <th className="pb-3 text-center px-2">{t('Qty')}</th>
                                <th className="pb-3 text-right px-2">{t('Rate')}</th>
                                <th className="pb-3 text-right px-2">{t('Subtotal')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-beige/30">
                              {(items as any[]).map((item: any, iIdx) => (
                                <tr key={iIdx}>
                                  <td className="py-4 px-2 font-medium text-brand-brown">{item.component}</td>
                                  <td className="py-4 text-center px-2 text-brand-brown-muted font-mono">{item.quantity} {item.unit}</td>
                                  <td className="py-4 text-right px-2 text-brand-brown-muted font-mono">{item.unitPrice.toLocaleString()}</td>
                                  <td className="py-4 text-right px-2 font-bold text-brand-brown font-mono">{item.total.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-brand-beige/5 font-bold">
                                <td colSpan={3} className="py-3 text-right text-[9px] uppercase tracking-widest px-2">Module Subtotal</td>
                                <td className="py-3 text-right text-brand-brown font-mono px-2">
                                  {(items as any[]).reduce((sum: number, i: any) => sum + i.total, 0).toLocaleString()}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-12 pt-8 border-t-4 border-brand-brown">
                    <div className="flex justify-between items-center bg-brand-beige/10 p-6 rounded-2xl">
                      <span className="text-[10px] font-bold text-brand-brown uppercase tracking-[0.3em]">{t('Total Materials Subtotal')}</span>
                      <span className="text-3xl font-serif italic text-brand-brown">{costs.material.toLocaleString()} <span className="text-[10px] font-sans font-bold uppercase tracking-widest not-italic ml-2 font-mono">AED</span></span>
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-16 pt-12 border-t border-brand-beige">
                  <div className="space-y-6">
                     <h4 className="text-[10px] font-bold text-brand-brown uppercase tracking-[0.2em] mb-4 italic">{t('Operational Overheads')}</h4>
                     <div className="space-y-3 text-xs">
                       {[
                         { label: t('Labor'), key: 'labor' },
                         { label: t('Packaging'), key: 'packaging' },
                         { label: t('Transport'), key: 'transport' },
                         { label: t('Installation'), key: 'installation' },
                       ].map(field => (
                         <div key={field.key} className="flex justify-between items-center border-b border-brand-beige pb-2">
                           <span className="text-brand-brown-muted font-medium">{field.label}</span>
                           <div className="flex items-center gap-2">
                             <input 
                               type="number" 
                               value={costOverrides[field.key as keyof typeof costOverrides]} 
                               onChange={e => setCostOverrides(prev => ({ ...prev, [field.key]: Number(e.target.value) }))}
                               className="w-20 bg-brand-beige/20 text-right font-mono text-brand-brown px-2 py-1 rounded focus:outline-none focus:bg-brand-gold/10 transition-colors"
                             />
                             <span className="text-[9px] opacity-40">AED</span>
                           </div>
                         </div>
                       ))}
                     </div>
                  </div>
                  <div className="space-y-6">
                     <h4 className="text-[10px] font-bold text-brand-brown uppercase tracking-[0.2em] mb-4 italic">{t('Financial Summary')}</h4>
                     <div className="space-y-4">
                       <div className="flex justify-between items-center text-xs">
                          <span className="text-brand-brown-muted">{t('Margin (%)')}</span>
                          <input 
                            type="number" 
                            value={costOverrides.marginPercent} 
                            onChange={e => setCostOverrides(prev => ({ ...prev, marginPercent: Number(e.target.value) }))}
                            className="w-16 bg-brand-beige/20 text-right font-mono text-brand-brown px-2 py-1 rounded focus:outline-none focus:bg-brand-gold/10 transition-colors"
                          />
                       </div>
                       <div className="flex justify-between text-xs pt-1 border-t border-brand-beige/30">
                         <span className="text-brand-brown-muted italic">{t('Margin Amt')}</span>
                         <span className="font-mono text-brand-brown font-bold">{costs.margin.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between text-sm pt-6 font-bold border-t border-brand-brown/10 mt-4">
                         <span className="uppercase tracking-widest text-[10px]">{t('Net (Excl. VAT)')}</span>
                         <span className="font-mono text-brand-brown">{(costs.total / (1 + costOverrides.vatPercent/100)).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                       </div>
                       <div className="flex justify-between items-center text-[10px] text-brand-brown-muted italic mt-1 font-medium">
                         <span>{t('VAT (%)')}</span>
                         <input 
                            type="number" 
                            value={costOverrides.vatPercent} 
                            onChange={e => setCostOverrides(prev => ({ ...prev, vatPercent: Number(e.target.value) }))}
                            className="w-14 bg-brand-beige/10 text-right font-mono italic px-2 py-0.5 rounded focus:outline-none"
                          />
                       </div>
                       <div className="flex justify-between text-[10px] text-brand-brown-muted italic font-medium">
                         <span>{t('VAT Amt')}</span>
                         <span className="font-mono italic">{costs.vat.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                       </div>
                       <div className="mt-8 p-6 bg-brand-brown text-brand-ivory rounded-[32px] flex justify-between items-center shadow-2xl shadow-brand-brown/20 border border-brand-gold/30 transition-all duration-700">
                          <span className="text-[10px] font-bold uppercase tracking-[0.3em]">{t('Gross Quote')}</span>
                          <span className="text-3xl font-serif italic tracking-tighter text-brand-gold">{costs.total.toLocaleString(undefined, {maximumFractionDigits:0})} <span className="text-sm not-italic opacity-60">AED</span></span>
                       </div>
                     </div>
                  </div>
                </section>
              </div>
           </div>

            {/* Step 5 marker — final action row */}
            <div className="flex items-center gap-2 justify-center mb-3">
              <div className="h-px flex-1 bg-[#0C1B3A]/8" />
              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#C9A84C] px-3">Step 5 · Final Actions</span>
              <div className="h-px flex-1 bg-[#0C1B3A]/8" />
            </div>

            <div className="flex flex-col sm:flex-row gap-5 max-w-2xl mx-auto w-full">
              {quoteMode === 'package' ? (
                <button
                  onClick={addToPackage}
                  className="flex-1 p-6 rounded-[28px] bg-brand-gold text-brand-ivory flex justify-center items-center gap-4 font-bold uppercase tracking-widest text-xs shadow-xl shadow-brand-gold/20 hover:bg-brand-gold/90 transition-all active:scale-95 group"
                >
                  <PlusCircle className="w-5 h-5 text-white group-hover:scale-110 transition-transform" /> {t('Add to Project Package')}
                </button>
              ) : (
                <button onClick={saveToHistory} className="flex-1 p-6 rounded-[28px] bg-white border border-brand-gold text-brand-brown flex justify-center items-center gap-4 font-bold uppercase tracking-widest text-xs hover:bg-brand-gold/10 transition-all active:scale-95 group">
                  <Archive className="w-5 h-5 text-brand-gold group-hover:scale-110 transition-transform" /> {t('Save Record')}
                </button>
              )}
             <button onClick={() => window.print()} className="flex-1 p-6 rounded-[28px] bg-white border border-brand-brown text-brand-brown flex justify-center items-center gap-4 font-bold uppercase tracking-widest text-xs hover:bg-brand-beige/30 transition-all active:scale-95 group">
               <Printer className="w-5 h-5 text-brand-gold group-hover:scale-110 transition-transform" /> {t('Print Spec')}
             </button>
             <button onClick={generatePDF} className="flex-1 p-6 rounded-[28px] bg-white border border-brand-gold text-brand-gold flex justify-center items-center gap-4 font-bold uppercase tracking-widest text-xs hover:bg-brand-gold/10 transition-all active:scale-95 group">
               <Download className="w-5 h-5 text-brand-gold group-hover:scale-110 transition-transform" /> {t('Download PDF')}
             </button>
             <button onClick={() => alert(t('Quotation sent message'))} className="flex-1 p-6 rounded-[28px] bg-brand-brown text-brand-ivory flex justify-center items-center gap-4 font-bold uppercase tracking-widest text-xs shadow-xl shadow-brand-brown/20 hover:bg-brand-brown/90 transition-all active:scale-95 group">
               <Download className="w-5 h-5 text-brand-gold group-hover:translate-y-1 transition-transform" /> {t('Sync to CRM')}
             </button>
             <button onClick={sendToTrade} className="flex-1 p-6 rounded-[28px] bg-[#0C1B3A] text-[#C9A84C] flex justify-center items-center gap-4 font-bold uppercase tracking-widest text-xs shadow-xl hover:bg-[#0F2551] transition-all active:scale-95 group border border-[#C9A84C]/30">
               <ExternalLink className="w-5 h-5 text-[#C9A84C] group-hover:translate-x-1 transition-transform" /> Send to TRADE
             </button>
             {/* Print Only View (English) */}
            <div id="quotation-print" className="hidden print:block p-10 bg-white text-black font-sans">
              <div className="border-b-2 border-brand-brown pb-6 mb-8 flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-serif italic text-brand-brown">GCI LIVING</h1>
                  <p className="text-[10px] uppercase tracking-widest text-brand-brown-muted mt-1">{tPDF('QUOTATION')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold">{tPDF('Quotation No.')}: {quoteInfo.quoteNumber}</p>
                  <p className="text-[10px] text-gray-500">{tPDF('Date')}: {new Date(quoteInfo.date).toLocaleDateString('en-GB')}</p>
                </div>
              </div>

              <section className="mb-8">
                <h2 className="text-sm font-bold uppercase tracking-widest border-b border-gray-200 pb-2 mb-4">{tPDF('CLIENT INFORMATION')}</h2>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-gray-500 uppercase text-[8px] font-bold">{tPDF('Customer / Project Name')}</p>
                    <p className="font-medium">{quoteInfo.customerProjectName}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 uppercase text-[8px] font-bold">{tPDF('Phone / WhatsApp')}</p>
                    <p className="font-medium">{quoteInfo.phoneWhatsApp || 'N/A'}</p>
                  </div>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-sm font-bold uppercase tracking-widest border-b border-gray-200 pb-2 mb-4">{tPDF('PRODUCT SPECIFICATION')}</h2>
                <div className="grid grid-cols-3 gap-6 text-xs">
                  <div>
                    <p className="text-gray-500 uppercase text-[8px] font-bold">{tPDF('Category')}</p>
                    <p className="font-medium">{tPDF(selectedCategory!)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 uppercase text-[8px] font-bold">{tPDF('Scenario')}</p>
                    <p className="font-medium">{tPDF(selectedScenario!)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 uppercase text-[8px] font-bold">{tPDF('Color')}</p>
                    <p className="font-medium">{config.color === Color.CUSTOM ? (config.customColor || 'Custom') : tPDF(config.color)}</p>
                  </div>
                </div>
              </section>

              <table className="w-full text-xs mb-8 border-collapse">
                <thead>
                  <tr className="bg-gray-50 uppercase text-[8px] font-bold tracking-widest">
                    <th className="border p-2 text-left">{tPDF('Component')}</th>
                    <th className="border p-2 text-left">{tPDF('Specification')}</th>
                    <th className="border p-2 text-center">{tPDF('Qty')}</th>
                    <th className="border p-2 text-right">{tPDF('Rate')}</th>
                    <th className="border p-2 text-right">{tPDF('Subtotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.map((item, i) => (
                    <tr key={i}>
                      <td className="border p-2">{tPDF(item.component.split(':')[0])}</td>
                      <td className="border p-2">{item.component.split(':')[1] ? tPDF(item.component.split(':')[1].trim()) : 'Standard'}</td>
                      <td className="border p-2 text-center">{item.quantity} {tPDF(item.unit)}</td>
                      <td className="border p-2 text-right">{item.unitPrice.toLocaleString()}</td>
                      <td className="border p-2 text-right">{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>{tPDF('Material')}</span>
                    <span>{costs.material.toLocaleString()} AED</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-gray-100 pb-2 mb-2">
                    <span>{tPDF('Labor / Logistics')}</span>
                    <span>{(costs.labor + costs.packaging + costs.transport + costs.installation).toLocaleString()} AED</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm bg-gray-50 p-2">
                    <span>{tPDF('Gross Quote')}</span>
                    <span>{costs.total.toLocaleString()} AED</span>
                  </div>
                  <p className="text-[8px] text-gray-400 mt-4 text-center">
                    GCI LIVING - {tPDF('Commercial Grade')} | {tPDF('Verified Status')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (selectedCategory === FurnitureCategory.CHAIR) {
      switch (stepId) {
        case 'dimensions':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Ruler className="w-3 h-3 text-brand-gold" /> 尺寸规格 (mm)
              </h3>
              <div className="grid grid-cols-1 gap-8">
                {[
                  { label: t('Width Label'), key: 'width' },
                  { label: t('Depth Label'), key: 'depth' },
                  { label: t('Seat Height Label'), key: 'seatHeight' },
                  { label: t('Back Height Label'), key: 'backHeight' }
                ].map(f => (
                  <div key={f.key} className="space-y-3">
                    <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-[0.15em]">{f.label}</label>
                    <input
                      type="number"
                      value={chairConfig[f.key as keyof ChairConfiguration] as number}
                      onChange={e => updateChairConfig({ [f.key]: Number(e.target.value) })}
                      className="w-full bg-transparent border-b border-brand-brown/10 text-2xl font-serif italic text-brand-brown focus:border-brand-gold outline-none pb-2"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        case 'type':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Layout className="w-3 h-3 text-brand-gold" /> {t('Chair Type')}
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {Object.values(ChairType).map(tVal => (
                  <button
                    key={tVal}
                    onClick={() => updateChairConfig({ type: tVal })}
                    className={`p-10 text-left border rounded-[32px] font-bold text-xs uppercase tracking-widest transition-all relative group ${chairConfig.type === tVal ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    <span className="block text-xl font-serif italic">{t(tVal)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        case 'frame':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Square className="w-3 h-3 text-brand-gold" /> {t('Frame Material')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {[Material.SOLID_WOOD, Material.METAL, Material.PLYWOOD].map(m => (
                  <button
                    key={m}
                    onClick={() => updateChairConfig({ frameMaterial: m })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${chairConfig.frameMaterial === m ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(m)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'legs':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Columns className="w-3 h-3 text-brand-gold" /> {t('Leg Type')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(LegType).map(l => (
                  <button
                    key={l}
                    onClick={() => updateChairConfig({ legType: l })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${chairConfig.legType === l ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(l)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'backrest':
          return (
             <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Layers className="w-3 h-3 text-brand-gold" /> {t('Backrest')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(BackrestType).map(b => (
                  <button
                    key={b}
                    onClick={() => updateChairConfig({ backrest: b })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${chairConfig.backrest === b ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(b)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'seat':
          return (
             <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Archive className="w-3 h-3 text-brand-gold" /> {t('Seat')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(SeatType).map(s => (
                  <button
                    key={s}
                    onClick={() => updateChairConfig({ seat: s })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${chairConfig.seat === s ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(s)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'upholstery':
          return (
             <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Palette className="w-3 h-3 text-brand-gold" /> {t('Upholstery')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(SofaUpholsteryType).map(u => (
                  <button
                    key={u}
                    onClick={() => updateChairConfig({ upholstery: u })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${chairConfig.upholstery === u ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(u)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'armrest':
          return (
             <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Trello className="w-3 h-3 text-brand-gold" /> {t('Armrest')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(ArmrestType).map(a => (
                  <button
                    key={a}
                    onClick={() => updateChairConfig({ armrest: a })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${chairConfig.armrest === a ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(a)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'finish':
          return (
             <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Palette className="w-3 h-3 text-brand-gold" /> {t('Finish')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(FinishType).map(f => (
                  <button
                    key={f}
                    onClick={() => updateChairConfig({ finish: f })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${chairConfig.finish === f ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(f)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'color':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Palette className="w-3 h-3 text-brand-gold" /> {t('Color')}
              </h3>
              <div className="grid grid-cols-5 gap-4">
                {Object.values(Color).map(c => (
                  <button
                    key={c}
                    onClick={() => updateChairConfig({ color: c })}
                    className={`h-16 rounded-3xl border-2 transition-all flex items-center justify-center relative group ${chairConfig.color === c ? 'border-brand-gold scale-110 shadow-lg' : 'border-transparent hover:border-brand-beige'}`}
                    style={{ backgroundColor: c === Color.WHITE ? '#FFFFFF' : c === Color.BEIGE ? '#F5F5DC' : c === Color.WALNUT ? '#5D4037' : c === Color.GREY ? '#808080' : '#CCCCCC' }}
                  >
                    {chairConfig.color === c && <PlusCircle className={`w-4 h-4 ${c === Color.WHITE || c === Color.BEIGE ? 'text-brand-gold' : 'text-brand-ivory'}`} />}
                  </button>
                ))}
              </div>
              {chairConfig.color === Color.CUSTOM && (
                <div className="mt-8 p-6 bg-white border border-brand-beige rounded-[32px]">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-gold block mb-2">Custom Color RAL/Pantone</label>
                  <input
                    type="text"
                    value={chairConfig.customColor || ''}
                    onChange={e => updateChairConfig({ customColor: e.target.value })}
                    className="w-full bg-transparent border-b border-brand-beige py-2 px-1 focus:border-brand-gold outline-none"
                    placeholder="e.g. RAL 7016"
                  />
                </div>
              )}
            </div>
          );
        case 'addons':
          return (
            <div className="space-y-8">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <PlusCircle className="w-3 h-3 text-brand-gold" /> {t('Add-ons')}
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {Object.values(AddOn).map(a => (
                  <button
                    key={a}
                    onClick={() => toggleChairAddOn(a)}
                    className={`p-8 text-left border rounded-[32px] flex justify-between items-center transition-all ${chairConfig.addOns.includes(a) ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-xl' : 'bg-white text-brand-brown border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    <span className="text-xl font-serif italic">{t(a)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        default: return null;
      }
    }

    if (selectedCategory === FurnitureCategory.DINING_TABLE) {
      switch (stepId) {
        case 'shape':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Layout className="w-3 h-3 text-brand-gold" /> {t('Shape')}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {Object.values(TableShape).map(s => (
                  <button
                    key={s}
                    onClick={() => updateDiningTableConfig({ shape: s })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${diningTableConfig.shape === s ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(s)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'material':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Layers className="w-3 h-3 text-brand-gold" /> {t('Top Material')}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {[Material.SOLID_WOOD, Material.MARBLE, Material.GLASS, Material.PLYWOOD].map(m => (
                  <button
                    key={m}
                    onClick={() => updateDiningTableConfig({ topMaterial: m })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${diningTableConfig.topMaterial === m ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(m)}
                  </button>
                ))}
              </div>
              <div className="mt-8">
                <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-[0.15em] mb-3 block">{t('Thickness_Label')} (mm)</label>
                <div className="grid grid-cols-3 gap-4">
                  {Object.values(Thickness).map(th => (
                    <button
                      key={th}
                      onClick={() => updateDiningTableConfig({ thickness: th })}
                      className={`p-4 border rounded-xl text-[10px] font-bold ${diningTableConfig.thickness === th ? 'bg-brand-gold text-white' : 'bg-white text-brand-brown border-brand-beige'}`}
                    >
                      {t(th)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        case 'legs':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Columns className="w-3 h-3 text-brand-gold" /> {t('Base/Legs')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(TableBaseType).map(b => (
                  <button
                    key={b}
                    onClick={() => updateDiningTableConfig({ baseType: b })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${diningTableConfig.baseType === b ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(b)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'edge':
          return (
             <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Ruler className="w-3 h-3 text-brand-gold" /> {t('Edge Treatment')}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {Object.values(EdgeTreatment).map(e => (
                  <button
                    key={e}
                    onClick={() => updateDiningTableConfig({ edge: e })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${diningTableConfig.edge === e ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(e)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'dimensions':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Ruler className="w-3 h-3 text-brand-gold" /> {t('Dimensions (mm)')}
              </h3>
              <div className="grid grid-cols-1 gap-8">
                {[
                  { label: t('Length Label'), key: 'length' },
                  { label: t('Width Label'), key: 'width' },
                  { label: t('Height Label'), key: 'height' }
                ].map(f => (
                  <div key={f.key} className="space-y-3">
                    <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-[0.15em]">{f.label}</label>
                    <input
                      type="number"
                      value={diningTableConfig[f.key as keyof DiningTableConfiguration] as number}
                      onChange={e => updateDiningTableConfig({ [f.key]: Number(e.target.value) })}
                      className="w-full bg-transparent border-b border-brand-brown/10 text-2xl font-serif italic text-brand-brown focus:border-brand-gold outline-none pb-2"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-[0.15em] mb-3 block">{t('Thickness_Label')} (mm)</label>
                <div className="grid grid-cols-3 gap-4">
                  {Object.values(Thickness).map(th => (
                    <button
                      key={th}
                      onClick={() => updateDiningTableConfig({ thickness: th })}
                      className={`p-4 border rounded-xl text-[10px] font-bold ${diningTableConfig.thickness === th ? 'bg-brand-gold text-white' : 'bg-white text-brand-brown border-brand-beige'}`}
                    >
                      {t(th)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        case 'finish':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Palette className="w-3 h-3 text-brand-gold" /> {t('Project Finish')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(FinishType).map(f => (
                  <button
                    key={f}
                    onClick={() => updateDiningTableConfig({ finish: f })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${diningTableConfig.finish === f ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(f)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'color':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Palette className="w-3 h-3 text-brand-gold" /> 颜色方案 Color
              </h3>
              <div className="grid grid-cols-5 gap-4">
                {Object.values(Color).map(c => (
                  <button
                    key={c}
                    onClick={() => updateDiningTableConfig({ color: c })}
                    className={`h-16 rounded-3xl border-2 transition-all flex items-center justify-center relative group ${diningTableConfig.color === c ? 'border-brand-gold scale-110 shadow-lg' : 'border-transparent hover:border-brand-beige'}`}
                    style={{ backgroundColor: c === Color.WHITE ? '#FFFFFF' : c === Color.BEIGE ? '#F5F5DC' : c === Color.WALNUT ? '#5D4037' : c === Color.GREY ? '#808080' : '#CCCCCC' }}
                  >
                    {diningTableConfig.color === c && <PlusCircle className={`w-4 h-4 ${c === Color.WHITE || c === Color.BEIGE ? 'text-brand-gold' : 'text-brand-ivory'}`} />}
                  </button>
                ))}
              </div>
            </div>
          );
        default: return null;
      }
    }

    if ([FurnitureCategory.WARDROBE, FurnitureCategory.CABINET, FurnitureCategory.TV_UNIT].includes(selectedCategory!)) {
      if (stepId === 'modules') {
        return (
          <div className="space-y-12">
            <div className="flex justify-between items-center bg-brand-beige/10 p-6 rounded-[32px] border border-brand-beige">
              <div className="space-y-1">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Layout className="w-3 h-3 text-brand-gold" /> {t('Module Management')}
              </h3>
                <p className="text-[8px] text-brand-brown-muted uppercase tracking-widest italic">Add multiple components to build your custom storage system</p>
              </div>
              <button 
                onClick={handleAddModule}
                className="flex items-center gap-2 px-8 py-4 rounded-full bg-brand-gold text-brand-ivory text-[10px] font-bold uppercase tracking-widest hover:bg-brand-gold/90 transition-all shadow-xl shadow-brand-gold/20 active:scale-95"
              >
                <PlusCircle className="w-4 h-4" /> {t('Add Module')}
              </button>
            </div>

            <div className="space-y-6">
              {modularConfig.modules.length === 0 ? (
                <div className="py-24 border-2 border-dashed border-brand-beige rounded-[48px] text-center space-y-6 bg-brand-beige/5">
                  <div className="w-20 h-20 bg-brand-beige/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Package className="w-10 h-10 text-brand-gold/40" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-brand-brown font-serif italic text-xl">Empty Configuration</p>
                    <p className="text-brand-brown-muted text-[10px] uppercase tracking-widest font-bold">开始添加模块进行系统设计 Add modules to start designing</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {modularConfig.modules.map((module, idx) => (
                    <motion.div 
                      key={module.id} 
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white p-10 rounded-[40px] border border-brand-beige shadow-sm hover:shadow-xl transition-all group relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start mb-10 relative z-10">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <span className="px-3 py-1 bg-brand-gold/10 text-brand-gold text-[8px] font-bold rounded-full uppercase tracking-widest">
                              M-{idx + 1}
                            </span>
                            <span className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-[0.2em]">Qty: {module.quantity}</span>
                          </div>
                          <h4 className="text-2xl font-serif italic text-brand-brown pr-20">{t(module.type)}</h4>
                        </div>
                        <div className="flex gap-3 relative z-20">
                          <button onClick={() => handleDuplicateModule(module)} className="p-3 rounded-2xl bg-brand-beige/20 hover:bg-brand-gold/10 text-brand-brown hover:text-brand-gold transition-all" title="Duplicate"><Layers className="w-4 h-4" /></button>
                          <button onClick={() => handleEditModule(module)} className="p-3 rounded-2xl bg-brand-beige/20 hover:bg-brand-gold/10 text-brand-brown hover:text-brand-gold transition-all" title="Edit"><Settings className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteModule(module.id)} className="p-3 rounded-2xl bg-brand-beige/20 hover:bg-red-50 text-brand-brown hover:text-red-400 transition-all" title="Delete"><X className="w-4 h-4" /></button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-[10px] relative z-10">
                        <div className="space-y-2">
                          <span className="text-brand-brown-muted uppercase font-bold tracking-[0.15em] block opacity-60">Dimensions (mm)</span>
                          <span className="text-brand-brown font-mono text-lg font-medium">{module.width}w × {module.depth}d × {module.height}h</span>
                        </div>
                        <div className="space-y-3">
                          <span className="text-brand-brown-muted uppercase font-bold tracking-[0.15em] block opacity-60">Board Material</span>
                          <div className="space-y-1">
                            <span className="text-brand-brown font-bold block">{t(module.material)}</span>
                            <span className="text-[9px] text-brand-gold italic">{t(module.thickness)} Thickness</span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <span className="text-brand-brown-muted uppercase font-bold tracking-[0.15em] block opacity-60">Components</span>
                          <div className="space-y-1">
                             <span className="text-brand-brown block">{module.doorCount}x {t(module.doorType)}</span>
                             {module.hasDrawers && <span className="text-brand-brown block">{module.drawerCount}x {t(module.runnerType)} Drawers</span>}
                             <span className="text-brand-brown block">{module.shelfCount} Shelves</span>
                             {module.hasHangingRail && <span className="text-brand-brown block">Hanging Rail</span>}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <span className="text-brand-brown-muted uppercase font-bold tracking-[0.15em] block opacity-60">Mount / Hardware</span>
                          <div className="space-y-1 text-brand-brown italic">
                            <span>{t(module.mounting)} | {t(module.color)}</span>
                            <span className="block">{t(module.finish)}</span>
                            <span className="block">{t(module.handle)} | {t(module.hingeType)}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Subdued BG Decor */}
                      <div className="absolute top-0 right-0 -mr-8 -mt-8 opacity-[0.03] pointer-events-none group-hover:opacity-[0.06] transition-opacity duration-700">
                        <Layout className="w-48 h-48 rotate-12" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }
    }

    if (selectedCategory === FurnitureCategory.SOFA) {
      switch (stepId) {
        case 'dimensions':
          return (
            <div className="space-y-12">
               <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Ruler className="w-3 h-3 text-brand-gold" /> {t('Sofa Dimensions')} (mm)
              </h3>
              <div className="grid grid-cols-1 gap-8">
                {[
                  { label: t('Overall Length'), key: 'length' },
                  { label: t('Depth'), key: 'depth' },
                  { label: t('Seat Height'), key: 'seatHeight' },
                  { label: t('Back Height'), key: 'backHeight' }
                ].map((field) => (
                  <div key={field.key} className="space-y-3">
                    <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-[0.15em]">{field.label}</label>
                    <input
                      type="number"
                      value={sofaConfig[field.key as keyof SofaConfiguration] as number}
                      onChange={e => updateSofaConfig({ [field.key]: Number(e.target.value) })}
                      className="w-full bg-transparent border-b border-brand-brown/10 text-2xl font-serif italic text-brand-brown focus:border-brand-gold outline-none pb-2 transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        case 'material':
          return (
            <div className="space-y-12">
               <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Layers className="w-3 h-3 text-brand-gold" /> {t('Cushion & Foam')}
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {Object.values(SofaCushionType).map(m => (
                  <button
                    key={m}
                    onClick={() => updateSofaConfig({ cushionType: m })}
                    className={`p-10 text-left border rounded-[32px] font-bold text-xs uppercase tracking-widest transition-all overflow-hidden relative group ${sofaConfig.cushionType === m ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    <span className="block text-xl font-serif italic mb-2">{t(m)}</span>
                    <span className={`text-[10px] opacity-60 ${sofaConfig.cushionType === m ? 'text-brand-gold' : 'text-brand-brown'}`}>+{SOFA_CUSHION_COSTS[m]} AED Base</span>
                    {sofaConfig.cushionType === m && <div className="absolute top-0 right-0 p-4"><PlusCircle className="w-4 h-4 text-brand-gold" /></div>}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'frame':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Square className="w-3 h-3 text-brand-gold" /> {t('Frame')}
              </h3>
              <div className="grid grid-cols-2 gap-5">
                {Object.values(SofaFrameType).map(f => (
                  <button
                    key={f}
                    onClick={() => updateSofaConfig({ frameType: f })}
                    className={`p-10 text-left border rounded-[32px] transition-all relative group ${sofaConfig.frameType === f ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-xl' : 'bg-brand-beige/30 text-brand-brown border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    <span className="block text-xl font-serif italic mb-2 tracking-tight">{t(f)}</span>
                    <span className={`text-[10px] font-mono opacity-60 ${sofaConfig.frameType === f ? 'text-brand-gold' : 'text-brand-brown'}`}>+{SOFA_FRAME_COSTS[f]} AED</span>
                    {sofaConfig.frameType === f && <div className="absolute top-0 right-0 p-4"><PlusCircle className="w-4 h-4 text-brand-gold" /></div>}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'finish':
          return (
             <div className="space-y-12">
              <section className="space-y-8">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                  <Palette className="w-3 h-3 text-brand-gold" /> {t('Upholstery')}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.values(SofaUpholsteryType).map(f => (
                    <button
                      key={f}
                      onClick={() => updateSofaConfig({ upholsteryType: f })}
                      className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${sofaConfig.upholsteryType === f ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                    >
                      {t(f)}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          );
        case 'addons':
           return (
            <div className="space-y-8">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <PlusCircle className="w-3 h-3 text-brand-gold" /> {t('Add-ons')}
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {Object.values(AddOn).map(a => (
                  <button
                    key={a}
                    onClick={() => toggleSofaAddOn(a)}
                    className={`p-8 text-left border rounded-[32px] flex justify-between items-center transition-all ${sofaConfig.addOns.includes(a) ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-xl translate-x-3' : 'bg-white text-brand-brown border-brand-beige hover:border-brand-gold-muted hover:translate-x-1'}`}
                  >
                    <span className="text-xl font-serif italic">{t(a)}</span>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-mono font-bold text-brand-brown uppercase tracking-tighter">+{ADDON_COSTS_BASE[a] || 150} AED</span>
                      {sofaConfig.addOns.includes(a) && <X className="w-4 h-4 text-brand-gold opacity-50" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
           );
        default:
          return null;
      }
    }

    if (selectedCategory !== FurnitureCategory.BED) {
      switch (stepId) {
        case 'dimensions':
          return (
            <div className="space-y-12">
               <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Ruler className="w-3 h-3 text-brand-gold" /> {t('Engineering Dimensions')} (mm)
              </h3>
              <div className="grid grid-cols-1 gap-8">
                {[
                  { label: t('Length Label'), key: 'length' },
                  { label: t('Width Label'), key: 'width' },
                  { label: t('Height Label'), key: 'height' }
                ].map((f) => {
                  const key = f.key as keyof GenericConfiguration;
                  return (
                    <div key={key} className="space-y-3">
                      <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-[0.15em]">{f.label}</label>
                      <input
                        type="number"
                        value={genericConfig[key] as number}
                        onChange={e => updateGenericConfig({ [key]: Number(e.target.value) })}
                        className="w-full bg-transparent border-b border-brand-brown/10 text-2xl font-serif italic text-brand-brown focus:border-brand-gold outline-none pb-2 transition-colors"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-8">
                <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-[0.15em] mb-3 block">{t('Top Thickness')} (mm)</label>
                <div className="grid grid-cols-3 gap-4">
                  {Object.values(Thickness).map(th => (
                    <button
                      key={th}
                      onClick={() => updateGenericConfig({ thickness: th })}
                      className={`p-4 border rounded-xl text-[10px] font-bold ${genericConfig.thickness === th ? 'bg-brand-gold text-white' : 'bg-white text-brand-brown border-brand-beige'}`}
                    >
                      {t(th)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        case 'material':
          return (
            <div className="space-y-12">
               <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Layers className="w-3 h-3 text-brand-gold" /> {t('Material Specification')}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {Object.values(Material).map(m => (
                  <button
                    key={m}
                    onClick={() => updateGenericConfig({ material: m })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest transition-all ${genericConfig.material === m ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(m)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'finish':
          return (
             <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Palette className="w-3 h-3 text-brand-gold" /> {t('Surface Treatment')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(FinishType).map(f => (
                  <button
                    key={f}
                    onClick={() => updateGenericConfig({ finish: f })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${genericConfig.finish === f ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(f)}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'addons':
           return (
            <div className="space-y-8">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <PlusCircle className="w-3 h-3 text-brand-gold" /> 附加配件 Add-ons
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {Object.values(AddOn).map(a => (
                  <button
                    key={a}
                    onClick={() => toggleGenericAddOn(a)}
                    className={`p-8 text-left border rounded-[32px] flex justify-between items-center transition-all ${genericConfig.addOns.includes(a) ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-xl translate-x-3' : 'bg-white text-brand-brown border-brand-beige hover:border-brand-gold-muted hover:translate-x-1'}`}
                  >
                    <span className="text-xl font-serif italic">{t(a)}</span>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-mono font-bold text-brand-brown uppercase tracking-tighter">+{ADDON_COSTS_BASE[a] || 150} AED</span>
                      {genericConfig.addOns.includes(a) && <X className="w-4 h-4 text-brand-gold opacity-50" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
           );
        case 'color':
          const currentConfig = selectedCategory === FurnitureCategory.BED ? config : (selectedCategory === FurnitureCategory.SOFA ? sofaConfig : genericConfig);
          const updateFn = selectedCategory === FurnitureCategory.BED ? updateConfig : (selectedCategory === FurnitureCategory.SOFA ? updateSofaConfig : updateGenericConfig);
          
          return (
            <div className="space-y-12">
              <section className="space-y-8">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                  <Palette className="w-3 h-3 text-brand-gold" /> {t('Color Way')}
                </h3>
                <div className="grid grid-cols-5 gap-4">
                  {Object.values(Color).map(c => (
                    <button
                      key={c}
                      onClick={() => updateFn({ color: c })}
                      className={`h-16 rounded-3xl border-2 transition-all flex items-center justify-center relative group ${currentConfig.color === c ? 'border-brand-gold scale-110 shadow-lg' : 'border-transparent hover:border-brand-beige'}`}
                      style={{ backgroundColor: c === Color.WHITE ? '#FFFFFF' : c === Color.BEIGE ? '#F5F5DC' : c === Color.WALNUT ? '#5D4037' : c === Color.GREY ? '#808080' : '#CCCCCC' }}
                      title={t(c)}
                    >
                      {currentConfig.color === c && (
                        <div className="bg-brand-brown rounded-full p-1 shadow-md">
                          <PlusCircle className={`w-4 h-4 ${c === Color.WHITE || c === Color.BEIGE ? 'text-brand-gold' : 'text-brand-ivory'}`} />
                        </div>
                      )}
                      <span className="absolute -bottom-6 text-[8px] font-bold uppercase tracking-widest text-brand-brown opacity-0 group-hover:opacity-100 transition-opacity">{t(c)}</span>
                    </button>
                  ))}
                </div>

                {currentConfig.color === Color.CUSTOM && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-12 p-8 bg-white border border-brand-beige rounded-[32px] space-y-4"
                  >
                    <label className="text-[10px] font-bold uppercase tracking-widest text-brand-gold block">
                      {t('Custom Color Specification')}
                    </label>
                    <input
                      type="text"
                      value={currentConfig.customColor || ''}
                      onChange={e => updateFn({ customColor: e.target.value })}
                      placeholder="e.g. RAL 9016 / Pantone 432C / light oak / dark grey matte"
                      className="w-full bg-brand-beige/10 border-b border-brand-beige py-4 px-2 font-serif italic text-xl text-brand-brown focus:border-brand-gold outline-none transition-colors"
                    />
                  </motion.div>
                )}
              </section>
            </div>
          );
        case 'frame':
          return (
            <div className="space-y-12">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Square className="w-3 h-3 text-brand-gold" /> {t('Structure/Frame')}
              </h3>
              <div className="grid grid-cols-2 gap-5">
                {[
                  { label: t('Wood Structure'), type: FrameType.SLATS, cost: 300 },
                  { label: t('Metal Structure'), type: FrameType.METAL, cost: 500 },
                  { label: t('Mixed Structure'), type: FrameType.STORAGE, cost: 700 }
                ].map(f => (
                  <button
                    key={f.type}
                    onClick={() => updateGenericConfig({ frameType: f.type })}
                    className={`p-10 text-left border rounded-[32px] transition-all relative group ${genericConfig.frameType === f.type ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-xl' : 'bg-brand-beige/30 text-brand-brown border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    <span className="block text-xl font-serif italic mb-2 tracking-tight">{f.label}</span>
                    <span className={`text-[10px] font-mono opacity-60 ${genericConfig.frameType === f.type ? 'text-brand-gold' : 'text-brand-brown'}`}>+{f.cost} AED</span>
                    {genericConfig.frameType === f.type && <div className="absolute top-0 right-0 p-4"><PlusCircle className="w-4 h-4 text-brand-gold" /></div>}
                  </button>
                ))}
              </div>
            </div>
          );
        default:
          return null;
      }
    }

    // Existing Bed render logic starting from dimensions
    switch (stepId) {
      case 'dimensions':
        return (
          <div className="space-y-12">
            <section className="space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Ruler className="w-3 h-3 text-brand-gold" /> {t('Select Foundation')}
              </h3>
              <div className="grid grid-cols-2 gap-5">
                {Object.values(BedSize).map(s => (
                  <button
                    key={s}
                    onClick={() => updateConfig({ size: s })}
                    className={`p-8 text-left border rounded-[32px] transition-all relative overflow-hidden group ${config.size === s ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-xl' : 'bg-brand-beige/30 text-brand-brown border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    <span className="block text-xl font-serif italic tracking-tight">{t(s)}</span>
                    {SIZE_DIMENSIONS[s] && <span className={`text-[10px] font-mono mt-1 block opacity-60 ${config.size === s ? 'text-brand-gold-muted' : 'text-brand-brown'}`}>{SIZE_DIMENSIONS[s].w} x {SIZE_DIMENSIONS[s].l} mm</span>}
                    {config.size === s && <div className="absolute top-0 right-0 p-3"><PlusCircle className="w-4 h-4 text-brand-gold" /></div>}
                  </button>
                ))}
              </div>
            </section>
            
            <section className="bg-brand-beige/20 p-10 rounded-[40px] border border-brand-beige">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown mb-8 italic">{t('Dimensions Adjustment')}</h3>
              <div className="grid grid-cols-2 gap-x-12 gap-y-10 font-sans">
                {[
                  { label: t('Width Label'), key: 'width' },
                  { label: t('Length Label'), key: 'length' },
                  { label: t('Bed Height Label'), key: 'height' },
                  { label: t('Headboard Height Label'), key: 'headboardHeight' }
                ].map(f => (
                  <div key={f.key} className="space-y-3">
                    <label className="text-[9px] font-bold text-brand-brown-muted uppercase tracking-[0.15em]">{f.label}</label>
                    <input
                      type="number"
                      value={config[f.key as keyof BedConfiguration] as number}
                      onChange={e => updateConfig({ [f.key]: Number(e.target.value), size: (f.key === 'width' || f.key === 'length') ? BedSize.CUSTOM : config.size })}
                      className="w-full bg-transparent border-b border-brand-brown/10 text-xl font-serif italic text-brand-brown focus:border-brand-gold outline-none pb-2 transition-colors"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        );
      case 'material':
        return (
          <div className="space-y-12">
            <section className="space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Layers className="w-3 h-3 text-brand-gold" /> {t('Primary Substrate')}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {Object.values(Material).map(m => (
                  <button
                    key={m}
                    onClick={() => updateConfig({ material: m })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest transition-all ${config.material === m ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(m)}
                  </button>
                ))}
              </div>
            </section>
            <section className="space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Settings className="w-3 h-3 text-brand-gold" /> {t('Board Thickness')}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {Object.values(Thickness).map(tVal => (
                  <button
                    key={tVal}
                    onClick={() => updateConfig({ thickness: tVal })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest transition-all ${config.thickness === tVal ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(tVal)}
                  </button>
                ))}
              </div>
            </section>
          </div>
        );
      case 'frame':
        return (
          <div className="space-y-12">
             <section className="space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Square className="w-3 h-3 text-brand-gold" /> {t('Core Structure')}
              </h3>
              <div className="space-y-4">
                {Object.values(FrameType).map(f => (
                  <button
                    key={f}
                    onClick={() => updateConfig({ frame: f })}
                    className={`w-full p-8 text-left border rounded-[28px] flex justify-between items-center group transition-all ${config.frame === f ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-xl' : 'bg-brand-beige/20 text-brand-brown border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    <span className="text-lg font-serif italic">{t(f)}</span>
                    <span className={`text-[10px] font-mono uppercase tracking-widest ${config.frame === f ? 'text-brand-gold group-hover:text-brand-ivory' : 'text-brand-brown-muted opacity-80'}`}>+{FRAME_TYPE_COSTS[f]} AED</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Palette className="w-3 h-3 text-brand-gold" /> {t('Headboard Architecture')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(HeadboardType).map(h => (
                  <button
                    key={h}
                    onClick={() => updateConfig({ headboard: h })}
                    className={`p-5 text-xs text-center border rounded-[20px] font-bold uppercase tracking-widest ${config.headboard === h ? 'bg-brand-brown text-brand-ivory border-brand-brown' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(h)}
                  </button>
                ))}
              </div>
            </section>
          </div>
        );
      case 'finish':
        return (
          <div className="space-y-12">
            <section className="space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Palette className="w-3 h-3 text-brand-gold" /> {t('Surface Treatment')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.values(FinishType).map(f => (
                  <button
                    key={f}
                    onClick={() => updateConfig({ finish: f })}
                    className={`p-6 text-center border rounded-[24px] font-bold text-xs uppercase tracking-widest ${config.finish === f ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-lg' : 'bg-white text-brand-brown/80 border-brand-beige hover:border-brand-gold-muted'}`}
                  >
                    {t(f)}
                  </button>
                ))}
              </div>
            </section>
          </div>
        );
      case 'addons':
        return (
          <div className="space-y-8">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
              <PlusCircle className="w-3 h-3 text-brand-gold" /> 豪华配置升级 Luxury Enhancements
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {Object.values(AddOn).map(a => (
                <button
                  key={a}
                  onClick={() => toggleAddOn(a)}
                  className={`p-8 text-left border rounded-[32px] flex justify-between items-center transition-all ${config.addOns.includes(a) ? 'bg-brand-brown text-brand-ivory border-brand-brown shadow-xl translate-x-3' : 'bg-white text-brand-brown border-brand-beige hover:border-brand-gold-muted hover:translate-x-1'}`}
                >
                  <span className="text-xl font-serif italic">{t(a)}</span>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-mono font-bold text-brand-brown uppercase tracking-tighter">+{ADDON_COSTS_BASE[a]} AED</span>
                    {config.addOns.includes(a) && <X className="w-4 h-4 text-brand-gold opacity-50" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      case 'color':
        return (
          <div className="space-y-12">
            <section className="space-y-8">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-brown flex items-center gap-2">
                <Palette className="w-3 h-3 text-brand-gold" /> 颜色方案 Color Way
              </h3>
              <div className="grid grid-cols-5 gap-4">
                {Object.values(Color).map(c => (
                  <button
                    key={c}
                    onClick={() => updateConfig({ color: c })}
                    className={`h-16 rounded-3xl border-2 transition-all flex items-center justify-center relative group ${config.color === c ? 'border-brand-gold scale-110 shadow-lg' : 'border-transparent hover:border-brand-beige'}`}
                    style={{ backgroundColor: c === Color.WHITE ? '#FFFFFF' : c === Color.BEIGE ? '#F5F5DC' : c === Color.WALNUT ? '#5D4037' : c === Color.GREY ? '#808080' : '#CCCCCC' }}
                    title={t(c)}
                  >
                    {config.color === c && (
                      <div className="bg-brand-brown rounded-full p-1 shadow-md">
                        <PlusCircle className={`w-4 h-4 ${c === Color.WHITE || c === Color.BEIGE ? 'text-brand-gold' : 'text-brand-ivory'}`} />
                      </div>
                    )}
                    <span className="absolute -bottom-6 text-[8px] font-bold uppercase tracking-widest text-brand-brown opacity-0 group-hover:opacity-100 transition-opacity">{t(c)}</span>
                  </button>
                ))}
              </div>

              {config.color === Color.CUSTOM && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-12 p-8 bg-white border border-brand-beige rounded-[32px] space-y-4"
                >
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-gold block">
                    自定义颜色描述 Custom Color Specification (RAL / Pantone / Name)
                  </label>
                  <input
                    type="text"
                    value={config.customColor || ''}
                    onChange={e => updateConfig({ customColor: e.target.value })}
                    placeholder="e.g. RAL 9016 / Pantone 432C / light oak / dark grey matte"
                    className="w-full bg-brand-beige/10 border-b border-brand-beige py-4 px-2 font-serif italic text-xl text-brand-brown focus:border-brand-gold outline-none transition-colors"
                  />
                </motion.div>
              )}
            </section>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-brand-ivory text-brand-brown selection:bg-brand-gold/20 font-sans">
      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-brand-brown/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{y:50}} animate={{y:0}} className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl p-10 overflow-hidden relative border border-brand-beige">
              <button onClick={() => setShowSettings(false)} className="absolute top-8 right-8 p-2 bg-brand-beige rounded-full hover:bg-brand-gold-muted/30 transition-colors text-brand-brown"><X className="w-5 h-5" /></button>
              <h2 className="text-3xl font-serif italic tracking-tight mb-8 flex items-center gap-3 text-brand-brown">
                <CreditCard className="w-7 h-7 text-brand-gold" /> {t('Pricing Configuration')}
              </h2>
              <div className="grid grid-cols-2 gap-8 max-h-[60vh] overflow-y-auto pr-4 scrollbar-hide">
                <section className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">{t('Material & Finish')}</h4>
                  {Object.values(Material).map(m => (
                    <div key={m} className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t(m)}</label>
                      <input type="number" value={prices[m]} onChange={e => setPrices({...prices, [m]: Number(e.target.value)})} className="w-full p-4 bg-brand-beige/50 rounded-2xl font-mono text-sm border-none outline-none focus:ring-1 focus:ring-brand-gold" />
                    </div>
                  ))}
                  <div className="space-y-1 pt-4">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">面料 Upholstery (m²)</label>
                    <input type="number" value={prices.upholsteryFabric} onChange={e => setPrices({...prices, upholsteryFabric: Number(e.target.value)})} className="w-full p-4 bg-brand-beige/50 rounded-2xl font-mono text-sm border-none outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">饰面 Finish (m²)</label>
                    <input type="number" value={prices.finishVeneer} onChange={e => setPrices({...prices, finishVeneer: Number(e.target.value)})} className="w-full p-4 bg-brand-beige/50 rounded-2xl font-mono text-sm border-none outline-none" />
                  </div>
                </section>
                <section className="space-y-4">
                   <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">其它费用项 Manual Overheads</h4>
                   {[
                     { key: 'labor', label: '人工费 Labor' },
                     { key: 'packaging', label: '包装费 Packaging' },
                     { key: 'transport', label: '运输费 Transport' },
                     { key: 'installation', label: '安装费 Installation' }
                   ].map(cost => (
                     <div key={cost.key} className="space-y-1">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{cost.label}</label>
                        <input 
                          type="number" 
                          value={prices[cost.key as keyof MaterialPrices]} 
                          onChange={e => setPrices({...prices, [cost.key]: Number(e.target.value)})} 
                          className="w-full p-4 bg-brand-beige/50 rounded-2xl font-mono text-sm border-none outline-none" 
                        />
                     </div>
                   ))}
                   <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-beige">
                     <div className="space-y-1">
                       <label className="text-[9px] font-bold uppercase tracking-wide text-brand-gold">利润 Margin %</label>
                       <input type="number" value={prices.marginPercent} onChange={e => setPrices({...prices, marginPercent: Number(e.target.value)})} className="w-full p-3 bg-brand-beige/50 rounded-xl font-mono text-xs border-none outline-none" />
                     </div>
                     <div className="space-y-1">
                       <label className="text-[9px] font-bold uppercase tracking-wide text-brand-gold">税率 VAT %</label>
                       <input type="number" value={prices.vatPercent} onChange={e => setPrices({...prices, vatPercent: Number(e.target.value)})} className="w-full p-3 bg-brand-beige/50 rounded-xl font-mono text-xs border-none outline-none" />
                     </div>
                   </div>
                </section>
              </div>
              <button onClick={() => setShowSettings(false)} className="w-full mt-10 p-5 bg-brand-brown text-brand-ivory rounded-2xl font-bold uppercase tracking-widest text-sm hover:bg-brand-brown/90 transition-all shadow-lg shadow-brand-brown/10">保存并应用 Save & Apply Rates</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-6 py-6 lg:py-12">
        {_returnUrlParam && (
          <div className="mb-6 flex items-center justify-between px-5 py-2.5 bg-brand-brown rounded-2xl text-brand-ivory">
            <a
              href={_returnUrlParam}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-gold hover:text-brand-ivory transition-colors group"
            >
              <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
              返回 DEAL 项目
            </a>
            <div className="flex items-center gap-5 text-[10px] font-bold uppercase tracking-widest text-brand-ivory/50">
              {_clientParam && <span>客户：<span className="text-brand-ivory">{_clientParam}</span></span>}
              {_projectParam && <span>项目：<span className="text-brand-ivory">{_projectParam}</span></span>}
              {_businessIdParam && <span className="text-brand-gold/80">{_businessIdParam}</span>}
              {_salespersonParam && <span>负责人：<span className="text-brand-ivory">{_salespersonParam}</span></span>}
            </div>
          </div>
        )}
        <header className="mb-10 flex justify-between items-center bg-gradient-to-r from-[#0C1B3A] via-[#0F2551] to-[#0C1B3A] text-white px-8 py-4 rounded-[28px] shadow-xl">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-[#C9A84C] to-[#A07C2D] w-9 h-9 rounded-xl flex items-center justify-center shadow-md shrink-0">
              <span className="text-white font-black text-sm tracking-tight">G</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight uppercase leading-none">GCI Quotation Center</h1>
                <span className="text-[9px] bg-[#C9A84C]/20 border border-[#C9A84C]/30 px-2 py-0.5 rounded text-[#E8C96A] font-bold tracking-wide">LIVING STUDIO</span>
              </div>
              <p className="text-[10px] text-white/50 font-medium mt-0.5">FF&amp;E · Engineering Quotation · BOQ</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView(view === 'history' ? 'configurator' : 'history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${view === 'history' ? 'bg-[#C9A84C] text-[#0C1B3A]' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'}`}
            >
              <FileText className="w-3.5 h-3.5" />
              {view === 'history' ? '← Back' : 'History'}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all"
            >
              <Settings className="w-3.5 h-3.5" />
              Pricing
            </button>
          </div>
        </header>

        <main className="bg-white rounded-[56px] shadow-[0_45px_120px_-30px_rgba(62,39,35,0.08)] border border-brand-beige overflow-hidden">
          <div className="p-8 sm:p-20 min-h-[650px] flex flex-col">

            {/* ── TOP-LEVEL: Landing / Supplier Upload / Customer Quote ── */}
            {appMode === 'landing' && view !== 'history' ? (
              /* ── Landing Page — 3 entry cards ──────────────────────── */
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
                <div className="text-center space-y-3">
                  <h2 className="text-4xl font-semibold" style={{ fontFamily: "'Space Grotesk',sans-serif", color: '#080D1E' }}>GCI Supply Chain Center</h2>
                  <p className="text-[12px] font-bold uppercase tracking-[0.4em] text-[#CBA85C]" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>Choose your workflow</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
                  {/* 1: Customer Quote */}
                  <button onClick={() => setAppMode('customer-quote')}
                    className="group text-left p-8 bg-white border rounded-[18px] shadow-sm hover:border-[#CBA85C] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-4" style={{ borderColor: '#080D1E14' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#CBA85C] bg-[#CBA85C]/10 px-2 py-1 rounded-full">For Clients</span>
                      <FileText className="w-6 h-6 text-[#080D1E]/20 group-hover:text-[#CBA85C] transition-colors" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#080D1E] group-hover:text-[#CBA85C] transition-colors" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Custom Customer Quote</h3>
                      <p className="text-[11px] text-[#080D1E]/40 font-bold mt-0.5">定制客户报价</p>
                    </div>
                    <p className="text-[12px] text-[#080D1E]/55 leading-relaxed flex-1">
                      For custom furniture, engineering BOQ, or manual item quotation. 用于家具定制、工程BOQ、手工录入报价。
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#CBA85C] opacity-0 group-hover:opacity-100 transition-opacity">Start →</p>
                  </button>

                  {/* 2: Supplier Quote */}
                  <button onClick={() => { setAppMode('supplier-quote'); setDraftItems([]); setTradeTerms(''); setSqSaveStatus('idle'); }}
                    className="group text-left p-8 bg-white border rounded-[18px] shadow-sm hover:border-[#CBA85C] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-4" style={{ borderColor: '#080D1E14' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#CBA85C] bg-[#CBA85C]/10 px-2 py-1 rounded-full">Archive</span>
                      <Archive className="w-6 h-6 text-[#080D1E]/20 group-hover:text-[#CBA85C] transition-colors" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#080D1E] group-hover:text-[#CBA85C] transition-colors" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Supplier Quote to GCI Quote</h3>
                      <p className="text-[11px] text-[#080D1E]/40 font-bold mt-0.5">供应商报价转 GCI 报价</p>
                    </div>
                    <p className="text-[12px] text-[#080D1E]/55 leading-relaxed flex-1">
                      Upload supplier Excel/PDF, extract cost items, add margin, and generate GCI customer quote. 上传供应商报价，读取成本，加价后生成 GCI 客户报价。
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#CBA85C] opacity-0 group-hover:opacity-100 transition-opacity">Save to Archive →</p>
                  </button>

                  {/* 3: Package Quote — NEW */}
                  <button onClick={() => { setAppMode('package-quote'); setPqProject(null); setPqParseStatus('idle'); setPqParseError(''); }}
                    className="group text-left p-8 bg-white border rounded-[18px] shadow-sm hover:border-[#CBA85C] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-4" style={{ borderColor: '#080D1E14' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#CBA85C] bg-[#CBA85C]/10 px-2 py-1 rounded-full">FF&E · Hotel · Apt</span>
                      <Layers className="w-6 h-6 text-[#080D1E]/20 group-hover:text-[#CBA85C] transition-colors" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#080D1E] group-hover:text-[#CBA85C] transition-colors" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Package Quote</h3>
                      <p className="text-[11px] text-[#080D1E]/40 font-bold mt-0.5">套餐报价</p>
                    </div>
                    <p className="text-[12px] text-[#080D1E]/55 leading-relaxed flex-1">
                      Import multi-sheet Excel as Project → Package → Items. For CoolHome, FF&E, Apartment, Hotel. 多 Sheet 套餐导入，适用于公寓/酒店项目。
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#CBA85C] opacity-0 group-hover:opacity-100 transition-opacity">Import Packages →</p>
                  </button>

                  {/* 4: Service Quote — NEW */}
                  <button onClick={() => { setAppMode('service-quote'); setSvcView('list'); svcLoadQuoteList(); }}
                    className="group text-left p-8 bg-white border rounded-[18px] shadow-sm hover:border-[#CBA85C] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-4" style={{ borderColor: '#080D1E14' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#CBA85C] bg-[#CBA85C]/10 px-2 py-1 rounded-full">Services</span>
                      <Briefcase className="w-6 h-6 text-[#080D1E]/20 group-hover:text-[#CBA85C] transition-colors" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#080D1E] group-hover:text-[#CBA85C] transition-colors" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Service Quote</h3>
                      <p className="text-[11px] text-[#080D1E]/40 font-bold mt-0.5">服务报价</p>
                    </div>
                    <p className="text-[12px] text-[#080D1E]/55 leading-relaxed flex-1">
                      Corporate services, market entry, project coordination, overseas warehouse, supply chain, AI solutions. 企业服务/出海/项目/海外仓/供应链/AI数字化（不涉及库存与成本）。
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#CBA85C] opacity-0 group-hover:opacity-100 transition-opacity">Build Quote →</p>
                  </button>
                </div>
              </div>
            ) : appMode === 'supplier-quote' && view !== 'history' ? (
              renderSupplierQuoteUpload()
            ) : appMode === 'package-quote' && view !== 'history' ? (
              renderPackageQuote()
            ) : appMode === 'service-quote' ? (
              renderServiceQuoteModule()
            ) : (

            /* ── Customer Quote flow + History (existing) ──────────── */
            view === 'history' ? (
              <div className="space-y-8">
                {/* Header + Tab Switcher */}
                <div className="space-y-4">
                  <div className="text-center space-y-2">
                    <h2 className="text-3xl font-semibold" style={{ fontFamily: "'Space Grotesk',sans-serif", color: '#080D1E' }}>History Center</h2>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#CBA85C]" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>Supplier Quotes Archive · GCI Customer Quotes</p>
                  </div>
                  {/* Tab switcher */}
                  <div className="flex justify-center">
                    <div className="flex bg-[#080D1E]/5 p-1 rounded-2xl gap-1">
                      <button
                        onClick={() => setHistoryTab('supplier')}
                        className="px-6 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-wider transition-all"
                        style={historyTab === 'supplier'
                          ? { backgroundColor: '#080D1E', color: '#CBA85C' }
                          : { color: '#080D1E60' }}
                      >
                        Supplier Quotes
                      </button>
                      <button
                        onClick={() => setHistoryTab('gci')}
                        className="px-6 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-wider transition-all"
                        style={historyTab === 'gci'
                          ? { backgroundColor: '#080D1E', color: '#CBA85C' }
                          : { color: '#080D1E60' }}
                      >
                        GCI Quotes
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Supplier Quotes Tab ──────────────────────────────── */}
                {historyTab === 'supplier' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#080D1E]">Supplier Quote Archive</span>
                      <div className="h-px flex-1 bg-[#080D1E]/10" />
                      {supplierQuotesLoading && <RefreshCw className="w-3.5 h-3.5 text-[#CBA85C] animate-spin" />}
                      <span className="text-[9px] text-[#080D1E]/30 font-bold uppercase">Cloud · Supabase</span>
                    </div>
                    {!supplierQuotesLoading && supplierQuotes.length === 0 && (
                      <div className="text-center py-12 border-2 border-dashed border-[#080D1E]/8 rounded-[28px] text-[#080D1E]/30">
                        <p className="text-sm" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>No supplier quotes saved yet</p>
                        <p className="text-[11px] mt-1">Upload a supplier quote → review costs → click "Save to Supplier Archive"</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-3">
                      {supplierQuotes.map(sq => {
                        const statusColor = sq.status === 'Converted' ? 'bg-green-100 text-green-700'
                          : sq.status === 'Expired' ? 'bg-red-100 text-red-600'
                          : sq.status === 'Archived' ? 'bg-slate-100 text-slate-500'
                          : 'bg-[#CBA85C]/15 text-[#A07C2D]';
                        return (
                          <div key={sq.id} className="p-5 bg-white border border-[#080D1E]/8 rounded-[24px] flex items-center gap-5 hover:border-[#CBA85C]/40 transition-all group">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${statusColor}`}>{sq.status}</span>
                                {sq.supplier_quote_no && <span className="text-[9px] font-mono text-[#080D1E]/40">{sq.supplier_quote_no}</span>}
                              </div>
                              <h3 className="text-base font-black text-[#080D1E] truncate">{sq.supplier_name || '(Unnamed Supplier)'}</h3>
                              <p className="text-[11px] text-[#080D1E]/40 mt-0.5">{sq.quote_date} · {sq.currency}</p>
                              {sq.terms_notes && <p className="text-[10px] text-[#080D1E]/30 mt-0.5 truncate">{sq.terms_notes.slice(0, 60)}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[9px] font-bold uppercase text-[#080D1E]/30">Total Cost</p>
                              <p className="text-lg font-black font-mono text-[#080D1E]">{sq.currency} {(sq.total_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                            </div>
                            {sq.status !== 'Converted' && (
                              <button
                                onClick={() => handleCreateGCIQuoteFromSupplier(sq)}
                                className="shrink-0 px-4 py-3 rounded-[16px] text-[10px] font-black uppercase tracking-wider border border-[#CBA85C]/30 text-[#CBA85C] bg-[#080D1E] hover:bg-[#0F2551] transition-all active:scale-95"
                              >
                                Create GCI Quote
                              </button>
                            )}
                            {sq.status === 'Converted' && (
                              <div className="shrink-0 px-4 py-3 rounded-[16px] text-[10px] font-black uppercase tracking-wider text-green-600 bg-green-50">
                                ✓ Converted
                              </div>
                            )}
                            <button
                              onClick={async () => {
                                if (!sq.id) return;
                                const ok = window.confirm(`Delete Supplier Quote?\n\nThis will delete:\n• supplier quote\n• supplier quote items\n\nThis action cannot be undone.`);
                                if (!ok) return;
                                const success = await deleteSupplierQuote(sq.id);
                                if (success) {
                                  setSupplierQuotes(prev => prev.filter(q => q.id !== sq.id));
                                } else {
                                  alert('Delete failed. Please try again.');
                                }
                              }}
                              className="shrink-0 px-3 py-3 rounded-[16px] text-[10px] font-black uppercase tracking-wider text-red-400 border border-red-200 hover:bg-red-50 transition-all"
                            >
                              Delete
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── GCI Quotes Tab ───────────────────────────────────── */}
                {historyTab === 'gci' && (
                <div className="space-y-8">
                {/* ── Section 1: Cloud Trade/BOQ Quotes ───────────────── */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#080D1E]">Trade &amp; Sourcing · BOQ</span>
                    <div className="h-px flex-1 bg-[#080D1E]/10" />
                    {cloudHistoryLoading && <RefreshCw className="w-3.5 h-3.5 text-[#CBA85C] animate-spin" />}
                    <span className="text-[9px] text-[#080D1E]/30 font-bold uppercase">Cloud · Auto-saved</span>
                  </div>

                  {!cloudHistoryLoading && cloudHistory.length === 0 && (
                    <div className="text-center py-10 border-2 border-dashed border-[#080D1E]/8 rounded-[28px] text-[#080D1E]/30">
                      <p className="text-sm" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>No cloud quotes yet</p>
                      <p className="text-[10px] mt-1">Quotes auto-save when you click Generate GCI Quote</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3">
                    {cloudHistory.map(rec => {
                      const statusColor = rec.status === 'SENT_TO_TRADE' ? 'bg-green-100 text-green-700' : rec.status === 'GENERATED' ? 'bg-[#CBA85C]/15 text-[#A07C2D]' : 'bg-[#080D1E]/8 text-[#080D1E]/50';
                      return (
                        <div
                          key={rec.id}
                          className="p-5 bg-white border border-[#080D1E]/8 rounded-[24px] flex items-center gap-5 hover:border-[#CBA85C] hover:shadow-lg transition-all group cursor-pointer"
                          onClick={() => handleLoadDraft(rec.quote_no)}
                        >
                          {/* Left: info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${statusColor}`}>
                                {rec.status?.replace('_', ' ')}
                              </span>
                              <span className="text-[9px] font-bold text-[#080D1E]/30 uppercase">{rec.quote_type}</span>
                              {rec.source === 'DEAL' && <span className="text-[8px] font-black text-[#CBA85C] bg-[#CBA85C]/10 px-1.5 py-0.5 rounded">DEAL</span>}
                            </div>
                            <h3 className="text-base font-black text-[#080D1E] truncate">{rec.customer_name || '—'}</h3>
                            <p className="text-[10px] text-[#080D1E]/40 mt-0.5">{rec.quote_no} · {rec.quote_date} · {rec.salesperson || 'Staff'}</p>
                          </div>
                          {/* Right: amounts */}
                          <div className="text-right shrink-0">
                            <p className="text-[9px] font-bold uppercase text-[#080D1E]/30">Grand Total</p>
                            <p className="text-lg font-black font-mono text-[#080D1E]">AED {(rec.grand_total || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                            {rec.margin_percent > 0 && <p className="text-[9px] text-green-600 font-bold">{rec.margin_percent.toFixed(1)}% margin</p>}
                          </div>
                          <button
                            onClick={async e => {
                              e.stopPropagation();
                              if (!rec.id) return;
                              const ok = window.confirm(`Delete GCI Quote?\n\nThis will delete:\n• GCI quote\n• quote items\n\nThis action cannot be undone.`);
                              if (!ok) return;
                              const success = await deleteQuotation(rec.id);
                              if (success) {
                                setCloudHistory(prev => prev.filter(r => r.id !== rec.id));
                              } else {
                                alert('Delete failed. Please try again.');
                              }
                            }}
                            className="shrink-0 px-3 py-3 rounded-[16px] text-[10px] font-black uppercase tracking-wider text-red-400 border border-red-200 hover:bg-red-50 transition-all"
                          >
                            Delete
                          </button>
                          <ChevronRight className="w-5 h-5 text-[#080D1E]/20 group-hover:text-[#CBA85C] transition-colors shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Section 2: Local Custom BOM Quotes ──────────────── */}
                {quoteHistory.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-brown/60">Custom Item Quotes</span>
                      <div className="h-px flex-1 bg-brand-beige" />
                      <span className="text-[9px] text-brand-brown/30 font-bold uppercase">Local · BOM</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {quoteHistory.map(quote => (
                        <div key={quote.id} className="p-6 bg-brand-beige/20 border border-brand-beige rounded-[24px] flex items-center gap-5 hover:shadow-md transition-all group cursor-pointer" onClick={() => restoreQuote(quote)}>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">{quote.date} · {quote.quoteNumber}</p>
                            <h3 className="text-base font-serif italic text-brand-brown truncate">{quote.customerProjectName || '未命名'}</h3>
                            <p className="text-[10px] text-brand-brown-muted mt-0.5">{t(quote.category)} · {quote.salesperson || 'Staff'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[9px] font-bold text-brand-brown-muted uppercase block">Total</span>
                            <span className="text-lg font-serif italic text-brand-brown">{quote.totalAmount.toLocaleString(undefined, {maximumFractionDigits:0})} AED</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-brand-gold/40 group-hover:text-brand-brown transition-colors shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
                )}
              </div>
            ) : !projectInfoSubmitted ? (
              renderProjectInfo()
            ) : !quoteType ? (
              <TypeSelection
                onSelect={handleTypeSelect}
                onBack={() => setProjectInfoSubmitted(false)}
                projectName={quoteInfo.customerProjectName}
              />
            ) : (quoteType === 'trade' || quoteType === 'boq') && tradePhase === 'pricing' ? (
              renderTradeQuoteReview()
            ) : quoteMode === 'package' && !selectedCategory ? (
              renderPackageWorkspace()
            ) : !selectedCategory ? (
              renderCategorySelection()
            ) : (
              <>
                {/* Step Indicator — Step 3 = Category selected, Step 4 = final step (summary) */}
                <StepIndicator current={currentStep >= STEPS.length - 1 ? 4 : 3} />

                <div className="mb-10 flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className="p-3 bg-brand-beige/50 rounded-full hover:bg-brand-brown hover:text-brand-ivory transition-all text-brand-brown"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        {selectedScenario && (
                          <>
                            <span className="text-[8px] font-bold text-brand-gold uppercase tracking-widest">{t(selectedScenario)}</span>
                            <span className="w-1 h-1 rounded-full bg-brand-beige" />
                          </>
                        )}
                        <span className="text-[8px] font-bold text-brand-brown uppercase tracking-widest">{t(selectedCategory)}</span>
                      </div>
                      <h2 className="text-xl font-serif italic text-brand-brown mt-1">{t('Configuration Panel')}</h2>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    {STEPS.map((step, idx) => (
                      <div 
                        key={step.id}
                        className={`w-2 h-2 rounded-full transition-all duration-500 ${idx === currentStep ? 'bg-brand-gold w-6' : idx < currentStep ? 'bg-brand-brown' : 'bg-brand-beige'}`}
                      />
                    ))}
                  </div>
                </div>
                
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: -10 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="flex-grow"
                  >
                    <div className="max-w-2xl mx-auto">
                      {renderRequirementInfo()}
                      {renderStep()}
                    </div>
                  </motion.div>
                </AnimatePresence>

                {currentStep < STEPS.length - 1 && (
                  <div className="mt-20 flex justify-between items-center max-w-2xl mx-auto w-full pt-12 border-t border-brand-beige">
                    <button
                      onClick={handleBack}
                      className={`flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors ${currentStep === 0 ? 'opacity-0 cursor-default' : 'text-brand-gold-muted hover:text-brand-brown'}`}
                    >
                      <ChevronLeft className="w-4 h-4" /> {t('Previous')}
                    </button>
                    <button
                      onClick={handleNext}
                      className="bg-brand-brown text-brand-ivory py-6 px-14 rounded-[28px] text-[11px] font-bold uppercase tracking-[0.3em] shadow-2xl shadow-brand-brown/20 flex items-center gap-4 hover:translate-x-1 hover:shadow-brand-brown/30 transition-all active:scale-95 group"
                    >
                      {t('Next Stage')} <ChevronRight className="w-4 h-4 text-brand-gold group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                )}
              </>
            ))}
          </div>
        </main>

        <footer className="mt-20 flex flex-col sm:flex-row justify-between items-center gap-10 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-brown-muted italic px-4">
          <div className="flex gap-12">
             <span className="hover:text-brand-brown transition-colors cursor-default">{t('Terms Factory')}</span>
             <span className="hover:text-brand-brown transition-colors cursor-default">{t('Commercial Grade')}</span>
          </div>
          <div className="flex items-center gap-4">
             <span className="w-2 h-2 rounded-full bg-brand-gold shadow-[0_0_12px_rgba(197,160,89,0.6)] animate-pulse" />
             <span className="text-brand-brown opacity-80">{t('Verified Status')}</span>
          </div>
        </footer>

        {/* Module Edit Modal */}
        <AnimatePresence>
          {isModuleModalOpen && editingModule && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsModuleModalOpen(false)}
                className="absolute inset-0 bg-brand-brown/40 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                className="relative bg-brand-ivory w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[60px] shadow-3xl border border-brand-gold/20 p-8 sm:p-16 custom-scrollbar text-sans"
              >
                <button 
                  onClick={() => setIsModuleModalOpen(false)}
                  className="absolute top-8 right-8 p-4 rounded-full bg-brand-beige/20 text-brand-brown hover:bg-brand-brown hover:text-brand-ivory transition-all z-20"
                >
                  <X className="w-6 h-6" />
                </button>
      
                <div className="space-y-12">
                  <header className="space-y-3">
                     <span className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.4em]">Module Configuration</span>
                     <h2 className="text-4xl font-serif italic text-brand-brown">{t('Detailed Parameters')}</h2>
                  </header>
      
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-widest">{t('Module Type')}</label>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.values(CabinetModuleType).map(type => (
                          <button
                            key={type}
                            onClick={() => setEditingModule({...editingModule, type})}
                            className={`p-4 text-[10px] font-bold uppercase tracking-wider rounded-2xl border transition-all ${editingModule.type === type ? 'bg-brand-brown text-brand-ivory border-brand-brown' : 'bg-white text-brand-brown border-brand-beige hover:border-brand-gold'}`}
                          >
                            {t(type)}
                          </button>
                        ))}
                      </div>
                    </div>
      
                    <div className="space-y-6">
                      <label className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-widest">{t('Dimensions & Qty')}</label>
                      <div className="grid grid-cols-2 gap-6">
                        {[
                          { label: t('Width Label'), key: 'width' },
                          { label: t('Depth Label'), key: 'depth' },
                          { label: t('Height Label'), key: 'height' },
                          { label: 'Quantity 数量', key: 'quantity' }
                        ].map(field => (
                          <div key={field.key} className="space-y-2">
                             <span className="text-[9px] font-bold text-brand-gold/60 uppercase">{field.label}</span>
                             <input 
                               type="number"
                               value={(editingModule as any)[field.key]}
                               onChange={e => setEditingModule({...editingModule, [field.key]: Number(e.target.value)})}
                               className="w-full bg-transparent border-b border-brand-brown/10 py-2 text-xl font-serif italic focus:border-brand-gold outline-none"
                             />
                          </div>
                        ))}
                      </div>
                    </div>
      
                    <div className="space-y-6">
                       <label className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-widest">{t('Materials')}</label>
                       <div className="space-y-6">
                         <div className="grid grid-cols-2 gap-3">
                           {[Material.PLYWOOD, Material.MDF, Material.SOLID_WOOD].map(m => (
                             <button
                               key={m}
                               onClick={() => setEditingModule({...editingModule, material: m})}
                               className={`p-4 text-[10px] font-bold rounded-2xl border ${editingModule.material === m ? 'bg-brand-brown text-brand-ivory border-brand-brown' : 'bg-white border-brand-beige'}`}
                             >
                               {t(m)}
                             </button>
                           ))}
                         </div>
                         <div className="grid grid-cols-4 gap-2">
                           {Object.values(Thickness).map(th => (
                             <button
                               key={th}
                               onClick={() => setEditingModule({...editingModule, thickness: th})}
                               className={`p-3 text-[9px] font-bold rounded-xl border ${editingModule.thickness === th ? 'bg-brand-gold text-white border-brand-gold' : 'bg-white border-brand-beige'}`}
                             >
                               {t(th)}
                             </button>
                           ))}
                         </div>
                       </div>
                    </div>
      
                    <div className="space-y-6">
                      <label className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-widest">{t('Aesthetics')}</label>
                      <div className="space-y-6">
                         <div className="grid grid-cols-2 gap-3">
                            {Object.values(FinishType).map(f => (
                              <button
                                key={f}
                                onClick={() => setEditingModule({...editingModule, finish: f})}
                                className={`p-4 text-[10px] font-bold rounded-2xl border ${editingModule.finish === f ? 'bg-brand-brown text-brand-ivory border-brand-brown' : 'bg-white border-brand-beige'}`}
                              >
                                {t(f)}
                              </button>
                            ))}
                         </div>
                         <div className="grid grid-cols-5 gap-2">
                            {Object.values(Color).map(c => (
                              <button
                                key={c}
                                onClick={() => setEditingModule({...editingModule, color: c})}
                                className={`h-10 rounded-xl border-2 transition-all flex items-center justify-center ${editingModule.color === c ? 'border-brand-gold scale-105 shadow-sm' : 'border-transparent'}`}
                                style={{ backgroundColor: c === Color.WHITE ? '#FFFFFF' : c === Color.BEIGE ? '#F5F5DC' : c === Color.WALNUT ? '#5D4037' : c === Color.GREY ? '#808080' : '#CCCCCC' }}
                              >
                                {editingModule.color === c && <PlusCircle className={`w-3 h-3 ${c === Color.WHITE || c === Color.BEIGE ? 'text-brand-gold' : 'text-brand-ivory'}`} />}
                              </button>
                            ))}
                         </div>
                      </div>
                    </div>
  
                    <div className="space-y-6">
                      <label className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-widest">{t('Options')}</label>
                      <div className="space-y-6 text-[10px]">
                         <div className="flex items-center justify-between p-5 bg-brand-beige/20 rounded-3xl">
                            <span className="font-bold uppercase tracking-widest">{t('Door Type Label')}</span>
                            <select 
                              value={editingModule.doorType}
                              onChange={e => setEditingModule({...editingModule, doorType: e.target.value as DoorType})}
                              className="bg-transparent border-none outline-none font-serif italic text-brand-brown text-right"
                            >
                              {Object.values(DoorType).map(dt => <option key={dt} value={dt}>{t(dt)}</option>)}
                            </select>
                         </div>
                         {editingModule.doorType !== DoorType.OPEN && (
                            <div className="flex items-center justify-between p-5 bg-brand-beige/20 rounded-3xl">
                               <span className="font-bold uppercase tracking-widest">{t('Door Count Label')}</span>
                               <input 
                                 type="number"
                                 value={editingModule.doorCount}
                                 onChange={e => setEditingModule({...editingModule, doorCount: Number(e.target.value)})}
                                 className="w-12 bg-transparent border-b border-brand-brown/10 text-center font-mono"
                               />
                            </div>
                         )}
                         <div className="flex items-center justify-between p-5 bg-brand-beige/20 rounded-3xl">
                            <span className="font-bold uppercase tracking-widest">{t('Mounting Label')}</span>
                            <select 
                              value={editingModule.mounting}
                              onChange={e => setEditingModule({...editingModule, mounting: e.target.value as MountingType})}
                              className="bg-transparent border-none outline-none font-serif italic text-brand-brown text-right"
                            >
                              {Object.values(MountingType).map(mt => <option key={mt} value={mt}>{t(mt)}</option>)}
                            </select>
                         </div>
                         <div className="flex items-center justify-between p-5 bg-brand-beige/20 rounded-3xl">
                            <span className="font-bold uppercase tracking-widest">{t('Drawers Label')}</span>
                            <div className="flex items-center gap-4">
                              <button 
                                onClick={() => setEditingModule({...editingModule, hasDrawers: !editingModule.hasDrawers})}
                                className={`w-12 h-6 rounded-full relative transition-colors ${editingModule.hasDrawers ? 'bg-brand-gold' : 'bg-brand-beige'}`}
                              >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editingModule.hasDrawers ? 'left-7' : 'left-1'}`} />
                              </button>
                              {editingModule.hasDrawers && (
                                <input 
                                  type="number"
                                  value={editingModule.drawerCount}
                                  onChange={e => setEditingModule({...editingModule, drawerCount: Number(e.target.value)})}
                                  className="w-12 bg-transparent border-b border-brand-brown/10 text-center font-mono"
                                />
                              )}
                            </div>
                         </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <label className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-widest">{t('Internal Layout')}</label>
                      <div className="space-y-4 text-[10px]">
                         <div className="flex items-center justify-between p-5 bg-brand-beige/20 rounded-3xl">
                            <span className="font-bold uppercase tracking-widest">{t('Shelves Label')}</span>
                            <input 
                              type="number"
                              value={editingModule.shelfCount}
                              onChange={e => setEditingModule({...editingModule, shelfCount: Number(e.target.value)})}
                              className="w-12 bg-transparent border-b border-brand-brown/10 text-center font-mono"
                            />
                         </div>
                         <div className="flex items-center justify-between p-5 bg-brand-beige/20 rounded-3xl">
                            <span className="font-bold uppercase tracking-widest">{t('Hanging Rail Label')}</span>
                            <button 
                              onClick={() => setEditingModule({...editingModule, hasHangingRail: !editingModule.hasHangingRail})}
                              className={`w-12 h-6 rounded-full relative transition-colors ${editingModule.hasHangingRail ? 'bg-brand-gold' : 'bg-brand-beige'}`}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editingModule.hasHangingRail ? 'left-7' : 'left-1'}`} />
                            </button>
                         </div>
                      </div>
                    </div>

                    <div className="space-y-6 md:col-span-2">
                       <label className="text-[10px] font-bold text-brand-brown-muted uppercase tracking-widest">{t('Hardware Configuration')}</label>
                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                         <div className="space-y-3">
                            <span className="text-[9px] font-bold text-brand-gold/60 uppercase block">{t('Hinge Label')}</span>
                            <div className="flex flex-col gap-2">
                               {Object.values(HingeType).map(h => (
                                 <button
                                   key={h}
                                   onClick={() => setEditingModule({...editingModule, hingeType: h})}
                                   className={`px-4 py-3 text-[10px] font-bold rounded-xl border text-left transition-all ${editingModule.hingeType === h ? 'bg-brand-brown text-brand-ivory border-brand-brown' : 'bg-white border-brand-beige'}`}
                                 >
                                   {t(h)}
                                 </button>
                               ))}
                            </div>
                         </div>
                         <div className="space-y-3">
                            <span className="text-[9px] font-bold text-brand-gold/60 uppercase block">{t('Runner Label')}</span>
                            <div className="flex flex-col gap-2">
                               {Object.values(RunnerType).map(r => (
                                 <button
                                   key={r}
                                   onClick={() => setEditingModule({...editingModule, runnerType: r})}
                                   className={`px-4 py-3 text-[10px] font-bold rounded-xl border text-left transition-all ${editingModule.runnerType === r ? 'bg-brand-brown text-brand-ivory border-brand-brown' : 'bg-white border-brand-beige'}`}
                                 >
                                   {t(r)}
                                 </button>
                               ))}
                            </div>
                         </div>
                         <div className="space-y-3">
                            <span className="text-[9px] font-bold text-brand-gold/60 uppercase block">{t('Handle Label')}</span>
                            <div className="flex flex-col gap-2">
                               {Object.values(HandleType).map(h => (
                                 <button
                                   key={h}
                                   onClick={() => setEditingModule({...editingModule, handle: h})}
                                   className={`px-4 py-3 text-[10px] font-bold rounded-xl border text-left transition-all ${editingModule.handle === h ? 'bg-brand-brown text-brand-ivory border-brand-brown' : 'bg-white border-brand-beige'}`}
                                 >
                                   {t(h)}
                                 </button>
                               ))}
                            </div>
                         </div>
                       </div>
                    </div>
                  </div>
      
                  <div className="pt-12 border-t border-brand-beige flex justify-end gap-6">
                     <button 
                       onClick={() => setIsModuleModalOpen(false)}
                       className="px-10 py-5 rounded-full text-[11px] font-bold uppercase tracking-widest text-brand-brown-muted hover:text-brand-brown"
                     >
                       {t('Cancel')}
                     </button>
                     <button 
                       onClick={handleSaveModule}
                       className="px-12 py-5 rounded-full bg-brand-brown text-brand-ivory text-[11px] font-bold uppercase tracking-widest shadow-2xl shadow-brand-brown/30 hover:bg-brand-brown/90 transition-all"
                     >
                       {t('Save Module')}
                     </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── Currency & Exchange Rate Confirmation Modal ─────────────────── */}
        {showCurrencyModal && (() => {
          const supplierCur = supplierMeta.currency || 'AED';
          const { quoteCurrency, rate } = rateConfig;
          const isSameCurrency = supplierCur === quoteCurrency;
          const rateLabel = isSameCurrency
            ? `No conversion needed — same currency`
            : `1 ${supplierCur} = ${rate} ${quoteCurrency}`;
          const exampleCost = pendingConversionItems[0]
            ? (((pendingConversionItems[0].originalUnitCost ?? pendingConversionItems[0].targetUnitPrice) * rate)).toFixed(2)
            : '—';
          const exampleOrig = pendingConversionItems[0]
            ? (pendingConversionItems[0].originalUnitCost ?? pendingConversionItems[0].targetUnitPrice).toFixed(2)
            : '—';

          return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0C1B3A]/60 backdrop-blur-sm">
              <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4 p-8 space-y-6">
                {/* Header */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#C9A84C] mb-1">Step · Before Pricing</p>
                  <h2 className="text-xl font-serif italic text-[#0C1B3A]">Currency & Exchange Rate</h2>
                  <p className="text-[11px] text-[#0C1B3A]/50 mt-1">确认汇率后才能进入定价</p>
                </div>

                {/* Supplier currency (read-only) */}
                <div className="bg-[#0C1B3A]/4 rounded-2xl p-4 space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40">Supplier Original Currency 供应商币种</p>
                  <p className="text-[18px] font-black text-[#0C1B3A]">{supplierCur}</p>
                </div>

                {/* GCI Quote Currency */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block">GCI Quote Currency 报价币种</label>
                  <select
                    value={quoteCurrency}
                    onChange={e => {
                      const qc = e.target.value;
                      const newRate = DEFAULT_RATES[supplierCur]?.[qc] ?? 1;
                      setRateConfig({ quoteCurrency: qc, rate: supplierCur === qc ? 1 : newRate });
                    }}
                    className="w-full bg-[#0C1B3A]/4 border border-[#0C1B3A]/10 rounded-xl px-4 py-3 text-[14px] font-bold text-[#0C1B3A] outline-none focus:border-[#C9A84C]"
                  >
                    {['AED', 'USD'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Exchange Rate */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#0C1B3A]/40 block">
                    Exchange Rate 汇率
                    {!isSameCurrency && <span className="ml-2 text-[#C9A84C] normal-case font-bold">· 可手动修改</span>}
                  </label>
                  {isSameCurrency ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-[13px] font-bold text-green-700">
                      同币种，无需换算
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] font-bold text-[#0C1B3A]/50 whitespace-nowrap">1 {supplierCur} =</span>
                      <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={rate}
                        onChange={e => setRateConfig(prev => ({ ...prev, rate: parseFloat(e.target.value) || 1 }))}
                        className="flex-1 bg-[#0C1B3A]/4 border border-[#C9A84C]/40 rounded-xl px-4 py-3 text-[14px] font-black text-[#0C1B3A] font-mono outline-none focus:border-[#C9A84C]"
                      />
                      <span className="text-[12px] font-bold text-[#0C1B3A]/50">{quoteCurrency}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-[#0C1B3A]/40 font-mono pl-1">{rateLabel}</p>
                </div>

                {/* Preview */}
                {!isSameCurrency && pendingConversionItems.length > 0 && (
                  <div className="bg-[#C9A84C]/8 border border-[#C9A84C]/20 rounded-2xl px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#C9A84C] mb-1">Preview · First Item</p>
                    <p className="text-[12px] text-[#0C1B3A] font-bold truncate">{pendingConversionItems[0].originalName}</p>
                    <p className="text-[11px] text-[#0C1B3A]/50 mt-0.5 font-mono">
                      {exampleOrig} {supplierCur} → <span className="text-[#0C1B3A] font-black">{exampleCost} {quoteCurrency}</span>
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowCurrencyModal(false)}
                    className="flex-1 py-3.5 rounded-[16px] border border-[#0C1B3A]/10 text-[12px] font-black uppercase tracking-widest text-[#0C1B3A]/50 hover:text-[#0C1B3A] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmRate}
                    className="flex-1 px-8 py-3.5 rounded-[16px] bg-[#C9A84C] text-[#0C1B3A] text-[12px] font-black uppercase tracking-widest shadow-lg hover:bg-[#E8C96A] transition-all active:scale-95"
                  >
                    Confirm & Enter Pricing →
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
