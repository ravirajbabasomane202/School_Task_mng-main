import api from './api';
import type { Asset, AssetStats, CreateAssetPayload } from '../types/asset.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function getAssets(filters?: { category?: string; status?: string; department_id?: number }): Promise<Asset[]> {
  const res = await api.get<ApiResponse<Asset[]>>('/assets', { params: filters });
  return res.data.data;
}

export async function getAssetStats(): Promise<AssetStats> {
  const res = await api.get<ApiResponse<AssetStats>>('/assets/stats');
  return res.data.data;
}

export async function createAsset(payload: CreateAssetPayload): Promise<Asset> {
  const res = await api.post<ApiResponse<Asset>>('/assets', payload);
  return res.data.data;
}

export async function updateAsset(id: number, payload: Partial<CreateAssetPayload>): Promise<Asset> {
  const res = await api.put<ApiResponse<Asset>>(`/assets/${id}`, payload);
  return res.data.data;
}

export async function deleteAsset(id: number): Promise<void> {
  await api.delete(`/assets/${id}`);
}