
export enum BedSize {
  SINGLE = 'Single',
  QUEEN = 'Queen',
  KING = 'King',
  CUSTOM = 'Custom Size'
}

export const SIZE_DIMENSIONS: Record<string, { w: number, l: number }> = {
  [BedSize.SINGLE]: { w: 1200, l: 2000 },
  [BedSize.QUEEN]: { w: 1600, l: 2000 },
  [BedSize.KING]: { w: 1800, l: 2000 },
};

export enum Material {
  MDF = 'MDF',
  PLYWOOD = 'Plywood',
  SOLID_WOOD = 'Solid Wood',
  MARBLE = 'Marble',
  GLASS = 'Tempered Glass',
  METAL = 'Metal',
  PARTICLE_BOARD = 'Particle Board'
}

export enum Scenario {
  LABOUR_CAMP = 'Labour Camp',
  VILLA = 'Villa',
  APARTMENT = 'Apartment',
  HOTEL = 'Hotel',
  OFFICE = 'Office'
}

export enum FurnitureCategory {
  BED = 'Bed',
  SOFA = 'Sofa',
  WARDROBE = 'Wardrobe',
  CABINET = 'Cabinet',
  TABLE_DESK = 'Table / Desk',
  CHAIR = 'Chair',
  TV_UNIT = 'TV Unit',
  DINING_TABLE = 'Dining Table',
  OTHER = 'Other / Non-furniture'
}

export enum Thickness {
  T15 = '15mm Thickness',
  T18 = '18mm Thickness',
  T25 = '25mm Thickness'
}

export const THICKNESS_FACTORS: Record<string, number> = {
  [Thickness.T15]: 0.8,
  [Thickness.T18]: 1.0,
  [Thickness.T25]: 1.4,
};

export enum FrameType {
  SLATS = 'Bed Wooden Slats',
  METAL = 'Bed Metal Frame',
  STORAGE = 'Bed Storage Box Frame'
}

export enum HeadboardType {
  WOODEN = 'Bed Wooden Headboard',
  FABRIC = 'Bed Fabric Upholstered',
  PU_LEATHER = 'Bed PU Leather Upholstered',
  GENUINE_LEATHER = 'Bed Genuine Leather Upholstered'
}

export enum FinishType {
  MELAMINE = 'Finish Melamine',
  VENEER = 'Finish Veneer',
  PAINTED = 'Finish Painted',
  LAMINATE = 'Finish Laminate'
}

export enum Color {
  WHITE = 'Color White',
  BEIGE = 'Color Beige',
  WALNUT = 'Color Walnut',
  GREY = 'Color Grey',
  CUSTOM = 'Color Custom'
}

export enum AddOn {
  DRAWERS = 'Addon Drawers',
  LED = 'Addon LED Light',
  USB = 'Addon USB Socket',
  HARDWARE = 'Addon Special Hardware'
}

export enum SofaFrameType {
  SOLID_WOOD = 'Sofa Solid wood frame',
  PLYWOOD = 'Sofa Plywood frame',
  METAL = 'Sofa Metal frame',
  MIXED = 'Sofa Mixed wood + metal frame'
}

export enum SofaCushionType {
  STANDARD = 'Sofa Standard foam',
  HIGH_DENSITY = 'Sofa High density foam',
  POCKET_SPRING = 'Sofa Pocket spring + foam'
}

export enum SofaUpholsteryType {
  FABRIC = 'Upholstery Fabric',
  PU = 'Upholstery PU leather',
  MICROFIBER = 'Upholstery Microfiber leather',
  GENUINE_LEATHER = 'Upholstery Genuine leather'
}

// Chair Specifics
export enum ChairType {
  DINING = 'Chair Dining',
  OFFICE = 'Chair Office',
  LOUNGE = 'Chair Lounge'
}

export enum LegType {
  WOODEN = 'Chair Wooden legs',
  METAL = 'Chair Metal legs',
  SWIVEL = 'Chair Swivel base',
  WHEELS = 'Chair Wheels'
}

export enum BackrestType {
  STRAIGHT = 'Chair Straight back',
  CURVED = 'Chair Curved back',
  UPHOLSTERED = 'Chair Upholstered back',
  OPEN = 'Chair Open back'
}

export enum SeatType {
  HARD = 'Chair Hard seat',
  FOAM = 'Chair Foam seat',
  HIGH_DENSITY = 'Chair High density foam',
  SPRING_FOAM = 'Chair Spring + foam'
}

export enum ArmrestType {
  NONE = 'Chair No armrest',
  WOODEN = 'Chair Wooden armrest',
  METAL = 'Chair Metal armrest',
  UPHOLSTERED = 'Chair Upholstered armrest'
}

// Dining Table Specifics
export enum TableShape {
  RECTANGULAR = 'Table Rectangular',
  ROUND = 'Table Round',
  OVAL = 'Table Oval'
}

export enum TableBaseType {
  WOODEN = 'Table Wooden legs',
  METAL = 'Table Metal legs',
  PEDESTAL = 'Table Pedestal base',
  MIXED = 'Table Mixed base'
}

export enum EdgeTreatment {
  STRAIGHT = 'Table Straight Edge',
  ROUNDED = 'Table Rounded Edge',
  BEVELED = 'Table Beveled Edge'
}

// Wardrobe & Cabinet Specifics
export enum DoorType {
  SWING = 'Door Swing',
  SLIDING = 'Door Sliding',
  OPEN = 'Door Open'
}

export enum WardrobeType {
  HINGED = 'Wardrobe Hinged',
  SLIDING = 'Wardrobe Sliding',
  WALK_IN = 'Wardrobe Walk-in'
}

export enum TVUnitType {
  MINIMAL = 'TV Unit Minimal',
  FULL_WALL = 'TV Unit Full Wall',
  FLOATING = 'TV Unit Floating'
}

export enum InternalLayout {
  STANDARD = 'Standard (Shelves + Rail)',
  DRAWER_HEAVY = 'Drawer heavy',
  SHELF_ONLY = 'Shelves only'
}

export enum HandleType {
  NONE = 'Handle None',
  EXTERNAL = 'Handle External',
  HIDDEN = 'Handle Hidden'
}

export enum HingeType {
  STANDARD = 'Hinge Standard',
  SOFT_CLOSE = 'Hinge Soft-close'
}

export enum RunnerType {
  STANDARD = 'Runner Standard',
  SOFT_CLOSE = 'Runner Soft-close'
}

export enum CabinetType {
  BASE = 'Base cabinet',
  WALL = 'Wall cabinet',
  DISPLAY = 'Display cabinet',
  STORAGE = 'Storage cabinet'
}

// TV Unit Specifics
export enum MountingType {
  FLOOR = 'Floor standing',
  WALL = 'Wall-mounted'
}

export enum CabinetModuleType {
  BASE = 'Base cabinet',
  WALL = 'Wall cabinet',
  TALL = 'Tall cabinet',
  DISPLAY = 'Display cabinet',
  STORAGE = 'Storage cabinet',
  DRAWER = 'Drawer unit',
  OPEN = 'Open shelf',
  TV_MODULE = 'TV unit module'
}

export interface CabinetModule {
  id: string;
  type: CabinetModuleType;
  quantity: number;
  width: number;
  depth: number;
  height: number;
  material: Material;
  thickness: Thickness;
  doorType: DoorType;
  doorCount: number;
  shelfCount: number;
  hasHangingRail: boolean;
  hasDrawers: boolean;
  drawerCount: number;
  hingeType: HingeType;
  runnerType: RunnerType;
  handle: HandleType;
  finish: FinishType;
  color: Color;
  customColor?: string;
  mounting: MountingType;
}

export interface ModularCabinetConfiguration {
  modules: CabinetModule[];
  notes?: string;
}

export interface BedConfiguration {
  size: BedSize;
  width: number;
  length: number;
  height: number;
  headboardHeight: number;
  material: Material;
  thickness: Thickness;
  frame: FrameType;
  headboard: HeadboardType;
  finish: FinishType;
  color: Color;
  customColor?: string;
  addOns: AddOn[];
  notes?: string;
}

export interface SofaConfiguration {
  sofaType: string;
  length: number;    // Overall length
  depth: number;     // Depth
  seatHeight: number;
  backHeight: number;
  frameType: SofaFrameType;
  cushionType: SofaCushionType;
  upholsteryType: SofaUpholsteryType;
  legs: string;
  armrest: string;
  color: Color;
  customColor?: string;
  addOns: AddOn[];
  notes?: string;
}

export interface ChairConfiguration {
  type: ChairType;
  width: number;
  depth: number;
  seatHeight: number;
  backHeight: number;
  frameMaterial: Material;
  legType: LegType;
  backrest: BackrestType;
  seat: SeatType;
  upholstery: SofaUpholsteryType;
  armrest: ArmrestType;
  finish: FinishType;
  color: Color;
  customColor?: string;
  addOns: AddOn[];
  notes?: string;
}

export interface DiningTableConfiguration {
  shape: TableShape;
  topMaterial: Material;
  thickness: Thickness;
  baseType: TableBaseType;
  edge: EdgeTreatment;
  length: number;    // Length / Diameter
  width: number;
  height: number;
  finish: FinishType;
  color: Color;
  customColor?: string;
  notes?: string;
}

export interface WardrobeConfiguration {
  doorType: DoorType;
  material: Material;
  thickness: Thickness;
  layout: InternalLayout;
  handle: HandleType;
  width: number;
  height: number;
  depth: number;
  doorCount: number;
  finish: FinishType;
  color: Color;
  customColor?: string;
  addOns: AddOn[];
  notes?: string;
}

export interface CabinetConfiguration {
  type: CabinetType;
  material: Material;
  doorType: DoorType;
  hasDrawers: boolean;
  drawerDoorCount: number;
  handle: HandleType;
  width: number;
  height: number;
  depth: number;
  finish: FinishType;
  color: Color;
  customColor?: string;
  addOns: AddOn[];
  notes?: string;
}

export interface TVUnitConfiguration {
  mounting: MountingType;
  material: Material;
  width: number;    // Length
  height: number;
  depth: number;
  hasDrawers: boolean;
  finish: FinishType;
  color: Color;
  customColor?: string;
  addOns: AddOn[];
  notes?: string;
}

export interface GenericConfiguration {
  width: number;
  length: number;
  height: number;
  material: Material;
  thickness: Thickness;
  finish: FinishType;
  color: Color;
  customColor?: string;
  frameType?: FrameType;
  addOns: AddOn[];
  notes?: string;
}

export interface BOMItem {
  component: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  group?: string;
}

export interface MaterialPrices {
  [Material.MDF]: number;
  [Material.PLYWOOD]: number;
  [Material.SOLID_WOOD]: number;
  [Material.MARBLE]: number;
  [Material.GLASS]: number;
  upholsteryFabric: number;
  upholsteryPU: number;
  upholsteryLeather: number;
  finishMelamine: number;
  finishVeneer: number;
  finishPainted: number;
  finishLaminate: number;
  // Manual Overrides
  labor: number;
  packaging: number;
  transport: number;
  installation: number;
  marginPercent: number;
  vatPercent: number;
}

export const DEFAULT_PRICES: MaterialPrices = {
  [Material.MDF]: 120, // AED per m2
  [Material.PLYWOOD]: 180, // AED per m2
  [Material.SOLID_WOOD]: 450, // AED per m2
  [Material.MARBLE]: 1200,
  [Material.GLASS]: 350,
  upholsteryFabric: 150,
  upholsteryPU: 200,
  upholsteryLeather: 800,
  finishMelamine: 40,
  finishVeneer: 120,
  finishPainted: 200,
  finishLaminate: 90,
  // New manual overrides
  labor: 450,
  packaging: 150,
  transport: 250,
  installation: 200,
  marginPercent: 30,
  vatPercent: 5,
};

export interface PackageItem {
  id: string;
  category: FurnitureCategory;
  config: BedConfiguration | SofaConfiguration | GenericConfiguration | ChairConfiguration | DiningTableConfiguration | WardrobeConfiguration | CabinetConfiguration | TVUnitConfiguration | ModularCabinetConfiguration;
  quantity: number;
  bom: BOMItem[];
  totalAmount: number;
}

export interface QuoteRecord {
  id: string;
  customerProjectName: string;
  phoneWhatsApp: string;
  quoteNumber: string;
  salesperson: string;
  date: string;
  category: FurnitureCategory;
  scenario?: Scenario;
  totalAmount: number;
  config: BedConfiguration | SofaConfiguration | GenericConfiguration | ChairConfiguration | DiningTableConfiguration | WardrobeConfiguration | CabinetConfiguration | TVUnitConfiguration | ModularCabinetConfiguration;
  bom: BOMItem[];
  costOverrides?: {
    labor: number;
    packaging: number;
    transport: number;
    installation: number;
    marginPercent: number;
    vatPercent: number;
  };
}

export const SCENARIO_RECOMMENDATIONS: Record<Scenario, any> = {
  [Scenario.LABOUR_CAMP]: {
    material: Material.MDF,
    thickness: Thickness.T15,
    finish: FinishType.MELAMINE,
    frame: FrameType.METAL,
    frameType: SofaFrameType.METAL,
    cushionType: SofaCushionType.STANDARD,
    upholsteryType: SofaUpholsteryType.FABRIC,
  },
  [Scenario.VILLA]: {
    material: Material.PLYWOOD,
    thickness: Thickness.T18,
    finish: FinishType.VENEER,
    frame: FrameType.SLATS,
    frameType: SofaFrameType.SOLID_WOOD,
    cushionType: SofaCushionType.HIGH_DENSITY,
    upholsteryType: SofaUpholsteryType.GENUINE_LEATHER,
  },
  [Scenario.APARTMENT]: {
    material: Material.MDF,
    thickness: Thickness.T18,
    finish: FinishType.PAINTED,
    frame: FrameType.SLATS,
    frameType: SofaFrameType.PLYWOOD,
    cushionType: SofaCushionType.HIGH_DENSITY,
    upholsteryType: SofaUpholsteryType.MICROFIBER,
  },
  [Scenario.HOTEL]: {
    material: Material.PLYWOOD,
    thickness: Thickness.T18,
    finish: FinishType.VENEER,
    frame: FrameType.SLATS,
    frameType: SofaFrameType.MIXED,
    cushionType: SofaCushionType.POCKET_SPRING,
    upholsteryType: SofaUpholsteryType.FABRIC,
  },
  [Scenario.OFFICE]: {
    material: Material.MDF,
    thickness: Thickness.T25,
    finish: FinishType.LAMINATE,
    frame: FrameType.METAL,
    frameType: SofaFrameType.METAL,
    cushionType: SofaCushionType.STANDARD,
    upholsteryType: SofaUpholsteryType.PU,
  },
};

export const SOFA_FRAME_COSTS: Record<SofaFrameType, number> = {
  [SofaFrameType.SOLID_WOOD]: 800,
  [SofaFrameType.PLYWOOD]: 450,
  [SofaFrameType.METAL]: 600,
  [SofaFrameType.MIXED]: 700,
};

export const SOFA_CUSHION_COSTS: Record<SofaCushionType, number> = {
  [SofaCushionType.STANDARD]: 350,
  [SofaCushionType.HIGH_DENSITY]: 550,
  [SofaCushionType.POCKET_SPRING]: 750,
};

export const SOFA_UPHOLSTERY_COSTS: Record<SofaUpholsteryType, number> = {
  [SofaUpholsteryType.FABRIC]: 150,
  [SofaUpholsteryType.PU]: 200,
  [SofaUpholsteryType.MICROFIBER]: 350,
  [SofaUpholsteryType.GENUINE_LEATHER]: 900,
};

export const FRAME_TYPE_COSTS: Record<FrameType, number> = {
  [FrameType.SLATS]: 300,
  [FrameType.METAL]: 650,
  [FrameType.STORAGE]: 1200,
};

export const ADDON_COSTS_BASE: Record<AddOn, number> = {
  [AddOn.DRAWERS]: 450,
  [AddOn.LED]: 250,
  [AddOn.USB]: 180,
  [AddOn.HARDWARE]: 300,
};

export const FIXED_COST_CONFIG = {
  LABOR_PER_M2: 75,
  PACKAGING: 150,
  TRANSPORT: 200,
  MARGIN_PERCENT: 0.30,
  VAT_PERCENT: 0.05,
};
