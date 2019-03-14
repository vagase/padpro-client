const config = require('config');
const PadProWechatBotAdapter = require("./Bot/PadProWechatBotAdapter");
const BotClient = require("./Bot/BotClient");

async function main() {
    const padProToken = config.get('vendor.padproToken');
    const padProAdapter = new PadProWechatBotAdapter(padProToken);
    const bot = new BotClient(padProAdapter);

    await bot.start()

    // bot 意外退出以后尝试自动连接
    bot.on('stop', () => {
        // 10秒
        const retryDelay = 10 * 1000;

        setTimeout(async () => {
            await bot.start();
        }, retryDelay);
    });
}

main().then();

