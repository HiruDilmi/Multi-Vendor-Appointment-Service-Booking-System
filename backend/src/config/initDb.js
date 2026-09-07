import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically creates the database if it doesn't exist,
const initDb = async () => {
    const host = process.env.DB_HOST || 'localhost';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const port = Number(process.env.DB_PORT) || 3306;
    const dbName = process.env.DB_NAME || 'appointX';

    let bootstrapConnection;
    try {
        console.log(`Connecting to MySQL server at ${host}:${port}...`);

        // Connect to MySQL server without specifying a database
        bootstrapConnection = await mysql.createConnection({
            host,
            user,
            password,
            port,
            multipleStatements: true,
        });

        // 1. Create database if it does not exist
        await bootstrapConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
        console.log(`Database '${dbName}' checked/created.`);

        // 2. Switch to the target database
        await bootstrapConnection.query(`USE \`${dbName}\`;`);

        // 3. Find schema.sql file
        const candidatePaths = [
            path.resolve(__dirname, '../../../../db/schema.sql'),
            path.resolve(process.cwd(), '../../db/schema.sql'),
            path.resolve(process.cwd(), '../db/schema.sql'),
            path.resolve(process.cwd(), 'db/schema.sql'),
        ];

        const schemaPath = candidatePaths.find((p) => fs.existsSync(p));

        if (!schemaPath) {
            throw new Error(
                `schema.sql could not be found. Checked paths:\n${candidatePaths.join('\n')}`
            );
        }

        console.log(`Applying schema from: ${schemaPath}`);
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        // 4. Run schema SQL statements to create tables if they don't exist
        await bootstrapConnection.query(schemaSql);
        console.log('Tables checked/created successfully.');

        // 5. Test pool connection
        const connection = await pool.getConnection();
        connection.release();
        console.log(`Application database pool connected to '${dbName}' successfully.`);
    } catch (error) {
        console.error('Error during database initialization:', error.message);
        throw error;
    } finally {
        if (bootstrapConnection) {
            await bootstrapConnection.end();
        }
    }
};

export default initDb;
