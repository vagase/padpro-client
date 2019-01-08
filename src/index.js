const printImage = require("./utils").printImage;
const { Wechaty } = require('wechaty');
const config = require('config');
const WECHATY_PUPPET_PADPRO_TOKEN = config.get('vendor.padpro_token');

const puppet = 'wechaty-puppet-padpro';
const puppetOptions = {
    token: WECHATY_PUPPET_PADPRO_TOKEN,
};

const bot = new Wechaty({
    puppet,
    puppetOptions,
});

bot.on('scan', async (qrcode, status) => {
        console.log(`Scan QR Code to login: ${status}\n`);

        const QRImageURL = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrcode)}`;
        await printImage(QRImageURL);
    })
    .on('login',            user => console.log(`User ${user} logined`))
    .on('message',       message => console.log(`Message: ${message}`))
    .start();
