import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { getPurchaseOrders, getPOStats, createPurchaseOrder, submitPurchaseOrder, financeProcessPurchaseOrder, markPurchaseOrderOrdered } from '../../services/purchaseOrderService';
import type { PurchaseOrder, POStats, CreatePurchaseOrderPayload, CreatePurchaseOrderItem } from '../../types/purchaseOrder.types';
import type { RootState } from '../../store';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  ORDERED: 'bg-blue-100 text-blue-700',
};

const PurchaseOrdersPage: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const qc = useQueryClient();
  const isPurchase = user?.role === 'PURCHASE' || user?.role === 'CHAIRMAN';
  const isFinance = user?.role === 'FINANCE' || user?.role === 'CHAIRMAN';

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('ALL');

  const [form, setForm] = useState<CreatePurchaseOrderPayload>({
    title: '',
    vendor_name: '',
    total_amount: 0,
    items: [],
  });
  const [items, setItems] = useState<CreatePurchaseOrderItem[]>([]);
  const [currentItem, setCurrentItem] = useState<CreatePurchaseOrderItem>({
    item_name: '',
    quantity: 1,
    unit_price: 0,
  });

  const { data: pos = [], isLoading } = useQuery({
    queryKey: ['purchase-orders', filterStatus],
    queryFn: () => getPurchaseOrders(filterStatus === 'ALL' ? undefined : filterStatus),
  });

  const { data: stats } = useQuery<POStats>({
    queryKey: ['po-stats'],
    queryFn: getPOStats,
  });

  const createMutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['po-stats'] });
      setShowCreateModal(false);
      resetForm();
      toast.success('Purchase order created');
    },
    onError: () => toast.error('Failed to create purchase order'),
  });

  const submitMutation = useMutation({
    mutationFn: submitPurchaseOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('Submitted for approval');
    },
    onError: () => toast.error('Failed to submit purchase order'),
  });

  const financeMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'APPROVED' | 'REJECTED' }) =>
      financeProcessPurchaseOrder(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('Decision processed');
    },
    onError: () => toast.error('Failed to process decision'),
  });

  const addMutation = useMutation({
    mutationFn: markPurchaseOrderOrdered,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('Marked as ordered');
    },
    onError: () => toast.error('Failed to mark as ordered'),
  });

  const resetForm = () => {
    setForm({ title: '', vendor_name: '', total_amount: 0, items: [] });
    setItems([]);
    setCurrentItem({ item_name: '', quantity: 1, unit_price: 0 });
  };

  const handleAddItem = () => {
    if (currentItem.item_name && currentItem.quantity > 0 && currentItem.unit_price > 0) {
      const newItem = { ...currentItem, total_price: currentItem.quantity * currentItem.unit_price };
      setItems([...items, newItem]);
      setCurrentItem({ item_name: '', quantity: 1, unit_price: 0 });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.vendor_name) {
      toast.error('Title and vendor are required');
      return;
    }
    createMutation.mutate({ ...form, items });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Purchase Orders</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">Manage purchase orders and vendor transactions</p>
        </div>
        {isPurchase && <Button onClick={() => setShowCreateModal(true)}>+ New PO</Button>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-4">
          <p className="text-xs text-[#8A99B0]">Total</p>
          <p className="text-2xl font-bold text-[#1E293B]">{stats?.total ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-4">
          <p className="text-xs text-[#8A99B0]">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{stats?.pending ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-4">
          <p className="text-xs text-[#8A99B0]">Approved</p>
          <p className="text-2xl font-bold text-green-600">{stats?.approved ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-4">
          <p className="text-xs text-[#8A99B0]">Ordered</p>
          <p className="text-2xl font-bold text-blue-600">{stats?.ordered ?? 0}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">Loading…</div>
        ) : pos.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">No purchase orders found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Title', 'Vendor', 'Amount', 'Status', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {pos.map((po) => (
                <tr key={po.id} className="hover:bg-[#F8F9FC] transition">
                  <td className="px-4 py-3 font-medium text-[#1E293B]">{po.title}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{po.vendor_name}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">₦{po.total_amount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[po.status]}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8A99B0]">{po.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {po.status === 'DRAFT' && isPurchase && (
                        <button onClick={() => submitMutation.mutate(po.id)} className="text-xs text-blue-600 hover:underline">
                          Submit
                        </button>
                      )}
                      {po.status === 'PENDING' && isFinance && (
                        <>
                          <button onClick={() => financeMutation.mutate({ id: po.id, status: 'APPROVED' })} className="text-xs text-green-600 hover:underline">
                            Approve
                          </button>
                          <button onClick={() => financeMutation.mutate({ id: po.id, status: 'REJECTED' })} className="text-xs text-red-600 hover:underline">
                            Reject
                          </button>
                        </>
                      )}
                      {po.status === 'APPROVED' && isPurchase && (
                        <button onClick={() => addMutation.mutate(po.id)} className="text-xs text-blue-600 hover:underline">
                          Mark Ordered
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="New Purchase Order">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Vendor *</label>
              <input
                type="text"
                value={form.vendor_name}
                onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-2">Items</label>
            <div className="space-y-2 mb-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{item.item_name} x{item.quantity}</span>
                  <span className="w-20 text-right">₦{item.total_price.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              <input
                type="text"
                placeholder="Item name"
                value={currentItem.item_name}
                onChange={(e) => setCurrentItem({ ...currentItem, item_name: e.target.value })}
                className="rounded-lg border border-[#E4EAF2] px-2 py-1 text-sm"
              />
              <input
                type="number"
                placeholder="Qty"
                value={currentItem.quantity}
                onChange={(e) => setCurrentItem({ ...currentItem, quantity: parseInt(e.target.value) || 1 })}
                className="rounded-lg border border-[#E4EAF2] px-2 py-1 text-sm"
                min="1"
              />
              <input
                type="number"
                placeholder="Unit price"
                value={currentItem.unit_price}
                onChange={(e) => setCurrentItem({ ...currentItem, unit_price: parseFloat(e.target.value) || 0 })}
                className="rounded-lg border border-[#E4EAF2] px-2 py-1 text-sm"
                step="0.01"
              />
              <Button type="button" onClick={handleAddItem} variant="ghost" size="sm">
                Add
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create PO
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PurchaseOrdersPage;