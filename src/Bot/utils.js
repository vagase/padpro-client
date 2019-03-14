const x2j = require('xml2js')

module.exports.parseXml = async (xml) => {
    return new Promise((resolve, reject) => {
        x2j.parseString(xml, {
            explicitArray: false
        }, (error, result) => {
            if (error) {
                reject(error)
            } else {
                resolve(result)
            }
        })
    })
};
