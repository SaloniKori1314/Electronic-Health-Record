const express = require("express");
const cors    = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path    = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// ── CONNECT DATABASE ──
const db = new sqlite3.Database(path.join(__dirname, "healthvault.db"), (err) => {
  if (err) { console.error("DB error:", err.message); process.exit(1); }
  console.log("✅ SQLite database ready: healthvault.db");
});

// ── HELPERS ──
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ── CREATE TABLES ──
db.serialize(() => {

  // Users table for authentication
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname   TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    age        TEXT,
    role       TEXT DEFAULT 'patient',
    condition  TEXT,
    allergies  TEXT,
    emergency  TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS records (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT,
    age          TEXT,
    gender       TEXT,
    date         TEXT,
    doctor       TEXT,
    hospital     TEXT,
    symptoms     TEXT,
    diagnosis    TEXT,
    prescription TEXT,
    notes        TEXT,
    medicine     TEXT,
    dosage       TEXT,
    duration     TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    patient    TEXT,
    title      TEXT,
    date       TEXT,
    time       TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS feedback (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    rating     INTEGER,
    category   TEXT,
    message    TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
});

// ── AUTH: REGISTER ──
app.post("/register", async (req, res) => {
  try {
    const { fullname, email, password, age, role, condition, allergies, emergency } = req.body;

    // Server-side validation
    if (!fullname || fullname.trim().length < 2)
      return res.status(400).json({ error: "Full name must be at least 2 characters." });

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Please enter a valid email address." });

    if (!password || password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters." });

    // Check if email already registered
    const existing = await get("SELECT id FROM users WHERE email = ?", [email.toLowerCase()]);
    if (existing)
      return res.status(409).json({ error: "An account with this email already exists. Please log in." });

    await run(
      `INSERT INTO users (fullname,email,password,age,role,condition,allergies,emergency)
       VALUES (?,?,?,?,?,?,?,?)`,
      [fullname.trim(), email.toLowerCase(), password, age, role || "patient", condition, allergies, emergency]
    );

    res.json({ message: "Account created successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AUTH: LOGIN ──
app.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required." });

    const user = await get("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);

    if (!user)
      return res.status(404).json({ error: "No account found with this email. Please create an account first." });

    if (user.password !== password)
      return res.status(401).json({ error: "Incorrect password. Please try again." });

    if (user.role !== role)
      return res.status(403).json({ error: `This account is registered as a ${user.role}, not a ${role}.` });

    // Return safe user info (never return password)
    res.json({
      message: "Login successful",
      user: { id: user.id, fullname: user.fullname, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RECORDS ──
app.get("/records", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM records ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/add", async (req, res) => {
  try {
    const r = req.body;
    const result = await run(
      `INSERT INTO records (name,age,gender,date,doctor,hospital,symptoms,diagnosis,prescription,notes,medicine,dosage,duration)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.name,r.age,r.gender,r.date,r.doctor,r.hospital,r.symptoms,r.diagnosis,r.prescription,r.notes,r.medicine,r.dosage,r.duration]
    );
    res.json({ message: "Record Added", id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/records/:id", async (req, res) => {
  try {
    await run("DELETE FROM records WHERE id = ?", [req.params.id]);
    res.json({ message: "Record Deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── APPOINTMENTS ──
app.get("/appointments", async (req, res) => {
  try {
    const { patient } = req.query;
    const rows = patient
      ? await all("SELECT * FROM appointments WHERE patient = ? ORDER BY date ASC", [patient])
      : await all("SELECT * FROM appointments ORDER BY date ASC");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/appointments", async (req, res) => {
  try {
    const { patient, title, date, time } = req.body;
    const result = await run(
      "INSERT INTO appointments (patient,title,date,time) VALUES (?,?,?,?)",
      [patient, title, date, time]
    );
    res.json({ message: "Appointment Added", id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/appointments/:id", async (req, res) => {
  try {
    await run("DELETE FROM appointments WHERE id = ?", [req.params.id]);
    res.json({ message: "Appointment Deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FEEDBACK ──
app.get("/feedback", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM feedback ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/feedback", async (req, res) => {
  try {
    const { rating, category, message } = req.body;
    const result = await run(
      "INSERT INTO feedback (rating,category,message) VALUES (?,?,?)",
      [rating, category, message]
    );
    res.json({ message: "Feedback Saved", id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── START ──
app.listen(3000, () => {
  console.log("🚀 HealthVault server running at http://localhost:3000");
  console.log("   Database: healthvault.db");
});