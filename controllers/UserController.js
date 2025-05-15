const User = require('../models/UserModel');
const bcrypt=require('bcrypt')
const registerLoad = async (req, res) => {
  try {
    res.render('Register'); // Formulaire d'inscription
  } catch (error) {
    console.log(error.message);
    res.status(500).send('Erreur serveur');
  }
};

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const image = req.file ? req.file.filename : 'default.png';

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ success: false, error: 'Cet email est déjà utilisé' });
    }

    const newUser = new User({
      name,
      email,
      password, // NE PAS HASHER ICI
      image,
      is_online: false
    });

    await newUser.save(); // le pre('save') va hasher automatiquement

    return res.json({ success: true });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, error: "Erreur lors de l'inscription" });
  }
};
// Affiche la page de connexion
const loginLoad = async (req, res) => {
    try {
      res.render('Login'); // Assure-toi que login.ejs existe
    } catch (error) {
      console.log(error.message);
      res.status(500).send('Erreur serveur');
    }
  };
  
  // Traite la soumission du formulaire de connexion
  const login = async (req, res) => {
    try {
      const { email, password } = req.body;
  
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(200).json({ success: false, error: 'Email ou mot de passe incorrect' });
      }
  
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(200).json({ success: false, error: 'Email ou mot de passe incorrect' });
      }
  
      user.is_online = true;
      await user.save();
  
      req.session.user = {
        _id: user._id,
        name: user.name,
        email: user.email,
        image: user.image
      };
  
      res.json({ success: true });
    } catch (error) {
      console.log(error.message);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  };
  
// Déconnexion de l'utilisateur
const logout = async (req, res) => {
    try {
      if (req.session.user) {
        // Mettre à jour l'état is_online dans la base de données
        await User.findByIdAndUpdate(req.session.user._id, { is_online: false });
      }
  
      // Détruire la session
      req.session.destroy((err) => {
        if (err) {
          console.log(err);
          return res.status(500).send('Erreur lors de la déconnexion');
        }
        res.redirect('/'); // redirige vers la page de login ou accueil
      });
    } catch (error) {
      console.log(error.message);
      res.status(500).send('Erreur lors de la déconnexion');
    }
  };
  const dashboardLoad = async (req, res) => {
    try {
      if (!req.session.user) return res.redirect('/');
  
      const user = await User.findById(req.session.user._id);
      const users = await User.find(); // Tous les utilisateurs
  
      res.render('dashboard', {
        user,
        users
      });
    } catch (error) {
      console.log(error.message);
      res.status(500).send('Erreur lors du chargement du dashboard');
    }
  };
  const profileLoad = async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    res.render('profile', { user });
  } catch (error) {
    console.log(error.message);
    res.status(500).send('Erreur lors du chargement du profil');
  }
};

  const saveMessage = async (req, res) => {
    try {
      const { senderId, receiverId, content } = req.body;
  
      // Validation des données
      if (!senderId || !receiverId || !content) {
        return res.status(400).json({
          success: false,
          error: 'Tous les champs sont requis (senderId, receiverId, content)'
        });
      }
  
      // Vérification de l'existence des utilisateurs
      const [senderExists, receiverExists] = await Promise.all([
        User.exists({ _id: senderId }),
        User.exists({ _id: receiverId })
      ]);
  
      if (!senderExists || !receiverExists) {
        return res.status(404).json({
          success: false,
          error: 'Utilisateur(s) introuvable(s)'
        });
      }
  
      // Création et sauvegarde du message
      const newMessage = new Chat({
        senderId,
        receiverId,
        content
      });
  
      const savedMessage = await newMessage.save();
  
      // Récupération du message avec les infos de l'expéditeur
      const populatedMessage = await Chat.findById(savedMessage._id)
        .populate('senderId', 'name image')
        .lean()
        .exec();
  
      // Réponse formatée
      res.status(201).json({
        success: true,
        message: {
          ...populatedMessage,
          timestamp: savedMessage.timestamp // Assure le bon format de date
        }
      });
  
    } catch (error) {
      console.error('Erreur sauvegarde message:', error);
      
      // Gestion des erreurs spécifiques
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          error: 'Données de message invalides'
        });
      }
  
      if (error.name === 'CastError') {
        return res.status(400).json({
          success: false,
          error: 'ID utilisateur invalide'
        });
      }
  
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la sauvegarde du message'
      });
    }
  };
module.exports = {
  registerLoad,
  register,
  login,
  loginLoad,
  logout,
  dashboardLoad,
  saveMessage,
  profileLoad
};
