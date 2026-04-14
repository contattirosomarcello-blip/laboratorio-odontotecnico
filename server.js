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
        console.log("Inoltro richiesta a Google Sheets...");
        const response = await axios.post(GAS_URL, new URLSearchParams(req.body).toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.json(response.data);
    } catch (error) {
        console.error("Errore proxy:", error.message);
        res.status(500).json({ status: 'error', message: 'Errore di comunicazione con il database.' });
    }
});

app.post('/api/telegram-webhook', async (req, res) => {
    try {
        console.log("Ricevuto callback da Telegram, inoltro a Google...");
        await axios.post(GAS_URL, req.body);
        res.status(200).send('OK');
    } catch (error) {
        console.error("Errore Telegram bridge:", error.message);
        res.status(500).send('Error');
    }
});

app.get('/', (req, res) => {
    res.send('Backend Laboratorio Roso Marcello attivo.');
});

app.listen(PORT, () => {
    console.log(`Server bridge attivo sulla porta ${PORT}`);
});