export const ACADEMIC_EVENT_CATEGORIES = [
  'ACADEMIC',
  'CELEBRATION',
  'EXAMINATION',
  'HOLIDAY',
  'MEETING',
  'SPORTS',
  'OTHER'
] as const;

export type AcademicEventCategory = (typeof ACADEMIC_EVENT_CATEGORIES)[number];

export interface AcademicEvent {
  id: number;
  title: string;
  description: string | null;
  category: AcademicEventCategory;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  target_audience: string[];
  attachment_filename: string | null;
  has_attachment: boolean;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AcademicEventFilters {
  start?: string;
  end?: string;
  upcoming?: boolean;
}

export interface AcademicEventForm {
  title: string;
  description: string;
  category: AcademicEventCategory;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  location: string;
  target_audience: string[];
  attachment?: File;
}
