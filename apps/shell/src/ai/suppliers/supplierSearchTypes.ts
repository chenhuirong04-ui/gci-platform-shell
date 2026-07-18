// Shared types for the supplier text search feature.
// Used by the API (api/suppliers/search.ts) and frontend components.

export type MatchType =
  | 'exact_product'
  | 'similar_product'
  | 'category_only'
  | 'service_match'
  | 'certification_match'
  | 'profile_match';

export interface SupplierSearchResultItem {
  supplierId: string;
  supplierName: string;
  shortCode: string;
  matchScore: number;       // 0–100
  matchType: MatchType;
  matchReason: string;
  matchedProducts: string[];
  matchedServices: string[];
  matchedCategories: string[];
  country: string | null;
  city: string | null;
  supplierType: string | null;
  isPreferred: boolean;
  currentRating: string | null;
  /** 'confirmed' = cert found in DB; 'not_recorded' = cert requested but not in DB; 'na' = no cert intent */
  certStatus: 'confirmed' | 'not_recorded' | 'na';
  primaryContact: {
    name: string | null;
    whatsapp: string | null;
    email: string | null;
  } | null;
  certifications: Array<{
    type: string;
    status: string;
    expireDate: string | null;
  }>;
  latestQuote: {
    quoteNo: string;
    quoteDate: string | null;
    currency: string | null;
    totalCost: number | null;
    validUntil: string | null;
    expired: boolean;
  } | null;
  profileCompleteness: number;  // 0–100
  warnings: string[];
  detailLink: string;
}

export interface SupplierSearchResponse {
  ok: true;
  query: string;
  extractedIntent: {
    keywords: string[];
    matchedSynonym: string | null;
    expandedCategories: string[];
    primaryCategory: string | null;
    country: string | null;
    certificationKeyword: string | null;
    preferredOnly: boolean;
    requiresContact: boolean;
    supplierTypePreference: string | null;
  };
  /** true when cert was requested but no supplier in results has that cert confirmed */
  certFallback: boolean;
  total: number;
  results: SupplierSearchResultItem[];
  notes: string[];
}

export interface SupplierSearchError {
  ok: false;
  error: string;
}
