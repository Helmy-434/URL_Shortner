const joi = require('joi');


const validate = (schema,target = 'body') => (req, res, next) => {   // validation factory that works as a middleware
    const { error } = schema.validate(req[target]);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }
    next();
}


const UserSchema = joi.object({
    email: joi.string().trim().email().required(),
    password: joi.string().min(6).required()
});

const UrlSchema = joi.object({
    originalUrl: joi.string().uri().required(),
});

const UpdateUrlSchema = joi.object({
    newUrl: joi.string().uri().required(),
});

const codeSchema = joi.object({
    shortUrl: joi.string().alphanum().length(6).required()
});


module.exports = { UserSchema, UrlSchema, codeSchema, validate ,UpdateUrlSchema};