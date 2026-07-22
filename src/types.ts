export interface User {
  id: number;
  name: string;
  username: string | null;
  role: 'student' | 'teacher' | 'fa' | 'both';
  reg_no: string | null;
  face_encoding: string | null;
  email: string | null;
  created_at: string;
  activeRole?: 'student' | 'teacher' | 'fa';
}

export interface ClassObj {
  id: number;
  name: string;
  department: string;
  specialization: string;
  batch_start: number;
  batch_end: number;
  semester: string;
  fa_id: number;
}

export interface Enrollment {
  id: number;
  student_id: number;
  class_id: number;
}

export interface Subject {
  id: number;
  name: string;
  class_id: number;
  teacher_id: number;
  teacherName?: string;
}

export interface Session {
  id: number;
  subject_id: number;
  date: string;
  created_by: number;
  submitted_at: string | null;
  locked: boolean;
  session_start_time: string | null;
}

export interface AttendanceRecord {
  id: number;
  session_id: number;
  student_id: number;
  status: 'present' | 'absent' | 'late' | 'unmarked';
  marked_at: string;
  override_reason: string | null;
}

export interface ClassTransfer {
  id: number;
  class_id: number;
  from_fa_id: number;
  to_fa_id: number;
  transferred_at: string;
}
