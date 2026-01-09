require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, getDocs, query, where } = require("firebase/firestore");

// --- 1. CONFIGURATION FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDbtw2NBkjWC5xs0BZ9mhK3FtxVeXfDGYE",
  authDomain: "autotrad-9e90b.firebaseapp.com",
  projectId: "autotrad-9e90b",
  storageBucket: "autotrad-9e90b.firebasestorage.app",
  messagingSenderId: "359414519740",
  appId: "1:359414519740:web:8c6b99de8769ad1dda3db9",
  measurementId: "G-RGNLJVKNZK"
};

const appFb = initializeApp(firebaseConfig);
const db = getFirestore(appFb);

// --- 2. CONFIGURATION BOT ---
// Soloy ny Token-nao eto raha tsy mampiasa Environment Variables ianao
const token = process.env.BOT_TOKEN || "8423411883:AAEUmoFnqTelBhw-yDgBoa2vTMl6Z79DDik"; 
const ADMIN_ID = 8207051152; 
const DEPOSIT_ADDRESS = "0x12DAf4A9bCbfC537Dd06DB89789235110A521797";

const bot = new TelegramBot(token, { polling: true });

// --- 3. SERVER KEEP-ALIVE (Ho an'ny Render) ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Autotrad Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- VARIABLES ---
const userStates = {}; 

// --- MENUS ---
const mainMenu = {
    reply_markup: {
        keyboard: [
            ['👤 Profil', '💰 Balance'],
            ['📥 Dépôt', '📤 Retrait'],
            ['💵 Capital', '🤖 AI Trading'],
            ['📈 Plan Invest.', '📜 Historique'],
            ['👥 Referral', '❓ FAQ'],
            ['📞 Service Client']
        ],
        resize_keyboard: true
    }
};

const faqText = `
❓ **FOIRE AUX QUESTIONS (FAQ)**

1. **Qu'est-ce que AUTOTRAD ?**
   Plateforme de trading automatisée par IA.
2. **Comment commencer ?**
   Faites un dépôt via l'onglet Dépôt (Min 10$).
3. **Retraits ?**
   Min 2$, Frais 1$. Adresse BEP20 uniquement.
4. **Plans ?**
   Plan 1 (10-200$): 2%/jour
   Plan 2 (201-1000$): 2.2%/jour
   Plan 3 (+1001$): 2.4%/jour
5. **Parrainage ?**
   5% dépôt + 0.1% gains trading.
`;

// --- FONCTIONS UTILITAIRES ---

async function getUser(userId) {
    const docRef = doc(db, "users", userId.toString());
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) return docSnap.data();
    return null;
}

async function registerUser(user, referrerId = null) {
    const userId = user.id.toString();
    const existing = await getUser(userId);
    if (!existing) {
        await setDoc(doc(db, "users", userId), {
            id: userId,
            firstName: user.first_name,
            username: user.username || "Aucun",
            balance: 0,
            capital: 0,
            referrerId: referrerId,
            lastTrade: null,
            joinedAt: new Date().toISOString()
        });
        return true;
    }
    return false;
}

// --- COMMANDES DE BASE ---

bot.onText(/\/start (.+)?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const referrerId = match[1] ? match[1] : null;
    await registerUser(msg.from, referrerId);
    bot.sendMessage(chatId, `Bienvenue ${msg.from.first_name} sur **AUTOTRAD AI** 🤖.`, { parse_mode: 'Markdown', ...mainMenu });
});

// --- GESTION DES MESSAGES ---

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id.toString();

    // 1. Gestion Admin Reply
    if (userStates[userId]?.type === 'ADMIN_REPLY' && text) {
        const targetId = userStates[userId].targetId;
        bot.sendMessage(targetId, `📩 **Réponse du Support:**\n\n${text}`, { parse_mode: 'Markdown' });
        bot.sendMessage(chatId, "✅ Réponse envoyée.");
        delete userStates[userId];
        return;
    }

    // 2. Gestion Input Utilisateur (Depot/Retrait/Support)
    if (userStates[userId] && text !== 'Retour') {
        handleUserInput(chatId, userId, text, msg);
        return;
    }

    // 3. Menu Principal
    switch (text) {
        case '👤 Profil':
            const u = await getUser(userId);
            if (!u) return;
            bot.sendMessage(chatId, `👤 **PROFIL**\n🆔: \`${u.id}\`\n💰 Balance: ${u.balance.toFixed(2)}$\n💵 Capital: ${u.capital.toFixed(2)}$\n🔗 Parrain: ${u.referrerId || "Aucun"}`, { parse_mode: 'Markdown' });
            break;

        case '💰 Balance':
            const b = await getUser(userId);
            bot.sendMessage(chatId, `💰 **Balance Disponible:** ${b.balance.toFixed(2)} $`);
            break;

        case '💵 Capital':
            const c = await getUser(userId);
            bot.sendMessage(chatId, `💵 **Capital Actif:** ${c.capital.toFixed(2)} $`);
            break;

        case '📥 Dépôt':
            userStates[userId] = { type: 'DEPOSIT_AMOUNT' };
            bot.sendMessage(chatId, "📥 **Dépôt USDT (BEP20)**\n\nEntrez le montant (Min 10$):", { reply_markup: { keyboard: [['Retour']], resize_keyboard: true }});
            break;

        case '📤 Retrait':
            const userW = await getUser(userId);
            if (userW.balance < 2) { // Min 2$
                bot.sendMessage(chatId, "⚠️ Solde insuffisant. Minimum de retrait: 2$");
            } else {
                userStates[userId] = { type: 'WITHDRAW_AMOUNT' };
                bot.sendMessage(chatId, `📤 **Retrait**\nSolde: ${userW.balance.toFixed(2)}$\n\nEntrez le montant à retirer (Min 2$, Frais 1$):`, { reply_markup: { keyboard: [['Retour']], resize_keyboard: true }});
            }
            break;

        case '🤖 AI Trading':
            handleTrading(chatId, userId);
            break;

        case '📈 Plan Invest.':
            bot.sendMessage(chatId, "📊 **PLANS**\n\nPlan 1 (10-200$): 2%/jour\nPlan 2 (201-1000$): 2.2%/jour\nPlan 3 (+1001$): 2.4%/jour");
            break;

        case '📜 Historique':
            handleHistory(chatId, userId);
            break;

        case '👥 Referral':
            bot.sendMessage(chatId, `🔗 **Lien:** https://t.me/Autotrad_AIbot?start=${userId}\n\n🎁 Gains: 5% Dépôt + 0.1% Trading.`);
            break;

        case '❓ FAQ':
            bot.sendMessage(chatId, faqText, { parse_mode: 'Markdown' });
            break;

        case '📞 Service Client':
            userStates[userId] = { type: 'SUPPORT_MESSAGE' };
            bot.sendMessage(chatId, "📞 Écrivez votre message pour le support:", { reply_markup: { keyboard: [['Retour']], resize_keyboard: true }});
            break;

        case 'Retour':
            delete userStates[userId];
            bot.sendMessage(chatId, "Menu Principal", mainMenu);
            break;
    }
});

// --- LOGIQUE INPUTS (Dépôt, Retrait, etc.) ---

async function handleUserInput(chatId, userId, text, msg) {
    const state = userStates[userId];

    // --- DÉPÔT ---
    if (state.type === 'DEPOSIT_AMOUNT') {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount < 10) {
            bot.sendMessage(chatId, "⚠️ Montant invalide (Min 10$). Réessayez:");
            return;
        }
        userStates[userId] = { type: 'DEPOSIT_PROOF', amount: amount };
        bot.sendMessage(chatId, `💳 **Envoyez ${amount}$ USDT BEP20**\n\nAdresse:\n\`${DEPOSIT_ADDRESS}\`\n\nAprès envoi, cliquez sur '✅ Terminé'.`, {
            parse_mode: 'Markdown',
            reply_markup: { keyboard: [['✅ Terminé', 'Retour']], resize_keyboard: true }
        });
    }
    else if (state.type === 'DEPOSIT_PROOF' && text === '✅ Terminé') {
        userStates[userId] = { type: 'WAITING_PHOTO', amount: state.amount };
        bot.sendMessage(chatId, "📸 Envoyez la capture d'écran (Preuve).");
    }
    else if (state.type === 'WAITING_PHOTO') {
        if (!msg.photo) { bot.sendMessage(chatId, "⚠️ Envoyez une image."); return; }
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        
        // Notifier Admin
        bot.sendPhoto(ADMIN_ID, photoId, {
            caption: `📥 **DÉPÔT EN ATTENTE**\nUser: ${msg.from.first_name} (ID: ${userId})\nMontant: ${state.amount}$`,
            reply_markup: { inline_keyboard: [[{ text: "✅ Valider", callback_data: `appr_dep_${userId}_${state.amount}` }, { text: "❌ Rejeter", callback_data: `rej_dep_${userId}` }]] }
        });
        bot.sendMessage(chatId, "⏳ En attente de validation admin.", mainMenu);
        delete userStates[userId];
    }

    // --- RETRAIT (NOUVEAU) ---
    else if (state.type === 'WITHDRAW_AMOUNT') {
        const amount = parseFloat(text);
        const user = await getUser(userId);
        
        // Vérification Solde (Montant + 1$ frais)
        if (isNaN(amount) || amount < 2) {
            bot.sendMessage(chatId, "⚠️ Minimum 2$. Réessayez:");
            return;
        }
        if (user.balance < (amount + 1)) {
            bot.sendMessage(chatId, `⚠️ Solde insuffisant pour ${amount}$ + 1$ de frais.\nSolde: ${user.balance}$`);
            return;
        }

        userStates[userId] = { type: 'WITHDRAW_ADDRESS', amount: amount };
        bot.sendMessage(chatId, "🏦 Entrez votre adresse **USDT BEP20** (doit commencer par 0x) :");
    }
    else if (state.type === 'WITHDRAW_ADDRESS') {
        const address = text.trim();
        // Validation simple BEP20
        if (!address.startsWith("0x") || address.length < 20) {
            bot.sendMessage(chatId, "⚠️ Adresse invalide. Elle doit commencer par '0x'. Réessayez ou tapez 'Retour'.");
            return;
        }

        // Envoi demande à l'Admin
        const amount = state.amount;
        bot.sendMessage(ADMIN_ID, `📤 **DEMANDE DE RETRAIT**\n\nUser: ${msg.from.first_name} (ID: ${userId})\nMontant: ${amount}$\nAdresse: \`${address}\`\n\nSolde actuel: ${(await getUser(userId)).balance}$`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "✅ Payer", callback_data: `appr_with_${userId}_${amount}` }, { text: "❌ Refuser", callback_data: `rej_with_${userId}` }]] }
        });

        bot.sendMessage(chatId, "⏳ Demande de retrait envoyée. En attente de validation.", mainMenu);
        delete userStates[userId];
    }

    // --- SUPPORT ---
    else if (state.type === 'SUPPORT_MESSAGE') {
        bot.sendMessage(ADMIN_ID, `📩 **SUPPORT**\nDe: ${msg.from.first_name} (${userId})\n"${text}"`, {
            reply_markup: { inline_keyboard: [[{ text: "✉️ Répondre", callback_data: `reply_sup_${userId}` }]] }
        });
        bot.sendMessage(chatId, "✅ Message envoyé.", mainMenu);
        delete userStates[userId];
    }
}

// --- LOGIQUE TRADING ---

async function handleTrading(chatId, userId) {
    const user = await getUser(userId);
    if (!user || user.capital <= 0) {
        bot.sendMessage(chatId, "⚠️ Capital vide. Veuillez faire un dépôt.");
        return;
    }

    const now = new Date();
    if (user.lastTrade) {
        const diffHours = Math.ceil(Math.abs(now - new Date(user.lastTrade)) / 36e5);
        if (diffHours < 24) { bot.sendMessage(chatId, `⚠️ Revenez dans ${(24 - diffHours)} heures.`); return; }
    }

    bot.sendMessage(chatId, "🤖 Trading en cours... (Patientez 30s)");
    
    setTimeout(async () => {
        let rate = user.capital <= 200 ? 0.02 : (user.capital <= 1000 ? 0.022 : 0.024);
        const profit = user.capital * rate;

        await updateDoc(doc(db, "users", userId), { balance: increment(profit), lastTrade: now.toISOString() });
        await addDoc(collection(db, "transactions"), { userId, type: "TRADING_PROFIT", amount: profit, date: now.toISOString() });

        if (user.referrerId) {
            await updateDoc(doc(db, "users", user.referrerId), { balance: increment(profit * 0.001) });
        }

        bot.sendMessage(chatId, `✅ **Gain:** +${profit.toFixed(2)}$ ajouté à la balance.`, mainMenu);
    }, 30000); 
}

// --- CALLBACKS ADMIN ---

bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    // VALIDATION DEPOT
    if (data.startsWith('appr_dep_')) {
        const [_, __, uid, amt] = data.split('_');
        const amount = parseFloat(amt);
        
        await updateDoc(doc(db, "users", uid), { capital: increment(amount) });
        // Bonus parrain
        const u = await getUser(uid);
        if (u.referrerId) await updateDoc(doc(db, "users", u.referrerId), { balance: increment(amount * 0.05) });

        await addDoc(collection(db, "transactions"), { userId: uid, type: "DEPOSIT", amount, date: new Date().toISOString(), status: "APPROVED" });
        
        bot.sendMessage(uid, `✅ Dépôt de ${amount}$ confirmé !`);
        bot.editMessageCaption(`✅ Dépôt ${amount}$ VALIDÉ.`, { chat_id: chatId, message_id: msgId });
    }
    
    // REJET DEPOT
    if (data.startsWith('rej_dep_')) {
        const uid = data.split('_')[2];
        bot.sendMessage(uid, "❌ Dépôt refusé.");
        bot.editMessageCaption(`❌ Dépôt REJETÉ.`, { chat_id: chatId, message_id: msgId });
    }

    // VALIDATION RETRAIT
    if (data.startsWith('appr_with_')) {
        const [_, __, uid, amt] = data.split('_');
        const amount = parseFloat(amt);
        const totalDed = amount + 1; // Montant + Frais

        // Vérification ultime solde
        const u = await getUser(uid);
        if (u.balance < totalDed) {
            bot.sendMessage(ADMIN_ID, "⚠️ Erreur: Le solde de l'utilisateur a baissé entre temps.");
            return;
        }

        await updateDoc(doc(db, "users", uid), { balance: increment(-totalDed) });
        await addDoc(collection(db, "transactions"), { userId: uid, type: "WITHDRAWAL", amount, date: new Date().toISOString(), status: "SENT" });

        bot.sendMessage(uid, `✅ Retrait de ${amount}$ validé et envoyé ! (Frais: 1$)`);
        bot.editMessageCaption(`✅ Retrait ${amount}$ PAYÉ.`, { chat_id: chatId, message_id: msgId });
    }

    // REJET RETRAIT
    if (data.startsWith('rej_with_')) {
        const uid = data.split('_')[2];
        bot.sendMessage(uid, "❌ Retrait refusé. Contactez le support.");
        bot.editMessageCaption(`❌ Retrait REJETÉ.`, { chat_id: chatId, message_id: msgId });
    }

    // REPONSE SUPPORT
    if (data.startsWith('reply_sup_')) {
        const uid = data.split('_')[2];
        userStates[ADMIN_ID.toString()] = { type: 'ADMIN_REPLY', targetId: uid };
        bot.sendMessage(ADMIN_ID, `✍️ Entrez la réponse pour l'utilisateur ID: ${uid}`);
    }
});

// --- HISTORIQUE ---
async function handleHistory(chatId, userId) {
    const q = query(collection(db, "transactions"), where("userId", "==", userId));
    const snapshot = await getDocs(q);
    let msg = snapshot.empty ? "Aucun historique." : "📜 **HISTORIQUE**\n\n";
    snapshot.forEach(d => { const data = d.data(); msg += `🔹 ${data.type}: ${data.amount.toFixed(2)}$\n`; });
    bot.sendMessage(chatId, msg);
}
