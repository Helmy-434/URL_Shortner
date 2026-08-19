const mongoose = require('mongoose');
const {isEmail} = require('validator');

const userSchema = new mongoose.Schema({
    id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    email: { type: String, required: true, unique: true, validate: { validator: isEmail, message: 'Invalid email' } },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' }
},{ timestamps: true });

module.exports = mongoose.model('User', userSchema);