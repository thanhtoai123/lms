import { relations } from "drizzle-orm";
import { centers, rooms } from "./org";
import { users, userRoles } from "./identity";
import { teachers, students, parents, studentGuardians } from "./people";
import { courses, curricula, lessons, classes, classSchedules, sessions, enrollments, attendance, sessionMedia } from "./academics";

export const centersRelations = relations(centers, ({ many }) => ({ rooms: many(rooms), classes: many(classes) }));
export const roomsRelations = relations(rooms, ({ one }) => ({ center: one(centers, { fields: [rooms.centerId], references: [centers.id] }) }));

export const usersRelations = relations(users, ({ many }) => ({ roles: many(userRoles) }));
export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  center: one(centers, { fields: [userRoles.centerId], references: [centers.id] }),
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
  user: one(users, { fields: [teachers.userId], references: [users.id] }),
  center: one(centers, { fields: [teachers.centerId], references: [centers.id] }),
  sessions: many(sessions),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  homeCenter: one(centers, { fields: [students.homeCenterId], references: [centers.id] }),
  guardians: many(studentGuardians),
  enrollments: many(enrollments),
}));
export const parentsRelations = relations(parents, ({ many }) => ({ guardians: many(studentGuardians) }));
export const studentGuardiansRelations = relations(studentGuardians, ({ one }) => ({
  student: one(students, { fields: [studentGuardians.studentId], references: [students.id] }),
  parent: one(parents, { fields: [studentGuardians.parentId], references: [parents.id] }),
}));

export const coursesRelations = relations(courses, ({ many }) => ({ curricula: many(curricula), classes: many(classes) }));
export const curriculaRelations = relations(curricula, ({ one, many }) => ({
  course: one(courses, { fields: [curricula.courseId], references: [courses.id] }),
  lessons: many(lessons),
}));
export const lessonsRelations = relations(lessons, ({ one }) => ({ curriculum: one(curricula, { fields: [lessons.curriculumId], references: [curricula.id] }) }));

export const classesRelations = relations(classes, ({ one, many }) => ({
  course: one(courses, { fields: [classes.courseId], references: [courses.id] }),
  curriculum: one(curricula, { fields: [classes.curriculumId], references: [curricula.id] }),
  center: one(centers, { fields: [classes.centerId], references: [centers.id] }),
  homeRoom: one(rooms, { fields: [classes.homeRoomId], references: [rooms.id] }),
  leadTeacher: one(teachers, { fields: [classes.leadTeacherId], references: [teachers.id], relationName: "leadTeacher" }),
  assistantTeacher: one(teachers, { fields: [classes.assistantTeacherId], references: [teachers.id], relationName: "assistantTeacher" }),
  schedules: many(classSchedules),
  sessions: many(sessions),
  enrollments: many(enrollments),
}));
export const classSchedulesRelations = relations(classSchedules, ({ one }) => ({
  class: one(classes, { fields: [classSchedules.classId], references: [classes.id] }),
  room: one(rooms, { fields: [classSchedules.roomId], references: [rooms.id] }),
  teacher: one(teachers, { fields: [classSchedules.teacherId], references: [teachers.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  class: one(classes, { fields: [sessions.classId], references: [classes.id] }),
  lesson: one(lessons, { fields: [sessions.lessonId], references: [lessons.id] }),
  room: one(rooms, { fields: [sessions.roomId], references: [rooms.id] }),
  teacher: one(teachers, { fields: [sessions.teacherId], references: [teachers.id] }),
  attendance: many(attendance),
  media: many(sessionMedia),
}));

export const enrollmentsRelations = relations(enrollments, ({ one, many }) => ({
  student: one(students, { fields: [enrollments.studentId], references: [students.id] }),
  class: one(classes, { fields: [enrollments.classId], references: [classes.id] }),
  attendance: many(attendance),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  session: one(sessions, { fields: [attendance.sessionId], references: [sessions.id] }),
  enrollment: one(enrollments, { fields: [attendance.enrollmentId], references: [enrollments.id] }),
}));

export const sessionMediaRelations = relations(sessionMedia, ({ one }) => ({ session: one(sessions, { fields: [sessionMedia.sessionId], references: [sessions.id] }) }));
