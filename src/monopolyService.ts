import express from 'express';
import { Client } from 'pg';
import cors from 'cors';
import 'dotenv/config';

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Set up PostgreSQL client
const db = new Client({
  // Use DATABASE_URL from Azure environment variables
  // It should have been set by Azure, but if not,
  // we'll try to build it from the other DB_ variables.
  connectionString:
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_SERVER}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`,
  ssl: { rejectUnauthorized: false }, // Required for Azure connections
});

// Middleware
app.use(cors());
app.use(express.json());

// --- DATABASE SETUP SCRIPT ---
// This function runs once on server startup to create/reset the tables
const setupDatabase = async () => {
  const sqlScript = `
    -- Drop tables in reverse order of dependency
    DROP TABLE IF EXISTS PlayerGame;
    DROP TABLE IF EXISTS Game;
    DROP TABLE IF EXISTS Player;

    -- Player table
    CREATE TABLE Player (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE
    );

    -- Game table
    CREATE TABLE Game (
        id SERIAL PRIMARY KEY,
        time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- PlayerGame join table
    CREATE TABLE PlayerGame (
        gameID INTEGER REFERENCES Game(id) ON DELETE CASCADE,
        playerID INTEGER REFERENCES Player(id) ON DELETE CASCADE,
        score INTEGER,
        PRIMARY KEY (gameID, playerID)
    );

    -- --- SAMPLE DATA ---

    -- Insert sample players
    INSERT INTO Player (name, email) VALUES
    ('Sebastian', 'seb@example.com'),
    ('Mr. Monopoly', 'moneybags@example.com'),
    ('Thimble', 'thimble@example.com');

    -- Insert sample game 1
    INSERT INTO Game (time) VALUES (NOW() - INTERVAL '2 days');
    INSERT INTO PlayerGame (gameID, playerID, score) VALUES
    (1, 1, 1500),
    (1, 2, 2500);

    -- Insert sample game 2
    INSERT INTO Game (time) VALUES (NOW() - INTERVAL '1 day');
    INSERT INTO PlayerGame (gameID, playerID, score) VALUES
    (2, 1, 3200),
    (2, 2, 1800),
    (2, 3, 500);

    -- Insert sample game 3
    INSERT INTO Game (time) VALUES (NOW());
    INSERT INTO PlayerGame (gameID, playerID, score) VALUES
    (3, 2, 5000),
    (3, 3, 4500);
  `;

  try {
    await db.query(sqlScript);
    console.log('Database schema and sample data initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err; // Stop the server from starting if this fails
  }
};

// --- Original Player Endpoints ---

app.get('/', (req, res) => {
  res.send('Hello, CS 262 Monopoly service!');
});

app.get('/players', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM Player ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/players/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('SELECT * FROM Player WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
    } else {
      res.json(result.rows[0]);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/players/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result =
      await db.query('DELETE FROM Player WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
    } else {
      res.json({ message: 'Player deleted successfully', player: result.rows[0] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- NEW HOMEWORK 3 GAME ENDPOINTS ---

app.get('/games', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM Game ORDER BY time DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/games/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT P.name, PG.score
      FROM Player P
      JOIN PlayerGame PG ON P.id = PG.playerID
      WHERE PG.gameID = $1
      ORDER BY PG.score DESC
    `;
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      const gameExists = await db.query('SELECT * FROM Game WHERE id = $1', [id]);
      if (gameExists.rows.length === 0) {
        res.status(404).json({ error: 'Game not found' });
      } else {
        res.json([]); // Return empty list if game exists but has no players
      }
    } else {
      res.json(result.rows);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/games/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // The ON DELETE CASCADE in the schema will handle deleting from PlayerGame
    const result =
      await db.query('DELETE FROM Game WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Game not found' });
    } else {
      res.json({ message: 'Game deleted successfully', game: result.rows[0] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- START THE SERVER ---
// We connect to the DB, then set up the schema, THEN start the app
db.connect()
  .then(async () => {
    console.log('Database connected');
    await setupDatabase(); // Run our new database setup function
    app.listen(port, () => {
      // Start the app *after* the DB is ready
      console.log(`Monopoly service listening at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Database connection error:', err);
    process.exit(1); // Exit if DB connection fails
  });
