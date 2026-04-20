const mongoose = require('mongoose');

const InstructorStudentNoteSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    courseTopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseTopic',
      default: null,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    note: {
      type: String,
      default: '',
      maxlength: 4000,
    },
    createdByInstructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// One note record per instructor per (student, optional topic) within a course.
InstructorStudentNoteSchema.index(
  { courseId: 1, studentId: 1, courseTopicId: 1, createdByInstructorId: 1 },
  { unique: true }
);

module.exports = mongoose.model('InstructorStudentNote', InstructorStudentNoteSchema);

