import mongoose from 'mongoose'

const attachmentSchema = new mongoose.Schema(
  {
    upload: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload' },
    mimeType: { type: String },
    size: { type: Number },
    originalName: { type: String },
    width: { type: Number },
    height: { type: Number },
    duration: { type: Number },
  },
  { _id: false },
)

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'image', 'audio', 'file', 'system', 'call'], default: 'text' },
    text: { type: String, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    clientId: { type: String, default: null },
  },
  { timestamps: true },
)

messageSchema.index({ conversation: 1, _id: -1 })
messageSchema.index({ conversation: 1, sender: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } })

export const Message = mongoose.model('Message', messageSchema)
export default Message
