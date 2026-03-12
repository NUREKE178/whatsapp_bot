const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const express = require('express');

// ════════════════════════════════════════
// 🌐 ЖАЛҒАН СЕРВЕР (RENDER ҮШІН МАҢЫЗДЫ!)
// ════════════════════════════════════════
const app = express();
app.get('/', (req, res) => res.send('Бот 100% жұмыс істеп тұр! 🚀'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web-сервер ${PORT}-портта қосылды (Render ұйықтамайды)`));

// ════════════════════════════════════════
// 📂 ДЕРЕКТЕР БАЗАСЫ ЖӘНЕ БАПТАУЛАР
// ════════════════════════════════════════
const ADMIN_NUMBER = '77077052009@s.whatsapp.net'; // 🔴 ӨЗ НӨМІРІҢІЗДІ ЖАЗЫҢЫЗ
const DB_FILE = './database.json';
let db = { users: {}, clans: {}, groups: {} };

if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE)); } catch(e) { console.log('База қатесі'); }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(id) {
    if (!db.users[id]) {
        db.users[id] = { 
            balance: 1000, karma: 0, spouse: null, lastBonus: 0, 
            messages: 0, title: "Жай адам", clan: null, warnings: 0 
        };
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

// ════════════════════════════════════════
// 🤖 БОТТЫ ҚОСУ
// ════════════════════════════════════════
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // Логтарды таза ұстау
        printQRInTerminal: false,
        browser: ['Iris Pro Bot', 'Chrome', '2.0.0'],
        syncFullHistory: false
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n📱 QR КОДТЫ ТЕЛЕФОНМЕН СКАНЕРЛЕҢІЗ:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔄 Байланыс үзілді. Қайта қосылу:', shouldReconnect);
            if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
            else console.log('❌ Сессия жабылды (auth_info өшіріңіз).');
        } else if (connection === 'open') {
            console.log('\n✅ IRIS PRO БОТ ҚОСЫЛДЫ!\n');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // 👋 ТОПҚА АДАМ ҚОСЫЛҒАНДА
    sock.ev.on('group-participants.update', async (update) => {
        if (update.action === 'add') {
            const groupSettings = getGroup(update.id);
            if (groupSettings.welcome) {
                for (let participant of update.participants) {
                    await sock.sendMessage(update.id, { 
                        text: `👋 Сәлем, @${participant.split('@')[0]}!\nТопқа қош келдіңіз! Командаларды көру үшін *!меню* деп жазыңыз.`,
                        mentions: [participant] 
                    });
                }
            }
        }
    });

    // 📩 ХАБАРЛАМАЛАРДЫ ӨҢДЕУ
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = msg.key.participant || from;
        const senderName = msg.pushName || 'Адам';

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
        if (!text) return;

        const lowerText = text.toLowerCase().trim();
        const args = lowerText.split(' ');
        const command = args[0];

        // Статистика
        const user = getUser(sender);
        user.messages += 1;
        saveDB();

        console.log(`📩 [${senderName}]: ${lowerText}`);

        // Белгіленген адамдарды анықтау
        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const replyJid = msg.message.extendedTextMessage?.contextInfo?.participant;
        const targetUser = mentionedJid[0] || replyJid;

        // 🤬 ЦЕНЗУРА
        const badWords = ['қотақ', 'сігіл', 'ам', 'ебан', 'бля'];
        if (isGroup && badWords.some(word => lowerText.includes(word))) {
            user.warnings += 1;
            saveDB();
            await sock.sendMessage(from, { text: `⚠️ *ЕСКЕРТУ!* Боқтауға тыйым салынған!\nЕскерту саны: ${user.warnings}/3` }, { quoted: msg });
            return; 
        }

        // 💡 АҚЫЛДЫ ЖАУАП / ПОДСКАЗКА
        if (lowerText === 'сәлем' || lowerText === 'салам' || lowerText === 'бот') {
            await sock.sendMessage(from, { text: `👋 Сәлем, *${senderName}*!\nМен толыққанды IRIS ботпын. Көмек үшін *!меню* жазыңыз.` });
            return;
        }

        if (lowerText.startsWith('бот,')) {
            const answers = ["Әрине!", "Мүмкін емес.", "Ойланып көру керек...", "Иә!", "Жоқ!"];
            const randomAns = answers[Math.floor(Math.random() * answers.length)];
            await sock.sendMessage(from, { text: `🤖 ${randomAns}` }, { quoted: msg });
            return;
        }

        // ════════════════════════════════════════
        // 🤖 ТОЛЫҚ КОМАНДАЛАР
        // ════════════════════════════════════════

        // 1. МЕНЮ
        if (command === '!меню' || command === 'меню') {
            const menuText = `🤖 *IRIS PRO МӘЗІРІ*

👤 *ПРОФИЛЬ:*
!кім - Адам инфосы
!профиль - Өзің туралы
!топ - Белсенділер рейтингі
!клан - Клан жүйесі

💰 *ЭКОНОМИКА:*
!бонус - Ақша алу
!казино [сома] - Ойын
!дүкен - Зат сатып алу
!беру @адам [сома] - Аударым

🎭 *РӨЛДІК (RP):*
!үйлену @адам, !ажырасу
құшақтау @адам, сүю, ұру
шай құю, тамақ беру, ұйықтау

⚙️ *БАСҚА:*
+ / - (reply жасап) - Карма
!атақ [ат] - Жаңа статус (5000₸)`;
            await sock.sendMessage(from, { text: menuText });
        }

        // 2. !КІМ (WHOIS)
        else if (command === '!кім') {
            let tId = targetUser || sender;
            let tName = senderName;

            if (targetUser) {
                const tContact = await sock.onWhatsApp(tId);
                tName = tContact[0]?.exists ? tId.split('@')[0] : 'Адам';
            }

            const tUser = getUser(tId);
            const clanText = tUser.clan ? `🛡️ Клан: ${tUser.clan}` : '🛡️ Клан: Жоқ';
            const spouseText = tUser.spouse ? `Бар ❤️` : 'Жоқ 💔';
            
            await sock.sendMessage(from, { text: `🔍 *ИНФО:*
👤 Аты/Нөмірі: @${tId.split('@')[0]}
🏷️ Атағы: ${tUser.title}
💬 Хаттар: ${tUser.messages}
💰 Баланс: ${tUser.balance} ₸
✨ Карма: ${tUser.karma}
${clanText}
💍 Жұбайы: ${spouseText}`, mentions: [tId] });
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

        // 4. ЭКОНОМИКА (Бонус, Казино, Беру, Дүкен, Атақ)
        else if (command === '!бонус') {
            const now = Date.now();
            if (now - user.lastBonus < 43200000) {
                await sock.sendMessage(from, { text: `⏳ Күте тұрыңыз!` });
            } else {
                const bonus = Math.floor(Math.random() * 400) + 100;
                user.balance += bonus; user.lastBonus = now; saveDB();
                await sock.sendMessage(from, { text: `🎁 Сіз ${bonus} ₸ бонус алдыңыз!\nБаланс: ${user.balance} ₸` });
            }
        }

        else if (command === '!казино') {
            const bet = parseInt(args[1]);
            if (!bet || user.balance < bet) return sock.sendMessage(from, { text: '❌ Ақша жетпейді немесе қате!' });
            const win = Math.random() > 0.5;
            if (win) { user.balance += bet; await sock.sendMessage(from, { text: `🎰 Жеңіс! +${bet} ₸\nБаланс: ${user.balance} ₸` }); }
            else { user.balance -= bet; await sock.sendMessage(from, { text: `😢 Ұтылыс... -${bet} ₸\nБаланс: ${user.balance} ₸` }); }
            saveDB();
        }

        else if (command === '!беру' && targetUser) {
            const amount = parseInt(args[2]);
            if (!amount || user.balance < amount || targetUser === sender) return sock.sendMessage(from, { text: '❌ Қателік!' });
            user.balance -= amount; getUser(targetUser).balance += amount; saveDB();
            await sock.sendMessage(from, { text: `💸 Сіз @${targetUser.split('@')[0]} шотына ${amount} ₸ жібердіңіз!`, mentions: [targetUser] });
        }

        else if (command === '!дүкен') {
            await sock.sendMessage(from, { text: `🛍️ *ДҮКЕН*\n\n1. 👑 VIP Статус - 50 000 ₸ (!сатып 1)\n2. 💍 Жүзік - 5 000 ₸ (!сатып 2)\n\nАлу үшін: !сатып [номер]` });
        }

        else if (command === '!сатып') {
            const item = parseInt(args[1]);
            if (item === 1 && user.balance >= 50000) {
                user.balance -= 50000; user.title = "👑 VIP"; saveDB();
                await sock.sendMessage(from, { text: '✅ Сіз енді VIP статусындасыз!' });
            } else {
                await sock.sendMessage(from, { text: '❌ Ақша жетпейді немесе тауар жоқ.' });
            }
        }

        else if (command === '!атақ') {
            const newTitle = text.slice(6).trim();
            if (!newTitle || user.balance < 5000) return sock.sendMessage(from, { text: '❌ Ақша жетпейді (5000₸ керек) немесе қате!' });
            user.balance -= 5000; user.title = newTitle; saveDB();
            await sock.sendMessage(from, { text: `✅ Жаңа атағыңыз: *${newTitle}*` });
        }

        // 5. КЛАН
        else if (command === '!клан') {
            if (!args[1]) {
                const txt = user.clan ? `🛡️ Сіздің клан: *${user.clan}*\nШығу: !клан шығу` : `🛡️ Клан жоқ.\nҚұру: !клан құру [ат] (10000 ₸)`;
                return sock.sendMessage(from, { text: txt });
            }
            if (args[1] === 'құру' && user.balance >= 10000) {
                const clanName = text.slice(11).trim();
                user.balance -= 10000; user.clan = clanName;
                db.clans[clanName] = { owner: sender, members: [sender] }; saveDB();
                await sock.sendMessage(from, { text: `✅ *${clanName}* кланы құрылды!` });
            }
        }

        // 6. КАРМА
        else if ((lowerText === '+' || lowerText === '-') && replyJid) {
            if (replyJid === sender) return;
            const target = getUser(replyJid);
            if (lowerText === '+') { target.karma += 1; await sock.sendMessage(from, { text: `✨ Карма өсті! (${target.karma})` }); }
            else { target.karma -= 1; await sock.sendMessage(from, { text: `🔻 Карма түсті... (${target.karma})` }); }
            saveDB();
        }

        // 7. НЕКЕ
        else if (command === '!үйлену' && targetUser) {
            if (user.spouse || getUser(targetUser).spouse) return sock.sendMessage(from, { text: '❌ Бос емес!' });
            user.spouse = targetUser; getUser(targetUser).spouse = sender; saveDB();
            await sock.sendMessage(from, { text: `💍 *НЕКЕ ҚИЫЛДЫ!* 🎉\n@${sender.split('@')[0]} ❤️ @${targetUser.split('@')[0]}`, mentions: [sender, targetUser] });
        }
        else if (command === '!ажырасу' && user.spouse) {
            const ex = user.spouse; user.spouse = null; getUser(ex).spouse = null; saveDB();
            await sock.sendMessage(from, { text: '💔 Ажырастыңыз...' });
        }

        // 8. ПРОФИЛЬ
        else if (command === '!профиль' || command === 'профиль') {
            const spouse = user.spouse ? `💍 Жұбайы: @${user.spouse.split('@')[0]}` : '💔 Бойдақ';
            const clan = user.clan ? `🛡️ Клан: ${user.clan}` : '🛡️ Клан: Жоқ';
            await sock.sendMessage(from, { text: `👤 *${senderName}*\n🏷️ Атағы: ${user.title}\n💰 Баланс: ${user.balance} ₸\n✨ Карма: ${user.karma}\n${clan}\n${spouse}`, mentions: user.spouse ? [user.spouse] : [] });
        }

        // 9. РП (РӨЛДІК ОЙЫНДАР)
        else if (['құшақтау', 'сүю', 'ұру', 'шай', 'тамақ', 'ұйықтау'].includes(command)) {
            let action = '';
            if (command === 'құшақтау') action = targetUser ? `досын (@${targetUser.split('@')[0]}) құшақтап алды 🤗` : 'барлығын құшақтады 🤗';
            else if (command === 'сүю') action = targetUser ? `досын (@${targetUser.split('@')[0]}) сүйді 😘` : 'барлығына сүйіс жіберді 😘';
            else if (command === 'ұру') action = targetUser ? `досын (@${targetUser.split('@')[0]}) басынан ұрды 👊` : 'ауаны ұрды 👊';
            else if (command === 'шай') action = targetUser ? `досына (@${targetUser.split('@')[0]}) шай құйды ☕` : 'шай ішіп отыр ☕';
            else if (command === 'тамақ') action = targetUser ? `досына (@${targetUser.split('@')[0]}) дәмді тамақ берді 🍔` : 'тамақ жеп жатыр 🍕';
            else if (command === 'ұйықтау') action = 'шаршап, ұйықтауға кетті 😴';

            const mentions = targetUser ? [targetUser] : [];
            await sock.sendMessage(from, { text: `🎭 *${senderName}* ${action}`, mentions: mentions });
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
