import { Router } from 'express';
import { User } from '../models/user.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';


const router = Router();
const jwt_secret = 'your_jwt_secret';

router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Check if user already exists
        const existingUser = await User.find({ 
            $or: [
                { username: username },
                { email: email }
            ]
         });
        if (existingUser.length > 0) {
            return res.status(400).json({ message: 'User already exists', ok: false});
        }else if (existingUser.length === 0) {
            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create a new user
            const newUser = new User({
                username,
                email,
                password: hashedPassword,
            });

            await newUser.save();
            const token = jwt.sign({ id: newUser._id }, jwt_secret, { expiresIn: '90d' });
            return res.status(201).json({ message: `Welcome ${newUser.username} you registered successfully!`, token, user: { id: newUser._id, username: newUser.username, email: newUser.email },  ok: true });
        }

     }catch(err){
        console.log(err)
        return res.status(500).json({ message: 'Server error', ok: false});
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Find the user by email
        const user = await User.find({ 
            $or: [
                { username: username },
                { email: username }
            ]
         });
        if (user.length === 0) {
            return res.status(400).json({ message: 'User not found', ok: false});
        }
        // Check if the password is correct
        const isMatch = await bcrypt.compare(password, user[0].password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials', ok: false});
        }
        // Generate a JWT token
        const token = jwt.sign({ id: user[0]._id }, jwt_secret, { expiresIn: '90d' });
        return res.status(200).json({message: `Welcome ${user[0].username}!`, token, user: { id: user[0]._id, username: user[0].username, email: user[0].email }, ok: true});
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error', ok: false});
    }
})

router.post('/data', async (req, res) => {
    const { token } = req.body;
    try{
    const decode = jwt.verify(token, jwt_secret)
    const user = await User.findById(decode.id)
    if(!user){
        return res.status(400).json({ message: 'User not found', ok: false});
    }
    if(user.password){
        user.password = undefined
    }
    res.status(200).json({message: 'User data', user, ok: true})
    }
    catch(err){
        console.log(err)
    }
})

router.post('/checkdata', async (req, res) => {
    const { identifier } = req.body;
    try{
        const response = await User.find({
            $or: [
                { username: identifier },
                { email: identifier }
            ]
         });

        if(response.length === 0){
            return res.status(200).json({ message: 'unique', ok: true, exists: false});
        }else if(response.length > 0){
            return res.status(200).json({ message: 'not unique', ok: true, exists: true});
        }
    }
    catch(err){
        console.log(err)
        res.status(500).json({ message: 'Server error', ok: false});
    }
})

export default router;
