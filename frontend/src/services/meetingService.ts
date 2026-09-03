import api from './api';

export interface Meeting {
  id: number;
  title: string;
  description?: string;
  agenda?: string;
  location?: string;
  meeting_date: string;
  duration_minutes: number;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  meeting_type: 'GENERAL' | 'DEPARTMENTAL' | 'EMERGENCY';
  created_by: number;
  createdByName?: string;
  created_at: string;
  attendees: {
    id: number;
    user_id: number;
    userName: string;
    userRole: string;
    rsvp_status: string;
  }[];
}

export interface CreateMeetingPayload {
  title: string;
  description?: string;
  agenda?: string;
  location?: string;
  meeting_date: string;
  duration_minutes?: number;
  meeting_type?: string;
  attendee_ids?: number[];
}

interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export const getMeetings = async (filters?: { status?: string; type?: string }) => {
  const response = await api.get<ApiResponse<Meeting[]>>('/meetings', { params: filters });
  return response.data.data;
};

export const getUpcomingMeetings = async () => {
  const response = await api.get<ApiResponse<Meeting[]>>('/meetings/upcoming');
  return response.data.data;
};

export const getMeetingById = async (id: number) => {
  const response = await api.get<ApiResponse<Meeting>>(`/meetings/${id}`);
  return response.data.data;
};

export const createMeeting = async (payload: CreateMeetingPayload) => {
  const response = await api.post<ApiResponse<Meeting>>('/meetings', payload);
  return response.data.data;
};

export const updateMeeting = async (id: number, payload: Partial<CreateMeetingPayload> & { status?: string }) => {
  const response = await api.put<ApiResponse<Meeting>>(`/meetings/${id}`, payload);
  return response.data.data;
};

export const deleteMeeting = async (id: number) => {
  const response = await api.delete(`/meetings/${id}`);
  return response.data;
};
