const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const { addCoins, ensureUser } = require("../utils/economy");

const activeGames = new Map();

const GAME_CONFIG = {
    guessNumber: {
        name: "Guess the Number",
        description: "Guess a number between 1-100",
        cost: 0,
        reward: 50,
        maxAttempts: 7
    },
    rockPaperScissors: {
        name: "Rock Paper Scissors",
        description: "Play Rock Paper Scissors against the bot",
        cost: 10,
        reward: 30
    },
    coinFlip: {
        name: "Coin Flip",
        description: "Bet on heads or tails",
        cost: 20,
        reward: 40
    }
};

function createGameEmbed(title, description, color = 0x5865F2) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

function createGameButtons(gameType, userId) {
    const row = new ActionRowBuilder();
    
    if (gameType === "rockPaperScissors") {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`game_rps_rock_${userId}`)
                .setLabel("🪨 Rock")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`game_rps_paper_${userId}`)
                .setLabel("📄 Paper")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`game_rps_scissors_${userId}`)
                .setLabel("✂️ Scissors")
                .setStyle(ButtonStyle.Danger)
        );
    } else if (gameType === "coinFlip") {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`game_cf_heads_${userId}`)
                .setLabel("🦅 Heads")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`game_cf_tails_${userId}`)
                .setLabel("🦅 Tails")
                .setStyle(ButtonStyle.Secondary)
        );
    }
    
    return row;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("game")
        .setDescription("Play games to earn Blade Coins")
        .addStringOption(option =>
            option
                .setName("type")
                .setDescription("Game to play")
                .setRequired(true)
                .addChoices(
                    { name: "Guess the Number (Free)", value: "guessNumber" },
                    { name: "Rock Paper Scissors (10 coins)", value: "rockPaperScissors" },
                    { name: "Coin Flip (20 coins)", value: "coinFlip" }
                )
        ),

    async execute(interaction) {
        const gameType = interaction.options.getString("type");
        const config = GAME_CONFIG[gameType];
        const userId = interaction.user.id;
        
        const users = ensureUser(userId);
        const user = users[userId];
        
        if (config.cost > 0 && user.coins < config.cost) {
            return interaction.reply({
                content: `❌ You need **${config.cost}** Blade Coins to play this game! You have **${user.coins}**.`,
                ephemeral: true
            });
        }
        
        if (config.cost > 0) {
            user.coins -= config.cost;
            require("../database").saveUsers(users);
        }
        
        if (gameType === "guessNumber") {
            const targetNumber = Math.floor(Math.random() * 100) + 1;
            activeGames.set(userId, {
                type: "guessNumber",
                target: targetNumber,
                attempts: 0,
                maxAttempts: config.maxAttempts,
                reward: config.reward
            });
            
            const embed = createGameEmbed(
                "🎯 Guess the Number",
                `I'm thinking of a number between **1-100**.\nYou have **${config.maxAttempts}** attempts.\n\nType your guess in chat!`
            );
            
            await interaction.reply({ embeds: [embed] });
            
        } else if (gameType === "rockPaperScissors") {
            activeGames.set(userId, {
                type: "rockPaperScissors",
                reward: config.reward
            });
            
            const embed = createGameEmbed(
                "✊ Rock Paper Scissors",
                `Choose your move! Cost: **${config.cost}** coins\nReward: **${config.reward}** coins`
            );
            
            await interaction.reply({ 
                embeds: [embed], 
                components: [createGameButtons("rockPaperScissors", userId)] 
            });
            
        } else if (gameType === "coinFlip") {
            activeGames.set(userId, {
                type: "coinFlip",
                reward: config.reward
            });
            
            const embed = createGameEmbed(
                "🪙 Coin Flip",
                `Bet on the coin flip! Cost: **${config.cost}** coins\nReward: **${config.reward}** coins`
            );
            
            await interaction.reply({ 
                embeds: [embed], 
                components: [createGameButtons("coinFlip", userId)] 
            });
        }
    }
};

// Export handler for button interactions
module.exports.handleButton = async (interaction) => {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    
    if (!customId.startsWith("game_")) return false;
    
    const game = activeGames.get(userId);
    if (!game) {
        return interaction.reply({
            content: "❌ No active game found! Start a new game with `/game`.",
            ephemeral: true
        });
    }
    
    if (customId.startsWith("game_rps_")) {
        const choice = customId.split("_")[2]; // rock, paper, scissors
        const botChoice = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
        
        let result;
        if (choice === botChoice) {
            result = "tie";
        } else if (
            (choice === "rock" && botChoice === "scissors") ||
            (choice === "paper" && botChoice === "rock") ||
            (choice === "scissors" && botChoice === "paper")
        ) {
            result = "win";
        } else {
            result = "lose";
        }
        
        const emojis = { rock: "🪨", paper: "📄", scissors: "✂️" };
        let reward = 0;
        let message = "";
        
        if (result === "win") {
            reward = game.reward;
            message = `🎉 **You won!** You earned **${reward}** Blade Coins!`;
        } else if (result === "tie") {
            reward = Math.floor(game.reward / 2);
            message = `🤝 **It's a tie!** You earned **${reward}** Blade Coins!`;
        } else {
            message = `😢 **You lost!** Better luck next time!`;
        }
        
        if (reward > 0) {
            addCoins(userId, reward);
        }
        
        const embed = new EmbedBuilder()
            .setColor(result === "win" ? 0x2ecc71 : result === "tie" ? 0xf1c40f : 0xe74c3c)
            .setTitle("✊ Rock Paper Scissors - Result")
            .setDescription(`**You:** ${emojis[choice]}\n**Bot:** ${emojis[botChoice]}\n\n${message}`)
            .addFields({ name: "Reward", value: `${reward} coins`, inline: true })
            .setTimestamp();
        
        activeGames.delete(userId);
        await interaction.update({ embeds: [embed], components: [] });
        
    } else if (customId.startsWith("game_cf_")) {
        const choice = customId.split("_")[2]; // heads, tails
        const botChoice = Math.random() < 0.5 ? "heads" : "tails";
        const won = choice === botChoice;
        
        const emojis = { heads: "🦅", tails: "🦅" };
        let reward = 0;
        let message = "";
        
        if (won) {
            reward = game.reward;
            message = `🎉 **You won!** You earned **${reward}** Blade Coins!`;
        } else {
            message = `😢 **You lost!** Better luck next time!`;
        }
        
        if (reward > 0) {
            addCoins(userId, reward);
        }
        
        const embed = new EmbedBuilder()
            .setColor(won ? 0x2ecc71 : 0xe74c3c)
            .setTitle("🪙 Coin Flip - Result")
            .setDescription(`**Your bet:** ${choice.charAt(0).toUpperCase() + choice.slice(1)} ${emojis[choice]}\n**Result:** ${botChoice.charAt(0).toUpperCase() + botChoice.slice(1)} ${emojis[botChoice]}\n\n${message}`)
            .addFields({ name: "Reward", value: `${reward} coins`, inline: true })
            .setTimestamp();
        
        activeGames.delete(userId);
        await interaction.update({ embeds: [embed], components: [] });
    }
    
    return true;
};

// Export handler for message guesses (for guessNumber game)
module.exports.handleMessage = async (message) => {
    const userId = message.author.id;
    const game = activeGames.get(userId);
    
    if (!game || game.type !== "guessNumber") return false;
    
    const guess = parseInt(message.content.trim());
    if (isNaN(guess) || guess < 1 || guess > 100) return false;
    
    game.attempts++;
    
    let resultMessage = "";
    let gameOver = false;
    let reward = 0;
    
    if (guess === game.target) {
        reward = game.reward;
        resultMessage = `🎉 **Correct!** The number was **${game.target}**!\nYou earned **${reward}** Blade Coins!`;
        gameOver = true;
    } else if (game.attempts >= game.maxAttempts) {
        resultMessage = `😢 **Game Over!** The number was **${game.target}**.\nBetter luck next time!`;
        gameOver = true;
    } else if (guess < game.target) {
        resultMessage = `📈 **Too low!** Try a higher number.\nAttempts left: **${game.maxAttempts - game.attempts}**`;
    } else {
        resultMessage = `📉 **Too high!** Try a lower number.\nAttempts left: **${game.maxAttempts - game.attempts}**`;
    }
    
    if (reward > 0) {
        addCoins(message.author.id, reward);
    }
    
    const embed = new EmbedBuilder()
        .setColor(gameOver ? (reward > 0 ? 0x2ecc71 : 0xe74c3c) : 0x5865F2)
        .setTitle("🎯 Guess the Number")
        .setDescription(resultMessage)
        .setTimestamp();
    
    if (gameOver) {
        activeGames.delete(userId);
    }
    
    await message.reply({ embeds: [embed] });
    return true;
};