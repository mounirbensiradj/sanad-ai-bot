import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

import { createClient } from '@supabase/supabase-js';
import { processMessage } from './ai.js';
import { saveLeadToAirtable, getCalendlyLink, getLeadsFromAirtable, getAppointmentsFromCalendly } from './services.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Using Service Role Key for backend bypasses RLS
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Basic health check
app.get('/api/health', async (req, res) => {
  // Test database connection
  const { data, error } = await supabase.from('leads').select('count').limit(1);
  const dbStatus = error ? 'error' : 'connected';
  
  res.json({ 
    status: 'ok', 
    message: 'WhatsApp Super-Bot Backend is running',
    database: dbStatus
  });
});

app.get('/', (req, res) => {
    if (isWhatsAppConnected) {
        return res.send('<h1 style="font-family:sans-serif; text-align:center; margin-top:50px; color:green;">🟢 WhatsApp Bot is Connected and Running!</h1>');
    }
    if (qrCodeData) {
        return res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                <style>body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f4f4f9; margin: 0; }</style>
            </head>
            <body>
                <div style="background:white; padding:30px; border-radius:15px; box-shadow:0 10px 25px rgba(0,0,0,0.1); text-align:center;">
                    <h2 style="color:#333; margin-top:0;">Scan to Connect WhatsApp</h2>
                    <p style="color:#666; margin-bottom:20px;">Open WhatsApp > Linked Devices > Link a Device</p>
                    <div id="qrcode" style="display:flex; justify-content:center;"></div>
                </div>
                <script>
                    new QRCode(document.getElementById("qrcode"), {
                        text: "${qrCodeData}",
                        width: 256,
                        height: 256
                    });
                    // Refresh the page every 15 seconds to get the newest QR code
                    setTimeout(() => location.reload(), 15000);
                </script>
            </body>
            </html>
        `);
    }
    res.send('<h1 style="font-family:sans-serif; text-align:center; margin-top:50px; color:#555;">⏳ Starting up WhatsApp client... please refresh in a few seconds.</h1>');
});

// --- WhatsApp Engine Setup ---
let qrCodeData = null;
let isWhatsAppConnected = false;
let client = null;

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_PATH = path.join(__dirname, '.wwebjs_auth');

function createWhatsAppClient() {
    const newClient = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || undefined,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-accelerated-2d-canvas', 
                '--no-first-run', 
                '--no-zygote', 
                '--single-process', 
                '--disable-gpu'
            ]
        }
    });

    newClient.on('qr', (qr) => {
        console.log('QR Code Received. Scan it to connect!');
        qrcode.generate(qr, { small: true });
        qrCodeData = qr;
    });

    newClient.on('ready', () => {
        console.log('WhatsApp Client is READY!');
        isWhatsAppConnected = true;
        qrCodeData = null;
    });

    newClient.on('disconnected', (reason) => {
        console.log('WhatsApp disconnected:', reason);
        isWhatsAppConnected = false;
        qrCodeData = null;
    });

    return newClient;
}

client = createWhatsAppClient();

async function handleIncomingMessage(msg) {
    // Ignore group messages or status updates
    if (msg.isGroup || msg.isStatus) return;

    const userPhone = msg.from;
    const userText = msg.body;

    console.log(`[INCOMING] ${userPhone}: ${userText}`);

    try {
        // 1. Save incoming message to Supabase
        await supabase.from('messages').insert({
            phone_number: userPhone,
            direction: 'incoming',
            content: userText,
            message_type: msg.hasMedia ? 'media' : 'text'
        });

        // 2. Fetch previous messages for this user
        const { data: history } = await supabase
            .from('messages')
            .select('content, direction')
            .eq('phone_number', userPhone)
            .order('created_at', { ascending: false })
            .limit(10);

        // 3. Check if this is the FIRST message from this user (only 1 message = the one we just saved)
        const isFirstMessage = !history || history.length <= 1;

        if (isFirstMessage) {
            // Send welcome menu directly — no AI needed
            const welcomeMsg = `هلا وغلا! 👋 أنا سند، مستشارك للذكاء الاصطناعي وأتمتة الأعمال.

كيف أقدر أساعدك اليوم؟ اختر رقم الخيار:

1️⃣ تعرّف على خدماتنا
2️⃣ شاهد دراسات الحالة
3️⃣ احجز استشارة مجانية (30 دقيقة)
4️⃣ احسب كم بتوفر (حاسبة ROI)
5️⃣ تكلم مع خبير بشري`;

            await client.sendMessage(userPhone, welcomeMsg);
            await supabase.from('messages').insert({
                phone_number: userPhone,
                direction: 'outgoing',
                content: welcomeMsg,
                message_type: 'text',
                intent: 'GENERAL'
            });
            console.log(`[WELCOME] Sent welcome menu to ${userPhone}`);
            return; // Done — no AI processing needed
        }

        // 4. Process with OpenAI (reverse history for chronological order)
        const chatContext = history ? history.reverse() : [];
        const aiResponse = await processMessage(userText, chatContext);

        console.log(`[AI INTENT: ${aiResponse.intent}] Sending reply...`);

        // Handle BOOKING Intent — append Calendly link
        if (aiResponse.intent === 'BOOKING') {
            const link = await getCalendlyLink();
            if (link) {
                aiResponse.replyMessage += `\n\nتفضل رابط الحجز: ${link}`;
            }
        }

        // Handle LEAD_QUALIFIED Intent — save to Airtable
        if (aiResponse.intent === 'LEAD_QUALIFIED') {
            const leadData = aiResponse.leadData || {};
            // Always include the phone number
            leadData.phone = userPhone.replace('@c.us', '').replace('@lid', '');
            
            // Only push if we have at least a name or industry
            if (leadData.name || leadData.industry) {
                console.log("Lead Qualified! Pushing to Airtable:", leadData);
                await saveLeadToAirtable(leadData);
            } else {
                console.log("Lead intent but no data extracted:", leadData);
            }
        }

        // 6. Send the WhatsApp reply (Text)
        if (aiResponse.replyMessage) {
            await client.sendMessage(userPhone, aiResponse.replyMessage);
            
            await supabase.from('messages').insert({
                phone_number: userPhone,
                direction: 'outgoing',
                content: aiResponse.replyMessage,
                message_type: 'text',
                intent: aiResponse.intent
            });
        }

    } catch (err) {
        console.error("Error handling message:", err);
    }
}

client.on('message', handleIncomingMessage);
client.initialize();

// --- API Endpoints for Frontend ---
app.get('/api/whatsapp/status', (req, res) => {
    res.json({
        connected: isWhatsAppConnected,
        qr: qrCodeData
    });
});

app.post('/api/whatsapp/logout', async (req, res) => {
    // Send response FIRST so the frontend doesn't hang
    res.json({ success: true, message: "Disconnecting... new QR code will appear shortly." });
    
    console.log("Logging out of WhatsApp...");
    isWhatsAppConnected = false;
    qrCodeData = null;
    
    try {
        // Step 1: Kill Chrome directly via puppeteer (avoids LocalAuth.logout crash)
        if (client.pupBrowser) {
            try { await client.pupBrowser.close(); } catch(e) { /* ignore */ }
        }
    } catch(e) { console.log("Browser close note:", e.message); }
    
    // Step 2: Wait for Chrome to fully release file locks
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Clean session files with retry
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            if (fs.existsSync(SESSION_PATH)) {
                fs.rmSync(SESSION_PATH, { recursive: true, force: true });
                console.log("Session files cleaned (attempt " + (attempt+1) + ").");
                break;
            }
        } catch (cleanErr) {
            console.log("Cleanup attempt " + (attempt+1) + " failed, retrying...");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // Step 4: Create fresh client
    client = createWhatsAppClient();
    client.on('message', handleIncomingMessage);
    client.initialize();
    console.log("New client initialized. Waiting for QR code...");
});

app.get('/api/messages', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("Error fetching messages:", err);
        res.status(500).json({ error: err.message });
    }
});

// Leads and Appointments APIs

app.get('/api/leads', async (req, res) => {
    try {
        const leads = await getLeadsFromAirtable();
        res.json(leads);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/appointments', async (req, res) => {
    try {
        const appointments = await getAppointmentsFromCalendly();
        res.json(appointments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Quick Action API
app.post('/api/quick-action', async (req, res) => {
    try {
        const { phone, action } = req.body;
        if (!phone || !action) return res.status(400).json({ error: "Missing phone or action" });

        if (action === 'booking') {
            const link = await getCalendlyLink();
            if (link) {
                const text = `تفضل رابط حجز الاستشارة مع فريقنا: ${link}`;
                await client.sendMessage(phone, text);
                
                await supabase.from('messages').insert({
                    phone_number: phone,
                    direction: 'outgoing',
                    content: text,
                    message_type: 'text',
                    intent: 'BOOKING_MANUAL'
                });
                return res.json({ success: true, action, link });
            }
        }
        
        return res.status(400).json({ error: "Unknown action or failed to fetch link" });
    } catch (err) {
        console.error("Quick action error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
