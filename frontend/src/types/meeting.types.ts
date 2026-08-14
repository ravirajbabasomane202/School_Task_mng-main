export type MeetingStatus = 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
export type MeetingType = 'GENERAL' | 'DEPARTMENTAL' | 'EMERGENCY';

export interface MeetingAttendee {
  id: number;
  user_id: number;
  userName: string;
  userRole: string;
  rsvp_status: 'YES' | 'NO' | 'MAYBE';
}

export interface Meeting {
  id: number;
  title: string;
  description?: string;
  agenda?: string;
  location?: string;
  meeting_date: string;
  duration_minutes: number;
  status: MeetingStatus;
  meeting_type: MeetingType;
  created_by: number;
  createdByName?: string;
  created_at: string;
  attendees: MeetingAttendee[];
}

export interface CreateMeetingPayload {
  title: string;
  description?: string;
  agenda?: string;
  location?: string;
  meeting_date: string;
  duration_minutes?: number;
  meeting_type?: MeetingType;
  attendee_ids?: number[];
}