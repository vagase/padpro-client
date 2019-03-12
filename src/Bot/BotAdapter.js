module.exports.BotAdapter = class BotAdapter {
    constructor(clientId, clientType) {
        this.clientId = clientId;
        this.clientType = clientType;

        this.botActionHandler = {};

        this.botCallbacks = {};
    }

    registerBotAction(actionType, handler) {
        this.botActionHandler[actionType] = handler;
    }

    async handleBotActionFromHub(actionType, actionBody) {
        const actionHandler = this.botActionHandler[actionType];
        if (!actionHandler) {
            throw `unsupported bot action: ${actionType}}`;
        }

        return await actionHandler(actionBody);
    }

    registerBotCallback(name, func) {
        this.botCallbacks[name] = func;
    }

    async invokeBotCallback(name, payload) {
        const func = this.botCallbacks[name];
        func && func(payload);
    }

    // whether bot is signed in or not
    isSignedIn() {
        return false;
    }

    /**
     * @param timeout: default 10 minutes
     * @return {Promise<void>}
     */
    async login(loginInfo) {
    }

    async logout() {
    }
}

module.exports.BotAdapterCallback = {
    ON_LOGIN: 'onLogin',
    ON_LOGOUT: 'onLogout',
    ON_QRCODE: 'onQRRCode'
};
