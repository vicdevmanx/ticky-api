// models/User.js
import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  username: { type: String, required: true },
  email: {type: String, required: true},
  password: {type: String, required: true},
  totalScore: { type: Number, default: 0 },
  xpreduction: {type: Number, default: 0},
  bonus: {type: Number, default: 0},
  leaderboard: {type: Number, default: 0},
  totalGames: {type: Number, default: 0},
  currentGameId: {type: String, default: null},
  currentPlayer: {type: String, default: null}
});

export const User = model('User', userSchema);
