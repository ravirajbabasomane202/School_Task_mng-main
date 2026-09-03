export type AssetCategory = 'HARDWARE' | 'SOFTWARE' | 'FURNITURE' | 'VEHICLE';
export type AssetCondition = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
export type AssetStatus = 'ACTIVE' | 'MAINTENANCE' | 'DISPOSED';

export interface Asset {
  id: number;
  name: string;
  category: AssetCategory;
  serial_number?: string;
  assigned_to?: number | null;
  assignee_name?: string | null;
  department_id?: number | null;
  department_name?: string | null;
  purchase_date?: string;
  purchase_value?: number;
  condition: AssetCondition;
  status: AssetStatus;
  created_at: string;
  updated_at?: string;
}

export interface AssetStats {
  total: number;
  by_category: Record<AssetCategory, number>;
  by_condition: Record<AssetCondition, number>;
  by_status: Record<AssetStatus, number>;
  under_maintenance: number;
}

export interface CreateAssetPayload {
  name: string;
  category: AssetCategory;
  serial_number?: string;
  assigned_to?: number;
  department_id?: number;
  purchase_date?: string;
  purchase_value?: number;
  condition?: AssetCondition;
  status?: AssetStatus;
}