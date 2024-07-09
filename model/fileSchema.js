const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: String,
  path: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('File', fileSchema);
