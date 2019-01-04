const termImg = require('term-img');
const request = require('request-promise');

exports.displayImageInTerminal = async function(url, options) {
    const res = await request({
        url,
        encoding: null
    });

    options = Object.assign({
        width: '400px',
        height: '400px'
    }, options);

    const log = await termImg(Buffer.from(res), options);
    console.log(log);
};
