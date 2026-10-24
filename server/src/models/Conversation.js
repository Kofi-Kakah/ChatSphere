import mongoose from 'mongoose'

const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    lastDeliveredMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    lastReadMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    mutedUntil: { type: Date, default: null },
  },
  { _id: false },
)

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    participants: { type: [participantSchema], default: [] },
    directKey: { type: String, unique: true, sparse: true },
    name: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    theme: { type: String, enum: ['default', 'love', 'friendship', 'battle'], default: 'default' },
    lastMessage: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      type: { type: String },
      text: { type: String },
      createdAt: { type: Date },
    },
    lastMessageAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
)

conversationSchema.index({ 'participants.user': 1, lastMessageAt: -1 })

export const Conversation = mongoose.model('Conversation', conversationSchema)
export default Conversation
