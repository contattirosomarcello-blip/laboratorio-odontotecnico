const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
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

        console.log(`[${new Date().toISOString()}] Telegram Webhook ricevuto:`, JSON.stringify(req.body).substring(0, 100) + "...");
        
        // Inoltro critico a Google Apps Script
        const response = await axios.post(GAS_URL, req.body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        console.log("Risposta da Google Apps Script:", JSON.stringify(response.data));
        
        // Rispondiamo sempre 200 OK a Telegram per evitare che riprovi all'infinito
        res.status(200).send('OK'); 
    } catch (error) {
        const errorDetail = error.response ? `Status: ${error.response.status} - Data: ${JSON.stringify(error.response.data)}` : error.message;
        console.error(`[${new Date().toISOString()}] Errore nel bridge Telegram:`, errorDetail);
        res.status(200).send('OK'); 
    }
});

app.get('/', (req, res) => {
    res.send('Backend Laboratorio Roso Marcello attivo.');
});

app.listen(PORT, () => {
    console.log(`Server bridge attivo sulla porta ${PORT}`);
});