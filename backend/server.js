import 'dotenv/config';
import app from './app.js';
import initDb from './src/config/initDb.js';

const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        await initDb();
        app.listen(PORT, () => {
            console.log(`Backend running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to initialize database and start server:', error);
        process.exit(1);
    }
}

startServer();