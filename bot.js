const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

const ADMIN_NUMBER = '77077052009@s.whatsapp.net'; // Өз нөміріңізді жазыңыз (@s.whatsapp.net міндетті)
const DB_FILE = './database.json';

// ДЕРЕКТЕР БАЗАСЫ
let db = { users: {}, clans: {}, groups: {} };

if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE)); } catch(e) {}
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(id) {
    if (!db.users[id]) {
        db.users[id] = { balance: 1000, karma: 0, spouse: null, lastBonus: 0, messages: 0, title: "Жай адам", clan: null, warnings: 0 };
        saveDB();
    }
    return db.users[id];
}

function getGroup(id) {
    if (!db.groups[id]) {
        db.groups[id] = { welcome: true, badwords: true };
        saveDB();
    }
    return db.groups[id];
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // Render логтарын толтырмау үшін
        printQRInTerminal: false, // QR өзіміз шығарамыз
        browser: ['Iris Render Bot', 'Chrome', '1.0.0'],
        syncFullHistory: false // Жадты үнемдеу
    });

    // ҚОСЫЛЫМ БАҚЫЛАУ
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n📱 QR КОД (ТЕЛЕФОНМЕН СКАНЕРЛЕҢІЗ):\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔄 Байланыс үзілді. Қайта қосылу:', shouldReconnect);
            if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
        } else if (connection === 'open') {
            console.log('✅ ИРИС БОТ ҚОСЫЛДЫ! (Жеңіл нұсқа)');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ЖАҢА АДАМДЫ ҚАРСЫ АЛУ (ТОПТА)
    sock.ev.on('group-participants.update', async (update) => {
        if (update.action === 'add') {
            const groupSettings = getGroup(update.id);
            if (groupSettings.welcome) {
                for (let participant of update.participants) {
                    await sock.sendMessage(update.id, { 
                        text: `👋 Сәлем, @${participant.split('@')[0]}!\nТопқа қош келдіңіз! Командаларды білу үшін *!меню* деп жазыңыз.`,
                        mentions: [participant] 
                    });
                }
            }
        }
    });

    // ХАБАРЛАМАЛАРДЫ ӨҢДЕУ
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
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

        // Белгіленген адамдарды анықтау
        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const replyJid = msg.message.extendedTextMessage?.contextInfo?.participant;
        const targetUser = mentionedJid[0] || replyJid;

        // 🤬 ЦЕНЗУРА
        const badWords = ['қотақ', 'сігіл', 'ам', 'mal', 'ебан'];
        if (isGroup && badWords.some(word => lowerText.includes(word))) {
            user.warnings += 1;
            saveDB();
            await sock.sendMessage(from, { text: `⚠️ *ЕСКЕРТУ!* Боқтауға болмайды!\nЕскерту: ${user.warnings}/3` });
            return; 
        }

        // 💡 ПОДСКАЗКА
        if (['сәлем', 'салам', 'привет', 'бот'].includes(lowerText)) {
            await sock.sendMessage(from, { text: `👋 Сәлем, *${senderName}*!\nМен осындамын. Көмек үшін *!меню* деп жазыңыз.` });
        }

        // ════════════════════════════════════════
        // 🤖 КОМАНДАЛАР
        // ════════════════════════════════════════

        // 1. МЕНЮ
        if (command === '!меню' || command === 'меню') {
            await sock.sendMessage(from, { text: `🤖 *IRIS COMFORT PRO* (Жеңіл)

👤 *ПРОФИЛЬ:*
!кім - Адам инфосы
!профиль - Өзің туралы
!топ - Топ белсенділері
!клан - Клан жүйесі

💰 *ЭКОНОМИКА:*
!бонус - Ақша алу
!казино [сома] - Ойын
!дүкен - Зат сатып алу
!беру @адам [сома] - Ақша аудару

🎭 *РӨЛДІК (RP):*
!үйлену, !ажырасу
құшақтау, сүю, ұру
шай, тамақ, ұйықтау

⚙️ *БАСҚА:*
!атақ [ат] - Жаңа статус (5000₸)` });
        }

        // 2. !КІМ
        else if (command === '!кім') {
            let tId = targetUser || sender;
            const tUser = getUser(tId);
            const clanText = tUser.clan ? `🛡️ Клан: ${tUser.clan}` : '🛡️ Клан: Жоқ';
            await sock.sendMessage(from, { text: `🔍 *ИНФО:*
🏷️ Атағы: ${tUser.title}
💬 Хаттар: ${tUser.messages}
💰 Баланс: ${tUser.balance} ₸
✨ Карма: ${tUser.karma}
${clanText}
💍 Жұбайы: ${tUser.spouse ? 'Бар ❤️' : 'Жоқ 💔'}`, mentions: [tId] });
        }

        // 3. !ТОП
        else if (command === '!топ' && isGroup) {
            const topUsers = Object.entries(db.users)
                .sort(([,a], [,b]) => b.messages - a.messages)
                .slice(0, 10);
            let statText = `🏆 *ТОП БЕЛСЕНДІЛЕР:* 🏆\n`;
            for (let i = 0; i < topUsers.length; i++) {
                const [id, data] = topUsers[i];
                statText += `\n${i+1}. @${id.split('@')[0]} — ${data.messages} хат`;
            }
            await sock.sendMessage(from, { text: statText, mentions: topUsers.map(u => u[0]) });
        }

        // 4. !АТАҚ
        else if (command === '!атақ') {
            const newTitle = lowerText.slice(6).trim();
            if (!newTitle) return sock.sendMessage(from, { text: '⚠️ Мысалы: !атақ Ханзада (5000₸)' });
            if (user.balance < 5000) return sock.sendMessage(from, { text: '❌ Ақша жетпейді!' });
            user.balance -= 5000;
            user.title = newTitle;
            saveDB();
            await sock.sendMessage(from, { text: `✅ Жаңа атағыңыз: *${newTitle}*` });
        }

        // 5. !БОНУС
        else if (command === '!бонус') {
            const now = Date.now();
            if (now - user.lastBonus < 43200000) return sock.sendMessage(from, { text: '⏳ Бонус алғансыз!' });
            const bonus = Math.floor(Math.random() * 400) + 100;
            user.balance += bonus; user.lastBonus = now; saveDB();
            await sock.sendMessage(from, { text: `🎁 +${bonus} ₸ алдыңыз!` });
        }

        // 6. !КАЗИНО
        else if (command === '!казино') {
            const bet = parseInt(args[1]);
            if (!bet || user.balance < bet) return sock.sendMessage(from, { text: '❌ Қате немесе ақша жоқ!' });
            const win = Math.random() > 0.5;
            if (win) { user.balance += bet; await sock.sendMessage(from, { text: `🎰 Жеңіс! +${bet} ₸` }); }
            else { user.balance -= bet; await sock.sendMessage(from, { text: `😢 Ұтылыс... -${bet} ₸` }); }
            saveDB();
        }

        // 7. !БЕРУ
        else if (command === '!беру' && targetUser) {
            const amount = parseInt(args[2]);
            if (!amount || user.balance < amount || targetUser === sender) return sock.sendMessage(from, { text: '❌ Қателік!' });
            user.balance -= amount; getUser(targetUser).balance += amount; saveDB();
            await sock.sendMessage(from, { text: `💸 Сіз ${amount} ₸ жібердіңіз!` });
        }

        // 8. КАРМА
        else if ((lowerText === '+' || lowerText === '-') && replyJid) {
            if (replyJid === sender) return;
            const target = getUser(replyJid);
            if (lowerText === '+') { target.karma++; await sock.sendMessage(from, { text: `✨ Карма өсті! (${target.karma})` }); }
            else { target.karma--; await sock.sendMessage(from, { text: `🔻 Карма түсті... (${target.karma})` }); }
            saveDB();
        }

        // 9. ҮЙЛЕНУ
        else if (command === '!үйлену' && targetUser) {
            if (user.spouse || getUser(targetUser).spouse) return sock.sendMessage(from, { text: '❌ Бос емес!' });
            user.spouse = targetUser; getUser(targetUser).spouse = sender; saveDB();
            await sock.sendMessage(from, { text: `💍 *НЕКЕ ҚИЫЛДЫ!* 🎉`, mentions: [targetUser] });
        }

        // 10. АЖЫРАСУ
        else if (command === '!ажырасу' && user.spouse) {
            const ex = user.spouse; user.spouse = null; getUser(ex).spouse = null; saveDB();
            await sock.sendMessage(from, { text: '💔 Ажырастыңыз...' });
        }

        // 11. ПРОФИЛЬ
        else if (command === '!профиль') {
            const spouse = user.spouse ? `💍 Жұбайы: @${user.spouse.split('@')[0]}` : '💔 Бойдақ';
            await sock.sendMessage(from, { text: `👤 *${senderName}*\n🏷️ Атағы: ${user.title}\n💰 Баланс: ${user.balance} ₸\n✨ Карма: ${user.karma}\n${spouse}`, mentions: user.spouse ? [user.spouse] : [] });
        }

        // 12. РП
        else if (['құшақтау', 'сүю', 'ұру', 'шай', 'тамақ', 'ұйықтау'].includes(command)) {
            let action = '';
            if (command === 'құшақтау') action = 'құшақтап алды 🤗';
            else if (command === 'сүю') action = 'бетінен сүйді 😘';
            else if (command === 'ұру') action = 'басынан ұрды 👊';
            else if (command === 'шай') action = 'шай ішіп отыр ☕';
            else if (command === 'тамақ') action = 'тамақ жеп жатыр 🍕';
            else if (command === 'ұйықтау') action = 'ұйықтауға кетті 😴';
            await sock.sendMessage(from, { text: `🎭 *${senderName}* ${action}` });
        }

        // 👑 АДМИН
        if (sender === ADMIN_NUMBER && command === '!addmoney' && targetUser) {
            const amount = parseInt(args[2]);
            getUser(targetUser).balance += amount; saveDB();
            await sock.sendMessage(from, { text: `✅ ${amount} ₸ қосылды!` });
        }

    });
}

connectToWhatsApp();
