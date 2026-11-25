import { describe, expect, it } from 'vitest';
import { PRINCIPAL_OWN_REGISTER_REASON, isRegisterUpdatable } from '../utils/registerUtils';
import type { Register } from '../types/register.types';

const base = { id: 1, can_check: true, check_block_reason: null, current_period_start: '2026-11-25' } as unknown as Register;

describe('Principal own-register lock', () => {
  it('disables Check Register with an explanation when the register is locked', () => {
    expect(isRegisterUpdatable({ ...base, own_principal_locked: true })).toEqual({
      updatable: false,
      reason: PRINCIPAL_OWN_REGISTER_REASON,
    });
  });

  it('leaves every other register unchanged', () => {
    expect(isRegisterUpdatable({ ...base, own_principal_locked: false })).toEqual({ updatable: true });
    expect(isRegisterUpdatable(base)).toEqual({ updatable: true });
  });
});
