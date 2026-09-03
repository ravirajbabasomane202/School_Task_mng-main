import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import { createRegister, getRegisterHeads } from '../../services/registerService';
import { REGISTER_CYCLES, REGISTER_PRIORITIES } from '../../types/register.types';
import type { CreateRegisterPayload, RegisterCycle, RegisterPriority } from '../../types/register.types';

const EMPTY_FORM: CreateRegisterPayload = {
  name: '',
  register_no: '',
  head_id: '',
  checking_cycle: 'MONTHLY',
  priority: 'MEDIUM',
  start_date: '',
};

function AddRegister() {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateRegisterPayload>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load only active Head Names from the API for the dropdown (Section 1 of the spec).
  const { data: heads = [], isLoading: headsLoading } = useQuery({
    queryKey: ['register-heads'],
    queryFn: getRegisterHeads,
  });

  const createMutation = useMutation({
    mutationFn: createRegister,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registers'] });
      qc.invalidateQueries({ queryKey: ['register-calendar'] });
      toast.success('Register added successfully');
      setForm(EMPTY_FORM);
      setErrors({});
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to add register';
      toast.error(message);
    },
  });

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = 'Register Name is required';
    if (!form.register_no.trim()) nextErrors.register_no = 'Register No. is required';
    if (!form.head_id) nextErrors.head_id = 'Head Name is required';
    if (!form.checking_cycle) nextErrors.checking_cycle = 'Checking Cycle is required';
    if (!form.priority) nextErrors.priority = 'Priority is required';
    if (!form.start_date) nextErrors.start_date = 'Start Date is required';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fill in all required fields');
      return;
    }
    createMutation.mutate(form);
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setErrors({});
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[#1E293B]">Add Register</h1>
        <p className="mt-1 text-sm text-[#5B6E8C]">Create a new register to track on a recurring cycle</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 rounded-xl border border-[#EFF2F6] bg-white p-6">
        <Input
          label="Register Name *"
          placeholder="e.g. Attendance Register"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
        />

        <Input
          label="Register No. *"
          placeholder="e.g. REG-2026-001"
          value={form.register_no}
          onChange={(e) => setForm({ ...form, register_no: e.target.value })}
          error={errors.register_no}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#36506C]">Head Name *</span>
          <select
            value={form.head_id}
            onChange={(e) => setForm({ ...form, head_id: e.target.value ? Number(e.target.value) : '' })}
            disabled={headsLoading}
            className="min-h-[38px] rounded-[10px] border-[0.5px] border-solid border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
          >
            <option value="">{headsLoading ? 'Loading…' : 'Select the person responsible'}</option>
            {heads.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.department_name ? ` (${h.department_name})` : ''}
              </option>
            ))}
          </select>
          {errors.head_id ? <span className="text-[11px] text-[#C13F3A]">{errors.head_id}</span> : null}
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Checking Cycle *</span>
            <select
              value={form.checking_cycle}
              onChange={(e) => setForm({ ...form, checking_cycle: e.target.value as RegisterCycle })}
              className="min-h-[38px] rounded-[10px] border-[0.5px] border-solid border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
            >
              {REGISTER_CYCLES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {errors.checking_cycle ? <span className="text-[11px] text-[#C13F3A]">{errors.checking_cycle}</span> : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Priority *</span>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as RegisterPriority })}
              className="min-h-[38px] rounded-[10px] border-[0.5px] border-solid border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
            >
              {REGISTER_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {errors.priority ? <span className="text-[11px] text-[#C13F3A]">{errors.priority}</span> : null}
          </label>
        </div>

        <Input
          label="Start Date *"
          type="date"
          value={form.start_date}
          onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          error={errors.start_date}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={handleClose}>
            Close
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Add
          </Button>
        </div>
      </form>
    </div>
  );
}

export default AddRegister;
