const express = require('express');
const bodyParser = require('body-parser');
const passport = require('passport');
const authJwtController = require('./auth_jwt'); // You're not using authController, consider removing it
const jwt = require('jsonwebtoken');
const cors = require('cors');
const User = require('./Users');
const Movie = require('./Movies'); // You're not using Movie, consider removing it
const mongoose = require('mongoose');
const dotenv = require('dotenv'); // to use environment variables

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

const router = express.Router();

const mongoURI = 'mongodb+srv://node:<db_password>@assignment5.dasumet.mongodb.net/?retryWrites=true&w=majority&appName=Assignment5';
// Connect to MongoDB using Mongoose
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// Removed getJSONObjectForMovieRequirement as it's not used

router.post('/signup', async (req, res) => { // Use async/await
  if (!req.body.username || !req.body.password) {
    return res.status(400).json({ success: false, msg: 'Please include both username and password to signup.' }); // 400 Bad Request
  }

  try {
    const user = new User({ // Create user directly with the data
      name: req.body.name,
      username: req.body.username,
      password: req.body.password,
    });

    await user.save(); // Use await with user.save()

    res.status(201).json({ success: true, msg: 'Successfully created new user.' }); // 201 Created
  } catch (err) {
    if (err.code === 11000) { // Strict equality check (===)
      return res.status(409).json({ success: false, message: 'A user with that username already exists.' }); // 409 Conflict
    } else {
      console.error(err); // Log the error for debugging
      return res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' }); // 500 Internal Server Error
    }
  }
});


router.post('/signin', async (req, res) => { // Use async/await
  try {
    const user = await User.findOne({ username: req.body.username }).select('name username password');

    if (!user) {
      return res.status(401).json({ success: false, msg: 'Authentication failed. User not found.' }); // 401 Unauthorized
    }

    const isMatch = await user.comparePassword(req.body.password); // Use await

    if (isMatch) {
      const userToken = { id: user._id, username: user.username }; // Use user._id (standard Mongoose)
      const token = jwt.sign(userToken, process.env.SECRET_KEY, { expiresIn: '1h' }); // Add expiry to the token (e.g., 1 hour)
      res.json({ success: true, token: 'JWT ' + token });
    } else {
      res.status(401).json({ success: false, msg: 'Authentication failed. Incorrect password.' }); // 401 Unauthorized
    }
  } catch (err) {
    console.error(err); // Log the error
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' }); // 500 Internal Server Error
  }
});

router.route('/movies')
    .get(authJwtController.isAuthenticated, async (req, res) => {
        return res.status(500).json({ success: false, message: 'GET request not supported' });
    })
    .post(authJwtController.isAuthenticated, async (req, res) => {
        return res.status(500).json({ success: false, message: 'POST request not supported' });
    });

// Users CRUD Operations-------------------------------------------------------------------------------------------------------------------------
// GET all users
router.get('/users', authJwtController.isAuthenticated, async (req, res) => {
  try {
    const users = await User.find();  // Fetch all users from MongoDB
    res.json(users);  // Send the users in the response
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

// POST create a new user (already in your signup route)
router.post('/signup', async (req, res) => {
  if (!req.body.username || !req.body.password) {
    return res.status(400).json({ success: false, msg: 'Please include both username and password to signup.' });
  }

  try {
    const user = new User({
      name: req.body.name,
      username: req.body.username,
      password: req.body.password,
    });

    await user.save();
    res.status(201).json({ success: true, msg: 'Successfully created new user.' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A user with that username already exists.' });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' });
  }
});

// PUT update a user by ID
router.put('/users/:id', authJwtController.isAuthenticated, async (req, res) => {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ success: false, message: 'User must have a name, username, and password.' });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { name, username, password },
      { new: true }  // Return the updated user
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json(updatedUser);  // Return the updated user
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});


// DELETE a user by ID
router.delete('/users/:id', authJwtController.isAuthenticated, async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);

    if (!deletedUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to delete user.' });
  }
});

// Movies CRUD Operations------------------------------------------------------------------------------------------------------------------------
// GET all movies
router.get('/movies', authJwtController.isAuthenticated, async (req, res) => {
  try {
    if (req.query.reviews === 'true') {
      // If reviews=true, run the aggregation
      const aggregate = [
        {
          $lookup: {
            from: 'reviews',
            localField: '_id',
            foreignField: 'movieId',
            as: 'movieReviews'
          }
        },
        {
          $addFields: {
            avgRating: { $avg: '$movieReviews.rating' }
          }
        },
        {
          $sort: { avgRating: -1 }
        }
      ];

      const movies = await Movie.aggregate(aggregate);
      res.json(movies);

    } else {
      // Otherwise, just return normal movie list
      const movies = await Movie.find();
      res.json(movies);
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch movies.' });
  }
});


// POST a new movie
router.post('/movies', authJwtController.isAuthenticated, async (req, res) => {
  const { title, actors } = req.body;

  if (!title || !actors || actors.length === 0) {
      return res.status(400).json({ success: false, message: 'Movie must have a title and at least one actor.' });
  }

  try {
      const newMovie = new Movie({
          title,
          actors
      });

      await newMovie.save();  // Save the movie in MongoDB

      res.status(201).json(newMovie);  // Return the created movie
  } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Failed to create movie.' });
  }
});

// PUT update a movie by ID
router.get('/movies/:id', authJwtController.isAuthenticated, async (req, res) => {
  try {
    const movieId = mongoose.Types.ObjectId(req.params.id);

    const aggregate = [
      { $match: { _id: movieId } },
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'movieId',
          as: 'movieReviews'
        }
      },
      {
        $addFields: {
          avgRating: { $avg: '$movieReviews.rating' }
        }
      }
    ];

    const movie = await Movie.aggregate(aggregate);
    if (!movie || movie.length === 0) {
      return res.status(404).json({ success: false, message: 'Movie not found.' });
    }

    res.json(movie[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch movie details.' });
  }
});

// DELETE a movie by ID
router.delete('/movies/:id', authJwtController.isAuthenticated, async (req, res) => {
  try {
      const deletedMovie = await Movie.findByIdAndDelete(req.params.id);

      if (!deletedMovie) {
          return res.status(404).json({ success: false, message: 'Movie not found.' });
      }

      res.json({ success: true, message: 'Movie deleted.' });
  } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Failed to delete movie.' });
  }
});


app.use('/', router);

const PORT = process.env.PORT || 8080; // Define PORT before using it
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // for testing only
