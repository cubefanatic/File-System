const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../User');
// store login or user registration information in the session
router.post('/login', async (req, res) => {
	try {

		let username = req.body.username;
		let password = req.body.password;
		let login = req.body.what;
		console.log(req.body);
		// login
		if (login === '1') {
			let user = await User.findOne({ username: username });
			if (user) {
				let check = bcrypt.compareSync(password, user.password)
				if (check) {
					try {
						req.session.user = user
						// res.status(200).json({
						// 	msg: 'logged in'
						// });
						return res.redirect('/');
					} catch (e) {
						throw e;
					}
				} else {
					res.status(400).json({
						msg: "Wrong password."
					});
				}
			} else {
				res.status(400).json({
					msg: 'User does not exist'
				});
			}
		} else { // register 
			password = bcrypt.hashSync(password, 12);
			let user = User({
				username,
				password
			});
			try {
				await user.save();
				return res.status(200).send("User registered. Please login.");
				// return res.redirect('/');
			} catch (e) {
				return res.status(500).json({
					error: "Username already used."
				});
			}
		}
	} catch (error) {
		throw error;
	}
});

router.get('/me', (req, res) => {
	if (!req.session.user) {
		return res.status(401).send();
	}
	return res.json(req.session.user);
});

module.exports = router;