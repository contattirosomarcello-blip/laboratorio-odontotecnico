const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

const allowedOrigins = ['https://labodontoroso.it', 'http://127.0.0.1:5500'];
app.use(cors({
    origin: function(origin, callback){
        // Permette richieste senza origin (come postman o test locali)
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1){
            return callback(new Error('Accesso non consentito dalla policy CORS'), false);
        }
        return callback(null, true);
    }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// L'URL della tua Web App di Google Apps Script (impostato nelle Environment Variables di Render)
const GAS_URL = process.env.GAS_URL;

if (!GAS_URL) {
    console.error("ERRORE CRITICO: La variabile d'ambiente GAS_URL non è impostata. Il server non potrà inoltrare le richieste.");
}

app.post('/api/prenotazioni', async (req, res) => {
    try {
        if (!GAS_URL) throw new Error("GAS_URL non configurato nelle variabili d'ambiente.");

        console.log(`[${new Date().toISOString()}] Inoltro richiesta per: ${req.body.name || 'N/A'}`);
        
        const response = await axios.post(GAS_URL, new URLSearchParams(req.body).toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000 // Timeout di 15 secondi per evitare attese infinite
        });

        console.log("Risposta ricevuta da Google Apps Script:", response.data);
        res.json(response.data);
    } catch (error) {
        const errorMsg = error.response ? `GAS Error: ${error.response.status}` : error.message;
        console.error(`[${new Date().toISOString()}] Errore proxy:`, errorMsg);
        res.status(500).json({ status: 'error', message: 'Errore di comunicazione con il database.', detail: errorMsg });
    }
});

app.post('/api/telegram-webhook', async (req, res) => {
    try {
        if (!GAS_URL) throw new Error("GAS_URL non configurato nelle variabili d'ambiente.");

        const timestamp = new Date().toLocaleString('it-IT');
        if (req.body.callback_query) {
            const action = req.body.callback_query.data;
            console.log(`[${timestamp}] Telegram Callback: Azione pulsante ricevuta -> ${action}`);
        } else {
            console.log(`[${timestamp}] Telegram Webhook ricevuto (Messaggio standard)`);
        }
        console.log("Payload ricevuto da Telegram:", JSON.stringify(req.body));
        
        // Inoltro critico a Google Apps Script
        const response = await axios.post(GAS_URL, req.body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        console.log("Risposta da Google Apps Script:", JSON.stringify(response.data));
        
        // Rispondiamo sempre 200 OK a Telegram per evitare che riprovi all'infinito
        res.status(200).send('OK'); 
    } catch (error) {
        const errorDetail = error.response ? `GAS Error: ${error.response.status}` : error.message;
        console.error(`[${new Date().toLocaleString('it-IT')}] Errore nel bridge Telegram:`, errorDetail);
        res.status(200).send('OK'); 
    }
});

app.get('/', (req, res) => {
    res.send('Backend Laboratorio Roso Marcello attivo.');
});

app.listen(PORT, () => {
    console.log(`Server bridge attivo sulla porta ${PORT}`);
});