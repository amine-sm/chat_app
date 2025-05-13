const express=require('express')
const user_route=express()

const bodyParser=require('body-parser')

user_route.use(bodyParser.json())
user_route.use(bodyParser.urlencoded({extended:true}))

user_route.set('view engine','ejs')
user_route.set('views','./views')

user_route.use(express.static('public'))

const path=require('path')

const multer=require('multer')

const session=require('express-session')

const {SESSION_SECRET}=process.env
user_route.use(session({secret:SESSION_SECRET}))

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, path.join(__dirname, '../public/images'));
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  });
const upload=multer({storage:storage})

const usercontroller=require('../controllers/UserController')

const Auth=require('../middlewares/Auth')
user_route.get('/register',Auth.isLogout,usercontroller.registerLoad)
user_route.post('/register',upload.single('image'),usercontroller.register)

user_route.get('/',Auth.isLogout,usercontroller.loginLoad)
user_route.post('/',usercontroller.login)
user_route.get('/logout',Auth.isLogin,usercontroller.logout)

user_route.get('/dashboard',Auth.isLogin,usercontroller.dashboardLoad)
// Route pour sauvegarder un message
user_route.post('/save-message', Auth.isLogin,usercontroller.saveMessage);


module.exports=user_route