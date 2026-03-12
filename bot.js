const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
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
const ADMIN_NUMBER = '77071234567@s.whatsapp.net'; // 🔴 ӨЗ НӨМІРІҢІЗДІ ОСЫНДА ЖАЗЫҢЫЗ!
const DB_FILE = './database.json';
let db = { users: {} };

// Базаны жүктеу
if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE)); } catch(e) { console.log('База қатесі'); }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(id) {
    if (!db.users[id]) {
        db.users[id] = { balance: 1000, karma: 0, spouse: null, lastBonus: 0, messages: 0, title: "Жай адам" };
        saveDB();
    }
    return db.users[id];
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        browser: ['Iris Render Bot', 'Chrome', '1.0.0'],
        syncFullHistory: false
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n=============================================');
            console.log('📱 ТӨМЕНДЕГІ QR КОДТЫ СКАНЕРЛЕҢІЗ:');
            console.log('=============================================\n');
            qrcode.generate(qr, { small: true }); 
            console.log('\n=============================================\n');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔄 Байланыс үзілді. Қайта қосылу:', shouldReconnect);
            
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('❌ Аккаунттан шығып кетті! Сессия тазартылуда...');
                fs.rmSync('./auth_info', { recursive: true, force: true });
                console.log('✅ Сессия тазартылды! Бот қайта қосылады...');
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            console.log('\n✅ БОТ СӘТТІ ҚОСЫЛДЫ! (100%)\n');
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

        // Статистика
        const user = getUser(sender);
        user.messages += 1;
        saveDB();

        console.log(`📩 [${senderName}]: ${lowerText}`);

        // ════════════════════════════════════════
        // 🤖 КОМАНДАЛАР
        // ════════════════════════════════════════

        // 1. СӘЛЕМДЕСУ (ПОДСКАЗКА)
        if (['сәлем', 'салам', 'привет', 'бот'].includes(lowerText)) {
            await sock.sendMessage(from, { text: `👋 Сәлем, *${senderName}*!\nМен істеп тұрмын. Командалар үшін *!меню* деп жазыңыз.` });
            return;
        }

        // 2. МЕНЮ
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

        // 3. ПРОФИЛЬ
        if (command === '!профиль') {
            const spouse = user.spouse ? `💍 Жұбайы: @${user.spouse.split('@')[0]}` : '💔 Бойдақ';
            await sock.sendMessage(from, { text: `👤 *${senderName}*\n🏷️ Атағы: ${user.title}\n💬 Хаттар: ${user.messages}\n💰 Баланс: ${user.balance} ₸\n✨ Карма: ${user.karma}\n${spouse}`, mentions: user.spouse ? [user.spouse] : [] });
            return;
        }

        // 4. БОНУС
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

        // 5. КАЗИНО
        if (command === '!казино') {
            const bet = parseInt(args[1]);
            if (!bet || bet <= 0 || user.balance < bet) return sock.sendMessage(from, { text: '❌ Ақша жетпейді немесе қате!' });
            const win = Math.random() > 0.5;
            if (win) { user.balance += bet; await sock.sendMessage(from, { text: `🎰 Жеңіс! +${bet} ₸` }); }
            else { user.balance -= bet; await sock.sendMessage(from, { text: `😢 Ұтылыс... -${bet} ₸` }); }
            saveDB();
            return;
        }

        // 6. АТАҚ САТЫП АЛУ
        if (command === '!атақ') {
            const newTitle = lowerText.slice(6).trim();
            if (!newTitle) return sock.sendMessage(from, { text: '⚠️ Мысалы: !атақ Ханзада' });
            if (user.balance < 5000) return sock.sendMessage(from, { text: '❌ Ақша жетпейді! (5000 ₸ керек)' });
            user.balance -= 5000; user.title = newTitle; saveDB();
            await sock.sendMessage(from, { text: `✅ Жаңа атағыңыз: *${newTitle}*` });
            return;
        }

        // 7. КАРМА
        const replyJid = msg.message.extendedTextMessage?.contextInfo?.participant;
        if ((lowerText === '+' || lowerText === '-') && replyJid) {
            if (replyJid === sender) return;
            const target = getUser(replyJid);
            if (lowerText === '+') { target.karma += 1; await sock.sendMessage(from, { text: `✨ Карма өсті! (${target.karma})` }); }
            else { target.karma -= 1; await sock.sendMessage(from, { text: `🔻 Карма түсті... (${target.karma})` }); }
            saveDB();
            return;
        }

    });
}

connectToWhatsApp();
