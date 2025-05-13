require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Import des modèles
const User = require('./models/UserModel');
const Chat = require('./models/ChatModel');

// Connexion MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/chat_app', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ Connexion MongoDB réussie'))
  .catch(err => console.error('❌ Erreur MongoDB :', err));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configuration de la session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Configuration des vues
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Route dashboard
app.get('/dashboard', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }

  try {
    const users = await User.find();
    const user = await User.findById(req.session.user._id);
    res.render('dashboard', { users, user });
  } catch (error) {
    console.error('Erreur chargement dashboard:', error);
    res.status(500).send('Erreur serveur');
  }
});

// Routes utilisateur
const UserRoute = require('./routes/UserRoute');
app.use('/', UserRoute);

// Gestion Socket.io
const usp = io.of('/user-namespace');
const onlineUsers = new Set();
const userSockets = new Map();

// Fonction pour émettre les utilisateurs en ligne
const emitOnlineUsers = () => {
  usp.emit('online-users-updated', Array.from(onlineUsers));
};

usp.on('connection', async (socket) => {
  const userId = socket.handshake.query.userId;
  if (!userId) return;

  try {
    // Gestion connexion utilisateur
    onlineUsers.add(userId);
    userSockets.set(userId, socket);
    await User.findByIdAndUpdate(userId, { isOnline: true });

    // Informer tous les clients
    emitOnlineUsers();
    usp.emit('user-status-updated', { userId, isOnline: true });
    console.log(`✅ ${userId} connecté (${userSockets.size} utilisateurs connectés)`);

    // Gestion envoi de messages
    socket.on('send-message', async (messageData) => {
      try {
        // Validation
        if (!messageData.senderId || !messageData.receiverId || !messageData.content) {
          throw new Error('Données de message invalides');
        }

        // Sauvegarde en base
        const newMessage = new Chat({
          senderId: messageData.senderId,
          receiverId: messageData.receiverId,
          content: messageData.content
        });

        const savedMessage = await newMessage.save();

        // Émettre au destinataire
        const receiverSocket = userSockets.get(messageData.receiverId);
        if (receiverSocket) {
          receiverSocket.emit('new-message', savedMessage);
        }

        // Confirmation à l'expéditeur
        socket.emit('message-delivered', savedMessage);

      } catch (error) {
        console.error('Erreur envoi message:', error);
        socket.emit('message-error', {
          error: error.message || 'Erreur lors de l\'envoi'
        });
      }
    });

    // Chargement historique messages
    socket.on('get-messages', async ({ senderId, receiverId }) => {
      try {
        const messages = await Chat.find({
          $or: [
            { senderId, receiverId },
            { senderId: receiverId, receiverId: senderId }
          ]
        })
        .sort({ timestamp: 1 })
        .limit(100);

        socket.emit('previous-messages', messages);
      } catch (error) {
        console.error('Erreur chargement messages:', error);
        socket.emit('load-messages-error', 'Impossible de charger les messages');
      }
    });

    // Gestion améliorée du typing indicator
    socket.on('typing', (receiverId) => {
      console.log(`[TYPING] ${userId} -> ${receiverId}`);
      
      if (!onlineUsers.has(receiverId)) {
        console.log(`Destinataire ${receiverId} hors ligne`);
        return;
      }

      const receiverSocket = userSockets.get(receiverId);
      if (receiverSocket) {
        console.log(`Envoi événement typing à ${receiverId}`);
        receiverSocket.emit('typing', userId);
      } else {
        console.log(`Socket non trouvé pour ${receiverId}`);
      }
    });

    socket.on('stop-typing', (receiverId) => {
      console.log(`[STOP TYPING] ${userId} -> ${receiverId}`);
      
      const receiverSocket = userSockets.get(receiverId);
      if (receiverSocket) {
        receiverSocket.emit('stop-typing', userId);
      }
    });

    // Demande de statut
    socket.on('request-user-status', (requestedUserId) => {
      const isOnline = onlineUsers.has(requestedUserId);
      socket.emit('user-status-response', { 
        userId: requestedUserId, 
        isOnline 
      });
    });

  } catch (error) {
    console.error('Erreur connexion socket:', error);
  }

  // Gestion déconnexion
  socket.on('disconnect', async () => {
    onlineUsers.delete(userId);
    userSockets.delete(userId);
    
    try {
      await User.findByIdAndUpdate(userId, { isOnline: false });
      usp.emit('user-status-updated', { userId, isOnline: false });
      emitOnlineUsers();
      console.log(`❌ ${userId} déconnecté (${userSockets.size} restants)`);
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    }
  });
});

// Lancement serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});