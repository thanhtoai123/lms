# ERD — Giai đoạn 1 (Academics + Identity)

```mermaid
erDiagram
  centers ||--o{ rooms : has
  centers ||--o{ classes : hosts
  centers ||--o{ user_roles : scopes
  users ||--o{ user_roles : has
  users ||--o| teachers : "linked to"
  users ||--o| parents : "linked to"
  courses ||--o{ curricula : versions
  curricula ||--o{ lessons : contains
  courses ||--o{ classes : "instantiated as"
  classes ||--o{ class_schedules : "weekly rules"
  classes ||--o{ sessions : "generated"
  lessons ||--o{ sessions : "topic of"
  rooms ||--o{ sessions : in
  teachers ||--o{ sessions : teaches
  classes ||--o{ enrollments : has
  students ||--o{ enrollments : "enrolled via"
  students ||--o{ student_guardians : has
  parents ||--o{ student_guardians : "guardian of"
  parents ||--o| parent_private : "PII vault"
  sessions ||--o{ attendance : records
  enrollments ||--o{ attendance : "for"
  sessions ||--o{ session_media : photos
  enrollments ||--o{ makeup_requests : requests
  users ||--o{ audit_log : acts

  sessions {
    uuid id PK
    uuid class_id FK
    int sequence_no
    date date
    time start_time
    time end_time
    enum status "scheduled|in_progress|attendance_done|notes_done|completed|cancelled|rescheduled"
    text session_note
  }
  class_schedules {
    uuid id PK
    uuid class_id FK
    smallint weekday "1=Mon..7=Sun"
    time start_time
    time end_time
    date effective_from
    date effective_to "null = open"
  }
  enrollments {
    uuid id PK
    uuid student_id FK
    uuid class_id FK
    enum status "trial|active|paused|completed|withdrawn"
    int package_sessions
    int start_sequence_no
  }
  attendance {
    uuid id PK
    uuid session_id FK
    uuid enrollment_id FK
    enum status "present|late|absent_excused|absent_unexcused|makeup"
    text student_remark
  }
```

Ràng buộc ngoài Drizzle (xem `packages/db/sql/0001_constraints.sql`): EXCLUDE trùng phòng/GV theo `tsrange`, CHECK giờ, trigger audit append-only, view `v_overdue_sessions`.
