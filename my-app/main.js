const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();

// PostgreSQL configuration
const pool = new Pool({
    user: 'postgres', // default PostgreSQL user
    host: 'localhost',
    database: 'franchise',
    password: 'root', // change to your PostgreSQL password
    port: 5432,
});

// Initialize database table
async function initializeDatabase() {
    try {
        // Check if PostGIS extension exists
        await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');

        // Create location_data table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS location_data (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                address TEXT,
                lat DECIMAL(10, 6) NOT NULL,
                lng DECIMAL(10, 6) NOT NULL,
                status VARCHAR(50) NOT NULL,
                geom GEOMETRY(Point, 4326),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS miles (
                id SERIAL PRIMARY KEY,
                mile INTEGER NOT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
            `);
        console.log('Database table initialized successfully');
    } catch (err) {
        console.error('Error initializing database:', err);
        process.exit(1); // Exit if we can't set up the database
    }
}

// Call the initialization function
initializeDatabase();

// Middleware for parsing JSON
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/map', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'map.html'));
});

// Check feasibility
app.get('/feasibility', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'FishibleCheck.html'));
});

app.get('/setting', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'setting.html'));
});


// API Routes
app.get('/api/locations', async (req, res) => {
    try {
        const query = `
            SELECT 
                id, 
                name, 
                address, 
                lat, 
                lng, 
                status, 
                ST_X(geom::geometry) as lng, 
                ST_Y(geom::geometry) as lat,
                created_at
            FROM location_data
            ORDER BY created_at DESC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error in /api/locations (GET):', err);
        res.status(500).json({ error: 'Error fetching location data from the database in /api/locations (GET)' });
    }
});

app.post('/api/locations', async (req, res) => {
    const { name, address, lat, lng, status } = req.body;

    if (!name || !address || !lat || !lng || !status) {
        return res.status(400).json({ error: 'All fields (name, address, lat, lng, status) are required in /api/locations (POST)' });
    }

    try {
        const query = `
            INSERT INTO location_data 
                (name, address, lat, lng, status, geom, created_at)
            VALUES 
                ($1, $2, $3::numeric, $4::numeric, $5, ST_SetSRID(ST_MakePoint($4::numeric, $3::numeric), 4326), CURRENT_TIMESTAMP)
            RETURNING 
                id, name, address, lat, lng, status, 
                ST_X(geom::geometry) as lng, 
                ST_Y(geom::geometry) as lat,
                created_at
        `;
        const values = [
            name,
            address,
            parseFloat(lat),
            parseFloat(lng),
            status
        ];
        const { rows } = await pool.query(query, values);

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Error in /api/locations (POST):', err);
        res.status(500).json({ error: 'Error adding new location to the database in /api/locations (POST)', details: err.message });
    }
});

// Miles 
app.post('/api/miles', async (req, res) => {
    const { mile } = req.body;

    try {
        const query = `
            INSERT INTO miles (mile, created_at) VALUES ($1, CURRENT_TIMESTAMP) RETURNING id, mile, created_at
        `;
        const values = [
            mile
        ];
        const { rows } = await pool.query(query, values);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.log('Error in /api/miles (POST):', error);
        res.status(500).json({ error: 'Error adding a miles in to the database in /api/miles (POST)', details: error.message });
    }
});

app.get('', async (req, res) => {
    try{
        
    }catch{
        
    }
});

// app.get('/api/locations/searchByName', async (req, res) => {
//     const { address } = req.query;

//     if (!address) {
//         return res.status(400).json({ error: 'Name query parameter is required for search in /api/locations/searchByName (GET)' });
//     }

//     try {
//         const query = `
//             SELECT 
//           *
//             FROM location_data
//             WHERE address ILIKE '%' || $1
//             ORDER BY created_at DESC
//         `;
//         const { rows } = await pool.query(query, [address]);
//         res.json(rows);
//         console.log(rows);
//     } catch (err) {
//         console.error('Error in /api/locations/searchByName (GET):', err);
//         res.status(500).json({ error: `${err} Error searching locations by address in the database in /api/locations/searchByName (GET)` });
//     }
// });

app.get('/api/locations/nearby', async (req, res) => {
    const { lat, lng, distance = 5 } = req.query;

    try {
        const query = `
            SELECT * FROM location_data
            WHERE ST_DWithin(
                geography(ST_MakePoint($1, $2)),
                geography(ST_MakePoint(lng, lat)),
                $3 * 1609.34  -- Convert miles to meters
            )
        `;
        const { rows } = await pool.query(query, [lng, lat, distance]);
        res.json(rows);
    } catch (err) {
        console.log('Error for check feasiblity');
        res.status(500).json({ err: 'error in feasiblity route' });
    }
});


// Get single location by ID
app.get('/api/locations/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT 
                id, 
                name, 
                address, 
                lat, 
                lng, 
                status, 
                ST_X(geom::geometry) as lng, 
                ST_Y(geom::geometry) as lat,
                created_at
            FROM location_data
            WHERE id = $1
        `;
        const { rows } = await pool.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Location not found with the provided ID in /api/locations/:id (GET)' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Error in /api/locations/:id (GET):', err);
        res.status(500).json({ error: 'Error fetching location data from the database in /api/locations/:id (GET)' });
    }
});

app.put('/api/locations/:id', async (req, res) => {
    const { id } = req.params;
    const { name, address, lat, lng, status } = req.body;

    try {
        const query = `
            UPDATE location_data
            SET 
                name = COALESCE($1, name),
                address = COALESCE($2, address),
                lat = COALESCE($3, lat),
                lng = COALESCE($4, lng),
                status = COALESCE($5, status),
                geom = ST_SetSRID(ST_MakePoint(COALESCE($4, lng), COALESCE($3, lat)), 4326)
            WHERE id = $6
            RETURNING 
                id, name, address, lat, lng, status, 
                ST_X(geom::geometry) as lng, 
                ST_Y(geom::geometry) as lat,
                created_at
        `;
        const values = [name, address, lat, lng, status, id];
        const { rows } = await pool.query(query, values);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Location not found with the provided ID in /api/locations/:id (PUT)' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Error in /api/locations/:id (PUT):', err);
        res.status(500).json({ error: 'Error updating location data in the database in /api/locations/:id (PUT)', details: err.message });
    }
});

app.delete('/api/locations/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const query = 'DELETE FROM location_data WHERE id = $1 RETURNING id';
        const { rows } = await pool.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Location not found with the provided ID in /api/locations/:id (DELETE)' });
        }

        res.json({ message: 'Location deleted successfully in /api/locations/:id (DELETE)' });
    } catch (err) {
        console.error('Error in /api/locations/:id (DELETE):', err);
        res.status(500).json({ error: 'Error deleting location data from the database in /api/locations/:id (DELETE)' });
    }
});



// Start the server
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Binds to all network interfaces

app.listen(PORT, HOST, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Accessible on local network at http://${getLocalIP()}:${PORT}`);
});

const os = require('os');
const { error } = require('console');

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}
;