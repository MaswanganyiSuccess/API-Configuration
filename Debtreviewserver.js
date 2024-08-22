require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const { body, validationResult } = require('express-validator');
const winston = require('winston');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: path.join(__dirname, 'combined.log') })
    ]
});

// Database connection
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

connection.connect(err => {
    if (err) {
        logger.error('Database connection error: ' + err.stack);
        return;
    }
    logger.info('Connected to database.');
});

// Middleware
app.use(bodyParser.json());

// Swagger documentation setup
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Debt Review API',
            version: '1.0.0',
            description: 'API for managing debt review clients',
        },
        servers: [
            {
                url: `http://localhost:${port}`,
            },
        ],
    },
    apis: [path.join(__dirname, 'Debtreviewserver.js')],
};

const specs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// API Endpoints

/**
 * @openapi
 * /api/clients/add:
 *   post:
 *     summary: Add a new client
 *     description: This endpoint allows you to add a new client to the database.
 *     requestBody:
 *       description: Client object that needs to be added.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - name
 *               - surname
 *               - phone_number
 *               - id_number
 *               - email
 *             properties:
 *               title:
 *                 type: string
 *                 example: Mr.
 *               name:
 *                 type: string
 *                 example: John
 *               surname:
 *                 type: string
 *                 example: Doe
 *               phone_number:
 *                 type: string
 *                 example: "+27123456789"
 *               id_number:
 *                 type: string
 *                 example: "1234567890123"
 *               email:
 *                 type: string
 *                 example: "john.doe@example.com"
 *               notes:
 *                 type: string
 *                 example: "Client prefers to be contacted in the evening."
 *               optindate:
 *                 type: string
 *                 format: date
 *                 example: "2024-07-31"
 *               preferred_time:
 *                 type: string
 *                 format: time
 *                 example: "18:00:00"
 *               offerID:
 *                 type: string
 *                 example: "Offer123"
 *     responses:
 *       201:
 *         description: Client added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 1
 *                 response:
 *                   type: string
 *                   example: OK
 *                 info:
 *                   type: array
 *                   items:
 *                     type: object
 *                 leadId:
 *                   type: integer
 *                   example: 101
 *                 processTime:
 *                   type: integer
 *                   example: 0
 *                 timestamp:
 *                   type: string
 *                   example: "2024-07-31T12:59:15.607Z"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: -5
 *                 response:
 *                   type: string
 *                   example: Validation error
 *                 info:
 *                   type: array
 *                   items:
 *                     type: object
 *                 leadId:
 *                   type: null
 *                 processTime:
 *                   type: integer
 *                   example: 0
 *                 timestamp:
 *                   type: string
 *                   example: "2024-07-31T12:59:15.607Z"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: -100
 *                 response:
 *                   type: string
 *                   example: Internal error
 *                 info:
 *                   type: object
 *                   properties:
 *                     error:
 *                       type: string
 *                       example: Database error
 *                 leadId:
 *                   type: null
 *                 processTime:
 *                   type: integer
 *                   example: 0
 *                 timestamp:
 *                   type: string
 *                   example: "2024-07-31T12:59:15.607Z"
 */
app.post('/api/clients/add', [
    body('title').notEmpty().withMessage('Title is required'),
    body('name').notEmpty().withMessage('Name is required'),
    body('surname').notEmpty().withMessage('Surname is required'),
    body('phone_number').isMobilePhone().withMessage('Invalid phone number'),
    body('id_number').isLength({ min: 13, max: 13 }).withMessage('ID number must be 13 digits'),
    body('email').isEmail().withMessage('Invalid email'),
    body('optindate').optional().isISO8601().withMessage('Invalid opt-in date'),
    body('preferred_time').optional().matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/).withMessage('Invalid preferred time format'),
    body('offerID').optional().isString().withMessage('OfferID must be a string')
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            code: -5,
            response: 'Validation error',
            info: errors.array(),
            leadId: null,
            processTime: 0,
            timestamp: new Date().toISOString()
        });
    }

    const { title, name, surname, phone_number, id_number, email, notes, optindate, preferred_time, offerID } = req.body;

    const checkQuery = 'SELECT * FROM clients WHERE phone_number = ?';
    connection.query(checkQuery, [phone_number], (err, results) => {
        if (err) {
            return res.status(500).json({
                code: -100,
                response: 'Internal error',
                info: { error: 'Database error' },
                leadId: null,
                processTime: 0,
                timestamp: new Date().toISOString()
            });
        }
        if (results.length > 0) {
            return res.status(400).json({
                code: -2,
                response: 'Invalid Lead',
                description: 'Duplicate',
                leadId: null,
                processTime: 0,
                timestamp: new Date().toISOString()
            });
        }

        const query = `INSERT INTO clients (title, name, surname, phone_number, id_number, email, notes, optindate, preferred_time, offerID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        connection.query(query, [title, name, surname, phone_number, id_number, email, notes, optindate, preferred_time, offerID], (err, results) => {
            let response = {
                code: 1,
                response: 'OK',
                info: [],
                leadId: null,
                processTime: 0,
                timestamp: new Date().toISOString()
            };

            if (err) {
                response = {
                    code: -100,
                    response: 'Internal error',
                    info: { error: 'Database error' },
                    leadId: null,
                    processTime: 0,
                    timestamp: new Date().toISOString()
                };
            } else {
                response.leadId = results.insertId;
            }

            res.status(response.code === 1 ? 201 : 400).json(response);
        });
    });
});

/**
 * @openapi
 * /api/clients/export:
 *   get:
 *     summary: Export all clients to CSV
 *     description: This endpoint allows you to export all clients from the database to a CSV file.
 *     responses:
 *       200:
 *         description: CSV file containing all clients
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               example: |
 *                 Title,Name,Surname,Phone Number,ID Number,Email,Notes,Opt-in Date,Preferred Time,Offer ID
 *                 Mr.,John,Doe,+27123456789,1234567890123,john.doe@example.com,"Client prefers to be contacted in the evening.",2024-07-31,18:00:00,Offer123
 *       500:
 *         description: Internal error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: -100
 *                 response:
 *                   type: string
 *                   example: Internal error
 *                 info:
 *                   type: object
 *                   properties:
 *                     error:
 *                       type: string
 *                       example: CSV writing error
 *                 leadId:
 *                   type: null
 *                 processTime:
 *                   type: integer
 *                   example: 0
 *                 timestamp:
 *                   type: string
 *                   example: "2024-07-31T12:59:15.607Z"
 */
const csvWriter = createObjectCsvWriter({
    path: path.join(__dirname, 'clients.csv'),
    header: [
        { id: 'title', title: 'Title' },
        { id: 'name', title: 'Name' },
        { id: 'surname', title: 'Surname' },
        { id: 'phone_number', title: 'Phone Number' },
        { id: 'id_number', title: 'ID Number' },
        { id: 'email', title: 'Email' },
        { id: 'notes', title: 'Notes' },
        { id: 'optindate', title: 'Opt-in Date' },
        { id: 'preferred_time', title: 'Preferred Time' },
        { id: 'offerID', title: 'Offer ID' }
    ]
});

app.get('/api/clients/export', (req, res) => {
    connection.query('SELECT * FROM clients', (err, rows) => {
        if (err) {
            logger.error('Error fetching clients: ' + err.stack);
            return res.status(500).json({
                code: -100,
                response: 'Internal error',
                info: { error: 'Database error' },
                leadId: null,
                processTime: 0,
                timestamp: new Date().toISOString()
            });
        }

        csvWriter.writeRecords(rows)
            .then(() => {
                res.download(path.join(__dirname, 'clients.csv'), 'clients.csv');
            })
            .catch(error => {
                logger.error('Error writing CSV file: ' + error.message);
                res.status(500).json({
                    code: -100,
                    response: 'Internal error',
                    info: { error: 'CSV writing error' },
                    leadId: null,
                    processTime: 0,
                    timestamp: new Date().toISOString()
                });
            });
    });
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    logger.info(`Server is running on http://localhost:${port}`);
});
