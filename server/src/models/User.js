import mongoose from 'mongoose'

const privacySchema = new mongoose.Schema(
  {
    showOnlineStatus: { type: Boolean, default: true },
    showLastSeen: { type: Boolean, default: true },
    sendReadReceipts: { type: Boolean, default: true },
  },
  { _id: false },
)

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: '' },
    bio: { type: String, default: '', maxlength: 160 },
    lastSeenAt: { type: Date, default: null },
    privacy: { type: privacySchema, default: () => ({}) },
  },
  { timestamps: true },
)

export const User = mongoose.model('User', userSchema)
export default User
