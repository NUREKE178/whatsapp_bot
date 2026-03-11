const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// 🔴 БАПТАУЛАР
const ADMIN_NUMBER = '77077052009@c.us'; // Өз нөміріңіз
const DB_FILE = './database.json';

// 📂 ДЕРЕКТЕР БАЗАСЫ
let db = {
    users: {},
    clans: {},
    groups: {}
};

if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE));
    } catch (e) {
        console.log('⚠️ База қатесі, жаңасын бастаймыз.');
    }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(id) {
    if (!db.users[id]) {
        db.users[id] = {
            balance: 1000,
            karma: 0,
            spouse: null,
            lastBonus: 0,
            messages: 0,
            title: "Жай адам",
            clan: null,
            inventory: [],
            warnings: 0
        };
        saveDB();
    }
    return db.users[id];
}

function getGroup(id) {
    if (!db.groups[id]) {
        db.groups[id] = { welcome: true, antilink: false, badwords: true };
        saveDB();
    }
    return db.groups[id];
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ IRIS COMFORT PRO ҚОСЫЛДЫ!'));

// 👋 ЖАҢА АДАМ КЕЛГЕНДЕ
client.on('group_join', async (notification) => {
    const chat = await notification.getChat();
    const groupSettings = getGroup(chat.id._serialized);
    
    if (groupSettings.welcome) {
        for (const recipient of notification.recipientIds) {
            const contact = await client.getContactById(recipient);
            const name = contact.pushname || contact.number;
            await chat.sendMessage(`👋 Қош келдің, *${name}*!
Топ ережелерін сақта. Командалар: *!меню*`);
        }
    }
});

client.on('message', async (msg) => {
    const chat = await msg.getChat();
    const contact = await msg.getContact();
    const senderId = contact.id._serialized;
    const senderName = contact.pushname || contact.number;
    const text = msg.body.trim();
    const lowerText = text.toLowerCase();
    const args = lowerText.split(' ');
    const command = args[0];

    // Статистика
    const user = getUser(senderId);
    user.messages += 1;
    saveDB();

    // 🤬 БОҚТЫҚ СӨЗДЕР ФИЛЬТРІ (Комфорт үшін)
    const badWords = ['қотақ', 'сігіл', 'ам', 'mal', 'ебан'];
    if (badWords.some(word => lowerText.includes(word))) {
        user.warnings += 1;
        saveDB();
        await msg.reply(`⚠️ *ЕСКЕРТУ!* Боқтауға болмайды!
Ескерту саны: ${user.warnings}/3`);
        if (user.warnings >= 3) {
            // Егер бот админ болса, шығарып жібереді (қаласаңыз қосуға болады)
            // await chat.removeParticipants([senderId]);
            user.warnings = 0;
            saveDB();
            await client.sendMessage(msg.from, `🚫 @${senderId.split('@')[0]} ереже бұзғаны үшін банға лайық!`, { mentions: [senderId] });
        }
        return; // Ары қарай команда орындамау
    }

    // 💡 АҚЫЛДЫ ЖАУАП (AI Симуляция)
    if (lowerText.startsWith('бот,')) {
        const answers = [
            "Әрине!", "Мүмкін емес.", "Ойланып көру керек...", 
            "Сөзсіз!", "Білмеймін, бірақ қызық сұрақ.", "Жоқ.", "Иә!"
        ];
        const randomAns = answers[Math.floor(Math.random() * answers.length)];
        await msg.reply(`🤖 ${randomAns}`);
        return;
    }

    // 📝 ПОДСКАЗКА
    if (['сәлем', 'салам', 'привет', 'бот'].includes(lowerText)) {
        await msg.reply(`👋 Сәлем, *${senderName}*!
Көмек керек пе? 👉 *!меню* деп жаз.`);
    }

    // ════════════════════════════════════════
    // 🌍 НЕГІЗГІ КОМАНДАЛАР
    // ════════════════════════════════════════

    if (command === '!меню' || command === 'меню') {
        await client.sendMessage(msg.from, `🤖 *IRIS COMFORT PRO*

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
шай құю, тамақ беру

⚙️ *БАСҚА:*
!атақ [ат] - Жаңа статус (5000₸)
!бот [сұрақ] - Сұрақ қою`);
    }

    // 🔍 !КІМ (Жаңартылған)
    else if (command === '!кім') {
        let targetId = senderId;
        let targetName = senderName;

        if (msg.hasQuotedMsg) {
            const quoted = await msg.getQuotedMessage();
            targetId = quoted.author || quoted.from;
            const tContact = await client.getContactById(targetId);
            targetName = tContact.pushname || tContact.number;
        } else if (msg.mentionedIds.length > 0) {
            targetId = msg.mentionedIds[0];
            const tContact = await client.getContactById(targetId);
            targetName = tContact.pushname || tContact.number;
        }

        const tUser = getUser(targetId);
        const clanText = tUser.clan ? `🛡️ Клан: ${tUser.clan}` : '🛡️ Клан: Жоқ';
        
        await client.sendMessage(msg.from, `🔍 *ИНФО: ${targetName}*
🏷️ Атағы: ${tUser.title}
💬 Хаттар: ${tUser.messages}
💰 Баланс: ${tUser.balance} ₸
✨ Карма: ${tUser.karma}
${clanText}
💍 Жұбайы: ${tUser.spouse ? 'Бар ❤️' : 'Жоқ 💔'}`, { mentions: [targetId] });
    }

    // 💰 !БЕРУ (Ақша аудару)
    else if (command === '!беру' && msg.mentionedIds.length > 0) {
        const amount = parseInt(args[2]);
        const targetId = msg.mentionedIds[0];
        
        if (!amount || amount <= 0) return msg.reply('⚠️ Соманы дұрыс жазыңыз!');
        if (user.balance < amount) return msg.reply('❌ Ақшаңыз жетпейді!');
        if (targetId === senderId) return msg.reply('⚠️ Өзіңізге жібере алмайсыз!');

        user.balance -= amount;
        getUser(targetId).balance += amount;
        saveDB();

        await client.sendMessage(msg.from, `💸 *АУДАРЫМ:*
Сiz @${targetId.split('@')[0]} шотына ${amount} ₸ жібердіңіз!`, { mentions: [targetId] });
    }

    // 🛡️ !КЛАН (Жаңа жүйе)
    else if (command === '!клан') {
        if (!args[1]) {
            if (user.clan) {
                return msg.reply(`🛡️ Сіздің клан: *${user.clan}*
Шығу үшін: !клан шығу`);
            } else {
                return msg.reply(`🛡️ Сіз ешқандай кланда емессіз.
Құру үшін: !клан құру [аты] (10000 ₸)`);
            }
        }

        if (args[1] === 'құру') {
            const clanName = text.slice(11).trim();
            if (!clanName) return msg.reply('⚠️ Клан атын жазыңыз!');
            if (user.balance < 10000) return msg.reply('❌ Клан құру 10 000 ₸ тұрады!');
            
            user.balance -= 10000;
            user.clan = clanName;
            db.clans[clanName] = { owner: senderId, members: [senderId], bank: 0 };
            saveDB();
            await msg.reply(`✅ *${clanName}* кланы құрылды!`);
        }
    }

    // 🛍️ !ДҮКЕН
    else if (command === '!дүкен') {
        await msg.reply(`🛍️ *ДҮКЕН*
1. 👑 VIP Статус - 50 000 ₸ (!сатып 1)
2. 💍 Неке жүзігі - 5 000 ₸ (!сатып 2)
3. 🏎️ Көлік - 100 000 ₸ (!сатып 3)

Сатып алу үшін: *!сатып [номер]*`);
    }

    else if (command === '!сатып') {
        const item = parseInt(args[1]);
        if (item === 1) {
            if (user.balance < 50000) return msg.reply('❌ Ақша жетпейді!');
            user.balance -= 50000;
            user.title = "👑 VIP";
            saveDB();
            await msg.reply('✅ Сіз енді VIP статусындасыз!');
        }
        // Басқа заттарды қосуға болады...
    }

    // 🎭 РП КОМАНДАЛАР (Кеңейтілген)
    else if (['шай', 'тамақ', 'ұйықтау'].includes(command)) {
        let action = '';
        let targetId = null;

        if (msg.mentionedIds.length > 0) targetId = msg.mentionedIds[0];
        else if (msg.hasQuotedMsg) targetId = (await msg.getQuotedMessage()).author;

        if (command === 'шай') {
            if (targetId) action = `досына (@${targetId.split('@')[0]}) шай құйып берді ☕`;
            else action = `өзі шай ішіп отыр ☕`;
        } 
        else if (command === 'тамақ') {
            if (targetId) action = `досына (@${targetId.split('@')[0]}) дәмді тамақ ұсынды 🍔`;
            else action = `қарны ашып, тамақ жеп жатыр 🍕`;
        }
        else if (command === 'ұйықтау') {
            action = `шаршап, ұйықтауға кетті 😴`;
        }

        await client.sendMessage(msg.from, `🎭 *${senderName}* ${action}`, 
            targetId ? { mentions: [targetId] } : {}
        );
    }

    // 👑 АДМИН
    if (senderId === ADMIN_NUMBER) {
        if (command === '!addmoney') {
            const amount = parseInt(args[2]);
            getUser(msg.mentionedIds[0]).balance += amount; saveDB();
            await msg.reply(`✅ ${amount} ₸ берілді!`);
        }
        // Ботты өшіру (қажет болса)
        else if (command === '!off') {
            await msg.reply('😴 Бот ұйықтауға кетті...');
            process.exit(0);
        }
    }

    // ════════════════════════════════════════
    // ЕСКІ ФУНКЦИЯЛАР (Казино, Бонус, Неке)
    // ════════════════════════════════════════
    
    // БОНУС
    else if (command === '!бонус') {
        const now = Date.now();
        if (now - user.lastBonus < 43200000) return msg.reply('⏳ Бонус алғансыз!');
        const bonus = Math.floor(Math.random() * 400) + 100;
        user.balance += bonus; user.lastBonus = now; saveDB();
        await msg.reply(`🎁 +${bonus} ₸ алдыңыз!`);
    }

    // КАЗИНО
    else if (command === '!казино') {
        const bet = parseInt(args[1]);
        if (!bet || user.balance < bet) return msg.reply('❌ Қате!');
        const win = Math.random() > 0.5;
        if (win) { user.balance += bet; await msg.reply(`🎰 Жеңіс! +${bet} ₸`); }
        else { user.balance -= bet; await msg.reply(`😢 Ұтылыс... -${bet} ₸`); }
        saveDB();
    }

    // ҮЙЛЕНУ
    else if (command === '!үйлену' && msg.mentionedIds.length > 0) {
        const tId = msg.mentionedIds[0];
        if (!user.spouse && !getUser(tId).spouse) {
            user.spouse = tId; getUser(tId).spouse = senderId; saveDB();
            await client.sendMessage(msg.from, `💍 *НЕКЕ ҚИЫЛДЫ!* 🎉`, { mentions: [tId] });
        } else { await msg.reply('❌ Бос емес!'); }
    }

    // ПРОФИЛЬ
    else if (command === '!профиль') {
        const spouse = user.spouse ? `💍 Жұбайы: @${user.spouse.split('@')[0]}` : '💔 Бойдақ';
        const clan = user.clan ? `🛡️ Клан: ${user.clan}` : '🛡️ Клан: Жоқ';
        await client.sendMessage(msg.from, `👤 *${senderName}*
🏷️ Атағы: ${user.title}
💰 Баланс: ${user.balance} ₸
✨ Карма: ${user.karma}
${clan}
${spouse}`, { mentions: user.spouse ? [user.spouse] : [] });
    }
});

client.initialize();
