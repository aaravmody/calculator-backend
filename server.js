require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const OAuth2Strategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const userdb = require('./model/userSchema.js');
const filedb = require('./model/fileSchema.js');

const app = express();
const PORT = 3000;

const clientid = process.env.GOOGLE_CLIENT_ID;
const clientsecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientid || !clientsecret) {
  throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables');
}

mongoose.connect(process.env.MONGO_URI, {});

app.use(cors({
  origin: "http://localhost:5173",
  methods: "GET,PUT,POST,DELETE",
  credentials: true
}));

app.use(express.json());
// Serve static files from the "uploads" directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use(session({
  secret: "123456789",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new OAuth2Strategy({
    clientID: clientid,
    clientSecret: clientsecret,
    callbackURL: "http://localhost:3000/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await userdb.findOne({ googleId: profile.id });

      if (!user) {
        user = new userdb({
          googleId: profile.id,
          displayName: profile.displayName,
          email: profile.emails[0].value,
          image: profile.photos[0].value
        });

        await user.save();
      }
      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  })
);

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await userdb.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback", passport.authenticate("google", {
  successRedirect: "http://localhost:5173/home",
  failureRedirect: "http://localhost:5173/login"
}));

app.get('/api/user', (req, res) => {
  if (req.isAuthenticated()) {
    console.log('Authenticated User:', req.user);
    res.json(req.user);
  } else {
    console.log('User not authenticated');
    res.status(401).json({ message: "Unauthorized" });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

app.post('/api/upload', upload.array('files'), async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const files = req.files.map(file => ({
    name: file.originalname,
    path: file.path,
    user: req.user._id,
  }));

  try {
    await filedb.insertMany(files);
    res.json(files);
  } catch (error) {
    console.error('Error saving files:', error); // Log the error details
    res.status(500).json({ message: 'Error saving files', error });
  }
});



app.get('/api/files', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const files = await filedb.find({ user: req.user._id });
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching files', error });
  }
});

app.get("/", (req, res) => {
  res.status(200).json("Server started");
});

app.listen(PORT, () => console.log(`Server started at port ${PORT}`));
