import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';
import { hashPassword } from '../utils/authUtils.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Details for connecting to the database
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

        // Create database if it does not exist
        await bootstrapConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
        console.log(`Database '${dbName}' checked/created.`);

        // Use the created database
        await bootstrapConnection.query(`USE \`${dbName}\`;`);

        // Run schema SQL statements to create tables if they don't exist
        const schemaPath = path.resolve(process.cwd(), '../db/schema.sql');

        if (!fs.existsSync(schemaPath)) {
            throw new Error(`schema.sql could not be found. Checked path:\n${schemaPath}`);
        }

        console.log(`Applying schema from: ${schemaPath}`);
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        await bootstrapConnection.query(schemaSql);
        console.log('Tables checked/created successfully.');

        // Seed default admin user from environment variables if not exists
        const adminEmail = process.env.admin_email || 'admin@example.com';
        const [existingAdmin] = await bootstrapConnection.query(
            'SELECT user_id FROM users WHERE email = ? LIMIT 1',
            [adminEmail]
        );

        if (existingAdmin.length === 0) {
            const adminFirstName = process.env.admin_first_name || 'Admin';
            const adminLastName = process.env.admin_las_name || process.env.admin_last_name || 'Test';
            const adminRole = process.env.admin_role || 'admin';
            const adminPassword = process.env.admin_password || process.env.ADMIN_PASSWORD || 'Admin@123';
            const hashedPassword = await hashPassword(adminPassword);

            await bootstrapConnection.query(
                'INSERT INTO users (first_name, last_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
                [adminFirstName, adminLastName, adminEmail, hashedPassword, adminRole]
            );
            console.log(`Admin user '${adminEmail}' created successfully.`);
        } else {
            console.log(`Admin user '${adminEmail}' already exists.`);
        }

        // Test pool connection
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
