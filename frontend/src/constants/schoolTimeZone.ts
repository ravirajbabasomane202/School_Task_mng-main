/**
 * The ONE school time zone used to show check times (the backend compares dates
 * in the same zone: SCHOOL_TIMEZONE, default Asia/Kolkata). Configure the
 * frontend copy with VITE_SCHOOL_TIMEZONE.
 */
export const SCHOOL_TIME_ZONE: string =
  (import.meta.env?.VITE_SCHOOL_TIMEZONE as string | undefined) || 'Asia/Kolkata';
