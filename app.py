from flask import Flask, request, jsonify
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

app = Flask(__name__)

# CORS Configuration - Whitelist only trusted origins
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5000",
    "https://hehetzu.github.io",
    "https://marcello-bot.onrender.com",
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
    print("❌ ERRORE CRITICO: Token o Chat ID non trovati!")
    print("   Assicurati di aver creato il file .env nella stessa cartella di app.py")

def is_valid_email(email):
    return re.match(r"[^@]+@[^@]+\.[^@]+", email) is not None

@app.route("/", methods=["GET"])
def index():
    return "Bot Telegram attivo 🤖 (v2.1 - Test Finale)", 200

@app.route("/set_webhook", methods=["GET"])
def set_webhook():
    print("🔄 Richiesta configurazione Webhook ricevuta...")
    base_url = request.host_url
    if "onrender.com" in base_url:
        base_url = base_url.replace("http://", "https://")
    
    webhook_url = f"{base_url}webhook"
    telegram_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/setWebhook?url={webhook_url}"
    
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

    # VALIDATE TELEGRAM SECRET
    data = request.json
    if not data or data.get("secret") != TELEGRAM_SECRET:
        return {"status": "unauthorized"}, 401

    if "callback_query" in data:
        print(f"🔴 CALLBACK_QUERY RICEVUTA! Dati completi: {data}")
        callback = data["callback_query"]
        
        if not TELEGRAM_TOKEN:
            print("❌ ERRORE CRITICO: TELEGRAM_TOKEN non è impostato!")
            return {"status": "error", "message": "Token missing"}, 200
        
        try:
            resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/answerCallbackQuery", json={
                "callback_query_id": callback["id"],
                "text": "🔄 Elaborazione..."
            }, timeout=5)
            print(f"✅ answerCallbackQuery risposta: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"❌ Errore nella answerCallbackQuery: {e}")

        chat_id = callback["message"]["chat"]["id"]
        message_id = callback["message"]["message_id"]
        data_str = callback["data"]
        print(f"🔹 Callback ricevuta: {data_str} | chat_id: {chat_id} | message_id: {message_id}")

        try:
            action, date_app, time_app = data_str.split("|")
        except ValueError:
            print(f"❌ Errore formato callback data: {data_str}")
            try:
                requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={"chat_id": chat_id, "text": "⚠️ Errore: Dati del pulsante non validi."})
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
            }, timeout=10)
            
            if resp.status_code == 200:
                try:
                    json_resp = resp.json()
                    if json_resp.get("result") == "success":
                        sheet_success = True
                        client_info['name'] = json_resp.get('clientName')
                        client_info['email'] = json_resp.get('clientEmail')
                        print(f"✅ Google Sheet aggiornato: {json_resp}")
                    else:
                        print(f"⚠️ Google Sheet errore logico: {json_resp.get('message')}")
                except:
                    print(f"⚠️ Risposta non JSON da Google (possibile errore Auth/HTML): {resp.text[:100]}")
            else:
                print(f"❌ Errore Google Sheet status: {resp.status_code}")
        except Exception as e:
            print(f"❌ Errore aggiornamento Sheet: {e}")

        if sheet_success and action == "confirm" and client_info.get('email'):
            send_appointment_confirmation(
                client_name=client_info.get('name'),
                client_email=client_info.get('email'),
                app_date=date_app,
                app_time=time_app
            )

        try:
            resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/editMessageReplyMarkup", json={
                "chat_id": chat_id,
                "message_id": message_id,
                "reply_markup": {"inline_keyboard": []}
            }, timeout=10)
            print(f"✅ Rimozione bottoni: {resp.status_code} - {resp.text[:200]}")
        except Exception as e:
            print(f"❌ Errore rimozione bottoni: {e}")

        msg_text = f"{emoji} Appuntamento {new_status.upper()}"
        if not sheet_success:
            msg_text += "\n⚠️ ATTENZIONE: Errore aggiornamento Google Sheet! Controllare manualmente."

        try:
            resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                "chat_id": chat_id,
                "text": msg_text
            }, timeout=10)
            print(f"✅ Messaggio conferma inviato: {resp.status_code}")
        except Exception as e:
            print(f"❌ Errore invio messaggio conferma: {e}")

        return {"status": "ok"}, 200

    if "message" in data or "update_id" in data:
        return {"status": "ignored"}, 200

    print("📩 Richiesta ricevuta dal sito/test...")
    nome = data.get("nome", "Non specificato")
    email = data.get("email", "Non specificata")
    telefono = data.get("telefono", "")
    messaggio = data.get("messaggio", "")
    data_app = data.get("data", "")

    date_only = ""
    time_only = ""
    if data_app:
        parts = data_app.strip().split()
        if len(parts) >= 2:
            date_only = parts[0]
            time_only = parts[1]

    titolo = "📅 NUOVO APPUNTAMENTO" if data_app else "📄 RICHIESTA PREVENTIVO/INFO"
    
    valid_email_icon = "✅" if is_valid_email(email) else "⚠️ (Email non valida)"

    text = f"🔔 {titolo}\n"
    text += "➖➖➖➖➖➖➖➖➖➖\n"
    text += f"👤 Nome: {nome}\n"
    text += f"📧 Email: {email} {valid_email_icon}\n"
    if telefono:
        text += f"📞 Telefono: {telefono}\n"
    if data_app:
        text += f"🗓 Data richiesta: {data_app}\n"
    text += f"➖➖➖➖➖➖➖➖➖➖\n"
    text += f"📝 Messaggio:\n{messaggio}\n"
    text += "➖➖➖➖➖➖➖➖➖➖"

    clean_phone = telefono.replace(" ", "").replace("-", "") if telefono else ""
    wa_text = f"Ciao {nome}, ho ricevuto la tua richiesta dal sito. Come posso aiutarti?"
    wa_url = f"https://wa.me/{clean_phone}?text={urllib.parse.quote(wa_text)}"
    
    mail_subject = "Risposta alla tua richiesta - Laboratorio Roso Marcello"
    mail_body = f"Gentile {nome},\n\nAbbiamo ricevuto la tua richiesta dal sito web.\n\nCordiali saluti,\nLaboratorio Odontotecnico Roso Marcello"
    mail_url = f"mailto:{email}?subject={urllib.parse.quote(mail_subject)}&body={urllib.parse.quote(mail_body)}"

    keyboard = []
    if clean_phone:
        keyboard.append([{"text": "💬 WhatsApp", "url": wa_url}])
    
    if data_app and date_only and time_only:
        print(f"🔘 Aggiungo bottoni per: {date_only} - {time_only}")
        callback_data_confirm = f"confirm|{date_only}|{time_only}"
        callback_data_reject = f"reject|{date_only}|{time_only}"
        keyboard.append([
            {"text": "✅ Accetta", "callback_data": callback_data_confirm},
            {"text": "❌ Rifiuta", "callback_data": callback_data_reject}
        ])

    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "disable_web_page_preview": False
    }
    
    if keyboard:
        payload["reply_markup"] = {"inline_keyboard": keyboard}

    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    response = requests.post(url, json=payload, timeout=10)
    
    if response.status_code != 200:
        print(f"❌ Errore Telegram: {response.text}")
    else:
        print("✅ Messaggio inviato a Telegram con successo!")

    return {"status": "ok"}, 200

def send_appointment_confirmation(client_name, client_email, app_date, app_time):
    if not BREVO_API_KEY or not client_email or not is_valid_email(client_email):
        print("⚠️ Impossibile inviare email di conferma: chiave Brevo o email cliente mancante.")
        return False

    subject = "✅ Appuntamento CONFERMATO - Laboratorio Roso Marcello"
    html_content = f"""
    <!DOCTYPE html>
    <html lang="it">
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Poppins', Arial, sans-serif; line-height: 1.6; color: #2c3e50; background-color: #f8f9fa; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #28a745, #218838); padding: 20px; text-align: center;">
                <img src="https://hehetzu.github.io/Prova-Marcello-/foto/logomarcello.jpeg" alt="Laboratorio Roso Marcello" style="max-width: 120px; border-radius: 50%; border: 3px solid white;">
            </div>
            <div style="padding: 30px;">
                <h2 style="color: #218838; text-align: center; margin-top: 0;">Il tuo appuntamento è CONFERMATO!</h2>
                <p>Gentile {client_name},</p>
                <p>Siamo felici di confermare il tuo appuntamento presso il nostro laboratorio.</p>
                
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                    <h3 style="margin-top: 0; color: #218838;">Dettagli dell'appuntamento:</h3>
                    <p><strong>📅 Data:</strong> {app_date}</p>
                    <p><strong>🕒 Ora:</strong> {app_time}</p>
                </div>
                
                <p>Ti aspettiamo in <strong>Corso Regio Parco, 168 - Torino</strong>.</p>
                <p>Se hai bisogno di modificare o cancellare l'appuntamento, ti preghiamo di contattarci telefonicamente al più presto.</p>
            </div>
            <div style="background-color: #063969; color: #ffffff; padding: 20px; text-align: center; font-size: 0.9em;">
                <p style="margin: 0 0 10px 0;">
                    <strong>Laboratorio Odontotecnico Roso Marcello</strong><br>
                    Tel: 338 1731927
                </p>
            </div>
        </div>
    </body>
    </html>
    """

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {"accept": "application/json", "api-key": BREVO_API_KEY, "content-type": "application/json"}
    payload = {"sender": {"name": "Laboratorio Roso Marcello", "email": BREVO_SENDER_EMAIL}, "to": [{"email": client_email, "name": client_name}], "subject": subject, "htmlContent": html_content}

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code in [200, 201, 202]:
            print(f"✅ Email di conferma appuntamento inviata a {client_email}")
            return True
        else:
            print(f"⚠️ Errore invio email conferma appuntamento: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Eccezione invio email conferma appuntamento: {e}")
        return False

@app.route("/confirm_from_email", methods=["GET"])
def confirm_from_email():
    date_app = request.args.get("date")
    time_app = request.args.get("time")
    client_email = request.args.get("email")
    client_name = request.args.get("name", "Cliente")

    if not date_app or not time_app:
        return "<h1>Errore</h1><p>Parametri mancanti nel link.</p>", 400

    try:
        resp = requests.post(GOOGLE_SCRIPT_URL, data={
            "action": "update_status",
            "date": date_app,
            "time": time_app,
            "status": "Confermato",
            "secret": GOOGLE_SCRIPT_SECRET
        }, timeout=10)
    except Exception as e:
        return f"<h1>Errore</h1><p>Impossibile aggiornare il calendario: {str(e)}</p>", 500

    email_sent = False
    if client_email:
        email_sent = send_appointment_confirmation(client_name, client_email, date_app, time_app)

    return f"""
    <!DOCTYPE html>
    <html lang="it">
    <head><meta charset="UTF-8"><title>Confermato</title></head>
    <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f4f4f4;">
        <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto;">
            <h1 style="color: #28a745;">✅ Appuntamento Confermato</h1>
            <p>L'appuntamento per <strong>{client_name}</strong> è stato confermato.</p>
            <p><strong>Data:</strong> {date_app}<br><strong>Ora:</strong> {time_app}</p>
            <p style="color: #666; font-size: 0.9em;">{'📧 Email di conferma inviata al cliente.' if email_sent else '⚠️ Impossibile inviare email al cliente.'}</p>
        </div>
    </body>
    </html>
    """, 200

@app.route("/send_email", methods=["POST"])
@limiter.limit("5 per minute")
def send_email():
    if not BREVO_API_KEY:
        return jsonify({"status": "error", "message": "Brevo API Key missing"}), 500

    data = request.json
    nome = data.get("nome", "Utente")
    email_cliente = data.get("email", "")
    telefono = data.get("telefono", "")
    
    if email_cliente and not is_valid_email(email_cliente):
        return jsonify({"status": "error", "message": "Email cliente non valida"}), 400
    
    if not email_cliente and not telefono:
        return jsonify({"status": "error", "message": "Inserire almeno email o telefono"}), 400

    messaggio = data.get("messaggio", "")
    data_app = data.get("data", "")

    date_row_client = f"<p><strong>📅 Data/Ora preferita:</strong> {data_app}</p>" if data_app else ""
    
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
    html_content_admin = f"""
    <!DOCTYPE html>
    <html lang="it">
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: 1px solid #e0e0e0;">
            <div style="background-color: {header_color}; padding: 20px; text-align: center;">
                <h2 style="color: #ffffff; margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px;">Nuova Richiesta dal Sito</h2>
            </div>
            <div style="padding: 30px;">
                <table width="100%" style="border-collapse: collapse; margin-bottom: 20px;">
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d; width: 120px;"><strong>Nome:</strong></td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #2c3e50; font-weight: 600;">{nome}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Email:</strong></td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><a href="mailto:{email_cliente}" style="color: #3498db; text-decoration: none;">{email_cliente}</a></td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Telefono:</strong></td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><a href="tel:{telefono}" style="color: #3498db; text-decoration: none;">{telefono}</a></td>
                    </tr>
                    {date_row_admin_html}
                </table>
                <div style="background-color: #f9f9f9; border-left: 4px solid #3498db; padding: 15px; border-radius: 4px;">
                    <p style="margin: 0 0 5px 0; font-size: 12px; color: #95a5a6; text-transform: uppercase; font-weight: bold;">Messaggio del cliente</p>
                    <p style="margin: 0; color: #333; font-style: italic;">"{messaggio.replace(chr(10), '<br>')}"</p>
                </div>
                <div style="margin-top: 30px; text-align: center;">
                    {confirm_btn_html}
                    <a href="mailto:{email_cliente}" style="background-color: #2c3e50; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-size: 14px; margin-right: 10px; display: inline-block;">Rispondi</a>
                </div>
            </div>
            <div style="background-color: #ecf0f1; padding: 15px; text-align: center; font-size: 12px; color: #7f8c8d;">
                Ricevuto tramite il modulo di contatto del sito web.
            </div>
        </div>
    </body>
    </html>
    """

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
    }
    payload_admin = {
        "sender": {"name": "Sito Web Marcello", "email": BREVO_SENDER_EMAIL},
        "to": [{"email": BREVO_ADMIN_RECIPIENT, "name": "Laboratorio Roso Marcello"}],
        "subject": subject_admin,
        "htmlContent": html_content_admin
    }

    if email_cliente:
        payload_admin["replyTo"] = {"email": email_cliente, "name": nome}

    try:
        response_admin = requests.post(url, json=payload_admin, headers=headers, timeout=10)
        
        if response_admin.status_code not in [200, 201, 202]:
            print(f"❌ Errore Brevo (Admin): {response_admin.text}")
            return jsonify({"status": "error", "message": "Brevo failed for admin"}), response_admin.status_code
        
        print("✅ Email inviata all'amministratore con successo.")

        if email_cliente:
            subject_cliente = f"Conferma ricezione richiesta {request_type_label} - Laboratorio Roso Marcello"
            html_content_cliente = f"""
            <!DOCTYPE html>
            <html lang="it">
            <head><meta charset="UTF-8"></head>
            <body style="font-family: 'Poppins', Arial, sans-serif; line-height: 1.6; color: #2c3e50; background-color: #f8f9fa; margin: 0; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08);">
                    <div style="background: linear-gradient(135deg, #0056b3, #00a8cc); padding: 20px; text-align: center;">
                        <img src="https://hehetzu.github.io/Prova-Marcello-/foto/logomarcello.jpeg" alt="Laboratorio Roso Marcello" style="max-width: 120px; border-radius: 50%; border: 3px solid white;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #063969; text-align: center; margin-top: 0;">Grazie per averci contattato, {nome}!</h2>
                        <p>Gentile {nome},</p>
                        <p>Abbiamo ricevuto correttamente la tua richiesta. Il nostro team la esaminerà al più presto e ti ricontatteremo per fornirti tutte le informazioni necessarie.</p>
                        
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0056b3;">
                            <h3 style="margin-top: 0; color: #0056b3;">Riepilogo della tua richiesta:</h3>
                            {date_row_client}
                            <p><strong>💬 Messaggio:</strong><br>{messaggio.replace(chr(10), '<br>')}</p>
                        </div>
                        
                        <div style="text-align: center; margin: 25px 0; color: #555; font-size: 0.95em;">
                            <p>💡 <strong>Hai bisogno di una risposta immediata?</strong><br>
                            Per urgenze o conferme rapide, ti consigliamo di contattarci telefonicamente o su WhatsApp.</p>
                        </div>

                        <p style="text-align: center; margin-top: 30px;">
                            <a href="https://hehetzu.github.io/Prova-Marcello-/" style="background: linear-gradient(135deg, #0056b3, #00a8cc); color: #ffffff; padding: 12px 25px; border-radius: 50px; text-decoration: none; display: inline-block;">Visita il nostro sito</a>
                        </p>
                    </div>
                    <div style="background-color: #063969; color: #ffffff; padding: 20px; text-align: center; font-size: 0.9em;">
                        <p style="margin: 0 0 10px 0;">
                            <strong>Laboratorio Odontotecnico Roso Marcello</strong><br>
                            Corso Regio Parco, 168 - 10154 Torino (TO)<br>
                            Tel: 338 1731927
                        </p>
                        <p style="margin: 0;">
                            <a href="https://www.facebook.com" style="color: white; margin: 0 5px;">Facebook</a> | 
                            <a href="https://www.instagram.com" style="color: white; margin: 0 5px;">Instagram</a>
                        </p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            payload_cliente = {
                "sender": {"name": "Laboratorio Roso Marcello", "email": BREVO_SENDER_EMAIL},
                "to": [{"email": email_cliente, "name": nome}],
                "subject": subject_cliente,
                "htmlContent": html_content_cliente
            }

            response_client = requests.post(url, json=payload_cliente, headers=headers, timeout=10)
            if response_client.status_code in [200, 201, 202]:
                print(f"✅ Email di conferma inviata al cliente: {email_cliente}")
            else:
                print(f"⚠️ Errore invio email al cliente: {response_client.text}")
        
        return jsonify({"status": "success"}), 200

    except Exception as e:
        print(f"❌ Eccezione Brevo: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))