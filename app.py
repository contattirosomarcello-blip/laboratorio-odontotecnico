from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import requests
import os
import json
import urllib.parse
import re
from dotenv import load_dotenv

load_dotenv()

# Permette di servire i file HTML/JS/CSS direttamente dalla cartella principale per i test
app = Flask(__name__, template_folder='.', static_folder='.', static_url_path='')

# CORS Configuration - Whitelist only trusted origins
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "https://hehetzu.github.io",
    "https://marcello-bot.onrender.com",
    "null",  # Permette i test se apri index.html direttamente come file
    os.environ.get("ALLOWED_ORIGIN", "https://hehetzu.github.io")
]

CORS(app, resources={r"/*": {
    "origins": allowed_origins,
    "methods": ["GET", "POST"],
    "allow_headers": ["Content-Type"]
}})

# Rate Limiter
limiter = Limiter(app=app, key_func=get_remote_address, default_limits=["200 per day", "50 per hour"])

TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
TELEGRAM_SECRET = os.environ.get("TELEGRAM_SECRET", "").strip()
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "").strip()
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "contatti.rosomarcello@gmail.com").strip()
BREVO_ADMIN_RECIPIENT = os.environ.get("BREVO_ADMIN_RECIPIENT", "contatti.rosomarcello@gmail.com").strip()

GOOGLE_SCRIPT_URL = os.environ.get("GOOGLE_SCRIPT_URL", "").strip()
GOOGLE_SCRIPT_SECRET = os.environ.get("GOOGLE_SCRIPT_SECRET", "").strip()

if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
    print("ERRORE CRITICO: Token o Chat ID non trovati!")
    print("   Assicurati di aver creato il file .env nella stessa cartella di app.py")

def is_valid_email(email):
    return re.match(r"[^@]+@[^@]+\.[^@]+", email) is not None

def sanitize_html(text):
    """Sanitize HTML to prevent XSS attacks"""
    if not text:
        return ""
    # Escape HTML special characters
    return (str(text)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#x27;")
            .replace("/", "&#x2F;"))

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

@app.route("/set_webhook", methods=["GET"])
def set_webhook():
    print("Richiesta configurazione Webhook ricevuta...")
    base_url = request.host_url
    if "onrender.com" in base_url:
        base_url = base_url.replace("http://", "https://")
    
    webhook_url = f"{base_url}webhook"
    telegram_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/setWebhook?url={webhook_url}&secret_token={TELEGRAM_SECRET}"
    
    try:
        resp = requests.get(telegram_url)
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/webhook", methods=["POST", "OPTIONS"])
@limiter.limit("30 per minute")
def webhook():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    # VALIDATE TELEGRAM SECRET (inviato da Telegram nell'header X-Telegram-Bot-Api-Secret-Token)
    telegram_header_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    if telegram_header_secret != TELEGRAM_SECRET:
        return {"status": "unauthorized"}, 401

    data = request.json
    if not data:
        return {"status": "ignored", "message": "No JSON data"}, 200

    if "callback_query" in data:
        print(f"CALLBACK_QUERY RICEVUTA! Dati completi: {data}")
        callback = data["callback_query"]
        
        if not TELEGRAM_TOKEN:
            print("ERRORE CRITICO: TELEGRAM_TOKEN non è impostato!")
            return {"status": "error", "message": "Token missing"}, 200
        
        try:
            resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/answerCallbackQuery", json={
                "callback_query_id": callback["id"],
                "text": "Elaborazione..."
            }, timeout=5)
            print(f"answerCallbackQuery risposta: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"Errore nella answerCallbackQuery: {e}")

        chat_id = callback["message"]["chat"]["id"]
        message_id = callback["message"]["message_id"]
        data_str = callback["data"]
        print(f"Callback ricevuta: {data_str} | chat_id: {chat_id} | message_id: {message_id}")

        try:
            action, date_app, time_app = data_str.split("|")
        except ValueError:
            print(f"Errore formato callback data: {data_str}")
            try:
                requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={"chat_id": chat_id, "text": "Errore: Dati del pulsante non validi."})
            except: pass
            return {"status": "error", "message": "Invalid callback data"}, 200
        
        new_status = "Confermato" if action == "confirm" else "Rifiutato"
        emoji = "✅" if action == "confirm" else "❌"

        sheet_success = False
        client_info = {}
        try:
            resp = requests.post(GOOGLE_SCRIPT_URL, data={
                "action": "update_status",
                "date": date_app,
                "time": time_app,
                "status": new_status,
                "secret": GOOGLE_SCRIPT_SECRET
            })
            if resp.status_code == 200:
                sheet_success = True
                try:
                    client_info = resp.json()
                except:
                    pass
        except Exception as e:
            print(f"Errore nell'aggiornamento del foglio: {e}")

        try:
            edit_message = {
                "chat_id": chat_id,
                "message_id": message_id,
                "text": f"{emoji} Appuntamento {new_status.lower()}!",
                "reply_markup": {"inline_keyboard": []}
            }
            resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/editMessageText", json=edit_message, timeout=5)
            print(f"editMessageText risposta: {resp.status_code}")
        except Exception as e:
            print(f"Errore nell'edit del messaggio: {e}")

        if sheet_success:
            try:
                nome = client_info.get("nome", "Cliente")
                email = client_info.get("email", "")
                telefono = client_info.get("telefono", "")
                messaggio = client_info.get("messaggio", "")
                
                if action == "confirm":
                    text = f"🎉 Buone Notizie!\n\nIl tuo appuntamento del {date_app} alle {time_app} è stato confermato!\n\n📅 Data: {date_app}\n🕐 Ora: {time_app}\n👤 Nome: {nome}\n📧 Email: {email}\n📞 Telefono: {telefono}\n\nSe hai domande, contattaci pure!\n\nLaboratorio Odontotecnico Roso Marcello"
                else:
                    text = f"❌ Appuntamento Rifiutato\n\nIl tuo appuntamento del {date_app} alle {time_app} è stato rifiutato.\n\n📅 Data: {date_app}\n🕐 Ora: {time_app}\n👤 Nome: {nome}\n\nContattaci per riprenotare!\n\nLaboratorio Odontotecnico Roso Marcello"
                
                requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                    "chat_id": chat_id,
                    "text": text
                }, timeout=5)
            except Exception as e:
                print(f"Errore nell'invio del messaggio di conferma: {e}")

        return {"status": "processed"}, 200

    if "message" in data:
        message = data["message"]
        chat_id = message["chat"]["id"]
        text = message.get("text", "").strip()
        
        if text.startswith("/start"):
            try:
                keyboard = {"inline_keyboard": [
                    [{"text": "📅 Prenota Appuntamento", "url": "https://hehetzu.github.io/marcello-bot"}], # Aggiorna se il dominio cambia
                    [{"text": "📞 Chiama", "url": "tel:+393381731927"}],
                    [{"text": "💬 WhatsApp", "url": "https://wa.me/393381731927"}]
                ]}
                resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                    "chat_id": chat_id,
                    "text": "👋 Benvenuto nel Bot del Laboratorio Odontotecnico Roso Marcello!\n\nScegli un'opzione:",
                    "reply_markup": keyboard
                }, timeout=5)
                print(f"Messaggio di benvenuto inviato: {resp.status_code}")
            except Exception as e:
                print(f"Errore nell'invio del messaggio di benvenuto: {e}")
        
        elif text.startswith("/help"):
            try:
                resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                    "chat_id": chat_id,
                    "text": "🤖 Comandi disponibili:\n/start - Menu principale\n/help - Questa guida\n/appuntamento - Richiedi appuntamento\n\nOppure usa il sito web per prenotare!"
                }, timeout=5)
            except Exception as e:
                print(f"Errore nell'invio del messaggio help: {e}")
        
        elif text.startswith("/appuntamento"):
            try:
                resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                    "chat_id": chat_id,
                    "text": "📅 Per richiedere un appuntamento, usa il nostro sito web:\n\nhttps://hehetzu.github.io/marcello-bot\n\nOppure contattaci direttamente:\n📞 +39 338 1731927\n💬 WhatsApp: https://wa.me/393381731927"
                }, timeout=5)
            except Exception as e:
                print(f"Errore nell'invio del messaggio appuntamento: {e}")
        
        else:
            try:
                resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                    "chat_id": chat_id,
                    "text": "📝 Per prenotare un appuntamento, usa il pulsante qui sopra o visita il nostro sito web!\n\nLaboratorio Odontotecnico Roso Marcello"
                }, timeout=5)
            except Exception as e:
                print(f"Errore nell'invio del messaggio generico: {e}")

    return {"status": "ok"}, 200

@app.route("/send_email", methods=["POST"])
@limiter.limit("10 per hour")
def send_email():
    if not BREVO_API_KEY:
        return jsonify({"status": "error", "message": "Brevo API Key missing"}), 500

    data = request.json
    # Gestisce sia 'nome' che 'name' per compatibilità con i vari form del frontend
    nome = sanitize_html(data.get("nome") or data.get("name") or "Utente")
    email_cliente = sanitize_html(data.get("email", ""))
    # Gestisce sia 'telefono' che 'phone'
    telefono = sanitize_html(data.get("telefono") or data.get("phone") or "")
    
    if email_cliente and not is_valid_email(email_cliente):
        return jsonify({"status": "error", "message": "Email cliente non valida"}), 400
    
    if not email_cliente and not telefono:
        return jsonify({"status": "error", "message": "Inserire almeno email o telefono"}), 400

    messaggio = sanitize_html(data.get("messaggio", ""))
    data_app = sanitize_html(data.get("data", ""))

    date_row_client = f"<p><strong>Data/Ora preferita:</strong> {data_app}</p>" if data_app else ""
    
    date_row_admin_html = ""
    confirm_btn_html = ""

    if data_app:
        date_row_admin_html = f"""
        <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Data/Ora:</strong></td>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #e74c3c; font-weight: bold;">{data_app}</td>
        </tr>
        """
        
        parts = data_app.strip().split()
        if len(parts) >= 2:
            date_only = parts[0]
            time_only = parts[1]
            base_url = request.host_url
            if "onrender.com" in base_url:
                base_url = base_url.replace("http://", "https://")
            
            params = {"date": date_only, "time": time_only, "email": email_cliente, "name": nome}
            confirm_url = f"{base_url}confirm_from_email?{urllib.parse.urlencode(params)}"
            confirm_btn_html = f'<a href="{confirm_url}" style="background-color: #28a745; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-size: 14px; margin-right: 10px; display: inline-block; font-weight: bold;">✅ Conferma</a>'
    
    request_type_label = "Appuntamento" if data_app else "Preventivo/Info"
    
    header_color = "#28a745" if data_app else "#2c3e50"

    subject_admin = f"Nuova richiesta ({request_type_label}): {nome}"
    
    html_admin = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>{subject_admin}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: {header_color}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">📧 Nuova Richiesta</h1>
            <p style="margin: 5px 0 0 0;">{request_type_label}</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Nome:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #2c3e50; font-weight: bold;">{nome}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Email:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee;">{email_cliente or 'Non fornita'}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Telefono:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee;">{telefono or 'Non fornito'}</td>
                </tr>
                {date_row_admin_html}
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Messaggio:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee;">{messaggio or 'Nessun messaggio'}</td>
                </tr>
            </table>
            
            {confirm_btn_html}
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #7f8c8d; font-size: 12px;">
            <p>Centro Odontoiatrico Dr. Marcello</p>
        </div>
    </body>
    </html>
    """
    
    try:
        brevo_url = "https://api.brevo.com/v3/smtp/email"
        headers = {
            "accept": "application/json",
            "api-key": BREVO_API_KEY,
            "content-type": "application/json"
        }
        
        payload = {
            "sender": {"name": "Laboratorio Roso Marcello", "email": BREVO_SENDER_EMAIL},
            "to": [{"email": BREVO_ADMIN_RECIPIENT}],
            "subject": subject_admin,
            "htmlContent": html_admin
        }
        
        resp = requests.post(brevo_url, json=payload, headers=headers, timeout=10)
        
        if resp.status_code == 201:
            print(f"Email admin inviata con successo a {BREVO_ADMIN_RECIPIENT}")
            
            # Invia email di conferma al cliente se ha fornito l'email
            if email_cliente:
                subject_client = f"Conferma richiesta {request_type_label} - Laboratorio Roso Marcello"
                
                html_client = f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>{subject_client}</title>
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0;">✅ Richiesta Ricevuta</h1>
                        <p style="margin: 5px 0 0 0;">Grazie per averci contattato!</p>
                    </div>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
                        <p>Ciao <strong>{nome}</strong>,</p>
                        <p>Abbiamo ricevuto la tua richiesta di {request_type_label.lower()} e ti contatteremo al più presto possibile.</p>
                        
                        <div style="background-color: white; padding: 15px; border-radius: 4px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #2c3e50;">Riepilogo della tua richiesta:</h3>
                            <p><strong>Nome:</strong> {nome}</p>
                            <p><strong>Email:</strong> {email_cliente}</p>
                            <p><strong>Telefono:</strong> {telefono or 'Non fornito'}</p>
                            {date_row_client}
                            <p><strong>Messaggio:</strong> {messaggio or 'Nessun messaggio'}</p>
                        </div>
                        
                        <p>Se hai urgenza, puoi contattarci direttamente:</p>
                        <p>📞 Telefono: +39 338 1731927<br>
                        💬 WhatsApp: <a href="https://wa.me/393381731927">+39 338 1731927</a></p>
                        
                        <p style="color: #7f8c8d; font-size: 14px;">Laboratorio Odontotecnico Roso Marcello</p>
                    </div>
                </body>
                </html>
                """
                
                payload_client = {
                    "sender": {"name": "Laboratorio Roso Marcello", "email": BREVO_SENDER_EMAIL},
                    "to": [{"email": email_cliente}],
                    "subject": subject_client,
                    "htmlContent": html_client
                }
                
                resp_client = requests.post(brevo_url, json=payload_client, headers=headers, timeout=10)
                if resp_client.status_code == 201:
                    print(f"Email cliente inviata con successo a {email_cliente}")
                else:
                    print(f"Errore invio email cliente: {resp_client.status_code} - {resp_client.text}")
            
            # Salva nel Google Sheet
            try:
                sheet_data = {
                    "action": "add_request",
                    "name": nome,
                    "email": email_cliente,
                    "telefono": telefono,
                    "message": messaggio,
                    "tipo_richiesta": "appuntamento" if data_app else "preventivo"
                }
                
                if data_app:
                    # Se è un appuntamento, estrai data e ora
                    parts = data_app.strip().split()
                    if len(parts) >= 2:
                        sheet_data["data_appuntamento"] = parts[0]
                        sheet_data["ora_appuntamento"] = parts[1]
                
                # Aggiungi il secret per l'autenticazione
                sheet_data["secret"] = GOOGLE_SCRIPT_SECRET
                
                resp_sheet = requests.post(GOOGLE_SCRIPT_URL, data=sheet_data, timeout=10)
                if resp_sheet.status_code == 200:
                    print("Dati salvati nel Google Sheet")
                    
                    # Invia notifica Telegram all'amministratore
                    try:
                        tipo_msg = "🔔 Nuova richiesta appuntamento" if data_app else "🔔 Nuovo preventivo richiesto"
                        admin_message = f"{tipo_msg}\n\n👤 {nome}\n📧 {email_cliente or 'Non fornita'}\n📞 {telefono}\n"
                        
                        if data_app:
                            admin_message += f"📅 {data_app}\n"
                        
                        admin_message += f"💬 {messaggio or 'Nessun messaggio'}\n\nLaboratorio Odontotecnico Roso Marcello"
                        
                        requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                            "chat_id": TELEGRAM_CHAT_ID,
                            "text": admin_message
                        }, timeout=5)
                        print("Notifica Telegram inviata all'amministratore")
                        
                        # Se è un appuntamento, invia messaggio con pulsanti di conferma
                        if data_app:
                            try:
                                parts = data_app.strip().split()
                                if len(parts) >= 2:
                                    date_only = parts[0]
                                    time_only = parts[1]
                                    
                                    base_url = request.host_url
                                    if "onrender.com" in base_url:
                                        base_url = base_url.replace("http://", "https://")
                                    
                                    params = {"date": date_only, "time": time_only, "email": email_cliente, "name": nome}
                                    confirm_url = f"{base_url}confirm_from_email?{urllib.parse.urlencode(params)}"
                                    
                                    keyboard = {
                                        "inline_keyboard": [
                                            [
                                                {"text": "✅ Conferma", "callback_data": f"confirm|{date_only}|{time_only}"},
                                                {"text": "❌ Rifiuta", "callback_data": f"reject|{date_only}|{time_only}"}
                                            ],
                                            [{"text": "📧 Conferma via Email", "url": confirm_url}]
                                        ]
                                    }
                                    
                                    appointment_msg = f"📅 Nuovo appuntamento richiesto:\n\n👤 {nome}\n📧 {email_cliente or 'Non fornita'}\n📞 {telefono}\n📅 {data_app}\n💬 {messaggio or 'Nessun messaggio'}"
                                    
                                    requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                                        "chat_id": TELEGRAM_CHAT_ID,
                                        "text": appointment_msg,
                                        "reply_markup": keyboard
                                    }, timeout=5)
                                    print("Messaggio appuntamento con pulsanti inviato")
                            except Exception as e:
                                print(f"Errore invio messaggio appuntamento: {e}")
                    
                    except Exception as e:
                        print(f"Errore invio notifica Telegram: {e}")
                else:
                    print(f"Errore salvataggio Google Sheet: {resp_sheet.status_code}")
            except Exception as e:
                print(f"Errore Google Sheet: {e}")
            
            return jsonify({"status": "success", "message": "Email inviata con successo"})
        else:
            print(f"❌ Errore Brevo: {resp.status_code} - {resp.text}")
            return jsonify({"status": "error", "message": "Errore nell'invio dell'email"}), 500
    except Exception as e:
        print(f"Errore generale invio email: {e}")
        return jsonify({"status": "error", "message": "Errore interno del server"}), 500

@app.route("/confirm_from_email", methods=["GET"])
def confirm_from_email():
    date = request.args.get("date")
    time = request.args.get("time")
    email = request.args.get("email")
    name = request.args.get("name")
    
    if not all([date, time, email, name]):
        return "Parametri mancanti", 400
    
    try:
        resp = requests.post(GOOGLE_SCRIPT_URL, data={
            "action": "update_status",
            "date": date,
            "time": time,
            "status": "Confermato",
            "secret": GOOGLE_SCRIPT_SECRET
        }, timeout=10)
        
        if resp.status_code == 200:
            return f"""
            <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #28a745;">✅ Appuntamento Confermato!</h1>
                <p>Grazie {name}, il tuo appuntamento del {date} alle {time} è stato confermato.</p>
                <p>Ti aspettiamo presso il Laboratorio Odontotecnico Roso Marcello!</p>
            </body>
            </html>
            """, 200
        else:
            return "Errore nella conferma", 500
    except Exception as e:
        print(f"Errore conferma email: {e}")
        return "Errore interno", 500

@app.route("/check_availability", methods=["GET"])
def check_availability():
    date = request.args.get("date")
    if not date:
        return jsonify({"error": "Data richiesta"}), 400
    
    if not GOOGLE_SCRIPT_URL:
        return jsonify({"error": "GOOGLE_SCRIPT_URL non configurato nel file .env"}), 500

    try:
        # Usare params= è più sicuro per gestire correttamente i caratteri speciali nella URL
        resp = requests.get(GOOGLE_SCRIPT_URL, params={"date": date}, timeout=10)
        if resp.status_code == 200:
            return jsonify(resp.json())
        else:
            return jsonify({"error": "Errore nel controllo disponibilità"}), 500
    except Exception as e:
        print(f"Errore check availability: {e}")
        return jsonify({"error": "Errore interno"}), 500

@app.route("/track_visit", methods=["POST"])
def track_visit():
    if not GOOGLE_SCRIPT_URL:
        return jsonify({"status": "error", "message": "URL mancante"}), 500
        
    try:
        resp = requests.post(GOOGLE_SCRIPT_URL, data={
            "action": "track_visit",
            "secret": GOOGLE_SCRIPT_SECRET
        }, timeout=10)
        
        if resp.status_code == 200:
            return jsonify({"status": "success"})
        else:
            return jsonify({"status": "error"}), 500
    except Exception as e:
        print(f"Errore track visit: {e}")
        return jsonify({"status": "error"}), 500

if __name__ == "__main__":
    print("\n" + "="*50)
    print("🚀 BACKEND AVVIATO SU http://127.0.0.1:5000")
    print("👉 Ora puoi eseguire 'test_backend.py' in un altro terminale.")
    print("="*50 + "\n")
    app.run(debug=True, port=5000)
