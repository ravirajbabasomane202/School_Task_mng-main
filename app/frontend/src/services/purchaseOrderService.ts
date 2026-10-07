import api from './api';
import type { PurchaseOrder, POStats, CreatePurchaseOrderPayload } from '../types/purchaseOrder.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function getPurchaseOrders(filters?: { status?: string; department_id?: number }): Promise<PurchaseOrder[]> {
  const res = await api.get<ApiResponse<PurchaseOrder[]>>('/purchase-orders', { params: filters });
  return res.data.data;
}

export async function getPurchaseOrderById(id: number): Promise<PurchaseOrder> {
  const res = await api.get<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}`);
  return res.data.data;
}

export async function getPOStats(): Promise<POStats> {
  const res = await api.get<ApiResponse<POStats>>('/purchase-orders/stats');
  return res.data.data;
}

export async function createPurchaseOrder(payload: CreatePurchaseOrderPayload): Promise<PurchaseOrder> {
  const res = await api.post<ApiResponse<PurchaseOrder>>('/purchase-orders', payload);
  return res.data.data;
}

export async function submitPurchaseOrder(id: number): Promise<PurchaseOrder> {
  const res = await api.put<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/submit`);
  return res.data.data;
}

export async function financeProcessPurchaseOrder(id: number, status: 'APPROVED' | 'REJECTED'): Promise<PurchaseOrder> {
  const res = await api.put<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/finance-process`, { status });
  return res.data.data;
}

export async function markPurchaseOrderOrdered(id: number): Promise<PurchaseOrder> {
  const res = await api.put<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/mark-ordered`);
  return res.data.data;
}