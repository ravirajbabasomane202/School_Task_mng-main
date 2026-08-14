export type POStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ORDERED';

export interface PurchaseOrderItem {
  id: number;
  purchase_order_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface PurchaseOrder {
  id: number;
  title: string;
  vendor_name: string;
  total_amount: number;
  department_id?: number;
  department_name?: string;
  notes?: string;
  status: POStatus;
  created_by: number;
  created_at: string;
  processed_at?: string;
  items?: PurchaseOrderItem[];
}

export interface POStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  ordered: number;
  draft: number;
}

export interface CreatePurchaseOrderItem {
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price?: number;
}

export interface CreatePurchaseOrderPayload {
  title: string;
  vendor_name: string;
  total_amount: number;
  department_id?: number;
  notes?: string;
  items?: CreatePurchaseOrderItem[];
}