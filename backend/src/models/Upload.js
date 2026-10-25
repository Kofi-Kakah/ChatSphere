import mongoose from 'mongoose'

const uploadSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: { type: String, default: '' },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    duration: { type: Number, default: null },
    thumbnailKey: { type: String, default: null },
    attachedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  },
  { timestamps: true },
)

uploadSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 })

export const Upload = mongoose.model('Upload', uploadSchema)
export default Upload
