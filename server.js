const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize SQLite database
const db = new sqlite3.Database('./quran_tracker.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS readers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reader_id INTEGER,
            day_number INTEGER,
            completed BOOLEAN DEFAULT 0,
            FOREIGN KEY (reader_id) REFERENCES readers(id) ON DELETE CASCADE
        )
    `);
}

// Get all readers with their progress
app.get('/api/readers', (req, res) => {
    db.all('SELECT * FROM readers ORDER BY created_at ASC', [], (err, readers) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const readerIds = readers.map(r => r.id);
        if (readerIds.length === 0) {
            return res.json([]);
        }
        
        db.all('SELECT * FROM progress WHERE reader_id IN (' + readerIds.join(',') + ')', [], (err, progress) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const readersWithProgress = readers.map(reader => {
                const readerProgress = progress.filter(p => p.reader_id === reader.id);
                const progressArray = Array(30).fill(false);
                readerProgress.forEach(p => {
                    if (p.day_number >= 1 && p.day_number <= 30) {
                        progressArray[p.day_number - 1] = p.completed === 1;
                    }
                });
                return {
                    id: reader.id,
                    name: reader.name,
                    progress: progressArray
                };
            });
            
            res.json(readersWithProgress);
        });
    });
});

// Add new reader
app.post('/api/readers', (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    db.run('INSERT INTO readers (name) VALUES (?)', [name], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const readerId = this.lastID;
        // Initialize empty progress for 30 days
        const stmt = db.prepare('INSERT INTO progress (reader_id, day_number, completed) VALUES (?, ?, 0)');
        for (let i = 1; i <= 30; i++) {
            stmt.run(readerId, i);
        }
        stmt.finalize();
        
        res.json({
            id: readerId,
            name: name,
            progress: Array(30).fill(false)
        });
    });
});

// Update day progress
app.put('/api/readers/:id/progress/:day', (req, res) => {
    const readerId = req.params.id;
    const dayNumber = req.params.day;
    const { completed } = req.body;
    
    db.run(
        'UPDATE progress SET completed = ? WHERE reader_id = ? AND day_number = ?',
        [completed ? 1 : 0, readerId, dayNumber],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
        }
    );
});

// Delete reader
app.delete('/api/readers/:id', (req, res) => {
    const readerId = req.params.id;
    
    db.run('DELETE FROM readers WHERE id = ?', [readerId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
