import { Schema, model } from 'mongoose';


const messagesSchema = new Schema({
    from: {type: String, required: true},
    to: {type: String, required: true},
    content: {type: String, required: true},
    read: { type: String, default: 'notRead' },
    badgeCount: {type: Number, default: 0}
})

export const Messages = model('Messages', messagesSchema)
