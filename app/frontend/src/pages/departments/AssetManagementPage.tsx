import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { getAssets, getAssetStats, createAsset, updateAsset, deleteAsset } from '../../services/assetService';
import type { Asset, AssetStats, CreateAssetPayload, AssetCategory, AssetCondition, AssetStatus } from '../../types/asset.types';
import type { RootState } from '../../store';

const CONDITION_COLOR: Record<AssetCondition, string> = {
  EXCELLENT: 'bg-green-100 text-green-700',
  GOOD: 'bg-blue-100 text-blue-700',
  FAIR: 'bg-amber-100 text-amber-700',
  POOR: 'bg-red-100 text-red-700',
};

const STATUS_COLOR: Record<AssetStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  MAINTENANCE: 'bg-amber-100 text-amber-700',
  DISPOSED: 'bg-gray-100 text-gray-700',
};

const AssetManagementPage: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const qc = useQueryClient();
  const isIT = user?.role === 'IT' || user?.role === 'CHAIRMAN';

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [filterCategory, setFilterCategory] = useState<AssetCategory | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<AssetStatus | 'ALL'>('ALL');

  const [form, setForm] = useState<CreateAssetPayload>({
    name: '',
    category: 'HARDWARE',
    serial_number: '',
    assigned_to: undefined,
    department_id: undefined,
    purchase_value: undefined,
    condition: 'GOOD',
    status: 'ACTIVE',
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ['assets', filterCategory, filterStatus],
    queryFn: () => getAssets({
      category: filterCategory === 'ALL' ? undefined : filterCategory,
      status: filterStatus === 'ALL' ? undefined : filterStatus,
    }),
  });

  const { data: stats } = useQuery<AssetStats>({
    queryKey: ['asset-stats'],
    queryFn: getAssetStats,
  });

  const createMutation = useMutation({
    mutationFn: createAsset,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['asset-stats'] });
      setShowCreateModal(false);
      resetForm();
      toast.success('Asset created');
    },
    onError: () => toast.error('Failed to create asset'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateAssetPayload> }) =>
      updateAsset(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      setEditingAsset(null);
      resetForm();
      toast.success('Asset updated');
    },
    onError: () => toast.error('Failed to update asset'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['asset-stats'] });
      toast.success('Asset deleted');
    },
    onError: () => toast.error('Failed to delete asset'),
  });

  const resetForm = () => {
    setForm({
      name: '',
      category: 'HARDWARE',
      serial_number: '',
      assigned_to: undefined,
      department_id: undefined,
      purchase_value: undefined,
      condition: 'GOOD',
      status: 'ACTIVE',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      toast.error('Name is required');
      return;
    }
    if (editingAsset) {
      updateMutation.mutate({ id: editingAsset.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setForm({
      name: asset.name,
      category: asset.category,
      serial_number: asset.serial_number || '',
      assigned_to: asset.assigned_to,
      department_id: asset.department_id,
      purchase_value: asset.purchase_value,
      condition: asset.condition,
      status: asset.status,
    });
    setShowCreateModal(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Asset Management</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">Track and manage school assets</p>
        </div>
        {isIT && <Button onClick={() => setShowCreateModal(true)}>+ Add Asset</Button>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-4">
          <p className="text-xs text-[#8A99B0]">Total Assets</p>
          <p className="text-2xl font-bold text-[#1E293B]">{stats?.total ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-4">
          <p className="text-xs text-[#8A99B0]">Hardware</p>
          <p className="text-2xl font-bold text-[#1E293B]">{stats?.by_category.HARDWARE ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-4">
          <p className="text-xs text-[#8A99B0]">In Maintenance</p>
          <p className="text-2xl font-bold text-amber-600">{stats?.under_maintenance ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#EFF2F6] bg-white p-4">
          <p className="text-xs text-[#8A99B0]">Active</p>
          <p className="text-2xl font-bold text-green-600">{stats?.by_status.ACTIVE ?? 0}</p>
        </div>
      </div>

      <div className="flex gap-4">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as AssetCategory | 'ALL')}
          className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
        >
          <option value="ALL">All Categories</option>
          <option value="HARDWARE">Hardware</option>
          <option value="SOFTWARE">Software</option>
          <option value="FURNITURE">Furniture</option>
          <option value="VEHICLE">Vehicle</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as AssetStatus | 'ALL')}
          className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="DISPOSED">Disposed</option>
        </select>
      </div>

      <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
        {assetsLoading ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">Loading…</div>
        ) : assets.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#8A99B0]">No assets found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Name', 'Category', 'Serial', 'Condition', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {assets.map((a) => (
                <tr key={a.id} className="hover:bg-[#F8F9FC] transition">
                  <td className="px-4 py-3 font-medium text-[#1E293B]">{a.name}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{a.category}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{a.serial_number ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONDITION_COLOR[a.condition]}`}>
                      {a.condition}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[a.status]}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isIT && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(a)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(a.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingAsset(null);
          resetForm();
        }}
        title={editingAsset ? 'Edit Asset' : 'Add Asset'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as AssetCategory })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
              >
                <option value="HARDWARE">Hardware</option>
                <option value="SOFTWARE">Software</option>
                <option value="FURNITURE">Furniture</option>
                <option value="VEHICLE">Vehicle</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Condition</label>
              <select
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value as AssetCondition })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
              >
                <option value="EXCELLENT">Excellent</option>
                <option value="GOOD">Good</option>
                <option value="FAIR">Fair</option>
                <option value="POOR">Poor</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Serial Number</label>
            <input
              type="text"
              value={form.serial_number}
              onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Assigned To (User ID)</label>
              <input
                type="number"
                value={form.assigned_to ?? ''}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
                placeholder="User ID"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Purchase Value</label>
              <input
                type="number"
                step="0.01"
                value={form.purchase_value ?? ''}
                onChange={(e) => setForm({ ...form, purchase_value: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              {editingAsset ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AssetManagementPage;