export type RecruitmentStatus = 'OPEN' | 'SCREENING' | 'INTERVIEW' | 'CLOSED';
export type ApplicationStage = 'APPLIED' | 'SHORTLISTED' | 'INTERVIEWED' | 'HIRED' | 'REJECTED';

export interface Recruitment {
  id: number;
  position_title: string;
  department_id?: number | null;
  department_name?: string | null;
  vacancies: number;
  description?: string;
  status: RecruitmentStatus;
  created_by: number;
  created_at: string;
}

export interface RecruitmentApplication {
  id: number;
  recruitment_id: number;
  position_title?: string;
  applicant_name: string;
  email: string;
  notes?: string;
  resume_path?: string;
  stage: ApplicationStage;
  created_at: string;
}

export interface CreateRecruitmentPayload {
  position_title: string;
  department_id?: number;
  vacancies?: number;
  description?: string;
  status?: RecruitmentStatus;
}

export interface CreateApplicationPayload {
  applicant_name: string;
  email: string;
  notes?: string;
  resume?: File;
}