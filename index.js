const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, addDoc, serverTimestamp, orderBy } = require("firebase/firestore");
const express = require('express');
const axios = require('axios');
require('dotenv').config();

// Initialisation de l'application Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDbtw2NBkjWC5xs0BZ9mhK3FtxVeXfDGYE",
  authDomain: "autotrad-9e90b.firebaseapp.com",
  projectId: "autotrad-9e90b",
  storageBucket: "autotrad-9e90b.firebasestorage.app",
  messagingSenderId: "359414519740",
  appId: "1:359414519740:web:8c6b99de8769ad1dda3db9",
  measurementId: "G-RGNLJVKNZK"
};

// Initialiser Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Configuration du bot Telegram
const token = '8423411883:AAEUmoFnqTelBhw-yDgBoa2vTMl6Z79DDik';
const bot = new TelegramBot(token, { 
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

// ID Admin
const ADMIN_ID = 8207051152;

// Adresse de dépôt fixe
const DEPOSIT_ADDRESS = '0x12DAf4A9bCbfC537Dd06DB89789235110A521797';

// Variables d'état
const userStates = {};
const userData = {};
const botUrl = 'https://autotrad-bot.onrender.com';

// Plans d'investissement
const INVESTMENT_PLANS = {
  1: { min: 10, max: 200, dailyRate: 2.0, name: "Plan Basique" },
  2: { min: 201, max: 1000, dailyRate: 2.2, name: "Plan Standard" },
  3: { min: 1001, max: 1000000, dailyRate: 2.4, name: "Plan Premium" }
};

// Fonction pour maintenir le bot actif
async function keepBotAlive() {
  try {
    await axios.get(`${botUrl}/health`);
    console.log('✅ Bot pingé pour rester actif:', new Date().toLocaleString());
  } catch (error) {
    console.log('⚠️ Erreur lors du ping:', error.message);
  }
}

// Ping toutes les 5 minutes
setInterval(keepBotAlive, 5 * 60 * 1000);

// Fonction pour générer un code de référence
function generateReferralCode(userId) {
  return 'REF' + userId.toString().slice(-6) + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// Fonction pour formater les nombres
function formatNumber(num) {
  return parseFloat(num).toFixed(2);
}

// Fonction pour sauvegarder l'utilisateur
async function saveUser(user) {
  try {
    const userRef = doc(db, "users", user.id.toString());
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      const referralCode = generateReferralCode(user.id);
      await setDoc(userRef, {
        id: user.id,
        username: user.username || '',
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        balance: 0,
        capital: 0,
        referralCode: referralCode,
        referredBy: null,
        referralEarnings: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalEarnings: 0,
        currentPlan: null,
        lastTradingDate: null,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log(`✅ Nouvel utilisateur enregistré: ${user.id}`);
    }
    return userRef;
  } catch (error) {
    console.error('❌ Erreur saveUser:', error);
    return null;
  }
}

// Fonction pour obtenir les données utilisateur
async function getUserData(userId) {
  try {
    const userRef = doc(db, "users", userId.toString());
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? userSnap.data() : null;
  } catch (error) {
    console.error('❌ Erreur getUserData:', error);
    return null;
  }
}

// Fonction pour mettre à jour le solde
async function updateBalance(userId, amount, type = 'balance') {
  try {
    const userRef = doc(db, "users", userId.toString());
    const userData = await getUserData(userId);
    
    if (userData) {
      if (type === 'balance') {
        await updateDoc(userRef, {
          balance: userData.balance + amount,
          updatedAt: serverTimestamp()
        });
        console.log(`✅ Solde mis à jour pour ${userId}: ${amount}`);
      } else if (type === 'capital') {
        await updateDoc(userRef, {
          capital: userData.capital + amount,
          totalDeposits: userData.totalDeposits + (amount > 0 ? amount : 0),
          updatedAt: serverTimestamp()
        });
        console.log(`✅ Capital mis à jour pour ${userId}: ${amount}`);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Erreur updateBalance:', error);
    return false;
  }
}

// Fonction pour enregistrer une transaction
async function recordTransaction(userId, type, amount, status = 'pending', address = null, proof = null) {
  try {
    const transactionRef = collection(db, "transactions");
    const transactionData = {
      userId: userId,
      type: type,
      amount: amount,
      status: status,
      address: address,
      proofImage: proof,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(transactionRef, transactionData);
    console.log(`✅ Transaction enregistrée: ${type} - ${amount} - ${status} pour ${userId}`);
    return docRef.id;
  } catch (error) {
    console.error('❌ Erreur recordTransaction:', error);
    return null;
  }
}

// Fonction pour obtenir l'historique des transactions
async function getTransactionHistory(userId) {
  try {
    const transactionsRef = collection(db, "transactions");
    const q = query(transactionsRef, where("userId", "==", userId), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    const transactions = [];
    querySnapshot.forEach(doc => {
      const data = doc.data();
      transactions.push({ 
        id: doc.id, 
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate() : null
      });
    });
    
    console.log(`✅ Historique récupéré pour ${userId}: ${transactions.length} transactions`);
    return transactions;
  } catch (error) {
    console.error('❌ Erreur getTransactionHistory:', error);
    return [];
  }
}

// Fonction pour obtenir les transactions en attente
async function getPendingTransactions(type) {
  try {
    const transactionsRef = collection(db, "transactions");
    const q = query(transactionsRef, where("status", "==", "pending"), where("type", "==", type));
    const querySnapshot = await getDocs(q);
    
    const transactions = [];
    querySnapshot.forEach(doc => {
      transactions.push({ id: doc.id, ...doc.data() });
    });
    
    return transactions;
  } catch (error) {
    console.error('❌ Erreur getPendingTransactions:', error);
    return [];
  }
}

// Fonction pour traiter le trading
async function processTrading(userId) {
  try {
    const userData = await getUserData(userId);
    
    if (!userData || userData.capital === 0 || !userData.currentPlan) {
      return { success: false, message: "Vous devez avoir un capital et un plan actif pour trader." };
    }
    
    // Vérifier si le trading a déjà été fait aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (userData.lastTradingDate) {
      const lastTradeDate = userData.lastTradingDate.toDate();
      lastTradeDate.setHours(0, 0, 0, 0);
      
      if (lastTradeDate.getTime() === today.getTime()) {
        return { success: false, message: "Vous avez déjà effectué un trading aujourd'hui." };
      }
    }
    
    // Calculer les gains selon le plan
    const plan = INVESTMENT_PLANS[userData.currentPlan];
    const dailyEarnings = (userData.capital * plan.dailyRate) / 100;
    
    // Mettre à jour le solde
    await updateBalance(userId, dailyEarnings);
    
    // Mettre à jour la date du dernier trading
    const userRef = doc(db, "users", userId.toString());
    await updateDoc(userRef, {
      lastTradingDate: serverTimestamp(),
      totalEarnings: userData.totalEarnings + dailyEarnings,
      updatedAt: serverTimestamp()
    });
    
    // Enregistrer la transaction
    await recordTransaction(userId, 'trading_gain', dailyEarnings, 'approved');
    
    return { 
      success: true, 
      message: `🎉 *Trading réussi !*\n\n` +
               `🏦 *Capital:* $${formatNumber(userData.capital)}\n` +
               `📊 *Plan:* ${plan.name}\n` +
               `📈 *Taux quotidien:* ${plan.dailyRate}%\n` +
               `💰 *Gains:* $${formatNumber(dailyEarnings)}\n` +
               `💵 *Nouveau solde:* $${formatNumber(userData.balance + dailyEarnings)}`
    };
  } catch (error) {
    console.error('❌ Erreur processTrading:', error);
    return { success: false, message: "❌ Une erreur est survenue lors du trading." };
  }
}

// Fonction pour gérer les références
async function handleReferral(referredUserId, referrerCode) {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("referralCode", "==", referrerCode));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const referrerDoc = querySnapshot.docs[0];
      const referrerData = referrerDoc.data();
      
      // Mettre à jour l'utilisateur référé
      const referredUserRef = doc(db, "users", referredUserId.toString());
      await updateDoc(referredUserRef, {
        referredBy: referrerCode
      });
      
      return referrerData.id;
    }
    return null;
  } catch (error) {
    console.error('❌ Erreur handleReferral:', error);
    return null;
  }
}

// Menu principal
function showMainMenu(chatId) {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['👤 Profil', '💰 Balance'],
        ['💳 Dépôt', '🏦 Capital'],
        ['🤖 AI Trading', '📊 Plan d\'investissement'],
        ['📜 Historique', '👥 Référal'],
        ['❓ FAQ', '🛠️ Service client'],
        ['💸 Méthode de paiement', '💸 Retrait']
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, '🏠 *Menu Principal - AUTOTRAD* 🤖\n\nChoisissez une option:', { 
    parse_mode: 'Markdown',
    ...keyboard 
  });
}

// Fonction pour afficher l'historique
async function showHistory(chatId, userId) {
  try {
    const history = await getTransactionHistory(userId);
    
    if (history.length === 0) {
      bot.sendMessage(chatId, '📭 *Aucune transaction trouvée.*\n\nCommencez par effectuer un dépôt.', { parse_mode: 'Markdown' });
      return;
    }
    
    let historyMessage = '*📜 HISTORIQUE DES TRANSACTIONS*\n\n';
    let count = 0;
    
    for (const transaction of history.slice(0, 10)) {
      count++;
      const date = transaction.createdAt ? 
        transaction.createdAt.toLocaleDateString('fr-FR', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : 'Date inconnue';
      
      const typeEmoji = {
        'deposit': '💰 Dépôt',
        'withdrawal': '💸 Retrait',
        'trading_gain': '📈 Gains Trading'
      }[transaction.type] || '📝 Autre';
      
      const statusEmoji = {
        'pending': '⏳ En attente',
        'approved': '✅ Approuvé',
        'rejected': '❌ Rejeté'
      }[transaction.status] || '❓ Inconnu';
      
      historyMessage += `*${count}. ${typeEmoji}*\n`;
      historyMessage += `   Montant: $${formatNumber(transaction.amount)}\n`;
      historyMessage += `   Statut: ${statusEmoji}\n`;
      historyMessage += `   Date: ${date}\n`;
      
      if (transaction.type === 'withdrawal' && transaction.address) {
        historyMessage += `   Adresse: ${transaction.address.substring(0, 10)}...\n`;
      }
      
      historyMessage += '\n';
    }
    
    if (history.length > 10) {
      historyMessage += `\n... et ${history.length - 10} autres transactions`;
    }
    
    bot.sendMessage(chatId, historyMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ Erreur showHistory:', error);
    bot.sendMessage(chatId, '❌ Une erreur est survenue lors de la récupération de l\'historique.');
  }
}

// Fonction pour afficher le référal
async function showReferral(chatId, userId) {
  try {
    const userData = await getUserData(userId);
    if (!userData) return;
    
    const referralLink = `https://t.me/Autotrad_AIbot?start=${userData.referralCode}`;
    const referralMessage = `
*👥 PROGRAMME DE PARRAINAGE*

🎯 *Gagnez des commissions passives!*

🔗 *Votre lien de parrainage:*
\`${referralLink}\`

📋 *Votre code:* \`${userData.referralCode}\`

💰 *Commission:* 5% sur chaque dépôt de vos filleuls
📈 *Bonus trading:* 0.1% sur les gains de trading de vos filleuls

📊 *Vos gains de parrainage:* $${formatNumber(userData.referralEarnings)}

👥 *Comment fonctionne le parrainage?*
1. Partagez votre lien avec vos amis
2. Ils s'inscrivent via votre lien
3. Vous gagnez 5% sur leurs dépôts
4. Vous gagnez 0.1% sur leurs gains trading

💡 *Conseil:* Partagez votre lien sur les réseaux sociaux, forums et groupes!

*Invitez vos amis et gagnez des commissions passives!*
    `;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📤 Partager le lien', url: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=🎯 Rejoins AUTOTRAD, le bot de trading IA qui génère des gains automatiques!` }],
          [{ text: '📋 Copier le code', callback_data: 'copy_referral_code' }]
        ]
      }
    };
    
    bot.sendMessage(chatId, referralMessage, { 
      parse_mode: 'Markdown',
      ...keyboard 
    });
  } catch (error) {
    console.error('❌ Erreur showReferral:', error);
    bot.sendMessage(chatId, '❌ Une erreur est survenue lors de l\'affichage du programme de parrainage.');
  }
}

// Fonction pour afficher la FAQ
function showFAQ(chatId) {
  const faqMessage = `
*❓ QUESTIONS FRÉQUEMMENT POSÉES*

1️⃣ *Qu'est-ce qu'AUTOTRAD?*
🤖 AUTOTRAD est un bot de trading automatique utilisant l'IA pour générer des profits sur les marchés financiers en mode démo.

2️⃣ *Le trading est-il réel?*
🔄 Non, nous sommes actuellement en mode démo/simulation. Tous les trades sont simulés pour votre apprentissage.

3️⃣ *Comment fonctionne le système de gains?*
📈 Votre capital génère un pourcentage quotidien selon votre plan d'investissement (2% à 2.4% par jour).

4️⃣ *Puis-je retirer à tout moment?*
✅ Oui, votre solde (gains) est disponible pour retrait à tout moment avec un minimum de $2.

5️⃣ *Y a-t-il des frais?*
💸 Oui, un frais fixe de $1 est appliqué sur chaque retrait.

6️⃣ *Comment fonctionne le parrainage?*
👥 Vous gagnez 5% sur chaque dépôt de vos filleuls et 0.1% sur leurs gains de trading.

7️⃣ *Quelle crypto est acceptée?*
💎 Uniquement USDT sur le réseau BEP20 (Binance Smart Chain).

8️⃣ *Combien de temps pour les retraits?*
⏱️ Les retraits sont traités manuellement par l'admin sous 24 heures.

9️⃣ *Puis-je changer de plan?*
🔄 Oui, lors de votre prochain dépôt, vous pouvez choisir un nouveau plan.

🔟 *Y a-t-il un risque?*
🛡️ En mode démo, il n'y a pas de risque financier réel.

1️⃣1️⃣ *Comment démarrer?*
🚀 1. Effectuez un dépôt minimum $10
📊 2. Choisissez un plan d'investissement
🤖 3. Activez le trading AI quotidiennement
💰 4. Recevez vos gains quotidiens

1️⃣2️⃣ *Puis-je avoir plusieurs comptes?*
❌ Non, un seul compte par personne est autorisé.

1️⃣3️⃣ *Le capital est-il garanti?*
🛡️ En mode démo, oui. En trading réel, il y aurait des risques.

1️⃣4️⃣ *Comment contacter le support?*
🛠️ Utilisez l'option "Service client" dans le menu principal.

1️⃣5️⃣ *Les gains sont-ils garantis?*
✅ En mode démo, oui. Les pourcentages sont fixes.

1️⃣6️⃣ *Quelle est la fréquence des trades?*
📅 Un trade par jour maximum par utilisateur.

1️⃣7️⃣ *Puis-je augmenter mon dépôt?*
💰 Oui, vous pouvez ajouter des fonds à tout moment.

1️⃣8️⃣ *Y a-t-il un maximum de dépôt?*
∞ Non, vous pouvez déposer autant que vous voulez.

1️⃣9️⃣ *Comment sont calculés les gains?*
🧮 (Capital × Taux quotidien) ÷ 100 = Gains journaliers

2️⃣0️⃣ *Le bot est-il sécurisé?*
🔐 Oui, nous utilisons des technologies sécurisées et un système de démo sans risque.

*Besoin d'aide supplémentaire?*
Contactez notre service client via le menu principal! 🛠️
    `;
    
    bot.sendMessage(chatId, faqMessage, { parse_mode: 'Markdown' });
}

// Démarrage du bot
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  const referralCode = match[1];
  
  try {
    // Sauvegarder l'utilisateur
    await saveUser(user);
    
    // Gérer la référence si un code est fourni
    if (referralCode) {
      const referrerId = await handleReferral(user.id, referralCode);
      if (referrerId) {
        bot.sendMessage(chatId, '🎉 *Vous avez été référé par un membre!*\n\nBienvenue dans la communauté AUTOTRAD!', { parse_mode: 'Markdown' });
      }
    }
    
    // Message de bienvenue
    const welcomeMessage = `
🎉 *BIENVENUE SUR AUTOTRAD!* 🤖

💡 *Le bot de trading IA en mode démo*

🚀 *Pour commencer:*
1️⃣ Effectuez un dépôt minimum $10
2️⃣ Choisissez un plan d'investissement
3️⃣ Lancez le trading AI quotidien
4️⃣ Recevez vos gains automatiquement

📊 *Plans disponibles:*
• Basique: 2%/jour (10-200$)
• Standard: 2.2%/jour (201-1000$)
• Premium: 2.4%/jour (1001$+)

💸 *Retraits rapides*
💰 *Parrainage rémunérateur*
🛡️ *Mode démo sécurisé*

*Utilisez le menu ci-dessous pour naviguer!*
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    
    // Afficher le menu principal
    showMainMenu(chatId);
  } catch (error) {
    console.error('❌ Erreur /start:', error);
    bot.sendMessage(chatId, '❌ Une erreur est survenue. Veuillez réessayer.');
  }
});

// Gestion des boutons du menu
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const user = msg.from;
  
  // Ignorer les commandes qui sont déjà gérées
  if (text.startsWith('/')) return;
  
  try {
    // Sauvegarder l'utilisateur s'il n'existe pas
    await saveUser(user);
    
    switch(text) {
      case '👤 Profil':
        const userData = await getUserData(user.id);
        if (userData) {
          const profileMessage = `
*📋 VOTRE PROFIL*

👤 *Nom:* ${userData.firstName || ''} ${userData.lastName || ''}
📧 *Username:* @${userData.username || 'Non défini'}
🆔 *ID:* ${userData.id}
📅 *Membre depuis:* ${userData.createdAt ? userData.createdAt.toDate().toLocaleDateString('fr-FR') : 'N/A'}

📊 *Statistiques:*
├ Total dépôts: $${formatNumber(userData.totalDeposits)}
├ Total retraits: $${formatNumber(userData.totalWithdrawals)}
├ Gains totaux: $${formatNumber(userData.totalEarnings)}
└ Gains parrainage: $${formatNumber(userData.referralEarnings)}

🔗 *Code de parrainage:* \`${userData.referralCode}\`
👥 Référé par: ${userData.referredBy || 'Personne'}

*Partagez votre code et gagnez 5% sur chaque dépôt de vos filleuls!*
          `;
          bot.sendMessage(chatId, profileMessage, { parse_mode: 'Markdown' });
        }
        break;
        
      case '💰 Balance':
        const balanceData = await getUserData(user.id);
        if (balanceData) {
          const balanceMessage = `
*💰 VOTRE SOLDE*

💵 *Solde disponible:* $${formatNumber(balanceData.balance)}
🏦 *Capital actif:* $${formatNumber(balanceData.capital)}
📈 *Gains totaux:* $${formatNumber(balanceData.totalEarnings)}

💸 *Retrait minimum:* $2
📝 *Frais de retrait:* $1 fixe

*Votre solde est disponible pour retrait à tout moment.*
          `;
          bot.sendMessage(chatId, balanceMessage, { parse_mode: 'Markdown' });
        }
        break;
        
      case '💳 Dépôt':
        userStates[chatId] = { state: 'awaiting_deposit_amount', userId: user.id };
        bot.sendMessage(chatId, 
          '*💳 DÉPÔT DE FONDS*\n\n' +
          '💰 *Dépôt minimum:* $10\n' +
          '📝 *Méthode:* USDT BEP20 uniquement\n\n' +
          'Veuillez entrer le montant que vous souhaitez déposer (en USD):\n\n' +
          'Exemple: 50 pour $50',
          { parse_mode: 'Markdown' }
        );
        break;
        
      case '🏦 Capital':
        const capitalData = await getUserData(user.id);
        if (capitalData) {
          const planInfo = capitalData.currentPlan ? 
            `📊 *Plan actuel:* ${INVESTMENT_PLANS[capitalData.currentPlan].name}\n` +
            `📈 *Taux quotidien:* ${INVESTMENT_PLANS[capitalData.currentPlan].dailyRate}%\n` +
            `💰 *Gains quotidiens estimés:* $${formatNumber((capitalData.capital * INVESTMENT_PLANS[capitalData.currentPlan].dailyRate) / 100)}` 
            : '❌ *Aucun plan activé*';
          
          const capitalMessage = `
*🏦 VOTRE CAPITAL*

💰 *Capital actuel:* $${formatNumber(capitalData.capital)}
${planInfo}

💡 *Pour activer le trading, vous devez:*
1️⃣ Effectuer un dépôt 💳
2️⃣ Choisir un plan d'investissement 📊
3️⃣ Lancer le trading AI quotidien 🤖

*Votre capital génère des revenus quotidiens selon votre plan.*
          `;
          bot.sendMessage(chatId, capitalMessage, { parse_mode: 'Markdown' });
        }
        break;
        
      case '🤖 AI Trading':
        const tradingData = await getUserData(user.id);
        if (tradingData) {
          if (tradingData.capital === 0 || !tradingData.currentPlan) {
            bot.sendMessage(chatId, 
              '⚠️ *AVERTISSEMENT*\n\n' +
              'Vous devez avoir un capital actif et un plan d\'investissement pour utiliser le trading AI.\n\n' +
              'Veuillez d\'abord:\n' +
              '1. Effectuer un dépôt 💳\n' +
              '2. Choisir un plan 📊',
              { parse_mode: 'Markdown' }
            );
          } else {
            const keyboard = {
              reply_markup: {
                inline_keyboard: [[
                  { text: '🚀 LANCER LE TRADING', callback_data: 'start_trading' }
                ]]
              }
            };
            
            const plan = INVESTMENT_PLANS[tradingData.currentPlan];
            const estimatedEarnings = (tradingData.capital * plan.dailyRate) / 100;
            
            bot.sendMessage(chatId, 
              '*🤖 TRADING ARTIFICIELLE INTELLIGENCE*\n\n' +
              '🔧 *Mode:* Démo (Simulation)\n' +
              '⏱️ *Durée:* 30 secondes\n' +
              '💰 *Capital:* $' + formatNumber(tradingData.capital) + '\n' +
              '📊 *Plan:* ' + plan.name + '\n' +
              '📈 *Taux quotidien:* ' + plan.dailyRate + '%\n' +
              '💰 *Gains estimés:* $' + formatNumber(estimatedEarnings) + '\n\n' +
              'Le bot analysera le marché et effectuera des trades optimisés.',
              { parse_mode: 'Markdown', ...keyboard }
            );
          }
        }
        break;
        
      case '📊 Plan d\'investissement':
        const plansMessage = `
*📊 PLANS D\'INVESTISSEMENT*

🎯 *Plan 1 - Basique*
├ Montant: $10 - $200
├ Taux quotidien: 2%
└ Gains journaliers: $0.20 - $4

🚀 *Plan 2 - Standard*
├ Montant: $201 - $1,000
├ Taux quotidien: 2.2%
└ Gains journaliers: $4.42 - $22

💎 *Plan 3 - Premium*
├ Montant: $1,001+
├ Taux quotidien: 2.4%
└ Gains journaliers: $24.02+

📝 *Conditions:*
• Un trading par jour maximum
• Gains automatiques ajoutés au solde
• Capital bloqué pendant l\'investissement
• Retrait des gains seulement

Choisissez votre plan selon votre capital disponible.
        `;
        
        const plansKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 Plan 1 ($10-$200)', callback_data: 'plan_1' }],
              [{ text: '🚀 Plan 2 ($201-$1,000)', callback_data: 'plan_2' }],
              [{ text: '💎 Plan 3 ($1,001+)', callback_data: 'plan_3' }]
            ]
          }
        };
        
        bot.sendMessage(chatId, plansMessage, { 
          parse_mode: 'Markdown',
          ...plansKeyboard 
        });
        break;
        
      case '📜 Historique':
        await showHistory(chatId, user.id);
        break;
        
      case '👥 Référal':
        await showReferral(chatId, user.id);
        break;
        
      case '❓ FAQ':
        showFAQ(chatId);
        break;
        
      case '🛠️ Service client':
        userStates[chatId] = { state: 'awaiting_support_message', userId: user.id };
        bot.sendMessage(chatId, 
          '*🛠️ SERVICE CLIENT*\n\n' +
          'Veuillez écrire votre message. Notre équipe vous répondra dans les plus brefs délais.\n\n' +
          '*Note:* Pour annuler, tapez /cancel',
          { parse_mode: 'Markdown' }
        );
        break;
        
      case '💸 Méthode de paiement':
        const paymentMessage = `
*💸 MÉTHODES DE PAIEMENT*

💰 *Dépôt (USDT BEP20 uniquement):*
\`${DEPOSIT_ADDRESS}\`

📝 *Instructions de dépôt:*
1. Copiez l\'adresse ci-dessus
2. Envoyez USDT (BEP20) depuis votre wallet
3. Montant minimum: $10
4. Attendez la confirmation (2-3 confirmations)

💸 *Retrait:*
• Minimum: $2
• Frais: $1 fixe
• Réseau: USDT BEP20 uniquement
• Délai: 24 heures maximum

⚠️ *Important:*
• N\'envoyez que des USDT sur BEP20
• Vérifiez bien l\'adresse avant d\'envoyer
• Les fonds envoyés sur un mauvais réseau seront perdus
• Les dépôts en dessous de $10 ne seront pas crédités

🔄 *Processus de dépôt:*
1. Entrez le montant dans le bot
2. Envoyez les fonds à l\'adresse fournie
3. Envoyez une capture d\'écran de la transaction
4. Attendez la confirmation par l\'admin

✅ *Processus de retrait:*
1. Entrez le montant (minimum $2)
2. Entrez votre adresse USDT BEP20
3. Attendez l\'approbation par l\'admin
4. Recevez les fonds dans votre wallet
        `;
        bot.sendMessage(chatId, paymentMessage, { parse_mode: 'Markdown' });
        break;
        
      case '💸 Retrait':
        const withdrawData = await getUserData(user.id);
        if (!withdrawData) return;
        
        if (withdrawData.balance < 2) {
          bot.sendMessage(chatId, 
            '❌ *SOLDE INSUFFISANT*\n\n' +
            `💰 Votre solde: $${formatNumber(withdrawData.balance)}\n` +
            `💸 Minimum de retrait: $2\n` +
            `📝 Frais: $1\n\n` +
            `Vous avez besoin d'au moins $3 pour retirer $2.\n\n` +
            `Augmentez votre solde en effectuant du trading AI!`,
            { parse_mode: 'Markdown' }
          );
          return;
        }
        
        userStates[chatId] = { state: 'awaiting_withdrawal_amount', userId: user.id };
        bot.sendMessage(chatId, 
          '💸 *DEMANDE DE RETRAIT*\n\n' +
          `💰 Solde disponible: $${formatNumber(withdrawData.balance)}\n` +
          `📝 Minimum de retrait: $2\n` +
          `💳 Frais: $1 fixe\n\n` +
          'Entrez le montant que vous souhaitez retirer (ex: 10 pour $10):\n\n' +
          'Pour annuler, tapez /cancel',
          { parse_mode: 'Markdown' }
        );
        break;
        
      case '/menu':
      case '/cancel':
        delete userStates[chatId];
        showMainMenu(chatId);
        break;
        
      default:
        // Gestion des états utilisateur
        const userState = userStates[chatId];
        if (userState && userState.userId === user.id) {
          switch(userState.state) {
            case 'awaiting_deposit_amount':
              const amount = parseFloat(text);
              if (isNaN(amount) || amount < 10) {
                bot.sendMessage(chatId, '❌ Montant invalide. Le minimum est $10. Veuillez réessayer:');
                return;
              }
              
              userState.amount = amount;
              userState.state = 'awaiting_deposit_proof';
              
              const depositMessage = `
*💳 CONFIRMATION DE DÉPÔT*

💰 *Montant:* $${formatNumber(amount)}
📤 *Adresse de dépôt:* 
\`${DEPOSIT_ADDRESS}\`

📝 *Instructions:*
1. Copiez l\'adresse ci-dessus
2. Envoyez EXACTEMENT $${formatNumber(amount)} en USDT (BEP20)
3. Après l\'envoi, envoyez une capture d\'écran de la transaction

⚠️ *Important:*
• N'envoyez que des USDT sur BEP20
• Vérifiez l'adresse avant d'envoyer
• Les envois sur d'autres réseaux seront perdus

*Pour annuler, tapez /cancel*
              `;
              
              bot.sendMessage(chatId, depositMessage, { parse_mode: 'Markdown' });
              break;
              
            case 'awaiting_support_message':
              // Enregistrer le message de support
              const supportRef = collection(db, "support_messages");
              await addDoc(supportRef, {
                userId: user.id,
                username: user.username || '',
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                message: text,
                status: 'pending',
                createdAt: serverTimestamp()
              });
              
              // Envoyer une notification à l'admin
              const adminMessage = `🆘 *NOUVEAU MESSAGE DE SUPPORT*\n\n` +
                                  `👤 Utilisateur: ${user.first_name} ${user.last_name}\n` +
                                  `📧 @${user.username || 'N/A'}\n` +
                                  `🆔 ID: ${user.id}\n\n` +
                                  `💬 Message:\n${text}`;
              
              bot.sendMessage(ADMIN_ID, adminMessage, { parse_mode: 'Markdown' });
              
              // Répondre à l'utilisateur
              bot.sendMessage(chatId, 
                '✅ *Message envoyé!*\n\n' +
                'Votre message a été envoyé à notre équipe de support.\n' +
                'Nous vous répondrons dans les plus brefs délais.\n\n' +
                'Merci pour votre patience!',
                { parse_mode: 'Markdown' }
              );
              
              delete userStates[chatId];
              showMainMenu(chatId);
              break;
              
            case 'awaiting_withdrawal_amount':
              const withdrawAmount = parseFloat(text);
              const userWithdrawData = await getUserData(user.id);
              
              if (isNaN(withdrawAmount) || withdrawAmount < 2) {
                bot.sendMessage(chatId, '❌ Montant invalide. Le minimum est $2. Veuillez réessayer:');
                return;
              }
              
              if (withdrawAmount + 1 > userWithdrawData.balance) {
                bot.sendMessage(chatId, 
                  `❌ Solde insuffisant.\n` +
                  `💰 Votre solde: $${formatNumber(userWithdrawData.balance)}\n` +
                  `💸 Montant demandé: $${formatNumber(withdrawAmount)}\n` +
                  `📝 Frais: $1\n` +
                  `📊 Total: $${formatNumber(withdrawAmount + 1)}\n\n` +
                  `Veuillez entrer un montant inférieur:`
                );
                return;
              }
              
              userState.amount = withdrawAmount;
              userState.state = 'awaiting_withdrawal_address';
              
              bot.sendMessage(chatId, 
                `💰 *Montant de retrait:* $${formatNumber(withdrawAmount)}\n` +
                `💳 *Frais:* $1\n` +
                `📊 *Total débité:* $${formatNumber(withdrawAmount + 1)}\n\n` +
                `Veuillez entrer votre adresse USDT BEP20 (doit commencer par 0x...):\n\n` +
                `Pour annuler, tapez /cancel`
              );
              break;
              
            case 'awaiting_withdrawal_address':
              const address = text.trim();
              
              if (!address.startsWith('0x') || address.length !== 42) {
                bot.sendMessage(chatId, 
                  '❌ Adresse invalide.\n' +
                  'Veuillez entrer une adresse USDT BEP20 valide (doit commencer par 0x et avoir 42 caractères):'
                );
                return;
              }
              
              // Enregistrer la demande de retrait
              await recordTransaction(user.id, 'withdrawal', userState.amount, 'pending', address);
              
              // Déduire le solde immédiatement
              await updateBalance(user.id, -(userState.amount + 1));
              
              // Notifier l'admin
              const adminWithdrawMessage = `💸 *NOUVELLE DEMANDE DE RETRAIT*\n\n` +
                                          `👤 Utilisateur: ${user.first_name} ${user.last_name}\n` +
                                          `📧 @${user.username || 'N/A'}\n` +
                                          `🆔 ID: ${user.id}\n\n` +
                                          `💰 Montant: $${formatNumber(userState.amount)}\n` +
                                          `💳 Frais: $1\n` +
                                          `📊 Total: $${formatNumber(userState.amount + 1)}\n` +
                                          `📍 Adresse: \`${address}\`\n\n` +
                                          `Approuvez ou rejetez ce retrait:`;
              
              const keyboard = {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '✅ Approuver', callback_data: `approve_withdrawal_${user.id}_${userState.amount}_${address}` },
                      { text: '❌ Rejeter', callback_data: `reject_withdrawal_${user.id}_${userState.amount}` }
                    ]
                  ]
                }
              };
              
              bot.sendMessage(ADMIN_ID, adminWithdrawMessage, { 
                parse_mode: 'Markdown',
                ...keyboard 
              });
              
              // Répondre à l'utilisateur
              bot.sendMessage(chatId, 
                `✅ *DEMANDE DE RETRAIT ENVOYÉE!*\n\n` +
                `💰 Montant: $${formatNumber(userState.amount)}\n` +
                `💳 Frais: $1\n` +
                `📍 Adresse: ${address.slice(0, 10)}...${address.slice(-10)}\n\n` +
                `Votre demande est en attente d'approbation par l'administrateur.\n` +
                `⏳ Temps de traitement: 1-24 heures\n\n` +
                `Vous serez notifié dès qu'il sera traité.`,
                { parse_mode: 'Markdown' }
              );
              
              delete userStates[chatId];
              showMainMenu(chatId);
              break;
          }
        } else {
          // Si pas d'état spécifique, afficher le menu
          showMainMenu(chatId);
        }
        break;
    }
  } catch (error) {
    console.error('❌ Erreur gestion message:', error);
    bot.sendMessage(chatId, '❌ Une erreur est survenue. Veuillez réessayer.');
  }
});

// Gestion des callbacks inline
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;
  const user = callbackQuery.from;
  
  try {
    switch(data) {
      case 'start_trading':
        // Animation de trading
        const animationMessage = await bot.sendMessage(chatId, 
          '🤖 *ANALYSE DU MARCHÉ EN COURS...*\n\n' +
          '⌛ Veuillez patienter 30 secondes',
          { parse_mode: 'Markdown' }
        );
        
        // Simuler le trading avec des mises à jour
        setTimeout(async () => {
          await bot.editMessageText(
            '📊 *ANALYSE DES DONNÉES...*\n\n' +
            '🔍 Recherche des meilleures opportunités...',
            { 
              chat_id: chatId, 
              message_id: animationMessage.message_id,
              parse_mode: 'Markdown' 
            }
          );
        }, 10000);
        
        setTimeout(async () => {
          await bot.editMessageText(
            '💹 *EXÉCUTION DES TRADES...*\n\n' +
            '⚡ Traitement des ordres...',
            { 
              chat_id: chatId, 
              message_id: animationMessage.message_id,
              parse_mode: 'Markdown' 
            }
          );
        }, 20000);
        
        setTimeout(async () => {
          const result = await processTrading(user.id);
          await bot.editMessageText(
            result.message,
            { 
              chat_id: chatId, 
              message_id: animationMessage.message_id,
              parse_mode: 'Markdown' 
            }
          );
        }, 30000);
        break;
        
      case 'plan_1':
      case 'plan_2':
      case 'plan_3':
        const planNumber = parseInt(data.split('_')[1]);
        const userRef = doc(db, "users", user.id.toString());
        await updateDoc(userRef, {
          currentPlan: planNumber,
          updatedAt: serverTimestamp()
        });
        
        const plan = INVESTMENT_PLANS[planNumber];
        bot.sendMessage(chatId, 
          `✅ *Plan ${planNumber} activé!*\n\n` +
          `📊 *${plan.name}*\n` +
          `💰 Capital requis: $${plan.min} - $${plan.max === 1000000 ? '∞' : plan.max}\n` +
          `📈 Taux quotidien: ${plan.dailyRate}%\n\n` +
          `Vous pouvez maintenant utiliser le trading AI!`,
          { parse_mode: 'Markdown' }
        );
        break;
        
      case 'copy_referral_code':
        const userRefData = await getUserData(user.id);
        if (userRefData) {
          bot.answerCallbackQuery(callbackQuery.id, {
            text: `Code copié: ${userRefData.referralCode}`,
            show_alert: true
          });
        }
        break;
    }
    
    // Gestion des callbacks admin
    if (parseInt(user.id) === ADMIN_ID) {
      if (data.startsWith('approve_deposit_')) {
        const parts = data.split('_');
        const userId = parts[2];
        const amount = parseFloat(parts[3]);
        
        // Mettre à jour le capital de l'utilisateur
        await updateBalance(userId, amount, 'capital');
        
        // Mettre à jour la transaction
        const transactionsRef = collection(db, "transactions");
        const q = query(transactionsRef, where("userId", "==", userId), where("type", "==", "deposit"), where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          for (const transactionDoc of querySnapshot.docs) {
            const transactionRef = doc(db, "transactions", transactionDoc.id);
            await updateDoc(transactionRef, {
              status: 'approved',
              updatedAt: serverTimestamp()
            });
          }
        }
        
        // Notifier l'utilisateur
        bot.sendMessage(userId, 
          `✅ *DÉPÔT APPROUVÉ!*\n\n` +
          `💰 Montant: $${formatNumber(amount)}\n` +
          `🏦 Nouveau capital: $${formatNumber((await getUserData(userId)).capital)}\n\n` +
          `Votre capital a été crédité. Vous pouvez maintenant utiliser le trading AI!`,
          { parse_mode: 'Markdown' }
        );
        
        // Mettre à jour le message admin
        bot.answerCallbackQuery(callbackQuery.id, {
          text: `Dépôt de $${amount} approuvé pour l'utilisateur ${userId}`,
          show_alert: true
        });
        
        bot.deleteMessage(chatId, message.message_id);
        
      } else if (data.startsWith('reject_deposit_')) {
        const userId = data.split('_')[2];
        
        // Mettre à jour la transaction
        const transactionsRef = collection(db, "transactions");
        const q = query(transactionsRef, where("userId", "==", userId), where("type", "==", "deposit"), where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          for (const transactionDoc of querySnapshot.docs) {
            const transactionRef = doc(db, "transactions", transactionDoc.id);
            await updateDoc(transactionRef, {
              status: 'rejected',
              updatedAt: serverTimestamp()
            });
          }
        }
        
        // Notifier l'utilisateur
        bot.sendMessage(userId, 
          '❌ *DÉPÔT REJETÉ*\n\n' +
          'Votre dépôt a été rejeté par l\'administrateur.\n' +
          'Si vous pensez qu\'il s\'agit d\'une erreur, contactez le support.',
          { parse_mode: 'Markdown' }
        );
        
        bot.answerCallbackQuery(callbackQuery.id, {
          text: `Dépôt rejeté pour l'utilisateur ${userId}`,
          show_alert: true
        });
        
        bot.deleteMessage(chatId, message.message_id);
        
      } else if (data.startsWith('approve_withdrawal_')) {
        const parts = data.split('_');
        const userId = parts[2];
        const amount = parseFloat(parts[3]);
        const address = parts[4];
        
        // Mettre à jour la transaction
        const transactionsRef = collection(db, "transactions");
        const q = query(transactionsRef, where("userId", "==", userId), where("type", "==", "withdrawal"), where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          for (const transactionDoc of querySnapshot.docs) {
            const transactionRef = doc(db, "transactions", transactionDoc.id);
            await updateDoc(transactionRef, {
              status: 'approved',
              updatedAt: serverTimestamp()
            });
          }
          
          // Mettre à jour les statistiques de l'utilisateur
          const userRef = doc(db, "users", userId.toString());
          const userData = await getUserData(userId);
          await updateDoc(userRef, {
            totalWithdrawals: userData.totalWithdrawals + amount,
            updatedAt: serverTimestamp()
          });
        }
        
        // Notifier l'utilisateur
        bot.sendMessage(userId, 
          `✅ *RETRAIT APPROUVÉ!*\n\n` +
          `💰 Montant retiré: $${formatNumber(amount)}\n` +
          `💳 Frais: $1\n` +
          `📍 Adresse: ${address.slice(0, 10)}...${address.slice(-10)}\n\n` +
          `Les fonds ont été envoyés à votre adresse.\n` +
          `⏳ Temps de confirmation réseau: 5-30 minutes`,
          { parse_mode: 'Markdown' }
        );
        
        bot.answerCallbackQuery(callbackQuery.id, {
          text: `Retrait de $${amount} approuvé pour ${userId}`,
          show_alert: true
        });
        
        bot.deleteMessage(chatId, message.message_id);
        
      } else if (data.startsWith('reject_withdrawal_')) {
        const parts = data.split('_');
        const userId = parts[2];
        const amount = parseFloat(parts[3]);
        
        // Rembourser l'utilisateur (solde + frais)
        await updateBalance(userId, amount + 1);
        
        // Mettre à jour la transaction
        const transactionsRef = collection(db, "transactions");
        const q = query(transactionsRef, where("userId", "==", userId), where("type", "==", "withdrawal"), where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          for (const transactionDoc of querySnapshot.docs) {
            const transactionRef = doc(db, "transactions", transactionDoc.id);
            await updateDoc(transactionRef, {
              status: 'rejected',
              updatedAt: serverTimestamp()
            });
          }
        }
        
        // Notifier l'utilisateur
        bot.sendMessage(userId, 
          `❌ *RETRAIT REJETÉ*\n\n` +
          `💰 Montant: $${formatNumber(amount)}\n` +
          `💳 Frais remboursés: $1\n` +
          `📊 Total remboursé: $${formatNumber(amount + 1)}\n\n` +
          `Votre retrait a été rejeté par l'administrateur.\n` +
          `Votre solde a été recrédité.\n\n` +
          `Si vous pensez qu'il s'agit d'une erreur, contactez le support.`,
          { parse_mode: 'Markdown' }
        );
        
        bot.answerCallbackQuery(callbackQuery.id, {
          text: `Retrait rejeté - $${amount + 1} remboursé à ${userId}`,
          show_alert: true
        });
        
        bot.deleteMessage(chatId, message.message_id);
      }
    }
    
    // Répondre au callback
    bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('❌ Erreur callback:', error);
    bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Une erreur est survenue',
      show_alert: true
    });
  }
});

// Gestion des photos (pour les preuves de dépôt)
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  
  try {
    const userState = userStates[chatId];
    if (userState && userState.state === 'awaiting_deposit_proof' && userState.userId === user.id) {
      const depositData = userState;
      if (depositData && depositData.amount) {
        // Enregistrer la transaction en attente
        await recordTransaction(
          user.id, 
          'deposit', 
          depositData.amount, 
          'pending', 
          DEPOSIT_ADDRESS,
          msg.photo[msg.photo.length - 1].file_id
        );
        
        // Notifier l'admin
        const adminMessage = `💰 *NOUVELLE DEMANDE DE DÉPÔT*\n\n` +
                            `👤 Utilisateur: ${user.first_name} ${user.last_name}\n` +
                            `📧 @${user.username || 'N/A'}\n` +
                            `🆔 ID: ${user.id}\n\n` +
                            `💵 Montant: $${formatNumber(depositData.amount)}\n` +
                            `⏳ Statut: En attente\n\n` +
                            `Approuvez ou rejetez ce dépôt:`;
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Approuver', callback_data: `approve_deposit_${user.id}_${depositData.amount}` },
                { text: '❌ Rejeter', callback_data: `reject_deposit_${user.id}` }
              ]
            ]
          }
        };
        
        bot.sendMessage(ADMIN_ID, adminMessage, { 
          parse_mode: 'Markdown',
          ...keyboard 
        });
        
        // Répondre à l'utilisateur
        bot.sendMessage(chatId, 
          '✅ *Preuve de paiement reçue!*\n\n' +
          'Votre dépôt est en attente de confirmation par l\'administrateur.\n' +
          'Vous recevrez une notification dès qu\'il sera approuvé.\n\n' +
          '⏳ Temps de traitement: 1-24 heures',
          { parse_mode: 'Markdown' }
        );
        
        delete userStates[chatId];
        showMainMenu(chatId);
      }
    }
  } catch (error) {
    console.error('❌ Erreur photo:', error);
    bot.sendMessage(chatId, '❌ Une erreur est survenue lors du traitement de la photo.');
  }
});

// Gestion des commandes admin
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  if (parseInt(chatId) !== ADMIN_ID) {
    bot.sendMessage(chatId, '❌ Accès refusé.');
    return;
  }
  
  try {
    const adminKeyboard = {
      reply_markup: {
        keyboard: [
          ['📋 Liste utilisateurs', '💰 Dépôts en attente'],
          ['💸 Retraits en attente', '📊 Statistiques'],
          ['📢 Envoyer annonce', '🏠 Menu principal']
        ],
        resize_keyboard: true
      }
    };
    
    bot.sendMessage(chatId, '👨‍💼 *PANEL ADMINISTRATEUR*', { 
      parse_mode: 'Markdown',
      ...adminKeyboard 
    });
  } catch (error) {
    console.error('❌ Erreur /admin:', error);
  }
});

// Gestion des messages admin
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (parseInt(chatId) === ADMIN_ID) {
    try {
      switch(text) {
        case '📋 Liste utilisateurs':
          const usersRef = collection(db, "users");
          const usersSnapshot = await getDocs(usersRef);
          let usersList = '*👥 LISTE DES UTILISATEURS*\n\n';
          let userCount = 0;
          
          usersSnapshot.forEach((doc) => {
            const user = doc.data();
            userCount++;
            usersList += `*${userCount}.* ${user.firstName} ${user.lastName}\n`;
            usersList += `   👤 @${user.username || 'N/A'}\n`;
            usersList += `   🆔 ${user.id}\n`;
            usersList += `   💰 Balance: $${formatNumber(user.balance)}\n`;
            usersList += `   🏦 Capital: $${formatNumber(user.capital)}\n`;
            usersList += `   📅 Inscrit: ${user.createdAt ? user.createdAt.toDate().toLocaleDateString('fr-FR') : 'N/A'}\n\n`;
          });
          
          usersList += `\n*Total: ${userCount} utilisateurs*`;
          
          bot.sendMessage(chatId, usersList, { parse_mode: 'Markdown' });
          break;
          
        case '💰 Dépôts en attente':
          const pendingDeposits = await getPendingTransactions('deposit');
          if (pendingDeposits.length === 0) {
            bot.sendMessage(chatId, '✅ Aucun dépôt en attente.');
          } else {
            let depositsMessage = '*💰 DÉPÔTS EN ATTENTE*\n\n';
            pendingDeposits.forEach((deposit, index) => {
              depositsMessage += `${index + 1}. ID: ${deposit.userId}\n`;
              depositsMessage += `   Montant: $${formatNumber(deposit.amount)}\n`;
              depositsMessage += `   Date: ${deposit.createdAt ? deposit.createdAt.toDate().toLocaleString('fr-FR') : 'N/A'}\n\n`;
            });
            
            bot.sendMessage(chatId, depositsMessage, { parse_mode: 'Markdown' });
          }
          break;
          
        case '💸 Retraits en attente':
          const pendingWithdrawals = await getPendingTransactions('withdrawal');
          if (pendingWithdrawals.length === 0) {
            bot.sendMessage(chatId, '✅ Aucun retrait en attente.');
          } else {
            let withdrawalsMessage = '*💸 RETRAITS EN ATTENTE*\n\n';
            pendingWithdrawals.forEach((withdrawal, index) => {
              withdrawalsMessage += `${index + 1}. ID: ${withdrawal.userId}\n`;
              withdrawalsMessage += `   Montant: $${formatNumber(withdrawal.amount)}\n`;
              withdrawalsMessage += `   Adresse: ${withdrawal.address || 'N/A'}\n`;
              withdrawalsMessage += `   Date: ${withdrawal.createdAt ? withdrawal.createdAt.toDate().toLocaleString('fr-FR') : 'N/A'}\n\n`;
            });
            
            bot.sendMessage(chatId, withdrawalsMessage, { parse_mode: 'Markdown' });
          }
          break;
          
        case '📢 Envoyer annonce':
          userStates[chatId] = { state: 'awaiting_broadcast', userId: ADMIN_ID };
          bot.sendMessage(chatId, '📢 Entrez le message à diffuser à tous les utilisateurs:');
          break;
          
        case '🏠 Menu principal':
          delete userStates[chatId];
          showMainMenu(chatId);
          break;
          
        default:
          if (userStates[chatId] && userStates[chatId].state === 'awaiting_broadcast') {
            // Diffuser le message à tous les utilisateurs
            const usersRef = collection(db, "users");
            const usersSnapshot = await getDocs(usersRef);
            let successCount = 0;
            let failCount = 0;
            
            for (const doc of usersSnapshot.docs) {
              const user = doc.data();
              try {
                await bot.sendMessage(user.id, 
                  `📢 *ANNONCE IMPORTANTE*\n\n${text}\n\n_Message envoyé par l'administration_`,
                  { parse_mode: 'Markdown' }
                );
                successCount++;
                // Pause pour éviter le rate limit
                await new Promise(resolve => setTimeout(resolve, 100));
              } catch (error) {
                failCount++;
              }
            }
            
            bot.sendMessage(chatId, 
              `✅ *Diffusion terminée!*\n\n` +
              `✓ Messages envoyés: ${successCount}\n` +
              `✗ Échecs: ${failCount}`,
              { parse_mode: 'Markdown' }
            );
            
            delete userStates[chatId];
          }
          break;
      }
    } catch (error) {
      console.error('❌ Erreur admin message:', error);
      bot.sendMessage(chatId, '❌ Une erreur est survenue.');
    }
  }
});

// Route de santé pour cron-job.org
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>🤖 AUTOTRAD Bot</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #2c3e50; }
        .status { color: #27ae60; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>🤖 AUTOTRAD Bot</h1>
      <p class="status">✅ Bot en ligne et actif</p>
      <p>Le bot de trading IA fonctionne normalement</p>
      <p>🕒 Dernière mise à jour: ${new Date().toLocaleString()}</p>
    </body>
    </html>
  `);
});

// Route de santé pour cron-job.org
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    bot: 'AUTOTRAD',
    version: '2.0.0'
  });
});

// Route pour tester le bot
app.get('/test', async (req, res) => {
  try {
    const botInfo = await bot.getMe();
    res.json({
      bot: botInfo,
      status: 'running',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`🤖 Nom du bot: AUTOTRAD`);
  console.log(`🔗 Lien: t.me/Autotrad_AIbot`);
  console.log(`👨‍💼 Admin ID: ${ADMIN_ID}`);
  console.log(`🌐 URL santé: ${botUrl}/health`);
  console.log(`⏰ Ping automatique activé toutes les 5 minutes`);
});

// Fonction de nettoyage périodique des états utilisateur
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  for (const [chatId, state] of Object.entries(userStates)) {
    if (state.timestamp && now - state.timestamp > timeout) {
      console.log(`🧹 Nettoyage état utilisateur: ${chatId}`);
      delete userStates[chatId];
    }
  }
}, 10 * 60 * 1000); // Toutes les 10 minutes

// Gestion des erreurs de polling
bot.on('polling_error', (error) => {
  console.error('❌ Erreur de polling:', error.code || error.message);
  
  // Redémarrer le polling en cas d'erreur
  setTimeout(() => {
    console.log('🔄 Redémarrage du polling...');
    bot.startPolling();
  }, 5000);
});

bot.on('error', (error) => {
  console.error('❌ Erreur du bot:', error);
});

console.log('✅ Bot AUTOTRAD initialisé avec succès!');

// Ping initial
keepBotAlive();
