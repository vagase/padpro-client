module.exports = class BotAdapter {
    constructor() {
        this.clientId = null;
        this.clientType = null;

        this.botActionHandler = {};

        this.callbacks = {};
    }

    registerBotAction(actionType, handler) {
        this.botActionHandler[actionType] = handler;
    }

    async handleBotAction(actionType, actionBody) {
        const actionHandler = this.botActionHandler[actionType];
        if (!actionHandler) {
            throw `unsupported bot action: ${actionType}}`;
        }

        return await actionHandler(actionBody);
    }

    registerCallback(name, func) {
        this.callbacks = func;
    }

    invokeCallback(name, args) {
        const func = this.callbacks[name];
        if (!func) {
            return;
        }

        func.apply(null, args);
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
        // await this.wxbot.logout()
    }
};
