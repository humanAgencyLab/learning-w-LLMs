const mongoose = require('mongoose');

// Persistent chat history for an instructor's conversations with the
// Insights assistant. Scoped per (instructor, course) so switching courses
// gives a fresh thread; course-less sessions (courseId=null) hold the
// cross-course home-page conversation.
const InstructorChatMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true, default: '' },
    toolCalls: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const InstructorChatSessionSchema = new mongoose.Schema(
  {
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Null means "cross-course home scope".
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
      index: true,
    },
    messages: { type: [InstructorChatMessageSchema], default: [] },
  },
  { timestamps: true }
);

InstructorChatSessionSchema.index({ instructorId: 1, courseId: 1 });

module.exports = mongoose.model('InstructorChatSession', InstructorChatSessionSchema);
