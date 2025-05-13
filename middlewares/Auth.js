const isLogin = async (req, res, next) => {
    try {
      if (req.session.user) {
        next(); // L'utilisateur est connecté, on continue
      } else {
        res.redirect('/'); // Redirige vers la page de connexion
      }
    } catch (error) {
      console.error('Erreur dans isLogin:', error.message);
      res.redirect('/');
    }
  };
  
  const isLogout = async (req, res, next) => {
    try {
      if (req.session.user) {
        return res.redirect('/dashboard'); // Déjà connecté, on redirige
      }
      next(); // Pas connecté, on continue
    } catch (error) {
      console.error('Erreur dans isLogout:', error.message);
      res.redirect('/');
    }
  };
  
  module.exports = {
    isLogin,
    isLogout
  };
  