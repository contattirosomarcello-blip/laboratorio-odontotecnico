const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [
    'https://labodontoroso.it',
    'https://www.labodontoroso.it',
    'http://127.0.0.1:5500'
];
app.use(cors({
    origin: function(origin, callback){
        // Permette richieste senza origin (come postman o test locali)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            console.warn(`CORS origin non autorizzato: ${origin}`);
            return callback(new Error('Accesso non consentito dalla policy CORS'), false);
        }
        return callback(null, true);
    }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// L'URL della tua Web App di Google Apps Script (impostato nelle Environment Variables di Render)
const GAS_URL = process.env.GAS_URL;

app.get('/', (req, res) => {
    res.send('Backend Laboratorio Roso Marcello attivo.');
});

app.listen(PORT, () => {
    console.log(`Server bridge attivo sulla porta ${PORT}`);
});