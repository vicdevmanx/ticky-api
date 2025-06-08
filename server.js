import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import cors from 'cors';
import mongoose from 'mongoose';
import routes from './routes/auth.js'
import jwt from 'jsonwebtoken';
import { User } from './models/user.js';
import { Messages } from './models/messages.js';
import dotenv from 'dotenv';
dotenv.config();


// connect to db
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('Database connected successfully!'))
.catch((err) => console.log('error connecting to the database', err))

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin : '*' }
});
const PORT = 3000;
const jwt_secret = 'your_jwt_secret';

//middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/v1/auth', routes);
function auth(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    jwt.verify(token, jwt_secret, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        req.user = decoded;
        next();
    });
}


let games = {} // {gameid: {ouenirejd:'X', iyeg7iwdow:'O'}, gameid: {ouenirejd:'X', iyeg7iwdow:'O'}, board: Array(9).fill('')}
const onlineUsers = {}
const socketIdToUsers = {}

app.get('/', (req, res) => {
    res.status(200).json({ message: 'welcome to ticky api' });
});

// routes end point
app.get('/users', auth, async (req, res) => {
    // Get all users except the requesting user
    try {
        const currentUserId = req.user?.id;
        // Get all users
        let users = await User.find({}).select('username email totalScore xpreduction bonus leaderboard');
        if (!users) return res.status(404).json({ message: 'No users found', ok: false });

        // Get the latest message for each user (between current user and them)
        let usersWithLastMessage = await Promise.all(users.map(async (user) => {
            // Don't include self in the list
            if (currentUserId && user._id.toString() === currentUserId) return null;

            // Find the latest message between current user and this user
            const lastMessage = await Messages.findOne({
                $or: [
                    { from: currentUserId, to: user._id.toString() },
                    { from: user._id.toString(), to: currentUserId }
                ]
            }).sort({ _id: -1 }); // Assuming _id is ObjectId and sorts by creation time

            return {
                ...user.toObject(),
                lastMessage: lastMessage ? lastMessage.content : null,
                lastMessageDate: lastMessage ? lastMessage._id.getTimestamp() : null
            };
        }));

        // Remove nulls (self)
        usersWithLastMessage = usersWithLastMessage.filter(u => u);

        // Sort: users with lastMessageDate first (desc), then users with no messages (at the end)
        usersWithLastMessage.sort((a, b) => {
            if (a.lastMessageDate && b.lastMessageDate) {
                return b.lastMessageDate - a.lastMessageDate;
            }
            if (a.lastMessageDate) return -1;
            if (b.lastMessageDate) return 1;
            // If neither has a last message, sort alphabetically by username
            return a.username.localeCompare(b.username);
        });

        res.status(200).json({ message: 'success', users: usersWithLastMessage, ok: true });
        console.log('users fetched and ordered by last message successfully');
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ message: 'Server error', ok: false });
    }
    // const users = await User.find({}).select('username email totalScore xpreduction bonus leaderboard');
    // if(!users) return res.status(404).json({ message: 'No users found', ok: false });
    // res.status(200).json({ message: 'success', users, ok: true });
    // console.log('users fetched successfully');
})

app.get('/user/:id', auth, async (req, res) => {
    const { id } = req.params;
    try {
        const user = await User.findById(id).select('username email totalScore xpreduction bonus leaderboard');
        if (!user) {
            return res.status(404).json({ message: 'User not found', ok: false });
        }
        res.status(200).json({ message: 'success', user, ok: true });
        console.log(`User ${id} fetched successfully: ${user}`);
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ message: 'Server error', ok: false });
    }
});


app.post('/createMessage', async (req, res) => {
    const { userOne, userTwo, content} = req.body
})


/// Game Logic
const checkWin = (board, gameId) => {
    const winningCombinations = [
        [0, 1, 2], // Row 1
        [3, 4, 5], // Row 2
        [6, 7, 8], // Row 3
        [0, 3, 6], // Column 1
        [1, 4, 7], // Column 2
        [2, 5, 8], // Column 3
        [0, 4, 8], // Diagonal 1
        [2, 4, 6], // Diagonal 2
      ];

      winningCombinations.forEach((combo) => {
        const [a, b, c] = combo;
        if(board[a] && board[a] === board[b] && board[a] === board[c]){
            games[gameId]['win'] = board[a];
        }
      })
}


/// Socket io
io.on('connection', (socket) => {

    socket.on('register', ({userId}) => {
        onlineUsers[userId] = socket.id
        socketIdToUsers[socket.id] = userId
        console.log(onlineUsers) 
    })

    socket.on('getMsg', async ({from, to}) => {
    try {
        // Assuming Messages is imported from models/messages.js
        const messages = await Messages.find({
            $or: [
                { from: from, to: to },
                { from: to, to: from }
            ]
        }).sort({ _id: 1 }); // sort by creation order if needed
        socket.emit('getMsg', { messages });
    } catch (err) {
        console.error('Error fetching messages:', err);
        socket.emit('getMsg', { messages: [], error: 'Failed to fetch messages' });
    }
    })

    socket.on('checkGameExist', ({gameId}) => {
        if(games[gameId]){
            socket.emit('checkGameExist', { exist: true, message: 'Game exist', gameId })
            console.log('game exist')
            return
        }
        socket.emit('checkGameExist', { exist: false, message: 'Game does not exist', gameId})
        console.log('game does not exist')
    })

    socket.on('joinGame', async ({gameId, userId}) => {
        socket.join(gameId);
        socket.data.gameId = gameId;
        if(!games[gameId]) {
            games[gameId] = {};
            games[gameId]['players'] = {};
            games[gameId]['users'] = {};
            games[gameId]['win'] = null;
            games[gameId]['isDraw'] = false;
            games[gameId]['board'] = Array(9).fill('');
            games[gameId]['currentPlayer'] = 'X';
            games[gameId]['X'] = 0;
            games[gameId]['O'] = 0;
            games[gameId]['chat'] = []; //[{player: 'X', msg: 'content'}, {player: 'O', msg: 'content'}]
            games[gameId]['userArray'] = [] 
        };
        const user = await User.findOne({ _id: userId });
        games[gameId]['users'][userId] = socket.id;
        games[gameId]['userArray'].push(user)
        io.to(gameId).emit('userJoined', { users: games[gameId]['userArray'] })
        games[gameId]['players'][socket.id] = Object.keys(games[gameId]['players']).length == 0 || Object.values(games[gameId]['players']).filter((val) => val == 'O').length ? 'X' : 'O';
        socket.emit('player', {player: games[gameId]['players'][socket.id]});
        socket.emit('startGame', {currentPlayer: games[gameId]['currentPlayer']})
        console.log(games[gameId]); 
        socket.emit('joinMsg', `successfully joined ${gameId} by ${socket.id}`);
        if(Object.keys(games[gameId]['players']).length == 2){
            socket.to(gameId).emit('userReady', {gameId})
        }else {
       
            
        }
    })

    socket.on('move', ({boxIndex, player, gameId}) => {              
        if(!games[gameId]){
           console.log(gameId)
            return
        };                                                                                                                                                                                                                                                                                             
        games[gameId]['currentPlayer'] = games[gameId]['currentPlayer'] == 'X' ? 'O' : 'X';
        games[gameId]['board'][boxIndex] = player
        io.to(gameId).emit('boxIndex', {boxIndex: boxIndex, currentPlayer: games[gameId]['currentPlayer'], board: games[gameId]['board']})
        checkWin(games[gameId]['board'], gameId);
        if(games[gameId]['win']) {
            games[gameId]['board'] = Array(9).fill('');
            console.log('winner:',games[gameId]['win'])
            games[gameId][games[gameId]['win']] = games[gameId][games[gameId]['win']] + 1;
            io.to(gameId).emit('win', {winner: games[gameId]['win'], board: games[gameId]['board'], points:{X: games[gameId]['X'], O:games[gameId]['O']}})
            games[gameId]['win'] = null;
        }
        else if(!games[gameId]['board'].filter((val) => val == '').length){
            games[gameId]['isDraw'] = true;
            games[gameId]['board'] = Array(9).fill('');
            io.to(gameId).emit('draw', {draw: games[gameId]['isDraw'], board: games[gameId]['board']});
            games[gameId]['isDraw'] = false;
        };
        console.log('sent to the frontend', boxIndex)
        console.log(games[gameId]);
    })

    socket.on('sendMessage', async ({message, gameId}) => {
        const { from, to } = message;
      
        // Optional: save to DB
        try {
            const newMessage = new Messages({
                from: from,
                to: to,
                content: message.content,
                read: 'notRead',
                badgeCount: 0
            });
            await newMessage.save();
        } catch (err) {
            console.error('Error saving message to DB:', err);
        }
       
        // Query database to get the user info for message.from
        let fromUser = null;
        try {
            fromUser = await User.findOne({ _id: from });
        } catch (err) {
            console.error('Error fetching user info for message.from:', err);
        }
        // Send to both users
        if(gameId){
            onlineUsers[from] && io.to(onlineUsers[from]).emit('gameMessage', {message});
            onlineUsers[to] && io.to(onlineUsers[to]).emit('gameMessage', {message, fromUser});
        }
        else {
            onlineUsers[from] && io.to(onlineUsers[from]).emit('newMessage', {message});
            onlineUsers[to] && io.to(onlineUsers[to]).emit('newMessage', {message, fromUser});
        }
        console.log(onlineUsers[from], onlineUsers[to], onlineUsers, message)
        
      });
      
    socket.on('leaveGame', ({gameId, player}) => {
        if(!gameId) return
        socket.leave(gameId);
        delete games[gameId]['players'][socket.id];
        console.log(games[gameId]['players']);
        socket.to(gameId).emit('userLeft', { message:'left the Game' })
    })

    socket.on('deleteGame', ({gameId}) => {
        if(!gameId) return
        if(Object.keys(games[gameId]['players']).length == 1){
            return
        }
        console.log('gameid deleted!')
        if(games[gameId]) {
            delete games[gameId]
        }
    })

    socket.on('continueGame', ({gameId}) => {
        socket.to(gameId).emit('continueGame')
    })

    socket.on('disconnect', () => {
        const userId = socketIdToUsers[socket.id]
            if(userId) {
                delete onlineUsers[userId]
                delete socketIdToUsers[socket.id]
                console.log(`${userId} Disconnected!`)
            }
            const gameId = socket?.data?.gameId;
            if(!gameId) return
            socket.leave(gameId);
            delete games[gameId]['players'][socket.id];
            socket.to(gameId).emit('userLeft', { message:'left the Game' })
            console.log('user Left')
            if(Object.keys(games[gameId]['players']).length == 1){
                return
            }
            if(games[gameId]) {
                delete games[gameId]
            } 
            console.log('gameid deleted!')
            
    })
})



server.listen(PORT, () => {
console.log(`server started successfully! on ${PORT}`)
})