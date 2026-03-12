const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const express = require('express');

// 🌐 ЖАЛҒАН СЕРВЕР (Render өшіп қалмас үшін)
const app = express();
app.get('/', (req, res) => res.send('Бот 100% жұмыс істеп тұр! 🚀'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Сервер ${PORT}-портта қосылды`));

// 📂 ДЕРЕКТЕР БАЗАСЫ
const ADMIN_NUMBER = '77071234567@s.whatsapp.net'; // ӨЗ НӨМІРІҢІЗ
const DB_FILE = './database.json';
let db = { users: {} };

if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE)); } catch(e) {}
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(id) {
    if (!db.users[id]) {
        db.users[id] = { balance: 1000, karma: 0, spouse: null, messages: 0, title: "Жай адам" };
        saveDB();
    }
    return db.users[id];
}

async function connectToWhatsApp() {
    // 🟢 ЖАҢА АВТОРИЗАЦИЯ ЖҮЙЕСІ (Multi-Device үшін)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            // 🟢 КІЛТТЕРДІ КЭШТЕУ (Жадты үнемдеп, тез қосылу үшін)
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // Өзіміз шығарамыз
        browser: ['Iris Pro', 'Chrome', '2.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true // Желіде екенін көрсету
    });

    s    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // 🟢 QR КОДТЫ ШЫҒАРУ (Render-ге сыюы үшін өте кішкентай форматта)
        if (qr) {
            console.log('\n=============================================');
            console.log('📱 ТӨМЕНДЕГІ QR КОДТЫ СКАНЕРЛЕҢІЗ:');
            console.log('=============================================\n');
            qrcode.generate(qr, { small: true }); 
            console.log('\n=============================================\n');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`🔄 Байланыс үзілді (Код: ${statusCode}). Қайта қосылу: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            } else {
                // 🔴 ЕГЕР БОТ ШЫҒЫП КЕТСЕ, СЕССИЯНЫ АВТОМАТТЫ ӨШІРЕДІ
                console.log('❌ Аккаунттан шығып кетті! Сессия тазартылуда...');
                fs.rmSync('./auth_info', { recursive: true, force: true });
                console.log('✅ Сессия тазартылды! Бот қайта қосылады...');
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            console.log('\n✅ БОТ СӘТТІ ҚОСЫЛДЫ ЖӘНЕ ХАБАРЛАМА КҮТУДЕ!\n');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // 📩 ХАБАРЛАМА ҚАБЫЛДАУ
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const senderName = msg.pushName || 'Адам';

        // Мәтінді алу
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || 
                     '';

        if (!text) return;

        const lowerText = text.toLowerCase().trim();
        const args = lowerText.split(' ');
        const command = args[0];

        console.log(`📩 Хат: [${senderName}] -> ${lowerText}`);

        const user = getUser(sender);
        user.messages += 1;
        saveDB();

        // ════════════════════════════════════════
        // 🤖 КОМАНДАЛАР
        // ════════════════════════════════════════

        if (['сәлем', 'салам', 'привет', 'бот'].includes(lowerText)) {
            await sock.sendMessage(from, { text: `👋 Сәлем, *${senderName}*!\nМен істеп тұрмын. Көмек үшін *!меню* жазыңыз.` });
            return;
        }

        if (command === '!меню' || command === 'меню') {
            await sock.sendMessage(from, { text: `🤖 *IRIS МӘЗІРІ*
!профиль - Өзің туралы
!топ - Топ белсенділері
!бонус - Ақша алу
!казино [сома] - Ойын
!атақ [ат] - Статус (5000₸)
+ / - (reply) - Карма
!үйлену / !ажырасу` });
            return;
        }

        if (command === '!профиль') {
            const spouse = user.spouse ? `💍 Жұбайы: @${user.spouse.split('@')[0]}` : '💔 Бойдақ';
            await sock.sendMessage(from, { text: `👤 *${senderName}*\n🏷️ Атағы: ${user.title}\n💬 Хаттар: ${user.messages}\n💰 Баланс: ${user.balance} ₸\n✨ Карма: ${user.karma}\n${spouse}`, mentions: user.spouse ? [user.spouse] : [] });
            return;
        }

        if (command === '!бонус') {
            const now = Date.now();
            if (now - user.lastBonus < 43200000) {
                await sock.sendMessage(from, { text: `⏳ Бонус алғансыз!` });
            } else {
                const bonus = Math.floor(Math.random() * 400) + 100;
                user.balance += bonus; user.lastBonus = now; saveDB();
                await sock.sendMessage(from, { text: `🎁 +${bonus} ₸ алдыңыз!` });
            }
            return;
        }

        if (command === '!казино') {
            const bet = parseInt(args[1]);
            if (!bet || bet <= 0 || user.balance < bet) return sock.sendMessage(from, { text: '❌ Ақша жетпейді немесе қате!' });
            const win = Math.random() > 0.5;
            if (win) { user.balance += bet; await sock.sendMessage(from, { text: `🎰 Жеңіс! +${bet} ₸` }); }
            else { user.balance -= bet; await sock.sendMessage(from, { text: `😢 Ұтылыс... -${bet} ₸` }); }
            saveDB();
            return;
        }
    });
}

connectToWhatsApp();
