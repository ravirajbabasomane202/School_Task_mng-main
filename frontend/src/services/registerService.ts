import api from './api';
import { REGISTER_ENDPOINTS } from '../constants/apiEndpoints';
import type {
  CreateRegisterPayload,
  Register,
  RegisterCalendarEntry,
  RegisterCalendarEvent,
  RegisterCalendarResponse,
  RegisterFilters,
  RegisterHead,
  RegisterStatus,
} from '../types/register.types';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function getRegisters(filters?: RegisterFilters): Promise<Register[]> {
  const res = await api.get<ApiResponse<Register[]>>(REGISTER_ENDPOINTS.list, { params: filters });
  return res.data.data;
}

export async function getRegisterCalendarEvents(range?: { start?: string; end?: string }): Promise<RegisterCalendarEvent[]> {
  const res = await api.get<ApiResponse<RegisterCalendarEvent[]>>(REGISTER_ENDPOINTS.calendar, { params: range });
  return res.data.data;
}

/** Calendar entries (dots only) for a single register — used by the Calendar popup. */
export async function getRegisterCalendarFor(id: number, month?: string): Promise<RegisterCalendarResponse> {
  const res = await api.get<ApiResponse<RegisterCalendarResponse>>(REGISTER_ENDPOINTS.calendarFor(id), {
    params: month ? { month } : undefined,
  });
  return res.data.data;
}

/** Active users available to be selected as a Register's Head Name. */
export async function getRegisterHeads(): Promise<RegisterHead[]> {
  const res = await api.get<ApiResponse<RegisterHead[]>>(REGISTER_ENDPOINTS.heads);
  return res.data.data;
}

export async function createRegister(payload: CreateRegisterPayload): Promise<Register> {
  const res = await api.post<ApiResponse<Register>>(REGISTER_ENDPOINTS.create, payload);
  return res.data.data;
}

export async function updateRegister(id: number, payload: Partial<CreateRegisterPayload>): Promise<Register> {
  const res = await api.put<ApiResponse<Register>>(REGISTER_ENDPOINTS.update(id), payload);
  return res.data.data;
}

export async function deleteRegister(id: number): Promise<void> {
  await api.delete(REGISTER_ENDPOINTS.delete(id));
}

/** Edit Entire Series: updates the register's own shared status/next-due-date. */
export async function updateRegisterStatus(id: number, status: RegisterStatus): Promise<Register> {
  const res = await api.patch<ApiResponse<Register>>(REGISTER_ENDPOINTS.updateStatus(id), { status });
  return res.data.data;
}

/**
 * Edit This Occurrence: updates ONLY the single occurrence identified by
 * `registerId` + `occurrenceDate`. The backend upserts a dedicated
 * RegisterOccurrence row scoped to that exact date — every other occurrence
 * of the recurring series is left untouched.
 */
export async function updateOccurrenceStatus(
  registerId: number,
  occurrenceDate: string,
  status: RegisterStatus
): Promise<{ occurrence: RegisterCalendarEntry; register: Register }> {
  const res = await api.patch<ApiResponse<{ occurrence: RegisterCalendarEntry; register: Register }>>(
    REGISTER_ENDPOINTS.updateOccurrenceStatus(registerId, occurrenceDate),
    { status }
  );
  return res.data.data;
}
