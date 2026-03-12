const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

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
        db.users[id] = { balance: 1000, karma: 0, spouse: null, lastBonus: 0, messages: 0, title: "Жай адам" };
        saveDB();
    }
    return db.users[id];
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Render логында QR шығады
        logger: pino({ level: 'silent' }),
        browser: ['Iris Render', 'Chrome', '1.0.0']
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔄 Байланыс үзілді. Қайта қосылу:', shouldReconnect);
            if(shouldReconnect) setTimeout(connectToWhatsApp, 3000);
        } else if(connection === 'open') {
            console.log('✅ ИРИС БОТ ҚОСЫЛДЫ! (Жеңіл нұсқа)');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const senderName = msg.pushName || 'Адам';
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        if (!text) return;
        
        const lowerText = text.toLowerCase().trim();
        const args = lowerText.split(' ');
        const command = args[0];

        // Статистика
        const user = getUser(sender);
        user.messages += 1;
        saveDB();

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const replyJid = msg.message.extendedTextMessage?.contextInfo?.participant;

        // 1. МЕНЮ
        if (command === '!меню' || command === 'меню') {
            await sock.sendMessage(from, { text: `🤖 *IRIS БОТ (RENDER)* 🤖\n\n!профиль - Профиль көру\n!бонус - Ақша алу\n!казино [сома] - Ойын\n+ / - (reply жасап) - Карма беру\n!үйлену @адам\n!ажырасу` });
        }

        // 2. ПРОФИЛЬ
        else if (command === '!профиль') {
            let spouseText = user.spouse ? `💍 Жұбайы: @${user.spouse.split('@')[0]}` : '💔 Бойдақ';
            await sock.sendMessage(from, { text: `👤 *${senderName}*\n💰 Баланс: ${user.balance} ₸\n✨ Карма: ${user.karma}\n${spouseText}`, mentions: user.spouse ? [user.spouse] : [] });
        }

        // 3. БОНУС
        else if (command === '!бонус') {
            const now = Date.now();
            if (now - user.lastBonus < 43200000) {
                await sock.sendMessage(from, { text: `⏳ Күте тұрыңыз!` });
            } else {
                const bonus = Math.floor(Math.random() * 400) + 100;
                user.balance += bonus;
                user.lastBonus = now;
                saveDB();
                await sock.sendMessage(from, { text: `🎁 Сіз ${bonus} ₸ бонус алдыңыз!` });
            }
        }

        // 4. КАЗИНО
        else if (command === '!казино') {
            const bet = parseInt(args[1]);
            if (!bet || user.balance < bet) return sock.sendMessage(from, { text: '❌ Ақша жетпейді немесе қате!' });
            const win = Math.random() > 0.5;
            if (win) { user.balance += bet; await sock.sendMessage(from, { text: `🎰 Жеңіс! +${bet} ₸` }); }
            else { user.balance -= bet; await sock.sendMessage(from, { text: `😢 Ұтылыс... -${bet} ₸` }); }
            saveDB();
        }

        // 5. КАРМА
        else if ((lowerText === '+' || lowerText === '-') && replyJid) {
            if (replyJid === sender) return;
            const target = getUser(replyJid);
            if (lowerText === '+') { target.karma += 1; await sock.sendMessage(from, { text: `✨ Карма өсті! (${target.karma})` }); }
            else { target.karma -= 1; await sock.sendMessage(from, { text: `🔻 Карма түсті... (${target.karma})` }); }
            saveDB();
        }

        // 6. ҮЙЛЕНУ
        else if (command === '!үйлену' && mentionedJid.length > 0) {
            const targetId = mentionedJid[0];
            if (user.spouse || getUser(targetId).spouse) return sock.sendMessage(from, { text: '❌ Бос емес!' });
            user.spouse = targetId; getUser(targetId).spouse = sender; saveDB();
            await sock.sendMessage(from, { text: `💍 *НЕКЕ ҚИЫЛДЫ!* 🎉`, mentions: [targetId] });
        }
    });
}

connectToWhatsApp();
