const mongoose = require('mongoose');
const createError = require('http-errors');
const Mailgun = require('./Mailgun');
const crypto = require('crypto');
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: String,  
    status: {
        admin: Boolean,
        online: Boolean,
        registered: Boolean,
        archived: Boolean
    },
    credentials: {
        password: String,
        resetToken: String,
    }
});

const UserModel = mongoose.model('User', userSchema)

class User {
    constructor() {
    }

    // invite an user
    async add(email, admin = false) {
        const user = await UserModel.findOne({email: email})
        if (user === null) {
            const user = new UserModel();
            user.email = email;
            user.status.admin = admin;
            // create a password reset token
            user.credentials.resetToken = newToken();
            // email an invite
            const invite = new Mailgun(user.email);
            await invite.send(`Invitation to ${process.env.APP_NAME}`, `Hello,\n\nYou have been invited to join the team at ${process.env.APP_DOMAIN}.\nGet started by finish creating your account at ${process.env.APP_URL}/confirm/${user.credentials.resetToken}`);
            const result = await user.save();
            return {
                id: result._id
            }
        } else {
            const err = createError(409, {
                status: "error",
                message: "User with email exists"
            });
            throw err;
        }      
    }

    // create an account
    async register(token, firstName, lastName, password) {
        const user = await UserModel.findOne({credentials: {resetToken: token}});
        if (user) {
            user.credentials.password = await bcrypt.hash(password, 10);
            user.firstName = firstName;
            user.lastName = lastName;
            // clear the reset token
            user.credentials.resetToken = ""
            await user.save();
            return {
                status: "ok",
                message: "User created"
            }
        } else {
            const err = createError(404, {
                status: "error",
                message: "Invalid token"
            });
            throw err;
        }
    }

    // update user details
    async update(id, fields) {
        try {
            const user = await this.init(id);
            for (const [key, value] of Object.entries(fields)) {
                user[key] = value;
            }
            await user.save();
            return {
                status: "ok"
            }
        } catch (err) {
            throw err;
        }
    }

    // request password reset
    async newReset(email) {
        try {
            const user = await UserModel.findOne({email: email})
            if (user !== null) {
                user.credentials.resetToken = newToken();
                const invite = new Mailgun(user.email);
                await invite.send(`Password reset`, `Hello,\n\nA password reset has been requested for your account at ${process.env.APP_DOMAIN}.\nYou can set a new password here: ${process.env.APP_URL}/reset/${user.credentials.resetToken}\n\nIf you didn't ask for this reset you can safely ignore this letter`);
                user.save();
            } else {
                console.log(`[w] Password reset request for non-existing email: ${email}`);
            }
        } catch (err) {

        }
    }

    // check reset token
    async checkToken(token) {
        const user = await UserModel.findOne({credentials: {resetToken: token}});
        if (user) {
            return {
                status: "ok"
            }
        } else {
            const err = createError(404, {
                status: "error",
                message: "Invalid token"
            });
            throw err;
        }
    }

    // reset user password
    async reset(token) {
        const user = await UserModel.findOne({credentials: {resetToken: token}});
        if (user) {
            user.credentials.password = await bcrypt.hash(password, 10);
            // clear the reset token
            user.credentials.resetToken = ""
            await user.save();
            return {
                status: "ok",
                message: "Password updated"
            }
        } else {
            const err = createError(404, {
                status: "error",
                message: "Invalid token"
            });
            throw err;
        }
    }

    // list all users
    async list(limit=100, skip=0) {
        const users = await UserModel.find({}, null, {
            skip: skip,
            limit: limit
        });
        const result = {
            count: {}
        };
        result.count.returned = users.length;
        result.count.total = await UserModel.estimatedDocumentCount();
        result.users = users.map(user => {
            user = user.toObject();
            delete user.credentials;
            return user;
        });
        result.settings = {
            limit: limit,
            skip: skip,
        }
        return result;
    }
    
    // get user details
    async get(id) {
        const user = await UserModel.findById(id);
        if (user) {
            const userObj = user.toObject();
            delete userObj.credentials;
            return userObj;
        } else {
            const err = createError(404, {
                status: "error",
                message: "Not found"
            });
            throw err;
        }
    }

    // get user model with data
    async init(id) {
        const user = await UserModel.findById(id);
        if (user) {
            return user;
        } else {
            const err = createError(404, {
                status: "error",
                message: "Not found"
            });
            throw err;
        }
    }

    // search for a user
    async find(fields = {}) {
        if (fields) {
            let result;
            const users = await UserModel.find({fields});
            if (users) {
                result = {
                    status: "ok",
                    users: users
                }
            } else {
                const err = createError(404, {
                    status: "error",
                    message: "Not found"
                });
                throw err;
            }
        }     
    }
}

function newToken() {
    const token = crypto.createHash('md5').update(`${Date.now() + Math.floor(Math.random() * 10000)}`).digest("hex");
    return token;
}

module.exports = User