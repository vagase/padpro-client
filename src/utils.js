const terminalImage = require('terminal-image');
const request = require('request-promise');

exports.printImage = async function(url) {
    const res = await request({
        url,
        encoding: null
    });

    const log = await terminalImage.buffer(Buffer.from(res));
    console.log(log);
};

exports.sleep = async function sleep(ms) {
    return new Promise(resolve=>{
        setTimeout(resolve, ms)
    })
};
