const mongoose = require('mongoose');

const user = new mongoose.Schema({
	username: {
		type: String,
		unique: true,
		required: true
	},
	password: {
		type: String,
		required: true
	}
}, {collection: 'user'});

module.exports = mongoose.model('User', user);